import * as THREE from 'three';
import type { CastEntity } from '../sim/types';

const edgePairs: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];
const capacity = 250;
const verticesPerBox = edgePairs.length * 2;
const colors = {
  danger: new THREE.Color('#ff4b3e'), pickup: new THREE.Color('#3fd8ff'), ledger: new THREE.Color('#a5aaa9'), set: new THREE.Color('#c3c9c5'),
};
const positionData = new Float32Array(capacity * verticesPerBox * 3);
const colorData = new Float32Array(capacity * verticesPerBox * 3);
const worldCorners = Array.from({ length: 8 }, () => new THREE.Vector3());

function dimensions(entity: CastEntity): [number, number, number] {
  if (entity.kind === 'bridge') return [14, 1.1, 1.8];
  if (entity.kind === 'glass') return [1.5, 0.12, 1.5];
  if (entity.kind === 'extras') return [4, 1.2, 2];
  if (entity.kind === 'boulder') return [1.6, 1.6, 1.6];
  if (entity.kind === 'rumour') { const diameter = (entity.radius ?? 0.5) * 2; return [diameter, diameter, diameter]; }
  return [1.2, 1.4, 1.2];
}

function colorFor(entity: CastEntity): THREE.Color {
  if (entity.kind === 'boulder' || entity.kind === 'red-monitor' || (entity.kind === 'urchin' && (entity.lodTier ?? 0) <= 1)) return colors.danger;
  if (entity.kind === 'reel' || entity.kind === 'glass' || entity.kind === 'monitor') return colors.pickup;
  if (entity.kind === 'rumour') return colors.ledger;
  return colors.set;
}

/** One low-cost line buffer for every currently existing entity's world AABB. */
export class CastBounds {
  readonly mesh: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private count = 0;

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positionData, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(colorData, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    this.mesh = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false }));
    this.mesh.name = 'cast-aabb-lines';
    this.mesh.frustumCulled = false;
  }

  update(entities: readonly CastEntity[]) {
    this.count = 0;
    for (const entity of entities) {
      if (!entity.spawned || entity.cut || this.count >= capacity) continue;
      const [width, height, depth] = dimensions(entity);
      const color = colorFor(entity);
      const halfWidth = width / 2; const halfDepth = depth / 2;
      worldCorners[0]!.set(entity.x - halfWidth, 0.04, entity.z - halfDepth);
      worldCorners[1]!.set(entity.x + halfWidth, 0.04, entity.z - halfDepth);
      worldCorners[2]!.set(entity.x + halfWidth, 0.04, entity.z + halfDepth);
      worldCorners[3]!.set(entity.x - halfWidth, 0.04, entity.z + halfDepth);
      worldCorners[4]!.set(entity.x - halfWidth, height, entity.z - halfDepth);
      worldCorners[5]!.set(entity.x + halfWidth, height, entity.z - halfDepth);
      worldCorners[6]!.set(entity.x + halfWidth, height, entity.z + halfDepth);
      worldCorners[7]!.set(entity.x - halfWidth, height, entity.z + halfDepth);
      const start = this.count * verticesPerBox;
      let vertex = 0;
      for (const [a, b] of edgePairs) {
        for (const cornerIndex of [a, b]) {
          const point = worldCorners[cornerIndex]!;
          const offset = (start + vertex) * 3;
          positionData[offset] = point.x; positionData[offset + 1] = point.y; positionData[offset + 2] = point.z;
          colorData[offset] = color.r; colorData[offset + 1] = color.g; colorData[offset + 2] = color.b;
          vertex++;
        }
      }
      this.count++;
    }
    const position = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const color = this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    position.needsUpdate = true; color.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, this.count * verticesPerBox);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
