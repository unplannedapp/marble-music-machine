import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import { railShape, type RailShape } from '../../src/levels/shapes';
await initRapier();
// Distance of the marble centre from the rail's path over time, to tell bouncing from lift-off.
const shape = (process.argv[2] ?? 'arc') as RailShape;
const rail = railShape('r', shape, [-2, 2], 1);
if (process.env.LIP !== undefined) rail.lipDeg = Number(process.env.LIP);
if (process.env.REST !== undefined) (config.materials.rail as { restitution: number }).restitution = Number(process.env.REST);
if (process.env.RULE) (config.materials.rail as { bounceRule: string }).bounceRule = process.env.RULE;
const end = rail.points[rail.points.length - 1];
const sim = new Simulation();
sim.load({ name: 'd', board: { width: 24, top: 8, bottom: -80 }, finishY: end[1] - 6, spawn: { position: [-2.4, 3.6, 0.55], velocity: [1.5, 0, 0] }, killY: -80, objects: [rail] });
const dt = config.physics.fixedDt;
let done = false; sim.bus.on('marble:reset', () => (done = true));
const pts = rail.points;
function distToPath(x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]; const [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(x - (ax + u * dx), y - (ay + u * dy)));
  }
  return best;
}
function pathY(x: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]; const [bx, by] = pts[i + 1];
    if ((x >= ax && x <= bx) || (x <= ax && x >= bx)) return ay + ((x - ax) / (bx - ax)) * (by - ay);
  }
  return NaN;
}
let line = '';
let n = 0;
for (let t = 0; t < 4 && !done; t += dt) {
  sim.fixedUpdate(dt);
  const p = sim.marble.body.translation();
  const v = sim.marble.body.linvel();
  if (n++ % 3 === 0 && p.x > -0.5 && p.x < 2.5) line += `\n${t.toFixed(2)} x${p.x.toFixed(2)} dy${(p.y - pathY(p.x)).toFixed(2)} z${p.z.toFixed(2)} v(${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}) ${sim.physics.isTouching(sim.objects[0]) ? '*' : ' '}`;
}
console.log(shape, line);
