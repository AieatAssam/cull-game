import type { CastEntity, PathFork } from '../sim/types';

export type SocketKind = 'urchin' | 'boulder' | 'glass' | 'reel' | 'extras' | 'swarm' | 'stagehand' | 'bridge';
export interface ChunkSocket {
  id: string;
  x: number;
  z: number;
  allowedTypes: SocketKind[];
  weight: number;
  threatCost: number;
  tags: string[];
}
export interface ChunkTemplate {
  id: string;
  size: [16, 16];
  tiles: string[];
  pathNodes: Array<{ x: number; z: number }>;
  forks: Array<{ at: number; options: Array<{ x: number; z: number }> }>;
  sockets: ChunkSocket[];
  threatCost: number;
  tags: string[];
}
export interface GeneratedScene {
  seed: number;
  chunks: string[];
  tiles: Array<{ x: number; z: number; kind: 'path' | 'set' }>;
  path: Array<{ x: number; z: number }>;
  forks: PathFork[];
  entities: CastEntity[];
  threatBudget: number;
  threatSpent: number;
  reelCount: number;
  length: number;
}
