import { parseLevel, type LevelFile } from '../levels/LevelFormat';
import alphabetLevel from '../levels/alphabet.level.json';
import maryLevel from '../levels/mary.level.json';
import { alphabetSong } from '../songs/alphabet';
import { marySong } from '../songs/mary';
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
  { id: 'alphabet', title: 'The Alphabet Song', level: parseLevel(alphabetLevel), song: alphabetSong },
  { id: 'mary', title: 'Mary Had a Little Lamb', level: parseLevel(maryLevel), song: marySong },
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
