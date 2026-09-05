import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { config } from '../core/Config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { InteractiveObject, registerObjectType, type BuildContext } from './InteractiveObject';
import type { BumperDef, ObjectDef } from '../levels/LevelTypes';
import { geometries, visuals } from './materials';
import { tupleToVector3 } from '../core/math';
import type { MarbleContactEvent } from '../events/EventBus';

const _impulse = new THREE.Vector3();

/**
 * Round bumper. Physically a fixed, bouncy cylinder standing out of the board.
 * On impact it also kicks the marble outward along the contact normal like a
 * pinball pop bumper, and visually compresses then springs back.
 */
export class Bumper extends InteractiveObject<BumperDef> {
  private readonly cap: THREE.Mesh;
  private squash = 0;

  constructor(def: BumperDef, ctx: BuildContext) {
    super(def, ctx);
    const pos = tupleToVector3(def.position);
    const radius = def.radius ?? 0.45;
    const height = def.height ?? ctx.marbleRadius * 2.2;
    // Rapier cylinders are along Y; rotate so the axis points out of the board (Z).
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

    const body = ctx.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, ctx.boardZ + height / 2),
    );
    this.bodies.push(body);
    const desc = PhysicsWorld.applyMaterial(
      RAPIER.ColliderDesc.cylinder(height / 2, radius).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
      config.materials.bumper,
    );
    this.registerCollider(ctx.physics.world.createCollider(desc, body));

    const base = new THREE.Mesh(geometries.unitCylinder, visuals.darkMetal);
    base.scale.set(radius, height, radius);
    base.quaternion.copy(q);
    base.position.set(pos.x, pos.y, ctx.boardZ + height / 2);
    base.castShadow = true;
    base.receiveShadow = true;
    this.root.add(base);

    this.cap = new THREE.Mesh(geometries.unitCylinder, visuals.colored(def.color ?? '#c9a24a'));
    this.cap.scale.set(radius * 0.8, 0.08, radius * 0.8);
    this.cap.quaternion.copy(q);
    this.cap.position.set(pos.x, pos.y, ctx.boardZ + height + 0.04);
    this.cap.castShadow = true;
    this.root.add(this.cap);
  }

  override onMarbleContact(event: MarbleContactEvent): void {
    super.onMarbleContact(event);
    const marble = this.ctx.physics.marble;
    if (!marble) return;
    const kick = this.def.kick ?? config.bumper.kick;
    // Keep the kick in the board plane so it never pushes the marble off the board.
    _impulse.copy(event.normal);
    _impulse.z = 0;
    if (_impulse.lengthSq() < 1e-6) return;
    _impulse.normalize().multiplyScalar(kick * marble.mass);
    marble.applyImpulse(_impulse);
    this.squash = 1;
  }

  override renderUpdate(frameDt: number): void {
    if (this.squash <= 0) return;
    this.squash = Math.max(0, this.squash - frameDt * 6);
    const s = 1 - 0.25 * Math.sin(this.squash * Math.PI);
    const r = (this.def.radius ?? 0.45) * 0.8;
    this.cap.scale.set(r * (2 - s), 0.08, r * (2 - s));
  }

  override reset(): void {
    super.reset();
    this.squash = 0;
  }
}

registerObjectType('bumper', (def: ObjectDef, ctx) => new Bumper(def as BumperDef, ctx));
