/** Pitch helpers. Pure functions so they can be unit-tested headlessly. */

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C4" -> 60, "F#3" -> 54, "Bb2" -> 46. */
export function noteToMidi(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!m) throw new Error(`Bad note name "${name}"`);
  const letter = m[1].toUpperCase();
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = Number(m[3]);
  return (octave + 1) * 12 + NOTE_INDEX[letter] + accidental;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteToFreq(name: string): number {
  return midiToFreq(noteToMidi(name));
}

/**
 * Impact speed -> musical velocity in 0..1. Soft touches still sound, hard hits
 * saturate near the reference speed. The curve is gentle so mid-speed hits
 * spread across the dynamic range instead of bunching at the top.
 */
export function velocityFromImpact(impactSpeed: number, referenceSpeed: number): number {
  if (impactSpeed <= 0) return 0;
  const v = Math.pow(impactSpeed / referenceSpeed, 0.7);
  return Math.min(1, Math.max(0.08, v));
}
