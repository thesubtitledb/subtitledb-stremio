/**
 * The half of the addon protocol that is parsing.
 *
 * Stremio asks for a resource at `/:resource/:type/:id.json`, optionally with a
 * segment of extra arguments before the extension, and optionally with a config
 * segment in front of the whole thing. Everything after the type is addon-specific,
 * so it is parsed here and nowhere else.
 */

/** A content id as Stremio spells it. Series carry the season and episode in the id. */
export interface ContentId {
  imdb: string;
  season?: number;
  episode?: number;
}

/**
 * `tt0133093` or `tt0944947:1:1`.
 *
 * Returns null for anything that is not an IMDb id, which is every id from another
 * addon's id space: the manifest declares `idPrefixes: ['tt']`, but clients have been
 * known to ask anyway and an addon that guesses answers the wrong film.
 */
export function parseContentId(raw: string): ContentId | null {
  const parts = decodeURIComponent(raw).split(':');
  const head = (parts[0] ?? '').trim().toLowerCase();
  if (!/^tt\d{1,10}$/.test(head)) return null;
  if (parts.length === 1) return { imdb: head };
  if (parts.length !== 3) return null;
  const season = Number(parts[1]);
  const episode = Number(parts[2]);
  if (!Number.isInteger(season) || !Number.isInteger(episode)) return null;
  if (season < 0 || episode < 0) return null;
  return { imdb: head, season, episode };
}

/**
 * The extra arguments, from either place a client puts them.
 *
 * Older clients send them as a path segment of `key=value&key=value`, url-encoded
 * twice over; newer ones send a plain query string and some send nothing at all. All
 * three are read here, and every consumer treats every key as optional, because a
 * client that stops sending `filename` must still get subtitles rather than none.
 */
export function parseExtra(
  segment: string | undefined,
  search: URLSearchParams,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of search) out[k] = v;
  if (!segment) return out;
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // A segment that is not valid percent-encoding is used as it arrived rather than
    // failing the request: the extras are all optional hints.
  }
  for (const pair of decoded.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const key = pair.slice(0, eq).trim();
    if (!key) continue;
    let value = pair.slice(eq + 1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // Same: keep what arrived.
    }
    out[key] = value;
  }
  return out;
}

/** What a resource request resolved to, once the path has been taken apart. */
export interface AddonRequest {
  config: string | null;
  resource: string;
  type: string;
  id: string;
  extra: string | undefined;
}

/**
 * Split an addon path into its parts, with or without a leading config segment.
 *
 * `/subtitles/series/tt0944947:1:1.json`
 * `/subtitles/series/tt0944947:1:1/filename=x.mkv.json`
 * `/<config>/subtitles/movie/tt0133093.json`
 */
export function parseAddonPath(pathname: string): AddonRequest | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 3) return null;

  // The resource segment is a fixed vocabulary, so a first segment that is not one is
  // the config. That is the whole disambiguation rule and it is why a config string
  // can never be the word "subtitles".
  let config: string | null = null;
  if (parts[0] !== 'subtitles') {
    config = parts[0] as string;
    parts.shift();
  }
  if (parts.length < 2) return null;

  const resource = parts[0] as string;
  const type = parts[1] as string;
  const rest = parts.slice(2);
  if (rest.length === 0 || rest.length > 2) return null;

  const last = rest[rest.length - 1] as string;
  if (!last.endsWith('.json')) return null;
  const trimmed = last.slice(0, -'.json'.length);

  if (rest.length === 1) return { config, resource, type, id: trimmed, extra: undefined };
  return { config, resource, type, id: rest[0] as string, extra: trimmed };
}
