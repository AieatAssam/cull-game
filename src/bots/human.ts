import { mulberry32, seededRange } from '../sim/rng';
import { TUNING } from '../sim/tuning';
import type { InputFrame, SimState } from '../sim/types';
import { assistInput, composeInput, dragCameraTarget, dragSettled, pinchZoomTarget, type DragTarget, type InputDevices } from '../ui/input-map';
import { nextZoomStep, ZOOM_HOLD_DELAY } from '../ui/zoom-control';
import { createObserver, talentOnScreen, type PlayerView } from './observe';
import { cutFraming } from './players';

/**
 * Human-like personas (M-review 2026-10-13). They play only through the real input layer (`src/ui/input-map.ts`):
 * `human-keys` holds WASD at KEY_PAN and taps − + like zoom-control; `human-touch` drags a finger (≤ 1500 px/s) mapped
 * 1:1 like the browser's pointer pan (the world under the finger follows it), pinches to zoom and presses the on-screen
 * HOLD button. Both press CUT (Space / the CUT button) when an edge indicator shows a threat close to her and the
 * shutter meter is full. The browser's lost-her assist is applied to their input, as it is to a player's.
 *
 * Human limits: a seeded 200–300 ms perception/reaction delay (they act on the PlayerView as it was then, while
 * feeling their own camera now), Gaussian aim error of 6–10% of the viewport per aim, a 100 ms decision cadence,
 * minimum key dwell, finger speed/accel limits and occasional hesitation.
 */
export type HumanPersona = 'human-keys' | 'human-touch';

export interface HumanTraits { reactionTicks: number; aimSigma: number; hesitationChance: number; }

const tick = 1 / TUNING.tickRate;
const decisionTicks = Math.round(0.1 * TUNING.tickRate);
const aimHoldTicks = Math.round(0.5 * TUNING.tickRate);
const keyDwellTicks = Math.round(0.08 * TUNING.tickRate);
const tapTicks = Math.round(0.6 * ZOOM_HOLD_DELAY * TUNING.tickRate);
const tapGapTicks = Math.round(0.15 * TUNING.tickRate);
/** A phone's square viewfinder, CSS px. */
const viewportPx = 360;
const fingerMaxPxPerTick = 1500 * tick;
const fingerMaxAccelPxPerTick = 20_000 * tick * tick;
const regripTicks = Math.round(0.12 * TUNING.tickRate);
/** Pan is good enough within this fraction of the frame width; humans don't chase the last few pixels. */
const deadband = 0.05;
/** On ACTION, how far (fraction of the frame width) a player leads the frame along the exit arrow. */
const actionLead = 0.2;
/** CUT when an off-frame threat is this close to her (u) or this soon (s): "close-ish", as the edge indicator reads. */
export const HUMAN_CUT_REACH = 4;
export const HUMAN_CUT_SECONDS = 1.2;

/** The shared CUT judgement (humans and Adaptive): meter full, she is in shot, and an edge indicator is close-ish. */
export function wantsCut(view: PlayerView): boolean {
  if (view.state.shutter.charge < 1 || !talentOnScreen(view.state)) return false;
  return view.threats.some((threat) => threat.distance <= HUMAN_CUT_REACH || threat.timeToContact <= HUMAN_CUT_SECONDS);
}

export function humanTraits(seed: number, persona: HumanPersona): HumanTraits {
  const key = (Math.imul(seed, 0x9e3779b1) ^ (persona === 'human-keys' ? 0x4b45 : 0x5443)) >>> 0;
  return {
    reactionTicks: Math.round(seededRange(key, 0, 200, 300) / 1000 * TUNING.tickRate),
    aimSigma: seededRange(key, 1, 0.06, 0.1),
    hesitationChance: seededRange(key, 2, 0.01, 0.03),
  };
}

interface Intent { x: number; z: number; zoom: number; target: string; hold: boolean; cut: boolean; }
interface Memory { hostile?: { x: number; z: number; range: number }; hideAxis?: 'x' | 'z'; }

/** What a player is trying to frame, from what they saw: the Adaptive plan, but from a stale view. */
function intent(view: PlayerView, memory: Memory): Intent {
  const { state, gate, action } = view;
  const cutNow = wantsCut(view);
  const talent = state.talent;
  const near = (entity: { x: number; z: number }) => Math.hypot(entity.x - talent.x, entity.z - talent.z);
  const danger = state.entities.some((entity) => !entity.cut && entity.kind === 'urchin' && near(entity) < 14);
  const zoom = danger ? 38 : 24;
  const hostile = state.entities.find((entity) => entity.kind === 'red-monitor' && !entity.cut && entity.spawned);
  if (hostile) memory.hostile = { x: hostile.x, z: hostile.z, range: hostile.range ?? 0 };
  if (memory.hostile && near(memory.hostile) > memory.hostile.range + 6 && talent.x > memory.hostile.x) memory.hostile = undefined;
  const closeTarget = gate === 'defang' ? state.entities
    .filter((entity) => !entity.cut && entity.spawned && (entity.kind === 'urchin' || entity.kind === 'boulder' || entity.kind === 'stagehand')
      && near(entity) <= TUNING.closeCutRadius)
    .sort((a, b) => near(a) - near(b))[0] : undefined;
  const hide = memory.hostile && near(memory.hostile) <= memory.hostile.range + 6
    ? cutFraming(state, memory.hostile, 0.55, 0.8, { keepAxis: memory.hideAxis, minWidth: 1.5 }) : null;
  memory.hideAxis = hide?.axis;
  const cut = closeTarget ? cutFraming(state, closeTarget, closeTarget.kind === 'urchin' ? TUNING.urchinRadius : 0.8, 0.8) : null;
  const framing = hide ?? cut;
  // A hazard just ahead on her line with no way to frame it out: hold her.
  const blocking = !framing && state.entities.some((entity) => !entity.cut && entity.spawned && (entity.kind === 'urchin' || entity.kind === 'boulder')
    && entity.x - talent.x > 0 && entity.x - talent.x < 2.2 && Math.abs(entity.z - talent.z) < 1.2);
  if (framing) {
    const target = hide ? 'hide' : `cut:${closeTarget!.id}`;
    return framing.axis === 'x' ? { x: framing.value, z: talent.z, zoom: hide ? Math.max(zoom, state.camera.zoom) : zoom, target, hold: false, cut: cutNow }
      : { x: talent.x, z: framing.value, zoom: hide ? Math.max(zoom, state.camera.zoom) : zoom, target, hold: false, cut: cutNow };
  }
  // ACTION: the arrow at her feet says which way she walks; lead the frame that way so she walks into it.
  if (action) return { x: talent.x + action.x * actionLead * zoom, z: talent.z + action.z * actionLead * zoom, zoom, target: 'action', hold: false, cut: cutNow };
  return { x: talent.x, z: talent.z, zoom, target: 'talent', hold: blocking, cut: cutNow };
}

function gaussian(random: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

/** A driver like `createDriver`: full sim state in, InputFrame out. It reads the state only through `observe` and the assist. */
export function createHumanDriver(persona: HumanPersona, seed: number, options: { assist?: boolean } = {}): (state: SimState) => InputFrame {
  const traits = humanTraits(seed, persona);
  const random = mulberry32((seed ^ (persona === 'human-keys' ? 0x6b657973 : 0x746f7563)) >>> 0);
  const observe = createObserver();
  const history: PlayerView[] = [];
  const memory: Memory = {};
  let ticks = 0;
  let plan: Intent | null = null;
  let aim = { x: 0, z: 0, target: '', since: -Infinity };
  let hesitateUntil = 0;
  // Device state.
  const keys = new Set<string>();
  const keyChanged = new Map<string, number>();
  let zoomTarget: number | null = null;
  let tap: { direction: 1 | -1; since: number } | null = null;
  let lastTap = -Infinity;
  let finger: { x: number; y: number; vx: number; vy: number } | null = null;
  let fingerFreeAt = 0;
  let pinch: { startZoom: number; startSpread: number; spread: number } | null = null;
  let dragTarget: DragTarget | null = null;
  let holdButton = false;
  let cutPress = false;
  let lastCut = -Infinity;

  const setKey = (key: string, down: boolean) => {
    if (keys.has(key) === down || ticks - (keyChanged.get(key) ?? -Infinity) < keyDwellTicks) return;
    if (down) keys.add(key); else keys.delete(key);
    keyChanged.set(key, ticks);
  };

  return (state) => {
    ticks++;
    const view = observe(state);
    history.push(view);
    if (history.length > traits.reactionTicks + 1) history.shift();
    const seen = history[0]!;
    const camera = state.camera;
    if (ticks % decisionTicks === 0 || !plan) {
      if (ticks >= hesitateUntil && random() < traits.hesitationChance) hesitateUntil = ticks + Math.round((0.3 + random() * 0.3) * TUNING.tickRate);
      // Perception is stale; proprioception (the camera they are moving) is not.
      plan = intent({ gate: seen.gate, action: seen.action, threats: seen.threats, state: { ...seen.state, camera, tick: state.tick } }, memory);
      if (plan.target !== aim.target || ticks - aim.since >= aimHoldTicks) {
        aim = { x: gaussian(random) * traits.aimSigma, z: gaussian(random) * traits.aimSigma, target: plan.target, since: ticks };
      }
    }
    const frozen = ticks < hesitateUntil;
    const goalX = plan.x + aim.x * camera.zoom;
    const goalZ = plan.z + aim.z * camera.zoom;
    const errorX = frozen ? 0 : goalX - camera.x;
    const errorZ = frozen ? 0 : goalZ - camera.z;
    const band = deadband * camera.zoom;
    const zoomOff = !frozen && Math.abs(Math.log(camera.zoom / plan.zoom)) > 0.12;
    const zoomDirection: 1 | -1 = camera.zoom > plan.zoom ? 1 : -1;
    const hold = !frozen && plan.hold;
    // One press per decision that calls for it; a player waits for the meter they just emptied (and the view to catch up).
    cutPress = !frozen && plan.cut && ticks - lastCut > traits.reactionTicks + decisionTicks;
    if (cutPress) { lastCut = ticks; plan = { ...plan, cut: false }; }

    if (persona === 'human-keys') {
      setKey('d', errorX > band); setKey('a', errorX < -band);
      setKey('s', errorZ > band); setKey('w', errorZ < -band);
      setKey('h', hold);
      if (tap && ticks - tap.since >= tapTicks) tap = null;
      if (!tap && zoomOff && ticks - lastTap >= tapGapTicks && (zoomTarget === null || Math.abs(zoomTarget - camera.zoom) < 1)) {
        // A tap on − or +: snap to the next framing step (zoom-control's stepZoom).
        zoomTarget = nextZoomStep(zoomTarget ?? camera.zoom, zoomDirection);
        tap = { direction: zoomDirection, since: ticks };
        lastTap = ticks;
      }
    } else {
      holdButton = hold;
      if (pinch) {
        const wanted = pinch.startSpread * pinch.startZoom / plan.zoom;
        pinch.spread += Math.max(-fingerMaxPxPerTick, Math.min(fingerMaxPxPerTick, wanted - pinch.spread));
        zoomTarget = pinchZoomTarget(pinch.startZoom, pinch.startSpread, pinch.spread);
        if (Math.abs(pinch.spread - wanted) < 1) { pinch = null; fingerFreeAt = ticks + regripTicks; }
      } else if (zoomOff && ticks >= fingerFreeAt) {
        // Two fingers down: the drag ends and the spread sets the zoom target.
        finger = null; dragTarget = null;
        pinch = { startZoom: zoomTarget ?? camera.zoom, startSpread: 160, spread: 160 };
      } else if (ticks >= fingerFreeAt && (Math.abs(errorX) > band || Math.abs(errorZ) > band || finger)) {
        if (Math.abs(errorX) <= band && Math.abs(errorZ) <= band) {
          finger = null; fingerFreeAt = ticks + regripTicks;
        } else {
          // Grab the set and drag it 1:1: move the finger until the world point they want centred sits under the frame centre.
          finger ??= { x: viewportPx / 2 + Math.sign(errorX) * viewportPx * 0.3, y: viewportPx / 2 - Math.sign(errorZ) * viewportPx * 0.3, vx: 0, vy: 0 };
          dragTarget ??= { x: camera.x, z: camera.z };
          const view = { camera, lens: state.lens };
          const remainingX = frozen ? 0 : goalX - dragTarget.x;
          const remainingZ = frozen ? 0 : goalZ - dragTarget.z;
          const wantX = Math.max(-fingerMaxPxPerTick, Math.min(fingerMaxPxPerTick, -remainingX / camera.zoom * viewportPx));
          const wantY = Math.max(-fingerMaxPxPerTick, Math.min(fingerMaxPxPerTick, remainingZ * TUNING.projectionPitchScale / camera.zoom * viewportPx));
          finger.vx += Math.max(-fingerMaxAccelPxPerTick, Math.min(fingerMaxAccelPxPerTick, wantX - finger.vx));
          finger.vy += Math.max(-fingerMaxAccelPxPerTick, Math.min(fingerMaxAccelPxPerTick, wantY - finger.vy));
          finger.x += finger.vx; finger.y += finger.vy;
          dragTarget = dragCameraTarget(dragTarget, finger.vx, finger.vy, viewportPx, viewportPx, view);
          // Out of glass: lift and re-grip.
          if (finger.x < 0 || finger.x > viewportPx || finger.y < 0 || finger.y > viewportPx) { finger = null; fingerFreeAt = ticks + regripTicks; }
        }
      }
      // A lifted drag settles where the finger left the world, as in the browser.
      if (!finger && dragTarget && dragSettled({ camera }, dragTarget)) dragTarget = null;
    }

    const devices: InputDevices = {
      keys, holdButton, dragTarget, rotationPulse: 0, cutPress, frameInput: { panX: 0, panZ: 0, zoom: 0, rotate: 0, hold: false, steady: false, cut: false }, zoomTarget,
      zoomPress: tap && { direction: tap.direction, heldSeconds: (ticks - tap.since) * tick },
    };
    const composed = composeInput(devices, state);
    zoomTarget = composed.zoomTarget;
    if (zoomTarget !== null && Math.abs(zoomTarget - camera.zoom) < 0.12 && !pinch) zoomTarget = null;
    // `assist: false` is a what-if for the loop review only; the browser always assists.
    return options.assist === false ? composed.input : assistInput(composed.input, state);
  };
}
