import { describe, expect, it } from 'vitest';
import { AudioDirector } from '../src/audio/director';
import { audibleSourceIds } from '../src/audio/sources';
import { createState } from '../src/sim/world';
import type { CastEntity } from '../src/sim/types';

describe('diegetic audio rules', () => {
  it('matches the active audio source set to in-frame entities and Talent', () => {
    const cast: CastEntity[] = [
      { id: 'visible', kind: 'glass', x: 0, z: 0, vx: 0, vz: 0, spawned: true, cut: false, age: 0 },
      { id: 'offscreen', kind: 'boulder', x: 100, z: 100, vx: 0, vz: 0, spawned: true, cut: false, age: 0 },
      { id: 'cut', kind: 'reel', x: 0, z: 1, vx: 0, vz: 0, spawned: true, cut: true, age: 0 },
      { id: 'preview', kind: 'urchin', x: 1, z: 0, vx: 0, vz: 0, spawned: false, cut: false, age: 0 },
    ];
    const state = createState(1, cast);
    const expected = ['talent', 'visible'];
    expect(audibleSourceIds(state)).toEqual(expected);
    const director = new AudioDirector(() => { throw new Error('AudioContext must remain lazy before a gesture'); });
    director.update(state);
    expect(director.activeSourceIds).toEqual(expected);
    expect(director.started).toBe(false);
  });

  it('lets an ally Monitor cone keep a hidden entity audible', () => {
    const cast: CastEntity[] = [
      { id: 'monitor', kind: 'monitor', x: 30, z: 0, vx: 0, vz: 0, spawned: true, cut: false, age: 0, heading: Math.PI, range: 12, halfAngle: 0.5 },
      { id: 'watched', kind: 'glass', x: 20, z: 0, vx: 0, vz: 0, spawned: true, cut: false, age: 0 },
    ];
    const state = createState(1, cast);
    state.talent.x = -20;
    expect(audibleSourceIds(state)).toEqual(['watched']);
  });

  it('stores clamped sound settings before audio starts', () => {
    const director = new AudioDirector(() => { throw new Error('AudioContext must remain lazy before a gesture'); });
    director.setSettings({ master: 1.2, music: -1, mono: true, calm: true });
    expect(director.settings).toEqual({ master: 1, music: 0, sfx: 0.8, mono: true, calm: true, muted: false });
    expect(director.started).toBe(false);
  });
});
