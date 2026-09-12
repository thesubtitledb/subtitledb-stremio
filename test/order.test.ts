import { describe, expect, it } from 'vitest';
import type { OrderOptions } from '../src/order.js';
import { dropExcluded, filterLanguages, order, wrongEpisode } from '../src/order.js';
import { row } from './fixtures.js';

const OPTS: OrderOptions = { languages: ['en'], hearingImpaired: 'include' };

function ids(rows: ReturnType<typeof row>[], opts: OrderOptions = OPTS) {
  return order(rows, opts).map((s) => s.id);
}

describe('ordering', () => {
  it('puts the configured language order first, and everything else after it', () => {
    const rows = [
      row({ id: 1, language: 'de' }),
      row({ id: 2, language: 'en' }),
      row({ id: 3, language: 'fr' }),
    ];
    expect(ids(rows, { ...OPTS, languages: ['fr', 'en'] })).toEqual([3, 2, 1]);
  });

  it('offers every language when none was configured', () => {
    const rows = [row({ id: 1, language: 'de' }), row({ id: 2, language: 'en' })];
    expect(ids(rows, { ...OPTS, languages: [] })).toEqual([1, 2]);
  });

  it('prefers the subtitle recorded against the file being played', () => {
    const rows = [
      row({ id: 1, release_name: 'The.Matrix.1999.720p.BluRay.x264-AMIABLE', cues: 1200 }),
      row({ id: 2, release_name: 'The.Matrix.1999.1080p.WEB-DL-RARBG', cues: 900 }),
    ];
    expect(ids(rows, { ...OPTS, filename: 'The.Matrix.1999.1080p.WEB-DL-RARBG.mkv' })).toEqual([
      2, 1,
    ]);
  });

  it('falls back on cue count when the client sent no filename', () => {
    // Newer Stremio clients drop the extras, so this is the ordinary path, not the
    // degraded one.
    const rows = [row({ id: 1, cues: 400 }), row({ id: 2, cues: 1200 })];
    expect(ids(rows)).toEqual([2, 1]);
  });

  it('is stable: the same rows always produce the same menu', () => {
    const rows = [row({ id: 7 }), row({ id: 3 }), row({ id: 5 })];
    expect(ids(rows)).toEqual([3, 5, 7]);
  });

  it('puts hearing impaired subtitles first only when they were asked for', () => {
    const rows = [row({ id: 1 }), row({ id: 2, hearing_impaired: true })];
    expect(ids(rows, { ...OPTS, hearingImpaired: 'prefer' })).toEqual([2, 1]);
    expect(ids(rows, { ...OPTS, hearingImpaired: 'include' })).toEqual([1, 2]);
  });

  it('drops a format the converter cannot turn into WebVTT', () => {
    // Stremio renders what it is handed. A .sub offered here is a track that loads
    // nothing, which reads to the viewer as a broken addon.
    const rows = [row({ id: 1, format: 'sub' }), row({ id: 2, format: 'ass' })];
    expect(ids(rows)).toEqual([2]);
  });

  it('drops a row that names a different episode', () => {
    const rows = [
      row({ id: 1, season: 1, episode: 2 }),
      row({ id: 2, season: 1, episode: 1 }),
      // Unknown, not mismatched: the ingest could not parse it. Kept.
      row({ id: 3, season: null, episode: null }),
    ];
    expect(ids(rows, { ...OPTS, season: 1, episode: 1 })).toEqual([2, 3]);
  });

  it('drops nothing on episode numbers it was not given', () => {
    expect(wrongEpisode(row({ season: 4, episode: 9 }), OPTS)).toBe(false);
  });
});

describe('filters that are not ordering', () => {
  it('excludes hearing impaired rows outright when the viewer said so', () => {
    const rows = [row({ id: 1 }), row({ id: 2, hearing_impaired: true })];
    expect(dropExcluded(rows, 'exclude').map((s) => s.id)).toEqual([1]);
    expect(dropExcluded(rows, 'prefer')).toHaveLength(2);
  });

  it('filters languages locally, for the bundles the API does not filter', () => {
    const rows = [row({ id: 1, language: 'ar' }), row({ id: 2, language: 'en' })];
    expect(filterLanguages(rows, ['en']).map((s) => s.id)).toEqual([2]);
    expect(filterLanguages(rows, [])).toHaveLength(2);
  });
});
