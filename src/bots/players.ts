import { createState } from '../sim/world';
import { step } from '../sim/step';
import type { InputFrame, SimState } from '../sim/types';

export type BotKind = 'tracker' | 'smart';
function botInput(state: SimState, bot: BotKind): InputFrame {
  let targetX = state.talent.x;
  let targetZ = state.talent.z;
  let zoom = 0;
  if (bot === 'smart') {
    const threat = state.entities
      .filter((entity) => !entity.cut && (entity.kind === 'boulder' || entity.kind === 'urchin'))
      .sort((a, b) => Math.hypot(a.x - state.talent.x, a.z - state.talent.z) - Math.hypot(b.x - state.talent.x, b.z - state.talent.z))[0];
    if (threat) {
      const threatDistance = Math.hypot(threat.x - state.talent.x, threat.z - state.talent.z);
      if (threatDistance < 11) {
        const side = Math.sign(threat.x - state.talent.x) || Math.sign(threat.vx) * -1 || 1;
        targetX = state.talent.x - side * state.camera.zoom * 0.38;
        if (threat.kind === 'urchin' && state.camera.zoom < 30) zoom = -100;
      }
    }
  }
  const dx = targetX - state.camera.x;
  const dz = targetZ - state.camera.z;
  const panX = Math.abs(dx) > 1.2 ? Math.sign(dx) * 90 : 0;
  const panZ = Math.abs(dz) > 1.2 ? Math.sign(dz) * 90 : 0;
  return { panX, panZ, zoom, rotate: 0, hold: false, steady: false };
}
export function play(seed: number, bot: BotKind, maxTicks = 90 * 60): SimState {
  let state = createState(seed);
  for (let i = 0; i < maxTicks && !state.failed; i++) state = step(state, botInput(state, bot));
  return state;
}

export function compareBots(runs = 20) {
  let tracker = 0;
  let smart = 0;
  for (let seed = 1; seed <= runs; seed++) {
    tracker += play(seed, 'tracker').talent.x;
    smart += play(seed, 'smart').talent.x;
  }
  return { runs, trackerDistance: tracker / runs, smartDistance: smart / runs, advantage: tracker > 0 ? smart / tracker : 0 };
}
