/**
 * One-shot CLS fix: replace `.results { display: none; }` with a
 * visibility-based hidden state that reserves vertical space, preventing
 * layout shift when results appear after auto-calculate on page load.
 *
 * The state-guide and state-faq sections live below the results section.
 * When results goes from display:none to display:block, those sections
 * shift down by ~700-1000px, which Google's CrUX report captures as CLS
 * (current site shows 0.622 on #main, 0.302 on section.state-guide).
 *
 * Fix: pre-reserve space with min-height + visibility:hidden. The space
 * is held from initial paint, so when results "appear" via JS they only
 * change visibility, not layout.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Use a regex that handles both LF and CRLF line endings.
const OLD_RE = /\.results \{ display: none; \}\r?\n\s*\.results\.visible \{ display: block; \}/;
// EOL preserved per-file (matches whatever the file already uses).
function makeNew(eol) {
  return [
    '.results {',
    '    /* CLS fix: reserve vertical space upfront so the page doesn\'t shift when',
    '     * results render after auto-calculate. visibility:hidden keeps layout',
    '     * space allocated; .visible flips it back to visible. min-height is a',
    '     * conservative estimate of the typical rendered results height. */',
    '    visibility: hidden;',
    '    min-height: 760px;',
    '  }',
    '  .results.visible { visibility: visible; min-height: 0; }',
    '  @media (max-width: 600px) {',
    '    .results { min-height: 1000px; }',
    '    .results.visible { min-height: 0; }',
    '  }',
  ].join(eol);
}

function walk(dir, files) {
  for (const f of fs.readdirSync(dir)) {
    if (['node_modules', '.git', '.claude', 'scripts'].includes(f)) continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else if (f.endsWith('.html')) files.push(p);
  }
  return files;
}

const allHtml = walk(path.join(ROOT, 'calculators'), []);
let updated = 0;
let skipped = 0;
for (const f of allHtml) {
  let html = fs.readFileSync(f, 'utf8');
  if (!OLD_RE.test(html)) {
    skipped++;
    continue;
  }
  // Detect file EOL to preserve consistency.
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const before = html;
  html = html.replace(OLD_RE, makeNew(eol));
  if (html === before) {
    skipped++;
    continue;
  }
  fs.writeFileSync(f, html);
  updated++;
}

console.log(`CLS fix applied: ${updated} files updated, ${skipped} skipped (no match).`);
