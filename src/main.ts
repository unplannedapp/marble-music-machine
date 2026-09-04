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
import { AudioEngine } from './audio/AudioEngine';
import { MusicSystem } from './audio/MusicSystem';
import { HitEffects } from './render/HitEffects';
import { ScoreSystem } from './game/Scoring';
import { alphabetSong } from './songs/alphabet';
import { Hud } from './ui/Hud';
import { TargetRings } from './render/TargetRings';

async function main(): Promise<void> {
  await initRapier();

  const container = document.getElementById('app')!;
  const hud = document.getElementById('hud')!;
  const start = document.getElementById('start')!;
  const gameHud = document.getElementById('game-hud')!;
  const pauseBtn = document.getElementById('btn-pause')!;
  const tuneBtn = document.getElementById('btn-tune')!;

  const sim = new Simulation();
  sim.marble.root.add(createMarbleMesh(sim.marble.radius));
  sim.load(playground);

  const view = new SceneRenderer(container);
  view.scene.add(sim.scene);

  // Sound: browsers only allow audio after a gesture, so the machine waits for a tap.
  const audio = new AudioEngine();
  const music = new MusicSystem(sim, audio);
  const effects = new HitEffects(sim.bus);
  view.scene.add(effects.group);

  // Song, timing, combo and score.
  const scoring = new ScoreSystem(sim, alphabetSong);
  const rings = new TargetRings(sim, scoring);
  view.scene.add(rings.group);
  const overlay = new Hud(gameHud, sim.bus, view.camera, scoring, sim.marble.root);
  let lastNote = '';
  let noteCount = 0;
  sim.bus.on('music:note', (n) => {
    noteCount++;
    lastNote = `${n.instrument}${n.note ? ' ' + n.note : ''}  vel ${n.velocity.toFixed(2)}`;
  });
  const follow = new FollowCamera(view.camera);
  const orbit = new OrbitControls(view.camera, view.renderer.domElement);
  orbit.enabled = false;
  orbit.enableDamping = true;
  let freeCamera = false;

  const marblePos = new THREE.Vector3();
  const marbleVel = new THREE.Vector3();
  const focus = new THREE.Vector3();
  let fps = 60;

  const loop = new GameLoop(config.physics.fixedDt, config.physics.maxSubSteps, {
    fixedUpdate: (dt) => {
      sim.fixedUpdate(dt);
      scoring.fixedUpdate();
    },
    render: (alpha, frameDt) => {
      sim.renderUpdate(alpha, frameDt);
      audio.syncClock(sim.simTime);
      music.update();
      effects.update(frameDt);
      rings.update(frameDt);
      overlay.update();
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
      if (!hud.hidden) hud.textContent =
        `t ${sim.simTime.toFixed(2)}s   ${fps.toFixed(0)} fps${loop.paused ? '   PAUSED' : ''}\n` +
        `speed ${sim.marble.speed().toFixed(2)}   contacts ${sim.physics.contactCount}\n` +
        (lc ? `last hit ${lc.object.id}  impact ${lc.impactSpeed.toFixed(2)}  @ ${lc.simTime.toFixed(2)}s` : 'last hit -') +
        (lastNote ? `\nnote ${lastNote}` : '');
    },
  });
  const debug = new DebugPanel(sim, loop, view.scene, audio);

  sim.bus.on('marble:reset', () => {
    follow.snapTo(sim.marble.position());
    music.reset();
  });

  // Hold the machine until the first tap, which also unlocks audio.
  loop.paused = true;
  const begin = async (): Promise<void> => {
    await audio.unlock();
    start.hidden = true;
    loop.paused = false;
  };
  start.addEventListener('pointerdown', () => void begin());
  pauseBtn.addEventListener('click', () => {
    loop.paused = !loop.paused;
    pauseBtn.textContent = loop.paused ? '▶' : '❚❚';
  });
  // Developer view: the tuning panel and the physics readout.
  hud.hidden = true;
  tuneBtn.addEventListener('click', () => {
    debug.toggle();
    hud.hidden = !hud.hidden;
  });
  window.addEventListener('keydown', (e) => {
    if (!start.hidden && (e.key === ' ' || e.key === 'Enter')) void begin();
  }, { once: false });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || !start.hidden) return;
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
  (window as unknown as { mmm: unknown }).mmm = { sim, loop, config, audio, notes: () => noteCount };
}

main().catch((err) => {
  console.error(err);
  document.getElementById('hud')!.textContent = `Failed to start: ${err}`;
});
