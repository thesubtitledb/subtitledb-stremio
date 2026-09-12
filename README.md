# subtitledb-stremio

The Stremio addon for [TheSubtitleDB](https://thesubtitledb.org). One Cloudflare
Worker, no `stremio-addon-sdk` at runtime.

Paste into Stremio's **Add addon** box:

```text
https://api.thesubtitledb.org/integrations/stremio/manifest.json
```

Or pick languages first at
[/configure](https://api.thesubtitledb.org/integrations/stremio/configure).

## A lookup

```bash
SDB=https://api.thesubtitledb.org/integrations/stremio

curl "$SDB/subtitles/movie/tt0133093.json"
curl "$SDB/subtitles/series/tt0903747:1:1.json"
```

```json
{
  "subtitles": [
    {
      "id": "sdb-1775434752",
      "url": "https://api.thesubtitledb.org/integrations/stremio/s/1775434752.vtt",
      "lang": "eng",
      "SubEncoding": "UTF-8"
    }
  ]
}
```

Stremio hands over an IMDb id, plus season and episode for a series. That is one
API lookup per play. No search, no ladder.

URLs point back at this Worker rather than the API. Stremio renders SubRip and
WebVTT only and the corpus has a long SubStation Alpha tail, so `/s/:id.vtt`
fetches the row and converts it with the same converter the browser players use.

## Settings

Stremio has no per-addon storage, so a configured install is a different manifest
URL. The settings ride in a base64url path segment in front of every route.

```bash
# {"l":["fr","en"],"h":"exclude","n":100}
CFG=eyJsIjpbImZyIiwiZW4iXSwiaCI6ImV4Y2x1ZGUiLCJuIjoxMDB9

curl "$SDB/$CFG/subtitles/movie/tt0133093.json"
# 63 rows: fre=30 eng=33, French first
```

| Setting | Default | Beyond the default |
|---|---|---|
| `l` languages | `["en"]` | Ranked, up to 16. Empty means every language. |
| `h` hearing impaired | `include` | `prefer` ranks them first rather than filtering. |
| `n` limit | `50` | Rows per title, split across the languages. Caps at 100. |

Anything unparseable falls back to the defaults rather than erroring, and every
field is validated on its own, so a URL written by an older configure page keeps
the settings this version still understands.

Languages are a picker, not a box you type a list into. 68 of the corpus's 185
codes have a name to browse for; searching one of the other 117 offers it as a
bare code. Every setting is drawn server-side too, so the page is right in a
webview before its script runs, and it makes no network calls at all.

## Two API behaviours it works around

`lang` and `format` are ignored on a series or season bundle, so the addon filters
locally exactly where the API's filter did not run.

`lang` takes up to 16 codes but applies one shared `limit` across all of them,
filled in the API's order:

```bash
curl "https://api.thesubtitledb.org/v1/by-imdb/tt0133093?lang=fr,en&limit=100"
# total 175, returned 100, all en
```

A client that ranks that has nothing French left to rank, and raising the limit is
the wrong axis. `lookupAll()` sends one request per language with its own share,
which is where the `fre=30 eng=33` above comes from. The first request goes alone,
because its answer says whether `lang` applied at all.

`test/api.live.test.ts` and `test/fanout.test.ts` pin both halves.

## The manifest

```json
{
  "id": "org.thesubtitledb.stremio",
  "version": "0.1.0",
  "name": "TheSubtitleDB",
  "description": "Subtitles from TheSubtitleDB, a corpus of over ten million files in 185 languages.",
  "logo": "https://api.thesubtitledb.org/integrations/stremio/logo.png",
  "types": ["movie", "series"],
  "resources": ["subtitles"],
  "catalogs": [],
  "idPrefixes": ["tt"],
  "behaviorHints": { "configurable": true, "configurationRequired": false },
  "config": [
    {
      "key": "languages",
      "type": "text",
      "title": "Languages, best first (codes or names, comma separated)",
      "default": "en"
    },
    {
      "key": "hearingImpaired",
      "type": "select",
      "title": "Hearing impaired subtitles",
      "options": ["include", "prefer", "exclude"],
      "default": "include"
    },
    {
      "key": "limit",
      "type": "number",
      "title": "Subtitles to consider per title (1-100)",
      "default": "50"
    }
  ]
}
```

## Routes

```text
/manifest.json              the manifest
/:config/manifest.json      identical, but binds the settings for the routes under it
/configure                  settings page, builds an install URL
/:config/configure          the same, pre-filled
/subtitles/:type/:id.json   the lookup, with or without an /:extra segment
/s/:id.vtt                  one subtitle, converted, immutable
/health                     deploy probe
/logo.png                   the manifest logo
/                           redirects to /configure
```

Every route sends `access-control-allow-origin: *`. The manifest needs it too:
web.stremio.com is a browser page fetching a third-party origin, so an addon that
forgets CORS on one route fails there and nowhere else.

## Scripts

```bash
npm test                # unit
npm run test:live       # against the real API
npm run typecheck       # tsc --noEmit
npm run lint            # Biome
npm run lint:fix        # Biome, writing fixes
npm run check:upstream  # vendored-copy drift gate
npm run dev             # local wrangler
npm run deploy          # deploy the Worker
npm run logo            # regenerate public/logo.png
```

## Vendored code

The converter and the release-name similarity function are copied verbatim from
`thesubtitledb/subtitledb-cdn` into `src/upstream/`, because `@subtitledb/core` is
a private workspace package. `plugins/shared/match-cases.json` is copied into
`test/fixtures/`.

`tools/check-upstream.mjs` fails CI when a copy stops matching upstream. A failure
is not "update the copy", it is "somebody changed a rule, decide whether this
addon changes with it".

## API key

Optional, and a secret rather than a var:

```bash
npx wrangler secret put SDB_API_KEY
```

Without it the addon runs on the anonymous tier. The Worker's own cache is what
keeps it there:

```text
lookups           30 minutes
converted bytes   1 year
manifest          1 hour
empty answers     5 minutes
```

A popular title costs one upstream request per half hour however many people are
watching it.
