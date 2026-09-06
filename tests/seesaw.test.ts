import { describe, expect, it } from 'vitest';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { Seesaw } from '../src/objects/Seesaw';
import type { LevelDef } from '../src/levels/LevelTypes';

/** The seesaw must catch the marble, hold it for the set time, tip, and let it off the far end the same way every run. */
describe('seesaw', () => {
  it('holds the marble on the plank for the hold time and then tips it off the far end', async () => {
    await initRapier();
    const hold = 1.0;
    const level: LevelDef = {
      name: 'seesaw test',
      board: { width: 16, top: 8, bottom: -40 },
      spawn: { position: [-2.2, 2.2, 0.3], velocity: [3.5, -5, 0] },
      killY: -30,
      finishY: -20,
      objects: [{ type: 'seesaw', id: 'saw', position: [0, 0, 0], direction: 1, hold }],
    };
    const run = () => {
      const sim = new Simulation();
      sim.load(level);
      const dt = config.physics.fixedDt;
      let caughtAt = -1;
      let leftAt = -1;
      let maxX = -Infinity;
      const trail: number[] = [];
      sim.bus.on('marble:contact', (e) => { if (e.object.id === 'saw' && caughtAt < 0) caughtAt = e.simTime; });
      let finished = false;
      sim.bus.on('marble:reset', (e) => (finished = e.reason === 'finished'));
      for (let i = 0; i < 5 / dt && !finished; i++) {
        sim.fixedUpdate(dt);
        const p = sim.marble.body.translation();
        if (caughtAt >= 0 && leftAt < 0 && p.y < -0.9) leftAt = sim.simTime;
        maxX = Math.max(maxX, p.x);
        if (i % 20 === 0) trail.push(+p.x.toFixed(4), +p.y.toFixed(4));
      }
      const saw = sim.objects[0] as Seesaw;
      const angle = saw.angleAt(hold + 0.45 + 0.2);
      sim.dispose();
      return { caughtAt, leftAt, maxX, angle, finished, trail };
    };
    const a = run();
    expect(a.caughtAt).toBeGreaterThan(0);
    // Held on the plank until it tipped, then off the far end (+x) and into the dark.
    expect(a.leftAt - a.caughtAt).toBeGreaterThan(hold);
    expect(a.leftAt - a.caughtAt).toBeLessThan(hold + 2.4);
    expect(a.maxX).toBeGreaterThan(1.6);
    expect(a.finished).toBe(true);
    // Tipped plank: far end down.
    expect(a.angle).toBeLessThan(0);
    const b = run();
    expect(b.trail).toEqual(a.trail);
  });
});
