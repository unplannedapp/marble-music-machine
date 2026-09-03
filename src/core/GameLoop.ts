/**
 * Fixed-timestep simulation loop with render interpolation.
 *
 * Physics always advances in constant `fixedDt` steps so the simulation is
 * deterministic and stable regardless of frame rate. Rendering happens once per
 * animation frame and receives `alpha` (0..1), the fraction of a physics step
 * that has elapsed since the last one, so visuals can be interpolated.
 */
export interface GameLoopCallbacks {
  fixedUpdate: (dt: number) => void;
  render: (alpha: number, frameDt: number) => void;
}

export class GameLoop {
  paused = false;
  timeScale = 1;
  private accumulator = 0;
  private lastTime = 0;
  private stepRequested = false;
  private rafId = 0;
  private running = false;

  constructor(
    private readonly fixedDt: number,
    private readonly maxSubSteps: number,
    private readonly callbacks: GameLoopCallbacks,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Advance exactly one physics step while paused. */
  stepOnce(): void {
    this.stepRequested = true;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    const frameDt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    if (this.paused) {
      if (this.stepRequested) {
        this.stepRequested = false;
        this.callbacks.fixedUpdate(this.fixedDt);
        this.accumulator = 0;
      }
    } else {
      this.accumulator += frameDt * this.timeScale;
      let steps = 0;
      while (this.accumulator >= this.fixedDt && steps < this.maxSubSteps) {
        this.callbacks.fixedUpdate(this.fixedDt);
        this.accumulator -= this.fixedDt;
        steps++;
      }
      // If we hit the sub-step cap we are running behind; drop the remainder
      // rather than spiralling.
      if (steps === this.maxSubSteps) this.accumulator = 0;
    }

    const alpha = this.paused ? 1 : this.accumulator / this.fixedDt;
    this.callbacks.render(alpha, frameDt);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
