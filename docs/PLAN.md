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

1. **Physics prototype** (this branch): board, marble, rails, ramps, walls,
   bumpers, hinged pads, follow camera, debug panel, headless tests and
   authoring scripts.
2. **Music interaction** (done): Web Audio engine scheduling on the audio
   clock; instrument + note per object from the level data (marimba, bell,
   wood, metal, kick, snare, hihat, cymbal, tube, pop, click, thud); impact
   speed -> velocity; layered synth voices with per-hit variation; rolling
   sound on rails; hit rings synced to the same event; tap-to-start unlock.
3. **Song system:** BPM/key/track data, note events bound to objects, timing
   windows (PERFECT/EXACT/GOOD/EARLY/LATE/MISS), combo, score. Hit timing comes
   from `MarbleContactEvent.simTime`.
4. **Level system:** JSON levels, checkpoints per song section, multiple songs,
   level select.
5. **Level editor:** drag / rotate / delete / duplicate, assign note and
   instrument, simulate button (built on `Simulation.addObject/removeObject`
   and the `LevelDef` format).
6. **Advanced physics:** object-object chain reactions (contact routing between
   non-marble bodies), spinners, funnels, seesaws, launchers, branching paths.
7. **Content / social:** MIDI import, generated machines, sharing.

## Design decisions carried forward

- Musical timing must emerge from geometry. The regular hop period of a zigzag
  (about 0.95 s at the current spacing) is the first "tempo" the machine
  produces; the song system should quantise by placing objects, with only subtle
  runtime nudges.
- Free-fall distance is a level-design constraint: never let the marble fall
  more than about 4 units without a contact, or speeds become uncontrollable.
- Keep the simulation headless-capable. It is the test harness and the editor's
  "simulate" button.
