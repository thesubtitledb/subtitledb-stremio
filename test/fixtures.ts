import type { BundleSubtitle, Env, LookupBundle, LookupTitle } from '../src/types.js';

export const ENV: Env = {
  API_BASE: 'https://api.example.test',
  ADDON_BASE: 'https://stremio.example.test',
};

let nextId = 1;

export function row(patch: Partial<BundleSubtitle> = {}): BundleSubtitle {
  const id = patch.id ?? nextId++;
  return {
    id,
    language: 'en',
    format: 'srt',
    season: null,
    episode: null,
    cues: 900,
    duration_s: 7200,
    bytes: 52800,
    encoding: 'UTF-8',
    release_name: '',
    uploader: '',
    hearing_impaired: false,
    fps: null,
    added_at: '2021-06-04T12:11:09Z',
    download_url: `https://api.example.test/get/${id}`,
    ...patch,
  };
}

export function title(patch: Partial<LookupTitle> = {}): LookupTitle {
  return {
    imdb: 'tt0133093',
    tmdb_id: 603,
    media_type: 'movie',
    name: 'The Matrix',
    year: 1999,
    subtitle_count: 2,
    subtitle_languages: { en: 2 },
    ...patch,
  };
}

/** One bundle shape at every scope, which is what the API actually sends. */
export function bundle(items: BundleSubtitle[], seasons: unknown[] | null = null): LookupBundle {
  return {
    title: title(),
    subtitles: { total: items.length, limit: 100, offset: 0, items },
    seasons,
  };
}

export interface StubRoute {
  match: RegExp;
  status?: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

export interface StubCall {
  url: string;
  init: RequestInit | undefined;
}

/** Records every call, so the traffic a route costs can be asserted, not assumed. */
export function stubFetch(routes: StubRoute[]): { fetch: typeof fetch; calls: StubCall[] } {
  const calls: StubCall[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes.find((r) => r.match.test(url));
    if (!route) {
      return new Response(JSON.stringify({ error: 'not_found', message: 'no stub' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (route.text !== undefined) {
      return new Response(route.text, {
        status: route.status ?? 200,
        headers: { 'content-type': 'text/plain', ...(route.headers ?? {}) },
      });
    }
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json', ...(route.headers ?? {}) },
    });
  }) as unknown as typeof fetch;
  return { fetch: impl, calls };
}

export const SRT = '1\n00:00:01,000 --> 00:00:02,000\nhello\n';

export const ASS = [
  '[Script Info]',
  'ScriptType: v4.00+',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\an8}hello there',
  '',
].join('\n');
