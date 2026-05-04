/**
 * MemoryConsolidator.ts — Phase 1 consolidation trigger
 *
 * Subscribes to `GlobalWorkspaceBroadcaster.broadcast` events and applies the
 * same re-entrancy guard used by `EchoAgentLoop.tickInProgress`: if a
 * consolidation write is already in progress, the incoming event is dropped
 * rather than queued. This ensures slow consolidation never blocks the next
 * perception cycle.
 *
 * Salience gating
 * ---------------
 * Only events with `event.salience >= salienceThreshold` trigger a write.
 * This mirrors the `streamSaliences` gating described in the Phase 1 spec.
 */

import type { BroadcastEvent } from "../telemetry/GlobalWorkspaceBroadcaster.js";
import type { GlobalWorkspaceBroadcaster } from "../telemetry/GlobalWorkspaceBroadcaster.js";
import {
  type AtomSpace,
  type MemoryAtom,
  MemorySubsystem,
  createAtomSpace,
  type EpisodicEvent,
} from "./schema.js";
import { MATULA_PRIMES } from "./matula.js";

export interface MemoryConsolidatorOptions {
  /**
   * Minimum salience for an event to be written to memory.
   * Defaults to 0.5.
   */
  salienceThreshold?: number;
  /** Called when a write is dropped due to re-entrancy. */
  onWriteDropped?: (droppedCount: number) => void;
}

/**
 * Memory consolidator with `writeInProgress` re-entrancy guard.
 *
 * The guard mirrors `EchoAgentLoop`'s `tickInProgress` design: if the memory
 * write triggered by one broadcast event has not completed before the next
 * event arrives, the new event is silently dropped to prevent write-queue
 * build-up.
 */
export class MemoryConsolidator {
  private writeInProgress = false;
  private droppedWriteCount = 0;
  private readonly salienceThreshold: number;
  private readonly onWriteDropped?: (count: number) => void;

  readonly atomSpace: AtomSpace = createAtomSpace();

  constructor(opts: MemoryConsolidatorOptions = {}) {
    this.salienceThreshold = opts.salienceThreshold ?? 0.5;
    this.onWriteDropped = opts.onWriteDropped;
  }

  /**
   * Subscribe this consolidator to a `GlobalWorkspaceBroadcaster`.
   * Returns an unsubscribe function.
   */
  subscribe(broadcaster: GlobalWorkspaceBroadcaster): () => void {
    return broadcaster.subscribe(async (event) => {
      // Re-entrancy guard — drop write if previous is still running.
      if (this.writeInProgress) {
        this.droppedWriteCount++;
        this.onWriteDropped?.(this.droppedWriteCount);
        return;
      }

      this.writeInProgress = true;
      try {
        await this.consolidate(event);
      } finally {
        this.writeInProgress = false;
      }
    });
  }

  /** Number of write operations dropped due to re-entrancy. */
  get droppedWrites(): number {
    return this.droppedWriteCount;
  }

  /**
   * Write a broadcast event to the appropriate memory subsystem.
   * Low-salience events are discarded before writing.
   */
  private async consolidate(event: BroadcastEvent): Promise<void> {
    // Salience gate.
    if (event.salience < this.salienceThreshold) {
      return;
    }

    // All broadcast events are ingested as episodic atoms; downstream
    // processing can promote them to other subsystems.
    const atom: MemoryAtom<EpisodicEvent> = {
      matulaName: MATULA_PRIMES.COGNITIVE_TIER_INTEGRATION,
      subsystem: MemorySubsystem.EPISODIC,
      content: {
        eventType: event.type,
        actors: [],
        context: { payload: event.payload },
      },
      salience: event.salience,
      timestamp: event.timestamp,
    };

    this.atomSpace[MemorySubsystem.EPISODIC].push(atom);
  }
}
