import { generateScene } from '../gen/generate';
import { createContinuitySequence } from './m6';
import { TUNING } from './tuning';
import { createState } from './world';
import type { CastEntity, InputFrame, SimState } from './types';
import { step } from './step';

const biomes = ['BACKLOT', 'MINIATURE CITY', 'NIGHT SHOOT', 'LONG TAKE'] as const;
const propKinds = ['ramp', 'spikes', 'crate', 'plank'] as const;
const sceneSeed = (seed: number, index: number) => (seed + Math.imul(index, 0x9e3779b9)) >>> 0;

function addM6Cast(state: SimState, seed: number, sceneIndex: number): CastEntity[] {
  const start = state.path[0] ?? { x: 0, z: 0 };
  const end = state.path.at(-1) ?? { x: 120, z: 0 };
  const at = (fraction: number) => state.path[Math.min(state.path.length - 1, Math.floor((state.path.length - 1) * fraction))] ?? start;
  const rumour = at(0.6);
  const monitor = at(0.35);
  const hostile = at(0.82);
  const prop = at(0.48);
  const sequence = createContinuitySequence(seed, propKinds);
  const cast: CastEntity[] = [];
  if (sceneIndex === 1 || sceneIndex === 3) cast.push(
    { id: `monitor-${sceneIndex}`, kind: 'monitor', x: monitor.x, z: monitor.z - 5, vx: 0, vz: 0, spawned: true, cut: false, age: 0, heading: Math.atan2(monitor.z - (monitor.z - 5), end.x - monitor.x), range: 28, halfAngle: Math.PI / 5 },
  );
  if (sceneIndex === 2 || sceneIndex === 3) cast.push(
    { id: `rumour-${sceneIndex}`, kind: 'rumour', x: rumour.x, z: rumour.z + 5, vx: 0, vz: 0, spawned: false, cut: false, age: 0, radius: 0.5 },
    { id: `red-monitor-${sceneIndex}`, kind: 'red-monitor', x: hostile.x, z: hostile.z + 6, vx: 0, vz: 0, spawned: true, cut: false, age: 0, heading: Math.atan2(hostile.z - (hostile.z + 6), end.x - hostile.x), range: 18, halfAngle: Math.PI / 6 },
    { id: `continuity-${sceneIndex}`, kind: 'continuity', x: prop.x, z: prop.z - 2, vx: 0, vz: 0, spawned: false, cut: false, age: 0, propIndex: 0, propSequence: sequence.map((kind) => propKinds.indexOf(kind)), heading: 0 },
  );
  return cast;
}

function makeScene(seed: number, sceneIndex: number, carry: SimState): SimState {
  const generated = generateScene(sceneSeed(seed, sceneIndex), Math.min(sceneIndex, 3), 9);
  const sceneKinds = sceneIndex === 0 ? new Set(['urchin', 'glass', 'extras', 'reel'])
    : sceneIndex === 1 ? new Set(['urchin', 'glass', 'extras', 'reel', 'boulder', 'bridge', 'stagehand']) : undefined;
  const generatedEntities = sceneKinds ? generated.entities.filter((entity) => sceneKinds.has(entity.kind)) : generated.entities;
  const next = createState(seed, [...generatedEntities, ...addM6Cast({ ...carry, path: generated.path }, seed, sceneIndex)]);
  next.path = generated.path;
  next.forks = generated.forks;
  next.tiles = generated.tiles;
  const start = generated.path[0];
  if (start) {
    next.talent.x = start.x;
    next.talent.z = start.z;
    next.camera.x = start.x;
    next.camera.z = start.z;
  }
  next.tick = carry.tick;
  next.totalDistance = carry.totalDistance;
  next.film = carry.film + (sceneIndex > 0 ? TUNING.sceneFilm : 0);
  next.score = carry.score;
  next.cuts = [...carry.cuts];
  next.shoot = { sceneIndex, biome: biomes[sceneIndex]!, wrapDistance: null, wrapCaught: false, finaleTicks: 0 };
  return next;
}

/** Start the full three-scene Shoot and its 40-second finale. */
export function createShootState(seed: number): SimState {
  return makeScene(seed >>> 0, 0, createState(seed));
}

/** Build an isolated deterministic scene for scripted tests and visual review. */
export function createShootSceneState(seed: number, sceneIndex: number): SimState {
  if (!Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex > 3) throw new RangeError('sceneIndex must be 0..3');
  return makeScene(seed >>> 0, sceneIndex, createState(seed));
}

/** Advance a Shoot; scene wraps roll into the next biome and the finale is a 40-second Long Take. */
export function stepShoot(previous: SimState, input: InputFrame): SimState {
  if (!previous.shoot || previous.failed) return step(previous, input);
  let next = step(previous, input);
  const shoot = next.shoot!;
  if (shoot.sceneIndex === 3) {
    shoot.finaleTicks++;
    if (!shoot.wrapCaught && shoot.finaleTicks >= TUNING.finalTakeSeconds * TUNING.tickRate) next.failed = 'wrapped';
    return next;
  }
  if (next.failed === 'wrapped' && !shoot.wrapCaught) {
    return makeScene(previous.seed, shoot.sceneIndex + 1, next);
  }
  return next;
}

