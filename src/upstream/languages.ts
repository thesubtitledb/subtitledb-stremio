/**
 * Language display names, vendored verbatim from subtitledb-cdn.
 *
 * Source: packages/core/src/languages.ts in thesubtitledb/subtitledb-cdn.
 *
 * The names are shared with the web players and the four media-server ports, and
 * plugins/shared/match-cases.json is what keeps them in step. This copy exists
 * because @subtitledb/core is a private workspace package that cannot be installed
 * here; tools/check-upstream.mjs fails CI when it stops matching upstream. Do not
 * edit between the markers by hand.
 *
 * Only the names live upstream. Resolving a spelling to a code, and mapping a code to
 * the ISO 639-2 form Stremio asks for, are this addon's own and live in
 * src/languages.ts.
 */

// --- BEGIN VERBATIM packages/core/src/languages.ts ---
const NAMES: Record<string, string> = {
  // OpenSubtitles-specific codes, not ISO639.
  pb: 'Portuguese (Brazil)',
  ze: 'Chinese (bilingual)',
  zt: 'Chinese (traditional)',
  pm: 'Portuguese (Mozambique)',

  ar: 'Arabic',
  bg: 'Bulgarian',
  bn: 'Bengali',
  bs: 'Bosnian',
  ca: 'Catalan',
  cs: 'Czech',
  da: 'Danish',
  de: 'German',
  el: 'Greek',
  en: 'English',
  eo: 'Esperanto',
  es: 'Spanish',
  et: 'Estonian',
  eu: 'Basque',
  fa: 'Persian',
  fi: 'Finnish',
  fr: 'French',
  gl: 'Galician',
  he: 'Hebrew',
  hi: 'Hindi',
  hr: 'Croatian',
  hu: 'Hungarian',
  hy: 'Armenian',
  id: 'Indonesian',
  is: 'Icelandic',
  it: 'Italian',
  ja: 'Japanese',
  ka: 'Georgian',
  kk: 'Kazakh',
  km: 'Khmer',
  ko: 'Korean',
  ku: 'Kurdish',
  lt: 'Lithuanian',
  lv: 'Latvian',
  mk: 'Macedonian',
  ml: 'Malayalam',
  mn: 'Mongolian',
  ms: 'Malay',
  my: 'Burmese',
  nl: 'Dutch',
  no: 'Norwegian',
  oc: 'Occitan',
  pl: 'Polish',
  pt: 'Portuguese',
  ro: 'Romanian',
  ru: 'Russian',
  si: 'Sinhala',
  sk: 'Slovak',
  sl: 'Slovenian',
  sq: 'Albanian',
  sr: 'Serbian',
  sv: 'Swedish',
  sw: 'Swahili',
  ta: 'Tamil',
  te: 'Telugu',
  th: 'Thai',
  tl: 'Tagalog',
  tr: 'Turkish',
  tt: 'Tatar',
  uk: 'Ukrainian',
  ur: 'Urdu',
  uz: 'Uzbek',
  vi: 'Vietnamese',
  zh: 'Chinese',
};

/** Display name for a code, falling back to the uppercased code when unknown. */
export function languageName(code: string): string {
  const key = code.trim().toLowerCase();
  return NAMES[key] ?? key.toUpperCase();
}

/** True when we have a real name rather than a fallback. Useful in tests. */
export function hasLanguageName(code: string): boolean {
  return Object.hasOwn(NAMES, code.trim().toLowerCase());
}
// --- END VERBATIM ---
