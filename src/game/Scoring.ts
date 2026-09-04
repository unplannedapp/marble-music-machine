import { config } from '../core/Config';
import type { EventBus } from '../events/EventBus';
import type { NoteEvent } from '../audio/types';
import type { Simulation } from '../sim/Simulation';
import { beatSeconds, type SongDef, type SongEvent } from '../songs/types';

export type Rating = 'PERFECT' | 'EXACT' | 'GOOD' | 'EARLY' | 'LATE' | 'MISS';

export interface RatingEvent {
  simTime: number;
  event: SongEvent;
  rating: Rating;
  /** Actual minus expected time, seconds (negative = early). NaN for a skipped target. */
  delta: number;
  points: number;
  combo: number;
  score: number;
  velocity: number;
}

export interface ScoreSummary {
  score: number;
  maxCombo: number;
  ratings: Record<Rating, number>;
  hits: number;
  total: number;
}

/** Timing rating from the signed delta (seconds). Pure, for tests. */
export function rateDelta(delta: number): Rating {
  const w = config.scoring.windows;
  const a = Math.abs(delta);
  if (a <= w.perfect) return 'PERFECT';
  if (a <= w.exact) return 'EXACT';
  if (a <= w.good) return 'GOOD';
  if (a <= w.earlyLate) return delta < 0 ? 'EARLY' : 'LATE';
  return 'MISS';
}

/** Points for one strike. Follows the spec's shape (base + timing + velocity, scaled by combo). */
export function pointsFor(rating: Rating, velocity: number, combo: number): number {
  const s = config.scoring;
  if (rating === 'MISS') return 0;
  const base = s.base + s.timingBonus[rating] + Math.round(s.velocityBonus * velocity);
  return Math.round(base * (1 + combo * s.comboStep));
}

/**
 * Compares each strike against the song's timeline.
 *
 * The song clock is anchored on the first strike of each section, so a section
 * is judged on its internal rhythm and a slow phrase break does not poison the
 * rest of the song. A target the marble passes without striking is a MISS.
 */
export class ScoreSystem {
  score = 0;
  combo = 0;
  maxCombo = 0;
  readonly ratings: Record<Rating, number> = { PERFECT: 0, EXACT: 0, GOOD: 0, EARLY: 0, LATE: 0, MISS: 0 };
  private next = 0;
  /** simTime that corresponds to beat 0 for the current section. */
  private anchor = NaN;
  private anchoredSection = -1;
  private readonly offs: (() => void)[] = [];
  private readonly byObject = new Map<string, number[]>();
  /** Score state at the start of each section, for checkpoint restarts. */
  private readonly sectionSnapshots = new Map<number, { score: number; maxCombo: number; ratings: Record<Rating, number>; next: number }>();

  constructor(
    private readonly sim: Simulation,
    readonly song: SongDef,
    private readonly bus: EventBus = sim.bus,
  ) {
    song.events.forEach((e, i) => {
      const list = this.byObject.get(e.object) ?? [];
      list.push(i);
      this.byObject.set(e.object, list);
    });
    this.offs.push(bus.on('music:note', (n) => this.onNote(n)));
    this.offs.push(bus.on('marble:reset', (e) => {
      // Falls and stalls are handled by GameFlow (checkpoint); anything else is a fresh run.
      if (e.reason === 'finished' || e.reason === 'manual') this.reset();
    }));
  }

  /** Section of the target due next (or the last section once finished). */
  get currentSection(): number {
    const e = this.song.events[Math.min(this.next, this.song.events.length - 1)];
    return e?.section ?? 0;
  }

  /** Roll back to the start of the current section: combo lost, that section's points removed. */
  restartSection(): void {
    const snap = this.sectionSnapshots.get(this.currentSection);
    if (snap) {
      this.score = snap.score;
      this.maxCombo = snap.maxCombo;
      Object.assign(this.ratings, snap.ratings);
      this.next = snap.next;
    }
    this.combo = 0;
    this.anchor = NaN;
    this.anchoredSection = -1;
    this.bus.emit('score:reset', { simTime: this.sim.simTime });
  }

  /** The song events still to come, starting with the one due next. */
  get pending(): SongEvent[] {
    return this.song.events.slice(this.next);
  }

  get finished(): boolean {
    return this.next >= this.song.events.length;
  }

  summary(): ScoreSummary {
    const hits = this.ratings.PERFECT + this.ratings.EXACT + this.ratings.GOOD + this.ratings.EARLY + this.ratings.LATE;
    return { score: this.score, maxCombo: this.maxCombo, ratings: { ...this.ratings }, hits, total: this.song.events.length };
  }

  private onNote(n: NoteEvent): void {
    if (this.finished) return;
    const due = this.song.events[this.next];
    if (n.object.id !== due.object) {
      // A strike on a later target means the ones between were skipped.
      const later = (this.byObject.get(n.object.id) ?? []).find((i) => i > this.next);
      if (later === undefined) return; // not a song target (rails, ramps, ...)
      while (this.next < later) this.miss(n.simTime);
      this.onNote(n);
      return;
    }
    const section = due.section ?? 0;
    if (section !== this.anchoredSection || !Number.isFinite(this.anchor)) {
      this.anchor = n.simTime - beatSeconds(this.song, due.beat);
      this.anchoredSection = section;
      if (!this.sectionSnapshots.has(section)) {
        this.sectionSnapshots.set(section, { score: this.score, maxCombo: this.maxCombo, ratings: { ...this.ratings }, next: this.next });
      }
    }
    const expected = this.anchor + beatSeconds(this.song, due.beat);
    const delta = n.simTime - expected;
    const rating = rateDelta(delta);
    this.apply(due, rating, delta, n.velocity, n.simTime);
  }

  private miss(simTime: number): void {
    const e = this.song.events[this.next];
    this.apply(e, 'MISS', NaN, 0, simTime);
  }

  private apply(event: SongEvent, rating: Rating, delta: number, velocity: number, simTime: number): void {
    this.next++;
    if (rating === 'MISS') this.combo = 0;
    else this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const points = pointsFor(rating, velocity, this.combo);
    this.score += points;
    this.ratings[rating]++;
    this.bus.emit('score:rating', { simTime, event, rating, delta, points, combo: this.combo, score: this.score, velocity });
  }

  /** Per fixed step: a target the marble has fallen past without striking is missed. */
  fixedUpdate(): void {
    if (this.finished) return;
    const due = this.song.events[this.next];
    const obj = this.sim.objectsById.get(due.object);
    if (!obj) return;
    const p = this.sim.marble.body.translation();
    const oy = obj.position().y;
    if (p.y < oy - config.scoring.missDistance) this.miss(this.sim.simTime);
  }

  /** Summary of the last completed run (taken just before the reset cleared the state). */
  lastRun: ScoreSummary | null = null;

  reset(): void {
    if (this.next > 0) this.lastRun = this.summary();
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.next = 0;
    this.anchor = NaN;
    this.anchoredSection = -1;
    this.sectionSnapshots.clear();
    for (const k of Object.keys(this.ratings) as Rating[]) this.ratings[k] = 0;
    this.bus.emit('score:reset', { simTime: this.sim.simTime });
  }

  dispose(): void {
    for (const off of this.offs) off();
  }
}
