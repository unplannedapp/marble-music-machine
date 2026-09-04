import { describe, expect, it } from 'vitest';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { MusicSystem } from '../src/audio/MusicSystem';
import { ScoreSystem, pointsFor, rateDelta, type Rating } from '../src/game/Scoring';
import { playground } from '../src/levels/playground';
import { alphabetSong } from '../src/songs/alphabet';
import type { NotePlayer } from '../src/audio/types';

const silent: NotePlayer = { play() {}, setRolling() {} };

describe('timing and score rules', () => {
  it('rates deltas by the configured windows', () => {
    expect(rateDelta(0)).toBe('PERFECT');
    expect(rateDelta(-0.03)).toBe('PERFECT');
    expect(rateDelta(0.06)).toBe('EXACT');
    expect(rateDelta(0.12)).toBe('GOOD');
    expect(rateDelta(-0.2)).toBe('EARLY');
    expect(rateDelta(0.2)).toBe('LATE');
    expect(rateDelta(0.5)).toBe('MISS');
  });

  it('scores base + timing + velocity, scaled by combo, and nothing for a miss', () => {
    expect(pointsFor('MISS', 1, 5)).toBe(0);
    expect(pointsFor('PERFECT', 1, 0)).toBe(250);
    expect(pointsFor('GOOD', 0.5, 10)).toBe(Math.round((100 + 50 + 25) * 2));
    expect(pointsFor('PERFECT', 1, 20)).toBeGreaterThan(pointsFor('PERFECT', 1, 1));
  });
});

describe('the machine performs the alphabet song against its timeline', () => {
  it('judges every target, keeps the combo, and finishes the song', async () => {
    await initRapier();
    const sim = new Simulation();
    const music = new MusicSystem(sim, silent);
    const scoring = new ScoreSystem(sim, alphabetSong);
    sim.load(playground);
    const ratings: { lyric: string; rating: Rating; delta: number }[] = [];
    sim.bus.on('score:rating', (r) => ratings.push({ lyric: r.event.lyric ?? '', rating: r.rating, delta: r.delta }));
    const dt = config.physics.fixedDt;
    let finished = false;
    sim.bus.on('marble:reset', (e) => (finished = e.reason === 'finished'));
    for (let i = 0; i < 90 / dt && !finished; i++) {
      sim.fixedUpdate(dt);
      scoring.fixedUpdate();
    }
    // Read the summary before the finish reset clears it.
    const s = scoring.lastRun ?? scoring.summary();
    // eslint-disable-next-line no-console
    console.log(
      `score ${s.score} maxCombo ${s.maxCombo} ` +
        Object.entries(s.ratings).map(([k, v]) => `${k}:${v}`).join(' ') +
        '\n' +
        ratings.map((r) => `${r.lyric}:${r.rating}${Number.isFinite(r.delta) ? '(' + Math.round(r.delta * 1000) + 'ms)' : ''}`).join(' '),
    );
    expect(finished).toBe(true);
    expect(s.total).toBe(42);
    expect(s.hits + s.ratings.MISS).toBe(42);
    expect(s.ratings.MISS).toBe(0);
    expect(s.maxCombo).toBe(42);
    expect(s.score).toBeGreaterThan(0);
    music.dispose();
    scoring.dispose();
    sim.dispose();
  }, 60_000);
});
