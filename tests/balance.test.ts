import { beforeAll, describe, expect, it } from 'vitest';
import { createPolicy, jitterTuning } from '../src/bots/balance-bots';
import { balanceTasks, inferKiller, luckChecks, parseArgs, runBalance, runTask, STAGES, summarize, type RunResult } from '../src/bots/balance';
import { createObserver } from '../src/bots/observe';
import { createState } from '../src/sim/world';
import type { CastEntity } from '../src/sim/types';

const entity = (id: string, kind: CastEntity['kind'], x: number, z: number, extra: Partial<CastEntity> = {}): CastEntity =>
  ({ id, kind, x, z, vx: 0, vz: 0, spawned: true, cut: false, age: 0, ...extra });

describe('player-visible observer', () => {
  it('strips cast the player cannot see and keeps call-sheet entries', () => {
    const state = createState(1, [
      entity('framed', 'urchin', 1, 0),
      entity('pending-far', 'glass', 200, 0, { spawned: false }),
      entity('off-but-alive', 'swarm', 200, 0),
      entity('cut', 'urchin', 2, 0, { cut: true }),
      entity('coming-in', 'urchin', 18, 0, { spawned: false }),
    ]);
    const ids = createObserver()(state).state.entities.map((cast) => cast.id);
    expect(ids).toEqual(['framed', 'coming-in']);
  });

  it('reports the Talent where it was last seen and the gate only while the HUD shows it', () => {
    const state = createState(1, []);
    state.shots = [{ at: 10, kind: 'defang', done: false }];
    const observe = createObserver();
    expect(observe(state).gate).toBeNull();
    const away = { ...state, talent: { ...state.talent, x: 500, z: 0 } };
    expect(observe(away).state.talent.x).toBe(0);
    const blocked = { ...state, talent: { ...state.talent, x: 9.8 } };
    expect(observe(blocked).gate).toBe('defang');
    expect(observe(blocked).state.shots).toBeUndefined();
  });
});

describe('balance bots', () => {
  it('metronome pulses 60–90 ms every 500 ms toward the path end and never zooms', () => {
    const state = createState(3, []);
    const policy = createPolicy('metronome', 3);
    const observe = createObserver();
    let active = 0;
    for (let tick = 0; tick < 600; tick++) {
      const input = policy.act(observe({ ...state, tick }));
      expect(input.zoom).toBe(0);
      expect(input.rotate).toBe(0);
      expect(input.hold).toBe(false);
      if (input.panX || input.panZ) {
        active++;
        expect(input.panX).toBeGreaterThan(0);
      }
    }
    expect(active).toBeGreaterThanOrEqual(20 * 4);
    expect(active).toBeLessThanOrEqual(20 * 5);
  });

  it('gatekeeper zooms out for an open defang gate and tracks at 24 otherwise', () => {
    const state = createState(1, []);
    const policy = createPolicy('gatekeeper', 1);
    expect(policy.act({ state, gate: 'defang' }).zoom).toBeLessThan(0);
    expect(policy.act({ state, gate: null }).zoom).toBeGreaterThan(0);
    expect(policy.act({ state: { ...state, camera: { ...state.camera, zoom: 40 } }, gate: 'defang' }).zoom).toBe(0);
  });

  it('jitter variants are seeded within 150–300 ms and ±5% aim', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (let variant = 0; variant < 8; variant++) {
        const tuning = jitterTuning(seed, variant);
        expect(tuning).toEqual(jitterTuning(seed, variant));
        expect(tuning.reactionTicks).toBeGreaterThanOrEqual(9);
        expect(tuning.reactionTicks).toBeLessThanOrEqual(18);
        expect(Math.abs(tuning.aim - 1)).toBeLessThanOrEqual(0.05);
      }
    }
    expect(new Set(Array.from({ length: 8 }, (_, variant) => jitterTuning(7, variant).reactionTicks)).size).toBeGreaterThan(1);
  });
});

describe('balance report', () => {
  it('names the killer from the final state', () => {
    const state = createState(1, [entity('u', 'urchin', 0.5, 0, { lodTier: 1 })]);
    expect(inferKiller({ ...state, failed: 'hit' })).toBe('urchin');
    expect(inferKiller({ ...state, failed: 'lost-talent' })).toBe('offscreen');
    expect(inferKiller({ ...state, failed: 'out-of-film' })).toBe('film');
    expect(inferKiller(state)).toBeNull();
  });

  it('computes the §5 luck lines', () => {
    const result = (seed: number, completed: boolean): RunResult => ({ bot: 'adaptive', seed, variant: null, completed, timedOut: false,
      failed: completed ? null : 'hit', killer: completed ? null : 'urchin', scene: 'BACKLOT', distance: 1, seconds: 200 });
    const seeds = Array.from({ length: 40 }, (_, index) => index + 1);
    const checks = luckChecks({
      mode: 'shoot', k: 8, targets: STAGES[0]!.targets,
      gatekeeperJitter: new Map(seeds.map((seed) => [seed, seed === 1 ? 8 : 1])),
      adaptiveJitter: new Map(seeds.map((seed) => [seed, seed <= 2 ? 3 : 7])),
      exact: { adaptive: seeds.map((seed) => result(seed, seed % 10 !== 0)), tracker: seeds.map((seed) => result(seed, false)), gatekeeper: seeds.map((seed) => result(seed, seed <= 4)) },
      passiveBot: 'gatekeeper', passiveSummary: summarize(seeds.map((seed) => result(seed, false))), adaptiveSummary: summarize(seeds.map((seed) => result(seed, true))),
      rosterKinds: { BACKLOT: 4, 'LONG TAKE': 2 },
    });
    const byName = (fragment: string) => checks.find((check) => check.name.includes(fragment))!;
    expect(byName('≥4/8').value).toBe('2.5%');
    expect(byName('seeds at 8/8')).toMatchObject({ value: '1 (1)', pass: false });
    expect(byName('≥6/8')).toMatchObject({ value: '95%', pass: true });
    expect(byName('generator suspects').value).toBe('2 (1, 2)');
    expect(byName('Adaptive SD')).toMatchObject({ value: '0 pp', pass: true });
    expect(byName('passive worst bucket')).toMatchObject({ value: '20%', pass: true });
    expect(byName('FailReasons').pass).toBe(false);
    expect(byName('roster kinds').pass).toBe(false);
  });

  it('parses the CLI and refuses stages that are not shipped', () => {
    expect(parseArgs(['--mode=shoot', '--seeds', '20', '--jitter=0', '--workers=1'])).toMatchObject({ stages: [0], modes: ['shoot'], seeds: 20, jitter: 0, workers: 1 });
    expect(parseArgs([]).modes).toEqual(['strip', 'shoot']);
    expect(() => parseArgs(['--stage=3'])).toThrow(/not shipped/);
    expect(() => parseArgs(['--speed=2'])).toThrow(/Unknown option/);
    expect(balanceTasks({ stage: 0, mode: 'strip', seeds: 2, jitter: 3, workers: 1 })).toHaveLength(2 * (9 + 2 * 3));
  });

  it('is deterministic per task', () => {
    const task = { stage: 0, mode: 'strip' as const, bot: 'adaptive' as const, seed: 5, variant: 2 };
    expect(runTask(task)).toEqual(runTask(task));
  });
});

// The 20-seed smoke per shipped stage: checks the direction of each gate, not its threshold.
describe.each(Object.keys(STAGES).map(Number))('stage %i balance smoke (strip, 20 seeds)', (stage) => {
  let report: Awaited<ReturnType<typeof runBalance>>;
  beforeAll(async () => {
    report = await runBalance({ stage, mode: 'strip', seeds: 20, jitter: 0, workers: 1, bots: ['adaptive', 'tracker', 'gatekeeper', 'metronome', 'wide', 'close', 'chaos'] });
  }, 120_000);
  it('orders the bots the way the gates expect', () => {
    const { adaptive, tracker, metronome, wide, close, chaos } = report.bots;
    expect(adaptive!.completion).toBeGreaterThan(metronome!.completion);
    expect(adaptive!.completion).toBeGreaterThan(tracker!.completion);
    expect(adaptive!.meanDistance).toBeGreaterThan(wide!.meanDistance);
    expect(adaptive!.meanDistance).toBeGreaterThan(close!.meanDistance);
    expect(chaos!.completed).toBe(0);
    expect(report.gates.length).toBeGreaterThan(0);
    expect(report.runs).toHaveLength(20 * 7);
    for (const summary of Object.values(report.bots)) {
      const deaths = Object.values(summary.killers).reduce((sum, count) => sum + count, 0);
      expect(deaths).toBe(summary.runs - summary.completed);
    }
  });
  // Bible M2: "adaptive beats passive" is blocking for S0.
  it('adaptive beats the passive gate (best of tracker, gatekeeper)', () => {
    expect(report.bots.adaptive!.completion).toBeGreaterThan(report.passive.completion);
    expect(report.bots.adaptive!.meanDistance).toBeGreaterThan(report.bots[report.passive.bot]!.meanDistance);
  });
});
