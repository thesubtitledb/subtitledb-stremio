# subtitledb-stremio

The Stremio addon: one Cloudflare Worker, mounted at
api.thesubtitledb.org/integrations/stremio. README.md covers the routes, the settings and
the vendored code.

## Tests

Run from the repo root after `npm ci`. CI is `.github/workflows/ci.yml`: three jobs, all
blocking, written to run on every pull request and on push to main.
`.github/workflows/deploy.yml` is written to run on push to main and repeat lint,
typecheck and `npm test` before `wrangler deploy`, then probe the deployed manifest,
`/health` and one lookup. As of 2026-09-25 GitHub Actions is disabled on this
repository (Settings > Actions), so neither workflow runs: the suites have to be run
here before a merge, and a deploy is `npm run deploy` by hand.

| Suite | Command | Proves | CI job |
|---|---|---|---|
| `test/*.test.ts`, vitest | `npm test` | settings parsing, the configure page, the manifest, every route through `route()` in `worker.test.ts`, the per-language fan-out, ordering and language names, with fetch stubbed. `test/shared-cases.test.ts` reads `test/fixtures/match-cases.json` | `check`, after `npm run lint` and `npm run typecheck`; `npx wrangler deploy --dry-run --outdir .wrangler/dry-run` follows as the build step |
| `test/api.live.test.ts` | `npm run test:live` | the two API behaviours the addon works around (a series bundle ignores `lang`; one `limit` is shared across languages) and the conversion of real rows, against the live API, one file at a time | `live` |
| `tools/check-upstream.mjs` | `UPSTREAM_TOKEN=<token> npm run check:upstream` | `src/upstream/*.ts` and `test/fixtures/match-cases.json` still match thesubtitledb/subtitledb-cdn@main byte for byte. The token must read that private repo; without one the script exits 2 rather than passing | `upstream`, from the `UPSTREAM_TOKEN` secret; skipped on pull requests from forks |

Needs Node 24. No test touches Cloudflare: the Worker is called in-process.
