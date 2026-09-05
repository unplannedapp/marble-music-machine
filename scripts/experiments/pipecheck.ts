import * as THREE from 'three';
import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import { findMachine } from '../../src/machines';
import { Pipe, PIPE_FLARE, PIPE_FLARE_LENGTH, flareAt } from '../../src/objects/Pipe';

await initRapier();
const level = JSON.parse(JSON.stringify(findMachine(process.env.MACHINE ?? 'mary').level));
const sim = new Simulation();
sim.load(level);
const R = sim.marble.radius;
const pipes = level.objects.filter((o: any) => o.type === 'pipe').map((o: any) => {
  const curve = Pipe.curveFor(o, R);
  const samples = curve.getSpacedPoints(400);
  return { id: o.id, radius: o.radius ?? Pipe.defaultRadius(R), curve, samples, start: curve.getPointAt(0), tan0: curve.getTangentAt(0) };
});
const dt = config.physics.fixedDt;
const state: Record<string, { inside: boolean; worst: number; entered?: string }> = {};
for (const p of pipes) state[p.id] = { inside: false, worst: 0 };
for (let t = 0; t < 30; t += dt) {
  sim.fixedUpdate(dt);
  const m = sim.marble.body.translation();
  const mp = new THREE.Vector3(m.x, m.y, m.z);
  for (const p of pipes) {
    let best = Infinity, bi = 0;
    for (let i = 0; i < p.samples.length; i++) { const d = p.samples[i].distanceToSquared(mp); if (d < best) { best = d; bi = i; } }
    const d = Math.sqrt(best); const u = bi / (p.samples.length - 1);
    const s = state[p.id];
    // Approach: when the marble is within 1.2 units of the mouth plane, log offset from the axis.
    const rel = mp.clone().sub(p.start); const along = rel.dot(p.tan0);
    if (!s.entered && along > -0.1 && along < 0.4 && u < 0.1) {
      const lateral = rel.clone().sub(p.tan0.clone().multiplyScalar(along));
      s.entered = `t=${t.toFixed(2)} mouth offset ${lateral.length().toFixed(2)} (dx=${lateral.x.toFixed(2)} dy=${lateral.y.toFixed(2)} dz=${lateral.z.toFixed(2)}) allowed ${(p.radius - R).toFixed(2)} v=${JSON.stringify(sim.marble.body.linvel())}`;
    }
    if (u > 0.05 && u < 0.95) {
      const overlap = d + R - p.radius * flareAt(u, PIPE_FLARE, PIPE_FLARE_LENGTH); // >0 means the marble pokes into/through the wall
      if (overlap > s.worst) s.worst = overlap;
      if (overlap > 0.05 && !s.inside) { s.inside = true; console.log(`${p.id}: WALL OVERLAP ${overlap.toFixed(2)} at t=${t.toFixed(2)} u=${u.toFixed(2)} d=${d.toFixed(2)} pos=(${m.x.toFixed(2)},${m.y.toFixed(2)},${m.z.toFixed(2)})`); }
      if (overlap <= 0.05) s.inside = false;
    }
  }
}
for (const p of pipes) console.log(`${p.id}: radius ${p.radius.toFixed(2)} entry: ${state[p.id].entered ?? 'never'} | worst wall overlap ${state[p.id].worst.toFixed(2)}`);
