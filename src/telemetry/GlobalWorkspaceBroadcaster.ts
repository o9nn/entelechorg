/**
 * GlobalWorkspaceBroadcaster.ts — Matula prime 103
 *
 * Implementation of Global Workspace Theory (GWT) for the entelechorg
 * cognitive architecture. Cognitive modules compete to broadcast to the global
 * workspace; subscribers receive the winning broadcast and can react to it.
 *
 * The broadcaster is the primary trigger for memory consolidation: every
 * sync_event that wins the global workspace competition becomes a write
 * opportunity for `MemoryConsolidator` subscribers.
 */

export interface BroadcastEvent {
  /** Discriminant for the type of cognitive event. */
  type: string;
  /** Event payload — structure depends on `type`. */
  payload: unknown;
  /**
   * Salience score in [0, 1]. Only high-salience events reach downstream
   * memory subsystems; low-salience events are dropped by the consolidator.
   */
  salience: number;
  /** Unix epoch milliseconds at the moment of broadcast. */
  timestamp: number;
}

export type BroadcastSubscriber = (
  event: BroadcastEvent,
) => void | Promise<void>;

/**
 * Singleton-style broadcaster for the global cognitive workspace.
 *
 * Subscribers register interest in broadcast events. The broadcaster fans out
 * to all subscribers concurrently; errors in one subscriber do not prevent
 * others from receiving the event.
 */
export class GlobalWorkspaceBroadcaster {
  private readonly subscribers = new Set<BroadcastSubscriber>();

  /**
   * Register a subscriber. Returns an unsubscribe function.
   *
   * @example
   * const unsub = broadcaster.subscribe(async (event) => { ... });
   * // later:
   * unsub();
   */
  subscribe(fn: BroadcastSubscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  /**
   * Broadcast a cognitive event to all current subscribers.
   *
   * The `timestamp` field is stamped at broadcast time so callers do not need
   * to supply it. Subscriber errors are caught and re-thrown as an
   * `AggregateError` after all subscribers have been called.
   */
  async broadcast(
    event: Omit<BroadcastEvent, "timestamp">,
  ): Promise<void> {
    const fullEvent: BroadcastEvent = {
      ...event,
      timestamp: Date.now(),
    };

    const results = await Promise.allSettled(
      [...this.subscribers].map((fn) => {
        try {
          return Promise.resolve(fn(fullEvent));
        } catch (e) {
          return Promise.reject(e);
        }
      }),
    );

    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason as Error);

    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more broadcast subscribers failed");
    }
  }

  /** Number of active subscribers. */
  get subscriberCount(): number {
    return this.subscribers.size;
  }
}
