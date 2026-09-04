import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { InteractiveObject, registerObjectType, type BuildContext } from './InteractiveObject';
import type { ObjectDef, PipeDef } from '../levels/LevelTypes';
import { visuals } from './materials';

/**
 * A curved pipe the marble travels through, like the glossy jointed elbows in
 * the reference game. The inside is a triangle-mesh collider built from the
 * same tube the player sees, so the marble rolls on the real inner wall, climbs
 * the bends, and comes out wherever the pipe points. The mouths flare a little
 * so a marble arriving slightly off-centre is gathered in.
 */
export class Pipe extends InteractiveObject<PipeDef> {
  static defaultHeight(marbleRadius: number): number {
    return marbleRadius + 0.25;
  }

  constructor(def: PipeDef, ctx: BuildContext) {
    super(def, ctx);
    const r = ctx.marbleRadius;
    const radius = def.radius ?? r * 1.7;
    const z = ctx.boardZ + Pipe.defaultHeight(r);
    const curve = new THREE.CatmullRomCurve3(
      def.points.map((p) => new THREE.Vector3(p[0], p[1], p[2] || z)),
      false,
      'centripetal',
      0.5,
    );
    const length = curve.getLength();
    const segments = Math.max(12, Math.ceil(length / 0.25));
    const radial = 14;
    const { positions, indices } = buildTube(curve, segments, radial, radius, 1.35);

    const body = ctx.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.bodies.push(body);
    const desc = PhysicsWorld.applyMaterial(
      RAPIER.ColliderDesc.trimesh(positions, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES),
      { friction: 0.25, restitution: 0.12, bounceRule: 'average' },
    );
    this.registerCollider(ctx.physics.world.createCollider(desc, body));

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.computeVertexNormals();
    const color = new THREE.Color(def.color ?? '#7a3fb0');
    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.18,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, material);
    mesh.castShadow = true;
    mesh.renderOrder = 2;
    this.root.add(mesh);

    // Joint rings every so often, and a dark ring at each mouth: the elbow look.
    const ringGeom = new THREE.TorusGeometry(radius * 1.06, radius * 0.09, 10, 28);
    const ringMat = visuals.darkMetal;
    const count = Math.max(2, Math.round(length / 1.6));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.copy(p);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
      ring.castShadow = true;
      this.root.add(ring);
    }
  }
}

/**
 * Tube surface along a curve with flared ends. Returns flat position and index
 * arrays usable for both the mesh and the trimesh collider. Triangles wind
 * outward; the collider is two-sided so the marble inside collides correctly.
 */
export function buildTube(curve: THREE.Curve<THREE.Vector3>, segments: number, radial: number, radius: number, flare: number): { positions: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array((segments + 1) * radial * 3);
  const frames = curve.computeFrenetFrames(segments, false);
  const p = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    const n = frames.normals[i];
    const b = frames.binormals[i];
    // Flare: full radius in the middle, wider in the last ~12% at each end.
    const edge = Math.min(t, 1 - t) / 0.12;
    const rr = radius * (edge < 1 ? 1 + (flare - 1) * (1 - edge) * (1 - edge) : 1);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const k = (i * radial + j) * 3;
      positions[k] = p.x + rr * (Math.cos(a) * n.x + Math.sin(a) * b.x);
      positions[k + 1] = p.y + rr * (Math.cos(a) * n.y + Math.sin(a) * b.y);
      positions[k + 2] = p.z + rr * (Math.cos(a) * n.z + Math.sin(a) * b.z);
    }
  }
  const indices = new Uint32Array(segments * radial * 6);
  let q = 0;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      indices[q++] = a; indices[q++] = c; indices[q++] = b;
      indices[q++] = b; indices[q++] = c; indices[q++] = d;
    }
  }
  return { positions, indices };
}

registerObjectType('pipe', (def: ObjectDef, ctx) => new Pipe(def as PipeDef, ctx));
