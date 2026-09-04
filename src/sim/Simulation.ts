import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { config } from '../core/Config';
import { EventBus, type MarbleContactEvent } from '../events/EventBus';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { Marble } from '../marble/Marble';
import { createObject, InteractiveObject } from '../objects';
import { Pad } from '../objects/Pad';
import type { LevelDef, ObjectDef } from '../levels/LevelTypes';
import { geometries, visuals } from '../objects/materials';
import { tupleToVector3 } from '../core/math';

let rapierReady: Promise<void> | null = null;
export function initRapier(): Promise<void> {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

/**
 * Everything about the machine that does not need a screen: the physics world,
 * the marble, the level's objects and the contact routing. The renderer sits on
 * top of this; tests drive it headlessly.
 */
export class Simulation {
  readonly bus = new EventBus();
  readonly physics: PhysicsWorld;
  readonly scene = new THREE.Group();
  readonly marble: Marble;
  readonly objects: InteractiveObject[] = [];
  readonly objectsById = new Map<string, InteractiveObject>();
  level: LevelDef | null = null;
  lastContact: MarbleContactEvent | null = null;
  private boardMesh: THREE.Mesh | null = null;
  private boardBody: RAPIER.RigidBody | null = null;
  private stalledFor = 0;

  constructor() {
    this.physics = new PhysicsWorld(this.bus);
    this.marble = new Marble(this.physics);
    this.scene.add(this.marble.root);
    this.bus.on('marble:contact', (e) => {
      this.lastContact = e;
      e.object.onMarbleContact(e);
    });
  }

  get simTime(): number {
    return this.physics.simTime;
  }

  load(level: LevelDef): void {
    this.unload();
    this.level = level;
    this.buildBoard(level);
    for (const def of level.objects) this.addObject(def);
    this.resetMarble('manual');
  }

  /** Add one object to the live machine (used by the loader now, the editor later). */
  addObject(def: ObjectDef): InteractiveObject {
    const ctx = { physics: this.physics, boardZ: 0, marbleRadius: this.marble.radius };
    const obj = createObject(def, ctx);
    this.objects.push(obj);
    this.objectsById.set(obj.id, obj);
    this.scene.add(obj.root);
    if (obj instanceof Pad) this.scene.add(obj.mount);
    return obj;
  }

  removeObject(id: string): boolean {
    const obj = this.objectsById.get(id);
    if (!obj) return false;
    obj.dispose();
    this.objectsById.delete(id);
    const i = this.objects.indexOf(obj);
    if (i >= 0) this.objects.splice(i, 1);
    return true;
  }

  unload(): void {
    for (const o of this.objects) o.dispose();
    this.objects.length = 0;
    this.objectsById.clear();
    this.physics.clearContacts();
    if (this.boardMesh) {
      this.boardMesh.removeFromParent();
      this.boardMesh = null;
    }
    if (this.boardBody) {
      this.physics.world.removeRigidBody(this.boardBody);
      this.boardBody = null;
    }
    this.level = null;
  }

  private buildBoard(level: LevelDef): void {
    const { width, top, bottom } = level.board;
    const height = top - bottom;
    const thickness = 1;
    const cy = (top + bottom) / 2;
    const body = this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, cy, -thickness / 2));
    const desc = PhysicsWorld.applyMaterial(
      RAPIER.ColliderDesc.cuboid(width / 2 + 4, height / 2 + 4, thickness / 2),
      config.materials.board,
    );
    this.physics.world.createCollider(desc, body);
    // Front glass: same fixed body, a thin invisible pane in front of the machine.
    const glassZ = level.board.glass ?? 1.5;
    const glass = PhysicsWorld.applyMaterial(
      RAPIER.ColliderDesc.cuboid(width / 2 + 4, height / 2 + 4, 0.1).setTranslation(0, 0, glassZ + thickness / 2 + 0.1),
      { friction: 0.1, restitution: 0.05, bounceRule: 'average' },
    );
    this.physics.world.createCollider(glass, body);
    this.boardBody = body;

    const mat = level.board.color ? visuals.colored(level.board.color) : visuals.board;
    mat.roughness = 0.95;
    const mesh = new THREE.Mesh(geometries.unitBox, mat);
    mesh.scale.set(width + 40, height + 40, thickness);
    mesh.position.set(0, cy, -thickness / 2);
    mesh.receiveShadow = true;
    this.boardMesh = mesh;
    this.scene.add(mesh);
  }

  /** Put the marble at a checkpoint without announcing a reset (objects are restored). */
  respawn(position: THREE.Vector3, velocity: THREE.Vector3, spin?: THREE.Vector3): void {
    this.marble.reset(position, velocity, spin);
    for (const o of this.objects) o.reset();
    this.physics.clearContacts();
    this.lastContact = null;
    this.stalledFor = 0;
  }

  resetMarble(reason: 'fell' | 'manual' | 'stalled' | 'finished' = 'manual'): void {
    if (!this.level) return;
    this.marble.reset(tupleToVector3(this.level.spawn.position), tupleToVector3(this.level.spawn.velocity));
    for (const o of this.objects) o.reset();
    this.physics.contactCount = 0;
    this.physics.clearContacts();
    this.lastContact = null;
    this.stalledFor = 0;
    this.bus.emit('marble:reset', { simTime: this.simTime, reason });
  }

  fixedUpdate(dt: number): void {
    this.physics.step(dt);
    for (const o of this.objects) o.fixedUpdate(dt, this.simTime);

    const level = this.level;
    if (!level) return;
    const p = this.marble.body.translation();
    if (p.y < level.killY) {
      this.resetMarble('fell');
      return;
    }
    // A marble at rest is either finished (inside the finish zone) or stuck.
    if (this.marble.speed() < 0.05) {
      this.stalledFor += dt;
      const f = level.finish;
      const inFinish = f && Math.hypot(p.x - f.position[0], p.y - f.position[1]) <= f.radius;
      if (inFinish && this.stalledFor > 1.2) this.resetMarble('finished');
      else if (this.stalledFor > 3) this.resetMarble('stalled');
    } else {
      this.stalledFor = 0;
    }
  }

  renderUpdate(alpha: number, frameDt: number): void {
    this.physics.syncVisuals(alpha);
    for (const o of this.objects) o.renderUpdate(frameDt, this.simTime);
  }

  /** Re-read config values that can change at runtime from the debug panel. */
  applyConfig(): void {
    this.physics.applyGravity();
    this.physics.world.numSolverIterations = config.physics.solverIterations;
    this.marble.applyMaterial();
  }

  dispose(): void {
    this.unload();
    this.physics.dispose();
    this.bus.clear();
  }
}
