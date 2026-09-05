# Marble Music Machine

A physics-based marble music game. The marble is the performer: it rolls, falls
and bounces through a mechanical machine, and every physical collision with a
musical object becomes a note.

```
marble movement -> physical collision -> object reaction -> musical event
```

Nothing about the marble's path is scripted. Rails, pads and bumpers are real
colliders; the marble is a real rigid body with mass, friction, restitution and
continuous collision detection.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # headless physics regression (vitest)
npm run typecheck
```

Tap or press Space to start (that also unlocks sound). Controls: `R` reset
marble, `Space` pause, `.` single physics step, `C` free orbit camera. The panel
on the right exposes every tuning value live, including volume and reverb.

## Status

Phases 1 to 5 are in place: machines carry their own environment, a menu
picks them, a level editor builds new ones (their song is baked from the
marble's own run), and real marble physics, every contact playing a
synthesised velocity-sensitive note from the level data, and a song system that
judges each strike against the timeline with combo and score. Built-in machines
perform the alphabet song and Mary Had a Little Lamb. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
for the system design and [docs/PLAN.md](docs/PLAN.md) for the development sequence.

## Level authoring tools

Levels are plain data (`src/levels/*.ts`, see `LevelTypes.ts`). Because the
simulation is deterministic and runs without a screen, the machine can be tuned
from the command line:

```bash
MACHINE=mary npx vite-node scripts/trace.ts 10 0.1     # marble trajectory + contacts
MACHINE=mary npx vite-node scripts/stateat.ts -12,-14  # marble state when crossing given Y
npm run layout src/levels/mary.level.json '<steps json>' <prefix> <afterT>
                                               # place pads/ramps/rails/bumpers on the real path, written into the level
npx vite-node scripts/bake.ts mary             # bake section checkpoints
node scripts/screenshot.mjs                    # headless browser screenshots (dev server running)
```

Levels live in `src/levels/*.level.json`; a machine pairs a level with a song
in `src/machines/index.ts`.
