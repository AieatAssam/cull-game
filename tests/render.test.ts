import { describe, expect, it } from 'vitest';
import { CastBounds } from '../src/render/cast-bounds';
import { PATH_RISE, raisedPathGeometry } from '../src/render/set-dressing';
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

  it('raises the path into one bevelled ribbon instead of a stack of flat tiles', () => {
    const heights = (geometry: ReturnType<typeof raisedPathGeometry>) => {
      const position = geometry.getAttribute('position');
      return Array.from({ length: position.count }, (_, index) => position.getY(index));
    };
    const lone = raisedPathGeometry([{ x: 0, z: 0 }]);
    const pair = raisedPathGeometry([{ x: 0, z: 0 }, { x: 1, z: 0 }]);
    const single = heights(lone);
    const joined = heights(pair);
    expect(Math.max(...single)).toBeGreaterThanOrEqual(PATH_RISE);
    expect(Math.max(...single)).toBeLessThan(PATH_RISE + 0.03);
    expect(Math.min(...single)).toBeCloseTo(0);
    const onGround = (samples: number[]) => samples.filter((y) => y < 0.001).length;
    expect(onGround(joined)).toBeLessThan(onGround(single) * 2);
    const stepped = raisedPathGeometry([{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }]);
    const position = stepped.getAttribute('position');
    let sharpCorner = false;
    for (let index = 0; index < position.count; index++) {
      if (Math.abs(position.getY(index) - PATH_RISE) > 0.02) continue;
      if (Math.hypot(position.getX(index) - 1.5, position.getZ(index) + 0.5) < 0.04) sharpCorner = true;
    }
    expect(sharpCorner).toBe(false);
    lone.dispose();
    pair.dispose();
    stepped.dispose();
  });
});
