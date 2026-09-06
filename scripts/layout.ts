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
 *   prefix  id prefix; existing objects with this prefix are replaced (default "auto_")
 *   afterT  only consider the trajectory after this simulation time
 */
import { config } from '../src/core/Config';
import { Simulation, initRapier } from '../src/sim/Simulation';
import type { BumperDef, LevelDef, ObjectDef, PadDef, RailDef, RampDef, PipeDef, SpinnerDef, LauncherDef, BowlDef } from '../src/levels/LevelTypes';
import type { LevelFile } from '../src/levels/LevelFormat';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseLevel, serializeLevel } from '../src/levels/LevelFormat';
import { DEG, solveNormal } from './lib/aim';
import { loopRail, loopExit, loopTop, loopSpan, railShape, railShapeLength, type RailShape } from '../src/levels/shapes';

const levelPath = process.argv[2];
if (!levelPath) throw new Error('usage: layout.ts <level.json> <steps json> [prefix] [afterT]');
const playground = parseLevel(JSON.parse(readFileSync(levelPath, 'utf8')));

interface Step { k: 'pad' | 'bumper' | 'rail' | 'ramp' | 'pipe' | 'spinner' | 'loop' | 'launcher' | 'bowl'; hold?: number; y?: number; drop?: number; dir: -1 | 0 | 1 | 'auto'; exit?: number; note?: string; color?: string; rpm?: number; radius?: number; blades?: number; shape?: RailShape; len?: number; slope?: number; time?: number }
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
  for (let t = 0; t < 60; t += dt) {
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
  for (let t = 0; t < 30; t += dt) {
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
const colors = ['#d9534f', '#d99a4e', '#5bc0de', '#8e6bd6', '#5cb85c', '#e86fb0', '#f7f7f7', '#2f9e8f'];
const notes = ['C4', 'E4', 'G4', 'C5', 'A4', 'F4', 'D4', 'B4'];
let lastY = 0;
for (let k = 0; k < steps.length; k++) {
  const step = steps[k];
  const yTarget = step.y ?? lastY - (step.drop ?? 1.8);
  const level = { ...base, objects: withPlaced(placed) };
  const { state, hits } = simulate(level, yTarget, afterT);
  if (!state) {
    console.log(`step ${k}: marble never reached y=${yTarget}. Contacts: ${hits.join(' ')}`);
    break;
  }
  const speed = Math.hypot(state.vx, state.vy);
  const d: [number, number] = [state.vx / speed, state.vy / speed];
  const exit = step.exit ?? 15;
  // 'auto': sweep across the board. Keep going the way the marble is moving
  // until it nears the side band, then turn it back; before a rail (which runs
  // the marble's own way) turn toward the side with the most room.
  const nextStep = steps[k + 1];
  const autoDir = (): -1 | 1 => {
    const edge = base.board.width / 2 - 5.2; // a hop is ~4 wide: turn back before the next one reaches the wall
    const restAhead = (n: number) => steps[k + n] && steps[k + n].k === 'rail' && steps[k + n].time !== undefined;
    if (restAhead(1)) {
      // The rail will run the way this pad sends the marble: send it toward the
      // side with more room beyond where it lands (a hop is ~3.5 wide).
      const room = (d: -1 | 1) => base.board.width / 2 - 0.9 - d * (state.x + d * 3.5);
      return room(1) >= room(-1) ? 1 : -1;
    }
    // Two pads before a rest, head outward so the pad before it can send the
    // marble back across the whole board.
    if (restAhead(2) && Math.abs(state.x) < edge + 1) return state.x > 0 ? 1 : -1;
    if (state.x > edge) return -1;
    if (state.x < -edge) return 1;
    return state.vx < 0 ? -1 : 1;
  };
  const dir = (step.dir as unknown) === 'auto' ? autoDir() : step.dir === 0 ? (state.vx > 0 ? -1 : 1) : step.dir;
  const o: [number, number] = [dir * Math.cos(exit * DEG), Math.sin(exit * DEG)];
  const id = `${prefix}${k + 1}`;
  let def: ObjectDef;
  let angle = 0;
  if (step.k === 'rail') {
    // Carry toward the board centre unless told otherwise so the rail never runs
    // into a wall; a marble moving away from the centre climbs it, stops, and rolls back.
    const shape: RailShape = step.shape ?? 'short';
    // A rail runs the way the marble is already going (only pads and pipes turn
    // it round); a short catch rail may instead face the centre to re-gather it.
    const dx: 1 | -1 = step.dir === 1 || step.dir === -1 ? step.dir : Math.abs(state.vx) < 1.5 ? (state.x > 0 ? -1 : 1) : state.vx < 0 ? -1 : 1;
    if (Math.sign(state.vx) === -dx && Math.abs(state.vx) > 1.5) console.log(`${id}: warning, ${shape} rail runs against the marble (vx ${state.vx.toFixed(1)})`);
    const x0 = +state.x.toFixed(2);
    const y0 = +state.y.toFixed(2);
    const room = base.board.width / 2 - 0.9 - dx * x0; // horizontal room before the wall
    // A scoop meets the marble along its own line of fall.
    const entry = +(Math.atan2(-state.vy, Math.abs(state.vx)) / DEG).toFixed(1);
    const opts = (len: number) => ({ len, slope: step.slope, entry });
    const fits = (len: number) => {
      const pts = railShape(id, shape, [x0, y0], dx, opts(len)).points;
      // Leave room for the hop off the end: a pad placed against the wall is a wall hit.
      return pts.every((p) => Math.abs(p[0]) < base.board.width / 2 - 2.2);
    };
    let best: { len: number; ride: NonNullable<ReturnType<typeof railRide>> } | null = null;
    if (step.time !== undefined) {
      // Search the length that keeps the marble rolling for `time` seconds.
      const lens: number[] = [];
      for (let len = 1.5; len <= 14; len += 0.5) lens.push(len);
      for (const len of lens) {
        if (!fits(len)) continue;
        const cand = railShape(id, shape, [x0, y0], dx, opts(len));
        const ride = railRide({ ...base, objects: withPlaced([...placed, cand]) }, id, state.t - 0.1);
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
      const ride = railRide({ ...base, objects: withPlaced([...placed, cand]) }, id, state.t - 0.1);
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
    console.log(`${id}: marble at (${x0}, ${y0}) v=(${state.vx.toFixed(2)}, ${state.vy.toFixed(2)}) t=${state.t.toFixed(2)} -> ${shape} rail ${best.len} long toward ${dx > 0 ? 'right' : 'left'}, rolls ${(best.ride.t - best.ride.landed).toFixed(2)}s, off at (${best.ride.x.toFixed(2)}, ${best.ride.y.toFixed(2)}) t=${best.ride.t.toFixed(2)}`);
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
    const f = flight({ ...base, objects: withPlaced([...placed, bowl]) }, id, state.t - 0.2, (step.hold ?? 1.0) + 0.9);
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
      const level2 = { ...base, objects: withPlaced([...placed, ...defs]) };
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
        const level2 = { ...base, board: { ...base.board, glass: Math.max(base.board.glass ?? 1.5, 2.2) }, objects: withPlaced([...placed, feed, cand]) };
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
        const f = flight({ ...base, objects: withPlaced([...placed, cand]) }, id, state.t - 0.2);
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
    continue;
  }
  if (step.k === 'pad') {
    angle = solveNormal(d, o, config.materials.pad.restitution, speed, 0);
    const n = [-Math.sin(angle * DEG), Math.cos(angle * DEG)];
    const off = padHalfThick + config.marble.radius;
    const pad: PadDef = {
      type: 'pad', id,
      position: [+(state.x - n[0] * off).toFixed(2), +(state.y - n[1] * off).toFixed(2), 0],
      angle, color: step.color ?? colors[k % colors.length], note: step.note ?? notes[k % notes.length],
    };
    def = pad;
  } else {
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
  else if (o.type === 'launcher') console.log(`    { type: 'launcher', id: '${o.id}', position: [${o.position.join(', ')}], direction: ${o.direction}, speed: ${o.speed} },`);
  else if (o.type === 'spinner') console.log(`    { type: 'spinner', id: '${o.id}', position: [${o.position.join(', ')}], rpm: ${o.rpm}, phase: ${o.phase} },`);
  else if (o.type === 'pipe') console.log(`    { type: 'pipe', id: '${o.id}', points: [${o.points.map((p) => `[${p.join(', ')}]`).join(', ')}], color: '${o.color}' },`);
  else if (o.type === 'ramp') console.log(`    { type: 'ramp', id: '${o.id}', position: [${o.position.join(', ')}], rotation: [${o.rotation!.join(', ')}], size: [${o.size.join(', ')}] },`);
}
