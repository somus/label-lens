export function lowConfidenceScore(confidence: number | null, threshold: number): number | null {
  if (confidence === null) return null;
  if (confidence >= threshold) return null;
  return (threshold - confidence) / threshold;
}

export function duplicateScore(groupSize: number, totalRecords: number): number {
  if (totalRecords <= 0) return 0;
  return Math.min(1, groupSize / totalRecords);
}

export function disagreementScore(labels: string[]): number | null {
  if (labels.length < 2) return null;
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  let max = 0;
  for (const c of counts.values()) if (c > max) max = c;
  return 1 - max / labels.length;
}
