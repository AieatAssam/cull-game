export type LensId = '35mm' | 'anamorphic' | 'tilt-shift' | 'fisheye' | 'long-lens' | 'super8';

export function lensAspect(lens: LensId): number {
  return lens === 'anamorphic' ? 2.39 : 1;
}

export function lensLodFactor(lens: LensId, normalizedX: number, normalizedY: number): number {
  if (lens !== 'fisheye') return 1;
  const radius = Math.min(1, Math.hypot(normalizedX / 0.5, normalizedY / 0.5));
  return 1.45 - radius * 0.75;
}

export function lensRenderTicks(lens: LensId): number {
  return lens === 'super8' ? 5 : 1;
}
