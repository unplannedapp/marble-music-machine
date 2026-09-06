import * as THREE from 'three';
import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import { loopRail, loopTop } from '../../src/levels/shapes';
import type { LevelDef } from '../../src/levels/LevelTypes';
await initRapier();
const angle = Number(process.env.ANGLE ?? 40); const speed = Number(process.env.V0 ?? 9); const arrive = Number(process.env.ARRIVE ?? angle); const ar = (arrive * Math.PI) / 180;
const o = { angle, radius: Number(process.env.R ?? 1), entryZ: process.env.HIGH ? 1.22 : undefined, lead: process.env.LEAD ? Number(process.env.LEAD) : undefined };
const rail = loopRail('loop', [-4, 3], 1, o);
const a = (angle * Math.PI) / 180;
const level: LevelDef = { name: 't', board: { width: 16, top: 8, bottom: -40, glass: 2.2 }, spawn: { position: [-4 + Math.cos(a) * 0.4, 3 - Math.sin(a) * 0.4, 0.32], velocity: [Math.cos(a) * speed, -Math.sin(a) * speed, 0] }, killY: -30, finishY: -20, objects: [rail] };
const sim = new Simulation(); sim.load(level);
  if (process.env.FALL) sim.marble.reset(new THREE.Vector3(-4 - Math.cos(ar) * 0.6, 3 + Math.sin(ar) * 0.6, 0.30), new THREE.Vector3(Math.cos(ar) * speed, -Math.sin(ar) * speed, 0), new THREE.Vector3(0, 0, 0));
  else sim.marble.reset(new THREE.Vector3(-4 + Math.cos(a) * 0.4, 3 - Math.sin(a) * 0.4, process.env.HIGH ? 1.22 : 0.32), new THREE.Vector3(Math.cos(a) * speed, -Math.sin(a) * speed, 0), new THREE.Vector3(0, 0, -speed / 0.3));
const curve = new THREE.CatmullRomCurve3(rail.points.map((p) => new THREE.Vector3(p[0], p[1], p[2] || 0.32)), false, 'centripetal', 0.5);
const samples = curve.getSpacedPoints(300);
sim.bus.on('marble:contact', (e) => console.log(`   hit ${e.simTime.toFixed(2)} impact ${e.impactSpeed.toFixed(1)} n=(${e.normal.x.toFixed(2)},${e.normal.y.toFixed(2)},${e.normal.z.toFixed(2)})`));
const dt = config.physics.fixedDt; let next = 0;
console.log(`top of loop y=${loopTop([-4, 3], o).toFixed(2)}`);
for (let t = 0; t < Number(process.env.T ?? 1.6); t += dt) {
  sim.fixedUpdate(dt);
  if (t >= next) {
    const p = sim.marble.body.translation(); const v = sim.marble.body.linvel(); const mp = new THREE.Vector3(p.x, p.y, p.z);
    let best = Infinity, bi = 0; samples.forEach((s, i) => { const d = s.distanceTo(mp); if (d < best) { best = d; bi = i; } });
    const w = sim.marble.body.angvel();
    const E = 0.5 * (v.x * v.x + v.y * v.y + v.z * v.z) + 0.5 * 0.4 * 0.09 * (w.x * w.x + w.y * w.y + w.z * w.z) + 23.7 * p.y;
    const pathZ = samples[bi].z;
    console.log(`${t.toFixed(2)} p=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) pathZ=${pathZ.toFixed(2)} |v|=${Math.hypot(v.x, v.y, v.z).toFixed(1)} spin=${Math.hypot(w.x, w.y, w.z).toFixed(0)} E=${E.toFixed(0)} on=${sim.physics.isTouching(sim.objectsById.get('loop')!) ? 'Y' : '-'} off=${best.toFixed(2)} u=${(bi / 300).toFixed(2)}`);
    next += 0.05;
  }
}
