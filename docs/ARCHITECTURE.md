# CULL architecture

The runtime uses Three.js, Vite and TypeScript, with pinned dependencies.
Campaign milestones live in `docs/design/game-design.md`. Browser checks use
Chromium only.

## Module layout

```text
src/
  main.ts                 application wiring and animation-frame loop
  sim/                    pure TypeScript; authoritative game state
    tuning.ts             tick rate, limits, thresholds and tuning values
    rng.ts                seeded mulberry32 and serialisable RNG state
    camera.ts             camera motion, zoom, rotation and motion flag
    frame.ts              orthographic projection, gate overlap, call sheet
    lod.ts                projected size, tier selection and hysteresis
    world.ts              spawn records, streaming and entity lifecycle
    talent.ts             path following, forks, HOLD, collision and failure
    entities/             behaviour modules keyed by archetype and tier
    step.ts               step(state, inputFrame) → next state
    hash.ts               canonical quantisation and FNV-1a state hash
    types.ts              state, entity, snapshot and input contracts
  gen/                    chunk loading, seeded stitching and validation
  input/                  mouse, keyboard and touch → tick input
  render/                 Three.js objects and snapshot interpolation
  ui/                     DOM gate, HUD and minimal cut/LOD feedback
  bots/                   scripted play
  replay/                 seed and ordered tick-input recording
data/
  archetypes.json          entity classes and per-tier data
  chunks/                 hand-authored scene and seeded-strip templates
tests/
  unit/                   pure rules and projection tests
  properties/             seeded run invariants
  scenarios/              small chunks with scripted inputs
  browser/                Chromium smoke, controls and frozen frames
```

## Simulation and rendering boundary

The simulation consumes only an initial seed, validated static data and an
ordered sequence of `InputFrame` values. It has no Three.js or DOM imports,
`Math.random`, `Date`, or `performance.now`; ESLint enforces this restriction.
Clocks, device events and graphics live outside `src/sim/`.

`step` advances exactly one tick at 60 Hz. State owns the tick count, camera,
Talent, film, world lifecycle, failure result and RNG state. Duration rules
use tick counts. The tick phases have a documented, fixed order, and entity
iteration uses stable identifiers rather than renderer order.

The application loop measures elapsed time and accumulates it outside the
simulation. It samples and records one input per tick, executes at most five
ticks per animation frame, then renders between the previous and current
snapshots. Excess accumulated time remains pending; time is never replaced
by a variable simulation step. Tick rate and catch-up limit belong in tuning.

Snapshots expose the camera, Talent, entity transforms, tiers, in-frame set,
call sheet and HUD values. The renderer treats snapshots as read-only and
interpolates transforms without feeding values back into simulation. Cuts,
spawns and tier changes follow the current snapshot discretely.

Gate projection, overlap, lifecycle and LOD decisions belong to the simulation.
The renderer draws only entities that the snapshot specifies; instanced
meshes set `frustumCulled = false`. A renderer mesh cannot decide whether an
entity exists or whether the Talent fails.

## Entity data and state

`data/archetypes.json` maps stable archetype keys to records of this shape:

```ts
type Archetype = {
  class: 'SET' | 'CAST' | 'LEDGER' | 'RECURRING';
  tiers: Record<Tier, {
    mesh: string;
    radius: number;
    speed: number;
    lethal: boolean;
    pushable: boolean;
    collectable: boolean;
    behaviour: string;
  }>;
};
```

Tier names come from one shared contract. Mesh names are opaque data keys:
only rendering resolves them into geometry. Behaviour names resolve to pure
simulation modules; validate keys, tier completeness and numeric fields when
loading data. Per-tier archetype stats stay in this JSON; other tuning values
stay in `src/sim/tuning.ts`.

Runtime entities contain a stable entity ID, archetype key, spawn ID, chunk
ID, transform, current tier and explicit behaviour state. Spawn records and
the consumed-spawn set are separate from visible meshes. SET reload restores
the same record; consuming a spawn prevents respawn except for RECURRING.
Adding behaviour requires data, a module and a scenario test.

## Determinism and replay

Mulberry32 advances explicit state from the run seed. Generation, spawning
and bots use seeded randomness with a stable consumption order. Save enough
RNG state to continue a run; rendering never consumes simulation randomness.
Use plain JavaScript doubles and fixed operation order. Sim-critical rotation
uses a fixed lookup table rather than runtime sine and cosine.

`InputFrame` is `{ pan: [int8, int8], zoom: int8, rot: -1|0|1,
hold: boolean, steady: boolean }`. Quantise device input at the boundary.
Replay stores the seed and exactly one frame per tick. Deterministic bots
produce this same contract without reading browser time or mesh state.

Hash canonical, quantised state with FNV-1a: sort IDs and sets, include RNG
and lifecycle state, and exclude render objects and interpolation. Hash
changes require an explicit update and a matching `docs/DECISIONS.md` entry.

## Test harness

Run checks through repository lint, typecheck, unit, browser and perf scripts.
Vitest runs simulation tests in Node; fast-check uses reproducible seeds and
reports the seed and inputs for failures. Scenario fixtures are tiny chunks
with scripted tick inputs and explicit expected state. Acceptance for the
current campaign is in `docs/design/game-design.md`.

Under `?debug`, expose `window.__cull` with `step(n)`, `input(frame)`, `hash()`,
`state()`, `load(seed)` and `setTier(t)`. Support deterministic seed, tick,
freeze, lens, tier and bot URL controls. Return state copies; debug mutations
go through explicit simulation commands. Frozen frames support reproducible
Chromium screenshots.
