import { describe, expect, it } from 'vitest';
import { createShootState, stepShoot } from '../src/sim/shoot';
import { NEUTRAL_INPUT, step } from '../src/sim/step';
import { createState } from '../src/sim/world';
import type { CastEntity } from '../src/sim/types';

describe('M6 simulation integration', () => {
  it('lets an ally Monitor keep a CAST spawn alive inside its cone outside the camera gate', () => {
    const monitor: CastEntity = { id: 'ally', kind: 'monitor', x: 20, z: 0, vx: 0, vz: 0, spawned: true, cut: false, age: 0, heading: 0, range: 10, halfAngle: 0.4 };
    const glass: CastEntity = { id: 'glass-in-cone', kind: 'glass', x: 25, z: 0, vx: 0, vz: 0, spawned: false, cut: false, age: 0 };
    const state = createState(1, [monitor, glass]);
    state.camera.zoom = 10;
    expect(step(state).entities.find((entity) => entity.id === glass.id)?.spawned).toBe(true);
  });

  it('lets an in-frame Red Monitor cut Talent through its cone', () => {
    const hostile: CastEntity = { id: 'red', kind: 'red-monitor', x: 0, z: 0, vx: 0, vz: 0, spawned: true, cut: false, age: 0, heading: 0, range: 5, halfAngle: 0.4 };
    const state = createState(1, [hostile]);
    expect(step(state).failed).toBe('hit');
    state.camera.x = 100;
    expect(step(state).failed).toBeNull();
  });

  it('grows an unseen Rumour ledger without cutting the entity', () => {
    const rumour: CastEntity = { id: 'rumour', kind: 'rumour', x: 100, z: 100, vx: 0, vz: 0, spawned: true, cut: false, age: 0, radius: 2 };
    const state = createState(1, [rumour]);
    const next = step(state);
    expect(next.entities[0]?.radius).toBeCloseTo(2.005);
    expect(next.entities[0]?.cut).toBe(false);
  });

  it('advances the Continuity Prop when it leaves the gate and re-enters on demand', () => {
    const prop: CastEntity = { id: 'prop', kind: 'continuity', x: 5, z: 0, vx: 0, vz: 0, spawned: true, cut: false, age: 0, propIndex: 2 };
    const state = createState(1, [prop]);
    state.camera.x = 100;
    const hidden = step(state).entities[0]!;
    expect(hidden.spawned).toBe(false);
    expect(hidden.propIndex).toBe(3);
    const returned = step({ ...state, camera: { ...state.camera, x: 0 }, entities: [hidden] }).entities[0]!;
    expect(returned.spawned).toBe(true);
    expect(returned.cut).toBe(false);
  });

  it('stitches Backlot, Miniature City, Night Shoot, then a 40-second Long Take', () => {
    let state = createShootState(51);
    state.totalDistance = 123;
    const names = ['BACKLOT', 'MINIATURE CITY', 'NIGHT SHOOT', 'LONG TAKE'];
    for (let scene = 0; scene < 3; scene++) {
      expect(state.shoot?.biome).toBe(names[scene]);
      state.talent.pathIndex = state.path.length - 1;
      state.talent.x = state.path.at(-1)!.x;
      state = stepShoot(state, NEUTRAL_INPUT);
      expect(state.failed).toBeNull();
      expect(state.shoot?.sceneIndex).toBe(scene + 1);
      expect(state.totalDistance).toBe(123);
      expect(state.film).toBeCloseTo(90 + 30 * (scene + 1) - 2 * (scene + 1) / 60, 5);
    }
    expect(state.shoot?.biome).toBe('LONG TAKE');
    state.shoot!.finaleTicks = 40 * 60 - 1;
    state.shoot!.wrapDistance = 0;
    state.travelDistance = 100;
    state.talent.x = 100;
    state = stepShoot(state, NEUTRAL_INPUT);
    expect(state.failed).toBe('wrapped');
  });

  it('starts the Long Take Wrap twelve path-units behind Talent', () => {
    const state = createShootState(17);
    state.shoot!.sceneIndex = 3;
    state.shoot!.biome = 'LONG TAKE';
    state.entities = [];
    state.talent.x = state.path[0]!.x;
    state.talent.z = state.path[0]!.z;
    state.talent.pathIndex = 0;
    state.travelDistance = 0;
    const next = stepShoot(state, NEUTRAL_INPUT);
    expect(next.shoot?.wrapCaught).toBe(false);
    expect(next.shoot?.wrapDistance).toBeLessThan(0);
    expect(next.failed).toBeNull();
  });
});
