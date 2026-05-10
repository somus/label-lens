import { type AnyColumn, type SQL, sql } from "drizzle-orm";
import type { QueueDefinition } from "./queues/registry.ts";
import { recordsWithPrimary } from "./schema.ts";

export class WhereParseError extends Error {
  constructor(
    message: string,
    public readonly position?: number,
  ) {
    super(message);
    this.name = "WhereParseError";
  }
}

type Operand =
  /** Bare drizzle column reference. */
  | { kind: "col"; col: AnyColumn }
  /** A scalar SQL fragment that can stand on either side of a binary operator. */
  | { kind: "sql"; sql: SQL };

type ColumnDef = {
  /** Returns the SQL operand to compare against, given the comparison value. */
  operand: (value: string | number) => Operand;
  /**
   * Optional override that builds the entire predicate (used for `issue_type`
   * which compiles to `EXISTS (...)` rather than `column op value`).
   */
  buildPredicate?: (op: Operator, value: string | number | (string | number)[]) => SQL;
};

const COLUMNS: Record<string, ColumnDef> = {
  status: {
    operand: () => ({
      kind: "sql",
      sql: sql`(
        SELECT er.status FROM effective_reviews er
        WHERE er.record_id = ${recordsWithPrimary.id}
        ORDER BY er.id DESC LIMIT 1
      )`,
    }),
  },
  final_label: {
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
    operand: () => ({
      kind: "sql",
      sql: sql`(
        SELECT er.prev_label FROM effective_reviews er
        WHERE er.record_id = ${recordsWithPrimary.id}
        ORDER BY er.id DESC LIMIT 1
      )`,
    }),
  },
  source: { operand: () => ({ kind: "col", col: recordsWithPrimary.primarySource }) },
  confidence: {
    operand: () => ({ kind: "col", col: recordsWithPrimary.primaryConfidence }),
  },
  reason: { operand: () => ({ kind: "col", col: recordsWithPrimary.primaryReason }) },
  issue_type: {
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
      const inList = (sub: SQL) => sql`(${sub})`;
      const placeholders = values.map((v) => sql`${v}`);
      const list = sql.join(placeholders, sql`, `);
      const exists =
        op === "in"
          ? sql`EXISTS (
              SELECT 1 FROM issues i
              WHERE i.record_id = ${recordsWithPrimary.id} AND i.type IN ${inList(list)}
            )`
          : sql`EXISTS (
              SELECT 1 FROM issues i
              WHERE i.record_id = ${recordsWithPrimary.id} AND i.type = ${values[0]}
            )`;
      return op === "!=" ? sql`NOT ${exists}` : exists;
    },
  },
};

const OPERATORS = ["!=", "<=", ">=", "=", "<", ">", "in"] as const;
type Operator = (typeof OPERATORS)[number];

type Token =
  | { kind: "ident"; value: string; pos: number }
  | { kind: "string"; value: string; pos: number }
  | { kind: "number"; value: number; pos: number }
  | { kind: "op"; value: Operator; pos: number }
  | { kind: "lparen"; pos: number }
  | { kind: "rparen"; pos: number }
  | { kind: "comma"; pos: number }
  | { kind: "and"; pos: number }
  | { kind: "or"; pos: number };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === " " || ch === "\t" || ch === "\n") {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen", pos: i });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen", pos: i });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma", pos: i });
      i++;
      continue;
    }
    if (ch === "'") {
      const start = i;
      i++;
      let value = "";
      while (i < input.length) {
        const c = input[i]!;
        if (c === "\\" && i + 1 < input.length) {
          value += input[i + 1];
          i += 2;
          continue;
        }
        if (c === "'") {
          i++;
          tokens.push({ kind: "string", value, pos: start });
          break;
        }
        value += c;
        i++;
        if (i >= input.length) {
          throw new WhereParseError("unterminated string literal", start);
        }
      }
      continue;
    }
    if ((ch >= "0" && ch <= "9") || (ch === "-" && /\d/.test(input[i + 1] ?? ""))) {
      const start = i;
      let s = "";
      if (ch === "-") {
        s += "-";
        i++;
      }
      while (i < input.length && /[0-9.]/.test(input[i]!)) {
        s += input[i];
        i++;
      }
      const n = Number(s);
      if (!Number.isFinite(n)) throw new WhereParseError(`invalid number: ${s}`, start);
      tokens.push({ kind: "number", value: n, pos: start });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      const start = i;
      let s = "";
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i]!)) {
        s += input[i];
        i++;
      }
      const lower = s.toLowerCase();
      if (lower === "and") tokens.push({ kind: "and", pos: start });
      else if (lower === "or") tokens.push({ kind: "or", pos: start });
      else if (lower === "in") tokens.push({ kind: "op", value: "in", pos: start });
      else tokens.push({ kind: "ident", value: s, pos: start });
      continue;
    }
    // operators (longest match first)
    let matched: Operator | null = null;
    for (const op of OPERATORS) {
      if (op === "in") continue;
      if (input.startsWith(op, i)) {
        matched = op;
        break;
      }
    }
    if (matched) {
      tokens.push({ kind: "op", value: matched, pos: i });
      i += matched.length;
      continue;
    }
    throw new WhereParseError(`unexpected character: ${ch}`, i);
  }
  return tokens;
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parseExpr(): SQL {
    let left = this.parseAnd();
    while (this.peek()?.kind === "or") {
      this.advance();
      const right = this.parseAnd();
      left = sql`(${left} OR ${right})`;
    }
    return left;
  }

  private parseAnd(): SQL {
    let left = this.parseTerm();
    while (this.peek()?.kind === "and") {
      this.advance();
      const right = this.parseTerm();
      left = sql`(${left} AND ${right})`;
    }
    return left;
  }

  private parseTerm(): SQL {
    const tok = this.peek();
    if (!tok) throw new WhereParseError("unexpected end of expression");
    if (tok.kind === "lparen") {
      this.advance();
      const inner = this.parseExpr();
      const close = this.peek();
      if (close?.kind !== "rparen") throw new WhereParseError("expected ')'", tok.pos);
      this.advance();
      return inner;
    }
    return this.parsePredicate();
  }

  private parsePredicate(): SQL {
    const colTok = this.peek();
    if (colTok?.kind !== "ident") {
      throw new WhereParseError(
        `expected column name${colTok ? `, got ${colTok.kind}` : ""}`,
        colTok?.pos,
      );
    }
    this.advance();
    const colName = colTok.value;
    const colDef = COLUMNS[colName];
    if (!colDef) throw new WhereParseError(`unknown column ${colName}`, colTok.pos);

    const opTok = this.peek();
    if (opTok?.kind !== "op") {
      const tokDesc =
        opTok?.kind === "ident" ? opTok.value : opTok ? opTok.kind : "end-of-expression";
      throw new WhereParseError(`unknown operator ${tokDesc}`, opTok?.pos);
    }
    this.advance();
    const op = opTok.value;

    if (op === "in") {
      const open = this.peek();
      if (open?.kind !== "lparen") throw new WhereParseError("expected '(' after 'in'", open?.pos);
      this.advance();
      const values: (string | number)[] = [];
      while (this.peek()?.kind !== "rparen") {
        const v = this.peek();
        if (v?.kind !== "string" && v?.kind !== "number") {
          throw new WhereParseError("expected literal in 'in' list", v?.pos);
        }
        values.push(v.value);
        this.advance();
        if (this.peek()?.kind === "comma") this.advance();
      }
      this.advance();
      if (values.length === 0) throw new WhereParseError("'in' list is empty", opTok.pos);
      if (colDef.buildPredicate) return colDef.buildPredicate(op, values);
      const operand = colDef.operand(values[0]!);
      const left = operand.kind === "col" ? sql`${operand.col}` : operand.sql;
      const placeholders = values.map((v) => sql`${v}`);
      return sql`${left} IN (${sql.join(placeholders, sql`, `)})`;
    }

    const valTok = this.peek();
    if (valTok?.kind !== "string" && valTok?.kind !== "number") {
      throw new WhereParseError("expected literal value", valTok?.pos);
    }
    this.advance();
    const value = valTok.value;
    if (colDef.buildPredicate) return colDef.buildPredicate(op, value);
    const operand = colDef.operand(value);
    const left = operand.kind === "col" ? sql`${operand.col}` : operand.sql;
    return binaryPredicate(left, op, value);
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private advance(): void {
    this.pos++;
  }

  done(): boolean {
    return this.pos >= this.tokens.length;
  }
}

function binaryPredicate(left: SQL, op: Operator, value: string | number): SQL {
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
    case "in":
      throw new WhereParseError("internal: 'in' handled separately");
  }
}

export function parseWhere(expr: string): QueueDefinition {
  const tokens = tokenize(expr);
  if (tokens.length === 0) throw new WhereParseError("empty where expression");
  const parser = new Parser(tokens);
  const where = parser.parseExpr();
  if (!parser.done()) throw new WhereParseError("trailing input after expression");
  return {
    id: `where:${expr}`,
    label: `Where: ${expr}`,
    query: { where },
  };
}
