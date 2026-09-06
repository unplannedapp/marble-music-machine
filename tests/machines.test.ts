import { describe, expect, it } from 'vitest';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { MusicSystem } from '../src/audio/MusicSystem';
import { ScoreSystem } from '../src/game/Scoring';
import { machines } from '../src/machines';
import type { NoteEvent } from '../src/audio/types';

const silent = { play() {}, setRolling() {} };

/**
 * Every registered machine must be a complete, guided, playable performance:
 * every object in its own order, no wall contact, the song's notes in order,
 * every target judged as a hit, and the marble leaving the machine at the bottom.
 */
describe('switching machines', () => {
  it('unloads one machine and plays another on the same simulation', async () => {
    await initRapier();
    const sim = new Simulation();
    const music = new MusicSystem(sim, silent);
    const scoringA = new ScoreSystem(sim, machines[0].song);
    sim.load(machines[0].level);
    const dt = config.physics.fixedDt;
    for (let i = 0; i < 4 / dt; i++) sim.fixedUpdate(dt);
    scoringA.dispose();
    const scoring = new ScoreSystem(sim, machines[1].song);
    sim.load(machines[1].level);
    let finished = false;
    sim.bus.on('marble:reset', (e) => (finished = e.reason === 'finished'));
    for (let i = 0; i < 120 / dt && !finished; i++) {
      sim.fixedUpdate(dt);
      scoring.fixedUpdate();
    }
    expect(finished).toBe(true);
    expect((scoring.lastRun ?? scoring.summary()).ratings.MISS).toBe(0);
    music.dispose();
    sim.dispose();
  }, 60_000);
});

describe.each(machines.map((m) => [m.id, m] as const))('machine %s', (_id, machine) => {
  it('performs its song end to end', async () => {
    await initRapier();
    const sim = new Simulation();
    const played: NoteEvent[] = [];
    const music = new MusicSystem(sim, { play: (n) => played.push(n), setRolling() {} });
    const scoring = new ScoreSystem(sim, machine.song);
    sim.load(machine.level);
    const order: string[] = [];
    sim.bus.on('marble:contact', (e) => {
      if (!order.includes(e.object.id)) order.push(e.object.id);
    });
    let finished = false;
    sim.bus.on('marble:reset', (e) => (finished = e.reason === 'finished'));
    const dt = config.physics.fixedDt;
    for (let i = 0; i < 120 / dt && !finished; i++) {
      sim.fixedUpdate(dt);
      scoring.fixedUpdate();
    }
    const s = scoring.lastRun ?? scoring.summary();
    // eslint-disable-next-line no-console
    console.log(`${machine.title}: score ${s.score}, ${s.hits}/${s.total}, maxCombo ${s.maxCombo}, misses ${s.ratings.MISS}`);
    expect(finished).toBe(true);
    // Guided objects (everything except the walls) in level order, then the drop into the dark.
    // A mechanism's parts (a plunger and its lane) are one station: their mutual order is free.
    const station = (id: string) => id.replace(/_(plunger|feed|catch)$/, '');
    const guided = [...new Set(machine.level.objects.map((o) => station(o.id!)).filter((id) => !/^wall_/.test(id)))];
    expect([...new Set(order.map(station))]).toEqual(guided);
    // The song, note for note.
    const targets = new Set(machine.song.events.map((e) => e.object));
    const notes = played.filter((n) => targets.has(n.object.id)).map((n) => n.note);
    expect(notes).toEqual(machine.song.events.map((e) => e.note));
    expect(s.hits).toBe(machine.song.events.length);
    expect(s.ratings.MISS).toBe(0);
    expect(s.maxCombo).toBe(machine.song.events.length);
    music.dispose();
    scoring.dispose();
    sim.dispose();
  }, 90_000);
});
