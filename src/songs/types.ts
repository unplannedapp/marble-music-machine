/**
 * Data-driven song description. A song is a list of musical events, each bound
 * to the object that must be struck to play it. Times are in beats so a song can
 * be re-tempoed; `bpm` turns them into seconds.
 */
export interface SongEvent {
  /** When the note is due, in beats from the song start. */
  beat: number;
  /** Id of the object in the level that plays this note. */
  object: string;
  note?: string;
  /** Syllable or word sung on this note, for display. */
  lyric?: string;
  /** Index into `sections`; the song clock re-anchors at each section's first strike. */
  section?: number;
}

/** Accompaniment that plays under the machine: one chord symbol per bar, in song order. */
export interface BackingDef {
  /** Chord per bar, e.g. 'C', 'G', 'Am', 'F'. Repeats if the song runs past the end. */
  chords: string[];
  /** Beats per bar. Default 4. */
  beatsPerBar?: number;
  /**
   * The original recording, when the song came from one. It replaces the
   * synthesised bed: the recording is cut at its note onsets and each slice
   * plays when the marble strikes the matching pad, so it is the real sound,
   * kept in step with the marble.
   */
  audio?: {
    /** URL (a data URI in the bundle). */
    src: string;
    /** Seconds into the recording where each song event's note begins, one per event. */
    onsets: number[];
    /** Seconds of recording to let ring after the last note. Default 3. */
    tail?: number;
  };
}

export interface SongDef {
  name: string;
  bpm: number;
  key?: string;
  sections?: string[];
  events: SongEvent[];
  backing?: BackingDef;
  /** Simulation seconds at which the machine's first note is struck (from the bake), so a recording's intro can lead into it. */
  firstStrike?: number;
}

export function beatSeconds(song: SongDef, beat: number): number {
  return (beat * 60) / song.bpm;
}
