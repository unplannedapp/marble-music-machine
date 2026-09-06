import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import { Seesaw } from '../../src/objects/Seesaw';
await initRapier();
const sp = (process.env.SPAWN ?? '-2.6,2.2,3.5,-5').split(',').map(Number);
const sim = new Simulation();
sim.load({ name: 'd', board: { width: 16, top: 8, bottom: -40 }, spawn: { position: [sp[0], sp[1], 0.3], velocity: [sp[2], sp[3], 0] }, killY: -30, finishY: -20, objects: [{ type: 'seesaw', id: 'saw', position: [0, 0, 0], direction: 1, hold: 1 }] });
const saw = sim.objects[0] as Seesaw;
const dt = config.physics.fixedDt;
let caught = -1;
sim.bus.on('marble:contact', (e) => { if (caught < 0) { caught = e.simTime; console.log('caught at', e.simTime.toFixed(2)); } });
let done = false; sim.bus.on('marble:reset', () => (done = true));
let n = 0;
for (let t = 0; t < 4 && !done; t += dt) {
  sim.fixedUpdate(dt);
  const p = sim.marble.body.translation(); const v = sim.marble.body.linvel();
  if (n++ % 12 === 0) console.log(`t=${t.toFixed(2)} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) v=(${v.x.toFixed(1)}, ${v.y.toFixed(1)}) touching=${sim.physics.isTouching(saw)} angle=${(saw.angleAt(caught >= 0 ? t - caught : NaN) * 57.3).toFixed(1)}`);
}
