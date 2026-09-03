import GUI from 'lil-gui';
import * as THREE from 'three';
import { config } from '../core/Config';
import type { Simulation } from '../sim/Simulation';
import type { GameLoop } from '../core/GameLoop';

/** Live tuning panel plus a Rapier collider overlay. */
export class DebugPanel {
  readonly gui: GUI;
  private readonly colliderLines: THREE.LineSegments;

  constructor(
    private readonly sim: Simulation,
    loop: GameLoop,
    scene: THREE.Scene,
  ) {
    this.gui = new GUI({ title: 'Marble Machine' });
    const gui = this.gui;
    const apply = () => sim.applyConfig();

    const phys = gui.addFolder('Physics');
    phys.add(config.physics, 'gravity', 2, 30, 0.1).onChange(apply);
    phys.add(config.physics, 'tiltDeg', 20, 90, 1).name('board tilt °').onChange(apply);
    phys.add(config.physics, 'timeScale', 0.05, 2, 0.05).onChange((v: number) => (loop.timeScale = v));
    phys.add(config.physics, 'solverIterations', 2, 16, 1).onChange(apply);

    const marble = gui.addFolder('Marble');
    marble.add(config.marble, 'restitution', 0, 1, 0.01).onChange(apply);
    marble.add(config.marble, 'friction', 0, 1.5, 0.01).onChange(apply);
    marble.add(config.marble, 'linearDamping', 0, 1, 0.01).onChange(apply);
    marble.add(config.marble, 'angularDamping', 0, 3, 0.01).name('rolling resistance').onChange(apply);

    const objs = gui.addFolder('Objects');
    objs.add(config.bumper, 'kick', 0, 12, 0.1).name('bumper kick');
    objs.add(config.pad, 'stiffness', 10, 1000, 5).name('pad spring').onChange(apply);
    objs.add(config.pad, 'damping', 0, 60, 0.5).name('pad damping').onChange(apply);
    objs.close();

    const cam = gui.addFolder('Camera');
    cam.add(config.camera, 'distance', 6, 40, 0.5);
    cam.add(config.camera, 'pitchDeg', 0, 60, 1);
    cam.add(config.camera, 'lookAheadTime', 0, 1, 0.01);
    cam.add(config.camera, 'smoothTime', 0.02, 1.5, 0.01);
    cam.add(config.camera, 'xFollow', 0, 1, 0.05);
    cam.close();

    gui.add(config.debug, 'showColliders').name('show colliders');
    gui.add({ reset: () => sim.resetMarble('manual') }, 'reset').name('Reset marble (R)');

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute([], 4));
    this.colliderLines = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
    this.colliderLines.renderOrder = 999;
    this.colliderLines.frustumCulled = false;
    scene.add(this.colliderLines);
  }

  update(): void {
    this.colliderLines.visible = config.debug.showColliders;
    if (!config.debug.showColliders) return;
    const buffers = this.sim.physics.world.debugRender();
    const geom = this.colliderLines.geometry;
    geom.setAttribute('position', new THREE.Float32BufferAttribute(buffers.vertices, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 4));
  }
}
