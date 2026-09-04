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
  Daylight: { 'board': '#55536a', 'background': '#2c2b36', 'keyLight': '#fff0d8', 'keyIntensity': 3.6, 'fill': '#c9c3ff', 'fillIntensity': 0.16, 'rim': '#b9c9ff', 'rimIntensity': 0.5, 'marbleLight': '#ffd9a8', 'metal': '#c3c7d1', 'wood': '#9a4a2e', 'ring': '#f5c542', 'envIntensity': 0.22, 'exposure': 0.95, 'bloom': 0.15, 'bloomThreshold': 0.92, 'vignette': 0.45, 'padGlow': 0.0 },
  Neon: { 'board': '#101018', 'background': '#06060b', 'keyLight': '#c9d4ff', 'keyIntensity': 1.6, 'fill': '#4a3f9e', 'fillIntensity': 0.15, 'rim': '#7fe0ff', 'rimIntensity': 0.9, 'marbleLight': '#ffffff', 'metal': '#8f95a8', 'wood': '#3f2a52', 'ring': '#7fe0ff', 'envIntensity': 0.15, 'exposure': 1.0, 'bloom': 0.6, 'bloomThreshold': 0.6, 'vignette': 0.55, 'padGlow': 0.45 },
  Workshop: { board: '#cdbfa6', background: '#a89a84', keyLight: '#fff0d0', keyIntensity: 3.0, fill: '#efe2cc', rim: '#ffe9c4', marbleLight: '#ffe2b8', metal: '#5f636e', wood: '#7a4a2a', ring: '#e0533d', envIntensity: 0.7, exposure: 0.95, bloom: 0.12, bloomThreshold: 0.95, vignette: 0.45, padGlow: 0 },
  Slate: { board: '#3a3f47', background: '#20242a', keyLight: '#e8f0ff', keyIntensity: 2.4, fill: '#8ea3ba', rim: '#ffd9a8', marbleLight: '#ffd9a8', metal: '#d0d5de', wood: '#a3552f', ring: '#ffd84a', envIntensity: 0.5, exposure: 1.0, bloom: 0.3, bloomThreshold: 0.8, vignette: 0.45, padGlow: 0.15 },
};
