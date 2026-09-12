/**
 * Response helpers.
 *
 * CORS is not optional anywhere in this addon. The protocol requires it on every
 * route including the manifest, because web.stremio.com is a browser page fetching
 * a third-party origin, and an addon that forgets it on one route fails only there
 * and only for web users.
 */

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
};

export function withCors(headers: Record<string, string> = {}): Record<string, string> {
  return { ...CORS, ...headers };
}

export function json(body: unknown, cacheSeconds: number, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    headers: withCors({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${cacheSeconds}`,
      ...extra,
    }),
  });
}

export function html(body: string, cacheSeconds: number) {
  return new Response(body, {
    headers: withCors({
      'content-type': 'text/html; charset=utf-8',
      'cache-control': `public, max-age=${cacheSeconds}`,
    }),
  });
}

/**
 * An error body Stremio will not choke on.
 *
 * Kept out of the subtitles route on purpose: a lookup that fails answers with an
 * empty list and a short cache, because a client that receives an error for a film
 * with no subtitles shows the viewer a broken addon rather than an empty menu.
 */
export function error(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: withCors({ 'content-type': 'application/json; charset=utf-8' }),
  });
}

export function preflight() {
  return new Response(null, {
    status: 204,
    headers: withCors({ 'access-control-max-age': '86400' }),
  });
}
