# CULL: design draft v0.1

> **Nothing exists unless it's on screen. You hold the camera.**

Draft for Aieat Assam, 12 Oct 2026. Campaign milestones live in `docs/design/game-design.md`, which supersedes this draft where they conflict. This file stays the reference for the core rules (§2), LOD (§4) and tech (§13).
**Every number marked ⚙ is an initial tuning guess**, and all of them are collected in the tuning table in §17 so an agent can change them in one place (`src/sim/tuning.ts`).

---

## 1. Pitch

You're the camera operator on a film shoot that's falling apart. The **Talent**, a tiny figure in a red coat, walks forward on their own and will not stop. You don't control them. You control the **frame**. The world follows one law: **whatever isn't in the shot keeps coming, until you CUT it out of existence.** Pan a boulder out of shot and CUT, and it's gone. Pan the bridge the Talent is about to cross out of shot and CUT, and that's gone too. Zoom out and more of the world exists, threats included, but everything gets **simpler**, because in CULL the level-of-detail trick games use to save GPU time is literally physics: a spiked urchin seen from far away *is* a harmless cube.

Three-to-seven-minute runs. Mouse, keyboard or one thumb. Every run leaves you a 9-frame contact sheet of your best shots.

### The rule-bending premise
Game engines quietly cheat: they skip anything off-screen (frustum culling), swap distant objects for cheaper models (LOD), and load the world as you approach (streaming). CULL makes all three **visible and lawful**:
- **Culling is a CUT.** Leaving the frame deletes nothing. Off-frame things keep moving and stay lethal, and the shutter deletes them only when you press CUT.
- **LOD is physics.** How big something is on screen decides how detailed, and how dangerous or useful, it is.
- **Streaming is spawning.** Entering the frame creates things, sometimes already moving (pop-in).

The research says one tangible rule twist that changes every second of play is what lifts a game out of the clone pile (M11: Superhot, Baba Is You). This is that rule, and it's also inherently cheap to render, since the game only ever draws what's visible.

---

## 2. Core rules (precise)

### 2.1 The frame (the "gate")
- The playable frame is a **fixed-aspect viewfinder gate, 1:1 square** ⚙. It's drawn inside the browser viewport, and the rest of the screen is the "off-set" margin used for HUD and previews.
  - *Why fixed and square:* every device sees exactly the same amount of world, which keeps the daily seed fair and replays deterministic. A square fits both portrait phones (gate on top, thumb pad below) and landscape desktops (HUD at the sides), and it shares well.
- **Camera:** orthographic, tilted 55° ⚙ pitch (a diorama / miniature-set look), with yaw in **45° snaps**. In world space, the gate is the camera's view volume, an oriented box.
- **Zoom** sets the gate's world width, `W ∈ [10, 48]` world units ⚙ (shown as a focal length: 85 mm at the closest, 24 mm at the widest).

### 2.2 What "in frame" means
- An entity is **in frame** if its **projected screen-space AABB overlaps the gate rectangle by any amount** (partial counts). The projection is the same orthographic matrix the renderer uses, implemented as a pure function in the sim. A test asserts the sim and renderer matrices are equal.
  - *Why projected AABB rather than the ground footprint:* what you see is what exists. A tall tower whose top pokes into the shot exists.
- **Occlusion does not count.** Something hidden behind a wall but inside the gate still exists. *Why:* readability, determinism and cost. The rule must be judged from the frame edges alone. (Open question Q3 considers one late-game "occluder" set piece.)
- **Fully outside** means no overlap at all. Only a CUT reaches entities that are fully outside (§2.7).
- **Edge-clipped** (partially inside) is a visible state, drawn with a hatch on the cut side. Most entities treat it as fully present; a few use it (see the Slab and Bridge in §5).

### 2.3 Entity classes: what persists off-screen
| Class | When it leaves the frame | When it re-enters | Examples |
|---|---|---|---|
| **SET** (static terrain) | unloaded | **reloaded identically from the seed** (it's the location) | ground tiles, walls, ramps |
| **CAST** (dynamic) | **stays live**: it keeps moving and is lethal on contact, until a CUT made while it is fully outside the gate deletes it for this run (a "CUT" stamp on the call sheet) | never returns once cut | enemies, hazards, fragile floors |
| **LEDGER** (rare, marked red) | keeps a tiny abstract record (e.g. "time unseen") with **no simulation of position** | re-spawns with its state advanced by its ledger rule | the Rumour |
| **RECURRING** | unloaded | re-rolled to the next entry in its seeded sequence | the Continuity Prop |
| **TALENT** (the hero) | 0.5 s ⚙ free grace, then "LOST HER": film burns +4 s/s ⚙ and a countdown runs; at 3.0 s ⚙ out of frame the run fails ("Lost the Talent") | n/a | the hero |

- **Spawning:** every CAST, LEDGER and RECURRING entity has a seeded *spawn point* from the generator (§7). It loads the first tick its projected AABB overlaps the gate, in its seed state (position, velocity, facing). A spawn point is consumed once loaded, unless it's RECURRING. Cast that has never been framed never spawns, so a CUT can only reach cast the shot has shown.
- **Pop-in safety:** no hazard spawns with its AABB within 2.0 u ⚙ of the Talent. A spawn that would breach this waits until the frame moves.
- **Call sheet (preview margin):** anything with an unconsumed spawn point within 0.25 W ⚙ outside the gate is drawn in the margin as a **bounding box only**. Hazards are red, with an arrow if they spawn moving; pickups are cyan. They **do not exist** and aren't simulated. This is the fairness valve: pop-in is a choice you make, not an ambush.

### 2.4 How the Talent moves (minimal control)
- The Talent walks along the location's **path graph** (generated walkable tiles) at a speed set by their own LOD tier (§4).
- **At forks** the Talent takes the branch whose heading best matches the direction from the Talent to the **gate centre**: *"the Talent walks toward what you're looking at."* Your only steering is framing.
- **Void ahead:** if the next tile isn't loaded (off-frame) or doesn't exist, the Talent stops and waits ("Holding for set…"), which burns film (§2.6).
- **HOLD** (H, or the HOLD button) stops the Talent while held. It burns film at 2× ⚙. It's the only direct hero control. The shutter (CUT, §2.7) acts on the world, not on her.
- The Talent never turns back on their own and doesn't fight. Collisions with SET push them along the path; collisions with CAST resolve by that entity's tier stats.

### 2.5 Failure states (the run ends)
1. **Lost the Talent:** the Talent has been fully outside the gate (and outside every friendly monitor cone) for 3.0 s ⚙. The rule is graded: the first 0.5 s ⚙ out of frame are free; after that she is **lost**, film drains an extra 4 s per second ⚙ on top of the normal burn, the gate edge flashes, a "LOST HER" banner counts down to the cut and an edge arrow points to her. Reframing her resets the count.
2. **Hit:** a lethal-tier CAST entity touches the Talent.
3. **Fell:** no floor under the Talent's centre (a fragile floor was cut by a CUT, or a bridge dropped its planks at low LOD).
4. **Out of film:** the film counter reaches 0.
5. **Wrapped:** the strike line (§5, Wrap) reaches the Talent.

No lives and no mid-run continues. Runs are short, so failing ends the run with a summary (a natural stopping point, M12 guardrail). Completed scenes bank their score.

### 2.6 Film (the run clock)
Start with 90 s ⚙. Film burns 1 s per second (2× while holding or waiting). Reel pickups +15 s ⚙; finishing a scene +30 s ⚙. That gives runs of roughly **3–8 minutes** depending on skill. CUT adds to or takes from film: a close cut refunds 2 s ⚙, a missed CUT costs 2 s ⚙, and a penalised CUT costs 4 s ⚙.

### 2.7 The shutter (CUT)
- **Input:** Space or Enter, or the CUT button (touch, ≥ 72 px, bottom-right, with a charge ring). Nothing else cuts.
- **Effect:** one CUT slices **every live cuttable hazard that is fully outside the gate**, in one hit. Cuttable: Urchin, Boulder, Glass, Bridge, Extras (each member outside), Swarm, Stagehand and Red Monitor. Reels and Friendly Monitors are not cuttable. A framed or partly framed hazard is never cut.
- **Recharge:** the shutter starts empty after each CUT and refills over `shutterRechargeSeconds` 1.8 s ⚙. A press while it recharges does nothing (the not-ready click and shake are the only feedback).
- **Scoring:** distance is measured from her. **Close** (≤ 1.5 u ⚙) scores 250 and refunds 2 s ⚙ of film. **Normal** (≤ 8 u ⚙) scores 50. **Too far** scores 0. Each score is multiplied by the combo multiplier 1 + 0.5 × (combo − 1) ⚙. The combo counts consecutive productive cuts and carries across scenes.
- **Costs:** a **missed** CUT (nothing cut) costs 2 s ⚙ and breaks the combo. A **penalised** CUT (she is not framed at the cut) costs 4 s ⚙ and breaks the combo. A too-far-only cut neither scores nor breaks the combo.
- **Off-frame pressure:** a spawned Urchin that is fully outside the gate turns back on her and rolls at 3× its speed ⚙. Framing it out no longer stops it. Backlot and City send Urchin waves (4 and 2 followers per path-bound Urchin, 7 u apart), so one charge can't cover a wave.
- **Defang marks:** a mark is cleared only by a close CUT made while its stand-in Urchin is fully outside the gate. A farther CUT leaves the stand-in on its mark. Defang marks stand at least 6 u ⚙ from Glass on the walked side, so a close cut at the mark can't shatter that Glass.
- **Threat indicators:** live hazards that are fully outside the gate and would reach her within 6 s ⚙ (or are within 1.5 u of her) are drawn as edge arrows on the viewfinder. Arrows are coloured and sized by time to contact, and pulse under 1 s. The same list is all the bots see of off-frame cast.
- **Result:** every CUT shows a per-cut result stamp, and a missed CUT or a penalised CUT shows a MISSED or SHE'S OUT OF SHOT banner. The combo shows as a TAKE ×N score readout.

---

## 3. Camera controls

| Action | Mouse / keyboard | Touch (first-class, portrait) | Why it exists |
|---|---|---|---|
| **Pan** | WASD / arrows; or left-drag anywhere (1:1 grab) | drag on the **thumb pad** below the gate (relative trackpad, so your finger never covers the shot); or direct drag on the gate | the core verb: chooses what exists |
| **Zoom** | mouse wheel / Z and X / `-` and `=` | pinch on the pad or gate; or the slider on the pad edge | the risk/reward lever: more world vs more detail |
| **Rotate (45° snaps)** | Q / E | two-finger twist past 25° ⚙ snaps one step | lets the square gate cut diagonally, excluding a corner threat. Snaps keep it readable, testable and low-nausea. Unlocks in Scene 2 of the first run, so new players learn pan and zoom first. |
| **Steady** | hold Shift | drag with two fingers on the pad | precise slow pan (0.35× ⚙) for threading the frame edge |
| **CUT (shutter)** | Space or Enter | CUT button bottom-right, ≥ 72 px, with a charge ring | slices every live hazard fully outside the frame; recharges over 1.8 s (§2.7) |
| **Hold Talent** | H | large HOLD button bottom-right of the pad (left-hand option in settings) | emergency brake, at a film cost |
| **Pause** | Esc / P | tap the timecode; auto-pause on `visibilitychange` | |

**Camera physics (sim-side, deterministic).** The input is a *desired* pan velocity. The camera has max speed 1.2 gate-widths/s ⚙ and acceleration 6 gate-widths/s² ⚙, with critically damped smoothing. Zoom is rate-limited by a response curve: ×1.6 per second ⚙ for light inputs, rising to about ×90 per second ⚙ at full input. A tap snaps to the next framing step (10 / 16 / 24 / 38 / 48 ⚙), and a hold zooms at full speed. Both are input-side easing over the same channel the bots use, and rotation tweens 0.18 s ⚙ per 45°.
- *Why limits:* without them a flick could cull everything instantly. Limits make framing a skill (M4, Swink's game feel).
- *Motion state:* when camera speed exceeds 0.6 gate/s ⚙ the frame is **"in motion"**. It gets a light directional blur, and the Stagehand moves (§5).
- **No free-look and no camera shake from gameplay.** The only jolt is a short camera kick and hit-stop on a CUT, both disabled under reduced motion.

---

## 4. LOD as a mechanic

**Screen size** = an entity's world radius × (gate logical size 1000 / W), in logical pixels (lpx). That makes it identical on every device. Tiers have 15% ⚙ hysteresis so things don't flicker between tiers.

| Tier | Name | Screen size ⚙ | Geometry | General rule |
|---|---|---|---|---|
| LOD0 | **Close-up** | ≥ 48 lpx | full mesh (~150–300 tris) | full behaviour, full danger, full detail |
| LOD1 | **Medium** | 24–48 lpx | ~60 tris | slightly simplified behaviour |
| LOD2 | **Wide** | 10–24 lpx | ~20 tris | simplified collision (convex hull or box); fine features (spikes, planks, gaps) are gone |
| LOD3 | **Proxy** | 4–10 lpx | a 12-triangle box or billboard | an inert bounding box; behaviour mostly off |
| (culled by size) | **Sub-pixel** | < 4 lpx | none | **doesn't exist** (small-object culling): only tiny things reach this |

**The Talent has LOD too.** This is the core tension:

| Talent tier | Walk speed ⚙ | Collision radius ⚙ | Can collect Reels | Notes |
|---|---|---|---|---|
| Close-up | 2.0 u/s | 0.30 | yes | fits through 0.8 u gaps |
| Medium | 2.5 u/s | 0.40 | yes | |
| Wide | 3.2 u/s | 0.60 | **no** | too wide for 1 u gaps |
| Proxy ("stand-in") | 3.6 u/s | 0.75 box | **no** | can't climb ladders; a stand-in wearing a sandwich board |

**Zoom as risk and reward:**
- **Wide** gives you more world, so more threats *and* more Reels exist. Enemies are defanged (lower tiers), the Talent moves faster but can't collect, can't fit gaps, and sub-pixel swarms vanish. Crowds merge into impassable walls.
- **Close** gives you precision, and you can collect. Everything is at full danger, there's less warning (pop-in near the edges), and the camera covers less world per second, so a fast hazard can outrun your reframing.

The good player constantly "breathes" the zoom: wide to defang and scout, close to collect and thread.

---

## 5. Roster (12 entities)

Each entry gives its class, its per-tier stats, and **how framing exploits it or it exploits framing**.

1. **Talent** (hero, TALENT). See §2.4 and the table above. Exploits you: walks toward the frame centre, so a careless pan steers them into danger.

2. **Set tiles** (SET). Floor, walls, ramps. They reload from the seed every time, so they're always trustworthy. *Lesson:* "The location is permanent; the people and props are not."

3. **Glass floor** (CAST, fragile). A walkable tile that stays solid until a CUT made while it is fully outside the frame **cuts** it. A CUT that shatters a pane she is about to walk onto drops her, so the crossing has to be framed, not just cut. Edge-clipped glass cracks visibly (a warning). *All tiers:* walkable.

4. **Rope bridge** (CAST, fragile, LOD-sensitive). Close-up/Medium: planks, walkable. **Wide/Proxy: the planks are detail, so they're gone**, leaving two ropes and a fall. It's 14 u long ⚙, longer than the closest gate, so you need *exactly* a medium zoom with the whole bridge in frame. That's a framing puzzle under time pressure.

5. **Urchin** (CAST). Close-up: spiked and lethal, rolls toward the Talent at 1.5 u/s ⚙. Medium: lethal, slower. **Wide: an octahedron that only pushes. Proxy: an inert cube you can push or use as a step.** *Exploit:* zoom out to defang it. *Catch:* zooming out also drops the Talent below Reel-collecting tier. Framing an Urchin out no longer stops it: fully off-frame it turns back on her at 3× speed, and Backlot and City send waves of them, so the CUT is the answer (§2.7).

6. **Boulder** (CAST, **pop-in hazard**). It spawns *already rolling* at 4 u/s ⚙ along its seeded vector, from the edge it enters. The call sheet shows a red box with an arrow. *Exploit:* see the box and pan away to cull its spawn chance, or pan so it enters behind the Talent. *Close call:* a CUT with it fully outside the frame within 1.5 u ⚙ of the Talent is a close cut, scoring the top bonus (a near-miss that comes purely from skill, M7).

7. **Extras** (CAST, crowd of 4–12). Close-up/Medium: individuals milling at 0.8 u/s ⚙, with walkable gaps between them. **Wide/Proxy: the crowd merges into one impostor billboard, a solid wall.** The opposite of the Urchin: they force you to zoom *in*. A CUT removes each member that is fully outside the frame, so you thin a crowd by cutting it, not by framing it.

8. **Swarm** (CAST, tiny). Midge-sized (radius 0.08 u ⚙) and lethal on contact at any visible tier. **Below 4 lpx they're sub-pixel and don't exist**, which at radius 0.08 happens around W ≥ 20 ⚙. *Exploit:* zoom out and they're gone, but only while you stay out. Zoom back in and the ones still within their seeded cloud re-spawn. (The Swarm is the one CAST exception: it's a *size-culled* group, not a frame-culled one. That's documented and tested.)

9. **Stagehand** (CAST). A black-clad figure that **moves only while the camera is "in motion"** (fast pan = motion blur = "nobody's looking"). Each motion tick it walks 3 u/s ⚙ toward the nearest Reel to steal it, or toward the Talent's path to drop a crate. When the camera is steady, it freezes mid-step. *Exploit:* steady camera work. *Tension:* other hazards demand fast pans. Weeping Angels inverted: it's your *speed*, not your gaze, that frees it.

10. **Rumour** (LEDGER). A grey smog blob. **While off-screen its ledger grows it +0.3 u radius/s ⚙; while on-screen it shrinks −0.5 u/s ⚙**, lethal on contact at Close-up or Medium. Its margin box shows a size counter. *Exploit/tension:* you must "keep an eye on it", which means a wider frame, which costs collecting. Ignore it for a minute and it comes back enormous.

11. **Monitor** (SET prop, ally). A CCTV camera on a pole whose **view cone also counts as "frame"**: anything inside the cone exists even when it's off your screen. Point it at a glass floor and you're free to scout. Hostile variant (Night Shoot): a **Red Monitor** whose cone *deletes* CAST, Talent included.

12. **Continuity Prop** (RECURRING). Each time it re-enters the frame it's the **next prop in its seeded sequence**, for example ramp → spikes → crate → plank → ramp. You re-roll it deliberately by panning off and back on. It's a puzzle tool and costs film. It never involves money and its sequence is shown on hover (a transparent, free variable, per the research guardrails).

13. **Reel canister** (CAST, pickup). +15 s film ⚙. Collectable only at Talent tier Close-up or Medium. Reels are not cuttable, so a framed-out reel stays where it is and collecting it is still a commitment.

14. **The Wrap** (scene-end chaser). In each scene's final 25% ⚙ a **strike line** advances along the path behind the Talent, *deleting the world* (SET included) at 1.8 u/s ⚙, rising to 2.6 by Scene 3. You must keep the Talent moving and keep the floor ahead in frame. It's the climax of every scene.

*(The Slab, a sliding block that can only be pushed while edge-clipped, and the Occluder are parked for post-launch.)*

**The tension web:** Urchin and Swarm push you **wide**. Extras, Reels and the Bridge pull you **close**. The Stagehand punishes **fast** framing; the Boulder and Wrap demand it. The Rumour demands **width over time**, and the Monitor buys you **freedom**. No single zoom or speed is dominant, and M5's bot test (§12) checks that.

---

## 6. Run structure (a "Shoot")

- **A Shoot = 3 scenes + finale**, about 3–8 min ⚙ in total. Each scene is a procedural strip about 120–220 m ⚙ long.
- **Locations (biomes),** one per scene in order, picked by seed:
  - **Backlot:** clay and plywood sets, introduces Glass, Urchin, Extras and Reels.
  - **Miniature City:** tilt-shift diorama, adds the Boulder, Bridge, Stagehand and Monitor.
  - **Night Shoot:** a single work-light pool, adds the Swarm, Rumour, Red Monitor and Continuity Prop.
- **Finale:** a 40 s ⚙ "Long Take". The Wrap starts immediately and every surviving hazard from the run reappears as a call-sheet box. It ends on the "That's a wrap!" screen.
- **Difficulty ramp (⚙):** threat budget per chunk is 1.0 → 1.6 → 2.3 → finale 2.8; the zoom range narrows each scene (W max 48 → 40 → 32); Wrap speed 1.8 → 2.2 → 2.6; and new entity types appear **one at a time**, each first in a safe "intro chunk" (M2 flow: clear goal, rising challenge).

---

## 7. Procedural generation

- **Chunks:** hand-authored JSON templates, 16×16 tiles ⚙, each containing tiles, path nodes, spawn-point *sockets* with type constraints, a threat cost and tags (`intro:urchin`, `bridge`, `fork`). We start with ~40 templates ⚙. They're data files an agent can generate and validate.
- **Stitcher:** `mulberry32(seed)` picks chunks to fit a threat budget, connects path endpoints, guarantees at least one fork per scene and at least 6 Reels per scene ⚙, and fills sockets from a weighted table.
- **Validation (in CI):** every generated scene must be completed by the reference **AdaptiveBot** (§12) in ≥ 95% of 200 seeds ⚙, and must *not* be completable by **TrackerBot** (passive centring) in more than 40% ⚙. Seeds that fail are rejected and re-rolled at generation time. Each seed's validation result is memoised in a small table, so the daily seed is always pre-validated.
- **Daily seed:** `hash("CULL" + UTC date)`, so everyone plays the same Shoot.

---

## 8. Progression and meta loop (respectful hooks)

- **Filmography** (localStorage): every Shoot is a poster card with distance, scenes completed, cause of the cut and its contact sheet. Your *personal best per location* shows on the title screen (M1 competence: you visibly beat who you were).
- **Lenses** unlock through **feats**, never currency or chance. Each changes the rules, not just the look:
  - **35 mm** (default).
  - **Anamorphic** (2.39:1 gate, "Finish a Shoot"): a wide, short world.
  - **Tilt-shift** ("Cut 10 hazards within 1.5 u"): only a horizontal focus band (40% ⚙ of the gate) counts as frame, and you can move the band.
  - **Fisheye** ("Use the Monitor 5 times"): gate edges wrap and the corners are curved, so LOD is bigger at the centre.
  - **Long lens** ("Finish Night Shoot"): fixed 85 mm, no zoom, 2× pan speed.
  - **Super 8** ("Finish a daily"): 12 fps sim-visible stutter, where frame skips are real time skips.
  
  Lenses are separate categories on the personal best list.
- **Cinematography grades** (shown after each scene with the maths, Balatro-style transparency M6):
  - *Thirds:* % of time the Talent sits within 0.1 gate of a thirds intersection.
  - *Smooth:* inverse mean camera jerk.
  - *Close calls:* hazards cut by a CUT within 1.5 u.
  - *Coverage:* % of Reels collected.
  
  These give grades of S/A/B/C. Grades unlock **cosmetic** film stocks (colour LUTs: Kodachrome, bleach bypass, Ilford B&W).
- **Daily Shoot:** one seed per day, unlimited attempts, *no streaks, no penalties for missing days*.
- **Natural stopping points:** "That's a wrap!" after every Shoot, a summary, no autoplay into the next run, no notifications, no timers (M8 is used only as "the Rumour that got you is in tomorrow's daily", never as a nag).
- **Why runs pull you back (M8, M2):** the summary always shows **the one frame where it went wrong**, plus a "would have been S" counterfactual when you were close. That's a skill near-miss, true and inspectable.

---

## 9. The share moment: the **Contact Sheet**

At "That's a wrap!" the game re-simulates the run deterministically and auto-picks **9 frames**: the opening shot, every close call, the best Thirds moment, the cut that ended it, and the final frame. They're rendered as a **3×3 film contact sheet** with sprocket holes, frame numbers, grease-pencil circles around the close calls and a red "X" on the fatal frame. The money shot is always a hazard **half-deleted at the gate edge**, its sliced face glowing film-burn orange, a metre from the Talent.

- **One tap shares:**
  1. the contact sheet PNG (1080×1350 ⚙, rendered offscreen from the replay);
  2. a text card for chat: `CULL #57 🎬 Backlot→Night · 418 m · ✂ 23 cuts · 🎯 thirds 71% · 🏁 Wrapped at 6:12`;
  3. a **replay URL** (seed + compressed input stream in the hash, about 4–12 KB ⚙). The recipient watches *your camera work* exactly, then gets "Shoot this location".
- **Optional:** a 6 s WebM "director's reel" made with `MediaRecorder` where supported (Chrome and Firefox; Safari support is patchy), with the PNG as the fallback.
- Spoiler-free in the Wordle sense (M10): it shows *how* you did and hints at the location without giving away the route.

---

## 10. First 5 minutes, beat by beat (a first-time player on a phone)

| Time | What happens | What they learn |
|---|---|---|
| 0:00 | The page loads in under 2 s straight into a viewfinder. A slate clacks: "SCENE 1 · TAKE 1". The Talent stands on a plywood path. A single line: **"Keep them in the shot."** The Talent starts walking. | The hero moves on their own; I'm the camera. |
| 0:08 | The Talent nears the right edge. The player drags the thumb pad and the frame follows. Tiles stream in at the leading edge with a soft tick. | Pan. The world appears as I look. |
| 0:20 | The player lingers, the Talent walks off-frame; after half a second "LOST HER" flashes red, the film meter burns and a bar counts down to the cut. They pan back in time. | The Talent is subject to the rule too. |
| 0:35 | A cyan Reel box appears in the margin. It loads into the frame; the Talent collects it (+15 s). | Previews in the margin tell the truth. |
| 0:50 | **Intro chunk: Urchin.** A spiked ball rolls toward the Talent, and the hint "pinch to zoom out" appears. The player zooms out, the urchin *visibly simplifies* (spikes retract with a mesh-swap shimmer and an "LOD2" ring flash), and it bumps the Talent harmlessly. | **LOD is physics.** The "wait, what?" moment. |
| 1:10 | Zoomed out, the Talent passes a Reel, and a grey "WIDE: can't collect" tag appears. The player zooms back in. | Zoom is a trade-off. |
| 1:30 | **Intro chunk: the cut.** A slow Urchin rolls in from behind, with the hint "pan ahead, then CUT". The player pans ahead so it is fully outside the frame and presses CUT. A *clack* sounds, it shatters into a wireframe that dissolves, and a result stamp lands on the viewfinder. | **Off-frame is not gone. CUT deletes it.** |
| 1:50 | **Intro chunk: glass floor.** A glass crossing; the player presses CUT before she is over it, the pane she is about to cross shatters, and she falls: **FELL**. The run ends at 1:58. The contact sheet shows the fatal frame circled. | Cutting cuts both ways. A cheap, fair, understood failure (M7). |
| 2:05 | Tap "Again". Same daily seed, same location. The player now anticipates. | Mastery feels within reach (M1, M2). |
| 3:10 | The player clears Scene 1 (+30 s film). Scene 2 title card: Miniature City. Hint: "Q/E or twist to rotate". | Rotation unlocks. |
| 3:40 | **Boulder** red box with an arrow in the margin. The player pans away so it never spawns, then deliberately lets the second one in behind the Talent. | Pop-in is a choice. |
| 4:30 | **Rope bridge.** Close-up is too short for the bridge; at wide the planks vanish. The player finds medium zoom with the bridge exactly in frame: "Thirds: perfect" flashes. | Framing as a puzzle under pressure. |
| 4:55 | The Wrap line starts deleting the world behind. A frantic pan and zoom dance; the Talent is caught. **WRAPPED at 5:02.** The contact sheet has a gorgeous half-deleted boulder frame. Share button. | The climax lands, there's a natural stopping point, and they want one more. |

---

## 11. Audio direction (WebAudio synthesis, zero audio files)

- **Audio obeys the rules too.** Every CAST entity carries its own sound source, and **only in-frame entities make sound** (mixed in stereo by x position in the gate). LOD applies to sound: Close-up is full bandwidth, Wide is low-passed and bit-reduced, Proxy is a single sine "placeholder" tone. Zooming out literally makes the world sound cheaper.
- **Generative score:** a minimal pulse at 96 BPM ⚙. Each *entity type* owns a stem (Urchin = plucked bass, Extras = murmured chord pad, Rumour = detuned drone, Swarm = hi-hat ticks). The music is literally what's in shot, so culling a threat cuts its instrument mid-bar.
- **Signature sounds:**
  - *CUT:* a synthesised shutter clack.
  - *Pop-in:* clapperboard clack, preceded by a quiet preload tick when a red box appears.
  - *Off-screen countdown:* projector clatter speeding up.
  - *LOD change:* a short bitcrush glissando.
  - *Reel:* a sprocket ratchet.
  - *Wrap:* a rising "strike" saw plus a crew-style "that's a wrap" chord.
- **Camera motion:** a projector-motor hum whose pitch follows pan speed, which also tells you when you're "in motion" (Stagehand awake).
- **Settings:** master/music/sfx sliders, mono option, and a "calm" mix for reduced motion.

---

## 12. Visual signature: "the render pipeline as diegetic UI"

**The look:** a **flat-shaded clay-and-plywood miniature set** inside the gate, framed by a **GPU-debugger overlay** that's part of the fiction.
- **Gate UI:** corner brackets, a REC dot, timecode (film remaining), a focal-length readout (24–85 mm), an LOD tier pip under the Talent, and rule-of-thirds guides that light up when the Talent sits on an intersection.
- **Bounding boxes:** every CAST entity has a thin cyan AABB (red for lethal at its current tier), drawn as instanced line boxes.
- **LOD rings:** concentric ground rings around entities flash when a tier changes; the mesh swap is shown with a 120 ms ⚙ wireframe shimmer.
- **The off-set margin:** dark slate with a faint world grid, and **frustum lines** from the gate corners converging to a small camera icon ("you"). Call-sheet boxes (red, cyan, LEDGER pulsing) sit here.
- **The cut:** the deleted entity flips to wireframe, its triangles fly apart along the gate edge, and a film-burn orange glow traces the slice.
- **Pop-in:** a white scanline sweep reveals the mesh.

**Palette:** paper #e8e4da, set clay #b9ad98, ink #232323, Talent red #d23a2a, debug cyan #3fd8ff, hazard red #ff4b3e, film-burn #ff7a1a, margin slate #1b1e24. Night Shoot inverts the set palette under a single warm work-light pool.

### Staying cheap on weak GPUs (three.js, WebGL2)
- **Only draw what exists.** The gate is the culling volume, so on-screen entity counts stay bounded by design: ≤ 250 entities and ≤ 600 SET tiles in frame ⚙.
- **Instancing per archetype per LOD tier.** Real LOD meshes are separate `InstancedMesh`es, so a tier change moves an instance between buckets with no new geometry. SET tiles are a single `InstancedMesh` per tile type (≤ 6 types).
- **Flat shading with vertex colours plus one 16-colour palette LUT,** and *no textures* except a 256×1 LUT and a 64² grain tile.
- **Lines** (bounding boxes, rings, frustum lines, thirds) go in one `LineSegments` buffer rewritten each frame (≤ 4,000 segments ⚙).
- **One post pass** at full resolution covers palette LUT, vignette, grain, gate edge chroma and a 4-tap directional blur only while in motion. The margin grid and frustum lines are drawn in that same fullscreen shader, not as geometry.
- **Adaptive tier.** The 3D set renders at DPR 1.0 → 0.75 → 0.5 ⚙ based on a 60-frame median frame time, stepping down only. UI lines stay crisp because they're drawn after upscale.
- **Shadows:** no shadow maps. A blob shadow decal per entity is instanced as part of the entity's draw.

**Budgets (enforced in CI, ⚙):**
| Budget | Target |
|---|---|
| Draw calls | ≤ 24 |
| Triangles in frame | ≤ 60k |
| GPU frame | ≤ 8 ms at 1080p on Intel UHD 620-class (measured manually at M10) |
| Sim tick | ≤ 1.0 ms p95 at 250 entities (Node benchmark) |
| JS bundle | ≤ 300 KB gzipped |
| Cold load to playable | ≤ 2.0 s on simulated Fast 3G |
| Memory | ≤ 150 MB |

---

## 13. Technical architecture

```
src/
  sim/            pure TS: no three, no DOM, no Math.random/Date/performance (ESLint rule)
    tuning.ts     every ⚙ number
    rng.ts        mulberry32
    camera.ts     camera state, damped motion, zoom/rotate limits, "in motion" flag
    frame.ts      ortho projection (pure), gate rect, projected-AABB overlap, call-sheet query
    lod.ts        screen-size → tier with hysteresis
    world.ts      spawn points, SET streaming, CAST/LEDGER/RECURRING lifecycle, consumed set
    talent.ts     path follow, fork choice, hold, collisions, fail checks
    entities/     one module per archetype, logic keyed by tier; stats from data/archetypes.json
    step.ts       step(state, inputFrame) → state  (fixed 60 Hz ⚙)
    hash.ts       FNV-1a over quantised state
  gen/            chunk templates (JSON), stitcher, validator
  replay/         InputFrame codec (quantise, RLE, CompressionStream deflate, base64url)
  render/         three.js view: reads sim snapshots, interpolates between ticks, never writes sim state
  audio/          WebAudio graph driven by snapshot (in-frame entity list)
  input/          mouse/keyboard/touch/gamepad → InputFrame {pan:int8x2, zoom:int8, rot:-1|0|1, hold:bool, steady:bool, cut:bool}
  ui/             DOM HUD, menus, contact-sheet compositor
  bots/           TrackerBot, WideBot, CloseBot, AdaptiveBot, ChaosBot, scenario scripts
data/archetypes.json, data/chunks/*.json
```
- **Determinism:** the sim consumes only `(seed, InputFrame[])`, and the replay is just that. Math uses plain JS doubles with fixed operation order, avoiding `Math.sin` and `Math.cos` in sim-critical paths (a lookup table) to dodge cross-engine variance ⚙. The test compares hashes between Chromium and Firefox in Playwright.
- **Culling logic lives in the sim, not the GPU.** The renderer draws whatever the sim says exists, and `renderer.frustumCulled` is set false on instanced meshes so the GPU never disagrees with the rules.
- **Data-driven entities:** `archetypes.json` defines class, per-tier `{mesh, radius, speed, lethal, pushable, collectable, behaviour}`. Adding an entity means data plus one behaviour module plus a scenario test.
- **Render/sim decoupling:** the sim runs on fixed 60 Hz ⚙ ticks via an accumulator. The render interpolates positions and camera, and if a frame is slow the sim catches up (max 5 ticks per frame ⚙). Input is sampled per tick, so camera control stays responsive even when rendering drops.
- **Debug API** (`?debug`): `window.__cull = { step(n), input(frame), hash(), state(), load(seed), setTier(t) }`, plus URL flags `?seed=&tick=&frozen=1&lens=&tier=&bot=`.

---

## 14. How AI agents build and verify it on their own

1. **Headless sim tests (Vitest, Node).**
   - Unit tests for every rule in §2 and per-tier behaviour for every entity.
   - **Property tests** (fast-check), run on every tick of random runs:
     - (a) after any tick, no CAST entity exists whose projected AABB misses the gate (except Swarm and Monitor-cone cases);
     - (b) every in-frame tier matches screen size within hysteresis;
     - (c) the Talent being off-frame for 60 ticks ⇒ failure;
     - (d) a consumed spawn point never respawns (except RECURRING);
     - (e) SET reload is byte-identical.
2. **State hashes.** Golden hashes for 5 seeds × 3 bots at ticks 600/3,600/18,000. Any change needs `UPDATE_HASHES=1` plus a reason in the PR.
   - Current pinned fair-Adaptive Shoot hashes (`tests/m2.test.ts`): seed 1 `a4e1ae96`, seed 19 `abb7dbfa`, seed 2026 `809fab34`. These were last bumped 2026-10-14 (Shutter step 1 follow-up 2, Urchin waves), when the shutter state entered the hash. See `DECISIONS.md`.
3. **Scenario tests.** Tiny hand-authored chunks with scripted inputs, e.g. "Urchin at W=30 touches the Talent → no fail", "Bridge at W=40 → FELL", "Stagehand doesn't move while camera speed < 0.6", "Rumour grows by exactly 0.3·t off-screen".
4. **Bot players** (`src/bots`, also runnable in the browser via `?bot=`):
   - **TrackerBot** keeps the Talent centred at mid zoom (the passive baseline).
   - **WideBot** and **CloseBot** use fixed extremes (the degenerate strategies).
   - **AdaptiveBot** is a heuristic planner: it reads the call sheet, defangs by zoom, culls threats, frames bridges and collects Reels. It's the "skilled player" proxy.
   - **ChaosBot** sends random inputs as a fuzzer (no crashes, no NaNs, invariants hold).
   
   **Design-health assertions (CI, ⚙):** AdaptiveBot's distance ≥ 1.3× TrackerBot's on 50 seeds; WideBot and CloseBot each ≤ 0.7× AdaptiveBot. That proves framing decisions matter and that no fixed zoom dominates.
5. **Golden screenshots** (Playwright, Chromium headless with SwiftShader): `?seed=N&tick=T&frozen=1` for ~20 frames per milestone (each entity at each tier, a cut mid-animation, the margin with call-sheet boxes, the contact sheet), at ≤ 1% pixel diff ⚙. Touch emulation tests drive the thumb pad, pinch and twist.
6. **Perf checks in CI:** `renderer.info` draw calls and triangles on a worst-case seed frame; the Node sim benchmark; bundle size via `size-limit`; Lighthouse load time on the Pages preview. Real GPU frame time is a manual M10 gate, since CI's software GL isn't representative.
7. **Agent rules (for AGENTS.md):**
   - `sim/` stays pure.
   - Every PR adds or updates tests.
   - Tuning changes go only in `tuning.ts` / `archetypes.json`.
   - Golden or hash updates must be explicit.
   - No new dependency without justification.
   - Never add currency, paid or random rewards for money, streak penalties, timers or tracking.

---

## 15. Campaign milestones

The build order is `docs/design/game-design.md`. The M0–M10 schedule that used to be listed here is retired. This draft still holds the core rules (§2), LOD (§4) and tech (§13).

## 16. Playtest signals

A cold playtest still watches five signals. The old M2 kill criterion and its pivot plan are retired; the campaign bible owns go and no-go.

| Signal | What to watch |
|---|---|
| Understanding | They can explain "off-frame stays live until CUT deletes it" within 60 s of play |
| Agency | They deliberately cull a threat by their second run |
| LOD discovery | They change zoom for a LOD reason by 5 min |
| Pull | They start a third run on their own |
| Comfort | No one reports nausea that persists with reduced motion on |

---

## 17. Risks and open questions

**Risks**
- **Motion sickness:** mitigated with critically damped camera, no gameplay shake beyond the short CUT kick, snap rotation, reduced-motion mode, an optional static-grid overlay and the speed assist. Tested at M2 and M10.
- **Readability:** with debug lines plus clay it can get busy. Mitigations: lines only on CAST, hazard colour plus hatch, and a "clean frame" toggle. Checked by golden screenshots and human eyes.
- **Passive play dominance:** guarded by the design-health bot ratios in `docs/design/game-design.md`.
- **"Hard to get from a thumbnail":** the contact sheet with a half-sliced hazard is the hook. The first 15 s must show a cut.
- **Determinism across browsers:** the trig lookup tables and a cross-browser hash test; if it fails, replays fall back to "same seed" rather than "same run".
- **Replay URL length:** quantise inputs to 30 Hz ⚙ if needed, or fall back to a downloadable `.cull` file.
- **WebM on iOS:** PNG plus text is the guaranteed share; the reel is a bonus.
- **Scope:** 12+ entities. Parked items (Slab, Occluder) stay parked until after M10.

**Open questions for Assam**
- Q1. A **square gate** everywhere, or match each device's aspect ratio (fairer to the screen, worse for daily fairness and replays)?
- Q2. **Rotation:** 45° snaps (proposed), free rotation, or none?
- Q3. **Occlusion:** stays out of the rules (proposed), or one late "Occluder" set piece where hidden equals unseen?
- Q4. Keep **HOLD**, or make the Talent fully autonomous (purer, harsher)?
- Q5. Tone: **film-set comedy** (proposed), or eerier ("the world forgets what you don't watch")?
- Q6. Name check: "CULL" alone may clash in searches; alternatives are *Out of Frame*, *Off Screen*, *Frustum*.

### Tuning table (all ⚙ initial guesses)
| Key | Value |
|---|---|
| gate aspect | 1:1 |
| camera pitch | 55° |
| zoom W range (scene 1/2/3 max) | 10–48 / 40 / 32 u |
| pan max / accel | 1.2 gate/s / 6 gate/s² |
| steady pan factor | 0.35 |
| zoom rate | ×1.6/s at a light input, boosted ×(1 + 8.6·u⁴) toward full input u = 1 (≈ ×90/s; widest→tightest 0.35 s) |
| zoom framing steps (tap snap) | 10 / 16 / 24 / 38 / 48 u, eased ≈ 0.15 s; holding past 0.15 s zooms at full speed (widest→tightest held ≈ 0.5 s) |
| rotate tween | 0.18 s per 45° |
| in-motion threshold | 0.6 gate/s |
| off-screen grace (free) | 0.5 s |
| lost-Talent film drain | +4 film-s per s (after grace) |
| lost-Talent fail | 3.0 s out of frame |
| pop-in exclusion | 2.0 u |
| call-sheet margin | 0.25 W |
| LOD thresholds | 48/24/10/4 lpx, 15% hysteresis |
| Talent speeds | 2.0/2.5/3.2/3.6 u/s |
| Talent radii | 0.30/0.40/0.60/0.75 |
| film | start 90 s, Reel +15 s, scene +30 s, hold ×2 (×1 while a defang gate or its ACTION beat holds her) |
| shutter recharge (CUT) | 1.8 s from empty to full (`shutterRechargeSeconds`); a press while recharging does nothing |
| close cut (≤ 1.5 u) | scores 250, refunds 2 s film (`closeCutRadius`, `closeCutScore`, `closeCutFilm`) |
| normal cut (≤ 8 u) | scores 50 (`farCutRadius`, `normalCutScore`); too-far cut scores 0 |
| combo multiplier | 1 + 0.5 × (combo − 1) (`comboStep`); a missed or penalised CUT breaks it |
| missed CUT | −2 s film, breaks the combo (`missedCutFilm`) |
| penalised CUT (she isn't framed) | −4 s film, breaks the combo (`penalisedCutFilm`) |
| off-frame Urchin speed | 3× its roll speed, homing on her (`offFrameUrchinSpeedFactor`) |
| Urchin waves (Backlot / City / Night / finale) | followers 4 / 2 / 0 / 0 per path-bound Urchin, 7 u apart (`urchinWaveFollowers`, `urchinWaveGap`) |
| threat indicator horizon | 6 s to contact, or within 1.5 u (`threatHorizonSeconds`) |
| defang mark to Glass | 6 u on the walked side (`glassShatterRadius`) |
| defang mark clear | a close CUT with the stand-in fully outside the frame; a farther CUT leaves it on its mark |
| defang ACTION beat | after the close cut she holds her mark under an "ACTION" cue and an exit arrow at her feet, then walks on: Backlot 0.35 s, City/Night/Long Take 0.9 s (`gateReleaseSecondsByScene`) |
| urchin speed | 1.5 u/s |
| boulder speed | 4 u/s |
| extras speed | 0.8 u/s |
| swarm radius | 0.08 u |
| stagehand speed | 3 u/s |
| rumour | +0.3 / −0.5 u/s |
| bridge length | 14 u |
| close-cut radius | 1.5 u (also the close-call radius, §5) |
| wrap speed | 1.8 / 2.2 / 2.6 u/s, last 25% of scene |
| threat budget | 1.0 / 1.6 / 2.3 / 2.8 |
| sim rate | 60 Hz, max 5 catch-up ticks |
| chunk | 16×16 tiles, ~40 templates, ≥ 6 Reels/scene |
| tilt-shift band | 40% of gate |
| bot ratios | Adaptive ≥ 1.3× Tracker; Wide/Close ≤ 0.7× Adaptive; M2 twin ≥ 1.3× |
| budgets | see §12 |

---

## 18. Art prompt sheet (for the Game Art Director)

- **Key art:** "A square camera viewfinder floating over a flat-shaded clay-and-plywood miniature film set, seen from a 55° diorama angle with soft tilt-shift. Inside the frame, a tiny figure in a red coat walks across a plank rope bridge over a painted chasm. At the right frame edge, a spiked clay urchin is sliced cleanly in half by the frame: its outside half is gone, and the cut face glows film-burn orange and dissolves into cyan wireframe triangles. Thin cyan bounding boxes surround props, and rule-of-thirds guides glow faintly. Outside the frame is a dark slate void with a faint grid, a red dashed bounding box with an arrow (an unloaded boulder), and frustum lines converging to a small camera icon. REC dot, timecode, '35mm' readout. Witty, crisp, slightly eerie."
- **LOD sheet:** "Turnaround of one clay urchin at four detail levels side by side: 300-triangle spiky, 60-triangle, 20-triangle octahedron, 12-triangle grey box, each labelled LOD0–LOD3 in a monospace debug font with its triangle count. Flat shading, vertex colours, no textures."
- **Contact sheet:** "A 3×3 black-and-white-bordered film contact sheet with sprocket holes and frame numbers. Colour frames show a tiny red-coated figure in clay sets; grease-pencil circles mark near-misses and one frame has a red X. Handwritten 'TAKE 1 · SCENE 2'."
- **Biomes:** Backlot (warm plywood, sawdust light), Miniature City (pastel tilt-shift town, toy cars), Night Shoot (black set, one sodium work-light pool, swarm specks).
- **Palette:** paper #e8e4da, clay #b9ad98, ink #232323, Talent red #d23a2a, debug cyan #3fd8ff, hazard red #ff4b3e, film-burn #ff7a1a, margin slate #1b1e24.
- **Type:** a monospace debug font for HUD numbers; a condensed grotesk for slates.
- **Avoid:** realistic textures, glossy PBR, generic low-poly mobile style, neon cyberpunk overload, lens-flare spam.
