'use strict';
/**
 * One markdown document, rendered into one published page.
 *
 * Shared by every artifact that is a document rather than a program. They were
 * hand-written HTML to begin with, and each one drifted from the repo copy it
 * restated — usually within a day, and always in the direction of looking more
 * finished than the repo was. So they are generated: the markdown in docs/ is
 * the document, and this file only decides what it looks like.
 *
 * STRICT ON PURPOSE. The renderer understands the subset of markdown these
 * documents use and throws on anything else, naming the line. A generator that
 * quietly drops a construct it does not know produces a page missing a
 * paragraph nobody notices is missing, which is worse than a build that stops
 * and says why.
 *
 * No markdown dependency, in keeping with the rest: eight packages, no build
 * step, and the source that ships is the source that runs.
 *
 * The look is brand/artifact-theme.css, inlined verbatim so no page can drift
 * from its siblings. The only CSS added here is for the blocks that sheet has
 * no opinion on — tables, numbered steps, a sub-heading — and every value in it
 * is one of its tokens.
 */

const fs = require('fs');
const path = require('path');
const config = require('../server/config');

const THEME = path.join(config.root, 'brand', 'artifact-theme.css');

/* --- Escaping -------------------------------------------------------------
 * Everything from the markdown is escaped before any tag is added. These
 * documents hold angle brackets in prose, and a page that ships to somebody
 * else's browser is not where you want to find that out.
 */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Inline markdown, in one pass over the escaped text.
 *
 * Code spans are taken first and parked, because backticks are the one place
 * where `**` is meant literally rather than as emphasis. Done in the other
 * order, a code span holding two asterisks comes out bold and broken.
 */
/**
 * Where a code span is parked while emphasis is applied.
 *
 * A control character, because the first version used " 0 " and that collided
 * with ordinary numbers: "eight tries in 8 minutes" restored a code span that
 * did not exist and rendered as undefined. Stripped from the input first, so it
 * cannot be smuggled in from a document.
 */
const MARK = String.fromCharCode(0);

/* A status chip is a code span whose content opens with its state:
 * `ok: ready`, `todo: localhost`, `warn: unset`.
 *
 * IT IS WRITTEN THIS WAY SO GITHUB CAN READ IT TOO. These files are documents
 * in the repo first and published pages second, and the first syntax — a pair
 * of braces, `{{ok:ready}}` — was legible to exactly one of those two readers.
 * On GitHub thirteen of them sat in the middle of the state table as literal
 * punctuation, in the one table someone reads to find out where the project
 * stands. A code span already renders as a small boxed token there, which is
 * what a chip is, so the fallback needs no explaining: the state reads as a
 * state whether or not anything built the page.
 *
 * Only these three states are chips. Any other code span — `BASE_URL`,
 * `ADMIN_PASSWORD_HASH`, `datetime('now')` — is left as code, so the rule
 * cannot capture something that was only ever a snippet.
 */
const CHIP_KINDS = ['ok', 'todo', 'warn'];
const CHIP_RE = new RegExp(`^(${CHIP_KINDS.join('|')}):[ ]*(.+)$`);

function inline(src, lineNo) {
  const spans = [];
  let s = esc(src).replace(new RegExp(MARK, 'g'), '').replace(/`([^`]+)`/g, (_, code) => {
    const chip = code.match(CHIP_RE);
    spans.push(chip
      ? `<span class="tag ${chip[1]}">${chip[2].trim()}</span>`
      : '<code>' + code + '</code>');
    return MARK + (spans.length - 1) + MARK;
  });

  if (s.includes('`')) {
    throw new Error(`line ${lineNo}: an unclosed backtick — code spans must be paired`);
  }

  /* The old syntax, refused by name. It rendered as braces on GitHub rather
     than as nothing, so a leftover would be a visible wart rather than a
     silent one — but it would be a wart in the table this file exists to keep
     honest, and the fix is one line long. */
  if (/\{\{[a-z]+:[^}]+\}\}/.test(s)) {
    throw new Error(`line ${lineNo}: chips are code spans now — write \`ok: ready\`, `
      + `not {{ok:ready}}, so GitHub renders it too`);
  }

  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) =>
    `<a href="${href}">${text}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');

  if (s.includes('**')) {
    throw new Error(`line ${lineNo}: unbalanced ** — bold must open and close on one line`);
  }
  return s.replace(new RegExp(MARK + '(\\d+)' + MARK, 'g'), (_, n) => spans[Number(n)]);
}

/* --- Front matter ---------------------------------------------------------
 * The things the prose has no natural place for: the browser-tab title, the
 * eyebrow above the heading, the figures strip, and which repo file the footer
 * should credit. All optional — without them a page simply starts at its title.
 */
function frontMatter(raw) {
  /* Carriage returns first, for the same reason render() does it: git checks
   * these files out CRLF here, and `startsWith('---\n')` is false for a CRLF
   * file — so the front matter was not rejected, it was silently treated as
   * body text and the figures strip just stopped appearing. */
  const text = String(raw).replace(/\r\n?/g, '\n');
  if (!text.startsWith('---\n')) return { meta: { figures: [] }, body: text };
  const end = text.indexOf('\n---\n', 3);
  if (end === -1) throw new Error('front matter opened with --- and never closed');
  const meta = { figures: [] };
  let key = null;
  for (const raw of text.slice(4, end).split('\n')) {
    if (!raw.trim()) continue;
    const indented = /^\s/.test(raw);
    const line = raw.trim();
    if (!indented) {
      const m = /^([a-z_]+):\s*(.*)$/.exec(line);
      if (!m) throw new Error(`front matter: cannot read "${line}"`);
      key = m[1];
      if (m[2]) meta[key] = m[2];
    } else if (key === 'figures') {
      const m = /^(.+?)\s*=\s*(.+)$/.exec(line);
      if (!m) throw new Error(`front matter: a figure reads "<value> = <label>", got "${line}"`);
      meta.figures.push({ value: m[1].trim(), label: m[2].trim() });
    } else {
      throw new Error(`front matter: "${line}" is indented under "${key}", which takes no list`);
    }
  }
  return { meta, body: text.slice(end + 5) };
}

/**
 * Markdown to HTML, for the subset these documents use.
 *
 * Block level: h1 h2 h3, paragraphs, `-` lists, `1.` lists, pipe tables and
 * `---` rules. The classes come from the shared sheet — an unordered list is
 * the findings list, an ordered one the numbered steps, and a table is wrapped
 * so a wide one scrolls inside itself rather than taking the page with it.
 */
/** A heading turned into an anchor a contents list can point at. */
function slug(text) {
  return String(text).toLowerCase()
    .replace(/`[^`]*`/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

function render(md) {
  /* Carriage returns first. Some documents in this repo are stored CRLF, and in
   * a regular expression `.` does not match \r — so `(.*)$` failed on every
   * heading, the line fell through to the paragraph branch, and the paragraph
   * branch refused it without consuming it. That is an infinite loop, and it
   * presented as the build hanging rather than as anything to do with newlines. */
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const isTableRow = (l) => /^\|.*\|\s*$/.test(l);
  const cells = (l) => l.replace(/^\||\|\s*$/g, '').split('|').map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];
    const no = i + 1;

    if (!line.trim()) { i++; continue; }

    if (/^---+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    /* A fenced code block. The operational guides are mostly commands, so this
       is the one construct that carries their point. Contents are escaped and
       otherwise untouched — no highlighting, no inline markdown, because inside
       a fence a backtick and an asterisk are just characters. */
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { body.push(lines[i]); i++; }
      if (i >= lines.length) {
        throw new Error(`line ${no}: a code fence was opened and never closed`);
      }
      i++;
      out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = inline(h[2], no);
      if (level === 1) out.push(`<h1>${text}</h1>`);
      else if (level === 2) out.push(`<h2 class="section" id="${slug(h[2])}">${text}</h2>`);
      else out.push(`<h3 class="sub">${text}</h3>`);
      i++;
      continue;
    }
    if (/^#{4,}\s/.test(line)) {
      throw new Error(`line ${no}: headings deeper than ### have no style in these pages`);
    }

    /* A table: a header row, a divider of dashes, then body rows. The divider
       is required — a run of pipe lines without one is a table somebody started
       and did not finish, not something to guess at. */
    if (isTableRow(line)) {
      if (!isTableRow(lines[i + 1] || '') || !/^[|\-: ]+$/.test(lines[i + 1])) {
        throw new Error(`line ${no}: a table needs a |---|---| divider under its header`);
      }
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && isTableRow(lines[i])) { body.push(cells(lines[i])); i++; }
      const th = head.map((c) => `<th>${inline(c, no)}</th>`).join('');
      const rows = body.map((r) =>
        '<tr>' + r.map((c) => `<td>${inline(c, no)}</td>`).join('') + '</tr>').join('\n        ');
      out.push('<div class="tablewrap">\n      <table>\n        <thead><tr>' + th + '</tr></thead>'
        + '\n        <tbody>\n        ' + rows + '\n        </tbody>\n      </table>\n    </div>');
      continue;
    }

    /* Lists. A continuation line is indented; anything else ends the item, so a
       paragraph butted against a list is not swallowed into its last bullet. */
    const bullet = /^([-*])\s+(.*)$/.exec(line);
    const numbered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = !!numbered;
      const items = [];
      while (i < lines.length) {
        const m = ordered ? /^(\d+)\.\s+(.*)$/.exec(lines[i]) : /^([-*])\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        const parts = [m[2]];
        i++;
        while (i < lines.length && /^\s+\S/.test(lines[i])) { parts.push(lines[i].trim()); i++; }
        items.push(inline(parts.join(' '), no));
      }
      const tag = ordered ? 'ol' : 'ul';
      const cls = ordered ? 'steps' : 'findings';
      out.push(`<${tag} class="${cls}">\n      `
        + items.map((t) => `<li>${t}</li>`).join('\n      ')
        + `\n    </${tag}>`);
      continue;
    }

    if (/^\s+\S/.test(line)) {
      throw new Error(`line ${no}: indented text outside a list — these pages have no code blocks`);
    }
    /* A callout, in GitHub's blockquote-admonition spelling:
     *
     *   > [!NOTE] Use this while it lasts
     *   > Zero orders means nothing is precious yet.
     *
     * The label after the tag is optional and becomes the small heading the
     * shared sheet puts on a .note. WARNING and IMPORTANT get the flagged
     * variant, which is the one that reads as "do not skip this". */
    const callout = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i.exec(line);
    if (callout) {
      const kind = callout[1].toUpperCase();
      const label = callout[2].trim();
      const flagged = kind === 'WARNING' || kind === 'IMPORTANT' || kind === 'CAUTION';
      i++;
      const paras = [];
      let cur = [];
      while (i < lines.length && /^>/.test(lines[i])) {
        const text = lines[i].replace(/^>\s?/, '').trim();
        if (!text) { if (cur.length) { paras.push(cur.join(' ')); cur = []; } }
        else cur.push(text);
        i++;
      }
      if (cur.length) paras.push(cur.join(' '));
      if (!paras.length && !label) {
        throw new Error(`line ${no}: a callout with nothing in it`);
      }
      out.push(`<div class="note${flagged ? ' note--flag' : ''}">`
        + (label ? `\n      <h2>${inline(label, no)}</h2>` : '')
        + paras.map((p) => `\n      <p>${inline(p, no)}</p>`).join('')
        + '\n    </div>');
      continue;
    }
    if (/^>/.test(line)) {
      throw new Error(`line ${no}: a bare block quote has no style here — `
        + 'use > [!NOTE] or > [!WARNING] for a callout');
    }

    /* A contents list, written where it should appear. Built from the h2s, so
     * it cannot list a section that no longer exists — which is the failure a
     * hand-maintained contents list always eventually has. */
    if (/^<!--\s*toc\s*-->$/i.test(line.trim())) {
      out.push('<!--TOC-->');
      i++;
      continue;
    }

    // A paragraph runs until a blank line or the next block.
    const para = [];
    while (i < lines.length && lines[i].trim()
           && !/^([-*]|\d+\.)\s/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i])
           && !/^---+\s*$/.test(lines[i]) && !isTableRow(lines[i])
           && !/^```/.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    /* If a line reaches the paragraph branch and the paragraph branch will not
     * take it, nothing has consumed it and the loop would spin here forever.
     * Every earlier branch either advances or throws, so this is the net under
     * the next construct nobody thought about — a named error, not a hang. */
    if (!para.length) {
      throw new Error(`line ${no}: nothing knows how to render "${line.slice(0, 40)}"`);
    }
    out.push(`<p>${inline(para.join(' '), no)}</p>`);
  }

  /* The contents list is filled in last, once every h2 has been seen. Written
     before them it would be a promise about sections that may not arrive. */
  const toc = out
    .map((b) => /^<h2 class="section" id="([^"]+)">(.*)<\/h2>$/.exec(b))
    .filter(Boolean)
    .map((m) => `      <li><a href="#${m[1]}">${m[2]}</a></li>`);
  return out.map((b) => (b === '<!--TOC-->'
    ? (toc.length
      ? `<nav class="toc">\n    <ol>\n${toc.join('\n')}\n    </ol>\n  </nav>`
      : '')
    : b));
}

/* Only what the shared sheet has no opinion on. Every value is one of its
 * tokens, so nothing here can wander off the palette the pages share. */
const EXTRA_CSS = `
  .wrap { max-width: 940px; }
  p { max-width: 74ch; }
  h3.sub {
    font-family: Fraunces, Georgia, serif; font-weight: 600; font-size: 1.15rem;
    margin: 34px 0 8px; color: var(--ink);
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: .88em; background: var(--surface-alt); padding: 1px 5px; border-radius: 2px;
  }
  hr { border: 0; border-top: 1px solid var(--rule); margin: 44px 0 0; }
  .tablewrap { overflow-x: auto; margin: 18px 0 24px; }
  table { border-collapse: collapse; width: 100%; font-size: .93rem; }
  th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--rule); vertical-align: top; }
  th {
    font-size: 11px; letter-spacing: .1em; text-transform: uppercase; font-weight: 700;
    color: var(--ink-faint); border-bottom: 2px solid var(--rule-strong); white-space: nowrap;
  }
  td:first-child { font-weight: 700; color: var(--ink); }
  td strong { color: var(--ink); }
  ol.steps { list-style: none; counter-reset: step; margin: 0 0 8px; padding: 0; }
  ol.steps > li {
    counter-increment: step; position: relative;
    padding: 18px 0 18px 54px; border-bottom: 1px solid var(--rule);
    color: var(--ink-soft); font-size: .95rem; max-width: 78ch;
  }
  ol.steps > li::before {
    content: counter(step);
    position: absolute; left: 0; top: 16px;
    width: 32px; height: 32px; display: grid; place-items: center;
    font-family: Fraunces, Georgia, serif; font-weight: 600; font-size: 1.05rem;
    color: var(--surface); background: var(--leaf); border-radius: 50%;
    font-variant-numeric: tabular-nums;
  }
  ol.steps strong:first-child { color: var(--ink); }
  ul.findings { margin: 0 0 18px; padding: 0; }
  ul.findings li {
    list-style: none; padding: 11px 0 11px 18px; border-bottom: 1px solid var(--rule);
    position: relative; color: var(--ink-soft); font-size: .95rem; max-width: 78ch;
  }
  ul.findings li::before {
    content: ""; position: absolute; left: 0; top: 1.05em;
    width: 6px; height: 6px; background: var(--accent); border-radius: 50%;
  }
  ul.findings strong { color: var(--ink); }
  pre {
    background: var(--surface); border: 1px solid var(--rule); border-left: 3px solid var(--leaf);
    padding: 14px 16px; overflow-x: auto; margin: 0 0 20px; max-width: 78ch;
  }
  pre code { background: none; padding: 0; font-size: .85rem; line-height: 1.55; }
  footer p { color: var(--ink-faint); }

  /* A callout that means "do not skip this" reads in the accent rather than the
     leaf, so the two are tellable apart at a glance down the page. */
  .note--flag { border-left-color: var(--accent); }
  .note--flag h2 { color: var(--accent); }
  .note + .note { margin-top: 12px; }

  /* Status chips. The sheet already dresses .tag; these are the three states a
     readiness table needs, in its own colours. */
  .tag.ok   { background: var(--leaf-soft); color: var(--leaf); }
  .tag.todo { background: var(--accent-soft); color: var(--accent); }
  .tag.warn { background: transparent; color: var(--ink-faint); border: 1px solid var(--rule-strong); font-weight: 500; }
  td .tag:first-child { margin-left: 0; }

  /* Contents. Built from the headings, so it cannot name a section that is not
     there any more. */
  nav.toc {
    background: var(--surface-alt); padding: 18px 22px 18px 40px; margin: 32px 0 0;
  }
  nav.toc ol { margin: 0; padding: 0 0 0 4px; }
  nav.toc li { margin-bottom: 5px; font-size: .95rem; }
  nav.toc a { color: var(--ink-soft); text-underline-offset: 3px; }
  nav.toc a:hover { color: var(--accent); }
  h2.section { scroll-margin-top: 16px; }
  a:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
`;

/**
 * A whole page: masthead, then the document.
 *
 * Everything from the H1 up to the first `##` belongs above the rule with the
 * title, so every page keeps the shape the published set shares — eyebrow,
 * title, a sentence, then the figures.
 */
function buildPage(markdown, opts = {}) {
  const parsed = frontMatter(markdown);
  const body = parsed.body;
  /* Front matter wins, options fill in. An operational guide like GOING-LIVE.md
   * is a repo document first and a published page second, so its title and
   * eyebrow come from the manifest rather than being pushed into the top of a
   * file people read in the repo. */
  const meta = { ...opts, ...parsed.meta };
  if (!meta.figures || !meta.figures.length) meta.figures = parsed.meta.figures || [];
  const fallbackTitle = opts.fallbackTitle || 'Dinner By Derek';
  const blocks = render(body);

  const firstSection = blocks.findIndex((b) => b.startsWith('<h2'));
  const head = blocks.slice(0, firstSection === -1 ? blocks.length : firstSection);
  const rest = firstSection === -1 ? [] : blocks.slice(firstSection);

  const title = head.find((b) => b.startsWith('<h1')) || `<h1>${esc(fallbackTitle)}</h1>`;
  const stand = head.filter((b) => b.startsWith('<p>'))
    .map((p, n) => (n === 0 ? p.replace('<p>', '<p class="standfirst">') : p));

  /* Anything else that appeared before the first section — in practice the
   * contents list — goes below the masthead rather than into it. It used to be
   * dropped on the floor here: the masthead kept the title and the paragraphs
   * and silently discarded the rest, so a document could ask for a contents
   * list and simply not get one. Rules are skipped, since the masthead already
   * ends in a border. */
  const beforeSections = head
    .filter((b) => !b.startsWith('<h1') && !b.startsWith('<p>') && b !== '<hr>' && b !== '');

  const figureRows = meta.figures.map((f) =>
    `    <div class="fig"><b>${esc(f.value)}</b><span>${esc(f.label)}</span></div>`);
  const figures = figureRows.length
    ? ['', '  <div class="figures">', ...figureRows, '  </div>', ''].join('\n')
    : '';

  /* The browser-tab name, taken from front matter so it can differ from the
   * heading. A page titled "Handoff" on its own masthead still has to be
   * findable in a gallery beside five siblings. */
  const tabTitle = meta.title || title.replace(/<[^>]+>/g, '').trim() || fallbackTitle;

  const eyebrow = meta.eyebrow ? `  <p class="eyebrow">${esc(meta.eyebrow)}</p>\n` : '';
  const credit = esc(meta.source || 'the repo');

  return [
    `<title>${esc(tabTitle)}</title>`,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,800&family=Karla:wght@400;500;700&display=swap">',
    '<style>',
    fs.readFileSync(THEME, 'utf8').trim(),
    EXTRA_CSS + '</style>',
    '',
    '<div class="wrap">',
    '',
    '<header class="masthead">',
    eyebrow + '  ' + title,
    stand.map((p) => '  ' + p).join('\n'),
    figures + '</header>',
    '',
    beforeSections.map((b) => '  ' + b).join('\n\n'),
    '',
    rest.map((b) => '    ' + b).join('\n\n'),
    '',
    '<footer>',
    `  <p>Generated from <code>${credit}</code> by <code>npm run pages</code>. The`,
    '  markdown is the document and this is only how it looks, so the two cannot',
    '  disagree — but both go stale together, and the repo is the copy that is true.</p>',
    '</footer>',
    '',
    '</div>',
    '',
  ].join('\n');
}

module.exports = { render, inline, frontMatter, esc, buildPage, EXTRA_CSS };
