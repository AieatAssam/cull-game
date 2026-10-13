# CULL progress

Campaign milestones are in `docs/design/game-design.md`. The old M0–M10 checklist and the M2 kill criterion are retired. Core rules stay in `docs/CULL.md`.

Bible M4 (set dressing) is on main: a hand-cut felt path, per-scene dressing, and `npm run silhouettes`. Simulation hashes were left unchanged.

Bible M3: the gate caption, toast and coach lines come from `describeShot`. The grade's close-call count is the sim's `closeCalls`.

Human play sign-off is still open.

## Bible M1: balance harness baseline (Stage 0)

Command: `npm run balance -- --stage=0 --mode=both --seeds=200 --jitter=8`. Raw seeds 1..200, report-only. Reports: [`reports/balance/stage-0-strip.json`](../reports/balance/stage-0-strip.json) and [`reports/balance/stage-0-shoot.json`](../reports/balance/stage-0-shoot.json). Wall time was ~12 min on 8 cores.

Every harness bot sees the world only through `src/bots/observe.ts`: on-screen cast, call-sheet "Coming in" entries, the Talent where it was last seen, the HUD gate text, film, the slate and the set path. Adaptive and Tracker keep their shipped policies (`players.ts` is unchanged at `aim = 1`); only their inputs are redacted.

**Reproduction (legacy full-state bots, unchanged scripts):** `validate:m5` gives Adaptive **99%**, Tracker **0%**, A/T **5.025×**, Wide **0.362×** and Close **0.196×**, matching the pre-harness records. `validate:m6` gives **8/20**, 197.7 / 233.0 / 257.8 s. On fair information, Shoot seeds 1–20 still give Adaptive **8/20**. On the strip, fair Adaptive drops to **94.5%** (−4.5 pp). All 11 lost runs are `fell` on glass. Glass has no mark before it spawns, and a cut glass leaves no visible hole, so the shipped Adaptive was reading positions a player cannot see. This is a readability finding for M2/M4.

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
