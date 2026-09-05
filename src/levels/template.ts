import type { LevelFile } from './LevelFormat';

/** A blank machine: board, walls and an opening rail. Everything else is the player's. */
export function blankLevel(name: string): LevelFile {
  return {
    format: 1,
    name,
    environment: { ...environmentPresets.Slate },
    board: { width: 16, top: 8, bottom: -80 },
    spawn: { position: [-5, 5.05, 0.55], velocity: [1.2, 0, 0] },
    killY: -76,
    objects: [
      { type: 'wall', id: 'wall_left', position: [-8.2, -36, 0.6], size: [0.4, 92, 1.2], instrument: 'none' },
      { type: 'wall', id: 'wall_right', position: [8.2, -36, 0.6], size: [0.4, 92, 1.2], instrument: 'none' },
      { type: 'rail', id: 'rail_start', points: [[-5.4, 5, 0], [-3.5, 4.75, 0], [-1.5, 4.2, 0], [0.6, 3.9, 0], [2.2, 3.4, 0]] },
      { type: 'pad', id: 'pad_1', position: [3.7, 2.3, 0], angle: 53, color: '#d9534f', instrument: 'marimba', note: 'C5' },
      { type: 'pad', id: 'pad_2', position: [1.4, 0.2, 0], angle: -38, color: '#d99a4e', instrument: 'marimba', note: 'E5' },
      { type: 'pad', id: 'pad_3', position: [4.5, -2, 0], angle: 42, color: '#5bc0de', instrument: 'marimba', note: 'G5' },
    ],
  };
}

export const environmentPresets: Record<string, NonNullable<LevelFile['environment']>> = {
  Charcoal: { 'board': '#2a2924', 'background': '#0a0a0c', 'keyLight': '#ffe9c8', 'keyIntensity': 1.5, 'keyRake': 0.6, 'fill': '#4a4670', 'fillIntensity': 0.5, 'rim': '#4d6fa8', 'rimIntensity': 0.4, 'metal': '#7f8aa8', 'wood': '#3f2a52', 'ring': '#f0e6c8', 'envIntensity': 0.18, 'exposure': 1.0, 'vignette': 0.5, 'padGlow': 0.55, 'padLight': 4, 'boardGrain': 0.7, 'shaft': 0.85, 'shaftColor': '#ffd9a3', 'shaftAngle': 26 },
  Slate: { 'board': '#3a3f47', 'background': '#181b20', 'keyLight': '#e8f0ff', 'keyIntensity': 2.2, 'keyRake': 0.5, 'fill': '#7d8fa8', 'fillIntensity': 0.4, 'rim': '#ffd9a8', 'rimIntensity': 0.6, 'metal': '#d0d5de', 'wood': '#a3552f', 'ring': '#f0e6c8', 'envIntensity': 0.35, 'exposure': 1.0, 'vignette': 0.45, 'padGlow': 0.3, 'padLight': 4, 'boardGrain': 0.5, 'shaft': 0.8, 'shaftColor': '#d8e6ff', 'shaftAngle': 20 },
  Dusk: { 'board': '#5b5970', 'background': '#2e2d38', 'keyLight': '#fff0d8', 'keyIntensity': 2.0, 'keyRake': 0.3, 'fill': '#c9c3ff', 'fillIntensity': 0.3, 'rim': '#b9c9ff', 'rimIntensity': 0.5, 'metal': '#c3c7d1', 'wood': '#9a4a2e', 'ring': '#f0e6c8', 'envIntensity': 0.25, 'exposure': 0.9, 'vignette': 0.4, 'padGlow': 0.0, 'padLight': 0.0, 'boardGrain': 0.25, 'shaft': 0.45, 'shaftColor': '#ffe9c4', 'shaftAngle': 24 },
  Midnight: { 'board': '#1f2233', 'background': '#0b0c14', 'keyLight': '#dfe8ff', 'keyIntensity': 1.7, 'keyRake': 0.55, 'fill': '#3c4a7a', 'fillIntensity': 0.5, 'rim': '#7fa0e0', 'rimIntensity': 0.5, 'metal': '#9aa6c4', 'wood': '#3a3f6b', 'ring': '#e6e9f5', 'envIntensity': 0.2, 'exposure': 1.0, 'vignette': 0.5, 'padGlow': 0.5, 'padLight': 4, 'boardGrain': 0.6, 'shaft': 0.8, 'shaftColor': '#c9d8ff', 'shaftAngle': 22 },
  Forest: { 'board': '#2c3a30', 'background': '#101915', 'keyLight': '#fff3d0', 'keyIntensity': 1.8, 'keyRake': 0.5, 'fill': '#5a7a62', 'fillIntensity': 0.45, 'rim': '#9fd8b0', 'rimIntensity': 0.45, 'metal': '#aab5a8', 'wood': '#6b4a2a', 'ring': '#efe8cf', 'envIntensity': 0.22, 'exposure': 1.0, 'vignette': 0.5, 'padGlow': 0.4, 'padLight': 3, 'boardGrain': 0.6, 'shaft': 0.75, 'shaftColor': '#ffe8b8', 'shaftAngle': 24 },
  Plum: { 'board': '#3a2a3d', 'background': '#150f18', 'keyLight': '#ffe4d6', 'keyIntensity': 1.7, 'keyRake': 0.55, 'fill': '#6a4a78', 'fillIntensity': 0.45, 'rim': '#c48fd6', 'rimIntensity': 0.45, 'metal': '#b8a6c0', 'wood': '#5a2f3f', 'ring': '#f2e6dc', 'envIntensity': 0.2, 'exposure': 1.0, 'vignette': 0.5, 'padGlow': 0.5, 'padLight': 4, 'boardGrain': 0.6, 'shaft': 0.8, 'shaftColor': '#ffd6c2', 'shaftAngle': 25 },
  Violet: { 'board': '#4a3670', 'background': '#1c1430', 'keyLight': '#fbe9ff', 'keyIntensity': 1.8, 'keyRake': 0.5, 'fill': '#8a6fc4', 'fillIntensity': 0.45, 'rim': '#c9b0ff', 'rimIntensity': 0.5, 'metal': '#c8c0dc', 'wood': '#6b3f8a', 'ring': '#f3e9ff', 'envIntensity': 0.25, 'exposure': 1.0, 'vignette': 0.45, 'padGlow': 0.45, 'padLight': 4, 'boardGrain': 0.5, 'shaft': 0.8, 'shaftColor': '#e6d2ff', 'shaftAngle': 24 },
  Clay: { 'board': '#7a6a5c', 'background': '#4a3f36', 'keyLight': '#fff0d0', 'keyIntensity': 2.0, 'keyRake': 0.35, 'fill': '#d8c8b0', 'fillIntensity': 0.35, 'rim': '#ffe9c4', 'rimIntensity': 0.5, 'metal': '#6f737e', 'wood': '#7a4a2a', 'ring': '#fff4e0', 'envIntensity': 0.35, 'exposure': 0.95, 'vignette': 0.45, 'padGlow': 0, 'padLight': 0, 'boardGrain': 0.4, 'shaft': 0.5, 'shaftColor': '#fff0cf', 'shaftAngle': 22 },
};
