# CULL progress

- [x] M0 Scaffold: pinned stack, Vite/Three.js shell, CI and Pages workflows, Vitest, Playwright, fast-check, ESLint purity guard, size-limit and tuning.
- [x] M1 Sim core: fixed 60 Hz ticks, camera acceleration/zoom/rotation, matching orthographic gate projection, SET reload, CAST cut lifecycle, call-sheet range, seeded strips, Talent path/forks, HOLD, film and all five failure states. 18 deterministic/scenario/property tests pass, including repeated 10,000-tick hashes for three seeds.
- [x] M2 Greybox: Talent, Urchin LOD, Boulder, Glass floor, 10 seeded strips, keyboard/mouse/touch controls, bot comparison and four Chromium screenshots. Automated browser checks pass; human fun test is pending.
- [ ] M3 Full LOD
- [ ] M4 Roster part 1
- [ ] M5 Generator and bots
- [ ] M6 Roster part 2 and Shoot structure
- [ ] M7 Visual signature
- [ ] M8 Audio
- [ ] M9 Meta and share
- [ ] M10 Polish and human gate

**KILL-CRITERION WARNING:** after one tuning pass, the smart framing bot averaged 6.66 distance versus TrackerBot's 7.37 across 20 seeds (0.90×, below the required 1.3×). Human testers have not completed the M2 fun test, so a pivot decision remains open.

Performance: the 250-entity Node benchmark passed at 0.75 ms p95 and 0.26 ms average on the final run; browser counters were 9 draw calls and 194 triangles. The production JavaScript measured 127.01 KB gzip and 104.94 KB brotli in Size Limit, below the 300 KB cap.

Next step: run the 10-minute M2 fun test with Assam and 3–5 cold players; apply the four signals and kill criterion in `docs/CULL.md` §16, then decide whether to continue CULL or pivot.
