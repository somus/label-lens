export function splitContextLines(
  s: string | null | undefined,
  n: number,
  side: "before" | "after",
): string[] {
  if (!s || n <= 0) return [];
  const lines = s.split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return [];
  return side === "before" ? lines.slice(Math.max(0, lines.length - n)) : lines.slice(0, n);
}
