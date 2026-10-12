import type { ChunkTemplate } from './types';
import catalog from '../../data/chunks/catalog.json';

export const CHUNKS = (catalog as ChunkTemplate[]).slice().sort((a, b) => a.id.localeCompare(b.id));

export function validateChunk(chunk: ChunkTemplate): string[] {
  const errors: string[] = [];
  if (!chunk || typeof chunk !== 'object') return ['chunk: expected an object'];
  if (!/^chunk-\d{2}$/.test(chunk.id)) errors.push(`${chunk.id}: invalid id`);
  if (!Array.isArray(chunk.size) || chunk.size.length !== 2 || chunk.size.some((value) => !Number.isInteger(value)) || chunk.size[0] !== 16 || chunk.size[1] !== 16) errors.push(`${chunk.id}: expected a 16x16 chunk`);
  if (!Array.isArray(chunk.tiles) || chunk.tiles.length !== 16 || chunk.tiles.some((row) => typeof row !== 'string' || row.length !== 16 || /[^.PTBRCWS]/.test(row))) errors.push(`${chunk.id}: tile map must be 16 rows of 16 valid tile codes`);
  if (!Array.isArray(chunk.pathNodes) || chunk.pathNodes.length < 2 || chunk.pathNodes[0]?.x !== 0 || chunk.pathNodes.at(-1)?.x !== 15) errors.push(`${chunk.id}: path must connect both horizontal endpoints`);
  const pathNodes = Array.isArray(chunk.pathNodes) ? chunk.pathNodes : [];
  if (pathNodes.length) {
    pathNodes.forEach((point, index) => {
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z) || point.x < 0 || point.x > 15 || point.z < 0 || point.z > 15) errors.push(`${chunk.id}: path node ${index} is non-finite or outside the chunk`);
      if (index > 0 && (!Number.isFinite(point?.x) || point.x <= pathNodes[index - 1]!.x)) errors.push(`${chunk.id}: path nodes must move forward in x`);
      if (Array.isArray(chunk.tiles) && chunk.tiles.length === 16 && Number.isInteger(point?.x) && Number.isInteger(point?.z)
        && chunk.tiles[point.z]?.[point.x] !== 'P') errors.push(`${chunk.id}: path node ${index} is not on a path tile`);
    });
  }
  if (!Number.isFinite(chunk.threatCost) || chunk.threatCost < 0) errors.push(`${chunk.id}: invalid base threat cost`);
  if (!Array.isArray(chunk.tags) || chunk.tags.some((tag) => typeof tag !== 'string' || !tag.length)) errors.push(`${chunk.id}: invalid tags`);
  const socketIds = new Set<string>();
  if (!Array.isArray(chunk.sockets)) errors.push(`${chunk.id}: sockets must be an array`);
  for (const socket of Array.isArray(chunk.sockets) ? chunk.sockets : []) {
    if (typeof socket.id !== 'string' || !socket.id.length || socketIds.has(socket.id)) errors.push(`${chunk.id}: socket IDs must be unique and non-empty`);
    socketIds.add(socket.id);
    if (!Number.isFinite(socket.x) || !Number.isFinite(socket.z) || socket.x < 0 || socket.x > 15 || socket.z < 0 || socket.z > 15) errors.push(`${chunk.id}: socket ${socket.id} is outside the chunk`);
    if (!Array.isArray(socket.allowedTypes) || !socket.allowedTypes.length || socket.allowedTypes.some((kind) => !['urchin', 'boulder', 'glass', 'reel', 'extras', 'swarm', 'stagehand', 'bridge'].includes(kind))) errors.push(`${chunk.id}: socket ${socket.id} has invalid type constraints`);
    if (!Array.isArray(socket.tags) || !socket.tags.length) errors.push(`${chunk.id}: socket ${socket.id} is missing tags`);
    if (!Number.isFinite(socket.weight) || !Number.isFinite(socket.threatCost) || socket.weight <= 0 || socket.threatCost < 0) errors.push(`${chunk.id}: invalid socket budget ${socket.id}`);
  }
  if (!Array.isArray(chunk.forks)) errors.push(`${chunk.id}: forks must be an array`);
  for (const fork of Array.isArray(chunk.forks) ? chunk.forks : []) {
    if (!Number.isInteger(fork.at) || fork.at < 1 || fork.at >= pathNodes.length - 1 || !Array.isArray(fork.options) || fork.options.length < 2) {
      errors.push(`${chunk.id}: invalid fork`);
      continue;
    }
    const anchor = pathNodes[fork.at];
    const successor = pathNodes[fork.at + 1];
    const signatures = new Set<string>();
    for (const option of fork.options) {
      if (!Number.isFinite(option.x) || !Number.isFinite(option.z) || option.x <= anchor!.x || option.x > 15 || option.z < 0 || option.z > 15) errors.push(`${chunk.id}: fork option is non-finite or outside forward chunk bounds`);
      const signature = `${option.x},${option.z}`;
      if (signatures.has(signature)) errors.push(`${chunk.id}: fork options must be distinct`);
      signatures.add(signature);
      if (successor && Math.hypot(successor.x - option.x, successor.z - option.z) > 8) errors.push(`${chunk.id}: fork option cannot reconnect to the authored path`);
    }
  }
  return errors;
}

export function validateCatalog(chunks: ChunkTemplate[] = CHUNKS): string[] {
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== 'object') { errors.push('catalog contains a non-object chunk'); continue; }
    if (ids.has(chunk.id)) errors.push(`${chunk.id}: duplicate catalog id`);
    ids.add(chunk.id);
    errors.push(...validateChunk(chunk));
  }
  return errors;
}
