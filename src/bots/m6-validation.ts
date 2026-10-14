import { createDriver } from './balance-bots';
import { TUNING } from '../sim/tuning';
import { createShootState, stepShoot } from '../sim/shoot';

const runs = 20;
const maxTicks = 8 * 60 * TUNING.tickRate;
const results: Array<{ seed: number; seconds: number; sceneIndex: number; finaleTicks: number; failed: string | null }> = [];
for (let seed = 1; seed <= runs; seed++) {
  // Bible M2: Adaptive plays on the fair-information view, the same driver as `npm run balance`.
  const drive = createDriver('adaptive', seed);
  let state = createShootState(seed);
  for (let tick = 0; tick < maxTicks && !state.failed; tick++) {
    state = stepShoot(state, drive(state));
  }
  results.push({ seed, seconds: state.tick / TUNING.tickRate, sceneIndex: state.shoot?.sceneIndex ?? -1, finaleTicks: state.shoot?.finaleTicks ?? 0, failed: state.failed });
}
const durations = results.map((result) => result.seconds);
const report = {
  runs,
  completedFinale: results.filter((result) => result.sceneIndex === 3 && result.failed === 'wrapped' && result.finaleTicks >= TUNING.finalTakeSeconds * TUNING.tickRate && result.seconds >= 180).length,
  minSeconds: Math.min(...durations),
  maxSeconds: Math.max(...durations),
  meanSeconds: durations.reduce((sum, seconds) => sum + seconds, 0) / runs,
  results,
};
console.log(JSON.stringify(report, null, 2));
// Shutter (2026-10-14): Adaptive is a ceiling at >= 90% by design (glass and urchin deaths are real), so the gate is 18/20, not 20/20.
const requiredFinales = Math.ceil(runs * 0.9);
if (report.completedFinale < requiredFinales || report.maxSeconds > 8 * 60) process.exitCode = 1;
