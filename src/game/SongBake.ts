import { config } from '../core/Config';
import { Simulation } from '../sim/Simulation';
import { MusicSystem } from '../audio/MusicSystem';
import type { LevelDef } from '../levels/LevelTypes';
import type { SongDef, SongEvent } from '../songs/types';
import type { NoteEvent } from '../audio/types';

export interface BakedMachine {
  song: SongDef;
  checkpoints: NonNullable<LevelDef['checkpoints']>;
  finished: boolean;
  /** Simulation seconds the run took. */
  duration: number;
}

/**
 * The level is the sequencer: run a machine headlessly and turn the pads it
 * strikes, in order, into its song. The gap between consecutive strikes is
 * quantised to eighth notes at the given tempo and the beats accumulate, so a
 * machine that runs a little faster or slower than the nominal tempo does not
 * drift off the grid; a gap of two beats or more starts a new section (and a
 * checkpoint). This is how player-built machines get a song and
 * a score without writing any music data by hand.
 */
export function bakeMachine(level: LevelDef, opts: { bpm?: number; name?: string; maxSeconds?: number } = {}): BakedMachine {
  const bpm = opts.bpm ?? 113;
  const beat = 60 / bpm;
  const sim = new Simulation();
  const strikes: NoteEvent[] = [];
  const music = new MusicSystem(sim, { play: (n) => strikes.push(n), setRolling() {} });
  sim.load(level);
  interface Sample { t: number; p: [number, number, number]; v: [number, number, number]; w: [number, number, number] }
  const history: Sample[] = [];
  let finished = false;
  let ended = false;
  sim.bus.on('marble:reset', (e) => {
    finished = e.reason === 'finished';
    ended = true;
  });
  const dt = config.physics.fixedDt;
  const max = opts.maxSeconds ?? 120;
  for (let i = 0; i < max / dt && !ended; i++) {
    sim.fixedUpdate(dt);
    const p = sim.marble.body.translation();
    const v = sim.marble.body.linvel();
    const w = sim.marble.body.angvel();
    history.push({ t: sim.simTime, p: [p.x, p.y, p.z], v: [v.x, v.y, v.z], w: [w.x, w.y, w.z] });
    if (history.length > 400) history.shift();
  }
  const duration = sim.simTime;
  music.dispose();
  sim.dispose();

  const pads = strikes.filter((n) => n.object.type === 'pad');
  const events: SongEvent[] = [];
  const checkpoints: BakedMachine['checkpoints'] = [];
  let section = 0;
  let b = 0;
  let prevTime = pads[0]?.simTime ?? 0;
  for (const n of pads) {
    // Quarter-beat resolution: a hop that is consistently 0.8 of a beat must not
    // be written as a whole one, or the error piles up along a run of them.
    const gap = Math.max(0.25, Math.round(((n.simTime - prevTime) / beat) * 4) / 4);
    if (events.length > 0) b += gap;
    if (gap >= 2 && events.length > 0) section++;
    events.push({ beat: b, object: n.object.id, note: n.object.def.note, lyric: n.object.def.note, section });
    prevTime = n.simTime;
  }
  const r3 = (a: number[]): [number, number, number] => a.map((x) => +x.toFixed(3)) as [number, number, number];
  // Checkpoint = marble state a moment before each section's first strike (needs the history
  // from the run, so re-walk the strikes against it).
  const seen = new Set<number>();
  for (const e of events) {
    if (seen.has(e.section!)) continue;
    seen.add(e.section!);
    const strike = pads.find((n) => n.object.id === e.object)!;
    const at = strike.simTime - 0.35;
    const s = history.reduce((best, h) => (Math.abs(h.t - at) < Math.abs(best.t - at) ? h : best), history[0]);
    if (s) checkpoints.push({ section: e.section!, position: r3(s.p), velocity: r3(s.v), spin: r3(s.w) });
  }
  const sections = Array.from({ length: section + 1 }, (_, i) => `Part ${i + 1}`);
  return { song: { name: opts.name ?? level.name, bpm, key: 'C', sections, events }, checkpoints, finished, duration };
}
