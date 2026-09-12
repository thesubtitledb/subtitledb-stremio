/**
 * The shared cases, read a sixth time.
 *
 * plugins/shared/match-cases.json is the file the TypeScript, Python, C# and Lua
 * suites in subtitledb-cdn all read, so that a rule changed in one language fails the
 * others' CI rather than quietly giving a Kodi user a different subtitle from a
 * browser user. This addon is in a different repository, which is a new way for the
 * same drift to happen, so it reads the same file: the copy in test/fixtures is
 * checked byte for byte against upstream by tools/check-upstream.mjs.
 *
 * Two of the three sections apply here.
 *
 *   similarity   the release-name comparison, vendored verbatim in src/upstream
 *   languages    every spelling a viewer might type, resolved to a corpus code. The
 *                upstream TypeScript reader skips the resolution half of these, since
 *                the web bindings take a code from their own config and never resolve
 *                a spelling. This addon has a text box, so it asserts all of it.
 *
 * subtitle_ranking is deliberately not read. Stremio orders a menu the viewer picks
 * from, where every entry is already WebVTT by the time it is fetched; the players
 * pick one track to attach and have to weigh formats the player may not render. Those
 * are different jobs, and pretending otherwise here would pin this addon to a rule it
 * does not follow. The part the two do share, similarity, is above.
 */

import { describe, expect, it } from 'vitest';
import { languageName, toCode } from '../src/languages.js';
import { similarity } from '../src/upstream/similarity.js';
import raw from './fixtures/match-cases.json';

interface SimilarityCase {
  a: string;
  b: string;
  min?: number;
  max?: number;
  why?: string;
}

interface LanguageCase {
  input: string;
  code: string | null;
  name: string | null;
  why?: string;
}

// Imported rather than read off disk, so this suite needs no node types and no
// cwd-relative path. The copy is checked against upstream by tools/check-upstream.mjs.
const cases = raw as unknown as { similarity: SimilarityCase[]; languages: LanguageCase[] };

describe('similarity', () => {
  for (const c of cases.similarity) {
    it(c.why ?? `${c.a} against ${c.b}`, () => {
      const got = similarity(c.a, c.b);
      if (c.min !== undefined) expect(got).toBeGreaterThanOrEqual(c.min - 1e-9);
      if (c.max !== undefined) expect(got).toBeLessThanOrEqual(c.max + 1e-9);
    });
  }
});

describe('language spellings', () => {
  for (const c of cases.languages) {
    it(c.why ?? `${c.input || 'an empty string'} resolves to ${c.code ?? 'nothing'}`, () => {
      const code = toCode(c.input);
      expect(code).toBe(c.code);
      if (c.name === null) expect(code).toBeNull();
      else expect(languageName(code as string)).toBe(c.name);
    });
  }
});
