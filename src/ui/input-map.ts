import { NEUTRAL_INPUT } from '../sim/step';
import { TUNING } from '../sim/tuning';
import type { InputFrame, SimState } from '../sim/types';
import { easeZoomInput, heldZoomInput } from './zoom-control';

// Device → InputFrame mapping shared by the browser (main.ts) and the human-like balance bots (src/bots/human.ts).
// Pure: every function takes the device state it needs and returns sim input, so a bot pressing "keys" gets exactly what a player gets.

/** Digital pan per held direction key. */
export const KEY_PAN = 90;

/** WASD / arrows → pan, Space or the HOLD button → hold, Shift → steady. `keys` holds lower-cased `KeyboardEvent.key` values. */
export function panFromKeys(keys: ReadonlySet<string>, holdButton: boolean): InputFrame {
  let x = 0; let z = 0;
  if (keys.has('a') || keys.has('arrowleft')) x -= KEY_PAN;
  if (keys.has('d') || keys.has('arrowright')) x += KEY_PAN;
  if (keys.has('w') || keys.has('arrowup')) z -= KEY_PAN;
  if (keys.has('s') || keys.has('arrowdown')) z += KEY_PAN;
  return { ...NEUTRAL_INPUT, panX: x, panZ: z, zoom: 0, rotate: 0, hold: keys.has(' ') || holdButton, steady: keys.has('shift') };
}

/** One pointermove of a one-finger drag (px since the last move) → pan; the whole canvas width or height is full input. */
export function pointerDragPan(dx: number, dy: number, width: number, height: number): Pick<InputFrame, 'panX' | 'panZ'> {
  return { panX: Math.max(-127, Math.min(127, -dx / width * 127)), panZ: Math.max(-127, Math.min(127, dy / height * 127)) };
}

export const clampZoom = (zoom: number) => Math.max(TUNING.minZoom, Math.min(TUNING.maxZoom, zoom));

/** Zoom target while a pinch is down: the zoom at pinch start scaled by how far the fingers spread. */
export function pinchZoomTarget(startZoom: number, startSpread: number, spread: number): number {
  return clampZoom(startZoom * startSpread / Math.max(1, spread));
}

export interface InputDevices {
  /** Held keys (lower-cased `event.key`). */
  keys: ReadonlySet<string>;
  holdButton: boolean;
  /** Last drag delta while a finger is down, or null. */
  pointerPan: Pick<InputFrame, 'panX' | 'panZ'> | null;
  /** A zoom key or − + button that is down, and for how long. */
  zoomPress: { direction: 1 | -1; heldSeconds: number } | null;
  /** Snap, pinch or slider zoom target, or null. */
  zoomTarget: number | null;
  rotationPulse: -1 | 0 | 1;
  /** Scripted input (the `__cull.input` test hook); neutral otherwise. */
  frameInput: InputFrame;
}

/**
 * The per-tick InputFrame from every device, before the leash. Returns the zoom target too: a held zoom press drops it.
 */
export function composeInput(devices: InputDevices, zoom: number): { input: InputFrame; zoomTarget: number | null } {
  const { frameInput, pointerPan, keys } = devices;
  const keyInput = panFromKeys(keys, devices.holdButton);
  const held = devices.zoomPress ? heldZoomInput(devices.zoomPress.direction, devices.zoomPress.heldSeconds) : 0;
  const zoomTarget = held ? null : devices.zoomTarget;
  const sliderZoom = held || (zoomTarget === null ? 0 : easeZoomInput(zoom, zoomTarget));
  return {
    zoomTarget,
    input: quantizeInput({
      ...frameInput, ...keyInput,
      panX: pointerPan?.panX ?? (keys.size ? keyInput.panX : frameInput.panX),
      panZ: pointerPan?.panZ ?? (keys.size ? keyInput.panZ : frameInput.panZ),
      zoom: sliderZoom || frameInput.zoom,
      rotate: devices.rotationPulse || frameInput.rotate,
      hold: keyInput.hold || frameInput.hold,
      steady: keyInput.steady || frameInput.steady,
    }),
  };
}

/** Where the leash starts pulling, as a fraction of the half-frame from centre to edge. */
export const LEASH_START = 0.34;
/** Fraction of the half-frame over which the pull ramps up to full strength. */
export const LEASH_RAMP = 0.22;

/**
 * Pulls pan back toward the Talent once she drifts past LEASH_START of the half-frame. At full strength 90% of
 * the pan comes from the leash, so held player pan cannot push the camera much further.
 */
export function leashInput(input: InputFrame, state: Pick<SimState, 'talent' | 'camera'>): InputFrame {
  const dx = state.talent.x - state.camera.x;
  const dz = state.talent.z - state.camera.z;
  const reach = Math.max(1, state.camera.zoom * 0.5);
  const edge = Math.max(Math.abs(dx), Math.abs(dz) * TUNING.projectionPitchScale) / reach;
  if (edge < LEASH_START) return input;
  const blend = Math.min(1, (edge - LEASH_START) / LEASH_RAMP) * 0.9;
  return quantizeInput({
    ...input,
    panX: input.panX * (1 - blend) + Math.sign(dx || 1) * 100 * blend,
    panZ: input.panZ * (1 - blend) + Math.sign(dz || 1) * 100 * blend,
  });
}

export function quantizeInput(input: InputFrame): InputFrame {
  const axis = (value: number) => Math.max(-127, Math.min(127, Math.round(value)));
  return { panX: axis(input.panX), panZ: axis(input.panZ), zoom: axis(input.zoom), rotate: input.rotate, hold: Boolean(input.hold), steady: Boolean(input.steady) };
}
