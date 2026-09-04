import * as THREE from 'three';
import { config } from '../core/Config';

/**
 * Three.js setup tuned for the reference look: a plain matte backboard, one
 * key light casting long soft shadows, and a soft sky fill.
 */
export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly keyLight: THREE.DirectionalLight;
  private readonly lightTarget = new THREE.Object3D();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x4b4a58);
    this.scene.fog = new THREE.Fog(0x4b4a58, 40, 90);

    this.camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 200);

    const hemi = new THREE.HemisphereLight(0xdcd8ff, 0x2a2630, 0.9);
    this.scene.add(hemi);

    this.keyLight = new THREE.DirectionalLight(0xfff4e6, 2.6);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.02;
    this.keyLight.shadow.radius = 6;
    const cam = this.keyLight.shadow.camera;
    cam.near = 1;
    cam.far = 80;
    cam.left = -18;
    cam.right = 18;
    cam.top = 18;
    cam.bottom = -18;
    this.scene.add(this.keyLight);
    this.scene.add(this.lightTarget);
    this.keyLight.target = this.lightTarget;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Keep the shadow frustum centred on the action so shadows stay crisp everywhere on a long board. */
  followLight(focus: THREE.Vector3): void {
    this.lightTarget.position.copy(focus);
    this.keyLight.position.set(focus.x - 9, focus.y + 14, focus.z + 22);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    this.camera.fov = config.camera.fov;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
