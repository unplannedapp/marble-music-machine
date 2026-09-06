import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import type { RailDef } from '../../src/levels/LevelTypes';
await initRapier();
const variants: Record<string, RailDef> = {
  plain2pt: { type: 'rail', id: 'r', points: [[-3, 2.8, 0], [-2.5, 2.25, 0], [-1.9, 2, 0], [6.1, -1.56, 0]] },
  plain2pt_nolip: { type: 'rail', id: 'r', points: [[-3, 2.8, 0], [-2.5, 2.25, 0], [-1.9, 2, 0], [6.1, -1.56, 0]], lipDeg: 0 },
  pure: { type: 'rail', id: 'r', points: [[-3, 2.6, 0], [6.1, -1.56, 0]] },
  pure_nolip: { type: 'rail', id: 'r', points: [[-3, 2.6, 0], [6.1, -1.56, 0]], lipDeg: 0 },
  pure_thick: { type: 'rail', id: 'r', points: [[-3, 2.6, 0], [6.1, -1.56, 0]], rodRadius: 0.1 },
};
for (const [name, rail] of Object.entries(variants)) {
  const sim = new Simulation();
  sim.load({ name: 'd', board: { width: 24, top: 8, bottom: -80 }, finishY: -8, spawn: { position: [-2.4, 3.6, 0.55], velocity: [1.5, 0, 0] }, killY: -80, objects: [rail] });
  const dt = config.physics.fixedDt;
  let wasTouching = false; let toggles = 0; let contacts = 0; let leftAt = '';
  sim.bus.on('marble:contact', () => contacts++);
  let done = false; sim.bus.on('marble:reset', () => (done = true));
  for (let t = 0; t < 6 && !done; t += dt) {
    sim.fixedUpdate(dt);
    const touching = sim.physics.isTouching(sim.objects[0]);
    if (touching !== wasTouching) { toggles++; if (!touching) { const p = sim.marble.body.translation(); const v = sim.marble.body.linvel(); leftAt = `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, z ${p.z.toFixed(2)}) v=(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}) t=${t.toFixed(2)}`; } }
    wasTouching = touching;
  }
  console.log(name.padEnd(16), 'toggles', toggles, 'contacts', contacts, 'last left', leftAt);
  sim.dispose();
}
