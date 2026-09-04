import { describe, expect, it } from 'vitest';
import { midiToFreq, noteToFreq, noteToMidi, velocityFromImpact } from '../src/audio/notes';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { MusicSystem } from '../src/audio/MusicSystem';
import { findMachine } from '../src/machines';
const playground = findMachine('alphabet').level;
import type { NoteEvent, NotePlayer } from '../src/audio/types';

describe('pitch helpers', () => {
  it('maps note names to MIDI and frequency', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('F#3')).toBe(54);
    expect(noteToMidi('Bb2')).toBe(46);
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(noteToFreq('A5')).toBeCloseTo(880);
    expect(() => noteToMidi('H2')).toThrow();
  });

  it('turns impact speed into a musical velocity in 0..1', () => {
    expect(velocityFromImpact(0, 10)).toBe(0);
    expect(velocityFromImpact(1, 10)).toBeGreaterThan(0.05);
    expect(velocityFromImpact(5, 10)).toBeLessThan(velocityFromImpact(8, 10));
    expect(velocityFromImpact(50, 10)).toBe(1);
  });
});

/** Records what the machine would play, without any audio hardware. */
class RecordingPlayer implements NotePlayer {
  notes: NoteEvent[] = [];
  play(event: NoteEvent): void {
    this.notes.push(event);
  }
  setRolling(): void {}
}

describe('the machine performs the level', () => {
  it('plays the melody written on the pads, one note per strike, in order', async () => {
    await initRapier();
    const sim = new Simulation();
    const player = new RecordingPlayer();
    const music = new MusicSystem(sim, player);
    sim.load(playground);
    const dt = config.physics.fixedDt;
    let finished = false;
    sim.bus.on('marble:reset', (e) => (finished = e.reason === 'finished'));
    for (let i = 0; i < 90 / dt && !finished; i++) sim.fixedUpdate(dt);
    expect(finished).toBe(true);

    // The whole alphabet song, one strike per pad, in order.
    const melody = player.notes.filter((n) => /^abc_\d+$/.test(n.object.id) && n.object.type === 'pad');
    expect(melody.map((n) => n.note)).toEqual(['C5', 'C5', 'G5', 'G5', 'A5', 'A5', 'G5', 'F5', 'F5', 'E5', 'E5', 'D5', 'D5', 'D5', 'D5', 'C5', 'G5', 'G5', 'F5', 'E5', 'E5', 'D5', 'G5', 'G5', 'F5', 'E5', 'E5', 'D5', 'C5', 'C5', 'G5', 'G5', 'A5', 'A5', 'G5', 'F5', 'F5', 'E5', 'E5', 'D5', 'D5', 'C5']);
    expect(melody.every((n) => n.instrument === 'marimba')).toBe(true);
    expect(melody.length).toBe(42);
    // Velocity follows the physics: every strike carries a real, non-trivial velocity.
    for (const n of melody) {
      expect(n.velocity).toBeGreaterThan(0.3);
      expect(n.velocity).toBeLessThanOrEqual(1);
    }
    expect(player.notes.some((n) => n.instrument === 'kick')).toBe(true);
    // Walls are silent by design.
    expect(player.notes.some((n) => n.object.type === 'wall')).toBe(false);

    music.dispose();
    sim.dispose();
  }, 60_000);
});
