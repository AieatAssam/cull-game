import { describe, expect, it } from 'vitest';
import { play } from '../src/bots/players';
import { step } from '../src/sim/step';
import type { SimState } from '../src/sim/types';
import { createState } from '../src/sim/world';
import { SHOTS, closeCallsForGrade, coachIndex, describeShot } from '../src/ui/describe-shot';

function take(patch: Partial<Omit<SimState, 'talent' | 'camera'>> & { talent?: Partial<SimState['talent']>; camera?: Partial<SimState['camera']> } = {}): SimState {
  const camera = { x: 0, z: 0, vx: 0, vz: 0, zoom: 30, yaw: 0, yawTarget: 0, rotationTicksRemaining: 0, moving: false, focusOffset: 0, ...patch.camera };
  const talent = { x: 0, z: 0, offscreenTicks: 0, pathIndex: 0, lodTier: 1 as const, ...patch.talent };
  return {
    seed: 1, lens: '35mm', tick: 0, travelDistance: 0, totalDistance: 0,
    path: [], tiles: [], forks: [], routeChoices: {}, entities: [],
    consumed: [], film: 90, waiting: false, failed: null, score: 0, cuts: [], closeCalls: 0,
    ...patch, camera, talent,
  };
}

function namedShots(text: string) {
  return SHOTS.filter((shot) => text.includes(shot));
}

describe('describeShot', () => {
  it('names one shot size for every talent and urchin tier', () => {
    for (const talentTier of [0, 1, 2, 3, 4]) {
      for (const urchinTier of [0, 1, 2, 3, 4]) {
        const copy = describeShot(take({
          talent: talentTier === 4 ? { lodTier: undefined } : { lodTier: talentTier as 0 | 1 | 2 | 3 },
          camera: talentTier === 4 ? { zoom: 400 } : { zoom: 30 },
          entities: [{ id: 'u', kind: 'urchin', x: 0, z: 0, vx: 0, vz: 0, spawned: true, cut: false, age: 0, lodTier: urchinTier as 0 | 1 | 2 | 3 | 4 }],
        }));
        const shot = talentTier === 4 ? 'Gone' : SHOTS[talentTier];
        expect(copy.shot).toBe(shot);
        expect(copy.gate.startsWith(shot!)).toBe(true);
        expect(namedShots(copy.hazards.map((hazard) => hazard.state).join(' '))).toEqual([]);
        expect(namedShots(copy.gate)).toEqual([shot]);
        const toastShots = namedShots(copy.toast);
        expect(toastShots.every((name) => name === shot)).toBe(true);
      }
    }
  });

  it('keeps shot-list and coach lines off a second shot size', () => {
    const wide = take({
      talent: { lodTier: 2, x: 40 },
      shots: [{ at: 10, kind: 'portrait', done: false }],
      entities: [{ id: 'u', kind: 'urchin', x: 0, z: 0, vx: 0, vz: 0, spawned: true, cut: false, age: 0, lodTier: 0 }],
    });
    expect(describeShot(wide).toast).toBe('Shot list: come in closer on her.');
    expect(describeShot(wide).gate).toContain('Wide shot');
    const defang = describeShot(take({ talent: { x: 40, lodTier: 1 }, shots: [{ at: 10, kind: 'defang', done: false }] }));
    expect(namedShots(defang.toast)).toEqual([]);
    const lines = describeShot(take()).coach;
    expect([coachIndex(0), coachIndex(7_000), coachIndex(14_000)].map((index) => lines[index!])).toEqual([...lines]);
    expect(coachIndex(20_001)).toBeNull();
  });

  it('grades close calls from the sim on 200 bot runs', () => {
    const cut = createState(1, [{ id: 'u', kind: 'urchin', x: -1, z: 0, vx: 0, vz: 0, spawned: true, cut: false, age: 1 }]);
    cut.camera.x = 8;
    cut.camera.zoom = 12;
    const after = step(cut, { panX: 0, panZ: 0, zoom: 0, rotate: 0, hold: true, steady: true });
    expect(after.closeCalls).toBeGreaterThan(0);
    expect(closeCallsForGrade(after)).toBe(after.closeCalls);
    for (let seed = 1; seed <= 200; seed++) {
      const state = play(seed, seed % 2 === 0 ? 'adaptive' : 'tracker', 240);
      expect(closeCallsForGrade(state)).toBe(state.closeCalls);
    }
  });
});
