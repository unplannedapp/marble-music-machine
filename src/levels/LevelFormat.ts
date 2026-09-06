import type { LevelDef, ObjectDef } from './LevelTypes';
import type { Vec3Tuple } from '../core/math';

/**
 * JSON level format: the save/load format for authored levels and the editor.
 * `parseLevel` validates untrusted input and throws a readable error, so a bad
 * file fails loudly instead of building half a machine.
 */
export const LEVEL_FORMAT_VERSION = 1;

export interface LevelFile extends LevelDef {
  format: number;
}

export interface Checkpoint {
  /** Song section this checkpoint starts. */
  section: number;
  position: Vec3Tuple;
  velocity: Vec3Tuple;
  /** Angular velocity; restoring it keeps the replay faithful to the baked run. */
  spin?: Vec3Tuple;
}

function isVec3(v: unknown): v is Vec3Tuple {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function fail(path: string, msg: string): never {
  throw new Error(`Level ${path}: ${msg}`);
}

const OBJECT_TYPES = new Set(['rail', 'ramp', 'wall', 'bumper', 'pad', 'pipe', 'spinner', 'launcher', 'bowl', 'seesaw']);

function checkObject(o: unknown, i: number): ObjectDef {
  const path = `objects[${i}]`;
  if (!o || typeof o !== 'object') fail(path, 'must be an object');
  const d = o as Record<string, unknown>;
  if (typeof d.type !== 'string' || !OBJECT_TYPES.has(d.type)) fail(path, `unknown type "${String(d.type)}"`);
  if (d.id !== undefined && typeof d.id !== 'string') fail(path, 'id must be a string');
  if (d.type === 'rail' || d.type === 'pipe') {
    if (!Array.isArray(d.points) || d.points.length < 2 || !d.points.every(isVec3)) fail(path, `${d.type} needs at least two [x, y, z] points`);
  } else {
    if (!isVec3(d.position)) fail(path, 'needs a [x, y, z] position');
  }
  if ((d.type === 'ramp' || d.type === 'wall') && !isVec3(d.size)) fail(path, `${d.type} needs a [w, h, d] size`);
  if (d.rotation !== undefined && !isVec3(d.rotation)) fail(path, 'rotation must be [x, y, z] degrees');
  return o as ObjectDef;
}

export function parseLevel(input: unknown): LevelFile {
  if (!input || typeof input !== 'object') fail('', 'must be a JSON object');
  const l = input as Record<string, unknown>;
  if (l.format !== LEVEL_FORMAT_VERSION) fail('format', `expected ${LEVEL_FORMAT_VERSION}, got ${String(l.format)}`);
  if (typeof l.name !== 'string' || !l.name) fail('name', 'required');
  const board = l.board as Record<string, unknown> | undefined;
  if (!board || typeof board.width !== 'number' || typeof board.top !== 'number' || typeof board.bottom !== 'number') fail('board', 'needs width, top, bottom');
  if (board.bottom >= board.top) fail('board', 'bottom must be below top');
  const spawn = l.spawn as Record<string, unknown> | undefined;
  if (!spawn || !isVec3(spawn.position)) fail('spawn', 'needs a [x, y, z] position');
  if (spawn.velocity !== undefined && !isVec3(spawn.velocity)) fail('spawn', 'velocity must be [x, y, z]');
  if (typeof l.killY !== 'number') fail('killY', 'required');
  if (l.finishY !== undefined && typeof l.finishY !== 'number') fail('finishY', 'must be a number');
  delete l.finish; // pre-abyss levels had a finish tray; the marble now just leaves the machine
  if (l.environment !== undefined) {
    const e = l.environment as Record<string, unknown>;
    if (typeof e.board !== 'string' || typeof e.background !== 'string') fail('environment', 'needs board and background colours');
  }
  if (!Array.isArray(l.objects)) fail('objects', 'must be an array');
  const ids = new Set<string>();
  l.objects.forEach((o, i) => {
    const d = checkObject(o, i);
    if (d.id) {
      if (ids.has(d.id)) fail(`objects[${i}]`, `duplicate id "${d.id}"`);
      ids.add(d.id);
    }
  });
  if (l.checkpoints !== undefined) {
    if (!Array.isArray(l.checkpoints)) fail('checkpoints', 'must be an array');
    l.checkpoints.forEach((c: Record<string, unknown>, i: number) => {
      if (typeof c.section !== 'number' || !isVec3(c.position) || !isVec3(c.velocity)) fail(`checkpoints[${i}]`, 'needs section, position, velocity');
      if (c.spin !== undefined && !isVec3(c.spin)) fail(`checkpoints[${i}]`, 'spin must be [x, y, z]');
      if (c.time !== undefined && typeof c.time !== 'number') fail(`checkpoints[${i}]`, 'time must be a number');
    });
  }
  return input as LevelFile;
}

/** Pretty JSON with numeric vectors kept on one line, so diffs stay readable. */
export function serializeLevel(level: LevelFile): string {
  const text = JSON.stringify(level, null, 2);
  return text.replace(/\[\s*((?:-?\d+(?:\.\d+)?(?:e-?\d+)?,?\s*)+)\]/g, (m, inner: string) => {
    if (!/^[\d\s.,e-]+$/.test(inner)) return m;
    return '[' + inner.trim().split(/\s*,\s*/).join(', ') + ']';
  }) + '\n';
}
