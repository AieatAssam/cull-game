import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lodTier, type LodTier } from '../sim/lod';
import { TUNING } from '../sim/tuning';
import type { CastEntity } from '../sim/types';

const tierNames = ['close', 'medium', 'wide', 'proxy'] as const;

function merged(geometries: THREE.BufferGeometry[]) {
  const compatible = geometries.map((geometry) => geometry.index ? geometry.toNonIndexed() : geometry);
  const result = mergeGeometries(compatible, false);
  for (const geometry of new Set([...geometries, ...compatible])) geometry.dispose();
  if (!result) throw new Error('Could not merge LOD geometry');
  result.computeVertexNormals();
  return result;
}

function spikeGeometry(count: number) {
  const pieces: THREE.BufferGeometry[] = [new THREE.IcosahedronGeometry(0.55, 1)];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const angle = i * Math.PI * 2 / count;
    const spike = new THREE.ConeGeometry(0.13, 0.5, 4);
    const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    spike.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(direction.x * 0.48, 0.02, direction.z * 0.48),
      new THREE.Quaternion().setFromUnitVectors(up, direction),
      new THREE.Vector3(1, 1, 1),
    ));
    pieces.push(spike);
  }
  return merged(pieces);
}

export function makeUrchinLodGeometries(): THREE.BufferGeometry[] {
  return [
    spikeGeometry(8),
    spikeGeometry(4),
    new THREE.OctahedronGeometry(0.62, 0),
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
  ];
}

export class UrchinLodBuckets {
  private readonly meshes: Array<THREE.InstancedMesh | null>;
  private readonly tiers = new Map<string, LodTier>();
  private readonly rings = new Map<string, THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>();
  private readonly ringGeometry = new THREE.RingGeometry(0.76, 0.83, 28);
  private readonly ringMaterial = new THREE.MeshBasicMaterial({ color: '#3fd8ff', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  private readonly transform = new THREE.Object3D();

  constructor(private readonly scene: THREE.Scene, color = '#ff4b3e', capacity = TUNING.performance.maxEntities) {
    const geometries = makeUrchinLodGeometries();
    this.meshes = geometries.map((geometry, tier) => {
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color, flatShading: true }), capacity);
      mesh.name = `urchin-lod-${tierNames[tier]}`;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      return mesh;
    });
    this.meshes.push(null); // Sub-pixel tier has no geometry and never enters a bucket.
  }

  update(entities: CastEntity[], zoom: number, tick: number, showTransientRings = true, detailFactor: (x: number, z: number) => number = () => 1, displayPoint: (x: number, z: number) => { x: number; z: number } = (x, z) => ({ x, z })) {
    for (const mesh of this.meshes) if (mesh) mesh.count = 0;
    for (const entity of entities) {
      if (entity.kind !== 'urchin' || !entity.spawned || entity.cut) continue;
      const tier = lodTier(TUNING.urchinRadius * 1000 / zoom * detailFactor(entity.x, entity.z), this.tiers.get(entity.id));
      const oldTier = this.tiers.get(entity.id);
      this.tiers.set(entity.id, tier);
      let ring = this.rings.get(entity.id);
      if (oldTier !== undefined && oldTier !== tier && showTransientRings) {
        if (!ring) {
          ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
          ring.rotation.x = -Math.PI / 2;
          ring.name = `lod-ring-${entity.id}`;
          this.rings.set(entity.id, ring);
          this.scene.add(ring);
        }
        const point = displayPoint(entity.x, entity.z);
        ring.position.set(point.x, 0.025, point.z);
        ring.visible = true;
        ring.userData.expiresAt = tick + 8;
      }
      if (ring) ring.visible = showTransientRings && ring.userData.expiresAt >= tick;
      const bucket = this.meshes[tier];
      if (!bucket) continue;
      const index = bucket.count++;
      const point = displayPoint(entity.x, entity.z);
      this.transform.position.set(point.x, 0.68, point.z);
      this.transform.rotation.set(0, entity.age * 0.015, 0);
      this.transform.scale.setScalar(1);
      this.transform.updateMatrix();
      bucket.setMatrixAt(index, this.transform.matrix);
      bucket.instanceMatrix.needsUpdate = true;
    }
  }

  diagnostics() {
    return {
      bucketCounts: this.meshes.map((mesh) => mesh?.count ?? 0),
      tiers: Object.fromEntries(this.tiers),
      visibleRings: [...this.rings.values()].filter((ring) => ring.visible).length,
    };
  }

  reset() {
    this.tiers.clear();
    for (const ring of this.rings.values()) ring.visible = false;
    for (const mesh of this.meshes) if (mesh) mesh.count = 0;
  }

  dispose() {
    for (const mesh of this.meshes) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    for (const ring of this.rings.values()) this.scene.remove(ring);
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
  }
}
