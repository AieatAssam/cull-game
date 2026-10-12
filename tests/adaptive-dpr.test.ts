import { describe, expect, it } from 'vitest';
import { nextDprTier } from '../src/render/adaptive-dpr';

describe('adaptive render resolution', () => {
  it('steps down once on a slow 60-frame median and never steps up', () => {
    expect(nextDprTier(0, Array(59).fill(30))).toBe(0);
    expect(nextDprTier(0, Array(60).fill(20))).toBe(1);
    expect(nextDprTier(1, Array(60).fill(20))).toBe(2);
    expect(nextDprTier(2, Array(60).fill(2))).toBe(2);
  });
  it('keeps the current tier when the median is within budget', () => {
    expect(nextDprTier(0, Array(60).fill(16))).toBe(0);
  });
});
