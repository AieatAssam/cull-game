import { audibleSourceIds } from './sources';
import { lodTier } from '../sim/lod';
import { TUNING } from '../sim/tuning';
import type { SimState } from '../sim/types';

type Voice = { oscillator: OscillatorNode; gain: GainNode; panner: StereoPannerNode; filter: BiquadFilterNode; };
export interface AudioSettings { master: number; music: number; sfx: number; mono: boolean; calm: boolean; }
const frequencies: Record<string, number> = { talent: 220, urchin: 82, boulder: 54, glass: 660, reel: 1320, extras: 174, swarm: 940, stagehand: 112, bridge: 330, rumour: 63, monitor: 460, 'red-monitor': 780, continuity: 250 };

/** Lazily starts WebAudio on a user gesture and mirrors the sim's current audible source set. */
export class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private currentSettings: AudioSettings = { master: 1, music: 0.8, sfx: 0.8, mono: false, calm: false };
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
    };
    const now = this.context?.currentTime ?? 0;
    if (this.master) this.master.gain.setTargetAtTime(0.15 * this.currentSettings.master, now, 0.04);
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.currentSettings.music, now, 0.04);
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(this.currentSettings.sfx, now, 0.04);
  }

  async startFromGesture() {
    if (this.context) return;
    this.context = this.contextFactory();
    this.master = this.context.createGain();
    this.musicBus = this.context.createGain();
    this.sfxBus = this.context.createGain();
    this.master.gain.value = 0.15 * this.currentSettings.master;
    this.musicBus.gain.value = this.currentSettings.music;
    this.sfxBus.gain.value = this.currentSettings.sfx;
    this.master.connect(this.context.destination);
    this.musicBus.connect(this.master); this.sfxBus.connect(this.master);
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = 64; gain.gain.value = 0;
    oscillator.connect(gain); gain.connect(this.musicBus!); oscillator.start();
    this.pulse = { oscillator, gain };
    await this.context.resume();
  }

  update(state: SimState) {
    const ids = audibleSourceIds(state);
    this.active.clear(); ids.forEach((id) => this.active.add(id));
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
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

  playCue(name: 'cut' | 'pop' | 'reel' | 'lod' | 'wrap') {
    if (!this.context || !this.master || !this.sfxBus) return;
    const frequenciesByCue = { cut: [740, 180], pop: [220, 880], reel: [520, 1040], lod: [900, 240], wrap: [90, 440] };
    const [from, to] = frequenciesByCue[name];
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = name === 'wrap' ? 'sawtooth' : 'triangle';
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + (name === 'cut' ? 0.06 : 0.16));
    gain.gain.setValueAtTime(0.08 * (this.currentSettings.calm ? 0.5 : 1), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (name === 'cut' ? 0.12 : 0.24));
    oscillator.connect(gain); gain.connect(this.sfxBus);
    oscillator.start(now); oscillator.stop(now + 0.25);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
}
