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

## 2026-10-13 round 2

### Instrumentation

`/tmp`-only harness (not committed). It drives `createHumanDriver` through `stepShoot` and keeps a 6 s ring buffer per tick. The buffer holds her position and velocity, camera offset/zoom/velocity, the composed input (after the assist), HOLD, `assistSuspended`, the open gate, the nearest hazard and her LOD tier. At each `lost-talent` death it looks back to the tick she left frame and records:
- her speed in the second before and at the exit;
- the path turn across ±0.5 s;
- the zoom;
- the nearest hazard within 4 u;
- whether a defang gate was open in the previous 2 s;
- whether the input was panning away from her or idle;
- whether the assist was suspended;
- the exit side.

The death counts reproduce the balance harness exactly: keys 47 / touch 46 full-Shoot clears out of 200.

### Findings (200 seeds per persona, before)

| | human-keys | human-touch |
|---|---|---|
| Backlot + City offscreen deaths | 110 | 120 |
| …she was **standing still** in the second before leaving frame | 110 (100%) | 120 (100%) |
| …a hazard within 4 u at the exit | 1 (extras) | 0 |
| …path turn ≥ 45° within ±0.5 s | 10 | 9 |
| …zoom at exit | 38 (all) | 38 (all) |
| …exit side | right (all) | right (all) |
| …input panning *away* from her for > 50% of the prior second | 79 | 118 |
| …assist suspended | 0 | 0 |

**One cause accounts for all of them: the defang release.** A defang cut needs her near a frame edge, about 0.46 · zoom off-centre, with the Urchin panned out past the other side. On the tick the close cut lands, `markShots` sets `done` and she goes from 0 to full walk speed (2.5 u/s at zoom 38), with no warning. At that moment:
- she is within about 1 u of the right edge;
- the camera is still moving left, because the player was panning the Urchin out;
- the player's 200–300 ms reaction delay has not elapsed.

She exits right within about 0.3 s. Then the personas do what players do once the danger is gone: they tap back to a tighter framing (38 → 24), which pushes her farther out. They also chase her last-seen spot. The 30% assist cannot win that back inside the 3 s LOST HER window. Trace: seed 1 human-keys, City, tick 6347–6581.

Ruled out:
- **Sharp turns:** under 10% of these deaths had a ≥ 45° turn nearby. She was walking straight off the edge.
- **Hazard-driven speed changes:** no hazard was near.
- **Assist fighting a pan:** it was never suspended, and it pulls toward her.
- **City occlusion:** the bots read the sim, not pixels, so blocks cannot hide her from them. For human players, blocks taller than her can still cover her, so the render fix below is for players, not for the bots' numbers.

### Fixes (fair: nothing is easier to *do*, the sudden start is telegraphed)

1. **ACTION beat** (sim, `gateReleaseSeconds` 0.6 s, `markShots` / `releasing`):
   - After the defang cut she holds her mark for 0.6 s before walking on.
   - The HUD shows the status **ACTION** and the toast "ACTION! She walks on in a moment. Bring the frame back to her."
   - The bots perceive this only as a human would: the gate text drops (`openGate` is null), so they stop framing the cut and re-centre on her.
2. **Fix 5, gate film burn** (sim): HOLD and waiting still burn 2×, except while a defang gate, or its ACTION beat, is holding her. Normal 1× burn applies.
3. **X-ray cutaway** (render-only, `xraySprite` in `main.ts`):
   - A warm, 55%-opacity flat silhouette of her current sprite is drawn with `depthTest: false` under her body.
   - In the open her body covers it exactly. Behind a City block, the silhouette is what you see.
4. **Copy:** the defang toast says film runs at normal speed while she waits, and coach line 3 mentions ACTION.

The lost-her assist and `src/bots/human.ts` are unchanged.

### Tuning tries (`--stage=0 --mode=both --seeds=200 --jitter=8 --workers=8`)

| try | beat | keys Shoot | touch Shoot | keys Backlot | touch Backlot |
|---|---|---|---|---|---|
| before | 0 s | 23.5% | 23% | 69.5% | 65.5% |
| 1 (kept) | 0.6 s | **51.5%** | **52.5%** | 83% | 85% |
| 2 | 0.5 s | 45% | 50% | 79% | 84% |

Try 2 was shoot-only. Try 1 is kept: both personas land in the full-Shoot band (50–65%), and Backlot overshoots 60–80% by 3–5 pp. A shorter beat cannot satisfy both targets: try 2 dropped keys' Shoot below 50% while touch Backlot stayed at 84%.

### After (try 1): human deaths by scene × killer

| | human-keys before → after | human-touch before → after |
|---|---|---|
| BACKLOT | offscreen 57, film 4 → offscreen 32, film 2 | offscreen 68, film 1 → offscreen 30 |
| MINIATURE CITY | offscreen 53, film 4 → offscreen 29, film 4 | offscreen 52, film 6 → offscreen 22, film 9 |
| NIGHT SHOOT | offscreen 29, film 3, red-monitor 3 → offscreen 22, film 3, red-monitor 5 | offscreen 23, film 3, red-monitor 1 → offscreen 14, film 14, red-monitor 6 |

The remaining Backlot and City offscreen deaths (keys 61, touch 52) are still all after a defang release, with the camera panning away. Players who were mid-pan when the cut landed still lose her. The next fair lever is a visible "she exits this side" footprint or arrow at the edge during the beat, not a longer beat.

### Round 2 addendum: exit telegraph and per-scene beat

1. **Exit telegraph** (render, `createExitArrow` in `talent-fx.ts`, `exitHeading` in `framing.ts`):
   - During the ACTION beat, three inked brass chevrons lie on the floor at her feet, pointing along the path she will walk (the next path node, or the fork branch already taken).
   - The arrow pulses.
   - Bots see it only as a human would. `PlayerView.action` is the arrow's direction while the beat runs *and* she is on screen; otherwise it is null.
   - The human personas lead the frame 0.2 · zoom along the arrow on ACTION (`actionLead`). Their limits (reaction, aim, cadence, dwell, finger) are unchanged. Adaptive and the scripted bots ignore the arrow.
2. **Per-scene beat** (`TUNING.gateReleaseSecondsByScene`, indexed like `zoomRangesByScene`; the strip plays as scene 0). Backlot is tightest; City, Night and the Long Take keep ≥ 0.6 s.

Tries (`--stage=0 --mode=shoot --seeds=200 --jitter=8`; 3 allowed):

| try | Backlot / City / Night beat | keys Shoot | touch Shoot | keys Backlot | touch Backlot |
|---|---|---|---|---|---|
| round 2 try 1 (no arrow) | 0.6 / 0.6 / 0.6 s | 51.5% | 52.5% | 83% | 85% |
| A | 0.45 / 0.6 / 0.6 s | 48% | 58.5% | 76% | 82.5% |
| B | 0.4 / 0.75 / 0.75 s | 48.5% | 55% | 75% | 81.5% |
| **C (kept)** | **0.35 / 0.9 / 0.9 s** | **54.5%** | **59%** | **74%** | **81%** |

Try C is kept, and the full `--mode=both` run reproduces it exactly. Both personas are in the full-Shoot band (50–65%). Keys' Backlot (74%) is in the 60–80% band. **Touch's Backlot is 81%, 1 pp over.** Touch's Backlot barely responds to the beat (0.6 → 0.35 s moved it 85 → 81%). The touch deaths that remain are a drag still running when the cut lands, which the reaction delay cannot catch. Strip: keys 73%, touch 78%. Adaptive Shoot 99.5%; tracker, gatekeeper, metronome, wide, close and chaos 0%.

Human deaths by scene × killer (try C):

| | human-keys | human-touch |
|---|---|---|
| BACKLOT | offscreen 50, film 2 | offscreen 38 |
| MINIATURE CITY | offscreen 15, film 4 | film 10, offscreen 9 |
| NIGHT SHOOT | offscreen 10, red-monitor 6, film 4 | film 12, red-monitor 7, offscreen 6 |
