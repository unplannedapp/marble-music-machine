import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { config } from '../core/Config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { InteractiveObject, registerObjectType, type BuildContext } from './InteractiveObject';
import type { ObjectDef, RampDef, WallDef } from '../levels/LevelTypes';
import { geometries, visuals } from './materials';
import { eulerDegToQuat, tupleToVector3 } from '../core/math';

/** A fixed box: ramps, ledges and walls are all the same thing with different sizes and materials. */
export class Ramp extends InteractiveObject<RampDef | WallDef> {
  constructor(def: RampDef | WallDef, ctx: BuildContext) {
    super(def, ctx);
    const pos = tupleToVector3(def.position);
    const q = eulerDegToQuat(def.rotation);
    const [w, h, d] = def.size;
    const material = def.type === 'wall' ? config.materials.wall : config.materials.ramp;

    const body = ctx.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    );
    this.bodies.push(body);
    const desc = PhysicsWorld.applyMaterial(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2), material);
    this.registerCollider(ctx.physics.world.createCollider(desc, body));

    const mesh = new THREE.Mesh(geometries.unitBox, def.color ? visuals.colored(def.color) : def.type === 'wall' ? visuals.darkMetal : visuals.wood);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // The side walls keep the marble on the board but are not part of the picture:
    // the reference machines have no visible edges, and the camera now pans out to them.
    if (def.type === 'wall') mesh.visible = false;
    this.root.add(mesh);
    this.root.position.copy(pos);
    this.root.quaternion.copy(q);
  }
}

registerObjectType('ramp', (def: ObjectDef, ctx) => new Ramp(def as RampDef, ctx));
registerObjectType('wall', (def: ObjectDef, ctx) => new Ramp(def as WallDef, ctx));
