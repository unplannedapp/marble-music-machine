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
  melody: { at: number; note: string }[] = [];
  stops = 0;
  playMelody(at: number, note: string): void {
    this.melody.push({ at, note });
  }
  clips: { at: number; offset: number; seconds: number }[] = [];
  loaded = '';
  loadClip(src: string): void {
    this.loaded = src;
  }
  playClip(at: number, offset: number, seconds: number): void {
    this.clips.push({ at, offset, seconds });
  }
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
    // Only objects with a note sound when struck: the rails carry the marble in silence.
    expect(rec.notes.every((n) => !!n.object.def.note)).toBe(true);
    expect(rec.notes.some((n) => n.object.type === 'rail')).toBe(false);
    // The melody line plays on underneath at the song's own beats, after the first strike,
    // and matches the notes the pads play.
    const padNotes = rec.notes.filter((n) => n.object.type === 'pad');
    expect(rec.melody.length).toBe(m.song.events.length - m.song.sections!.length);
    for (const s of rec.melody) expect(s.at).toBeGreaterThanOrEqual(first.simTime);
    const byTime = padNotes.map((n) => n.note);
    for (const s of rec.melody) expect(byTime).toContain(s.note);
    music.dispose();
    backing.dispose();
  });

  it('plays a song recording slice by slice, each cut at its onset, when the marble strikes the pad', async () => {
    await initRapier();
    const m = findMachine('calm');
    const audio = m.song.backing!.audio!;
    const sim = new Simulation();
    sim.load(m.level);
    const rec = new Recorder();
    const music = new MusicSystem(sim, rec);
    const backing = new Backing(sim, rec, m.song);
    expect(rec.loaded).toBe(audio.src);
    const dt = config.physics.fixedDt;
    let finished = false;
    sim.bus.on('marble:reset', (e) => (finished = finished || e.reason === 'finished'));
    for (let t = 0; t < 60 && !finished; t += dt) {
      sim.fixedUpdate(dt);
      backing.update();
    }
    const strikes = rec.notes.filter((n) => n.object.type === 'pad');
    // The intro leads into the first strike, then one slice per note, in order.
    const slices = rec.clips.filter((c) => audio.onsets.includes(c.offset));
    expect(slices.length).toBe(m.song.events.length);
    slices.forEach((c, i) => {
      expect(c.offset).toBe(audio.onsets[i]);
      expect(Math.abs(c.at - strikes[i].simTime)).toBeLessThan(1e-6);
      if (i + 1 < audio.onsets.length) expect(c.seconds).toBeCloseTo(audio.onsets[i + 1] - audio.onsets[i], 6);
    });
    const intro = rec.clips.find((c) => !audio.onsets.includes(c.offset));
    expect(intro).toBeDefined();
    expect(intro!.at + intro!.seconds).toBeCloseTo(m.song.firstStrike!, 2);
    // No synthesised bed under a recording.
    expect(rec.chords.length).toBe(0);
    expect(rec.melody.length).toBe(0);
    music.dispose();
    backing.dispose();
  });
});
