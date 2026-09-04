import * as THREE from 'three';
import { config } from '../core/Config';
import { DEG2RAD, smoothDamp } from '../core/math';

/**
 * Elevated camera that glides after the marble. It leads slightly in the
 * direction of travel and damps every axis independently so it never jolts on
 * a bounce.
 */
export class FollowCamera {
  private readonly focus = new THREE.Vector3();
  private readonly vel = { x: { velocity: 0 }, y: { velocity: 0 }, z: { velocity: 0 } };
  private initialised = false;
  private readonly target = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  snapTo(position: THREE.Vector3): void {
    this.focus.copy(position);
    this.initialised = true;
    this.vel.x.velocity = this.vel.y.velocity = this.vel.z.velocity = 0;
    this.apply();
  }

  update(marblePos: THREE.Vector3, marbleVel: THREE.Vector3, dt: number): void {
    const c = config.camera;
    this.target.copy(marblePos).addScaledVector(marbleVel, c.lookAheadTime);
    this.target.x = marblePos.x * c.xFollow + Math.min(Math.max(marbleVel.x * c.lookAheadTime, -2), 2) * c.xFollow;
    this.target.z = 0;
    if (!this.initialised) {
      this.snapTo(this.target);
      return;
    }
    this.focus.x = smoothDamp(this.focus.x, this.target.x, this.vel.x, c.smoothTime, dt);
    this.focus.y = smoothDamp(this.focus.y, this.target.y, this.vel.y, c.smoothTime * 0.8, dt);
    this.focus.z = 0;
    this.apply();
  }

  currentFocus(target = new THREE.Vector3()): THREE.Vector3 {
    return target.copy(this.focus);
  }

  /** Configured distance, pushed back on narrow screens so the zigzag never leaves the frame. */
  private distance(): number {
    const c = config.camera;
    const halfW = Math.tan((this.camera.fov * DEG2RAD) / 2) * this.camera.aspect;
    return Math.max(c.distance, c.minVisibleWidth / 2 / halfW);
  }

  private apply(): void {
    const c = config.camera;
    const pitch = c.pitchDeg * DEG2RAD;
    const d = this.distance();
    this.camera.position.set(this.focus.x, this.focus.y + Math.sin(pitch) * d, Math.cos(pitch) * d);
    this.camera.lookAt(this.focus.x, this.focus.y - 1.0, 0);
  }
}
