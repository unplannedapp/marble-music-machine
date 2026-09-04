import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { config, type MaterialProps } from '../core/Config';
import { DEG2RAD } from '../core/math';
import type { EventBus } from '../events/EventBus';
import type { InteractiveObject } from '../objects/InteractiveObject';
import type { Marble } from '../marble/Marble';

/** Links a rigid body to a three.js object and keeps the previous transform for interpolation. */
export interface BodyBinding {
  body: RAPIER.RigidBody;
  object3d: THREE.Object3D;
  prevPos: THREE.Vector3;
  prevQuat: THREE.Quaternion;
  currPos: THREE.Vector3;
  currQuat: THREE.Quaternion;
}

const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _vRel = new THREE.Vector3();
const _vOther = new THREE.Vector3();
const _r = new THREE.Vector3();
const _w = new THREE.Vector3();

export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly eventQueue: RAPIER.EventQueue;
  readonly bindings: BodyBinding[] = [];
  /** collider handle -> owning interactive object */
  private colliderOwners = new Map<number, InteractiveObject>();
  /**
   * Number of the marble's live contacts per object. Objects such as rails are
   * made of many colliders; the music layer must hear one touch, not one per
   * segment, so contact/separate events fire only on the 0 -> 1 and 1 -> 0 edges.
   */
  private activeContacts = new Map<InteractiveObject, number>();
  marble: Marble | null = null;
  simTime = 0;
  contactCount = 0;

  constructor(private readonly bus: EventBus) {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.integrationParameters.dt = config.physics.fixedDt;
    this.world.numSolverIterations = config.physics.solverIterations;
    this.eventQueue = new RAPIER.EventQueue(true);
    this.applyGravity();
  }

  /** Gravity is tilted into the board so the marble stays pressed against it (see Config). */
  applyGravity(): void {
    const g = config.physics.gravity;
    const tilt = config.physics.tiltDeg * DEG2RAD;
    this.world.gravity = { x: 0, y: -g * Math.sin(tilt), z: -g * Math.cos(tilt) };
  }

  registerCollider(collider: RAPIER.Collider, owner: InteractiveObject): void {
    this.colliderOwners.set(collider.handle, owner);
  }

  unregisterCollider(collider: RAPIER.Collider): void {
    this.colliderOwners.delete(collider.handle);
  }

  ownerOf(handle: number): InteractiveObject | undefined {
    return this.colliderOwners.get(handle);
  }

  bind(body: RAPIER.RigidBody, object3d: THREE.Object3D): BodyBinding {
    const t = body.translation();
    const r = body.rotation();
    const binding: BodyBinding = {
      body,
      object3d,
      prevPos: new THREE.Vector3(t.x, t.y, t.z),
      prevQuat: new THREE.Quaternion(r.x, r.y, r.z, r.w),
      currPos: new THREE.Vector3(t.x, t.y, t.z),
      currQuat: new THREE.Quaternion(r.x, r.y, r.z, r.w),
    };
    this.bindings.push(binding);
    return binding;
  }

  unbind(binding: BodyBinding): void {
    const i = this.bindings.indexOf(binding);
    if (i >= 0) this.bindings.splice(i, 1);
  }

  /** Drop every binding of a body about to be removed from the world. */
  unbindBody(body: RAPIER.RigidBody): void {
    for (let i = this.bindings.length - 1; i >= 0; i--) if (this.bindings[i].body.handle === body.handle) this.bindings.splice(i, 1);
  }

  static applyMaterial(desc: RAPIER.ColliderDesc, m: MaterialProps): RAPIER.ColliderDesc {
    // Rapier applies the higher-priority rule of the pair (Max beats Average), so a
    // 'max' object imposes its bounce while an 'average' one blends with the marble.
    const rule = m.bounceRule === 'max' ? RAPIER.CoefficientCombineRule.Max : RAPIER.CoefficientCombineRule.Average;
    return desc
      .setFriction(m.friction)
      .setRestitution(m.restitution)
      .setRestitutionCombineRule(rule)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average);
  }

  step(dt: number): void {
    this.world.integrationParameters.dt = dt;

    for (const b of this.bindings) {
      b.prevPos.copy(b.currPos);
      b.prevQuat.copy(b.currQuat);
    }
    this.marble?.capturePreStep();

    this.world.step(this.eventQueue);
    this.simTime += dt;

    for (const b of this.bindings) {
      const t = b.body.translation();
      const r = b.body.rotation();
      b.currPos.set(t.x, t.y, t.z);
      b.currQuat.set(r.x, r.y, r.z, r.w);
    }

    this.eventQueue.drainCollisionEvents((h1, h2, started) => this.onCollision(h1, h2, started));
  }

  private onCollision(h1: number, h2: number, started: boolean): void {
    const marble = this.marble;
    if (!marble) return;
    const mh = marble.collider.handle;
    if (h1 !== mh && h2 !== mh) return; // object-object contacts: phase 6 (chain reactions)
    const otherHandle = h1 === mh ? h2 : h1;
    const object = this.colliderOwners.get(otherHandle);
    if (!object) return;

    const count = this.activeContacts.get(object) ?? 0;
    if (!started) {
      const next = Math.max(0, count - 1);
      this.activeContacts.set(object, next);
      if (next === 0) this.bus.emit('marble:separate', { simTime: this.simTime, object });
      return;
    }
    this.activeContacts.set(object, count + 1);
    if (count > 0) return; // already touching this object (another of its colliders)

    const otherCollider = this.world.getCollider(otherHandle);
    const marbleCollider = marble.collider;

    // Contact normal, oriented from the object toward the marble.
    let haveNormal = false;
    this.world.contactPair(marbleCollider, otherCollider, (manifold, flipped) => {
      const n = manifold.normal();
      // manifold normal points from collider1 to collider2 (marble -> object unless flipped)
      _n.set(n.x, n.y, n.z);
      if (!flipped) _n.negate();
      haveNormal = _n.lengthSq() > 1e-8;
      const sp = manifold.numSolverContacts() > 0 ? manifold.solverContactPoint(0) : null;
      if (sp) _p.set(sp.x, sp.y, sp.z);
      else haveNormal = haveNormal && false;
    });

    const pre = marble.preStepVelocity;
    const mp = marble.body.translation();
    if (!haveNormal) {
      // Fallback: assume the marble hit head-on along its velocity.
      _n.copy(pre).multiplyScalar(-1);
      if (_n.lengthSq() < 1e-8) _n.set(0, 1, 0);
      _n.normalize();
      _p.set(mp.x, mp.y, mp.z).addScaledVector(_n, -marble.radius);
    }

    // Relative velocity at the contact point (object may be moving, e.g. a swinging pad).
    _vOther.set(0, 0, 0);
    const otherBody = otherCollider.parent();
    if (otherBody && !otherBody.isFixed()) {
      const lv = otherBody.linvel();
      const av = otherBody.angvel();
      const ot = otherBody.translation();
      _w.set(av.x, av.y, av.z);
      _r.set(_p.x - ot.x, _p.y - ot.y, _p.z - ot.z);
      _vOther.set(lv.x, lv.y, lv.z).add(_w.cross(_r));
    }
    // Incoming normal speed. Look back through the last few pre-step velocities and
    // take the fastest approach: CCD-resolved hits report a step late, and the
    // marble's velocity barely changes over two steps of free flight.
    let impactSpeed = 0;
    let best: THREE.Vector3 = pre;
    for (const v of [pre, marble.velocityHistory[0], marble.velocityHistory[1]]) {
      _vRel.copy(v).sub(_vOther);
      const s = -_vRel.dot(_n);
      if (s > impactSpeed) {
        impactSpeed = s;
        best = v;
      }
    }

    this.contactCount++;
    this.bus.emit('marble:contact', {
      simTime: this.simTime,
      object,
      impactSpeed,
      marbleSpeed: best.length(),
      normal: _n.clone(),
      point: _p.clone(),
      velocity: best.clone(),
    });
  }

  /** Copy interpolated transforms into the bound three.js objects. */
  syncVisuals(alpha: number): void {
    for (const b of this.bindings) {
      b.object3d.position.lerpVectors(b.prevPos, b.currPos, alpha);
      b.object3d.quaternion.slerpQuaternions(b.prevQuat, b.currQuat, alpha);
    }
  }

  /** Whether the marble is currently touching this object. */
  isTouching(object: InteractiveObject): boolean {
    return (this.activeContacts.get(object) ?? 0) > 0;
  }

  /** Forget all live contacts (after teleporting the marble). */
  clearContacts(): void {
    this.activeContacts.clear();
  }

  dispose(): void {
    this.bindings.length = 0;
    this.colliderOwners.clear();
    this.activeContacts.clear();
    this.eventQueue.free();
    this.world.free();
  }
}
