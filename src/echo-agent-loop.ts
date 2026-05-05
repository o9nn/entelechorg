/**
 * echo-agent-loop.ts — Matula prime 137
 *
 * Cognitive agent loop with re-entrancy guard, overrun counter, and cooperative
 * early-return. When the cognitive cycle takes longer than `stepDurationMs` the
 * next tick is dropped rather than queued, directly addressing memory-write
 * contention in downstream consolidation stages.
 */

export interface TickContext {
  /**
   * Returns true once the elapsed time since this tick started has exceeded
   * `stepDurationMs`. Handlers can poll this for cooperative early-return.
   */
  shouldYield: () => boolean;
}

export interface EchoAgentLoopOptions {
  /** Duration of each cognitive step in milliseconds. */
  stepDurationMs: number;
  /** Async handler invoked each tick. Receives a context for cooperative yield. */
  onTick: (ctx: TickContext) => Promise<void>;
  /** Called whenever a tick is dropped due to re-entrancy. */
  onOverrun?: (overrunCount: number) => void;
}

/**
 * Fixed-interval agent loop with `tickInProgress` re-entrancy guard.
 *
 * If the previous tick has not completed by the time the interval fires, the
 * new tick is silently dropped and `overrunCount` is incremented. This prevents
 * perception cycles from queueing behind a slow cognitive step.
 */
export class EchoAgentLoop {
  private tickInProgress = false;
  private overrunCount = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: EchoAgentLoopOptions) {}

  /** Start the fixed-interval loop. */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.opts.stepDurationMs);
  }

  /** Stop the loop. In-flight ticks are allowed to complete. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Number of ticks dropped due to re-entrancy since the loop started. */
  get droppedTicks(): number {
    return this.overrunCount;
  }

  private async tick(): Promise<void> {
    // Re-entrancy guard — drop tick if previous is still running.
    if (this.tickInProgress) {
      this.overrunCount++;
      this.opts.onOverrun?.(this.overrunCount);
      return;
    }

    this.tickInProgress = true;
    const tickStart = Date.now();

    try {
      const ctx: TickContext = {
        shouldYield: () => Date.now() - tickStart >= this.opts.stepDurationMs,
      };
      await this.opts.onTick(ctx);
    } finally {
      this.tickInProgress = false;
    }
  }
}
