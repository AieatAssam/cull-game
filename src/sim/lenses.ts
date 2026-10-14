import { TUNING } from './tuning';

export type LensId = '35mm' | 'anamorphic' | 'tilt-shift' | 'fisheye' | 'long-lens' | 'super8';

export function lensAspect(lens: LensId): number {
  return lens === 'anamorphic' ? 2.39 : 1;
}

/** The viewfinder's shape, part of the run config: `square` (desktop, 1:1) or `portrait` (2:3, portrait phones). */
export type GateId = 'square' | 'portrait';
export const GATE_IDS: readonly GateId[] = ['square', 'portrait'];

/**
 * The frame every in-frame test, cut and projection uses: `zoom` is the visible world height and `aspect` the
 * width/height ratio. The portrait gate keeps the width at the camera zoom and shows 50% more world vertically.
 * Anamorphic keeps its own 2.39:1 on any gate. Square returns the lens values untouched (desktop hashes).
 */
export function frameView(lens: LensId, gate: GateId | undefined, zoom: number): { zoom: number; aspect: number } {
  if (gate !== 'portrait' || lens === 'anamorphic') return { zoom, aspect: lensAspect(lens) };
  return { zoom: zoom * TUNING.portraitGateTall, aspect: 1 / TUNING.portraitGateTall };
}

export function lensLodFactor(lens: LensId, normalizedX: number, normalizedY: number): number {
  if (lens !== 'fisheye') return 1;
  const radius = Math.min(1, Math.hypot(normalizedX / 0.5, normalizedY / 0.5));
  return 1.45 - radius * 0.75;
}

export function lensRenderTicks(lens: LensId): number {
  return lens === 'super8' ? 5 : 1;
}
