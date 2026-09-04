import * as THREE from 'three';

/** Fine surface grain for the matte backboard, so light falls across it like a real wall. */
function grainTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(size, size);
  let seed = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = 118 + ((seed >>> 8) % 20);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 50);
  return tex;
}

const grain = grainTexture();
let padGlow = 0;

/** How strongly painted pieces glow (neon worlds light up, daylight worlds do not). */
export function setPadGlow(v: number): void {
  padGlow = v;
}

/** Apply a level's environment to the shared materials (renderer applies lights and sky). */
export function applyEnvironmentMaterials(env: { board: string; metal?: string; wood?: string; padGlow?: number } | undefined): void {
  visuals.board.color.set(env?.board ?? '#5f5d70');
  visuals.metal.color.set(env?.metal ?? '#b8bcc6');
  visuals.wood.color.set(env?.wood ?? '#9a4a2e');
  setPadGlow(env?.padGlow ?? 0);
}

/** Shared visual materials so the machine reads as one object family. */
export const visuals = {
  metal: new THREE.MeshStandardMaterial({ color: 0xb8bcc6, metalness: 1.0, roughness: 0.22 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x3a3c44, metalness: 0.9, roughness: 0.35 }),
  wood: new THREE.MeshPhysicalMaterial({ color: 0x9a4a2e, metalness: 0.0, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
  board: new THREE.MeshStandardMaterial({ color: 0x5f5d70, metalness: 0.0, roughness: 0.94, bumpMap: grain ?? undefined, bumpScale: 0.18 }),
  /** Painted, lacquered piece: the coloured pads and bumper caps. */
  colored(color: string | number | THREE.Color): THREE.MeshPhysicalMaterial {
    const c = new THREE.Color(color);
    return new THREE.MeshPhysicalMaterial({
      color: c,
      metalness: 0.0,
      roughness: 0.42,
      clearcoat: 0.45,
      clearcoatRoughness: 0.25,
      emissive: c.clone(),
      emissiveIntensity: padGlow,
    });
  },
};

export const geometries = {
  unitBox: new THREE.BoxGeometry(1, 1, 1),
  unitSphere: new THREE.SphereGeometry(1, 16, 12),
  /** Unit cylinder along Y. */
  unitCylinder: new THREE.CylinderGeometry(1, 1, 1, 24, 1),
};
