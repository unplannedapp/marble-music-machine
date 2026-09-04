import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import type { LevelDef } from '../src/levels/LevelTypes';

/** The marble must travel inside a curved pipe and leave through its far mouth. */
describe('pipe', () => {
  it('carries the marble through a curved elbow', async () => {
    await initRapier();
    const points: [number, number, number][] = [[-0.3, 1.2, 0], [0, 0.1, 0], [1.4, -1.0, 0], [2.2, -2.6, 0], [1.4, -4.0, 0]];
    const level: LevelDef = {
      name: 'pipe test',
      board: { width: 16, top: 8, bottom: -30 },
      spawn: { position: [0, 3.5, 0.3], velocity: [0.3, 0, 0] },
      killY: -25,
      objects: [{ type: 'pipe', id: 'pipe', points }],
    };
    const sim = new Simulation();
    sim.load(level);
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2] || 0.55)), false, 'centripetal', 0.5);
    const samples = curve.getSpacedPoints(80);
    const dt = config.physics.fixedDt;
    let entered = false;
    let insideSteps = 0;
    let maxOffAxis = 0;
    let exit: THREE.Vector3 | null = null;
    let touched = 0;
    sim.bus.on('marble:contact', (e) => e.object.id === 'pipe' && touched++);
    const pos = new THREE.Vector3();
    for (let i = 0; i < 6 / dt; i++) {
      sim.fixedUpdate(dt);
      sim.marble.position(pos);
      if (pos.y < 0 && pos.y > -3.8) {
        entered = true;
        insideSteps++;
        const d = Math.min(...samples.map((s) => s.distanceTo(pos)));
        maxOffAxis = Math.max(maxOffAxis, d);
      }
      if (entered && pos.y < -4.3 && !exit) exit = pos.clone();
    }
    expect(touched).toBeGreaterThan(0);
    expect(entered).toBe(true);
    // Never further from the centreline than the inner radius: it stayed inside.
    expect(maxOffAxis).toBeLessThan(0.3 * 1.7);
    expect(insideSteps).toBeGreaterThan(20);
    // Left through the far mouth, roughly under it.
    expect(exit).not.toBeNull();
    expect(Math.abs(exit!.x - 1.4)).toBeLessThan(1.2);
    sim.dispose();
  }, 30_000);
});
