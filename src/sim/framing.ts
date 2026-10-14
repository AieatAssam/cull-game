import { seededRange } from './rng';
import { TUNING } from './tuning';
import type { CastEntity, PathFork, SimState } from './types';

/** `opened` is the close-call count when the Talent reached the gate; defang needs a close cut after that. */
export interface ShotGoal { at: number; kind: 'defang' | 'portrait'; done: boolean; opened?: number; }

type PathPoint = { x: number; z: number };

/** Where the Talent stops for a gate at `at` (it is held once `x >= at - 0.35`). */
export function gateStop(path: PathPoint[], at: number): PathPoint {
  const x = at - 0.35;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (x <= b.x) {
      const t = b.x === a.x ? 0 : Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
      return { x, z: a.z + (b.z - a.z) * t };
    }
  }
  return { x, z: path.at(-1)?.z ?? 0 };
}

/**
 * Two composition gates. Without a seed they sit at 20% / 48% of the span (legacy fixtures).
 * With a seed (bible M2) they are seeded per scene and slid forward off fork detours and away from Glass,
 * so the stand-in on the defang mark always stands on solid, walked ground.
 */
export function shotListForPath(path: PathPoint[], seed?: number, forks: PathFork[] = [], entities: CastEntity[] = []): ShotGoal[] {
  const start = path[0]?.x ?? 0;
  const end = path.at(-1)?.x ?? start + 80;
  const span = Math.max(24, end - start);
  if (seed === undefined) {
    return [
      { at: start + span * 0.2, kind: 'defang', done: false },
      { at: start + span * 0.48, kind: 'portrait', done: false },
    ];
  }
  const [defangMin, defangMax] = TUNING.defangGateFraction;
  const [gapMin, gapMax] = TUNING.portraitGateGap;
  const detours = forks.map((fork) => [path[fork.at]?.x ?? 0, path[fork.at + 2]?.x ?? path.at(-1)?.x ?? 0] as const);
  const glass = entities.filter((entity) => entity.kind === 'glass').map((entity) => entity.x);
  const clear = (at: number) => {
    const stop = at - 0.35;
    return detours.every(([from, to]) => stop + TUNING.gateMarkDistance + 1 < from || stop - 1 > to)
      && glass.every((x) => x < stop - 3 || x > stop + TUNING.glassShatterRadius);
  };
  const slide = (at: number, limit: number) => {
    for (let candidate = at; candidate <= limit; candidate += 0.5) if (clear(candidate)) return candidate;
    return at;
  };
  const defang = slide(start + span * seededRange(seed, 0, defangMin, defangMax), start + span * 0.4);
  const portrait = slide(defang + span * seededRange(seed, 1, gapMin, gapMax), start + span * 0.68);
  return [
    { at: defang, kind: 'defang', done: false },
    { at: portrait, kind: 'portrait', done: false },
  ];
}

/** The stand-in on each defang mark: an Urchin that waits `gateMarkDistance` ahead of where the Talent is held. */
export function gateCast(path: PathPoint[], shots: ShotGoal[]): CastEntity[] {
  return shots.flatMap((shot, index) => {
    if (shot.kind !== 'defang') return [];
    const stop = gateStop(path, shot.at);
    return [{ id: `gate-urchin-${index}`, kind: 'urchin', x: stop.x + TUNING.gateMarkDistance, z: stop.z, vx: 0, vz: 0, spawned: false, cut: false, age: 0, gate: index } satisfies CastEntity];
  });
}

/** True while the Talent is held at shot `index` (its HUD text is up). */
export function gateOpen(state: SimState, index: number): boolean {
  const shot = state.shots?.[index];
  return Boolean(shot && !shot.done && state.talent.x >= shot.at - 0.35 && state.shots!.slice(0, index).every((before) => before.done));
}

export function markShots(state: SimState) {
  const shots = state.shots;
  if (!shots?.length) return;
  const defangIndex = shots.findIndex((shot) => shot.kind === 'defang');
  const defang = shots[defangIndex];
  if (defang && !defang.done) {
    if (defang.opened === undefined && gateOpen(state, defangIndex)) defang.opened = state.closeCalls;
    // Bible M2: a zoom alone no longer defangs; it needs a close cut made since the gate opened.
    if (defang.opened !== undefined && state.closeCalls > defang.opened) {
      defang.done = true;
      defang.releaseTick = state.tick + Math.round(gateReleaseSeconds(state) * TUNING.tickRate);
      // The stand-in leaves its mark once the shot is made, whoever was cut.
      for (const entity of state.entities) if (entity.gate === defangIndex && !entity.cut) { entity.cut = true; entity.spawned = false; }
    }
    // A stand-in cut early (far from her) is re-dressed on its mark once the shot is called: the shot still needs a close cut.
    if (!defang.done && defang.opened !== undefined) {
      for (const entity of state.entities) if (entity.gate === defangIndex && entity.cut) { entity.cut = false; entity.spawned = false; entity.age = 0; }
    }
  }
  const portrait = shots.find((shot) => shot.kind === 'portrait');
  if (portrait && !portrait.done && defang?.done && state.camera.zoom >= 16 && state.camera.zoom <= 34) portrait.done = true;
}

export function shotBlocksTalent(state: SimState): boolean {
  return state.shots?.some((shot) => !shot.done && state.talent.x >= shot.at - 0.35) || releasing(state);
}

/** The ACTION beat's length for the current scene (the strip world plays as scene 0). */
export function gateReleaseSeconds(state: Pick<SimState, 'shoot'>): number {
  const byScene = TUNING.gateReleaseSecondsByScene;
  return byScene[Math.min(state.shoot?.sceneIndex ?? 0, byScene.length - 1)]!;
}

/** Unit direction she will walk off her mark (the next path node, or the fork branch already taken), or null at the end. */
export function exitHeading(state: Pick<SimState, 'talent' | 'path' | 'forks' | 'routeChoices'>): { x: number; z: number } | null {
  const { talent } = state;
  const fork = state.forks.find((entry) => entry.at === talent.pathIndex);
  const choice = fork ? state.routeChoices[fork.at] : undefined;
  const next = fork && choice !== undefined ? fork.options[choice] : state.path[talent.pathIndex + 1];
  if (!next) return null;
  const length = Math.hypot(next.x - talent.x, next.z - talent.z);
  return length > 1e-6 ? { x: (next.x - talent.x) / length, z: (next.z - talent.z) / length } : null;
}

/** The "ACTION" beat: a made defang still holds her on her mark for `gateReleaseSeconds` before she walks on. */
export function releasing(state: Pick<SimState, 'shots' | 'tick'>): boolean {
  return state.shots?.some((shot) => shot.releaseTick !== undefined && state.tick < shot.releaseTick) ?? false;
}

export function activeShot(state: SimState): ShotGoal | undefined {
  return state.shots?.find((shot) => !shot.done && state.talent.x >= shot.at - 0.35);
}
