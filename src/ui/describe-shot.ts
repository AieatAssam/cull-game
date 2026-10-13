import { activeShot } from '../sim/framing';
import { inFrame } from '../sim/frame';
import { lodTier } from '../sim/lod';
import { lensAspect } from '../sim/lenses';
import { TUNING } from '../sim/tuning';
import type { CastEntity, EntityKind, SimState } from '../sim/types';

export const SHOTS = ['Close-up', 'Medium shot', 'Wide shot', 'Stand-in', 'Gone'] as const;
export const COACH_LINES = [
  'She walks on her own. Keep her in the shot.',
  'Zoom out and the spikes go dull, but only a close cut clears a defang mark. Zoom in to grab a film reel.',
  'Push a hazard past the frame edge to cut it. A close cut scores more.',
] as const;

const URCHIN_STATE = ['spikes sharp', 'spikes sharp', 'spikes dull', 'a block', 'gone'] as const;
const URCHIN_LINE = [
  'The spikes are sharp.',
  'The spikes are sharp.',
  'The spikes are dull.',
  'It is only a block.',
  'The spiny ball is gone.',
] as const;

const HAZARDS = new Set<EntityKind>(['urchin', 'boulder', 'glass', 'extras', 'swarm', 'stagehand', 'bridge', 'rumour', 'red-monitor']);

export interface HazardCopy { id: string; kind: EntityKind; state: string; }
export interface ShotCopy {
  shot: (typeof SHOTS)[number];
  hazards: HazardCopy[];
  gate: string;
  toast: string;
  coach: readonly string[];
}

function talentTier(state: SimState) {
  return state.talent.lodTier ?? lodTier(1000 / state.camera.zoom);
}

function hazardTier(state: SimState, entity: CastEntity) {
  if (entity.lodTier !== undefined) return entity.lodTier;
  const radius = entity.kind === 'urchin' ? TUNING.urchinRadius
    : entity.kind === 'boulder' ? TUNING.boulderRadius
      : entity.kind === 'swarm' ? TUNING.swarmRadius
        : 0.55;
  const size = entity.kind === 'bridge' || entity.kind === 'extras' ? 1000 / state.camera.zoom : radius * 1000 / state.camera.zoom;
  return lodTier(size);
}

function hazardState(kind: EntityKind, tier: number) {
  if (kind === 'urchin') return URCHIN_STATE[tier] ?? 'gone';
  if (kind === 'boulder') return tier <= 0 ? 'rolling' : 'a prop';
  if (kind === 'extras') return tier >= 2 ? 'a wall' : 'milling';
  if (kind === 'swarm') return tier >= 4 ? 'gone' : 'moths';
  if (kind === 'bridge') return tier >= 2 ? 'ropes' : 'planks';
  if (kind === 'glass') return 'glass';
  if (kind === 'rumour') return 'smoke';
  if (kind === 'red-monitor') return 'hostile';
  return 'still';
}

function urchinInShot(state: SimState, urchin: CastEntity) {
  return inFrame(
    urchin.x, urchin.z, TUNING.urchinRadius,
    state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw,
    0.8, lensAspect(state.lens),
    state.lens === 'tilt-shift' ? state.camera.focusOffset : null,
    state.lens === 'fisheye',
  );
}

/** Talent shot size, hazard states, and the gate/toast copy. Shot-size words name only the Talent. */
export function describeShot(state: SimState): ShotCopy {
  const shot = SHOTS[talentTier(state)] ?? 'Gone';
  const hazards = state.entities
    .filter((entity) => entity.spawned && !entity.cut && HAZARDS.has(entity.kind))
    .map((entity) => ({ id: entity.id, kind: entity.kind, state: hazardState(entity.kind, hazardTier(state, entity)) }));
  const urchin = state.entities.find((entity) => entity.kind === 'urchin' && entity.spawned && !entity.cut);
  const urchinTier = urchin ? hazardTier(state, urchin) : 0;
  const urchinState = urchin ? hazardState('urchin', urchinTier) : null;
  const gate = urchinState ? `${shot} · ${urchinState}` : shot;
  const goal = state.failed ? undefined : activeShot(state);
  let toast = 'Keep her in the shot.';
  if (state.failed === 'wrapped') toast = "That's a wrap.";
  else if (state.failed) toast = 'The take is over.';
  else if (goal?.kind === 'defang') toast = 'Shot list: defang. Cut the spiny ball close to her, past the frame edge. Zooming out will not clear it.';
  else if (goal?.kind === 'portrait') toast = 'Shot list: come in closer on her.';
  else if (urchin && urchinState !== 'gone' && urchinInShot(state, urchin)) toast = `${shot}. ${URCHIN_LINE[urchinTier] ?? URCHIN_LINE[4]}`;
  return { shot, hazards, gate, toast, coach: COACH_LINES };
}

export function coachIndex(elapsedMs: number): number | null {
  if (!(elapsedMs >= 0) || elapsedMs > 20_000) return null;
  if (elapsedMs < 7_000) return 0;
  if (elapsedMs < 14_000) return 1;
  return 2;
}

export function closeCallsForGrade(state: SimState) {
  return state.closeCalls;
}
