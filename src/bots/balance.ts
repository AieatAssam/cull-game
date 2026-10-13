/**
 * Balance harness (bible §5, M1). Report-only: it measures, it never fails the build.
 *
 *   npm run balance -- --stage=0 --mode=strip|shoot|both --seeds=200 --jitter=8 [--workers=N] [--out=reports/balance]
 *
 * Writes `reports/balance/stage-<n>-<mode>.json`. All bots see the world through `observe.ts` (player-visible only).
 * Raw seeds 1..N, never validated/filtered seeds.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { createShootSceneState, createShootState, stepShoot } from '../sim/shoot';
import { step } from '../sim/step';
import { TUNING } from '../sim/tuning';
import { createGeneratedState } from '../sim/world';
import type { CastEntity, FailReason, InputFrame, SimState } from '../sim/types';
import { createDriver, jitterTuning, type BalanceBot } from './balance-bots';

export type BalanceMode = 'strip' | 'shoot';
/** Entity kind that ended the take, or the non-entity cause. */
export type Killer = CastEntity['kind'] | 'offscreen' | 'film' | 'wrap-strike' | 'unknown';

export interface RunTask { stage: number; mode: BalanceMode; bot: BalanceBot; seed: number; variant: number | null; }
export interface RunResult {
  bot: BalanceBot; seed: number; variant: number | null;
  completed: boolean; timedOut: boolean; failed: FailReason | null; killer: Killer | null;
  scene: string; distance: number; seconds: number;
}

interface StageDef {
  create: Record<BalanceMode, (seed: number) => SimState>;
  advance: Record<BalanceMode, (state: SimState, input: InputFrame) => SimState>;
  maxTicks: Record<BalanceMode, number>;
  sceneStates: Record<BalanceMode, (seed: number) => Array<{ scene: string; state: SimState }>>;
  /** §5 targets for this stage (full Shoot). */
  targets: StageTargets;
}
export interface StageTargets { passiveMax: number; metronomeMax: number; adaptiveMin: number; gapMin: number; distanceRatioMin: number; wideCloseMax: number; sceneShareMax: number; }

const stripTicks = (TUNING.startFilm + 14 * TUNING.reelFilm + TUNING.sceneFilm) * TUNING.tickRate; // = playRun's cap
const shootTicks = 8 * 60 * TUNING.tickRate; // = validate:m6's cap

export const STAGES: Record<number, StageDef> = {
  0: {
    create: { strip: (seed) => createGeneratedState(seed, 0), shoot: createShootState },
    advance: { strip: step, shoot: stepShoot },
    maxTicks: { strip: stripTicks, shoot: shootTicks },
    sceneStates: {
      strip: (seed) => [{ scene: 'STRIP', state: createGeneratedState(seed, 0) }],
      shoot: (seed) => [0, 1, 2, 3].map((index) => {
        const state = createShootSceneState(seed, index);
        return { scene: state.shoot!.biome, state };
      }),
    },
    targets: { passiveMax: 0.25, metronomeMax: 0.05, adaptiveMin: 0.85, gapMin: 0.55, distanceRatioMin: 1.5, wideCloseMax: 0.7, sceneShareMax: 0.5 },
  },
};

function stageDef(stage: number): StageDef {
  const def = STAGES[stage];
  if (!def) throw new RangeError(`Stage ${stage} is not shipped yet (shipped: ${Object.keys(STAGES).join(', ')})`);
  return def;
}

const radiusOf = (entity: CastEntity) => entity.kind === 'boulder' ? TUNING.boulderRadius : entity.kind === 'urchin' ? TUNING.urchinRadius
  : entity.kind === 'swarm' ? TUNING.swarmRadius : entity.kind === 'extras' ? TUNING.extrasRadius : entity.kind === 'rumour' ? entity.radius ?? 0.5 : 0.55;

/**
 * Names what ended the take, from the final state only (the sim keeps no killer record and M1 may not touch it).
 * Mirrors the contact rules in `step.ts`; with simultaneous contacts the first entity in array order wins, as in `step`.
 */
export function inferKiller(state: SimState): Killer | null {
  const { failed, talent } = state;
  if (!failed) return null;
  if (failed === 'lost-talent') return 'offscreen';
  if (failed === 'out-of-film') return 'film';
  if (failed === 'wrapped') return state.shoot?.wrapCaught ? 'wrap-strike' : null;
  const talentRadius = TUNING.talentRadii[Math.min(talent.lodTier ?? 1, 3)]!;
  for (const entity of state.entities) {
    const tier = entity.lodTier ?? 4;
    if (failed === 'fell') {
      // A hostile monitor's cone can cut glass that never spawned, so glass is checked whether or not it spawned.
      if (entity.kind === 'glass' && entity.cut && Math.abs(talent.x - entity.x) <= 0.5 && Math.abs(talent.z - entity.z) <= 0.5) return 'glass';
      if (entity.kind === 'bridge' && !entity.cut && tier >= 2 && Math.abs(talent.x - entity.x) <= TUNING.bridgeLength / 2
        && entity.spawned && Math.abs(talent.z - entity.z) <= 0.6 + talentRadius) return 'bridge';
      continue;
    }
    if (entity.cut || !entity.spawned) continue;
    const close = Math.hypot(entity.x - talent.x, entity.z - talent.z) <= radiusOf(entity) + talentRadius;
    if (close && ((entity.kind === 'boulder' && tier <= 0) || (entity.kind === 'urchin' && tier <= 1) || entity.kind === 'swarm')) return entity.kind;
    if (entity.kind === 'extras' && tier >= 2 && entity.members?.some((member) => !member.cut
      && Math.hypot(entity.x + member.dx - talent.x, entity.z + member.dz - talent.z) <= TUNING.extrasContactRadius + talentRadius)) return 'extras';
  }
  if (failed === 'hit' && state.entities.some((entity) => entity.kind === 'red-monitor' && !entity.cut
    && (entity.lockTicks ?? 0) >= TUNING.hostileLockSeconds * TUNING.tickRate)) return 'red-monitor';
  return 'unknown';
}

export function isCompleted(mode: BalanceMode, state: SimState): boolean {
  if (mode === 'shoot') {
    const shoot = state.shoot;
    return Boolean(shoot && shoot.sceneIndex === 3 && state.failed === 'wrapped' && !shoot.wrapCaught
      && shoot.finaleTicks >= TUNING.finalTakeSeconds * TUNING.tickRate);
  }
  const pathEnd = state.path.at(-1)?.x ?? 0;
  return state.failed === 'wrapped' || (!state.failed && state.talent.x >= pathEnd - 1);
}

export function runTask(task: RunTask): RunResult {
  const def = stageDef(task.stage);
  const tuning = task.variant === null ? undefined : jitterTuning(task.seed, task.variant);
  const drive = createDriver(task.bot, task.seed, tuning);
  const advance = def.advance[task.mode];
  const maxTicks = def.maxTicks[task.mode];
  let state = def.create[task.mode](task.seed);
  const startTick = state.tick;
  while (!state.failed && state.tick - startTick < maxTicks) state = advance(state, drive(state));
  const completed = isCompleted(task.mode, state);
  return {
    bot: task.bot, seed: task.seed, variant: task.variant, completed,
    timedOut: !completed && !state.failed,
    failed: completed ? null : state.failed,
    killer: completed ? null : inferKiller(state),
    scene: state.shoot?.biome ?? 'STRIP',
    distance: task.mode === 'shoot' ? state.totalDistance : state.talent.x,
    seconds: (state.tick - startTick) / TUNING.tickRate,
  };
}

// ---------------------------------------------------------------- aggregation

const increment = (record: Record<string, number>, key: string) => { record[key] = (record[key] ?? 0) + 1; };
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const round = (value: number, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

export interface BotSummary {
  runs: number; completed: number; completion: number; meanDistance: number; timeouts: number;
  clearSeconds: { min: number; mean: number; max: number } | null;
  failReasons: Record<string, number>; killers: Record<string, number>; scenes: Record<string, number>;
  /** scene → killer → deaths */
  sceneKillers: Record<string, Record<string, number>>;
}

export function summarize(results: RunResult[]): BotSummary {
  const failReasons: Record<string, number> = {};
  const killers: Record<string, number> = {};
  const scenes: Record<string, number> = {};
  const sceneKillers: Record<string, Record<string, number>> = {};
  const clears = results.filter((result) => result.completed).map((result) => result.seconds);
  for (const result of results) {
    if (result.completed) continue;
    increment(failReasons, result.failed ?? 'timeout');
    const killer = result.killer ?? (result.timedOut ? 'timeout' : 'none');
    increment(killers, killer);
    increment(scenes, result.scene);
    increment(sceneKillers[result.scene] ??= {}, killer);
  }
  return {
    runs: results.length, completed: clears.length, completion: round(results.length ? clears.length / results.length : 0),
    meanDistance: round(mean(results.map((result) => result.distance)), 2), timeouts: results.filter((result) => result.timedOut).length,
    clearSeconds: clears.length ? { min: round(Math.min(...clears), 1), mean: round(mean(clears), 1), max: round(Math.max(...clears), 1) } : null,
    failReasons, killers, scenes, sceneKillers,
  };
}

/** Wins out of k per seed for a jittered bot. */
export function winsPerSeed(results: RunResult[]): Map<number, number> {
  const wins = new Map<number, number>();
  for (const result of results) wins.set(result.seed, (wins.get(result.seed) ?? 0) + (result.completed ? 1 : 0));
  return wins;
}

export interface Check { name: string; value: string; target: string; pass: boolean | null; }

export interface LuckInput {
  mode: BalanceMode; k: number; targets: StageTargets;
  gatekeeperJitter: Map<number, number>; adaptiveJitter: Map<number, number>;
  /** per-seed completion of the exact bots, by bot */
  exact: Record<'adaptive' | 'tracker' | 'gatekeeper', RunResult[]>;
  passiveBot: 'tracker' | 'gatekeeper';
  passiveSummary: BotSummary; adaptiveSummary: BotSummary;
  /** minimum roster kinds per scene over all seeds */
  rosterKinds: Record<string, number>;
}

const pct = (value: number) => `${round(value * 100, 1)}%`;

/** §5 luck checks. `pass: null` means not applicable to this stage/mode. */
export function luckChecks(input: LuckInput): Check[] {
  const { k } = input;
  const checks: Check[] = [];
  if (k > 0) {
    const gk = [...input.gatekeeperJitter.entries()];
    const lucky = gk.filter(([, wins]) => wins >= k / 2).length / Math.max(1, gk.length);
    const perfect = gk.filter(([, wins]) => wins === k).map(([seed]) => seed);
    checks.push({ name: `passive can't luck through: jitter(gatekeeper, ${k}) seeds with ≥${Math.ceil(k / 2)}/${k} wins`, value: pct(lucky), target: '≤ 2%', pass: lucky <= 0.02 });
    checks.push({ name: `passive can't luck through: seeds at ${k}/${k}`, value: perfect.length ? `${perfect.length} (${perfect.slice(0, 20).join(', ')}${perfect.length > 20 ? ', …' : ''})` : 'none', target: 'none', pass: perfect.length === 0 });
    const ad = [...input.adaptiveJitter.entries()];
    const reliable = ad.filter(([, wins]) => wins >= Math.ceil(k * 0.75)).length / Math.max(1, ad.length);
    const suspects = ad.filter(([, wins]) => wins < k / 2).map(([seed]) => seed);
    checks.push({ name: `skill is reliable: jitter(adaptive, ${k}) seeds with ≥${Math.ceil(k * 0.75)}/${k} wins`, value: pct(reliable), target: '≥ 85%', pass: reliable >= 0.85 });
    checks.push({ name: `generator suspects: seeds below ${Math.ceil(k / 2)}/${k} adaptive wins`, value: `${suspects.length}${suspects.length ? ` (${suspects.slice(0, 40).join(', ')}${suspects.length > 40 ? ', …' : ''})` : ''}`, target: 'listed', pass: null });
  }
  const seeds = input.exact.adaptive.map((result) => result.seed).sort((a, b) => a - b);
  const bucketSize = 20;
  const buckets: number[][] = [];
  for (let i = 0; i < seeds.length; i += bucketSize) buckets.push(seeds.slice(i, i + bucketSize));
  const rate = (results: RunResult[], bucket: number[]) => {
    const set = new Set(bucket);
    const inBucket = results.filter((result) => set.has(result.seed));
    return inBucket.filter((result) => result.completed).length / Math.max(1, inBucket.length);
  };
  if (buckets.length >= 2) {
    const adaptiveRates = buckets.map((bucket) => rate(input.exact.adaptive, bucket));
    const average = mean(adaptiveRates);
    const sd = Math.sqrt(mean(adaptiveRates.map((value) => (value - average) ** 2)));
    checks.push({ name: `seed variance: Adaptive SD over ${buckets.length} buckets of ${bucketSize}`, value: `${round(sd * 100, 1)} pp`, target: '≤ 8 pp', pass: sd <= 0.08 });
    const passiveWorst = Math.max(...buckets.map((bucket) => Math.max(rate(input.exact.tracker, bucket), rate(input.exact.gatekeeper, bucket))));
    const limit = input.targets.passiveMax + 0.15;
    checks.push({ name: 'seed variance: passive worst bucket', value: pct(passiveWorst), target: `≤ ${pct(limit)}`, pass: passiveWorst <= limit });
  }
  checks.push({ name: 'no coin flips: NoKit on Day 3', value: 'n/a', target: '≤ 10%', pass: null });
  const reasons = Object.entries(input.passiveSummary.failReasons);
  const deaths = reasons.reduce((sum, [, count]) => sum + count, 0);
  const top = reasons.sort((a, b) => b[1] - a[1])[0];
  const topShare = top && deaths ? top[1] / deaths : 0;
  checks.push({ name: `never samey: passive (${input.passiveBot}) FailReasons`, value: `${reasons.length} reasons, top ${top ? `${top[0]} ${pct(topShare)}` : 'none'}`, target: '≥ 3, none > 60%', pass: reasons.length >= 3 && topShare <= 0.6 });
  const thin = Object.entries(input.rosterKinds).filter(([, kinds]) => kinds < 3);
  checks.push({ name: 'never samey: roster kinds per scene (min over seeds)', value: Object.entries(input.rosterKinds).map(([scene, kinds]) => `${scene} ${kinds}`).join(', '), target: '≥ 3 each', pass: thin.length === 0 });
  const clear = input.adaptiveSummary.clearSeconds;
  checks.push({
    name: 'duration: Adaptive clear sim time', value: clear ? `${clear.min} / ${clear.mean} / ${clear.max} s` : 'no clears', target: '180–480 s',
    pass: input.mode === 'shoot' ? Boolean(clear && clear.min >= 180 && clear.max <= 480) : null,
  });
  return checks;
}

/** Share of runs that got past the first Shoot scene (died later or completed). */
export function backlotClear(summary: BotSummary): number {
  return summary.runs ? 1 - (summary.scenes.BACKLOT ?? 0) / summary.runs : 0;
}

export function stageGates(mode: BalanceMode, targets: StageTargets, bots: Record<string, BotSummary>, passiveBot: 'tracker' | 'gatekeeper'): Check[] {
  const adaptive = bots.adaptive!;
  const passive = bots[passiveBot]!;
  const sceneDeaths = Object.entries(adaptive.scenes);
  const adaptiveDeaths = sceneDeaths.reduce((sum, [, count]) => sum + count, 0);
  const topScene = sceneDeaths.sort((a, b) => b[1] - a[1])[0];
  const sceneShare = topScene && adaptiveDeaths ? topScene[1] / adaptiveDeaths : 0;
  const ratio = (a: number, b: number) => (b ? round(a / b, 3) : 0);
  return [
    { name: `passive (best of tracker, gatekeeper = ${passiveBot})`, value: pct(passive.completion), target: `≤ ${pct(targets.passiveMax)}`, pass: passive.completion <= targets.passiveMax },
    { name: 'metronome', value: pct(bots.metronome!.completion), target: `≤ ${pct(targets.metronomeMax)}`, pass: bots.metronome!.completion <= targets.metronomeMax },
    { name: 'adaptive', value: pct(adaptive.completion), target: `≥ ${pct(targets.adaptiveMin)}`, pass: adaptive.completion >= targets.adaptiveMin },
    { name: 'adaptive − passive', value: `${round((adaptive.completion - passive.completion) * 100, 1)} pp`, target: `≥ ${round(targets.gapMin * 100, 1)} pp`, pass: adaptive.completion - passive.completion >= targets.gapMin },
    { name: 'adaptive / passive mean distance', value: `${ratio(adaptive.meanDistance, passive.meanDistance)}×`, target: `≥ ${targets.distanceRatioMin}×`, pass: ratio(adaptive.meanDistance, passive.meanDistance) >= targets.distanceRatioMin },
    { name: 'wide / adaptive distance', value: `${ratio(bots.wide!.meanDistance, adaptive.meanDistance)}×`, target: `≤ ${targets.wideCloseMax}×`, pass: ratio(bots.wide!.meanDistance, adaptive.meanDistance) <= targets.wideCloseMax },
    { name: 'close / adaptive distance', value: `${ratio(bots.close!.meanDistance, adaptive.meanDistance)}×`, target: `≤ ${targets.wideCloseMax}×`, pass: ratio(bots.close!.meanDistance, adaptive.meanDistance) <= targets.wideCloseMax },
    {
      name: 'one scene\'s share of adaptive deaths', value: topScene ? `${topScene[0]} ${pct(sceneShare)}` : 'no deaths', target: `≤ ${pct(targets.sceneShareMax)}`,
      pass: mode === 'shoot' ? sceneShare <= targets.sceneShareMax : null,
    },
    { name: 'chaos completions', value: String(bots.chaos!.completed), target: '0', pass: bots.chaos!.completed === 0 },
    { name: 'adaptive is the ceiling (perfect-information reflexes, no leash)', value: pct(adaptive.completion), target: 'ceiling', pass: null },
    ...HUMAN_BOTS.filter((bot) => bots[bot]).map((bot) => ({
      name: `${bot} ${mode === 'shoot' ? 'Backlot clear' : 'strip clear'}`, value: pct(mode === 'shoot' ? backlotClear(bots[bot]!) : bots[bot]!.completion),
      target: '60–80% (target, report-only)', pass: null,
    })),
  ];
}

export function rosterKinds(stage: number, mode: BalanceMode, seeds: number[]): Record<string, number> {
  const minimum: Record<string, number> = {};
  for (const seed of seeds) {
    for (const { scene, state } of stageDef(stage).sceneStates[mode](seed)) {
      const kinds = new Set(state.entities.map((entity) => entity.kind)).size;
      minimum[scene] = Math.min(minimum[scene] ?? Infinity, kinds);
    }
  }
  return minimum;
}

// ---------------------------------------------------------------- running

export interface BalanceOptions { stage: number; mode: BalanceMode; seeds: number; jitter: number; workers: number; bots?: BalanceBot[]; }

export interface BalanceReport {
  stage: number; mode: BalanceMode; seeds: [number, number]; jitter: number; command: string;
  note: string;
  passive: { bot: 'tracker' | 'gatekeeper'; completion: number };
  bots: Record<string, BotSummary>;
  jitterBots: Record<string, BotSummary & { winsHistogram: number[] }>;
  gates: Check[]; luck: Check[];
  runs: Array<Omit<RunResult, 'variant'>>;
  jitterWins: Record<string, Record<number, number>>;
}

export const DEFAULT_BOTS: BalanceBot[] = ['adaptive', 'tracker', 'gatekeeper', 'metronome', 'wide', 'close', 'chaos', 'human-keys', 'human-touch'];
const HUMAN_BOTS = ['human-keys', 'human-touch'] as const;

export function balanceTasks(options: BalanceOptions): RunTask[] {
  const tasks: RunTask[] = [];
  for (let seed = 1; seed <= options.seeds; seed++) {
    for (const bot of options.bots ?? DEFAULT_BOTS) tasks.push({ stage: options.stage, mode: options.mode, bot, seed, variant: null });
    for (let variant = 0; variant < options.jitter; variant++) {
      for (const bot of ['gatekeeper', 'adaptive'] as const) tasks.push({ stage: options.stage, mode: options.mode, bot, seed, variant });
    }
  }
  return tasks;
}

async function runPool(tasks: RunTask[], workers: number): Promise<RunResult[]> {
  if (workers <= 1) return tasks.map(runTask);
  const results: RunResult[] = new Array(tasks.length);
  let next = 0;
  const self = fileURLToPath(import.meta.url);
  await Promise.all(Array.from({ length: Math.min(workers, tasks.length) }, () => new Promise<void>((done, fail) => {
    const child = fork(self, [], { execArgv: ['--import', 'tsx'], env: { ...process.env, CULL_BALANCE_WORKER: '1' } });
    const feed = () => {
      if (next >= tasks.length) { child.disconnect(); done(); return; }
      const index = next++;
      child.send({ index, task: tasks[index] });
    };
    child.on('message', (message: { index: number; result: RunResult }) => { results[message.index] = message.result; feed(); });
    child.on('error', fail);
    child.on('exit', (code) => { if (code) fail(new Error(`balance worker exited with ${code}`)); });
    feed();
  })));
  return results;
}

export async function runBalance(options: BalanceOptions, command = ''): Promise<BalanceReport> {
  const def = stageDef(options.stage);
  const results = await runPool(balanceTasks(options), options.workers);
  const exact = results.filter((result) => result.variant === null);
  const jittered = results.filter((result) => result.variant !== null);
  const bots: Record<string, BotSummary> = {};
  for (const bot of options.bots ?? DEFAULT_BOTS) bots[bot] = summarize(exact.filter((result) => result.bot === bot));
  const passiveBot = (bots.tracker?.completion ?? 0) > (bots.gatekeeper?.completion ?? 0) ? 'tracker' : 'gatekeeper';
  const jitterBots: BalanceReport['jitterBots'] = {};
  const jitterWins: BalanceReport['jitterWins'] = {};
  const winsMaps: Record<string, Map<number, number>> = {};
  for (const bot of ['gatekeeper', 'adaptive'] as const) {
    const runs = jittered.filter((result) => result.bot === bot);
    if (!runs.length) continue;
    const wins = winsPerSeed(runs);
    winsMaps[bot] = wins;
    const histogram = Array.from({ length: options.jitter + 1 }, () => 0);
    for (const count of wins.values()) histogram[count]!++;
    jitterBots[bot] = { ...summarize(runs), winsHistogram: histogram };
    jitterWins[bot] = Object.fromEntries(wins);
  }
  const seeds = Array.from({ length: options.seeds }, (_, index) => index + 1);
  const luck = luckChecks({
    mode: options.mode, k: options.jitter, targets: def.targets,
    gatekeeperJitter: winsMaps.gatekeeper ?? new Map(), adaptiveJitter: winsMaps.adaptive ?? new Map(),
    exact: { adaptive: exact.filter((r) => r.bot === 'adaptive'), tracker: exact.filter((r) => r.bot === 'tracker'), gatekeeper: exact.filter((r) => r.bot === 'gatekeeper') },
    passiveBot, passiveSummary: bots[passiveBot]!, adaptiveSummary: bots.adaptive!,
    rosterKinds: rosterKinds(options.stage, options.mode, seeds),
  });
  return {
    stage: options.stage, mode: options.mode, seeds: [1, options.seeds], jitter: options.jitter, command,
    note: 'Report-only. Raw seeds. Bots read only player-visible state (src/bots/observe.ts). §5 targets are for the full Shoot; strip gates are informational.',
    passive: { bot: passiveBot, completion: bots[passiveBot]!.completion },
    bots, jitterBots, gates: stageGates(options.mode, def.targets, bots, passiveBot), luck,
    runs: exact.map((result) => ({ bot: result.bot, seed: result.seed, completed: result.completed, timedOut: result.timedOut, failed: result.failed,
      killer: result.killer, scene: result.scene, distance: round(result.distance, 2), seconds: result.seconds })),
    jitterWins,
  };
}

export function formatReport(report: BalanceReport): string {
  const lines = [`Stage ${report.stage} · ${report.mode} · seeds ${report.seeds[0]}..${report.seeds[1]} · jitter ${report.jitter}`];
  lines.push('bot         completion  mean dist  timeouts  deaths by killer');
  for (const [bot, summary] of Object.entries(report.bots)) {
    const killers = Object.entries(summary.killers).sort((a, b) => b[1] - a[1]).map(([kind, count]) => `${kind} ${count}`).join(', ');
    lines.push(`${bot.padEnd(11)} ${pct(summary.completion).padStart(10)}  ${summary.meanDistance.toFixed(1).padStart(9)}  ${String(summary.timeouts).padStart(8)}  ${killers}`);
  }
  for (const bot of ['adaptive', ...HUMAN_BOTS]) {
    const summary = report.bots[bot];
    if (!summary || (bot === 'adaptive' && report.mode !== 'shoot')) continue;
    lines.push(`${bot} deaths by scene × killer:`);
    for (const [scene, killers] of Object.entries(summary.sceneKillers)) lines.push(`  ${scene}: ${Object.entries(killers).sort((a, b) => b[1] - a[1]).map(([kind, count]) => `${kind} ${count}`).join(', ')}`);
  }
  for (const [bot, summary] of Object.entries(report.jitterBots)) lines.push(`jitter(${bot}, ${report.jitter}): ${pct(summary.completion)} of variants · wins histogram [${summary.winsHistogram.join(' ')}]`);
  const mark = (pass: boolean | null) => pass === null ? 'n/a ' : pass ? 'PASS' : 'FAIL';
  lines.push('gates (report-only):');
  for (const check of report.gates) lines.push(`  ${mark(check.pass)} ${check.name}: ${check.value} (target ${check.target})`);
  lines.push('luck checks:');
  for (const check of report.luck) lines.push(`  ${mark(check.pass)} ${check.name}: ${check.value} (target ${check.target})`);
  return lines.join('\n');
}

export function parseArgs(argv: string[]): { stages: number[]; modes: BalanceMode[]; seeds: number; jitter: number; workers: number; out: string } {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) continue;
    const [key, inline] = arg.slice(2).split('=', 2) as [string, string | undefined];
    const value = inline ?? (argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[++i]! : 'true');
    args.set(key, value);
  }
  const known = new Set(['stage', 'mode', 'seeds', 'jitter', 'workers', 'out']);
  for (const key of args.keys()) if (!known.has(key)) throw new Error(`Unknown option --${key}`);
  const stageArg = args.get('stage') ?? '0';
  const stages = stageArg === 'all' ? Object.keys(STAGES).map(Number) : [Number(stageArg)];
  const modeArg = args.get('mode') ?? 'both';
  if (!['strip', 'shoot', 'both'].includes(modeArg)) throw new Error('--mode must be strip, shoot or both');
  const integer = (name: string, fallback: number, min: number) => {
    const value = Number(args.get(name) ?? fallback);
    if (!Number.isInteger(value) || value < min) throw new Error(`--${name} must be an integer ≥ ${min}`);
    return value;
  };
  for (const stage of stages) stageDef(stage);
  return {
    stages, modes: modeArg === 'both' ? ['strip', 'shoot'] : [modeArg as BalanceMode],
    seeds: integer('seeds', 200, 1), jitter: integer('jitter', 8, 0),
    workers: integer('workers', Math.max(1, availableParallelism() - 1), 1), out: args.get('out') ?? 'reports/balance',
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);
  const command = `npm run balance -- ${argv.join(' ')}`.trim();
  mkdirSync(options.out, { recursive: true });
  for (const stage of options.stages) {
    for (const mode of options.modes) {
      const started = performance.now();
      const report = await runBalance({ stage, mode, seeds: options.seeds, jitter: options.jitter, workers: options.workers }, command);
      const file = join(options.out, `stage-${stage}-${mode}.json`);
      writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
      console.log(formatReport(report));
      console.log(`→ ${file} (${((performance.now() - started) / 1000).toFixed(1)} s)\n`);
    }
  }
}

if (process.env.CULL_BALANCE_WORKER === '1' && process.send) {
  process.on('message', ({ index, task }: { index: number; task: RunTask }) => process.send!({ index, result: runTask(task) }));
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
