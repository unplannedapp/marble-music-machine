import { describe, expect, it } from 'vitest';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { RAIL_SHAPES, railShape, type RailShape } from '../src/levels/shapes';
import type { LevelDef } from '../src/levels/LevelTypes';

/** Every rail in the family carries a dropped marble to its far end and lets go the right way. */
describe('rail family', () => {
  it.each(RAIL_SHAPES)('%s: the marble rides it end to end', async (shape: RailShape) => {
    await initRapier();
    const rail = railShape('r', shape, [-2, 2], 1);
    const end = rail.points[rail.points.length - 1];
    const level: LevelDef = {
      name: `rail ${shape}`,
      board: { width: 24, top: 8, bottom: -80 },
      finishY: end[1] - 6,
      spawn: { position: [-2.4, 3.6, 0.55], velocity: [1.5, 0, 0] },
      killY: -80,
      objects: [rail],
    };
    const sim = new Simulation();
    sim.load(level);
    let touches = 0;
    let lastTouch = 0;
    let wall = false;
    sim.bus.on('marble:contact', (e) => {
      if (e.object.id === 'r') {
        touches++;
        lastTouch = e.simTime;
      }
      if (e.object.id.startsWith('wall_')) wall = true;
    });
    let finished = false;
    let lost = false;
    sim.bus.on('marble:reset', (e) => (e.reason === 'finished' ? (finished = true) : (lost = true)));
    const dt = config.physics.fixedDt;
    let exitX = 0;
    let exitVx = 0;
    for (let t = 0; t < 12 && !finished && !lost; t += dt) {
      sim.fixedUpdate(dt);
      const p = sim.marble.body.translation();
      const v = sim.marble.body.linvel();
      if (sim.physics.isTouching(sim.objects[0])) {
        exitX = p.x;
        exitVx = v.x;
      }
    }
    sim.dispose();
    expect(wall).toBe(false);
    expect(lost).toBe(false);
    expect(finished).toBe(true);
    expect(touches).toBeGreaterThan(0);
    expect(lastTouch).toBeGreaterThan(0.3);
    // Rode to the end: last contact near the rail's last point.
    expect(Math.abs(exitX - end[0])).toBeLessThan(0.8);
    expect(exitVx).toBeGreaterThan(0);
  });
});
