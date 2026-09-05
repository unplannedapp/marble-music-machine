import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { InteractiveObject, registerObjectType, type BuildContext } from './InteractiveObject';
import type { ObjectDef, SpinnerDef } from '../levels/LevelTypes';
import { geometries, visuals } from './materials';
import { tupleToVector3 } from '../core/math';
import type { MaterialProps } from '../core/Config';
import type { MarbleContactEvent } from '../events/EventBus';

const SPINNER_MATERIAL: MaterialProps = { friction: 0.35, restitution: 0.3, bounceRule: 'max' };

/**
 * Motor-driven paddle wheel: the first moving mechanism. The blades ride a
 * kinematic body whose angle is a pure function of simulation time, so the
 * wheel is exactly where it was on every run and after every checkpoint
 * (the sim rewinds its clock on respawn). The marble is never moved directly:
 * it is struck by a blade and carries away the blade's velocity, and a wheel
 * timed to the phrase becomes a launcher, a delay, or a phrase break.
 */
export class Spinner extends InteractiveObject<SpinnerDef> {
  private readonly body: RAPIER.RigidBody;
  private readonly rotor = new THREE.Group();
  private readonly omega: number;
  private readonly phase: number;
  private flash = 0;
  private readonly bladeMaterial: THREE.MeshPhysicalMaterial;

  constructor(def: SpinnerDef, ctx: BuildContext) {
    super(def, ctx);
    const pos = tupleToVector3(def.position);
    const radius = def.radius ?? 1.1;
    const blades = Math.max(2, Math.round(def.blades ?? 4));
    const depth = ctx.marbleRadius * 2.4;
    const thickness = 0.14;
    this.omega = ((def.rpm ?? 40) * Math.PI * 2) / 60;
    this.phase = THREE.MathUtils.degToRad(def.phase ?? 0);
    const z = ctx.boardZ + depth / 2;

    this.body = ctx.physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, z));
    this.bodies.push(this.body);
    const axisQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const hub = PhysicsWorld.applyMaterial(
      RAPIER.ColliderDesc.cylinder(depth / 2, 0.28).setRotation({ x: axisQ.x, y: axisQ.y, z: axisQ.z, w: axisQ.w }),
      SPINNER_MATERIAL,
    );
    this.registerCollider(ctx.physics.world.createCollider(hub, this.body));
    for (let i = 0; i < blades; i++) {
      const a = (i / blades) * Math.PI * 2;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
      const blade = PhysicsWorld.applyMaterial(
        RAPIER.ColliderDesc.cuboid(radius / 2, thickness / 2, depth / 2)
          .setTranslation(Math.cos(a) * (radius / 2), Math.sin(a) * (radius / 2), 0)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
        SPINNER_MATERIAL,
      );
      this.registerCollider(ctx.physics.world.createCollider(blade, this.body));
    }

    // Visuals: a dark axle plate on the wall, a hub, and painted blades that turn with the body.
    const plate = new THREE.Mesh(geometries.unitCylinder, visuals.darkMetal);
    plate.scale.set(0.45, 0.06, 0.45);
    plate.quaternion.copy(axisQ);
    plate.position.set(pos.x, pos.y, ctx.boardZ + 0.03);
    plate.receiveShadow = true;
    this.root.add(plate);
    this.rotor.position.set(pos.x, pos.y, z);
    const hubMesh = new THREE.Mesh(geometries.unitCylinder, visuals.darkMetal);
    hubMesh.scale.set(0.28, depth, 0.28);
    hubMesh.quaternion.copy(axisQ);
    hubMesh.castShadow = true;
    this.rotor.add(hubMesh);
    this.bladeMaterial = visuals.colored(def.color ?? '#e0533d');
    for (let i = 0; i < blades; i++) {
      const a = (i / blades) * Math.PI * 2;
      const b = new THREE.Mesh(geometries.unitBox, this.bladeMaterial);
      b.scale.set(radius, thickness, depth * 0.9);
      b.position.set(Math.cos(a) * (radius / 2), Math.sin(a) * (radius / 2), 0);
      b.rotation.z = a;
      b.castShadow = true;
      b.receiveShadow = true;
      this.rotor.add(b);
    }
    const cap = new THREE.Mesh(geometries.unitCylinder, this.bladeMaterial);
    cap.scale.set(0.2, 0.06, 0.2);
    cap.quaternion.copy(axisQ);
    cap.position.z = depth / 2 + 0.03;
    this.rotor.add(cap);
    this.root.add(this.rotor);
    this.setAngle(this.angleAt(0));
  }

  angleAt(simTime: number): number {
    return this.phase + this.omega * simTime;
  }

  private setAngle(angle: number): void {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
    this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  }

  override fixedUpdate(dt: number, simTime: number): void {
    // Called after the step: hand the physics the pose it must reach by the end of the next one.
    this.setAngle(this.angleAt(simTime + dt));
  }

  override onMarbleContact(event: MarbleContactEvent): void {
    super.onMarbleContact(event);
    this.flash = 1;
  }

  override renderUpdate(frameDt: number, simTime: number): void {
    this.rotor.rotation.z = this.angleAt(simTime);
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - frameDt * 4);
      this.bladeMaterial.emissiveIntensity = this.flash * 0.8;
    }
  }

  override reset(): void {
    super.reset();
    this.flash = 0;
    this.bladeMaterial.emissiveIntensity = 0;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.angleAt(0));
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
  }
}

registerObjectType('spinner', (def: ObjectDef, ctx) => new Spinner(def as SpinnerDef, ctx));
