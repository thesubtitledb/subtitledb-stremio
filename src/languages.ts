/**
 * Codes in, codes out.
 *
 * Two directions, and they are not inverses of each other.
 *
 * Inbound, `toCode` takes whatever a viewer typed into the configure page and returns
 * the two-letter code the API filters on. The same resolver the media-server ports
 * carry, because a Stremio user types "Brazilian Portuguese" for the same reason a
 * Kodi user does. plugins/shared/match-cases.json pins it, and test/shared-cases
 * asserts every case in that file.
 *
 * Outbound, `toStremioLang` takes a corpus code and returns what goes in the `lang`
 * field of a subtitle. The protocol asks for ISO 639-2 and the client falls back to
 * displaying the raw string, so the four OpenSubtitles codes that have no ISO 639-2
 * form are sent as their English label rather than as a three-letter guess: a viewer
 * reading "Portuguese (Brazil)" is served, one reading "pob" is not.
 */

import { hasLanguageName, languageName } from './upstream/languages.js';

export { hasLanguageName, languageName };

/**
 * Spellings that are not simply the alpha-3 form of the code.
 *
 * Regional tags that the corpus files under a different code, the two pre-1989 codes
 * some hosts still emit, and the alpha-3s of the OpenSubtitles-only codes.
 */
const ALIASES: Record<string, string> = {
  'pt-br': 'pb',
  pob: 'pb',
  pbr: 'pb',
  'brazilian portuguese': 'pb',
  'portuguese brazilian': 'pb',
  'pt-pt': 'pt',
  'pt-mz': 'pm',
  'zh-hant': 'zt',
  'zh-tw': 'zt',
  'zh-hk': 'zt',
  zht: 'zt',
  'zh-hans': 'zh',
  'zh-cn': 'zh',
  zhe: 'ze',
  // Superseded ISO 639-1 codes. Some hosts, and some Java stacks, still emit them.
  iw: 'he',
  in: 'id',
  ji: 'yi',
  // Norwegian: the corpus files Bokmal and Nynorsk under the macrolanguage.
  nb: 'no',
  nn: 'no',
  nob: 'no',
  nno: 'no',
};

/**
 * ISO 639-2 to the corpus code, both the bibliographic and terminological forms.
 *
 * Only the codes the corpus actually uses. An alpha-3 outside this table falls through
 * to `toCode`'s pass-through rules rather than resolving to something plausible.
 */
const ALPHA3: Record<string, string> = {
  ara: 'ar',
  bul: 'bg',
  ben: 'bn',
  bos: 'bs',
  cat: 'ca',
  ces: 'cs',
  cze: 'cs',
  dan: 'da',
  deu: 'de',
  ger: 'de',
  ell: 'el',
  gre: 'el',
  eng: 'en',
  epo: 'eo',
  spa: 'es',
  est: 'et',
  baq: 'eu',
  eus: 'eu',
  fas: 'fa',
  per: 'fa',
  fin: 'fi',
  fra: 'fr',
  fre: 'fr',
  glg: 'gl',
  heb: 'he',
  hin: 'hi',
  hrv: 'hr',
  hun: 'hu',
  arm: 'hy',
  hye: 'hy',
  ind: 'id',
  ice: 'is',
  isl: 'is',
  ita: 'it',
  jpn: 'ja',
  geo: 'ka',
  kat: 'ka',
  kaz: 'kk',
  khm: 'km',
  kor: 'ko',
  kur: 'ku',
  lit: 'lt',
  lav: 'lv',
  mac: 'mk',
  mkd: 'mk',
  mal: 'ml',
  mon: 'mn',
  may: 'ms',
  msa: 'ms',
  bur: 'my',
  mya: 'my',
  dut: 'nl',
  nld: 'nl',
  nor: 'no',
  oci: 'oc',
  pol: 'pl',
  por: 'pt',
  ron: 'ro',
  rum: 'ro',
  rus: 'ru',
  sin: 'si',
  slk: 'sk',
  slo: 'sk',
  slv: 'sl',
  alb: 'sq',
  sqi: 'sq',
  srp: 'sr',
  swe: 'sv',
  swa: 'sw',
  tam: 'ta',
  tel: 'te',
  tha: 'th',
  tgl: 'tl',
  tur: 'tr',
  tat: 'tt',
  ukr: 'uk',
  urd: 'ur',
  uzb: 'uz',
  vie: 'vi',
  chi: 'zh',
  zho: 'zh',
  yid: 'yi',
};

/** The corpus code to the ISO 639-2/B form Stremio asks for. Built from ALPHA3. */
const TO_ALPHA3: Record<string, string> = (() => {
  // ISO 639-2 has two forms for nineteen languages and Stremio takes either. The
  // bibliographic one is what the OpenSubtitles addon sends, so it is what is used
  // here: a client that groups by string groups ours with theirs.
  const BIBLIOGRAPHIC: Record<string, string> = {
    cs: 'cze',
    de: 'ger',
    el: 'gre',
    eu: 'baq',
    fa: 'per',
    fr: 'fre',
    hy: 'arm',
    is: 'ice',
    ka: 'geo',
    mk: 'mac',
    ms: 'may',
    my: 'bur',
    nl: 'dut',
    ro: 'rum',
    sk: 'slo',
    sq: 'alb',
    zh: 'chi',
  };
  const out: Record<string, string> = { ...BIBLIOGRAPHIC };
  for (const [three, two] of Object.entries(ALPHA3)) {
    if (!out[two]) out[two] = three;
  }
  return out;
})();

/** Names to codes, including the punctuation-free spelling of a parenthesised name. */
const BY_NAME: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const code of namedCodes()) {
    const name = languageName(code).toLowerCase();
    out[name] = code;
    const plain = name.replace(/[()]/g, ' ').split(/\s+/).filter(Boolean).join(' ');
    if (plain !== name) out[plain] = code;
  }
  return out;
})();

/** Every code the vendored name table knows. Probed rather than exported upstream. */
function namedCodes(): string[] {
  const out: string[] = [];
  for (const three of Object.keys(ALPHA3)) {
    const two = ALPHA3[three] as string;
    if (!out.includes(two) && hasLanguageName(two)) out.push(two);
  }
  for (const two of ['pb', 'pm', 'ze', 'zt']) {
    if (hasLanguageName(two)) out.push(two);
  }
  return out;
}

/**
 * Every spelling this module resolves, as one flat table, for the configure page.
 *
 * The page runs in the viewer's browser with no network, so it needs its own copy of
 * the resolver. It used to carry a hand-written subset of about forty spellings, and
 * a subset is not a smaller version of this: a name outside it resolved to nothing,
 * the term was dropped without a word, and a viewer who typed "Tagalog" got an install
 * configured for every language instead. Both sides read this table now, so a spelling
 * the addon understands is a spelling the page understands.
 */
export function spellingTable(): Record<string, string> {
  return { ...ALIASES, ...ALPHA3, ...BY_NAME };
}

/**
 * Code to display name, for the same page.
 *
 * The page echoes back what it resolved, and it can only do that by name: a row of
 * two-letter codes is not a reading of what you typed. A code with no name here is
 * shown as itself, which is also what `toStremioLang` does with it.
 */
export function nameTable(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const code of namedCodes()) out[code] = languageName(code);
  return out;
}

function tidy(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, '-').split(/\s+/).filter(Boolean).join(' ');
}

/**
 * Resolve any spelling of a language to the code the API filters on.
 *
 * Null for an empty value. An unknown two-letter code passes through rather than
 * being guessed at: the corpus carries 185 codes and the name table covers 68, so
 * dropping the rest would hide subtitles that exist.
 */
export function toCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = tidy(value);
  if (!v) return null;
  if (hasLanguageName(v)) return v;
  if (ALIASES[v]) return ALIASES[v] as string;
  if (ALPHA3[v]) return ALPHA3[v] as string;
  if (BY_NAME[v]) return BY_NAME[v] as string;
  if (v.includes('-')) return toCode(v.split('-')[0] as string);
  const plain = v.replace(/[()]/g, ' ').split(/\s+/).filter(Boolean).join(' ');
  if (plain !== v) return toCode(plain);
  if (/^[a-z]{2}$/.test(v)) return v;
  return null;
}

/**
 * A list of spellings, resolved and deduplicated in the order they were given.
 *
 * Split on commas first, because a name can hold a space: "Brazilian Portuguese" is
 * one language, and splitting on whitespace first turns it into two that are not.
 * A comma-free "en fr de" is still read as three, by falling back to whitespace for
 * any part that does not resolve whole.
 */
export function toCodes(value: string | null | undefined): string[] {
  const out: string[] = [];
  const add = (code: string | null) => {
    if (code && !out.includes(code)) out.push(code);
  };
  for (const part of (value ?? '').split(/[,;]/)) {
    if (!part.trim()) continue;
    const whole = toCode(part);
    if (whole) {
      add(whole);
      continue;
    }
    for (const word of part.split(/\s+/)) add(toCode(word));
  }
  return out;
}

/**
 * What goes in a subtitle's `lang` field.
 *
 * ISO 639-2 where the language has one. The four OpenSubtitles codes do not, so they
 * are sent as their English name, which Stremio displays as given.
 */
export function toStremioLang(code: string): string {
  const key = code.trim().toLowerCase();
  const three = TO_ALPHA3[key];
  if (three) return three;
  return hasLanguageName(key) ? languageName(key) : key;
}
