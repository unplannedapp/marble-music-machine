import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import type { LevelDef } from '../../src/levels/LevelTypes';
import { Pad } from '../../src/objects/Pad';
await initRapier();
const level: LevelDef = { name: 't', board: { width: 16, top: 8, bottom: -20 }, killY: -25,
  spawn: { position: [6, 3, 0.3] }, objects: [{ type: 'pad', id: 'pad', position: [0, 0, 0], angle: 45 }] };
const sim = new Simulation(); sim.load(level);
const padBody = (sim.objectsById.get('pad') as unknown as { padBody: import('@dimforge/rapier3d-compat').RigidBody }).padBody;
const dt = config.physics.fixedDt;
for (let i = 0; i < 60; i++) { sim.fixedUpdate(dt); if (i % 6 === 0) { const r = padBody.rotation(); console.log(`${(i*dt).toFixed(3)} angle=${(2*Math.atan2(r.z, r.w)*180/Math.PI).toFixed(2)} w=${padBody.angvel().z.toFixed(2)}`); } }
