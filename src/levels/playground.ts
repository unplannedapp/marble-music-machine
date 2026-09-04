import type { LevelDef } from './LevelTypes';

/**
 * Phase 1 playground: a descending course that exercises every mechanism.
 * Rail -> zigzag of pads -> catch rail -> bumper field -> ramp -> pads -> end rail.
 */
export const playground: LevelDef = {
  name: 'Playground',
  board: { width: 16, top: 8, bottom: -140 },
  spawn: { position: [-5.0, 5.05, 0.55], velocity: [1.2, 0, 0] },
  killY: -134,
  finish: { position: [-6.0, -120.04, 0], radius: 1.3 },
  objects: [
    { type: 'wall', id: 'wall_left', position: [-8.2, -66.0, 0.6], size: [0.4, 152, 1.2], instrument: 'none' },
    { type: 'wall', id: 'wall_right', position: [8.2, -66.0, 0.6], size: [0.4, 152, 1.2], instrument: 'none' },

    // Opening rail: gentle S-curve that releases the marble mid-air.
    {
      type: 'rail',
      id: 'rail_start',
      points: [
        [-5.4, 5.0, 0],
        [-3.5, 4.75, 0],
        [-1.5, 4.2, 0],
        [0.6, 3.9, 0],
        [2.2, 3.4, 0],
      ],
    },

    // The alphabet song, one pad per syllable, laid on the simulated path by
    // scripts/layout.ts. Quarter notes drop 1.8, eighths 1.1 with a downward
    // deflection. A short rail after each phrase re-gathers the marble so small
    // deviations never accumulate, and doubles as the breath between lines.
    { type: 'pad', id: 'abc_1', position: [3.66, 2.31, 0], angle: 50, instrument: 'marimba', color: '#d9534f', note: 'C5' },  // A
    { type: 'pad', id: 'abc_2', position: [1.69, 0.44, 0], angle: -36.5, instrument: 'marimba', color: '#f0ad4e', note: 'C5' },  // B
    { type: 'pad', id: 'abc_3', position: [4.36, -1.39, 0], angle: 42, instrument: 'marimba', color: '#5bc0de', note: 'G5' },  // C
    { type: 'pad', id: 'abc_4', position: [1.71, -3.21, 0], angle: -41, instrument: 'marimba', color: '#8e6bd6', note: 'G5' },  // D
    { type: 'pad', id: 'abc_5', position: [4.4, -5.02, 0], angle: 41.5, instrument: 'marimba', color: '#5cb85c', note: 'A5' },  // E
    { type: 'pad', id: 'abc_6', position: [1.72, -6.88, 0], angle: -41, instrument: 'marimba', color: '#e86fb0', note: 'A5' },  // F
    { type: 'pad', id: 'abc_7', position: [4.42, -8.73, 0], angle: 41.5, instrument: 'marimba', color: '#f7f7f7', note: 'G5' },  // G
    { type: 'ramp', id: 'abc_8', position: [1.11, -11.52, 0.45], rotation: [0, 0, 25], size: [3.6, 0.4, 0.9] },  // phrase break
    { type: 'pad', id: 'abc_9', position: [-3.27, -14.22, 0], angle: -49.5, instrument: 'marimba', color: '#d9534f', note: 'F5' },  // H
    { type: 'pad', id: 'abc_10', position: [-0.1, -16.09, 0], angle: 41, instrument: 'marimba', color: '#f0ad4e', note: 'F5' },  // I
    { type: 'pad', id: 'abc_11', position: [-3.03, -17.91, 0], angle: -43, instrument: 'marimba', color: '#5bc0de', note: 'E5' },  // J
    { type: 'pad', id: 'abc_12', position: [-0.33, -19.72, 0], angle: 41, instrument: 'marimba', color: '#8e6bd6', note: 'E5' },  // K
    { type: 'pad', id: 'abc_13', position: [-2.81, -20.75, 0], angle: -60, instrument: 'marimba', color: '#5cb85c', note: 'D5' },  // L
    { type: 'pad', id: 'abc_14', position: [-0.83, -21.85, 0], angle: 61, instrument: 'marimba', color: '#e86fb0', note: 'D5' },  // M
    { type: 'pad', id: 'abc_15', position: [-2.78, -22.99, 0], angle: -60, instrument: 'marimba', color: '#f7f7f7', note: 'D5' },  // N
    { type: 'pad', id: 'abc_16', position: [-0.82, -24.14, 0], angle: 60, instrument: 'marimba', color: '#d9534f', note: 'D5' },  // O
    { type: 'pad', id: 'abc_17', position: [-2.99, -26.05, 0], angle: -41.5, instrument: 'marimba', color: '#f0ad4e', note: 'C5' },  // P
    { type: 'ramp', id: 'abc_18', position: [0.19, -28.85, 0.45], rotation: [0, 0, -25], size: [3.6, 0.4, 0.9] },  // phrase break
    { type: 'pad', id: 'abc_19', position: [4.56, -31.54, 0], angle: 49.5, instrument: 'marimba', color: '#5bc0de', note: 'G5' },  // Q
    { type: 'pad', id: 'abc_20', position: [1.39, -33.43, 0], angle: -41, instrument: 'marimba', color: '#8e6bd6', note: 'G5' },  // R
    { type: 'pad', id: 'abc_21', position: [4.34, -35.26, 0], angle: 43, instrument: 'marimba', color: '#5cb85c', note: 'F5' },  // S
    { type: 'ramp', id: 'abc_22', position: [1.01, -38.04, 0.45], rotation: [0, 0, 25], size: [3.6, 0.4, 0.9] },  // phrase break
    { type: 'pad', id: 'abc_23', position: [-3.39, -40.75, 0], angle: -49.5, instrument: 'marimba', color: '#e86fb0', note: 'E5' },  // T
    { type: 'pad', id: 'abc_24', position: [-0.22, -42.63, 0], angle: 41, instrument: 'marimba', color: '#f7f7f7', note: 'E5' },  // U
    { type: 'pad', id: 'abc_25', position: [-3.16, -44.45, 0], angle: -43, instrument: 'marimba', color: '#d9534f', note: 'D5' },  // V
    { type: 'ramp', id: 'abc_26', position: [0.15, -47.23, 0.45], rotation: [0, 0, -25], size: [3.6, 0.4, 0.9] },  // phrase break
    { type: 'pad', id: 'abc_27', position: [4.55, -49.93, 0], angle: 49.5, instrument: 'marimba', color: '#f0ad4e', note: 'G5' },  // W
    { type: 'pad', id: 'abc_28', position: [1.38, -51.81, 0], angle: -41, instrument: 'marimba', color: '#5bc0de', note: 'G5' },  // W
    { type: 'pad', id: 'abc_29', position: [4.33, -53.64, 0], angle: 43, instrument: 'marimba', color: '#8e6bd6', note: 'F5' },  // X
    { type: 'ramp', id: 'abc_30', position: [1.01, -56.42, 0.45], rotation: [0, 0, 25], size: [3.6, 0.4, 0.9] },  // phrase break
    { type: 'pad', id: 'abc_31', position: [-3.39, -59.13, 0], angle: -49.5, instrument: 'marimba', color: '#5cb85c', note: 'E5' },  // Y
    { type: 'pad', id: 'abc_32', position: [-0.21, -61.01, 0], angle: 41, instrument: 'marimba', color: '#e86fb0', note: 'E5' },  // and
    { type: 'pad', id: 'abc_33', position: [-3.16, -62.84, 0], angle: -43, instrument: 'marimba', color: '#f7f7f7', note: 'D5' },  // Z
    { type: 'ramp', id: 'abc_34', position: [0.16, -65.63, 0.45], rotation: [0, 0, -25], size: [3.6, 0.4, 0.9] },  // phrase break
    { type: 'pad', id: 'abc_35', position: [4.53, -68.33, 0], angle: 49, instrument: 'marimba', color: '#d9534f', note: 'C5' },  // Now
    { type: 'pad', id: 'abc_36', position: [1.38, -70.24, 0], angle: -40.5, instrument: 'marimba', color: '#f0ad4e', note: 'C5' },  // I
    { type: 'pad', id: 'abc_37', position: [4.34, -72.05, 0], angle: 43.5, instrument: 'marimba', color: '#5bc0de', note: 'G5' },  // know
    { type: 'pad', id: 'abc_38', position: [1.58, -73.9, 0], angle: -41.5, instrument: 'marimba', color: '#8e6bd6', note: 'G5' },  // my
    { type: 'pad', id: 'abc_39', position: [4.29, -75.71, 0], angle: 41.5, instrument: 'marimba', color: '#5cb85c', note: 'A5' },  // A
    { type: 'pad', id: 'abc_40', position: [1.63, -77.55, 0], angle: -41, instrument: 'marimba', color: '#e86fb0', note: 'A5' },  // B
    { type: 'pad', id: 'abc_41', position: [4.32, -79.41, 0], angle: 41, instrument: 'marimba', color: '#f7f7f7', note: 'G5' },  // C's
    { type: 'ramp', id: 'abc_42', position: [1.02, -82.22, 0.45], rotation: [0, 0, 25], size: [3.6, 0.4, 0.9] },  // phrase break
    { type: 'pad', id: 'abc_43', position: [-3.35, -84.92, 0], angle: -49.5, instrument: 'marimba', color: '#d9534f', note: 'F5' },  // Next
    { type: 'pad', id: 'abc_44', position: [-0.18, -86.79, 0], angle: 41, instrument: 'marimba', color: '#f0ad4e', note: 'F5' },  // time
    { type: 'pad', id: 'abc_45', position: [-3.13, -88.62, 0], angle: -43, instrument: 'marimba', color: '#5bc0de', note: 'E5' },  // won't
    { type: 'pad', id: 'abc_46', position: [-0.41, -90.43, 0], angle: 41.5, instrument: 'marimba', color: '#8e6bd6', note: 'E5' },  // you
    { type: 'pad', id: 'abc_47', position: [-3.11, -92.27, 0], angle: -41.5, instrument: 'marimba', color: '#5cb85c', note: 'D5' },  // sing
    { type: 'pad', id: 'abc_48', position: [-0.42, -94.13, 0], angle: 41, instrument: 'marimba', color: '#e86fb0', note: 'D5' },  // with
    { type: 'pad', id: 'abc_49', position: [-3.13, -95.98, 0], angle: -41.5, instrument: 'marimba', color: '#f7f7f7', note: 'C5' },  // me

    // Finale: gathering rail and one bumper accent (scripts/layout.ts), then the funnel.
    { type: 'rail', id: 'fin_1', points: [[-1.4, -97.53, 0], [-0.9, -98.08, 0], [0.2, -98.53, 0], [1.4, -99.13, 0], [2.2, -100.03, 0]] },
    { type: 'bumper', id: 'fin_2', position: [4.66, -102.19, 0], radius: 0.7, instrument: 'kick', color: '#e8c44a' },

    // Funnel: two ramps meeting at a centre gap, so wherever the bumper sends the marble it leaves at a known place.
    { type: 'ramp', id: 'funnel_left', position: [-4.35, -110.44, 0.45], rotation: [0, 0, -22.3], size: [7.9, 0.4, 0.9], instrument: 'snare' },
    { type: 'ramp', id: 'funnel_right', position: [4.35, -110.44, 0.45], rotation: [0, 0, 22.3], size: [7.9, 0.4, 0.9], instrument: 'snare' },

    // Closing rail under the funnel gap, carrying the marble to the finish tray.
    {
      type: 'rail',
      id: 'rail_end',
      points: [
        [4.6, -111.44, 0],
        [3.0, -112.44, 0],
        [1.6, -113.14, 0],
        [0.0, -113.54, 0],
        [-1.8, -114.14, 0],
        [-3.4, -115.04, 0],
        [-4.6, -116.34, 0],
        [-5.2, -117.94, 0],
      ],
    },

    // Finish tray: a shallow cup where the marble comes to rest.
    { type: 'ramp', id: 'tray_right', position: [-4.9, -119.84, 0.45], rotation: [0, 0, 30], size: [2.6, 0.4, 0.9], color: '#3a3c44', instrument: 'cymbal' },
    { type: 'ramp', id: 'tray_left', position: [-7.1, -119.84, 0.45], rotation: [0, 0, -30], size: [2.6, 0.4, 0.9], color: '#3a3c44', instrument: 'thud' },
  ],
};
