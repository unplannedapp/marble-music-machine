/** Rewrite a level file in the canonical format. Usage: npx vite-node scripts/reserialize.ts <machineId> */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseLevel, serializeLevel } from '../src/levels/LevelFormat';
import { levelPath } from '../src/machines';
const id = process.argv[2] ?? 'alphabet';
const path = levelPath(id);
writeFileSync(path, serializeLevel(parseLevel(JSON.parse(readFileSync(path, 'utf8')))));
console.log('rewrote', path);
