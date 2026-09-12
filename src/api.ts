/**
 * The SubtitleDB half: one lookup, and one byte fetch.
 *
 * Deliberately small. The API's `/v1/by-imdb/:imdb` answers with the whole title in
 * one request, and drilling to `/season/:s/episode/:e` narrows it to the episode
 * Stremio asked for, so there is no ladder here and no search: Stremio always knows
 * the IMDb id, which is the one identifier this addon needs.
 */

import type { BundleSubtitle, LookupBundle } from './types.js';

export interface LookupArgs {
  imdb: string;
  season?: number | undefined;
  episode?: number | undefined;
  /** Corpus codes. Sent as one comma separated list, which the API takes up to 16 of. */
  languages: string[];
  limit: number;
}

export interface ApiOptions {
  base: string;
  /** Moves the addon off the anonymous rate-limit tier. Optional by design. */
  key?: string | undefined;
  fetch?: typeof fetch | undefined;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function headers(opts: ApiOptions): HeadersInit {
  const h: Record<string, string> = { accept: 'application/json' };
  if (opts.key) h.authorization = `Bearer ${opts.key}`;
  return h;
}

/**
 * The path a lookup goes to.
 *
 * A drill is only added when both numbers are present. Season 0 is a real season on
 * this API (specials), so the check is for undefined rather than falsy.
 */
export function lookupPath(args: LookupArgs): string {
  const drill =
    args.season !== undefined && args.episode !== undefined
      ? `/season/${args.season}/episode/${args.episode}`
      : '';
  return `/v1/by-imdb/${args.imdb}${drill}`;
}

/** The result of a lookup, plus whether the API's language filter actually applied. */
export interface LookupResult {
  bundle: LookupBundle;
  /**
   * False when the bundle is a whole series or season, where `lang` and `format` are
   * ignored by design and the tree comes back unfiltered. A caller that filters
   * locally on the strength of a filter that never ran shows the viewer nothing.
   */
  filtered: boolean;
}

/**
 * One lookup. A 404 is "we do not have this title", not an error, and comes back as
 * null so the caller answers Stremio with an empty list.
 */
export async function lookup(args: LookupArgs, opts: ApiOptions): Promise<LookupResult | null> {
  const url = new URL(lookupPath(args), opts.base);
  url.searchParams.set('limit', String(args.limit));
  if (args.languages.length > 0) url.searchParams.set('lang', args.languages.join(','));
  // Attributable in the API's logs without costing a CORS preflight.
  url.searchParams.set('client', 'stremio');

  const doFetch = opts.fetch ?? fetch;
  const res = await doFetch(url.toString(), { headers: headers(opts) });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, `lookup failed: ${res.status}`);

  const bundle = (await res.json()) as LookupBundle;
  const drilled = args.season !== undefined && args.episode !== undefined;
  const isSeries = Array.isArray(bundle.seasons) && bundle.seasons.length > 0;
  return { bundle, filtered: args.languages.length > 0 && (drilled || !isSeries) };
}

/**
 * Every language asked for, not just the ones that happened to fit.
 *
 * The API takes `lang` as a comma separated list but applies ONE `limit` across the
 * whole list, and fills it in its own order rather than ours. `?lang=fr,en&limit=100`
 * on tt0111161 comes back as 100 English rows and no French at all, so `order()` has
 * nothing French left to rank first and "best first" quietly becomes "whatever the
 * API returned first". Raising the limit does not help; it is the wrong axis.
 *
 * So each language gets its own request and its own share of the limit, keeping the
 * total the viewer asked for. The first one goes alone because its answer is what
 * tells us whether `lang` applied at all: on a whole series or season bundle the API
 * ignores it, and the rest would be n identical requests for one unfiltered tree.
 */
export async function lookupAll(args: LookupArgs, opts: ApiOptions): Promise<LookupResult | null> {
  const langs = args.languages;
  if (langs.length < 2) return lookup(args, opts);

  const share = Math.min(100, Math.max(1, Math.ceil(args.limit / langs.length)));
  const first = await lookup({ ...args, languages: [langs[0] as string], limit: share }, opts);
  if (!first?.filtered) return first;

  const rest = await Promise.all(
    langs.slice(1).map((lang) => lookup({ ...args, languages: [lang], limit: share }, opts)),
  );

  // A title can carry the same file under two languages' pages; the id is the identity.
  const seen = new Set<number>();
  const items: BundleSubtitle[] = [];
  for (const result of [first, ...rest]) {
    if (!result) continue;
    for (const row of bundleItems(result.bundle)) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      items.push(row);
    }
  }
  return {
    bundle: { ...first.bundle, subtitles: { ...first.bundle.subtitles, items } },
    filtered: true,
  };
}

/** The page of files a bundle carries. Always the top-level bucket, at every scope. */
export function bundleItems(bundle: LookupBundle): BundleSubtitle[] {
  return bundle.subtitles?.items ?? [];
}

export interface FetchedSubtitle {
  text: string;
  /** Best evidence of the stored format: the served content type, then the bytes. */
  format: string;
}

const MIME_FORMAT: Record<string, string> = {
  'application/x-subrip': 'srt',
  'text/x-subrip': 'srt',
  'text/srt': 'srt',
  'text/vtt': 'vtt',
  'text/x-ssa': 'ass',
  'text/x-ass': 'ass',
};

/**
 * Which converter to run.
 *
 * The extension in a `/get` path is ignored by the API and the response carries no
 * filename, so the format is read off the content type and, failing that, off the
 * bytes. ass and ssa share a converter, so telling them apart is not needed.
 */
export function sniffFormat(text: string, contentType: string | null): string {
  const mime = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  const known = MIME_FORMAT[mime];
  if (known) return known;
  // The BOM is escaped rather than typed so this file stays pure ASCII, the way the
  // vendored converter is.
  const head = text.slice(0, 4096).replace(/^\uFEFF/, '');
  if (/^WEBVTT/.test(head)) return 'vtt';
  if (/\[Script Info\]|\[V4\+? Styles\]|\[Events\]/i.test(head)) return 'ass';
  return 'srt';
}

/**
 * Subtitle bytes for one id.
 *
 * `/get/:id` on the API host 302s to the files host; fetch follows it, which is the
 * point of using the published URL rather than rebuilding one. The API serves UTF-8,
 * so decoding is not negotiable here and `SubEncoding: UTF-8` upstream is honest.
 */
export async function fetchSubtitle(id: number, opts: ApiOptions): Promise<FetchedSubtitle> {
  const doFetch = opts.fetch ?? fetch;
  const res = await doFetch(new URL(`/get/${id}`, opts.base).toString(), {
    headers: opts.key ? { authorization: `Bearer ${opts.key}` } : {},
    redirect: 'follow',
  });
  if (!res.ok) throw new ApiError(res.status, `subtitle ${id}: ${res.status}`);
  const text = await res.text();
  return { text, format: sniffFormat(text, res.headers.get('content-type')) };
}
