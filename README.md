# CULL

CULL is a deterministic browser game about camera work. Pan and zoom the viewfinder to keep the Talent in frame, cut hazards at the frame edge, and collect Reels. Whatever is outside the shot does not exist.

**Play:** [aieatassam.github.io/cull-game](https://aieatassam.github.io/cull-game/)

![CULL on the backlot](artifacts/screens/m4/1280x800.png)

## Controls

- WASD or drag to pan
- `+` / `−` or the zoom slider to zoom
- `Q` / `E` to rotate
- Space or HOLD to keep the Talent in place
- `?daily=1` starts the UTC daily seed

## Develop

Requires Node.js and npm.

```sh
npm ci
npm run dev
```

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`, `npm run size`.

The campaign design is [`docs/design/game-design.md`](docs/design/game-design.md). Core rules, LOD and tech notes stay in [`docs/CULL.md`](docs/CULL.md). Architecture is [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Decisions are [`docs/DECISIONS.md`](docs/DECISIONS.md).
