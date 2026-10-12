import { evaluateBots, runChaosBatch } from './players';
import { generateScene } from '../gen/generate';

const samples = 1_000;
const genTimes: number[] = [];
for (let seed = 1; seed <= samples; seed++) {
  const start = process.hrtime.bigint();
  generateScene(seed);
  genTimes.push(Number(process.hrtime.bigint() - start) / 1e6);
}
genTimes.sort((a, b) => a - b);
const generationP95Ms = genTimes[Math.floor(samples * 0.95)]!;
const generationMaxMs = genTimes.at(-1)!;
const bots = evaluateBots(200);
const chaos = runChaosBatch(1_000);
const gates = {
  adaptiveCompletion: bots.adaptiveCompletion >= 0.95,
  trackerCompletion: bots.trackerCompletion <= 0.4,
  adaptiveDistance: bots.adaptiveRatio >= 1.3,
  wideDistance: bots.wideRatio <= 0.7,
  closeDistance: bots.closeRatio <= 0.7,
  chaos: chaos.finite && chaos.runs === 1_000,
  generation: generationP95Ms <= 50,
};
console.log(JSON.stringify({ bots, chaos, generationP95Ms, generationMaxMs, gates }, null, 2));
if (Object.values(gates).some((passed) => !passed)) process.exitCode = 1;
