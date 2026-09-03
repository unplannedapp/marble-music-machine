import * as THREE from 'three';

export const DEG2RAD = Math.PI / 180;

export type Vec3Tuple = [number, number, number];

export function tupleToVector3(t: Vec3Tuple | undefined, fallback = new THREE.Vector3()): THREE.Vector3 {
  return t ? new THREE.Vector3(t[0], t[1], t[2]) : fallback.clone();
}

/** Euler in degrees (XYZ order) to quaternion. */
export function eulerDegToQuat(rot: Vec3Tuple | undefined): THREE.Quaternion {
  const q = new THREE.Quaternion();
  if (!rot) return q;
  q.setFromEuler(new THREE.Euler(rot[0] * DEG2RAD, rot[1] * DEG2RAD, rot[2] * DEG2RAD, 'XYZ'));
  return q;
}

/**
 * Critically-damped smoothing toward a target (Unity-style SmoothDamp).
 * Returns the new value and updates `state.velocity` in place.
 */
export function smoothDamp(
  current: number,
  target: number,
  state: { velocity: number },
  smoothTime: number,
  dt: number,
  maxSpeed = Infinity,
): number {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const originalTo = target;
  const maxChange = maxSpeed * smoothTime;
  change = Math.min(Math.max(change, -maxChange), maxChange);
  target = current - change;
  const temp = (state.velocity + omega * change) * dt;
  state.velocity = (state.velocity - omega * temp) * exp;
  let output = target + (change + temp) * exp;
  if (originalTo - current > 0 === output > originalTo) {
    output = originalTo;
    state.velocity = (output - originalTo) / dt;
  }
  return output;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
