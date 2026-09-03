/** Drop the marble onto a rail from various heights/angles and report whether it settles in the groove. */
import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import type { LevelDef } from '../../src/levels/LevelTypes';
await initRapier();
function run(label: string, spawn: [number, number, number], vel: [number, number, number]) {
  const level: LevelDef = { name: 't', board: { width: 16, top: 8, bottom: -30 }, killY: -35,
    spawn: { position: spawn, velocity: vel },
    objects: [{ type: 'rail', id: 'rail', points: [[-1, 0, 0], [1, -0.3, 0], [3, -0.8, 0], [5, -1.6, 0], [7, -2.8, 0]] }] };
  const sim = new Simulation(); sim.load(level);
  let maxZ = 0; let hits = 0; let exitState = '';
  sim.bus.on('marble:contact', () => hits++);
  const dt = config.physics.fixedDt;
  for (let t = 0; t < 4; t += dt) {
    sim.fixedUpdate(dt);
    const p = sim.marble.body.translation(); const v = sim.marble.body.linvel();
    maxZ = Math.max(maxZ, p.z);
    if (!exitState && p.x > 7.2) exitState = `left rail end at t=${t.toFixed(2)} pos=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) v=(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})`;
  }
  const p = sim.marble.body.translation();
  console.log(`${label.padEnd(26)} hits=${hits} maxZ=${maxZ.toFixed(2)} ${exitState || `end pos=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)})`}`);
  sim.dispose();
}
run('start in groove', [-0.8, 0.03, 0.55], [1, 0, 0]);
run('drop 1 unit, on board', [0.5, 1.2, 0.3], [1.5, 0, 0]);
run('drop 2 units, on board', [0.5, 2.2, 0.3], [2, 0, 0]);
run('drop 3 units, fast', [0.5, 3.2, 0.3], [3, -2, 0]);
run('drop 2 units, from front', [0.5, 2.2, 0.9], [2, 0, 0]);
