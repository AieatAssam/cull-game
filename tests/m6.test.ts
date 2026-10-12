import { describe, expect, it } from 'vitest';
import {
  advanceRumourRadius,
  advanceWrap,
  continuityPropAt,
  createContinuitySequence,
  isDeletedByWrap,
  isWrapActive,
  monitorConeContains,
  redMonitorOverlapsTarget,
  type MonitorCone,
} from '../src/sim/m6.js';

describe('M6 entity rules', () => {
  it('grows the off-screen Rumour by 0.3/s and shrinks the visible one by 0.5/s', () => {
    expect(advanceRumourRadius(2, false, 10)).toBeCloseTo(5);
    expect(advanceRumourRadius(2, true, 2)).toBeCloseTo(1);
    expect(advanceRumourRadius(0.2, true, 1)).toBe(0);
  });

  it('checks points against the inclusive Monitor cone geometry', () => {
    const cone: MonitorCone = { origin: { x: 0, z: 0 }, heading: 0, range: 5, halfAngle: Math.PI / 4 };
    expect(monitorConeContains(cone, { x: 4, z: 0 })).toBe(true);
    expect(monitorConeContains(cone, { x: 3, z: 3 })).toBe(true);
    expect(monitorConeContains(cone, { x: 0, z: 4 })).toBe(false);
    expect(monitorConeContains(cone, { x: 6, z: 0 })).toBe(false);
  });

  it('detects Red Monitor overlap with a target circle at the cone edge', () => {
    const cone: MonitorCone = { origin: { x: 0, z: 0 }, heading: 0, range: 5, halfAngle: Math.PI / 6 };
    expect(redMonitorOverlapsTarget(cone, { x: 3, z: 1.8 }, 0.3)).toBe(true);
    expect(redMonitorOverlapsTarget(cone, { x: 3, z: 2 }, 0.1)).toBe(false);
    expect(redMonitorOverlapsTarget(cone, { x: 5.2, z: 0 }, 0.3)).toBe(true);
  });

  it('creates a deterministic repeating Continuity Prop sequence', () => {
    const props = ['ramp', 'spikes', 'crate', 'plank'];
    const sequence = createContinuitySequence(712, props);
    expect(sequence).toEqual(createContinuitySequence(712, props));
    expect([...sequence].sort()).toEqual([...props].sort());
    expect(continuityPropAt(sequence, sequence.length)).toBe(sequence[0]);
    expect(continuityPropAt(sequence, sequence.length + 2)).toBe(sequence[2]);
  });

  it('activates the Wrap in the last quarter, advances it, and deletes set behind it', () => {
    expect(isWrapActive(74, 100)).toBe(false);
    expect(isWrapActive(75, 100)).toBe(true);
    const wrap = advanceWrap(10, 2, 2.2, 14);
    expect(wrap).toEqual({ strikeDistance: 14.4, wrapped: true });
    expect(isDeletedByWrap(12, wrap.strikeDistance)).toBe(true);
    expect(isDeletedByWrap(15, wrap.strikeDistance)).toBe(false);
  });
});
