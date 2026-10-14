import { Ambience } from './ambience';
import { audibleSourceIds } from './sources';
import { lodTier } from '../sim/lod';
import { TUNING } from '../sim/tuning';
import type { SimState } from '../sim/types';

type Voice = { oscillator: OscillatorNode; gain: GainNode; panner: StereoPannerNode; filter: BiquadFilterNode; };
export interface AudioSettings { master: number; music: number; sfx: number; mono: boolean; calm: boolean; muted: boolean; }
const frequencies: Record<string, number> = { talent: 220, urchin: 82, boulder: 54, glass: 660, reel: 1320, extras: 174, swarm: 940, stagehand: 112, bridge: 330, rumour: 63, monitor: 460, 'red-monitor': 780, continuity: 250 };

/** Lazily starts WebAudio on a user gesture and mirrors the sim's current audible source set. */
export class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private currentSettings: AudioSettings = { master: 1, music: 0.8, sfx: 0.8, mono: false, calm: false, muted: false };
  private ambience: Ambience | null = null;
  private lastLockBeep = 0;
  private readonly voices = new Map<string, Voice>();
  private readonly active = new Set<string>();
  private lastUpdate = 0;
  private pulse: { oscillator: OscillatorNode; gain: GainNode } | null = null;
  private lastBeat = -1;
  constructor(private readonly contextFactory: () => AudioContext = () => new AudioContext()) {}

  get started() { return this.context !== null; }
  get activeSourceIds() { return [...this.active].sort(); }
  get settings(): AudioSettings { return { ...this.currentSettings }; }

  setSettings(settings: Partial<AudioSettings>) {
    const volume = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
    this.currentSettings = {
      master: settings.master === undefined ? this.currentSettings.master : volume(settings.master),
      music: settings.music === undefined ? this.currentSettings.music : volume(settings.music),
      sfx: settings.sfx === undefined ? this.currentSettings.sfx : volume(settings.sfx),
      mono: settings.mono ?? this.currentSettings.mono,
      calm: settings.calm ?? this.currentSettings.calm,
      muted: settings.muted ?? this.currentSettings.muted,
    };
    const now = this.context?.currentTime ?? 0;
    if (this.master) this.master.gain.setTargetAtTime(this.masterLevel(), now, 0.04);
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.currentSettings.music, now, 0.04);
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(this.currentSettings.sfx, now, 0.04);
  }

  async startFromGesture() {
    if (this.context) return;
    this.context = this.contextFactory();
    this.master = this.context.createGain();
    this.musicBus = this.context.createGain();
    this.sfxBus = this.context.createGain();
    this.master.gain.value = this.masterLevel();
    this.musicBus.gain.value = this.currentSettings.music;
    this.sfxBus.gain.value = this.currentSettings.sfx;
    this.master.connect(this.context.destination);
    this.musicBus.connect(this.master); this.sfxBus.connect(this.master);
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = 64; gain.gain.value = 0;
    oscillator.connect(gain); gain.connect(this.musicBus!); oscillator.start();
    this.pulse = { oscillator, gain };
    this.ambience = new Ambience(this.context, this.musicBus);
    await this.context.resume();
  }

  update(state: SimState) {
    const ids = audibleSourceIds(state);
    this.active.clear(); ids.forEach((id) => this.active.add(id));
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.ambience?.setScene(state.shoot?.sceneIndex ?? 0);
    this.ambience?.tick();
    const beat = Math.floor(state.tick * 96 / (TUNING.tickRate * 60));
    if (beat > this.lastBeat && this.pulse) {
      this.lastBeat = beat;
      this.pulse.gain.gain.cancelScheduledValues(now);
      this.pulse.gain.gain.setValueAtTime(0.001, now);
      this.pulse.gain.gain.exponentialRampToValueAtTime(0.04 * (this.currentSettings.calm ? 0.5 : 1), now + 0.015);
      this.pulse.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    }
    if (now - this.lastUpdate < 0.1) return;
    this.lastUpdate = now;
    const next = new Set(ids);
    for (const id of ids) {
      const entity = id === 'talent' ? undefined : state.entities.find((candidate) => candidate.id === id);
      let voice = this.voices.get(id);
      if (voice?.oscillator.onended) voice = undefined;
      if (!voice) {
        const oscillator = this.context.createOscillator();
        const filter = this.context.createBiquadFilter();
        const panner = this.context.createStereoPanner();
        const gain = this.context.createGain();
        oscillator.type = id === 'swarm' ? 'square' : id === 'rumour' ? 'sawtooth' : 'sine';
        oscillator.frequency.value = frequencies[entity?.kind ?? 'talent'] ?? 180;
        filter.type = 'lowpass';
        oscillator.connect(filter); filter.connect(panner); panner.connect(gain); gain.connect(this.musicBus!);
        gain.gain.value = 0;
        oscillator.start();
        voice = { oscillator, gain, panner, filter };
        this.voices.set(id, voice);
      }
      const tier = entity ? lodTier((entity.radius ?? 0.6) * 1000 / state.camera.zoom, entity.lodTier) : lodTier(1000 / state.camera.zoom, state.talent.lodTier);
      const cutoff = [8000, 4200, 1500, 800, 300][tier] ?? 800;
      const pan = entity ? Math.max(-1, Math.min(1, (entity.x - state.camera.x) / (state.camera.zoom / 2))) : Math.max(-1, Math.min(1, (state.talent.x - state.camera.x) / (state.camera.zoom / 2)));
      voice.filter.frequency.setTargetAtTime(cutoff, now, 0.06);
      voice.panner.pan.setTargetAtTime(this.currentSettings.mono ? 0 : pan, now, 0.06);
      voice.gain.gain.setTargetAtTime(0.035 * (this.currentSettings.calm ? 0.5 : 1), now, 0.04);
      voice.filter.frequency.setTargetAtTime(cutoff * (this.currentSettings.calm ? 0.65 : 1), now, 0.06);
    }
    for (const [id, voice] of this.voices) {
      if (next.has(id)) continue;
      voice.gain.gain.setTargetAtTime(0, now, 0.08);
      if (voice.oscillator.onended === null) {
        voice.oscillator.stop(now + 2);
        voice.oscillator.onended = () => {
          voice.oscillator.disconnect(); voice.filter.disconnect(); voice.panner.disconnect(); voice.gain.disconnect();
          if (this.voices.get(id) === voice) this.voices.delete(id);
        };
      }
    }
  }

  playCue(name: 'cut' | 'clack' | 'dud' | 'pop' | 'reel' | 'lod' | 'wrap') {
    if (!this.context || !this.master || !this.sfxBus) return;
    if (name === 'dud') { this.playDud(); return; }
    this.ambience?.duckFor();
    if (name === 'cut') { this.playSplice(); return; }
    if (name === 'clack') { this.playClack(); return; }
    const frequenciesByCue = { pop: [220, 880], reel: [520, 1040], lod: [900, 240], wrap: [90, 440] };
    const [from, to] = frequenciesByCue[name];
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = name === 'wrap' ? 'sawtooth' : 'triangle';
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + 0.16);
    gain.gain.setValueAtTime(0.08 * (this.currentSettings.calm ? 0.5 : 1), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    oscillator.connect(gain); gain.connect(this.sfxBus);
    oscillator.start(now); oscillator.stop(now + 0.25);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  private masterLevel() { return this.currentSettings.muted ? 0 : 0.15 * this.currentSettings.master; }

  /** Hostile-camera tally beep: a short rising chirp whose pitch climbs with lock progress (0..1). Rate-limited by the caller's blink. */
  playLockBeep(progress: number) {
    if (!this.context || !this.sfxBus) return;
    const now = this.context.currentTime;
    if (now - this.lastLockBeep < 0.05) return;
    this.lastLockBeep = now;
    this.ambience?.duckFor(0.2);
    const p = Math.max(0, Math.min(1, progress));
    const from = 620 + 700 * p;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(from * 1.35, now + 0.06);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05 * (this.currentSettings.calm ? 0.5 : 1), now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    oscillator.connect(gain); gain.connect(this.sfxBus);
    oscillator.start(now); oscillator.stop(now + 0.08);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  /** Tape splice: a noise snip plus a short low thump. Presentation only. */
  private playSplice() {
    if (!this.context || !this.sfxBus) return;
    const now = this.context.currentTime;
    const duration = 0.07;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const envelope = 1 - i / length;
      data[i] = (Math.random() * 2 - 1) * envelope * envelope;
    }
    const noise = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    noise.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 900;
    gain.gain.setValueAtTime(0.35 * (this.currentSettings.calm ? 0.45 : 1), now);
    noise.connect(filter); filter.connect(gain); gain.connect(this.sfxBus);
    noise.start(now);
    const thump = this.context.createOscillator();
    const thumpGain = this.context.createGain();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(180, now);
    thump.frequency.exponentialRampToValueAtTime(50, now + 0.08);
    thumpGain.gain.setValueAtTime(0.2 * (this.currentSettings.calm ? 0.45 : 1), now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    thump.connect(thumpGain); thumpGain.connect(this.sfxBus);
    thump.start(now); thump.stop(now + 0.14);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
    thump.onended = () => { thump.disconnect(); thumpGain.disconnect(); };
  }

  /** A short band-passed noise click at `at`, the building block of the shutter clack. */
  private click(at: number, frequency: number, level: number, duration = 0.012) {
    if (!this.context || !this.sfxBus) return;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    const noise = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    noise.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 1.4;
    gain.gain.value = level * (this.currentSettings.calm ? 0.45 : 1);
    noise.connect(filter); filter.connect(gain); gain.connect(this.sfxBus);
    noise.start(at);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  /** Shutter clack: blade open, a body thump, blade close 45 ms later. Presentation only. */
  private playClack() {
    if (!this.context || !this.sfxBus) return;
    const now = this.context.currentTime;
    this.click(now, 3200, 0.7);
    this.click(now + 0.045, 2200, 0.55, 0.018);
    const body = this.context.createOscillator();
    const bodyGain = this.context.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(140, now);
    body.frequency.exponentialRampToValueAtTime(60, now + 0.07);
    bodyGain.gain.setValueAtTime(0.22 * (this.currentSettings.calm ? 0.45 : 1), now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    body.connect(bodyGain); bodyGain.connect(this.sfxBus);
    body.start(now); body.stop(now + 0.12);
    body.onended = () => { body.disconnect(); bodyGain.disconnect(); };
  }

  /** A press while the shutter recharges: one dull, muffled click. */
  private playDud() {
    if (!this.context) return;
    this.click(this.context.currentTime, 420, 0.5, 0.02);
  }
}
