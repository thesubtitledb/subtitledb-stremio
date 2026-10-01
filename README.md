# TheSubtitleDB for Stremio

Subtitles from [TheSubtitleDB](https://thesubtitledb.org) for films and series in
Stremio. It needs no key or account.

## Install

Paste this into Stremio's Add addon box:

```text
https://api.thesubtitledb.org/integrations/stremio/manifest.json
```

Or choose your settings first on the
[configure page](https://api.thesubtitledb.org/integrations/stremio/configure), which
the addon's Configure button in Stremio also opens.

## Settings

| Setting | Default | Options |
|---|---|---|
| Languages | English | Up to 16, best first. None means every language. |
| Hearing impaired | Include | Include, prefer or exclude |
| Subtitles per title | 50 | 1 to 100, shared across the languages |
| Subtitles per language | All | All, 1, 2, 3 or 5 |
| Styled subtitles | Include | Include or leave out .ass and .ssa |
| If none in your languages | Nothing | Nothing, or any language |

## How it works

Stremio asks for subtitles by IMDb id, for a film (`tt0133093`) or an episode
(`tt0944947:1:1`). The addon sorts them by your language order, then by how closely the
release matches the playing file when Stremio sends its name, then by your hearing
impaired choice and the number of lines. It drops any that name a different episode.
Every subtitle is served as WebVTT, converted from SubRip, ASS or SSA when needed.

If the API fails or is busy, the addon answers with an empty list for a minute instead
of an error, so Stremio keeps playing and asks again.

| Path | Answers |
|---|---|
| `/manifest.json`, `/<settings>/manifest.json` | the addon manifest |
| `/configure`, `/<settings>/configure` | the settings page |
| `/subtitles/<type>/<id>.json` | the subtitle list |
| `/s/<id>.vtt` | one subtitle as WebVTT |
| `/health` | a status check |

## Development

```bash
npm ci
npm test               # unit tests, no network
npm run test:live      # against the real API
npm run typecheck
npm run lint           # lint:fix writes the fixes
npm run check:upstream # code shared with subtitledb-integrations still matches
npm run dev            # wrangler dev
npm run deploy         # wrangler deploy
```

`API_BASE` in `wrangler.toml` sets the API it reads from.
[docs/testing.md](docs/testing.md) lists what each suite covers.
