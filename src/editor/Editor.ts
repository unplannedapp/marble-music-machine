import * as THREE from 'three';
import type { Simulation } from '../sim/Simulation';
import type { SceneRenderer } from '../render/SceneRenderer';
import type { FollowCamera } from '../render/FollowCamera';
import type { InteractiveObject } from '../objects/InteractiveObject';
import type { ObjectDef, PadDef, BumperDef, RampDef, PipeDef, SpinnerDef, LauncherDef, BowlDef } from '../levels/LevelTypes';
import type { LevelFile } from '../levels/LevelFormat';
import { serializeLevel, parseLevel } from '../levels/LevelFormat';
import { environmentPresets } from '../levels/template';
import { loopRail, railShape, type RailShape } from '../levels/shapes';
import type { InstrumentName } from '../audio/types';

const INSTRUMENTS: InstrumentName[] = ['marimba', 'bell', 'wood', 'metal', 'tube', 'kick', 'snare', 'hihat', 'cymbal', 'pop', 'thud', 'click'];
const NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6'];
const COLORS = ['#d9534f', '#d99a4e', '#5bc0de', '#8e6bd6', '#5cb85c', '#e86fb0', '#f7f7f7', '#2f9e8f', '#3a3c44'];

export interface EditorCallbacks {
  onSimulate: () => void;
  onSave: (level: LevelFile) => void;
  onExit: () => void;
}

/**
 * The player builds the machine. Objects are picked by tapping, moved by
 * dragging, and tuned in the inspector; every change rebuilds the object's
 * physics from its definition so what you see is exactly what will run.
 * Nothing is scripted: simulate just lets the marble go.
 */
export class Editor {
  enabled = false;
  private selected: InteractiveObject | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.45);
  private readonly pointer = new THREE.Vector2();
  private drag: { id: string; start: THREE.Vector3; def: ObjectDef; lastBuild: number } | null = null;
  private pan: { start: THREE.Vector3; focus: THREE.Vector3 } | null = null;
  private pinch: { dist: number; zoom: number } | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly highlight: THREE.Mesh;
  private readonly panel: HTMLElement;
  private readonly inspector: HTMLElement;
  private nextId = 1;

  constructor(
    private readonly sim: Simulation,
    private readonly view: SceneRenderer,
    private readonly follow: FollowCamera,
    root: HTMLElement,
    private readonly callbacks: EditorCallbacks,
  ) {
    this.highlight = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.3, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.highlight.visible = false;
    this.highlight.position.z = 1.15;
    view.scene.add(this.highlight);

    root.innerHTML = `
      <div class="ed-bar">
        <div class="ed-palette">
          <button data-add="pad">+ Pad</button><button data-add="bumper">+ Bumper</button>
          <button data-add="ramp">+ Ramp</button><button data-add="rail">+ Rail</button><select id="ed-railshape" title="Rail shape"><option value="short">short</option><option value="long">long</option><option value="longer">longer</option><option value="arc">arc (scoop)</option><option value="bend">bend</option><option value="s">S-curve</option></select><button data-add="pipe">+ Pipe</button><button data-add="loop">+ Loop</button><button data-add="spinner">+ Spinner</button><button data-add="bowl">+ Bowl</button><button data-add="launcher">+ Launcher</button>
        </div>
        <div class="ed-actions">
          <button id="ed-simulate" class="primary">▶ Simulate</button>
          <button id="ed-save">Save</button>
          <button id="ed-more">⋯</button>
          <button id="ed-exit">Done</button>
        </div>
      </div>
      <div class="ed-inspector" id="ed-inspector"></div>
      <div class="ed-more" id="ed-more-panel" hidden>
        <label>Machine name <input id="ed-name" type="text"></label>
        <label>Look <select id="ed-env">${Object.keys(environmentPresets).map((k) => `<option>${k}</option>`).join('')}</select></label>
        <div class="row"><button id="ed-export">Copy JSON</button><button id="ed-import">Paste JSON</button></div>
        <textarea id="ed-json" rows="6" placeholder="Level JSON appears here; paste JSON and press Paste JSON to load it"></textarea>
        <div class="ed-hint">Tap an object to select it, drag to move it. Drag empty space to pan, pinch or scroll to zoom.</div>
      </div>`;
    this.panel = root;
    this.inspector = root.querySelector('#ed-inspector')!;
    root.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((b) => b.addEventListener('click', () => this.add(b.dataset.add as ObjectDef['type'])));
    root.querySelector('#ed-simulate')!.addEventListener('click', () => callbacks.onSimulate());
    root.querySelector('#ed-save')!.addEventListener('click', () => this.save());
    root.querySelector('#ed-exit')!.addEventListener('click', () => callbacks.onExit());
    const more = root.querySelector<HTMLElement>('#ed-more-panel')!;
    root.querySelector('#ed-more')!.addEventListener('click', () => (more.hidden = !more.hidden));
    root.querySelector<HTMLInputElement>('#ed-name')!.addEventListener('change', (e) => {
      if (this.sim.level) this.sim.level.name = (e.target as HTMLInputElement).value;
    });
    root.querySelector<HTMLSelectElement>('#ed-env')!.addEventListener('change', (e) => this.setEnvironment((e.target as HTMLSelectElement).value));
    root.querySelector('#ed-export')!.addEventListener('click', () => this.exportJson());
    root.querySelector('#ed-import')!.addEventListener('click', () => this.importJson());

    const canvas = view.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    root.hidden = true;
  }

  get level(): LevelFile {
    return this.sim.level as LevelFile;
  }

  enable(): void {
    this.enabled = true;
    this.panel.hidden = false;
    const p = this.sim.marble.position();
    this.follow.manualFocus = new THREE.Vector3(p.x * 0.85, p.y, 0);
    this.follow.manualDistance = 4;
    this.panel.querySelector<HTMLInputElement>('#ed-name')!.value = this.level.name;
    this.select(null);
    this.nextId = this.level.objects.length + 1;
  }

  disable(): void {
    this.enabled = false;
    this.panel.hidden = true;
    this.follow.manualFocus = null;
    this.select(null);
  }

  // ---- picking and transforms -------------------------------------------------

  private boardPoint(e: PointerEvent, target: THREE.Vector3): boolean {
    const rect = this.view.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.view.camera);
    return this.raycaster.ray.intersectPlane(this.plane, target) !== null;
  }

  private pick(e: PointerEvent): InteractiveObject | null {
    const rect = this.view.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.view.camera);
    const hits = this.raycaster.intersectObjects(this.sim.objects.map((o) => o.root), true);
    for (const h of hits) {
      let node: THREE.Object3D | null = h.object;
      while (node && !this.sim.objectsById.has(node.name)) node = node.parent;
      if (node) {
        const obj = this.sim.objectsById.get(node.name)!;
        if (obj.type === 'wall') continue;
        return obj;
      }
    }
    return null;
  }

  private onDown(e: PointerEvent): void {
    if (!this.enabled) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.follow.manualDistance };
      this.drag = null;
      this.pan = null;
      return;
    }
    const p = new THREE.Vector3();
    if (!this.boardPoint(e, p)) return;
    const obj = this.pick(e);
    if (obj) {
      this.select(obj);
      this.drag = { id: obj.id, start: p.clone(), def: JSON.parse(JSON.stringify(obj.def)), lastBuild: performance.now() };
    } else {
      this.select(null);
      this.pan = { start: p.clone(), focus: this.follow.manualFocus!.clone() };
    }
    this.view.renderer.domElement.setPointerCapture(e.pointerId);
  }

  private onMove(e: PointerEvent): void {
    if (!this.enabled) return;
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.follow.manualDistance = THREE.MathUtils.clamp(this.pinch.zoom * (this.pinch.dist / Math.max(1, d)), -6, 40);
      return;
    }
    const p = new THREE.Vector3();
    if (!this.boardPoint(e, p)) return;
    if (this.drag) {
      const now = performance.now();
      if (now - this.drag.lastBuild < 40) return;
      this.drag.lastBuild = now;
      this.applyMove(this.drag, p);
    } else if (this.pan) {
      const f = this.follow.manualFocus!;
      f.x = this.pan.focus.x - (p.x - this.pan.start.x);
      f.y = this.pan.focus.y - (p.y - this.pan.start.y);
      // Panning moves the camera, which moves the plane hit point: keep the anchor fixed by re-basing.
      this.pan.focus.copy(f);
      this.pan.start.copy(p);
    }
  }

  private onUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.drag) {
      const p = new THREE.Vector3();
      if (this.boardPoint(e, p)) this.applyMove(this.drag, p);
      this.drag = null;
      this.refreshInspector();
    }
    this.pan = null;
  }

  private onWheel(e: WheelEvent): void {
    if (!this.enabled) return;
    e.preventDefault();
    this.follow.manualDistance = THREE.MathUtils.clamp(this.follow.manualDistance + Math.sign(e.deltaY) * 1.5, -6, 40);
  }

  private applyMove(drag: NonNullable<Editor['drag']>, p: THREE.Vector3): void {
    const dx = +(p.x - drag.start.x).toFixed(2);
    const dy = +(p.y - drag.start.y).toFixed(2);
    const def: ObjectDef = JSON.parse(JSON.stringify(drag.def));
    if (def.type === 'rail' || def.type === 'pipe') {
      def.points = def.points.map(([x, y, z]) => [+(x + dx).toFixed(2), +(y + dy).toFixed(2), z]);
    } else {
      def.position = [+(def.position[0] + dx).toFixed(2), +(def.position[1] + dy).toFixed(2), def.position[2]];
    }
    this.selected = this.sim.replaceObject(drag.id, def);
    this.updateHighlight();
  }

  // ---- selection and inspector -------------------------------------------------

  private select(obj: InteractiveObject | null): void {
    this.selected = obj;
    this.updateHighlight();
    this.refreshInspector();
  }

  private updateHighlight(): void {
    if (!this.selected) {
      this.highlight.visible = false;
      return;
    }
    const p = this.selected.position();
    this.highlight.position.set(p.x, p.y, 1.15);
    this.highlight.visible = true;
  }

  private refreshInspector(): void {
    const obj = this.selected;
    const el = this.inspector;
    if (!obj) {
      el.innerHTML = `<div class="ed-empty">Tap an object to edit it, or add one.</div>`;
      return;
    }
    const d = obj.def;
    const rows: string[] = [`<div class="ed-title">${d.type} <span class="ed-id">${obj.id}</span></div>`];
    const opt = (list: string[], cur: string | undefined) => list.map((v) => `<option ${v === cur ? 'selected' : ''}>${v}</option>`).join('');
    if (d.type === 'pad') rows.push(`<label>Angle <input data-k="angle" type="range" min="-80" max="80" step="0.5" value="${d.angle ?? 0}"><span>${d.angle ?? 0}°</span></label>`);
    if (d.type === 'ramp') rows.push(`<label>Tilt <input data-k="tilt" type="range" min="-60" max="60" step="0.5" value="${d.rotation?.[2] ?? 0}"><span>${d.rotation?.[2] ?? 0}°</span></label>`, `<label>Length <input data-k="length" type="range" min="1" max="10" step="0.1" value="${d.size[0]}"><span>${d.size[0]}</span></label>`);
    if (d.type === 'bumper') rows.push(`<label>Size <input data-k="radius" type="range" min="0.3" max="1.2" step="0.05" value="${d.radius ?? 0.45}"><span>${d.radius ?? 0.45}</span></label>`);
    if (d.type === 'bowl') rows.push(
      `<label>Size <input data-k="radius" type="range" min="1" max="2.4" step="0.05" value="${d.radius ?? 1.5}"><span>${d.radius ?? 1.5}</span></label>`,
      `<label>Hold <input data-k="hold" type="range" min="0.3" max="3" step="0.1" value="${d.hold ?? 1}"><span>${d.hold ?? 1}</span></label>`,
    );
    if (d.type === 'launcher') rows.push(
      `<label>Aim <input data-k="direction" type="range" min="-180" max="180" step="5" value="${d.direction ?? 0}"><span>${d.direction ?? 0}°</span></label>`,
      `<label>Speed <input data-k="speed" type="range" min="4" max="20" step="0.5" value="${d.speed ?? 13}"><span>${d.speed ?? 13}</span></label>`,
      `<label>Hold <input data-k="hold" type="range" min="0" max="2" step="0.1" value="${d.hold ?? 0.5}"><span>${d.hold ?? 0.5}</span></label>`,
    );
    if (d.type === 'spinner') rows.push(
      `<label>Speed <input data-k="rpm" type="range" min="-120" max="120" step="5" value="${d.rpm ?? 40}"><span>${d.rpm ?? 40}</span></label>`,
      `<label>Blades <input data-k="blades" type="range" min="2" max="6" step="1" value="${d.blades ?? 4}"><span>${d.blades ?? 4}</span></label>`,
      `<label>Size <input data-k="radius" type="range" min="0.6" max="2" step="0.05" value="${d.radius ?? 1.1}"><span>${d.radius ?? 1.1}</span></label>`,
      `<label>Phase <input data-k="phase" type="range" min="0" max="90" step="1" value="${d.phase ?? 0}"><span>${d.phase ?? 0}°</span></label>`,
    );
    if (d.type !== 'wall') {
      rows.push(`<label>Instrument <select data-k="instrument">${opt(['none', ...INSTRUMENTS], d.instrument ?? defaultInstrumentOf(d.type))}</select></label>`);
      rows.push(`<label>Note <select data-k="note">${opt(NOTES, d.note ?? 'C5')}</select></label>`);
    }
    if (d.type === 'pad' || d.type === 'bumper' || d.type === 'ramp' || d.type === 'pipe' || d.type === 'spinner' || d.type === 'launcher') {
      rows.push(`<div class="ed-colors">${COLORS.map((c) => `<button data-color="${c}" style="background:${c}" class="${(d as PadDef).color === c ? 'on' : ''}"></button>`).join('')}</div>`);
    }
    rows.push(`<div class="row"><button id="ed-dup">Duplicate</button><button id="ed-del" class="danger">Delete</button></div>`);
    el.innerHTML = rows.join('');
    el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((input) => {
      input.addEventListener('input', () => this.setField(input.dataset.k!, input.value, input));
    });
    el.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((b) => b.addEventListener('click', () => this.setField('color', b.dataset.color!, null)));
    el.querySelector('#ed-dup')!.addEventListener('click', () => this.duplicate());
    el.querySelector('#ed-del')!.addEventListener('click', () => this.remove());
  }

  private setField(key: string, value: string, input: HTMLInputElement | HTMLSelectElement | null): void {
    const obj = this.selected;
    if (!obj) return;
    const def: ObjectDef = JSON.parse(JSON.stringify(obj.def));
    const num = Number(value);
    switch (key) {
      case 'angle': (def as PadDef).angle = num; break;
      case 'tilt': (def as RampDef).rotation = [0, 0, num]; break;
      case 'length': (def as RampDef).size = [num, (def as RampDef).size[1], (def as RampDef).size[2]]; break;
      case 'radius': (def as BumperDef | SpinnerDef | BowlDef).radius = num; break;
      case 'rpm': (def as SpinnerDef).rpm = num; break;
      case 'blades': (def as SpinnerDef).blades = num; break;
      case 'phase': (def as SpinnerDef).phase = num; break;
      case 'direction': (def as LauncherDef).direction = num; break;
      case 'speed': (def as LauncherDef).speed = num; break;
      case 'hold': (def as LauncherDef | BowlDef).hold = num; break;
      case 'instrument': def.instrument = value; break;
      case 'note': def.note = value; break;
      case 'color': (def as PadDef).color = value; break;
    }
    this.selected = this.sim.replaceObject(obj.id, def);
    if (input?.nextElementSibling) input.nextElementSibling.textContent = key === 'angle' || key === 'tilt' || key === 'phase' || key === 'direction' ? `${value}°` : value;
    if (key === 'color') this.refreshInspector();
    this.updateHighlight();
  }

  private freshId(type: string): string {
    let id = `${type}_${this.nextId++}`;
    while (this.sim.objectsById.has(id)) id = `${type}_${this.nextId++}`;
    return id;
  }

  private add(type: ObjectDef['type']): void {
    const f = this.follow.manualFocus ?? new THREE.Vector3();
    const x = +f.x.toFixed(2);
    const y = +f.y.toFixed(2);
    let def: ObjectDef;
    if (type === 'pad') def = { type, id: this.freshId('pad'), position: [x, y, 0], angle: 40, color: COLORS[this.nextId % 7], instrument: 'marimba', note: 'C5' } as PadDef;
    else if (type === 'bumper') def = { type, id: this.freshId('bumper'), position: [x, y, 0], radius: 0.6, color: '#c9a24a' } as BumperDef;
    else if (type === 'bowl') def = { type, id: this.freshId('bowl'), position: [x, y - 1.2, 0], radius: 1.5, hold: 1 } as BowlDef;
    else if (type === 'launcher') def = { type, id: this.freshId('launcher'), position: [x, y, 0], direction: 0, speed: 13, color: '#c9a24a' } as LauncherDef;
    else if (type === 'spinner') def = { type, id: this.freshId('spinner'), position: [x, y, 0], radius: 1.1, blades: 4, rpm: 40, color: COLORS[this.nextId % 7] } as SpinnerDef;
    else if (type === 'ramp') def = { type, id: this.freshId('ramp'), position: [x, y, 0.45], rotation: [0, 0, -20], size: [4, 0.4, 0.9] } as RampDef;
    else if (type === 'rail') {
      const shape = (this.panel.querySelector<HTMLSelectElement>('#ed-railshape')?.value ?? 'short') as RailShape;
      def = railShape(this.freshId('rail'), shape, [x - 1.5, y + 0.5], 1);
    }
    else if ((type as string) === 'loop') {
      def = loopRail(this.freshId('loop'), [x - 3, y + 1.5], 1);
      // A loop crosses over itself toward the camera: give it room in front of the board.
      if (this.sim.level) this.sim.level.board.glass = Math.max(this.sim.level.board.glass ?? 1.5, 2.2);
    }
    else if (type === 'pipe') def = { type, id: this.freshId('pipe'), points: [[x - 1.5, y + 1.2, 0], [x - 0.3, y + 0.2, 0], [x + 1.2, y - 0.8, 0], [x + 1.6, y - 2.4, 0], [x + 0.6, y - 3.6, 0]], color: COLORS[this.nextId % 7] } as PipeDef;
    else return;
    const obj = this.sim.addObject(def, true);
    this.select(obj);
  }

  private duplicate(): void {
    const obj = this.selected;
    if (!obj) return;
    const def: ObjectDef = JSON.parse(JSON.stringify(obj.def));
    def.id = this.freshId(def.type);
    if (def.type === 'rail' || def.type === 'pipe') def.points = def.points.map(([x, y, z]) => [x + 1, y - 1.5, z]);
    else def.position = [def.position[0] + 1, def.position[1] - 1.5, def.position[2]];
    this.select(this.sim.addObject(def, true));
  }

  private remove(): void {
    const obj = this.selected;
    if (!obj) return;
    this.sim.removeObject(obj.id);
    this.select(null);
  }

  private setEnvironment(name: string): void {
    const env = environmentPresets[name];
    if (!env || !this.sim.level) return;
    this.sim.level.environment = { ...env };
    this.view.applyEnvironment(env, this.sim.level.board);
    this.sim.load(this.sim.level);
    this.follow.manualFocus = this.follow.manualFocus ?? new THREE.Vector3();
    this.select(null);
  }

  private save(): void {
    this.callbacks.onSave(this.level);
  }

  private exportJson(): void {
    const text = serializeLevel(this.level);
    const ta = this.panel.querySelector<HTMLTextAreaElement>('#ed-json')!;
    ta.value = text;
    ta.select();
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  }

  private importJson(): void {
    const ta = this.panel.querySelector<HTMLTextAreaElement>('#ed-json')!;
    try {
      const level = parseLevel(JSON.parse(ta.value));
      this.sim.load(level);
      this.view.applyEnvironment(level.environment, level.board);
      this.panel.querySelector<HTMLInputElement>('#ed-name')!.value = level.name;
      this.select(null);
    } catch (err) {
      ta.value = `Could not load: ${(err as Error).message}\n\n${ta.value}`;
    }
  }
}

function defaultInstrumentOf(type: string): string {
  return { pad: 'marimba', bumper: 'pop', rail: 'click', pipe: 'tube', ramp: 'thud', wall: 'none' }[type] ?? 'wood';
}
