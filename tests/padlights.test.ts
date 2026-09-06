import { describe, expect, it } from 'vitest';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { Pad } from '../src/objects/Pad';
import mary from '../src/levels/mary.level.json';
import { parseLevel } from '../src/levels/LevelFormat';

/** Pads are switched off until the marble strikes them, and stay on for the run. */
describe('pad lights', () => {
  it('switch on when struck, keep upstream keys across a respawn, and go dark on reset', async () => {
    await initRapier();
    const sim = new Simulation();
    sim.load(parseLevel(mary));
    const pads = sim.objects.filter((o): o is Pad => o instanceof Pad);
    expect(pads.length).toBeGreaterThan(5);
    expect(pads.every((p) => !p.lit)).toBe(true);

    const dt = config.physics.fixedDt;
    const struck: string[] = [];
    sim.bus.on('marble:contact', (e) => {
      if (e.object.type === 'pad' && !struck.includes(e.object.id)) struck.push(e.object.id);
    });
    let steps = 0;
    while (struck.length < 4 && steps++ < 20 / dt) sim.fixedUpdate(dt);
    expect(struck.length).toBe(4);
    for (const p of pads) expect(p.lit).toBe(struck.includes(p.id));

    // Respawn at the third pad: the two above it stay lit, the rest are off.
    const third = pads.find((p) => p.id === struck[2])!;
    sim.respawn(third.position().clone().setY(third.position().y + 1), new (await import('three')).Vector3());
    for (const p of pads) {
      const above = p.position().y > third.position().y + 1.5;
      expect(p.lit).toBe(above && struck.includes(p.id));
    }

    sim.resetMarble('manual');
    expect(pads.every((p) => !p.lit)).toBe(true);
  });
});
