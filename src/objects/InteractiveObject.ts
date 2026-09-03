import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { MarbleContactEvent } from '../events/EventBus';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ObjectDef } from '../levels/LevelTypes';

export interface BuildContext {
  physics: PhysicsWorld;
  /** Z of the backboard surface (objects mount to it). */
  boardZ: number;
  marbleRadius: number;
}

/**
 * Base class for every piece of the machine.
 *
 * Every object owns:
 *   - physics colliders (registered so contacts route back to it)
 *   - a three.js `root` for its visuals
 *   - `onMarbleContact`: the physical + visual response to being struck.
 *
 * Phase 2 adds an instrument component that listens to the same contact and
 * produces the musical response. The base class deliberately knows nothing
 * about audio.
 */
export abstract class InteractiveObject<D extends ObjectDef = ObjectDef> {
  readonly root = new THREE.Group();
  readonly colliders: RAPIER.Collider[] = [];
  readonly bodies: RAPIER.RigidBody[] = [];
  readonly id: string;
  readonly type: string;
  /** Number of marble contacts since the last reset. */
  hits = 0;
  lastHitTime = -Infinity;

  constructor(
    readonly def: D,
    protected readonly ctx: BuildContext,
  ) {
    this.id = def.id ?? `${def.type}_${InteractiveObject.nextId++}`;
    this.type = def.type;
    this.root.name = this.id;
  }

  private static nextId = 1;

  protected registerCollider(collider: RAPIER.Collider): RAPIER.Collider {
    this.colliders.push(collider);
    this.ctx.physics.registerCollider(collider, this);
    return collider;
  }

  /** Called when the marble first touches this object. */
  onMarbleContact(event: MarbleContactEvent): void {
    this.hits++;
    this.lastHitTime = event.simTime;
  }

  /** Called every fixed physics step. */
  fixedUpdate(_dt: number, _simTime: number): void {}

  /** Called every render frame (for interpolation-independent visual effects). */
  renderUpdate(_frameDt: number, _simTime: number): void {}

  /** Restore to the initial state (e.g. when the marble resets). */
  reset(): void {
    this.hits = 0;
    this.lastHitTime = -Infinity;
  }

  dispose(): void {
    const world = this.ctx.physics.world;
    for (const c of this.colliders) {
      this.ctx.physics.unregisterCollider(c);
      world.removeCollider(c, false);
    }
    for (const b of this.bodies) world.removeRigidBody(b);
    this.colliders.length = 0;
    this.bodies.length = 0;
    this.root.removeFromParent();
  }
}

export type ObjectFactory = (def: ObjectDef, ctx: BuildContext) => InteractiveObject;

const registry = new Map<string, ObjectFactory>();

export function registerObjectType(type: string, factory: ObjectFactory): void {
  registry.set(type, factory);
}

export function createObject(def: ObjectDef, ctx: BuildContext): InteractiveObject {
  const factory = registry.get(def.type);
  if (!factory) throw new Error(`Unknown object type "${def.type}"`);
  return factory(def, ctx);
}
