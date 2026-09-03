import type * as THREE from 'three';
import type { InteractiveObject } from '../objects/InteractiveObject';

/**
 * The single seam between physics and everything that reacts to it.
 *
 *   marble movement -> physical collision -> `marble:contact`
 *                                             -> object physical/visual response
 *                                             -> (phase 2) instrument -> `music:note`
 *                                             -> (phase 3) timing / score / combo
 *
 * Audio, scoring and UI subscribe here and never touch the physics engine.
 */
export interface MarbleContactEvent {
  /** Simulation time (seconds) at which the contact began. */
  simTime: number;
  object: InteractiveObject;
  /** Speed of the marble into the surface along the contact normal (>= 0). */
  impactSpeed: number;
  /** Total marble speed just before impact. */
  marbleSpeed: number;
  /** Unit normal pointing from the object toward the marble (world space). */
  normal: THREE.Vector3;
  /** Approximate world-space contact point. */
  point: THREE.Vector3;
  /** Marble velocity just before impact. */
  velocity: THREE.Vector3;
}

export interface MarbleSeparateEvent {
  simTime: number;
  object: InteractiveObject;
}

export interface MarbleResetEvent {
  simTime: number;
  reason: 'fell' | 'manual' | 'stalled';
}

export interface EventMap {
  'marble:contact': MarbleContactEvent;
  'marble:separate': MarbleSeparateEvent;
  'marble:reset': MarbleResetEvent;
}

type Handler<T> = (event: T) => void;

export class EventBus {
  private handlers = new Map<keyof EventMap, Set<Handler<unknown>>>();

  on<K extends keyof EventMap>(type: K, handler: Handler<EventMap[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<unknown>);
    return () => set!.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof EventMap>(type: K, event: EventMap[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const h of set) h(event);
  }

  clear(): void {
    this.handlers.clear();
  }
}
