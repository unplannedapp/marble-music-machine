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

## Objects

| Object | Physics | Response today |
| --- | --- | --- |
| Rail | two rods of capsule colliders forming a V-groove that holds the marble off the board | none (rides) |
| Ramp / Wall | fixed box | none |
| Bumper | fixed cylinder, high restitution | in-plane impulse kick, cap squash |
| Pad | dynamic box, translations locked, rotation only about Z, explicit torsion spring + damper applied each step | swings and settles, emissive flash |

Pads are deliberately not joint-driven: a revolute joint with a position motor
fought the locked degrees of freedom and produced energy spikes. A body with
exact DOF locks plus a spring torque is both simpler and stable.

## Levels are data

Levels are JSON files (`levels/*.level.json`, format version 1): board
extents, spawn, kill height, finish zone, the object list, and baked
checkpoints. `parseLevel` validates a file and fails loudly; `serializeLevel`
writes it back with vectors on one line. A **machine** (`machines/index.ts`) is
a level paired with the song it performs; the menu lists machines.
`Simulation.addObject` / `removeObject` work on a live machine, which is the
API the editor will use.

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
              ->  finale.ts (funnel, closing rail, tray, finish)
              ->  bake.ts (checkpoints)  ->  tests
```

Never hand-edit geometry after layout: even resizing the board shifts
floating-point contacts enough to diverge a long chain. Change the board,
re-lay, re-bake.

## Determinism as a tool

Because the fixed step and Rapier are deterministic, a level can be replayed
from scratch in milliseconds. `scripts/autolayout.ts` uses that to place pads on
the marble's real trajectory, and `tests/playground.test.ts` asserts that the
marble traverses the machine through contacts, without sinking into the board.
