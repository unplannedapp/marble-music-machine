/**
 * Level authoring helper: realises a "plan" of pads and bumpers on the marble's
 * real, simulated trajectory. Because the simulation is deterministic every new
 * object is validated by replaying the run from the start.
 *
 * Usage: npx vite-node scripts/layout.ts <level.json> '<steps json>' [prefix] [afterT]
 *   Placed objects are written into the level file, replacing objects whose id starts
 *   with the prefix (in the same place in the object list).
 *   steps: [{ k: 'pad'|'bumper', y?: number, drop?: number, dir: -1|1, exit?: number, note?, color? }]
 *     y     absolute Y where the object meets the marble (first step), or
 *     drop  Y below the previous object's meeting point
 *     dir   -1 sends the marble left, 1 right, 0 reverses whichever way it is actually moving,
 *           'auto' sweeps it across the board and back (a rail runs the marble's own way)
 *   A 'rail' step lays one of the rail family (shape: short|long|longer|arc|bend|s,
 *   optional len and slope) where the marble lands, carrying it toward the centre
 *   (or the way `dir` says); with `time` the length is searched so the marble rolls
 *   on it for that many seconds, which is how a rest in the music becomes a rail.
 *   A 'ramp' step is a short tilted shelf. Both re-gather the marble so small
 *   deviations do not accumulate, and their lower end is the next drop origin.
 *     exit  outgoing elevation in degrees above horizontal (default 15)
 *     time  (pad) seconds after the previous pad's strike; the drop is searched for it
 *     silent (pad) a hop that plays no note: fills a gap too long for one hop
 *   prefix  id prefix; existing objects with this prefix are replaced (default "auto_")
 *   afterT  only consider the trajectory after this simulation time
 */
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import type { BumperDef, LevelDef, ObjectDef, PadDef, RailDef, RampDef, PipeDef, SpinnerDef, LauncherDef, BowlDef, SeesawDef } from '../src/levels/LevelTypes';
import type { LevelFile } from '../src/levels/LevelFormat';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseLevel, serializeLevel } from '../src/levels/LevelFormat';
import { DEG, solveNormal } from './lib/aim';
import { loopRail, loopExit, loopTop, loopSpan, railShape, railShapeLength, type RailShape } from '../src/levels/shapes';

const levelPath = process.argv[2];
if (!levelPath) throw new Error('usage: layout.ts <level.json> <steps json> [prefix] [afterT]');
const playground = parseLevel(JSON.parse(readFileSync(levelPath, 'utf8')));

interface Step { silent?: boolean; k: 'pad' | 'bumper' | 'rail' | 'ramp' | 'pipe' | 'spinner' | 'loop' | 'launcher' | 'bowl' | 'seesaw'; hold?: number; y?: number; drop?: number; dir: -1 | 0 | 1 | 'auto'; exit?: number; note?: string; color?: string; rpm?: number; radius?: number; blades?: number; shape?: RailShape; len?: number; slope?: number; time?: number }
const steps: Step[] = JSON.parse(process.argv[3] ?? '[]');
const prefix = process.argv[4] ?? 'auto_';
let afterT = Number(process.argv[5] ?? 0);
const padHalfThick = 0.14;
const bumperRadius = Number(process.env.BUMPER_R ?? 0.45);

await initRapier();

interface State { x: number; y: number; vx: number; vy: number; t: number; z: number; vz: number; spin: [number, number, number] }

function simulate(level: LevelDef, yTarget: number, after: number): { state: State | null; hits: string[] } {
  const sim = new Simulation();
  sim.load(level);
  const hits: string[] = [];
  sim.bus.on('marble:contact', (e) => hits.push(`${e.object.id}@${e.simTime.toFixed(2)}(${e.impactSpeed.toFixed(1)})`));
  let resets = 0;
  sim.bus.on('marble:reset', (e) => {
    resets++;
    hits.push(`RESET(${e.reason})@${e.simTime.toFixed(2)}`);
  });
  let out: State | null = null;
  const dt = config.physics.fixedDt;
  for (let t = 0; t < 120; t += dt) {
    sim.fixedUpdate(dt);
    if (resets > 0) break; // a second pass of the marble is never the state we want
    const p = sim.marble.body.translation();
    const v = sim.marble.body.linvel();
    if (out === null && t > after && p.y <= yTarget && v.y < 0) {
      const w = sim.marble.body.angvel();
      out = { x: p.x, y: p.y, vx: v.x, vy: v.y, t, z: p.z, vz: v.z, spin: [w.x, w.y, w.z] };
      break;
    }
  }
  sim.dispose();
  return { state: out, hits };
}

/** Run until the marble has met `id`, then a little longer: where did the mechanism send it? */
function flight(level: LevelDef, id: string, after: number, settle = 0.9): { x: number; y: number; vx: number; vy: number; t: number; top: number; climb: number; bad: boolean } | null {
  const sim = new Simulation();
  sim.load(level);
  let hitAt = -1;
  let bad = false;
  let done = false;
  sim.bus.on('marble:contact', (e) => {
    if (e.object.id === id && hitAt < 0 && e.simTime > after) hitAt = e.simTime;
    if (hitAt >= 0 && e.object.id.startsWith('wall_')) bad = true;
  });
  // Falling out of the machine after the mechanism is a success that ended early
  // (the finish line sits under the lowest object); losing the marble is not.
  sim.bus.on('marble:reset', (e) => {
    if (e.reason === 'finished' && hitAt >= 0) done = true;
    else bad = true;
  });
  const dt = config.physics.fixedDt;
  let top = -Infinity;
  let lowest = Infinity;
  let climb = -Infinity; // highest point reached after having been at least 1.2 below it (a loop's rise)
  let last: ReturnType<typeof flight> = null;
  for (let t = 0; t < 120; t += dt) {
    sim.fixedUpdate(dt);
    if (bad || done) break;
    const p = sim.marble.body.translation();
    const v = sim.marble.body.linvel();
    if (hitAt >= 0) {
      top = Math.max(top, p.y);
      lowest = Math.min(lowest, p.y);
      if (p.y > lowest + 1.2) climb = Math.max(climb, p.y);
      last = { x: p.x, y: p.y, vx: v.x, vy: v.y, t, top, climb, bad: false };
      if (t >= hitAt + settle) break;
    }
  }
  sim.dispose();
  if (bad || !last) return null;
  return last;
}

/**
 * Run until the marble has landed on `id` and left it: when and where did it let
 * go? A full replay from the spawn, like every other step: the run only stays
 * consistent while objects are added because the start is steady (a straight
 * start rail with the marble seated in it; see template.ts).
 */
function railRide(level: LevelDef, id: string, after: number): { x: number; y: number; vx: number; vy: number; t: number; landed: number } | null {
  const sim = new Simulation();
  sim.load(level);
  const rail = sim.objects.find((o) => o.id === id);
  if (!rail) return null;
  let landed = -1;
  let bad = false;
  sim.bus.on('marble:contact', (e) => {
    if (landed >= 0 && e.object.id.startsWith('wall_')) {
      bad = true;
      if (process.env.RAIL_DEBUG) console.log(`      wall at t=${e.simTime.toFixed(2)}`);
    }
  });
  // Dropping past the finish line after the rail is fine (the finish sits
  // under the lowest object placed so far); losing the marble is not.
  let done = false;
  sim.bus.on('marble:reset', (e) => {
    if (e.reason === 'finished' && landed >= 0) done = true;
    else {
      bad = true;
      if (process.env.RAIL_DEBUG) console.log(`      reset ${e.reason} at t=${e.simTime.toFixed(2)} (landed ${landed >= 0 ? landed.toFixed(2) : 'never'})`);
    }
  });
  const dt = config.physics.fixedDt;
  let last: ReturnType<typeof railRide> = null;
  let lastTouch = -1;
  for (let i = 0; i < 30 / dt; i++) {
    sim.fixedUpdate(dt);
    const t = sim.simTime;
    if (bad || done) break;
    const touching = sim.physics.isTouching(rail);
    if (touching && t > after) {
      if (landed < 0) landed = t;
      lastTouch = t;
      const p = sim.marble.body.translation();
      const v = sim.marble.body.linvel();
      last = { x: p.x, y: p.y, vx: v.x, vy: v.y, t, landed };
    }
    // Gone for good: a quarter second clear of the rail after having ridden it.
    if (landed >= 0 && !touching && t - lastTouch > 0.25) break;
  }
  sim.dispose();
  if (bad || !last) return null;
  // Do not count a marble that merely grazed the lip and never rolled.
  if (last.t - last.landed < 0.08) return null;
  return last;
}

const base: LevelFile = JSON.parse(JSON.stringify(playground));
// Keep the level's object order: placed objects go where the replaced ones were.
// Insertion order affects the solver, so the tool must simulate the same world
// the level will build.
const firstIdx = base.objects.findIndex((o) => o.id?.startsWith(prefix));
const insertAt = firstIdx >= 0 ? firstIdx : base.objects.length;
base.objects = base.objects.filter((o) => !o.id?.startsWith(prefix));
const withPlaced = (placedSoFar: ObjectDef[]): ObjectDef[] => [
  ...base.objects.slice(0, insertAt),
  ...placedSoFar,
  ...base.objects.slice(insertAt),
];
const placed: ObjectDef[] = [];
let stepsDone = 0;
/** Simulation second of the last pad's strike, for pads timed to the song. */
let lastStrikeT: number | undefined;
/** Where the song's clock says the last pad's strike should have been (a run of timed pads). */
let nominalT: number | undefined;
const colors = ['#d9534f', '#d99a4e', '#5bc0de', '#8e6bd6', '#5cb85c', '#e86fb0', '#f7f7f7', '#2f9e8f'];
const notes = ['C4', 'E4', 'G4', 'C5', 'A4', 'F4', 'D4', 'B4'];
let lastY = 0;
/** Per successful step: the drop origin and time the next step started from, and how many objects it placed. */
const records: { lastY: number; afterT: number; objects: number; strikeT?: number; nominalT?: number }[] = [];
let startK = 0;
/**
 * Which placed object the final world fails to strike in order, if any. Later
 * objects nudge the contact solver enough to shift an earlier bounce by a hair,
 * so the last pass replays the whole machine and re-lays from the first
 * object it misses.
 */
function firstMissed(): number {
  const { hits } = simulate({ ...base, objects: withPlaced(placed) }, -1000, 0);
  const station = (id: string) => id.replace(/_(plunger|feed|catch)$/, '');
  const order: string[] = [];
  const lastAt = new Map<string, number>();
  for (const h of hits) {
    const [rawId, rest] = h.split('@');
    const id = station(rawId);
    if (!id.startsWith(prefix)) continue;
    const at = Number.parseFloat(rest);
    // A pad struck twice, well apart, plays its note twice: that is a fault of
    // the object after it (the marble came back off it) or of the pad's own angle.
    const prev = lastAt.get(rawId);
    if (prev !== undefined && at - prev > 0.1 && placed.find((o) => o.id === rawId)?.type === 'pad') {
      const i = placed.findIndex((o) => o.id === rawId);
      console.log(`  ${rawId} is struck twice (${(at - prev).toFixed(2)}s apart)`);
      doubleStruck = i;
      return i;
    }
    lastAt.set(rawId, at);
    if (order[order.length - 1] !== id) order.push(id);
  }
  let cursor = 0;
  const seen = new Set<string>();
  for (let i = 0; i < placed.length; i++) {
    const want = station(placed[i].id!);
    if (order[cursor] === want) {
      seen.add(want);
      cursor++;
      continue;
    }
    // A station's parts may come in either order.
    if (i > 0 && station(placed[i - 1].id!) === want) continue;
    // The marble came back to something it had already played: the object
    // before this one sent it the wrong way, so that is the one to re-place.
    if (seen.has(order[cursor])) return Math.max(0, i - 1);
    return i;
  }
  return -1;
}
/**
 * In a correction pass, the objects from the previous pass that have not been
 * re-placed yet. They stay in the world so a re-placed object lands on the
 * path the finished machine actually has, except those that could stand in
 * the marble's way before the point being placed: the step's own old copy, the
 * next step's, and anything not clearly below the target height.
 */
let stale: ObjectDef[] = [];
let currentId = '';
let nextId = '';
let currentYTarget = -Infinity;
const topY = (o: ObjectDef): number => ('points' in o ? Math.max(...o.points.map((q) => q[1])) : o.position[1] + 1.2);
const world = (p: ObjectDef[]): ObjectDef[] =>
  withPlaced([
    ...p,
    ...stale.filter((o) => !p.some((q) => q.id === o.id) && !o.id!.startsWith(currentId) && !o.id!.startsWith(nextId) && topY(o) < currentYTarget - 1.0),
  ]);
const MAX_PASSES = 6;
let lastMissedId = '';
/** Index in `placed` of a pad the finished machine strikes twice, if that is the fault found. */
let doubleStruck = -1;
let cleanRetry = false;
for (let pass = 0; pass < MAX_PASSES; pass++) {
if (pass > 0) {
  let count = 0;
  for (let i = 0; i < startK; i++) count += records[i].objects;
  stale = cleanRetry ? [] : placed.slice(count);
  placed.length = count;
  records.length = startK;
  stepsDone = startK;
  lastY = startK > 0 ? records[startK - 1].lastY : 0;
  afterT = startK > 0 ? records[startK - 1].afterT : Number(process.argv[5] ?? 0);
  lastStrikeT = startK > 0 ? records[startK - 1].strikeT : undefined;
  nominalT = startK > 0 ? records[startK - 1].nominalT : undefined;
}
for (let k = startK; k < steps.length; k++) {
  const step = steps[k];
  if (step.k !== 'pad') lastStrikeT = nominalT = undefined;
  const placedBefore = placed.length;
  const record = () => records.push({ lastY, afterT, objects: placed.length - placedBefore, strikeT: lastStrikeT, nominalT });
  // 'auto': sweep across the board. Keep going the way the marble is moving
  // until it nears the side band, then turn it back; before a rail (which runs
  // the marble's own way) turn toward the side with the most room.
  const nextStep = steps[k + 1];
  const autoDir = (state: State): -1 | 1 => {
    const edge = base.board.width / 2 - 6; // a hop is ~4.3 wide: turn back before the next one reaches the wall
    const restAhead = (n: number) => steps[k + n] && steps[k + n].k === 'rail' && steps[k + n].time !== undefined;
    if (restAhead(1)) {
      // The rail will run the way this pad sends the marble: send it toward the
      // side with more room beyond where it lands (a hop is ~3.5 wide).
      const room = (d: -1 | 1) => base.board.width / 2 - 0.9 - d * (state.x + d * 3.5);
      return room(1) >= room(-1) ? 1 : -1;
    }
    // Two or three pads before a rest, head outward (a pad may sit closer to the
    // wall than the sweep band) so the pad before it can send the marble back
    // across the whole board.
    if ((restAhead(2) || restAhead(3)) && Math.abs(state.x) < base.board.width / 2 - 5.5) return state.x > 0 ? 1 : -1;
    if (restAhead(2) || restAhead(3)) return state.x > 0 ? -1 : 1;
    if (state.x > edge) return -1;
    if (state.x < -edge) return 1;
    return state.vx < 0 ? -1 : 1;
  };
  /**
   * A pad with `time` is placed so its strike comes that many seconds after the
   * previous pad's: the drop below the last pad is searched (a longer fall and
   * a higher lob take longer), on the real path. Only between two pads: after a
   * rest the song re-synchronises on the strike anyway.
   */
  if (step.k === 'pad' && step.time !== undefined && lastStrikeT !== undefined) {
    // Aim at the song's own clock, not the last strike: a run of pads then never
    // drifts, each small error being taken up by the next.
    if (nominalT === undefined) nominalT = lastStrikeT;
    const nominalNext = nominalT + step.time;
    const want = nominalNext - lastStrikeT;
    nominalT = nominalNext;
    const id = `${prefix}${k + 1}`;
    const measure = (drop: number): number | null => {
      const r = simulate({ ...base, objects: world(placed) }, lastY - drop, afterT);
      if (!r.state) return null;
      const st = r.state;
      const sp = Math.hypot(st.vx, st.vy);
      const dd: [number, number] = [st.vx / sp, st.vy / sp];
      const dr = (step.dir as unknown) === 'auto' ? autoDir(st) : step.dir === 0 ? (st.vx > 0 ? -1 : 1) : step.dir;
      const ex0 = step.exit ?? 15;
      for (const ex of [ex0, ex0 - 8, ex0 - 16, ex0 + 6, ex0 - 24]) {
        const oo: [number, number] = [dr * Math.cos(ex * DEG), Math.sin(ex * DEG)];
        const a = solveNormal(dd, oo, config.materials.pad.restitution, sp, 0);
        const n = [-Math.sin(a * DEG), Math.cos(a * DEG)];
        const off = padHalfThick + config.marble.radius;
        const cand: PadDef = { type: 'pad', id, position: [+(st.x - n[0] * off).toFixed(2), +(st.y - n[1] * off).toFixed(2), 0], angle: a };
        const probe = simulate({ ...base, objects: world([...placed, cand]) }, st.y - 1.2, st.t + 0.05);
        if (!probe.state) continue;
        const hit = probe.hits.find((h) => h.startsWith(`${id}@`));
        return hit ? Number.parseFloat(hit.slice(id.length + 1)) - lastStrikeT : null;
      }
      return null;
    };
    const clampDrop = (d: number) => Math.min(4.6, Math.max(0.5, d));
    let d0 = clampDrop(step.drop ?? 1.1 + (want - 0.45) * 3.0);
    let t0 = measure(d0);
    let best: { drop: number; err: number } | null = t0 === null ? null : { drop: d0, err: t0 - want };
    let d1 = clampDrop(t0 === null || t0 > want ? d0 * 0.7 : d0 * 1.4);
    for (let it = 0; it < 9 && (!best || Math.abs(best.err) > 0.012); it++) {
      const t1 = measure(d1);
      if (t1 !== null) {
        if (!best || Math.abs(t1 - want) < Math.abs(best.err)) best = { drop: d1, err: t1 - want };
        // Secant step on the two latest measurements; fall back to a proportional nudge.
        let next = d1;
        if (t0 !== null && Math.abs(t1 - t0) > 1e-3) next = d1 + (want - t1) * (d1 - d0) / (t1 - t0);
        else next = d1 * (want / t1);
        if (!Number.isFinite(next)) next = d1 * (want / t1);
        d0 = d1; t0 = t1;
        d1 = clampDrop(next);
        if (Math.abs(d1 - d0) < 0.02) d1 = clampDrop(d0 + (t1 < want ? 0.15 : -0.15));
      } else {
        // The marble never got that far: a shorter fall.
        d1 = clampDrop(d1 * 0.75);
      }
    }
    if (best) {
      // A gap no single hop can fill: let the song's clock start again from this strike.
      if (Math.abs(best.err) > 0.2) nominalT = lastStrikeT + want + best.err;
      step.drop = +best.drop.toFixed(2);
      step.y = undefined;
      console.log(`${id}: timed ${step.time}s after the last strike -> drop ${step.drop} (${(want + best.err).toFixed(3)}s for ${want.toFixed(3)})`);
    } else console.log(`${id}: no drop gives a strike ${want}s after the last; using drop ${step.drop ?? 1.8}`);
  }
  const yTarget = step.y ?? lastY - (step.drop ?? 1.8);
  const level = { ...base, objects: world(placed) };
  const { state, hits } = simulate(level, yTarget, afterT);
  if (!state) {
    console.log(`step ${k}: marble never reached y=${yTarget}. Contacts: ${hits.join(' ')}`);
    break;
  }
  const speed = Math.hypot(state.vx, state.vy);
  const d: [number, number] = [state.vx / speed, state.vy / speed];
  const exit = step.exit ?? 15;
  const dir = (step.dir as unknown) === 'auto' ? autoDir(state) : step.dir === 0 ? (state.vx > 0 ? -1 : 1) : step.dir;
  const o: [number, number] = [dir * Math.cos(exit * DEG), Math.sin(exit * DEG)];
  const id = `${prefix}${k + 1}`;
  currentId = id;
  nextId = `${prefix}${k + 2}`;
  currentYTarget = yTarget;
  let def: ObjectDef;
  let angle = 0;
  if (step.k === 'rail') {
    // Carry toward the board centre unless told otherwise so the rail never runs
    // into a wall; a marble moving away from the centre climbs it, stops, and rolls back.
    const shape: RailShape = step.shape ?? 'short';
    // A rail runs the way the marble is already going (only pads and pipes turn
    // it round); a short catch rail may instead face the centre to re-gather it.
    let dx: 1 | -1 = step.dir === 1 || step.dir === -1 ? step.dir : Math.abs(state.vx) < 1.5 ? (state.x > 0 ? -1 : 1) : state.vx < 0 ? -1 : 1;
    if (Math.sign(state.vx) === -dx && Math.abs(state.vx) > 1.5) console.log(`${id}: warning, ${shape} rail runs against the marble (vx ${state.vx.toFixed(1)})`);
    let x0 = +state.x.toFixed(2);
    let y0 = +state.y.toFixed(2);
    let arrival = state;
    let room = base.board.width / 2 - 0.9 - dx * x0; // horizontal room before the wall
    if (step.time !== undefined && room < 7 && (step.dir as unknown) !== 1 && (step.dir as unknown) !== -1) {
      // Not enough board left in the marble's direction for a rest rail: a short
      // catch rail facing the centre stops it and sends it back the other way
      // first, and the rest rail runs from where it comes off.
      const catchDef = railShape(`${id}_catch`, 'short', [x0, y0], -dx as 1 | -1, { len: 2.2 });
      const ride = railRide({ ...base, objects: world([...placed, catchDef]) }, catchDef.id!, state.t - 0.1);
      if (!ride || Math.sign(ride.vx) !== -dx) {
        console.log(`${id}: no room for a ${shape} rail (${room.toFixed(1)}) and the catch rail does not turn the marble`);
        break;
      }
      placed.push(catchDef);
      const next = simulate({ ...base, objects: world(placed) }, ride.y - 1.0, ride.t - 0.02);
      if (!next.state) {
        console.log(`${id}: marble lost after the catch rail`);
        break;
      }
      arrival = next.state;
      dx = -dx as 1 | -1;
      x0 = +arrival.x.toFixed(2);
      y0 = +arrival.y.toFixed(2);
      room = base.board.width / 2 - 0.9 - dx * x0;
      console.log(`${id}_catch: caught at (${state.x.toFixed(2)}, ${state.y.toFixed(2)}) and turned ${dx > 0 ? 'right' : 'left'}; rest rail lands at (${x0}, ${y0}) t=${arrival.t.toFixed(2)}`);
    }
    // A scoop meets the marble along its own line of fall.
    const entry = +(Math.atan2(-arrival.vy, Math.abs(arrival.vx)) / DEG).toFixed(1);
    const opts = (len: number) => ({ len, slope: step.slope, entry });
    const fits = (len: number) => {
      const pts = railShape(id, shape, [x0, y0], dx, opts(len)).points;
      // Leave room for the hop off the far end: a pad placed against the wall is a
      // wall hit. The lip behind the landing may sit nearer the wall; nothing rides it.
      const end = pts[pts.length - 1];
      return Math.abs(end[0]) < base.board.width / 2 - 3.2 && pts.every((p) => Math.abs(p[0]) < base.board.width / 2 - 0.7);
    };
    let best: { len: number; ride: NonNullable<ReturnType<typeof railRide>> } | null = null;
    if (step.time !== undefined) {
      // Search the length that keeps the marble rolling for `time` seconds.
      const lens: number[] = [];
      for (let len = 1.5; len <= 14; len += 0.5) lens.push(len);
      for (const len of lens) {
        if (!fits(len)) continue;
        const cand = railShape(id, shape, [x0, y0], dx, opts(len));
        const ride = railRide({ ...base, objects: world([...placed, cand]) }, id, arrival.t - 0.1);
        if (!ride) {
          if (process.env.RAIL_DEBUG) console.log(`    ${shape} len ${len}: lost`);
          continue;
        }
        // Closest roll time wins; among near-equals the longer rail (a rest should look like one).
        const err = Math.abs(ride.t - ride.landed - step.time) + 0.01 * (14 - len);
        if (process.env.RAIL_DEBUG) console.log(`    ${shape} len ${len}: rolls ${(ride.t - ride.landed).toFixed(2)}s, off at (${ride.x.toFixed(2)}, ${ride.y.toFixed(2)})`);
        if (!best || err < Math.abs(best.ride.t - best.ride.landed - step.time) + 0.01 * (14 - best.len)) best = { len, ride };
      }
    } else {
      const len = step.len ?? Math.min(railShapeLength(shape), Math.max(1.5, room));
      const cand = railShape(id, shape, [x0, y0], dx, opts(len));
      const ride = railRide({ ...base, objects: world([...placed, cand]) }, id, arrival.t - 0.1);
      if (ride) best = { len, ride };
    }
    if (!best) {
      console.log(`${id}: no ${shape} rail from (${x0}, ${y0}) carries the marble (room ${room.toFixed(1)})`);
      break;
    }
    const rail = railShape(id, shape, [x0, y0], dx, opts(best.len));
    def = rail;
    placed.push(def);
    stepsDone++;
    lastY = best.ride.y;
    afterT = best.ride.t - 0.02;
    console.log(`${id}: marble at (${x0}, ${y0}) v=(${arrival.vx.toFixed(2)}, ${arrival.vy.toFixed(2)}) t=${arrival.t.toFixed(2)} -> ${shape} rail ${best.len} long toward ${dx > 0 ? 'right' : 'left'}, rolls ${(best.ride.t - best.ride.landed).toFixed(2)}s, off at (${best.ride.x.toFixed(2)}, ${best.ride.y.toFixed(2)}) t=${best.ride.t.toFixed(2)}`);
    record();
    continue;
  }
  if (step.k === 'seesaw') {
    // Plank under the marble's landing point: it lands just past the lip on the
    // near end, runs up the raised far half, rolls back, and after the hold the
    // plank tips and lets it off the far end, still travelling the same way.
    const dxs: 1 | -1 = Math.abs(state.vx) < 1.5 ? (state.x > 0 ? -1 : 1) : state.vx < 0 ? -1 : 1;
    const half = 3.6 / 2;
    const tilt = (step.exit ?? 12) * DEG;
    const px = +(state.x + dxs * (half - 0.45)).toFixed(2);
    // Surface under the landing point when the near end is down by `tilt`.
    const py = +(state.y - 0.3 - 0.12 + (half - 0.45) * Math.sin(tilt)).toFixed(2);
    if (Math.abs(px) + half > base.board.width / 2 - 1.2) {
      console.log(`${id}: seesaw does not fit at x ${px}`);
      break;
    }
    const seesaw: SeesawDef = { type: 'seesaw', id, position: [px, py, 0], direction: dxs, hold: step.hold ?? 1.0, tilt: step.exit ?? 12 };
    const f = flight({ ...base, objects: world([...placed, seesaw]) }, id, state.t - 0.1, (step.hold ?? 1.0) + 1.2);
    if (!f || f.bad || Math.sign(f.vx) !== dxs) {
      console.log(`${id}: seesaw at (${px}, ${py}) does not carry the marble off its far end${f ? ` (ends at (${f.x.toFixed(2)}, ${f.y.toFixed(2)}) v=(${f.vx.toFixed(1)}, ${f.vy.toFixed(1)}))` : ''}`);
      break;
    }
    def = seesaw;
    placed.push(def);
    stepsDone++;
    lastY = py - half * Math.sin(tilt) - 0.2;
    afterT = f.t - 0.3;
    console.log(`${id}: marble at (${state.x.toFixed(2)}, ${state.y.toFixed(2)}) t=${state.t.toFixed(2)} -> seesaw pivot (${px}, ${py}) arriving from the ${dxs > 0 ? 'left' : 'right'}, hold ${step.hold ?? 1.0}s, off at (${f.x.toFixed(2)}, ${f.y.toFixed(2)}) t=${f.t.toFixed(2)}`);
    record();
    continue;
  }
  if (step.k === 'bowl') {
    // Funnel bowl under the marble: it drops in on the near rim, swings, and the
    // trapdoor lets it out of the bottom after the hold. The marble leaves
    // straight down from the bowl's centre, so the next object goes under it.
    const radius = step.radius ?? 1.5;
    const dx = state.x > 0 ? -1 : 1;
    // Centre the U so the marble, arriving on a diagonal, lands inside the near rim and rolls toward the middle.
    const cx = +(state.x + dx * radius * 0.55).toFixed(2);
    const cy = +(state.y - radius * 0.35).toFixed(2);
    if (Math.abs(cx) + radius > base.board.width / 2 - 0.9) {
      console.log(`${id}: bowl does not fit at x ${cx}`);
      break;
    }
    const bowl: BowlDef = { type: 'bowl', id, position: [cx, cy, 0], radius, hold: step.hold ?? 1.0, instrument: 'bell', note: step.note ?? 'C6' };
    const f = flight({ ...base, objects: world([...placed, bowl]) }, id, state.t - 0.2, (step.hold ?? 1.0) + 0.9);
    if (!f || f.bad || f.y > cy - radius - 0.3) {
      console.log(`${id}: bowl at (${cx}, ${cy}) did not release the marble cleanly${f ? ` (ended at ${f.x.toFixed(2)}, ${f.y.toFixed(2)})` : ''}`);
      break;
    }
    def = bowl;
    placed.push(def);
    stepsDone++;
    lastY = cy - radius;
    afterT = f.t - 0.4;
    console.log(`${id}: marble at (${state.x.toFixed(2)}, ${state.y.toFixed(2)}) t=${state.t.toFixed(2)} -> bowl centred (${cx}, ${cy}) r ${radius}, hold ${step.hold ?? 1.0}s, out at (${f.x.toFixed(2)}, ${f.y.toFixed(2)}) t=${f.t.toFixed(2)}`);
    record();
    continue;
  }
  if (step.k === 'launcher') {
    // Pinball plunger: the marble drops onto a level lane against the plunger's
    // tall face (which kills its sideways speed), rests there for the hold, and
    // is fired back along the lane. The lane slopes a hair toward the head so
    // the marble settles, and ends in the open: the next objects are laid on
    // the flight from its end. The head speed is searched for a clean flight.
    const travel: 1 | -1 = state.vx >= 0 ? 1 : -1;
    const dx: 1 | -1 = travel === 1 ? -1 : 1; // fire back the way the marble came
    const x0 = +state.x.toFixed(2);
    const y0 = +(state.y - 0.35).toFixed(2);
    const laneLen = step.exit ?? 3.6;
    const tilt = 2.5 * DEG;
    const laneEnd: [number, number] = [+(x0 + dx * laneLen).toFixed(2), +(y0 + Math.sin(tilt) * laneLen).toFixed(2)];
    if (Math.abs(laneEnd[0]) > base.board.width / 2 - 1.0) {
      console.log(`${id}: launcher lane does not fit from x ${x0} firing ${dx > 0 ? 'right' : 'left'}`);
      break;
    }
    const lanePts: [number, number, number][] = [0, 0.35, 0.7, 1].map((f) => [+(x0 + dx * (laneLen * f - 0.55)).toFixed(2), +(y0 + Math.sin(tilt) * (laneLen * f - 0.55)).toFixed(2), 0]);
    const lane: RailDef = { type: 'rail', id, points: lanePts, groove: 'curve', lipDeg: 0, instrument: 'click' };
    const headRest: [number, number, number] = [+(x0 + travel * 0.45).toFixed(2), +(y0 + 0.01).toFixed(2), 0];
    let best: { defs: ObjectDef[]; f: NonNullable<ReturnType<typeof flight>>; speed: number } | null = null;
    for (const speed of [8, 9, 10, 11]) {
      const plunger: LauncherDef = { type: 'launcher', id: `${id}_plunger`, position: headRest, direction: dx > 0 ? 2.5 : 177.5, speed, hold: 0.5, instrument: 'kick', color: step.color ?? '#c9a24a' };
      const defs: ObjectDef[] = [lane, plunger];
      const level2 = { ...base, objects: world([...placed, ...defs]) };
      const f = flight(level2, `${id}_plunger`, state.t - 0.2, 1.6);
      if (process.env.LOOP_DEBUG) console.log(`    launcher try speed ${speed}: ${f ? `end (${f.x.toFixed(2)}, ${f.y.toFixed(2)}) v=(${f.vx.toFixed(1)}, ${f.vy.toFixed(1)}) t=${f.t.toFixed(2)}` : 'lost'}`);
      if (!f || f.bad) continue;
      // Must have left the lane end flying the firing way and be coming down.
      if (Math.sign(f.x - laneEnd[0]) !== dx || f.vy >= 0) continue;
      best = { defs, f, speed };
      break;
    }
    if (!best) {
      console.log(`${id}: no plunger speed gives a clean flight from (${x0}, ${y0})`);
      break;
    }
    def = best.defs[0];
    placed.push(...best.defs);
    stepsDone++;
    lastY = laneEnd[1];
    afterT = best.f.t - 0.9;
    console.log(`${id}: marble at (${x0}, ${state.y.toFixed(2)}) t=${state.t.toFixed(2)} -> caught by a plunger at (${headRest[0]}, ${headRest[1]}), fired ${dx > 0 ? 'right' : 'left'} at speed ${best.speed}, lane ends at (${laneEnd[0]}, ${laneEnd[1]})`);
    record();
    continue;
  }
  if (step.k === 'loop') {
    // Loop-the-loop of track, fed by its own catch rail: the marble arriving
    // from a pad is steep and unspun and bounces down a bare lead-in, but a
    // V-groove rail on its path hands it over rolling. The rail's end sets the
    // lead-in angle; the loop is searched over lead length and small angle
    // offsets, and must complete on the real path.
    const dx: 1 | -1 = state.x > 0 ? -1 : 1;
    const x0 = +state.x.toFixed(2);
    const y0 = +state.y.toFixed(2);
    // The catch rail also carries the marble up toward the camera: a V-groove
    // cradles the ball on two rods, so it climbs without a kick, and the loop
    // then needs no lift of its own (it descends before its crossing).
    const RAIL_Z = 0.55;
    const HIGH_Z = 1.3;
    const railPts: [number, number, number][] = [
      [+(x0 - 1.0 * dx).toFixed(2), +(y0 + 0.8).toFixed(2), RAIL_Z],
      [+(x0 - 0.5 * dx).toFixed(2), +(y0 + 0.25).toFixed(2), RAIL_Z],
      [+(x0 + 0.5 * dx).toFixed(2), +(y0 - 0.2).toFixed(2), RAIL_Z + 0.1],
      [+(x0 + 1.4 * dx).toFixed(2), +(y0 - 0.9).toFixed(2), RAIL_Z + 0.42],
      [+(x0 + 2.3 * dx).toFixed(2), +(y0 - 1.7).toFixed(2), HIGH_Z - 0.05],
      [+(x0 + 3.0 * dx).toFixed(2), +(y0 - 2.4).toFixed(2), HIGH_Z],
    ];
    const feed: RailDef = { type: 'rail', id: `${id}_feed`, points: railPts, instrument: 'none' };
    const endDir = [railPts[5][0] - railPts[4][0], railPts[5][1] - railPts[4][1]];
    const endAngle = Math.atan2(-endDir[1], Math.abs(endDir[0])) / DEG;
    const entry: [number, number] = [+(railPts[5][0] + dx * 0.4).toFixed(2), +(railPts[5][1] - 0.45).toFixed(2)];
    let best: { def: RailDef; f: NonNullable<ReturnType<typeof flight>>; score: number; o: { angle: number; lead: number; radius?: number } } | null = null;
    for (const angle of [endAngle - 6, endAngle, endAngle + 6].map((a) => Math.round(Math.min(60, Math.max(35, a))))) {
      for (const lead of [3, 4]) {
        const o = { angle, lead, radius: step.radius, entryZ: process.env.LOOP_HIGH ? HIGH_Z - 0.08 : undefined };
        if (process.env.LOOP_DEBUG && Math.abs(entry[0] + dx * loopSpan(o)) > base.board.width / 2 - 1.0) console.log(`    loop angle ${angle} lead ${lead}: does not fit (reaches x ${(entry[0] + dx * loopSpan(o)).toFixed(1)})`);
        if (Math.abs(entry[0] + dx * loopSpan(o)) > base.board.width / 2 - 1.0) continue;
        const cand = loopRail(id, entry, dx, o);
        const level2 = { ...base, board: { ...base.board, glass: Math.max(base.board.glass ?? 1.5, 2.2) }, objects: world([...placed, feed, cand]) };
        const top = loopTop(entry, o);
        const exit = loopExit(entry, dx, o);
        const f = flight(level2, id, state.t - 0.2, 3.0);
        if (process.env.LOOP_DEBUG) console.log(`    loop try angle ${angle.toFixed(0)} lead ${lead}: ${f ? `climb ${f.climb.toFixed(2)} (need ${(top - 0.35).toFixed(2)}) end (${f.x.toFixed(2)}, ${f.y.toFixed(2)}) t=${f.t.toFixed(2)} exit x ${exit.x.toFixed(2)}` : 'lost'}`);
        if (!f || f.bad) continue;
        if (f.climb < top - 0.35) continue;
        if (Math.sign(f.x - exit.x) !== dx && Math.abs(f.x - exit.x) > 0.5) continue;
        const score = -f.t;
        if (!best || score > best.score) best = { def: cand, f, score, o };
      }
    }
    if (!best) {
      console.log(`${id}: no loop completes after a catch rail at (${x0}, ${y0}); the marble arrives at ${Math.hypot(state.vx, state.vy).toFixed(1)} u/s`);
      break;
    }
    base.board.glass = Math.max(base.board.glass ?? 1.5, 2.2);
    def = best.def;
    placed.push(feed, def);
    stepsDone++;
    const exit = loopExit(entry, dx, best.o);
    lastY = exit.y;
    afterT = state.t + 0.1;
    console.log(`${id}: marble at (${x0}, ${y0}) v=(${state.vx.toFixed(2)}, ${state.vy.toFixed(2)}) t=${state.t.toFixed(2)} -> catch rail then loop, lead-in ${best.o.angle.toFixed(0)}deg x ${best.o.lead}, exit near (${exit.x.toFixed(2)}, ${exit.y.toFixed(2)})`);
    record();
    continue;
  }
  if (step.k === 'spinner') {
    // Wheel just below the marble, off toward the centre; then search the phase and
    // direction that fling it highest while sending it toward the centre, on the
    // real path (the wheel is a function of the clock, so this is repeatable).
    const dx = state.x > 0 ? -1 : 1;
    const radius = step.radius ?? 1.1;
    const blades = step.blades ?? 4;
    const rpm = Math.abs(step.rpm ?? 40);
    const cx = +(state.x + dx * 0.55).toFixed(2);
    const cy = +(state.y - radius * 0.85).toFixed(2);
    let best: { def: SpinnerDef; f: NonNullable<ReturnType<typeof flight>>; score: number } | null = null;
    for (const sign of [1, -1]) {
      for (let phase = 0; phase < 360 / blades; phase += 3) {
        const cand: SpinnerDef = { type: 'spinner', id, position: [cx, cy, 0], radius, blades, rpm: sign * rpm, phase, color: step.color ?? '#e0533d', instrument: 'wood', note: step.note ?? 'C4' };
        const f = flight({ ...base, objects: world([...placed, cand]) }, id, state.t - 0.2);
        if (!f || f.bad || f.vy >= 0 || Math.abs(f.x) > base.board.width / 2 - 2.5) continue;
        const toward = Math.sign(f.x - cx) === dx || Math.abs(f.x) < 1.5 ? 1 : 0;
        const score = (f.top - cy) + toward * 2 - Math.abs(f.x) * 0.15;
        if (!best || score > best.score) best = { def: cand, f, score };
      }
    }
    if (!best) {
      console.log(`${id}: no spinner phase sends the marble on cleanly at (${cx}, ${cy})`);
      break;
    }
    def = best.def;
    placed.push(def);
    stepsDone++;
    lastY = best.f.y;
    afterT = best.f.t - 0.05;
    console.log(`${id}: marble at (${state.x.toFixed(2)}, ${state.y.toFixed(2)}) t=${state.t.toFixed(2)} -> spinner at (${cx}, ${cy}) rpm ${best.def.rpm} phase ${best.def.phase}, lob to y ${best.f.top.toFixed(2)}, lands toward (${best.f.x.toFixed(2)}, ${best.f.y.toFixed(2)}) v=(${best.f.vx.toFixed(2)}, ${best.f.vy.toFixed(2)})`);
    record();
    continue;
  }
  if (step.k === 'pipe') {
    // Entry mouth on the marble's path, then a hook toward the board centre and down.
    const dx = state.x > 0 ? -1 : 1;
    const x0 = +state.x.toFixed(2);
    const y0 = +state.y.toFixed(2);
    const pts: [number, number, number][] = [
      [+(x0 - 0.3 * dx).toFixed(2), +(y0 + 0.9).toFixed(2), 0],
      [x0, +(y0 - 0.2).toFixed(2), 0],
      [+(x0 + 1.4 * dx).toFixed(2), +(y0 - 1.3).toFixed(2), 0],
      [+(x0 + 2.2 * dx).toFixed(2), +(y0 - 2.9).toFixed(2), 0],
      [+(x0 + 1.4 * dx).toFixed(2), +(y0 - 4.3).toFixed(2), 0],
    ];
    const pipe: PipeDef = { type: 'pipe', id, points: pts, color: step.color ?? '#7a3fb0', instrument: 'tube', note: step.note ?? 'C4' };
    def = pipe;
    placed.push(def);
    stepsDone++;
    lastY = y0 - 4.3;
    afterT = state.t + 0.05;
    console.log(`${id}: marble at (${state.x.toFixed(2)}, ${state.y.toFixed(2)}) v=(${state.vx.toFixed(2)}, ${state.vy.toFixed(2)}) t=${state.t.toFixed(2)} -> pipe toward ${dx > 0 ? 'right' : 'left'}, exit at y ${lastY.toFixed(2)}`);
    record();
    continue;
  }
  if (step.k === 'ramp') {
    // Tilted shelf descending toward the board centre. The marble lands on its
    // upper half and rolls off the lower end from a repeatable spot.
    const dx = state.x > 0 ? -1 : 1;
    const len = 3.6;
    const theta = 25 * DEG;
    const cx = state.x + 0.9 * dx * Math.cos(theta);
    const cy = state.y - 0.5 - 0.9 * Math.sin(theta) - 0.2;
    const ramp: RampDef = {
      type: 'ramp', id,
      position: [+cx.toFixed(2), +cy.toFixed(2), 0.45],
      rotation: [0, 0, +(-dx * 25).toFixed(1)],
      size: [len, 0.4, 0.9],
    };
    def = ramp;
    placed.push(def);
    stepsDone++;
    lastY = cy - (len / 2) * Math.sin(theta) + 0.2;
    afterT = state.t + 0.05;
    console.log(`${id}: marble at (${state.x.toFixed(2)}, ${state.y.toFixed(2)}) v=(${state.vx.toFixed(2)}, ${state.vy.toFixed(2)}) t=${state.t.toFixed(2)} -> ramp toward ${dx > 0 ? 'right' : 'left'}, lower end at y ${lastY.toFixed(2)}`);
    record();
    continue;
  }
  if (step.k === 'pad') {
    // Try the asked exit first, then flatter ones: a steep lob can drop the
    // marble back onto the pad it left, where it sits. Keep the first exit
    // that actually carries the marble on below the pad.
    let pad: PadDef | null = null;
    let padStrikeT: number | undefined;
    for (const ex of [exit, exit - 8, exit - 16, exit + 6, exit - 24]) {
      const oo: [number, number] = [dir * Math.cos(ex * DEG), Math.sin(ex * DEG)];
      const a = solveNormal(d, oo, config.materials.pad.restitution, speed, 0);
      const n = [-Math.sin(a * DEG), Math.cos(a * DEG)];
      const off = padHalfThick + config.marble.radius;
      const cand: PadDef = {
        type: 'pad', id,
        position: [+(state.x - n[0] * off).toFixed(2), +(state.y - n[1] * off).toFixed(2), 0],
        angle: a, color: step.color ?? colors[k % colors.length], note: step.note ?? notes[k % notes.length],
        ...(step.silent ? { instrument: 'none' as const } : {}),
      };
      const probe = simulate({ ...base, objects: world([...placed, cand]) }, state.y - 1.2, state.t + 0.05);
      if (probe.state) {
        pad = cand;
        angle = a;
        const hit = probe.hits.find((h) => h.startsWith(`${id}@`));
        padStrikeT = hit ? Number.parseFloat(hit.slice(id.length + 1)) : undefined;
        if (ex !== exit) console.log(`${id}: exit ${exit} did not carry the marble on; using ${ex}`);
        break;
      }
    }
    if (!pad) {
      console.log(`${id}: no exit angle carries the marble on from (${state.x.toFixed(2)}, ${state.y.toFixed(2)})`);
      break;
    }
    def = pad;
    lastStrikeT = padStrikeT;
  } else {
    lastStrikeT = undefined;
    angle = solveNormal(d, o, config.materials.bumper.restitution, speed, config.bumper.kick);
    const n = [-Math.sin(angle * DEG), Math.cos(angle * DEG)];
    const off = bumperRadius + config.marble.radius;
    const bumper: BumperDef = {
      type: 'bumper', id,
      position: [+(state.x - n[0] * off).toFixed(2), +(state.y - n[1] * off).toFixed(2), 0],
      radius: bumperRadius,
      color: step.color ?? '#c9a24a',
    };
    def = bumper;
  }
  placed.push(def);
  stepsDone++;
  lastY = state.y;
  afterT = state.t + 0.05;
  console.log(`${id}: marble at (${state.x.toFixed(2)}, ${state.y.toFixed(2)}) v=(${state.vx.toFixed(2)}, ${state.vy.toFixed(2)}) t=${state.t.toFixed(2)} -> ${step.k} normal ${angle}deg`);
  record();
}
if (stepsDone < steps.length) {
  if (stale.length) {
    // An old object stood in the new path: re-lay the same steps in a clean world.
    console.log(`\npass ${pass + 1} could not finish with the old objects kept; re-laying from step ${startK} without them`);
    cleanRetry = true;
    pass--;
    continue;
  }
  break;
}
stale = [];
cleanRetry = false;
doubleStruck = -1;
const missed = firstMissed();
if (missed < 0) break;
if (doubleStruck >= 0) {
  // Re-laying the same step in the same world gives the same pad: change its
  // exit angle a little so the marble leaves it differently.
  let acc2 = 0;
  let sk = 0;
  while (sk < records.length && acc2 + records[sk].objects <= missed) acc2 += records[sk++].objects;
  steps[sk].exit = (steps[sk].exit ?? 15) + 4;
  console.log(`  ${placed[missed].id}: exit raised to ${steps[sk].exit} degrees`);
  lastMissedId = '';
}
if (placed[missed].id === lastMissedId) {
  console.log(`\npass ${pass + 1}: the finished machine still misses ${lastMissedId}; keeping this layout`);
  break;
}
lastMissedId = placed[missed].id!;
// Map the missed object back to its step and re-lay from there.
let acc = 0;
startK = 0;
while (startK < records.length && acc + records[startK].objects <= missed) acc += records[startK++].objects;
console.log(`\npass ${pass + 1}: the finished machine misses ${lastMissedId}; re-laying from step ${startK}`);
if (pass === MAX_PASSES - 1) console.log(`giving up after ${MAX_PASSES} passes`);
}

const final: LevelFile = { ...base, objects: withPlaced(placed) };
const { hits } = simulate(final, -1000, 0);
if (stepsDone === steps.length) {
  writeFileSync(levelPath, serializeLevel(final));
  console.log(`\nWrote ${placed.length} objects into ${levelPath}`);
} else {
  console.log(`\nNot written: only ${stepsDone}/${steps.length} steps placed.`);
  if (process.env.LAYOUT_WRITE_PARTIAL) {
    writeFileSync(process.env.LAYOUT_WRITE_PARTIAL, serializeLevel(final));
    console.log(`partial level written to ${process.env.LAYOUT_WRITE_PARTIAL}`);
  }
}
console.log('\nVerification contact sequence:\n  ' + hits.filter((h) => !h.startsWith('wall')).join('\n  '));
console.log('\nObjects TS:');
for (const o of placed) {
  if (o.type === 'pad') console.log(`    { type: 'pad', id: '${o.id}', position: [${o.position.join(', ')}], angle: ${o.angle}, color: '${o.color}', note: '${o.note}' },`);
  else if (o.type === 'bumper') console.log(`    { type: 'bumper', id: '${o.id}', position: [${o.position.join(', ')}], radius: ${o.radius}, color: '${o.color}' },`);
  else if (o.type === 'rail') console.log(`    { type: 'rail', id: '${o.id}', points: [${o.points.map((p) => `[${p.join(', ')}]`).join(', ')}] },`);
  else if (o.type === 'rail' && o.groove === 'curve') console.log(`    loop track '${o.id}' (${o.points.length} points)`);
  else if (o.type === 'bowl') console.log(`    { type: 'bowl', id: '${o.id}', position: [${o.position.join(', ')}], radius: ${o.radius}, hold: ${o.hold} },`);
  else if (o.type === 'seesaw') console.log(`    { type: 'seesaw', id: '${o.id}', position: [${o.position.join(', ')}], direction: ${o.direction}, hold: ${o.hold} },`);
  else if (o.type === 'launcher') console.log(`    { type: 'launcher', id: '${o.id}', position: [${o.position.join(', ')}], direction: ${o.direction}, speed: ${o.speed} },`);
  else if (o.type === 'spinner') console.log(`    { type: 'spinner', id: '${o.id}', position: [${o.position.join(', ')}], rpm: ${o.rpm}, phase: ${o.phase} },`);
  else if (o.type === 'pipe') console.log(`    { type: 'pipe', id: '${o.id}', points: [${o.points.map((p) => `[${p.join(', ')}]`).join(', ')}], color: '${o.color}' },`);
  else if (o.type === 'ramp') console.log(`    { type: 'ramp', id: '${o.id}', position: [${o.position.join(', ')}], rotation: [${o.rotation!.join(', ')}], size: [${o.size.join(', ')}] },`);
}
