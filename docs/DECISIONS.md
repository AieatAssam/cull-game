# Decisions

- 2026-10-12: Use the square gate and 45° rotation snaps, keep occlusion out of simulation, retain HOLD, and use film-set comedy; these follow the design draft defaults.
- 2026-10-12: The M1 projection uses a deterministic ground-plane orthographic transform at 55°; entity bounds use an equivalent conservative projected extent calculation, and renderer camera uses the matching yaw, pitch, and gate width.
- 2026-10-12: M2 starts with a deterministic Backlot strip and seed-driven entity spawns; the browser smoke test captures 390×844 and 1280×800 gate layouts.
- 2026-10-12: Add deterministic branch choices at path indices 4, 14, 24, 34, 44, 54 and 64; choose the available branch with the best heading dot product toward the gate centre, using the first option on ties.
- 2026-10-12: Use the Three.js renderer's actual CSS canvas size for the square gate; Playwright `frozen=1` snapshots manually step seeded input for repeatable checks.
- 2026-10-12: Keep the M2 human test as a sign-off gate; the 20-seed smart bot comparison missed its 1.3× target after one tuning pass.
- 2026-10-12: Continue into M3 per Assam's direction despite the M2 bot kill criterion; retain the failed ratio and pending human test as open evidence.
- 2026-10-12: Store hysteretic LOD tiers in simulation state and hashes; render Urchins with one instanced bucket per visible tier and omit sub-pixel instances. Debug tier previews may exceed gameplay zoom to capture all five tiers.
- 2026-10-12: Represent Extras as seeded member offsets with independent culling and 0.8 u/s motion; hold Swarm spawn points unconsumed below 4 lpx; model Bridge plank loss at wide tiers; collect or steal Reels through CAST cuts.
