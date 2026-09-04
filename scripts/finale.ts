/**
 * Append the standard finale below a laid-out 'fin_2' bumper: board-wide funnel,
 * closing rail, finish tray and the finish zone. Never touches the board.
 * Usage: npx vite-node scripts/finale.ts <level.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseLevel, serializeLevel } from '../src/levels/LevelFormat';
import type { ObjectDef } from '../src/levels/LevelTypes';

const path = process.argv[2];
const level = parseLevel(JSON.parse(readFileSync(path, 'utf8')));
const bumper = level.objects.find((o) => o.id === 'fin_2' && o.type === 'bumper');
if (!bumper || bumper.type !== 'bumper') throw new Error('no fin_2 bumper in level; run the finale layout first');
const by = bumper.position[1];
const dy = by - -33.75; // finale geometry was designed with the bumper at y = -33.75
const sh = (y: number): number => +(y + dy).toFixed(2);
const finale: ObjectDef[] = [
  { type: 'ramp', id: 'funnel_left', position: [-4.35, sh(-42.0), 0.45], rotation: [0, 0, -22.3], size: [7.9, 0.4, 0.9], instrument: 'snare' },
  { type: 'ramp', id: 'funnel_right', position: [4.35, sh(-42.0), 0.45], rotation: [0, 0, 22.3], size: [7.9, 0.4, 0.9], instrument: 'snare' },
  {
    type: 'rail', id: 'rail_end',
    points: [[4.6, sh(-43.0), 0], [3.0, sh(-44.0), 0], [1.6, sh(-44.7), 0], [0.0, sh(-45.1), 0], [-1.8, sh(-45.7), 0], [-3.4, sh(-46.6), 0], [-4.6, sh(-47.9), 0], [-5.2, sh(-49.5), 0]],
  },
  { type: 'ramp', id: 'tray_right', position: [-4.9, sh(-51.4), 0.45], rotation: [0, 0, 30], size: [2.6, 0.4, 0.9], color: '#3a3c44', instrument: 'cymbal' },
  { type: 'ramp', id: 'tray_left', position: [-7.1, sh(-51.4), 0.45], rotation: [0, 0, -30], size: [2.6, 0.4, 0.9], color: '#3a3c44', instrument: 'thud' },
];
const ids = new Set(finale.map((f) => f.id));
level.objects = [...level.objects.filter((o) => !ids.has(o.id)), ...finale];
level.finish = { position: [-6.0, sh(-51.6), 0], radius: 1.3 };
if (level.finish.position[1] - 6 < level.killY) throw new Error(`finish at ${level.finish.position[1]} is too close to killY ${level.killY}; the board must be taller`);
if (bumper.instrument === undefined) bumper.instrument = 'kick';
writeFileSync(path, serializeLevel(level));
console.log(`finale appended; tray at y ${sh(-51.4)}, finish ${level.finish.position[1]}`);
