#!/usr/bin/env node
/**
 * The drift gate.
 *
 * Five plugins in four languages already have to agree on which subtitle is the right
 * one, and plugins/shared/match-cases.json is what stops them drifting. This addon is
 * the sixth reader of that file and it lives in a different repository, which is a new
 * way for the same drift to happen: nothing here would notice if the converter or the
 * similarity function changed upstream.
 *
 * So the pieces that are shared are copied verbatim, marked, and checked here. Every
 * `// --- BEGIN VERBATIM <path> ---` region in src/upstream must still be a contiguous
 * substring of that file in subtitledb-integrations@main, and the shared cases must
 * match byte for byte. A failure is not "update the copy": it is "somebody changed a
 * rule, decide whether this addon changes with it".
 *
 * That repository is public, so no token is needed. GITHUB_TOKEN is sent when set, for
 * the higher rate limit a shared CI address needs.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const REPO = 'thesubtitledb/subtitledb-integrations';
const REF = process.env.UPSTREAM_REF ?? 'main';

const BEGIN = /^\/\/ --- BEGIN VERBATIM (.+?) ---$/m;
const END = '// --- END VERBATIM ---';

async function upstreamFile(path) {
  const url = `https://api.github.com/repos/${REPO}/contents/${path}?ref=${encodeURIComponent(REF)}`;
  const headers = {
    accept: 'application/vnd.github.raw',
    'user-agent': 'subtitledb-stremio-upstream-check',
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${path}: GitHub answered ${res.status}`);
  return res.text();
}

/** The marked region of a vendored file, and the upstream path it claims to come from. */
function vendoredRegion(source) {
  const begin = BEGIN.exec(source);
  if (!begin) return null;
  const from = source.indexOf('\n', begin.index) + 1;
  const to = source.indexOf(END, from);
  if (to < 0) throw new Error('a BEGIN VERBATIM marker with no END VERBATIM');
  return { path: begin[1], body: source.slice(from, to) };
}

async function main() {
  const problems = [];

  const dir = join(ROOT, 'src', 'upstream');
  for (const name of (await readdir(dir)).sort()) {
    if (!name.endsWith('.ts')) continue;
    const source = await readFile(join(dir, name), 'utf8');
    const region = vendoredRegion(source);
    if (!region) {
      problems.push(`src/upstream/${name}: no BEGIN VERBATIM marker, so nothing is gated`);
      continue;
    }
    const upstream = await upstreamFile(region.path);
    if (upstream.includes(region.body)) {
      console.log(`ok   src/upstream/${name} <- ${region.path}`);
    } else {
      problems.push(
        `src/upstream/${name} no longer matches ${region.path} in ${REPO}@${REF}. ` +
          'Read the upstream change, decide whether this addon follows it, then re-copy.',
      );
    }
  }

  const casesPath = 'plugins/shared/match-cases.json';
  const mine = await readFile(join(ROOT, 'test', 'fixtures', 'match-cases.json'), 'utf8');
  const theirs = await upstreamFile(casesPath);
  if (mine === theirs) {
    console.log(`ok   test/fixtures/match-cases.json <- ${casesPath}`);
  } else {
    problems.push(`test/fixtures/match-cases.json differs from ${casesPath} in ${REPO}@${REF}`);
  }

  if (problems.length > 0) {
    console.error('\nupstream drift:');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log('\nno drift');
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
