import type { FrameRect, ProjectedBounds } from './types';
import { TUNING } from './tuning';

const SQRT_HALF = 0.7071067811865476;
const PITCH_SCALE = TUNING.projectionPitchScale;
const ROTATION_X = [1, SQRT_HALF, 0, -SQRT_HALF, -1, -SQRT_HALF, 0, SQRT_HALF] as const;
const ROTATION_Z = [0, SQRT_HALF, 1, SQRT_HALF, 0, -SQRT_HALF, -1, -SQRT_HALF] as const;

export function cameraBasis(yaw: number) {
  const turn = ((yaw % 8) + 8) % 8;
  const quadrant = Math.floor(turn);
  const fraction = turn - quadrant;
  const next = (quadrant + 1) % 8;
  const cos = ROTATION_X[quadrant]! + (ROTATION_X[next]! - ROTATION_X[quadrant]!) * fraction;
  const sin = ROTATION_Z[quadrant]! + (ROTATION_Z[next]! - ROTATION_Z[quadrant]!) * fraction;
  const length = Math.hypot(cos, sin) || 1;
  return { cos: cos / length, sin: sin / length };
}

export function projectPoint(x: number, z: number, cameraX: number, cameraZ: number, zoom: number, yaw: number, aspect = 1): { x: number; y: number } {
  const dx = x - cameraX;
  const dz = z - cameraZ;
  const { cos, sin } = cameraBasis(yaw);
  return { x: (dx * cos - dz * sin) / (zoom * aspect), y: -(dx * sin + dz * cos) * PITCH_SCALE / zoom };
}

export function projectedAabb(x: number, z: number, radius: number, height: number, cx: number, cz: number, zoom: number, yaw: number): ProjectedBounds {
  const { cos, sin } = cameraBasis(yaw);
  const dx = x - cx;
  const dz = z - cz;
  const centerX = (dx * cos - dz * sin) / zoom;
  const centerY = -(dx * sin + dz * cos) * PITCH_SCALE / zoom;
  const horizontalRadius = radius * (Math.abs(cos) + Math.abs(sin)) / zoom;
  const verticalRadius = horizontalRadius * PITCH_SCALE;
  return {
    left: centerX - horizontalRadius,
    right: centerX + horizontalRadius,
    bottom: centerY - verticalRadius,
    top: centerY + verticalRadius + height / zoom,
  };
}

export function overlapsFrame(bounds: ProjectedBounds, frame: FrameRect = { left: -0.5, right: 0.5, bottom: -0.5, top: 0.5 }): boolean {
  return bounds.right >= frame.left && bounds.left <= frame.right && bounds.top >= frame.bottom && bounds.bottom <= frame.top;
}

export function inFrame(x: number, z: number, radius: number, cameraX: number, cameraZ: number, zoom: number, yaw = 0, height = 1, aspect = 1, focusBandCenter: number | null = null, wrapX = false): boolean {
  const bounds = projectedAabb(x, z, radius, height, cameraX, cameraZ, zoom, yaw);
  const halfBand = focusBandCenter === null ? 0.5 : 0.2;
  const center = focusBandCenter ?? 0;
  const frame = { left: -aspect / 2, right: aspect / 2, bottom: center - halfBand, top: center + halfBand };
  if (overlapsFrame(bounds, frame)) return true;
  if (!wrapX) return false;
  const centerX = (bounds.left + bounds.right) / 2;
  const wrappedX = ((centerX + aspect / 2) % aspect + aspect) % aspect - aspect / 2;
  const shift = wrappedX - centerX;
  return overlapsFrame({ ...bounds, left: bounds.left + shift, right: bounds.right + shift }, frame);
}

export function callSheetDistance(x: number, z: number, cameraX: number, cameraZ: number, zoom: number, aspect = 1): number {
  const p = projectPoint(x, z, cameraX, cameraZ, zoom, 0, aspect);
  return Math.max(Math.abs(p.x), Math.abs(p.y)) - 0.5;
}
