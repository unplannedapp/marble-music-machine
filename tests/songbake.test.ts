import { describe, expect, it } from 'vitest';
import { initRapier } from '../src/sim/Simulation';
import { bakeMachine } from '../src/game/SongBake';
import { findMachine } from '../src/machines';

/**
 * The level is the sequencer: baking a song from the machine's own run must
 * reproduce the authored song's rhythm, because the authored rhythm is what
 * the pads were laid out to play.
 */
describe('song baking', () => {
  it.each(['mary', 'alphabet'])('recovers the authored rhythm of %s from the physics alone', async (id) => {
    await initRapier();
    const m = findMachine(id);
    const baked = bakeMachine(m.level, { bpm: m.song.bpm });
    expect(baked.finished).toBe(true);
    expect(baked.song.events.length).toBe(m.song.events.length);
    expect(baked.song.events.map((e) => e.object)).toEqual(m.song.events.map((e) => e.object));
    expect(baked.song.events.map((e) => e.note)).toEqual(m.song.events.map((e) => e.note));
    // Phrasing: the bake splits sections at every phrase ramp, which is at least every
    // authored line (the alphabet also holds notes mid-line).
    expect(baked.checkpoints.length).toBeGreaterThanOrEqual(m.song.sections!.length);
    expect(baked.checkpoints[0].section).toBe(0);
    // Beats quantised to eighths land on the authored grid, allowing one eighth of drift per note.
    const off = baked.song.events.map((e, i) => Math.abs(e.beat - m.song.events[i].beat));
    // eslint-disable-next-line no-console
    console.log(`${id}: ${baked.song.events.length} events, ${baked.checkpoints.length} sections, max beat offset ${Math.max(...off)}`);
    expect(Math.max(...off)).toBeLessThanOrEqual(0.5);
  }, 60_000);
});
