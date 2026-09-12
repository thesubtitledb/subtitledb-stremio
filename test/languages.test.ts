import { describe, expect, it } from 'vitest';
import { toCode, toCodes, toStremioLang } from '../src/languages.js';

describe('what goes in a subtitle lang field', () => {
  it('is ISO 639-2 where the language has one', () => {
    expect(toStremioLang('en')).toBe('eng');
    expect(toStremioLang('pt')).toBe('por');
    expect(toStremioLang('ja')).toBe('jpn');
  });

  it('is the bibliographic form, which is what other subtitle addons send', () => {
    // Sending fra where everyone else sends fre puts our French in its own group in
    // a client that groups by string.
    expect(toStremioLang('fr')).toBe('fre');
    expect(toStremioLang('de')).toBe('ger');
    expect(toStremioLang('zh')).toBe('chi');
    expect(toStremioLang('cs')).toBe('cze');
  });

  it('is a readable name for the four codes with no ISO 639-2 form', () => {
    // Stremio displays the raw string when it does not recognise it, so a name is
    // read by the viewer and a three-letter guess is not.
    expect(toStremioLang('pb')).toBe('Portuguese (Brazil)');
    expect(toStremioLang('zt')).toBe('Chinese (traditional)');
    expect(toStremioLang('ze')).toBe('Chinese (bilingual)');
    expect(toStremioLang('pm')).toBe('Portuguese (Mozambique)');
  });

  it('passes an unknown code through rather than dropping the subtitle', () => {
    expect(toStremioLang('qq')).toBe('qq');
  });
});

describe('language lists from the configure page', () => {
  it('reads a comma separated list in the order it was given', () => {
    expect(toCodes('fr, en, de')).toEqual(['fr', 'en', 'de']);
  });

  it('accepts names and three-letter codes alongside two-letter ones', () => {
    expect(toCodes('English, fra, Brazilian Portuguese')).toEqual(['en', 'fr', 'pb']);
  });

  it('deduplicates, because a duplicate is a wasted slot in a list capped at 16', () => {
    expect(toCodes('en, eng, English')).toEqual(['en']);
  });

  it('is empty for empty input, which means no language filter at all', () => {
    expect(toCodes('')).toEqual([]);
    expect(toCodes(null)).toEqual([]);
    expect(toCode('')).toBeNull();
  });
});
