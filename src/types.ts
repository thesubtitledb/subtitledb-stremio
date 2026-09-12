/**
 * The two wire contracts this addon sits between.
 *
 * Above: the Stremio addon protocol, which asks for `subtitles` by type and id and
 * wants `{ subtitles: [{ id, url, lang }] }` back.
 *
 * Below: the SubtitleDB `/v1` lookup bundle. Only the fields this addon reads are
 * declared; the bundle carries more. The shape is the same at every scope, drilled or
 * not, which is why there is one bundle type here and no union: a drill narrows what
 * lands in `subtitles` rather than moving it under another key.
 */

/** One file in a lookup bundle's page. */
export interface BundleSubtitle {
  id: number;
  language: string;
  format: string;
  /**
   * Absent on a drilled episode's rows, null where the ingest could not parse them,
   * and a number otherwise. All three mean "do not use this to reject the row"
   * except the last, so the type carries all three rather than flattening two of them.
   */
  season?: number | null;
  episode?: number | null;
  cues: number;
  duration_s: number;
  bytes: number;
  encoding: string;
  release_name: string;
  uploader: string;
  hearing_impaired: boolean;
  fps: number | null;
  added_at: string;
  /** Stable counted redirect on the API host; 302s to the files host. */
  download_url: string;
}

export interface SubtitlePage {
  total: number;
  limit: number;
  offset: number;
  items: BundleSubtitle[];
}

/** Only the identity block is guaranteed. Everything else depends on response_class. */
export interface LookupTitle {
  imdb: string;
  tmdb_id: number | null;
  media_type: string | null;
  name: string;
  year: number | null;
  subtitle_count?: number;
  /** A title assembled from subtitle rows alone: `name` is empty. Check before trusting it. */
  partial?: true;
  subtitle_languages?: Record<string, number>;
}

/** What every `/v1/by-*` lookup answers with, at every scope. */
export interface LookupBundle {
  title: LookupTitle;
  subtitles: SubtitlePage;
  seasons: unknown[] | null;
}

/** What Stremio expects in a subtitles response. */
export interface StremioSubtitle {
  id: string;
  url: string;
  /** ISO 639-2 where we have one; Stremio displays the raw string otherwise. */
  lang: string;
  SubEncoding?: string;
}

export interface Env {
  API_BASE: string;
  /**
   * Where the addon answers, origin and path. It is mounted under a path on the API
   * host rather than on a name of its own, so this is not an origin, and code that
   * treats it as one drops the prefix off every URL it builds.
   */
  ADDON_BASE: string;
  /** Optional. Moves the addon off the anonymous rate-limit tier when set. */
  SDB_API_KEY?: string;
}
