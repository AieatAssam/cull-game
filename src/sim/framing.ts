import type { SimState } from './types';

export interface ShotGoal { at: number; kind: 'defang' | 'portrait'; done: boolean; }

/** Two composition gates. Wide-only play clears the first and stalls on the second; passive medium play never clears the first. */
export function shotListForPath(path: Array<{ x: number }>): ShotGoal[] {
  const start = path[0]?.x ?? 0;
  const end = path.at(-1)?.x ?? start + 80;
  const span = Math.max(24, end - start);
  return [
    { at: start + span * 0.2, kind: 'defang', done: false },
    { at: start + span * 0.48, kind: 'portrait', done: false },
  ];
}

export function markShots(state: SimState) {
  const shots = state.shots;
  if (!shots?.length) return;
  const defang = shots.find((shot) => shot.kind === 'defang');
  if (defang && !defang.done && (state.camera.zoom >= 36 || state.closeCalls > 0)) defang.done = true;
  const portrait = shots.find((shot) => shot.kind === 'portrait');
  if (portrait && !portrait.done && defang?.done && state.camera.zoom >= 16 && state.camera.zoom <= 34) portrait.done = true;
}

export function shotBlocksTalent(state: SimState): boolean {
  return state.shots?.some((shot) => !shot.done && state.talent.x >= shot.at - 0.35) ?? false;
}

export function activeShot(state: SimState): ShotGoal | undefined {
  return state.shots?.find((shot) => !shot.done && state.talent.x >= shot.at - 0.35);
}
