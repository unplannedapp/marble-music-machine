import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { config } from '../core/Config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { InteractiveObject, registerObjectType, type BuildContext } from './InteractiveObject';
import type { ObjectDef, RailDef } from '../levels/LevelTypes';
import { geometries, visuals } from './materials';

const _yAxis = new THREE.Vector3(0, 1, 0);

/**
 * Wire rail: two parallel metal rods on posts, as in the reference machines.
 *
 * The level author gives the path of the marble's centre in board coordinates.
 * The rods are placed symmetrically either side of the gravity direction so the
 * ball rides in a true V-groove, held clear of the backboard, and rolls without
 * rubbing. Physics is a chain of capsule colliders per rod; nothing about the
 * marble's motion is scripted.
 *
 * A path z of 0 means "default rail height" (marble held a little off the board).
 */
export class Rail extends InteractiveObject<RailDef> {
  /** Height of the marble's centre above the board when riding a default rail. */
  static defaultHeight(marbleRadius: number): number {
    return marbleRadius + 0.25;
  }

  constructor(def: RailDef, ctx: BuildContext) {
    super(def, ctx);
    const r = ctx.marbleRadius;
    const rodRadius = def.rodRadius ?? 0.06;
    const gauge = def.gauge ?? r * 1.4;
    const g = ctx.physics.world.gravity;
    const up = new THREE.Vector3(-g.x, -g.y, -g.z);
    if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
    up.normalize();
    // Both rods touch the ball: distance from ball centre to rod axis = r + rodRadius.
    const drop = Math.sqrt(Math.max(0, (r + rodRadius) ** 2 - (gauge / 2) ** 2));
    const defaultZ = ctx.boardZ + Rail.defaultHeight(r);

    const curve = new THREE.CatmullRomCurve3(
      def.points.map((p) => new THREE.Vector3(p[0], p[1], p[2] || defaultZ)),
      false,
      'centripetal',
      0.5,
    );
    const length = curve.getLength();
    const samples = Math.max(8, Math.ceil(length / 0.3));
    const centres = curve.getSpacedPoints(samples);

    const rodA: THREE.Vector3[] = [];
    const rodB: THREE.Vector3[] = [];
    const tangent = new THREE.Vector3();
    const side = new THREE.Vector3();
    const support = new THREE.Vector3();
    for (let i = 0; i <= samples; i++) {
      curve.getTangentAt(i / samples, tangent).normalize();
      // The groove supports the ball against the part of gravity that is
      // perpendicular to the path, so on steep sections the rods flank the ball
      // instead of degenerating onto the path line.
      support.copy(up).addScaledVector(tangent, -up.dot(tangent));
      if (support.lengthSq() < 1e-6) support.set(0, 0, 1);
      support.normalize();
      side.crossVectors(tangent, support).normalize();
      const base = centres[i].clone().addScaledVector(support, -drop);
      rodA.push(base.clone().addScaledVector(side, gauge / 2));
      rodB.push(base.clone().addScaledVector(side, -gauge / 2));
    }

    const body = ctx.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.bodies.push(body);
    for (const rod of [rodA, rodB]) {
      for (let i = 0; i < rod.length - 1; i++) this.addSegment(body, rod[i], rod[i + 1], rodRadius);
      this.addRodVisual(rod, rodRadius);
    }
    this.addPosts(rodA, rodB, rodRadius);
  }

  private addSegment(body: RAPIER.RigidBody, a: THREE.Vector3, b: THREE.Vector3, radius: number): void {
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-5) return;
    dir.divideScalar(len);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(_yAxis, dir);
    const desc = PhysicsWorld.applyMaterial(
      RAPIER.ColliderDesc.capsule(len / 2, radius)
        .setTranslation(mid.x, mid.y, mid.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
      config.materials.rail,
    );
    this.registerCollider(this.ctx.physics.world.createCollider(desc, body));
  }

  private addRodVisual(points: THREE.Vector3[], radius: number): void {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
    const geom = new THREE.TubeGeometry(curve, points.length * 2, radius, 10, false);
    const mesh = new THREE.Mesh(geom, visuals.metal);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    for (const p of [points[0], points[points.length - 1]]) {
      const cap = new THREE.Mesh(geometries.unitSphere, visuals.metal);
      cap.scale.setScalar(radius * 1.6);
      cap.position.copy(p);
      cap.castShadow = true;
      this.root.add(cap);
    }
  }

  /** Thin posts from each rod down to the backboard. Visual only. */
  private addPosts(rodA: THREE.Vector3[], rodB: THREE.Vector3[], rodRadius: number): void {
    const every = Math.max(2, Math.round(rodA.length / 4));
    const boardZ = this.ctx.boardZ;
    for (let i = 0; i < rodA.length; i += every) {
      const idx = Math.min(i, rodA.length - 1);
      for (const rod of [rodA, rodB]) {
        const p = rod[idx];
        const h = p.z - boardZ;
        if (h <= 0.02) continue;
        const post = new THREE.Mesh(geometries.unitCylinder, visuals.metal);
        post.scale.set(rodRadius * 0.7, h, rodRadius * 0.7);
        post.rotation.x = Math.PI / 2;
        post.position.set(p.x, p.y, boardZ + h / 2);
        post.castShadow = true;
        this.root.add(post);
        const knob = new THREE.Mesh(geometries.unitSphere, visuals.metal);
        knob.scale.setScalar(rodRadius * 1.5);
        knob.position.copy(p);
        this.root.add(knob);
      }
    }
  }
}

registerObjectType('rail', (def: ObjectDef, ctx) => new Rail(def as RailDef, ctx));
