import type { SimState } from './types';

export function stateHash(state: SimState): string {
  const normalized = JSON.stringify({
    lens: state.lens,
    tick: state.tick,
    travelDistance: q(state.travelDistance),
    totalDistance: q(state.totalDistance),
    camera: [state.camera.x, state.camera.z, state.camera.vx, state.camera.vz, state.camera.zoom, state.camera.yaw, state.camera.yawTarget, state.camera.rotationTicksRemaining, state.camera.focusOffset].map(q),
    talent: [state.talent.x, state.talent.z, state.talent.offscreenTicks, state.talent.pathIndex, state.talent.lodTier].map((n) => n === undefined ? -1 : q(n)),
    path: state.path.map((point) => [q(point.x), q(point.z)]),
    tiles: state.tiles.map((tile) => [q(tile.x), q(tile.z), tile.kind]),
    entities: state.entities.map((e) => [e.id, q(e.x), q(e.z), e.spawned, e.cut, e.age, e.lodTier, e.radius === undefined ? null : q(e.radius), e.heading === undefined ? null : q(e.heading), e.range === undefined ? null : q(e.range), e.halfAngle === undefined ? null : q(e.halfAngle), e.propIndex, e.propSequence, e.lockTicks ?? null, e.gate ?? null, e.members?.map((member) => [q(member.dx), q(member.dz), q(member.vx), q(member.vz), member.cut])]),
    routeChoices: state.routeChoices,
    consumed: state.consumed,
    film: q(state.film), failed: state.failed, score: state.score, cuts: state.cuts,
    closeCalls: state.closeCalls ?? 0,
    shots: state.shots?.map((shot) => [q(shot.at), shot.kind, shot.done, shot.opened ?? null]) ?? null,
    shoot: state.shoot ? [state.shoot.sceneIndex, state.shoot.biome, state.shoot.wrapDistance === null ? null : q(state.shoot.wrapDistance), state.shoot.wrapCaught, state.shoot.finaleTicks] : null,
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) hash = Math.imul(hash ^ normalized.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function q(n: number) { return Math.round(n * 1e6) / 1e6; }
