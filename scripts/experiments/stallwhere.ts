import { readFileSync } from 'node:fs';
import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import { parseLevel } from '../../src/levels/LevelFormat';
await initRapier();
const level = parseLevel(JSON.parse(readFileSync(process.argv[2], 'utf8')));
level.spawn.velocity[0] += Number(process.argv[3] ?? 0.01);
const sim = new Simulation();
sim.load(level);
let last = '';
sim.bus.on('marble:contact', (e) => (last = `${e.object.id}@${e.simTime.toFixed(2)}`));
let reason = '';
sim.bus.on('marble:reset', (e) => (reason = e.reason));
const dt = config.physics.fixedDt;
const trail: string[] = [];
for (let t = 0; t < 60 && !reason; t += dt) {
  sim.fixedUpdate(dt);
  if (Math.round(t / dt) % 60 === 0) { const p = sim.marble.body.translation(); const v = sim.marble.body.linvel(); trail.push(`t=${t.toFixed(1)} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) |v|=${Math.hypot(v.x, v.y).toFixed(1)} last=${last} touching=${sim.objects.filter((o) => sim.physics.isTouching(o)).map((o) => o.id).join('+')}`); }
}
console.log(reason, '\n' + trail.slice(-8).join('\n'));
