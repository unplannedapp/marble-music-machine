// Drop the marble onto a plunger lane from above, as a pad bounce would: does it roll back to the head and fire?
import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import { loopRail } from '../../src/levels/shapes';
import type { LevelDef } from '../../src/levels/LevelTypes';
await initRapier();
const x0 = 1.09, y0 = -0.35; const dx = -1;
const entry: [number, number] = [x0 + dx * 0.35, y0];
const loop = loopRail('loop', entry, dx, { angle: -2.5, lead: 2.8, radius: 0.85 });
const level: LevelDef = { name: 't', board: { width: 16, top: 8, bottom: -40, glass: 2.2 }, spawn: { position: [x0, 0, 0.3], velocity: [-3.5, -8.7, 0] }, killY: -30, finishY: -20,
  objects: [loop, { type: 'launcher', id: 'plunger', position: [x0 - dx * 0.45, y0 + 0.01, 0], direction: 182.5, speed: Number(process.env.SPEED ?? 14), hold: 0.5 }] };
console.log('lead-in points', JSON.stringify(loop.points.slice(0, 4)));
const sim = new Simulation(); sim.load(level);
sim.bus.on('marble:contact', (e) => console.log(`   hit ${e.simTime.toFixed(2)} ${e.object.id} impact ${e.impactSpeed.toFixed(1)} n=(${e.normal.x.toFixed(2)},${e.normal.y.toFixed(2)},${e.normal.z.toFixed(2)})`));
const dt = config.physics.fixedDt; let next = 0;
for (let t = 0; t < 3.5; t += dt) {
  sim.fixedUpdate(dt);
  if (t < next) continue; next += 0.1;
  const p = sim.marble.body.translation(); const v = sim.marble.body.linvel();
  console.log(`${t.toFixed(2)} p=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) v=(${v.x.toFixed(1)},${v.y.toFixed(1)}) loop=${sim.physics.isTouching(sim.objectsById.get('loop')!) ? 'Y' : '-'} head=${sim.physics.isTouching(sim.objectsById.get('plunger')!) ? 'Y' : '-'}`);
}
