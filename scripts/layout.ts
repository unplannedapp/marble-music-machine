/**
 * Level authoring helper: realises a "plan" of pads and bumpers on the marble's
 * real, simulated trajectory. Because the simulation is deterministic every new
 * object is validated by replaying the run from the start.
 *
 * Usage: npx vite-node scripts/layout.ts <level.json> '<steps json>' [prefix] [afterT]
 *   Placed objects are written into the level file, replacing objects whose id starts
 *   with the prefix (in the same place in the object list).
 *   steps: [{ k: 'pad'|'bumper', y?: number, drop?: number, dir: -1|1, exit?: number, note?, color? }]
 *     y     absolute Y where the object meets the marble (first step), or
 *     drop  Y below the previous object's meeting point
 *     dir   -1 sends the marble left, 1 right, 0 reverses whichever way it is actually moving
 *           (a rail ignores it and carries toward the centre)
 *   A 'rail' step is a short catch rail crossing the path, a 'ramp' step a short tilted
 *   shelf: both re-gather the marble so small deviations do not accumulate over a long
 *   run, and their lower end is the next drop origin.
 *     exit  outgoing elevation in degrees above horizontal (default 15)
 *   prefix  id prefix; existing objects with this prefix are replaced (default "auto_")
 *   afterT  only consider the trajectory after this simulation time
 */
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import type { BumperDef, LevelDef, ObjectDef, PadDef, RailDef, RampDef, PipeDef } from '../src/levels/LevelTypes';
import type { LevelFile } from '../src/levels/LevelFormat';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseLevel, serializeLevel } from '../src/levels/LevelFormat';
import { DEG, solveNormal } from './lib/aim';

const levelPath = process.argv[2];
if (!levelPath) throw new Error('usage: layout.ts <level.json> <steps json> [prefix] [afterT]');
const playground = parseLevel(JSON.parse(readFileSync(levelPath, 'utf8')));

interface Step { k: 'pad' | 'bumper' | 'rail' | 'ramp' | 'pipe'; y?: number; drop?: number; dir: -1 | 0 | 1; exit?: number; note?: string; color?: string }
const steps: Step[] = JSON.parse(process.argv[3] ?? '[]');
const prefix = process.argv[4] ?? 'auto_';
let afterT = Number(process.argv[5] ?? 0);
const padHalfThick = 0.14;
const bumperRadius = Number(process.env.BUMPER_R ?? 0.45);

await initRapier();

interface State { x: number; y: number; vx: number; vy: number; t: number }

function simulate(level: LevelDef, yTarget: number, after: number): { state: State | null; hits: string[] } {
  const sim = new Simulation();
  sim.load(level);
  const hits: string[] = [];
  sim.bus.on('marble:contact', (e) => hits.push(`${e.object.id}@${e.simTime.toFixed(2)}(${e.impactSpeed.toFixed(1)})`));
  let resets = 0;
  sim.bus.on('marble:reset', (e) => {
    resets++;
    hits.push(`RESET(${e.reason})@${e.simTime.toFixed(2)}`);
  });
  let out: State | null = null;
  const dt = config.physics.fixedDt;
  for (let t = 0; t < 60; t += dt) {
    sim.fixedUpdate(dt);
    if (resets > 0) break; // a second pass of the marble is never the state we want
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

const base: LevelFile = JSON.parse(JSON.stringify(playground));
// Keep the level's object order: placed objects go where the replaced ones were.
// Insertion order affects the solver, so the tool must simulate the same world
// the level will build.
const firstIdx = base.objects.findIndex((o) => o.id?.startsWith(prefix));
const insertAt = firstIdx >= 0 ? firstIdx : base.objects.length;
base.objects = base.objects.filter((o) => !o.id?.startsWith(prefix));
const withPlaced = (placedSoFar: ObjectDef[]): ObjectDef[] => [
  ...base.objects.slice(0, insertAt),
  ...placedSoFar,
  ...base.objects.slice(insertAt),
];
const placed: ObjectDef[] = [];
const colors = ['#d9534f', '#f0ad4e', '#5bc0de', '#8e6bd6', '#5cb85c', '#e86fb0', '#f7f7f7', '#2f9e8f'];
const notes = ['C4', 'E4', 'G4', 'C5', 'A4', 'F4', 'D4', 'B4'];
let lastY = 0;
for (let k = 0; k < steps.length; k++) {
  const step = steps[k];
  const yTarget = step.y ?? lastY - (step.drop ?? 1.8);
  const level = { ...base, objects: withPlaced(placed) };
  const { state, hits } = simulate(level, yTarget, afterT);
  if (!state) {
    console.log(`step ${k}: marble never reached y=${yTarget}. Contacts: ${hits.join(' ')}`);
    break;
  }
  const speed = Math.hypot(state.vx, state.vy);
  const d: [number, number] = [state.vx / speed, state.vy / speed];
  const exit = step.exit ?? 15;
  const dir = step.dir === 0 ? (state.vx > 0 ? -1 : 1) : step.dir;
  const o: [number, number] = [dir * Math.cos(exit * DEG), Math.sin(exit * DEG)];
  const id = `${prefix}${k + 1}`;
  let def: ObjectDef;
  let angle = 0;
  if (step.k === 'rail') {
    // Carry toward the board centre so the rail never runs into a wall; a marble
    // moving away from the centre climbs it, stops, and rolls back.
    const dx = state.x > 0 ? -1 : 1;
    const x0 = +state.x.toFixed(2);
    const y0 = +state.y.toFixed(2);
    // Steep upstream lip: a marble arriving the wrong way stops and turns back quickly.
    const pts: [number, number, number][] = [
      [+(x0 - 1.0 * dx).toFixed(2), +(y0 + 0.8).toFixed(2), 0],
      [+(x0 - 0.5 * dx).toFixed(2), +(y0 + 0.25).toFixed(2), 0],
      [+(x0 + 0.6 * dx).toFixed(2), +(y0 - 0.2).toFixed(2), 0],
      [+(x0 + 1.8 * dx).toFixed(2), +(y0 - 0.8).toFixed(2), 0],
      [+(x0 + 2.6 * dx).toFixed(2), +(y0 - 1.7).toFixed(2), 0],
    ];
    const rail: RailDef = { type: 'rail', id, points: pts };
    def = rail;
    placed.push(def);
    lastY = y0 - 1.7;
    afterT = state.t + 0.05;
    console.log(`${id}: marble at (${state.x.toFixed(2)}, ${state.y.toFixed(2)}) v=(${state.vx.toFixed(2)}, ${state.vy.toFixed(2)}) t=${state.t.toFixed(2)} -> rail toward ${dx > 0 ? 'right' : 'left'}, ends at y ${lastY.toFixed(2)}`);
    continue;
  }
  if (step.k === 'pipe') {
    // Entry mouth on the marble's path, then a hook toward the board centre and down.
    const dx = state.x > 0 ? -1 : 1;
    const x0 = +state.x.toFixed(2);
    const y0 = +state.y.toFixed(2);
    const pts: [number, number, number][] = [
      [+(x0 - 0.3 * dx).toFixed(2), +(y0 + 0.9).toFixed(2), 0],
      [x0, +(y0 - 0.2).toFixed(2), 0],
      [+(x0 + 1.4 * dx).toFixed(2), +(y0 - 1.3).toFixed(2), 0],
      [+(x0 + 2.2 * dx).toFixed(2), +(y0 - 2.9).toFixed(2), 0],
      [+(x0 + 1.4 * dx).toFixed(2), +(y0 - 4.3).toFixed(2), 0],
    ];
    const pipe: PipeDef = { type: 'pipe', id, points: pts, color: step.color ?? '#7a3fb0', instrument: 'tube', note: step.note ?? 'C4' };
    def = pipe;
    placed.push(def);
    lastY = y0 - 4.3;
    afterT = state.t + 0.05;
    console.log(`${id}: marble at (${state.x.toFixed(2)}, ${state.y.toFixed(2)}) v=(${state.vx.toFixed(2)}, ${state.vy.toFixed(2)}) t=${state.t.toFixed(2)} -> pipe toward ${dx > 0 ? 'right' : 'left'}, exit at y ${lastY.toFixed(2)}`);
    continue;
  }
  if (step.k === 'ramp') {
    // Tilted shelf descending toward the board centre. The marble lands on its
    // upper half and rolls off the lower end from a repeatable spot.
    const dx = state.x > 0 ? -1 : 1;
    const len = 3.6;
    const theta = 25 * DEG;
    const cx = state.x + 0.9 * dx * Math.cos(theta);
    const cy = state.y - 0.5 - 0.9 * Math.sin(theta) - 0.2;
    const ramp: RampDef = {
      type: 'ramp', id,
      position: [+cx.toFixed(2), +cy.toFixed(2), 0.45],
      rotation: [0, 0, +(-dx * 25).toFixed(1)],
      size: [len, 0.4, 0.9],
    };
    def = ramp;
    placed.push(def);
    lastY = cy - (len / 2) * Math.sin(theta) + 0.2;
    afterT = state.t + 0.05;
    console.log(`${id}: marble at (${state.x.toFixed(2)}, ${state.y.toFixed(2)}) v=(${state.vx.toFixed(2)}, ${state.vy.toFixed(2)}) t=${state.t.toFixed(2)} -> ramp toward ${dx > 0 ? 'right' : 'left'}, lower end at y ${lastY.toFixed(2)}`);
    continue;
  }
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
      radius: bumperRadius,
      color: step.color ?? '#e8c44a',
    };
    def = bumper;
  }
  placed.push(def);
  lastY = state.y;
  afterT = state.t + 0.05;
  console.log(`${id}: marble at (${state.x.toFixed(2)}, ${state.y.toFixed(2)}) v=(${state.vx.toFixed(2)}, ${state.vy.toFixed(2)}) t=${state.t.toFixed(2)} -> ${step.k} normal ${angle}deg`);
}

const final: LevelFile = { ...base, objects: withPlaced(placed) };
const { hits } = simulate(final, -1000, 0);
if (placed.length === steps.length) {
  writeFileSync(levelPath, serializeLevel(final));
  console.log(`\nWrote ${placed.length} objects into ${levelPath}`);
} else {
  console.log(`\nNot written: only ${placed.length}/${steps.length} steps placed.`);
}
console.log('\nVerification contact sequence:\n  ' + hits.filter((h) => !h.startsWith('wall')).join('\n  '));
console.log('\nObjects TS:');
for (const o of placed) {
  if (o.type === 'pad') console.log(`    { type: 'pad', id: '${o.id}', position: [${o.position.join(', ')}], angle: ${o.angle}, color: '${o.color}', note: '${o.note}' },`);
  else if (o.type === 'bumper') console.log(`    { type: 'bumper', id: '${o.id}', position: [${o.position.join(', ')}], radius: ${o.radius}, color: '${o.color}' },`);
  else if (o.type === 'rail') console.log(`    { type: 'rail', id: '${o.id}', points: [${o.points.map((p) => `[${p.join(', ')}]`).join(', ')}] },`);
  else if (o.type === 'pipe') console.log(`    { type: 'pipe', id: '${o.id}', points: [${o.points.map((p) => `[${p.join(', ')}]`).join(', ')}], color: '${o.color}' },`);
  else if (o.type === 'ramp') console.log(`    { type: 'ramp', id: '${o.id}', position: [${o.position.join(', ')}], rotation: [${o.rotation!.join(', ')}], size: [${o.size.join(', ')}] },`);
}
