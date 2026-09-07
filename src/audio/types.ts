import type { InteractiveObject } from '../objects/InteractiveObject';

export type InstrumentName =
  | 'marimba'
  | 'bell'
  | 'wood'
  | 'metal'
  | 'kick'
  | 'snare'
  | 'hihat'
  | 'cymbal'
  | 'tube'
  | 'pop'
  | 'click'
  | 'thud';

/** A musical event produced by a physical contact. */
export interface NoteEvent {
  /** Simulation time at which the note should sound. */
  simTime: number;
  object: InteractiveObject;
  instrument: InstrumentName;
  /** Note name such as "C4"; percussive instruments ignore it. */
  note: string | null;
  /** 0..1, from impact speed. */
  velocity: number;
  /** Impact speed that produced the note (for visuals). */
  impactSpeed: number;
}

/** Anything that can sound a note. The real engine uses Web Audio; tests record. */
export interface NotePlayer {
  play(event: NoteEvent): void;
  /** Continuous rolling sound: 0 = silent, 1 = full speed. */
  setRolling(intensity: number, speed: number): void;
}

/** Plays the accompaniment: a held chord starting at a simulation time. */
export interface BackingPlayer {
  playChord(simTime: number, notes: string[], seconds: number, bassBeats: number[]): void;
  /** One note of the song's melody line, soft, under the machine. */
  playMelody(simTime: number, note: string, seconds: number): void;
  /** Load a recording so slices of it can be played. */
  loadClip(src: string): void;
  /** Play `seconds` of the loaded recording from `offset` seconds in, starting at a simulation time. */
  playClip(simTime: number, offset: number, seconds: number): void;
  /** Silence every chord still sounding or scheduled (the marble was put back). */
  stopChords(): void;
}
