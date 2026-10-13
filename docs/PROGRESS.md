# CULL progress

- [x] M0 Scaffold: pinned stack, Vite/Three.js shell, CI and Pages workflows, Vitest, Playwright, fast-check, ESLint purity guard, size-limit and tuning.
- [x] M1 Sim core: fixed 60 Hz ticks, camera acceleration/zoom/rotation, matching orthographic gate projection, SET reload, CAST cut lifecycle, call-sheet range, seeded strips, Talent path/forks, HOLD, film and all five failure states. 18 deterministic/scenario/property tests pass, including repeated 10,000-tick hashes for three seeds.
- [x] M2 Greybox: Talent, Urchin LOD, Boulder, Glass floor, 10 seeded strips, keyboard/mouse/touch controls, bot comparison and four Chromium screenshots. Automated browser checks pass; human fun test is pending.
- [x] M3 Full LOD: hysteretic Talent/entity tiers, four shared instanced Urchin geometry buckets plus sub-pixel culling, tier-change rings, and five tier screenshots. Tier oscillation, bucket selection, and ring cues are covered by unit/browser checks.
- [x] M4 Roster part 1: deterministic Extras crowds (4–12 moving members), size-culled Swarm, motion-gated Stagehand, LOD-sensitive Rope Bridge and collectible Reels. Per-rule sim scenarios plus mobile/desktop roster browser checks pass.
- [x] M5 Generator and bots — 200-seed gates pass after the shot-list change (latest report below).
- [ ] M6 Roster part 2 and Shoot structure — entity rules and the four-part Shoot are the default flow (`?scene=1` still opens one generated strip). The Adaptive full-Shoot duration gate is still open.
- [ ] M7 Visual signature — batched CAST AABBs, Night Shoot palette shift, and one-way adaptive DPR are implemented. M5/M6 phone and desktop screenshots were inspected; draw calls/triangles measured 10/8,014 and 8/5,826. The full ~20-image golden set remains.
- [x] M8 Audio — lazy WebAudio sources, in-frame source tracking, LOD filtering, stereo/mono panning, a 96 BPM pulse, gameplay cues, persisted master/music/effects controls, and a calm mix are implemented.
- [x] M9 Meta and share — UTC daily seed, local filmography/personal best by location and lens, last-five history, RLE base64url replay links, text share card, and 1080×1350 PNG export are implemented. Web Share sends the PNG file with the text card and replay URL where file sharing is supported; the clipboard fallback shares text and URL. Run summaries show transparent S/A/B/C grades for thirds, camera smoothness, close calls, and reel coverage. Contact-sheet moments are selected by re-simulating the exact input stream and rendering the selected states, with opening, up to three nearest close calls, best thirds, fatal frame, and spread run samples. A 6-second optional WebM reel records those deterministic frames when MediaRecorder is supported. Grades unlock selectable Kodachrome (B), bleach bypass (A), and Ilford B&W (S) color treatments. Full finale completion, accumulated close calls, Monitor entries, and completed daily Shoots unlock lenses. Anamorphic, movable 40% Tilt-shift band, horizontally wrapping Fisheye with center-biased detail, fixed 85 mm Long Lens with doubled pan speed, and five-simulation-step/12 fps Super 8 rules are implemented and carried in replay v2 URLs.
- [ ] M10 Polish and human gate — reduced-motion CSS and WebGL ring suppression, accessible control names/focus, hazard hatch marks, left-hand layout toggle, safe-area padding, onboarding controls hint, labelled 75% wall-time assist, and a painted art pass are implemented. The cast and props now include Talent, four Urchin LOD sprites, Boulder, Stagehand, Reel, four Extras costumes, Swarm moths, Rumour smoke, teal/red Monitors, Glass, Bridge, and four Continuity props; art direction and remaining work are in `docs/ART-DIRECTION.md`. Physical weak-GPU/phone sign-off and a tuning-only pass remain open.

The earlier kill-criterion failure (smart bot 0.90× Tracker on 20 seeds) is superseded by the M5 200-seed result below. A human fun test is still pending.

M5 200-seed report after the shot list: Adaptive completed **99%** (target ≥95%), Tracker completed **0%** (target ≤40%), Adaptive/Tracker distance **5.025×** (target ≥1.3×), Wide/Adaptive **0.362×** (pass), Close/Adaptive **0.196×** (pass). Adaptive failures: 2 fell. Chaos passed **1,000/1,000** finite runs and generator p95 was **0.19 ms** (target ≤50 ms). Previous record, kept for the diff: Adaptive 88%, Tracker 100%, ratio 0.936×, Wide 0.489×, Close 0.831×. The strict validated startup remains opt-in (`?validated`).

M6 Adaptive Shoot report after this pass: **8/20** seeds reached the complete 40-second finale (was 7/20). Min/mean/max run times were **197.7 / 233.0 / 257.8 s**. Every finished finale landed inside 3–8 minutes; the other 12 died to a hit in Night Shoot or during the finale, so the all-seeds gate is still open. The three-scene Shoot is now the default; `?shoot=1` still works and `?scene=1` opens a single strip.

Performance: M2 recorded 0.75 ms p95; repeated M3/M4 Node runs measured 1.43–1.95 ms p95 while other Chromium processes saturated the 2-core environment, so the current performance gate is unresolved and needs a quieter rerun. M3/M4 browser counters were 6/12 draw calls and 138/940 triangles. The current production JavaScript measures 160.77 KB gzip and 132.45 KB brotli, under the 300 KB cap; simulated slow-3G load is estimated at 2.6 s versus the 2.0 s target.

M9 verification: codec/unit coverage includes deterministic round-trip, malformed and oversized payload rejection, grade metric boundaries, grade-based stock unlocks, lens feat thresholds, each lens rule boundary, replay lens identity, deterministic replay-frame selection, and malformed stored facts. Playwright verifies anamorphic gate geometry, v2 replay round-trip, and next-run Long Lens selection; other checks cover daily seed, history/grade persistence, share URL/PNG dimensions, settings, and reduced motion. Contact sheets contain nine panels and re-render the selected opening/close-call/thirds/fatal/run states from simulation snapshots. M10 physical human checks are still pending.

Bible M4 (set dressing, render only): the path is a rounded hand-cut felt strip, each scene has its own dressing, and the floor textures are cork, felt and paper. Hazard silhouettes are checked by `npm run silhouettes`. Simulation hashes and bot metrics are unchanged. Night Shoot shows practical pools, a wet sheen and a moonlight rim; the exposure rule is still bible M10.


## Bible M1: balance harness baseline (Stage 0)

Command: `npm run balance -- --stage=0 --mode=both --seeds=200 --jitter=8`. Raw seeds 1..200, report-only. Reports: [`reports/balance/stage-0-strip.json`](../reports/balance/stage-0-strip.json) and [`reports/balance/stage-0-shoot.json`](../reports/balance/stage-0-shoot.json). Wall time was ~12 min on 8 cores.

Every harness bot sees the world only through `src/bots/observe.ts`: on-screen cast, call-sheet "Coming in" entries, the Talent where it was last seen, the HUD gate text, film, the slate and the set path. Adaptive and Tracker keep their shipped policies (`players.ts` is unchanged at `aim = 1`); only their inputs are redacted.

**Reproduction (legacy full-state bots, unchanged scripts):** `validate:m5` gives Adaptive **99%**, Tracker **0%**, A/T **5.025×**, Wide **0.362×** and Close **0.196×**, exactly as recorded above. `validate:m6` gives **8/20**, 197.7 / 233.0 / 257.8 s. On fair information, Shoot seeds 1–20 still give Adaptive **8/20**. On the strip, fair Adaptive drops to **94.5%** (−4.5 pp). All 11 lost runs are `fell` on glass. Glass has no mark before it spawns, and a cut glass leaves no visible hole, so the shipped Adaptive was reading positions a player cannot see. This is a readability finding for M2/M4.

| Mode | Adaptive | Tracker | Gatekeeper | Metronome | Wide | Close | Chaos |
|---|---|---|---|---|---|---|---|
| Strip, completion | 94.5% | 0% | **100%** | 0% | 0% | 0% | 0% |
| Strip, mean distance | 161.7 | 32.8 | 165.7 | 20.5 | 59.7 | 32.4 | 21.9 |
| Shoot, completion | **43%** | 0% | **69.5%** | 0% | 0% | 0% | 0% |
| Shoot, mean distance | 574.2 | 38.8 | 616.3 | 27.8 | 74.0 | 38.9 | 30.1 |

Deaths by killer:
- Strip:
  - Adaptive: glass 11.
  - Tracker: film 200.
  - Metronome: offscreen 200.
  - Wide: extras 84, film 83, bridge 33.
  - Close: film 189, swarm 7, boulder 4.
- Shoot:
  - Adaptive: red-monitor 49, extras 35, glass 23, bridge 7.
  - Gatekeeper: red-monitor 50, glass 11.
  - Tracker: film 200.
  - Metronome: offscreen 200.

**Adaptive Shoot deaths by scene and kind (114):**

| Scene | Deaths | Kinds |
|---|---|---|
| BACKLOT | 7 | glass 7 |
| MINIATURE CITY | 6 | glass 6 |
| NIGHT SHOOT | 59 (51.8%) | red-monitor 49, glass 10 |
| LONG TAKE | 42 | extras 35, bridge 7 |

**S0 gates (targets for M2), Shoot:**

| Gate | Value | Target | Result |
|---|---|---|---|
| Passive (Gatekeeper) | 69.5% | ≤ 25% | FAIL |
| Metronome | 0% | ≤ 5% | pass |
| Adaptive | 43% | ≥ 85% | FAIL |
| Adaptive − passive | −26.5 pp | ≥ 55 pp | FAIL |
| Adaptive / passive distance | 0.932× | ≥ 1.5× | FAIL |
| Wide / Adaptive distance | 0.129× | ≤ 0.7× | pass |
| Close / Adaptive distance | 0.068× | ≤ 0.7× | pass |
| Top scene's share of Adaptive deaths | NIGHT SHOOT 51.8% | ≤ 50% | FAIL |
| Chaos | 0 | 0 | pass |

On the strip, Gatekeeper beats Adaptive: 100% vs 94.5%, distance ratio 0.975×. Metronome, Wide, Close and Chaos pass.

**Luck lines:**

| Check | Strip | Shoot | Target |
|---|---|---|---|
| jitter(gatekeeper, 8): seeds with ≥ 4/8 wins | 100% (200 seeds at 8/8) | 69.5% (139 seeds at 8/8) | ≤ 2%, none at 8/8 |
| jitter(adaptive, 8): seeds with ≥ 6/8 wins | 94.5% | 43.5% | ≥ 85% |
| Generator suspects (Adaptive < 4/8) | 10 seeds: 10, 25, 39, 41, 44, 106, 138, 155, 158, 193 | 112 seeds (in JSON) | listed |
| Adaptive SD over 10 buckets of 20 | 4.2 pp | 13.3 pp | ≤ 8 pp |
| Passive worst bucket | 100% | 90% | ≤ 40% |
| Passive FailReasons | 0 (no deaths) | 2, `hit` 82% | ≥ 3, none > 60% |
| Roster kinds per scene (min over seeds) | 4 | BACKLOT **2**, CITY 4, NIGHT 6, LONG TAKE 7 | ≥ 3 |
| Adaptive clear time | 61–107 s | 248.8 / 255.7 / 262.5 s | 180–480 s (Shoot) |
| NoKit on Day 3 | n/a | n/a | ≤ 10% |

**Reading:**
1. The zoom-only `defang` branch lets Gatekeeper clear every strip gate. Its Shoot deaths are almost all the Night Shoot hostile camera or glass.
2. The jitter histograms are almost all 0/8 or 8/8. A 150–300 ms delay and ±5% aim barely change outcomes because deaths are set by the layout. For example, the hostile camera kills at the same path point whatever the bot does.
3. These are the M2 targets. Harness: `src/bots/balance.ts` (CLI, report, killer inference, luck checks), `src/bots/balance-bots.ts` (Metronome, Gatekeeper, jitter) and `src/bots/observe.ts`. `tests/balance.test.ts` runs the 20-seed direction smoke. CI runs the full report with `continue-on-error` and uploads the JSON as an artifact.


## Bible M2: Stage 0 balance fix

Command: `npm run balance -- --stage=0 --mode=both --seeds=200 --jitter=8`. Raw seeds 1..200, fair observe view (`src/bots/observe.ts`). Reports: [`reports/balance/stage-0-strip.json`](../reports/balance/stage-0-strip.json) and [`reports/balance/stage-0-shoot.json`](../reports/balance/stage-0-shoot.json). Wall time was ~4.5 min on 8 cores. Numbers below are after the second review round.

**S0 column (bible §5), Shoot, before (M1) → after (M2):**

| Gate | M1 | M2 | S0 target | Result |
|---|---|---|---|---|
| Passive (best of Tracker, Gatekeeper) | 69.5% (Gatekeeper) | **0%** (Gatekeeper 0%, Tracker 0%) | ≤ 25% | pass |
| Metronome | 0% | 0% | ≤ 5% | pass |
| Adaptive (exact: zero reaction, exact aim) | 43% | **100%** | ≥ 85% | pass |
| Adaptive, jittered (150–300 ms, ±5% aim; 1,600 runs) | 43.5% of variants | **95.4%** of variants | — | — |
| Adaptive − passive | −26.5 pp | 100 pp | ≥ 55 pp | pass |
| Adaptive / passive mean distance | 0.932× | 32.7× (653.0 / 20.0) | ≥ 1.5× | pass |
| Wide / Adaptive distance | 0.129× | 0.061× | ≤ 0.7× | pass |
| Close / Adaptive distance | 0.068× | 0.031× | ≤ 0.7× | pass |
| One scene's share of Adaptive deaths | NIGHT SHOOT 51.8% | exact: no deaths; jittered: LONG TAKE 62% (46), NIGHT SHOOT 38% (28) | ≤ 50% | pass (exact) |
| NoKit, SpamKit | n/a | n/a | n/a at S0 | — |
| Chaos completions | 0 | 0 | 0 | pass |

**Luck lines, Shoot:**

| Check | M1 | M2 | Target |
|---|---|---|---|
| jitter(gatekeeper, 8): seeds ≥ 4/8; seeds at 8/8 | 69.5%; 139 | 0%; none | ≤ 2%; none |
| jitter(gatekeeper, 8) histogram [0/8 … 8/8] | mostly 8/8 | [200 0 0 0 0 0 0 0 0] | — |
| jitter(adaptive, 8): seeds ≥ 6/8 | 43.5% | **98%** | ≥ 85% |
| jitter(adaptive, 8) histogram [0/8 … 8/8] | almost all 0/8 or 8/8 | **[0 0 0 0 2 2 12 36 148]** | mixed; no seed < 4/8 |
| Seeds below 8/8; lowest | — | 52 (26%); 152 and 157 at 4/8, 105 and 5 at 5/8 | — |
| Generator suspects (< 4/8) | 112 | 0 | listed |
| Adaptive SD over 10 buckets; passive worst bucket | 13.3 pp; 90% | 0 pp; 0% | ≤ 8 pp; ≤ 40% |
| Passive FailReasons | 2, `hit` 82% | 2, `hit` 70% (urchin 140, film 60) | ≥ 3, none > 60% (**fails**) |
| Roster kinds per scene (min) | BACKLOT 2 | BACKLOT 2, CITY 3, NIGHT 6, LONG TAKE 7 | ≥ 3 (**fails**, BACKLOT) |
| Adaptive clear time (min / mean / max) | 248.8 / 255.7 / 262.5 s | 252.9 / 261.9 / 270.9 s | 180–480 s |

Every jittered Adaptive death is an Urchin in NIGHT SHOOT or LONG TAKE. The variants that die are the ones with a slow reaction or a tighter-than-intended zoom (aim < 1). The killing Urchin was announced on the call sheet about 2 s, or ~16 u, before contact.

**Strip** (`--mode=strip`, Backlot difficulty, unchanged by round 2):
- Adaptive is 100% (target ≥ 95%).
- Gatekeeper, Tracker and Metronome are 0%.
- Adaptive / passive distance is 9.8×, Wide / Adaptive 0.20×, Close / Adaptive 0.10×.
- jitter(adaptive) histogram is [0 … 0 200]. jitter(gatekeeper) has no seed at ≥ 4/8.

**Other checks:**
- `validate:m6` (fair driver): **20/20**, 256.3 / 261.8 / 268.1 s. It is now a **blocking** CI step. The validate:m5 and balance steps stay report-only.
- `validate:m5`: all gates pass.
- `npm run perf`: sim p95 0.53 ms.

**What changed.** Rules are in `DECISIONS.md` (2026-10-13).

Rules (`src/sim`):
- **Round 1:**
  - Defang needs a close cut since the gate opened, against a stand-in Urchin waiting on its mark.
  - Gates are seeded per scene.
  - Far Glass unloads intact instead of leaving an unseen hole.
  - The hostile camera has a 1 s tally that you can avoid by framing it out. It never cuts unseen cast or the floor.
  - Crowds trample only on contact with a visible member.
  - The Wrap strike line stays behind the Talent on winding paths. This was a bug.
- **Round 2:**
  - From Night on, an ahead-entry Urchin is already rolling once it is announced on the call sheet ("Coming in"), instead of waiting to be framed.

Tuning (`src/sim/tuning.ts`, round 2):
- Urchin speed by scene is 1.5 / 1.5 / **4.4 / 4.7** (Backlot / City / Night / finale).
- Ahead-entry share is 0.6 / 0.6 / **0.9 / 0.9**.
- Backlot, City and the strip are unchanged.

Generator (`src/gen`):
- **Round 1:** ≥ 50% of Urchins enter ahead on the path.
- **Round 2:** every scene has ≥ 2 heading changes of ≥ 90° (`minimumSharpTurns`). 9% of scenes had fewer; they now swap non-intro chunks for turning chunks with no more threat and the same forks. 0 of 5,000 sampled scenes fall short.

Tests:
- `tests/m2.test.ts` covers every rule above.
- The fixed replay hashes now run a **full** fair-Adaptive Shoot through the finale.
- Round 1 corrected one property test that already failed on M1: it now honours the documented Glass keep margin.

**Why this pressure, and what was rejected (round 2).** Urchin speed alone did nothing, even at 6.5 u/s. Unspawned Urchins waited until framed, so the call sheet gave unlimited warning, and medium-wide (38) defangs every Urchin. "Already rolling once announced" turns speed into a real reaction contest. It stays readable: about 2 s of on-screen and call-sheet warning, and a human needs ~0.3 s to react plus ~0.8 s to zoom.

Density shapes the spread. More, slightly slower Urchins give many small-risk encounters instead of one critical encounter per seed. That is what keeps every seed at ≥ 4/8.

Rejected:
- A second hostile camera, and a hostile camera nearer the path. Their deaths were purely geometric (0/8 or 8/8), not skill.
- "Late call" gates under the Wrap. The Night strike (2.6 u/s) outruns a medium Talent (2.5 u/s), so any hold there is fatal for everyone.
- Raising finale threat budgets. The budget is not the binding limit.

**Adaptive policy** (`src/bots/players.ts`): no round-2 changes. The four round-1 changes, each using only what the fair view shows:
1. Medium-wide (38) instead of Wide (48) near Urchins and in the finale, because Wide makes crowds trample and bridges drop.
2. React to an Urchin when it comes on screen (14 u, not 8 u).
3. Make the defang cut: put the frame edge between the nearest visible hazard in close-call range and the Talent.
4. Keep a seen hostile camera out of frame, preferring side or behind framings. Hold the framing and only widen while doing so.

**Still failing or open:**
- **Exact Adaptive is 100%, not 88–95%.** The exact bot reacts in zero time with exact aim, so it is the ceiling of the jittered population. Any fair reaction contest it loses on a seed is one nearly every human-like variant loses too.
  - Probe: at 7 u/s, exact Adaptive drops to 40%, but 47 of 60 seeds fall below 4/8 in jitter.
  - At 4.5 / 4.6 u/s, exact Adaptive has one Night death. That makes the exact-bot scene-share gate a degenerate 100%.
  - So pressure is tuned to the human-like (jittered) population: 95.4% of variants, 26% of seeds below 8/8, none below 4/8.
- **Passive "never samey" fails** (2 reasons, `hit` 70%). Gatekeeper is bible-defined: it tracks centred, zooms 40 on a defang cue and never reads hazards. It can only die to an Urchin before the first defang gate, or run out of film stalled there. A third reason needs something a centred medium frame never triggers: `fell` needs Wide or a close Glass cut, `lost-talent` needs losing the Talent, and `wrapped` needs a stall inside the Wrap zone, which was rejected above as unfair. With existing kinds and fair placement, I found no honest way to add a third reason.
- **BACKLOT roster minimum** is 2 on some seeds. It needs generator content.
- **Other owners:** the hostile camera tally telegraph and the defang HUD hint are being pushed to this branch by the render/UI agent.
