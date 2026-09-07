import type { EventBus } from '../events/EventBus';
import type { Simulation } from '../sim/Simulation';
import { beatSeconds, type SongDef } from '../songs/types';
import type { BackingPlayer, NoteEvent } from './types';

/** How far ahead of the simulation clock chords are handed to the audio clock. */
const LOOKAHEAD = 0.6;
/** Bars of accompaniment after the last note, so the song does not stop dead as the marble falls away. */
const TAIL_BARS = 1;

const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Triad for a chord symbol such as 'C', 'Am', 'F#m' or 'Bb', voiced low (root between F2 and E3). */
function chordNotes(symbol: string): string[] {
  const m = /^([A-G][#b]?)(m?)$/.exec(symbol.trim());
  if (!m) return ['C3', 'E3', 'G3'];
  const root = NOTE_INDEX[m[1]];
  const third = m[2] === 'm' ? 3 : 4;
  // Root in the octave that keeps it between F2 (midi 41) and E3 (midi 52).
  let midi = 36 + root;
  if (midi < 41) midi += 12;
  return [midi, midi + third, midi + 7].map((n) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`);
}

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

  /** Index into the song's events of each object, for the recording's slices. */
  private readonly eventIndex = new Map<string, number>();
  private introPlayed = false;

  constructor(
    private readonly sim: Simulation,
    private readonly player: BackingPlayer,
    private readonly song: SongDef,
    bus: EventBus = sim.bus,
  ) {
    for (const e of song.events) if (!this.beatByObject.has(e.object)) this.beatByObject.set(e.object, { beat: e.beat, section: e.section ?? 0 });
    song.events.forEach((e, i) => {
      if (!this.eventIndex.has(e.object)) this.eventIndex.set(e.object, i);
    });
    if (song.backing?.audio) player.loadClip(song.backing.audio.src);
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

  /** With a recording: the slice of it that belongs to this event, from its onset to the next. */
  private playSlice(index: number, at: number): void {
    const audio = this.song.backing?.audio;
    if (!audio) return;
    const onset = audio.onsets[index];
    if (onset === undefined) return;
    const next = audio.onsets[index + 1];
    const seconds = next !== undefined ? next - onset : (audio.tail ?? 3);
    this.player.playClip(at, onset, seconds);
  }

  private onNote(n: NoteEvent): void {
    const target = this.beatByObject.get(n.object.id);
    if (!target) return;
    if (this.song.backing?.audio) {
      const i = this.eventIndex.get(n.object.id);
      if (i !== undefined) this.playSlice(i, n.simTime);
      return;
    }
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
    const audio = this.song.backing?.audio;
    if (audio) {
      // The recording's intro leads into the first strike, which the bake fixed in time.
      const first = this.song.firstStrike;
      if (!this.introPlayed && first !== undefined && audio.onsets.length && this.sim.simTime >= 0 && this.sim.simTime < first) {
        const intro = audio.onsets[0];
        const start = first - intro;
        if (this.sim.simTime + LOOKAHEAD >= start) {
          this.introPlayed = true;
          if (intro > 0.05) this.player.playClip(Math.max(start, this.sim.simTime), Math.max(0, intro - (first - Math.max(start, this.sim.simTime))), first - Math.max(start, this.sim.simTime));
        }
      }
      return;
    }
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
      const notes = chordNotes(symbol);
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
    this.introPlayed = false;
    this.player.stopChords();
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.player.stopChords();
  }
}
