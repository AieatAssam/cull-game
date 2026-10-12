import { stateHash } from '../sim/hash';
import { step } from '../sim/step';
import { createState } from '../sim/world';

const warmupTicks = 200;
const measuredTicks = 2_000;
const entities = Array.from({ length: 250 }, (_, i) => ({
  id: `perf-${i}`,
  kind: 'glass' as const,
  x: ((i % 25) - 12) * 0.3,
  z: (Math.floor(i / 25) - 5) * 0.3,
  vx: 0, vz: 0, spawned: true, cut: false, age: 0,
}));
let state = createState(123, entities);
for (let i = 0; i < warmupTicks; i++) state = step(state);
const samples: number[] = [];
for (let i = 0; i < measuredTicks; i++) {
  const start = process.hrtime.bigint();
  state = step(state);
  samples.push(Number(process.hrtime.bigint() - start) / 1e6);
}
samples.sort((a, b) => a - b);
const p95 = samples[Math.floor(samples.length * 0.95)]!;
const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
const result = { entities: state.entities.filter((entity) => entity.spawned && !entity.cut).length, ticks: measuredTicks, averageMsPerTick: average, p95MsPerTick: p95, hash: stateHash(state) };
console.log(JSON.stringify(result));
if (p95 > 1) throw new Error(`Simulation p95 ${p95.toFixed(3)} ms exceeds the 1.0 ms budget.`);
