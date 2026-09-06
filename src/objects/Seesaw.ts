import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { config } from '../core/Config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { InteractiveObject, registerObjectType, type BuildContext } from './InteractiveObject';
import type { ObjectDef, SeesawDef } from '../levels/LevelTypes';
import { geometries, visuals } from './materials';
import { DEG2RAD } from '../core/math';
import type { MarbleContactEvent } from '../events/EventBus';

const _zAxis = new THREE.Vector3(0, 0, 1);

/**
 * Tipping seesaw. A plank on a pivot rests with its far end up, so a marble
 * that lands on the near end runs up the slope, slows, and rolls back against
 * the lip at the near end. A set time after the catch the plank tips the other
 * way and the marble runs down across the pivot and off the far end, carrying
 * on the way it was going. Like the bowl's trapdoor the plank is a kinematic
 * body whose angle is a pure function of time since the catch, so the pause
 * is exact and every run is the same run; the marble itself is never moved.
 */
export class Seesaw extends InteractiveObject<SeesawDef> {
  private readonly plank: RAPIER.RigidBody;
  private readonly plankGroup = new THREE.Group();
  private readonly pivot: THREE.Vector3;
  private readonly hold: number;
  private readonly tilt: number;
  private readonly dir: 1 | -1;
  private triggeredAt = NaN;
  private angle = 0;

  static readonly LENGTH = 3.6;
  static readonly THICK = 0.24;
  static readonly DEPTH = 0.9;
  static readonly LIP = 0.34;

  constructor(def: SeesawDef, ctx: BuildContext) {
    super(def, ctx);
    const length = def.length ?? Seesaw.LENGTH;
    const half = length / 2;
    this.hold = def.hold ?? 1.0;
    this.tilt = (def.tilt ?? 12) * DEG2RAD;
    this.dir = def.direction === -1 ? -1 : 1;
    const [px, py] = def.position;
    const z = ctx.boardZ + Seesaw.DEPTH / 2;
    this.pivot = new THREE.Vector3(px, py, z);

    this.plank = ctx.physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(px, py, z));
    this.bodies.push(this.plank);
    const material = config.materials.ramp;
    const box = (hx: number, hy: number, hz: number, x: number, y: number) => {
      const desc = PhysicsWorld.applyMaterial(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, 0), material);
      this.registerCollider(ctx.physics.world.createCollider(desc, this.plank));
    };
    // The plank, and a lip at the near (receiving) end so the marble cannot roll back off.
    box(half, Seesaw.THICK / 2, Seesaw.DEPTH / 2, 0, 0);
    box(0.08, Seesaw.LIP / 2, Seesaw.DEPTH / 2, -this.dir * (half - 0.08), Seesaw.THICK / 2 + Seesaw.LIP / 2);

    const plankMesh = new THREE.Mesh(geometries.unitBox, def.color ? visuals.colored(def.color) : visuals.wood);
    plankMesh.scale.set(length, Seesaw.THICK, Seesaw.DEPTH);
    plankMesh.castShadow = true;
    plankMesh.receiveShadow = true;
    this.plankGroup.add(plankMesh);
    const lip = new THREE.Mesh(geometries.unitBox, visuals.darkMetal);
    lip.scale.set(0.16, Seesaw.LIP, Seesaw.DEPTH);
    lip.position.set(-this.dir * (half - 0.08), Seesaw.THICK / 2 + Seesaw.LIP / 2, 0);
    lip.castShadow = true;
    this.plankGroup.add(lip);
    this.plankGroup.position.copy(this.pivot);
    this.root.add(this.plankGroup);

    // Pivot: a post from the wall and a pin through the plank.
    const post = new THREE.Mesh(geometries.unitCylinder, visuals.darkMetal);
    post.scale.set(0.12, Seesaw.DEPTH, 0.12);
    post.rotation.x = Math.PI / 2;
    post.position.set(px, py - Seesaw.THICK / 2 - 0.2, ctx.boardZ + Seesaw.DEPTH / 2);
    this.root.add(post);
    const pin = new THREE.Mesh(geometries.unitCylinder, visuals.metal);
    pin.scale.set(0.09, Seesaw.DEPTH + 0.2, 0.09);
    pin.rotation.x = Math.PI / 2;
    pin.position.copy(this.pivot);
    this.root.add(pin);

    this.angle = this.angleAt(NaN);
    this.applyAngle(false);
  }

  /** Plank angle (radians) at a moment after the catch: far end up at rest, tipped down after the hold. */
  angleAt(sinceTrigger: number): number {
    // Positive rotation lifts the +x end; the far end is on the +dir side.
    const rest = this.dir * this.tilt;
    if (!Number.isFinite(sinceTrigger)) return rest;
    const t = sinceTrigger - this.hold;
    if (t <= 0) return rest;
    const tip = 0.45;
    if (t < tip) {
      const u = t / tip;
      return rest * (1 - 2 * u * u * (3 - 2 * u));
    }
    if (t < tip + 1.4) return -rest;
    const u = Math.min(1, (t - tip - 1.4) / 0.6);
    return -rest + 2 * rest * u * u * (3 - 2 * u);
  }

  private applyAngle(next: boolean): void {
    const q = new THREE.Quaternion().setFromAxisAngle(_zAxis, this.angle);
    if (next) this.plank.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    else this.plank.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
  }

  override fixedUpdate(dt: number, simTime: number): void {
    if (!Number.isFinite(this.triggeredAt)) return;
    const since = simTime + dt - this.triggeredAt;
    this.angle = this.angleAt(since);
    this.applyAngle(true);
    if (since > this.hold + 0.45 + 1.4 + 0.6) this.triggeredAt = NaN;
  }

  override onMarbleContact(event: MarbleContactEvent): void {
    super.onMarbleContact(event);
    if (!Number.isFinite(this.triggeredAt)) this.triggeredAt = event.simTime;
  }

  override renderUpdate(): void {
    this.plankGroup.rotation.z = this.angle;
  }

  override reset(): void {
    super.reset();
    this.triggeredAt = NaN;
    this.angle = this.angleAt(NaN);
    this.applyAngle(false);
  }
}

registerObjectType('seesaw', (def: ObjectDef, ctx) => new Seesaw(def as SeesawDef, ctx));
