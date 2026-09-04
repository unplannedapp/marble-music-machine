/**
 * Central tunable configuration. Everything that affects "feel" lives here so it
 * can be exposed to the debug panel and, later, saved per level.
 *
 * Coordinate convention (the "board" frame):
 *   X  = across the board (right is +X)
 *   Y  = up the board (the marble travels toward -Y)
 *   Z  = out of the board, toward the camera (the backboard surface is at z = 0)
 *
 * The machine is a tilted table, like a pinball or pachinko board. World gravity is
 * rotated by `tiltDeg` so it has a component down the board (-Y) and a component
 * into the board (-Z) that keeps the marble pressed against the backboard.
 * tilt = 90 is a vertical wall, tilt = 0 is a flat table.
 */
export interface MaterialProps {
  friction: number;
  restitution: number;
  /** 'max' lets a lively object impose its bounce on the marble; 'average' blends with the marble's. */
  bounceRule?: 'max' | 'average';
}

/**
 * Pace. The machine is tuned as a time-scaled system: gravity sets how fast
 * everything happens, and every per-second quantity (damping, springs, kicks)
 * is scaled with sqrt(gravity / 9.81) so the marble follows the same paths at
 * any pace. 28 gives roughly two pad hits per second, like the references.
 */
const GRAVITY = 28;
const PACE = Math.sqrt(GRAVITY / 9.81);

export const config = {
  physics: {
    gravity: GRAVITY,
    tiltDeg: 58,
    fixedDt: 1 / 120,
    maxSubSteps: 8,
    solverIterations: 8,
    timeScale: 1,
  },
  marble: {
    radius: 0.3,
    density: 2.4,
    friction: 0.55,
    restitution: 0.32,
    linearDamping: 0.02 * PACE,
    /** Rapier has no rolling resistance; angular damping stands in for it. */
    angularDamping: 0.15 * PACE,
  },
  materials: {
    board: { friction: 0.12, restitution: 0.05, bounceRule: 'average' } as MaterialProps,
    rail: { friction: 0.3, restitution: 0.1, bounceRule: 'average' } as MaterialProps,
    pad: { friction: 0.25, restitution: 0.55, bounceRule: 'max' } as MaterialProps,
    bumper: { friction: 0.15, restitution: 0.6, bounceRule: 'max' } as MaterialProps,
    ramp: { friction: 0.35, restitution: 0.25, bounceRule: 'average' } as MaterialProps,
    wall: { friction: 0.3, restitution: 0.4, bounceRule: 'average' } as MaterialProps,
  },
  bumper: {
    /** Extra outward speed (units/s) added on impact, pinball pop-bumper style. */
    kick: 1.5 * PACE,
  },
  pad: {
    density: 20.0,
    /** Spring that returns the pad to its rest angle (acceleration-based motor). */
    stiffness: 150 * PACE * PACE,
    damping: 6 * PACE,
    angularDamping: 0.5 * PACE,
  },
  camera: {
    distance: 14,
    pitchDeg: 16,
    lookAheadTime: 0.3,
    smoothTime: 0.28,
    /** How much the camera follows the marble sideways (0 = locked to board center). */
    xFollow: 0.85,
    fov: 42,
    /** Board width that must stay visible; on a narrow portrait screen the camera pulls back to keep it. */
    minVisibleWidth: 7.5,
  },
  audio: {
    volume: 0.8,
    muted: false,
    /** Reverb send level. */
    reverb: 0.22,
    /** Notes are scheduled this far ahead of the simulation clock, for jitter-free timing. */
    leadSeconds: 0.06,
    /** Impact speed that counts as a full-velocity strike. */
    referenceImpact: 11,
    /** Level of the continuous rolling sound on rails. */
    rolling: 0.5,
  },
  scoring: {
    /** Timing windows in seconds (absolute delta from the song's expected time). */
    windows: { perfect: 0.04, exact: 0.08, good: 0.15, earlyLate: 0.35 },
    base: 100,
    timingBonus: { PERFECT: 100, EXACT: 80, GOOD: 50, EARLY: 20, LATE: 20, MISS: 0 } as Record<string, number>,
    /** Extra points at full velocity. */
    velocityBonus: 50,
    /** Each combo step adds this fraction to the multiplier (combo 10 = x2). */
    comboStep: 0.1,
    /** A target is missed once the marble is this far below it. */
    missDistance: 2.5,
  },
  debug: {
    showColliders: false,
  },
};

export type Config = typeof config;
