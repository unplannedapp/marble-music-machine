import { parseLevel, type LevelFile } from '../levels/LevelFormat';
import alphabetLevel from '../levels/alphabet.level.json';
import maryLevel from '../levels/mary.level.json';
import joyLevel from '../levels/joy.level.json';
import calmLevel from '../levels/calm.level.json';
import pirateLevel from '../levels/pirate.level.json';
import { alphabetSong } from '../songs/alphabet';
import { marySong } from '../songs/mary';
import { joySong } from '../songs/joy';
import { calmSong } from '../songs/calm';
import { pirateSong } from '../songs/pirate';
import type { SongDef } from '../songs/types';

/** A machine is a level and the song it performs: what the player picks from the menu. */
export interface Machine {
  id: string;
  title: string;
  level: LevelFile;
  song: SongDef;
  /** Player-built: its song is baked from the level when it is played. */
  custom?: boolean;
}

export const machines: Machine[] = [
  { id: 'pirate', title: "He's a Pirate (your MIDI)", level: parseLevel(pirateLevel), song: pirateSong },
  { id: 'calm', title: 'Calm Music 1 (your recording)', level: parseLevel(calmLevel), song: calmSong },
  { id: 'alphabet', title: 'The Alphabet Song', level: parseLevel(alphabetLevel), song: alphabetSong },
  { id: 'mary', title: 'Mary Had a Little Lamb', level: parseLevel(maryLevel), song: marySong },
  { id: 'joy', title: 'Ode to Joy', level: parseLevel(joyLevel), song: joySong },
];

/** Source path of a machine's level file (for authoring scripts that write it back). */
export function levelPath(id: string): string {
  return `src/levels/${id}.level.json`;
}

export function findMachine(id: string): Machine {
  const m = machines.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown machine "${id}"`);
  return m;
}
