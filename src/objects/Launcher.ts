import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { InteractiveObject, registerObjectType, type BuildContext } from './InteractiveObject';
import type { LauncherDef, ObjectDef } from '../levels/LevelTypes';
import { geometries, visuals } from './materials';
import { tupleToVector3, DEG2RAD } from '../core/math';
import type { MaterialProps } from '../core/Config';
import type { MarbleContactEvent } from '../events/EventBus';

const HEAD_MATERIAL: MaterialProps = { friction: 0.2, restitution: 0.05, bounceRule: 'average' };

/**
 * Spring plunger, pinball style. The marble rolls back against the head (a
 * lane sloping gently toward it does that), the plunger holds for a beat, then
 * the head drives forward along its axis and hurls the marble down the lane at
 * the launch speed. The head is a kinematic body whose travel is a pure
 * function of time since the marble arrived, so every launch is the same
 * launch and checkpoints (which restore the clock) replay it exactly. Nothing
 * ever moves the marble directly: it is pushed by a wall that moves.
 */
export class Launcher extends InteractiveObject<LauncherDef> {
  private readonly head: RAPIER.RigidBody;
  private readonly headMesh: THREE.Mesh;
  private readonly coils: THREE.Mesh[] = [];
  private readonly rest: THREE.Vector3;
  private readonly axis: THREE.Vector3;
  private readonly speed: number;
  private readonly stroke: number;
  private readonly hold: number;
  private triggeredAt = NaN;
  private travel = 0;

  constructor(def: LauncherDef, ctx: BuildContext) {
    super(def, ctx);
    const r = ctx.marbleRadius;
    const pos = tupleToVector3(def.position);
    const a = (def.direction ?? 0) * DEG2RAD;
    this.axis = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    this.speed = def.speed ?? 13;
    this.stroke = def.stroke ?? 2;
    this.hold = def.hold ?? 0.5;
    const z = ctx.boardZ + r + 0.05;
    this.rest = new THREE.Vector3(pos.x, pos.y, z);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
    const rot = { x: q.x, y: q.y, z: q.z, w: q.w };

    // The head: a block whose face is square to the axis, riding just clear of
    // the lane's floor and standing tall above it, so a marble dropping in
    // beside it meets the face, loses its sideways speed, and settles against it.
    const half = { along: 0.12, across: r * 1.7, depth: r + 0.05 };
    const up = new THREE.Vector3(-this.axis.y, this.axis.x, 0); // in-plane, perpendicular to the axis
    this.rest.addScaledVector(up, half.across - r * 0.9);
    this.head = ctx.physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.rest.x, this.rest.y, this.rest.z).setRotation(rot));
    this.bodies.push(this.head);
    const headDesc = PhysicsWorld.applyMaterial(RAPIER.ColliderDesc.cuboid(half.along, half.across, half.depth), HEAD_MATERIAL);
    this.registerCollider(ctx.physics.world.createCollider(headDesc, this.head));
    // Backstop and spring housing behind the head, fixed.
    const back = this.rest.clone().addScaledVector(this.axis, -(this.stroke * 0.5 + 0.6));
    const housing = ctx.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(back.x, back.y, z).setRotation(rot));
    this.bodies.push(housing);
    const housingDesc = PhysicsWorld.applyMaterial(RAPIER.ColliderDesc.cuboid(0.3, half.across + 0.08, half.depth), HEAD_MATERIAL);
    this.registerCollider(ctx.physics.world.createCollider(housingDesc, housing));

    // Visuals: the head, a coil spring that compresses as the head travels, and the housing block.
    this.headMesh = new THREE.Mesh(geometries.unitBox, visuals.colored(def.color ?? '#c9a24a'));
    this.headMesh.scale.set(half.along * 2, half.across * 2, half.depth * 2);
    this.headMesh.quaternion.copy(q);
    this.headMesh.castShadow = true;
    this.root.add(this.headMesh);
    const housingMesh = new THREE.Mesh(geometries.unitBox, visuals.darkMetal);
    housingMesh.scale.set(0.6, (half.across + 0.08) * 2, half.depth * 2);
    housingMesh.position.copy(back);
    housingMesh.quaternion.copy(q);
    housingMesh.castShadow = true;
    housingMesh.receiveShadow = true;
    this.root.add(housingMesh);
    const coilGeom = new THREE.TorusGeometry(r * 0.55, 0.035, 8, 20);
    for (let i = 0; i < 5; i++) {
      const coil = new THREE.Mesh(coilGeom, visuals.metal);
      coil.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
      this.coils.push(coil);
      this.root.add(coil);
    }
    this.place(0);
  }

  /** Head travel along the axis at a moment of the launch sequence (0 = at rest). */
  travelAt(sinceTrigger: number): number {
    const t = sinceTrigger - this.hold;
    if (t <= 0) return 0;
    const accelDist = this.stroke * 0.6;
    const accel = (this.speed * this.speed) / (2 * accelDist);
    const t1 = Math.sqrt((2 * accelDist) / accel);
    const t2 = t1 + (this.stroke - accelDist) / this.speed;
    if (t < t1) return 0.5 * accel * t * t;
    if (t < t2) return accelDist + this.speed * (t - t1);
    const back = (t - t2) / 0.8; // ease back to rest
    if (back >= 1) return 0;
    return this.stroke * (1 - back * back * (3 - 2 * back));
  }

  private place(travel: number): void {
    this.travel = travel;
    const p = this.rest.clone().addScaledVector(this.axis, travel);
    this.head.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
  }

  override fixedUpdate(dt: number, simTime: number): void {
    if (!Number.isFinite(this.triggeredAt)) return;
    const since = simTime + dt - this.triggeredAt;
    const travel = this.travelAt(since);
    this.place(travel);
    // Sequence over and head home: re-arm.
    if (since > this.hold + 3 && travel === 0) this.triggeredAt = NaN;
  }

  override onMarbleContact(event: MarbleContactEvent): void {
    super.onMarbleContact(event);
    if (!Number.isFinite(this.triggeredAt)) this.triggeredAt = event.simTime;
  }

  override renderUpdate(): void {
    const p = this.rest.clone().addScaledVector(this.axis, this.travel);
    this.headMesh.position.copy(p);
    // Coils spread evenly between the housing face and the head.
    const start = this.rest.clone().addScaledVector(this.axis, -(this.stroke * 0.5 + 0.3));
    for (let i = 0; i < this.coils.length; i++) {
      const f = (i + 0.5) / this.coils.length;
      this.coils[i].position.lerpVectors(start, p, f);
    }
  }

  override reset(): void {
    super.reset();
    this.triggeredAt = NaN;
    this.head.setTranslation({ x: this.rest.x, y: this.rest.y, z: this.rest.z }, true);
    this.travel = 0;
  }
}

registerObjectType('launcher', (def: ObjectDef, ctx) => new Launcher(def as LauncherDef, ctx));
