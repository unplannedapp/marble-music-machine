import * as THREE from 'three';
import type { Simulation } from '../sim/Simulation';
import type { ScoreSystem } from './Scoring';
import type { EventBus } from '../events/EventBus';

/**
 * Run rules on top of the raw simulation: a marble that falls out or stalls
 * mid-song restarts at the checkpoint of the section it was in, with that
 * section's score rolled back and the combo reset, instead of restarting the
 * whole song. Finishing, or losing the marble before the song starts, is a
 * full restart.
 */
export class GameFlow {
  private readonly off: () => void;
  private restarting = false;

  constructor(
    private readonly sim: Simulation,
    scoring: ScoreSystem,
    bus: EventBus = sim.bus,
  ) {
    this.off = bus.on('marble:reset', (e) => {
      if (this.restarting || e.reason === 'finished' || e.reason === 'manual' || scoring.finished) return;
      const cp = this.checkpointFor(scoring.currentSection);
      if (!cp) return;
      // The generic reset already respawned at the start; move to the checkpoint instead.
      this.restarting = true;
      scoring.restartSection();
      sim.respawn(new THREE.Vector3(...cp.position), new THREE.Vector3(...cp.velocity), cp.spin ? new THREE.Vector3(...cp.spin) : undefined);
      this.restarting = false;
    });
  }

  private checkpointFor(section: number): NonNullable<NonNullable<Simulation['level']>['checkpoints']>[number] | undefined {
    const cps = this.sim.level?.checkpoints ?? [];
    let best: (typeof cps)[number] | undefined;
    for (const cp of cps) if (cp.section <= section && (!best || cp.section > best.section)) best = cp;
    // The first section restarts from the level spawn, like a fresh run.
    return best && best.section > 0 ? best : undefined;
  }

  dispose(): void {
    this.off();
  }
}
