import * as THREE from 'three';
import { config } from '../core/Config';
import { DEG2RAD, smoothDamp } from '../core/math';

/**
 * Elevated camera that glides after the marble, looking down the board the
 * way the reference does: the marble rides high in the frame with the next
 * objects laid out below it, the camera pans fully across with the marble and
 * leads toward where it is heading, and it swings a few degrees round the
 * marble in the direction of travel so a left-right sweep reads as motion.
 * Every axis is damped independently so it never jolts on a bounce.
 */
export class FollowCamera {
  private readonly focus = new THREE.Vector3();
  private readonly vel = { x: { velocity: 0 }, y: { velocity: 0 }, z: { velocity: 0 }, yaw: { velocity: 0 } };
  private yaw = 0;
  private initialised = false;
  private readonly target = new THREE.Vector3();

  /** When set, the camera looks here instead of following the marble (editor). */
  manualFocus: THREE.Vector3 | null = null;
  /** Extra distance while in manual mode (editor zoom). */
  manualDistance = 0;
  /** The camera never follows below this: at the end the marble falls out of the frame. */
  floorY: number | null = null;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  snapTo(position: THREE.Vector3): void {
    this.focus.copy(position);
    this.initialised = true;
    this.vel.x.velocity = this.vel.y.velocity = this.vel.z.velocity = this.vel.yaw.velocity = 0;
    this.yaw = 0;
    this.apply();
  }

  update(marblePos: THREE.Vector3, marbleVel: THREE.Vector3, dt: number): void {
    const c = config.camera;
    if (this.manualFocus) {
      this.focus.x = smoothDamp(this.focus.x, this.manualFocus.x, this.vel.x, 0.12, dt);
      this.focus.y = smoothDamp(this.focus.y, this.manualFocus.y, this.vel.y, 0.12, dt);
      this.yaw = smoothDamp(this.yaw, 0, this.vel.yaw, 0.3, dt);
      this.apply();
      return;
    }
    this.target.copy(marblePos).addScaledVector(marbleVel, c.lookAheadTime);
    const lead = Math.min(Math.max(marbleVel.x * c.sideLead, -c.sideLeadMax), c.sideLeadMax);
    this.target.x = (marblePos.x + lead) * c.xFollow;
    this.target.z = 0;
    if (this.floorY !== null && this.target.y < this.floorY) this.target.y = this.floorY;
    if (!this.initialised) {
      this.snapTo(this.target);
      return;
    }
    this.focus.x = smoothDamp(this.focus.x, this.target.x, this.vel.x, c.smoothTime, dt);
    this.focus.y = smoothDamp(this.focus.y, this.target.y, this.vel.y, c.smoothTime * 0.8, dt);
    this.focus.z = 0;
    const yawTarget = Math.min(Math.max(marbleVel.x * c.yawPerSpeed, -c.yawMaxDeg), c.yawMaxDeg) * DEG2RAD;
    this.yaw = smoothDamp(this.yaw, yawTarget, this.vel.yaw, c.smoothTime * 2.5, dt);
    this.apply();
  }

  currentFocus(target = new THREE.Vector3()): THREE.Vector3 {
    return target.copy(this.focus);
  }

  /** Configured distance, pushed back on narrow screens so the zigzag never leaves the frame. */
  private distance(): number {
    const c = config.camera;
    const halfW = Math.tan((this.camera.fov * DEG2RAD) / 2) * this.camera.aspect;
    return Math.max(c.distance, c.minVisibleWidth / 2 / halfW) + (this.manualFocus ? this.manualDistance : 0);
  }

  private apply(): void {
    const c = config.camera;
    const pitch = c.pitchDeg * DEG2RAD;
    const d = this.distance();
    // The frame centre is below the marble; the camera orbits that point, tilted
    // down the board and swung round by the yaw so it trails the marble's heading.
    const aimY = this.focus.y - (this.manualFocus ? 1.0 : c.aimBelow);
    const horizontal = Math.cos(pitch) * d;
    this.camera.position.set(this.focus.x + Math.sin(this.yaw) * horizontal, aimY + Math.sin(pitch) * d, Math.cos(this.yaw) * horizontal);
    this.camera.lookAt(this.focus.x, aimY, 0);
  }
}
