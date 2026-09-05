/** Shared by the layout tools: pick the pad/bumper normal that sends the marble where we want it. */
export const DEG = Math.PI / 180;

/** Reflect direction d (unit) about normal n with restitution e, plus an outward kick (units/s) at speed. */
export function bounce(d: [number, number], n: [number, number], e: number, speed: number, kick: number): [number, number] {
  const dn = d[0] * n[0] + d[1] * n[1];
  const r = [(d[0] - (1 + e) * dn * n[0]) * speed + kick * n[0], (d[1] - (1 + e) * dn * n[1]) * speed + kick * n[1]];
  const len = Math.hypot(r[0], r[1]);
  return [r[0] / len, r[1] / len];
}

/** Normal angle (deg, measured from +Y toward -X like the pad angle) that sends d closest to o. */
export function solveNormal(d: [number, number], o: [number, number], e: number, speed: number, kick: number): number {
  let bestA = 0;
  let bestDot = -Infinity;
  for (let a = -89; a <= 89; a += 0.5) {
    const n: [number, number] = [-Math.sin(a * DEG), Math.cos(a * DEG)];
    if (d[0] * n[0] + d[1] * n[1] >= 0) continue;
    const r = bounce(d, n, e, speed, kick);
    const dot = r[0] * o[0] + r[1] * o[1];
    if (dot > bestDot) {
      bestDot = dot;
      bestA = a;
    }
  }
  return bestA;
}
