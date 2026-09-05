// Pure circle of rail: spawn the marble at the bottom with tangential speed and see how far round it gets.
import * as THREE from 'three';
import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import type { LevelDef } from '../../src/levels/LevelTypes';
await initRapier();
const R = Number(process.env.R ?? 1);
if (process.env.FRIC !== undefined) config.materials.rail.friction = Number(process.env.FRIC);
const gauge = process.env.GAUGE ? Number(process.env.GAUGE) : undefined;
for (const v0 of [8, 10, 12, 14]) {
  const pts: [number, number, number][] = [];
  for (let th = -90 - 60; th <= 270 + 60; th += 10) pts.push([+(R * Math.cos((th * Math.PI) / 180)).toFixed(3), +(R + R * Math.sin((th * Math.PI) / 180)).toFixed(3), 0.32]);
  const level: LevelDef = { name: 't', board: { width: 16, top: 8, bottom: -40, glass: 2.2 }, spawn: { position: [0, 0, 0.32], velocity: [v0, 0, 0] }, killY: -30, finishY: -20,
    objects: [{ type: 'rail', id: 'c', points: pts, groove: 'curve', lipDeg: 0, gauge, sampleSpacing: process.env.SPACING ? Number(process.env.SPACING) : undefined }] };
  const sim = new Simulation(); sim.load(level);
  sim.marble.reset(new THREE.Vector3(0, 0, 0.32), new THREE.Vector3(v0, 0, 0), new THREE.Vector3(0, 0, -v0 / 0.3));
  const dt = config.physics.fixedDt; let maxY = 0, lostAt = ''; let lastOn = 0; let minSpeedTop = 99; let rollRatio = '';
  for (let t = 0; t < 2; t += dt) {
    sim.fixedUpdate(dt); const p = sim.marble.body.translation(); const v = sim.marble.body.linvel();
    const on = sim.physics.isTouching(sim.objectsById.get('c')!);
    if (on && t > 0.1 && t < 0.15) { const w = sim.marble.body.angvel(); rollRatio = (Math.hypot(w.x, w.y, w.z) * 0.3 / Math.max(0.1, Math.hypot(v.x, v.y))).toFixed(2); }
    if (on) { lastOn = t; maxY = Math.max(maxY, p.y); if (p.y > 2 * R - 0.3) minSpeedTop = Math.min(minSpeedTop, Math.hypot(v.x, v.y)); }
    else if (t - lastOn > 0.15 && !lostAt) lostAt = `t=${lastOn.toFixed(2)} at (${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)})`;
  }
  console.log(`R=${R} spacing=${process.env.SPACING ?? 'default'} v0=${v0}: spin/v ratio ${rollRatio}; highest on rail ${maxY.toFixed(2)} of ${(2 * R).toFixed(2)}; speed at top ${minSpeedTop === 99 ? '-' : minSpeedTop.toFixed(1)}; left rail ${lostAt || 'never'}`);
  sim.dispose();
}
