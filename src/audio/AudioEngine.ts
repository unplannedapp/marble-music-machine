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

  get unlocked(): boolean {
    return this.ctx.state === 'running';
  }

  async unlock(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
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
