/**
 * Synthesised instruments. Each one is layered the way a struck object sounds:
 * an impact transient, a pitched body, and a natural decay. Velocity shapes
 * loudness, brightness and decay, and every hit gets a little random variation
 * so repeated strikes never sound like copies.
 */
import type { InstrumentName } from './types';

export interface Voice {
  ctx: AudioContext;
  out: AudioNode;
  time: number;
  freq: number;
  velocity: number;
  /** Deterministic-enough random source for per-hit variation. */
  rand: () => number;
  noise: AudioBuffer;
}

function env(ctx: AudioContext, time: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(peak, time + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  return g;
}

function osc(ctx: AudioContext, type: OscillatorType, freq: number, time: number, stop: number, detuneCents = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, time);
  if (detuneCents) o.detune.setValueAtTime(detuneCents, time);
  o.start(time);
  o.stop(time + stop);
  return o;
}

function noiseBurst(v: Voice, gain: number, decay: number, filterType: BiquadFilterType, freq: number, q = 1): void {
  const src = v.ctx.createBufferSource();
  src.buffer = v.noise;
  src.loop = true;
  src.loopStart = v.rand() * 0.5;
  const f = v.ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.setValueAtTime(freq, v.time);
  f.Q.setValueAtTime(q, v.time);
  const g = env(v.ctx, v.time, gain, 0.001, decay);
  src.connect(f).connect(g).connect(v.out);
  src.start(v.time);
  src.stop(v.time + decay + 0.05);
}

/** Additive struck body: a set of partials with their own decays. */
function partials(v: Voice, ratios: number[], amps: number[], decays: number[], type: OscillatorType = 'sine', detune = 4): void {
  for (let i = 0; i < ratios.length; i++) {
    const d = decays[i] * (0.85 + v.rand() * 0.3);
    const g = env(v.ctx, v.time, amps[i] * v.velocity, 0.002, d);
    const o = osc(v.ctx, type, v.freq * ratios[i], v.time, d + 0.05, (v.rand() - 0.5) * detune);
    o.connect(g).connect(v.out);
  }
}

const recipes: Record<InstrumentName, (v: Voice) => void> = {
  marimba(v) {
    const bright = 0.6 + v.velocity * 0.4;
    partials(v, [1, 3.93, 9.2], [0.55, 0.12 * bright, 0.03 * bright], [0.9 + 200 / v.freq, 0.25, 0.12]);
    noiseBurst(v, 0.08 * v.velocity, 0.02, 'bandpass', 2200, 2);
  },
  bell(v) {
    partials(
      v,
      [0.5, 1, 1.183, 1.506, 2.0, 2.514, 2.662, 3.011, 4.166],
      [0.18, 0.4, 0.22, 0.2, 0.16, 0.1, 0.08, 0.07, 0.03],
      [3.5, 3.0, 2.2, 2.0, 1.6, 1.2, 1.0, 0.8, 0.5],
      'sine',
      8,
    );
    noiseBurst(v, 0.12 * v.velocity, 0.015, 'highpass', 3000);
  },
  wood(v) {
    partials(v, [1, 2.4], [0.6, 0.15], [0.09, 0.05], 'triangle');
    noiseBurst(v, 0.35 * v.velocity, 0.03, 'bandpass', 1400 + v.velocity * 800, 1.2);
  },
  metal(v) {
    partials(v, [1, 2.76, 5.4, 8.93], [0.45, 0.3, 0.18, 0.08], [1.6, 1.1, 0.7, 0.4], 'sine', 6);
    noiseBurst(v, 0.2 * v.velocity, 0.02, 'highpass', 4000);
  },
  kick(v) {
    const o = v.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150 + v.velocity * 40, v.time);
    o.frequency.exponentialRampToValueAtTime(48, v.time + 0.12);
    const g = env(v.ctx, v.time, 0.9 * v.velocity, 0.002, 0.35);
    o.connect(g).connect(v.out);
    o.start(v.time);
    o.stop(v.time + 0.5);
    noiseBurst(v, 0.15 * v.velocity, 0.02, 'lowpass', 900);
  },
  snare(v) {
    noiseBurst(v, 0.7 * v.velocity, 0.16, 'bandpass', 1800, 0.7);
    noiseBurst(v, 0.3 * v.velocity, 0.08, 'highpass', 5000);
    const g = env(v.ctx, v.time, 0.35 * v.velocity, 0.002, 0.1);
    osc(v.ctx, 'triangle', 185, v.time, 0.2).connect(g).connect(v.out);
  },
  hihat(v) {
    noiseBurst(v, 0.35 * v.velocity, 0.06 + v.velocity * 0.05, 'highpass', 8000);
    for (const f of [3200, 4800, 6100]) {
      const g = env(v.ctx, v.time, 0.03 * v.velocity, 0.001, 0.05);
      osc(v.ctx, 'square', f, v.time, 0.1).connect(g).connect(v.out);
    }
  },
  cymbal(v) {
    const decay = 1.4 + v.velocity * 1.2;
    noiseBurst(v, 0.35 * v.velocity, decay, 'highpass', 4500);
    noiseBurst(v, 0.25 * v.velocity, decay * 0.6, 'bandpass', 7000, 1.5);
    for (const f of [617, 1013, 1531, 2117, 2801]) {
      const g = env(v.ctx, v.time, 0.035 * v.velocity, 0.001, decay * 0.7);
      osc(v.ctx, 'square', f * (0.98 + v.rand() * 0.04), v.time, decay).connect(g).connect(v.out);
    }
  },
  tube(v) {
    noiseBurst(v, 0.5 * v.velocity, 0.35, 'bandpass', v.freq, 25);
    partials(v, [1, 3, 5], [0.35, 0.12, 0.05], [0.45, 0.3, 0.2]);
  },
  pop(v) {
    const o = v.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(700 + v.velocity * 300, v.time);
    o.frequency.exponentialRampToValueAtTime(260, v.time + 0.06);
    const g = env(v.ctx, v.time, 0.6 * v.velocity, 0.002, 0.14);
    o.connect(g).connect(v.out);
    o.start(v.time);
    o.stop(v.time + 0.25);
    noiseBurst(v, 0.2 * v.velocity, 0.02, 'bandpass', 3000, 2);
  },
  click(v) {
    noiseBurst(v, 0.12 * v.velocity, 0.018, 'bandpass', 3500, 3);
    const g = env(v.ctx, v.time, 0.05 * v.velocity, 0.001, 0.03);
    osc(v.ctx, 'sine', 2400 + v.rand() * 400, v.time, 0.05).connect(g).connect(v.out);
  },
  thud(v) {
    const g = env(v.ctx, v.time, 0.35 * v.velocity, 0.002, 0.16);
    const o = osc(v.ctx, 'sine', 95, v.time, 0.25);
    o.frequency.exponentialRampToValueAtTime(60, v.time + 0.12);
    o.connect(g).connect(v.out);
    noiseBurst(v, 0.15 * v.velocity, 0.05, 'lowpass', 600);
  },
};

export function playInstrument(name: InstrumentName, voice: Voice): void {
  const recipe = recipes[name] ?? recipes.wood;
  recipe(voice);
}

/** Default instrument gain so the set balances without per-level mixing. */
export const instrumentGain: Record<InstrumentName, number> = {
  marimba: 0.9,
  bell: 0.7,
  wood: 0.8,
  metal: 0.7,
  kick: 1.0,
  snare: 0.8,
  hihat: 0.6,
  cymbal: 0.5,
  tube: 0.8,
  pop: 0.7,
  click: 0.35,
  thud: 0.5,
};

/** Instruments that use the note; the rest are unpitched. */
export const pitchedInstruments = new Set<InstrumentName>(['marimba', 'bell', 'wood', 'metal', 'tube']);
