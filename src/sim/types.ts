export type EntityKind = 'urchin' | 'boulder' | 'glass' | 'reel';
export type FailReason = 'lost-talent' | 'hit' | 'fell' | 'out-of-film' | 'wrapped';
export interface InputFrame {
  panX: number;
  panZ: number;
  zoom: number;
  rotate: -1 | 0 | 1;
  hold: boolean;
  steady: boolean;
}
export interface SpawnPoint { id: string; kind: EntityKind; x: number; z: number; vx: number; vz: number; }
export interface CastEntity extends SpawnPoint { spawned: boolean; cut: boolean; age: number; }
export interface Talent { x: number; z: number; offscreenTicks: number; pathIndex: number; }
export interface PathFork { at: number; options: Array<{ x: number; z: number }>; }
export interface SimState {
  seed: number;
  tick: number;
  camera: { x: number; z: number; vx: number; vz: number; zoom: number; yaw: number; yawTarget: number; rotationTicksRemaining: number; moving: boolean };
  talent: Talent;
  path: Array<{ x: number; z: number }>;
  forks: PathFork[];
  routeChoices: Record<number, number>;
  entities: CastEntity[];
  consumed: string[];
  film: number;
  waiting: boolean;
  failed: FailReason | null;
  score: number;
  cuts: string[];
}
export interface FrameRect { left: number; right: number; bottom: number; top: number; }
export interface ProjectedBounds { left: number; right: number; bottom: number; top: number; }
