import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import { findMachine } from '../../src/machines';
await initRapier();
const m = findMachine(process.argv[2] ?? 'alphabet');
const guided = m.level.objects.filter((o) => !o.id!.startsWith('wall')).map((o) => o.id!);
for (const dv of (process.argv[3] ?? '-0.03,-0.02,-0.01,0.01,0.02,0.03').split(',').map(Number)) {
  const level = JSON.parse(JSON.stringify(m.level));
  level.spawn.velocity[0] += dv;
  const sim = new Simulation();
  sim.load(level);
  const seen = new Set<string>();
  const order: string[] = [];
  sim.bus.on('marble:contact', (e) => { if (!seen.has(e.object.id)) { seen.add(e.object.id); order.push(e.object.id); } });
  let reason = ''; sim.bus.on('marble:reset', (e) => (reason = e.reason));
  const dt = config.physics.fixedDt;
  for (let t = 0; t < 60 && !reason; t += dt) sim.fixedUpdate(dt);
  const missing = guided.filter((id) => !seen.has(id));
  const exact = JSON.stringify(order.filter((id) => guided.includes(id))) === JSON.stringify(guided);
  console.log(`dv=${dv}: ${reason} struck ${guided.length - missing.length}/${guided.length}${exact ? ' exact order' : ''}${missing.length ? ' missing ' + missing.slice(0, 4).join(' ') : ''}`);
  sim.dispose();
}
