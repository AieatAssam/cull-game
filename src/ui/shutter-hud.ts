import { projectPoint } from '../sim/frame';
import { frameView } from '../sim/lenses';
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

/** A world point in gate units (±0.5 at the edges) for this lens and gate. */
function projectFrame(state: Pick<SimState, 'camera' | 'lens' | 'gate'>, x: number, z: number) {
  const frame = frameView(state.lens, state.gate, state.camera.zoom);
  return projectPoint(x, z, state.camera.x, state.camera.z, frame.zoom, state.camera.yaw, frame.aspect);
}

/** Where on the gate (0..1 from its top-left) a world point sits, clamped inside `inset` of the edge. */
export function gatePoint(state: Pick<SimState, 'camera' | 'lens' | 'gate'>, x: number, z: number, inset = 0.08): { left: number; top: number } {
  const at = projectFrame(state, x, z);
  const clamp = (value: number) => Math.max(inset, Math.min(1 - inset, value));
  return { left: clamp(0.5 + at.x), top: clamp(0.5 + at.y) };
}

export type ThreatUrgency = 'far' | 'near' | 'imminent';
export interface ThreatMarker {
  ids: string[]; count: number; left: number; top: number; angle: number; scale: number; urgency: ThreatUrgency; pulse: boolean; label: string;
  /** Soonest time to contact in the group, seconds (Infinity when not closing). */
  ttc: number;
  /** Which gate edge it sits on, for copy: "right", "left", "above", "below". */
  side: 'right' | 'left' | 'above' | 'below';
}

/** Threats whose screen bearings differ by less than this share one arrow. */
const MERGE_RADIANS = 0.42;

/**
 * One edge arrow per bearing: off-frame threats whose directions are within MERGE_RADIANS share an arrow with a count.
 * The arrow sits on the ray from the gate centre toward the soonest threat, inset `pad` px from the edge (so its
 * chevron and label never clip), and points at it. Size and colour grow as time to contact shrinks; under 1 s it pulses.
 * `size` is the gate in px; without it the gate is treated as 500 px square.
 */
export function threatMarkers(
  state: Pick<SimState, 'camera' | 'lens' | 'talent'>,
  threats: readonly Threat[],
  size: { width: number; height: number } = { width: 500, height: 500 },
  pad: { x: number; y: number } = { x: 48, y: 36 },
): ThreatMarker[] {
  const groups: { angle: number; threats: Threat[] }[] = [];
  const sorted = [...threats].sort((a, b) => a.timeToContact - b.timeToContact);
  for (const threat of sorted) {
    const wx = state.talent.x + threat.direction.x * threat.distance;
    const wz = state.talent.z + threat.direction.z * threat.distance;
    const at = projectFrame(state, wx, wz);
    const angle = Math.atan2(at.y * size.height, at.x * size.width);
    const near = groups.find((group) => Math.abs(Math.atan2(Math.sin(angle - group.angle), Math.cos(angle - group.angle))) < MERGE_RADIANS);
    if (near) near.threats.push(threat);
    else groups.push({ angle, threats: [threat] });
  }
  return groups.map(({ angle, threats: group }) => {
    const halfW = Math.max(1, size.width / 2 - pad.x);
    const halfH = Math.max(1, size.height / 2 - pad.y);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const reach = Math.min(Math.abs(cos) > 1e-6 ? halfW / Math.abs(cos) : Infinity, Math.abs(sin) > 1e-6 ? halfH / Math.abs(sin) : Infinity);
    const ttc = group[0]!.timeToContact;
    const urgency: ThreatUrgency = ttc < 1 ? 'imminent' : ttc < 2.5 ? 'near' : 'far';
    const closeness = Number.isFinite(ttc) ? 1 - Math.min(1, ttc / TUNING.threatHorizonSeconds) : 0.2;
    const time = Number.isFinite(ttc) ? `${ttc.toFixed(1)}s` : '';
    const count = group.length;
    const side = Math.abs(cos) * halfH >= Math.abs(sin) * halfW ? (cos > 0 ? 'right' : 'left') : (sin > 0 ? 'below' : 'above');
    return {
      ids: group.map((threat) => threat.id),
      count,
      left: 0.5 + (cos * reach) / size.width,
      top: 0.5 + (sin * reach) / size.height,
      angle,
      scale: 1 + 0.35 * closeness,
      urgency,
      pulse: ttc < 1,
      label: count > 1 ? `×${count}  ${time}`.trim() : time,
      ttc,
      side,
    };
  });
}
