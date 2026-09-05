import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { config } from '../core/Config';
import type { EnvironmentDef, LevelDef } from '../levels/LevelTypes';
import { LightShafts } from './LightShafts';

/** Screen-space vignette and a touch of film grain, applied after tone mapping. */
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    strength: { value: 0.35 },
    grain: { value: 0.012 },
    time: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform float grain;
    uniform float time;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + time) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = 1.0 - smoothstep(0.35, 0.95, dot(d, d) * 2.2) * strength;
      float n = (hash(gl_FragCoord.xy) - 0.5) * grain;
      gl_FragColor = vec4(c.rgb * v + n, c.a);
    }`,
};

/**
 * The reference look: slanted shafts of light hang in the haze of the room and
 * pool on the wall (LightShafts), so even a dark world reads; one raking
 * spotlight high above the action models the objects and throws long soft
 * shadows down the wall. A neutral room provides reflections for
 * metal and lacquer, a cool rim light draws edges, and lit pads spill colour
 * (see PadLights). The marble gets no light of its own. No bloom: what is
 * bright is bright. Desktop gets an MSAA target plus vignette and grain in a
 * single post pass; phones render straight to the canvas (hardware AA, CSS
 * vignette) because every extra full-screen pass costs frame time there.
 */
export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly keyLight: THREE.SpotLight;
  readonly rimLight: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly lightTarget = new THREE.Object3D();
  private readonly composer: EffectComposer | null;
  private readonly vignette: ShaderPass | null;
  private readonly cssVignette: HTMLDivElement | null;
  readonly mobile: boolean;
  private readonly shafts: LightShafts;
  private board: LevelDef['board'] = { width: 16, top: 8, bottom: -80 };
  private keyOffset = new THREE.Vector3(8, 24, 30);
  private time = 0;

  constructor(container: HTMLElement) {
    this.mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
    this.renderer = new THREE.WebGLRenderer({ antialias: this.mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 200);

    this.hemi = new THREE.HemisphereLight(0xdcd8ff, 0x2a2630, 0.25);
    this.scene.add(this.hemi);

    // Raking key: a spotlight so light falls off across the wall like a lamp, not a sun.
    this.keyLight = new THREE.SpotLight(0xfff0d8, 900, 120, Math.PI / 4.6, 0.9, 1.15);
    this.keyLight.castShadow = true;
    const size = this.mobile ? 1024 : 2048;
    this.keyLight.shadow.mapSize.set(size, size);
    this.keyLight.shadow.bias = -0.0003;
    this.keyLight.shadow.normalBias = 0.02;
    this.keyLight.shadow.radius = this.mobile ? 2 : 3;
    this.keyLight.shadow.camera.near = 4;
    this.keyLight.shadow.camera.far = 110;
    this.scene.add(this.keyLight);
    this.scene.add(this.lightTarget);
    this.keyLight.target = this.lightTarget;

    this.rimLight = new THREE.DirectionalLight(0xbfd4ff, 0.7);
    this.scene.add(this.rimLight);
    this.rimLight.target = this.lightTarget;

    this.shafts = new LightShafts(this.mobile);
    this.scene.add(this.shafts.group);

    if (this.mobile) {
      this.composer = null;
      this.vignette = null;
      this.cssVignette = document.createElement('div');
      this.cssVignette.className = 'vignette';
      container.appendChild(this.cssVignette);
    } else {
      const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.vignette = new ShaderPass(VignetteShader);
      this.composer.addPass(this.vignette);
      this.composer.addPass(new OutputPass());
      this.cssVignette = null;
    }

    this.applyEnvironment(undefined);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Every song has its own world: sky, lighting and post come from the level. */
  applyEnvironment(env: EnvironmentDef | undefined, board?: LevelDef['board']): void {
    if (board) this.board = board;
    const background = env?.background ?? '#4b4a58';
    this.scene.background = new THREE.Color(background);
    this.scene.fog = new THREE.Fog(background, 50, 120);
    this.keyLight.color.set(env?.keyLight ?? '#fff0d8');
    // Softer than a stage lamp: the shafts and fill carry the mood, the key only models the objects.
    this.keyLight.intensity = (env?.keyIntensity ?? 2.4) * 150;
    const rake = env?.keyRake ?? 0.35;
    // Rake: 0 = overhead, 1 = grazing along the wall (longer shadows, stronger texture).
    this.keyOffset.set(7, 10 + rake * 28, 30 - rake * 14);
    this.hemi.color.set(env?.fill ?? '#dcd8ff');
    this.hemi.intensity = env?.fillIntensity ?? 0.25;
    this.hemi.groundColor.set(background).multiplyScalar(0.5);
    this.rimLight.color.set(env?.rim ?? '#bfd4ff');
    this.rimLight.intensity = env?.rimIntensity ?? 0.7;
    this.scene.environmentIntensity = env?.envIntensity ?? 0.3;
    this.renderer.toneMappingExposure = env?.exposure ?? 1.0;
    const vignette = env?.vignette ?? 0.35;
    if (this.vignette) (this.vignette.uniforms.strength as { value: number }).value = vignette;
    if (this.cssVignette) this.cssVignette.style.opacity = String(vignette);
    this.shafts.build(env, this.board);
  }

  /** Keep the lights centred on the action so shadows stay crisp on a long board. */
  followLight(focus: THREE.Vector3): void {
    this.lightTarget.position.copy(focus);
    this.keyLight.position.set(focus.x + this.keyOffset.x, focus.y + this.keyOffset.y, this.keyOffset.z);
    this.rimLight.position.set(focus.x - 12, focus.y - 8, focus.z + 10);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, true);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = config.camera.fov;
    this.camera.updateProjectionMatrix();
  }

  render(frameDt = 0.016): void {
    this.time += frameDt;
    this.shafts.update(frameDt);
    if (this.composer && this.vignette) {
      (this.vignette.uniforms.time as { value: number }).value = this.time % 1000;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
