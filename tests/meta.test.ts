import { describe, expect, it } from 'vitest';
import { dailySeed } from '../src/meta/daily';
import { loadFilmography, personalBest, recordResult, type FilmographyEntry, type StorageLike } from '../src/meta/filmography';
import { decodeReplay, encodeReplay } from '../src/replay/codec';
import { stateHash } from '../src/sim/hash';
import { gradeMetrics, smoothnessFromMeanJerk, thirdsDistance } from '../src/meta/grade';
import { createState } from '../src/sim/world';
import type { InputFrame } from '../src/sim/types';

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const neutral: InputFrame = { panX: 0, panZ: 0, zoom: 0, rotate: 0, hold: false, steady: false };

describe('M9 daily seed, filmography, and replay data', () => {
  it('scores transparent cinematography metrics and detects thirds intersections', () => {
    const atIntersection = thirdsDistance(-5, -5, 0, 0, 30, 0);
    expect(atIntersection).toBeCloseTo(0);
    expect(smoothnessFromMeanJerk(0)).toBe(100);
    expect(smoothnessFromMeanJerk(1)).toBeLessThan(15);
    expect(gradeMetrics({ thirdsPercent: 100, smoothness: 100, closeCalls: 10, reelsCollected: 6, reelsAvailable: 6 })).toBe('S');
    expect(gradeMetrics({ thirdsPercent: 0, smoothness: 0, closeCalls: 0, reelsCollected: 0, reelsAvailable: 6 })).toBe('C');
  });
  it('uses a stable UTC date key for the daily seed', () => {
    expect(dailySeed('2026-10-12')).toBe(dailySeed('2026-10-12'));
    expect(dailySeed('2026-10-12')).not.toBe(dailySeed('2026-10-13'));
    expect(() => dailySeed('2026-13-12')).toThrow();
  });

  it('round-trips quantized input frames through a compact base64url replay', () => {
    const frames = [neutral, neutral, { ...neutral, panX: 42, zoom: -13 }, { ...neutral, panX: 42, zoom: -13, hold: true }];
    const encoded = encodeReplay(2026, frames);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeReplay(encoded)).toEqual({ seed: 2026, frames });
    expect(encodeReplay(2026, frames)).toBe(encoded);
  });

  it('round-trips a maximum-length varying input stream that does not compress well with RLE', () => {
    const frames = Array.from({ length: 8 * 60 * 60 }, (_, i) => ({
      panX: i % 255 - 127, panZ: Math.floor(i / 255) % 255 - 127,
      zoom: Math.floor(i / (255 * 255)) % 255 - 127,
      rotate: ([0, 1, -1] as const)[i % 3]!, hold: i % 2 === 1, steady: i % 5 === 1,
    }));
    expect(decodeReplay(encodeReplay(7, frames))).toEqual({ seed: 7, frames });
  });

  it('rejects malformed, oversized, and invalid-frame replay URLs', () => {
    expect(() => decodeReplay('%%%')).toThrow();
    const invalidFrame = btoa(JSON.stringify({ v: 1, seed: 1, runs: [[1, 500, 0, 0, 0, 0, 0]] })).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    expect(() => decodeReplay(invalidFrame)).toThrow();
    expect(() => decodeReplay('x'.repeat(1_500_001))).toThrow();
  });

  it('keeps recent local history and the best distance per location', () => {
    const storage = new MemoryStorage();
    const entry = (seed: number, meters: number): FilmographyEntry => ({ date: '2026-10-12', seed, location: 'BACKLOT', meters, cuts: 3, score: 200, cause: 'hit' });
    recordResult(storage, entry(1, 12));
    recordResult(storage, entry(2, 21));
    recordResult(storage, entry(3, 18));
    expect(loadFilmography(storage).map((run) => run.seed)).toEqual([3, 2, 1]);
    expect(personalBest(storage, 'BACKLOT')?.meters).toBe(21);
  });

  it('hashes cumulative run distance used by cross-scene summaries', () => {
    const state = createState(12);
    const before = stateHash(state);
    state.totalDistance += 1;
    expect(stateHash(state)).not.toBe(before);
  });
});
