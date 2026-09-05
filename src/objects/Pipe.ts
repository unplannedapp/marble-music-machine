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
 * the bends, and comes out wherever the pipe points. The axis sits one radius
 * off the board so the pipe floor is flush with it (no lip to climb), and the
 * mouths flare into funnels so a marble arriving off-centre is gathered in
 * rather than clipping the rim. The funnel opens sideways and toward the
 * camera only: the floor stays flush, so the bell is never cut off by the wall. A marble that hits a thin mesh wall edge-on
 * can be pushed through it, so the funnel is not decoration: it is what keeps
 * the entry honest.
 */
export const PIPE_FLARE = 1.8;
export const PIPE_FLARE_LENGTH = 0.18;

export class Pipe extends InteractiveObject<PipeDef> {
  static defaultRadius(marbleRadius: number): number {
    return marbleRadius * 1.7;
  }

  /** Axis height above the board: the inner floor touches the board surface. */
  static defaultHeight(marbleRadius: number, radius = Pipe.defaultRadius(marbleRadius)): number {
    return radius;
  }

  /** The pipe's centreline as the physics sees it. */
  static curveFor(def: PipeDef, marbleRadius: number, boardZ = 0): THREE.CatmullRomCurve3 {
    const radius = def.radius ?? Pipe.defaultRadius(marbleRadius);
    const z = boardZ + Pipe.defaultHeight(marbleRadius, radius);
    return new THREE.CatmullRomCurve3(
      def.points.map((p) => new THREE.Vector3(p[0], p[1], p[2] || z)),
      false,
      'centripetal',
      0.5,
    );
  }

  constructor(def: PipeDef, ctx: BuildContext) {
    super(def, ctx);
    const r = ctx.marbleRadius;
    const radius = def.radius ?? Pipe.defaultRadius(r);
    const curve = Pipe.curveFor(def, r, ctx.boardZ);
    const length = curve.getLength();
    const segments = Math.max(12, Math.ceil(length / 0.25));
    const radial = 14;
    const { positions, indices } = buildTube(curve, segments, radial, radius, PIPE_FLARE, PIPE_FLARE_LENGTH);

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

    // Joint rings every so often, and a dark rim around each mouth: the elbow look.
    const ringMat = visuals.darkMetal;
    for (const end of [0, segments]) {
      const outline: THREE.Vector3[] = [];
      for (let j = 0; j < radial; j++) outline.push(new THREE.Vector3().fromArray(positions, (end * radial + j) * 3));
      const loop = new THREE.CatmullRomCurve3(outline, true, 'centripetal');
      const rim = new THREE.Mesh(new THREE.TubeGeometry(loop, 40, radius * 0.09, 8, true), ringMat);
      rim.castShadow = true;
      this.root.add(rim);
    }
    const ringGeom = new THREE.TorusGeometry(radius * 1.06, radius * 0.09, 10, 28);
    const count = Math.max(2, Math.round(length / 1.6));
    for (let i = 1; i < count; i++) {
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
export function flareAt(t: number, flare: number, flareLength: number): number {
  const edge = Math.min(t, 1 - t) / flareLength;
  return edge < 1 ? 1 + (flare - 1) * (1 - edge) * (1 - edge) : 1;
}

export function buildTube(curve: THREE.Curve<THREE.Vector3>, segments: number, radial: number, radius: number, flare: number, flareLength = 0.12): { positions: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array((segments + 1) * radial * 3);
  const frames = curve.computeFrenetFrames(segments, false);
  const p = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    const n = frames.normals[i];
    const b = frames.binormals[i];
    // Flare: full radius in the middle, a funnel over the last stretch at each end.
    const f = flareAt(t, flare, flareLength);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const k = (i * radial + j) * 3;
      const dx = Math.cos(a) * n.x + Math.sin(a) * b.x;
      const dy = Math.cos(a) * n.y + Math.sin(a) * b.y;
      const dz = Math.cos(a) * n.z + Math.sin(a) * b.z;
      // The bell opens sideways and outward, never into the board: no flare straight down.
      const w = THREE.MathUtils.smoothstep(dz, -1, 0);
      const rr = radius * (1 + (f - 1) * w);
      positions[k] = p.x + rr * dx;
      positions[k + 1] = p.y + rr * dy;
      positions[k + 2] = p.z + rr * dz;
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
