import { NEUTRAL_INPUT } from '../sim/step';
import { TUNING } from '../sim/tuning';
import type { InputFrame, SimState } from '../sim/types';
import { cameraBasis } from '../sim/frame';
import { frameView } from '../sim/lenses';
import { easeZoomInput, heldZoomInput } from './zoom-control';

// Device → InputFrame mapping shared by the browser (main.ts) and the human-like balance bots (src/bots/human.ts).
// Pure: every function takes the device state it needs and returns sim input, so a bot pressing "keys" gets exactly what a player gets.

/** Digital pan per held direction key. */
export const KEY_PAN = 90;

/** WASD / arrows → pan, H or the HOLD button → hold, Shift → steady (Space is CUT, see `InputDevices.cutPress`). `keys` holds lower-cased `KeyboardEvent.key` values. */
export function panFromKeys(keys: ReadonlySet<string>, holdButton: boolean): InputFrame {
  let x = 0; let z = 0;
  if (keys.has('a') || keys.has('arrowleft')) x -= KEY_PAN;
  if (keys.has('d') || keys.has('arrowright')) x += KEY_PAN;
  if (keys.has('w') || keys.has('arrowup')) z -= KEY_PAN;
  if (keys.has('s') || keys.has('arrowdown')) z += KEY_PAN;
  return { ...NEUTRAL_INPUT, panX: x, panZ: z, zoom: 0, rotate: 0, hold: keys.has('h') || holdButton, steady: keys.has('shift'), cut: false };
}

/** A world point the camera is being dragged to; one-finger drags move it, and the camera chases it then stops. */
export interface DragTarget { x: number; z: number; }

/**
 * One pointermove of a one-finger drag, 1:1: the world under the finger follows the finger. `dx`/`dy` are px since
 * the last move on a `width`×`height` viewfinder; the target moves by the world distance those px span at this zoom/yaw.
 */
export function dragCameraTarget(target: DragTarget, dx: number, dy: number, width: number, height: number,
  view: Pick<SimState, 'camera' | 'lens' | 'gate'>): DragTarget {
  const { yaw } = view.camera;
  const frame = frameView(view.lens, view.gate, view.camera.zoom);
  const u = -dx / Math.max(1, width) * frame.zoom * frame.aspect;
  const v = dy / Math.max(1, height) * frame.zoom / TUNING.projectionPitchScale;
  const { cos, sin } = cameraBasis(yaw);
  return { x: target.x + u * cos + v * sin, z: target.z - u * sin + v * cos };
}

/** Pan that drives the camera onto a drag target and brakes so it stops on it (no drift). Device parity: never faster than held keys. */
export function panToward(view: Pick<SimState, 'camera' | 'lens'>, target: DragTarget): Pick<InputFrame, 'panX' | 'panZ'> {
  const multiplier = view.lens === 'long-lens' ? 2 : 1;
  const maxVelocity = view.camera.zoom * TUNING.panSpeed * multiplier;
  const brake = TUNING.panAcceleration * view.camera.zoom * multiplier;
  const axis = (error: number) => {
    if (Math.abs(error) < DRAG_SETTLE * view.camera.zoom) return 0;
    return Math.sign(error) * Math.min(1, Math.sqrt(2 * brake * Math.abs(error)) / maxVelocity) * KEY_PAN;
  };
  return { panX: axis(target.x - view.camera.x), panZ: axis(target.z - view.camera.z) };
}

/** A drag target closer than this (fraction of the frame width) counts as reached. */
export const DRAG_SETTLE = 0.004;
export const dragSettled = (view: Pick<SimState, 'camera'>, target: DragTarget) =>
  Math.hypot(target.x - view.camera.x, target.z - view.camera.z) < DRAG_SETTLE * view.camera.zoom;

export const clampZoom = (zoom: number) => Math.max(TUNING.minZoom, Math.min(TUNING.maxZoom, zoom));

/** Zoom target while a pinch is down: the zoom at pinch start scaled by how far the fingers spread. */
export function pinchZoomTarget(startZoom: number, startSpread: number, spread: number): number {
  return clampZoom(startZoom * startSpread / Math.max(1, spread));
}

export interface InputDevices {
  /** Held keys (lower-cased `event.key`). */
  keys: ReadonlySet<string>;
  holdButton: boolean;
  /** Where a one-finger drag has put the world (1:1), or null. */
  dragTarget: DragTarget | null;
  /** A zoom key or − + button that is down, and for how long. */
  zoomPress: { direction: 1 | -1; heldSeconds: number } | null;
  /** Snap, pinch or slider zoom target, or null. */
  zoomTarget: number | null;
  rotationPulse: -1 | 0 | 1;
  /** Space or the CUT button went down since the last tick (an edge: the caller clears it after composing). */
  cutPress: boolean;
  /** Scripted input (the `__cull.input` test hook); neutral otherwise. */
  frameInput: InputFrame;
}

/**
 * The per-tick InputFrame from every device, before the lost-her assist. Returns the zoom target too: a held zoom press drops it.
 */
export function composeInput(devices: InputDevices, view: Pick<SimState, 'camera' | 'lens'>): { input: InputFrame; zoomTarget: number | null } {
  const { frameInput, keys } = devices;
  const zoom = view.camera.zoom;
  const pointerPan = devices.dragTarget ? panToward(view, devices.dragTarget) : null;
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
      cut: devices.cutPress || frameInput.cut,
    }),
  };
}

/** The most the lost-her assist ever contributes to pan (fraction of full input). */
export const ASSIST_MAX = 0.3;
/** Hazards this far beyond the close-call radius of her count as "close" for suspending the assist. */
export const ASSIST_HAZARD_MARGIN = 1;

/** True while a deliberate pan should win outright: a defang gate is open or a hazard is within close-cut reach of her. */
export function assistSuspended(state: Pick<SimState, 'talent' | 'entities' | 'shots'>): boolean {
  if (state.shots?.some((shot) => shot.kind === 'defang' && !shot.done && state.talent.x >= shot.at - 0.35)) return true;
  return state.entities.some((entity) => entity.spawned && !entity.cut && HAZARDS.has(entity.kind)
    && Math.hypot(entity.x - state.talent.x, entity.z - state.talent.z) <= TUNING.closeCutRadius + ASSIST_HAZARD_MARGIN);
}
const HAZARDS = new Set(['urchin', 'boulder', 'swarm', 'stagehand']);

/**
 * Soft lost-her assist (replaces the leash, loop review 2026-10-13). It does nothing while she is in frame, so it never
 * fights a pan that keeps her in shot — including panning a close Urchin out right next to her. Once she is out of
 * frame it blends toward her, ramping over the LOST HER grace to at most ASSIST_MAX, and it stays off while the
 * player is actively panning near an open defang gate or a close hazard.
 */
export function assistInput(input: InputFrame, state: Pick<SimState, 'talent' | 'camera' | 'entities' | 'shots'>): InputFrame {
  const offscreen = state.talent.offscreenTicks;
  if (offscreen <= 0) return input;
  if ((input.panX || input.panZ) && assistSuspended(state)) return input;
  const dx = state.talent.x - state.camera.x;
  const dz = state.talent.z - state.camera.z;
  const length = Math.hypot(dx, dz) || 1;
  const blend = ASSIST_MAX * Math.min(1, offscreen / Math.max(1, TUNING.offscreenGrace * TUNING.tickRate));
  return quantizeInput({
    ...input,
    panX: input.panX * (1 - blend) + dx / length * 127 * blend,
    panZ: input.panZ * (1 - blend) + dz / length * 127 * blend,
  });
}

export function quantizeInput(input: InputFrame): InputFrame {
  const axis = (value: number) => Math.max(-127, Math.min(127, Math.round(value)));
  return { panX: axis(input.panX), panZ: axis(input.panZ), zoom: axis(input.zoom), rotate: input.rotate, hold: Boolean(input.hold), steady: Boolean(input.steady), cut: Boolean(input.cut) };
}
