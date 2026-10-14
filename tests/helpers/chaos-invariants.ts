import { mulberry32 } from '../../src/sim/rng';
import { step } from '../../src/sim/step';
import { TUNING } from '../../src/sim/tuning';
import { createGeneratedState } from '../../src/sim/world';
import type { InputFrame, SimState } from '../../src/sim/types';

function chaosInput(random: () => number): InputFrame {
  return {
    panX: Math.round(random() * 254 - 127),
    panZ: Math.round(random() * 254 - 127),
    zoom: Math.round(random() * 254 - 127),
    rotate: random() < 0.02 ? (random() < 0.5 ? -1 : 1) : 0,
    hold: random() < 0.01,
    steady: random() < 0.1,
    cut: random() < 0.02,
  };
}

export function simInvariantErrors(state: SimState, includeStatic = false): string[] {
  const errors: string[] = [];
  const visit = (value: unknown, path: string) => {
    if (typeof value === 'number' && !Number.isFinite(value)) errors.push(`${path} is non-finite`);
    else if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
  };
  visit(state.camera, 'camera');
  visit(state.talent, 'talent');
  visit(state.film, 'film');
  visit(state.score, 'score');
  for (const entity of state.entities) visit(entity, `entity.${entity.id}`);
  Object.entries(state.routeChoices).forEach(([at, choice]) => visit(choice, `routeChoices.${at}`));
  if (includeStatic) {
    state.path.forEach((point, index) => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) errors.push(`path[${index}] is non-finite`);
    });
    state.tiles.forEach((tile, index) => {
      if (!Number.isFinite(tile.x) || !Number.isFinite(tile.z)) errors.push(`tiles[${index}] is non-finite`);
    });
  }
  if (state.film < 0) errors.push('film is negative');
  if (state.camera.zoom < TUNING.minZoom || state.camera.zoom > TUNING.maxZoom) errors.push('camera zoom is outside tuning bounds');
  if (state.talent.pathIndex < 0 || state.talent.pathIndex >= state.path.length || !Number.isInteger(state.talent.pathIndex)) errors.push('talent path index is invalid');
  if (new Set(state.entities.map((entity) => entity.id)).size !== state.entities.length) errors.push('entity IDs are not unique');
  for (const [at, choice] of Object.entries(state.routeChoices)) {
    const fork = state.forks.find((entry) => entry.at === Number(at));
    if (!fork || !Number.isInteger(choice) || choice < 0 || choice >= fork.options.length) errors.push(`route choice ${at} is invalid`);
  }
  return errors;
}

export function runChaosInvariantBatch(runs = 1_000, maxTicks = 900) {
  let steps = 0;
  for (let seed = 1; seed <= runs; seed++) {
    let state = createGeneratedState(seed, 0);
    const initialErrors = simInvariantErrors(state, true);
    if (initialErrors.length) return { runs: seed, steps, valid: false, errors: initialErrors };
    const random = mulberry32((seed ^ 0xb07b07) >>> 0);
    for (let tick = 0; tick < maxTicks && !state.failed; tick++) {
      state = step(state, chaosInput(random));
      steps++;
      const errors = simInvariantErrors(state);
      if (errors.length) return { runs: seed, steps, valid: false, errors };
    }
  }
  return { runs, steps, valid: true, errors: [] as string[] };
}
