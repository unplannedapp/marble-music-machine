import { describe, expect, it } from 'vitest';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { findMachine } from '../src/machines';
const playground = findMachine('alphabet').level;
import type { LevelDef } from '../src/levels/LevelTypes';

interface RunResult {
  order: string[];
  resets: string[];
  minZ: number;
  maxSpeed: number;
  contacts: { t: number; id: string; impact: number }[];
}

/** Run a level headlessly until the marble falls out of the machine (or 40 s). */
function runLevel(level: LevelDef, seconds = 100): RunResult {
  const sim = new Simulation();
  sim.load(level);
  const contacts: RunResult['contacts'] = [];
  const resets: string[] = [];
  sim.bus.on('marble:contact', (e) => contacts.push({ t: +e.simTime.toFixed(3), id: e.object.id, impact: +e.impactSpeed.toFixed(2) }));
  sim.bus.on('marble:reset', (e) => resets.push(`${e.reason}@${e.simTime.toFixed(2)}`));
  const dt = config.physics.fixedDt;
  let minZ = Infinity;
  let maxSpeed = 0;
  for (let i = 0; i < seconds / dt; i++) {
    sim.fixedUpdate(dt);
    const p = sim.marble.body.translation();
    minZ = Math.min(minZ, p.z);
    maxSpeed = Math.max(maxSpeed, sim.marble.speed());
    if (resets.length > 0) break; // the fall out of the machine at the end (load's reset precedes the subscription)
  }
  sim.dispose();
  return { order: [...new Set(contacts.map((c) => c.id))], resets, minZ, maxSpeed, contacts };
}

/** Every guided object in the playground, in the order the marble must meet them. */
const GUIDED_ORDER = [
  'rail_start',
  ...Array.from({ length: 49 }, (_, i) => `abc_${i + 1}`),
];

/**
 * Headless run of the playground. This is both a regression test and the
 * level-tuning tool: it prints the sequence of contacts so a level author can
 * see which objects the marble actually reached.
 */
describe('playground level', () => {
  it('marble travels the whole machine through real contacts without tunnelling', async () => {
    await initRapier();
    const r = runLevel(playground);
    // eslint-disable-next-line no-console
    console.log(`resets: ${r.resets.join(', ')}  minZ=${r.minZ.toFixed(3)} maxSpeed=${r.maxSpeed.toFixed(2)}\ncontact order: ${r.order.join(' -> ')}`);

    // Never sank into the backboard (surface at z = 0) and never flew through the glass.
    expect(r.minZ).toBeGreaterThan(config.marble.radius - 0.05);
    // The objects guide the marble the whole way: every one is touched, in machine order,
    // and after the last note the marble drops out of the machine, never by hitting a wall.
    expect(r.order).toEqual(GUIDED_ORDER);
    expect(r.resets[r.resets.length - 1]).toMatch(/^finished/);
    // The pad zigzag settles into a steady rhythm: consecutive pad hits evenly spaced.
    const padHits = r.contacts.filter((c) => /^abc_[1-6]$/.test(c.id));
    const gaps = padHits.slice(1).map((c, i) => c.t - padHits[i].t);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    // eslint-disable-next-line no-console
    console.log(`pad hop period ${mean.toFixed(2)}s, run length ${r.resets[0]}`);
    for (const gap of gaps) expect(Math.abs(gap - mean)).toBeLessThan(mean * 0.35);
  }, 60_000);

  it('is robust to small perturbations of the launch (controlled unpredictability)', async () => {
    await initRapier();
    // The sweeping layouts trade launch tolerance for the reference look: a long
    // chain of shallow stair pads and slow rails amplifies a launch change of a few
    // percent. The game itself is deterministic; this guards float-level differences.
    for (const dv of [-0.01, 0.01]) {
      const level: LevelDef = JSON.parse(JSON.stringify(playground));
      level.spawn.velocity = [(level.spawn.velocity?.[0] ?? 0) + dv, 0, 0];
      const r = runLevel(level);
      // eslint-disable-next-line no-console
      console.log(`dv=${dv}: ${r.order.join(' -> ')}`);
      // The phrase rails re-gather the marble, so even a long chain stays exact.
      expect(r.order).toEqual(GUIDED_ORDER);
      expect(r.resets[r.resets.length - 1]).toMatch(/^finished/);
    }
  }, 120_000);
});
