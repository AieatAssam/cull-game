# CULL morning report

## What is ready

- **M0 scaffold:** pinned Three.js/Vite/TypeScript stack, square gate shell, CI workflows, and the unit/browser tooling.
- **M1 simulation:** deterministic fixed-tick camera, framing, SET/CAST lifecycle, seeded strips, Talent path and forks, HOLD, film, and failure rules.
- **M2 greybox:** 90-second Backlot scene, 10 seeded strips, Talent, Urchin, Boulder, Glass, and keyboard, mouse, and touch camera controls.
- **M3 full LOD:** hysteretic tiers stored in the sim and replay hash, four shared instanced Urchin mesh buckets, sub-pixel culling, Talent tier silhouettes, tier-change rings, and five Urchin tier screenshots.

M3 typecheck, lint, all 22 unit/simulation checks, all 4 Chromium browser checks, production build, and bundle-size check passed. The simulation replay tests match hashes across 10,000 ticks for three seeds. M3 draw calls and triangles measured 6 and 138.

## M2 decision signals

The automated framing twin missed the specified 1.3× target after one tuning pass. Across 20 seeds it averaged **6.66 distance**, compared with **7.37** for TrackerBot, for a **0.90×** ratio. Under §16, this meets the automated kill criterion and calls for a stop or pivot decision.

Assam directed continuation into the next phases despite the automated failure. The human fun test has not been run; Assam and 3–5 cold players still need to play for 10 minutes each, with the five signals and three questions in §16 recorded without coaching.

## Build and performance

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`, and `npm run size` pass.
- Chromium browser checks: **3 passed** (keyboard/mouse framing, touch pan/zoom, and scaffold/error check).
- Production JavaScript: **127.01 KB gzip**; Size Limit measured **104.94 KB brotlied** against a 300 KB limit.
- M2 Node benchmark: **250 entities**, 2,000 measured ticks, **0.75 ms p95**. M3 repeats measured **1.43–1.95 ms p95** while Chromium saturated the two available CPUs; rerun on an idle machine to resolve the 1 ms budget.
- M2/M3 browser scene counters: **9 / 6 draw calls**, **194 / 138 triangles**, below the 24 draw call and 60,000 triangle budgets.

## Screenshots to inspect

- [M2 mobile, default framing](../artifacts/screens/m2/390x844.png)
- [M2 mobile, close framing](../artifacts/screens/m2/390x844-close.png)
- [M2 desktop, default framing](../artifacts/screens/m2/1280x800.png)
- [M2 desktop, wide framing](../artifacts/screens/m2/1280x800-wide.png)
- [M3 close-up LOD screenshot](../artifacts/screens/m3/urchin-close.png)
- [M3 proxy LOD screenshot](../artifacts/screens/m3/urchin-proxy.png)

## How to run

From the repository, run `npm install` and `npm run dev`. The seeded browser checks use Chromium and Playwright via `npm run test:e2e`.

## Sign-off and next step

Proceed to M4 roster part 1. Also rerun `npm run perf` on an idle machine and complete the pending M2 human test with Assam and 3–5 cold players; preserve the automated bot failure when reviewing §16 results.
