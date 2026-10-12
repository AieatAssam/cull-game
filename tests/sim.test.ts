import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { projectWithRenderer, projectWithSimulation, updateRenderCamera } from '../src/render/camera';
import fc from 'fast-check';
import { inFrame, projectedAabb, overlapsFrame } from '../src/sim/frame';
import { stateHash } from '../src/sim/hash';
import { lodTier } from '../src/sim/lod';
import { step, NEUTRAL_INPUT } from '../src/sim/step';
import { createState, loadWorld, reloadSet } from '../src/sim/world';
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
  it('counts partial projected AABB overlap as in frame', () => {
    const bounds = projectedAabb(15.1, 0, 1, 1, 0, 0, 30, 0);
    expect(overlapsFrame(bounds)).toBe(true);
    expect(inFrame(15.1, 0, 1, 0, 0, 30)).toBe(true);
    expect(inFrame(18, 0, 0.2, 0, 0, 30)).toBe(false);
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
  it('chooses the fork branch that points toward the gate centre', () => {
    const state = createState(1, []);
    state.talent.x = 8; state.talent.pathIndex = 4;
    state.camera.x = 8; state.camera.z = 10;
    const next = step(state);
    expect(next.routeChoices[4]).toBe(1);
    expect(next.talent.z).toBeGreaterThan(0);
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
    expect(state.camera.x - initialX).toBeLessThanOrEqual(30 * 1.2 + 1e-6);
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
  it('preserves projected frame invariants for arbitrary nearby bounds', () => {
    fc.assert(fc.property(fc.double({ min: -10, max: 10, noNaN: true }), fc.double({ min: -10, max: 10, noNaN: true }), (x, z) => {
      const projected = projectedAabb(x, z, 0.5, 1, 0, 0, 30, 0);
      expect(overlapsFrame(projected)).toBe(inFrame(x, z, 0.5, 0, 0, 30));
    }));
  });
});
