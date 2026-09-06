import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { loopRail, loopExit, loopTop } from '../src/levels/shapes';
import type { LevelDef } from '../src/levels/LevelTypes';

/**
 * A loop-the-loop of track: the marble must go over the top while still on the
 * track, cross above its own entry, and leave at the far end.
 */
describe('loop', () => {
  it('carries the marble round a full loop and out the other side', async () => {
    await initRapier();
    const entry: [number, number] = [-4, 3];
    const angle = 45;
    const entryZ = 0.32;
    const rail = loopRail('loop', entry, 1, { angle });
    const level: LevelDef = {
      name: 'loop test',
      board: { width: 16, top: 8, bottom: -40, glass: 2.4 },
      spawn: { position: [-4, 3, 0.32] },
      killY: -30,
      finishY: -20,
      objects: [rail],
    };
    const sim = new Simulation();
    sim.load(level);
    const a = (angle * Math.PI) / 180;
    const speed = 12;
    // Enter the track rolling, as the layout feeds it.
    sim.marble.reset(
      new THREE.Vector3(entry[0] + Math.cos(a) * 0.4, entry[1] - Math.sin(a) * 0.4, entryZ),
      new THREE.Vector3(Math.cos(a) * speed, -Math.sin(a) * speed, 0),
      new THREE.Vector3(0, 0, -speed / config.marble.radius),
    );
    const dt = config.physics.fixedDt;
    const top = loopTop(entry, { angle });
    const exit = loopExit(entry, 1, { angle });
    const track = sim.objectsById.get('loop')!;
    let overTop = false;
    let lifted = 0;
    let exited = false;
    let minY = Infinity;
    for (let i = 0; i < 4 / dt && !exited; i++) {
      sim.fixedUpdate(dt);
      const p = sim.marble.body.translation();
      const on = sim.physics.isTouching(track);
      if (on) lifted = Math.max(lifted, p.z);
      minY = Math.min(minY, p.y);
      if (on && p.y > top - 0.35 && minY < top - 1.2) overTop = true;
      if (overTop && p.x > exit.x - 0.4 && Math.abs(p.y - exit.y) < 0.6) exited = true;
    }
    // Lifted toward the camera over the top, so the second pass crosses above the entry.
    expect(lifted).toBeGreaterThan(0.9);
    expect(overTop).toBe(true);
    expect(exited).toBe(true);
    sim.dispose();
  });
});
