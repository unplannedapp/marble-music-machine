import { describe, expect, it } from 'vitest';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { Spinner } from '../src/objects/Spinner';
import type { LevelDef } from '../src/levels/LevelTypes';

/** A spinning paddle wheel must strike the marble and fling it, and turn identically on every run. */
describe('spinner', () => {
  const level: LevelDef = {
    name: 'spinner test',
    board: { width: 16, top: 8, bottom: -80 },
    finishY: -60,
    spawn: { position: [0, 4, 0.3], velocity: [0, 0, 0] },
    killY: -80,
    objects: [{ type: 'spinner', id: 'wheel', position: [0.2, 0, 0], radius: 1.2, blades: 4, rpm: 45 }],
  };

  it('flings the marble with the blade and runs the same way twice', async () => {
    await initRapier();
    const dt = config.physics.fixedDt;
    const run = () => {
      const sim = new Simulation();
      sim.load(level);
      let hits = 0;
      let flungSpeed = 0;
      let vAtHit = 0;
      sim.bus.on('marble:contact', (e) => {
        if (e.object.id !== 'wheel') return;
        hits++;
        vAtHit = sim.marble.speed();
      });
      const trail: number[] = [];
      for (let i = 0; i < 2 / dt; i++) {
        sim.fixedUpdate(dt);
        const v = sim.marble.body.linvel();
        if (hits > 0) flungSpeed = Math.max(flungSpeed, Math.hypot(v.x, v.y));
        if (i % 30 === 0) trail.push(+sim.marble.body.translation().x.toFixed(4), +sim.marble.body.translation().y.toFixed(4));
      }
      const wheel = sim.objects[0] as Spinner;
      const angle = wheel.angleAt(sim.simTime);
      sim.dispose();
      return { hits, flungSpeed, vAtHit, trail, angle };
    };
    const a = run();
    const b = run();
    expect(a.hits).toBeGreaterThan(0);
    // Struck by a moving blade: it leaves faster than a dead drop would bounce.
    expect(a.flungSpeed).toBeGreaterThan(a.vAtHit * 0.8);
    // Deterministic: the wheel is a function of the clock, so two runs are identical.
    expect(b.trail).toEqual(a.trail);
    expect(b.angle).toBeCloseTo(a.angle, 6);
    // The wheel really turns: 45 rpm over 2 s is one and a half turns.
    expect(a.angle).toBeCloseTo((45 / 60) * 2 * Math.PI * 2, 3);
  });
});
