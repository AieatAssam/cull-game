import type { FilmographyEntry } from './filmography';

export type FilmStock = 'clean' | 'kodachrome' | 'bleach' | 'ilford';
export const filmStocks: readonly { id: FilmStock; label: string; minimum: 'B' | 'A' | 'S' }[] = [
  { id: 'kodachrome', label: 'KODACHROME', minimum: 'B' },
  { id: 'bleach', label: 'BLEACH BYPASS', minimum: 'A' },
  { id: 'ilford', label: 'ILFORD B&W', minimum: 'S' },
];
const rank = { C: 0, B: 1, A: 2, S: 3 } as const;
const key = 'cull.film-stock.v1';

export function unlockedFilmStocks(entries: readonly FilmographyEntry[]): FilmStock[] {
  const best = entries.reduce((value, entry) => entry.grade && rank[entry.grade] > value ? rank[entry.grade] : value, 0);
  return ['clean', ...filmStocks.filter((stock) => best >= rank[stock.minimum]).map((stock) => stock.id)];
}

export function loadFilmStock(storage: Pick<Storage, 'getItem'>, entries: readonly FilmographyEntry[]): FilmStock {
  const unlocked = unlockedFilmStocks(entries);
  try {
    const saved = storage.getItem(key) as FilmStock | null;
    return saved && unlocked.includes(saved) ? saved : 'clean';
  } catch { return 'clean'; }
}

export function saveFilmStock(storage: Pick<Storage, 'setItem'>, stock: FilmStock, entries: readonly FilmographyEntry[]) {
  if (!unlockedFilmStocks(entries).includes(stock)) throw new TypeError('Film stock is not unlocked');
  storage.setItem(key, stock);
}
