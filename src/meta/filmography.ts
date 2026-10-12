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
}
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; }
const storageKey = 'cull.filmography.v1';

function isEntry(value: unknown): value is FilmographyEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<FilmographyEntry>;
  return typeof entry.date === 'string' && Number.isInteger(entry.seed) && typeof entry.location === 'string'
    && [entry.meters, entry.cuts, entry.score].every((number) => typeof number === 'number' && Number.isFinite(number))
    && typeof entry.cause === 'string';
}

export function loadFilmography(storage: StorageLike): FilmographyEntry[] {
  try {
    const decoded: unknown = JSON.parse(storage.getItem(storageKey) ?? '[]');
    return Array.isArray(decoded) ? decoded.filter(isEntry).slice(0, 100) : [];
  } catch { return []; }
}

export function personalBest(storage: StorageLike, location: string): FilmographyEntry | undefined {
  return loadFilmography(storage).filter((entry) => entry.location === location).sort((a, b) => b.meters - a.meters)[0];
}

export function recordResult(storage: StorageLike, entry: FilmographyEntry) {
  if (!isEntry(entry)) throw new TypeError('Invalid filmography record');
  storage.setItem(storageKey, JSON.stringify([entry, ...loadFilmography(storage)].slice(0, 100)));
}
