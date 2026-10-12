# CULL progress

- [x] M0 Scaffold: pinned stack, Vite and Three.js shell, CI/Pages workflows, Vitest, Playwright, fast-check, ESLint purity guard, size-limit and `tuning.ts`.
- [x] M1 Sim core: fixed 60 Hz ticks, camera acceleration/zoom/rotation, matching orthographic gate projection, SET reload, CAST cut lifecycle, call-sheet range, seeded strips, Talent path and fork steering, HOLD, film and all five fail states. M1 viewfinder captures match the M0 shell.
- [ ] M2 Greybox prototype and fun proxy
- [ ] M3 Full LOD
- [ ] M4 Roster part 1
- [ ] M5 Generator and bots
- [ ] M6 Roster part 2 and Shoot structure
- [ ] M7 Visual signature
- [ ] M8 Audio
- [ ] M9 Meta and share
- [ ] M10 Polish and human gate

M1 checks: 18 deterministic, scenario and property tests pass, including three repeated 10,000-tick hash runs.

Next step: connect the sim to the greybox renderer and add the M2 controls and entities.
