/**
 * The addon against the live API.
 *
 * These drive the real routes with the real fetch, so a red run here means
 * api.thesubtitledb.org changed under the addon. That is the only thing that proves
 * the two agree: every unit test above this one is stubbed, and a stub is a record of
 * what the API did on the day it was written.
 *
 * Blocking in CI, in its own job. See .github/workflows/ci.yml.
 */

import { describe, expect, it } from 'vitest';
import { encodeConfig } from '../src/config.js';
import type { Env } from '../src/types.js';
import { route } from '../src/worker.js';

const ENV: Env = {
  API_BASE: 'https://api.thesubtitledb.org',
  ADDON_BASE: 'https://api.thesubtitledb.org/integrations/stremio',
};

const MOVIE = 'tt0133093'; // The Matrix, and one of the few titles with ass rows
const SERIES = 'tt0944947'; // Game of Thrones

interface SubtitlesBody {
  subtitles: { id: string; url: string; lang: string; SubEncoding?: string }[];
  cacheMaxAge?: number;
}

function get(path: string) {
  return route(new Request(`${ENV.ADDON_BASE}${path}`), ENV);
}

async function subtitles(path: string): Promise<SubtitlesBody> {
  const res = await get(path);
  expect(res.status).toBe(200);
  return (await res.json()) as SubtitlesBody;
}

describe('subtitles from the live corpus', () => {
  it('answers a film', async () => {
    const body = await subtitles(`/subtitles/movie/${MOVIE}.json`);
    expect(body.subtitles.length).toBeGreaterThan(0);
    for (const s of body.subtitles) {
      expect(s.url).toMatch(
        /^https:\/\/api\.thesubtitledb\.org\/integrations\/stremio\/s\/\d+\.vtt$/,
      );
      expect(s.id).toMatch(/^sdb-\d+$/);
      expect(s.SubEncoding).toBe('UTF-8');
    }
  });

  it('answers a series episode, drilled by the season and episode in the id', async () => {
    const body = await subtitles(`/subtitles/series/${SERIES}:1:1.json`);
    expect(body.subtitles.length).toBeGreaterThan(0);
  });

  it('gets rows with no season or episode on them from a drill', async () => {
    // Not null: absent. A row-level check that reads absent as a mismatch drops every
    // subtitle for every episode, which is how this was found.
    const res = await fetch(
      `${ENV.API_BASE}/v1/by-imdb/${SERIES}/season/1/episode/1?limit=1&client=stremio-live-test`,
    );
    const bundle = (await res.json()) as { subtitles: { items: Record<string, unknown>[] } };
    const first = bundle.subtitles.items[0];
    expect(first).toBeDefined();
    expect(Object.hasOwn(first as object, 'season')).toBe(false);
    expect(Object.hasOwn(first as object, 'episode')).toBe(false);
  });

  it('sends a three-letter language, which is what the protocol asks for', async () => {
    const body = await subtitles(`/subtitles/movie/${MOVIE}.json`);
    expect(body.subtitles[0]?.lang).toBe('eng');
  });

  it('honours a configured language', async () => {
    const cfg = encodeConfig({ languages: ['fr'], hearingImpaired: 'include', limit: 20 });
    const body = await subtitles(`/${cfg}/subtitles/movie/${MOVIE}.json`);
    expect(body.subtitles.length).toBeGreaterThan(0);
    expect(new Set(body.subtitles.map((s) => s.lang))).toEqual(new Set(['fre']));
  });

  it('filters a whole-series bundle itself, because the API does not', async () => {
    // lang is ignored on a series bundle by design: the tree is served unfiltered.
    // The addon filters locally there, and this is what proves it still needs to.
    const cfg = encodeConfig({ languages: ['en'], hearingImpaired: 'include', limit: 100 });
    const body = await subtitles(`/${cfg}/subtitles/series/${SERIES}.json`);
    for (const s of body.subtitles) expect(s.lang).toBe('eng');
  });

  it('answers an unmapped id with an empty list rather than an error', async () => {
    const body = await subtitles('/subtitles/movie/tt99999999.json');
    expect(body.subtitles).toEqual([]);
    expect(body.cacheMaxAge).toBe(300);
  });
});

describe('bytes, converted', () => {
  it('turns a real SubRip row into WebVTT with real cues', async () => {
    const body = await subtitles(`/subtitles/movie/${MOVIE}.json`);
    const id = body.subtitles[0]?.url.match(/\/s\/(\d+)\.vtt$/)?.[1];
    expect(id).toBeDefined();

    const res = await get(`/s/${id}.vtt`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/vtt; charset=utf-8');
    const text = await res.text();
    expect(text.startsWith('WEBVTT')).toBe(true);
    expect(text).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/);
  });

  it('turns a real SubStation Alpha row into WebVTT, which is why this route exists', async () => {
    // Handed to Stremio unconverted, every ass and ssa row in the corpus renders
    // nothing. Finding one live rather than pinning an id keeps this honest if the
    // row is ever removed.
    const res = await fetch(
      `${ENV.API_BASE}/v1/by-imdb/${MOVIE}?format=ass&limit=5&client=stremio-live-test`,
    );
    expect(res.status).toBe(200);
    const found = (await res.json()) as { subtitles: { items: { id: number; format: string }[] } };
    const row = found.subtitles.items.find((s) => s.format === 'ass' || s.format === 'ssa');
    expect(row, 'no ass or ssa row live to convert').toBeDefined();

    const vtt = await get(`/s/${row?.id}.vtt`);
    expect(vtt.status).toBe(200);
    const text = await vtt.text();
    expect(text.startsWith('WEBVTT')).toBe(true);
    expect(text).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/);
    // Override tags are styling WebVTT cannot express; kept, they read as dialogue.
    expect(text).not.toMatch(/\{\\/);
  });
});
