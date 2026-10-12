import { TUNING } from './tuning.js';

export interface Point2 { x: number; z: number; }

/** Advance the Rumour's off-screen ledger without tracking its hidden position. */
export function advanceRumourRadius(radius: number, onScreen: boolean, seconds: number): number {
  if (![radius, seconds].every(Number.isFinite) || radius < 0 || seconds < 0) {
    throw new RangeError('Rumour radius and elapsed seconds must be finite and non-negative');
  }
  const rate = onScreen ? -TUNING.rumourShrinkRate : TUNING.rumourGrowRate;
  return Math.max(0, radius + rate * seconds);
}

export interface MonitorCone {
  origin: Point2;
  /** Direction in radians, measured from +x toward +z. */
  heading: number;
  range: number;
  /** Half angle in radians. */
  halfAngle: number;
}

/** True when a point lies within the monitor's inclusive view cone. */
export function monitorConeContains(cone: MonitorCone, point: Point2): boolean {
  const dx = point.x - cone.origin.x;
  const dz = point.z - cone.origin.z;
  const distance = Math.hypot(dx, dz);
  if (distance > cone.range) return false;
  if (distance === 0) return true;
  const angle = Math.atan2(dz, dx);
  const delta = Math.atan2(Math.sin(angle - cone.heading), Math.cos(angle - cone.heading));
  return Math.abs(delta) <= cone.halfAngle;
}

/** True when the target circle intersects the cone; used by the hostile Red Monitor. */
export function redMonitorOverlapsTarget(cone: MonitorCone, target: Point2, targetRadius: number): boolean {
  if (!Number.isFinite(targetRadius) || targetRadius < 0) throw new RangeError('Target radius must be finite and non-negative');
  if (monitorConeContains(cone, target)) return true;
  if (targetRadius === 0) return false;
  const dx = target.x - cone.origin.x;
  const dz = target.z - cone.origin.z;
  const distance = Math.hypot(dx, dz);
  if (distance - targetRadius > cone.range) return false;
  if (distance <= targetRadius) return true;

  // The closest point in the cone is either the radial projection onto its axis,
  // one of its two boundary rays, or the origin (handled above).
  const axis = { x: Math.cos(cone.heading), z: Math.sin(cone.heading) };
  const projection = Math.max(0, Math.min(cone.range, dx * axis.x + dz * axis.z));
  if (Math.hypot(dx - projection * axis.x, dz - projection * axis.z) <= targetRadius) return true;
  for (const side of [-1, 1]) {
    const angle = cone.heading + side * cone.halfAngle;
    const ray = { x: Math.cos(angle), z: Math.sin(angle) };
    const along = Math.max(0, Math.min(cone.range, dx * ray.x + dz * ray.z));
    if (Math.hypot(dx - along * ray.x, dz - along * ray.z) <= targetRadius) return true;
  }
  return false;
}

/** Stable seeded permutation for a Continuity Prop's repeating cycle. */
export function createContinuitySequence<T>(seed: number, props: readonly T[]): T[] {
  if (!Number.isInteger(seed) || props.length === 0) throw new RangeError('A seeded sequence needs an integer seed and at least one prop');
  const result = [...props];
  let state = seed >>> 0;
  const random = (): number => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function continuityPropAt<T>(sequence: readonly T[], entryIndex: number): T {
  if (sequence.length === 0 || !Number.isInteger(entryIndex) || entryIndex < 0) throw new RangeError('Invalid Continuity Prop sequence index');
  return sequence[entryIndex % sequence.length]!;
}

/** Wrap is active once the Talent enters the final configured fraction of the path. */
export function isWrapActive(talentDistance: number, pathLength: number, fraction = TUNING.wrapLastSceneFraction): boolean {
  if (pathLength < 0 || talentDistance < 0 || fraction < 0 || fraction > 1) throw new RangeError('Invalid Wrap path values');
  return pathLength > 0 && talentDistance >= pathLength * (1 - fraction);
}

export interface WrapAdvance { strikeDistance: number; wrapped: boolean; }

/** Advance the strike line and report whether it has caught the Talent. */
export function advanceWrap(strikeDistance: number, seconds: number, speed: number, talentDistance: number): WrapAdvance {
  if (![strikeDistance, seconds, speed, talentDistance].every(Number.isFinite) || seconds < 0 || speed < 0 || talentDistance < 0) {
    throw new RangeError('Wrap distances, time, and speed must be finite and non-negative');
  }
  const nextDistance = strikeDistance + seconds * speed;
  return { strikeDistance: nextDistance, wrapped: nextDistance >= talentDistance };
}

/** SET at or behind the strike line has been deleted by the Wrap. */
export function isDeletedByWrap(setDistance: number, strikeDistance: number): boolean {
  return setDistance <= strikeDistance;
}
