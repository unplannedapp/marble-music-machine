import type { SongDef } from './types';
import calmClip from '../assets/calm.wav?url';

/**
 * Transcribed from an uploaded audio track ("Calm Music"): the top voice of
 * the first twelve bars, quantised to eighth notes and snapped to the key.
 * Beats and sections are rewritten from the machine's own run
 * (scripts/songfrombake.ts); the object ids follow the level's pads in order.
 */
export const calmSong: SongDef = {
  name: 'Calm',
  bpm: 113,
  key: 'C#',
  sections: ['Part 1', 'Part 2', 'Part 3', 'Part 4', 'Part 5'],
  backing: {
    chords: ['A#m', 'A#m', 'A#m', 'A#m', 'A#m', 'A#m', 'A#m', 'A#m', 'A#m', 'A#m', 'C#', 'C#'],
    // The recording itself, cut at these note onsets (seconds) and played slice by slice as the marble strikes.
    audio: { src: calmClip, onsets: [2.02, 2.229, 2.786, 3.019, 3.622, 5.294, 5.782, 6.757, 6.966, 7.848, 8.359, 9.474, 9.706, 10.612, 10.96, 11.633, 12.26, 12.817, 13.653, 14.211, 14.768, 15.604, 15.882, 17.833, 18.39, 18.622, 18.971, 19.226, 19.505, 20.341, 21.13, 21.502, 22.013, 23.243, 23.359, 23.661, 24.613, 25.054, 25.449, 25.913, 26.122, 26.749], tail: 4 },
  },
  firstStrike: 2.292,
  events: [
    { beat: 0, object: 'calm_1', note: 'D#5', lyric: "", section: 0 },
    { beat: 0.75, object: 'calm_2', note: 'C#5', lyric: "", section: 0 },
    { beat: 1.75, object: 'calm_3', note: 'D#5', lyric: "", section: 0 },
    { beat: 2.5, object: 'calm_4', note: 'A#4', lyric: "", section: 0 },
    { beat: 3.5, object: 'calm_5', note: 'C#5', lyric: "", section: 0 },
    { beat: 7, object: 'calm_7', note: 'A#4', lyric: "", section: 1 },
    { beat: 8.25, object: 'calm_8', note: 'C#5', lyric: "", section: 1 },
    { beat: 9.5, object: 'calm_9', note: 'A#4', lyric: "", section: 1 },
    { beat: 10.25, object: 'calm_10', note: 'F5', lyric: "", section: 1 },
    { beat: 11.5, object: 'calm_11', note: 'D#5', lyric: "", section: 1 },
    { beat: 12.75, object: 'calm_12', note: 'A#4', lyric: "", section: 1 },
    { beat: 15.5, object: 'calm_14', note: 'A#4', lyric: "", section: 2 },
    { beat: 16.5, object: 'calm_15', note: 'C#5', lyric: "", section: 2 },
    { beat: 17.75, object: 'calm_16', note: 'A#4', lyric: "", section: 2 },
    { beat: 18.5, object: 'calm_17', note: 'C#5', lyric: "", section: 2 },
    { beat: 19.75, object: 'calm_18', note: 'A#4', lyric: "", section: 2 },
    { beat: 21, object: 'calm_19', note: 'C#5', lyric: "", section: 2 },
    { beat: 22, object: 'calm_20', note: 'F5', lyric: "", section: 2 },
    { beat: 23.25, object: 'calm_21', note: 'D#5', lyric: "", section: 2 },
    { beat: 24.25, object: 'calm_22', note: 'F#5', lyric: "", section: 2 },
    { beat: 25.5, object: 'calm_23', note: 'F#5', lyric: "", section: 2 },
    { beat: 26.75, object: 'calm_24', note: 'D#5', lyric: "", section: 2 },
    { beat: 27.75, object: 'calm_25', note: 'C#5', lyric: "", section: 2 },
    { beat: 31.5, object: 'calm_27', note: 'D#5', lyric: "", section: 3 },
    { beat: 32.5, object: 'calm_28', note: 'C#5', lyric: "", section: 3 },
    { beat: 33.25, object: 'calm_29', note: 'G#4', lyric: "", section: 3 },
    { beat: 34, object: 'calm_30', note: 'D#5', lyric: "", section: 3 },
    { beat: 34.75, object: 'calm_31', note: 'G#4', lyric: "", section: 3 },
    { beat: 35.5, object: 'calm_32', note: 'C#5', lyric: "", section: 3 },
    { beat: 36.75, object: 'calm_33', note: 'G#4', lyric: "", section: 3 },
    { beat: 38, object: 'calm_34', note: 'C#5', lyric: "", section: 3 },
    { beat: 39, object: 'calm_35', note: 'D#5', lyric: "", section: 3 },
    { beat: 40, object: 'calm_36', note: 'C#5', lyric: "", section: 3 },
    { beat: 42.5, object: 'calm_38', note: 'D#5', lyric: "", section: 4 },
    { beat: 43.25, object: 'calm_39', note: 'C#5', lyric: "", section: 4 },
    { beat: 44, object: 'calm_40', note: 'A#4', lyric: "", section: 4 },
    { beat: 45.25, object: 'calm_41', note: 'C#5', lyric: "", section: 4 },
    { beat: 46.25, object: 'calm_42', note: 'F5', lyric: "", section: 4 },
    { beat: 47, object: 'calm_43', note: 'D#5', lyric: "", section: 4 },
    { beat: 48, object: 'calm_44', note: 'C4', lyric: "", section: 4 },
    { beat: 49, object: 'calm_45', note: 'F5', lyric: "", section: 4 },
    { beat: 50, object: 'calm_46', note: 'D#5', lyric: "", section: 4 },
  ],
};
