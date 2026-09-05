/**
 * Re-lay named pads onto the marble's current path, in order, keeping their
 * ids, colours, notes and place in the level. Use after moving anything
 * upstream (a pipe, a ramp): each pad is removed, the marble is run to the
 * height it used to be struck at, and the pad is put back under it aimed
 * toward the board centre, exactly as the layout tool does.
 * Usage: npx vite-node scripts/relaypads.ts <level.json> <id,id,...> [afterT]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { parseLevel, serializeLevel, type LevelFile } from '../src/levels/LevelFormat';
import type { LevelDef, PadDef } from '../src/levels/LevelTypes';
import { DEG, solveNormal } from './lib/aim';

const [file, idList, afterArg] = process.argv.slice(2);
const ids = idList.split(',');
let afterT = Number(afterArg ?? 0);
const padHalfThick = 0.14;
await initRapier();
const raw = JSON.parse(readFileSync(file, 'utf8')) as LevelFile;
const level = parseLevel(raw);
const dt = config.physics.fixedDt;

function stateAt(lvl: LevelDef, yTarget: number, after: number): { x: number; y: number; vx: number; vy: number; t: number } | null {
  const sim = new Simulation();
  sim.load(lvl);
  let reset = false;
  sim.bus.on('marble:reset', () => (reset = true));
  for (let t = 0; t < 60 && !reset; t += dt) {
    sim.fixedUpdate(dt);
    const p = sim.marble.body.translation();
    const v = sim.marble.body.linvel();
    if (t > after && p.y <= yTarget && v.y < 0) return { x: p.x, y: p.y, vx: v.x, vy: v.y, t };
  }
  return null;
}

for (const id of ids) {
  const i = level.objects.findIndex((o) => o.id === id);
  if (i < 0 || level.objects[i].type !== 'pad') throw new Error(`${id} is not a pad in ${file}`);
  const old = level.objects[i] as PadDef;
  const oldAngle = (old.angle ?? 0) * DEG;
  // The marble was struck one offset above the pad centre along its normal.
  const off = padHalfThick + config.marble.radius;
  const yTarget = old.position[1] + Math.cos(oldAngle) * off;
  const trial: LevelDef = { ...level, objects: level.objects.filter((o) => o.id !== id) };
  const s = stateAt(trial, yTarget, afterT);
  if (!s) throw new Error(`${id}: marble never reached y=${yTarget.toFixed(2)} after t=${afterT}`);
  const speed = Math.hypot(s.vx, s.vy);
  const d: [number, number] = [s.vx / speed, s.vy / speed];
  const dir = s.vx > 0 ? -1 : 1;
  const o: [number, number] = [dir * Math.cos(15 * DEG), Math.sin(15 * DEG)];
  const angle = solveNormal(d, o, config.materials.pad.restitution, speed, 0);
  const n = [-Math.sin(angle * DEG), Math.cos(angle * DEG)];
  const pad: PadDef = { ...old, position: [+(s.x - n[0] * off).toFixed(2), +(s.y - n[1] * off).toFixed(2), 0], angle };
  level.objects[i] = pad;
  afterT = s.t + 0.05;
  console.log(`${id}: marble at (${s.x.toFixed(2)}, ${s.y.toFixed(2)}) v=(${s.vx.toFixed(2)}, ${s.vy.toFixed(2)}) t=${s.t.toFixed(2)} -> pad ${pad.position.slice(0, 2).join(', ')} angle ${angle}`);
}
writeFileSync(file, serializeLevel({ ...raw, objects: level.objects }) + '\n');
console.log(`wrote ${file}`);
