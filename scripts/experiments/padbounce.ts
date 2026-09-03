import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import type { LevelDef } from '../../src/levels/LevelTypes';

await initRapier();
async function run(label: string, mutate: () => void, pad: Record<string, unknown> = {}) {
  mutate();
  const level: LevelDef = {
    name: 't', board: { width: 16, top: 8, bottom: -20 }, killY: -25,
    spawn: { position: [0.1, 4, 0.3], velocity: [0, 0, 0] },
    objects: [{ type: 'pad', id: 'pad', position: [0, 0, 0], angle: 0, ...pad } as never],
  };
  const sim = new Simulation();
  sim.load(level);
  let hitT = -1; let imp = 0; let maxAfter = 0; let reboundY = 0;
  sim.bus.on('marble:contact', (e) => { if (hitT < 0) { hitT = e.simTime; imp = e.impactSpeed; } });
  const dt = config.physics.fixedDt;
  for (let t = 0; t < 3; t += dt) {
    sim.fixedUpdate(dt);
    if (hitT >= 0) {
      const v = sim.marble.body.linvel();
      if (v.y > reboundY) reboundY = v.y;
      const p = sim.marble.body.translation();
      if (p.y > maxAfter) maxAfter = p.y;
    }
  }
  console.log(`${label.padEnd(34)} impact=${imp.toFixed(2)} reboundVy=${reboundY.toFixed(2)} apexY=${maxAfter.toFixed(2)}`);
  sim.dispose();
}
const base = JSON.parse(JSON.stringify(config));
const restore = () => { Object.assign(config.pad, base.pad); Object.assign(config.materials.pad, base.materials.pad); };
await run('default', restore);
await run('density 100', () => { restore(); config.pad.density = 100; });
await run('stiffness 5000 damping 50', () => { restore(); config.pad.stiffness = 5000; config.pad.damping = 50; });
await run('restitution 0.9', () => { restore(); config.materials.pad.restitution = 0.9; });
await run('density 100 + rest 0.9', () => { restore(); config.pad.density = 100; config.materials.pad.restitution = 0.9; });
await run('ramp (fixed box) rest 0.62', restore, { type: 'ramp', size: [1.6, 0.28, 0.9], position: [0, 0, 0.5] });
