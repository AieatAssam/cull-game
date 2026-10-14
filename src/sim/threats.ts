import { inFrame } from './frame';
import { exitHeading } from './framing';
import { lensAspect } from './lenses';
import { monitorConeContains } from './m6';
import { TUNING } from './tuning';
import type { CastEntity, EntityKind, SimState } from './types';

/** An off-frame hazard closing on her, for the HUD's edge indicators (and the bots, which see only what the HUD shows). */
export interface Threat {
  id: string;
  kind: EntityKind;
  /** Unit vector from her to it (world x/z). */
  direction: { x: number; z: number };
  /** Centre-to-centre distance from her. */
  distance: number;
  /** Seconds until contact at the current closing speed. */
  timeToContact: number;
}

const THREAT_KINDS: ReadonlySet<EntityKind> = new Set<EntityKind>(['urchin', 'boulder', 'extras', 'swarm', 'stagehand']);

const contactRadius = (entity: CastEntity) => entity.kind === 'boulder' ? TUNING.boulderRadius : entity.kind === 'urchin' ? TUNING.urchinRadius
  : entity.kind === 'swarm' ? TUNING.swarmRadius : entity.kind === 'extras' ? TUNING.extrasRadius : 0.55;

function onScreen(state: SimState, entity: CastEntity): boolean {
  const { camera } = state;
  const inMonitor = state.entities.some((monitor) => monitor.kind === 'monitor' && monitor.spawned && !monitor.cut
    && monitorConeContains({ origin: { x: monitor.x, z: monitor.z }, heading: monitor.heading ?? 0, range: monitor.range ?? 0, halfAngle: monitor.halfAngle ?? 0 }, entity));
  if (inMonitor) return true;
  const framed = (x: number, z: number, radius: number, height: number) => inFrame(x, z, radius, camera.x, camera.z, camera.zoom, camera.yaw, height,
    lensAspect(state.lens), state.lens === 'tilt-shift' ? camera.focusOffset : null, state.lens === 'fisheye');
  if (entity.kind === 'extras' && entity.members) return entity.members.some((member) => !member.cut && framed(entity.x + member.dx, entity.z + member.dz, TUNING.extrasMemberRadius, 0.5));
  return framed(entity.x, entity.z, contactRadius(entity), entity.kind === 'boulder' ? 1 : 0.8);
}

/**
 * Live hazards fully outside the frame that will reach her within `threatHorizonSeconds`, or already sit within
 * `closeCutRadius` of her (a stand-in on its mark), soonest first. Her velocity is her walk along the path (zero while
 * she waits); theirs is their own roll. Not closing → `timeToContact` is Infinity.
 */
export function offFrameThreats(state: SimState): Threat[] {
  const { talent } = state;
  const heading = state.waiting ? null : exitHeading(state);
  const speed = TUNING.talentSpeeds[Math.min(talent.lodTier ?? 1, 3)]!;
  const tvx = heading ? heading.x * speed : 0;
  const tvz = heading ? heading.z * speed : 0;
  const talentRadius = TUNING.talentRadii[Math.min(talent.lodTier ?? 1, 3)]!;
  const threats: Threat[] = [];
  for (const entity of state.entities) {
    if (entity.cut || !entity.spawned || !THREAT_KINDS.has(entity.kind) || onScreen(state, entity)) continue;
    const dx = entity.x - talent.x;
    const dz = entity.z - talent.z;
    const distance = Math.hypot(dx, dz) || 1e-6;
    // Closing speed along the line between them.
    const closing = ((tvx - entity.vx) * dx + (tvz - entity.vz) * dz) / distance;
    const gap = Math.max(0, distance - contactRadius(entity) - talentRadius);
    const timeToContact = gap === 0 ? 0 : closing > 1e-3 ? gap / closing : Infinity;
    if (timeToContact > TUNING.threatHorizonSeconds && distance > TUNING.closeCutRadius) continue;
    threats.push({ id: entity.id, kind: entity.kind, direction: { x: dx / distance, z: dz / distance }, distance, timeToContact });
  }
  return threats.sort((a, b) => a.timeToContact - b.timeToContact);
}
