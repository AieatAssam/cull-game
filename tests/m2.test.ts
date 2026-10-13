import { describe, expect, it } from 'vitest';
import { createDriver } from '../src/bots/balance-bots';
import { cutFraming } from '../src/bots/players';
import { generateScene, pathZAt, sharpTurns } from '../src/gen/generate';
import { gateCast, gateStop, markShots, shotListForPath } from '../src/sim/framing';
import { stateHash } from '../src/sim/hash';
import { createShootState, stepShoot } from '../src/sim/shoot';
import { NEUTRAL_INPUT, step } from '../src/sim/step';
import { TUNING } from '../src/sim/tuning';
import { createGeneratedState, createState } from '../src/sim/world';
import type { CastEntity, SimState } from '../src/sim/types';

const held = { ...NEUTRAL_INPUT, hold: true };
const cast = (id: string, kind: CastEntity['kind'], x: number, z: number, extra: Partial<CastEntity> = {}): CastEntity =>
  ({ id, kind, x, z, vx: 0, vz: 0, spawned: true, cut: false, age: 0, ...extra });

/** A straight 0..100 set with a defang gate at 20 and its stand-in, Talent walking in from 0. */
function gateFixture(): SimState {
  const state = createState(1, []);
  state.path = [{ x: 0, z: 0 }, { x: 100, z: 0 }];
  state.forks = [];
  state.shots = [{ at: 20, kind: 'defang', done: false }, { at: 50, kind: 'portrait', done: false }];
  state.entities = gateCast(state.path, state.shots);
  return state;
}

describe('bible M2: defang needs a close cut made since the gate opened', () => {
  it('ignores zoom alone and close cuts made before the gate opened', () => {
    const state = gateFixture();
    state.closeCalls = 3;
    state.camera.zoom = 48;
    state.talent.x = 19.7;
    state.camera.x = 19.7;
    markShots(state);
    expect(state.shots![0]).toMatchObject({ done: false, opened: 3 });
    markShots(state);
    expect(state.shots![0]!.done).toBe(false);
    state.closeCalls = 4;
    markShots(state);
    expect(state.shots![0]!.done).toBe(true);
    // The stand-in leaves its mark once the shot is made.
    expect(state.entities.find((entity) => entity.gate === 0)?.cut).toBe(true);
  });

  it('puts the stand-in inside the close-call radius but out of reach of the held Talent', () => {
    const path = [{ x: 0, z: 0 }, { x: 10, z: 5 }, { x: 40, z: -3 }];
    const shots = shotListForPath(path, 7);
    const [standIn] = gateCast(path, shots);
    const stop = gateStop(path, shots[0]!.at);
    const reach = Math.hypot(standIn!.x - stop.x, standIn!.z - stop.z);
    expect(reach).toBeCloseTo(TUNING.gateMarkDistance);
    expect(reach + 3.6 / TUNING.tickRate).toBeLessThanOrEqual(TUNING.closeCallRadius);
    expect(reach - 3.6 / TUNING.tickRate).toBeGreaterThan(TUNING.urchinRadius + TUNING.talentRadii[2]);
  });

  it('only lets the stand-in be cut once its shot is called; framed out earlier it is unloaded intact', () => {
    let state = gateFixture();
    state.camera.x = 21;
    state = step(state, held);
    expect(state.entities[0]!.spawned).toBe(true);
    state.camera.x = -40;
    state = step(state, held);
    expect(state.entities[0]).toMatchObject({ spawned: false, cut: false });
    expect(state.cuts).not.toContain('gate-urchin-0');
  });

  it('can be cleared by a player who frames the stand-in out close', () => {
    let state = gateFixture();
    state.camera.zoom = 24;
    for (let i = 0; i < 1200 && !state.waiting; i++) state = step(state, { ...NEUTRAL_INPUT, panX: Math.sign(state.talent.x - state.camera.x) * 127 });
    expect(state.waiting).toBe(true);
    state.camera.x = state.talent.x - state.camera.zoom / 2 + 0.2;
    state.camera.vx = 0;
    state = step(state, held);
    state = step(state, held);
    expect(state.shots![0]!.done).toBe(true);
    expect(state.failed).toBeNull();
  });
});

describe('bible M2: seeded gate positions', () => {
  it('seeds gate positions per scene and keeps them off fork detours and away from Glass', () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const state = createGeneratedState(seed, 0);
      const [defang, portrait] = state.shots!;
      positions.add(Math.round(defang!.at));
      expect(portrait!.at).toBeGreaterThan(defang!.at);
      const stop = defang!.at - 0.35;
      for (const fork of state.forks) {
        const from = state.path[fork.at]!.x;
        const to = state.path[fork.at + 2]?.x ?? Infinity;
        expect(stop + TUNING.gateMarkDistance < from || stop > to).toBe(true);
      }
      for (const glass of state.entities.filter((entity) => entity.kind === 'glass')) {
        expect(glass.x < stop - 3 || glass.x > stop + TUNING.glassShatterRadius).toBe(true);
      }
    }
    expect(positions.size).toBeGreaterThan(10);
  });
});

describe('bible M2: readable hazards', () => {
  it('sends at least half the Urchins in ahead on the walked path, rolling down it', () => {
    let urchins = 0;
    let ahead = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const scene = generateScene(seed, 0);
      for (const entity of scene.entities.filter((item) => item.kind === 'urchin')) {
        urchins++;
        if (!entity.pathBound) continue;
        ahead++;
        expect(entity.z).toBeCloseTo(pathZAt(scene.path, entity.x));
      }
    }
    expect(ahead / urchins).toBeGreaterThanOrEqual(0.5);
    const state = createState(1, []);
    state.path = [{ x: 0, z: 0 }, { x: 10, z: 10 }];
    state.camera.x = 6;
    state.camera.z = 6;
    state.talent.x = -20;
    state.entities = [cast('u', 'urchin', 8, 8, { vx: -TUNING.urchinSpeed, pathBound: true })];
    const next = step(state, held);
    expect(next.entities[0]!.z).toBeCloseTo(next.entities[0]!.x);
  });

  it('tramples only on contact with a visible crowd member, not an invisible disc', () => {
    const state = createState(1, []);
    state.camera.zoom = 48;
    state.talent.lodTier = 2;
    // Crowd centre 1.5 u away (inside the old 2 u disc), every member on the far side.
    state.entities = [cast('crowd', 'extras', 1.5, 0, { members: [{ dx: 1.6, dz: 0, vx: 0, vz: 0, cut: false }, { dx: 1.8, dz: 0.5, vx: 0, vz: 0, cut: false }] })];
    expect(step(state, held).failed).toBeNull();
    state.entities[0]!.members![0]!.dx = -1.2;
    expect(step(state, held).failed).toBe('hit');
  });

  it('keeps the Wrap strike line behind the Talent on a winding path', () => {
    // Winding first, straight after: a linear x-to-length scale puts the strike line ahead of the Talent here.
    const state = createShootState(5);
    state.shoot!.sceneIndex = 3;
    state.path = [...Array.from({ length: 16 }, (_, i) => ({ x: i * 2, z: i % 2 ? 6 : -6 })), { x: 60, z: -6 }];
    const arc = state.path.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - state.path[i]!.x, point.z - state.path[i]!.z), 0) - 10;
    state.talent = { ...state.talent, x: 50, z: -6, pathIndex: 15, lodTier: 1 };
    state.travelDistance = arc;
    state.shoot!.wrapDistance = arc - 1;
    state.camera = { ...state.camera, x: 50, z: -6, zoom: 24 };
    state.entities = [cast('floor', 'glass', 50.4, -6)];
    const next = step(state, held);
    expect(next.entities[0]!.cut).toBe(false);
    expect(next.failed).toBeNull();
  });
});

describe('bible M2 round 2: Night/finale pressure and turning paths', () => {
  const sceneSeed = (seed: number, index: number) => (seed + Math.imul(index, 0x9e3779b9)) >>> 0;

  it('gives every scene at least two heading changes of 90° without breaking the threat budget', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (let index = 0; index < 4; index++) {
        const scene = generateScene(sceneSeed(seed, index), index, 9);
        expect(sharpTurns(scene.path)).toBeGreaterThanOrEqual(TUNING.minimumSharpTurns);
        expect(scene.threatSpent).toBeLessThanOrEqual(scene.threatBudget);
        expect(scene.forks.length).toBeGreaterThan(0);
      }
      expect(sharpTurns(generateScene(seed, 0).path)).toBeGreaterThanOrEqual(TUNING.minimumSharpTurns);
    }
  });

  it('makes Night/finale Urchins denser, faster and already rolling once announced; Backlot and City are unchanged', () => {
    const share = (difficulty: number) => {
      let urchins = 0;
      let ahead = 0;
      for (let seed = 1; seed <= 200; seed++) {
        for (const entity of generateScene(sceneSeed(seed, difficulty), difficulty, 9).entities.filter((item) => item.kind === 'urchin')) {
          urchins++;
          if (entity.pathBound) ahead++;
          expect(entity.vx).toBe(-TUNING.urchinSpeedByDifficulty[difficulty]!);
          expect(Boolean(entity.rollsIn)).toBe(Boolean(entity.pathBound) && difficulty >= TUNING.rollingEntryFromDifficulty);
        }
      }
      return ahead / urchins;
    };
    expect(share(0)).toBeGreaterThanOrEqual(0.5);
    expect(share(2)).toBeGreaterThan(share(0));
    expect(TUNING.urchinSpeedByDifficulty[0]).toBe(TUNING.urchinSpeed);
    expect(TUNING.urchinSpeedByDifficulty[2]).toBeGreaterThan(TUNING.urchinSpeed);
  });

  it('rolls an announced Night Urchin toward the frame, but not one off the call sheet or one that waits for its frame', () => {
    const build = (x: number, rollsIn: boolean) => {
      const state = createState(1, []);
      state.path = [{ x: -40, z: 0 }, { x: 60, z: 0 }];
      state.camera.zoom = 24;
      state.entities = [cast('u', 'urchin', x, 0, { spawned: false, vx: -4.4, pathBound: true, rollsIn })];
      return state;
    };
    // Just past the gate edge (12 u at zoom 24): listed as "Coming in", so it is already rolling.
    expect(step(build(14, true), held).entities[0]!.x).toBeLessThan(14);
    expect(step(build(14, false), held).entities[0]!.x).toBe(14);
    // Far off the call sheet: nothing moves.
    expect(step(build(40, true), held).entities[0]!.x).toBe(40);
  });
});

describe('bible M2: Adaptive policy helpers', () => {
  it('finds a framing that cuts a target while the Talent stays in frame', () => {
    const state = createState(1, []);
    state.camera.zoom = 24;
    const framing = cutFraming(state, { x: 1.4, z: 0 }, TUNING.urchinRadius, 0.8)!;
    expect(framing.axis).toBe('x');
    const edge = framing.value + state.camera.zoom / 2;
    expect(edge).toBeGreaterThanOrEqual(-TUNING.talentRadii[1]);
    expect(edge).toBeLessThan(1.4 - TUNING.urchinRadius);
  });
});

// Fixed replay hashes after the bible M2 rule changes (DECISIONS 2026-10-13, round 2) and the graded out-of-frame rule (DECISIONS 2026-10-13, LOST HER). Regenerate only with a decision entry.
describe('fixed replay hashes', () => {
  const frames = Array.from({ length: 10_000 }, (_, i) => ({ ...NEUTRAL_INPUT, panX: (i % 240 < 120 ? 30 : -30), zoom: i % 300 < 150 ? 0 : 1 }));
  const fixtures: Record<number, [string, string, string]> = {
    1: ['4500bdc4', '4339a9ff', '6ebb4e8c'],
    19: ['5f4a7114', 'af0d6135', 'ce00d1c4'],
    2026: ['ec251869', '85774155', '38027c06'],
  };
  it.each(Object.entries(fixtures))('seed %s: strip world, generated strip and a full fair Adaptive Shoot', (seedText, [world, generated, shoot]) => {
    const seed = Number(seedText);
    let a = createState(seed);
    for (const frame of frames) a = step(a, frame);
    expect(stateHash(a)).toBe(world);
    let g = createGeneratedState(seed, 0);
    for (const frame of frames.slice(0, 3000)) g = step(g, frame);
    expect(stateHash(g)).toBe(generated);
    const drive = createDriver('adaptive', seed);
    let s = createShootState(seed);
    for (let i = 0; i < 8 * 60 * TUNING.tickRate && !s.failed; i++) s = stepShoot(s, drive(s));
    expect(s.shoot!.sceneIndex).toBe(3);
    expect(stateHash(s)).toBe(shoot);
  }, 60_000);
});
