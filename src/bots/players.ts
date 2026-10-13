import { mulberry32 } from '../sim/rng';
import { step } from '../sim/step';
import { TUNING } from '../sim/tuning';
import { createGeneratedState } from '../sim/world';
import type { InputFrame, SimState } from '../sim/types';

export type BotKind = 'tracker' | 'wide' | 'close' | 'adaptive' | 'chaos' | 'smart';
const neutral: InputFrame = { panX: 0, panZ: 0, zoom: 0, rotate: 0, hold: false, steady: false };
const sceneTickLimit = (TUNING.startFilm + 14 * TUNING.reelFilm + TUNING.sceneFilm) * TUNING.tickRate;

function direction(value: number): number {
  return Math.abs(value) < 1.1 ? 0 : Math.sign(value) * 127;
}

/** `aim` scales every target zoom; the balance harness's jitter uses it for ±5% aim noise. 1 reproduces the shipped bots exactly. */
export function inputForBot(state: SimState, bot: BotKind, random: () => number = () => 0.5, aim = 1): InputFrame {
  if (bot === 'chaos') return {
    panX: Math.round(random() * 254 - 127), panZ: Math.round(random() * 254 - 127),
    zoom: Math.round(random() * 254 - 127), rotate: random() < 0.02 ? (random() < 0.5 ? -1 : 1) : 0,
    hold: random() < 0.01, steady: random() < 0.1,
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
  if (bot === 'adaptive') {
    const danger = state.entities.some((entity) => !entity.cut && entity.kind === 'urchin'
      && Math.hypot(entity.x - state.talent.x, entity.z - state.talent.z) < 8);
    const targetZoom = (state.shoot?.sceneIndex === 3 ? 48 : danger ? 48 : 24) * aim;
    zoom = state.camera.zoom > targetZoom + 0.5 ? 64 : state.camera.zoom < targetZoom - 0.5 ? -64 : 0;
  }
  const frameX = glassAhead ? state.talent.x + Math.max(-4, Math.min(4, (glassAhead.x - state.talent.x) * 0.5)) : targetX;
  const frameZ = glassAhead ? state.talent.z + Math.max(-2, Math.min(2, (glassAhead.z - state.talent.z) * 0.5)) : targetZ;
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
