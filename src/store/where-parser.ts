import {
  isPredicateColumn,
  OPERATORS,
  type Predicate,
  type PredicateColumn,
  type PredicateOperator,
  type PredicateValue,
  predicateQueue,
  WhereParseError,
} from "./queues/predicate.ts";
import type { QueueDefinition } from "./queues/registry.ts";

export { WhereParseError } from "./queues/predicate.ts";

type Token =
  | { kind: "ident"; value: string; pos: number }
  | { kind: "string"; value: string; pos: number }
  | { kind: "number"; value: number; pos: number }
  | { kind: "op"; value: PredicateOperator; pos: number }
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
    let matched: PredicateOperator | null = null;
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

  parseExpr(): Predicate {
    let left = this.parseAnd();
    while (this.peek()?.kind === "or") {
      this.advance();
      const right = this.parseAnd();
      left = { kind: "or", left, right };
    }
    return left;
  }

  private parseAnd(): Predicate {
    let left = this.parseTerm();
    while (this.peek()?.kind === "and") {
      this.advance();
      const right = this.parseTerm();
      left = { kind: "and", left, right };
    }
    return left;
  }

  private parseTerm(): Predicate {
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

  private parsePredicate(): Predicate {
    const colTok = this.peek();
    if (colTok?.kind !== "ident") {
      throw new WhereParseError(
        `expected column name${colTok ? `, got ${colTok.kind}` : ""}`,
        colTok?.pos,
      );
    }
    this.advance();
    const column = parseColumn(colTok.value, colTok.pos);

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
      const values: PredicateValue[] = [];
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
      return { kind: "in", column, values };
    }

    const valTok = this.peek();
    if (valTok?.kind !== "string" && valTok?.kind !== "number" && valTok?.kind !== "ident") {
      throw new WhereParseError("expected literal value", valTok?.pos);
    }
    this.advance();

    if (valTok.kind === "ident") {
      return {
        kind: "comparison",
        column,
        operator: op,
        value: { kind: "column", column: parseColumn(valTok.value, valTok.pos) },
      };
    }

    return { kind: "comparison", column, operator: op, value: valTok.value };
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

function parseColumn(value: string, pos: number): PredicateColumn {
  if (!isPredicateColumn(value)) throw new WhereParseError(`unknown column ${value}`, pos);
  return value;
}

export function parseWherePredicate(expr: string): Predicate {
  const tokens = tokenize(expr);
  if (tokens.length === 0) throw new WhereParseError("empty where expression");
  const parser = new Parser(tokens);
  const predicate = parser.parseExpr();
  if (!parser.done()) throw new WhereParseError("trailing input after expression");
  return predicate;
}

export function parseWhere(expr: string): QueueDefinition {
  return predicateQueue(parseWherePredicate(expr), expr);
}
