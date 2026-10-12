# CULL morning report

## What is ready

- **M0 scaffold:** pinned Three.js/Vite/TypeScript stack, square gate shell, CI workflows, and the unit/browser tooling.
- **M1 simulation:** deterministic fixed-tick camera, framing, SET/CAST lifecycle, seeded strips, Talent path and forks, HOLD, film, and failure rules.
- **M2 greybox:** 90-second Backlot scene, 10 seeded strips, Talent, Urchin, Boulder, Glass, and keyboard, mouse, and touch camera controls.

The production build, lint, typecheck, unit suite, browser suite, bundle-size check, and the measured simulation performance run passed. The suite has 19 unit/simulation checks and 3 Chromium browser checks. The simulation replay tests match hashes across 10,000 ticks for three seeds.

## M2 decision signals

The automated framing twin missed the specified 1.3× target after one tuning pass. Across 20 seeds it averaged **6.66 distance**, compared with **7.37** for TrackerBot, for a **0.90×** ratio. Under §16, this meets the automated kill criterion and calls for a stop or pivot decision.

The human fun test has not been run. Assam and 3–5 cold players still need to play for 10 minutes each; observe the five signals and ask the three questions in §16 without coaching. The human results may further support or change the decision, but they do not erase the automated criterion.

## Build and performance

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`, and `npm run size` pass.
- Chromium browser checks: **3 passed** (keyboard/mouse framing, touch pan/zoom, and scaffold/error check).
- Production JavaScript: **127.01 KB gzip**; Size Limit measured **104.94 KB brotlied** against a 300 KB limit.
- Node simulation benchmark: **250 entities**, 2,000 measured ticks, **0.75 ms p95** and **0.26 ms average** on the final run; the 1 ms p95 budget passed. Samples varied under load, so repeat on the target machine if this becomes a release gate.
- Browser scene counters: **9 draw calls**, **194 triangles**, below the 24 draw call and 60,000 triangle budgets.

## Screenshots to inspect

- [M2 mobile, default framing](../artifacts/screens/m2/390x844.png)
- [M2 mobile, close framing](../artifacts/screens/m2/390x844-close.png)
- [M2 desktop, default framing](../artifacts/screens/m2/1280x800.png)
- [M2 desktop, wide framing](../artifacts/screens/m2/1280x800-wide.png)

## How to run

From the repository, run `npm install` and `npm run dev`. The seeded browser checks use Chromium and Playwright via `npm run test:e2e`.

## Sign-off and next step

Review the M2 screenshots, record the human test results against §16, and decide whether to pivot to **CULL: Stills** or **AUTOPHAGE**. Since the automated twin already missed its threshold after the one tuning pass, do not proceed into M3 until that decision is made. If CULL continues, M3 is the full LOD implementation.
