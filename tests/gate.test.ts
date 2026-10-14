import { describe, expect, it } from 'vitest';
import { createDriver } from '../src/bots/balance-bots';
import { decodeReplay, encodeReplay } from '../src/replay/codec';
import { stateHash } from '../src/sim/hash';
import { frameView, type GateId } from '../src/sim/lenses';
import { createShootState, stepShoot } from '../src/sim/shoot';
import { NEUTRAL_INPUT, step } from '../src/sim/step';
import { TUNING } from '../src/sim/tuning';
import { createState } from '../src/sim/world';
import type { SimState } from '../src/sim/types';

// Golden hashes per gate (DECISIONS 2026-10-14, phone frame). Square values equal main before gates existed;
// change portrait values only deliberately, with a DECISIONS entry.
const GOLDEN: Record<GateId, Record<number, [string, string]>> = {
  square: { 1: ['c1fc28e4', 'c75d948d'], 19: ['581c7b32', '0fb14bd5'], 2026: ['11a5d388', '6ca7bec8'] },
  portrait: { 1: ['82510f60', '309938d9'], 19: ['b6d8bd9e', '7b742fbd'], 2026: ['5eaf0fac', 'fd19b5f9'] },
};

function withGate(state: SimState, gate: GateId) {
  if (gate !== 'square') state.gate = gate;
  return state;
}

describe('viewfinder gate', () => {
  it('keeps the square frame identical to the lens frame and makes portrait 2:3', () => {
    expect(frameView('35mm', undefined, 20)).toEqual({ zoom: 20, aspect: 1 });
    expect(frameView('anamorphic', 'portrait', 20)).toEqual({ zoom: 20, aspect: 2.39 });
    const portrait = frameView('35mm', 'portrait', 20);
    expect(portrait.zoom * portrait.aspect).toBeCloseTo(20);
    expect(portrait.aspect).toBeCloseTo(2 / 3);
  });

  for (const gate of ['square', 'portrait'] as const) {
    it(`matches the ${gate} golden hashes for strip and Shoot`, () => {
      for (const seed of [1, 19, 2026]) {
        let strip = withGate(createState(seed), gate);
        for (let i = 0; i < 3000; i++) strip = step(strip, { ...NEUTRAL_INPUT, panX: i % 240 < 120 ? 30 : -30, zoom: i % 300 < 150 ? 0 : 1 });
        // A fair touch player through the whole Shoot: what is framed (and so cut, lost or survived) depends on the gate.
        const drive = createDriver('human-touch', seed);
        let shoot = withGate(createShootState(seed), gate);
        for (let i = 0; i < 8 * 60 * TUNING.tickRate && !shoot.failed && (shoot.shoot?.sceneIndex ?? 0) < 3; i++) shoot = stepShoot(shoot, drive(shoot));
        expect([stateHash(strip), stateHash(shoot)]).toEqual(GOLDEN[gate][seed]);
      }
    }, 120_000);
  }

  it('records a non-square gate in the replay and keeps square replays at v1/v2', () => {
    const frames = [NEUTRAL_INPUT, { ...NEUTRAL_INPUT, panX: 20 }];
    expect(decodeReplay(encodeReplay(7, frames, '35mm', 'portrait'))).toEqual({ seed: 7, frames, lens: '35mm', gate: 'portrait' });
    expect(encodeReplay(7, frames, '35mm', 'square')).toBe(encodeReplay(7, frames));
    expect(decodeReplay(encodeReplay(7, frames)).gate).toBeUndefined();
  });
});
