import { playRun } from '../bots/players';
import { createState } from '../sim/world';
import { generateScene } from './generate';
import type { GeneratedScene } from './types';

const memo = new Map<number, { scene: GeneratedScene; sourceSeed: number; attempts: number }>();
const memoLimit = 128;
const seedStep = 0x9e3779b9;
type CandidateCheck = (seed: number) => { adaptiveCompleted: boolean; trackerCompleted: boolean };
const checkWithReferenceBots: CandidateCheck = (seed) => ({
  adaptiveCompleted: playRun(seed, 'adaptive').completed,
  trackerCompleted: playRun(seed, 'tracker').completed,
});

/** Return a deterministic, bot-screened scene; rejected candidates are rerolled from the input seed. */
export function generateValidatedScene(seed: number, maxAttempts = 64, checkCandidate: CandidateCheck = checkWithReferenceBots) {
  const key = seed >>> 0;
  const cached = memo.get(key);
  if (cached) return cached;
  let candidateSeed = key;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const scene = generateScene(candidateSeed);
    const result = checkCandidate(candidateSeed);
    if (result.adaptiveCompleted && !result.trackerCompleted) {
      const result = { scene, sourceSeed: candidateSeed, attempts: attempt };
      memo.set(key, result);
      if (memo.size > memoLimit) memo.delete(memo.keys().next().value as number);
      return result;
    }
    candidateSeed = (candidateSeed + seedStep) >>> 0;
  }
  throw new Error(`Could not find a bot-validated scene for seed ${key} in ${maxAttempts} attempts`);
}

/** Construct a playable SimState from the memoized bot-screened scene. */
export function createValidatedState(seed: number, maxAttempts = 64) {
  const { scene } = generateValidatedScene(seed, maxAttempts);
  const state = createState(scene.seed, scene.entities);
  state.path = scene.path;
  state.forks = scene.forks;
  state.tiles = scene.tiles;
  return state;
}

export function validationMemoSize() { return memo.size; }
