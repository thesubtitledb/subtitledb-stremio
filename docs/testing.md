# Testing

Run from the repo root after `npm ci`. Needs Node 24.

CI is `.github/workflows/ci.yml`, on every pull request and on push to main.

| Suite | Command | Proves | CI job |
|---|---|---|---|
| `test/*.test.ts`, vitest | `npm test` | settings in the URL, the configure page, Stremio ids and paths, every route through `route()` in `worker.test.ts` (manifest, CORS, health, subtitles, WebVTT conversion, errors, timeouts, redirects), the download count on a cache hit, the per-language fan-out, ordering and language codes. Fetch is stubbed. `test/shared-cases.test.ts` reads `test/fixtures/match-cases.json` | `check`, after `npm run lint` and `npm run typecheck`, then a build |
| `test/api.live.test.ts` | `npm run test:live` | films and drilled episodes from the live API, the three-letter language the protocol asks for, the whole-series bundle the API does not filter, and real SubRip and SubStation Alpha rows converted to WebVTT | `live` |
| `tools/check-upstream.mjs` | `npm run check:upstream` | each `BEGIN VERBATIM` region in `src/upstream/*.ts` still appears in thesubtitledb/subtitledb-integrations@main, and `test/fixtures/match-cases.json` equals `plugins/shared/match-cases.json` there byte for byte. Needs no token; `GITHUB_TOKEN`, when set, raises the rate limit | `upstream`, on fork pull requests too |
