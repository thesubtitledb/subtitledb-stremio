/**
 * The configure page.
 *
 * Nothing here renders the page in a browser, so what is asserted is what a browser
 * cannot disagree about: the tables the page ships, the controls it ships them with,
 * and the fact that it asks the network for nothing.
 *
 * The table assertions are the load-bearing ones. The page used to carry a
 * hand-written subset of the spelling table, a name outside it silently resolved to
 * nothing, and the term was dropped without a word -- so "Tagalog" produced an install
 * configured for every language and looked exactly like an install configured for
 * Tagalog. The picker replaces the box that made that reachable; the tables stay,
 * because search and the raw-code escape hatch both run through the same resolver.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.js';
import { nameTable, spellingTable, toCode } from '../src/languages.js';
import { configurePage } from '../src/manifest.js';

const ORIGIN = 'https://api.thesubtitledb.org/integrations/stremio';
const page = (config = DEFAULT_CONFIG) => configurePage(ORIGIN, config);

describe('the tables the page ships to the browser', () => {
  it('resolve every spelling to what the addon itself would resolve it to', () => {
    // The page and the worker have to agree on what a spelling means. They did not:
    // the page had its own forty-entry table and the worker had this one.
    const table = spellingTable();
    expect(Object.keys(table).length).toBeGreaterThan(150);
    for (const [spelling, code] of Object.entries(table)) {
      expect(toCode(spelling), spelling).toBe(code);
    }
  });

  it('cover the names that the old hand-written subset did not', () => {
    // Every one of these is a real language in the corpus and every one resolved to
    // null on the old page.
    for (const name of ['tagalog', 'tamil', 'malay', 'bengali', 'estonian', 'catalan']) {
      expect(toCode(name), name).not.toBeNull();
      expect(spellingTable()[name], name).toBeDefined();
    }
  });

  it('name all but one of the codes they resolve to', () => {
    // Yiddish is the exception: the vendored name table has no yi, so the picker draws
    // it as a bare code rather than as a name. That path exists for exactly this, and
    // pinning the set here means both a name arriving upstream and a second nameless
    // code appearing are noticed rather than absorbed.
    const names = nameTable();
    const nameless = [...new Set(Object.values(spellingTable()).filter((c) => !names[c]))];
    expect(nameless).toEqual(['yi']);
  });

  it('are both in the page, as JSON a browser can parse', () => {
    const html = page();
    expect(html).toContain(`var SPELLINGS = ${JSON.stringify(spellingTable())};`);
    expect(html).toContain(`var NAMES = ${JSON.stringify(nameTable())};`);
  });
});

describe('picking languages', () => {
  it('is a picker, not a box you type a list into', () => {
    const html = page();
    // The control that made an unrecognised spelling reachable is gone outright.
    expect(html).not.toContain('id="languages"');
    expect(html).toContain('id="search"');
    expect(html).toContain('id="browse"');
    expect(html).toContain('id="chosen"');
  });

  it('offers every named language to browse, and says how many there are', () => {
    const count = Object.keys(nameTable()).length;
    expect(page()).toContain(`Search ${count} languages, or type a code`);
  });

  it('draws the chosen languages server-side, in the order they were chosen', () => {
    // The page has to be right before its script runs: Stremio opens it in a webview,
    // and a list that appears only on paint reads as an empty list.
    const html = configurePage(ORIGIN, {
      languages: ['fr', 'de'],
      hearingImpaired: 'include',
      limit: 50,
    });
    const french = html.indexOf('French');
    const german = html.indexOf('German');
    expect(french).toBeGreaterThan(-1);
    expect(german).toBeGreaterThan(french);
    expect(html).toContain('<span class="ord">1</span>');
    expect(html).toContain('<span class="ord">2</span>');
  });

  it('says the order is the preference, because it is the only thing that ranks', () => {
    expect(page()).toContain('The first one you pick is the one you are offered first');
  });

  it('gives every chosen language a way up, a way down, and a way out', () => {
    const html = configurePage(ORIGIN, {
      languages: ['en'],
      hearingImpaired: 'include',
      limit: 50,
    });
    expect(html).toContain('aria-label="Move English up"');
    expect(html).toContain('aria-label="Move English down"');
    expect(html).toContain('aria-label="Remove English"');
  });

  it('draws a code with no name as a code, rather than pretending it has one', () => {
    const html = configurePage(ORIGIN, {
      languages: ['yi'],
      hearingImpaired: 'include',
      limit: 50,
    });
    expect(html).toContain('class="cd raw"');
    expect(html).toContain('>yi<');
  });

  it('says what an empty list actually does, which is not nothing', () => {
    // No languages means every language. That was never stated anywhere, and it is
    // the difference between a filter and no filter.
    const html = page();
    expect(html).toContain('id="empty"');
    expect(html).toContain('every language is offered');
  });

  it('offers the browser’s own languages rather than applying them', () => {
    const html = page();
    expect(html).toContain('navigator.languages');
    expect(html).toContain("'Use '");
  });

  it('offers a code with no name where it was searched for, not in a second box', () => {
    // Only 68 of the corpus's 185 codes have a name to browse for, so searching one of
    // the other 117 finds nothing. That is not a dead end and the page should not send
    // the viewer somewhere else to type it again.
    const html = page();
    // It says "pass it through", not "the corpus has it": the page knows 68 codes, so
    // for the other 117 it cannot promise there is anything behind the code.
    expect(html).toContain('the addon will pass it through as a code');
    expect(html).toContain("'Add ' + hit");
    // The separate raw-code field this replaced is gone, not hidden.
    expect(html).not.toContain('id="raw"');
    expect(html).not.toContain('id="rawadd"');
  });

  it('says plainly when a search matches nothing at all', () => {
    expect(page()).toContain('Try the English name, or a two-letter code');
  });
});

describe('the rest of the settings', () => {
  it('offers the three hearing-impaired states as one control, preselected', () => {
    const html = configurePage(ORIGIN, {
      languages: ['en'],
      hearingImpaired: 'prefer',
      limit: 50,
    });
    for (const value of ['include', 'prefer', 'exclude']) {
      expect(html).toContain(`type="radio" name="hi" value="${value}"`);
    }
    // Checked in the markup, so the page is right before its script runs.
    expect(html).toContain('value="prefer" checked');
    expect(html).not.toContain('value="include" checked');
  });

  it('explains what a hearing-impaired subtitle is, not just what the options are', () => {
    expect(page()).toContain('Subtitles that also describe sound');
  });

  it('demotes the raw API limit into a disclosure, closed, in human words', () => {
    const html = page();
    // It was a top-level field with equal weight to the languages, labelled with the
    // API's own word. Nobody opening this page has an opinion about it.
    expect(html).toMatch(/<details class="adv">/);
    expect(html).not.toMatch(/<details class="adv" open>/);
    expect(html).toContain('How many subtitles to weigh per title');
    expect(html).not.toContain('Subtitles to consider per title');
  });
});

describe('the install action', () => {
  it('carries the config it was opened with, in both links', () => {
    const html = configurePage(ORIGIN, {
      languages: ['fr', 'de'],
      hearingImpaired: 'exclude',
      limit: 20,
    });
    // Asserting the literal segment would pin the encoder rather than the page, so
    // both links are checked against the same segment instead. The host carries a
    // path (the addon is mounted under /integrations/stremio), so the segment is the
    // last one before manifest.json, not the second one overall.
    const m = html.match(/href="stremio:\/\/.+\/([A-Za-z0-9_-]+)\/manifest\.json"/);
    expect(m).not.toBeNull();
    const segment = m?.[1] as string;
    expect(html).toContain(
      `https://api.thesubtitledb.org/integrations/stremio/${segment}/manifest.json`,
    );
  });

  it('follows the origin it was given, so a local run does not install production', () => {
    const html = configurePage('http://localhost:8787/integrations/stremio', DEFAULT_CONFIG);
    expect(html).toContain('stremio://localhost:8787/integrations/stremio/');
    expect(html).not.toContain('api.thesubtitledb.org');
  });

  it('offers a copy button, because the URL is the install on every client but one', () => {
    const html = page();
    expect(html).toContain('id="copy"');
    expect(html).toContain('navigator.clipboard');
    // A webview with no clipboard API has to leave the viewer something to do.
    expect(html).toContain('Press Ctrl+C');
  });

  it('says what the install button does, so a dead stremio:// is not a dead page', () => {
    expect(page()).toContain('If nothing happens');
  });
});

describe('the ways the page can lie to you', () => {
  it('defines every icon its own script reaches for', () => {
    // The copy button reset itself to the literal string "undefined" because ICON
    // shipped no copy key while the handler asked for one, and outerHTML stringifies
    // undefined rather than throwing. A toContain per icon would not have caught it,
    // so this asks the page which keys it uses and checks it ships them.
    const html = page();
    const decl = html.match(/var ICON = (\{.*?\});\n/s);
    expect(decl).not.toBeNull();
    const shipped = Object.keys(JSON.parse(decl?.[1] as string));
    const used = [...html.matchAll(/\bICON\.([a-z]+)\b/g)].map((m) => m[1] as string);
    expect(new Set(used).size).toBeGreaterThan(3);
    for (const key of used) expect(shipped, key).toContain(key);
  });

  it('does not add a language when Enter is pressed on an empty search box', () => {
    // It used to take whatever was first in the field, which with English already
    // picked meant Albanian. On a phone Enter is the keyboard's Go key.
    expect(page()).toContain("if (!el('search').value.trim()) return;");
  });

  it('writes the clamped limit back into the field it clamped', () => {
    // 500 in the box with 100 in the URL is a settings page showing a setting it is
    // not using.
    expect(page()).toContain("el('limit').value = isFinite(n)");
  });

  it('says so when the cap is reached, rather than ignoring the click', () => {
    const html = page();
    expect(html).toContain('is the most you can rank');
    expect(html).toContain("el('search').disabled = true");
  });

  it('describes the empty case the way order() actually behaves', () => {
    // order() still ranks on release match, the hearing-impaired preference and cue
    // count when no language is picked, so "whatever order the corpus returns" was
    // both wrong and an undersell.
    const html = page();
    expect(html).toContain('ranked by how well each subtitle matches what you are watching');
    expect(html).not.toContain('in whatever order the corpus returns');
  });

  it('announces what it did, for a viewer who cannot see the list move', () => {
    const html = page();
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("' moved to '");
    // list-style:none strips list semantics in WebKit, which is Stremio's own webview.
    expect(html).toContain('id="chosen" role="list"');
  });

  it('puts focus back on the control that was just pressed', () => {
    // Ranking takes repeated presses and rebuilding the list drops focus to body.
    expect(page()).toContain('function refocus(');
  });
});

describe('what the page does not do', () => {
  it('asks the network for nothing at all', () => {
    // The whole point of shipping the tables inline. A configure page that fetches is
    // a configure page that is blank behind a captive portal, in a webview with no
    // CORS, or when the API it would ask is the thing being configured.
    const html = page();
    expect(html).not.toMatch(/\bfetch\s*\(/);
    expect(html).not.toContain('XMLHttpRequest');
    expect(html).not.toContain('<script src');
    expect(html).not.toContain('stylesheet');
    expect(html).not.toMatch(/(?:src|href)="https?:\/\//);
  });

  it('draws its icons rather than borrowing glyphs', () => {
    const html = page();
    expect(html).toContain('stroke-width="1.6"');
    // No emoji, dingbats, arrows or box-drawing standing in for an icon set.
    expect(html).not.toMatch(/[←-⇿]|[─-➿]|[\u{1f300}-\u{1faff}]/u);
  });
});
