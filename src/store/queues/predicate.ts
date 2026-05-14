import { type AnyColumn, type SQL, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

export class WhereParseError extends Error {
  constructor(
    message: string,
    public readonly position?: number,
  ) {
    super(message);
    this.name = "WhereParseError";
  }
}

export const OPERATORS = ["!=", "<=", ">=", "=", "<", ">", "in"] as const;
export type PredicateOperator = (typeof OPERATORS)[number];

export type PredicateColumn =
  | "status"
  | "final_label"
  | "prev_label"
  | "source"
  | "confidence"
  | "reason"
  | "orphan"
  | "issue_type";

export const BUILDER_COLUMNS = [
  "status",
  "final_label",
  "prev_label",
  "source",
  "confidence",
  "reason",
  "issue_type",
] as const satisfies readonly PredicateColumn[];

export type PredicateValue = string | number;
export type PredicateRhs = PredicateValue | { kind: "column"; column: PredicateColumn };

export type Predicate =
  | {
      kind: "comparison";
      column: PredicateColumn;
      operator: Exclude<PredicateOperator, "in">;
      value: PredicateRhs;
    }
  | {
      kind: "in";
      column: PredicateColumn;
      values: PredicateValue[];
    }
  | { kind: "and"; left: Predicate; right: Predicate }
  | { kind: "or"; left: Predicate; right: Predicate };

type Operand =
  /** Bare drizzle column reference. */
  | { kind: "col"; col: AnyColumn }
  /** A scalar SQL fragment that can stand on either side of a binary operator. */
  | { kind: "sql"; sql: SQL };

type ColumnDef = {
  type: "string" | "number";
  operand: (value: PredicateValue) => Operand;
  buildPredicate?: (op: PredicateOperator, value: PredicateValue | PredicateValue[]) => SQL;
};

const COLUMNS: Record<PredicateColumn, ColumnDef> = {
  status: {
    type: "string",
    // Untouched records have no row in `effective_reviews`; the bare subquery
    // would return NULL and `NULL = 'pending'` is NULL (not true) under SQL
    // three-valued logic, so `where:status = 'pending'` would match nothing
    // and `where:status != 'skipped'` would silently drop pending rows.
    // PRD §10.2 lists `pending` as a first-class state — COALESCE the
    // subquery to `'pending'` so status filters behave per spec.
    operand: () => ({
      kind: "sql",
      sql: sql`COALESCE(
        (
          SELECT er.status FROM effective_reviews er
          WHERE er.record_id = ${recordsWithPrimary.id}
          ORDER BY er.id DESC LIMIT 1
        ),
        'pending'
      )`,
    }),
  },
  final_label: {
    type: "string",
    operand: () => ({
      kind: "sql",
      sql: sql`(
        SELECT er.final_label FROM effective_reviews er
        WHERE er.record_id = ${recordsWithPrimary.id}
        ORDER BY er.id DESC LIMIT 1
      )`,
    }),
  },
  prev_label: {
    type: "string",
    operand: () => ({
      kind: "sql",
      sql: sql`(
        SELECT er.prev_label FROM effective_reviews er
        WHERE er.record_id = ${recordsWithPrimary.id}
        ORDER BY er.id DESC LIMIT 1
      )`,
    }),
  },
  source: {
    type: "string",
    operand: () => ({ kind: "col", col: recordsWithPrimary.primarySource }),
  },
  confidence: {
    type: "number",
    operand: () => ({ kind: "col", col: recordsWithPrimary.primaryConfidence }),
  },
  reason: {
    type: "string",
    operand: () => ({ kind: "col", col: recordsWithPrimary.primaryReason }),
  },
  // `orphan` remains available for the legacy power-user `where:` form. The
  // visual builder intentionally omits it because it is not in PRD §10.3.
  orphan: { type: "number", operand: () => ({ kind: "col", col: recordsWithPrimary.orphan }) },
  issue_type: {
    type: "string",
    operand: () => {
      throw new WhereParseError("issue_type uses dedicated EXISTS path");
    },
    buildPredicate: (op, value) => {
      if (op !== "=" && op !== "!=" && op !== "in") {
        throw new WhereParseError(`unsupported operator for issue_type: ${op}`);
      }
      const values = Array.isArray(value) ? value : [value];
      for (const v of values) {
        if (typeof v !== "string") {
          throw new WhereParseError("issue_type values must be strings");
        }
      }
      const placeholders = values.map((v) => sql`${v}`);
      const list = sql.join(placeholders, sql`, `);
      const exists =
        op === "in"
          ? sql`EXISTS (
              SELECT 1 FROM issues i
              WHERE i.record_id = ${recordsWithPrimary.id} AND i.type IN (${list})
            )`
          : sql`EXISTS (
              SELECT 1 FROM issues i
              WHERE i.record_id = ${recordsWithPrimary.id} AND i.type = ${values[0]}
            )`;
      return op === "!=" ? sql`NOT ${exists}` : exists;
    },
  },
};

export function isPredicateColumn(value: string): value is PredicateColumn {
  return Object.hasOwn(COLUMNS, value);
}

export function operatorsForColumn(column: PredicateColumn): PredicateOperator[] {
  if (column === "issue_type") return ["=", "!=", "in"];
  if (COLUMNS[column].type === "number") return ["=", "!=", "<", "<=", ">", ">="];
  return ["=", "!=", "in"];
}

export function validateOperator(column: PredicateColumn, operator: PredicateOperator): void {
  if (!operatorsForColumn(column).includes(operator)) {
    throw new WhereParseError(`unsupported operator for ${column}: ${operator}`);
  }
}

export function compilePredicate(predicate: Predicate): SQL {
  switch (predicate.kind) {
    case "and":
      return sql`(${compilePredicate(predicate.left)} AND ${compilePredicate(predicate.right)})`;
    case "or":
      return sql`(${compilePredicate(predicate.left)} OR ${compilePredicate(predicate.right)})`;
    case "in": {
      validateOperator(predicate.column, "in");
      if (predicate.values.length === 0) throw new WhereParseError("'in' list is empty");
      const colDef = COLUMNS[predicate.column];
      if (colDef.buildPredicate) return colDef.buildPredicate("in", predicate.values);
      const operand = colDef.operand(predicate.values[0]!);
      const left = operand.kind === "col" ? sql`${operand.col}` : operand.sql;
      const placeholders = predicate.values.map((v) => sql`${v}`);
      return sql`${left} IN (${sql.join(placeholders, sql`, `)})`;
    }
    case "comparison": {
      validateOperator(predicate.column, predicate.operator);
      const colDef = COLUMNS[predicate.column];
      if (predicate.value && typeof predicate.value === "object") {
        const rhsDef = COLUMNS[predicate.value.column];
        if (rhsDef.buildPredicate || colDef.buildPredicate) {
          throw new WhereParseError("column-vs-column comparison is not supported for issue_type");
        }
        if (rhsDef.type !== colDef.type) {
          throw new WhereParseError(
            `cannot compare ${predicate.column} to ${predicate.value.column}`,
          );
        }
        const leftOperand = colDef.operand("");
        const rightOperand = rhsDef.operand("");
        const left = leftOperand.kind === "col" ? sql`${leftOperand.col}` : leftOperand.sql;
        const right = rightOperand.kind === "col" ? sql`${rightOperand.col}` : rightOperand.sql;
        return binaryColumnPredicate(left, predicate.operator, right);
      }

      if (colDef.buildPredicate) return colDef.buildPredicate(predicate.operator, predicate.value);
      const operand = colDef.operand(predicate.value);
      const left = operand.kind === "col" ? sql`${operand.col}` : operand.sql;
      return binaryPredicate(left, predicate.operator, predicate.value);
    }
  }
}

export function predicateQueue(
  predicate: Predicate,
  expr = serializePredicate(predicate),
): QueueDefinition {
  return {
    id: `where:${expr}`,
    label: `Where: ${expr}`,
    query: { where: compilePredicate(predicate) },
  };
}

function binaryColumnPredicate(left: SQL, op: Exclude<PredicateOperator, "in">, right: SQL): SQL {
  switch (op) {
    case "=":
      return sql`${left} = ${right}`;
    case "!=":
      return sql`${left} != ${right}`;
    case "<":
      return sql`${left} < ${right}`;
    case "<=":
      return sql`${left} <= ${right}`;
    case ">":
      return sql`${left} > ${right}`;
    case ">=":
      return sql`${left} >= ${right}`;
  }
}

function binaryPredicate(
  left: SQL,
  op: Exclude<PredicateOperator, "in">,
  value: PredicateValue,
): SQL {
  switch (op) {
    case "=":
      return sql`${left} = ${value}`;
    case "!=":
      return sql`${left} != ${value}`;
    case "<":
      return sql`${left} < ${value}`;
    case "<=":
      return sql`${left} <= ${value}`;
    case ">":
      return sql`${left} > ${value}`;
    case ">=":
      return sql`${left} >= ${value}`;
  }
}

export function serializePredicate(predicate: Predicate): string {
  switch (predicate.kind) {
    case "and":
      return `${serializeNested(predicate.left)} and ${serializeNested(predicate.right)}`;
    case "or":
      return `${serializeNested(predicate.left)} or ${serializeNested(predicate.right)}`;
    case "in":
      return `${predicate.column} in (${predicate.values.map(serializeValue).join(", ")})`;
    case "comparison":
      return `${predicate.column} ${predicate.operator} ${serializeRhs(predicate.value)}`;
  }
}

function serializeNested(predicate: Predicate): string {
  return predicate.kind === "comparison" || predicate.kind === "in"
    ? serializePredicate(predicate)
    : `(${serializePredicate(predicate)})`;
}

function serializeRhs(value: PredicateRhs): string {
  if (typeof value === "object") return value.column;
  return serializeValue(value);
}

function serializeValue(value: PredicateValue): string {
  if (typeof value === "number") return String(value);
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
