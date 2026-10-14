# Dailies style guide

CULL is a 16 mm stop-motion shoot on a tabletop. The gate is the camera. Everything in it is a handmade miniature: cardboard flats, felt ground, clay hazards, a carmine coat. References: Tearaway, Lumino City.

## Palette

These are the only scene and cast colours. Do not introduce a second accent.

| Role | Hex | Use |
|---|---|---|
| Ink | `#1e1a17` | Outlines, stage, type on paper |
| Paper | `#f3ead7` | UI text, gate corners, clay highlights |
| Plywood | `#c9a46b` | Backlot ground, wood props |
| Felt | `#3f6b4f` | Backlot path |
| Carmine | `#c8322a` | Talent coat, record light, hostile camera |
| Clay | `#d4846a` | Close hazards, skin |
| Brass | `#e2b04a` | Reels, focus rings, links |
| Burn | `#ff7a1a` | Cut edge, film remaining |
| Earth | `#8a5a3a` | Boulders, cardboard blocks |
| Violet | `#6d6487` | Rumour smoke |

Talent carmine and hazard clay stay the same in every scene so the cast reads on every set.

UI-only tones (tokens in `src/style.css`): **Stage** `#241c16` is the page behind the gate; **Muted** `#d9cbb6` is a paper tint for secondary copy on the results card. Tints are Paper at 8/14/40/60% and Ink at 60/80% alpha (`--paper-40`, `--ink-60`, …); no other hex values in the UI.

## Scenes

Each scene changes the set, not the cast.

| Scene | Sky | Ground | Path | Blocks | Light |
|---|---|---|---|---|---|
| Backlot | `#f0d7b0` | plywood | felt green | `#a56b3c` | warm key `#ffd9a0` |
| Miniature City | `#d5e6ee` | `#7eaea4` | paper `#f4ead4` | `#c4513a` | cool fill `#5d7c99` |
| Night Shoot | `#141a24` | `#31445c` | plywood | `#3d4e68` | sodium pools `#ffb347` |
| Long Take | `#1a120e` | `#4a3024` | carmine | `#2a1c16` | warm key |

## Shape language

- Chunky, slightly uneven forms. Outlines are ink and about 4 px at 128 px source size.
- Terrain blocks are cardboard flats, taller than they are wide, with a contact shadow from the key light.
- The path is one hand-cut felt strip: rounded corners, a stitched and frayed edge, and a lighter bevel on the key side. It is not a stack of tiles. The table is cork grain; City path is paper fibre.
- Backlot dressing is crates, sandbags, C-stands, cable and tape. Miniature City is paper buildings, kerbs, lamps, and a tilt-shift blur at the gate edges. Night Shoot keeps the sodium pools, adds a wet sheen on the path, and a cool moonlight rim. Dressing stays quieter than the cast.
- Hazard silhouettes stay readable at a medium zoom on every set: at least 20 px tall in the 1280×720 gate, and no two kinds share an ink outline tighter than IoU 0.7. Fills stay inside the palette and clear the ground.
- Cast drawings share one light: a lighter patch toward the top left, a darker edge toward the bottom right.
- No cyan debug boxes, wireframe cones, or layout grids in the play view. A brass ring may flash for one LOD change.

## Lighting

- Orthographic camera at 55°. The set is a table, not a landscape.
- One warm key from the upper left, falling off toward the lower right, with contact shadows shifted that way. A coloured fill comes from the scene table above.
- Night Shoot keeps the same shapes. A cool fill lifts the table off the sky, and sodium practicals (`#ffb347`) throw a pool on the felt from a lamp at the path edge. The Talent stays carmine. The exposure rule (in frame = lit) is later work.
- Inside the gate, a soft vignette and film grain darken the edges. The centre of the frame is where detail reads. Wide zoom still simplifies hazards by LOD; that is the same idea in the simulation.

## The cut

Framing something out deletes it. Show that on the edge it crossed:

- A burn-orange slice on that edge.
- A short peel, like a bit of film lifting off, with a burned edge.
- A CUT stamp, a few sparks, a 70 ms hit-stop, and a small shake.
- Reduced motion drops the shake, peel, sparks, and hit-stop.
- The sound is a synthesised tape splice: noise snip plus a low thump.

## UI

- Display face: Fraunces (OFL), for the title, scene name, and CUT stamp.
- UI face: Source Sans 3 (OFL), weights 400/600. Three sizes: 14 px (labels, body), 20 px (HUD numerals, desktop message line), 40–64 px clamp (display). Nothing smaller than 14 px.
- Sentence case in the source strings; caps only for tags of three letters or fewer (CUT, REC), tracked 0.08em.
- Spacing on an 8 px grid (8/16/24/32). The frame inset is 16 px.
- No borders. Tonal fills (Paper 8–14%, Ink 60–80%) and space do the work; the only lines are the frame corners, meters and the 2 px Brass focus ring.
- Accents: Burn is the player's action (CUT, film, score highlights). Carmine is danger, the Talent and REC only. Brass is links and focus only.
- Motion: `--ease-out` for entering/reacting, `--ease-in-out` for state changes; 120 ms UI, 240 ms panel, 900 ms stamp. At most one infinite pulse on screen. Reduced motion keeps opacity, drops transforms, and freezes the film strip.
- Film is one horizontal perforated strip along the frame's bottom edge: its lit length is the film left and its perforations travel while rolling, frozen on pause. The film number sits in the frame's top-right corner, never on the strip.
- In-take HUD lives on the glass: score + REC top-left, film counter top-right, one message line bottom-centre. Nothing is drawn over the centre of the frame.
- Feedback tiers: (1) cut stamp at the edge, Fraunces, 0.9 s, success; (2) penalty tick, Source Sans 600 Burn, beside the counter, 0.8 s, minor; (3) danger frame state, carmine glow on the edge nearest her + edge arrow + message line, critical. No centred boxes.
- One message line, fed by a priority queue (danger > coach > incoming threat > shot advice > tip; 1.2 s minimum dwell, no repeat within 4 s). Threats are named in plain words ("spiny ball", "rolling rock"), not entity ids.
- Icons: one inline-SVG set (`src/ui/icons.ts`), 24 px grid, 2 px stroke, square caps, `currentColor`. No text glyphs as icons, no external-link arrows on in-game actions.

## Type

Bundled files live in `src/fonts/` with `OFL.txt`. Fraunces © The Fraunces Project Authors. Source Sans 3 © Adobe, reserved font name Source.
