import type { SimState } from './types';

export function stateHash(state: SimState): string {
  const normalized = JSON.stringify({
    tick: state.tick,
    camera: [state.camera.x, state.camera.z, state.camera.vx, state.camera.vz, state.camera.zoom, state.camera.yaw, state.camera.yawTarget, state.camera.rotationTicksRemaining].map(q),
    talent: [state.talent.x, state.talent.z, state.talent.offscreenTicks, state.talent.pathIndex].map(q),
    entities: state.entities.map((e) => [e.id, q(e.x), q(e.z), e.spawned, e.cut, e.age]),
    routeChoices: state.routeChoices,
    consumed: state.consumed,
    film: q(state.film), failed: state.failed, score: state.score, cuts: state.cuts,
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) hash = Math.imul(hash ^ normalized.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function q(n: number) { return Math.round(n * 1e6) / 1e6; }
