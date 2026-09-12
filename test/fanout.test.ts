/**
 * One request per language.
 *
 * The API takes `lang` as a comma separated list but applies one `limit` across the
 * whole list and fills it in its own order. Measured live before this was written:
 * `?lang=fr,en&limit=100` on tt0111161 returns 100 English rows and 0 French, though
 * French subtitles exist for it. Ranking cannot fix that -- `order()` can only rank
 * what came back -- so the second language a viewer picks came back empty and the
 * page's promise that the first pick is offered first was true of nothing.
 *
 * The configure page turns picking five languages into five clicks, so this is the
 * path it now sends people down.
 */

import { describe, expect, it } from 'vitest';
import { lookupAll } from '../src/api.js';
import { encodeConfig } from '../src/config.js';
import { route } from '../src/worker.js';
import { bundle, ENV, row, stubFetch } from './fixtures.js';

const OPTS = (fetchImpl: typeof fetch) => ({ base: ENV.API_BASE, fetch: fetchImpl });

/** The API's behaviour, stubbed honestly: whatever `lang` says, that is what comes back. */
function byLang(perLanguage: Record<string, number>) {
  let id = 1;
  return Object.entries(perLanguage).map(([lang, count]) => ({
    match: new RegExp(`lang=${lang}(?:&|$)`),
    body: bundle(Array.from({ length: count }, () => row({ id: id++, language: lang }))),
  }));
}

describe('asking for more than one language', () => {
  it('sends one request per language, each with its own share of the limit', async () => {
    const stub = stubFetch(byLang({ fr: 2, en: 2 }));
    await lookupAll({ imdb: 'tt0133093', languages: ['fr', 'en'], limit: 50 }, OPTS(stub.fetch));
    expect(stub.calls.length).toBe(2);
    expect(stub.calls[0]?.url).toContain('lang=fr');
    expect(stub.calls[1]?.url).toContain('lang=en');
    // 50 across two languages, so neither can eat the other's half.
    for (const call of stub.calls) expect(call.url).toContain('limit=25');
  });

  it('comes back with rows in every language, not just the one the API filled first', async () => {
    const stub = stubFetch(byLang({ fr: 3, en: 3 }));
    const result = await lookupAll(
      { imdb: 'tt0133093', languages: ['fr', 'en'], limit: 50 },
      OPTS(stub.fetch),
    );
    const langs = new Set(result?.bundle.subtitles.items.map((s) => s.language));
    expect(langs).toEqual(new Set(['fr', 'en']));
  });

  it('spends one request when only one language is asked for', async () => {
    const stub = stubFetch(byLang({ en: 2 }));
    await lookupAll({ imdb: 'tt0133093', languages: ['en'], limit: 50 }, OPTS(stub.fetch));
    expect(stub.calls.length).toBe(1);
    expect(stub.calls[0]?.url).toContain('limit=50');
  });

  it('stops at one request on a series root, where the API ignores lang anyway', async () => {
    // A whole-series bundle comes back unfiltered whatever lang says, so the other
    // languages would be n identical requests for one identical tree. The worker
    // filters that case locally instead.
    const stub = stubFetch([{ match: /by-imdb/, body: bundle([row({ id: 1 })], [{ season: 1 }]) }]);
    const result = await lookupAll(
      { imdb: 'tt0944947', languages: ['fr', 'en'], limit: 50 },
      OPTS(stub.fetch),
    );
    expect(stub.calls.length).toBe(1);
    expect(result?.filtered).toBe(false);
  });

  it('never lets a share fall to zero, however many languages are picked', async () => {
    const many = ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'sv', 'da', 'fi'];
    const stub = stubFetch(byLang(Object.fromEntries(many.map((l) => [l, 1]))));
    await lookupAll({ imdb: 'tt0133093', languages: many, limit: 5 }, OPTS(stub.fetch));
    for (const call of stub.calls) expect(call.url).toContain('limit=1');
  });

  it('counts a file once when two languages return the same id', async () => {
    const shared = row({ id: 99, language: 'fr' });
    const stub = stubFetch([
      { match: /lang=fr(?:&|$)/, body: bundle([shared]) },
      { match: /lang=en(?:&|$)/, body: bundle([shared, row({ id: 100 })]) },
    ]);
    const result = await lookupAll(
      { imdb: 'tt0133093', languages: ['fr', 'en'], limit: 50 },
      OPTS(stub.fetch),
    );
    expect(result?.bundle.subtitles.items.map((s) => s.id)).toEqual([99, 100]);
  });
});

describe('what the viewer ends up seeing', () => {
  it('offers the second language they picked, ranked behind the first', async () => {
    // The whole point. Before this, a two-language install was a one-language install
    // that looked like a two-language install.
    const stub = stubFetch(byLang({ fr: 2, en: 2 }));
    const config = encodeConfig({
      languages: ['fr', 'en'],
      hearingImpaired: 'include',
      limit: 50,
    });
    const res = await route(
      new Request(`https://stremio.example.test/${config}/subtitles/movie/tt0133093.json`),
      ENV,
      { fetch: stub.fetch },
    );
    const body = (await res.json()) as { subtitles: { lang: string }[] };
    expect(body.subtitles.length).toBe(4);
    expect(body.subtitles.map((s) => s.lang)).toEqual(['fre', 'fre', 'eng', 'eng']);
  });
});
