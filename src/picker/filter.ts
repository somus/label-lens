/**
 * Case-insensitive substring filter with prefix-rank > word-start > anywhere.
 * Stable: equal-rank items keep their input order.
 */
export function filterLabels(labels: string[], query: string): string[] {
  if (query.length === 0) return labels.slice();
  const q = query.toLowerCase();
  const ranked: { label: string; rank: number; idx: number }[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!;
    const lower = label.toLowerCase();
    const at = lower.indexOf(q);
    if (at < 0) continue;
    let rank: number;
    if (at === 0)
      rank = 0; // prefix
    else if (lower[at - 1] === " " || lower[at - 1] === "-" || lower[at - 1] === "_") rank = 1;
    else rank = 2;
    ranked.push({ label, rank, idx: i });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.idx - b.idx);
  return ranked.map((r) => r.label);
}
