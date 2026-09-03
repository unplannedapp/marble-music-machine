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
render/      SceneRenderer, FollowCamera, marble visual
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
each object implements its **physical + visual response**. Phase 2 adds an
instrument component subscribing to the same event for the **musical response**;
phase 3 adds timing/score/combo subscribers. None of them touch Rapier.

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

`LevelDef` (`levels/LevelTypes.ts`) is a JSON-shaped description: board extents,
spawn, kill height and a list of object definitions. `Simulation.addObject` /
`removeObject` work on a live machine, which is the API the editor will use.
Pads already carry `note` / `instrument` fields so authored levels are forward
compatible with the song system.

## Determinism as a tool

Because the fixed step and Rapier are deterministic, a level can be replayed
from scratch in milliseconds. `scripts/autolayout.ts` uses that to place pads on
the marble's real trajectory, and `tests/playground.test.ts` asserts that the
marble traverses the machine through contacts, without sinking into the board.
