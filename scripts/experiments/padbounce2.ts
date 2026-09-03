import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import type { LevelDef } from '../../src/levels/LevelTypes';

await initRapier();
function run(label: string, angle: number, dx: number, vx = 0) {
  const level: LevelDef = {
    name: 't', board: { width: 16, top: 8, bottom: -20 }, killY: -25,
    spawn: { position: [dx, 3, 0.3], velocity: [vx, 0, 0] },
    objects: [{ type: 'pad', id: 'pad', position: [0, 0, 0], angle }],
  };
  const sim = new Simulation();
  sim.load(level);
  let hitT = -1; let maxSpeed = 0; let vIn = ''; let vOut = '';
  sim.bus.on('marble:contact', (e) => { if (hitT < 0) { hitT = e.simTime; vIn = `${e.velocity.x.toFixed(2)},${e.velocity.y.toFixed(2)} n=${e.normal.x.toFixed(2)},${e.normal.y.toFixed(2)},${e.normal.z.toFixed(2)}`; } });
  const dt = config.physics.fixedDt;
  for (let t = 0; t < 2.5; t += dt) {
    sim.fixedUpdate(dt);
    if (hitT >= 0 && t < hitT + 0.15) {
      const v = sim.marble.body.linvel();
      const s = Math.hypot(v.x, v.y, v.z);
      if (s > maxSpeed) { maxSpeed = s; vOut = `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`; }
    }
  }
  console.log(`${label.padEnd(30)} in=(${vIn}) maxOut=${maxSpeed.toFixed(2)} (${vOut})`);
  sim.dispose();
}
run('flat, centre', 0, 0);
run('flat, off-centre 0.5', 0, 0.5);
run('45deg, centre', 45, 0);
run('45deg, off 0.3', 45, 0.3);
run('45deg, off -0.3', 45, -0.3);
run('45deg, moving +3', 45, -1.2, 3);
config.pad.stiffness = 5000; config.pad.damping = 60;
run('45deg stiff spring, centre', 45, 0);
