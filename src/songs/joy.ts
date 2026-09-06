import type { SongDef } from './types';

/**
 * Ode to Joy (Beethoven), two lines of the hymn text, a spinner between them.
 * Beats and sections are rewritten from the machine's own run
 * (scripts/songfrombake.ts): the level is the sequencer.
 */
export const joySong: SongDef = {
  name: 'Ode to Joy',
  bpm: 113,
  key: 'C',
  sections: ['Part 1', 'Part 2'],
  events: [
    { beat: 0, object: 'joy_1', note: 'E5', lyric: "Joy", section: 0 },
    { beat: 1, object: 'joy_2', note: 'E5', lyric: "ful", section: 0 },
    { beat: 2, object: 'joy_3', note: 'F5', lyric: "joy", section: 0 },
    { beat: 3, object: 'joy_4', note: 'G5', lyric: "ful", section: 0 },
    { beat: 4, object: 'joy_5', note: 'G5', lyric: "we", section: 0 },
    { beat: 5, object: 'joy_6', note: 'F5', lyric: "a", section: 0 },
    { beat: 6, object: 'joy_7', note: 'E5', lyric: "dore", section: 0 },
    { beat: 7, object: 'joy_8', note: 'D5', lyric: "thee", section: 0 },
    { beat: 8, object: 'joy_9', note: 'C5', lyric: "God", section: 0 },
    { beat: 9, object: 'joy_10', note: 'C5', lyric: "of", section: 0 },
    { beat: 10, object: 'joy_11', note: 'D5', lyric: "glo", section: 0 },
    { beat: 11, object: 'joy_12', note: 'E5', lyric: "ry", section: 0 },
    { beat: 12, object: 'joy_13', note: 'E5', lyric: "Lord", section: 0 },
    { beat: 13, object: 'joy_14', note: 'D5', lyric: "of", section: 0 },
    { beat: 14, object: 'joy_15', note: 'D5', lyric: "love", section: 0 },
    { beat: 18.5, object: 'joy_17', note: 'E5', lyric: "Hearts", section: 1 },
    { beat: 19.5, object: 'joy_18', note: 'E5', lyric: "un", section: 1 },
    { beat: 20.5, object: 'joy_19', note: 'F5', lyric: "fold", section: 1 },
    { beat: 21.5, object: 'joy_20', note: 'G5', lyric: "like", section: 1 },
    { beat: 22.5, object: 'joy_21', note: 'G5', lyric: "flow'rs", section: 1 },
    { beat: 23.5, object: 'joy_22', note: 'F5', lyric: "be", section: 1 },
    { beat: 24.5, object: 'joy_23', note: 'E5', lyric: "fore", section: 1 },
    { beat: 25.5, object: 'joy_24', note: 'D5', lyric: "thee", section: 1 },
    { beat: 26.5, object: 'joy_25', note: 'C5', lyric: "hail", section: 1 },
    { beat: 27.5, object: 'joy_26', note: 'C5', lyric: "thee", section: 1 },
    { beat: 28.5, object: 'joy_27', note: 'D5', lyric: "as", section: 1 },
    { beat: 29.5, object: 'joy_28', note: 'E5', lyric: "the", section: 1 },
    { beat: 30.5, object: 'joy_29', note: 'D5', lyric: "sun", section: 1 },
    { beat: 31.5, object: 'joy_30', note: 'C5', lyric: "a", section: 1 },
    { beat: 32.5, object: 'joy_31', note: 'C5', lyric: "bove", section: 1 },
  ],
};
