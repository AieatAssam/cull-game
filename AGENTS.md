# CULL project guide

## Stack and commands
- Three.js, Vite, TypeScript; Vitest and Playwright (Chromium only). Pin dependencies.
- `npm run dev` starts the game. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`, `npm run size`, and `npm run perf` for the matching checks.

## Engineering rules
- Keep `src/sim/` pure TypeScript: no Three.js, DOM, `Math.random`, `Date`, or `performance.now`.
- The simulation uses fixed ticks and seeded RNG; rendering reads snapshots and never mutates simulation state.
- Put tuning values in `src/sim/tuning.ts`; archetype data belongs in `data/archetypes.json`.
- Every rule change needs tests. Never weaken a test to get green. Hash changes need a matching decision entry.
- Avoid new dependencies without justification. No paid services, API keys, runtime network calls, analytics, streak penalties, or monetized random rewards.
- Work from milestones in `docs/design/game-design.md` (the old M0–M10 plan in `docs/CULL.md` is retired). Update `docs/PROGRESS.md` and `docs/DECISIONS.md`, and commit each green step. `npm run validate:m5` and `npm run validate:m6` print report-only acceptance gates while their bot criteria remain red.
- Do not push, deploy, or modify files outside this repository.
