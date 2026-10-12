# CULL morning report

## Milestones

- **M0–M4:** scaffold, deterministic sim, greybox, hysteretic LOD, and first roster are implemented and tagged.
- **M5:** 40 authored chunks, deterministic stitcher, validator, generated terrain rendering, and Tracker/Wide/Close/Adaptive/Chaos bots are implemented. Acceptance is still red; see the bot results below.
- **M6:** Rumour ledger, ally/hostile Monitor cones, seeded Continuity Prop, Wrap, biome ordering, and an opt-in four-part Shoot (`?shoot=1`) are implemented. The 20-seed Shoot gate is still red.
- **M7:** batched CAST bounds, Night Shoot palette shift, and one-way adaptive DPR are implemented. Mobile/desktop visual checks and the per-frame budgets passed; the full 20-image golden set is unfinished.
- **M8:** lazy WebAudio, in-frame source tracking, LOD filtering, stereo/mono panning, a 96 BPM pulse, gameplay cues, persisted master/music/effects sliders, and a calm mix are implemented.
- **M9:** UTC daily seed, local result history/personal best and last-five gallery, RLE base64url replay encoding and URL playback, text share card, 1080×1350 contact-sheet PNG, transparent S/A/B/C cinematography grades, and an optional six-second WebM director's reel are implemented. The sheet ranks live captures for opening, nearest close calls, best thirds, fatal frame, and spaced run samples, with close-call/fatal annotations. It does not yet re-simulate; feat lens unlocks/behaviors and cosmetic film stocks remain open.
- **M10:** reduced-motion CSS, accessible names/focus, visible hazard hatches, left-hand touch layout, notch-safe padding, control hints, and a labelled 75% wall-time assist are implemented. Physical weak-GPU/phone testing and tuning sign-off remain pending.

## Checks and performance

- `npm run typecheck` and `npm run lint` pass after M8 settings. The last full unit run reported **68/69**: one AdaptiveBot smoke test hit Vitest's default 5-second timeout under concurrent CPU load; it passes alone in 1.7 s and now has a 20-second timeout. The other 68 tests passed. M8 audio tests now pass **3/3**.
- Focused Chromium M9/M10 checks passed **3/3** before the audio control addition; the M8 sound panel test passed **1/1**, including persisted volume, mono/calm toggles, and screenshots at both viewports. The current M9 replay/export test passed **1/1** with replay hash equality, PNG dimensions, filmography grade/history, and nonempty WebM recording. The touch/zoom test passed alone after updating it to advance recorded slider input; a clean all-10 E2E rerun remains outstanding.
- Production bundle after M8/M9 updates: **155.03 KB gzip**, under the 300 KB cap; Size Limit reports **127.56 KB brotli**. Simulated slow-3G load is **2.5 s**, above the 2.0 s goal; simulated run time is **1.3 s**.
- M5 screenshots: **10 draw calls / 8,014 triangles**. M6 screenshots: **8 draw calls / 5,826 triangles**.
- Generator p95: **3.55 ms**, under 50 ms. Chaos invariants: **1,000/1,000** runs passed. The Node sim p95 budget still needs a quiet rerun; prior M3/M4 readings were 1.43–1.95 ms under CPU contention.

## Bot results and acceptance gates

M5 validation over 200 seeds: Adaptive completed **88%** (goal ≥95%); Tracker completed **100%** (goal ≤40%); Adaptive/Tracker distance **0.936×** (goal ≥1.3×); Wide/Adaptive **0.489×** (pass); Close/Adaptive **0.831×** (goal ≤0.7×). Adaptive failed by falling 11 times and getting hit 13 times. The report-only CI step keeps these numbers visible without blocking ordinary CI. M2's earlier 20-seed comparison remains **0.90×**, below its 1.3× kill criterion; the human test has not happened.

M6 Adaptive Shoot validation: **7/20** seeds completed the 40-second finale. Run times ranged from **85.2 s to 257.8 s**, with a **214.0 s** mean. The 3–8 minute, 20-seed acceptance test is not met.

## M9/M10 verification and screenshots

- M8 unit coverage checks the in-frame source set, lazy AudioContext startup, and sound-setting clamping. Browser checks cover persisted volume controls, mono/calm toggles, share URL/PNG, daily seed, stored result grades/history, and reduced-motion behavior.
- M9 unit coverage checks UTC daily seed stability, replay round-trip, malformed/oversized URL rejection, grade metric math, and local history/personal best.
- M9 contact sheet: [PNG](../artifacts/screens/m9/contact-sheet.png). Capture skips tick zero, which previously produced a blank first panel. The current sheet ranks live captures for opening, close calls, thirds, fatal frame, and spread samples; it does not re-simulate the run to render moments that were not captured live.
- M9 end-card captures: [mobile](../artifacts/screens/m9/390x844.png), [desktop](../artifacts/screens/m9/1280x800.png). M10 controls: [mobile](../artifacts/screens/m10/390x844.png), [desktop](../artifacts/screens/m10/1280x800.png). Human weak-device and one-handed phone sign-off remains pending.

## Screenshots to inspect first

- [M5 mobile, generated scene](../artifacts/screens/m5/390x844.png)
- [M5 desktop, generated scene](../artifacts/screens/m5/1280x800.png)
- [M6 mobile, Long Take](../artifacts/screens/m6/390x844.png)
- [M6 desktop, Long Take](../artifacts/screens/m6/1280x800.png)
- [M8 mobile, sound settings](../artifacts/screens/m8/390x844.png)
- [M8 desktop, sound settings](../artifacts/screens/m8/1280x800.png)

## Decisions and known gaps

- Assam directed continuation after the M2 bot kill criterion; sign-off is still needed after an uncoached 10-minute test with 3–5 cold players.
- Normal play uses raw seeded generated scenes. Strict bot-validated generation is opt-in with `?validated` and may throw after its retry limit while bot gates remain red.
- The full Shoot is opt-in with `?shoot=1`; all four segments can be isolated through the debug URL for scripted inspection.
- M9 lens unlock behaviors, cosmetic film stocks, and deterministic replay-rendered contact sheets remain open.
- The slow-3G load target and sim-tick budget need follow-up; lens unlock behaviors, film stocks, WebM, deterministic replay-rendered contact sheets, full golden screenshot set, and M10 weak-GPU/phone human gate remain outstanding.
- GitHub repo is public at [AieatAssam/cull-game](https://github.com/AieatAssam/cull-game). Local commits and tags still need a successful push because the current GitHub token rejected Git writes for missing repository scope.

## How to play

Run `npm install && npm run dev`. Add `?shoot=1` for the multi-scene Shoot or `?debug&frozen=1` for deterministic scripted inspection.

## Exact next step

Finish the remaining M9 lens/film-stock/WebM scope or document deferrals, rerun verification without concurrent browser load, then push local commits and tags to the public GitHub repo when device authorization completes. Keep the M5/M6 gate failures visible; get Assam's weak-device and one-handed phone sign-off before claiming final acceptance.
