import { describe, expect, it } from 'vitest';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import type { LevelDef } from '../src/levels/LevelTypes';

/** A plunger must hold the marble, then fire it along its lane at about the launch speed, the same way every run. */
describe('launcher', () => {
  it('fires a resting marble down a level lane at the launch speed', async () => {
    await initRapier();
    const level: LevelDef = {
      name: 'launcher test',
      board: { width: 16, top: 8, bottom: -40 },
      spawn: { position: [-2.6, 0.2, 0.32], velocity: [-1, 0, 0] },
      killY: -30,
      finishY: -20,
      objects: [
        // A level lane sloping a hair back toward the head so the marble settles against it.
        { type: 'rail', id: 'lane', points: [[-3.4, -0.02, 0], [-1.5, 0.02, 0], [0.5, 0.06, 0], [2.5, 0.1, 0], [4.5, 0.14, 0]], groove: 'curve', lipDeg: 0 },
        { type: 'launcher', id: 'plunger', position: [-3.2, 0, 0], direction: 0, speed: 12, hold: 0.4 },
      ],
    };
    const run = () => {
      const sim = new Simulation();
      sim.load(level);
      const dt = config.physics.fixedDt;
      let firedAt = -1;
      let vmax = 0;
      let vAt3 = 0;
      const trail: number[] = [];
      for (let i = 0; i < 3 / dt; i++) {
        sim.fixedUpdate(dt);
        const p = sim.marble.body.translation();
        const v = sim.marble.body.linvel();
        const speed = Math.hypot(v.x, v.y);
        if (speed > 6 && firedAt < 0) firedAt = sim.simTime;
        vmax = Math.max(vmax, speed);
        if (p.x > 3 && !vAt3) vAt3 = speed;
        if (i % 40 === 0) trail.push(+p.x.toFixed(4));
      }
      sim.dispose();
      return { firedAt, vmax, vAt3, trail };
    };
    const a = run();
    const b = run();
    expect(a.firedAt).toBeGreaterThan(0.3);
    // Launched close to the head speed; six units on it has spun up to rolling and is still quick.
    expect(a.vmax).toBeGreaterThan(10.5);
    expect(a.vAt3).toBeGreaterThan(6);
    // Deterministic.
    expect(b.trail).toEqual(a.trail);
  });
});
