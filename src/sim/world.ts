import { seededRange } from './rng';
import type { CastEntity, EntityKind, SimState, SpawnPoint } from './types';
import { TUNING } from './tuning';

export function spawnPoints(seed: number, strip = 0): SpawnPoint[] {
  const offset = strip * 48;
  const kinds: EntityKind[] = ['urchin', 'boulder', 'glass', 'reel'];
  return kinds.map((kind, i) => {
    const index = offset + i;
    const x = kind === 'glass' ? 8 + strip * 16 : seededRange(seed, index, 5, 14) + strip * 16;
    const z = kind === 'glass' ? 0 : seededRange(seed ^ 0xabc, index, -3, 3);
    return { id: `${strip}-${kind}-${i}`, kind, x, z, vx: kind === 'boulder' ? -4 : kind === 'urchin' ? -1.5 : 0, vz: 0 };
  });
}

export function loadWorld(seed: number, strip = 0): CastEntity[] {
  return spawnPoints(seed, strip).map((point) => ({ ...point, spawned: false, cut: false, age: 0 }));
}

export function loadScene(seed: number, stripCount = 10): CastEntity[] {
  return Array.from({ length: stripCount }, (_, strip) => loadWorld(seed, strip)).flat();
}

export function reloadSet(seed: number, x: number, z: number) {
  return { seed, x, z, tile: Math.floor(x / 16) * 16 + Math.floor(z / 16) * 16 };
}

export function createState(seed: number, entities = loadScene(seed)): SimState {
  return {
    seed: seed >>> 0, tick: 0,
    camera: { x: 0, z: 0, vx: 0, vz: 0, zoom: TUNING.startZoom, yaw: 0, yawTarget: 0, rotationTicksRemaining: 0, moving: false },
    talent: { x: 0, z: 0, offscreenTicks: 0, pathIndex: 0 },
    path: Array.from({ length: 81 }, (_, i) => ({ x: i * 2, z: 0 })),
    forks: Array.from({ length: 7 }, (_, i) => {
      const at = 4 + i * 10;
      return { at, options: [{ x: (at + 1) * 2, z: -4 }, { x: (at + 1) * 2, z: 4 }] };
    }),
    routeChoices: {},
    entities, consumed: [], film: 90, waiting: false, failed: null, score: 0, cuts: [],
  };
}
