# CULL sprite art direction

## Direction: The Handmade Backlot

CULL's cast should look like hand-painted stop-motion puppets placed on a miniature film set. Actors wear tactile felt and worn cloth; hazards are painted clay and carved wood; useful film equipment uses dark teal enamel, brass, and glass. Use broad light and shade, painted edge highlights, and a few tactile details that survive reduction. Avoid generic low-poly primitives, photorealism, hard black outlines, pixel art, glossy plastic, and neon overload.

All character and prop artwork is a clean transparent cutout, rendered at the game's 55° orthographic elevation. Keep a stable ground-contact anchor, honest world dimensions, and camera-relative 8-way facing. Authored wide and proxy artwork must preserve each entity's gameplay identity; do not rely on microdetail below 14 logical pixels. Keep consequential features readable at the tier where simulation rules depend on them.

## Palette identities

| Identity | Anchor | Reserved for |
|---|---|---|
| Talent carmine | `#D23A2A` | The protagonist's coat and proxy identity |
| Hazard coral | `#FF5B48` | Urchin spike roots, hostile lenses, danger details |
| Film burn | `#FF7A1A` | Cuts, Wrap edge, destructive effects |
| Ochre | `#C99A54` | Boulder, selected costume and set props |
| Brass | `#EDC680` | Buttons, fasteners, Reel hardware |
| Plywood | `#B9AD98` | Backlot surfaces and stage construction |
| Earth | `#806B56` | Rope, timber edges, backstage pieces |
| Ink | `#232733` | Deep shadows, boots, dark equipment |
| Teal | `#397D83` | Extras, camera housings and crates |
| Mint | `#8AC0B3` | Glass and helpful equipment |
| Debug cyan | `#3FD8FF` | Existing overlays and pickup accents |
| Violet | `#6D6487` | Rumour and selected Extras/Stagehand accents |
| Smoke | `#AAB1B8` | Metal, grey fabric and smoke highlights |
| Paper | `#E8E4DA` | Cream cloth, labels and pale highlights |

Use shaded ramps around these anchors. The Talent owns the strongest carmine; avoid using the same large color block on hazards or set props. Extras may vary among teal, violet, ochre, and smoke costumes, each with distinct headwear or hair contours.

## Cast silhouettes

- **Talent:** bobbed dark hair, tilted cream beret, carmine flared coat, broad cream scarf, dark boots, and camera satchel. Close artwork gets stitched lapels and brass buttons. Wide art retains the head, coat, scarf stripe, and boots. Proxy is a red sandwich-board stand-in with a cream actor silhouette. Provide walk, idle, and braced HOLD poses.
- **Urchin:** charcoal plated clay shell, coral spike sockets, ivory tips. Eight readable spikes at close range, four at medium, rounded harmless silhouette at wide, and an ink cube with coral inventory mark as proxy. Keep threat cues tied to its actual LOD tier.
- **Boulder:** asymmetric ochre and slate stage rock with a diagonal fracture and chipped pale edges. Preserve the fracture and two broad color planes at smaller tiers; use consistent lighting across tumble frames.
- **Extras:** individual people in teal raincoats, violet cardigans, ochre work jackets, or smoke aprons. At wide tiers, replace the brown wall with an authored crowd frontage whose overlapping heads still convey a blocking wall.
- **Swarm:** scattered ink-bodied stage moths, coral wings, pale center glints. Two wing frames; do not add a halo or minimum size that survives simulation culling.
- **Stagehand:** indigo-black overalls, low cap, pale face wedge, brass utility belt and large pocket. Forward-leaning walk silhouettes; movement-gated animation freezes the selected pose.
- **Rumour:** three lopsided violet-grey smoke lobes with cold pale edges and dark centers. No smiling face; scale and density follow the simulation radius and threat tier.
- **Reel:** short dark teal canister with brass rim, three dark spool openings, pale hub, cyan tab, and small latch. Simplify to brass disk plus teal edge when small.
- **Glass:** mint translucent floor with a thick pale bevel, broad diagonal reflections, brass corner clamps, and separate edge-grown crack artwork. Preserve visible gaps below.
- **Bridge:** weathered honey planks, ink gaps, braided earth ropes and brass lashings. Planks remain separable so wide/proxy tiers can show the dangerous opening clearly.
- **Monitor / Red Monitor:** related teal/brass or ink/coral camera housings, each with side panel, joint, lens hood and stable support. A diagonal stripe distinguishes the hostile unit in monochrome.
- **Continuity Prop:** a plywood ramp, coral spiked obstacle, teal crate and warm plank share violet tape, a pale inventory patch and brass fasteners. Each seeded state gets a distinct silhouette.
- **Wrap:** advancing orange film-strip tear, dark sprocket holes, paper backing and a thin incandescent cutting edge. A reduced-motion version uses a static edge.

## Sprite and renderer contract

- Store hand-painted, transparent source artwork in local atlases. Each manifest entry records atlas, frame rectangles, direction order, ground anchor, world width/height, simulation LOD tier, animation rate and meaningful state variants.
- Characters use camera-facing textured quads positioned at their world footprint. Select among eight authored directions from world heading minus camera yaw; use the closest direction during yaw tweening and switch near its midpoint. Never mirror asymmetrical costume details to fake back views.
- Props that roll or point at the camera need corresponding authored views or direction-specific components. Ground pieces such as glass, path and bridge deck use ground-aligned carriers.
- Preserve simulation bounds, LOD thresholds, spawn and cull rules. Sprite dimensions are world-sized; do not pin actor size to CSS pixels. Use tier art and renderer detail reduction without concealing consequential simulation state.
- Keep contact shadows quiet and batched. Pad atlas cells, use clean alpha edges and inspect reduced-resolution filtering for color fringes. Keep runtime loading local and deterministic.

## Asset rollout

1. The canonical Talent cutout establishes the felt, clay, lighting and alpha treatment. Its first in-game reference sprite is `artwork/sprites-source/talent-seed.png`.
2. The matching source set covers Talent, Urchin, Boulder, Reel and Stagehand. `artwork/sprites-preview.png` shows them together. The Urchin's four reviewed gameplay tiers are in `public/assets/sprites/urchin/tiers/`.
3. Talent, Urchin, Boulder, Reel, Stagehand, four Extras costumes, Swarm moths, Rumour smoke, both Monitor variants, Glass, Bridge, and four Continuity props now use matching painted local sprites or ground art. The Urchin keeps separate close, medium, harmless-wide and proxy art; procedural rules and bounds remain simulation-owned.
4. Remaining work: author animated and 8-way character views, add Wrap art, then check close/medium/wide/proxy screenshots on desktop and phone, all yaw snaps, monochrome stock, and reduced motion.

The original texture-free 16-color render plan remains the baseline for the set and debug UI. This art direction intentionally introduces local painted sprite atlases for the cast and props, as directed by the user.
