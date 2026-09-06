import type { EventBus } from '../events/EventBus';
import type { Simulation } from '../sim/Simulation';
import { beatSeconds, type SongDef } from '../songs/types';
import type { BackingPlayer, NoteEvent } from './types';

/** How far ahead of the simulation clock chords are handed to the audio clock. */
const LOOKAHEAD = 0.6;
/** Bars of accompaniment after the last note, so the song does not stop dead as the marble falls away. */
const TAIL_BARS = 1;

const CHORD_NOTES: Record<string, string[]> = {
  C: ['C3', 'E3', 'G3'],
  F: ['F2', 'A2', 'C3'],
  G: ['G2', 'B2', 'D3'],
  Am: ['A2', 'C3', 'E3'],
  Dm: ['D3', 'F3', 'A3'],
  Em: ['E3', 'G3', 'B3'],
};

/**
 * The full music under the machine: the song plays continuously and the marble
 * highlights its notes. This lays a soft chord bed and bass, and the melody
 * line itself played softly at its written beats, in time with the song; the
 * pad strike is the bright note on top. An object the marble merely rides or
 * climbs makes no sound of its own: it is carrying the marble to the next note.
 * It runs on the same clock the score uses: beat 0 is the first strike of a
 * section, so a rest that the marble spends rolling on a rail keeps the chords
 * exactly in step with the notes either side of it, and every run sounds the
 * same. A reset or respawn cuts it; the next strike starts it again.
 */
export class Backing {
  private anchor = NaN;
  private anchoredSection = -1;
  /** Highest bar index already scheduled on the current anchor. */
  private scheduledBar = -1;
  /** Index into the song's events of the next melody note to schedule. */
  private nextEvent = 0;
  /** Start time of the last chord handed to the player, so a re-anchor never doubles a bar. */
  private lastScheduledAt = -Infinity;
  private readonly beatByObject = new Map<string, { beat: number; section: number }>();
  private readonly lastBeat: number;
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly sim: Simulation,
    private readonly player: BackingPlayer,
    private readonly song: SongDef,
    bus: EventBus = sim.bus,
  ) {
    for (const e of song.events) if (!this.beatByObject.has(e.object)) this.beatByObject.set(e.object, { beat: e.beat, section: e.section ?? 0 });
    this.lastBeat = song.events.length ? Math.max(...song.events.map((e) => e.beat)) : 0;
    this.offs.push(bus.on('music:note', (n) => this.onNote(n)));
    this.offs.push(bus.on('marble:reset', () => this.stop()));
    this.offs.push(bus.on('marble:respawn', () => this.stop()));
  }

  get chords(): string[] {
    return this.song.backing?.chords ?? [];
  }

  get beatsPerBar(): number {
    return this.song.backing?.beatsPerBar ?? 4;
  }

  private onNote(n: NoteEvent): void {
    const target = this.beatByObject.get(n.object.id);
    if (!target) return;
    if (target.section !== this.anchoredSection || !Number.isFinite(this.anchor)) {
      // The melody line resumes from this strike's note (already sounding as the strike itself).
      const idx = this.song.events.findIndex((e) => e.object === n.object.id);
      this.nextEvent = idx >= 0 ? idx + 1 : this.song.events.length;
      // Re-anchor like the score does; chords already sounding run on to their bar's end.
      this.anchor = n.simTime - beatSeconds(this.song, target.beat);
      this.anchoredSection = target.section;
      // The bar already sounding plays out; the new clock takes over from the next bar after it.
      let next = Math.floor(target.beat / this.beatsPerBar);
      const barSeconds = beatSeconds(this.song, this.beatsPerBar);
      while (this.anchor + beatSeconds(this.song, next * this.beatsPerBar) < this.lastScheduledAt + barSeconds - 0.06) next++;
      this.scheduledBar = next - 1;
    }
  }

  /** Per frame: schedule the melody notes and the bars that fall inside the lookahead window. */
  update(): void {
    if (!Number.isFinite(this.anchor)) return;
    const now = this.sim.simTime;
    const events = this.song.events;
    while (this.nextEvent < events.length) {
      const e = events[this.nextEvent];
      // A later section re-anchors on its own first strike; do not run ahead into it.
      if ((e.section ?? 0) !== this.anchoredSection) break;
      const at = this.anchor + beatSeconds(this.song, e.beat);
      if (at > now + LOOKAHEAD) break;
      const following = events[this.nextEvent + 1];
      const seconds = following ? Math.max(0.25, beatSeconds(this.song, following.beat - e.beat)) : beatSeconds(this.song, 2);
      if (e.note) this.player.playMelody(Math.max(at, now), e.note, seconds);
      this.nextEvent++;
    }
    if (!this.chords.length) return;
    const bar = this.beatsPerBar;
    const lastBar = Math.floor(this.lastBeat / bar) + TAIL_BARS;
    while (this.scheduledBar < lastBar) {
      const next = this.scheduledBar + 1;
      const at = this.anchor + beatSeconds(this.song, next * bar);
      if (at > now + LOOKAHEAD) break;
      const symbol = this.chords[next % this.chords.length];
      const notes = CHORD_NOTES[symbol] ?? CHORD_NOTES.C;
      const seconds = beatSeconds(this.song, bar);
      // Bass on the first and third beat of the bar.
      const bass = bar >= 4 ? [0, beatSeconds(this.song, 2)] : [0];
      this.lastScheduledAt = Math.max(at, now);
      this.player.playChord(this.lastScheduledAt, notes, seconds, bass);
      this.scheduledBar = next;
    }
  }

  private stop(): void {
    this.anchor = NaN;
    this.anchoredSection = -1;
    this.scheduledBar = -1;
    this.nextEvent = 0;
    this.lastScheduledAt = -Infinity;
    this.player.stopChords();
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.player.stopChords();
  }
}
