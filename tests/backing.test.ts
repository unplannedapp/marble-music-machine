import { describe, expect, it } from 'vitest';
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import { MusicSystem } from '../src/audio/MusicSystem';
import { Backing } from '../src/audio/Backing';
import { findMachine } from '../src/machines';
import { beatSeconds } from '../src/songs/types';
import { noteToMidi } from '../src/audio/notes';
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
  midi: { at: number; midi: number; seconds: number; vel: number }[] = [];
  playMidiNote(at: number, midi: number, seconds: number, vel: number): void {
    this.midi.push({ at, midi, seconds, vel });
  }
  loaded = '';
  loadClip(src: string): void {
    this.loaded = src;
  }
  playClip(at: number, offset: number, seconds: number): boolean {
    this.clips.push({ at, offset, seconds });
    return true;
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
    // The finishing reset cut the synthesised bed.
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

  it('plays a song recording straight through, re-synchronised at each section from its first strike', async () => {
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
      if (finished) break;
      backing.update();
    }
    const strikes = rec.notes.filter((n) => n.object.type === 'pad');
    // The record starts so its first note lands on the first strike and runs to the end;
    // then one restart per later section, from that section's first note, at its strike.
    expect(rec.clips.length).toBe(m.song.sections!.length);
    const intro = rec.clips[0];
    expect(intro.at + (audio.onsets[0] - intro.offset)).toBeCloseTo(m.song.firstStrike!, 2);
    expect(intro.seconds).toBe(Number.POSITIVE_INFINITY);
    const sectionStarts = m.song.events.map((e, i) => ({ e, i })).filter(({ e, i }) => i === 0 || e.section !== m.song.events[i - 1].section);
    rec.clips.slice(1).forEach((c, k) => {
      const { i } = sectionStarts[k + 1];
      expect(c.offset).toBe(audio.onsets[i]);
      expect(Math.abs(c.at - strikes[i].simTime)).toBeLessThan(1e-6);
      expect(c.seconds).toBe(Number.POSITIVE_INFINITY);
    });
    // No synthesised bed under a recording.
    expect(rec.chords.length).toBe(0);
    expect(rec.melody.length).toBe(0);
    music.dispose();
    backing.dispose();
  });

  it('plays a MIDI arrangement warped between strikes, each melody note landing on its pad', async () => {
    await initRapier();
    const m = findMachine('pirate');
    const arrangement = m.song.backing!.midi!;
    const sim = new Simulation();
    sim.load(m.level);
    const rec = new Recorder();
    const music = new MusicSystem(sim, rec);
    const backing = new Backing(sim, rec, m.song);
    const dt = config.physics.fixedDt;
    let finished = false;
    sim.bus.on('marble:reset', (e) => (finished = finished || e.reason === 'finished'));
    for (let t = 0; t < 120 && !finished; t += dt) {
      sim.fixedUpdate(dt);
      if (finished) break;
      backing.update();
    }
    const strikes = rec.notes.filter((n) => n.object.type === 'pad');
    expect(strikes.length).toBe(m.song.events.length);
    // The whole file is played, in order, and the intro sounds before the first strike.
    expect(rec.midi.length).toBe(arrangement.length);
    for (let i = 1; i < rec.midi.length; i++) expect(rec.midi[i].at).toBeGreaterThanOrEqual(rec.midi[i - 1].at - 1e-6);
    expect(rec.midi[0].at).toBeLessThan(strikes[0].simTime - 0.5);
    // Every strike's own note in the arrangement lands on the strike (within a physics step).
    m.song.events.forEach((e, i) => {
      const own = rec.midi.filter((n) => Math.abs(n.at - strikes[i].simTime) < 0.02 && n.midi === noteToMidi(e.note!));
      expect(own.length).toBeGreaterThan(0);
    });
    // No synthesised bed or melody line under an arrangement.
    expect(rec.chords.length).toBe(0);
    expect(rec.melody.length).toBe(0);
    music.dispose();
    backing.dispose();
  });
});
