import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHUNKS, validateCatalog } from '../src/gen/chunks';
import { generateScene } from '../src/gen/generate';
import { generateValidatedScene, validationMemoSize } from '../src/gen/validated';
import { evaluateBots, playRun, runChaosBatch } from '../src/bots/players';
import { runChaosInvariantBatch } from './helpers/chaos-invariants';

describe('procedural chunk generation', () => {
  it('ships forty valid authored 16x16 chunks', () => {
    expect(CHUNKS).toHaveLength(40);
    expect(validateCatalog()).toEqual([]);
    const directory = fileURLToPath(new URL('../data/chunks', import.meta.url));
    const templateFiles = readdirSync(directory).filter((name) => /^chunk-\d{2}\.json$/.test(name)).sort();
    const fromFiles = templateFiles.map((name) => JSON.parse(readFileSync(`${directory}/${name}`, 'utf8')));
    const catalog = JSON.parse(readFileSync(`${directory}/catalog.json`, 'utf8'));
    expect(catalog).toEqual(fromFiles);
    expect(templateFiles).toHaveLength(40);
    expect(new Set(CHUNKS.map((chunk) => chunk.tiles.join(''))).size).toBe(40);
    expect(new Set(CHUNKS.map((chunk) => chunk.pathNodes.map((point) => `${point.x},${point.z}`).join(';'))).size).toBeGreaterThan(30);
  });
  it('rejects malformed path and duplicate socket IDs without throwing', () => {
    const source = CHUNKS[0]!;
    const malformed = structuredClone(source);
    malformed.pathNodes = [null as unknown as { x: number; z: number }];
    malformed.sockets.push({ ...malformed.sockets[0]!, id: malformed.sockets[0]!.id });
    expect(validateCatalog([malformed]).join(' ')).toMatch(/path must connect|duplicate/);
  });
  it('stitches deterministically, connects paths, includes a fork and six Reels', () => {
    for (const seed of [1, 17, 2026, 0xffffffff]) {
      const first = generateScene(seed);
      expect(generateScene(seed)).toEqual(first);
      expect(first.length).toBeGreaterThanOrEqual(120);
      expect(first.length).toBeLessThanOrEqual(220);
      expect(first.forks.length).toBeGreaterThanOrEqual(1);
      expect(first.reelCount).toBeGreaterThanOrEqual(6);
      expect(first.threatSpent).toBeLessThanOrEqual(first.threatBudget);
      expect(first.tiles.length).toBeGreaterThan(0);
      expect(first.path.slice(1).every((point, i) => point.x > first.path[i]!.x)).toBe(true);
    }
  });
  it('keeps every spawned position and budget finite across 100 seeded scenes', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const scene = generateScene(seed);
      expect(scene.entities.every((entity) => Number.isFinite(entity.x) && Number.isFinite(entity.z))).toBe(true);
      expect(scene.threatSpent).toBeLessThanOrEqual(scene.threatBudget);
    }
  });
  it('memoizes a seed after deterministically rerolling rejected candidates', () => {
    const checks: number[] = [];
    const first = generateValidatedScene(0x5eedc0de, 4, (seed) => {
      checks.push(seed);
      return { adaptiveCompleted: true, trackerCompleted: seed === 0x5eedc0de };
    });
    const size = validationMemoSize();
    expect(first.attempts).toBe(2);
    expect(checks).toEqual([0x5eedc0de, (0x5eedc0de + 0x9e3779b9) >>> 0]);
    expect(first.scene.seed).toBe(first.sourceSeed);
    expect(generateValidatedScene(0x5eedc0de, 4, () => ({ adaptiveCompleted: false, trackerCompleted: false }))).toBe(first);
    expect(validationMemoSize()).toBe(size);
  });
});

describe('reference bot smoke and chaos fuzzing', () => {
  it('keeps Adaptive runs seeded and counts only a path wrap as completion', () => {
    const first = playRun(3, 'adaptive');
    const second = playRun(3, 'adaptive');
    const pathEnd = first.state.path.at(-1)?.x ?? 0;
    expect(second).toEqual(first);
    expect(first.completed).toBe(first.state.failed === 'wrapped'
      || (!first.state.failed && first.state.talent.x >= pathEnd - 1));
  });
  it('reports reproducible framing-strategy completion and distance metrics', () => {
    const report = evaluateBots(20);
    expect(report.adaptiveCompletion).toBeGreaterThanOrEqual(0);
    expect(report.adaptiveCompletion).toBeLessThanOrEqual(1);
    expect(report.trackerCompletion).toBeGreaterThanOrEqual(0);
    expect([report.adaptiveRatio, report.wideRatio, report.closeRatio].every(Number.isFinite)).toBe(true);
    expect(report.adaptiveFailures).toBeDefined();
  }, 60_000);
  it('runs every bot strategy without producing non-finite state', () => {
    for (const bot of ['tracker', 'wide', 'close', 'adaptive', 'chaos'] as const) {
      for (let seed = 1; seed <= 5; seed++) {
        const result = playRun(seed, bot, 1200);
        expect(Number.isFinite(result.state.talent.x)).toBe(true);
        expect(Number.isFinite(result.state.camera.zoom)).toBe(true);
      }
    }
  });
  it('keeps ChaosBot finite through 1,000 deterministic runs', () => {
    expect(runChaosBatch(1_000, 900)).toEqual(expect.objectContaining({ runs: 1_000, finite: true }));
  }, 120_000);
  it('checks all Chaos simulation invariants during 1,000 runs', () => {
    expect(runChaosInvariantBatch(1_000, 900)).toEqual(expect.objectContaining({ runs: 1_000, valid: true }));
  }, 120_000);
});
