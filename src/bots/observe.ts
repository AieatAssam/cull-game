import { inFrame, projectPoint } from '../sim/frame';
import { exitHeading, releasing } from '../sim/framing';
import { lensAspect } from '../sim/lenses';
import { monitorConeContains } from '../sim/m6';
import { offFrameThreats, type Threat } from '../sim/threats';
import { TUNING } from '../sim/tuning';
import type { CastEntity, SimState } from '../sim/types';

/**
 * Fair-information view for balance bots (bible §5). A bot may read only what the browser shows:
 * - cast that is on screen (framed, or inside a friendly monitor cone), as `step` decides it;
 * - call-sheet entries: unspawned cast just past the frame edge (`callSheetMargin`), as `main.ts` lists them;
 * - the Talent where it was last seen, its shot size, the camera, film, slate (scene/biome), the set path;
 * - the shot-list gate only while its HUD text is up (the Talent is held at it);
 * - the ACTION exit arrow, only while it is drawn at her feet and she is on screen;
 * - the shutter meter (charge, combo, last CUT result) and the off-frame threat edge indicators (`offFrameThreats`).
 * Everything else (pending spawns elsewhere, cast cut off-screen, gate positions) is stripped.
 */
export interface PlayerView {
  /** A redacted copy of the sim state. Never feed it back into `step`. */
  state: SimState;
  /** The gate the HUD is asking for right now, or null. */
  gate: 'defang' | 'portrait' | null;
  /** The ACTION beat's exit arrow (unit, world x/z) while it is on screen, or null. */
  action?: { x: number; z: number } | null;
  /** Edge indicators: off-frame hazards closing on her (direction from her + time to contact), soonest first. */
  threats: Threat[];
}

const entityRadius = (entity: CastEntity) => entity.kind === 'boulder' ? TUNING.boulderRadius : entity.kind === 'urchin' ? TUNING.urchinRadius
  : entity.kind === 'swarm' ? TUNING.swarmRadius : entity.kind === 'bridge' ? TUNING.bridgeLength / 2 : entity.kind === 'rumour' ? entity.radius ?? 0.5 : 0.55;

function framed(state: SimState, x: number, z: number, radius: number, height: number) {
  const { camera } = state;
  return inFrame(x, z, radius, camera.x, camera.z, camera.zoom, camera.yaw, height, lensAspect(state.lens),
    state.lens === 'tilt-shift' ? camera.focusOffset : null, state.lens === 'fisheye');
}

function inMonitor(state: SimState, x: number, z: number) {
  return state.entities.some((monitor) => monitor.kind === 'monitor' && monitor.spawned && !monitor.cut
    && monitorConeContains({ origin: { x: monitor.x, z: monitor.z }, heading: monitor.heading ?? 0, range: monitor.range ?? 0, halfAngle: monitor.halfAngle ?? 0 }, { x, z }));
}

/** Mirrors `entityInFrame` in `src/sim/step.ts`. */
export function entityOnScreen(state: SimState, entity: CastEntity): boolean {
  if (entity.cut || !entity.spawned) return false;
  if (entity.kind === 'monitor') return true;
  if (inMonitor(state, entity.x, entity.z)) return true;
  if (entity.kind === 'extras' && entity.members) {
    return entity.members.some((member) => !member.cut && framed(state, entity.x + member.dx, entity.z + member.dz, TUNING.extrasMemberRadius, 0.5));
  }
  return framed(state, entity.x, entity.z, entityRadius(entity), entity.kind === 'boulder' ? 1 : 0.8);
}

/** Mirrors `callSheetLines` in `src/main.ts`: "Coming in" entries. */
export function onCallSheet(state: SimState, entity: CastEntity): boolean {
  if (entity.cut || entity.spawned) return false;
  const { camera } = state;
  const projected = projectPoint(entity.x, entity.z, camera.x, camera.z, camera.zoom, camera.yaw, lensAspect(state.lens));
  const outside = Math.max(Math.abs(projected.x), Math.abs(projected.y)) - 0.5;
  return outside >= 0 && outside <= TUNING.callSheetMargin;
}

export function talentOnScreen(state: SimState): boolean {
  const { talent } = state;
  return inMonitor(state, talent.x, talent.z) || framed(state, talent.x, talent.z, TUNING.talentRadii[Math.min(talent.lodTier ?? 1, 3)]!, 1.4);
}

/** Mirrors the HUD toast in `main.ts`: the gate text shows only while the Talent is held at it. */
export function openGate(state: SimState): 'defang' | 'portrait' | null {
  return state.shots?.find((shot) => !shot.done && state.talent.x >= shot.at - 0.35)?.kind ?? null;
}

export type Observer = (state: SimState) => PlayerView;

/** One observer per run: it remembers where the Talent was last seen. */
export function createObserver(): Observer {
  let lastSeen: { x: number; z: number } | null = null;
  return (state) => {
    if (!lastSeen || talentOnScreen(state)) lastSeen = { x: state.talent.x, z: state.talent.z };
    const entities = state.entities
      .filter((entity) => entityOnScreen(state, entity) || onCallSheet(state, entity))
      .map((entity) => ({ ...entity, members: entity.members?.map((member) => ({ ...member })) }));
    const gate = openGate(state);
    const action = releasing(state) && talentOnScreen(state) ? exitHeading(state) : null;
    return {
      gate,
      action,
      threats: offFrameThreats(state),
      state: {
        ...state,
        camera: { ...state.camera },
        talent: { ...state.talent, x: lastSeen.x, z: lastSeen.z },
        shoot: state.shoot ? { ...state.shoot } : undefined,
        shutter: { ...state.shutter },
        entities,
        shots: undefined,
      },
    };
  };
}
