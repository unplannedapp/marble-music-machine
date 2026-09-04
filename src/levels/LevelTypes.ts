import type { Vec3Tuple } from '../core/math';

/**
 * Data-driven level description. Everything the runtime builds comes from these
 * plain objects, so the same format serves authored levels, the future level
 * editor, and headless simulation tests.
 */
export interface BaseObjectDef {
  id?: string;
  type: string;
  /** Instrument this object plays when struck. Each type has a default; 'none' silences it. */
  instrument?: string;
  /** Note name such as "C4" for pitched instruments. */
  note?: string;
}

export interface RailDef extends BaseObjectDef {
  type: 'rail';
  /** Path of the marble's centre along the rail, in board coordinates. z = 0 means the default rail height. */
  points: Vec3Tuple[];
  /** Distance between the two rods. Default 1.4 * marble radius. */
  gauge?: number;
  rodRadius?: number;
  /** How far the rod pair swings forward, raising the front rod into a lip. Default 20. */
  lipDeg?: number;
}

export interface RampDef extends BaseObjectDef {
  type: 'ramp';
  position: Vec3Tuple;
  /** Euler rotation in degrees (XYZ). */
  rotation?: Vec3Tuple;
  /** Full size [width, height, depth]. */
  size: Vec3Tuple;
  color?: string;
}

export interface WallDef extends BaseObjectDef {
  type: 'wall';
  position: Vec3Tuple;
  rotation?: Vec3Tuple;
  size: Vec3Tuple;
  color?: string;
}

export interface BumperDef extends BaseObjectDef {
  type: 'bumper';
  position: Vec3Tuple;
  radius?: number;
  height?: number;
  /** Outward speed added on impact. Falls back to config.bumper.kick. */
  kick?: number;
  color?: string;
}

export interface PadDef extends BaseObjectDef {
  type: 'pad';
  position: Vec3Tuple;
  /** Rest angle about the board normal (Z), degrees. Positive raises the right end, so a falling marble is deflected left. */
  angle?: number;
  /** Full size [length, thickness, depth]. */
  size?: Vec3Tuple;
  color?: string;
  stiffness?: number;
  damping?: number;
}

export type ObjectDef = RailDef | RampDef | WallDef | BumperDef | PadDef;

export interface LevelDef {
  name: string;
  board: {
    /** Extents of the backboard in board coordinates. */
    width: number;
    top: number;
    bottom: number;
    color?: string;
    /**
     * Distance from the backboard to an invisible front pane, like the glass on
     * a pinball or pachinko machine. Keeps the marble on the board without
     * touching its in-plane motion. Default 1.5.
     */
    glass?: number;
  };
  spawn: {
    position: Vec3Tuple;
    velocity?: Vec3Tuple;
  };
  /** Marble is reset when its Y drops below this (a safety net; a good level never needs it). */
  killY: number;
  /** Where the run ends: once the marble comes to rest inside this circle, the run is complete. */
  finish?: { position: Vec3Tuple; radius: number };
  objects: ObjectDef[];
}
