# CULL: brutally honest concept review (13 Oct 2026)

Basis: `docs/design/game-design.md`, `docs/design/loop-review-2026-10-13.md` and the sim code (`step.ts`, `framing.ts`, `input-map.ts`). The code is reviewed as it stands on the working tree. I did not play it hands-on for this review, so the judgement comes from the rules, the bot evidence and the user's own report. No code was changed.

## Verdict in one line
The *fantasy* (you are the camera operator protecting a felt-puppet star, and "cut" is literal) is distinctive and worth keeping. The *core verb* as built is not. It is passive avoidance with an indirect, delayed and often invisible effect, and three weeks of tuning have been spent compensating for that.

## 1. Core verb: is "framing out" satisfying?
Mostly no. Mechanically, a cut happens *as a side effect of the camera moving*: there is no button, no aim and no commitment (`step.ts:271`). Its effect also varies with hidden rules:
- far cuts don't count for defang;
- gate stand-ins "unload intact" and come back;
- far Glass unloads;
- never-seen entities don't exist.

So the player's best moment, the CUT stamp, is at best *incidental* and at worst *a lie*. Moment to moment you are steering away from things, not doing something to them. The defang gate then demands a precise close cut that the leash made geometrically impossible. That is the clearest sign that the rules were designed for the bot, not the hand.

Satisfying camera-verb games (Pokémon Snap, Fatal Frame, Umurangi Generation, Viewfinder) all have an **explicit shutter**: one deliberate press, judged instantly. CULL has none.

## 2. Agency and feedback loop
- **Two bodies, one input.** You steer the frame, the Talent walks on rails, and the hazards act on her. Your agency over her is only indirect: HOLD (which burns film 2×) and framing. When she dies, it feels like *the game* killed her.
- **The loss currency is opaque.** Film drains for time, for HOLD (2×), for gates (2×) and for LOST HER (+4 s/s). Players die of an empty meter, not a monster. 100% of human-bot deaths were film exhaustion at a gate, which is a bookkeeping death, not a dramatic one.
- **Rewards are flat.** A close call is +250, the grade averages four sub-scores, and reels are touched, not shot. Nothing compounds, and there is no combo or streak to chase.

## 3. Readability
- **Puppets:** readable after PRs #8 and #10.
- **Rules:** not readable. Whether an enemy is cut depends on distance, LOD tier, gate state, the "seen" flag and enemy type. The design pillar "every death explainable from one frame" is currently false: you cannot tell from a frame that a cut will not count.
- **Phone screens:** the frame *is* the screen, so off-frame threats are invisible by design. The call sheet has to carry all the warning, and at phone size it can't.

## 4. Difficulty curve
- The ceiling bot (Adaptive) wins about 99%. Humans won 0% before the fixes and about 23% for a full shoot after them. That is a **cliff**, not a curve.
- Difficulty comes from control friction (leash, pan ramp, drag mapping) and hidden rules, not from enemy pressure the player can read.
- Every fix so far (zoom 7 s to 0.48 s, the leash removed, TOO FAR) has *removed friction* rather than *added meaning*. When the remaining friction is gone, expect the game to swing to trivial or random, because the underlying decision space is thin: drift away from red things.

## 5. Hook and identity
- **Strong:** the film-set wrapper (Days, call sheets, camera upgrades: Flash, Thermal, X-ray, Render Pass), the felt-puppet art and "CUT!" as both a film word and a kill.
- **Weak:** the hook can't be explained in one verb. "You protect her by not looking at monsters" is clever on paper and counter-intuitive in the hand: players instinctively *point* the camera at threats.
- The camera upgrades are the best ideas in the bible, and they are exactly the moves that make the camera *active*.

## 6. Comparables, and what they do better
- **Pokémon Snap / New Pokémon Snap.** The rail is fine because the player's verb is a deliberate shutter, scored on composition. That is CULL's grading idea, done with agency.
- **Fatal Frame / Project Zero.** The camera is a *weapon* with a charge: you wait for the "fatal frame" when the ghost is closest, and you get a risk/reward spike. This is CULL's close-call idea, made central and explicit.
- **Viewfinder (2023).** Framing *changes the world*: puzzle agency, readable rules and a strong hook.
- **Lemmings / Escort-style games (Ico, Brothers).** An escort works when the charge is predictable and you have direct tools on the world. CULL gives you neither.
- **Superhot / Hotline Miami.** Short, instant restarts with explicit rules are what make high difficulty fun, not a 4-minute take with meter attrition.
- **Umurangi Generation.** Its identity comes from the brief: "shoot these things". CULL's shot list is the same idea, but used as a punishment gate.

## 7. Risks of continuing as-is
1. A sunk-cost polish loop: every week fixes friction, and fun doesn't appear.
2. Bots keep certifying a game that humans can't play, because the bot-first methodology rewards rule complexity.
3. Mobile is fundamentally hostile to an invisible-threat, precise-pan design.
4. The scope (5 Days, M1–M30) multiplies the unclear core five times.

## 8. Options

### A: Keep and polish
- **Pitch:** fix the film-burn-at-gate issue, simplify the cut rules (*any* frame-out counts, with a visible cut radius), add an off-frame threat indicator, then ship M5 Flash.
- **Keep:** everything.
- **Effort:** 1–2 weeks.
- **Risk:** high. It makes the game *playable*, not *fun*. The likely outcome is a fair but bland avoidance game. Choose A only if a human playtest after the gate fix shows people replaying voluntarily.

### B: Significant reshape. The camera becomes an active tool (recommended family)
Keep: the engine, determinism, replays, the art, the Talent, the Days and upgrades structure, and the bots (re-targeted at human personas).

**B1: "Shutter" (Fatal Frame × Snap).**
- **Core loop:** frame freely, then **press CUT** to slice everything outside the frame in one hit, on a 1.5 s recharge. Closer and riskier cuts score more and refund film; a mistimed cut wastes the charge.
- **Days:** each Day changes what the shutter does. Flash stuns what's *inside*, Thermal reveals mimics, X-ray cuts through walls, Render Pass cuts geometry.
- **Effort:** about 2–3 weeks, mostly rule surgery in `step.ts`/`framing.ts` plus the UI.
- **Risk:** moderate. It needs fresh balance, but the decision space becomes legible.

**B2: "Set-up the shot" (Viewfinder-lite, turn-based-ish puzzles).**
- **Core loop:** short 30–60 s scenes. You plan the framing on a paused call sheet, then roll. The take plays deterministically, and you can add up to N live corrections. Puzzle stars for minimal edits.
- **Why:** it fits determinism and replays perfectly, and it is mobile-friendly.
- **Effort:** about 3–4 weeks, including a scene editor and content.
- **Risk:** content-hungry, and it loses the action identity.

**B3: "Director's rhythm".**
- **Core loop:** the Talent hits marks on a beat, and you cut on the beat to the next framing. Hazards telegraph on the beat as well.
- **Effort:** about 3 weeks, plus audio.
- **Risk:** this directly contradicts pillar 2, and the sound pass has never been listened to. It is the weakest of the three; prototype it only if B1 feels flat.

### C: Start fresh
- **Pitch:** "SECOND UNIT", a stunt-camera arcade game. In 60 s single-screen runs, you are the camera drone chasing a stunt puppet through collapsing sets, and you score by *capturing* spectacular moments (shutter) while the set itself is the hazard to *you*.
- **Keep:** the art style, the palette, the puppets and the film-set brand.
- **Effort:** about 4–6 weeks to a comparable state.
- **Risk:** you throw away the determinism/bot infrastructure and the Day design, and the new idea is unproven too.

## 9. Recommendation
**Option B1, the "Shutter" reshape, behind a 3-day prototype gate.**
- Keep the world, the art, the Days and the upgrades.
- Replace passive frame-out with an explicit CUT action that has charge, timing and a close-range reward.
- Gate it on **a human playtest by you, on phone and keyboard**, not on bot win rates. The question is "did you want another take?"
- If B1 fails that test, fall back to B2. Don't pour more polish into A, and don't start fresh: the identity is the asset, and the verb is the problem.

Pause M5+ until the verb is proven.
