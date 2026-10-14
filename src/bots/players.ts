import { mulberry32 } from '../sim/rng';
import { frameView } from '../sim/lenses';
import { step } from '../sim/step';
import { TUNING } from '../sim/tuning';
import { createGeneratedState } from '../sim/world';
import type { InputFrame, SimState } from '../sim/types';

export type BotKind = 'tracker' | 'wide' | 'close' | 'adaptive' | 'chaos' | 'smart';
const neutral: InputFrame = { panX: 0, panZ: 0, zoom: 0, rotate: 0, hold: false, steady: false, cut: false };
const sceneTickLimit = (TUNING.startFilm + 14 * TUNING.reelFilm + TUNING.sceneFilm) * TUNING.tickRate;

function direction(value: number): number {
  return Math.abs(value) < 1.1 ? 0 : Math.sign(value) * 127;
}

/** What Adaptive remembers between ticks: only things it has seen on screen. */
export interface AdaptiveMemory { hostile?: { x: number; z: number; heading: number; range: number; halfAngle: number }; hideAxis?: 'x' | 'z' }

type Gate = 'defang' | 'portrait' | null;
const P = TUNING.projectionPitchScale;
const talentHeight = 1.4;

/**
 * Camera x or z that frames `target` out while the Talent stays in, on whichever side leaves the widest margin
 * (yaw 0, 35 mm gate, the same AABB test as `inFrame`). Null when no such framing exists at this zoom.
 */
export function cutFraming(state: SimState, target: { x: number; z: number }, radius: number, height: number,
  hold?: { keepAxis?: 'x' | 'z'; minWidth: number }): { axis: 'x' | 'z'; value: number; width: number } | null {
  const zoom = state.camera.zoom;
  const t = state.talent;
  const tr = TUNING.talentRadii[Math.min(t.lodTier ?? 1, 3)]!;
  const half = zoom / 2;
  // The gate's vertical half-extent: taller than `half` on the portrait gate.
  const halfZ = frameView(state.lens, state.gate, zoom).zoom / 2;
  const options = [
    // target right of the frame's right edge / left of its left edge
    { axis: 'x' as const, low: t.x - tr - half, high: target.x - radius - half },
    { axis: 'x' as const, low: target.x + radius + half, high: t.x + tr + half },
    // target below the bottom edge (larger z) / above the top edge
    { axis: 'z' as const, low: t.z - tr - (talentHeight + halfZ) / P, high: target.z - radius - (height + halfZ) / P },
    { axis: 'z' as const, low: target.z + radius + halfZ / P, high: t.z + tr + halfZ / P },
  ].map((option, index) => ({ axis: option.axis, value: (option.low + option.high) / 2, width: option.high - option.low,
    // While holding a framing, the Talent walks toward +x, so a margin on the leading edge closes: prefer the sides and behind.
    score: option.high - option.low - (hold && index === 0 ? 6 : 0) }));
  const viable = options.filter((option) => option.width > (hold?.minWidth ?? 0.3)).sort((a, b) => b.score - a.score);
  // Keep the side already in use while it still has room: swinging the frame across lets the target back in.
  const kept = hold?.keepAxis && viable.find((option) => option.axis === hold.keepAxis && option.width > 3);
  return kept && viable[0] && kept.score + 4 >= viable[0].score ? kept : viable[0] ?? null;
}

/** Proportional pan toward a camera coordinate: precise enough to hold a frame edge between two things. */
function panToward(state: SimState, delta: number): number {
  const maxVelocity = state.camera.zoom * TUNING.panSpeed;
  return Math.max(-127, Math.min(127, Math.round(delta / 0.3 / maxVelocity * 127)));
}

/**
 * `aim` scales every target zoom; the balance harness's jitter uses it for ±5% aim noise.
 * `gate` is the HUD shot text (derived from `state.shots` when the caller has full state).
 * `memory` lets Adaptive remember a hostile camera it has seen; without it Adaptive still reacts while the camera is on screen.
 */
export function inputForBot(state: SimState, bot: BotKind, random: () => number = () => 0.5, aim = 1, gate?: Gate, memory: AdaptiveMemory = {}): InputFrame {
  if (bot === 'chaos') return {
    panX: Math.round(random() * 254 - 127), panZ: Math.round(random() * 254 - 127),
    zoom: Math.round(random() * 254 - 127), rotate: random() < 0.02 ? (random() < 0.5 ? -1 : 1) : 0,
    hold: random() < 0.01, steady: random() < 0.1, cut: random() < 0.02,
  };
  const glassAhead = bot === 'adaptive' ? state.entities
    .filter((entity) => !entity.cut && entity.kind === 'glass' && entity.x - state.talent.x > -2 && entity.x - state.talent.x < 22)
    .sort((a, b) => Math.abs(a.x - state.talent.x) - Math.abs(b.x - state.talent.x))[0] : undefined;
  const targetX = state.talent.x;
  const targetZ = state.talent.z;
  let zoom = 0;
  if (bot === 'tracker') zoom = state.camera.zoom > 24 * aim + 0.1 ? 32 : state.camera.zoom < 24 * aim - 0.1 ? -32 : 0;
  if (bot === 'wide') zoom = -127;
  if (bot === 'close') zoom = 127;
  let frameX = glassAhead ? state.talent.x + Math.max(-4, Math.min(4, (glassAhead.x - state.talent.x) * 0.5)) : targetX;
  let frameZ = glassAhead ? state.talent.z + Math.max(-2, Math.min(2, (glassAhead.z - state.talent.z) * 0.5)) : targetZ;
  if (bot === 'adaptive') {
    const talent = state.talent;
    // M2: react to an Urchin when it comes on screen (≈ 14 u at zoom 24), not once it is within 8 u: Urchins now enter ahead on the path.
    const danger = state.entities.some((entity) => !entity.cut && entity.kind === 'urchin'
      && Math.hypot(entity.x - talent.x, entity.z - talent.z) < 14);
    // M2: medium-wide (38) is past an Urchin's lethal tier but short of the Wide tier where crowds trample and bridges drop.
    // The finale no longer parks at 48 for the same reason.
    const targetZoom = (danger ? 38 : 24) * aim;
    zoom = state.camera.zoom > targetZoom + 0.5 ? 64 : state.camera.zoom < targetZoom - 0.5 ? -64 : 0;
    const shotGate = gate !== undefined ? gate : state.shots?.find((shot) => !shot.done && talent.x >= shot.at - 0.35)?.kind ?? null;
    // A hostile camera on screen is remembered until the Talent is well clear of it, and kept out of the frame.
    const hostileSeen = state.entities.find((entity) => entity.kind === 'red-monitor' && !entity.cut);
    if (hostileSeen) memory.hostile = { x: hostileSeen.x, z: hostileSeen.z, heading: hostileSeen.heading ?? 0, range: hostileSeen.range ?? 0, halfAngle: hostileSeen.halfAngle ?? 0 };
    if (memory.hostile && Math.hypot(memory.hostile.x - talent.x, memory.hostile.z - talent.z) > memory.hostile.range + 6 && talent.x > memory.hostile.x) memory.hostile = undefined;
    // At an open defang gate, cut the nearest visible hazard close: put the frame edge between it and the Talent.
    const closeTarget = shotGate === 'defang' ? state.entities
      .filter((entity) => !entity.cut && entity.spawned && (entity.kind === 'urchin' || entity.kind === 'boulder' || entity.kind === 'stagehand')
        && Math.hypot(entity.x - talent.x, entity.z - talent.z) <= TUNING.closeCutRadius)
      .sort((a, b) => Math.hypot(a.x - talent.x, a.z - talent.z) - Math.hypot(b.x - talent.x, b.z - talent.z))[0] : undefined;
    const hide = memory.hostile && Math.hypot(memory.hostile.x - talent.x, memory.hostile.z - talent.z) <= memory.hostile.range + 6
      ? cutFraming(state, memory.hostile, 0.55, 0.8, { keepAxis: memory.hideAxis, minWidth: 1.5 }) : null;
    memory.hideAxis = hide?.axis;
    const cut = closeTarget ? cutFraming(state, closeTarget, closeTarget.kind === 'urchin' ? TUNING.urchinRadius : 0.8, 0.8) : null;
    const framing = hide ?? cut;
    if (framing) {
      if (framing.axis === 'x') { frameX = framing.value; frameZ = targetZ; } else { frameZ = framing.value; frameX = targetX; }
      const precise = { x: framing.axis === 'x', z: framing.axis === 'z' };
      return {
        ...neutral,
        panX: precise.x ? panToward(state, frameX - state.camera.x) : direction(frameX - state.camera.x),
        panZ: precise.z ? panToward(state, frameZ - state.camera.z) : direction(frameZ - state.camera.z),
        // While holding a frame edge on the hostile camera, only widen (for an Urchin); tightening would drop the Talent.
        zoom: hide ? Math.min(0, zoom) : zoom,
      };
    }
  }
  return { ...neutral, panX: direction(frameX - state.camera.x), panZ: direction(frameZ - state.camera.z), zoom };
}

export interface BotRun { state: SimState; ticks: number; completed: boolean; timedOut: boolean; }

export function play(seed: number, bot: BotKind, maxTicks = sceneTickLimit): SimState {
  const state = createGeneratedState(seed, 0);
  const random = mulberry32((seed ^ 0xb07b07) >>> 0);
  let current = state;
  for (let i = 0; i < maxTicks && !current.failed; i++) current = step(current, inputForBot(current, bot, random));
  return current;
}

export function playRun(seed: number, bot: BotKind, maxTicks = sceneTickLimit): BotRun {
  const state = play(seed, bot, maxTicks);
  const pathEnd = state.path.at(-1)?.x ?? 0;
  const completed = state.failed === 'wrapped' || (!state.failed && state.talent.x >= pathEnd - 1);
  return { state, ticks: state.tick, completed, timedOut: !completed && !state.failed && state.tick >= maxTicks };
}

export interface BotReport {
  runs: number;
  trackerDistance: number;
  wideDistance: number;
  closeDistance: number;
  adaptiveDistance: number;
  adaptiveCompletion: number;
  trackerCompletion: number;
  wideRatio: number;
  closeRatio: number;
  adaptiveRatio: number;
  adaptiveTimeouts: number;
  trackerTimeouts: number;
  adaptiveFailures: Record<string, number>;
}

export function evaluateBots(runs = 200): BotReport {
  const totals = { tracker: 0, wide: 0, close: 0, adaptive: 0 };
  const completed = { tracker: 0, adaptive: 0 };
  const timeouts = { tracker: 0, adaptive: 0 };
  const adaptiveFailures: Record<string, number> = {};
  for (let seed = 1; seed <= runs; seed++) {
    for (const bot of ['tracker', 'wide', 'close', 'adaptive'] as const) {
      const result = playRun(seed, bot);
      totals[bot] += result.state.talent.x;
      if (result.completed) {
        if (bot === 'tracker' || bot === 'adaptive') completed[bot]++;
      }
      if (bot === 'tracker' || bot === 'adaptive') {
        if (result.timedOut) timeouts[bot]++;
        if (bot === 'adaptive' && !result.completed && result.state.failed) adaptiveFailures[result.state.failed] = (adaptiveFailures[result.state.failed] ?? 0) + 1;
      }
    }
  }
  const trackerDistance = totals.tracker / runs;
  const wideDistance = totals.wide / runs;
  const closeDistance = totals.close / runs;
  const adaptiveDistance = totals.adaptive / runs;
  return {
    runs, trackerDistance, wideDistance, closeDistance, adaptiveDistance,
    adaptiveCompletion: completed.adaptive / runs, trackerCompletion: completed.tracker / runs,
    wideRatio: adaptiveDistance ? wideDistance / adaptiveDistance : 0,
    closeRatio: adaptiveDistance ? closeDistance / adaptiveDistance : 0,
    adaptiveRatio: trackerDistance ? adaptiveDistance / trackerDistance : 0,
    adaptiveTimeouts: timeouts.adaptive, trackerTimeouts: timeouts.tracker, adaptiveFailures,
  };
}

export function runChaosBatch(runs = 1_000, maxTicks = 90 * 60): { runs: number; steps: number; finite: boolean } {
  let steps = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const result = playRun(seed, 'chaos', maxTicks);
    steps += result.ticks;
    const { state } = result;
    const scalars = [state.talent.x, state.talent.z, state.camera.x, state.camera.z, state.camera.zoom, state.film];
    if (scalars.some((value) => !Number.isFinite(value))) return { runs: seed, steps, finite: false };
  }
  return { runs, steps, finite: true };
}

export function compareBots(runs = 20) {
  const report = evaluateBots(runs);
  return { runs, trackerDistance: report.trackerDistance, smartDistance: report.adaptiveDistance, advantage: report.adaptiveRatio };
}
