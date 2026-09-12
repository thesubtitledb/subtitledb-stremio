/**
 * Release-name similarity, vendored verbatim from subtitledb-cdn.
 *
 * Source: packages/core/src/match.ts in thesubtitledb/subtitledb-cdn.
 *
 * This addon cannot import @subtitledb/core: it is a private workspace package,
 * UNLICENSED and not published. So the one function this repo shares with the four
 * player and media-server ports is copied instead, and tools/check-upstream.mjs
 * fails CI when the copy stops being a substring of the upstream file. The markers
 * below are what that check reads; do not edit between them by hand.
 */

// --- BEGIN VERBATIM packages/core/src/match.ts ---
function normalise(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      // Strip combining marks so "Amelie" and "Amelie" with an accent compare equal.
      // Uses a Unicode property escape so this source file stays pure ASCII.
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  );
}

/** Dice coefficient over bigrams. Cheap, and forgiving of word order and punctuation. */
export function similarity(a: string, b: string): number {
  const x = normalise(a);
  const y = normalise(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const ga = grams(x);
  const gb = grams(y);
  let overlap = 0;
  let total = 0;
  for (const n of ga.values()) total += n;
  for (const [g, n] of gb) {
    total += n;
    const have = ga.get(g);
    if (have) overlap += Math.min(have, n);
  }
  return total === 0 ? 0 : (2 * overlap) / total;
}
// --- END VERBATIM ---
