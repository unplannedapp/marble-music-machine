import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { config } from '../core/Config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { InteractiveObject, registerObjectType, type BuildContext } from './InteractiveObject';
import type { BowlDef, ObjectDef } from '../levels/LevelTypes';
import { geometries, visuals } from './materials';
import { grooveRods } from './railGeometry';
import type { Vec3Tuple } from '../core/math';
import type { MarbleContactEvent } from '../events/EventBus';

const _yAxis = new THREE.Vector3(0, 1, 0);
const _zAxis = new THREE.Vector3(0, 0, 1);

/**
 * Funnel bowl: a U of rail the marble drops into and swings across, and a
 * short hinged section of the floor that swings open a set time after the
 * marble arrives, dropping it out of the bottom. The swinging is real physics;
 * only the trapdoor moves, and it is a kinematic body whose angle is a pure
 * function of time since the catch, so the pause is exact and every run is
 * the same run. A phrase break with a precise length.
 */
export class Bowl extends InteractiveObject<BowlDef> {
  private readonly gate: RAPIER.RigidBody;
  private readonly gateGroup = new THREE.Group();
  private readonly hinge: THREE.Vector3;
  private readonly hold: number;
  private triggeredAt = NaN;
  private angle = 0;

  constructor(def: BowlDef, ctx: BuildContext) {
    super(def, ctx);
    const radius = def.radius ?? 1.5;
    const gateHalf = def.gateDeg ?? 22;
    this.hold = def.hold ?? 1.0;
    const [cx, cy] = def.position;
    // The U: a little above horizontal on both rims so a marble cannot slop out sideways.
    const points: Vec3Tuple[] = [];
    for (let a = 168; a <= 372; a += 12) points.push([+(cx + radius * Math.cos((a * Math.PI) / 180)).toFixed(3), +(cy + radius * Math.sin((a * Math.PI) / 180)).toFixed(3), 0]);
    const { centres, rodA, rodB, rodRadius } = grooveRods(points, ctx, { lipDeg: def.lipDeg });
    const angleOf = (p: THREE.Vector3) => {
      let a = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI;
      if (a < 0) a += 360;
      return a;
    };
    const inGate = (a: number) => a > 270 - gateHalf && a < 270 + gateHalf;

    const fixed = ctx.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.bodies.push(fixed);
    // Hinge at the gate's left end, on the centreline.
    const hingeAngle = ((270 - gateHalf) * Math.PI) / 180;
    this.hinge = new THREE.Vector3(cx + radius * Math.cos(hingeAngle), cy + radius * Math.sin(hingeAngle), centres[0].z);
    this.gate = ctx.physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.hinge.x, this.hinge.y, this.hinge.z));
    this.bodies.push(this.gate);

    const fixedRods: { a: THREE.Vector3[]; b: THREE.Vector3[] }[] = [{ a: [], b: [] }];
    const gateRods = { a: [] as THREE.Vector3[], b: [] as THREE.Vector3[] };
    for (let i = 0; i < centres.length - 1; i++) {
      const mid = centres[i].clone().add(centres[i + 1]).multiplyScalar(0.5);
      const onGate = inGate(angleOf(mid));
      for (const [rod, tag] of [[rodA, 'a'], [rodB, 'b']] as const) {
        const a = rod[i];
        const b = rod[i + 1];
        if (onGate) {
          this.addCapsule(this.gate, a.clone().sub(this.hinge), b.clone().sub(this.hinge), rodRadius);
          if (!gateRods[tag].length) gateRods[tag].push(a);
          gateRods[tag].push(b);
        } else {
          this.addCapsule(fixed, a, b, rodRadius);
          let run = fixedRods[fixedRods.length - 1];
          // Start a new visual run after the gate so the tube does not bridge the gap.
          if (run[tag].length && !run[tag][run[tag].length - 1].equals(a)) {
            fixedRods.push({ a: [], b: [] });
            run = fixedRods[fixedRods.length - 1];
          }
          if (!run[tag].length) run[tag].push(a);
          run[tag].push(b);
        }
      }
    }
    for (const run of fixedRods) for (const rod of [run.a, run.b]) if (rod.length > 1) this.addRodVisual(this.root, rod, rodRadius);
    for (const rod of [gateRods.a, gateRods.b]) if (rod.length > 1) this.addRodVisual(this.gateGroup, rod.map((p) => p.clone().sub(this.hinge)), rodRadius);
    this.gateGroup.position.copy(this.hinge);
    this.root.add(this.gateGroup);
    // A hinge pin and a few posts to the wall.
    const pin = new THREE.Mesh(geometries.unitCylinder, visuals.darkMetal);
    pin.scale.set(0.09, 0.5, 0.09);
    pin.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    pin.position.set(this.hinge.x, this.hinge.y, this.hinge.z - 0.1);
    this.root.add(pin);
    for (const i of [0, Math.floor(centres.length * 0.3), Math.floor(centres.length * 0.7), centres.length - 1]) {
      for (const rod of [rodA, rodB]) {
        const p = rod[i];
        const post = new THREE.Mesh(geometries.unitCylinder, visuals.darkMetal);
        post.scale.set(0.035, p.z - ctx.boardZ, 0.035);
        post.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        post.position.set(p.x, p.y, (p.z + ctx.boardZ) / 2);
        this.root.add(post);
      }
    }
  }

  private addCapsule(body: RAPIER.RigidBody, a: THREE.Vector3, b: THREE.Vector3, radius: number): void {
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-5) return;
    dir.divideScalar(len);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(_yAxis, dir);
    const desc = PhysicsWorld.applyMaterial(
      RAPIER.ColliderDesc.capsule(len / 2, radius).setTranslation(mid.x, mid.y, mid.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
      config.materials.rail,
    );
    this.registerCollider(this.ctx.physics.world.createCollider(desc, body));
  }

  private addRodVisual(parent: THREE.Object3D, points: THREE.Vector3[], radius: number): void {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 2, radius, 10, false), visuals.metal);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }

  /** Gate angle (radians, clockwise = open) at a moment after the catch. */
  gateAngleAt(sinceTrigger: number): number {
    const t = sinceTrigger - this.hold;
    if (t <= 0) return 0;
    const open = -100 * (Math.PI / 180);
    if (t < 0.12) { const u = t / 0.12; return open * u * u * (3 - 2 * u); }
    if (t < 1.1) return open;
    const u = Math.min(1, (t - 1.1) / 0.5);
    return open * (1 - u * u * (3 - 2 * u));
  }

  override fixedUpdate(dt: number, simTime: number): void {
    if (!Number.isFinite(this.triggeredAt)) return;
    const since = simTime + dt - this.triggeredAt;
    this.angle = this.gateAngleAt(since);
    const q = new THREE.Quaternion().setFromAxisAngle(_zAxis, this.angle);
    this.gate.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    if (since > this.hold + 1.8) this.triggeredAt = NaN;
  }

  override onMarbleContact(event: MarbleContactEvent): void {
    super.onMarbleContact(event);
    if (!Number.isFinite(this.triggeredAt)) this.triggeredAt = event.simTime;
  }

  override renderUpdate(): void {
    this.gateGroup.rotation.z = this.angle;
  }

  override reset(): void {
    super.reset();
    this.triggeredAt = NaN;
    this.angle = 0;
    this.gate.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }
}

registerObjectType('bowl', (def: ObjectDef, ctx) => new Bowl(def as BowlDef, ctx));
