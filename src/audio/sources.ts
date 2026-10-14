import { monitorConeContains } from '../sim/m6';
import { inFrame } from '../sim/frame';
import { frameView } from '../sim/lenses';
import { lodTier } from '../sim/lod';
import { TUNING } from '../sim/tuning';
import type { CastEntity, SimState } from '../sim/types';

function radius(entity: CastEntity): number {
  if (entity.kind === 'urchin') return TUNING.urchinRadius;
  if (entity.kind === 'boulder') return TUNING.boulderRadius;
  if (entity.kind === 'swarm') return TUNING.swarmRadius;
  if (entity.kind === 'glass') return 0.8;
  if (entity.kind === 'bridge') return TUNING.bridgeLength / 2;
  if (entity.kind === 'extras') return TUNING.extrasRadius;
  if (entity.kind === 'rumour') return entity.radius ?? 0.5;
  return 0.55;
}

function withinMonitor(state: SimState, x: number, z: number, excludeId?: string): boolean {
  return state.entities.some((entity) => entity.id !== excludeId && entity.kind === 'monitor' && entity.spawned && !entity.cut
    && monitorConeContains({ origin: { x: entity.x, z: entity.z }, heading: entity.heading ?? 0, range: entity.range ?? 0, halfAngle: entity.halfAngle ?? 0 }, { x, z }));
}

function visible(state: SimState, entity: CastEntity): boolean {
  if (!entity.spawned || entity.cut) return false;
  if (entity.kind === 'swarm' && lodTier(TUNING.swarmRadius * 1000 / state.camera.zoom, entity.lodTier) === 4) return false;
  return withinMonitor(state, entity.x, entity.z, entity.id)
    || inFrame(entity.x, entity.z, radius(entity), state.camera.x, state.camera.z, frameView(state.lens, state.gate, state.camera.zoom).zoom, state.camera.yaw, 0.8, frameView(state.lens, state.gate, state.camera.zoom).aspect, state.lens === 'tilt-shift' ? state.camera.focusOffset : null, state.lens === 'fisheye');
}

/** The exact set allowed to create sound this tick, including the Talent as a named source. */
export function audibleSourceIds(state: SimState): string[] {
  const ids = state.entities.filter((entity) => visible(state, entity)).map((entity) => entity.id);
  const talentVisible = withinMonitor(state, state.talent.x, state.talent.z)
    || inFrame(state.talent.x, state.talent.z, TUNING.talentRadii[Math.min(state.talent.lodTier ?? 1, 3)]!, state.camera.x, state.camera.z, frameView(state.lens, state.gate, state.camera.zoom).zoom, state.camera.yaw, 1.4, frameView(state.lens, state.gate, state.camera.zoom).aspect, state.lens === 'tilt-shift' ? state.camera.focusOffset : null, state.lens === 'fisheye');
  if (talentVisible) ids.push('talent');
  return ids.sort();
}
