# Architecture

## Stack

- **TypeScript + Vite** for the app and tooling.
- **Rapier** (`@dimforge/rapier3d-compat`) for physics: deterministic, continuous
  collision detection for the small fast marble, contact normals and events.
- **Three.js** for rendering.
- **Web Audio API** (phase 2) for synthesis, scheduled on the audio clock.
- **vitest** runs the simulation headlessly; `vite-node` runs the authoring scripts.

## The board

The machine is a tilted table, like a pinball or pachinko board (`Config.ts`):

```
X  across the board          Y  up the board (marble travels toward -Y)
Z  out of the board, toward the camera; the backboard surface is z = 0
```

World gravity is rotated by `physics.tiltDeg`, giving a component down the board
and a component into it that keeps the marble pressed against the backboard. An
invisible front pane (the "glass") keeps the marble on the board without
touching its in-plane motion. Every object is placed in board coordinates, which
is also what a level editor will manipulate.

## Layers

```
core/        GameLoop (fixed 120 Hz step + render interpolation), Config, math
events/      EventBus + typed events: marble:contact, marble:separate, marble:reset
physics/     PhysicsWorld: Rapier world, body<->mesh bindings, contact routing
marble/      Marble: the dynamic sphere (CCD, materials, pre-step velocity history)
objects/     InteractiveObject base + registry; Rail, Ramp/Wall, Bumper, Pad
levels/      LevelTypes (data format) + authored levels
sim/         Simulation: headless-capable machine (world + marble + objects)
audio/       AudioEngine (Web Audio), instruments, MusicSystem (contact -> note)
songs/       SongDef (beats bound to object ids) and authored songs
game/        ScoreSystem: timing windows, combo, score, misses
ui/          Hud: combo, score, rating and lyric popups, results card
render/      SceneRenderer, FollowCamera, marble visual, HitEffects, TargetRings
debug/       lil-gui tuning panel, collider overlay
```

Dependency direction is strictly downward: `render` and `debug` depend on `sim`;
`sim` on `objects`, `physics`, `marble`; nothing below `sim` touches the DOM.

## The interaction pipeline

`PhysicsWorld.step` drains Rapier collision events after each fixed step. For
every contact that begins between the marble and an object it computes:

- the contact normal (from the manifold, oriented object -> marble),
- the incoming normal speed, using the marble's pre-step velocity. CCD-resolved
  hits report one step late, so a three-step velocity history is searched for
  the fastest approach,
- the relative velocity when the object itself is moving (a swinging pad).

Per-object contacts are coalesced: a rail is dozens of capsule colliders but the
bus hears one `marble:contact` when the marble first touches the rail and one
`marble:separate` when it leaves. The event carries the object, impact speed,
normal, point and simulation time.

`Simulation` routes `marble:contact` to `object.onMarbleContact`, which is where
each object implements its **physical + visual response**. `MusicSystem`
subscribes to the same event for the **musical response** and emits
`music:note`, which `HitEffects` (and later timing/score/combo) listen to. None
of them touch Rapier.

## Song, timing and score

A `SongDef` is a list of events in beats, each bound to the id of the object
that plays it, with an optional lyric and section. `ScoreSystem` listens to
`music:note`: when the next due target is struck it compares the strike's
simulation time with the expected time and rates it PERFECT / EXACT / GOOD /
EARLY / LATE / MISS by the windows in `Config.scoring`. The song clock is
anchored on the first strike of each section, so each phrase is judged on its
own rhythm and a slow phrase break cannot poison the rest. A target the marble
falls past without striking, or that is skipped because a later target was
struck, is a MISS and breaks the combo. Points are base + timing bonus +
velocity bonus, scaled by the combo. Everything is emitted as `score:rating`;
`Hud` and `TargetRings` render it and never touch the physics.

## Audio

`MusicSystem` decides *what* sounds: the object's `instrument` and `note` from
the level (each type has a default; `'none'` silences), a velocity from the
impact speed (`velocityFromImpact`), and a short re-trigger guard so a marble
settling on a pad is one strike, not a flurry. It talks to a `NotePlayer`
interface; tests plug in a recorder and assert the melody the machine plays.

`AudioEngine` decides *how* it sounds. Every instrument is synthesised in
layers (impact transient, pitched body, natural decay) with velocity shaping
loudness, brightness and decay, and a repeatable pseudo-random variation so no
two strikes are identical. Notes are scheduled on the audio clock at the
contact's simulation time plus a small lead, using a smoothed sim-to-audio
offset, so rhythm is as steady as the physics rather than the frame loop. A
compressor and a synthetic-room convolver sit on the master bus, and a looping
filtered-noise "rolling" voice follows the marble's speed while it rides a
rail. Audio starts on the first tap, which browsers require.

Only an object with a note sounds when struck (`sounds()`): the pads are the
instrument the marble plays, and a rail, ramp, pipe or mechanism carries the
marble to the next note in silence (just the quiet rolling noise). The song
itself never stops: `Backing` plays the full music under the machine on the
same section-anchored clock the score uses (beat 0 is the first strike of a
section): a soft chord bed plus bass pluck per bar from `backing.chords`, and
the melody line itself, softly, at its written beats (`config.audio.melody`),
so the marble's strike is the bright highlight on a tune that is already
playing. A rest the marble spends rolling on a rail keeps everything in step
with the notes either side of it; a reset or checkpoint respawn cuts the bed
and the next strike starts it again.

## Objects

| Object | Physics | Response today |
| --- | --- | --- |
| Rail | two rods of capsule colliders forming a V-groove that holds the marble off the board; every straight stretch is one capsule (a chain of short ones nudges a fast marble at each joint, and it skips). `shapes.ts` has the family the machines are built from: short / long / longer straight runs at a shallow slope, `arc` (a scoop that gathers a falling marble), `bend` (a gentle sweep), `s` (a snake); none goes near vertical, because a V-groove holds the marble only by the gravity across the path | none (rides) |
| Ramp / Wall | fixed box | none |
| Bumper | fixed cylinder, high restitution | in-plane impulse kick, cap squash |
| Pad | dynamic box, translations locked, rotation only about Z, explicit torsion spring + damper applied each step | swings and settles; starts dark and switches on in its own colour at the first strike, staying lit for the run (PadLights only light lit pads; a respawn keeps pads above it lit) |
| Pipe | triangle-mesh tube (same mesh the player sees, flared mouths); the marble rolls on the real inner wall | tube note on entry, rolling sound inside |
| Loop track | a rail with `groove: 'curve'`: one thick floor rod the marble rolls on with its full radius (a V-groove would turn the ball into a flywheel), two slippery guard rods at its equator, ties for the look; the path lifts toward the camera over the top so the second pass crosses above the entry | click on entry, rolling sound |
| Bowl | a U of gravity-groove rail (same rod placement as Rail) on a fixed body, except a short arc at the bottom whose capsules ride a kinematic body hinged at its left end; the trapdoor swings open a set time after the marble's first contact and closes again | bell on the catch, rolling sound while swinging |
| Launcher | kinematic plunger head on a fixed axis plus a fixed housing; on the marble's first contact it holds, then travels: constant acceleration to the launch speed over 60% of the stroke, constant speed to the end, ease back; every launch is the same launch | kick on the catch, head and coil spring animate |
| Spinner | kinematic hub + blade cuboids; angle = phase + rpm x sim time, handed to the physics as the next kinematic pose each step | the blade's own velocity flings the marble; wood note, blade flash |

Pads are deliberately not joint-driven: a revolute joint with a position motor
fought the locked degrees of freedom and produced energy spikes. A body with
exact DOF locks plus a spring torque is both simpler and stable.

## Levels are data

Levels are JSON files (`levels/*.level.json`, format version 1): board
extents, spawn, kill height, finish line (the marble drops out of the machine past it), the object list, and baked
checkpoints. `parseLevel` validates a file and fails loudly; `serializeLevel`
writes it back with vectors on one line. A **machine** (`machines/index.ts`) is
a level paired with the song it performs; the menu lists machines.
`Simulation.addObject` / `removeObject` work on a live machine, which is the
API the editor will use.

## Rendering

`SceneRenderer` is built for the reference look. One raking spotlight high
above the action throws long soft shadows down the wall and falls off with
distance, so a dark world still reads through the plaster grain it lights
(`keyRake` sets how grazing it is, `boardGrain` how deep the texture). A
neutral room provides reflections for metal and lacquer, a cool rim light draws
edges, and `PadLights` assigns a small pool of coloured point lights to the pads
nearest the camera so lit pads spill their colour onto the wall (`padLight`).
The marble gets no light of its own. Then ACES tone mapping and a post chain of
MSAA render target, vignette and grain (no bloom). Every lever is in the level's
`environment`, so a world is graded as data.

`FollowCamera` frames the machine the way the reference does: it looks down
the board (`pitchDeg`) at a point `aimBelow` under the marble, so the marble
rides high in the frame with the next objects laid out below it and receding;
it pans fully across with the marble and leads toward where it is heading
(`sideLead`), and swings a few degrees round the marble in the direction of
travel (`yawPerSpeed`) so a left-right sweep reads as motion. Every axis is
damped independently.

## Environment

Every song has its own world in the references, so the look is level data:
`environment` carries the board and background colours, key and fill light,
metal and wood tints, the marble tint and the target-ring colour.
`Simulation.load` applies the material tints and `SceneRenderer.applyEnvironment`
the sky and lights, so switching machines switches worlds. The editor offers
presets (Daylight, Neon, Workshop, Slate).

## Editor

`editor/Editor.ts` works on the live simulation: tap to select (raycast against
object roots), drag to move, pan on empty space, pinch or scroll to zoom. Every
change goes through `Simulation.replaceObject`, which rebuilds the object from
its definition in place, so the physics always matches the picture. The
inspector edits angle, tilt, length, size, instrument, note and colour;
the palette adds pads, bumpers, ramps and rails at the view centre; machines
can be saved locally, exported as JSON to the clipboard and pasted back.

Player-built machines have no hand-written song: `game/SongBake.ts` runs the
level headlessly, takes the pads the marble strikes in order, quantises their
times to eighth notes at the tempo, splits sections at gaps of two beats or
more, and records checkpoints. The level is the sequencer. A test shows the
bake recovers the authored rhythm of both built-in machines from the physics
alone.

## Checkpoints

Because the run is deterministic, a lost marble can be put back exactly where
it was. `scripts/bake.ts` runs a machine once and records the marble's
position, velocity and spin a third of a second before the first strike of
each song section, into the level's `checkpoints`. `GameFlow` listens for a
fall or stall mid-song and respawns at the checkpoint of the current section,
while `ScoreSystem.restartSection` rolls the score back to that section's start
and resets the combo. Restoring spin matters: without it the replay drifted
enough to miss the fast eighth-note pads.

## Authoring pipeline

```
fix the board  ->  layout.ts (pads / ramps / rails / bumpers on the real path)
              ->  bake.ts (checkpoints)  ->  tests
```

Never hand-edit geometry after layout: even resizing the board shifts
floating-point contacts enough to diverge a long chain. Change the board,
re-lay, re-bake.

The start must be steady. Adding any collider anywhere reorders the contact
solver, and if the marble hops on the start rail those hops land differently,
so the whole run diverges between layout passes. The template's start is one
straight rod pair with no lip and the marble seated in its groove, already
rolling: no hops, and a replay with more objects is the same replay. The
layout tool's `dir: 'auto'` sweeps the marble across the board and back the
way the reference machines do; a `rail` step with `time` searches the rail
length so the marble rolls for that long, which is how a rest in the music
becomes a rail.

## Determinism as a tool

Because the fixed step and Rapier are deterministic, a level can be replayed
from scratch in milliseconds. `scripts/autolayout.ts` uses that to place pads on
the marble's real trajectory, and `tests/playground.test.ts` asserts that the
marble traverses the machine through contacts, without sinking into the board.
