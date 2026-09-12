/**
 * The addon, as four GET routes.
 *
 * There is no stremio-addon-sdk here on purpose: the protocol is a manifest, a
 * resource route and CORS, and the SDK is a Node HTTP server that would have to be
 * shimmed onto Workers to serve three JSON documents.
 *
 * The fourth route is this addon's own. Stremio renders SubRip and WebVTT; the corpus
 * is mostly SubRip with a long tail of SubStation Alpha, and /get serves what is
 * stored. So subtitle URLs point back here, at /s/:id.vtt, and the bytes are converted
 * on the way through. That also puts every subtitle behind this Worker's cache rather
 * than behind the API's rate limiter.
 */

import { bundleItems, fetchSubtitle, lookupAll } from './api.js';
import { decodeConfig } from './config.js';
import { error, html, json, preflight, withCors } from './http.js';
import { toStremioLang } from './languages.js';
import { configurePage, manifest } from './manifest.js';
import { dropExcluded, filterLanguages, order } from './order.js';
import { parseAddonPath, parseContentId, parseExtra } from './stremio.js';
import type { Env, StremioSubtitle } from './types.js';
import { ConvertError, toVtt } from './upstream/convert.js';

/** How long each kind of answer stays fresh. */
const CACHE = {
  /** The manifest never changes between deploys. */
  manifest: 3600,
  /** A title gains subtitles slowly, and Stremio re-asks on every play. */
  lookup: 1800,
  /** A miss is cheap to re-check and might be a title we ingested since. */
  empty: 300,
  /** Converted bytes for one subtitle id cannot change. */
  bytes: 31536000,
} as const;

/** Stremio only ever asks this addon for these, and the manifest only offers these. */
const TYPES = new Set(['movie', 'series']);

/** Where this addon answers, origin and path, with no trailing slash. */
function addonBase(env: Env, url: URL): string {
  return (env.ADDON_BASE || url.origin).replace(/\/+$/, '');
}

/**
 * The request path with the mount point taken off, or null if it falls outside it.
 *
 * The addon is mounted under a path on the host that serves the read API, so every
 * route below matches on what follows the prefix. Returning null rather than falling
 * through is the point: a request that reaches this Worker from outside the prefix
 * means the route pattern is wrong, and answering it would shadow the API.
 */
function unprefix(base: string, pathname: string): string | null {
  const prefix = new URL(base).pathname.replace(/\/+$/, '');
  const path = pathname.replace(/\/+$/, '') || '/';
  if (!prefix) return path;
  if (path === prefix) return '/';
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : null;
}

/**
 * Nothing to offer, said the way the protocol wants to hear it.
 *
 * Stremio re-asks on every play, so an empty answer still carries the cache
 * directives; without them the titles we hold nothing for are the ones asked about
 * most often.
 */
function empty(): Response {
  return json(
    { subtitles: [], cacheMaxAge: CACHE.empty, staleRevalidate: CACHE.empty, staleError: 86400 },
    CACHE.empty,
  );
}

/**
 * The subtitles route.
 *
 * Answers with an empty list rather than an error for every "we do not have this":
 * an unknown id, an id from another addon's space, a title with nothing in the
 * viewer's languages. Stremio shows an addon that errors as broken, and none of these
 * are broken.
 */
async function subtitles(
  env: Env,
  url: URL,
  configSegment: string | null,
  type: string,
  rawId: string,
  extraSegment: string | undefined,
  deps: Deps,
): Promise<Response> {
  const config = decodeConfig(configSegment);
  const id = TYPES.has(type) ? parseContentId(rawId) : null;
  if (!id) return empty();

  const extra = parseExtra(extraSegment, url.searchParams);

  const result = await lookupAll(
    {
      imdb: id.imdb,
      season: id.season,
      episode: id.episode,
      languages: config.languages,
      limit: config.limit,
    },
    { base: env.API_BASE, key: env.SDB_API_KEY, fetch: deps.fetch },
  );
  if (!result) return empty();

  // The API ignores lang on a whole series or season bundle, so filtering locally is
  // only correct where it actually ran. Filtering on a filter that never ran turns a
  // full list into an empty one.
  const rows = result.filtered
    ? bundleItems(result.bundle)
    : filterLanguages(bundleItems(result.bundle), config.languages);

  const ranked = order(dropExcluded(rows, config.hearingImpaired), {
    languages: config.languages,
    hearingImpaired: config.hearingImpaired,
    filename: extra.filename,
    season: id.season,
    episode: id.episode,
  });

  const base = addonBase(env, url);
  const out: StremioSubtitle[] = ranked.map((s) => ({
    id: `sdb-${s.id}`,
    url: `${base}/s/${s.id}.vtt`,
    lang: toStremioLang(s.language),
    // Everything /get serves is UTF-8 and the converter emits UTF-8, so this is a
    // fact rather than a hope.
    SubEncoding: 'UTF-8',
  }));

  const age = out.length > 0 ? CACHE.lookup : CACHE.empty;
  // Stremio's own cache directives, which the client honours as well as the HTTP
  // layer. Kept in step with the Cache-Control on the same response.
  return json({ subtitles: out, cacheMaxAge: age, staleRevalidate: age, staleError: 86400 }, age);
}

/** Converted bytes for one subtitle. Immutable, so a cache hit costs no subrequest. */
async function bytes(env: Env, rawId: string, deps: Deps): Promise<Response> {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return error(400, 'not a subtitle id');

  let fetched: Awaited<ReturnType<typeof fetchSubtitle>>;
  try {
    fetched = await fetchSubtitle(id, {
      base: env.API_BASE,
      key: env.SDB_API_KEY,
      fetch: deps.fetch,
    });
  } catch {
    return error(502, 'subtitle could not be fetched');
  }

  let vtt: string;
  try {
    vtt = toVtt(fetched.text, fetched.format);
  } catch (err) {
    // A row that does not parse is a bad row, not a bad request. Saying so beats
    // handing Stremio an empty track it renders as a working subtitle.
    return error(422, err instanceof ConvertError ? err.message : 'conversion failed');
  }

  return new Response(vtt, {
    headers: withCors({
      'content-type': 'text/vtt; charset=utf-8',
      'cache-control': `public, max-age=${CACHE.bytes}, immutable`,
    }),
  });
}

/** What the routes need from the outside world. Injected so the tests need no network. */
export interface Deps {
  fetch?: typeof fetch | undefined;
}

/** Exported for the tests, which drive it with a plain Request and no Workers runtime. */
export async function route(req: Request, env: Env, deps: Deps = {}): Promise<Response> {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'GET' && req.method !== 'HEAD') return error(405, 'method not allowed');

  const url = new URL(req.url);
  const base = addonBase(env, url);
  const path = unprefix(base, url.pathname);
  if (path === null) return error(404, 'no such route');

  if (path === '/health') {
    return json({ ok: true, addon: manifest(base).id, api: env.API_BASE }, 60);
  }

  const bytesMatch = /^\/s\/(\d+)\.vtt$/.exec(path);
  if (bytesMatch) return bytes(env, bytesMatch[1] as string, deps);

  if (/^(?:\/[^/]+)?\/manifest\.json$/.test(path)) {
    return json(manifest(base), CACHE.manifest);
  }

  const configureMatch = /^(?:\/([^/]+))?\/configure$/.exec(path);
  if (configureMatch) {
    return html(configurePage(base, decodeConfig(configureMatch[1] ?? null)), 3600);
  }

  if (path === '/') return Response.redirect(`${base}/configure`, 302);

  const addon = parseAddonPath(path);
  if (addon?.resource === 'subtitles') {
    return subtitles(env, url, addon.config, addon.type, addon.id, addon.extra, deps);
  }

  return error(404, 'no such route');
}

/** The Cache API, absent outside the Workers runtime. Undefined in the unit tests. */
function edgeCache(): Cache | undefined {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // The Cache API is what keeps this addon off the API's anonymous rate limit: one
    // Worker serves every viewer, so without it a popular title costs one upstream
    // request per viewer rather than one per half hour.
    const cache = edgeCache();
    const hit = await cache?.match(req);
    if (hit) return hit;

    const res = await route(req, env);
    if (cache && res.status === 200 && (req.method === 'GET' || req.method === 'HEAD')) {
      ctx.waitUntil(cache.put(req, res.clone()));
    }
    return res;
  },
};
