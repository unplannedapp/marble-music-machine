import type { Machine } from '../machines';

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
  ) {
    root.innerHTML = `
      <div class="menu-title">Marble Music Machine</div>
      <div class="menu-sub">Pick a machine · sound on</div>
      <div class="menu-list"></div>`;
    this.list = root.querySelector('.menu-list')!;
    this.render();
  }

  render(): void {
    const best = loadBest();
    this.list.innerHTML = '';
    for (const m of this.machines) {
      const btn = document.createElement('button');
      btn.className = 'menu-item';
      btn.innerHTML = `<span class="name">${m.title}</span><span class="meta">${m.song.events.length} notes · ${m.song.bpm} bpm</span><span class="best">${best[m.id] ? 'best ' + best[m.id].toLocaleString() : 'not played'}</span>`;
      btn.addEventListener('pointerup', () => this.onPick(m));
      this.list.appendChild(btn);
    }
  }

  show(): void {
    this.render();
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
