// Dump the loop track's colliders near the entry: are the floor rod and guards where they should be?
import RAPIER from '@dimforge/rapier3d-compat';
import { initRapier, Simulation } from '../../src/sim/Simulation';
import { loopRail } from '../../src/levels/shapes';
import type { LevelDef } from '../../src/levels/LevelTypes';
await initRapier();
const angle = Number(process.env.ANGLE ?? 40);
const rail = loopRail('loop', [-4, 3], 1, { angle });
const level: LevelDef = { name: 't', board: { width: 16, top: 8, bottom: -40, glass: 2.4 }, spawn: { position: [0, 0, 0.32] }, killY: -30, objects: [rail] };
const sim = new Simulation(); sim.load(level);
const a = (angle * Math.PI) / 180; const d = [Math.cos(a), -Math.sin(a)];
console.log('first path points', JSON.stringify(rail.points.slice(0, 4)));
const rows: string[] = [];
for (const c of sim.objectsById.get('loop')!.colliders) {
  const t = c.translation();
  const along = (t.x + 4) * d[0] + (t.y - 3) * d[1];
  if (along < 1.4 && along > -0.5 && c.shapeType() === RAPIER.ShapeType.Capsule) {
    const perp = -(t.x + 4) * d[1] + (t.y - 3) * d[0]; // + = above the line (toward up-perp)
    const r = (c.shape as RAPIER.Capsule).radius;
    rows.push(`along ${along.toFixed(2)} perp ${perp.toFixed(2)} z ${t.z.toFixed(2)} radius ${r.toFixed(3)}`);
  }
}
console.log(rows.sort().join('\n'));
