# CULL morning report

## Milestones

- **M0–M4:** scaffold, deterministic sim, greybox, hysteretic LOD, and first roster are implemented and tagged.
- **M5:** 40 authored chunks, deterministic stitcher, validator, generated terrain rendering, and Tracker/Wide/Close/Adaptive/Chaos bots are implemented. Acceptance is still red; see the bot results below.
- **M6:** Rumour ledger, ally/hostile Monitor cones, seeded Continuity Prop, Wrap, biome ordering, and an opt-in four-part Shoot (`?shoot=1`) are implemented. The 20-seed Shoot gate is still red.
- **M7:** batched CAST bounds, Night Shoot palette shift, and one-way adaptive DPR are implemented. Mobile/desktop visual checks and the per-frame budgets passed; the full 20-image golden set is unfinished.
- **M8:** lazy WebAudio, in-frame source tracking, LOD filtering, stereo panning, a 96 BPM pulse, and gameplay cues are implemented. Audio settings and the calm mix are unfinished.
- **M9–M10:** not started. Human playtest and weak-device sign-off remain pending.

## Checks and performance

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run size` pass. Unit tests: **62 passed** across 8 files.
- Chromium E2E: **7 passed**. M5/M6 seeded mobile and desktop screenshots were reviewed; visible mobile gate-label overlap was fixed and the two milestone screenshot tests passed again.
- Production bundle: **148.92 KB gzip**, under 300 KB; Size Limit reports **122.15 KB brotli**. Simulated slow-3G load is **2.4 s**, above the 2.0 s goal.
- M5 screenshots: **10 draw calls / 8,014 triangles**. M6 screenshots: **8 draw calls / 5,826 triangles**.
- Generator p95: **3.55 ms**, under 50 ms. Chaos invariants: **1,000/1,000** runs passed. The Node sim p95 budget still needs a quiet rerun; prior M3/M4 readings were 1.43–1.95 ms under CPU contention.

## Bot results and acceptance gates

M5 validation over 200 seeds: Adaptive completed **88%** (goal ≥95%); Tracker completed **100%** (goal ≤40%); Adaptive/Tracker distance **0.936×** (goal ≥1.3×); Wide/Adaptive **0.489×** (pass); Close/Adaptive **0.831×** (goal ≤0.7×). Adaptive failed by falling 11 times and getting hit 13 times. The report-only CI step keeps these numbers visible without blocking ordinary CI. M2's earlier 20-seed comparison remains **0.90×**, below its 1.3× kill criterion; the human test has not happened.

M6 Adaptive Shoot validation: **7/20** seeds completed the 40-second finale. Run times ranged from **85.2 s to 257.8 s**, with a **214.0 s** mean. The 3–8 minute, 20-seed acceptance test is not met.

## Screenshots to inspect first

- [M5 mobile, generated scene](../artifacts/screens/m5/390x844.png)
- [M5 desktop, generated scene](../artifacts/screens/m5/1280x800.png)
- [M6 mobile, Long Take](../artifacts/screens/m6/390x844.png)
- [M6 desktop, Long Take](../artifacts/screens/m6/1280x800.png)

## Decisions and known gaps

- Assam directed continuation after the M2 bot kill criterion; sign-off is still needed after an uncoached 10-minute test with 3–5 cold players.
- Normal play uses raw seeded generated scenes. Strict bot-validated generation is opt-in with `?validated` and may throw after its retry limit while bot gates remain red.
- The full Shoot is opt-in with `?shoot=1`; all four segments can be isolated through the debug URL for scripted inspection.
- M8 audio settings (master/music/SFX), mono mode, and calm/reduced-motion mix remain open.
- The slow-3G load target and sim-tick budget need follow-up; the full golden screenshot set and M10 weak-GPU/phone human gate remain outstanding.
- GitHub repo is public at [AieatAssam/cull-game](https://github.com/AieatAssam/cull-game). Local commits and tags still need a successful push because the current GitHub token rejected Git writes for missing repository scope.

## How to play

Run `npm install && npm run dev`. Add `?shoot=1` for the multi-scene Shoot or `?debug&frozen=1` for deterministic scripted inspection.

## Exact next step

Implement M9 local filmography, stable UTC daily seed, replay URL codec, and a nine-frame contact sheet. Preserve the M5/M6 bot failures in the report, rerun all checks, then finish M10 accessibility and human sign-off.
