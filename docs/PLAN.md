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
   travels through, funnel mouths, a `pipe` layout step) and spinners (a
   motor-driven paddle wheel on a kinematic body whose angle is a pure
   function of sim time; the sim clock restarts with every run and is
   restored by checkpoints, so mechanisms repeat exactly; a `spinner` layout
   step searches phase and direction on the real path; the Ode to Joy machine
   uses one as its phrase break). Still to do: seesaws, launchers, funnels,
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
- Pipes must sit exactly on the path. A marble that meets a pipe mouth a unit
  off-axis hits the thin mesh rim and is pushed through the wall (it "phases"
  into the pipe). `scripts/pipealign.ts` slides each pipe onto the marble's real
  crossing point and aims its first segment along the velocity; the mouths are
  funnels and the floor is flush with the board so there is no lip. Moving a
  pipe moves its exit, so re-lay the pads after it with `scripts/relaypads.ts`
  (one at a time, in order, until the trace hits everything), then re-bake the
  song and checkpoints.

## Design decisions carried forward

- Musical timing must emerge from geometry. The regular hop period of a zigzag
  (about 0.95 s at the current spacing) is the first "tempo" the machine
  produces; the song system should quantise by placing objects, with only subtle
  runtime nudges.
- Free-fall distance is a level-design constraint: never let the marble fall
  more than about 4 units without a contact, or speeds become uncontrollable.
- Keep the simulation headless-capable. It is the test harness and the editor's
  "simulate" button.
