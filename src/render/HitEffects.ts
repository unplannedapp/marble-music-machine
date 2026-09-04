import * as THREE from 'three';
import type { EventBus } from '../events/EventBus';
import type { NoteEvent } from '../audio/types';

interface Ring {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  size: number;
}

/**
 * A soft ring that blooms from each musical contact, scaled by velocity, so
 * the eye sees the note the ear hears. Meshes are pooled; nothing allocates
 * per hit.
 */
export class HitEffects {
  readonly group = new THREE.Group();
  private pool: Ring[] = [];
  private active: Ring[] = [];
  private readonly geometry = new THREE.RingGeometry(0.7, 1, 40);
  private readonly off: () => void;

  constructor(bus: EventBus) {
    this.off = bus.on('music:note', (n) => this.spawn(n));
  }

  private spawn(n: NoteEvent): void {
    const ring = this.pool.pop() ?? this.make();
    const p = n.object.root.getWorldPosition(new THREE.Vector3());
    // Sit the ring just in front of the object so it never z-fights the board.
    ring.mesh.position.set(p.x, p.y, 1.2);
    ring.mesh.rotation.set(0, 0, 0);
    const mat = ring.mesh.material as THREE.MeshBasicMaterial;
    const color = (n.object.def as { color?: string }).color;
    mat.color.set(color ?? '#f2f0f7');
    ring.age = 0;
    ring.life = 0.35 + n.velocity * 0.25;
    ring.size = 0.6 + n.velocity * 1.2;
    ring.mesh.visible = true;
    this.active.push(ring);
  }

  private make(): Ring {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.geometry, mat);
    mesh.visible = false;
    this.group.add(mesh);
    return { mesh, age: 0, life: 1, size: 1 };
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const r = this.active[i];
      r.age += dt;
      const t = Math.min(1, r.age / r.life);
      const s = r.size * (0.3 + t * 1.2);
      r.mesh.scale.set(s, s, 1);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t) * (1 - t);
      if (t >= 1) {
        r.mesh.visible = false;
        this.active.splice(i, 1);
        this.pool.push(r);
      }
    }
  }

  dispose(): void {
    this.off();
  }
}
