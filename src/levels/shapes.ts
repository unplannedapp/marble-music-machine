import type { RailDef } from './LevelTypes';
import type { Vec3Tuple } from '../core/math';

const DEG = Math.PI / 180;
const EXIT_ANGLE = 280; // where the marble leaves the circle: just past the bottom, nosing up
const CIRCLE_STEP = 12;

export interface LoopOptions {
  /** Circle radius. Default 0.9. */
  radius?: number;
  /** How far the path lifts toward the camera over one turn, so the exit crosses above the entry. */
  rise?: number;
  /** Marble height on the track; the ribbon track rides low (marble leaning on the board). */
  railZ?: number;
  /** Descent angle of the lead-in below horizontal, degrees. Match the marble's arrival. */
  angle?: number;
  /** Length of the straight lead-in. */
  lead?: number;
}

function geometry(entry: [number, number], dir: 1 | -1, o: LoopOptions) {
  const radius = o.radius ?? 0.9;
  const angle = o.angle ?? 45;
  const lead = o.lead ?? 5;
  const a = angle * DEG;
  const d = [dir * Math.cos(a), -Math.sin(a)];
  const tx = entry[0] + d[0] * lead;
  const ty = entry[1] + d[1] * lead;
  // Tangent point: the angle on the circle whose (counter-clockwise, mirrored by dir) tangent is the descent direction.
  const thetaT = -(90 + angle);
  const cx = tx - radius * Math.cos(thetaT * DEG) * dir;
  const cy = ty - radius * Math.sin(thetaT * DEG);
  const ex = cx + radius * Math.cos(EXIT_ANGLE * DEG) * dir;
  const ey = cy + radius * Math.sin(EXIT_ANGLE * DEG);
  return { radius, angle, lead, d, tx, ty, thetaT, cx, cy, ex, ey };
}

/**
 * A loop-the-loop made of rail. A straight lead-in descends at `angle` and
 * meets the circle exactly where the circle's tangent has that slope, so there
 * is no kink; the marble sweeps round on the outside of the groove
 * (groove: 'curve'), passes over its own entry with the path lifted toward the
 * camera, and leaves just past the bottom on a gentle ski-jump that settles
 * back to rail height. No lip: on steep rail a lip lets the marble slip behind.
 * `dir` is +1 for a loop travelled left-to-right, -1 for right-to-left.
 */
export function loopRail(id: string, entry: [number, number], dir: 1 | -1, o: LoopOptions = {}): RailDef {
  const g = geometry(entry, dir, o);
  const rise = o.rise ?? 0.9;
  const railZ = o.railZ ?? 0.32;
  const zTop = railZ + rise;
  const r2 = (n: number) => +n.toFixed(3);
  const pts: Vec3Tuple[] = [];
  // Straight lead-in at rail height: the marble arrives fast, and any lift at
  // speed costs energy in bounces off the tube walls.
  for (const f of [0, 0.5, 0.97]) pts.push([r2(entry[0] + g.d[0] * g.lead * f), r2(entry[1] + g.d[1] * g.lead * f), r2(railZ)]);
  // The circle. The lift toward the camera happens over the top and down the far
  // side, where the marble is slowest, so that the second pass crosses above the
  // entry lead-in.
  for (let th = g.thetaT; th <= EXIT_ANGLE + 1e-6; th += CIRCLE_STEP) {
    const u = Math.min(1, Math.max(0, (th - g.thetaT - 100) / 220));
    const z = railZ + rise * (u * u * (3 - 2 * u));
    pts.push([r2(g.cx + g.radius * Math.cos(th * DEG) * dir), r2(g.cy + g.radius * Math.sin(th * DEG)), r2(z)]);
  }
  // Lead-out stays lifted; the marble leaves the end and the tilt brings it back to the board.
  const edge = g.cx + dir * (g.radius + 0.3);
  pts.push([r2(edge), r2(g.ey + 0.2), r2(zTop)]);
  pts.push([r2(edge + dir * 1.2), r2(g.ey + 0.15), r2(zTop)]);
  pts.push([r2(edge + dir * 2.3), r2(g.ey - 0.25), r2(zTop)]);
  pts.push([r2(edge + dir * 3.3), r2(g.ey - 0.95), r2(zTop)]);
  return { type: 'rail', id, points: pts, groove: 'curve', lipDeg: 0 };
}

/** Where a loop built by `loopRail` lets go of the marble. */
export function loopExit(entry: [number, number], dir: 1 | -1, o: LoopOptions = {}): { x: number; y: number } {
  const g = geometry(entry, dir, o);
  return { x: g.cx + dir * (g.radius + 0.3 + 3.3), y: g.ey - 0.95 };
}

/** Top of the loop. */
export function loopTop(entry: [number, number], o: LoopOptions = {}): number {
  const g = geometry(entry, 1, o);
  return g.cy + g.radius;
}

/** Horizontal extent of the whole figure from the entry, so a layout can keep it clear of the walls. */
export function loopSpan(o: LoopOptions = {}): number {
  const g = geometry([0, 0], 1, o);
  return Math.abs(g.cx) + g.radius + 3.6;
}
