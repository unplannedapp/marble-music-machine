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
  /**
   * Which way the groove faces. 'gravity' (default): the rods sit under the
   * marble. 'curve': the rods sit on the outside of every bend, so the marble is
   * held by its own momentum through a loop-the-loop; straight stretches fall
   * back to gravity.
   */
  groove?: 'gravity' | 'curve';
  /** Ribbon track facet length (curve groove only). Default 0.08. */
  sampleSpacing?: number;
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

export interface PipeDef extends BaseObjectDef {
  type: 'pipe';
  /** Path of the pipe's centreline in board coordinates (z = 0 means the default pipe height). */
  points: Vec3Tuple[];
  /** Inner radius. Default 1.7 * marble radius. */
  radius?: number;
  color?: string;
}

export interface SpinnerDef extends BaseObjectDef {
  type: 'spinner';
  position: Vec3Tuple;
  /** Blade length from the axle. Default 1.1. */
  radius?: number;
  /** Number of blades. Default 4. */
  blades?: number;
  /** Turns per minute; positive is counter-clockwise as the player sees it. Default 40. */
  rpm?: number;
  /** Blade angle at time zero, degrees. The wheel is a pure function of sim time. */
  phase?: number;
  color?: string;
}

export type ObjectDef = RailDef | RampDef | WallDef | BumperDef | PadDef | PipeDef | SpinnerDef;

/**
 * The look of a machine: every song has its own world in the references, so the
 * environment travels with the level rather than living in the renderer.
 */
export interface EnvironmentDef {
  /** Backboard colour. */
  board: string;
  /** Sky / clear colour behind the board. */
  background: string;
  /** Key light colour and strength. */
  keyLight?: string;
  keyIntensity?: number;
  /** Fill light (sky) colour. */
  fill?: string;
  /** Rail and post metal colour. */
  metal?: string;
  /** Default colour of untinted wooden pieces (ramps, walls). */
  wood?: string;
  /** Marble tint. */
  marble?: string;
  /** Target ring colour. */
  ring?: string;
  /** Cool rim light colour and strength. */
  rim?: string;
  rimIntensity?: number;
  /** Sky fill strength. */
  fillIntensity?: number;
  /** Colour of the warm light that rides with the marble. */
  marbleLight?: string;
  /** Strength of the reflected room (image-based lighting). */
  envIntensity?: number;
  exposure?: number;
  /** Edge darkening, 0 to 1. */
  vignette?: number;
  /** Pad paint glow (emissive scale) so neon worlds light up. */
  padGlow?: number;
  /** Strength of the coloured light lit pads spill onto the wall (0 = none). */
  padLight?: number;
  /** Strength of the slanted light shafts and dust that hang in the room (0 = none). */
  shaft?: number;
  /** Colour of the shafts; defaults to the key light colour. */
  shaftColor?: string;
  /** How far the shafts lean from vertical, degrees. */
  shaftAngle?: number;
  /** How grazing the key light is: 0 overhead, 1 along the wall. */
  keyRake?: number;
  /** Depth of the wall's plaster grain. */
  boardGrain?: number;
}

export interface LevelDef {
  name: string;
  environment?: EnvironmentDef;
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
  /**
   * Where the machine ends. The camera holds here and the marble falls out of
   * the frame into the dark; the run is complete once it is well below. Defaults
   * to a little under the lowest object.
   */
  finishY?: number;
  objects: ObjectDef[];
  /**
   * Where a lost marble restarts, one per song section, baked from the
   * deterministic run (scripts/bake.ts).
   */
  checkpoints?: { section: number; position: Vec3Tuple; velocity: Vec3Tuple; spin?: Vec3Tuple; time?: number }[];
}
