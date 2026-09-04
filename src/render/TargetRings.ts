import * as THREE from 'three';
import type { ScoreSystem } from '../game/Scoring';
import type { Simulation } from '../sim/Simulation';

/**
 * Glowing rings around the next song targets, like the reference game: the eye
 * is led to where the marble must go next. Rings pulse, and vanish when struck.
 */
export class TargetRings {
  readonly group = new THREE.Group();
  private readonly rings: THREE.Mesh[] = [];
  private time = 0;

  constructor(
    private readonly sim: Simulation,
    private readonly scoring: ScoreSystem,
    count = 3,
  ) {
    const geometry = new THREE.RingGeometry(1.05, 1.22, 48);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push(mesh);
    }
  }

  setColor(color: string): void {
    for (const r of this.rings) (r.material as THREE.MeshBasicMaterial).color.set(color);
  }

  update(dt: number): void {
    this.time += dt;
    const pending = this.scoring.pending;
    const p = new THREE.Vector3();
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const ev = pending[i];
      const obj = ev ? this.sim.objectsById.get(ev.object) : undefined;
      if (!obj) {
        ring.visible = false;
        continue;
      }
      obj.position(p);
      ring.position.set(p.x, p.y, 1.1);
      const pulse = i === 0 ? 1 + 0.08 * Math.sin(this.time * 6) : 1;
      ring.scale.setScalar(pulse * (i === 0 ? 1 : 0.85));
      (ring.material as THREE.MeshBasicMaterial).opacity = i === 0 ? 0.9 : 0.4 - i * 0.1;
      ring.visible = true;
    }
  }
}
