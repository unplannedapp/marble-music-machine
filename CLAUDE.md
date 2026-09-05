# Marble Music Machine

Physics-based marble music game: TypeScript, Vite, Three.js, Rapier. Read
`docs/ARCHITECTURE.md` before changing the physics or object layers, and
`docs/PLAN.md` for what each phase adds.

## Rules of the machine

- The marble's motion is never scripted. Mechanisms are colliders and forces; an
  object that needs controlled motion (a lift, a spinner) drives a kinematic body,
  never the marble. Moving mechanisms are pure functions of sim time: the clock
  restarts with each run and checkpoints restore it, so every run is the same run.
- Every interactive object has a physical response and (from phase 2) a musical
  response to the same `marble:contact` event. Audio, score and UI subscribe to
  the `EventBus`; they never import Rapier.
- `sim/` must stay headless. Tests and authoring scripts run it in Node.
- Board coordinates: X across, Y up the board (marble travels -Y), Z toward the
  camera. Gravity is tilted into the board (`Config.physics.tiltDeg`).

## Commands

```bash
npm run dev          # dev server
npm test             # headless physics regression
npm run typecheck
npm run trace 10 0.1 # marble trajectory + contacts (level tuning)
npm run layout '<steps json>' <prefix> <afterT>   # place pads/bumpers on the real path
npm run screenshot   # Playwright screenshots against the dev server
```

Level authoring: fix the board first, then `scripts/layout.ts` places objects on
the real simulated path and writes the level JSON, `scripts/pipealign.ts` puts pipe mouths exactly on the path,
`scripts/relaypads.ts` re-lays named pads after something upstream moved,
`scripts/songfrombake.ts` rewrites a song's beats from the run, and
`scripts/bake.ts` bakes checkpoints. A machine has no ending mechanism: after
the last note the marble drops off the bottom into the dark (`finishY`, by
default a little under the lowest object) and that fall is the finish. Never hand-edit geometry after
layout (re-lay instead), and never let the marble free-fall more than ~4 units
between contacts. `docs/PLAN.md` has the lessons in detail.
