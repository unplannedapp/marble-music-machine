# Development plan

Reconciled against the full specification and the five reference videos.

## What the references show

- **Vertical scrolling machine on a matte backboard.** Objects are mounted on thin
  rods; the marble descends the screen in a narrow zigzag, hitting a pad every
  2-3 marble diameters of drop. Speeds stay moderate because every hit dissipates
  energy. This is the pinball/pachinko model: a tilted board, gravity pressing
  the marble against it.
- **Object families:** short wire rails on posts, hinged pads (wood, coloured,
  black, metal), cymbals/pans, hand drums, pipes, spinning discs. Each object
  swings or wobbles when hit and settles naturally.
- **Camera:** almost top-down, gentle follow, long soft shadows from one key light.
- **Game version:** dark board, neon-lit pads, glowing ring targets, COMBO counter,
  SCORE, timing text (GOOD / EXACT! / EARLY / COMBO LOST).

## Phases

1. **Physics prototype** (done): board, marble, rails, ramps, walls,
   bumpers, hinged pads, follow camera, debug panel, headless tests and
   authoring scripts. Mobile pass: portrait framing, touch start, capped
   pixel ratio and shadows on phones, tuning panel behind a button.
2. **Music interaction** (done): Web Audio engine scheduling on the audio
   clock; instrument + note per object from the level data (marimba, bell,
   wood, metal, kick, snare, hihat, cymbal, tube, pop, click, thud); impact
   speed -> velocity; layered synth voices with per-hit variation; rolling
   sound on rails; hit rings synced to the same event; tap-to-start unlock.
3. **Song system** (done): BPM/key/section data, note events bound to
   objects, timing windows (PERFECT/EXACT/GOOD/EARLY/LATE/MISS), combo, score,
   miss detection, target rings, the reference-style HUD and a results card.
   The alphabet level scores 42/42 with 37 PERFECT or EXACT.
4. **Level system** (done): JSON level format with validation, machine
   registry (level + song), baked per-section checkpoints with rollback, a
   second machine (Mary Had a Little Lamb), menu with best scores, results
   card with a way back to the menu.
5. **Level editor** (done): select, drag, pan, zoom, inspector (angle, tilt,
   length, size, instrument, note, colour), add and duplicate and delete,
   environment presets, save to the device, JSON copy and paste, simulate.
   Built-in machines are edited as copies. Custom machines get their song by
   baking the level's own run.
6. **Advanced physics** (in progress): pipes (curved trimesh tubes the marble
   travels through, funnel mouths, a `pipe` layout step); spinners (a
   motor-driven paddle wheel on a kinematic body whose angle is a pure
   function of sim time; the sim clock restarts with every run and is
   restored by checkpoints, so mechanisms repeat exactly); and the loop-the-
   loop track (`groove: 'curve'` rails, see the lesson below; a `loop` layout
   step searches lead-in angle and length on the real path); and the launcher
   (a pinball plunger: kinematic head on a fixed axis, fired a beat after the
   marble settles against its tall face, travel a pure function of time since
   the catch; a `launcher` layout step drops the marble onto a level lane
   against the head and searches the head speed for a clean shot; Ode to Joy
   uses one as its phrase break). Still to do: seesaws, funnels, object-object
   chain reactions, branching paths, and feeding the loop from a plunger. Still to do: seesaws, launchers, funnels,
   object-object chain reactions, branching paths.
7. **Content / social:** MIDI import, generated machines, sharing.

## Level authoring lessons (from the alphabet-song level)

- Lay objects out with `scripts/layout.ts` on the real simulated path; never
  hand-edit geometry afterwards. Even resizing the board shifts floating-point
  contact results enough to diverge a 40-bounce chain, so fix the board first,
  then lay out, then re-lay if anything changes.
- A long pad chain accumulates deviation. A tilted ramp every phrase re-gathers
  the marble (it lands on the shelf, rolls off the lower end from one spot) and
  doubles as the breath between lines. Ramps are more forgiving than rails here:
  a groove's lip can wedge a marble arriving from above.
- Rhythm comes from spacing: quarter notes drop 1.8, the fast L-M-N-O eighths
  drop 1.1 with a downward deflection, and a held note is a normal pad followed
  by the phrase ramp. Tiny drops (0.55) trap the marble between pads.
- Round bumpers are chaotic by nature; use one at a time and follow it with a
  board-wide funnel.
- A loop-the-loop cannot be made of the V-groove rail. A ball on two rods
  rolls on a tiny effective radius, so under loop loads nearly all its energy
  goes into spin (measured: spin/speed ratio 2.25 on a wide groove, and the
  marble stalls a quarter of the way up even with zero friction). A ball must
  roll on one surface with its full radius, and a triangle-mesh floor catches
  a fast sliding ball on its edges, so the curved track is one thick floor rod
  the marble rolls on, with two thin slippery guard rods at its equator (they
  touch at the pole of the rolling axis, a point that always slides) and the
  board as the rear guard until the path lifts. The lift toward the camera
  for the crossing happens over the top of the loop, where the marble is
  slowest, and must clear the lifted pass's guard rods (rise 0.9). Fed rolling
  along its lead-in at 10 to 12 u/s the loop completes (tests/loop.test.ts).
  Open problem: feeding it inside a machine. Measured: the loop needs about
  12 u/s at its bottom after a clean, rolling handover (11 fails). A marble
  from a pad bounce arrives steep and unspun and loses a third of its energy
  spinning up; a V-groove catch rail (the `loop` layout step now builds one)
  hands over rolling but only at 8 to 10 u/s, and the crossing lift costs the
  rest. Two more lessons: straight runs of a rod chain must be single capsules
  (the joints of short capsules make a fast marble hop), and the lead-in must
  start behind the entry so the marble lands on the rod's side, not its end.
  The natural feeder is the launcher (next in this phase): it fires the marble
  at a chosen speed, already rolling, straight down the lead-in. The shape also
  has a high-entry variant (`entryZ`) for a feeder that climbs; untested in a
  machine.
- Pipes must sit exactly on the path. A marble that meets a pipe mouth a unit
  off-axis hits the thin mesh rim and is pushed through the wall (it "phases"
  into the pipe). `scripts/pipealign.ts` slides each pipe onto the marble's real
  crossing point and aims its first segment along the velocity; the mouths are
  funnels and the floor is flush with the board so there is no lip. Moving a
  pipe moves its exit, so re-lay the pads after it with `scripts/relaypads.ts`
  (one at a time, in order, until the trace hits everything), then re-bake the
  song and checkpoints.

## Reference pass (after phase 6): layout, camera, rails, backing

Studying the reference clips again, four things separated them from our
machines and were fixed together:

- **Layout sweeps across the board.** The reference marble zig-zags left to
  right across the whole screen, a few same-direction hops then a turn; ours
  fell straight down a narrow column. The layout tool's `dir: 'auto'` now
  keeps the marble going until it nears the side band, then turns it back,
  and steers the two pads before a rest so the rail has room. Mary and Joy
  were re-laid this way.
- **Camera looks down the board.** Marble high in frame, the next objects
  laid out below and receding, full sideways follow with lead, a gentle yaw
  toward the direction of travel.
- **Rails for the rests.** A family of rail shapes (short, long, longer,
  arc, bend, s) and a `time` search in the layout tool that picks the length
  the marble rolls for exactly that long. Lessons: straight stretches must
  be single capsules (a capsule chain makes a fast marble skip); a V-groove
  cannot follow a bend that faces down once v^2/R passes the gravity across
  the path, and cannot hold the marble at all near vertical (no hooks: that
  is what loops, pipes and pads are for); a scoop must meet the marble along
  its own line of fall, a lip in front of it kicks a fast marble away; the
  marble lands more gently, and rolls more predictably, when the drop onto a
  rail is about 1 unit rather than 2.
- **The start must be steady.** Any added collider reorders the solver, and
  hops on the old curved start rail then landed differently, so every layout
  pass diverged. A straight start rail with the marble seated in it made the
  replay identical with or without the object being placed.
- **Only the pads sing.** An object without a note makes no sound when the
  marble climbs or rides it: it is guiding the marble to the next note. The
  song itself plays continuously (chord bed, bass and a soft melody line on
  the score's section-anchored clock) and the marble's strike highlights
  the note, so a rest the marble spends on a rail stays in time.

Follow-ups from the same pass: the side walls are invisible (still solid);
the Alphabet Song was re-laid the same way on a 20-wide board (seven rails
for its seven rests, each rolling a full second, the LMNOP eighths as a tight
stair) with a self-correcting final pass in the layout tool: it replays the
finished machine, treats a missed object, a return to an earlier one or a pad
struck twice as a fault, and re-lays from that step with the later objects
kept in the world; a rest with no board left gets a catch rail first, and a
rail's lip is now low enough that a marble bouncing off the pad before it
never meets it. Lessons: the bend shape (a convex sweep) lifts the marble
off and re-lands it, so the pad after it is unreliable; use it in the editor,
not in a song. A 16-wide board leaves a mid-board rest only five units of
run, so rails came out short until the board was widened; and the seesaw joined the mechanisms: a plank that catches the
marble against a lip, holds it for an exact time, tips, and lets it run off
the far end. Still to do in phase 6: chain reactions and branching paths.

A fourth machine, Calm, came from an uploaded audio track rather than a
score: `scripts/experiments/transcribe.py` takes the top voice of the mix
(highest constant-Q bin near each frame's peak, held with hysteresis),
quantises it to eighth notes, snaps it to the detected key (B-flat minor,
108 bpm here) and reads a chord per bar from the chroma for the backing.
The first twelve bars became 42 pads and four rails, laid out in one pass.
A real MIDI file would skip the guesswork; the backing now voices any chord
symbol (root plus optional m), not just the six it knew.

## Design decisions carried forward

- Musical timing must emerge from geometry. The regular hop period of a zigzag
  (about 0.95 s at the current spacing) is the first "tempo" the machine
  produces; the song system should quantise by placing objects, with only subtle
  runtime nudges.
- Free-fall distance is a level-design constraint: never let the marble fall
  more than about 4 units without a contact, or speeds become uncontrollable.
- Keep the simulation headless-capable. It is the test harness and the editor's
  "simulate" button.
