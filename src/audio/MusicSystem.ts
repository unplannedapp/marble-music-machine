import { config } from '../core/Config';
import type { EventBus, MarbleContactEvent } from '../events/EventBus';
import type { InteractiveObject } from '../objects/InteractiveObject';
import type { Simulation } from '../sim/Simulation';
import { velocityFromImpact } from './notes';
import type { InstrumentName, NoteEvent, NotePlayer } from './types';

/**
 * Turns physical contacts into musical events.
 *
 *   marble:contact -> instrument + note for that object -> velocity from impact
 *                  -> player.play(...) and a `music:note` event for visuals/score.
 *
 * Only an object with a note plays: the pads are the instrument the marble
 * plays, and everything else (rails, ramps, pipes, mechanisms) is silent as it
 * guides the marble to the next note, the way the reference machines work; the
 * full song plays on underneath (Backing), the strike is the highlight. An
 * object given a note in the level can still be any instrument; the default is
 * the pad's marimba.
 */
export const defaultInstrument: Record<string, InstrumentName> = {
  pad: 'marimba',
  bumper: 'pop',
  rail: 'click',
  pipe: 'tube',
  ramp: 'thud',
  wall: 'thud',
  spinner: 'wood',
  launcher: 'kick',
  bowl: 'bell',
};

/** Whether a strike on this object sounds at all: it needs a note, and not `instrument: 'none'`. */
export function sounds(def: { note?: string; instrument?: string }): boolean {
  return !!def.note && def.instrument !== 'none';
}

/** Contacts within this window on the same object are one strike, not a flurry. */
const RETRIGGER_SECONDS = 0.06;

export class MusicSystem {
  private lastNoteTime = new Map<InteractiveObject, number>();
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly sim: Simulation,
    private readonly player: NotePlayer,
    bus: EventBus = sim.bus,
  ) {
    this.offs.push(bus.on('marble:contact', (e) => this.onContact(e, bus)));
    // A marble put back (new run or checkpoint) replays strikes at the same clock times: forget the old ones.
    this.offs.push(bus.on('marble:reset', () => this.reset()));
    this.offs.push(bus.on('marble:respawn', () => this.reset()));
  }

  private onContact(e: MarbleContactEvent, bus: EventBus): void {
    const def = e.object.def;
    if (!sounds(def)) return;
    const instrument = (def.instrument as InstrumentName | undefined) ?? defaultInstrument[e.object.type] ?? 'marimba';
    const last = this.lastNoteTime.get(e.object) ?? -Infinity;
    if (e.simTime - last < RETRIGGER_SECONDS) return;
    // Rails get a faint tick only when landed on, never for every rod segment;
    // a pipe sounds once as the marble enters it.
    const minImpact = instrument === 'click' ? 1.5 : 0.25;
    if (e.impactSpeed < minImpact) return;
    this.lastNoteTime.set(e.object, e.simTime);

    const note: NoteEvent = {
      simTime: e.simTime,
      object: e.object,
      instrument,
      note: def.note ?? null,
      velocity: velocityFromImpact(e.impactSpeed, config.audio.referenceImpact),
      impactSpeed: e.impactSpeed,
    };
    this.player.play(note);
    bus.emit('music:note', note);
  }

  /** Per frame: drive the continuous rolling sound from the marble's state. */
  update(): void {
    const touchingRail = this.sim.objects.some((o) => (o.type === 'rail' || o.type === 'pipe' || o.type === 'bowl') && this.sim.physics.isTouching(o));
    const speed = this.sim.marble.speed();
    this.player.setRolling(touchingRail ? 1 : 0, speed);
  }

  reset(): void {
    this.lastNoteTime.clear();
  }

  dispose(): void {
    for (const off of this.offs) off();
  }
}
