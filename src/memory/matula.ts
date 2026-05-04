/**
 * matula.ts — Matula prime addressing for memory atoms
 *
 * In the Matula correspondence every rooted tree maps to a unique positive
 * integer and vice-versa, with rooted forests represented as products of
 * Matula numbers. Using *primes* as the canonical names guarantees:
 *
 *   1. Uniqueness — no two distinct atoms share a name.
 *   2. Composability — a compound memory atom's name is the product of its
 *      constituent atom names (lossless prime-product factorisation).
 *   3. Structural similarity — atoms with overlapping prime factors share
 *      sub-tree structure.
 *
 * The constants below are taken directly from the echo-master report table
 * that indexed every patch by its Matula prime.
 */

/**
 * Canonical Matula primes for the seven tracked modules in the echo-master
 * patch table. Six of these map directly to memory subsystems; the seventh
 * (`CI_WORKFLOW`) identifies the CI infrastructure module.
 *
 * | Prime | Subsystem                      | Source module                          |
 * |------:|--------------------------------|----------------------------------------|
 * |   103 | GlobalWorkspaceBroadcaster     | telemetry/GlobalWorkspaceBroadcaster   |
 * |   107 | Process Suspend/Resume kernel  | dove9/__tests__/kernel                 |
 * |   109 | MailFlag extended              | dove9/__tests__/kernel (mail)          |
 * |   113 | Logger utility                 | dove9/__tests__/utils/logger           |
 * |   127 | Cognitive-tier integration     | __tests__/cognitive-tier-integration  |
 * |   131 | CI workflow                    | .github/workflows/ci                   |
 * |   137 | echo-agent-loop optimisation   | echo-agent-loop                        |
 */
export const MATULA_PRIMES = {
  GLOBAL_WORKSPACE_BROADCASTER: 103,
  PROCESS_KERNEL: 107,
  MAIL_FLAG: 109,
  LOGGER: 113,
  COGNITIVE_TIER_INTEGRATION: 127,
  CI_WORKFLOW: 131,
  ECHO_AGENT_LOOP: 137,
} as const satisfies Record<string, number>;

export type MatulaPrimeName = keyof typeof MATULA_PRIMES;
export type MatulaPrimeValue = (typeof MATULA_PRIMES)[MatulaPrimeName];

/**
 * Return the Matula name for a compound atom whose constituents are given.
 * The result is the product of the constituent primes.
 *
 * @example
 * compoundName(MATULA_PRIMES.ECHO_AGENT_LOOP, MATULA_PRIMES.GLOBAL_WORKSPACE_BROADCASTER)
 * // => 137 * 103 = 14111
 */
export function compoundName(...primes: number[]): number {
  return primes.reduce((acc, p) => acc * p, 1);
}

/**
 * Decompose a compound Matula name back into its constituent prime factors.
 * Returns the factors in ascending order.
 */
export function decompose(name: number): number[] {
  const factors: number[] = [];
  let n = name;
  // Handle factor 2 separately, then only check odd numbers up to sqrt(n).
  while (n % 2 === 0) {
    factors.push(2);
    n = Math.floor(n / 2);
  }
  for (let p = 3; p * p <= n; p += 2) {
    while (n % p === 0) {
      factors.push(p);
      n = Math.floor(n / p);
    }
  }
  if (n > 1) {
    factors.push(n);
  }
  return factors;
}

/**
 * Structural similarity between two atoms, defined as the Jaccard index of
 * their prime-factor multisets (as sets, ignoring multiplicity).
 *
 * Returns a value in [0, 1]; 1 means identical structure.
 */
export function structuralSimilarity(a: number, b: number): number {
  const fa = new Set(decompose(a));
  const fb = new Set(decompose(b));
  const intersection = new Set([...fa].filter((x) => fb.has(x)));
  const union = new Set([...fa, ...fb]);
  if (union.size === 0) return 1;
  return intersection.size / union.size;
}
