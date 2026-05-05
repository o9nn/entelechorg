/**
 * cognitive-tier-integration.test.ts — Matula prime 127
 *
 * Integration tests verifying the three-tier cognitive pipeline:
 *
 *   EchoAgentLoop  ──broadcasts──►  GlobalWorkspaceBroadcaster
 *                                             │
 *                                             ▼
 *                                   MemoryConsolidator  ──writes──►  AtomSpace
 *
 * The key invariant under test is that re-entrancy guards in both the loop
 * and the consolidator prevent queueing: slow ticks / slow writes are dropped
 * rather than backed up.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EchoAgentLoop } from "../src/echo-agent-loop.js";
import { GlobalWorkspaceBroadcaster } from "../src/telemetry/GlobalWorkspaceBroadcaster.js";
import { MemoryConsolidator } from "../src/memory/MemoryConsolidator.js";
import { MemorySubsystem } from "../src/memory/schema.js";
import {
  MATULA_PRIMES,
  compoundName,
  decompose,
  structuralSimilarity,
} from "../src/memory/matula.js";

// ---------------------------------------------------------------------------
// EchoAgentLoop unit tests
// ---------------------------------------------------------------------------

describe("EchoAgentLoop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("invokes onTick on each interval", async () => {
    const ticks: number[] = [];
    const loop = new EchoAgentLoop({
      stepDurationMs: 100,
      onTick: async () => {
        ticks.push(Date.now());
      },
    });

    loop.start();
    await vi.advanceTimersByTimeAsync(350);
    loop.stop();

    expect(ticks.length).toBe(3);
  });

  it("drops ticks when previous tick is still running (tickInProgress guard)", async () => {
    // Use real timers with short durations: the tick takes 3× longer than the
    // step, so every subsequent interval fires while the first is still pending.
    vi.useRealTimers();

    const overruns: number[] = [];
    const loop = new EchoAgentLoop({
      stepDurationMs: 20,
      onTick: async () => {
        // Deliberately slow: 3× the step duration.
        await new Promise<void>((res) => setTimeout(res, 70));
      },
      onOverrun: (count) => overruns.push(count),
    });

    loop.start();
    await new Promise<void>((res) => setTimeout(res, 130));
    loop.stop();

    expect(overruns.length).toBeGreaterThanOrEqual(2);
    expect(loop.droppedTicks).toBe(overruns.length);
  });

  it("exposes shouldYield() inside TickContext", async () => {
    vi.useRealTimers();

    const yields: boolean[] = [];
    const loop = new EchoAgentLoop({
      stepDurationMs: 10,
      onTick: async (ctx) => {
        yields.push(ctx.shouldYield()); // recorded immediately (not yet overdue)
        await new Promise((res) => setTimeout(res, 20)); // exceed stepDurationMs
        yields.push(ctx.shouldYield()); // should be true now
      },
    });

    loop.start();
    await new Promise((res) => setTimeout(res, 40));
    loop.stop();

    // At least one pair of [false, true] should be present.
    expect(yields.includes(false)).toBe(true);
    expect(yields.includes(true)).toBe(true);
  });

  it("start() is idempotent", async () => {
    const ticks: number[] = [];
    const loop = new EchoAgentLoop({
      stepDurationMs: 100,
      onTick: async () => { ticks.push(1); },
    });

    loop.start();
    loop.start(); // second call should be a no-op
    await vi.advanceTimersByTimeAsync(250);
    loop.stop();

    // Should only be 2 ticks (not 4 from a doubled interval).
    expect(ticks.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// GlobalWorkspaceBroadcaster unit tests
// ---------------------------------------------------------------------------

describe("GlobalWorkspaceBroadcaster", () => {
  it("fans out to all subscribers", async () => {
    const broadcaster = new GlobalWorkspaceBroadcaster();
    const received: string[] = [];

    broadcaster.subscribe(async (e) => { received.push(`a:${e.type}`); });
    broadcaster.subscribe(async (e) => { received.push(`b:${e.type}`); });

    await broadcaster.broadcast({ type: "sync_event", payload: null, salience: 0.8 });

    expect(received).toContain("a:sync_event");
    expect(received).toContain("b:sync_event");
    expect(received).toHaveLength(2);
  });

  it("stamps timestamp at broadcast time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);

    const broadcaster = new GlobalWorkspaceBroadcaster();
    let ts = 0;
    broadcaster.subscribe((e) => { ts = e.timestamp; });

    await broadcaster.broadcast({ type: "t", payload: null, salience: 1 });

    expect(ts).toBe(1_000_000);
    vi.useRealTimers();
  });

  it("unsubscribe removes subscriber", async () => {
    const broadcaster = new GlobalWorkspaceBroadcaster();
    const calls: number[] = [];
    const unsub = broadcaster.subscribe(() => { calls.push(1); });

    await broadcaster.broadcast({ type: "x", payload: null, salience: 1 });
    unsub();
    await broadcaster.broadcast({ type: "x", payload: null, salience: 1 });

    expect(calls).toHaveLength(1);
    expect(broadcaster.subscriberCount).toBe(0);
  });

  it("throws AggregateError when a subscriber throws", async () => {
    const broadcaster = new GlobalWorkspaceBroadcaster();
    broadcaster.subscribe(() => { throw new Error("boom"); });

    await expect(
      broadcaster.broadcast({ type: "x", payload: null, salience: 1 }),
    ).rejects.toBeInstanceOf(AggregateError);
  });
});

// ---------------------------------------------------------------------------
// MemoryConsolidator unit tests
// ---------------------------------------------------------------------------

describe("MemoryConsolidator", () => {
  it("writes high-salience events to the episodic subsystem", async () => {
    const broadcaster = new GlobalWorkspaceBroadcaster();
    const consolidator = new MemoryConsolidator();
    consolidator.subscribe(broadcaster);

    await broadcaster.broadcast({
      type: "sync_event",
      payload: { data: 42 },
      salience: 0.9,
    });

    const episodic = consolidator.atomSpace[MemorySubsystem.EPISODIC];
    expect(episodic).toHaveLength(1);
    expect(episodic[0].content.eventType).toBe("sync_event");
    expect(episodic[0].salience).toBe(0.9);
  });

  it("drops low-salience events", async () => {
    const broadcaster = new GlobalWorkspaceBroadcaster();
    const consolidator = new MemoryConsolidator({ salienceThreshold: 0.7 });
    consolidator.subscribe(broadcaster);

    await broadcaster.broadcast({ type: "noise", payload: null, salience: 0.3 });

    expect(consolidator.atomSpace[MemorySubsystem.EPISODIC]).toHaveLength(0);
  });

  it("drops writes when write is already in progress (writeInProgress guard)", async () => {
    const broadcaster = new GlobalWorkspaceBroadcaster();

    let resolveSlowWrite!: () => void;
    const dropped: number[] = [];

    // The first consolidation write blocks on a promise we control.
    let firstWrite = true;
    const consolidator = new MemoryConsolidator({
      onWriteDropped: (n) => dropped.push(n),
      afterConsolidate: async () => {
        if (firstWrite) {
          firstWrite = false;
          await new Promise<void>((res) => {
            resolveSlowWrite = res;
          });
        }
      },
    });
    consolidator.subscribe(broadcaster);

    // Start the first broadcast — its consolidation blocks.
    const p1 = broadcaster.broadcast({ type: "a", payload: null, salience: 0.9 });

    // Yield so the consolidator enters `writeInProgress = true` before p2.
    await new Promise<void>((res) => setImmediate(res));

    // Second broadcast arrives while writeInProgress is true.
    const p2 = broadcaster.broadcast({ type: "b", payload: null, salience: 0.9 });

    // Unblock the first write.
    resolveSlowWrite();
    await Promise.allSettled([p1, p2]);

    expect(consolidator.droppedWrites).toBe(1);
    expect(dropped).toEqual([1]);
    // Only the first atom made it through.
    expect(consolidator.atomSpace[MemorySubsystem.EPISODIC]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Matula prime utilities
// ---------------------------------------------------------------------------

describe("Matula prime utilities", () => {
  it("MATULA_PRIMES constants are all prime numbers", () => {
    const isPrime = (n: number): boolean => {
      if (n < 2) return false;
      for (let i = 2; i <= Math.sqrt(n); i++) {
        if (n % i === 0) return false;
      }
      return true;
    };

    for (const [key, value] of Object.entries(MATULA_PRIMES)) {
      expect(isPrime(value), `${key}=${value} should be prime`).toBe(true);
    }
  });

  it("compoundName returns the product of its arguments", () => {
    expect(compoundName(103, 137)).toBe(103 * 137);
    expect(compoundName(107, 109, 113)).toBe(107 * 109 * 113);
  });

  it("decompose factorises compound Matula names back to primes", () => {
    const name = compoundName(103, 137);
    expect(decompose(name)).toEqual([103, 137]);
  });

  it("structuralSimilarity is 1 for identical atoms", () => {
    expect(structuralSimilarity(103, 103)).toBe(1);
  });

  it("structuralSimilarity is 0 for atoms with no shared factors", () => {
    // 103 and 137 are both prime (no shared factors).
    expect(structuralSimilarity(103, 137)).toBe(0);
  });

  it("structuralSimilarity is partial when factors overlap", () => {
    // 103 * 137  vs  103 * 107 — they share the factor 103.
    const a = compoundName(103, 137);
    const b = compoundName(103, 107);
    const sim = structuralSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// End-to-end pipeline test
// ---------------------------------------------------------------------------

describe("Cognitive tier — end-to-end pipeline", () => {
  it("routes sync_events from broadcaster through consolidator into AtomSpace", async () => {
    const broadcaster = new GlobalWorkspaceBroadcaster();
    const consolidator = new MemoryConsolidator({ salienceThreshold: 0.5 });
    consolidator.subscribe(broadcaster);

    // Emit three events: two above threshold, one below.
    await broadcaster.broadcast({ type: "a", payload: 1, salience: 0.8 });
    await broadcaster.broadcast({ type: "b", payload: 2, salience: 0.6 });
    await broadcaster.broadcast({ type: "c", payload: 3, salience: 0.2 }); // below threshold

    const episodic = consolidator.atomSpace[MemorySubsystem.EPISODIC];
    expect(episodic).toHaveLength(2);
    expect(episodic.map((a) => a.content.eventType)).toEqual(["a", "b"]);
    expect(consolidator.droppedWrites).toBe(0);
  });
});
