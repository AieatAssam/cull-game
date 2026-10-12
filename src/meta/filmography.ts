import type { LensId } from '../sim/lenses';

export interface FilmographyEntry {
  date: string;
  seed: number;
  location: string;
  meters: number;
  cuts: number;
  score: number;
  cause: string;
  grade?: 'S' | 'A' | 'B' | 'C';
  thirdsPercent?: number;
  smoothness?: number;
  closeCalls?: number;
  reelsCollected?: number;
  reelsAvailable?: number;
  shootSceneIndex?: number;
  finishedShoot?: boolean;
  daily?: boolean;
  monitorUses?: number;
  lens?: LensId;
}
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; }
const storageKey = 'cull.filmography.v1';

function isEntry(value: unknown): value is FilmographyEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<FilmographyEntry>;
  const optionalCounts = [entry.thirdsPercent, entry.smoothness, entry.closeCalls, entry.reelsCollected, entry.reelsAvailable, entry.monitorUses];
  return typeof entry.date === 'string' && Number.isInteger(entry.seed) && typeof entry.location === 'string'
    && [entry.meters, entry.cuts, entry.score].every((number) => typeof number === 'number' && Number.isFinite(number))
    && typeof entry.cause === 'string'
    && (entry.grade === undefined || ['S', 'A', 'B', 'C'].includes(entry.grade))
    && optionalCounts.every((number) => number === undefined || (typeof number === 'number' && Number.isFinite(number) && number >= 0))
    && (entry.shootSceneIndex === undefined || (Number.isInteger(entry.shootSceneIndex) && entry.shootSceneIndex >= -1 && entry.shootSceneIndex <= 3))
    && (entry.finishedShoot === undefined || typeof entry.finishedShoot === 'boolean')
    && (entry.daily === undefined || typeof entry.daily === 'boolean')
    && (entry.lens === undefined || ['35mm', 'anamorphic', 'tilt-shift', 'fisheye', 'long-lens', 'super8'].includes(entry.lens));
}

export function loadFilmography(storage: StorageLike): FilmographyEntry[] {
  try {
    const decoded: unknown = JSON.parse(storage.getItem(storageKey) ?? '[]');
    return Array.isArray(decoded) ? decoded.filter(isEntry).slice(0, 100) : [];
  } catch { return []; }
}

export function personalBest(storage: StorageLike, location: string, lens: LensId = '35mm'): FilmographyEntry | undefined {
  return loadFilmography(storage).filter((entry) => entry.location === location && (entry.lens ?? '35mm') === lens).sort((a, b) => b.meters - a.meters)[0];
}

export function recordResult(storage: StorageLike, entry: FilmographyEntry) {
  if (!isEntry(entry)) throw new TypeError('Invalid filmography record');
  storage.setItem(storageKey, JSON.stringify([entry, ...loadFilmography(storage)].slice(0, 100)));
}
