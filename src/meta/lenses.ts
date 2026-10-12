import type { FilmographyEntry } from './filmography';

export type LensId = '35mm' | 'anamorphic' | 'tilt-shift' | 'fisheye' | 'long-lens' | 'super8';
export const lensFeats: readonly { id: LensId; name: string; feat: string }[] = [
  { id: 'anamorphic', name: 'ANAMORPHIC', feat: 'Finish a Shoot' },
  { id: 'tilt-shift', name: 'TILT-SHIFT', feat: 'Cull 10 hazards within 1.5 u' },
  { id: 'fisheye', name: 'FISHEYE', feat: 'Use the Monitor 5 times' },
  { id: 'long-lens', name: 'LONG LENS', feat: 'Reach Night Shoot' },
  { id: 'super8', name: 'SUPER 8', feat: 'Finish a daily Shoot' },
];

export function unlockedLenses(entries: readonly FilmographyEntry[]): LensId[] {
  const completeShoot = entries.some((entry) => entry.finishedShoot === true);
  const reachedNight = entries.some((entry) => (entry.shootSceneIndex ?? -1) >= 2);
  const closeCalls = entries.reduce((total, entry) => total + Math.max(0, entry.closeCalls ?? 0), 0);
  const monitorUses = entries.reduce((total, entry) => total + Math.max(0, entry.monitorUses ?? 0), 0);
  const finishedDaily = entries.some((entry) => entry.daily === true && entry.finishedShoot === true);
  return [
    '35mm',
    ...(completeShoot ? ['anamorphic' as const] : []),
    ...(closeCalls >= 10 ? ['tilt-shift' as const] : []),
    ...(monitorUses >= 5 ? ['fisheye' as const] : []),
    ...(reachedNight ? ['long-lens' as const] : []),
    ...(finishedDaily ? ['super8' as const] : []),
  ];
}
