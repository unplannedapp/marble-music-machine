import * as THREE from 'three';
import type { EventBus } from '../events/EventBus';
import type { RatingEvent } from '../game/Scoring';
import type { ScoreSystem } from '../game/Scoring';

/**
 * Game overlay in the style of the reference: COMBO top-left, SCORE top-right,
 * the rating and lyric popping up beside the marble, and a results card when
 * the song ends. Plain DOM, positioned from the projected marble position.
 */
export class Hud {
  private readonly combo: HTMLElement;
  private readonly score: HTMLElement;
  private readonly pops: HTMLElement;
  private readonly results: HTMLElement;
  private readonly marbleScreen = new THREE.Vector3();
  private readonly offs: (() => void)[] = [];
  private shownResults = false;

  constructor(
    root: HTMLElement,
    bus: EventBus,
    private readonly camera: THREE.Camera,
    private readonly scoring: ScoreSystem,
    private readonly marble: THREE.Object3D,
  ) {
    root.innerHTML = `
      <div class="hud-stat hud-combo"><span class="label">COMBO</span><span class="value" id="hud-combo">0x</span></div>
      <div class="hud-stat hud-score"><span class="label">SCORE</span><span class="value" id="hud-score">0</span></div>
      <div id="hud-pops"></div>
      <div id="hud-results" hidden></div>`;
    this.combo = root.querySelector('#hud-combo')!;
    this.score = root.querySelector('#hud-score')!;
    this.pops = root.querySelector('#hud-pops')!;
    this.results = root.querySelector('#hud-results')!;
    this.offs.push(bus.on('score:rating', (r) => this.onRating(r)));
    this.offs.push(bus.on('score:reset', () => this.onReset()));
  }

  private onRating(r: RatingEvent): void {
    this.combo.textContent = `${r.combo}x`;
    this.combo.classList.toggle('lost', r.rating === 'MISS');
    this.score.textContent = r.score.toLocaleString();
    this.pop(r.rating === 'MISS' ? 'COMBO LOST' : r.rating + (r.rating === 'PERFECT' || r.rating === 'EXACT' ? '!' : ''), `rating-${r.rating.toLowerCase()}`);
    if (r.event.lyric && r.rating !== 'MISS') this.pop(r.event.lyric, 'lyric');
    if (this.scoring.finished && !this.shownResults) this.showResults();
  }

  private onReset(): void {
    this.combo.textContent = '0x';
    this.combo.classList.remove('lost');
    this.score.textContent = '0';
    this.shownResults = false;
    this.results.hidden = true;
  }

  private pop(text: string, cls: string): void {
    const el = document.createElement('div');
    el.className = `hud-pop ${cls}`;
    el.textContent = text;
    el.style.left = `${this.marbleScreen.x}px`;
    el.style.top = `${this.marbleScreen.y}px`;
    this.pops.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  private showResults(): void {
    this.shownResults = true;
    const s = this.scoring.summary();
    const rows = (['PERFECT', 'EXACT', 'GOOD', 'EARLY', 'LATE', 'MISS'] as const)
      .map((k) => `<div class="row"><span>${k}</span><span>${s.ratings[k]}</span></div>`)
      .join('');
    this.results.innerHTML = `
      <div class="card">
        <div class="title">${this.scoring.song.name}</div>
        <div class="big">${s.score.toLocaleString()}</div>
        <div class="sub">max combo ${s.maxCombo}x · ${s.hits}/${s.total} notes</div>
        ${rows}
        <div class="hint">the marble runs again in a moment</div>
      </div>`;
    this.results.hidden = false;
  }

  /** Per frame: keep the popup origin at the marble's screen position. */
  update(): void {
    this.marble.getWorldPosition(this.marbleScreen);
    this.marbleScreen.project(this.camera);
    this.marbleScreen.x = ((this.marbleScreen.x + 1) / 2) * window.innerWidth;
    this.marbleScreen.y = ((1 - this.marbleScreen.y) / 2) * window.innerHeight;
  }

  dispose(): void {
    for (const off of this.offs) off();
  }
}
