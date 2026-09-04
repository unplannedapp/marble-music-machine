import type { SongDef } from './types';

/**
 * The alphabet song (the "Twinkle" tune), 42 syllables over six lines.
 * Beats: quarter = 1, the L-M-N-O eighths = 0.5, a held note at a line end = 2.5
 * (the note plus the breath the phrase ramp gives). Each line is a section: the
 * song clock re-anchors on the first strike of a section, which is also where
 * checkpoints will restart from.
 */
export const alphabetSong: SongDef = {
  name: 'The Alphabet Song',
  bpm: 113,
  key: 'C',
  sections: ['A to G', 'H to P', 'Q to V', 'W to Z', 'Now I know', 'Next time'],
  events: [
    { beat: 0, object: 'abc_1', note: 'C5', lyric: "A", section: 0 },
    { beat: 1, object: 'abc_2', note: 'C5', lyric: "B", section: 0 },
    { beat: 2, object: 'abc_3', note: 'G5', lyric: "C", section: 0 },
    { beat: 3, object: 'abc_4', note: 'G5', lyric: "D", section: 0 },
    { beat: 4, object: 'abc_5', note: 'A5', lyric: "E", section: 0 },
    { beat: 5, object: 'abc_6', note: 'A5', lyric: "F", section: 0 },
    { beat: 6, object: 'abc_7', note: 'G5', lyric: "G", section: 0 },
    { beat: 8.5, object: 'abc_9', note: 'F5', lyric: "H", section: 1 },
    { beat: 9.5, object: 'abc_10', note: 'F5', lyric: "I", section: 1 },
    { beat: 10.5, object: 'abc_11', note: 'E5', lyric: "J", section: 1 },
    { beat: 11.5, object: 'abc_12', note: 'E5', lyric: "K", section: 1 },
    { beat: 12.5, object: 'abc_13', note: 'D5', lyric: "L", section: 1 },
    { beat: 13, object: 'abc_14', note: 'D5', lyric: "M", section: 1 },
    { beat: 13.5, object: 'abc_15', note: 'D5', lyric: "N", section: 1 },
    { beat: 14, object: 'abc_16', note: 'D5', lyric: "O", section: 1 },
    { beat: 14.5, object: 'abc_17', note: 'C5', lyric: "P", section: 1 },
    { beat: 17, object: 'abc_19', note: 'G5', lyric: "Q", section: 2 },
    { beat: 18, object: 'abc_20', note: 'G5', lyric: "R", section: 2 },
    { beat: 19, object: 'abc_21', note: 'F5', lyric: "S", section: 2 },
    { beat: 21.5, object: 'abc_23', note: 'E5', lyric: "T", section: 2 },
    { beat: 22.5, object: 'abc_24', note: 'E5', lyric: "U", section: 2 },
    { beat: 23.5, object: 'abc_25', note: 'D5', lyric: "V", section: 2 },
    { beat: 26, object: 'abc_27', note: 'G5', lyric: "W", section: 3 },
    { beat: 27, object: 'abc_28', note: 'G5', lyric: "W", section: 3 },
    { beat: 28, object: 'abc_29', note: 'F5', lyric: "X", section: 3 },
    { beat: 30.5, object: 'abc_31', note: 'E5', lyric: "Y", section: 3 },
    { beat: 31.5, object: 'abc_32', note: 'E5', lyric: "and", section: 3 },
    { beat: 32.5, object: 'abc_33', note: 'D5', lyric: "Z", section: 3 },
    { beat: 35, object: 'abc_35', note: 'C5', lyric: "Now", section: 4 },
    { beat: 36, object: 'abc_36', note: 'C5', lyric: "I", section: 4 },
    { beat: 37, object: 'abc_37', note: 'G5', lyric: "know", section: 4 },
    { beat: 38, object: 'abc_38', note: 'G5', lyric: "my", section: 4 },
    { beat: 39, object: 'abc_39', note: 'A5', lyric: "A", section: 4 },
    { beat: 40, object: 'abc_40', note: 'A5', lyric: "B", section: 4 },
    { beat: 41, object: 'abc_41', note: 'G5', lyric: "C's", section: 4 },
    { beat: 43.5, object: 'abc_43', note: 'F5', lyric: "Next", section: 5 },
    { beat: 44.5, object: 'abc_44', note: 'F5', lyric: "time", section: 5 },
    { beat: 45.5, object: 'abc_45', note: 'E5', lyric: "won't", section: 5 },
    { beat: 46.5, object: 'abc_46', note: 'E5', lyric: "you", section: 5 },
    { beat: 47.5, object: 'abc_47', note: 'D5', lyric: "sing", section: 5 },
    { beat: 48.5, object: 'abc_48', note: 'D5', lyric: "with", section: 5 },
    { beat: 49.5, object: 'abc_49', note: 'C5', lyric: "me", section: 5 },
  ],
};
