# Loop review — 2026-10-13

This review responds to the report that the current build is "unusable". The evidence comes from two new personas, `human-keys` and `human-touch` (`src/bots/human.ts`). They play only through the browser's real input layer, which now lives in `src/ui/input-map.ts` and is shared with `src/main.ts`. Each persona has:

- a seeded reaction/perception delay of 200–300 ms;
- Gaussian aim error of 6–10% of the viewport;
- key dwell, finger speed (≤ 1500 px/s) and finger-acceleration limits;
- hesitation.

The browser **leash** is applied to their input exactly as it is to a player's. Adaptive bypasses the leash because it calls `step()` directly, so it remains a ceiling and is not a human proxy.

## Headline evidence (Shoot, stage 0)

| persona | Backlot clear | where/how they die |
|---|---|---|
| adaptive (ceiling, no leash) | 99.5% (complete) | MINIATURE CITY film 1 |
| human-keys | **0%** | BACKLOT film 200/200 (strip: film 200/200) |
| human-touch | **0%** | BACKLOT film 200/200 (strip: film 200/200) |
| human-keys, leash off (what-if, 60 seeds) | 38% | BACKLOT offscreen 35, MINIATURE CITY offscreen 18 |
| human-touch, leash off (what-if, 60 seeds) | 0% | BACKLOT offscreen 59 |

In a trace (seed 1, human-keys) the Talent reaches the first **defang** gate at t≈24 s with an Urchin 1.4 u from her. The camera then sits at `talent − 8.6 u` at zoom 38 for the next 37 s, until the film runs out. The 8.6 u offset is 0.23 · zoom, which is the leash equilibrium. Full tables are in `reports/balance/stage-0-*.json`.

## Verbs

### Pan
- **Intent:** move the frame anywhere, including putting a frame edge between her and a hazard.
- **What happens:**
  - Sim pan is velocity-controlled: max 0.3 frame-widths/s, ramp 0.9 · zoom/s² (`src/sim/step.ts:138-146`, `tuning.ts:16-17`). There is no clamp or world bound in the sim.
  - The browser then runs every human input through `leashInput` (`src/ui/input-map.ts`, formerly `src/main.ts:944`). Once she is past 0.34 of the half-frame from centre, the leash blends pan toward her, up to **90%** at 0.56 of the half-frame.
  - Against held keys (90) the pull wins at about 0.46 of the half-frame (0.23 · zoom from centre).
- **Failing case, "can't pan away from a close urchin to cut it":**
  - A defang cut must frame the hazard out while she stays in, with the hazard ≤ `closeCallRadius` 1.5 u from her (`step.ts:105-111`, `framing.ts:112-117`).
  - That needs her within about 1.5 u of the frame edge, which is ≈ 0.46 · zoom off-centre at zoom 38. The leash stops the camera at 0.23 · zoom, so the cut is **geometrically unreachable**.
  - The defang gate meanwhile holds her in place (`shotBlocksTalent`) and burns film until the take ends. This is the source of 100% of human deaths.
- **Touch:**
  - `pointerDragPan` maps the *per-event pixel delta* to pan velocity (`input-map.ts`, formerly `main.ts:1120`). At 60 Hz, a finger at 1500 px/s on a 360 px gate gives |pan| ≈ 9/127, about **7% of max pan speed**. A 1:1 "grab the set" drag would need about 1 frame-width/s.
  - The last delta also sticks while the finger rests, so the camera keeps drifting until lift.
  - Touch players are effectively steered by the leash alone. With the leash off they lose her in 59/60 runs.

### Zoom
- **Intent:** snap between framings quickly; pinch for fine control.
- **What happens:** a tap snaps to the next step in `zoomSteps` [10, 16, 24, 38, 48]; holding past 0.15 s goes to full speed (`src/ui/zoom-control.ts`). Widest → tightest dropped from **7.07 s → 0.48 s** (commit 6201a99).
- **Failing case:** none left in the bot runs. Pinch is the only zoom on touch and suspends pan while two fingers are down (`main.ts` pointerdown).

### Rotate (Q/E, ↺ ↻)
- **Intent:** swing the frame 45° to get a better edge.
- **What happens:** the input is a one-tick pulse, yaw eases over `rotationSeconds` (`step.ts:149-159`), and the leash still applies.
- **Failing case:** rotation doesn't help a defang cut, because the leash bounds radial distance in any yaw. The personas don't rotate, and Adaptive doesn't need to.

### Hold (Space, HOLD)
- **Intent:** stop her before a hazard.
- **What happens:** she stops and film burns at **2×** (`step.ts:189-195, 338`).
- **Failing case:** at a defang gate she is already held, so HOLD only makes the film run out sooner. The touch persona held for 15.6 s in one trace.

### Cut close
- **Intent:** frame a hazard out right next to her for the close-call bonus or the defang gate.
- **What happens:**
  - There is no cut button. Anything spawned that leaves the frame is cut (`step.ts:271-276`).
  - A cut counts as "close" only within 1.5 u of her (`step.ts:105-111`).
  - Spawning is blocked within `popInExclusion` 2 u (`step.ts:232-240`).
- **Failing case:** blocked by the leash (see Pan). This is the #1 root cause.

### Cut wide/far
- **Intent:** remove a far hazard by framing it out.
- **What happens:**
  - The framed-out hazard *is* cut, at any distance, and the CUT overlay shows.
  - It gives no close-call credit (> 1.5 u), and **it does not satisfy a defang gate** (`framing.ts:112-117`).
  - A **gate stand-in whose gate is not yet open unloads intact** instead of being cut, then reappears when re-framed (`unloadsIntact`, `step.ts:43-46, 273`).
  - Far **Glass** (> `glassShatterRadius` 6 u) also unloads intact (`step.ts:44`).
  - An entity that was never on screen never spawns, so there is nothing to cut (`step.ts:236`).
- **Failing case:** a player cuts the gate's Urchin early and far away. It vanishes without the CUT stamp, comes back when re-framed, and the gate later demands a close cut, which the leash forbids. LOD tier does not gate cutting; it only gates lethality (urchin tier ≤ 1, boulder tier 0).

### Tutorial
- The take is paused until **ROLL CAMERA** (`main.ts` `advanceTick`: `!tutorial.showing`), and the strip is docked (commit 44b1502). The bots don't see the tutorial; the problem is fixed.

## Root causes (ranked)
1. **The leash forbids the defang verb.** `leashInput` caps her offset at about 0.23 · zoom, but a close cut needs about 0.46 · zoom. Every human death is a film-out at the first defang gate.
2. **Touch pan is velocity-from-delta, not position.** It runs at 7% speed, sticks after the finger stops, and leaves touch players unable to track without the leash.
3. **Gate stand-ins and far cuts are silent.** They unload intact or cut without gate credit, with no HUD explanation ("cut doesn't work").
4. **The leash also hides weak tracking.** With it off, human-keys loses her (offscreen) in Backlot and Miniature City. The design needs a softer aid, not none.

## Fix list (ranked, expected effect on human Backlot clear)
1. **Release the leash while a gate is open or a hazard is within `closeCallRadius` + 1 of her.** Alternatively, start the leash only at ≥ 0.85 of the half-frame (`LEASH_START`) with ≤ 50% blend. Render-only (`input-map.ts`), so replay hashes are unchanged. Expected: keys 0% → ~40% (what-if measured 38% with the leash fully off), and better with fix 3.
2. **Make touch pan positional:** the world follows the finger 1:1, camera Δ = −Δpx / width · zoom, implemented as a pan velocity over the tick, with zero pan when the finger rests and a short fling on lift. Expected: touch reaches parity with keys (0% → ~35–45%).
3. **Keep a soft lost-her assist instead of the leash:** blend at most 30% toward her only once she is *outside* the frame (the LOST HER grace window). Expected: recovers the offscreen deaths that fix 1 exposes, to ~60–70%.
4. **Explain non-cuts:** show a "NOT YET — SHOT NOT CALLED" stamp when a gate stand-in unloads intact, and "TOO FAR — NO CLOSE CALL" on far gate cuts. Expected: little change in bot clear rate, large change in player comprehension of the "far cut" reports.
5. **Gate film burn:** stop the 2× HOLD burn while the gate itself is holding her. This is a sim rule change and needs its own PR plus a hash bump. Expected: +5–10 pp as a safety margin.

Fixes 1–3 together should land the human personas inside the 60–80% Backlot target. Re-run `npm run balance -- --stage=0 --mode=both --seeds=200 --jitter=8 --workers=8` after each.

## Results after fixes

Implemented fixes 1–4. Fix 5, the gate film burn, is not done. Two tuning tries were used.

- **Leash → soft lost-her assist** (`assistInput`, `src/ui/input-map.ts`):
  - It is inert while she is in frame. Out of frame, it ramps over the LOST HER grace to at most a 30% blend toward her.
  - It is suspended while the player pans near an open defang gate or a hazard within `closeCallRadius` + 1. The defang cut is reachable again.
- **Touch drag is 1:1:**
  - `dragCameraTarget` turns finger px into world displacement at the current zoom, yaw and aspect.
  - `panToward` chases that target with braking and stops on it, so there is no residual drift. A lifted drag settles where the finger left it.
  - Device parity: a drag never pans faster than held keys (try 2).
- **Far cuts (sim):**
  - A gate stand-in framed out early and far is now cut (CUT/TOO FAR stamp, logged, no credit) instead of unloading intact.
  - It is re-dressed on its mark when the shot is called, because the defang still needs a close cut.
  - The HUD explains "TOO FAR" and "stand-in back on its mark".
  - Hashes were bumped: seed 1 `e0c89e0d`, seed 19 `a80d24ad`, seed 2026 unchanged `9951f3d0`. See `DECISIONS.md`.
- **Copy:** the defang toast and coach line 3 now state the close/far rule.

### Tuning tries (`--stage=0 --mode=both --seeds=200 --jitter=8`)

| try | change | human-keys Backlot | human-touch Backlot |
|---|---|---|---|
| 1 | fixes 1–3 | 69.5% | 91.5% (too high: a drag panned at full 127 vs keys' 90) |
| 2 | drag capped at `KEY_PAN` (device parity) | **69.5%** | **65.5%** |

### Final table, try 2 (Shoot, stage 0)

| bot | completion | deaths by killer |
|---|---|---|
| adaptive (ceiling, no assist) | 99.5% | film 1 (MINIATURE CITY) |
| tracker / gatekeeper / metronome / wide / close / chaos | 0% each | unchanged from before |
| human-keys | 23.5% | offscreen 139, film 11, red-monitor 3 |
| human-touch | 23% | offscreen 143, film 10, red-monitor 1 |

Human deaths by scene:
- human-keys: BACKLOT offscreen 57, film 4. MINIATURE CITY offscreen 53, film 4. NIGHT SHOOT offscreen 29, film 3, red-monitor 3.
- human-touch: BACKLOT offscreen 68, film 1. MINIATURE CITY offscreen 52, film 6. NIGHT SHOOT offscreen 23, film 3, red-monitor 1.

Other results:
- Strip: Adaptive 100%, passive and scripted bots 0%, human-keys 59%, human-touch 62%.
- Luck checks: jitter(gatekeeper) 0% of variants, jitter(adaptive) 99.7%.

Deaths at the defang gate (film-out) are gone. What is left is mostly **offscreen**, so humans now lose her rather than stall. Remaining gate failures predate this change:
- "one scene's share of adaptive deaths" (the only Adaptive death is in MINIATURE CITY);
- passive FailReasons variety;
- Backlot roster kinds (2).

Next lever if the full-Shoot human clear needs to rise: Miniature City tracking, or fix 5.
