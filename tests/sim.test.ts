import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { projectWithRenderer, projectWithSimulation, updateRenderCamera } from '../src/render/camera';
import fc from 'fast-check';
import { inFrame, projectedAabb, overlapsFrame } from '../src/sim/frame';
import { stateHash } from '../src/sim/hash';
import { lodTier } from '../src/sim/lod';
import { shotListForPath } from '../src/sim/framing';
import { step, NEUTRAL_INPUT } from '../src/sim/step';
import { createGeneratedState, createState, loadWorld, reloadSet } from '../src/sim/world';
import { TUNING } from '../src/sim/tuning';
import { lensLodFactor, lensRenderTicks } from '../src/sim/lenses';
import type { CastEntity, SimState } from '../src/sim/types';

function entity(state: SimState, kind: CastEntity['kind'], x: number, y = 0): CastEntity {
  const item: CastEntity = { id: `${kind}-test`, kind, x, z: y, vx: 0, vz: 0, spawned: true, cut: false, age: 0 };
  state.entities = [item];
  return item;
}

describe('frame projection and lifecycle', () => {
  it('matches the Three.js orthographic projection at every yaw snap', () => {
    for (const yaw of [0, 0.1, 0.5, 1, 1.25, 2, 3, 4, 6, 7.5]) {
      const state = { x: 2.5, z: -4, zoom: 28, yaw };
      const camera = new THREE.OrthographicCamera(-14, 14, 14, -14, 0.1, 200);
      updateRenderCamera(camera, state);
      const simulated = projectWithSimulation(5.25, 3.75, state);
      const rendered = projectWithRenderer(camera, 5.25, 3.75);
      expect(rendered.x).toBeCloseTo(simulated.x, 6);
      expect(rendered.y).toBeCloseTo(simulated.y, 6);
    }
  });
  it('matches the anamorphic wide-gate projection', () => {
    const state = { x: -2, z: 3, zoom: 24, yaw: 2.5, lens: 'anamorphic' as const };
    const camera = new THREE.OrthographicCamera(-12, 12, 12, -12, 0.1, 200);
    updateRenderCamera(camera, state);
    const simulated = projectWithSimulation(5, -1, state);
    const rendered = projectWithRenderer(camera, 5, -1);
    expect(rendered.x).toBeCloseTo(simulated.x, 6);
    expect(rendered.y).toBeCloseTo(simulated.y, 6);
  });
  it('counts partial projected AABB overlap as in frame', () => {
    const bounds = projectedAabb(15.1, 0, 1, 1, 0, 0, 30, 0);
    expect(overlapsFrame(bounds)).toBe(true);
    expect(inFrame(15.1, 0, 1, 0, 0, 30)).toBe(true);
    expect(inFrame(18, 0, 0.2, 0, 0, 30)).toBe(false);
  });
  it('applies anamorphic, tilt-shift, and fisheye gate rules', () => {
    expect(inFrame(11.5, 0, 0, 0, 0, 10, 0, 0)).toBe(false);
    expect(inFrame(11.5, 0, 0, 0, 0, 10, 0, 0, 2.39)).toBe(true);
    expect(inFrame(0, 6, 0, 0, 0, 10, 0, 0)).toBe(true);
    expect(inFrame(0, 6, 0, 0, 0, 10, 0, 0, 1, 0)).toBe(false);
    expect(inFrame(6, 0, 0, 0, 0, 10, 0, 0)).toBe(false);
    expect(inFrame(6, 0, 0, 0, 0, 10, 0, 0, 1, null, true)).toBe(true);
    expect(inFrame(36, 0, 0, 0, 0, 10, 0, 0, 1, null, true)).toBe(true);
  });
  it('fixes Long Lens focal length, doubles pan speed, and maps Tilt-shift vertical input to the band', () => {
    const long = createState(1, []); long.lens = 'long-lens'; long.camera.zoom = TUNING.minZoom;
    const normal = createState(1, []); normal.camera.zoom = TUNING.minZoom;
    const input = { ...NEUTRAL_INPUT, panX: 127, zoom: -127 };
    const longNext = step(long, input); const normalNext = step(normal, input);
    expect(longNext.camera.zoom).toBe(TUNING.minZoom);
    expect(longNext.camera.vx).toBeCloseTo(normalNext.camera.vx * 2);
    const tilt = createState(1, []); tilt.lens = 'tilt-shift';
    const shifted = step(tilt, { ...NEUTRAL_INPUT, panZ: 127 });
    expect(shifted.camera.focusOffset).toBeLessThan(0);
    expect(shifted.camera.z).toBe(0);
  });
  it('keeps the Fisheye center more detailed and advances Super 8 in five fixed ticks per render', () => {
    expect(lensLodFactor('fisheye', 0, 0)).toBeGreaterThan(lensLodFactor('fisheye', 0.5, 0.5));
    expect(lensRenderTicks('super8')).toBe(5);
    expect(lensRenderTicks('35mm')).toBe(1);
  });
  it('cuts a spawned CAST entity after leaving frame permanently', () => {
    const state = createState(1, []);
    const hazard = entity(state, 'urchin', 0);
    state.camera.x = 100;
    const next = step(state);
    expect(next.entities[0]?.cut).toBe(true);
    expect(next.cuts).toContain(hazard.id);
    next.camera.x = 0;
    expect(step(next).entities[0]?.cut).toBe(true);
  });
  it('reloads SET data byte-identically from arbitrary seeds and coordinates', () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -1000, max: 1000 }), (seed, x, z) => {
      expect(JSON.stringify(reloadSet(seed, x, z))).toBe(JSON.stringify(reloadSet(seed, x, z)));
    }));
  });
  it('generates a deterministic Extras crowd with four to twelve individually tracked members', () => {
    for (const seed of [1, 17, 2026]) {
      const first = loadWorld(seed);
      const second = loadWorld(seed);
      const crowd = first.find((item) => item.kind === 'extras');
      expect(first).toEqual(second);
      expect(crowd?.members?.length).toBeGreaterThanOrEqual(4);
      expect(crowd?.members?.length).toBeLessThanOrEqual(12);
      expect(Math.hypot(crowd?.members?.[0]?.vx ?? 0, crowd?.members?.[0]?.vz ?? 0)).toBeCloseTo(0.8, 6);
    }
  });
  it('chooses the fork branch that points toward the gate centre', () => {
    const state = createState(1, []);
    state.talent.x = 8; state.talent.pathIndex = 4;
    state.camera.x = 8; state.camera.z = 10;
    const next = step(state);
    expect(next.routeChoices[4]).toBe(1);
    expect(next.talent.z).toBeGreaterThan(0);
  });
  it('lets Talent pass an Urchin by taking the selected fork branch without stalling', () => {
    const state = createState(7, []);
    state.path = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 2 }, { x: 3, z: 2 }, { x: 4, z: 2 }];
    state.forks = [{ at: 1, options: [{ x: 2, z: -2 }, { x: 2, z: 2 }] }];
    state.camera.x = 2; state.camera.z = 2; state.camera.zoom = 30;
    state.entities = [{ id: 'fork-urchin', kind: 'urchin', x: 2, z: -2, vx: -1.5, vz: 0, spawned: true, cut: false, age: 0 }];
    let next = state;
    for (let tick = 0; tick < 360 && !next.failed && next.talent.x <= 3; tick++) next = step(next);
    expect(next.routeChoices[1]).toBe(1);
    expect(next.failed).toBeNull();
    expect(next.talent.pathIndex).toBeGreaterThanOrEqual(3);
    expect(next.talent.x).toBeGreaterThan(3);
  });
  it('snaps Talent through a path node when already within the arrival tolerance', () => {
    const state = createState(1, []);
    state.path = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }];
    state.talent.x = 1 - 0.01;
    state.talent.pathIndex = 0;
    state.camera.x = 1;
    const next = step(state);
    expect(next.talent.pathIndex).toBe(1);
    expect(next.talent.x).toBe(1);
  });
  it('checks Glass floor under Talent in both world axes', () => {
    const state = createState(1, []);
    state.talent.x = 8; state.talent.z = 0;
    const glass = entity(state, 'glass', 8, 4); glass.cut = true;
    expect(step(state).failed).toBeNull();
    state.talent.z = 4;
    expect(step(state).failed).toBe('fell');
  });
  it('waits on missing set and burns film at double rate', () => {
    const state = createState(1, []); state.path = []; state.film = 10;
    const next = step(state);
    expect(next.waiting).toBe(true);
    expect(next.film).toBeCloseTo(10 - 2 / 60);
  });
  it('uses tier thresholds with hysteresis', () => {
    expect(lodTier(60)).toBe(0);
    expect(lodTier(30)).toBe(1);
    expect(lodTier(20)).toBe(2);
    expect(lodTier(6)).toBe(3);
    expect(lodTier(3)).toBe(4);
    expect(lodTier(42, 1)).toBe(1);
    expect(lodTier(19, 1)).toBe(2);
  });
  it('limits tier changes to two while zoom oscillates across a boundary', () => {
    let tier = lodTier(25);
    const changes: number[] = [];
    for (const size of Array.from({ length: 600 }, (_, i) => 24 + Math.sin(i * Math.PI / 30) * 2)) {
      const next = lodTier(size, tier);
      if (next !== tier) changes.push(next);
      tier = next;
    }
    expect(changes.length).toBeLessThanOrEqual(2);
  });
  it('keeps Talent tier and speed stable while zoom oscillates inside hysteresis', () => {
    let state = createState(1, []);
    const tiers = new Set<number>();
    for (const zoom of Array.from({ length: 120 }, (_, i) => 1000 / (24 + Math.sin(i * Math.PI / 20) * 2))) {
      state.camera.zoom = zoom;
      state = step(state, { ...NEUTRAL_INPUT, hold: true });
      tiers.add(state.talent.lodTier ?? -1);
    }
    expect(tiers.size).toBe(1);
  });
  it('keeps an Urchin to at most two tier flips during ten seconds of oscillating zoom', () => {
    let state = createState(1, []);
    state.entities = [{ id: 'oscillating-urchin', kind: 'urchin', x: 0, z: 4, vx: 0, vz: 0, spawned: true, cut: false, age: 0 }];
    let previousTier: number | undefined;
    let flips = 0;
    for (let tick = 0; tick < 600; tick++) {
      const screenSize = 24 + Math.sin(tick * Math.PI / 30) * 2;
      state.camera.zoom = 700 / screenSize;
      state = step(state, { ...NEUTRAL_INPUT, hold: true });
      const tier = state.entities[0]?.lodTier;
      if (previousTier !== undefined && tier !== previousTier) flips++;
      previousTier = tier;
    }
    expect(flips).toBeLessThanOrEqual(2);
  });
  it('consumes each spawn once and preserves seeded spawns', () => {
    expect(loadWorld(17)).toEqual(loadWorld(17));
    fc.assert(fc.property(fc.integer(), (seed) => {
      const state = createState(seed, loadWorld(seed));
      state.camera.zoom = 48;
      const first = step(state);
      const onceLoaded = first.entities.filter((item) => item.spawned);
      const away = { ...first, camera: { ...first.camera, x: 1000 } };
      const cut = step(away);
      const returned = step({ ...cut, camera: { ...cut.camera, x: 0 } });
      expect(returned.entities.filter((item) => item.spawned).length).toBe(onceLoaded.length);
      expect(new Set(first.consumed).size).toBe(first.consumed.length);
    }));
  });
  it('keeps every live CAST AABB overlapping the gate after a tick', () => {
    fc.assert(fc.property(fc.double({ min: -40, max: 40, noNaN: true }), fc.double({ min: -40, max: 40, noNaN: true }), fc.double({ min: 10, max: 48, noNaN: true }), (x, z, zoom) => {
      const state = createState(1, []);
      state.camera.zoom = zoom;
      state.entities = [{ id: 'prop', kind: 'glass', x, z, vx: 0, vz: 0, spawned: true, cut: false, age: 0 }];
      const next = step(state);
      for (const item of next.entities.filter((cast) => cast.spawned && !cast.cut)) {
        expect(inFrame(item.x, item.z, 0.55, next.camera.x, next.camera.z, next.camera.zoom, next.camera.yaw, 0.8)).toBe(true);
      }
    }));
  });
});

describe('fixed step simulation and failure rules', () => {
  it('replays the same 10,000 input ticks to the same hash for three seeds', () => {
    for (const seed of [1, 19, 2026]) {
      const frames = Array.from({ length: 10_000 }, (_, i) => ({ ...NEUTRAL_INPUT, panX: (i % 240 < 120 ? 30 : -30), zoom: i % 300 < 150 ? 0 : 1 }));
      let a = createState(seed); let b = createState(seed);
      for (const frame of frames) { a = step(a, frame); b = step(b, frame); }
      expect(stateHash(a)).toBe(stateHash(b));
    }
  }, 30_000);
  it('tweens rotation to the next 45 degree snap in the configured ticks', () => {
    let state = createState(1, []);
    state = step(state, { ...NEUTRAL_INPUT, rotate: 1 });
    const first = state.camera.yaw;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1);
    for (let i = 1; i < 11; i++) state = step(state);
    expect(state.camera.yaw).toBe(1);
    expect(state.camera.rotationTicksRemaining).toBe(0);
  });
  it('limits pan speed and zoom rate to the tuning values', () => {
    let state = createState(1, []);
    const initialX = state.camera.x;
    for (let i = 0; i < 60; i++) state = step(state, { ...NEUTRAL_INPUT, panX: 127 });
    const travelled = state.camera.x - initialX;
    expect(travelled).toBeLessThanOrEqual(30 * TUNING.panSpeed + 1e-6);
    expect(travelled).toBeGreaterThan(30 * TUNING.panSpeed * 0.7);
    state = createState(1, []);
    for (let i = 0; i < 60; i++) state = step(state, { ...NEUTRAL_INPUT, zoom: 127 });
    expect(state.camera.zoom).toBeCloseTo(30 / 1.6, 5);
  });
  it('fails after 60 fully off-screen ticks', () => {
    let state = createState(1, []); state.camera.x = 100;
    for (let i = 0; i < 59; i++) state = step(state);
    expect(state.failed).toBeNull();
    expect(step(state).failed).toBe('lost-talent');
  });
  it('fails on a lethal close urchin', () => {
    const state = createState(1, []); state.camera.zoom = 10; entity(state, 'urchin', 0.1);
    expect(step(state).failed).toBe('hit');
  });
  it('fails when crossing cut glass', () => {
    const state = createState(1, []); state.talent.x = 8;
    const glass = entity(state, 'glass', 8); glass.cut = true;
    expect(step(state).failed).toBe('fell');
  });
  it('checks every cut glass tile with both world coordinates', () => {
    const state = createState(1, []);
    const first = entity(state, 'glass', 20, 20); first.cut = true;
    const second = { ...first, id: 'second-glass', x: 0, z: 0, cut: true };
    state.entities = [first, second];
    expect(step(state).failed).toBe('fell');
  });
  it('fails when film runs out and burns at double rate on HOLD', () => {
    const state = createState(1, []); state.film = 0.01;
    expect(step(state).failed).toBe('out-of-film');
    const held = createState(1, []); held.film = 1;
    expect(step(held, { ...NEUTRAL_INPUT, hold: true }).film).toBeCloseTo(1 - 2 / 60);
  });
  it('fails at the end of the path (wrapped)', () => {
    const state = createState(1, []); state.talent.x = 160; state.talent.pathIndex = state.path.length - 2;
    expect(step(state).failed).toBe('wrapped');
  });
  it('wraps once the Talent reaches the terminal path index', () => {
    const state = createState(1, []);
    state.talent.pathIndex = state.path.length - 1;
    state.talent.x = state.path.at(-1)!.x - 0.001;
    state.camera.x = state.talent.x;
    expect(step(state).failed).toBe('wrapped');
  });
  it('thins an Extras crowd member by member when the frame clips its edges', () => {
    const state = createState(1, []);
    state.camera.zoom = 10;
    const extras = entity(state, 'extras', 5.5);
    extras.members = [-1.2, 0, 1.8].map((dx) => ({ dx, dz: 0, vx: 0, vz: 0, cut: false }));
    const next = step(state, { ...NEUTRAL_INPUT, hold: true });
    expect(next.entities[0]?.members?.map((member) => member.cut)).toEqual([false, true, true]);
  });
  it('turns Extras into a wall at wide zoom while close framing leaves walkable gaps', () => {
    const state = createState(1, []);
    const extras = entity(state, 'extras' as never, 0.2);
    extras.members = Array.from({ length: 6 }, (_, i) => ({ dx: (i % 3) * 0.25, dz: (Math.floor(i / 3) - 0.5) * 0.4, vx: 0, vz: 0, cut: false }));
    state.camera.zoom = 10;
    expect(step(state, { ...NEUTRAL_INPUT, hold: true }).failed).toBeNull();
    state.camera.zoom = 48;
    state.talent.lodTier = 2;
    expect(step(state, { ...NEUTRAL_INPUT, hold: true }).failed).toBe('hit');
  });
  it('size-culls Swarm below four logical pixels without consuming or cutting the cloud', () => {
    const state = createState(1, []);
    const swarm = entity(state, 'swarm', 4);
    swarm.spawned = false;
    state.camera.zoom = 21;
    const tooSmall = step(state, { ...NEUTRAL_INPUT, hold: true });
    expect(tooSmall.entities[0]?.spawned).toBe(false);
    expect(tooSmall.consumed).toEqual([]);
    tooSmall.camera.zoom = 18;
    const visible = step(tooSmall, { ...NEUTRAL_INPUT, hold: true });
    expect(visible.entities[0]?.spawned).toBe(true);
    visible.camera.zoom = 48;
    const hidden = step(visible, { ...NEUTRAL_INPUT, hold: true });
    expect(hidden.entities[0]?.cut).toBe(false);
    hidden.camera.zoom = 18;
    expect(step(hidden, { ...NEUTRAL_INPUT, hold: true }).entities[0]?.cut).toBe(false);
  });
  it('keeps visible Swarm lethal at every visible tier', () => {
    const state = createState(1, []);
    entity(state, 'swarm', 0.05);
    state.camera.zoom = 10;
    expect(step(state, { ...NEUTRAL_INPUT, hold: true }).failed).toBe('hit');
  });
  it('moves Stagehand only while the camera is in motion', () => {
    const state = createState(1, []);
    const stagehand = entity(state, 'stagehand', 5);
    let frozen = state;
    for (let i = 0; i < 12; i++) frozen = step(frozen, { ...NEUTRAL_INPUT, hold: true });
    expect(frozen.entities[0]?.x).toBe(5);
    let moving = state;
    for (let i = 0; i < 12; i++) moving = step(moving, { ...NEUTRAL_INPUT, panX: 127, hold: true });
    expect(moving.entities[0]?.x).toBeLessThan(stagehand.x);
  });
  it('lets a moving Stagehand steal a nearby Reel', () => {
    const state = createState(1, []);
    state.entities = [
      { id: 'stagehand-test', kind: 'stagehand', x: 2.2, z: 0, vx: 0, vz: 0, spawned: true, cut: false, age: 0 },
      { id: 'reel-test', kind: 'reel', x: 2.4, z: 0, vx: 0, vz: 0, spawned: true, cut: false, age: 0 },
    ];
    let moving = state;
    for (let i = 0; i < 12; i++) moving = step(moving, { ...NEUTRAL_INPUT, panX: 127, hold: true });
    expect(moving.entities.find((item) => item.kind === 'reel')?.cut).toBe(true);
    expect(moving.cuts).toContain('reel-test');
  });
  it('removes Rope bridge planks at wide zoom and fails on the unsupported span', () => {
    const state = createState(1, []);
    entity(state, 'bridge', 0.2);
    state.camera.zoom = 30;
    expect(step(state, { ...NEUTRAL_INPUT, hold: true }).failed).toBeNull();
    state.camera.zoom = 48;
    expect(step(state, { ...NEUTRAL_INPUT, hold: true }).failed).toBe('fell');
  });
  it('collects Reels at Talent Close or Medium tier only', () => {
    const state = createState(1, []);
    const reel = entity(state, 'reel', 0.8);
    state.camera.zoom = 30;
    const collected = step(state, { ...NEUTRAL_INPUT, hold: true });
    expect(collected.entities[0]?.cut).toBe(true);
    expect(collected.film).toBeCloseTo(90 + 15 - 2 / 60);
    expect(collected.score).toBe(100);
    state.camera.zoom = 48;
    state.talent.lodTier = 2;
    expect(step(state, { ...NEUTRAL_INPUT, hold: true }).entities[0]?.cut).toBe(false);
    expect(reel.kind).toBe('reel');
  });
  it('scores a hazard cut inside the close-call radius', () => {
    const state = createState(1, []);
    entity(state, 'urchin', 1.2);
    state.camera.x = 30;
    const next = step(state, { ...NEUTRAL_INPUT, hold: true });
    expect(next.cuts).toContain('urchin-test');
    expect(next.closeCalls).toBe(1);
    expect(next.score).toBe(TUNING.closeCallScore);
  });
  it('holds the Talent for a wide shot, then for a medium portrait', () => {
    const state = createGeneratedState(3, 0, 4);
    state.talent.x = state.shots![0]!.at;
    state.camera.x = state.talent.x;
    state.camera.zoom = 24;
    const held = step(state, { ...NEUTRAL_INPUT, hold: false });
    expect(held.waiting).toBe(true);
    expect(held.talent.x).toBeCloseTo(state.talent.x);
    held.camera.zoom = 40;
    const wide = step(held);
    expect(wide.shots?.find((shot) => shot.kind === 'defang')?.done).toBe(true);
    const portrait = wide.shots!.find((shot) => shot.kind === 'portrait')!;
    wide.talent.x = portrait.at;
    wide.camera.zoom = 48;
    const stillWide = step(wide);
    expect(stillWide.waiting).toBe(true);
    stillWide.camera.zoom = 24;
    const released = step(stillWide);
    expect(released.shots?.every((shot) => shot.done)).toBe(true);
    expect(released.waiting).toBe(false);
  });
  it('keeps a fragile floor that is only just outside the gate', () => {
    const state = createState(1, []);
    state.camera.zoom = 30;
    entity(state, 'glass', 16.2);
    const next = step(state, { ...NEUTRAL_INPUT, hold: true });
    expect(next.entities[0]?.cut).toBe(false);
    next.camera.x = -20;
    expect(step(next, { ...NEUTRAL_INPUT, hold: true }).entities[0]?.cut).toBe(true);
  });
  it('crushes the Talent with a close boulder and lets a medium boulder pass', () => {
    const close = createState(1, []);
    close.camera.zoom = 10;
    entity(close, 'boulder', 0.2);
    expect(step(close, { ...NEUTRAL_INPUT, hold: true }).failed).toBe('hit');
    const medium = createState(1, []);
    medium.camera.zoom = 24;
    entity(medium, 'boulder', 0.2);
    expect(step(medium, { ...NEUTRAL_INPUT, hold: true }).failed).toBeNull();
  });
  it('places a defang gate before the portrait gate', () => {
    const shots = shotListForPath([{ x: 0 }, { x: 100 }]);
    expect(shots[0]?.kind).toBe('defang');
    expect(shots[1]!.at).toBeGreaterThan(shots[0]!.at);
  });
  it('preserves projected frame invariants for arbitrary nearby bounds', () => {
    fc.assert(fc.property(fc.double({ min: -10, max: 10, noNaN: true }), fc.double({ min: -10, max: 10, noNaN: true }), (x, z) => {
      const projected = projectedAabb(x, z, 0.5, 1, 0, 0, 30, 0);
      expect(overlapsFrame(projected)).toBe(inFrame(x, z, 0.5, 0, 0, 30));
    }));
  });
});
