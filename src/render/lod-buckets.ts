import * as THREE from 'three';
import { lodTier, type LodTier } from '../sim/lod';
import { TUNING } from '../sim/tuning';
import type { CastEntity } from '../sim/types';
import { PATH_RISE, SPRITE_SIZE } from './set-dressing';
import type { SpriteAssets } from './sprite-assets';

/** Render-only acting per urchin: breathing scale, anticipation squash and bristle shiver. */
export interface UrchinPose { sx: number; sy: number; spin: number; lift: number }
const REST_POSE: UrchinPose = { sx: 1, sy: 1, spin: 0, lift: 0 };

const tierNames = ['close', 'medium', 'wide', 'proxy'] as const;

export class UrchinLodBuckets {
  private readonly meshes: Array<THREE.InstancedMesh | null>;
  private readonly tiers = new Map<string, LodTier>();
  private readonly rings = new Map<string, THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>();
  private readonly ringGeometry = new THREE.RingGeometry(0.76, 0.83, 28);
  private readonly ringMaterial = new THREE.MeshBasicMaterial({ color: '#e2b04a', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  private readonly transform = new THREE.Object3D();

  constructor(private readonly scene: THREE.Scene, textures: SpriteAssets['urchinTiers'], capacity = TUNING.performance.maxEntities) {
    this.meshes = textures.map((texture, tier) => {
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
        map: texture, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, depthWrite: false,
      }), capacity);
      mesh.name = `urchin-lod-${tierNames[tier]}`;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      return mesh;
    });
    this.meshes.push(null); // Sub-pixel tier has no geometry and never enters a bucket.
  }

  update(entities: CastEntity[], zoom: number, tick: number, showTransientRings = true, detailFactor: (x: number, z: number) => number = () => 1, displayPoint: (x: number, z: number) => { x: number; z: number } = (x, z) => ({ x, z }), cameraQuaternion = new THREE.Quaternion(), pose: (entity: CastEntity) => UrchinPose = () => REST_POSE) {
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
      this.transform.position.set(point.x, PATH_RISE + SPRITE_SIZE.urchin * 0.22, point.z);
      this.transform.quaternion.copy(cameraQuaternion);
      const acting = pose(entity);
      this.transform.position.y += acting.lift;
      this.transform.rotateZ(entity.age * 0.015 + acting.spin);
      this.transform.scale.set(SPRITE_SIZE.urchin * acting.sx, SPRITE_SIZE.urchin * acting.sy, 1);
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
