import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import { findMachine } from '../../src/machines';
await initRapier();
const m = findMachine(process.argv[2] ?? 'alphabet');
const sim = new Simulation();
sim.load(m.level);
sim.bus.on('marble:contact', (e) => {
  if (e.object.id.startsWith('wall')) {
    const p = sim.marble.body.translation(); const v = sim.marble.body.linvel();
    console.log(`${e.object.id} @${e.simTime.toFixed(2)} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) v=(${v.x.toFixed(1)}, ${v.y.toFixed(1)}) impact ${e.impactSpeed.toFixed(1)}`);
  }
});
let reason = ''; sim.bus.on('marble:reset', (e) => (reason = e.reason));
const dt = config.physics.fixedDt;
for (let t = 0; t < 40 && !reason; t += dt) sim.fixedUpdate(dt);
