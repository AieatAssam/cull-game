import { expect, it } from 'vitest';
import { TUNING } from '../src/sim/tuning';

it('keeps the fixed-tick scaffold tuning deterministic', () => {
  expect(TUNING.tickRate).toBe(60);
  expect(TUNING.gateAspect).toBe(1);
});
