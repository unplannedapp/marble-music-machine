/**
 * Rewrite an authored song's beats and sections from the machine's own run,
 * keeping its name, tempo and lyrics. The level is the sequencer.
 * Usage: npx vite-node scripts/songfrombake.ts <machineId> <src/songs/file.ts> <exportName>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { initRapier } from '../src/sim/Simulation';
import { bakeMachine } from '../src/game/SongBake';
import { findMachine } from '../src/machines';

const [id, file, exportName] = process.argv.slice(2);
await initRapier();
const m = findMachine(id);
const baked = bakeMachine(m.level, { bpm: m.song.bpm });
if (!baked.finished) throw new Error('run did not finish');
if (baked.song.events.length !== m.song.events.length) throw new Error(`baked ${baked.song.events.length} events, song has ${m.song.events.length}`);
const events = baked.song.events.map((e, i) => {
  const a = m.song.events[i];
  if (a.object !== e.object) throw new Error(`event ${i}: ${a.object} vs ${e.object}`);
  return `    { beat: ${e.beat}, object: '${e.object}', note: '${a.note}', lyric: ${JSON.stringify(a.lyric ?? '')}, section: ${e.section} },`;
});
const sections = baked.song.sections!.map((_, i) => `'Part ${i + 1}'`);
let src = readFileSync(file, 'utf8');
src = src.replace(/  events: \[[\s\S]*?\n  \],/, `  events: [\n${events.join('\n')}\n  ],`);
src = src.replace(/  sections: \[[^\]]*\],/, `  sections: [${sections.join(', ')}],`);
// When the machine's first note is struck, so a recording's intro can lead into it.
const first = `  firstStrike: ${baked.firstStrike.toFixed(3)},`;
src = /  firstStrike: [^\n]*\n/.test(src) ? src.replace(/  firstStrike: [^\n]*\n/, first + '\n') : src.replace(/  events: \[/, first + '\n  events: [');
writeFileSync(file, src);
console.log(`${exportName}: ${events.length} events, ${sections.length} sections written to ${file}`);
