import { thirdsDistance } from '../meta/grade';
import { frameView } from '../sim/lenses';
import { step } from '../sim/step';
import { stepShoot } from '../sim/shoot';
import type { InputFrame, SimState } from '../sim/types';

export interface ReplayContactFrame {
  state: SimState;
  label: string;
  tick: number;
  rank: number;
}

function snapshot(state: SimState, label: string, rank: number): ReplayContactFrame {
  // Sim steps copy all mutable state before changing it, so this past state stays immutable.
  return { state, label, tick: state.tick, rank };
}

/** Replay an input stream and deterministically select the same editorial moments. */
export async function selectReplayContactFrames(initial: SimState, inputs: readonly InputFrame[], terminalState?: SimState) {
  let state = initial;
  let bestThirdsDistance = Number.POSITIVE_INFINITY;
  let bestThirds: ReplayContactFrame | undefined;
  let opening: ReplayContactFrame | undefined;
  let fatal: ReplayContactFrame | undefined;
  const closeCalls: ReplayContactFrame[] = [];
  const samples: ReplayContactFrame[] = [];

  for (let index = 0; index < inputs.length; index++) {
    const input = inputs[index]!;
    if (state.failed) break;
    const previousTalent = { x: state.talent.x, z: state.talent.z };
    const beforeEntities = new Map(state.entities.filter((entity) => !entity.cut).map((entity) => [entity.id, entity]));
    state = state.shoot ? stepShoot(state, input) : step(state, input);
    const cutIds = new Set(state.cuts);
    const closeRanks = [...beforeEntities.values()]
      .filter((entity) => cutIds.has(entity.id)
        && !['reel', 'monitor', 'red-monitor', 'continuity'].includes(entity.kind))
      .map((entity) => Math.hypot(entity.x - previousTalent.x, entity.z - previousTalent.z))
      .filter((distance) => distance <= 1.5);
    const closeRank = closeRanks.length ? Math.min(...closeRanks) : undefined;
    const thirds = thirdsDistance(state.talent.x, state.talent.z, state.camera.x, state.camera.z,
      frameView(state.lens, state.gate, state.camera.zoom).zoom, state.camera.yaw, frameView(state.lens, state.gate, state.camera.zoom).aspect);
    const isBestThirds = thirds < bestThirdsDistance;
    if (isBestThirds) bestThirdsDistance = thirds;

    if (state.tick === 1) opening = snapshot(state, 'Opening', thirds);
    else if (closeRank !== undefined) {
      closeCalls.push(snapshot(state, 'Close call', closeRank));
      closeCalls.sort((a, b) => a.rank - b.rank);
      closeCalls.splice(3);
    } else if (isBestThirds) bestThirds = snapshot(state, 'Best thirds', thirds);
    else if (state.failed) fatal = snapshot(state, 'Fatal frame', thirds);
    else if (state.tick % 300 === 0) {
      samples.push(snapshot(state, `Take · ${Math.floor(state.totalDistance)} m`, thirds));
      if (samples.length > 10) samples.shift();
    }
    if (state.failed) break;
    if (index > 0 && index % 240 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  // Debug and assisted endings can be forced without a simulation input. Keep their
  // actual final state as the terminal image while still replaying all recorded play.
  if (!state.failed && terminalState?.failed) {
    state = terminalState;
    fatal = snapshot(state, 'Fatal frame', thirdsDistance(state.talent.x, state.talent.z,
      state.camera.x, state.camera.z, frameView(state.lens, state.gate, state.camera.zoom).zoom, state.camera.yaw, frameView(state.lens, state.gate, state.camera.zoom).aspect));
  }
  const frames: ReplayContactFrame[] = [];
  const add = (frame?: ReplayContactFrame) => { if (frame && !frames.includes(frame) && frames.length < 9) frames.push(frame); };
  add(opening);
  closeCalls.forEach(add);
  add(bestThirds);
  add(fatal);
  for (const index of [0, Math.floor(samples.length / 2), samples.length - 1]) add(samples[index]);
  for (const frame of samples) add(frame);
  return { frames, finalState: state };
}
