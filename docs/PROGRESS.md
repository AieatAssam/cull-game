# CULL progress

- [x] M0 Scaffold: pinned stack, Vite/Three.js shell, CI and Pages workflows, Vitest, Playwright, fast-check, ESLint purity guard, size-limit and tuning.
- [x] M1 Sim core: fixed 60 Hz ticks, camera acceleration/zoom/rotation, matching orthographic gate projection, SET reload, CAST cut lifecycle, call-sheet range, seeded strips, Talent path/forks, HOLD, film and all five failure states. 18 deterministic/scenario/property tests pass, including repeated 10,000-tick hashes for three seeds.
- [x] M2 Greybox: Talent, Urchin LOD, Boulder, Glass floor, 10 seeded strips, keyboard/mouse/touch controls, bot comparison and four Chromium screenshots. Automated browser checks pass; human fun test is pending.
- [x] M3 Full LOD: hysteretic Talent/entity tiers, four shared instanced Urchin geometry buckets plus sub-pixel culling, tier-change rings, and five tier screenshots. Tier oscillation, bucket selection, and ring cues are covered by unit/browser checks.
- [x] M4 Roster part 1: deterministic Extras crowds (4–12 moving members), size-culled Swarm, motion-gated Stagehand, LOD-sensitive Rope Bridge and collectible Reels. Per-rule sim scenarios plus mobile/desktop roster browser checks pass.
- [ ] M5 Generator and bots
- [ ] M6 Roster part 2 and Shoot structure
- [ ] M7 Visual signature
- [ ] M8 Audio
- [ ] M9 Meta and share
- [ ] M10 Polish and human gate

**KILL-CRITERION WARNING:** after one tuning pass, the smart framing bot averaged 6.66 distance versus TrackerBot's 7.37 across 20 seeds (0.90×, below the required 1.3×). The human test is still pending. Assam directed continuation through the next phases despite the failed automated criterion.

Performance: M2 recorded 0.75 ms p95; repeated M3/M4 Node runs measured 1.43–1.95 ms p95 while other Chromium processes saturated the 2-core environment, so the current performance gate is unresolved and needs a quieter rerun. M3/M4 browser counters were 6/12 draw calls and 138/940 triangles. The current production JavaScript measures 136.04 KB gzip and 112.41 KB brotli, under the 300 KB cap; simulated slow-3G load is estimated at 2.2 s versus the 2.0 s target.

Next step: implement M5's chunk templates, generator, validator and bots; rerun the Node performance benchmark on an idle machine and schedule the still-pending 10-minute M2 human test with Assam and 3–5 cold players.
