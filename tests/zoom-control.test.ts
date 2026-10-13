import { describe, expect, it } from 'vitest';
import { step, NEUTRAL_INPUT } from '../src/sim/step';
import { TUNING } from '../src/sim/tuning';
import { createState } from '../src/sim/world';
import { easeZoomInput, heldZoomInput, nextZoomStep } from '../src/ui/zoom-control';

function run(zoom: number, input: (zoom: number, seconds: number) => number, done: (zoom: number) => boolean) {
  let state = createState(1, []);
  state.camera.zoom = zoom;
  let ticks = 0;
  while (!done(state.camera.zoom) && ticks < 600) { state = step(state, { ...NEUTRAL_INPUT, zoom: input(state.camera.zoom, ticks / TUNING.tickRate) }); ticks++; }
  return { seconds: ticks / TUNING.tickRate, zoom: state.camera.zoom };
}

describe('fast zoom controls (DECISIONS 2026-10-13, fast zoom)', () => {
  it('a tap steps to the next framing step either way', () => {
    expect(nextZoomStep(48, 1)).toBe(38);
    expect(nextZoomStep(30, 1)).toBe(24);
    expect(nextZoomStep(24, -1)).toBe(38);
    expect(nextZoomStep(10, 1)).toBe(TUNING.minZoom);
    expect(nextZoomStep(48, -1)).toBe(TUNING.maxZoom);
  });
  it('a tap snap lands in about 0.15 s without overshoot', () => {
    for (const [from, to] of [[24, 38], [38, 24], [30, 24]] as const) {
      let overshoot = false;
      const { seconds, zoom } = run(from, (z) => { if ((to - z) * (to - from) < -0.05) overshoot = true; return easeZoomInput(z, to); }, (z) => Math.abs(z - to) < 0.12);
      expect(seconds).toBeLessThanOrEqual(0.2);
      expect(Math.abs(zoom - to)).toBeLessThan(0.12);
      expect(overshoot).toBe(false);
    }
  });
  it('holding goes widest to tightest in at most 0.6 s', () => {
    let target: number | null = nextZoomStep(TUNING.maxZoom, 1);
    const { seconds } = run(TUNING.maxZoom, (z, t) => { const held = heldZoomInput(1, t); if (held) target = null; return held || (target === null ? 0 : easeZoomInput(z, target)); }, (z) => z <= TUNING.minZoom + 0.05);
    expect(seconds).toBeLessThanOrEqual(0.6);
  });
});
