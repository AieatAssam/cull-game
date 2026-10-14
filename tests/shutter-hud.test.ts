import { describe, expect, it } from 'vitest';
import { cutBanner, cutStampText, takeReadout, threatMarkers } from '../src/ui/shutter-hud';
import type { CutResult } from '../src/sim/types';

const result = (patch: Partial<CutResult> = {}): CutResult => ({ tick: 1, hits: [], missed: false, penalised: false, defanged: false, combo: 1, score: 0, film: 0, ...patch });

describe('shutter HUD copy', () => {
  it('stamps each hit by distance class and combo', () => {
    expect(cutStampText({ id: 'a', kind: 'urchin', distance: 'close' }, result())).toBe('CLOSE +250 +2s');
    expect(cutStampText({ id: 'a', kind: 'urchin', distance: 'normal' }, result({ combo: 3 }))).toBe('CUT +100');
    expect(cutStampText({ id: 'a', kind: 'urchin', distance: 'too-far' }, result())).toBe('TOO FAR');
  });
  it('bans costly CUTs and reads out the take', () => {
    expect(cutBanner(result({ missed: true }))?.text).toBe('MISSED −2s');
    expect(cutBanner(result({ penalised: true }))?.text).toBe("SHE'S OUT OF SHOT −4s");
    expect(cutBanner(result({ hits: [{ id: 'a', kind: 'urchin', distance: 'normal' }] }))).toBeNull();
    expect(takeReadout(3, 1250)).toBe('TAKE ×3  1,250');
  });
  it('pins threat arrows to the gate edge, pulsing under 1 s', () => {
    const view = { camera: { x: 0, z: 0, zoom: 10, yaw: 0 } as never, lens: '35mm' as const, talent: { x: 0, z: 0 } as never };
    const [right, slow] = threatMarkers(view, [
      { id: 'r', kind: 'urchin', direction: { x: 1, z: 0 }, distance: 20, timeToContact: 0.5 },
      { id: 's', kind: 'urchin', direction: { x: 1, z: 0 }, distance: 20, timeToContact: 5 },
    ]);
    expect(right!.left).toBeCloseTo(0.94);
    expect(right!).toMatchObject({ urgency: 'imminent', pulse: true });
    expect(slow!).toMatchObject({ urgency: 'far', pulse: false });
    expect(right!.scale).toBeGreaterThan(slow!.scale);
  });
});
