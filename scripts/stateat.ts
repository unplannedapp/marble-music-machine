/** Print the marble state each time it crosses the given Y values (free flight), after optional time. Usage: stateat.ts y1,y2,... */
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { playground } from '../src/levels/playground';
await initRapier();
const ys = (process.argv[2] ?? '-12.5').split(',').map(Number);
const skip = new Set((process.argv[3] ?? '').split(',').filter(Boolean));
const sim = new Simulation(); sim.load(playground);
sim.bus.on('marble:contact', (e) => { if (!skip.has(e.object.id)) console.log(`  HIT ${e.simTime.toFixed(2)} ${e.object.id} imp=${e.impactSpeed.toFixed(2)}`); });
sim.bus.on('marble:reset', (e) => console.log(`  RESET ${e.reason} @${e.simTime.toFixed(2)}`));
const dt = config.physics.fixedDt; let i = 0;
for (let t = 0; t < 25 && i < ys.length; t += dt) {
  sim.fixedUpdate(dt);
  const p = sim.marble.body.translation(); const v = sim.marble.body.linvel();
  if (p.y <= ys[i]) { console.log(`y=${ys[i]} t=${t.toFixed(2)} pos=(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) vel=(${v.x.toFixed(2)}, ${v.y.toFixed(2)})`); i++; }
}
