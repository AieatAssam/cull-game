import { mulberry32, seededRange } from '../sim/rng';
import { NEUTRAL_INPUT } from '../sim/step';
import { TUNING } from '../sim/tuning';
import type { InputFrame, SimState } from '../sim/types';
import { createObserver, type PlayerView } from './observe';
import { inputForBot } from './players';

/** Bots the balance harness runs. Every one of them sees the world only through `PlayerView`. */
export type BalanceBot = 'adaptive' | 'tracker' | 'gatekeeper' | 'metronome' | 'wide' | 'close' | 'chaos';
export const BALANCE_BOTS: readonly BalanceBot[] = ['adaptive', 'tracker', 'gatekeeper', 'metronome', 'wide', 'close', 'chaos'];

export interface Policy { act(view: PlayerView): InputFrame; }

export interface BotTuning {
  /** Multiplies every target zoom (gate aim). 1 = exact. */
  aim: number;
  /** Ticks between what happens and the bot reacting to it. 0 = instant. */
  reactionTicks: number;
}
const exact: BotTuning = { aim: 1, reactionTicks: 0 };

const metronomePeriodTicks = Math.round(0.5 * TUNING.tickRate);

function pan(value: number): number {
  return Math.abs(value) < 1.1 ? 0 : Math.sign(value) * 127;
}

/** Holds its zoom target with Tracker's deadband. */
function zoomToward(zoom: number, target: number, speed: number): number {
  return zoom > target + 0.1 ? speed : zoom < target - 0.1 ? -speed : 0;
}

/**
 * Pans toward the path end for 60–90 ms every 500 ms. Never zooms, never rotates, never holds.
 * The pulse length is seeded per beat, so it is a rhythm, not a reaction.
 */
function metronome(seed: number): Policy {
  return {
    act({ state }) {
      const beat = Math.floor(state.tick / metronomePeriodTicks);
      const pulseTicks = Math.round(seededRange(seed, beat, 60, 90) / 1000 * TUNING.tickRate);
      if (state.tick % metronomePeriodTicks >= pulseTicks) return NEUTRAL_INPUT;
      const end = state.path.at(-1) ?? state.camera;
      const dx = end.x - state.camera.x;
      const dz = end.z - state.camera.z;
      const length = Math.hypot(dx, dz) || 1;
      return { ...NEUTRAL_INPUT, panX: Math.round(dx / length * 127), panZ: Math.round(dz / length * 127) };
    },
  };
}

/**
 * Tracker that meets each open shot-list gate mechanically: zoom 40 for defang, 24 for portrait.
 * It reads the HUD gate text only, never hazards.
 */
function gatekeeper(tuning: BotTuning): Policy {
  return {
    act({ state, gate }) {
      const target = (gate === 'defang' ? 40 : 24) * tuning.aim;
      return {
        ...NEUTRAL_INPUT,
        panX: pan(state.talent.x - state.camera.x),
        panZ: pan(state.talent.z - state.camera.z),
        zoom: zoomToward(state.camera.zoom, target, gate ? 64 : 32),
      };
    },
  };
}

function legacy(bot: 'adaptive' | 'tracker' | 'wide' | 'close' | 'chaos', seed: number, tuning: BotTuning): Policy {
  const random = mulberry32((seed ^ 0xb07b07) >>> 0);
  return { act: ({ state }) => inputForBot(state, bot, random, tuning.aim) };
}

/**
 * Delays what the bot knows about the world by `reactionTicks`, while its own camera stays current
 * (a player feels the stick immediately but reacts to the set late).
 */
function delayed(policy: Policy, reactionTicks: number): Policy {
  if (reactionTicks <= 0) return policy;
  const history: PlayerView[] = [];
  return {
    act(view) {
      history.push(view);
      if (history.length > reactionTicks + 1) history.shift();
      const seen = history[0]!;
      return policy.act({ gate: seen.gate, state: { ...seen.state, camera: view.state.camera, tick: view.state.tick } });
    },
  };
}

export function createPolicy(bot: BalanceBot, seed: number, tuning: BotTuning = exact): Policy {
  const base = bot === 'metronome' ? metronome(seed) : bot === 'gatekeeper' ? gatekeeper(tuning) : legacy(bot, seed, tuning);
  return delayed(base, tuning.reactionTicks);
}

/** `jitter(bot, k)`: variant v of seed s gets a seeded 150–300 ms reaction delay and ±5% gate aim noise. */
export function jitterTuning(seed: number, variant: number): BotTuning {
  const key = (Math.imul(seed, 0x85ebca6b) ^ Math.imul(variant + 1, 0xc2b2ae35)) >>> 0;
  return {
    reactionTicks: Math.round(seededRange(key, 0, 150, 300) / 1000 * TUNING.tickRate),
    aim: 1 + seededRange(key, 1, -0.05, 0.05),
  };
}

/** A driver: feeds each tick's state through a fresh observer into the policy. */
export function createDriver(bot: BalanceBot, seed: number, tuning: BotTuning = exact): (state: SimState) => InputFrame {
  const observe = createObserver();
  const policy = createPolicy(bot, seed, tuning);
  return (state) => policy.act(observe(state));
}
