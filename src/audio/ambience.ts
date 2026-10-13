/**
 * Per-set room tone, synthesised with WebAudio (no asset files). Presentation only: it reads the scene index
 * and never touches the sim. Each set owns one gain node; switching sets crossfades them.
 */
type Scheduler = { next: number; fire: (at: number) => number };
interface SetBed { gain: GainNode; schedulers: Scheduler[]; }

const CROSSFADE = 1.2;

export class Ambience {
  readonly output: GainNode;
  private readonly duck: GainNode;
  private readonly beds: SetBed[] = [];
  private active = -1;
  private readonly noise: AudioBuffer;
  private readonly brown: AudioBuffer;

  constructor(private readonly context: AudioContext, destination: AudioNode) {
    this.output = context.createGain();
    this.duck = context.createGain();
    this.output.gain.value = 0.9;
    this.output.connect(this.duck); this.duck.connect(destination);
    this.noise = this.makeNoise(false);
    this.brown = this.makeNoise(true);
    this.beds = [this.backlot(), this.city(), this.night()];
  }

  /** Crossfades to the bed for a scene. Long Take reuses the Backlot room. */
  setScene(sceneIndex: number) {
    const index = sceneIndex === 1 ? 1 : sceneIndex === 2 ? 2 : 0;
    if (index === this.active) return;
    const now = this.context.currentTime;
    this.beds.forEach((bed, i) => {
      bed.gain.gain.cancelScheduledValues(now);
      bed.gain.gain.setTargetAtTime(i === index ? 1 : 0, now, CROSSFADE / 3);
      bed.schedulers.forEach((scheduler) => { scheduler.next = Math.max(scheduler.next, now + 0.3); });
    });
    this.active = index;
  }

  /** Schedules the next one-shot events (clanks, horns, chirps) for the active set a short way ahead. */
  tick() {
    const bed = this.beds[this.active];
    if (!bed) return;
    const horizon = this.context.currentTime + 0.25;
    for (const scheduler of bed.schedulers) {
      let guard = 0;
      while (scheduler.next < horizon && guard++ < 8) scheduler.next = scheduler.fire(Math.max(scheduler.next, this.context.currentTime));
    }
  }

  /** Sits the bed under a sound effect for a moment. */
  duckFor(seconds = 0.35) {
    const now = this.context.currentTime;
    this.duck.gain.cancelScheduledValues(now);
    this.duck.gain.setTargetAtTime(0.3, now, 0.02);
    this.duck.gain.setTargetAtTime(1, now + seconds, 0.25);
  }

  private makeNoise(brown: boolean) {
    const length = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; } else data[i] = white;
    }
    return buffer;
  }

  private bed(): GainNode {
    const gain = this.context.createGain();
    gain.gain.value = 0;
    gain.connect(this.output);
    return gain;
  }

  /** A looping noise source through one filter, with an optional slow wobble on its level. */
  private loop(bed: GainNode, buffer: AudioBuffer, type: BiquadFilterType, frequency: number, q: number, level: number, wobble = 0, rate = 0.2) {
    const source = this.context.createBufferSource();
    source.buffer = buffer; source.loop = true;
    source.loopStart = Math.random();
    const filter = this.context.createBiquadFilter();
    filter.type = type; filter.frequency.value = frequency; filter.Q.value = q;
    const gain = this.context.createGain();
    gain.gain.value = level;
    source.connect(filter); filter.connect(gain); gain.connect(bed);
    if (wobble) {
      const lfo = this.context.createOscillator();
      const depth = this.context.createGain();
      lfo.frequency.value = rate; depth.gain.value = wobble;
      lfo.connect(depth); depth.connect(gain.gain); lfo.start();
    }
    source.start(0, source.loopStart);
  }

  private tone(bed: GainNode, type: OscillatorType, frequency: number, level: number) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency; gain.gain.value = level;
    oscillator.connect(gain); gain.connect(bed); oscillator.start();
  }

  /** One enveloped blip: oscillator → optional lowpass → panner → bed. */
  private blip(bed: GainNode, at: number, type: OscillatorType, frequency: number, level: number, attack: number, decay: number, pan = 0, cutoff = 0, glide = 1) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (glide !== 1) oscillator.frequency.exponentialRampToValueAtTime(frequency * glide, at + attack + decay);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    panner.pan.value = pan;
    let head: AudioNode = oscillator;
    if (cutoff) {
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = cutoff;
      oscillator.connect(filter); head = filter;
    }
    head.connect(gain); gain.connect(panner); panner.connect(bed);
    oscillator.start(at); oscillator.stop(at + attack + decay + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); head.disconnect(); gain.disconnect(); panner.disconnect(); };
  }

  /** A short filtered noise burst (paper rustle). */
  private rustle(bed: GainNode, at: number, level: number, duration: number, pan: number) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    source.buffer = this.noise;
    filter.type = 'bandpass'; filter.frequency.value = 2600 + Math.random() * 2400; filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + duration * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    panner.pan.value = pan;
    source.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(bed);
    source.start(at, Math.random()); source.stop(at + duration + 0.02);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); panner.disconnect(); };
  }

  private backlot(): SetBed {
    const gain = this.bed();
    this.loop(gain, this.brown, 'lowpass', 320, 0.7, 0.5);
    // Crew murmur: two voice-band noise beds breathing out of step.
    this.loop(gain, this.noise, 'bandpass', 420, 2.2, 0.05, 0.035, 0.31);
    this.loop(gain, this.noise, 'bandpass', 690, 2.8, 0.03, 0.022, 0.47);
    const clank: Scheduler = {
      next: 0,
      fire: (at) => {
        const base = 900 + Math.random() * 900;
        const pan = Math.random() * 1.6 - 0.8;
        this.blip(gain, at, 'triangle', base, 0.05, 0.003, 0.35, pan);
        this.blip(gain, at, 'sine', base * 2.76, 0.025, 0.002, 0.18, pan);
        if (Math.random() < 0.5) this.blip(gain, at + 0.12, 'triangle', base * 1.1, 0.03, 0.003, 0.25, pan);
        return at + 2.5 + Math.random() * 5;
      },
    };
    return { gain, schedulers: [clank] };
  }

  private city(): SetBed {
    const gain = this.bed();
    this.loop(gain, this.brown, 'lowpass', 500, 0.7, 0.22);
    const paper: Scheduler = {
      next: 0,
      fire: (at) => { this.rustle(gain, at, 0.05 + Math.random() * 0.05, 0.08 + Math.random() * 0.25, Math.random() * 1.4 - 0.7); return at + 0.25 + Math.random() * 1.4; },
    };
    const horn: Scheduler = {
      next: 0,
      fire: (at) => {
        const pitch = 480 + Math.random() * 260;
        const pan = Math.random() * 1.6 - 0.8;
        for (let i = 0; i < (Math.random() < 0.4 ? 2 : 1); i++) {
          this.blip(gain, at + i * 0.18, 'square', pitch, 0.018, 0.01, 0.12, pan, 1800);
          this.blip(gain, at + i * 0.18, 'square', pitch * 1.26, 0.014, 0.01, 0.12, pan, 1800);
        }
        return at + 4 + Math.random() * 6;
      },
    };
    const putter: Scheduler = {
      next: 0,
      fire: (at) => {
        // A wind-up toy car crossing: a train of low putts panning across.
        const from = Math.random() < 0.5 ? -0.9 : 0.9;
        const count = 18 + Math.floor(Math.random() * 10);
        for (let i = 0; i < count; i++) {
          const t = i / count;
          const swell = Math.sin(t * Math.PI);
          this.blip(gain, at + i * 0.085, 'square', 70 + Math.random() * 8, 0.004 + 0.03 * swell, 0.004, 0.05, from * (1 - 2 * t), 420);
        }
        return at + 6 + Math.random() * 7;
      },
    };
    return { gain, schedulers: [paper, horn, putter] };
  }

  private night(): SetBed {
    const gain = this.bed();
    this.loop(gain, this.brown, 'lowpass', 220, 0.7, 0.25);
    // Sodium lamp hum: mains fundamental, harmonics and a little buzz.
    this.tone(gain, 'sine', 60, 0.03);
    this.tone(gain, 'sine', 120, 0.022);
    this.tone(gain, 'triangle', 180, 0.006);
    this.loop(gain, this.noise, 'bandpass', 120, 6, 0.008);
    const cricket = (pitch: number, pan: number): Scheduler => ({
      next: Math.random(),
      fire: (at) => {
        const pulses = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < pulses; i++) this.blip(gain, at + i * 0.045, 'sine', pitch, 0.012, 0.006, 0.03, pan);
        return at + 0.55 + Math.random() * 0.7;
      },
    });
    return { gain, schedulers: [cricket(4300, -0.6), cricket(4750, 0.5), cricket(5100, 0.1)] };
  }
}
