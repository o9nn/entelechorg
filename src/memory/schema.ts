/**
 * schema.ts — Six-memory architecture (Phase 0 schema)
 *
 * Based on the `regima-cognitive-ai` six-memory architecture. Each subsystem
 * has a typed AtomSpace mapping and uses a Matula prime as its eternal name.
 *
 * Six subsystems
 * --------------
 * 1. Sensory/Perceptual — raw percepts from environment adapters
 * 2. Working (Attention) — currently attended items; bounded capacity
 * 3. Episodic — autobiographical event sequences with temporal context
 * 4. Semantic — declarative knowledge as a labelled property graph
 * 5. Procedural — executable rules / skill programs
 * 6. Participatory — social/relational events (Dove9 inbox messages)
 */

import { MATULA_PRIMES, type MatulaPrimeValue } from "./matula.js";

// ---------------------------------------------------------------------------
// Core atom type
// ---------------------------------------------------------------------------

/** Every memory atom carries a Matula prime as its eternal name. */
export interface MemoryAtom<T = unknown> {
  /** Unique eternal name — a Matula prime or product of primes. */
  matulaName: number;
  /** The subsystem this atom belongs to. */
  subsystem: MemorySubsystem;
  /** Typed content payload. */
  content: T;
  /**
   * Salience score in [0, 1]. The `MemoryConsolidator` uses this to gate
   * writes; low-salience atoms are eligible for forgetting.
   */
  salience: number;
  /** Unix epoch milliseconds when the atom was created or last updated. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Subsystem enum
// ---------------------------------------------------------------------------

export enum MemorySubsystem {
  SENSORY = "sensory",
  WORKING = "working",
  EPISODIC = "episodic",
  SEMANTIC = "semantic",
  PROCEDURAL = "procedural",
  PARTICIPATORY = "participatory",
}

// ---------------------------------------------------------------------------
// Per-subsystem payload shapes
// ---------------------------------------------------------------------------

/** Raw percept delivered by an environment adapter. */
export interface SensoryPercept {
  source: string;
  rawData: unknown;
}

/** An item currently held in the global cognitive workspace. */
export interface WorkingItem {
  matulaRef: number;
  description: string;
}

/** A timestamped event in the agent's autobiography. */
export interface EpisodicEvent {
  eventType: string;
  actors: string[];
  context: Record<string, unknown>;
}

/** A node in the declarative knowledge graph. */
export interface SemanticNode {
  label: string;
  properties: Record<string, unknown>;
  relations: Array<{ predicate: string; targetMatula: number }>;
}

/** An executable procedural rule or skill. */
export interface ProceduralRule {
  trigger: string;
  body: string;
  language: "typescript" | "python" | "pseudo";
}

/** A social/relational event from the Dove9 inbox. */
export interface ParticipatoryEvent {
  from: string;
  to: string;
  messageType: string;
  payload: unknown;
}

// ---------------------------------------------------------------------------
// AtomSpace — typed collection of memory atoms across all subsystems
// ---------------------------------------------------------------------------

/**
 * Typed AtomSpace mapping — each subsystem key holds a list of strongly-typed
 * memory atoms. The `matulaName` on each atom uniquely identifies it within
 * the global address space.
 */
export interface AtomSpace {
  [MemorySubsystem.SENSORY]: MemoryAtom<SensoryPercept>[];
  [MemorySubsystem.WORKING]: MemoryAtom<WorkingItem>[];
  [MemorySubsystem.EPISODIC]: MemoryAtom<EpisodicEvent>[];
  [MemorySubsystem.SEMANTIC]: MemoryAtom<SemanticNode>[];
  [MemorySubsystem.PROCEDURAL]: MemoryAtom<ProceduralRule>[];
  [MemorySubsystem.PARTICIPATORY]: MemoryAtom<ParticipatoryEvent>[];
}

/** Factory for an empty AtomSpace. */
export function createAtomSpace(): AtomSpace {
  return {
    [MemorySubsystem.SENSORY]: [],
    [MemorySubsystem.WORKING]: [],
    [MemorySubsystem.EPISODIC]: [],
    [MemorySubsystem.SEMANTIC]: [],
    [MemorySubsystem.PROCEDURAL]: [],
    [MemorySubsystem.PARTICIPATORY]: [],
  };
}

// ---------------------------------------------------------------------------
// Subsystem ↔ Matula prime mapping
// ---------------------------------------------------------------------------

/**
 * Each memory subsystem is addressed by the Matula prime of its seed module.
 * This provides structural continuity between the echo-master patch table and
 * the live memory address space.
 */
export const SUBSYSTEM_MATULA: Record<MemorySubsystem, MatulaPrimeValue> = {
  [MemorySubsystem.SENSORY]: MATULA_PRIMES.ECHO_AGENT_LOOP,
  [MemorySubsystem.WORKING]: MATULA_PRIMES.GLOBAL_WORKSPACE_BROADCASTER,
  [MemorySubsystem.EPISODIC]: MATULA_PRIMES.COGNITIVE_TIER_INTEGRATION,
  [MemorySubsystem.SEMANTIC]: MATULA_PRIMES.LOGGER,
  [MemorySubsystem.PROCEDURAL]: MATULA_PRIMES.PROCESS_KERNEL,
  [MemorySubsystem.PARTICIPATORY]: MATULA_PRIMES.MAIL_FLAG,
} as const;
