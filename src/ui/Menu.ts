import type { Machine } from '../machines';
import { loadCustomMachines, newMachineId } from './storage';
import { blankLevel } from '../levels/template';

const BEST_KEY = 'mmm.best';

export function loadBest(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export function saveBest(id: string, score: number): boolean {
  try {
    const best = loadBest();
    if ((best[id] ?? 0) >= score) return false;
    best[id] = score;
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
    return true;
  } catch {
    return false;
  }
}

/**
 * Start screen: pick a machine. Doubles as the audio-unlock tap the browser
 * needs. Shows each machine's song and the player's best score.
 */
export class Menu {
  private readonly list: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly machines: Machine[],
    private readonly onPick: (m: Machine) => void,
    private readonly onEdit: (m: Machine) => void,
  ) {
    root.innerHTML = `
      <div class="menu-title">Marble Music Machine</div>
      <div class="menu-sub">Pick a machine · sound on</div>
      <div class="menu-list"></div>
      <div class="menu-sub menu-mine">My machines</div>
      <div class="menu-list menu-custom"></div>
      <button class="menu-new">+ New machine</button>`;
    this.list = root.querySelector('.menu-list')!;
    root.querySelector('.menu-new')!.addEventListener('pointerup', () => {
      const level = blankLevel('My Machine');
      const m: Machine = { id: newMachineId(), title: level.name, level, song: { name: level.name, bpm: 113, events: [] }, custom: true };
      this.onEdit(m);
    });
    this.render();
  }

  /** Player-built machines from local storage, as playable machines (songs baked on play). */
  static customMachines(): Machine[] {
    return loadCustomMachines().map((s) => ({ id: s.id, title: s.title, level: s.level, song: { name: s.title, bpm: 113, events: [] }, custom: true }));
  }

  render(): void {
    const best = loadBest();
    const item = (m: Machine): HTMLElement => {
      const row = document.createElement('div');
      row.className = 'menu-item';
      const notes = m.custom ? `${m.level.objects.filter((o) => o.type === 'pad').length} pads` : `${m.song.events.length} notes · ${m.song.bpm} bpm`;
      row.innerHTML = `<button class="play"><span class="name">${m.title}</span><span class="meta">${notes}</span></button><span class="best">${best[m.id] ? 'best ' + best[m.id].toLocaleString() : 'not played'}</span><button class="edit" aria-label="Edit">✎</button>`;
      row.querySelector('.play')!.addEventListener('pointerup', () => this.onPick(m));
      row.querySelector('.edit')!.addEventListener('pointerup', () => this.onEdit(m));
      return row;
    };
    this.list.innerHTML = '';
    for (const m of this.machines) this.list.appendChild(item(m));
    const custom = this.root.querySelector('.menu-custom')!;
    custom.innerHTML = '';
    const mine = Menu.customMachines();
    (this.root.querySelector('.menu-mine') as HTMLElement).hidden = mine.length === 0;
    for (const m of mine) custom.appendChild(item(m));
  }

  show(): void {
    this.render();
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
