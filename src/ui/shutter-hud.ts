import { projectPoint } from '../sim/frame';
import { lensAspect } from '../sim/lenses';
import type { Threat } from '../sim/threats';
import { TUNING } from '../sim/tuning';
import type { CutResult, SimState } from '../sim/types';

// Shutter HUD copy and geometry (B1 step 2). Pure: reads a CutResult / threat list and returns text and gate positions.

const multiplier = (combo: number) => 1 + TUNING.comboStep * (Math.max(1, combo) - 1);

/** The stamp drawn at one cut hazard: "CLOSE +250 +2s", "CUT +50", "TOO FAR", or "HELD" for a stand-in left on its mark. */
export function cutStampText(hit: CutResult['hits'][number], result: Pick<CutResult, 'combo' | 'penalised'>): string {
  if (hit.held) return 'HELD · CUT CLOSER';
  if (hit.distance === 'too-far') return 'TOO FAR';
  if (result.penalised) return 'CUT';
  if (hit.distance === 'close') return `CLOSE +${Math.round(TUNING.closeCutScore * multiplier(result.combo))} +${TUNING.closeCutFilm}s`;
  return `CUT +${Math.round(TUNING.normalCutScore * multiplier(result.combo))}`;
}

/** The whole-frame banner for a CUT that cost film, or cleared a mark; null when the stamps say it all. */
export function cutBanner(result: CutResult): { text: string; tone: 'bad' | 'good' } | null {
  if (result.penalised) return { text: `SHE'S OUT OF SHOT −${TUNING.penalisedCutFilm}s`, tone: 'bad' };
  if (result.missed) return { text: `MISSED −${TUNING.missedCutFilm}s`, tone: 'bad' };
  if (result.defanged) return { text: 'MARK CLEARED', tone: 'good' };
  return null;
}

/** "TAKE ×3  1,250": the running combo and the take score. */
export function takeReadout(combo: number, score: number): string {
  return `TAKE ×${Math.max(1, combo)}  ${Math.round(score).toLocaleString('en-US')}`;
}

/** Where on the gate (0..1 from its top-left) a world point sits, clamped inside `inset` of the edge. */
export function gatePoint(state: Pick<SimState, 'camera' | 'lens'>, x: number, z: number, inset = 0.08): { left: number; top: number } {
  const at = projectPoint(x, z, state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw, lensAspect(state.lens));
  const clamp = (value: number) => Math.max(inset, Math.min(1 - inset, value));
  return { left: clamp(0.5 + at.x), top: clamp(0.5 + at.y) };
}

export type ThreatUrgency = 'far' | 'near' | 'imminent';
export interface ThreatMarker { id: string; left: number; top: number; angle: number; scale: number; urgency: ThreatUrgency; pulse: boolean; label: string; }

/**
 * One edge arrow per off-frame threat, pinned to the gate edge on the ray from the centre toward it and pointing at it.
 * Size and colour grow as time to contact shrinks; under 1 s it pulses.
 */
export function threatMarkers(state: Pick<SimState, 'camera' | 'lens' | 'talent'>, threats: readonly Threat[]): ThreatMarker[] {
  return threats.map((threat) => {
    const wx = state.talent.x + threat.direction.x * threat.distance;
    const wz = state.talent.z + threat.direction.z * threat.distance;
    const at = projectPoint(wx, wz, state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw, lensAspect(state.lens));
    const angle = Math.atan2(at.y, at.x);
    const reach = 0.44 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
    const ttc = threat.timeToContact;
    const urgency: ThreatUrgency = ttc < 1 ? 'imminent' : ttc < 2.5 ? 'near' : 'far';
    const closeness = Number.isFinite(ttc) ? 1 - Math.min(1, ttc / TUNING.threatHorizonSeconds) : 0.2;
    return {
      id: threat.id,
      left: 0.5 + Math.cos(angle) * reach,
      top: 0.5 + Math.sin(angle) * reach,
      angle,
      scale: 0.7 + 0.8 * closeness,
      urgency,
      pulse: ttc < 1,
      label: Number.isFinite(ttc) ? `${ttc.toFixed(1)}s` : '',
    };
  });
}
