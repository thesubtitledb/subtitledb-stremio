import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, decodeConfig, encodeConfig } from '../src/config.js';

describe('config in the URL', () => {
  it('round trips', () => {
    const config = { languages: ['fr', 'en'], hearingImpaired: 'exclude' as const, limit: 20 };
    expect(decodeConfig(encodeConfig(config))).toEqual(config);
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
    const segment = btoa(JSON.stringify({ l: ['de'], h: 'nonsense', n: 'lots' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodeConfig(segment)).toEqual({
      languages: ['de'],
      hearingImpaired: DEFAULT_CONFIG.hearingImpaired,
      limit: DEFAULT_CONFIG.limit,
    });
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
