import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { config } from '../core/Config';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { BodyBinding } from '../physics/PhysicsWorld';

/**
 * The performer. A real dynamic sphere with mass, friction, restitution and
 * continuous collision detection so it can never tunnel through a thin rail.
 */
export class Marble {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly root = new THREE.Group();
  readonly radius: number;
  readonly binding: BodyBinding;
  /** Velocity captured immediately before the last physics step (used for impact speed). */
  readonly preStepVelocity = new THREE.Vector3();
  /**
   * Pre-step velocities of the last few steps, newest first. A collision resolved by
   * continuous collision detection reports its "started" event one step late, by
   * which time the velocity has already been reflected; the history lets the impact
   * calculation look one or two steps further back.
   */
  readonly velocityHistory: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  constructor(
    physics: PhysicsWorld,
    radius = config.marble.radius,
  ) {
    this.radius = radius;
    const m = config.marble;
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setCcdEnabled(true)
      .setLinearDamping(m.linearDamping)
      .setAngularDamping(m.angularDamping)
      .setCanSleep(false);
    this.body = physics.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.ball(radius)
      .setDensity(m.density)
      .setFriction(m.friction)
      .setRestitution(m.restitution)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.collider = physics.world.createCollider(colDesc, this.body);
    this.root.name = 'marble';
    this.binding = physics.bind(this.body, this.root);
    physics.marble = this;
  }

  get mass(): number {
    return this.body.mass();
  }

  applyMaterial(): void {
    const m = config.marble;
    this.collider.setFriction(m.friction);
    this.collider.setRestitution(m.restitution);
    this.body.setLinearDamping(m.linearDamping);
    this.body.setAngularDamping(m.angularDamping);
  }

  capturePreStep(): void {
    const v = this.body.linvel();
    const last = this.velocityHistory.pop()!;
    last.copy(this.preStepVelocity);
    this.velocityHistory.unshift(last);
    this.preStepVelocity.set(v.x, v.y, v.z);
  }

  reset(position: THREE.Vector3, velocity = new THREE.Vector3(), spin = new THREE.Vector3()): void {
    this.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
    this.body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
    this.body.setAngvel({ x: spin.x, y: spin.y, z: spin.z }, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.preStepVelocity.copy(velocity);
    for (const v of this.velocityHistory) v.copy(velocity);
    this.binding.prevPos.copy(position);
    this.binding.currPos.copy(position);
    this.binding.prevQuat.identity();
    this.binding.currQuat.identity();
    this.root.position.copy(position);
    this.root.quaternion.identity();
  }

  position(target = new THREE.Vector3()): THREE.Vector3 {
    const t = this.body.translation();
    return target.set(t.x, t.y, t.z);
  }

  velocity(target = new THREE.Vector3()): THREE.Vector3 {
    const v = this.body.linvel();
    return target.set(v.x, v.y, v.z);
  }

  speed(): number {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  applyImpulse(impulse: THREE.Vector3): void {
    this.body.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
  }
}
