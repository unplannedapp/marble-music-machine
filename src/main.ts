import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { config } from './core/Config';
import { GameLoop } from './core/GameLoop';
import { Simulation, initRapier } from './sim/Simulation';
import { findMachine } from './machines';
import { SceneRenderer } from './render/SceneRenderer';
import { FollowCamera } from './render/FollowCamera';
import { createMarbleMesh } from './render/marbleVisual';
import { DebugPanel } from './debug/DebugPanel';
import { AudioEngine } from './audio/AudioEngine';
import { MusicSystem } from './audio/MusicSystem';
import { Backing } from './audio/Backing';
import { HitEffects } from './render/HitEffects';
import { ScoreSystem } from './game/Scoring';
import { Hud } from './ui/Hud';
import { Menu, saveBest } from './ui/Menu';
import { GameFlow } from './game/GameFlow';
import { machines, type Machine } from './machines';
import { Editor } from './editor/Editor';
import { bakeMachine } from './game/SongBake';
import { saveCustomMachine, newMachineId } from './ui/storage';
import type { LevelFile } from './levels/LevelFormat';
import { TargetRings } from './render/TargetRings';
import { PadLights } from './render/PadLights';
import { Pad } from './objects/Pad';

async function main(): Promise<void> {
  await initRapier();

  const container = document.getElementById('app')!;
  const hud = document.getElementById('hud')!;
  const start = document.getElementById('start')!;
  const gameHud = document.getElementById('game-hud')!;
  const editorRoot = document.getElementById('editor')!;
  const pauseBtn = document.getElementById('btn-pause')!;
  const tuneBtn = document.getElementById('btn-tune')!;

  const sim = new Simulation();
  sim.marble.root.add(createMarbleMesh(sim.marble.radius));
  let machine: Machine = findMachine('alphabet');
  sim.load(machine.level);

  const view = new SceneRenderer(container);
  view.scene.add(sim.scene);
  const follow = new FollowCamera(view.camera);
  const orbit = new OrbitControls(view.camera, view.renderer.domElement);
  orbit.enabled = false;
  orbit.enableDamping = true;
  let freeCamera = false;

  // Sound: browsers only allow audio after a gesture, so the machine waits for a tap.
  const audio = new AudioEngine();
  const music = new MusicSystem(sim, audio);
  const effects = new HitEffects(sim.bus);
  view.scene.add(effects.group);
  const padLights = new PadLights(sim, view.mobile ? 3 : 6);
  view.scene.add(padLights.group);

  // Song, timing, combo and score.
  let scoring = new ScoreSystem(sim, machine.song);
  let backing = new Backing(sim, audio, machine.song);
  let flow = new GameFlow(sim, scoring);
  let rings = new TargetRings(sim, scoring);
  view.scene.add(rings.group);
  let overlay = new Hud(gameHud, sim.bus, view.camera, scoring, sim.marble.root);
  const selectMachine = (m: Machine): void => {
    machine = m;
    overlay.dispose();
    flow.dispose();
    scoring.dispose();
    view.scene.remove(rings.group);
    if (m.custom) {
      // The level is the sequencer: a player-built machine's song is what it actually plays.
      const baked = bakeMachine(m.level);
      m.song = baked.song;
      m.level.checkpoints = baked.checkpoints;
    }
    sim.load(m.level);
    view.applyEnvironment(m.level.environment, m.level.board);
    padLights.setStrength(m.level.environment?.padLight ?? 0);
    scoring = new ScoreSystem(sim, m.song);
    backing.dispose();
    backing = new Backing(sim, audio, m.song);
    flow = new GameFlow(sim, scoring);
    rings = new TargetRings(sim, scoring);
    rings.setColor(m.level.environment?.ring ?? '#f0e6c8');
    view.scene.add(rings.group);
    overlay = new Hud(gameHud, sim.bus, view.camera, scoring, sim.marble.root);
    overlay.onFinished = (score) => {
      saveBest(m.id, score);
    };
    overlay.onMenu = () => {
      loop.paused = true;
      menu.show();
    };
    overlay.onEdit = () => openEditor(m);
    follow.snapTo(sim.marble.position());
  };

  // ---- editor -------------------------------------------------------------------
  const editor = new Editor(sim, view, follow, editorRoot, {
    onSimulate: () => {
      editor.disable();
      gameHud.hidden = false;
      pauseBtn.hidden = false;
      tuneBtn.hidden = false;
      selectMachine(machine);
      loop.paused = false;
    },
    onSave: (level: LevelFile) => {
      machine.title = level.name;
      saveCustomMachine({ id: machine.id, title: level.name, level, updatedAt: Date.now() });
      menu.render();
    },
    onExit: () => {
      editor.disable();
      pauseBtn.hidden = false;
      tuneBtn.hidden = false;
      loop.paused = true;
      menu.show();
    },
  });
  /** Editing a built-in machine edits a copy, so the originals stay intact. */
  const openEditor = (m: Machine): void => {
    let target = m;
    if (!m.custom) {
      const level: LevelFile = JSON.parse(JSON.stringify(m.level));
      level.name = `${m.title} (my version)`;
      target = { id: newMachineId(), title: level.name, level, song: { ...m.song }, custom: true };
    }
    machine = target;
    menu.hide();
    loop.paused = true;
    overlay.dispose();
    flow.dispose();
    scoring.dispose();
    view.scene.remove(rings.group);
    sim.load(target.level);
    view.applyEnvironment(target.level.environment, target.level.board);
    padLights.setStrength(target.level.environment?.padLight ?? 0);
    scoring = new ScoreSystem(sim, target.song);
    backing.dispose();
    backing = new Backing(sim, audio, target.song);
    flow = new GameFlow(sim, scoring);
    rings = new TargetRings(sim, scoring);
    overlay = new Hud(gameHud, sim.bus, view.camera, scoring, sim.marble.root);
    gameHud.hidden = true;
    pauseBtn.hidden = true;
    tuneBtn.hidden = true;
    editor.enable();
  };
  let lastNote = '';
  let noteCount = 0;
  sim.bus.on('music:note', (n) => {
    noteCount++;
    lastNote = `${n.instrument}${n.note ? ' ' + n.note : ''}  vel ${n.velocity.toFixed(2)}`;
  });

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
      backing.update();
      effects.update(frameDt);
      rings.update(frameDt);
      overlay.update();
      sim.marble.root.getWorldPosition(marblePos);
      sim.marble.velocity(marbleVel);
      if (freeCamera) {
        orbit.update();
      } else {
        follow.floorY = sim.finishY;
        follow.update(marblePos, marbleVel, frameDt);
      }
      follow.currentFocus(focus);
      view.followLight(freeCamera ? marblePos : focus);
      // While building, every pad shows its colour lit; play switches them on by striking them.
      if (editor.enabled) for (const o of sim.objects) if (o instanceof Pad && !o.lit) o.setLit(true);
      padLights.update(focus);
      debug.update();
      view.render(frameDt);

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

  // The menu holds the machine until a pick, which also unlocks audio.
  loop.paused = true;
  const menu = new Menu(
    start,
    machines,
    (m) => {
      void audio.unlock();
      gameHud.hidden = false;
      selectMachine(m);
      menu.hide();
      loop.paused = false;
    },
    (m) => {
      void audio.unlock();
      openEditor(m);
    },
  );
  selectMachine(machine);
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
    if (!start.hidden && (e.key === ' ' || e.key === 'Enter')) {
      void audio.unlock();
      menu.hide();
      loop.paused = false;
    }
  });

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
      case 'e':
      case 'E':
        if (editor.enabled) editor.disable();
        else openEditor(machine);
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
  (window as unknown as { mmm: unknown }).mmm = { sim, loop, config, audio, view, editor, notes: () => noteCount };
}

main().catch((err) => {
  console.error(err);
  document.getElementById('hud')!.textContent = `Failed to start: ${err}`;
});
