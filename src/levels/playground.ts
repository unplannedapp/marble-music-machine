import type { LevelDef } from './LevelTypes';

/**
 * Phase 1 playground: a descending course that exercises every mechanism.
 * Rail -> zigzag of pads -> catch rail -> bumper field -> ramp -> pads -> end rail.
 */
export const playground: LevelDef = {
  name: 'Playground',
  board: { width: 16, top: 8, bottom: -58 },
  spawn: { position: [-5.0, 5.05, 0.55], velocity: [1.2, 0, 0] },
  killY: -55,
  finish: { position: [6.0, -51.6, 0], radius: 1.3 },
  objects: [
    { type: 'wall', id: 'wall_left', position: [-8.2, -25, 0.6], size: [0.4, 66, 1.2], instrument: 'none' },
    { type: 'wall', id: 'wall_right', position: [8.2, -25, 0.6], size: [0.4, 66, 1.2], instrument: 'none' },

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

    // Zigzag pads, placed on the simulated path by scripts/autolayout.ts.
    // Positive angle raises the right end and sends a falling marble to the left.
    { type: 'pad', id: 'pad_1', position: [3.7, 2.32, 0], angle: 53, color: '#d9534f', instrument: 'marimba', note: 'C5' },
    { type: 'pad', id: 'pad_2', position: [1.44, 0.15, 0], angle: -38, color: '#f0ad4e', instrument: 'marimba', note: 'E5' },
    { type: 'pad', id: 'pad_3', position: [4.46, -1.99, 0], angle: 42, color: '#5bc0de', instrument: 'marimba', note: 'G5' },
    { type: 'pad', id: 'pad_4', position: [1.45, -4.15, 0], angle: -41, color: '#8e6bd6', instrument: 'marimba', note: 'E5' },
    { type: 'pad', id: 'pad_5', position: [4.53, -6.29, 0], angle: 41.5, color: '#5cb85c', instrument: 'marimba', note: 'D5' },
    { type: 'pad', id: 'pad_6', position: [1.46, -8.45, 0], angle: -41.5, color: '#e86fb0', instrument: 'marimba', note: 'F5' },
    { type: 'pad', id: 'pad_7', position: [4.54, -10.59, 0], angle: 41.5, color: '#f7f7f7', instrument: 'marimba', note: 'G5' },

    // Catch rail: crosses the marble's path off pad_7 at a shallow angle so it
    // lands in the groove and carries it left.
    {
      type: 'rail',
      id: 'rail_catch',
      points: [
        [3.0, -12.0, 0],
        [1.6, -12.35, 0],
        [0.0, -12.9, 0],
        [-1.8, -13.6, 0],
        [-3.5, -14.5, 0],
        [-4.3, -15.1, 0],
      ],
    },


    // Second pad run, placed by scripts/layout.ts.
    { type: 'pad', id: 'padB_1', position: [-6.09, -16.72, 0], angle: -50.5, color: '#d9534f', instrument: 'bell', note: 'C5' },
    { type: 'pad', id: 'padB_2', position: [-2.88, -18.63, 0], angle: 40.5, color: '#f0ad4e', instrument: 'bell', note: 'G4' },
    { type: 'pad', id: 'padB_3', position: [-5.84, -20.42, 0], angle: -43.5, color: '#5bc0de', instrument: 'bell', note: 'A4' },
    { type: 'pad', id: 'padB_4', position: [-3.13, -22.25, 0], angle: 41, color: '#8e6bd6', instrument: 'bell', note: 'E4' },
    { type: 'pad', id: 'padB_5', position: [-5.84, -24.11, 0], angle: -41.5, color: '#5cb85c', instrument: 'bell', note: 'F4' },
    { type: 'pad', id: 'padB_6', position: [-3.13, -25.92, 0], angle: 41.5, color: '#e86fb0', instrument: 'bell', note: 'G4' },

    // Gathering rail: takes the marble off the last pad wherever it lands and
    // releases it from one fixed point, so the bumper run below starts the same way every time.
    {
      type: 'rail',
      id: 'rail_mid',
      points: [
        [-7.6, -28.0, 0],
        [-6.2, -28.4, 0],
        [-4.5, -28.9, 0],
        [-2.8, -29.6, 0],
        [-1.4, -30.5, 0],
        [-0.6, -31.7, 0],
      ],
    },

    // Single bumper accent, placed by scripts/layout.ts for a fairly central hit.
    { type: 'bumper', id: 'bump_1', position: [1.48, -33.75, 0], radius: 0.7, color: '#e8c44a', instrument: 'kick' },

    // Wide catch rail: however the bumper sends the marble, it lands in this
    // groove, climbs, and rolls back to release from the right-hand end.
    {
      type: 'rail',
      id: 'rail_gather',
      points: [
        [-7.5, -34.0, 0],
        [-6.6, -35.2, 0],
        [-5.5, -36.0, 0],
        [-3.5, -36.5, 0],
        [-1.5, -37.1, 0],
        [0.3, -37.9, 0],
        [1.4, -39.0, 0],
      ],
    },

    // Funnel: two ramps meeting at a centre gap, so the marble leaves at a known place.
    { type: 'ramp', id: 'funnel_left', position: [-4.35, -42.0, 0.45], rotation: [0, 0, -22.3], size: [7.9, 0.4, 0.9], instrument: 'snare' },
    { type: 'ramp', id: 'funnel_right', position: [4.35, -42.0, 0.45], rotation: [0, 0, 22.3], size: [7.9, 0.4, 0.9], instrument: 'snare' },

    // Closing rail under the funnel gap, carrying the marble to the finish tray.
    {
      type: 'rail',
      id: 'rail_end',
      points: [
        [-4.6, -43.0, 0],
        [-3.0, -44.0, 0],
        [-1.6, -44.7, 0],
        [0.0, -45.1, 0],
        [1.8, -45.7, 0],
        [3.4, -46.6, 0],
        [4.6, -47.9, 0],
        [5.2, -49.5, 0],
      ],
    },

    // Finish tray: a shallow cup where the marble comes to rest.
    { type: 'ramp', id: 'tray_left', position: [4.9, -51.4, 0.45], rotation: [0, 0, -30], size: [2.6, 0.4, 0.9], color: '#3a3c44', instrument: 'cymbal' },
    { type: 'ramp', id: 'tray_right', position: [7.1, -51.4, 0.45], rotation: [0, 0, 30], size: [2.6, 0.4, 0.9], color: '#3a3c44', instrument: 'thud' },
  ],
};
