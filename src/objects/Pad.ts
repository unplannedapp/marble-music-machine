import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { config } from '../core/Config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { InteractiveObject, registerObjectType, type BuildContext } from './InteractiveObject';
import type { ObjectDef, PadDef } from '../levels/LevelTypes';
import { geometries, visuals } from './materials';
import { DEG2RAD, tupleToVector3 } from '../core/math';
import type { MarbleContactEvent } from '../events/EventBus';

/**
 * A suspended pad: the wooden / coloured blocks on rods in the reference
 * machines. It is a real dynamic body hinged to the board through a revolute
 * joint with a spring motor, so when the marble strikes it the pad swings,
 * recoils, and settles back on its own. Off-centre hits rotate it more, which is
 * the "controlled unpredictability" the design calls for. Its rest angle sets
 * where it deflects the marble.
 */
export class Pad extends InteractiveObject<PadDef> {
  private readonly padBody: RAPIER.RigidBody;
  private readonly restAngle: number;
  private readonly inertiaZ: number;
  private readonly restQuat: THREE.Quaternion;
  private readonly restPos: THREE.Vector3;
  private readonly mesh: THREE.Mesh;
  private flash = 0;
  private readonly baseColor: THREE.Color;

  constructor(def: PadDef, ctx: BuildContext) {
    super(def, ctx);
    const size = def.size ?? [1.6, 0.28, 0.9];
    const [len, thick, depth] = size;
    const angle = (def.angle ?? 0) * DEG2RAD;
    const pos = tupleToVector3(def.position);
    // Pads stand just clear of the backboard so the hinge and the board never fight.
    if (!pos.z) pos.z = ctx.boardZ + depth / 2 + 0.05;
    this.restPos = pos.clone();
    this.restAngle = angle;
    this.restQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
    const q = this.restQuat;

    const world = ctx.physics.world;
    this.padBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setAngularDamping(config.pad.angularDamping)
        // Exact hinge: the body may only rotate about the board normal. The
        // return spring is applied as a torque each step (see fixedUpdate), so
        // there is no soft joint constraint to yield or fight under a hard hit.
        .lockTranslations()
        .enabledRotations(false, false, true)
        .setCanSleep(false),
    );
    this.bodies.push(this.padBody);

    const desc = PhysicsWorld.applyMaterial(
      RAPIER.ColliderDesc.cuboid(len / 2, thick / 2, depth / 2).setDensity(config.pad.density),
      config.materials.pad,
    );
    this.registerCollider(world.createCollider(desc, this.padBody));

    // Moment of inertia of the box about its hinge (Z) for the torsion spring.
    this.inertiaZ = (this.padBody.mass() * (len * len + thick * thick)) / 12;

    this.baseColor = new THREE.Color(def.color ?? '#c8783c');
    this.mesh = new THREE.Mesh(geometries.unitBox, visuals.colored(this.baseColor));
    this.mesh.scale.set(len, thick, depth);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.root.add(this.mesh);
    ctx.physics.bind(this.padBody, this.root);

    // Mounting rod from the backboard to the pad (visual only).
    const rodLen = pos.z - ctx.boardZ;
    const rod = new THREE.Mesh(geometries.unitCylinder, visuals.metal);
    rod.scale.set(0.05, rodLen, 0.05);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(pos.x, pos.y, ctx.boardZ + rodLen / 2);
    rod.castShadow = true;
    this.mount = rod;
  }

  /** Not part of `root` because it must not swing with the pad. */
  readonly mount: THREE.Mesh;

  /**
   * Torsion spring + damper pulling the pad back to its rest angle. Expressed as
   * angular acceleration so the same stiffness feels the same on every pad size.
   */
  override fixedUpdate(dt: number): void {
    const r = this.padBody.rotation();
    // Rotation is restricted to Z, so the quaternion is a pure Z rotation.
    let theta = 2 * Math.atan2(r.z, r.w) - this.restAngle;
    if (theta > Math.PI) theta -= 2 * Math.PI;
    else if (theta < -Math.PI) theta += 2 * Math.PI;
    const omega = this.padBody.angvel().z;
    const k = this.def.stiffness ?? config.pad.stiffness;
    const c = this.def.damping ?? config.pad.damping;
    const alpha = -(k * theta + c * omega);
    this.padBody.applyTorqueImpulse({ x: 0, y: 0, z: alpha * this.inertiaZ * dt }, true);
  }

  override onMarbleContact(event: MarbleContactEvent): void {
    super.onMarbleContact(event);
    this.flash = Math.min(1, 0.4 + event.impactSpeed / 8);
  }

  override renderUpdate(frameDt: number): void {
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    if (this.flash <= 0) return;
    this.flash = Math.max(0, this.flash - frameDt * 3);
    mat.emissive.copy(this.baseColor).multiplyScalar(this.flash * 0.6);
  }

  override reset(): void {
    super.reset();
    this.flash = 0;
    const q = this.restQuat;
    const p = this.restPos;
    this.padBody.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    this.padBody.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.padBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.padBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  override dispose(): void {
    this.mount.removeFromParent();
    super.dispose();
  }
}

registerObjectType('pad', (def: ObjectDef, ctx) => new Pad(def as PadDef, ctx));
