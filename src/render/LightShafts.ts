import * as THREE from 'three';
import type { EnvironmentDef } from '../levels/LevelTypes';

/**
 * The atmosphere of the reference clips: light from somewhere off-screen lands
 * as a soft slanted pool on the wall, so even a dark world stays readable. It
 * is faked cheaply with one additive gradient quad flat on the wall per
 * "window"; windows repeat down the board and alternate sides so the pools
 * scroll past as the marble descends. Nothing here touches the physics or the
 * real lights.
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


interface Board { width: number; top: number; bottom: number }

export class LightShafts {
  readonly group = new THREE.Group();
  private readonly beamMaterials: THREE.ShaderMaterial[] = [];
  private readonly quad = new THREE.PlaneGeometry(1, 1);
  private time = 0;

  constructor(_mobile = false) {}

  /** Rebuild the atmosphere for a level: strength/colour from the environment, extents from the board. */
  build(env: EnvironmentDef | undefined, board: Board): void {
    this.clear();
    const strength = env?.shaft ?? 0;
    if (strength <= 0) return;
    const color = new THREE.Color(env?.shaftColor ?? env?.keyLight ?? '#ffe6c0');
    const angle = THREE.MathUtils.degToRad(env?.shaftAngle ?? 24);
    const spacing = 34;
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

      // A soft pool of light on the wall, as if a window somewhere off-screen lit it.
      const pool = this.beam(color, strength * 0.075, 1.0, k * 1.7 + 1.1);
      pool.scale.x = 11;
      place(pool, 56, 27, 0, 0.03);
    }
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time % 1000;
    for (const m of this.beamMaterials) (m.uniforms.time as { value: number }).value = t;
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
    }
    for (const m of this.beamMaterials) m.dispose();
    this.beamMaterials.length = 0;
  }
}
