/**
 * Headless trajectory trace for level tuning.
 * Usage: npx vite-node scripts/trace.ts [seconds] [sampleInterval] [spawnDvx] [fromTime]
 */
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { playground } from '../src/levels/playground';

const seconds = Number(process.argv[2] ?? 12);
const interval = Number(process.argv[3] ?? 0.1);
const dvx = Number(process.argv[4] ?? 0);
const fromTime = Number(process.argv[5] ?? 0);

await initRapier();
const sim = new Simulation();
const level = JSON.parse(JSON.stringify(playground)) as typeof playground;
level.spawn.velocity = [(level.spawn.velocity?.[0] ?? 0) + dvx, 0, 0];
sim.load(level);
sim.bus.on('marble:contact', (e) => {
  if (e.simTime < fromTime) return;
  console.log(`  HIT ${e.simTime.toFixed(3)}s ${e.object.id} impact=${e.impactSpeed.toFixed(2)} n=(${e.normal.x.toFixed(2)},${e.normal.y.toFixed(2)},${e.normal.z.toFixed(2)})`);
});
sim.bus.on('marble:reset', (e) => console.log(`  RESET ${e.reason} @ ${e.simTime.toFixed(2)}`));

const dt = config.physics.fixedDt;
let next = fromTime;
for (let t = 0; t < seconds; t += dt) {
  if (t >= next && t >= fromTime) {
    const p = sim.marble.body.translation();
    const v = sim.marble.body.linvel();
    console.log(`${t.toFixed(2)}s pos=(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(3)}) vel=(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`);
    next += interval;
  }
  sim.fixedUpdate(dt);
}
