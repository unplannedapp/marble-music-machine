import { readFileSync } from 'node:fs';
import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import { parseLevel } from '../../src/levels/LevelFormat';
await initRapier();
const level = parseLevel(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const from = Number(process.argv[3] ?? 0), to = Number(process.argv[4] ?? 5);
const sim = new Simulation();
sim.load(level);
console.log('finishY', sim.finishY.toFixed(2), 'objects', level.objects.length, 'lowest', Math.min(...level.objects.filter((o) => o.type !== 'wall').map((o) => ('position' in o ? o.position[1] : Math.min(...o.points.map((p) => p[1]))))).toFixed(2));
sim.bus.on('marble:contact', (e) => { if (e.simTime >= from) console.log(`  contact ${e.object.id} @${e.simTime.toFixed(2)} impact ${e.impactSpeed.toFixed(1)}`); });
sim.bus.on('marble:reset', (e) => console.log(`  RESET ${e.reason} @${e.simTime.toFixed(2)}`));
const dt = config.physics.fixedDt;
let n = 0;
for (let t = 0; t < to; t += dt) {
  sim.fixedUpdate(dt);
  if (t >= from && n++ % 12 === 0) { const p = sim.marble.body.translation(); const v = sim.marble.body.linvel(); console.log(`t=${t.toFixed(2)} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) v=(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`); }
}
