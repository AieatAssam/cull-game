import { describe, expect, it } from 'vitest';
import { CastBounds } from '../src/render/cast-bounds';
import type { CastEntity } from '../src/sim/types';

describe('visual signature helpers', () => {
  it('batches active CAST bounds and adds diagonal contrast hatches to hazards', () => {
    const bounds = new CastBounds();
    const entities: CastEntity[] = [
      { id: 'hazard', kind: 'boulder', x: 2, z: 3, vx: 0, vz: 0, spawned: true, cut: false, age: 0 },
      { id: 'cut', kind: 'glass', x: 4, z: 0, vx: 0, vz: 0, spawned: true, cut: true, age: 0 },
      { id: 'preview', kind: 'reel', x: 8, z: 0, vx: 0, vz: 0, spawned: false, cut: false, age: 0 },
    ];
    bounds.update(entities);
    expect(bounds.mesh.geometry.drawRange.count).toBe(30);
    const positions = bounds.mesh.geometry.getAttribute('position');
    const colors = bounds.mesh.geometry.getAttribute('color');
    expect(positions.getX(0)).toBeCloseTo(1.2);
    expect(colors.getX(0)).toBeCloseTo(1);
    expect(positions.getY(24)).toBeCloseTo(1.625);
    expect(colors.getX(24)).toBeLessThan(0.03);
    bounds.dispose();
  });
});
