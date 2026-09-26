/**
 * Per-install settings, carried in the URL.
 *
 * Stremio has no per-user storage for an addon: a configured install is just a
 * different manifest URL, with the settings in a path segment in front of every
 * route. So the config has to survive a round trip through a URL path, and it has to
 * be readable back by a Worker that keeps no state.
 *
 * base64url of compact JSON. Not encrypted and not meant to be: it holds language
 * preferences, it is visible in the install URL, and a viewer who edits it gets a
 * different set of subtitles and nothing else. Anything unparseable falls back to the
 * defaults rather than erroring, because the alternative is an install that shows
 * nothing and gives the viewer no way to tell why.
 */

/** How a hearing-impaired subtitle is treated. */
export type HearingImpaired = 'include' | 'exclude' | 'prefer';

/** Whether SubStation Alpha rows are offered. They lose their styling on the way to WebVTT. */
export type Styled = 'include' | 'exclude';

/** What to offer when nothing is left in the chosen languages. */
export type Fallback = 'none' | 'any';

/** How many of each language the menu can show. 0 is every one. */
export const PER_LANGUAGE = [0, 1, 2, 3, 5] as const;

export interface AddonConfig {
  /** Corpus codes, best first. Empty means no language filter at all. */
  languages: string[];
  hearingImpaired: HearingImpaired;
  /** Rows requested from the API, before ordering. The API caps at 100. */
  limit: number;
  /** Rows kept per language after ordering, from PER_LANGUAGE. */
  perLanguage: number;
  styled: Styled;
  fallback: Fallback;
}

export const DEFAULT_CONFIG: AddonConfig = {
  languages: ['en'],
  hearingImpaired: 'include',
  limit: 50,
  perLanguage: 0,
  styled: 'include',
  fallback: 'none',
};

/** Longer than any honest config; a longer segment is not decoded at all. */
const MAX_CONFIG_CHARS = 2048;

function oneOf<T>(v: unknown, values: readonly T[], fallback: T): T {
  return values.includes(v as T) ? (v as T) : fallback;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function encodeConfig(config: AddonConfig): string {
  const wire: Record<string, unknown> = {
    l: config.languages,
    h: config.hearingImpaired,
    n: config.limit,
  };
  // Left out at their defaults, so an install that never touches them keeps the URL it
  // had before they existed. Stremio keys an install on its URL: a new one is a second
  // copy of the addon, not an update to the first.
  if (config.perLanguage !== DEFAULT_CONFIG.perLanguage) wire.p = config.perLanguage;
  if (config.styled !== DEFAULT_CONFIG.styled) wire.s = config.styled;
  if (config.fallback !== DEFAULT_CONFIG.fallback) wire.f = config.fallback;
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(wire)));
}

/**
 * Decode a config segment, or the defaults.
 *
 * Every field is validated on its own, so a config written by an older version of the
 * configure page keeps the settings this version still understands.
 */
export function decodeConfig(segment: string | null | undefined): AddonConfig {
  if (!segment || segment.length > MAX_CONFIG_CHARS) return { ...DEFAULT_CONFIG };
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_CONFIG };
  const raw = parsed as Record<string, unknown>;

  const languages = Array.isArray(raw.l)
    ? raw.l.filter((x): x is string => typeof x === 'string' && /^[a-z]{2}$/.test(x)).slice(0, 16)
    : DEFAULT_CONFIG.languages;

  const limitRaw = typeof raw.n === 'number' ? Math.trunc(raw.n) : DEFAULT_CONFIG.limit;

  return {
    languages,
    hearingImpaired: oneOf<HearingImpaired>(
      raw.h,
      ['include', 'exclude', 'prefer'],
      DEFAULT_CONFIG.hearingImpaired,
    ),
    // The API caps limit at 100 and silently clamps; clamping here keeps the number in
    // the URL and the number in the request the same thing.
    limit: Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_CONFIG.limit)),
    perLanguage: oneOf<number>(raw.p, PER_LANGUAGE, DEFAULT_CONFIG.perLanguage),
    styled: oneOf<Styled>(raw.s, ['include', 'exclude'], DEFAULT_CONFIG.styled),
    fallback: oneOf<Fallback>(raw.f, ['none', 'any'], DEFAULT_CONFIG.fallback),
  };
}
