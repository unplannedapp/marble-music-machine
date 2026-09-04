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

export interface SongDef {
  name: string;
  bpm: number;
  key?: string;
  sections?: string[];
  events: SongEvent[];
}

export function beatSeconds(song: SongDef, beat: number): number {
  return (beat * 60) / song.bpm;
}
