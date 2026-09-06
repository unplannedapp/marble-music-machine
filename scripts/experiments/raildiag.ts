import { config } from '../../src/core/Config';
import { Simulation, initRapier } from '../../src/sim/Simulation';
import { railShape, type RailShape } from '../../src/levels/shapes';
await initRapier();
for (const shape of (process.argv[2] ?? 'longer,arc,s,hook').split(',') as RailShape[]) {
  const rail = railShape('r', shape, [-2, 2], 1, process.env.ENTRY ? { entry: Number(process.env.ENTRY) } : {}); if (process.env.LIP !== undefined) rail.lipDeg = Number(process.env.LIP); if (process.env.ROD) rail.rodRadius = Number(process.env.ROD); if (process.env.GAUGE) rail.gauge = Number(process.env.GAUGE); if (process.env.GROOVE) rail.groove = process.env.GROOVE as 'curve'; if (process.env.SPACING) rail.sampleSpacing = Number(process.env.SPACING);
  const end = rail.points[rail.points.length - 1];
  const sim = new Simulation();
  const sp = (process.env.SPAWN ?? '-2.4,3.6,1.5,0').split(',').map(Number);
  sim.load({ name: 'd', board: { width: 24, top: 8, bottom: -80 }, finishY: end[1] - 6, spawn: { position: [sp[0], sp[1], 0.55], velocity: [sp[2], sp[3], 0] }, killY: -80, objects: [rail] });
  const dt = config.physics.fixedDt;
  let wasTouching = false; let log: string[] = [];
  let done = false; sim.bus.on('marble:reset', () => (done = true));
  for (let t = 0; t < 12 && !done; t += dt) {
    sim.fixedUpdate(dt);
    const p = sim.marble.body.translation(); const v = sim.marble.body.linvel();
    const touching = sim.physics.isTouching(sim.objects[0]);
    if (touching !== wasTouching) log.push(`${touching ? 'ON ' : 'OFF'} t=${t.toFixed(2)} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) v=(${v.x.toFixed(1)}, ${v.y.toFixed(1)}) |v|=${Math.hypot(v.x, v.y).toFixed(1)}`);
    wasTouching = touching;
  }
  console.log(shape, 'points', JSON.stringify(rail.points), '\n  ' + log.join('\n  '));
  sim.dispose();
}
