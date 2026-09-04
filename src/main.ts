import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { config } from './core/Config';
import { GameLoop } from './core/GameLoop';
import { Simulation, initRapier } from './sim/Simulation';
import { playground } from './levels/playground';
import { SceneRenderer } from './render/SceneRenderer';
import { FollowCamera } from './render/FollowCamera';
import { createMarbleMesh } from './render/marbleVisual';
import { DebugPanel } from './debug/DebugPanel';

async function main(): Promise<void> {
  await initRapier();

  const container = document.getElementById('app')!;
  const hud = document.getElementById('hud')!;

  const sim = new Simulation();
  sim.marble.root.add(createMarbleMesh(sim.marble.radius));
  sim.load(playground);

  const view = new SceneRenderer(container);
  view.scene.add(sim.scene);
  const follow = new FollowCamera(view.camera);
  follow.setFitWidth(playground.board.width + 2);
  const orbit = new OrbitControls(view.camera, view.renderer.domElement);
  orbit.enabled = false;
  orbit.enableDamping = true;
  let freeCamera = false;

  const marblePos = new THREE.Vector3();
  const marbleVel = new THREE.Vector3();
  const focus = new THREE.Vector3();
  let fps = 60;

  const loop = new GameLoop(config.physics.fixedDt, config.physics.maxSubSteps, {
    fixedUpdate: (dt) => sim.fixedUpdate(dt),
    render: (alpha, frameDt) => {
      sim.renderUpdate(alpha, frameDt);
      sim.marble.root.getWorldPosition(marblePos);
      sim.marble.velocity(marbleVel);
      if (freeCamera) {
        orbit.update();
      } else {
        follow.update(marblePos, marbleVel, frameDt);
      }
      follow.currentFocus(focus);
      view.followLight(freeCamera ? marblePos : focus);
      debug.update();
      view.render();

      fps = fps * 0.95 + (1 / Math.max(frameDt, 1e-3)) * 0.05;
      const lc = sim.lastContact;
      hud.textContent =
        `t ${sim.simTime.toFixed(2)}s   ${fps.toFixed(0)} fps${loop.paused ? '   PAUSED' : ''}\n` +
        `speed ${sim.marble.speed().toFixed(2)}   contacts ${sim.physics.contactCount}\n` +
        (lc ? `last hit ${lc.object.id}  impact ${lc.impactSpeed.toFixed(2)}  @ ${lc.simTime.toFixed(2)}s` : 'last hit -');
    },
  });
  const debug = new DebugPanel(sim, loop, view.scene);

  sim.bus.on('marble:reset', () => {
    follow.snapTo(sim.marble.position());
  });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    switch (e.key) {
      case 'r':
      case 'R':
        sim.resetMarble('manual');
        break;
      case ' ':
        loop.paused = !loop.paused;
        e.preventDefault();
        break;
      case '.':
        loop.stepOnce();
        break;
      case 'c':
      case 'C':
        freeCamera = !freeCamera;
        orbit.enabled = freeCamera;
        if (freeCamera) orbit.target.copy(marblePos);
        break;
    }
  });

  follow.snapTo(sim.marble.position());
  loop.start();

  // Expose for console tinkering and automated checks.
  (window as unknown as { mmm: unknown }).mmm = { sim, loop, config };
}

main().catch((err) => {
  console.error(err);
  document.getElementById('hud')!.textContent = `Failed to start: ${err}`;
});
