import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { config } from '../core/Config';
import type { EnvironmentDef } from '../levels/LevelTypes';

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
 * The reference look: one raking spotlight high above the action throws long
 * soft shadows down the wall and falls off with distance, so even a dark world
 * reads through the texture it lights. A neutral room provides reflections for
 * metal and lacquer, a cool rim light draws edges, and lit pads spill colour
 * (see PadLights). The marble gets no light of its own. Post: MSAA target,
 * bloom for what is actually bright, vignette and grain.
 */
export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly keyLight: THREE.SpotLight;
  readonly rimLight: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly lightTarget = new THREE.Object3D();
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly vignette: ShaderPass;
  private readonly mobile: boolean;
  private keyOffset = new THREE.Vector3(8, 24, 30);
  private time = 0;

  constructor(container: HTMLElement) {
    this.mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    this.keyLight = new THREE.SpotLight(0xfff0d8, 900, 120, Math.PI / 5.2, 0.75, 1.15);
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

    const target = new THREE.WebGLRenderTarget(1, 1, { samples: this.mobile ? 2 : 4, type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.25, 0.6, 0.85);
    this.composer.addPass(this.bloom);
    this.vignette = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignette);
    this.composer.addPass(new OutputPass());

    this.applyEnvironment(undefined);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Every song has its own world: sky, lighting and post come from the level. */
  applyEnvironment(env: EnvironmentDef | undefined): void {
    const background = env?.background ?? '#4b4a58';
    this.scene.background = new THREE.Color(background);
    this.scene.fog = new THREE.Fog(background, 50, 120);
    this.keyLight.color.set(env?.keyLight ?? '#fff0d8');
    this.keyLight.intensity = (env?.keyIntensity ?? 2.4) * 260;
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
    this.bloom.strength = env?.bloom ?? 0.25;
    this.bloom.threshold = env?.bloomThreshold ?? 0.85;
    (this.vignette.uniforms.strength as { value: number }).value = env?.vignette ?? 0.35;
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
    this.composer.setSize(w, h);
    this.bloom.setSize(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.fov = config.camera.fov;
    this.camera.updateProjectionMatrix();
  }

  render(frameDt = 0.016): void {
    this.time += frameDt;
    (this.vignette.uniforms.time as { value: number }).value = this.time % 1000;
    this.composer.render();
  }
}
