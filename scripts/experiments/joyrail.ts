import { readFileSync } from 'node:fs';
import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import { parseLevel } from '../../src/levels/LevelFormat';
import { railShape } from '../../src/levels/shapes';
await initRapier();
const level = parseLevel(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const withRail = process.argv[3] === 'rail';
if (process.env.STEADY) {
  const rs = level.objects.find((o) => o.id === 'rail_start') as { points: number[][]; lipDeg?: number };
  rs.points = [[-5.4, 5, 0], [2.2, 3.4, 0]];
  rs.lipDeg = 0;
  const a = Math.atan2(1.6, 7.6);
  level.spawn = { position: [-5.0, 5 - 1.6 * (0.4 / 7.6), 0.55], velocity: [1.2 * Math.cos(a), -1.2 * Math.sin(a), 0] };
}
if (process.env.DUMMY) level.objects.push({ type: 'wall', id: 'dummy', position: [0, -200, 0.6], rotation: [0, 0, 0], size: [1, 1, 1] } as never);
if (withRail) level.objects.push(railShape('joy_16', 'long', [2.6, -24.03], -1, { len: 4, entry: 69 }));
const sim = new Simulation();
sim.load(level);
console.log('finishY', sim.finishY, 'objects', level.objects.length, 'last', JSON.stringify(level.objects[level.objects.length - 1]).slice(0, 120));
sim.bus.on('marble:contact', (e) => { if (e.simTime > 0) console.log(`  ${e.object.id}@${e.simTime.toFixed(2)}`); });
sim.bus.on('marble:reset', (e) => { const p = sim.marble.body.translation(); console.log(`  RESET ${e.reason} @${e.simTime.toFixed(2)} y=${p.y.toFixed(2)}`); });
const dt = config.physics.fixedDt;
for (let t = 0; t < 14; t += dt) { sim.fixedUpdate(dt); if (t > 8.5 && Math.round(t / dt) % 24 === 0) { const p = sim.marble.body.translation(); console.log(`  t=${t.toFixed(2)} (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`); } }
