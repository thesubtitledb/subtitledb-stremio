/**
 * Which subtitle Stremio should offer first.
 *
 * Deliberately not the ranking the players and media servers share. Theirs picks one
 * track to attach and has to weigh formats the player may not render; this one orders
 * a menu the viewer reads, every entry of which is already WebVTT by the time it is
 * fetched. What the two do share is release-name similarity, and that function is
 * vendored from upstream rather than rewritten, so a release match means the same
 * thing here as it does in Kodi.
 *
 * Every input except the row itself is optional. Newer Stremio clients drop the extra
 * arguments from the request path, so an order that needs `filename` to work would
 * quietly stop working on them.
 */

import type { HearingImpaired } from './config.js';
import type { BundleSubtitle } from './types.js';
import { similarity } from './upstream/similarity.js';

/** Formats the vendored converter can turn into WebVTT. Anything else is not offered. */
export const RENDERABLE = new Set(['srt', 'vtt', 'ass', 'ssa']);

/** How close two release names have to be before it counts as the same encode. */
const SAME_RELEASE = 0.8;

export interface OrderOptions {
  /** Corpus codes, best first. */
  languages: string[];
  hearingImpaired: HearingImpaired;
  /** The playing file's name, when the client sent one. */
  filename?: string | undefined;
  /** From a series id. Used only to drop rows that name a different episode. */
  season?: number | undefined;
  episode?: number | undefined;
}

/**
 * A row that names a season and episode other than the one being watched.
 *
 * A row says nothing about its episode in two different ways: null where the ingest
 * could not parse the numbers, and absent entirely on a drilled episode's rows, which
 * is what the API sends for the request this addon makes on every series play. Both
 * mean "unknown", not "does not match", so both are kept. Treating absent as a
 * mismatch drops every subtitle for every episode, and does it silently.
 */
export function wrongEpisode(s: BundleSubtitle, opts: OrderOptions): boolean {
  if (opts.season === undefined || opts.episode === undefined) return false;
  if (s.season == null || s.episode == null) return false;
  return s.season !== opts.season || s.episode !== opts.episode;
}

function languageRank(s: BundleSubtitle, opts: OrderOptions): number {
  if (opts.languages.length === 0) return 0;
  const i = opts.languages.indexOf(s.language);
  // A language nobody asked for sorts after every language somebody did.
  return i < 0 ? opts.languages.length : i;
}

function hearingRank(s: BundleSubtitle, opts: OrderOptions): number {
  if (opts.hearingImpaired === 'prefer') return s.hearing_impaired ? 0 : 1;
  if (opts.hearingImpaired === 'exclude') return s.hearing_impaired ? 1 : 0;
  return 0;
}

/** 0 when there is no filename to compare against, so it cannot reorder anything. */
function releaseRank(s: BundleSubtitle, opts: OrderOptions): number {
  if (!opts.filename || !s.release_name) return 1;
  return similarity(opts.filename, s.release_name) >= SAME_RELEASE ? 0 : 1;
}

/**
 * Rows the viewer can actually use, best first.
 *
 * Drops what cannot be converted and what belongs to a different episode, then orders
 * on language preference, release match, the hearing-impaired preference, cue count
 * and finally id. The last key is there so the same lookup always produces the same
 * menu: a list that reshuffles between two identical requests looks broken.
 */
export function order(rows: BundleSubtitle[], opts: OrderOptions): BundleSubtitle[] {
  const keep = rows.filter(
    (s) => RENDERABLE.has((s.format ?? '').toLowerCase()) && !wrongEpisode(s, opts),
  );

  return keep.sort((a, b) => {
    const byLang = languageRank(a, opts) - languageRank(b, opts);
    if (byLang !== 0) return byLang;
    const byRelease = releaseRank(a, opts) - releaseRank(b, opts);
    if (byRelease !== 0) return byRelease;
    const byHearing = hearingRank(a, opts) - hearingRank(b, opts);
    if (byHearing !== 0) return byHearing;
    // More cues is a fuller subtitle far more often than it is a padded one.
    if (a.cues !== b.cues) return b.cues - a.cues;
    return a.id - b.id;
  });
}

/** Rows in the languages that were asked for, when the API's own filter did not run. */
export function filterLanguages(rows: BundleSubtitle[], languages: string[]): BundleSubtitle[] {
  if (languages.length === 0) return rows;
  return rows.filter((s) => languages.includes(s.language));
}

/**
 * Rows a viewer who excluded hearing-impaired subtitles should not be offered.
 *
 * Separate from the ordering because 'exclude' means gone, not last, and the ordering
 * has to stay a pure sort so it can be tested as one.
 */
export function dropExcluded(rows: BundleSubtitle[], hi: HearingImpaired): BundleSubtitle[] {
  return hi === 'exclude' ? rows.filter((s) => !s.hearing_impaired) : rows;
}
