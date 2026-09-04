import * as THREE from 'three';

/** Fine surface grain for the matte backboard, so light falls across it like a real wall. */
function grainTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  // Two octaves of value noise: coarse plaster lumps with fine grit on top.
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const coarse = Array.from({ length: 32 * 32 }, rnd);
  const fine = Array.from({ length: size * size }, rnd);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = (x / size) * 32;
      const cy = (y / size) * 32;
      const x0 = Math.floor(cx) % 32, y0 = Math.floor(cy) % 32;
      const x1 = (x0 + 1) % 32, y1 = (y0 + 1) % 32;
      const fx = cx - Math.floor(cx), fy = cy - Math.floor(cy);
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const c = (coarse[y0 * 32 + x0] * (1 - sx) + coarse[y0 * 32 + x1] * sx) * (1 - sy) + (coarse[y1 * 32 + x0] * (1 - sx) + coarse[y1 * 32 + x1] * sx) * sy;
      const v = Math.round(90 + c * 110 + (fine[y * size + x] - 0.5) * 36);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 40);
  return tex;
}

const grain = grainTexture();
let padGlow = 0;

/** How strongly painted pieces glow (neon worlds light up, daylight worlds do not). */
export function setPadGlow(v: number): void {
  padGlow = v;
}

/** Apply a level's environment to the shared materials (renderer applies lights and sky). */
export function applyEnvironmentMaterials(env: { board: string; metal?: string; wood?: string; padGlow?: number; boardGrain?: number } | undefined): void {
  visuals.board.color.set(env?.board ?? '#5f5d70');
  visuals.board.bumpScale = env?.boardGrain ?? 0.2;
  visuals.metal.color.set(env?.metal ?? '#b8bcc6');
  visuals.wood.color.set(env?.wood ?? '#9a4a2e');
  setPadGlow(env?.padGlow ?? 0);
}

/** Shared visual materials so the machine reads as one object family. */
export const visuals = {
  metal: new THREE.MeshStandardMaterial({ color: 0xb8bcc6, metalness: 1.0, roughness: 0.22 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x3a3c44, metalness: 0.9, roughness: 0.35 }),
  wood: new THREE.MeshPhysicalMaterial({ color: 0x9a4a2e, metalness: 0.0, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
  board: new THREE.MeshStandardMaterial({ color: 0x5f5d70, metalness: 0.0, roughness: 0.9, bumpScale: 0.2, ...(grain ? { bumpMap: grain } : {}) }),
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
