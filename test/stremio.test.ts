import { describe, expect, it } from 'vitest';
import { parseAddonPath, parseContentId, parseExtra } from '../src/stremio.js';

describe('content ids', () => {
  it('reads a film', () => {
    expect(parseContentId('tt0133093')).toEqual({ imdb: 'tt0133093' });
  });

  it('reads the season and episode a series id carries', () => {
    expect(parseContentId('tt0944947:1:1')).toEqual({ imdb: 'tt0944947', season: 1, episode: 1 });
  });

  it('keeps season 0, because specials are a real season on this API', () => {
    expect(parseContentId('tt0944947:0:2')).toEqual({ imdb: 'tt0944947', season: 0, episode: 2 });
  });

  it('reads an id a client percent-encoded', () => {
    expect(parseContentId('tt0944947%3A2%3A5')).toEqual({
      imdb: 'tt0944947',
      season: 2,
      episode: 5,
    });
  });

  it('refuses another addon id space rather than guessing a film', () => {
    // The manifest says idPrefixes ['tt'], and clients ask anyway. An addon that
    // coerces kitsu:1234 into an IMDb id answers with the wrong film's subtitles.
    expect(parseContentId('kitsu:1234')).toBeNull();
    expect(parseContentId('tt0944947:1')).toBeNull();
    expect(parseContentId('tt0944947:x:1')).toBeNull();
    expect(parseContentId('')).toBeNull();
  });
});

describe('extra arguments', () => {
  it('reads the path segment form', () => {
    const extra = parseExtra('filename=The.Matrix.1999.mkv&videoSize=700', new URLSearchParams());
    expect(extra.filename).toBe('The.Matrix.1999.mkv');
    expect(extra.videoSize).toBe('700');
  });

  it('reads the query string form, which newer clients use', () => {
    const extra = parseExtra(undefined, new URLSearchParams('filename=a.mkv'));
    expect(extra.filename).toBe('a.mkv');
  });

  it('is empty when a client sends nothing, which newer clients also do', () => {
    expect(parseExtra(undefined, new URLSearchParams())).toEqual({});
  });

  it('decodes a value that was percent-encoded', () => {
    const extra = parseExtra('filename=A%20Film%20(2019).mkv', new URLSearchParams());
    expect(extra.filename).toBe('A Film (2019).mkv');
  });

  it('keeps a malformed encoding rather than failing the whole request', () => {
    const extra = parseExtra('filename=100%', new URLSearchParams());
    expect(extra.filename).toBe('100%');
  });
});

describe('addon paths', () => {
  it('reads a bare resource path', () => {
    expect(parseAddonPath('/subtitles/movie/tt0133093.json')).toEqual({
      config: null,
      resource: 'subtitles',
      type: 'movie',
      id: 'tt0133093',
      extra: undefined,
    });
  });

  it('reads a resource path with extras', () => {
    expect(parseAddonPath('/subtitles/series/tt0944947:1:1/filename=x.mkv.json')).toEqual({
      config: null,
      resource: 'subtitles',
      type: 'series',
      id: 'tt0944947:1:1',
      extra: 'filename=x.mkv',
    });
  });

  it('reads a configured install, where the config is the first segment', () => {
    const got = parseAddonPath('/eyJsIjpbImVuIl19/subtitles/movie/tt0133093.json');
    expect(got?.config).toBe('eyJsIjpbImVuIl19');
    expect(got?.id).toBe('tt0133093');
  });

  it('rejects a path that is not a resource request', () => {
    expect(parseAddonPath('/manifest.json')).toBeNull();
    expect(parseAddonPath('/subtitles/movie/tt1')).toBeNull();
    expect(parseAddonPath('/a/b/c/d/e/f.json')).toBeNull();
  });

  it('parses a resource this addon does not serve, and names it', () => {
    // The router refuses on the resource rather than here, so a future `stream` or
    // `meta` route is a branch to add, not a parser to change.
    expect(parseAddonPath('/cfg/stream/movie/tt1.json')?.resource).toBe('stream');
  });
});
