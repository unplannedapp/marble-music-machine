import { describe, expect, it } from 'vitest';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { MusicSystem } from '../src/audio/MusicSystem';
import { Backing } from '../src/audio/Backing';
import { findMachine } from '../src/machines';
import { beatSeconds } from '../src/songs/types';
import type { BackingPlayer, NoteEvent, NotePlayer } from '../src/audio/types';

class Recorder implements NotePlayer, BackingPlayer {
  notes: NoteEvent[] = [];
  chords: { at: number; notes: string[]; seconds: number }[] = [];
  stops = 0;
  play(e: NoteEvent): void {
    this.notes.push(e);
  }
  setRolling(): void {}
  playChord(at: number, notes: string[], seconds: number): void {
    this.chords.push({ at, notes, seconds });
  }
  stopChords(): void {
    this.stops++;
  }
}

/** The chord bed follows the song clock: one chord per bar from the first strike, in step with the notes. */
describe('backing', () => {
  it('lays one chord per bar under Mary, anchored on the first note, and stops on a reset', async () => {
    await initRapier();
    const m = findMachine('mary');
    const sim = new Simulation();
    sim.load(m.level);
    const rec = new Recorder();
    const music = new MusicSystem(sim, rec);
    const backing = new Backing(sim, rec, m.song);
    const dt = config.physics.fixedDt;
    let finished = false;
    sim.bus.on('marble:reset', (e) => (finished = finished || e.reason === 'finished'));
    for (let t = 0; t < 40 && !finished; t += dt) {
      sim.fixedUpdate(dt);
      backing.update();
    }
    const first = rec.notes.find((n) => n.object.id === 'lamb_1')!;
    expect(first).toBeDefined();
    const bar = beatSeconds(m.song, 4);
    expect(rec.chords.length).toBeGreaterThan(6);
    // First chord lands on the first note; bars follow at the song's tempo until a section re-anchors.
    expect(Math.abs(rec.chords[0].at - first.simTime)).toBeLessThan(0.02);
    expect(rec.chords[0].notes).toEqual(['C3', 'E3', 'G3']);
    expect(Math.abs(rec.chords[1].at - rec.chords[0].at - bar)).toBeLessThan(0.02);
    for (const c of rec.chords) expect(Math.abs(c.seconds - bar)).toBeLessThan(1e-6);
    // Chords never overlap or run backwards, even where a section re-anchors the clock.
    for (let i = 1; i < rec.chords.length; i++) expect(rec.chords[i].at - rec.chords[i - 1].at).toBeGreaterThan(bar - 0.06);
    // The finishing reset cut the bed.
    expect(rec.stops).toBeGreaterThan(0);
    // Everything that is not a pad is quieter than a pad strike of the same impact.
    const rail = rec.notes.find((n) => n.object.type === 'rail');
    if (rail) expect(rail.velocity).toBeLessThan(0.6);
    music.dispose();
    backing.dispose();
  });
});
