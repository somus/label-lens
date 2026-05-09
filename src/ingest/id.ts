import { createHash } from "node:crypto";

export function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

const SEP = "\x1f";

export function contentHashId(
  text: string,
  contextBefore?: string | null,
  contextAfter?: string | null,
): string {
  const payload = [
    normalize(text),
    normalize(contextBefore ?? ""),
    normalize(contextAfter ?? ""),
  ].join(SEP);
  return createHash("sha256").update(payload).digest("hex");
}
