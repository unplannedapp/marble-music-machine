import type { LevelFile } from '../levels/LevelFormat';
import { parseLevel } from '../levels/LevelFormat';

export interface StoredMachine {
  id: string;
  title: string;
  level: LevelFile;
  updatedAt: number;
}

const KEY = 'mmm.machines';

export function loadCustomMachines(): StoredMachine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as StoredMachine[];
    return raw.filter((m) => {
      try {
        parseLevel(m.level);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

export function saveCustomMachine(m: StoredMachine): void {
  const all = loadCustomMachines().filter((x) => x.id !== m.id);
  all.push({ ...m, updatedAt: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function deleteCustomMachine(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(loadCustomMachines().filter((x) => x.id !== id)));
}

export function newMachineId(): string {
  return 'custom_' + Math.random().toString(36).slice(2, 8);
}
