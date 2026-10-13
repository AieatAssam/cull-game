import { TUNING } from '../sim/tuning';
import { mulberry32, seededRange } from '../sim/rng';
import type { CastEntity, PathFork } from '../sim/types';
import { CHUNKS, validateCatalog } from './chunks';
import type { ChunkSocket, ChunkTemplate, GeneratedScene } from './types';

const weightedThreatKinds: Array<{ kind: ChunkSocket['allowedTypes'][number]; weight: number }> = [
  { kind: 'urchin', weight: 5 }, { kind: 'boulder', weight: 2 }, { kind: 'glass', weight: 2 },
  { kind: 'extras', weight: 3 }, { kind: 'swarm', weight: 2 }, { kind: 'stagehand', weight: 1 }, { kind: 'bridge', weight: 1 },
];

function pickChunk(random: () => number, used: Set<string>, forceFork: boolean, forceIntro = false): ChunkTemplate {
  let choices = CHUNKS.filter((chunk) => !used.has(chunk.id)
    && (!forceFork || chunk.tags.includes('fork'))
    && (!forceIntro || chunk.tags.includes('intro:urchin')));
  if (!choices.length && forceFork) choices = CHUNKS.filter((chunk) => chunk.tags.includes('fork'));
  if (!choices.length) choices = CHUNKS;
  return choices[Math.floor(random() * choices.length)]!;
}

function chooseSocketKind(socket: ChunkSocket, random: () => number): ChunkSocket['allowedTypes'][number] {
  const allowed = weightedThreatKinds.filter((candidate) => socket.allowedTypes.includes(candidate.kind));
  const total = allowed.reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * total;
  for (const entry of allowed) {
    roll -= entry.weight;
    if (roll < 0) return entry.kind;
  }
  return socket.allowedTypes[0]!;
}

function entityAt(socket: ChunkSocket, kind: ChunkSocket['allowedTypes'][number], offset: number, chunkId: string, tier: number): CastEntity {
  return {
    id: `${chunkId}-${socket.id}`, kind, x: offset + socket.x, z: socket.z - 8,
    vx: kind === 'boulder' ? -TUNING.boulderSpeed : kind === 'urchin' ? -TUNING.urchinSpeedByDifficulty[tier]! : 0,
    vz: 0, spawned: false, cut: false, age: 0,
  };
}

function projectPathForks(selected: ChunkTemplate[], offsets: number[]): { path: GeneratedScene['path']; forks: PathFork[] } {
  const path: GeneratedScene['path'] = [];
  const forks: PathFork[] = [];
  selected.forEach((chunk, index) => {
    const offset = offsets[index]!;
    for (const node of chunk.pathNodes) {
      const point = { x: offset + node.x, z: node.z - 8 };
      if (!path.length || point.x !== path[path.length - 1]!.x || point.z !== path[path.length - 1]!.z) path.push(point);
    }
    for (const fork of chunk.forks) {
      const at = path.findIndex((point) => point.x === offset + chunk.pathNodes[fork.at]!.x && point.z === chunk.pathNodes[fork.at]!.z - 8);
      if (at >= 0) forks.push({ at, options: fork.options.map((option) => ({ x: offset + option.x, z: option.z - 8 })) });
    }
  });
  return { path, forks };
}

/** Heading changes of at least 90° along a path. */
export function sharpTurns(path: Array<{ x: number; z: number }>): number {
  let turns = 0;
  for (let i = 2; i < path.length; i++) {
    const before = Math.atan2(path[i - 1]!.z - path[i - 2]!.z, path[i - 1]!.x - path[i - 2]!.x);
    const after = Math.atan2(path[i]!.z - path[i - 1]!.z, path[i]!.x - path[i - 1]!.x);
    if (Math.abs(after - before) >= Math.PI / 2 - 1e-9) turns++;
  }
  return turns;
}

/** z of the set path at world x (path x is strictly increasing). */
export function pathZAt(path: Array<{ x: number; z: number }>, x: number): number {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (x <= b.x) return a.z + (b.z - a.z) * Math.max(0, Math.min(1, b.x === a.x ? 1 : (x - a.x) / (b.x - a.x)));
  }
  return path.at(-1)?.z ?? 0;
}

export function generateScene(seed: number, difficulty = 0, chunkCount?: number): GeneratedScene {
  if (CHUNKS.length < 2) throw new Error(`Expected authored chunk data, found ${CHUNKS.length}`);
  const invalid = validateCatalog();
  if (invalid.length) throw new Error(`Invalid chunk templates: ${invalid.join('; ')}`);
  const random = mulberry32(seed >>> 0);
  const count = chunkCount ?? 8 + Math.floor(random() * 6);
  if (count < 2 || count > 14) throw new RangeError('chunkCount must be between 2 and 14');
  const selected: ChunkTemplate[] = [];
  const used = new Set<string>();
  let hasFork = false;
  for (let i = 0; i < count; i++) {
    const mustFork = i === count - 1 && !hasFork;
    const chunk = pickChunk(random, used, mustFork, i === 0);
    selected.push(chunk);
    used.add(chunk.id);
    hasFork ||= chunk.forks.length > 0;
  }
  const offsets = selected.map((_, index) => index * TUNING.chunkSize);
  // Bible M2: the path turns. A scene short of `minimumSharpTurns` heading changes of ≥ 90° swaps non-intro chunks,
  // last first, for unused turning chunks that cost no more threat and keep any fork.
  for (let index = selected.length - 1; index > 0 && sharpTurns(projectPathForks(selected, offsets).path) < TUNING.minimumSharpTurns; index--) {
    const current = selected[index]!;
    const replacement = CHUNKS.find((chunk) => !used.has(chunk.id) && chunk.threatCost <= current.threatCost
      && (current.forks.length === 0 || chunk.forks.length > 0) && sharpTurns(chunk.pathNodes) >= 1);
    if (!replacement) continue;
    used.delete(current.id);
    used.add(replacement.id);
    selected[index] = replacement;
  }
  const { path, forks } = projectPathForks(selected, offsets);
  const baseThreatCost = selected.reduce((sum, chunk) => sum + chunk.threatCost, 0);
  const tier = Math.max(0, Math.min(3, Math.floor(difficulty)));
  const threatBudget = count * (TUNING.threatBudgets[tier] ?? 1);
  if (baseThreatCost > threatBudget) throw new Error(`Chunk set spends ${baseThreatCost} above threat budget ${threatBudget}`);
  const entities: CastEntity[] = [];
  const tiles: GeneratedScene['tiles'] = [];
  let threatSpent = baseThreatCost;
  let reelCount = 0;
  selected.forEach((chunk, index) => {
    const offset = offsets[index]!;
    chunk.tiles.forEach((row, z) => Array.from(row).forEach((kind, x) => {
      if (kind !== '.') tiles.push({ x: offset + x, z: z - 8, kind: kind === 'P' ? 'path' : 'set' });
    }));
    const sockets = chunk.sockets.filter((socket) => socket.allowedTypes.includes('reel') || random() < Math.min(1, socket.weight / 3));
    for (const socket of sockets) {
      const canPlaceReel = socket.allowedTypes.length === 1 && socket.allowedTypes[0] === 'reel';
      if (!canPlaceReel && threatSpent + socket.threatCost > threatBudget) continue;
      const kind = chooseSocketKind(socket, random);
      entities.push(entityAt(socket, kind, offset, chunk.id, tier));
      if (canPlaceReel) reelCount++;
      else threatSpent += socket.threatCost;
    }
  });
  // Reels are guaranteed and distributed along the stitched route.
  if (reelCount < TUNING.minimumReelsPerScene) {
    for (let i = reelCount; i < TUNING.minimumReelsPerScene; i++) {
      const x = 8 + Math.floor((i * (path.length - 16)) / TUNING.minimumReelsPerScene);
      entities.push({ id: `guaranteed-reel-${i}`, kind: 'reel', x, z: 0, vx: 0, vz: 0, spawned: false, cut: false, age: 0 });
      reelCount++;
    }
  }
  // Bible M2: threats come from ahead. At least half the Urchins (seeded) are set on the walked path and roll down it
  // toward the Talent, so panning behind them does not remove them; the rest keep their socket rows.
  entities.forEach((entity, index) => {
    if (entity.kind !== 'urchin' || seededRange(seed, 0x0a11 + index, 0, 1) >= TUNING.aheadEntryShare[tier]!) return;
    entity.z = pathZAt(path, entity.x);
    entity.pathBound = true;
    if (tier >= TUNING.rollingEntryFromDifficulty) entity.rollsIn = true;
  });
  if (forks.length === 0) {
    const at = Math.min(8, path.length - 2);
    const point = path[at]!;
    forks.push({ at, options: [{ x: point.x + 1, z: point.z - 4 }, { x: point.x + 1, z: point.z + 4 }] });
  }
  return { seed: seed >>> 0, chunks: selected.map((chunk) => chunk.id), tiles, path, forks, entities, threatBudget, threatSpent, reelCount, length: path.at(-1)?.x ?? 0 };
}
