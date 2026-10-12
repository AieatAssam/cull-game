import { TUNING } from './tuning';

export type LodTier = 0 | 1 | 2 | 3 | 4;
const THRESHOLDS = TUNING.lodThresholds;
export function lodTier(screenSize: number, previous?: LodTier, hysteresis = TUNING.lodHysteresis): LodTier {
  if (previous !== undefined && previous < 4) {
    const lower = THRESHOLDS[Math.min(previous, 3)]! * (1 - hysteresis);
    const upper = previous > 0 ? THRESHOLDS[previous - 1] * (1 + hysteresis) : Infinity;
    if (screenSize >= lower && screenSize < upper) return previous;
  }
  if (screenSize >= THRESHOLDS[0]) return 0;
  if (screenSize >= THRESHOLDS[1]) return 1;
  if (screenSize >= THRESHOLDS[2]) return 2;
  if (screenSize >= THRESHOLDS[3]) return 3;
  return 4;
}
