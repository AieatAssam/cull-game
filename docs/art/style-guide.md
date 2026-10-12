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
- The path is one raised felt ribbon with bevelled edges, not a grid of tiles. The floor is cork. Standing props are cardboard with a lighter top and a contact shadow.
- Hazard silhouettes stay readable at a medium zoom on every set: at least 20 px tall in the 1280×720 gate, and no two kinds share an ink outline tighter than IoU 0.7. Fills stay inside the palette and clear the ground.
- Cast drawings share one light: a lighter patch toward the top left, a darker edge toward the bottom right.
- No cyan debug boxes, wireframe cones, or layout grids in the play view. A brass ring may flash for one LOD change.

## Lighting

- Orthographic camera at 55°. The set is a table, not a landscape.
- One warm key from the upper left and a coloured fill from the scene table above.
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
- UI face: Source Sans 3 (OFL). Nothing smaller than 13 px.
- Motifs: sprocket holes on the gate, a slate title card, brass for links, carmine for the record dot.
- The film number sits beside the bar, never on it. The bar itself never grows past its track.
- The call sheet names what is in the shot and what is about to enter, in plain words ("spiny ball", "rolling rock"), not entity ids.

## Type

Bundled files live in `src/fonts/` with `OFL.txt`. Fraunces © The Fraunces Project Authors. Source Sans 3 © Adobe, reserved font name Source.
