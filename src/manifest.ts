/**
 * The manifest, and the page Stremio opens to build one.
 *
 * A configured Stremio install is nothing but a different manifest URL, so the
 * configure page's only job is to turn a form into a config segment and hand the
 * viewer the two links that install it.
 */

import { type AddonConfig, DEFAULT_CONFIG, encodeConfig } from './config.js';
import { nameTable, spellingTable } from './languages.js';

export const ADDON_ID = 'org.thesubtitledb.stremio';
export const ADDON_VERSION = '0.1.0';

export interface Manifest {
  id: string;
  version: string;
  name: string;
  description: string;
  logo: string;
  types: string[];
  resources: string[];
  catalogs: never[];
  idPrefixes: string[];
  behaviorHints: { configurable: boolean; configurationRequired: boolean };
  config: ManifestConfigField[];
  contactEmail?: string;
}

interface ManifestConfigField {
  key: string;
  type: 'text' | 'number' | 'password' | 'checkbox' | 'select';
  title: string;
  options?: string[];
  default?: string;
  required?: boolean;
}

/**
 * The manifest is the same at every install; the settings ride in the URL, not in it.
 *
 * `config` is declared for the clients that render it natively, and `configurable`
 * points the rest at /configure. Both describe the same three settings.
 */
export function manifest(origin: string): Manifest {
  return {
    id: ADDON_ID,
    version: ADDON_VERSION,
    name: 'TheSubtitleDB',
    description:
      'Subtitles from TheSubtitleDB, a corpus of over ten million files in 185 languages.',
    logo: `${origin}/logo.png`,
    types: ['movie', 'series'],
    resources: ['subtitles'],
    catalogs: [],
    idPrefixes: ['tt'],
    behaviorHints: { configurable: true, configurationRequired: false },
    config: [
      {
        key: 'languages',
        type: 'text',
        title: 'Languages, best first (codes or names, comma separated)',
        default: DEFAULT_CONFIG.languages.join(','),
      },
      {
        key: 'hearingImpaired',
        type: 'select',
        title: 'Hearing impaired subtitles',
        options: ['include', 'prefer', 'exclude'],
        default: DEFAULT_CONFIG.hearingImpaired,
      },
      {
        key: 'limit',
        type: 'number',
        title: 'Subtitles to consider per title (1-100)',
        default: String(DEFAULT_CONFIG.limit),
      },
    ],
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One stroke weight, one corner language. Drawn, because glyphs are not an icon set. */
const ICONS = {
  up: '<path d="M7 11.5V2.5M7 2.5L3.4 6.1M7 2.5l3.6 3.6"/>',
  down: '<path d="M7 2.5v9M7 11.5L3.4 7.9M7 11.5l3.6-3.6"/>',
  remove: '<path d="M3.6 3.6l6.8 6.8M10.4 3.6l-6.8 6.8"/>',
  search: '<circle cx="6.2" cy="6.2" r="4"/><path d="M9.2 9.2l3 3"/>',
  copy: '<rect x="4.6" y="1.7" width="7.7" height="8.6" rx="1.3"/><path d="M9.2 12.3H3.1a1.4 1.4 0 0 1-1.4-1.4V4.4"/>',
  install: '<path d="M7 9.2V1.6M7 9.2L4.2 6.4M7 9.2l2.8-2.8M1.8 12.4h10.4"/>',
  check: '<path d="M2.6 7.4l3 3 5.8-6.4"/>',
  plus: '<path d="M7 3v8M3 7h8"/>',
};

const HI_OPTIONS: Array<[AddonConfig['hearingImpaired'], string]> = [
  ['include', 'Include'],
  ['prefer', 'Prefer'],
  ['exclude', 'Leave out'],
];

const icon = (name: keyof typeof ICONS, cls = 'i'): string =>
  `<svg class="${cls}" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/**
 * One chosen language, as the server draws it so the page is right before JS runs.
 *
 * A code with no name shows the code where the name would be and says "no name" where
 * the code would be, rather than leaving the second column to mean two different
 * things down one list.
 */
function chosenRow(code: string, names: Record<string, string>, i: number): string {
  const named = names[code];
  return (
    `<li class="row" data-code="${escapeHtml(code)}">` +
    `<span class="ord">${i + 1}</span>` +
    `<span class="who"><span class="nm">${escapeHtml(named ?? code)}</span>` +
    `<span class="cd${named ? '' : ' raw'}">${named ? escapeHtml(code) : 'no name'}</span>` +
    '</span>' +
    `<span class="acts"><button type="button" class="ib" data-act="up" aria-label="Move ${escapeHtml(named ?? code)} up">${icon('up')}</button>` +
    `<button type="button" class="ib" data-act="down" aria-label="Move ${escapeHtml(named ?? code)} down">${icon('down')}</button>` +
    `<button type="button" class="ib rm" data-act="rm" aria-label="Remove ${escapeHtml(named ?? code)}">${icon('remove')}</button></span>` +
    '</li>'
  );
}

/**
 * The configure page.
 *
 * One task, no framework, no network calls. It encodes the config in the browser and
 * rewrites the two install links, so it works the same at /configure and at an
 * existing install's /:config/configure, and it works inside Stremio's webview where
 * fetch and the clipboard API may both be unavailable.
 *
 * The languages are a picker, not a text box. Ranked order is the one setting on this
 * page that changes what a viewer sees, and a comma separated string is the worst
 * possible control for a ranked list: nothing to discover, nothing to reorder without
 * retyping, and no way to know a spelling was understood.
 */
export function configurePage(origin: string, config: AddonConfig): string {
  const host = origin.replace(/^https?:\/\//, '');
  const initial = encodeConfig(config);
  const names = nameTable();
  const count = Object.keys(names).length;
  const rows = config.languages.map((c, i) => chosenRow(c, names, i)).join('');
  // Checked in the markup rather than by the script: the page has to be right in a
  // webview before its script runs, and a segmented control with nothing selected
  // reads as a setting nobody has made.
  const hiRadios = HI_OPTIONS.map(
    ([value, text]) =>
      `<label><input type="radio" name="hi" value="${value}"` +
      `${config.hearingImpaired === value ? ' checked' : ''}><span>${text}</span></label>`,
  ).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TheSubtitleDB for Stremio</title>
<meta name="description" content="Set up the TheSubtitleDB subtitle addon for Stremio: rank the languages you want, then install.">
<link rel="icon" href="/logo.png">
<style>
  /* Stremio's own palette, made structural rather than decorative: the teal is spent
     on the ordinals and the one action, and nowhere else. */
  :root {
    color-scheme: dark;
    --bg: #0f1720;
    --panel: #131e29;
    --raise: #16222e;
    --line: #22323f;
    --line-hi: #3a5266;
    --ink: #e8eef3;
    --ink-2: #9fb0bd;
    /* Measured, not eyeballed: the code beside each language and the install URL are
       both this on --raise, and the shade this replaced came to 4.32:1. */
    --ink-3: #7d90a3;
    --teal: #35B7AB;
    --warn: #f0b17a;
    /* Four steps of type, four of radius. Everything picks from these. */
    --t-xs: .8rem;
    --t-sm: .875rem;
    --t-md: 1rem;
    --t-xl: 1.55rem;
    --r-sm: 6px;
    --r: 8px;
    --r-lg: 12px;
    --r-pill: 99px;
    --ease: cubic-bezier(.2, .7, .3, 1);
  }
  * { box-sizing: border-box; }
  ::selection { background: rgba(53, 183, 171, .3); color: #fff; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    /* The system face, because the page loads nothing over the network and a settings
       screen inside Stremio's own webview should read as part of it. */
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    caret-color: var(--teal);
  }
  main { max-width: 40rem; margin: 0 auto; padding: 2.25rem 1.15rem 1rem; }

  h1 { font-size: var(--t-xl); letter-spacing: -.02em; margin: 0 0 .25rem; }
  .lede { color: var(--ink-2); margin: 0 0 1.75rem; max-width: 46ch; }

  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: var(--r-lg);
           padding: 1.25rem; margin-bottom: 1rem; }
  .ph { display: flex; align-items: baseline; justify-content: space-between; gap: .75rem; }
  h2 { font-size: var(--t-md); letter-spacing: -.01em; margin: 0; }
  .count { font-size: var(--t-xs); color: var(--ink-3); font-variant-numeric: tabular-nums; }
  .sub { margin: .25rem 0 1rem; font-size: var(--t-sm); color: var(--ink-2); max-width: 62ch;
         text-wrap: pretty; }

  /* The ranked list. The ordinal is the point of the control, so it is the only
     place besides the install button that carries the brand colour. */
  ol.chosen { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .25rem; }
  .row { display: flex; align-items: center; gap: .75rem; padding: .5rem;
         background: var(--raise); border: 1px solid var(--line); border-radius: var(--r); }
  /* Only a row that was just added animates. Replaying the entrance on every row
     whenever any row changes hides the one thing that actually moved. */
  .row.new { animation: land .22s var(--ease); }
  @keyframes land { from { opacity: 0; transform: translateY(-4px); } }
  @media (prefers-reduced-motion: reduce) { .row.new { animation: none; } }
  .ord { flex: 0 0 auto; width: 1.35rem; height: 1.35rem; display: grid; place-items: center;
         border-radius: var(--r-sm); background: rgba(53, 183, 171, .14); color: var(--teal);
         font-size: .75rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .who { flex: 1 1 auto; min-width: 0; display: flex; align-items: baseline; gap: .5rem; }
  .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cd { flex: 0 0 auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: var(--t-xs); color: var(--ink-3); }
  .cd.raw { color: var(--warn); font-family: inherit; }
  .acts { flex: 0 0 auto; display: flex; gap: .125rem; }

  .ib { display: grid; place-items: center; width: 2rem; height: 2rem; padding: 0;
        background: none; border: 0; border-radius: var(--r-sm); color: var(--ink-3); cursor: pointer;
        transition: color .12s var(--ease), background .12s var(--ease); }
  .ib:hover { color: var(--ink); background: rgba(255, 255, 255, .05); }
  .ib:active { background: rgba(255, 255, 255, .1); }
  .ib.rm:hover { color: #ff9d9d; background: rgba(255, 120, 120, .1); }
  .ib:disabled { color: #4a5b6b; cursor: default; background: none; }
  .i { width: 14px; height: 14px; display: block; }

  .empty { padding: 1rem; border: 1px dashed var(--line-hi); border-radius: var(--r); }
  .empty p { margin: 0; font-size: var(--t-sm); color: var(--ink-2); max-width: 58ch;
             text-wrap: pretty; }

  /* Always offered, not only when nothing is picked: the second language a viewer
     reads is usually also one their browser already knows about. */
  .go { margin-top: .75rem; }
  .go-label { display: block; font-size: var(--t-xs); color: var(--ink-3); margin-bottom: .35rem; }

  .find { position: relative; margin-top: 1rem; }
  .find .i { position: absolute; left: .75rem; top: 50%; margin-top: -7px; color: var(--ink-3); pointer-events: none; }
  input[type="search"], input[type="number"] {
    width: 100%; padding: .5rem .75rem; background: var(--raise); color: inherit;
    border: 1px solid var(--line-hi); border-radius: var(--r); font: inherit; font-size: var(--t-md);
  }
  input[type="search"] { padding-left: 2.25rem; }
  input:disabled { opacity: .5; cursor: not-allowed; }
  input::placeholder { color: var(--ink-3); }
  input[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }
  :focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }

  /* The field scrolls, so its bottom edge cuts a row of pills in half. Left alone
     that reads as broken rather than as more-below, so the wrapper fades the cut and
     the script drops the fade the moment there is nothing left to scroll to. The fade
     also lifts on focus, or it would paint over the focused pill's ring. */
  .bwrap { position: relative; }
  .bwrap::before, .bwrap::after { content: ""; position: absolute; left: 0; right: 0;
    height: 2rem; pointer-events: none; opacity: 1; transition: opacity .15s var(--ease); }
  .bwrap::before { top: 0;
    background: linear-gradient(to top, rgba(19, 30, 41, 0), var(--panel)); }
  .bwrap::after { bottom: 0;
    background: linear-gradient(to bottom, rgba(19, 30, 41, 0), var(--panel)); }
  .bwrap.at-top::before, .bwrap.at-end::after { opacity: 0; }
  .bwrap:focus-within::before, .bwrap:focus-within::after { opacity: 0; }
  .browse { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .75rem;
            max-height: 11.5rem; overflow-y: auto; padding: 2px 2px 0;
            scroll-padding: .5rem 0; scrollbar-width: thin;
            scrollbar-color: var(--line-hi) transparent; }
  .browse::-webkit-scrollbar { width: 9px; }
  .browse::-webkit-scrollbar-thumb { background: var(--line-hi); border-radius: var(--r-pill);
    border: 3px solid var(--panel); }
  .opt { display: inline-flex; align-items: center; gap: .35rem; padding: .3rem .65rem;
         background: var(--raise); border: 1px solid var(--line-hi); border-radius: var(--r-pill);
         color: var(--ink-2); font: inherit; font-size: var(--t-sm); cursor: pointer;
         scroll-margin: .5rem 0;
         transition: color .12s var(--ease), border-color .12s var(--ease); }
  .opt:hover { color: var(--ink); border-color: var(--teal); }
  .opt:active { background: #1b2a38; }
  .opt .i { width: 11px; height: 11px; color: var(--ink-3); }
  .opt:hover .i { color: var(--teal); }
  .none { margin-top: .75rem; }
  .none p { margin: 0 0 .5rem; font-size: var(--t-sm); color: var(--ink-2); max-width: 58ch; }

  /* Three states of one preference: a segmented control, because the options are
     short, mutually exclusive and worth reading at once. */
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: .25rem; margin: 0;
         padding: .25rem; border: 1px solid var(--line); border-radius: var(--r);
         background: var(--raise); min-width: 0; }
  .seg label { position: relative; display: block; }
  .seg input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
  .seg span { display: block; text-align: center; padding: .45rem .25rem; border-radius: var(--r-sm);
              font-size: var(--t-sm); color: var(--ink-2); white-space: nowrap;
              transition: color .12s var(--ease), background .12s var(--ease); }
  .seg label:hover span { color: var(--ink); }
  .seg input:checked + span { background: rgba(53, 183, 171, .15); color: var(--teal); font-weight: 600; }
  .seg input:focus-visible + span { outline: 2px solid var(--teal); outline-offset: 2px; }

  details.adv { border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--panel);
                margin-bottom: 1rem; }
  details.adv > summary { list-style: none; cursor: pointer; padding: 1rem 1.25rem;
    font-size: var(--t-md); font-weight: 600; color: var(--ink-2); display: flex;
    align-items: center; gap: .5rem; }
  details.adv > summary::-webkit-details-marker { display: none; }
  details.adv > summary:hover { color: var(--ink); }
  .caret { width: 9px; height: 9px; border-right: 1.6px solid currentColor; border-bottom: 1.6px solid currentColor;
           transform: rotate(-45deg); margin-left: auto; transition: transform .18s var(--ease); }
  details.adv[open] .caret { transform: rotate(45deg); }
  .advbody { padding: 0 1.25rem 1.25rem; }
  .advbody label { display: block; font-size: var(--t-sm); font-weight: 600; margin-bottom: .25rem; }
  .advbody .hint { font-weight: 400; color: var(--ink-3); font-size: var(--t-sm);
                   display: block; margin-bottom: .5rem; }
  #limit { width: 6rem; font-variant-numeric: tabular-nums; }

  /* The manual path: the install for every client that will not take a stremio:// link.
     In flow rather than in the pinned bar, which only has to hold the one action. */
  .manual p { margin: 0 0 .75rem; font-size: var(--t-sm); color: var(--ink-2); max-width: 62ch; }
  .urlrow { display: flex; gap: .5rem; }
  code { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    background: var(--raise); border: 1px solid var(--line); border-radius: var(--r);
    padding: .5rem .625rem; font-size: var(--t-xs); color: var(--ink-3);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  button.copy { flex: 0 0 auto; display: inline-flex; align-items: center; gap: .375rem;
    padding: 0 .875rem; background: var(--raise); color: var(--ink-2); border: 1px solid var(--line-hi);
    border-radius: var(--r); font: inherit; font-size: var(--t-sm); cursor: pointer;
    transition: color .12s var(--ease), border-color .12s var(--ease); }
  button.copy:hover { color: var(--ink); border-color: var(--teal); }
  button.copy:active { background: #1b2a38; }
  button.copy.done { color: var(--teal); border-color: rgba(53, 183, 171, .5); }

  /* The action, kept in reach of a long list rather than parked at the bottom. */
  .bar { position: sticky; bottom: 0; background: var(--bg); border-top: 1px solid var(--line);
         padding: .875rem 0 1.25rem; margin-top: .5rem; }
  .barin { max-width: 40rem; margin: 0 auto; padding: 0 1.15rem; }
  a.install { display: flex; align-items: center; justify-content: center; gap: .5rem;
    padding: .8rem 1rem; border-radius: var(--r); text-decoration: none; font-weight: 700;
    /* Stremio's teal-to-blue, with the blue end lifted off #12688C: the dark ink read
       2.67:1 against it, and this is the deepest blue that still clears 4.5. */
    color: #04222a; background: linear-gradient(135deg, #35B7AB, #2AA3BC 55%, #1E90BC);
    box-shadow: 0 4px 14px -6px rgba(0, 0, 0, .65); transition: filter .12s var(--ease); }
  a.install:hover { filter: brightness(1.08); }
  a.install:active { filter: brightness(.94); }
  a.install .i { width: 15px; height: 15px; }

  .sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

  @media (max-width: 30rem) {
    main { padding-top: 1.6rem; }
    .panel, .advbody { padding-left: 1rem; padding-right: 1rem; }
    details.adv > summary { padding-left: 1rem; padding-right: 1rem; }
    .browse { max-height: 9rem; }
    .seg span { padding-left: .125rem; padding-right: .125rem; font-size: var(--t-xs); }
    /* Thumbs, not cursors: the remove control sits next to the reorder ones. */
    .ib { width: 2.4rem; height: 2.4rem; }
    .acts { gap: .25rem; }
  }
</style>
</head>
<body>
<!--
THESIS: the one decision on this page is a ranked list of languages, so the page is
that list being built. Refuses the three-equal-fields form the settings happen to be.
OWN-WORLD: Stremio's own palette made structural, not decorative. Teal is spent only
on the ordinals and the single action; slate grounds, hairline panels, mono reserved
for codes.
STORY: the visitor is offered their own browser's languages, ranks what they want,
sees every spelling resolved, and installs without scrolling back.
FIRST VIEWPORT: title, one line, then the ranked list at full width with its ordinals,
search under it, the whole browsable language field below, action pinned in reach.
FORM: shaped directly; narrow specified request inside a world the user pinned.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
-->
<main>
  <h1>TheSubtitleDB</h1>
  <p class="lede">Subtitles for Stremio, from a corpus of over ten million files in 185 languages.</p>

  <section class="panel" aria-labelledby="lh">
    <div class="ph">
      <h2 id="lh">Languages</h2>
      <span class="count" id="count"></span>
    </div>
    <p class="sub">Ranked. The first one you pick is the one you are offered first.</p>

    <ol class="chosen" id="chosen" role="list">${rows}</ol>

    <div class="empty" id="empty" hidden>
      <p>Nothing picked, so every language is offered, ranked by how well each subtitle matches what you are watching.</p>
    </div>

    <div class="go" id="go" hidden></div>

    <div class="find">
      ${icon('search')}
      <input id="search" type="search" placeholder="Search ${count} languages, or type a code"
        spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Search languages">
    </div>
    <div class="bwrap" id="bwrap"><div class="browse" id="browse"></div></div>
    <div class="none" id="none" role="status" hidden></div>
    <p class="sr" id="say" role="status" aria-live="polite"></p>
  </section>

  <section class="panel" aria-labelledby="hh">
    <h2 id="hh">Hearing impaired subtitles</h2>
    <p class="sub">Subtitles that also describe sound: music, a door, a name off screen. Prefer puts them first.</p>
    <fieldset class="seg" id="hi">
      <legend class="sr">Hearing impaired subtitles</legend>
      ${hiRadios}
    </fieldset>
  </section>

  <details class="adv">
    <summary>Advanced<span class="caret" aria-hidden="true"></span></summary>
    <div class="advbody">
      <label for="limit">How many subtitles to weigh per title
        <span class="hint">1 to 100. Raising it widens the list the ranking picks from.</span></label>
      <input id="limit" type="number" min="1" max="100" value="${config.limit}">
    </div>
  </details>

  <section class="panel manual" aria-labelledby="mh">
    <h2 id="mh" class="sr">Install by hand</h2>
    <p>The button below opens the Stremio app. If nothing happens, copy this and paste it into <b>Add-ons &rsaquo; Add addon</b>.</p>
    <div class="urlrow">
      <code id="url">https://${escapeHtml(host)}/${initial}/manifest.json</code>
      <button class="copy" id="copy" type="button">${icon('copy')}<span>Copy</span></button>
    </div>
  </section>
</main>

<div class="bar">
  <div class="barin">
    <a class="install" id="install" href="stremio://${escapeHtml(host)}/${initial}/manifest.json">${icon('install')}Install in Stremio</a>
  </div>
</div>
<script>
  var SPELLINGS = ${JSON.stringify(spellingTable())};
  var NAMES = ${JSON.stringify(names)};
  var HOST = ${JSON.stringify(host)};
  var ICON = ${JSON.stringify({
    up: icon('up'),
    down: icon('down'),
    remove: icon('remove'),
    plus: icon('plus'),
    copy: icon('copy'),
    check: icon('check'),
  })};
  var MAX = 16;

  var el = function (id) { return document.getElementById(id); };
  var chosen = ${JSON.stringify(config.languages)};
  var ALL = Object.keys(NAMES).map(function (c) { return [c, NAMES[c]]; })
    .sort(function (a, b) { return a[1].localeCompare(b[1]); });
  var fresh = null;

  /* The same rules as src/languages.ts toCode, against the same table. An unknown
     two-letter code passes through on purpose: the corpus carries 185 codes and the
     name table covers far fewer, so refusing them would hide subtitles that exist. */
  function toCode(raw) {
    var v = String(raw).trim().toLowerCase().replace(/_/g, '-').replace(/\\s+/g, ' ');
    if (!v) return null;
    if (NAMES[v]) return v;
    if (SPELLINGS[v]) return SPELLINGS[v];
    if (v.indexOf('-') > 0) return toCode(v.split('-')[0]);
    var plain = v.replace(/[()]/g, ' ').replace(/\\s+/g, ' ').trim();
    if (plain !== v) return toCode(plain);
    if (/^[a-z]{2}$/.test(v)) return v;
    return null;
  }

  /* What this browser says its owner reads, resolved to corpus codes. Offered rather
     than applied: a default nobody chose is still a default nobody wanted. */
  function mine() {
    var tags = navigator.languages || [navigator.language || ''];
    var out = [];
    for (var i = 0; i < tags.length; i++) {
      var c = toCode(tags[i]);
      if (c && out.indexOf(c) < 0) out.push(c);
    }
    return out;
  }

  function label(code) { return NAMES[code] || code; }
  function say(text) { el('say').textContent = text; }

  function add(code) {
    if (!code || chosen.indexOf(code) >= 0) return false;
    if (chosen.length >= MAX) { say('That is the most languages you can rank.'); return false; }
    chosen.push(code);
    fresh = code;
    paint();
    say(label(code) + ' added at ' + chosen.length + '.');
    return true;
  }

  function move(code, by) {
    var i = chosen.indexOf(code);
    var j = i + by;
    if (i < 0 || j < 0 || j >= chosen.length) return;
    chosen.splice(j, 0, chosen.splice(i, 1)[0]);
    paint();
    say(label(code) + ' moved to ' + (j + 1) + ' of ' + chosen.length + '.');
  }

  /* Rebuilding the list throws away whatever had focus, and ranking is the one task
     on this page that takes repeated presses. So the control that was pressed is
     found again by what it does, not by where it was. */
  function refocus(code, act) {
    var row = document.querySelector('.row[data-code="' + code + '"]');
    if (!row) return false;
    var want = row.querySelector('button[data-act="' + act + '"]');
    if (!want || want.disabled) want = row.querySelector('.ib.rm');
    want.focus();
    return true;
  }

  function drawChosen() {
    var ol = el('chosen');
    ol.textContent = '';
    for (var i = 0; i < chosen.length; i++) {
      var code = chosen[i];
      var named = NAMES[code];
      var li = document.createElement('li');
      li.className = 'row' + (code === fresh ? ' new' : '');
      li.setAttribute('data-code', code);
      li.innerHTML =
        '<span class="ord">' + (i + 1) + '</span>' +
        '<span class="who"><span class="nm"></span><span class="cd' + (named ? '' : ' raw') + '"></span></span>' +
        '<span class="acts">' +
        '<button type="button" class="ib" data-act="up"' + (i === 0 ? ' disabled' : '') + '></button>' +
        '<button type="button" class="ib" data-act="down"' + (i === chosen.length - 1 ? ' disabled' : '') + '></button>' +
        '<button type="button" class="ib rm" data-act="rm"></button></span>';
      li.querySelector('.nm').textContent = label(code);
      li.querySelector('.cd').textContent = named ? code : 'no name';
      var b = li.querySelectorAll('button');
      b[0].innerHTML = ICON.up; b[0].setAttribute('aria-label', 'Move ' + label(code) + ' up');
      b[1].innerHTML = ICON.down; b[1].setAttribute('aria-label', 'Move ' + label(code) + ' down');
      b[2].innerHTML = ICON.remove; b[2].setAttribute('aria-label', 'Remove ' + label(code));
      ol.appendChild(li);
    }
    fresh = null;
    el('count').textContent = chosen.length
      ? chosen.length + ' picked' + (chosen.length >= MAX ? ', the most you can rank' : '')
      : '';
    el('empty').hidden = chosen.length > 0;
  }

  /* The browser's own languages, offered wherever the viewer is in the list rather
     than only when it is empty: the second language someone reads is usually one
     their browser already knows about too. */
  function drawGo() {
    var box = el('go');
    box.textContent = '';
    var ours = mine().filter(function (c) { return chosen.indexOf(c) < 0; });
    box.hidden = ours.length === 0 || chosen.length >= MAX;
    if (box.hidden) return;
    var head = document.createElement('span');
    head.className = 'go-label';
    head.textContent = 'From your browser';
    box.appendChild(head);
    for (var i = 0; i < ours.length; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.setAttribute('data-code', ours[i]);
      b.innerHTML = ICON.plus;
      b.appendChild(document.createTextNode('Use ' + label(ours[i])));
      box.appendChild(b);
    }
  }

  /* The fades over the field's cut edges, dropped where the cut is not hiding
     anything. Both ends matter: a field scrolled halfway is sliced through a row of
     pills at the top exactly as it is at the bottom. */
  function fade() {
    var box = el('browse');
    var w = el('bwrap').classList;
    w.toggle('at-top', box.scrollTop <= 4);
    w.toggle('at-end', box.scrollHeight - box.clientHeight - box.scrollTop <= 4);
  }

  function drawBrowse() {
    var q = el('search').value.trim().toLowerCase();
    var hit = toCode(q);
    var box = el('browse');
    var none = el('none');
    box.textContent = '';
    none.textContent = '';

    if (chosen.length >= MAX) {
      el('search').disabled = true;
      none.hidden = false;
      var capped = document.createElement('p');
      capped.textContent =
        MAX + ' is the most you can rank. Remove one to add another.';
      none.appendChild(capped);
      return fade();
    }
    el('search').disabled = false;

    // Offered above already, so not offered again three inches lower.
    var offered = el('go').hidden ? [] : mine();
    var list = ALL.filter(function (p) {
      if (chosen.indexOf(p[0]) >= 0 || offered.indexOf(p[0]) >= 0) return false;
      if (!q) return true;
      return p[1].toLowerCase().indexOf(q) >= 0 || p[0] === hit || p[0].indexOf(q) === 0;
    });

    for (var i = 0; i < list.length; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.setAttribute('data-code', list[i][0]);
      // One tab stop for the whole field; the arrows move inside it. Otherwise the
      // install button is 70 tab presses away from the search box.
      b.tabIndex = i === 0 ? 0 : -1;
      b.innerHTML = ICON.plus;
      b.appendChild(document.createTextNode(list[i][1]));
      box.appendChild(b);
    }

    /* Only ${count} of the corpus's 185 codes have a name to browse for, so a search
       that finds nothing is not always a dead end: if it resolves to a code, offer it
       here rather than sending the viewer somewhere else to type it again. */
    none.hidden = !q || list.length > 0;
    if (none.hidden) return fade();
    var p = document.createElement('p');
    if (hit && chosen.indexOf(hit) < 0) {
      p.textContent = 'No name for "' + hit + '" here, but the addon will pass it through as a code.';
      var addit = document.createElement('button');
      addit.type = 'button';
      addit.className = 'opt';
      addit.innerHTML = ICON.plus;
      addit.appendChild(document.createTextNode('Add ' + hit));
      addit.onclick = function () {
        if (add(hit)) { el('search').value = ''; drawBrowse(); el('search').focus(); }
      };
      none.appendChild(p);
      none.appendChild(addit);
    } else {
      p.textContent = 'Nothing matches "' + q + '". Try the English name, or a two-letter code.';
      none.appendChild(p);
    }
    fade();
  }

  function drawUrl() {
    var n = parseInt(el('limit').value, 10);
    if (!isFinite(n)) n = ${DEFAULT_CONFIG.limit};
    n = Math.min(100, Math.max(1, n));
    var hi = document.querySelector('input[name="hi"]:checked');
    var json = JSON.stringify({ l: chosen, h: hi ? hi.value : 'include', n: n });
    var cfg = btoa(String.fromCharCode.apply(null, new TextEncoder().encode(json)))
      .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
    el('install').href = 'stremio://' + HOST + '/' + cfg + '/manifest.json';
    el('url').textContent = 'https://' + HOST + '/' + cfg + '/manifest.json';
  }

  function paint() { drawChosen(); drawGo(); drawBrowse(); drawUrl(); }

  el('chosen').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var code = btn.closest('.row').getAttribute('data-code');
    var act = btn.getAttribute('data-act');
    if (act !== 'rm') { move(code, act === 'up' ? -1 : 1); return refocus(code, act); }
    var at = chosen.indexOf(code);
    chosen = chosen.filter(function (c) { return c !== code; });
    paint();
    say(label(code) + ' removed, ' + chosen.length + ' left.');
    var next = chosen[Math.min(at, chosen.length - 1)];
    if (!next || !refocus(next, 'rm')) el('search').focus();
  });

  el('browse').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-code]');
    if (!btn) return;
    var at = [].indexOf.call(el('browse').children, btn);
    if (!add(btn.getAttribute('data-code'))) return;
    var after = el('browse').children[Math.min(at, el('browse').children.length - 1)];
    if (after) { after.tabIndex = 0; after.focus(); } else el('search').focus();
  });

  /* The field is one long wrapped line of pills, so left and right walk it and Tab
     leaves it. Up and down are left to scroll the container, which is what they look
     like they should do. */
  el('browse').addEventListener('keydown', function (e) {
    var by = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    var kids = el('browse').children;
    var at = [].indexOf.call(kids, document.activeElement);
    if (at < 0) return;
    var to = by ? at + by : e.key === 'Home' ? 0 : e.key === 'End' ? kids.length - 1 : -1;
    if (to < 0 || to >= kids.length) return;
    e.preventDefault();
    kids[at].tabIndex = -1;
    kids[to].tabIndex = 0;
    kids[to].focus();
  });

  el('go').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-code]');
    if (btn && add(btn.getAttribute('data-code'))) el('search').focus();
  });

  el('browse').addEventListener('scroll', fade, { passive: true });
  window.addEventListener('resize', fade);

  el('search').addEventListener('input', drawBrowse);
  el('search').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // Enter on an empty box used to add whatever happened to be first in the field.
    if (!el('search').value.trim()) return;
    var first = el('browse').querySelector('button[data-code]');
    var code = first ? first.getAttribute('data-code') : toCode(el('search').value);
    if (code && add(code)) { el('search').value = ''; drawBrowse(); }
  });

  document.querySelectorAll('input[name="hi"]').forEach(function (r) {
    r.addEventListener('change', drawUrl);
  });
  // Written back, not just clamped: 500 in the box with 100 in the URL is a settings
  // page showing a setting it is not using.
  el('limit').addEventListener('input', drawUrl);
  el('limit').addEventListener('change', function () {
    var n = parseInt(el('limit').value, 10);
    el('limit').value = isFinite(n) ? Math.min(100, Math.max(1, n)) : ${DEFAULT_CONFIG.limit};
    drawUrl();
  });

  el('copy').addEventListener('click', function () {
    var btn = el('copy');
    var span = btn.querySelector('span');
    var text = el('url').textContent;
    var swap = function (svg, word) {
      btn.firstChild.outerHTML = svg;
      btn.querySelector('span').textContent = word;
    };
    var done = function () {
      btn.classList.add('done');
      swap(ICON.check, 'Copied');
      setTimeout(function () { btn.classList.remove('done'); swap(ICON.copy, 'Copy'); }, 1500);
    };
    /* Stremio opens this page in a webview, where the clipboard API is not always
       there and not always permitted. Selecting the text is the answer that always
       works, so it is the fallback rather than an error message. */
    var select = function () {
      var range = document.createRange();
      range.selectNodeContents(el('url'));
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      var mac = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
      span.textContent = mac ? 'Press Cmd+C' : 'Press Ctrl+C';
      setTimeout(function () { span.textContent = 'Copy'; }, 2500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, select);
    } else { select(); }
  });

  paint();
</script>
</body>
</html>`;
}
