import { describe, expect, it } from 'vitest';
import { encodeConfig } from '../src/config.js';
import { route } from '../src/worker.js';
import { ASS, bundle, ENV, row, SRT, stubFetch } from './fixtures.js';

function get(path: string, fetchImpl?: typeof fetch) {
  return route(new Request(`https://stremio.example.test${path}`), ENV, { fetch: fetchImpl });
}

const LOOKUP = { match: /by-imdb/, body: bundle([row({ id: 1 }), row({ id: 2, language: 'fr' })]) };

/**
 * The addon is mounted under a path on the read API's own hostname, not on a name of
 * its own, so the prefix is load bearing: strip too little and every route 404s,
 * strip too eagerly and the Worker answers for paths that belong to the API.
 */
describe('the mount point', () => {
  const MOUNTED = { ...ENV, ADDON_BASE: 'https://api.example.test/integrations/stremio' };
  const at = (path: string) =>
    route(new Request(`https://api.example.test${path}`), MOUNTED, {
      fetch: stubFetch([LOOKUP]).fetch,
    });

  it('answers its routes underneath the prefix', async () => {
    const res = await at('/integrations/stremio/manifest.json');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }).id).toBe('org.thesubtitledb.stremio');
  });

  it('builds every URL it hands out with the prefix on it', async () => {
    const res = await at('/integrations/stremio/subtitles/movie/tt0133093.json');
    const body = (await res.json()) as { subtitles: { url: string }[] };
    expect(body.subtitles.length).toBeGreaterThan(0);
    for (const s of body.subtitles) {
      expect(s.url.startsWith('https://api.example.test/integrations/stremio/s/')).toBe(true);
    }
    // The logo sits on the mount too, or the manifest points at a 404 on the API host.
    const m = (await (await at('/integrations/stremio/manifest.json')).json()) as { logo: string };
    expect(m.logo).toBe('https://api.example.test/integrations/stremio/logo.png');
  });

  it('refuses everything outside the prefix, rather than shadowing the API', async () => {
    // If the route pattern is ever widened by accident, this is the difference between
    // a 404 and the addon answering for /v1 and /get.
    for (const path of [
      '/manifest.json',
      '/v1/by-imdb/tt0133093',
      '/get/1',
      '/integrations/manifest.json',
      '/integrations/stremiox/manifest.json',
    ]) {
      const res = await at(path);
      expect(res.status, path).toBe(404);
    }
  });

  it('sends the bare mount point to the configure page', async () => {
    const res = await at('/integrations/stremio');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      'https://api.example.test/integrations/stremio/configure',
    );
  });
});

describe('the protocol surface', () => {
  it('serves a manifest that says what it can do', async () => {
    const res = await get('/manifest.json');
    expect(res.status).toBe(200);
    const m = (await res.json()) as Record<string, unknown>;
    expect(m.id).toBe('org.thesubtitledb.stremio');
    expect(m.resources).toEqual(['subtitles']);
    expect(m.types).toEqual(['movie', 'series']);
    expect(m.idPrefixes).toEqual(['tt']);
  });

  it('serves the manifest with CORS, which is where addons usually get this wrong', async () => {
    // web.stremio.com is a browser page fetching a third-party origin. A manifest
    // without CORS fails there and nowhere else, so it is easy to ship broken.
    const res = await get('/manifest.json');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('serves the same manifest under a config segment', async () => {
    const cfg = encodeConfig({ languages: ['de'], hearingImpaired: 'exclude', limit: 10 });
    const res = await get(`/${cfg}/manifest.json`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }).id).toBe('org.thesubtitledb.stremio');
  });

  it('answers a preflight', async () => {
    const res = await route(
      new Request('https://stremio.example.test/manifest.json', { method: 'OPTIONS' }),
      ENV,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('serves a configure page, at both the bare and the configured path', async () => {
    const bare = await get('/configure');
    expect(bare.headers.get('content-type')).toContain('text/html');
    expect(await bare.text()).toContain('Install in Stremio');

    const cfg = encodeConfig({ languages: ['fr'], hearingImpaired: 'prefer', limit: 7 });
    const body = await (await get(`/${cfg}/configure`)).text();
    // The page opens with the settings the install already has, not the defaults,
    // and all three are drawn server-side so they are right before the script runs.
    expect(body).toContain('data-code="fr"');
    expect(body).toContain('value="prefer" checked');
    expect(body).toContain('value="7"');
  });

  it('sends the root at the configure page', async () => {
    const res = await get('/');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://stremio.example.test/configure');
  });

  it('reports its health for a deploy probe', async () => {
    const res = await get('/health');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });
});

describe('subtitles', () => {
  it('answers a film with rows pointing at this addon, not at the API', async () => {
    // The URLs have to come back here: the API serves the stored bytes, and Stremio
    // renders nothing for the ass and ssa half of them.
    const { fetch, calls } = stubFetch([LOOKUP]);
    const res = await get('/subtitles/movie/tt0133093.json', fetch);
    const body = (await res.json()) as { subtitles: { id: string; url: string; lang: string }[] };

    expect(body.subtitles).toHaveLength(2);
    expect(body.subtitles[0]?.url).toBe('https://stremio.example.test/s/1.vtt');
    expect(body.subtitles[0]?.lang).toBe('eng');
    expect(body.subtitles[0]?.id).toBe('sdb-1');
    expect(calls).toHaveLength(1);
  });

  it('drills to the episode a series id names', async () => {
    const { fetch, calls } = stubFetch([LOOKUP]);
    await get('/subtitles/series/tt0944947:1:1.json', fetch);
    expect(calls[0]?.url).toContain('/v1/by-imdb/tt0944947/season/1/episode/1');
  });

  it('asks each configured language on its own, so one cannot starve the others', async () => {
    // It used to send all of them as one comma separated list, which is what the API
    // documents. But the API applies one limit across the whole list and fills it in
    // its own order, so the second language came back empty and ranking had nothing
    // to rank. test/fanout.test.ts owns the detail; this pins that the route spends
    // the requests rather than the client library doing it somewhere else.
    const cfg = encodeConfig({ languages: ['fr', 'en'], hearingImpaired: 'include', limit: 25 });
    const { fetch, calls } = stubFetch([LOOKUP]);
    await get(`/${cfg}/subtitles/movie/tt0133093.json`, fetch);

    expect(calls).toHaveLength(2);
    expect(calls.map((c) => new URL(c.url).searchParams.get('lang'))).toEqual(['fr', 'en']);
    // 25 across two, so neither can eat the other's share.
    for (const call of calls) expect(call.url).toContain('limit=13');
  });

  it('answers an unknown title with an empty list, not an error', async () => {
    // Stremio renders an addon that errors as broken. A film we do not hold is not a
    // broken addon.
    const { fetch } = stubFetch([{ match: /by-imdb/, status: 404, body: { error: 'not_found' } }]);
    const res = await get('/subtitles/movie/tt9999999.json', fetch);
    expect(res.status).toBe(200);
    expect((await res.json()) as { subtitles: unknown[] }).toEqual(
      expect.objectContaining({ subtitles: [] }),
    );
  });

  it('answers an id from another addon space with an empty list and no request', async () => {
    const { fetch, calls } = stubFetch([LOOKUP]);
    const res = await get('/subtitles/movie/kitsu:1234.json', fetch);
    expect(((await res.json()) as { subtitles: unknown[] }).subtitles).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('filters locally when the API served a tree it does not filter', async () => {
    // lang is ignored on a whole series bundle. Trusting it there hands a viewer who
    // asked for English whatever came back alphabetically.
    const series = bundle([row({ id: 1, language: 'ar' }), row({ id: 2, language: 'en' })], [{}]);
    const { fetch } = stubFetch([{ match: /by-imdb/, body: series }]);
    const res = await get('/subtitles/series/tt0944947.json', fetch);
    const body = (await res.json()) as { subtitles: { id: string }[] };
    expect(body.subtitles.map((s) => s.id)).toEqual(['sdb-2']);
  });

  it('caches a hit for longer than a miss', async () => {
    const { fetch } = stubFetch([LOOKUP]);
    const hit = await get('/subtitles/movie/tt0133093.json', fetch);
    const miss = await get('/subtitles/movie/kitsu:1.json', fetch);
    expect(hit.headers.get('cache-control')).toContain('max-age=1800');
    expect(miss.headers.get('cache-control')).toContain('max-age=300');
  });
});

describe('subtitle bytes', () => {
  it('converts SubRip to WebVTT and serves it as such', async () => {
    const { fetch } = stubFetch([{ match: /\/get\/1$/, text: SRT }]);
    const res = await get('/s/1.vtt', fetch);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/vtt; charset=utf-8');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(body.startsWith('WEBVTT')).toBe(true);
    expect(body).toContain('00:00:01.000 --> 00:00:02.000');
  });

  it('converts SubStation Alpha, which is the whole reason this route exists', async () => {
    const { fetch } = stubFetch([
      { match: /\/get\/9$/, text: ASS, headers: { 'content-type': 'text/x-ssa' } },
    ]);
    const body = await (await get('/s/9.vtt', fetch)).text();
    expect(body.startsWith('WEBVTT')).toBe(true);
    expect(body).toContain('hello there');
    // The override tag is styling WebVTT cannot express, and reads as dialogue if kept.
    expect(body).not.toContain('an8');
  });

  it('serves bytes as immutable, so a cache hit costs no request upstream', async () => {
    const { fetch } = stubFetch([{ match: /\/get\/1$/, text: SRT }]);
    const res = await get('/s/1.vtt', fetch);
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('says a row did not parse rather than serving an empty track', async () => {
    // An empty WEBVTT file is a working subtitle as far as Stremio is concerned: the
    // track appears, the viewer selects it, and nothing ever shows.
    const { fetch } = stubFetch([{ match: /\/get\/1$/, text: 'not a subtitle at all' }]);
    const res = await get('/s/1.vtt', fetch);
    expect(res.status).toBe(422);
  });

  it('reports an upstream failure as one', async () => {
    const { fetch } = stubFetch([{ match: /\/get\/1$/, status: 500, body: {} }]);
    expect((await get('/s/1.vtt', fetch)).status).toBe(502);
  });

  it('refuses a path that is not a subtitle id', async () => {
    expect((await get('/s/abc.vtt')).status).toBe(404);
  });
});

describe('everything else', () => {
  it('404s an unknown route', async () => {
    expect((await get('/nope')).status).toBe(404);
  });

  it('refuses a method the protocol never uses', async () => {
    const res = await route(
      new Request('https://stremio.example.test/manifest.json', { method: 'POST' }),
      ENV,
    );
    expect(res.status).toBe(405);
  });
});
