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
  /**
   * Height of the lead-in. When the feeder already carries the marble up toward
   * the camera (a V-groove rail can), the loop needs no lift of its own: the
   * lead-in stays high, the circle descends to rail height before the
   * crossing, and the exit is low. Default: lifted by `rise`.
   */
  entryZ?: number;
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
  const high = o.entryZ !== undefined;
  const entryZ = o.entryZ ?? railZ;
  // Straight lead-in starting well behind the entry so a marble arriving there
  // lands on the side of the floor rod, never on its end.
  for (const f of [-0.18, 0, 0.5, 0.97]) pts.push([r2(entry[0] + g.d[0] * g.lead * f), r2(entry[1] + g.d[1] * g.lead * f), r2(entryZ)]);
  // The circle. Fed low, the path lifts toward the camera over the top and down
  // the far side, where the marble is slowest, so the second pass crosses above
  // the entry. Fed high (a climbing feeder), it stays high past its right side
  // (the lead-out runs under it) and eases down over the top instead.
  for (let th = g.thetaT; th <= EXIT_ANGLE + 1e-6; th += CIRCLE_STEP) {
    let z: number;
    if (high) {
      const u = Math.min(1, Math.max(0, (th - g.thetaT - 140) / 190));
      z = entryZ - (entryZ - railZ) * (u * u * (3 - 2 * u));
    } else {
      const u = Math.min(1, Math.max(0, (th - g.thetaT - 100) / 220));
      z = railZ + rise * (u * u * (3 - 2 * u));
    }
    pts.push([r2(g.cx + g.radius * Math.cos(th * DEG) * dir), r2(g.cy + g.radius * Math.sin(th * DEG)), r2(z)]);
  }
  // Lead-out: a gentle ski-jump, high when the loop lifted, low when it came down.
  const outZ = high ? railZ : zTop;
  const edge = g.cx + dir * (g.radius + 0.3);
  pts.push([r2(edge), r2(g.ey + 0.2), r2(outZ)]);
  pts.push([r2(edge + dir * 1.2), r2(g.ey + 0.15), r2(outZ)]);
  pts.push([r2(edge + dir * 2.3), r2(g.ey - 0.25), r2(outZ)]);
  pts.push([r2(edge + dir * 3.3), r2(g.ey - 0.95), r2(outZ)]);
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

// ---- the rail family ---------------------------------------------------------

export type RailShape = 'short' | 'long' | 'longer' | 'arc' | 'bend' | 's';
export const RAIL_SHAPES: RailShape[] = ['short', 'long', 'longer', 'arc', 'bend', 's'];

export interface RailShapeOptions {
  /** Length of the rolling part, board units. Each shape has its own default. */
  len?: number;
  /** Descent of a straight run below horizontal, degrees. Default 14: gravity is strong here and long rails must stay slow. */
  slope?: number;
  /** Arc only: heading below horizontal where the marble lands, degrees, at most 45 (match its descent so it rolls in). Default 45. */
  entry?: number;
}

const RAIL_DEFAULT_LEN: Record<RailShape, number> = { short: 2.6, long: 5, longer: 8, arc: 5, bend: 6, s: 8 };

/** Default rolling length of a shape. */
export function railShapeLength(shape: RailShape): number {
  return RAIL_DEFAULT_LEN[shape];
}

/**
 * Points for one of the family of rails the machines are built from. `start`
 * is where the marble lands; the rail begins a little upstream with a steep
 * lip (a marble arriving the wrong way stops and rolls back), then runs
 * downhill `len` units in direction `dir`:
 *
 *   short / long / longer  straight runs at a shallow slope; the marble crosses the board and drops off the end
 *   arc                    a scoop: steep where the marble lands, curving out to shallow, so a falling marble is
 *                          gathered and sent across (the bend faces up, gravity presses the marble into it)
 *   bend                   a gentle sweep that steepens as it goes; gentle because a bend that faces down can
 *                          only be followed while v^2/R stays under gravity
 *   s                      a snake: shallow, steeper, shallow again while still travelling `dir`
 *
 * A V-groove holds the marble only by the part of gravity across the path, so
 * no shape here goes near vertical or turns back (that is what a loop track,
 * pipe or pad is for). The heading is integrated along the length, giving a
 * smooth Catmull-Rom path the marble follows in its groove.
 */
export function railShapePoints(shape: RailShape, start: [number, number], dir: 1 | -1, o: RailShapeOptions = {}): Vec3Tuple[] {
  const len = o.len ?? RAIL_DEFAULT_LEN[shape];
  const slope = (o.slope ?? 14) * DEG;
  const r2 = (n: number) => +n.toFixed(2);
  const [x0, y0] = start;
  const entry = Math.min(45, Math.max(20, o.entry ?? 45)) * DEG; // steeper than 45 and a V-groove no longer holds a fast marble
  // A scoop has no hump at its mouth: it extends straight back along the
  // marble's own line of arrival, so a fast marble rolls in instead of being
  // kicked. Other shapes start with a steep lip.
  const pts: Vec3Tuple[] =
    shape === 'arc'
      ? [
          [r2(x0 - 0.9 * dir * Math.cos(entry)), r2(y0 + 0.9 * Math.sin(entry)), 0],
          [r2(x0 - 0.4 * dir * Math.cos(entry)), r2(y0 + 0.4 * Math.sin(entry)), 0],
        ]
      : [
          // A modest lip: enough to gather a marble that lands a little short,
          // low enough that a marble bouncing off the pad before never meets it.
          [r2(x0 - 0.8 * dir), r2(y0 + 0.42), 0],
          [r2(x0 - 0.4 * dir), r2(y0 + 0.16), 0],
        ];
  // Heading below horizontal as a function of progress u in [0, 1].
  const ease = (u: number) => u * u * (3 - 2 * u);
  const heading = (u: number): number => {
    switch (shape) {
      case 'arc':
        return entry - (entry - 12 * DEG) * ease(u);
      case 'bend':
        return (12 + 24 * u) * DEG;
      case 's':
        // Never shallower than 18: on 12 a slow marble can stall in the groove.
        return (30 - 12 * Math.cos(u * Math.PI * 2)) * DEG;
      default:
        return slope;
    }
  };
  const n = Math.max(3, Math.round(len / (shape === 'short' || shape === 'long' || shape === 'longer' ? 1.5 : 0.8)));
  let x = shape === 'arc' ? x0 : x0 + 0.1 * dir;
  let y = y0;
  pts.push([r2(x), r2(y), 0]);
  const ds = len / n;
  for (let i = 0; i < n; i++) {
    const h = heading((i + 0.5) / n);
    x += dir * Math.cos(h) * ds;
    y -= Math.sin(h) * ds;
    pts.push([r2(x), r2(y), 0]);
  }
  return pts;
}

/** A rail of the family as a level object. */
export function railShape(id: string, shape: RailShape, start: [number, number], dir: 1 | -1, o: RailShapeOptions = {}): RailDef {
  return { type: 'rail', id, points: railShapePoints(shape, start, dir, o) };
}
