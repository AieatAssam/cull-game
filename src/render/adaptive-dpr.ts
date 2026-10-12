export const DPR_SCALES = [1, 0.75, 0.5] as const;

/** Step down one render tier when the 60-frame median exceeds 16.7 ms. Never steps back up. */
export function nextDprTier(currentTier: number, frameTimesMs: readonly number[]): number {
  const tier = Math.max(0, Math.min(DPR_SCALES.length - 1, Math.floor(currentTier)));
  if (tier >= DPR_SCALES.length - 1 || frameTimesMs.length < 60) return tier;
  const sorted = [...frameTimesMs].sort((a, b) => a - b);
  const median = (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.ceil((sorted.length - 1) / 2)]!) / 2;
  return median > 1000 / 60 ? tier + 1 : tier;
}
