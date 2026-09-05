/**
 * Slide each pipe onto the marble's real path: run the machine with the pipe
 * removed, find where the marble crosses the pipe's mouth, move the whole pipe
 * so its mouth is there and its first segment points along the marble's
 * velocity. Downstream objects were laid on the old exit, so check the run
 * afterwards (npm test) and re-lay anything that broke.
 * Usage: npx vite-node scripts/pipealign.ts <level.json> [passes]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { parseLevel, serializeLevel, type LevelFile } from '../src/levels/LevelFormat';
import type { LevelDef, PipeDef } from '../src/levels/LevelTypes';

const file = process.argv[2];
const passes = Number(process.argv[3] ?? 2);
await initRapier();
const raw = JSON.parse(readFileSync(file, 'utf8')) as LevelFile;
const level = parseLevel(raw);
const dt = config.physics.fixedDt;

function crossing(lvl: LevelDef, pipeId: string, yMouth: number): { x: number; y: number; vx: number; vy: number; t: number } | null {
  const trial: LevelDef = JSON.parse(JSON.stringify(lvl));
  trial.objects = trial.objects.filter((o) => o.id !== pipeId);
  const sim = new Simulation();
  sim.load(trial);
  let prev = sim.marble.body.translation();
  for (let t = 0; t < 60; t += dt) {
    sim.fixedUpdate(dt);
    const p = sim.marble.body.translation();
    if (prev.y >= yMouth && p.y < yMouth) {
      const v = sim.marble.body.linvel();
      const k = (prev.y - yMouth) / (prev.y - p.y);
      return { x: prev.x + (p.x - prev.x) * k, y: yMouth, vx: v.x, vy: v.y, t };
    }
    prev = p;
  }
  return null;
}

for (let pass = 0; pass < passes; pass++) {
  for (const o of level.objects) {
    if (o.type !== 'pipe') continue;
    const pipe = o as PipeDef;
    const [p0, p1] = pipe.points;
    const c = crossing(level, pipe.id!, p0[1]);
    if (!c) { console.log(`${pipe.id}: marble never reaches y=${p0[1]}`); continue; }
    const dx = c.x - p0[0];
    const speed = Math.hypot(c.vx, c.vy);
    const seg = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const shifted = pipe.points.map((p) => [+(p[0] + dx).toFixed(2), p[1], p[2]] as [number, number, number]);
    // Aim the first segment along the marble's velocity so it enters straight.
    shifted[1] = [+(shifted[0][0] + (c.vx / speed) * seg).toFixed(2), +(shifted[0][1] + (c.vy / speed) * seg).toFixed(2), p1[2]];
    console.log(`pass ${pass} ${pipe.id}: mouth moved ${dx.toFixed(2)} in x (t=${c.t.toFixed(2)}, v=(${c.vx.toFixed(1)}, ${c.vy.toFixed(1)}))`);
    pipe.points = shifted;
  }
}
writeFileSync(file, serializeLevel({ ...raw, objects: level.objects }) + '\n');
console.log(`wrote ${file}`);
