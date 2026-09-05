import * as THREE from 'three';
import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import { loopRail, loopTop, loopExit } from '../../src/levels/shapes';
import type { LevelDef, RailDef } from '../../src/levels/LevelTypes';
await initRapier();
const speed = Number(process.env.V0 ?? 12);
const angle = Number(process.env.ANGLE ?? 55);
const arrive = Number(process.env.ARRIVE ?? angle);
const fall = !!process.env.FALL;
const cases: { name: string; rise?: number; cutLeadOut?: boolean; spacing?: number }[] = [
  { name: 'full' }, { name: 'no rise', rise: 0 }, { name: 'no lead-out', cutLeadOut: true }, { name: 'no rise, no lead-out', rise: 0, cutLeadOut: true }, { name: 'full, spacing 0.15', spacing: 0.15 },
];
for (const c of cases) {
  const o = { angle, rise: c.rise };
  const rail: RailDef = loopRail('loop', [-4, 3], 1, o);
  if (c.cutLeadOut) rail.points = rail.points.slice(0, rail.points.length - 4);
  if (c.spacing) rail.sampleSpacing = c.spacing;
  const a = (angle * Math.PI) / 180;
  const level: LevelDef = { name: 't', board: { width: 16, top: 8, bottom: -40, glass: 2.4 }, spawn: { position: [-4 + Math.cos(a) * 0.4, 3 - Math.sin(a) * 0.4, 0.32], velocity: [Math.cos(a) * speed, -Math.sin(a) * speed, 0] }, killY: -30, finishY: -20, objects: [rail] };
  const sim = new Simulation(); sim.load(level);
  const ar = (arrive * Math.PI) / 180;
  if (fall) sim.marble.reset(new THREE.Vector3(-4 - Math.cos(ar) * 0.6, 3 + Math.sin(ar) * 0.6, 0.30), new THREE.Vector3(Math.cos(ar) * speed, -Math.sin(ar) * speed, 0), new THREE.Vector3(0, 0, 0));
  else sim.marble.reset(new THREE.Vector3(-4 + Math.cos(a) * 0.4, 3 - Math.sin(a) * 0.4, 0.32), new THREE.Vector3(Math.cos(a) * speed, -Math.sin(a) * speed, 0), new THREE.Vector3(0, 0, -speed / 0.3));
  const dt = config.physics.fixedDt;
  const top = loopTop([-4, 3], o); const exit = loopExit([-4, 3], 1, o);
  let overTop = false, minYBeforeTop = 9, speedTop = 0, exitReached = false, maxZ = 0, lastOn = 0, firstOff = '';
  for (let t = 0; t < 3; t += dt) {
    sim.fixedUpdate(dt);
    const p = sim.marble.body.translation(); const v = sim.marble.body.linvel();
    const on = sim.physics.isTouching(sim.objectsById.get('loop')!);
    if (on) { lastOn = t; maxZ = Math.max(maxZ, p.z); } else if (t > 0.3 && t - lastOn > 0.15 && !firstOff) firstOff = `t=${lastOn.toFixed(2)} (${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) v=(${v.x.toFixed(1)},${v.y.toFixed(1)})`;
    if (!overTop) minYBeforeTop = Math.min(minYBeforeTop, p.y);
    if (on && p.y > top - 0.35 && minYBeforeTop < top - 1.5) { overTop = true; speedTop = Math.hypot(v.x, v.y); }
    if (overTop && p.x > exit.x - 0.4 && Math.abs(p.y - exit.y) < 0.6) exitReached = true;
  }
  console.log(`${c.name.padEnd(24)} tube ${angle} arrive ${arrive}${fall ? ' (fall)' : ''} v0 ${speed}: over top ${overTop ? 'YES' : 'no '} (v ${speedTop.toFixed(1)}); exit ${exitReached ? 'YES' : 'no '}; max z on rail ${maxZ.toFixed(2)}; first off-rail ${firstOff}`);
  sim.dispose();
}
