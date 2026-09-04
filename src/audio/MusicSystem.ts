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
 * Which instrument an object plays comes from its level definition; each object
 * type has a sensible default so untagged objects still sound like what they are.
 */
export const defaultInstrument: Record<string, InstrumentName> = {
  pad: 'marimba',
  bumper: 'pop',
  rail: 'click',
  pipe: 'tube',
  ramp: 'thud',
  wall: 'thud',
};

/** Contacts within this window on the same object are one strike, not a flurry. */
const RETRIGGER_SECONDS = 0.06;

export class MusicSystem {
  private lastNoteTime = new Map<InteractiveObject, number>();
  private readonly off: () => void;

  constructor(
    private readonly sim: Simulation,
    private readonly player: NotePlayer,
    bus: EventBus = sim.bus,
  ) {
    this.off = bus.on('marble:contact', (e) => this.onContact(e, bus));
  }

  private onContact(e: MarbleContactEvent, bus: EventBus): void {
    const def = e.object.def;
    const instrument = (def.instrument as InstrumentName | undefined) ?? defaultInstrument[e.object.type];
    if (!instrument || def.instrument === 'none') return;
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
    const touchingRail = this.sim.objects.some((o) => (o.type === 'rail' || o.type === 'pipe') && this.sim.physics.isTouching(o));
    const speed = this.sim.marble.speed();
    this.player.setRolling(touchingRail ? 1 : 0, speed);
  }

  reset(): void {
    this.lastNoteTime.clear();
  }

  dispose(): void {
    this.off();
  }
}
