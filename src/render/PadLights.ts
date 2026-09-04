import * as THREE from 'three';
import type { Simulation } from '../sim/Simulation';

/**
 * Lit pads spill their colour onto the wall, as in the reference: a small pool
 * of point lights is assigned each frame to the pads nearest the camera focus,
 * so a machine with forty pads costs six lights. Strength comes from the
 * environment (zero in daylight worlds).
 */
export class PadLights {
  readonly group = new THREE.Group();
  private readonly lights: THREE.PointLight[] = [];
  private strength = 0;

  constructor(private readonly sim: Simulation, count = 6) {
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 6, 2);
      l.visible = false;
      this.group.add(l);
      this.lights.push(l);
    }
  }

  setStrength(v: number): void {
    this.strength = v;
    if (v <= 0) for (const l of this.lights) l.visible = false;
  }

  update(focus: THREE.Vector3): void {
    if (this.strength <= 0) return;
    const p = new THREE.Vector3();
    const pads = this.sim.objects
      .filter((o) => o.type === 'pad')
      .map((o) => ({ o, d: Math.abs(o.position(p).y - focus.y) + Math.abs(p.x - focus.x) * 0.3 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.lights.length);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const pad = pads[i];
      if (!pad) {
        l.visible = false;
        continue;
      }
      pad.o.position(p);
      l.position.set(p.x, p.y, 1.4);
      l.color.set((pad.o.def as { color?: string }).color ?? '#ffffff');
      l.intensity = this.strength;
      l.visible = true;
    }
  }
}
