import { config } from '../core/Config';
import { instrumentGain, pitchedInstruments, playInstrument, type Voice } from './instruments';
import { noteToFreq } from './notes';
import type { NoteEvent, NotePlayer } from './types';

/**
 * Web Audio back end. Notes are scheduled on the audio clock at the exact
 * simulation time of the contact plus a small lead, so timing is as steady as
 * the physics itself rather than as jittery as the frame loop.
 *
 * Browsers only allow sound after a user gesture; call `unlock()` from a tap.
 */
export class AudioEngine implements NotePlayer {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly noise: AudioBuffer;
  private readonly roll: { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode };
  /** audio time - simulation time, smoothed. */
  private offset = NaN;
  private seed = 12345;

  constructor() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = config.audio.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    this.master.connect(comp).connect(ctx.destination);

    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.wet = ctx.createGain();
    this.wet.gain.value = config.audio.reverb;
    const reverb = ctx.createConvolver();
    reverb.buffer = this.makeImpulse(2.2, 2.8);
    this.wet.connect(reverb).connect(this.master);

    this.noise = this.makeNoise(2);

    // Rolling sound: looping noise whose brightness and level follow the marble.
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.dry);
    source.start();
    this.roll = { source, filter, gain };
  }

  /** Gain buses of chords scheduled or sounding, so a reset can cut them. */
  private chords: GainNode[] = [];

  get unlocked(): boolean {
    return this.ctx.state === 'running';
  }

  async unlock(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.decodeClip();
  }

  /** Call every frame with the current simulation time to keep the clocks aligned. */
  syncClock(simTime: number): void {
    const now = this.ctx.currentTime;
    const measured = now - simTime;
    if (!Number.isFinite(this.offset) || Math.abs(measured - this.offset) > 0.15) this.offset = measured;
    else this.offset += (measured - this.offset) * 0.05;
  }

  applyConfig(): void {
    this.master.gain.setTargetAtTime(config.audio.muted ? 0 : config.audio.volume, this.ctx.currentTime, 0.02);
    this.wet.gain.setTargetAtTime(config.audio.reverb, this.ctx.currentTime, 0.05);
  }

  play(event: NoteEvent): void {
    if (!this.unlocked) return;
    const ctx = this.ctx;
    const lead = config.audio.leadSeconds;
    let time = Number.isFinite(this.offset) ? event.simTime + this.offset + lead : ctx.currentTime + lead;
    if (time < ctx.currentTime + 0.005) time = ctx.currentTime + 0.005;

    const freq = pitchedInstruments.has(event.instrument) && event.note ? noteToFreq(event.note) : 220;
    const out = ctx.createGain();
    out.gain.value = instrumentGain[event.instrument] ?? 0.8;
    out.connect(this.dry);
    out.connect(this.wet);
    const voice: Voice = {
      ctx,
      out,
      time,
      freq: freq * (1 + (this.random() - 0.5) * 0.004),
      velocity: event.velocity,
      rand: () => this.random(),
      noise: this.noise,
    };
    playInstrument(event.instrument, voice);
  }

  /**
   * Accompaniment chord: soft triangle pad with a slow attack held for the bar,
   * and a round bass pluck on the given beats. Kept well under the marble's
   * notes so the pads stay the voice you hear.
   */
  playChord(simTime: number, notes: string[], seconds: number, bassBeats: number[]): void {
    if (!this.unlocked) return;
    const ctx = this.ctx;
    const lead = config.audio.leadSeconds;
    let time = Number.isFinite(this.offset) ? simTime + this.offset + lead : ctx.currentTime + lead;
    if (time < ctx.currentTime + 0.005) time = ctx.currentTime + 0.005;
    const level = config.audio.backing;
    if (level <= 0) return;
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(this.dry);
    bus.connect(this.wet);
    this.chords.push(bus);
    const end = time + seconds;
    for (const name of notes) {
      const f = noteToFreq(name);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime((level * 0.5) / notes.length, time + 0.25);
      g.gain.setTargetAtTime((level * 0.32) / notes.length, time + 0.6, 0.6);
      g.gain.setTargetAtTime(0, end - 0.12, 0.08);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      for (const [type, detune] of [['triangle', -4], ['triangle', 4], ['sine', 0]] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f * (type === 'sine' ? 2 : 1);
        o.detune.value = detune;
        o.connect(filter);
        o.start(time);
        o.stop(end + 0.5);
      }
      filter.connect(g).connect(bus);
    }
    // Bass: the chord's root two octaves down, plucked.
    const root = noteToFreq(notes[0]) / 2;
    for (const beat of bassBeats) {
      const at = time + beat;
      if (at >= end) continue;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(level * 0.9, at + 0.012);
      g.gain.setTargetAtTime(0, at + 0.05, 0.22);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(root * 1.5, at);
      o.frequency.exponentialRampToValueAtTime(root, at + 0.04);
      o.connect(g).connect(bus);
      o.start(at);
      o.stop(at + 1.2);
    }
    // Only the last few bars can still be sounding.
    if (this.chords.length > 8) this.chords.shift();
  }

  /** The song's melody, soft and round, so the tune carries on under the machine. */
  playMelody(simTime: number, note: string, seconds: number): void {
    if (!this.unlocked) return;
    const level = config.audio.melody;
    if (level <= 0) return;
    const ctx = this.ctx;
    const lead = config.audio.leadSeconds;
    let time = Number.isFinite(this.offset) ? simTime + this.offset + lead : ctx.currentTime + lead;
    if (time < ctx.currentTime + 0.005) time = ctx.currentTime + 0.005;
    const f = noteToFreq(note);
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(this.dry);
    bus.connect(this.wet);
    this.chords.push(bus);
    if (this.chords.length > 12) this.chords.shift();
    const hold = Math.min(seconds, 1.2);
    for (const [ratio, amp, decay] of [[1, 0.6, hold], [2, 0.18, hold * 0.5], [3, 0.05, 0.2]] as const) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(level * amp, time + 0.02);
      g.gain.setTargetAtTime(level * amp * 0.5, time + 0.05, decay * 0.5);
      g.gain.setTargetAtTime(0, time + hold, 0.1);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * ratio;
      o.connect(g).connect(bus);
      o.start(time);
      o.stop(time + hold + 0.6);
    }
  }

  private clip: AudioBuffer | null = null;
  private clipSrc = '';
  private clipVoices: { gain: GainNode; end: number }[] = [];

  private clipBytes: ArrayBuffer | null = null;
  private clipDecoding = false;
  /** Where the song's recording stands, for a notice when a device cannot play it. */
  clipStatus: 'none' | 'loading' | 'ready' | 'failed' = 'none';
  clipError = '';
  /** Whether a slice of the recording is scheduled or sounding right now. */
  get clipPlaying(): boolean {
    const now = this.ctx.currentTime;
    return this.clipVoices.some((v) => v.end > now);
  }

  /**
   * Take a recording (a data URI in the bundle) for slice playback. The bytes
   * are unpacked here rather than fetched: the published page's security
   * policy blocks fetches, data URIs included. Decoding waits for the audio
   * context to be running (a phone will not decode on a suspended context).
   */
  loadClip(src: string): void {
    if (this.clipSrc === src) return;
    this.clipSrc = src;
    this.clip = null;
    this.clipBytes = null;
    this.clipDecoding = false;
    this.clipStatus = 'loading';
    this.clipError = '';
    const comma = src.indexOf(',');
    if (src.startsWith('data:') && comma > 0) {
      const meta = src.slice(0, comma);
      const payload = src.slice(comma + 1);
      if (/;base64$/i.test(meta)) {
        const bin = atob(payload);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        this.clipBytes = bytes.buffer;
      } else {
        this.clipBytes = new TextEncoder().encode(decodeURIComponent(payload)).buffer;
      }
      this.decodeClip();
      return;
    }
    // A plain URL (dev server): fetch it.
    void fetch(src)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (this.clipSrc !== src) return;
        this.clipBytes = buf;
        this.decodeClip();
      })
      .catch((err) => {
        this.clipStatus = 'failed';
        this.clipError = String(err);
        console.warn('recording: could not load', err);
      });
  }

  private decodeClip(): void {
    if (this.clip || this.clipDecoding || !this.clipBytes) return;
    if (this.ctx.state !== 'running') return; // retried from unlock()
    this.clipDecoding = true;
    const src = this.clipSrc;
    // Callback form as well as the promise: older WebKit only honours the callbacks.
    const done = (decoded: AudioBuffer) => {
      this.clipDecoding = false;
      if (this.clipSrc !== src) return;
      this.clip = decoded;
      this.clipStatus = 'ready';
    };
    const fail = (err: unknown) => {
      this.clipDecoding = false;
      if (this.clipSrc !== src) return;
      this.clipStatus = 'failed';
      this.clipError = err instanceof Error ? err.message : String(err ?? 'decode failed');
      console.warn('recording: could not decode', err);
    };
    try {
      const result = this.ctx.decodeAudioData(this.clipBytes.slice(0), done, fail);
      if (result && typeof (result as Promise<AudioBuffer>).then === 'function') (result as Promise<AudioBuffer>).then(done, fail);
    } catch (err) {
      fail(err);
    }
  }

  /**
   * A slice of the recording, started on the simulation clock like a note. It
   * fades in over a few ms and out at its end; a slice still sounding when the
   * next begins is faded out under it, so cuts never click.
   */
  playClip(simTime: number, offset: number, seconds: number): boolean {
    if (!this.unlocked) return false;
    if (!this.clip) {
      this.decodeClip();
      return false;
    }
    const ctx = this.ctx;
    const lead = config.audio.leadSeconds;
    let time = Number.isFinite(this.offset) ? simTime + this.offset + lead : ctx.currentTime + lead;
    if (time < ctx.currentTime + 0.005) time = ctx.currentTime + 0.005;
    const level = config.audio.recording;
    if (!Number.isFinite(seconds)) seconds = Math.max(0, this.clip.duration - offset);
    if (level <= 0 || seconds <= 0.02) return false;
    // Hand over from whatever is still sounding: a short crossfade, at a rest.
    for (const v of this.clipVoices) {
      if (v.end > time) {
        v.gain.gain.cancelScheduledValues(time);
        v.gain.gain.setValueAtTime(v.gain.gain.value, time);
        v.gain.gain.linearRampToValueAtTime(0, time + 0.12);
        v.end = time + 0.12;
      }
    }
    this.clipVoices = this.clipVoices.filter((v) => v.end > ctx.currentTime);
    const source = ctx.createBufferSource();
    source.buffer = this.clip;
    const gain = ctx.createGain();
    const fadeIn = 0.03;
    const fadeOut = Math.min(0.25, seconds * 0.3);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + fadeIn);
    gain.gain.setValueAtTime(level, time + seconds - fadeOut);
    gain.gain.linearRampToValueAtTime(0, time + seconds);
    source.connect(gain);
    gain.connect(this.dry);
    gain.connect(this.wet);
    source.start(time, Math.max(0, offset), seconds + 0.05);
    this.clipVoices.push({ gain, end: time + seconds });
    return true;
  }

  stopChords(): void {
    const now = this.ctx.currentTime;
    for (const v of this.clipVoices) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(0, now, 0.03);
    }
    this.clipVoices = [];
    const t = this.ctx.currentTime;
    for (const b of this.chords) {
      b.gain.cancelScheduledValues(t);
      b.gain.setTargetAtTime(0, t, 0.03);
    }
    this.chords = [];
  }

  setRolling(intensity: number, speed: number): void {
    const t = this.ctx.currentTime;
    const level = Math.min(1, intensity) * Math.min(1, speed / 12) * config.audio.rolling;
    this.roll.gain.gain.setTargetAtTime(level, t, 0.04);
    this.roll.filter.frequency.setTargetAtTime(250 + Math.min(1, speed / 14) * 1400, t, 0.05);
  }

  private random(): number {
    // Small LCG: variation that is repeatable across runs.
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private makeNoise(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, Math.floor(rate * seconds), rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = this.random() * 2 - 1;
    return buffer;
  }

  /** Synthetic room: stereo noise with an exponential tail. */
  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < len; i++) data[i] = (this.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buffer;
  }
}
