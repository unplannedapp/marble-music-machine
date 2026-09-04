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

Phases 1 to 3 are in place: real marble physics, every contact playing a
synthesised velocity-sensitive note from the level data, and a song system that
judges each strike against the timeline with combo and score. The playground
level performs the alphabet song. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
for the system design and [docs/PLAN.md](docs/PLAN.md) for the development sequence.

## Level authoring tools

Levels are plain data (`src/levels/*.ts`, see `LevelTypes.ts`). Because the
simulation is deterministic and runs without a screen, the machine can be tuned
from the command line:

```bash
npx vite-node scripts/trace.ts 10 0.1          # marble trajectory + contacts
npx vite-node scripts/stateat.ts -12,-14       # marble state when crossing given Y
npm run layout '<steps json>' <prefix> <afterT>  # place pads, bumpers, rails, ramps on the real path
node scripts/screenshot.mjs                    # headless browser screenshots (dev server running)
```
