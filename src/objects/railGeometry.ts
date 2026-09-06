import * as THREE from 'three';
import type { BuildContext } from './InteractiveObject';
import type { Vec3Tuple } from '../core/math';
import { DEG2RAD } from '../core/math';

export interface GrooveOptions {
  rodRadius?: number;
  gauge?: number;
  lipDeg?: number;
}

/**
 * Rod placement for a gravity V-groove, the same rule the Rail uses: the two
 * rods flank the direction of gravity perpendicular to the path, swung forward
 * by the lip so the front rod cradles a bouncing marble. Shared by objects
 * built out of rail (the bowl), so they ride exactly like a rail.
 */
export function grooveRods(points: Vec3Tuple[], ctx: BuildContext, o: GrooveOptions = {}) {
  const r = ctx.marbleRadius;
  const rodRadius = o.rodRadius ?? 0.06;
  const gauge = o.gauge ?? r * 1.4;
  const g = ctx.physics.world.gravity;
  const up = new THREE.Vector3(-g.x, -g.y, -g.z);
  if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
  up.normalize();
  const lip = (o.lipDeg ?? 20) * DEG2RAD;
  const drop = Math.sqrt(Math.max(0, (r + rodRadius) ** 2 - (gauge / 2) ** 2));
  const defaultZ = ctx.boardZ + r + 0.25;
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2] || defaultZ)), false, 'centripetal', 0.5);
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
    support.copy(up).addScaledVector(tangent, -up.dot(tangent));
    if (support.lengthSq() < 1e-6) support.set(0, 0, 1);
    support.normalize();
    side.crossVectors(tangent, support).normalize();
    if (side.z < 0) side.negate();
    support.multiplyScalar(Math.cos(lip)).addScaledVector(side, -Math.sin(lip)).normalize();
    side.crossVectors(tangent, support).normalize();
    if (side.z < 0) side.negate();
    const base = centres[i].clone().addScaledVector(support, -drop);
    rodA.push(base.clone().addScaledVector(side, gauge / 2));
    rodB.push(base.clone().addScaledVector(side, -gauge / 2));
  }
  return { centres, rodA, rodB, rodRadius };
}
