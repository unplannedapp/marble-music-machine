import type { LevelFile } from './LevelFormat';

/** A blank machine: board, walls and an opening rail. Everything else is the player's. */
export function blankLevel(name: string): LevelFile {
  return {
    format: 1,
    name,
    environment: { board: '#5f5d70', background: '#4b4a58', keyLight: '#fff4e6', keyIntensity: 2.6, fill: '#dcd8ff', metal: '#b8bcc6', wood: '#9a4a2e', ring: '#f5c542' },
    board: { width: 16, top: 8, bottom: -80 },
    spawn: { position: [-5, 5.05, 0.55], velocity: [1.2, 0, 0] },
    killY: -76,
    objects: [
      { type: 'wall', id: 'wall_left', position: [-8.2, -36, 0.6], size: [0.4, 92, 1.2], instrument: 'none' },
      { type: 'wall', id: 'wall_right', position: [8.2, -36, 0.6], size: [0.4, 92, 1.2], instrument: 'none' },
      { type: 'rail', id: 'rail_start', points: [[-5.4, 5, 0], [-3.5, 4.75, 0], [-1.5, 4.2, 0], [0.6, 3.9, 0], [2.2, 3.4, 0]] },
      { type: 'pad', id: 'pad_1', position: [3.7, 2.3, 0], angle: 53, color: '#d9534f', instrument: 'marimba', note: 'C5' },
      { type: 'pad', id: 'pad_2', position: [1.4, 0.2, 0], angle: -38, color: '#f0ad4e', instrument: 'marimba', note: 'E5' },
      { type: 'pad', id: 'pad_3', position: [4.5, -2, 0], angle: 42, color: '#5bc0de', instrument: 'marimba', note: 'G5' },
    ],
  };
}

export const environmentPresets: Record<string, NonNullable<LevelFile['environment']>> = {
  Daylight: { board: '#5f5d70', background: '#4b4a58', keyLight: '#fff4e6', keyIntensity: 2.6, fill: '#dcd8ff', metal: '#b8bcc6', wood: '#9a4a2e', ring: '#f5c542' },
  Neon: { board: '#1c1b26', background: '#0f0e16', keyLight: '#cfd6ff', keyIntensity: 2.2, fill: '#6e5bd6', metal: '#8f95a8', wood: '#5a3a6b', ring: '#7fe0ff' },
  Workshop: { board: '#d9cbb5', background: '#c7b8a1', keyLight: '#fff1d6', keyIntensity: 2.8, fill: '#f3e6d0', metal: '#6b6f7a', wood: '#7a4a2a', ring: '#e0533d' },
  Slate: { board: '#3b4048', background: '#2a2e35', keyLight: '#e8f0ff', keyIntensity: 2.4, fill: '#9fb3c8', metal: '#c9ced8', wood: '#a3552f', ring: '#ffd84a' },
};
