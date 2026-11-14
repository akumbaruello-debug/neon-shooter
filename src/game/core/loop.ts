/**
 * Fixed-timestep loop with interpolated rendering, vsync-driven.
 *
 * The simulation always advances in FIXED_DT steps, so gameplay is identical
 * on 60/144/240 Hz displays. `alpha` (0..1) is passed to render so visuals can
 * interpolate between the previous and current simulation state.
 */
import { FIXED_DT, MAX_STEPS_PER_FRAME } from "../data/constants";

export interface LoopCallbacks {
  update: (dt: number) => void;
  /** Runs once per update() step, even when update() returns early. */
  afterUpdate: () => void;
  render: (alpha: number, frameDt: number) => void;
}

export class GameLoop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private timeScale = 1;
  private frameSamples: number[] = [];
  private fps = 0;

  constructor(private cb: LoopCallbacks) {}

  get isRunning(): boolean {
    return this.running;
  }

  get currentFps(): number {
    return this.fps;
  }

  setTimeScale(s: number): void {
    this.timeScale = s;
  }

  getTimeScale(): number {
    return this.timeScale;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Reset the accumulator (call after a long pause so we don't fast-forward). */
  resync(): void {
    this.last = performance.now();
    this.acc = 0;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    let frameDt = (now - this.last) / 1000;
    this.last = now;
    if (frameDt > 0.25) frameDt = 0.25; // clamped after tab switches

    this.frameSamples.push(frameDt);
    if (this.frameSamples.length > 30) this.frameSamples.shift();
    const avg = this.frameSamples.reduce((a, b) => a + b, 0) / this.frameSamples.length;
    this.fps = avg > 0 ? Math.round(1 / avg) : 0;

    this.acc += frameDt * this.timeScale;
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.cb.update(FIXED_DT);
      this.cb.afterUpdate();
      this.acc -= FIXED_DT;
      steps++;
    }
    if (steps >= MAX_STEPS_PER_FRAME) this.acc = 0; // drop the backlog

    this.cb.render(this.acc / FIXED_DT, frameDt);
  };
}
