# Decisions

- 2026-10-12: Use the square gate and 45° rotation snaps, keep occlusion out of simulation, retain HOLD, and use film-set comedy; these follow the design draft defaults.
- 2026-10-12: The M1 projection uses a deterministic ground-plane orthographic transform at 55°; entity bounds use an equivalent conservative projected extent calculation, and renderer camera uses the matching yaw, pitch, and gate width.
- 2026-10-12: M2 starts with a deterministic Backlot strip and seed-driven entity spawns; the browser smoke test captures 390×844 and 1280×800 gate layouts.
- 2026-10-12: Add deterministic branch choices at path indices 4, 14, 24, 34, 44, 54 and 64; choose the available branch with the best heading dot product toward the gate centre, using the first option on ties.
