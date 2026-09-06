import { describe, expect, it } from 'vitest';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import type { LevelDef } from '../src/levels/LevelTypes';

/** The bowl must catch the marble, let it swing, and drop it through the trapdoor after the hold, the same way every run. */
describe('bowl', () => {
  it('holds the marble for the set time and then drops it out of the bottom', async () => {
    await initRapier();
    const hold = 1.0;
    const level: LevelDef = {
      name: 'bowl test',
      board: { width: 16, top: 8, bottom: -40 },
      spawn: { position: [-1.6, 2.6, 0.3], velocity: [2.5, -6, 0] },
      killY: -30,
      finishY: -20,
      objects: [{ type: 'bowl', id: 'bowl', position: [0, 0, 0], radius: 1.5, hold }],
    };
    const run = () => {
      const sim = new Simulation();
      sim.load(level);
      const dt = config.physics.fixedDt;
      let caughtAt = -1;
      let minX = Infinity, maxX = -Infinity;
      let droppedAt = -1;
      const trail: number[] = [];
      sim.bus.on('marble:contact', (e) => { if (e.object.id === 'bowl' && caughtAt < 0) caughtAt = e.simTime; });
      for (let i = 0; i < 4 / dt; i++) {
        sim.fixedUpdate(dt);
        const p = sim.marble.body.translation();
        if (caughtAt >= 0 && droppedAt < 0) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); }
        if (droppedAt < 0 && p.y < -1.5 - 1.0) droppedAt = sim.simTime;
        if (i % 30 === 0) trail.push(+p.x.toFixed(4), +p.y.toFixed(4));
      }
      sim.dispose();
      return { caughtAt, minX, maxX, droppedAt, trail };
    };
    const a = run();
    const b = run();
    expect(a.caughtAt).toBeGreaterThan(0);
    // It swung across the bowl while held.
    expect(a.maxX - a.minX).toBeGreaterThan(1.2);
    // Released through the bottom shortly after the hold, not before.
    expect(a.droppedAt).toBeGreaterThan(a.caughtAt + hold);
    expect(a.droppedAt).toBeLessThan(a.caughtAt + hold + 0.9);
    expect(b.trail).toEqual(a.trail);
  });
});
