import { readFileSync } from 'node:fs';
import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import { parseLevel } from '../../src/levels/LevelFormat';
await initRapier();
const level = parseLevel(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const ids = process.argv.slice(3);
const sim = new Simulation();
sim.load(level);
const rails = sim.objects.filter((o) => ids.includes(o.id));
const state: Record<string, { on: number; first: number; last: number; x0: number; x1: number; y1: number }> = {};
const dt = config.physics.fixedDt;
let done = false; sim.bus.on('marble:reset', (e) => { console.log(`RESET ${e.reason} @${e.simTime.toFixed(2)}`); done = true; });
for (let t = 0; t < 40 && !done; t += dt) {
  sim.fixedUpdate(dt);
  for (const r of rails) {
    if (!sim.physics.isTouching(r)) continue;
    const p = sim.marble.body.translation();
    const s = (state[r.id] ??= { on: 0, first: t, last: t, x0: p.x, x1: p.x, y1: p.y });
    s.on += dt; s.last = t; s.x1 = p.x; s.y1 = p.y;
  }
}
for (const [id, s] of Object.entries(state)) console.log(`${id}: touching ${s.on.toFixed(2)}s over ${(s.last - s.first).toFixed(2)}s, from x ${s.x0.toFixed(2)} to (${s.x1.toFixed(2)}, ${s.y1.toFixed(2)})`);
