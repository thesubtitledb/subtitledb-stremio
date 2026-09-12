# subtitledb-stremio

The Stremio addon for [TheSubtitleDB](https://thesubtitledb.org).

One Cloudflare Worker. No `stremio-addon-sdk` at runtime: the protocol is four GET
routes.

- Website: <https://thesubtitledb.org>
- Install page: <https://api.thesubtitledb.org/integrations/stremio/configure>
- Manifest: `https://api.thesubtitledb.org/integrations/stremio/manifest.json`

Or paste the manifest URL into Stremio's **Add addon** box.

## What it does

Stremio hands over an IMDb id, plus season and episode for a series.

That is one API lookup per play. No search, no ladder.

Subtitle URLs point back at this Worker rather than the API. Stremio renders SubRip
and WebVTT only, and the corpus has a long SubStation Alpha tail, so `/s/:id.vtt`
fetches the row and converts it with the same converter the browser players use.

## Routes

| Route | Serves |
|---|---|
| `/manifest.json` | the addon manifest |
| `/:config/manifest.json` | the same, configured |
| `/configure` | the settings page, which builds an install URL |
| `/:config/configure` | the same, pre-filled |
| `/subtitles/:type/:id.json` | the lookup, with or without an `/:extra` segment |
| `/s/:id.vtt` | one subtitle, converted, immutable |
| `/health` | deploy probe |
| `/logo.png` | the manifest logo |
| `/` | redirects to `/configure` |

Every route sends `access-control-allow-origin: *`. The protocol needs it on the
manifest too: web.stremio.com is a browser page fetching a third-party origin, so an
addon that forgets CORS on one route fails there and nowhere else.

## Settings

A configured install is a different manifest URL. Settings ride in a base64url path
segment, because Stremio has no per-addon storage.

| Setting | Default | Notes |
|---|---|---|
| languages | `en` | Ranked, up to 16. Empty means every language. |
| hearing impaired | include | `include`, `prefer` or `exclude`. |
| limit | 50 | Rows per title, split across the languages. Caps at 100. |

Anything unparseable falls back to the defaults rather than erroring.

Languages are a picker, not a box you type a list into. The order is the preference.

Sixty-eight of the corpus's 185 codes have a name to browse for. Searching one of the
other 117 offers it as a bare code.

Every setting is drawn server-side too, so the page is right in a webview before its
script runs. It makes no network calls at all.

## Two API behaviours it works around

`lang` and `format` are ignored on a series or season bundle: the tree is served
unfiltered by design. So the addon filters locally exactly where the API's filter did
not run.

`lang` takes up to 16 codes but applies one shared `limit` across all of them, filled
in the API's order. `?lang=fr,en&limit=100` comes back 100 English and 0 French, so a
client that ranks the result has nothing French left to rank. Raising the limit is the
wrong axis. `lookupAll()` sends one request per language with its own share, and the
first goes alone because its answer says whether `lang` applied at all.

`test/api.live.test.ts` and `test/fanout.test.ts` pin both halves.

## Shared code

The converter and the release-name similarity function are vendored verbatim from
`thesubtitledb/subtitledb-cdn` into `src/upstream/`, because `@subtitledb/core` is a
private workspace package.

`plugins/shared/match-cases.json` is copied into `test/fixtures/`.

`tools/check-upstream.mjs` fails CI when a copy stops matching upstream. A failure is
not "update the copy": it is "somebody changed a rule, decide whether this addon
changes with it".

## Scripts

| Command | Does |
|---|---|
| `npm test` | Unit. |
| `npm run test:live` | Against the real API. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | Biome. |
| `npm run lint:fix` | Biome, writing fixes. |
| `npm run check:upstream` | The vendored-copy drift gate. |
| `npm run dev` | Local wrangler. |
| `npm run deploy` | Deploy the Worker. |
| `npm run logo` | Regenerate `public/logo.png`. |

## API key

Optional, and a secret rather than a var:

```
npx wrangler secret put SDB_API_KEY
```

Without it the addon runs on the anonymous tier. The Worker's own cache is what keeps
it there: lookups 30 minutes, converted bytes a year, the manifest an hour, empty
answers five. A popular title costs one upstream request per half hour however many
people are watching it.
