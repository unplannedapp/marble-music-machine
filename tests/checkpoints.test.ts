import { describe, expect, it } from 'vitest';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { MusicSystem } from '../src/audio/MusicSystem';
import { ScoreSystem } from '../src/game/Scoring';
import { GameFlow } from '../src/game/GameFlow';
import { findMachine } from '../src/machines';
import { parseLevel, serializeLevel } from '../src/levels/LevelFormat';

const silent = { play() {}, setRolling() {} };

describe('level format', () => {
  it('round-trips the alphabet level and rejects broken input', () => {
    const level = findMachine('alphabet').level;
    const again = parseLevel(JSON.parse(serializeLevel(level)));
    expect(again.objects.length).toBe(level.objects.length);
    expect(again.checkpoints?.length).toBe(findMachine('alphabet').song.sections!.length);
    expect(() => parseLevel({ ...level, format: 99 })).toThrow(/format/);
    expect(() => parseLevel({ ...level, objects: [{ type: 'pad' }] })).toThrow(/position/);
    expect(() => parseLevel({ ...level, objects: [{ type: 'pad', id: 'a', position: [0, 0, 0] }, { type: 'pad', id: 'a', position: [1, 0, 0] }] })).toThrow(/duplicate/);
  });
});

describe('checkpoints', () => {
  it('a marble lost mid-song restarts at its section and still completes the song', async () => {
    await initRapier();
    const machine = findMachine('alphabet');
    for (const section of [1, 3, 5]) {
      const sim = new Simulation();
      const music = new MusicSystem(sim, silent);
      const scoring = new ScoreSystem(sim, machine.song);
      const flow = new GameFlow(sim, scoring);
      sim.load(machine.level);
      const ratings: string[] = [];
      let sectionStartedAt = -1;
      sim.bus.on('score:rating', (r) => {
        ratings.push(`${r.event.lyric}:${r.rating}`);
        if (r.event.section === section && sectionStartedAt < 0) sectionStartedAt = r.simTime;
      });
      let finished = false;
      let lost = false;
      sim.bus.on('marble:reset', (e) => (finished = e.reason === 'finished'));
      const dt = config.physics.fixedDt;
      for (let i = 0; i < 120 / dt && !finished; i++) {
        sim.fixedUpdate(dt);
        scoring.fixedUpdate();
        // Two notes into the section, the marble is lost: fake a fall.
        if (!lost && sectionStartedAt >= 0 && sim.simTime > sectionStartedAt + 0.9) {
          lost = true;
          sim.resetMarble('fell');
        }
      }
      const s = scoring.lastRun ?? scoring.summary();
      // eslint-disable-next-line no-console
      console.log(`section ${section}: ${s.hits}/${s.total} hits, misses ${s.ratings.MISS}, maxCombo ${s.maxCombo}\n  ${ratings.join(' ')}`);
      expect(lost).toBe(true);
      expect(finished).toBe(true);
      expect(s.hits).toBe(42);
      expect(s.ratings.MISS).toBe(0);
      // The combo restarted at the checkpoint, so it cannot span the whole song.
      expect(s.maxCombo).toBeLessThan(42);
      flow.dispose();
      music.dispose();
      scoring.dispose();
      sim.dispose();
    }
  }, 120_000);
});
