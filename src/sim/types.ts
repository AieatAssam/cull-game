export type EntityKind = 'urchin' | 'boulder' | 'glass' | 'reel' | 'extras' | 'swarm' | 'stagehand' | 'bridge' | 'rumour' | 'monitor' | 'red-monitor' | 'continuity';
export type FailReason = 'lost-talent' | 'hit' | 'fell' | 'out-of-film' | 'wrapped';
export interface InputFrame {
  panX: number;
  panZ: number;
  zoom: number;
  rotate: -1 | 0 | 1;
  hold: boolean;
  steady: boolean;
}
export interface CrowdMember { dx: number; dz: number; vx: number; vz: number; cut: boolean; }
export interface SpawnPoint { id: string; kind: EntityKind; x: number; z: number; vx: number; vz: number; members?: CrowdMember[]; }
export interface CastEntity extends SpawnPoint { spawned: boolean; cut: boolean; age: number; lodTier?: 0 | 1 | 2 | 3 | 4; radius?: number; heading?: number; range?: number; halfAngle?: number; propIndex?: number; propSequence?: number[]; lockTicks?: number; gate?: number; pathBound?: boolean; }
export interface Talent { x: number; z: number; offscreenTicks: number; pathIndex: number; lodTier?: 0 | 1 | 2 | 3; }
export interface PathFork { at: number; options: Array<{ x: number; z: number }>; }
export interface TerrainTile { x: number; z: number; kind: 'path' | 'set'; }
export interface SimState {
  seed: number;
  lens: import('./lenses').LensId;
  tick: number;
  travelDistance: number;
  totalDistance: number;
  camera: { x: number; z: number; vx: number; vz: number; zoom: number; yaw: number; yawTarget: number; rotationTicksRemaining: number; moving: boolean; focusOffset: number };
  talent: Talent;
  path: Array<{ x: number; z: number }>;
  tiles: TerrainTile[];
  forks: PathFork[];
  routeChoices: Record<number, number>;
  entities: CastEntity[];
  consumed: string[];
  film: number;
  waiting: boolean;
  failed: FailReason | null;
  score: number;
  cuts: string[];
  closeCalls: number;
  shots?: Array<{ at: number; kind: 'defang' | 'portrait'; done: boolean; opened?: number }>;
  shoot?: { sceneIndex: number; biome: 'BACKLOT' | 'MINIATURE CITY' | 'NIGHT SHOOT' | 'LONG TAKE'; wrapDistance: number | null; wrapCaught: boolean; finaleTicks: number; };
}
export interface FrameRect { left: number; right: number; bottom: number; top: number; }
export interface ProjectedBounds { left: number; right: number; bottom: number; top: number; }
