/**
 * Bake checkpoints into a level: run the machine once, and for every song section
 * record the marble's state a moment before its first strike. Writes the level file.
 * Usage: npx vite-node scripts/bake.ts <machineId>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { MusicSystem } from '../src/audio/MusicSystem';
import { ScoreSystem } from '../src/game/Scoring';
import { findMachine, levelPath } from '../src/machines';
import { parseLevel, serializeLevel } from '../src/levels/LevelFormat';

const id = process.argv[2] ?? 'alphabet';
const LEAD = 0.35; // seconds before the first strike of a section
await initRapier();
const machine = findMachine(id);
const sim = new Simulation();
new MusicSystem(sim, { play() {}, setRolling() {} });
const scoring = new ScoreSystem(sim, machine.song);
sim.load(machine.level);

interface Sample { t: number; p: [number, number, number]; v: [number, number, number]; w: [number, number, number] }
const history: Sample[] = [];
const checkpoints: { section: number; position: [number, number, number]; velocity: [number, number, number]; spin: [number, number, number]; time: number }[] = [];
const seen = new Set<number>();
sim.bus.on('score:rating', (r) => {
  const section = r.event.section ?? 0;
  if (seen.has(section) || r.rating === 'MISS') return;
  seen.add(section);
  const at = r.simTime - LEAD;
  const s = history.reduce((best, h) => (Math.abs(h.t - at) < Math.abs(best.t - at) ? h : best), history[0]);
  const r3 = (a: number[]): [number, number, number] => a.map((n) => +n.toFixed(3)) as [number, number, number];
  checkpoints.push({ section, position: r3(s.p), velocity: r3(s.v), spin: r3(s.w), time: +s.t.toFixed(4) });
});
const dt = config.physics.fixedDt;
let finished = false;
sim.bus.on('marble:reset', (e) => (finished = e.reason === 'finished'));
for (let i = 0; i < 120 / dt && !finished; i++) {
  sim.fixedUpdate(dt);
  scoring.fixedUpdate();
  const p = sim.marble.body.translation();
  const v = sim.marble.body.linvel();
  const w = sim.marble.body.angvel();
  history.push({ t: sim.simTime, p: [p.x, p.y, p.z], v: [v.x, v.y, v.z], w: [w.x, w.y, w.z] });
  if (history.length > 400) history.shift();
}
if (!finished) throw new Error('run did not finish; not baking');
const path = levelPath(id);
const level = parseLevel(JSON.parse(readFileSync(path, 'utf8')));
level.checkpoints = checkpoints;
writeFileSync(path, serializeLevel(level));
console.log(`baked ${checkpoints.length} checkpoints into ${path}:`);
for (const c of checkpoints) console.log(`  section ${c.section} at (${c.position[0]}, ${c.position[1]}) v=(${c.velocity[0]}, ${c.velocity[1]})`);
