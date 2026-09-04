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
 * Cinematic setup for the machine: image-based lighting so metal and glossy
 * paint reflect a room, a warm key light casting long soft shadows, a cool rim
 * light for edge definition, a small warm light travelling with the marble, and
 * a post chain of bloom, vignette and grain. Every environment tunes the mood.
 */
export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly keyLight: THREE.DirectionalLight;
  readonly rimLight: THREE.DirectionalLight;
  readonly marbleLight: THREE.PointLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly lightTarget = new THREE.Object3D();
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly vignette: ShaderPass;
  private readonly mobile: boolean;
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

    // Image-based lighting: a neutral room so surfaces have something to reflect.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 200);

    this.hemi = new THREE.HemisphereLight(0xdcd8ff, 0x2a2630, 0.3);
    this.scene.add(this.hemi);

    this.keyLight = new THREE.DirectionalLight(0xfff4e6, 2.4);
    this.keyLight.castShadow = true;
    const size = this.mobile ? 1024 : 2048;
    this.keyLight.shadow.mapSize.set(size, size);
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.02;
    this.keyLight.shadow.radius = this.mobile ? 3 : 5;
    const cam = this.keyLight.shadow.camera;
    cam.near = 1;
    cam.far = 120;
    cam.left = -16;
    cam.right = 16;
    cam.top = 16;
    cam.bottom = -16;
    this.scene.add(this.keyLight);
    this.scene.add(this.lightTarget);
    this.keyLight.target = this.lightTarget;

    // Rim light from the opposite side, cool, no shadows: separates objects from the board.
    this.rimLight = new THREE.DirectionalLight(0xbfd4ff, 0.9);
    this.scene.add(this.rimLight);
    this.rimLight.target = this.lightTarget;

    // A small warm light rides with the marble so the pads it approaches brighten.
    this.marbleLight = new THREE.PointLight(0xffd9a8, 3.5, 5, 2);
    this.scene.add(this.marbleLight);

    // Post: MSAA render target, bloom for glow, vignette and grain, then output (tone map + sRGB).
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

  /** Every song has its own world: sky, board tint, lighting and post come from the level. */
  applyEnvironment(env: EnvironmentDef | undefined): void {
    const background = env?.background ?? '#4b4a58';
    this.scene.background = new THREE.Color(background);
    this.scene.fog = new THREE.Fog(background, 45, 110);
    this.keyLight.color.set(env?.keyLight ?? '#fff4e6');
    this.keyLight.intensity = env?.keyIntensity ?? 2.4;
    this.hemi.color.set(env?.fill ?? '#dcd8ff');
    this.hemi.intensity = env?.fillIntensity ?? 0.3;
    this.hemi.groundColor.set(background).multiplyScalar(0.5);
    this.rimLight.intensity = env?.rimIntensity ?? 0.8;
    this.rimLight.color.set(env?.rim ?? '#bfd4ff');
    this.marbleLight.color.set(env?.marbleLight ?? '#ffd9a8');
    this.scene.environmentIntensity = env?.envIntensity ?? 0.35;
    this.renderer.toneMappingExposure = env?.exposure ?? 1.0;
    this.bloom.strength = env?.bloom ?? 0.25;
    this.bloom.threshold = env?.bloomThreshold ?? 0.85;
    (this.vignette.uniforms.strength as { value: number }).value = env?.vignette ?? 0.35;
  }

  /** Keep the shadow frustum and the lights centred on the action, so shadows stay crisp on a long board. */
  followLight(focus: THREE.Vector3, marble?: THREE.Vector3): void {
    this.lightTarget.position.copy(focus);
    // Low, raking key light: long shadows down and to the right, as in the references.
    this.keyLight.position.set(focus.x - 14, focus.y + 20, focus.z + 15);
    this.rimLight.position.set(focus.x + 12, focus.y - 6, focus.z + 10);
    if (marble) this.marbleLight.position.set(marble.x, marble.y, 1.6);
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
