/**
 * Level authoring helper: realises a "plan" of pads and bumpers on the marble's
 * real, simulated trajectory. Because the simulation is deterministic every new
 * object is validated by replaying the run from the start.
 *
 * Usage: npx vite-node scripts/layout.ts '<steps json>' [prefix] [afterT]
 *   steps: [{ k: 'pad'|'bumper', y?: number, drop?: number, dir: -1|1, exit?: number, note?, color? }]
 *     y     absolute Y where the object meets the marble (first step), or
 *     drop  Y below the previous object's meeting point
 *     dir   -1 sends the marble left, 1 right
 *     exit  outgoing elevation in degrees above horizontal (default 15)
 *   prefix  id prefix; existing objects with this prefix are replaced (default "auto_")
 *   afterT  only consider the trajectory after this simulation time
 */
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import type { BumperDef, LevelDef, ObjectDef, PadDef } from '../src/levels/LevelTypes';
import { playground } from '../src/levels/playground';

interface Step { k: 'pad' | 'bumper'; y?: number; drop?: number; dir: -1 | 1; exit?: number; note?: string; color?: string }
const steps: Step[] = JSON.parse(process.argv[2] ?? '[]');
const prefix = process.argv[3] ?? 'auto_';
let afterT = Number(process.argv[4] ?? 0);
const DEG = Math.PI / 180;
const padHalfThick = 0.14;
const bumperRadius = 0.45;

await initRapier();

interface State { x: number; y: number; vx: number; vy: number; t: number }

function simulate(level: LevelDef, yTarget: number, after: number): { state: State | null; hits: string[] } {
  const sim = new Simulation();
  sim.load(level);
  const hits: string[] = [];
  sim.bus.on('marble:contact', (e) => hits.push(`${e.object.id}@${e.simTime.toFixed(2)}(${e.impactSpeed.toFixed(1)})`));
  let out: State | null = null;
  const dt = config.physics.fixedDt;
  for (let t = 0; t < 30; t += dt) {
    sim.fixedUpdate(dt);
    const p = sim.marble.body.translation();
    const v = sim.marble.body.linvel();
    if (out === null && t > after && p.y <= yTarget && v.y < 0) {
      out = { x: p.x, y: p.y, vx: v.x, vy: v.y, t };
      break;
    }
  }
  sim.dispose();
  return { state: out, hits };
}

/** Reflect direction d (unit) about normal n with restitution e, plus an outward kick (units/s) at speed. */
function bounce(d: [number, number], n: [number, number], e: number, speed: number, kick: number): [number, number] {
  const dn = d[0] * n[0] + d[1] * n[1];
  const r = [(d[0] - (1 + e) * dn * n[0]) * speed + kick * n[0], (d[1] - (1 + e) * dn * n[1]) * speed + kick * n[1]];
  const len = Math.hypot(r[0], r[1]);
  return [r[0] / len, r[1] / len];
}

/** Normal angle (deg, measured from +Y toward -X like the pad angle) that sends d closest to o. */
function solveNormal(d: [number, number], o: [number, number], e: number, speed: number, kick: number): number {
  let bestA = 0;
  let bestDot = -Infinity;
  for (let a = -89; a <= 89; a += 0.5) {
    const n: [number, number] = [-Math.sin(a * DEG), Math.cos(a * DEG)];
    if (d[0] * n[0] + d[1] * n[1] >= 0) continue;
    const r = bounce(d, n, e, speed, kick);
    const dot = r[0] * o[0] + r[1] * o[1];
    if (dot > bestDot) {
      bestDot = dot;
      bestA = a;
    }
  }
  return bestA;
}

const base: LevelDef = JSON.parse(JSON.stringify(playground));
base.objects = base.objects.filter((o) => !o.id?.startsWith(prefix));
const placed: ObjectDef[] = [];
const colors = ['#d9534f', '#f0ad4e', '#5bc0de', '#8e6bd6', '#5cb85c', '#e86fb0', '#f7f7f7', '#2f9e8f'];
const notes = ['C4', 'E4', 'G4', 'C5', 'A4', 'F4', 'D4', 'B4'];
let lastY = 0;
for (let k = 0; k < steps.length; k++) {
  const step = steps[k];
  const yTarget = step.y ?? lastY - (step.drop ?? 1.8);
  const level = { ...base, objects: [...base.objects, ...placed] };
  const { state, hits } = simulate(level, yTarget, afterT);
  if (!state) {
    console.log(`step ${k}: marble never reached y=${yTarget}. Contacts: ${hits.join(' ')}`);
    break;
  }
  const speed = Math.hypot(state.vx, state.vy);
  const d: [number, number] = [state.vx / speed, state.vy / speed];
  const exit = step.exit ?? 15;
  const o: [number, number] = [step.dir * Math.cos(exit * DEG), Math.sin(exit * DEG)];
  const id = `${prefix}${k + 1}`;
  let def: ObjectDef;
  let angle: number;
  if (step.k === 'pad') {
    angle = solveNormal(d, o, config.materials.pad.restitution, speed, 0);
    const n = [-Math.sin(angle * DEG), Math.cos(angle * DEG)];
    const off = padHalfThick + config.marble.radius;
    const pad: PadDef = {
      type: 'pad', id,
      position: [+(state.x - n[0] * off).toFixed(2), +(state.y - n[1] * off).toFixed(2), 0],
      angle, color: step.color ?? colors[k % colors.length], note: step.note ?? notes[k % notes.length],
    };
    def = pad;
  } else {
    angle = solveNormal(d, o, config.materials.bumper.restitution, speed, config.bumper.kick);
    const n = [-Math.sin(angle * DEG), Math.cos(angle * DEG)];
    const off = bumperRadius + config.marble.radius;
    const bumper: BumperDef = {
      type: 'bumper', id,
      position: [+(state.x - n[0] * off).toFixed(2), +(state.y - n[1] * off).toFixed(2), 0],
      color: step.color ?? '#e8c44a',
    };
    def = bumper;
  }
  placed.push(def);
  lastY = state.y;
  afterT = state.t + 0.05;
  console.log(`${id}: marble at (${state.x.toFixed(2)}, ${state.y.toFixed(2)}) v=(${state.vx.toFixed(2)}, ${state.vy.toFixed(2)}) t=${state.t.toFixed(2)} -> ${step.k} normal ${angle}deg`);
}

const final = { ...base, objects: [...base.objects, ...placed] };
const { hits } = simulate(final, -1000, 0);
console.log('\nVerification contact sequence:\n  ' + hits.filter((h) => !h.startsWith('wall')).join('\n  '));
console.log('\nObjects TS:');
for (const o of placed) {
  if (o.type === 'pad') console.log(`    { type: 'pad', id: '${o.id}', position: [${o.position.join(', ')}], angle: ${o.angle}, color: '${o.color}', note: '${o.note}' },`);
  else if (o.type === 'bumper') console.log(`    { type: 'bumper', id: '${o.id}', position: [${o.position.join(', ')}], color: '${o.color}' },`);
}
