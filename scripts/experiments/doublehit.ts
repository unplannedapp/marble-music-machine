import { readFileSync } from 'node:fs';
import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import { parseLevel } from '../../src/levels/LevelFormat';
await initRapier();
const level = parseLevel(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const sim = new Simulation();
sim.load(level);
const last = new Map<string, number>();
sim.bus.on('marble:contact', (e) => {
  if (e.object.type !== 'pad') return;
  const prev = last.get(e.object.id);
  if (prev !== undefined && e.simTime - prev > 0.06) {
    const p = sim.marble.body.translation();
    console.log(`${e.object.id} struck again ${(e.simTime - prev).toFixed(2)}s later at t=${e.simTime.toFixed(2)} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) impact ${e.impactSpeed.toFixed(1)}`);
  }
  last.set(e.object.id, e.simTime);
});
let reason = ''; sim.bus.on('marble:reset', (e) => (reason = e.reason));
const dt = config.physics.fixedDt;
for (let t = 0; t < 60 && !reason; t += dt) sim.fixedUpdate(dt);
console.log('done', reason);
