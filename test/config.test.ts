import { describe, expect, it } from 'vitest';
import { type AddonConfig, DEFAULT_CONFIG, decodeConfig, encodeConfig } from '../src/config.js';

const b64url = (json: unknown) =>
  btoa(JSON.stringify(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('config in the URL', () => {
  it('round trips', () => {
    const config: AddonConfig = {
      languages: ['fr', 'en'],
      hearingImpaired: 'exclude',
      limit: 20,
      perLanguage: 3,
      styled: 'exclude',
      fallback: 'any',
    };
    expect(decodeConfig(encodeConfig(config))).toEqual(config);
  });

  it('keeps the URL an install already has while the newer settings are left alone', () => {
    // Stremio keys an install on its URL. If the same settings encoded differently
    // after an update, reinstalling from the configure page would add a second copy.
    const before = b64url({ l: ['de'], h: 'prefer', n: 30 });
    const config = {
      ...DEFAULT_CONFIG,
      languages: ['de'],
      hearingImpaired: 'prefer' as const,
      limit: 30,
    };
    expect(encodeConfig(config)).toBe(before);
    expect(decodeConfig(before)).toEqual(config);
  });

  it('refuses a newer setting it does not recognise, one field at a time', () => {
    const decoded = decodeConfig(b64url({ l: ['de'], p: 4, s: 'no', f: 'all' }));
    expect(decoded.languages).toEqual(['de']);
    expect(decoded.perLanguage).toBe(DEFAULT_CONFIG.perLanguage);
    expect(decoded.styled).toBe(DEFAULT_CONFIG.styled);
    expect(decoded.fallback).toBe(DEFAULT_CONFIG.fallback);
    // A number in a string is not the number: the page never writes one.
    expect(decodeConfig(b64url({ p: '3' })).perLanguage).toBe(DEFAULT_CONFIG.perLanguage);
  });

  it('encodes to something a URL path can carry', () => {
    const segment = encodeConfig(DEFAULT_CONFIG);
    expect(segment).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(segment)).toBe(segment);
  });

  it('is the defaults with no segment at all', () => {
    expect(decodeConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(decodeConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(decodeConfig('')).toEqual(DEFAULT_CONFIG);
  });

  it('falls back to the defaults rather than erroring on rubbish', () => {
    // An install whose URL was mangled has to keep working. The alternative is an
    // addon that shows nothing and gives the viewer no way to tell why.
    expect(decodeConfig('not-base64!!')).toEqual(DEFAULT_CONFIG);
    expect(decodeConfig(btoa('[1,2,3]'))).toEqual(DEFAULT_CONFIG);
    expect(decodeConfig('a'.repeat(4096))).toEqual(DEFAULT_CONFIG);
  });

  it('keeps the fields it understands from a config written by another version', () => {
    const segment = b64url({ l: ['de'], h: 'nonsense', n: 'lots' });
    expect(decodeConfig(segment)).toEqual({ ...DEFAULT_CONFIG, languages: ['de'] });
  });

  it('drops anything that is not a two-letter code, and caps the list at 16', () => {
    const languages = ['en', 'FR', 'x', '', 'de'];
    const decoded = decodeConfig(
      encodeConfig({ ...DEFAULT_CONFIG, languages: languages as string[] }),
    );
    expect(decoded.languages).toEqual(['en', 'de']);

    // 16 is the API's own ceiling on a comma separated lang list.
    const many = Array.from({ length: 30 }, (_, i) => `a${String.fromCharCode(97 + (i % 26))}`);
    const capped = decodeConfig(encodeConfig({ ...DEFAULT_CONFIG, languages: many })).languages;
    expect(capped).toHaveLength(16);
  });

  it('clamps limit to what the API will actually serve', () => {
    // The API caps at 100 and clamps silently. Clamping here keeps the number in the
    // URL and the number in the request the same thing.
    expect(decodeConfig(encodeConfig({ ...DEFAULT_CONFIG, limit: 5000 })).limit).toBe(100);
    expect(decodeConfig(encodeConfig({ ...DEFAULT_CONFIG, limit: 0 })).limit).toBe(1);
    expect(decodeConfig(encodeConfig({ ...DEFAULT_CONFIG, limit: -3 })).limit).toBe(1);
  });
});
