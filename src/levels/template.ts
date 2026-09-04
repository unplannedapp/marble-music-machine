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
  Daylight: { 'board': '#5b5970', 'background': '#2e2d38', 'keyLight': '#fff0d8', 'keyIntensity': 2.4, 'keyRake': 0.3, 'fill': '#c9c3ff', 'fillIntensity': 0.2, 'rim': '#b9c9ff', 'rimIntensity': 0.5, 'metal': '#c3c7d1', 'wood': '#9a4a2e', 'ring': '#f5c542', 'envIntensity': 0.25, 'exposure': 0.9, 'bloom': 0.1, 'bloomThreshold': 0.95, 'vignette': 0.4, 'padGlow': 0.0, 'padLight': 0.0, 'boardGrain': 0.25 },
  Neon: { 'board': '#2a2924', 'background': '#0a0a0c', 'keyLight': '#ffe9c8', 'keyIntensity': 2.6, 'keyRake': 0.6, 'fill': '#2b2740', 'fillIntensity': 0.3, 'rim': '#4d6fa8', 'rimIntensity': 0.4, 'metal': '#7f8aa8', 'wood': '#3f2a52', 'ring': '#ffd84a', 'envIntensity': 0.18, 'exposure': 1.0, 'bloom': 0.4, 'bloomThreshold': 0.75, 'vignette': 0.5, 'padGlow': 0.9, 'padLight': 9, 'boardGrain': 0.7 },
  Workshop: { 'board': '#c9bba3', 'background': '#8f836f', 'keyLight': '#fff0d0', 'keyIntensity': 3.0, 'keyRake': 0.35, 'fill': '#efe2cc', 'fillIntensity': 0.3, 'rim': '#ffe9c4', 'rimIntensity': 0.5, 'metal': '#5f636e', 'wood': '#7a4a2a', 'ring': '#e0533d', 'envIntensity': 0.45, 'exposure': 0.95, 'bloom': 0.1, 'bloomThreshold': 0.95, 'vignette': 0.45, 'padGlow': 0, 'padLight': 0, 'boardGrain': 0.35 },
  Slate: { 'board': '#3a3f47', 'background': '#181b20', 'keyLight': '#e8f0ff', 'keyIntensity': 2.8, 'keyRake': 0.5, 'fill': '#7d8fa8', 'fillIntensity': 0.3, 'rim': '#ffd9a8', 'rimIntensity': 0.6, 'metal': '#d0d5de', 'wood': '#a3552f', 'ring': '#ffd84a', 'envIntensity': 0.35, 'exposure': 1.0, 'bloom': 0.25, 'bloomThreshold': 0.85, 'vignette': 0.45, 'padGlow': 0.3, 'padLight': 4, 'boardGrain': 0.5 },
};
