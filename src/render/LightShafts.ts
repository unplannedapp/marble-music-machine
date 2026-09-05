import * as THREE from 'three';
import type { EnvironmentDef } from '../levels/LevelTypes';

/**
 * The atmosphere of the reference clips: a slanted shaft of light crosses the
 * room, hangs in the haze, and lands as a soft pool on the wall, so even a dark
 * world stays readable. It is faked cheaply: a few additive gradient quads in
 * front of the board (the haze), one flat on the wall (the pool), and a cloud of
 * dust motes that only glow where they sit inside a beam. Windows repeat down
 * the board so the shafts scroll past as the marble descends. Nothing here
 * touches the physics or the real lights.
 */

const BeamShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform float strength;
    uniform float time;
    uniform float seed;
    uniform float softness;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    void main() {
      float x = abs(vUv.x - 0.5) * 2.0;
      // A defined band with a soft edge (softness = how far the edge blurs in), not a fog.
      float across = smoothstep(1.0, 1.0 - softness, x);
      // Bright near the source (top), thinning out with distance and never a hard end.
      float along = pow(vUv.y, 0.7) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
      // Streaks: fine structure across the beam, long along it, drifting slowly.
      float n = noise(vec2(vUv.x * 14.0 + seed, vUv.y * 1.6 - time * 0.03 + seed));
      float n2 = noise(vec2(vUv.x * 5.0 - seed, vUv.y * 0.8 + time * 0.02));
      float shimmer = 0.55 + 0.45 * mix(n, n2, 0.5);
      float a = across * along * shimmer * strength;
      gl_FragColor = vec4(color * a, 1.0);
    }`,
};

const DustShader = {
  vertexShader: /* glsl */ `
    attribute float glow;
    attribute float seed;
    uniform float time;
    uniform float strength;
    uniform float size;
    varying float vA;
    void main() {
      vec3 p = position;
      p.x += sin(time * 0.21 + seed * 6.2831) * 0.5;
      p.y += cos(time * 0.17 + seed * 9.4) * 0.35;
      p.z += sin(time * 0.13 + seed * 4.1) * 0.3;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = size * (240.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
      vA = glow * strength * (0.6 + 0.4 * sin(time * 0.5 + seed * 30.0));
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    varying float vA;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.12, d) * vA;
      gl_FragColor = vec4(color * a, 1.0);
    }`,
};

interface Board { width: number; top: number; bottom: number }

export class LightShafts {
  readonly group = new THREE.Group();
  private readonly beamMaterials: THREE.ShaderMaterial[] = [];
  private dustMaterial: THREE.ShaderMaterial | null = null;
  private readonly quad = new THREE.PlaneGeometry(1, 1);
  private time = 0;

  constructor(private readonly mobile: boolean) {}

  /** Rebuild the atmosphere for a level: strength/colour from the environment, extents from the board. */
  build(env: EnvironmentDef | undefined, board: Board): void {
    this.clear();
    const strength = env?.shaft ?? 0;
    if (strength <= 0) return;
    const color = new THREE.Color(env?.shaftColor ?? env?.keyLight ?? '#ffe6c0');
    const angle = THREE.MathUtils.degToRad(env?.shaftAngle ?? 24);
    const spacing = 34;
    const dustPositions: number[] = [];
    const dustGlow: number[] = [];
    const dustSeed: number[] = [];
    const rng = mulberry32(7);

    let k = 0;
    for (let y = board.top - 2; y > board.bottom - 10; y -= spacing, k++) {
      const side = k % 2 === 0 ? 1 : -1; // alternate the window the light comes through
      const originX = side * (board.width / 2 + 5);
      const down = new THREE.Vector2(-side * Math.sin(angle), -Math.cos(angle));
      const place = (mesh: THREE.Mesh, length: number, along: number, lateral: number, z: number, tilt = 0) => {
        const c = down.clone().multiplyScalar(along).add(new THREE.Vector2(originX, y + 12));
        c.add(new THREE.Vector2(down.y, -down.x).multiplyScalar(lateral));
        mesh.position.set(c.x, c.y, z);
        mesh.rotation.z = -side * angle + tilt;
        mesh.scale.y = length;
      };

      // Main shaft in the haze, a thinner companion at a different depth for parallax, and the pool on the wall.
      const main = this.beam(color, strength * 0.1, 0.4, k * 1.7);
      main.scale.x = 3.4;
      place(main, 52, 26, 0, 3.2);
      const ray2 = this.beam(color, strength * 0.07, 0.7, k * 1.7 + 0.5);
      ray2.scale.x = 1.2;
      place(ray2, 46, 23, side * 2.7, 4.8, side * 0.04);
      const ray3 = this.beam(color, strength * 0.06, 0.8, k * 1.7 + 0.9);
      ray3.scale.x = 0.7;
      place(ray3, 40, 20, -side * 2.4, 2.2, -side * 0.03);
      const pool = this.beam(color, strength * 0.05, 0.9, k * 1.7 + 1.1);
      pool.scale.x = 4.5;
      place(pool, 50, 24, 0, 0.03);

      // Dust that glows where it sits inside the main beam.
      const n = this.mobile ? 70 : 130;
      for (let i = 0; i < n; i++) {
        const t = 4 + rng() * 44;
        const lateral = (rng() * 2 - 1) * 4.5;
        const c = down.clone().multiplyScalar(t).add(new THREE.Vector2(originX, y + 12));
        c.add(new THREE.Vector2(down.y, -down.x).multiplyScalar(lateral));
        const z = 0.6 + rng() * 6;
        const across = Math.max(0, 1 - Math.abs(lateral) / 1.8);
        const glow = Math.pow(across, 1.6) * Math.pow(1 - t / 52, 0.7);
        dustPositions.push(c.x, c.y, z);
        dustGlow.push(glow * (0.5 + rng() * 0.5));
        dustSeed.push(rng());
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
    geo.setAttribute('glow', new THREE.Float32BufferAttribute(dustGlow, 1));
    geo.setAttribute('seed', new THREE.Float32BufferAttribute(dustSeed, 1));
    this.dustMaterial = new THREE.ShaderMaterial({
      uniforms: { color: { value: color }, strength: { value: strength * 0.6 }, time: { value: 0 }, size: { value: this.mobile ? 2.2 : 2.6 } },
      vertexShader: DustShader.vertexShader,
      fragmentShader: DustShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(geo, this.dustMaterial);
    dust.frustumCulled = false;
    this.group.add(dust);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time % 1000;
    for (const m of this.beamMaterials) (m.uniforms.time as { value: number }).value = t;
    if (this.dustMaterial) (this.dustMaterial.uniforms.time as { value: number }).value = t;
  }

  private beam(color: THREE.Color, strength: number, softness: number, seed: number): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: color }, strength: { value: strength }, time: { value: 0 }, seed: { value: seed }, softness: { value: softness } },
      vertexShader: BeamShader.vertexShader,
      fragmentShader: BeamShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.beamMaterials.push(mat);
    const mesh = new THREE.Mesh(this.quad, mat);
    mesh.renderOrder = 5;
    this.group.add(mesh);
    return mesh;
  }

  private clear(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof THREE.Points) child.geometry.dispose();
    }
    for (const m of this.beamMaterials) m.dispose();
    this.beamMaterials.length = 0;
    this.dustMaterial?.dispose();
    this.dustMaterial = null;
  }
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
