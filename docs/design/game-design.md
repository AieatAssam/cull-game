# CULL: game design bible (campaign "Dailies")

Status: source of truth for the campaign build, revised 12 Oct 2026 against `main` @ `d905fab` (PR #1). It supersedes `docs/CULL.md` where they conflict. CULL.md stays the reference for the core rules (§2), LOD (§4) and tech (§13).
Inputs: `docs/design/review-2026-10-12.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/ART-DIRECTION.md`, `docs/art/style-guide.md`, `src/sim/{step,shoot,framing,tuning,m6}.ts`, `src/render/dailies.ts`, `src/bots/players.ts`.

Numbers marked ⚙ are first tuning guesses. They live in `src/sim/tuning.ts` or in per-stage data, never inline. Milestone numbers (M1…) are this bible's. PROGRESS.md's historical M0–M10 are different; PRs say "bible M3".

---

## 1. Pillars

1. **The frame is the only weapon.** Every threat, tool and reward is resolved by what is in the gate.
   *We do:* express every upgrade as a change to what counts as "framed". *We don't:* add guns, health, Talent abilities, or HUD buttons that act on the world without going through the frame.
2. **Every second is a decision, not a rhythm.** Threats come from ahead, behind and the sides, and timing depends on world state, not the clock.
   *We do:* gate every stage on a MetronomeBot that must fail. *We don't:* use fixed-interval spawns, allow one dominant zoom, or let "hold one key" solve anything.
3. **Fair, readable, deterministic.** Every death can be explained from one contact-sheet frame. The call sheet shows every pending spawn.
   *We do:* make every hidden property decidable with the right tool (thermal tells a mimic apart). *We don't:* use 50/50 guesses, hidden RNG in outcomes, or off-call-sheet ambushes.
4. **Kit is a decision, not a toggle.** Each camera upgrade spends a resource and carries a rule cost that can kill you.
   *We do:* make each view mode cut something you need. *We don't:* allow always-on upgrades or any upgrade that strictly dominates the base camera.
5. **One new rule per stage.** Each Day adds one framing rule, and its enemies are built to exploit it.
   *We do:* teach the rule in an intro chunk, then turn it against the player. *We don't:* escalate by stats alone (faster, more, tankier).

---

## 2. What exists on main (d905fab)

This is the build every milestone starts from.

- **Shoot flow** (`src/sim/shoot.ts`): the default take has four parts in `biomes`: `BACKLOT`, `MINIATURE CITY`, `NIGHT SHOOT`, then a 40 s `LONG TAKE` finale in which the Wrap is always active (`finalTakeSeconds`). `?scene=1` opens a single generated strip. Rosters grow by scene: Backlot has urchin, glass, extras and reel. City adds boulder, bridge, stagehand and the friendly monitor. Night adds swarm, rumour, red-monitor and continuity.
- **Shot-list gates** (`src/sim/framing.ts`):
  - `shotListForPath` gives each of scenes 0–2 two `ShotGoal { at, kind: 'defang' | 'portrait', done }`, at 20% and 48% of the path. These positions are the same in every scene and on every seed.
  - `defang` passes at `zoom >= 36` *or* `closeCalls > 0`.
  - `portrait` passes after defang, at `16 <= zoom <= 34`.
  - While a gate is open, `shotBlocksTalent` holds the Talent at the gate and film drains at 2× (`step.ts` ~l.105–125, l.266).
- **Camera** (`tuning.ts`): eased and capped. `panSpeed 0.3` × zoom, `panAcceleration 0.9`, `steadyFactor 0.35`, zoom 10–48 (start 30), 8 yaw steps in `rotationSeconds 0.18`. Past 34% of reach, `leashInput` (`main.ts` l.744) auto-pans toward the Talent. Shot size comes from the Talent's LOD tier (`src/sim/lod.ts`): Close-up up to zoom ≈20.8, Medium up to ≈41.7, Wide above that.
- **Near-miss scoring** (`step.ts` `noteFrameCut` l.52): cutting a hazard within `closeCallRadius 1.5` u of the Talent (centre to centre, at the cut tick) scores a flat `closeCallScore 250`. It is already hazard-relative, not time-based. `main.ts` l.789–796 recounts close calls for the grade with a hard-coded 1.5 and the pre-move position, so the two counts can disagree. Grade (`src/meta/grade.ts`) averages thirds, smoothness, close calls and reel coverage.
- **Reels** are collected by Talent touch at tier ≤ 1 (`step.ts` l.243): +15 s `reelFilm`, +100 score. Framing a Reel out cuts it with no reward.
- **Hazards:**
  - The urchin is lethal at tier ≤ 1.
  - The Rumour grows off-screen and shrinks on-screen (`m6.ts` l.6) but is **not lethal**: it has no hit branch in `step.ts`.
  - The red-monitor acts only while framed. Its cone fails the take with `hit` if it covers the Talent, and cuts any other cast it covers.
- **Title, coaching, cut juice** (`main.ts`): `#title-card` l.111; `coachMessage()` l.652 (three hints over 20 s); `showCut` l.813 with slice, peel, CUT stamp, sparks, shake and 70 ms hit-stop (`style.css` ~l.170–209).
- **Art: "Dailies"** (`src/render/dailies.ts`):
  - `PALETTE` holds the 10 style-guide colours. `SCENE_LOOKS` gives per-scene sky, ground, path, blocks, key and hemi.
  - `talentFrame` draws a procedural 4-frame Talent walk.
  - The set is Lambert boxes and planes (`main.ts` l.246–288), lit by a hemisphere light and one key light, with no shadows, vignette or grain.
  - Night Shoot is a palette swap only (ground `#1b2433`, blocks `#2c3a52`), with no light mechanic.
  - `docs/art/style-guide.md` sets the rules: 10 colours, carmine only for the Talent and the hostile camera, an upper-left key, contact shadows, and Fraunces/Source Sans 3. It has no silhouette rule; `ART-DIRECTION.md` l.30–43 has per-cast notes.
- **HUD caption vs toast:**
  - The caption `#lod` (`main.ts` l.695) shows the *Talent* tier plus the nearest urchin's tier.
  - The toast `#message` (l.701) shows the shot-list text, or else an urchin sentence that uses "Wide shot" to mean the *urchin's* tier.
  - The result is "Medium shot · spikes are gone" next to "Wide shot".
- **Replay** (`src/replay/codec.ts`): v1 (35 mm) and v2 (with lens), stored in the URL hash. Contact sheets come from `src/replay/contact-frames.ts` and `src/ui/contact-sheet.ts`. localStorage holds `cull.filmography.v1`, `cull.film-stock.v1`, `cull.lens.v1` and other keys.
- **Determinism:** `tests/sim.test.ts` l.217 replays 10,000 ticks on seeds 1, 19 and 2026 to fixed hashes.
- **Budgets** (`tuning.ts` `performance`): ≤ 24 draw calls, ≤ 60k triangles and sim p95 ≤ 1 ms, enforced in `tests/e2e/*.spec.ts` and `src/bots/perf.ts`. JS stays ≤ 300 KB (`npm run size`).

**Balance today** (`docs/PROGRESS.md`):

| Mode | Adaptive | Tracker | Other |
|---|---|---|---|
| Single strip, 200 seeds | 99% | 0% | A/T distance 5.0×, Wide 0.36×, Close 0.20×, chaos 1,000/1,000 |
| Full Shoot, 20 seeds (`validate:m6`) | **8/20** finish | not measured | the other 12 die to a hit in Night Shoot or the finale; 197.7 / 233.0 / 257.8 s |

Tracker's 0% is an artefact: it never changes zoom, so the first gate holds it until film runs out. A passive bot that zooms on cue passes `defang` with `zoom >= 36` alone and needs no cut, and the review's blind metronome won the strip in 87.9 s before PR #1. Passive play still wins too much; M1 measures it properly. (`docs/design/review-2026-10-12.md` quotes older figures.)

---

## 3. Core loop

**Verbs:** pan, zoom (LOD is physics), rotate (45° snaps), steady, HOLD, and from Day 2 one camera-kit action (Flash, Thermal, X-ray, Render Pass). A thing is **cut** the moment it stops being framed.

**Loop (per 5–15 s):** read the call sheet → pick a framing that decides what will exist → execute the cut, squeeze or glance → bank coverage → re-centre before the Talent's 1.0 s grace runs out.

A skilled player breathes the zoom (Wide to defang and scout, Close-up to bank), frames off-centre, chooses near-miss cuts and spends kit at decisive moments. A passive player parks the Talent dead centre, switches zoom only on cue at a gate, and bleeds film.

**Why rhythm-tapping fails** (each item is owned by a milestone):
1. **Gates demand a chosen cut** (M2). `defang` drops its zoom-only branch, gate positions are seeded per scene, and gates become shot cards (M7).
2. **Threats come from ahead** (M2). ≥ 50% ⚙ of Urchins enter in front of the Talent, so a pan-behind doesn't remove them.
3. **Coverage is banked by the camera** (M7). Reels bank when framed at Close-up for 0.5 s ⚙, not by touch.
4. **LEDGER enemies advance while you aren't looking** (Understudy M8, Grip M11).
5. **The path turns.** The branch steering in `DECISIONS.md` l.6 stays. Every scene has ≥ 2 ⚙ heading changes of ≥ 90° (M2).
6. **Hard gate:** Metronome ≤ 5% on every stage, Stage 0 included (M2).

---

## 4. Campaign: "Dailies"

The campaign is a five-day shoot on one tabletop set. Each **Day** is a 3-scene Shoot plus a finale, built on `src/sim/shoot.ts` as a `StageDef` (M5). The existing Shoot becomes **Stage 0**: the regression baseline and the post-campaign Free Shoot. Days reuse existing biomes where one fits:

| Day | Biome foundation | Rule | Kit earned |
|---|---|---|---|
| 1 Backlot | `BACKLOT` + `SCENE_LOOKS[0]` | Coverage | Flash |
| 2 Night Shoot | `NIGHT SHOOT` + `SCENE_LOOKS[2]`, relit | Exposure | Thermal |
| 3 Creature Shop | new | Fog | X-ray |
| 4 Miniature City | `MINIATURE CITY` + `SCENE_LOOKS[1]` | Occlusion | Render Pass |
| 5 Green Screen | new | Layers | none (finale) |

Days 1–4 each end with a **kit beat**: a scripted, safe chunk where the camera gains an upgrade and must use it once to leave. The campaign is 35 mm only.

**Palette:** the 10 style-guide colours (`PALETTE`) are fixed for the cast on every Day, and carmine stays reserved for the Talent and the hostile camera. Each Day sets its own `SCENE_LOOKS` entry (sky, ground, path, blocks, key, hemi), plus at most 2 extra light tints.

### Readability rules (every Day, from M4)
- **Silhouette:** every hazard must be identifiable from a 1-colour ink silhouette at Medium (zoom 30) on a 1280×720 gate.
  - Minimum height is 20 px.
  - After normalising scale, any two kinds overlap by IoU ≤ 0.7 ⚙.
  - The checked asset is `reports/art/silhouettes-day<n>.png`.
- **Contrast:** hazard vs ground ΔE ≥ 25 ⚙, and Talent vs everything ΔE ≥ 30 ⚙. The review measured ΔE < 5.
- **Depth:** everything standing casts a contact shadow. The path and props have visible height.
- **Lit pixels** (any Day): in a frame where the gate contains a lit area, ≥ 20% ⚙ of gate pixels have L\* ≥ 40.
- **Screenshot recipe:** `?debug&frozen=1&stage=N&seed=S`, then `__cull.step(T)`, the pattern the e2e specs already use. Each Day names its frames below.

### Kit rules (every upgrade)
- **One view mode at a time.** Thermal, X-ray and Render Pass are mutually exclusive. Switching between them passes through Beauty for 0.3 s ⚙. Flash is instant and works in any mode.
- **The cost is resource plus rule.** Every kit has a meter (charges, battery or heat) *and* a framing side effect that can cut something you need.
- **Kit is part of the input:** `InputFrame.kit` (0..4), replay v3, included in the state hash (M6).
- **Bindings:** F/T/X/R or 1–4; on touch, a 4-slot arc around HOLD.

---

### Day 1: BACKLOT
- **Visual:** `SCENE_LOOKS[0]` after M4: plywood and felt ground, cardboard flats with height and contact shadows, a warm upper-left key. Shot cards get a grease-pencil circle when banked.
- **Art checks:**
  - Silhouette sheet for Urchin, Boulder, Stagehand, Understudy, Glass and Extras.
  - The Understudy (a felt mannequin on a rail) must not share an IoU > 0.7 with Extras.
  - Screenshots: seed 1 at the first shot card (Medium), and seed 1 with the Understudy's call-sheet counter visible.
- **Twist: Coverage.**
  - **Shot cards** replace the fixed defang/portrait pair. `ShotGoal.kind` gains `two-shot` (Talent plus a live hazard in one Close-up), `span` (a whole bridge in frame) and `dutch` (rotated during a crossing).
  - Each scene gets 2–3 cards ⚙ at seeded positions within 15–85% of the path. A card still holds the Talent (`shotBlocksTalent`) and still drains film at 2×.
  - A banked card gives +12 s ⚙ film.
  - **Reels** bank when framed at Close-up for 30 ticks ⚙ (`reelFilm` 15 s stays). Touch no longer collects them.
  - Tune so walk time without coverage exceeds the film budget by 20–40% ⚙.
- **Enemies:**
  1. **Urchin** (existing): lethal at tier ≤ 1, now entering ahead ≥ 50% of the time. *Counter:* go Wide to defang, or squeeze it out.
  2. **Boulder** (existing): rolls along the arrow on its call-sheet box. *Counter:* keep its box out of the gate until the Talent is past, or let it in behind.
  3. **Stagehand** (existing): steals Reels within 0.45 u while the camera moves. *Counter:* steady pans and planned moves.
  4. **Understudy** (new, LEDGER):
     - While unframed it advances 1.2 u/s ⚙ along a floor rail; while framed it freezes. Contact is lethal at every tier.
     - It is dismissed after 1.0 s ⚙ of continuous Close-up. Its call-sheet box shows its distance.
- **Upgrade earned: FLASH.**
  - 3 charges ⚙ (max 3), +1 per Reel banked, 2.0 s ⚙ cooldown.
  - Firing makes every entity in the gate **exposed** for 3.0 s ⚙ (a latent image) and freezes cast in the gate for 1.0 s ⚙.
  - *Costs:* the Talent is dazzled into HOLD for 0.5 s ⚙ (2× film), and Moths retarget the flash point.

### Day 2: NIGHT SHOOT ("day for night")
The existing near-black strip becomes this Day's foundation: **light owns the stage.** From M10, no strip in any mode, Stage 0 included, renders the old unlit `SCENE_LOOKS[2]`.
- **Visual:**
  - Blue-gelled felt `#1d2a3f` and sodium practicals `#ffb347` (the existing key colour).
  - Every lit area comes from a visible source: a lamp prop with a cone and a pool decal on the felt.
  - Unlit felt keeps a cool rim on the path edges, at contrast ≥ 3:1 vs ground, so the route reads even in the dark.
  - Hazards outside light show only as call-sheet chalk marks.
  - *Signature:* the flash white-out frame, then a cyan-negative latent ghost that peels like burned film when it expires.
- **Art checks:**
  - Silhouettes for Grip (tall hooded figure carrying a flag on a C-stand), Moths (wing V) and Rumour (smoke lobe).
  - These must read when rim-lit against `#1d2a3f`, not only on paper.
  - The lit-pixel rule applies at every Practical.
  - Screenshots on seed 1: a blackout segment before Flash, the same segment during the latent image, and a Grip exposed inside a pool.
- **Twist: Exposure.** On this Day, **in frame = inside the gate AND lit.**
  - Light sources:
    - Practicals switch on after 0.5 s ⚙ framed at Close-up and stay lit for 10 s ⚙.
    - Flash latent images light what they expose.
    - The Talent's own practical has radius 0.6 u ⚙.
  - Unlit cast in the gate is cut.
  - Unlit SET stops the Talent ("holding for set") at 2× film.
  - Each Day has ≥ 4 ⚙ blackout segments of 5–7 u with no Practical in reach. A latent image at Medium covers about 7.5 u.
- **Enemies:**
  1. **Grip in Black** (LEDGER):
     - While unexposed, its ledger advances 2.0 u/s ⚙.
     - When exposed, it materialises at its ledger position and hits if that is within 1.0 u of the Talent.
     - Flashing it while exposed stuns it for 2 s and pushes it back 6 u ⚙.
  2. **Moths** (the existing swarm, retargeted):
     - They fly at 2.5 u/s ⚙ toward the last flash point (for 4 s), otherwise the nearest lit Practical. Lethal at Close/Medium. *Counter:* flash away, then frame them out or go Wide.
  3. **Rumour** (existing):
     - Becomes lethal on contact, its first hit branch in `step.ts`.
     - It grows while unexposed (`rumourGrowRate`) and shrinks only while exposed.
- **Upgrade earned: THERMAL** (view mode).
  - Battery 8 s ⚙. Drains 1/s while on, recharges 0.25/s while off, 0.3 s ⚙ spin-up.
  - Warm entities stay framed through darkness and fog.
  - **Cold cast** (Glass, bridge planks, Reels, props) is not framed and is cut after 0.25 s ⚙ in the gate.

### Day 3: CREATURE SHOP
- **Visual:**
  - Workshop fluorescent `#9fbf8a`, latex creatures in clay `#d4846a` and violet, cotton-wool fog banks with a soft top highlight and a floor shadow.
  - Thermal uses an ironbow ramp (`#1a0b3a` → `#ff6a00` → `#fff2a0`).
- **Art checks:**
  - Mimic and its prop are **deliberately** identical in Beauty: a Mimic/prop IoU of 1.0 is required.
  - In Thermal they must differ by ΔE ≥ 40.
  - Hound (low four-legged wedge) and Decoy (Talent shape without the coat hem) pass the IoU rule against everything else.
  - Fog must leave the path edge readable.
  - Screenshots on seed 1: a fog crossing in Beauty and Thermal, and a Mimic reveal.
- **Twist: Fog.**
  - Anything inside fog is unframed in Beauty, so cast is cut and the Talent's grace runs.
  - Warm things stay framed in Thermal.
  - Each Day has ≥ 3 ⚙ crossings of 2.0–4.0 s, and each scene ≥ 2 ⚙ Mimic/prop pairs.
- **Enemies:**
  1. **Mimic:**
     - Placed next to a real prop of the same silhouette that the path needs; lunges at 4 u/s within 2.5 u ⚙. *Counter:* identify it in Thermal, then squeeze or rotate out only the Mimic.
  2. **Animatronic Hound:**
     - Enters opposite your current pan velocity and runs at 3.5 u/s ⚙. Lethal at Close/Medium.
     - Overheats and goes inert after 4 s ⚙ at Close-up.
  3. **Decoy Double:**
     - A cold Talent lookalike that takes the other branch at forks; following it loses the real Talent. Thermal cuts it.
- **Upgrade earned: X-RAY.**
  - Heat +25/s ⚙ on, −20/s off. At 100 it locks for 4 s ⚙ and resets to 50.
  - Occlusion is ignored, and **every entity, the Talent included, is evaluated one LOD tier coarser.** You can't bank coverage at true Medium, and bridges drop planks a step early.

### Day 4: MINIATURE CITY
- **Visual:**
  - Rebuilds the existing biome as pop-up-book paper buildings: pastel card with visible folds, a hard noon key, and tilt-shift blur at the gate edges.
  - *Signature:* an occlusion cut that peels along the building's silhouette, not the gate edge.
- **Art checks:**
  - Silhouettes for Traffic (a toy car in profile at 8 yaws), Peeper (eyes plus a hand on a sill), Cranes (folded V) and the Red Monitor (moves here from Night Shoot).
  - Buildings must not share a silhouette with Continuity props.
  - Screenshots on seed 1: an arcade in Beauty and X-ray, and an occlusion peel.
- **Twist: Occlusion counts** (Days 4–5 only).
  - This reverses `DECISIONS.md` l.3 for these Days and needs a new entry there.
  - An entity ≥ 90% ⚙ covered by building silhouettes at the current yaw is unframed.
  - Each Day has ≥ 3 ⚙ arcades, occluded from all 8 yaws for 2.0–3.5 s of walking. 3.5 × 25 heat = 87.5 < 100.
- **Enemies:**
  1. **Traffic:** toy cars cross at 5 u/s ⚙, lethal above Proxy. *Counter:* occlude them, or HOLD.
  2. **Peeper** (LEDGER): while its window is unseen, it hops one window toward the Talent every 1.5 s ⚙. It grabs within 2 u.
  3. **Paper Cranes:**
     - They are above the rooflines and never occluded. They dive at 4 u/s ⚙ while the Talent is under a roof. Lethal at Close/Medium.
     - X-ray's coarsening makes them harmless.
  4. **Red Monitor** (existing): its cone is now blocked by buildings.
- **Upgrade earned: RENDER PASS** (Beauty ↔ Wire).
  - 0.4 s ⚙ wipe. Film burns at 2× in Wire.
  - In Wire, all cast, the Talent included, is evaluated at Proxy tier: inert, can't bank coverage, and can't fit 1 u gaps.

### Day 5: GREEN SCREEN (final)
- **Visual:**
  - Chroma green `#3bd16f`, tracking-marker crosses, ink void, wire cyan `#3fd8ff`. This is art concept B from the review.
  - *Signature:* a scanline wipe. Things that exist in one layer only peel along the wipe line.
- **Art checks:**
  - Every enemy must pass the silhouette rule in both layers.
  - Chroma tiles must read against real floor in Beauty, with ΔE ≥ 25.
  - Screenshots on seed 1: a mid-wipe frame, and the Editor's gate overlapping yours.
- **Twist: Layers.**
  - Entities are tagged Beauty, Wire, or both. Only the current layer is framed.
  - Switching cuts every single-layer cast of the old layer that is in the gate.
  - Chroma floor exists in Wire only, so switching to Beauty while the Talent is on it drops her.
- **Enemies:**
  1. **Comp Ghoul** (Beauty only): hunts at 2.2 u/s ⚙.
  2. **Rig Spider** (Wire only): permanently eats chroma tiles ahead of the Talent.
  3. **The Editor:**
     - A red 8×8 u ⚙ gate drifting from behind at 1.5 u/s ⚙. SET it covers outside your gate is cut for good; a Talent inside it and outside yours is lost after 0.3 s. Flash blinds it for 3 s ⚙.
- **Long Take finale** (the existing 40 s `finalTakeSeconds`, Wrap active): one callback per kit, then a chroma bridge with the Editor. Clearing it unlocks **Director's Cut**.

---

## 5. Difficulty and balance

### Harness
- **Exists:**
  - `src/bots/players.ts`: `tracker`, `wide`, `close`, `adaptive`, `chaos`; `evaluateBots(200)`.
  - `src/bots/m5-validation.ts` and `src/bots/m6-validation.ts`.
  - `src/bots/perf.ts`, `src/gen/validated.ts`, `tests/gen.test.ts`, `tests/helpers/chaos-invariants.ts`.
  - CI (`.github/workflows/ci.yml`) runs `validate:m5` and `validate:m6` as report-only steps (`continue-on-error`).
- **Added by M1:**
  - `src/bots/balance.ts`: `npm run balance -- --stage=<0..5|all> --mode=strip|shoot --seeds=200 --jitter=8`. It writes `reports/balance/stage-<n>.json`, which records per-seed outcome, `FailReason`, killing entity kind and scene.
  - **`metronome`:** pans toward the path end for 60–90 ms every 500 ms. It never zooms and never uses kit.
  - **`gatekeeper`:** behaves like Tracker, but meets each open `ShotGoal` mechanically: zoom 40 for defang, 24 for portrait, and the nearest legal framing for later card kinds. It never reads hazards. The **passive** gate uses the better of Tracker and Gatekeeper.
  - **`jitter(bot, k)`:** adds seeded 150–300 ms reaction delay and ±0.05 gate aim noise, across k variants per seed.
  - `tests/balance.test.ts`: a 20-seed smoke run per shipped stage. It checks the direction of each gate, not the threshold.
- **Added later:**
  - `nokit` and `spamkit` (M9).
  - `src/bots/observe.ts`, the fair-information view (M10). Bots read only framed, *lit* or *visible-in-mode* entities, the call sheet and HUD meters.
  - Per-Day Adaptive policies in `src/bots/policies/stage-<n>.ts`, one per rule milestone.
- **Raw seeds are the honest number.** All gates use unvalidated seeds 1..200. `generateValidatedScene` may filter the daily seed, but filtered numbers are never reported as balance.

### Targets per stage (200 raw seeds, full Shoot including the finale)

| Gate | S0 (M2) | D1 | D2 | D3 | D4 | D5 |
|---|---|---|---|---|---|---|
| Passive (best of Tracker, Gatekeeper) ≤ | 25% | 25% | 25% | 20% | 20% | 15% |
| Metronome ≤ | 5% | 5% | 5% | 5% | 5% | 5% |
| Adaptive ≥ | 85% | 90% | 85% | 85% | 80% | 80% |
| Adaptive − passive ≥ | 55 pp | 60 pp | 55 pp | 60 pp | 60 pp | 65 pp |
| Adaptive / passive mean distance ≥ | 1.5× | 1.5× | 1.6× | 1.7× | 1.7× | 1.8× |
| NoKit ≤ | n/a | n/a | 5% | 10% | 5% | 5% |
| SpamKit / Adaptive ≤ | n/a | n/a | 0.6× | 0.6× | 0.6× | 0.6× |
| Wide, Close / Adaptive distance ≤ | 0.7× | 0.7× | 0.7× | 0.7× | 0.7× | 0.7× |
| One scene's share of Adaptive deaths ≤ | 50% | 50% | 50% | 50% | 50% | 50% |

### Luck checks (all stages)
- **Passive can't luck through:** with `jitter(gatekeeper, 8)`, ≤ 2% of seeds have ≥ 4/8 variant wins, and no seed has 8/8.
- **Skill is reliable:** with `jitter(adaptive, 8)`, ≥ 85% of seeds have ≥ 6/8 variant wins. Seeds below 4/8 are listed as generator bugs.
- **Seed variance:** over 10 buckets of 20 seeds, Adaptive's standard deviation ≤ 8 pp and passive's worst bucket ≤ target + 15 pp.
- **No coin flips:** NoKit on Day 3 ≤ 10%. With 6 pairs at 0.5 each, the expected rate is ≈ 1.6%.
- **Never samey:** passive deaths spread over ≥ 3 `FailReason`s, none above 60%. Every scene has ≥ 3 roster kinds.
- **Duration:** an Adaptive clear takes 3–8 min of sim time (the `validate:m6` cap).

Chaos stays at 0 completions and 1,000/1,000 finite on every stage. Every PR reports its stage table and luck lines in `docs/PROGRESS.md` and links the JSON.

---

## 6. Build milestones

One PR per milestone, in order, each with one reviewable idea. Every PR passes `lint`, `typecheck`, `test`, `build`, `size`, `test:e2e`, and `npm run balance` for every shipped stage. Visual PRs attach screenshots taken with the §4 recipe. A stage's gates become **blocking** (they lose `continue-on-error`) from the milestone named below.

M1–M12 deliver a two-Day vertical slice. M13 is the human-playtest go/no-go for Days 3–5.

### M1: Balance harness (harness only)
- **Scope:**
  - `balance.ts`, `metronome`, `gatekeeper`, `jitter`, the JSON report with killer kind and scene, and `tests/balance.test.ts`.
  - A report-only CI step.
- **Out:** any change under `src/sim` or `src/render`.
- **Acceptance:**
  - The `tests/sim.test.ts` hashes are unchanged.
  - Stage 0 reproduces PROGRESS within ±3 pp: strip Adaptive 99%, Tracker 0%; Shoot seeds 1–20 at 8/20.
  - PROGRESS records the first Metronome and Gatekeeper numbers for both modes, and Adaptive's Shoot deaths broken down by scene and kind.

### M2: Balance first: fix Stage 0 before new content
- **Problem:**
  - Adaptive finishes the full Shoot on 8/20, dying in Night Shoot and the finale.
  - Passive play clears gates by zoom alone.
- **Levers:** tuning and scene data only.
  - Drop `defang`'s `zoom >= 36` branch: it needs a close cut made since the gate opened.
  - Seed gate positions per scene.
  - ≥ 50% ⚙ ahead-entry for Urchins.
  - ≥ 2 heading changes of 90° per scene.
  - Night/finale hazard density and speed.
  - Fixes to the Adaptive policy for Night Shoot and the finale.
  - No change may raise a passive number.
- **Out:** new kinds, art, kit.
- **Acceptance (blocking for S0):**
  - The S0 column passes. In particular, Adaptive is ≥ 85% on 200 seeds (from 40% on 20).
  - `validate:m6` reaches 20/20 within 3–8 min, and its CI step becomes blocking.
  - Passive ≤ 25%, Metronome ≤ 5%, and no scene owns > 50% of Adaptive deaths.
  - Strip mode holds Adaptive ≥ 95%.
  - The jitter luck lines pass.
  - The hash test fixtures are regenerated, with a `DECISIONS.md` entry.

### M3: One source of truth for the HUD
- **Scope:**
  - A pure `describeShot(state)` that returns the Talent's shot size, each hazard state ("spikes dull/sharp", never a shot-size word) and the gate text.
  - The `#lod` caption, the `#message` toast and the coaching all render from it.
  - The grade's close-call count reads the sim's `closeCalls`, and the `main.ts` l.789 recount is deleted.
- **Acceptance:**
  - A table test covers every tier combination.
  - An e2e check over 600 ticks on seeds 1, 19 and 2026 finds no frame where the caption and toast name different shot sizes.
  - The grade's close calls equal the sim's on 200 bot runs.
  - Before/after screenshot of the contradiction frame.

### M4: Set dressing and readability
- **Scope:**
  - Miniature materials: felt, cork and cardboard canvas textures with baked edge AO.
  - Instanced blob contact shadows under every standing sprite and prop.
  - A raised path (0.15 u ⚙) with bevelled side faces.
  - Props with height and a top-face highlight.
  - The style-guide vignette and grain.
  - Silhouette fixes for existing hazards (Urchin, Boulder, Glass, Extras, Swarm, Rumour, Stagehand, both Monitors, Continuity).
  - `npm run silhouettes`, which renders the §4 sheets.
- **Out:** the Night look (M10), new kinds.
- **Acceptance:**
  - Silhouette and contrast rules pass for all existing kinds.
  - Draw calls ≤ 24 and triangles ≤ 60k on the worst frame. Size ≤ 300 KB.
  - Hashes are unchanged (render only).
  - Before/after screenshots of Backlot and City (seed 1, desktop and 390×844), signed off by the art director as "reads as a handmade miniature".

### M5: Stage plumbing
- **Scope:**
  - `src/sim/stages.ts` `StageDef`: biomes, roster weights, rule flags, kit allowed, film params, `SCENE_LOOKS` key.
  - A framing-predicate hook in `framing.ts`, so rule flags extend "framed" without call-site edits.
  - The `?stage=` flag. The current Shoot becomes Stage 0.
- **Acceptance:**
  - Stage 0 hashes are unchanged.
  - A stub Stage 1 loads and runs Backlot-only scenes.

### M6: Kit input and replay v3
- **Scope:**
  - `InputFrame.kit` and an inert `KitState` in `src/sim/kit.ts`.
  - Replay codec v3.
- **Acceptance:**
  - Hashes are unchanged when kit is 0.
  - v3 round-trips in a fuzz test of 1,000 random inputs.
  - Existing v1/v2 URLs decode.

### M7: Day 1 Coverage (shot cards and camera-banked Reels)
- **Scope:**
  - The new `ShotGoal` kinds and seeded cards.
  - Framing-banked Reels.
  - The film formula.
  - The Day 1 chunk tags and the Adaptive policy.
- **Acceptance:**
  - D1 column passes for passive and Metronome.
  - Scenarios: a Reel banks after 30 Close-up ticks and not at Medium. A card holds the Talent until banked.
  - Screenshot of a card bank.

### M8: Understudy
- **Scope:** the Understudy with its rail generator rules and sprite.
- **Acceptance (D1 blocking):**
  - Full D1 column.
  - Scenarios: it freezes while framed, advances exactly 1.2 u/s when unframed, and is dismissed after 60 Close-up ticks.
  - Its silhouette sheet passes.

### M9: Flash
- **Scope:**
  - The Flash kit and its meter.
  - The Day 1 kit beat.
  - The HUD slot.
  - The `nokit` and `spamkit` bots.
- **Acceptance:**
  - Scenarios: a latent image lasts 180 ticks, cast freezes for 60 ticks, and the dazzle forces 30 ticks of HOLD.
  - D1 still passes.
  - White-out screenshot.

### M10: Exposure: Night Shoot becomes Day 2
- **Scope:**
  - The Exposure rule flag.
  - Practicals.
  - Blackout segments.
  - The lit Night rig: pools, rims and the Talent's practical replace `SCENE_LOOKS[2]` everywhere.
  - `observe.ts`.
  - Rumour lethality.
  - The Day 2 policy.
- **Acceptance:**
  - Scenarios: unlit cast in the gate is cut, unlit SET holds the Talent, and the Rumour hits.
  - `observe.ts` test: an unlit entity is invisible to bots.
  - Lit-pixel and contrast rules pass.
  - The Day 2 screenshots.
  - S0 still passes with the new look.

### M11: Grip in Black
- **Acceptance:**
  - Scenarios: the ledger advances while unexposed, materialises when exposed, and flashing pushes it back 6 u.
  - Silhouette passes rim-lit.
  - NoKit on D2 ≤ 5%.

### M12: Moths
- **Acceptance (D2 blocking):**
  - Full D2 column.
  - Scenario: Moths retarget to the flash point for 240 ticks.
  - Silhouette passes.

### M13+: Campaign shell, then Days 3–5 (same template: kit, rule plus its set, one enemy per PR)

| M | Idea | Measurable acceptance |
|---|---|---|
| 13 | Campaign shell: Day select on the call-sheet board, `cull.campaign.v1`, kit HUD and touch arc | E2E fresh profile: Day 1 → kit beat → Day 2 unlocked. Locked Days unselectable. 390×844 and desktop screenshots. **Human playtest of Days 1–2 (CULL.md §16, 5 signals) is the go/no-go for Days 3–5** |
| 14 | Thermal kit | Cold cast cut after 15 ticks. Thermal over Glass for 15 ticks → fall. D2 still passes |
| 15 | Fog rule + Creature Shop set | Fog unframes in Beauty, not in Thermal (warm). Day 3 art checks and screenshots |
| 16 | Mimic | `observe.ts` property test: Mimic ≡ prop in Beauty. Coin-flip check ≤ 10% |
| 17 | Hound | Entry side flips with pan velocity. Inert after 240 Close-up ticks |
| 18 | Decoy | Decoy is cut in Thermal. **D3 blocking** |
| 19 | X-ray kit | Tier coarsening and heat lockout scenarios |
| 20 | Occlusion rule + Miniature City rebuild + Red Monitor cone blocking + DECISIONS entry | Every arcade occluded at all 8 yaws. Sim-vs-three silhouette equality. Perf p95 ≤ 1 ms. Day 4 screenshots |
| 21 | Traffic | Rotation occludes and cuts a car |
| 22 | Peeper | Hops only while unseen |
| 23 | Paper Cranes | Dive only under roofs, harmless in X-ray. **D4 blocking** |
| 24 | Render Pass kit | Proxy evaluation in Wire, 2× film |
| 25 | Layers rule + Green Screen set | A switch cuts single-layer cast. Beauty on chroma → fall. Day 5 screenshots |
| 26 | Comp Ghoul | Cut by switching to Wire |
| 27 | Rig Spider | Eaten tiles persist |
| 28 | The Editor | SET cut under the Editor stays cut. Flash blinds for 180 ticks |
| 29 | Long Take callback finale + Director's Cut | Adaptive clears ≥ 16/20 ⚙. **D5 blocking** |
| 30 | Full audit (tuning only) | Every §5 cell and luck line on 200 seeds. Golden set: 2 per Day plus each kit mode. ≤ 24 draw calls on each Day's worst frame |

---

## 7. Cuts list (we will not do)
- A B-camera, second gate or player-placed monitor; the Editor is the only second frame.
- Weapons, HP, boss health bars, or any damage model.
- Currency, shops, random upgrade drafts, or a roguelite kit order. Kit order is fixed by Day.
- Lens play inside the campaign. The campaign is 35 mm only; lenses stay a Free Shoot/daily meta with no rebalancing.
- Free camera rotation, gameplay screenshake beyond the existing cut juice, or a camera auto-follow that plays for you (the existing `leashInput` stays a recentring assist).
- Occlusion outside Days 4–5.
- More than 5 Days, a 6th upgrade, or difficulty modes. Overcrank remains the only assist.
- Story cutscenes beyond slate cards and kit beats; no voice.
- Online leaderboards or server features.
- 8-way animation for new enemies beyond 2 directions plus idle until after M30.
- A separate unlit "dark" strip. Darkness only exists where a Day's rule makes light a resource.
- Real-time shadow maps; contact shadows are instanced blobs to protect the 24-draw-call budget.
