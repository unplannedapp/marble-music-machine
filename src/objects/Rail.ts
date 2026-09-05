import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { config, type MaterialProps } from '../core/Config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { InteractiveObject, registerObjectType, type BuildContext } from './InteractiveObject';
import type { ObjectDef, RailDef } from '../levels/LevelTypes';
import { geometries, visuals } from './materials';
import { DEG2RAD } from '../core/math';

const _yAxis = new THREE.Vector3(0, 1, 0);

/** Guard rods touch the marble at the pole of its rolling axis, a point that slides at full speed, so they are slippery. */
const GUARD_MATERIAL: MaterialProps = { friction: 0.02, restitution: 0.05, bounceRule: 'average' };

/**
 * Wire rail: two parallel metal rods on posts, as in the reference machines.
 *
 * The level author gives the path of the marble's centre in board coordinates.
 * The rods are placed either side of the gravity direction so the ball rides in
 * a V-groove, held clear of the backboard, and rolls without rubbing. The pair
 * is rotated toward the camera by `lipDeg` so the front rod forms a lip: a ball
 * that bounces in the groove is cradled instead of hopping out over the front. Physics is a chain of capsule colliders per rod; nothing about the
 * marble's motion is scripted.
 *
 * A path z of 0 means "default rail height" (marble held a little off the board).
 *
 * With `groove: 'curve'` the rods follow the outside of each bend instead of
 * gravity: through a loop-the-loop the marble presses outward, so the rods
 * must be on the outside all the way round, including over the top.
 */
export class Rail extends InteractiveObject<RailDef> {
  /** Height of the marble's centre above the board when riding a default rail. */
  static defaultHeight(marbleRadius: number): number {
    return marbleRadius + 0.25;
  }

  /** A ribbon track rides low: the marble leans on the board, which is its rear guard. */
  static trackHeight(marbleRadius: number): number {
    return marbleRadius + 0.02;
  }

  constructor(def: RailDef, ctx: BuildContext) {
    super(def, ctx);
    const r = ctx.marbleRadius;
    const rodRadius = def.rodRadius ?? 0.06;
    const curveGroove = def.groove === 'curve';
    const gauge = def.gauge ?? r * 1.4;
    const g = ctx.physics.world.gravity;
    const up = new THREE.Vector3(-g.x, -g.y, -g.z);
    if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
    up.normalize();
    const lip = (def.lipDeg ?? 20) * DEG2RAD;
    // Both rods touch the ball: distance from ball centre to rod axis = r + rodRadius.
    const drop = Math.sqrt(Math.max(0, (r + rodRadius) ** 2 - (gauge / 2) ** 2));
    const defaultZ = ctx.boardZ + (curveGroove ? Rail.trackHeight(r) : Rail.defaultHeight(r));

    const curve = new THREE.CatmullRomCurve3(
      def.points.map((p) => new THREE.Vector3(p[0], p[1], p[2] || defaultZ)),
      false,
      'centripetal',
      0.5,
    );
    const length = curve.getLength();
    // A ribbon track is a polyline of facets: each corner costs the marble the
    // velocity component into it, so a loop needs far finer sampling than rods.
    const spacing = curveGroove ? (def.sampleSpacing ?? 0.08) : 0.3;
    const samples = Math.max(8, Math.ceil(length / spacing));
    const centres = curve.getSpacedPoints(samples);

    const rodA: THREE.Vector3[] = [];
    const rodB: THREE.Vector3[] = [];
    const tangents: THREE.Vector3[] = [];
    const supports: THREE.Vector3[] = [];
    const inward = new THREE.Vector3();
    const tPrev = new THREE.Vector3();
    const tNext = new THREE.Vector3();
    // In-plane 'up' for the curve groove: its support never leaves the board
    // plane, so the rod pair is always front/back and the ball rolls without
    // its axis twisting (twisting under the heavy load in a loop is friction).
    const upFlat = new THREE.Vector3(up.x, up.y, 0);
    if (upFlat.lengthSq() < 1e-8) upFlat.set(0, 1, 0);
    upFlat.normalize();
    for (let i = 0; i <= samples; i++) {
      const tangent = curve.getTangentAt(i / samples).normalize();
      // The groove supports the ball against the part of gravity that is
      // perpendicular to the path, so on steep sections the rods flank the ball
      // instead of degenerating onto the path line.
      const support = (curveGroove ? upFlat : up).clone().addScaledVector(tangent, -(curveGroove ? upFlat : up).dot(tangent));
      if (support.lengthSq() < 1e-6) support.set(0, 0, 1);
      support.normalize();
      if (curveGroove) {
        // Centre of curvature from the change of tangent; the tighter the bend,
        // the more the groove faces inward instead of up.
        curve.getTangentAt(Math.max(0, i - 1) / samples, tPrev).normalize();
        curve.getTangentAt(Math.min(samples, i + 1) / samples, tNext).normalize();
        inward.subVectors(tNext, tPrev);
        inward.z = 0;
        const ds = (2 * length) / samples;
        const kappa = inward.length() / ds;
        if (kappa > 1e-4) {
          inward.normalize();
          const w = Math.min(1, kappa * 1.6);
          support.multiplyScalar(1 - w).addScaledVector(inward, w).normalize();
        }
        support.z = 0;
        if (support.lengthSq() < 1e-6) support.copy(upFlat);
        support.normalize();
      }
      tangents.push(tangent);
      supports.push(support);
    }
    // A curve track's groove must turn gradually (a support that swings across
    // the path between two samples is a wall), so smooth it along the rail.
    // Plain rails keep their exact geometry: every laid-out machine depends on it.
    const smoothed = curveGroove
      ? supports.map((_, i) => {
          const acc = new THREE.Vector3();
          for (let k = -3; k <= 3; k++) acc.add(supports[Math.min(samples, Math.max(0, i + k))]);
          return acc.normalize();
        })
      : supports;

    const body = ctx.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.bodies.push(body);

    if (curveGroove) {
      // Ribbon track, roller-coaster style. The marble rolls on one thick floor
      // rod (a single contact, so it rolls on its full radius: a V-groove turns
      // the ball into a flywheel under loop loads, and a triangle-mesh floor
      // catches a fast sliding ball on its edges). Two thin guard rods beside it
      // at the marble's equator hold it in depth; the track rides low so the
      // board is the rear guard until the path lifts for a crossing. Every
      // collider is a capsule: smooth, no mesh edges to trip on.
      const zHat = new THREE.Vector3(0, 0, 1);
      const floorR = r * 0.45;
      const guard = r + rodRadius + 0.05;
      const floorRod: THREE.Vector3[] = [];
      const guardA: THREE.Vector3[] = [];
      const guardB: THREE.Vector3[] = [];
      for (let i = 0; i <= samples; i++) {
        const tangent = tangents[i];
        const support = smoothed[i].addScaledVector(tangent, -smoothed[i].dot(tangent)).normalize();
        floorRod.push(centres[i].clone().addScaledVector(support, -(r + floorR)));
        const along = (i / samples) * length;
        const flare = Math.max(0, 1 - Math.min(along, length - along) / 1.6) * 0.4;
        const lift = support.clone().multiplyScalar(-r * 0.1);
        guardA.push(centres[i].clone().addScaledVector(zHat, guard + flare).add(lift));
        guardB.push(centres[i].clone().addScaledVector(zHat, -guard).add(lift));
      }
      for (let i = 0; i < floorRod.length - 1; i++) this.addSegment(body, floorRod[i], floorRod[i + 1], floorR, config.materials.rail);
      for (const rod of [guardA, guardB]) {
        for (let i = 0; i < rod.length - 1; i++) this.addSegment(body, rod[i], rod[i + 1], rodRadius, GUARD_MATERIAL);
        this.addRodVisual(rod, rodRadius);
      }
      this.addRodVisual(floorRod, floorR);
      this.addTies(guardA, guardB, rodRadius);
      this.addPosts(guardA, guardB, rodRadius);
      return;
    }

    const side = new THREE.Vector3();
    for (let i = 0; i <= samples; i++) {
      const tangent = tangents[i];
      const support = smoothed[i].addScaledVector(tangent, -smoothed[i].dot(tangent)).normalize();
      side.crossVectors(tangent, support).normalize();
      if (side.z < 0) side.negate();
      // Tilt the support direction away from the camera: the rod pair swings
      // forward, so the front rod rides higher than the rear one and forms a lip.
      support.multiplyScalar(Math.cos(lip)).addScaledVector(side, -Math.sin(lip)).normalize();
      side.crossVectors(tangent, support).normalize();
      if (side.z < 0) side.negate();
      const base = centres[i].clone().addScaledVector(support, -drop);
      rodA.push(base.clone().addScaledVector(side, gauge / 2));
      rodB.push(base.clone().addScaledVector(side, -gauge / 2));
    }
    for (const rod of [rodA, rodB]) {
      for (let i = 0; i < rod.length - 1; i++) this.addSegment(body, rod[i], rod[i + 1], rodRadius);
      this.addRodVisual(rod, rodRadius);
    }
    this.addPosts(rodA, rodB, rodRadius);
  }

  private addSegment(body: RAPIER.RigidBody, a: THREE.Vector3, b: THREE.Vector3, radius: number, material: MaterialProps = config.materials.rail): void {
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
      material,
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

  /** Ties between the guard rails: the roller-coaster look. Visual only. */
  private addTies(guardA: THREE.Vector3[], guardB: THREE.Vector3[], rodRadius: number): void {
    const every = Math.max(1, Math.round(0.45 / Math.max(1e-3, guardA[0].distanceTo(guardA[Math.min(1, guardA.length - 1)]))));
    for (let i = 0; i < guardA.length; i += every) {
      const a = guardA[i], b = guardB[i];
      const tie = new THREE.Mesh(geometries.unitCylinder, visuals.metal);
      const len = a.distanceTo(b);
      tie.scale.set(rodRadius * 0.8, len, rodRadius * 0.8);
      tie.position.copy(a).add(b).multiplyScalar(0.5);
      tie.quaternion.setFromUnitVectors(_yAxis, b.clone().sub(a).normalize());
      tie.castShadow = true;
      this.root.add(tie);
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
