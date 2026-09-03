import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import type { LevelDef } from '../../src/levels/LevelTypes';
import { Pad } from '../../src/objects/Pad';

await initRapier();
const level: LevelDef = {
  name: 't', board: { width: 16, top: 8, bottom: -20 }, killY: -25,
  spawn: { position: [0, 3, 0.3], velocity: [0, 0, 0] },
  objects: [{ type: 'pad', id: 'pad', position: [0, 0, 0], angle: 45 }],
};
const sim = new Simulation();
sim.load(level);
const pad = sim.objectsById.get('pad') as Pad;
const padBody = (pad as unknown as { padBody: import('@dimforge/rapier3d-compat').RigidBody }).padBody;
let hitT = -1;
sim.bus.on('marble:contact', (e) => { console.log(`HIT ${e.simTime.toFixed(4)} n=(${e.normal.x.toFixed(2)},${e.normal.y.toFixed(2)}) imp=${e.impactSpeed.toFixed(2)}`); if (hitT < 0) hitT = e.simTime; });
sim.bus.on('marble:separate', (e) => console.log(`SEP ${e.simTime.toFixed(4)}`));
const dt = config.physics.fixedDt;
for (let t = 0; t < 2; t += dt) {
  sim.fixedUpdate(dt);
  if (hitT >= 0 && t < hitT + 0.12) {
    const p = sim.marble.body.translation(); const v = sim.marble.body.linvel();
    const r = padBody.rotation(); const ang = 2 * Math.atan2(r.z, r.w) * 180 / Math.PI; const w = padBody.angvel();
    console.log(`${t.toFixed(4)} m=(${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}) v=(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}) pad=${ang.toFixed(2)}deg w=${w.z.toFixed(2)} padT=(${padBody.translation().x.toFixed(3)},${padBody.translation().y.toFixed(3)})`);
  }
}
