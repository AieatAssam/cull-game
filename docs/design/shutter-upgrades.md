# CULL: shutter upgrades (design only)

> **DESIGN ONLY. NOT IMPLEMENTED.** Nothing here is in `src/`, `tests/` or the bot harness. The shipped shutter is B1 step 1 and step 2 (`docs/DECISIONS.md`, 2026-10-14). Numbers marked ⚙ are first guesses for `src/sim/tuning.ts`, to be tested with the balance harness before any of this ships.

Base shutter, for reference: one CUT slices every live cuttable hazard fully outside the frame. Recharge 1.8 s (`shutterRechargeSeconds`). Close cuts score 250 and refund 2 s. A missed CUT costs 2 s. A penalised CUT (she isn't framed) costs 4 s.

Upgrades change what the CUT does. They do not add a second button or a second clock, so the CUT stays the one verb.

---

## 1. Flash

**Rules.** A CUT also stuns every hazard inside the frame for 1.2 s ⚙. A stunned Urchin, Boulder or Extras member stops moving and stops being lethal on contact. It resumes after the stun. A stunned hazard still counts as framed for the CUT rules, so a stun does not make it cuttable. Flash does not stun her. She flinches, a visual cue only.

**Cost.** The recharge goes from 1.8 s to 2.4 s (+0.6 s ⚙). The view whites out for about 0.2 s on each CUT, so the frame is unreadable for that moment.

**Counterplay and risk.** Flash trades the next CUT for a short window on what is on screen now. In a wave (§ Urchin waves in `CULL.md` §2.7), a stun buys time on the framed leaders while the followers arrive out of frame. A player who cuts too early can waste the recharge on a stun that does not save her. The whiteout is the real risk, because it lands at the moment the player most needs to read the frame.

**Readability.** Stunned hazards get a pale ring and a frozen pose, with the stun timer shown as a shrinking arc. The whiteout is brief and fades from the centre, so the frame edges stay readable.

**Open questions.**
- Should the flinch slow her by a few percent, or stay purely cosmetic? A slow makes Flash a movement tool, which is a new verb.
- Does a stun carry across a CUT that does not hit anything? If not, a missed CUT with Flash costs the stun as well as the 2 s.
- Is the whiteout acceptable under reduced motion, or does it become a plain tint?

---

## 2. Thermal

**Rules.** Some props are really hazards: mimics. A mimic looks like set dressing (a crate, a plank, a ramp) until Thermal reveals it. While Thermal is on, revealed mimics show in frame and on the edge indicators. A CUT only works on revealed mimics. A mimic that is not revealed is not cuttable and does not count as a hazard for the score or the combo.

**Cost.** Either the frame narrows (for example, a 10% smaller viewfinder ⚙ while on), or the battery drains (for example, 1 battery-unit per second ⚙, recharging when off). Pick one. The narrowed frame costs the wide framing that Urchins and Swarm reward. The drain costs the player a second meter to watch.

**Counterplay and risk.** Mimics that are only revealed while on push the player into a choice between seeing the threat and seeing the stage. A mimic that stays hidden until she is close is a pop-in hazard by another route, so reveal radius matters. A player who leaves Thermal on all the time has lost the frame and is back to Tracker-style play.

**Readability.** Revealed mimics get a heat tint and a hatch, and their edge indicator shows a different shape, so they are not confused with a Boulder. The battery or narrowing is shown beside the charge ring, not in a new panel.

**Open questions.**
- Narrow or drain? Narrowing is simpler to read and is already a framing control. Draining is easier to tune.
- Are mimics a new CAST kind, or a Set prop with a hidden hazard flag? A flag keeps the generator and the bots simpler.
- Do bots need the reveal state in `PlayerView`? Without it they cannot cut mimics at all, which would make Thermal a human-only upgrade.

---

## 3. X-ray

**Rules.** The CUT reaches through walls and occluders. A hazard hidden behind geometry in the frame counts as fully outside the frame and is cut, as if it were off-screen. This is the first place where the occlusion rule in `CULL.md` §2.2 would change. X-ray would be the one occluder set piece Q3 asks about.

**Cost.** Either the close-cut bonus is halved (250 → 125 ⚙), or each X-ray CUT costs extra film (for example, 1 s ⚙ per cut). X-ray makes a hidden hazard safe to clear, so something has to pay for it.

**Counterplay and risk.** The player can clear a hazard the camera has never seen, so the call sheet and the edge indicators have to be honest about what is behind a wall. A hazard that she walks into from behind a wall is still a hazard. X-ray reduces the skill of reading the frame edge, which is the core of the game, so it must not be the default.

**Readability.** Hidden hazards show as dashed outlines through the wall while X-ray is active. They use the same edge indicator as off-frame threats, so the player learns the rule from the same place.

**Open questions.**
- Does X-ray cut hazards behind her as well as in front? The current rule is front-only in spirit, but the sim has no direction for "behind".
- Does X-ray need its own charge, or does it share the 1.8 s recharge? Sharing is simpler and makes the cost real.
- Does the occlusion test run in the sim? That would be a new sim rule, and the hashes would change.

---

## 4. Wireframe / Render Pass

**Rules.** A CUT also slices set geometry that is fully outside the frame: bridges, walls and floor tiles. A sliced floor becomes a hole. A sliced bridge drops its planks. A sliced wall opens a shortcut. This is the set-piece version of the CUT. It applies to SET, which is currently reloaded from the seed and never cut.

**Cost.** The Render Pass has its own charge, separate from the normal CUT. It recharges on its own clock. It is not free, because a set cut can drop her. Also, a sliced floor can't be restored, so any CUT of floor needs to check that she is not standing on the cut tile.

**Counterplay and risk.** A set cut can open a shortcut past a hazard, or it can drop her. The risk is the floor under her. A player who cuts a floor tile that she is about to walk onto is the Glass death again, on set. The rule needs a hard check: a set cut never removes the floor under her or the tile she is about to walk onto.

**Readability.** The Render Pass shows a preview: the set to be cut is outlined in wireframe while the pass is armed. A second charge bar sits next to the CUT meter, so the two never look like one.

**Open questions.**
- Is a set cut ever allowed to remove a tile she can still reach by the path graph? If yes, the path graph needs a repair step, which is new generator work.
- Does a set cut count for the score? If it does, it adds a second scoring route that bots can farm.
- Does the wrap (`CULL.md` §5, item 14) read set cuts as part of its strike line? If so, the pass and the wrap interact.

---

## 5. Stacking

- **One upgrade slot per take.** A take has at most one upgrade. The player picks it at a checkpoint, from two offered choices, and it lasts until the take ends.
- **Exclusive by design.** All four upgrades change the CUT. Two at once would make the CUT's result hard to predict, and the readability cost would outweigh the gain. If a second upgrade is ever wanted, it should be a different verb, not a second CUT modifier.
- **Interactions to check.** Flash with Thermal would stun mimics only if revealed. X-ray with Render Pass would cut set behind geometry. Neither is allowed until the bots show it is fair.

---

## 6. Validation (how bots and the harness would check upgrades)

Each upgrade needs a bot policy that uses it fairly. No special cases, no handicaps (the rule from the 2026-10-14 entries).

- **Passive fails.** With any upgrade, Tracker, Gatekeeper, Metronome, Wide and Close must still be near 0% on the Shoot. An upgrade that lets a passive policy pass is a new route for luck or pure framing, and it is not shipped.
- **Skilled beats passive.** The upgrade-aware Adaptive policy must clearly beat the passive bots. The target band from `CULL.md` and the design bible stays in force.
- **No seed winnable by luck.** The chaos bot, which presses CUT at random, must not complete a seed that the skilled bots cannot. This is the check that stops Flash or Thermal from turning into a button-mash win.
- **Report per PR.** Each upgrade PR reports `npm run balance -- --stage=0 --mode=both --seeds=200 --jitter=8` numbers with and without the upgrade, plus the hashes that change, as `DECISIONS.md` requires.
- **Replay.** The upgrade choice is an input or a seed field. It goes into the replay codec and the hashes, so older replays must still decode.
