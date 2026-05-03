/**
 * Compress meta descriptions to Google's optimal 120–160 char range.
 * Bing's URL Inspection flags anything outside the typical sweet spot
 * (Google truncates around 155–160 chars, mobile around 120). Many of
 * our state-page descriptions were 220–260 chars (verbose boilerplate);
 * a few articles were too short due to apostrophe-related drafting bugs.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGET_MIN = 120;
const TARGET_MAX = 160;

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function write(p, s) { fs.writeFileSync(path.join(ROOT, p), s); }

/**
 * Update name="description", property="og:description", and
 * name="twitter:description" in lock-step.
 */
function setDesc(html, newDesc) {
  const escaped = newDesc.replace(/"/g, '&quot;');
  // Match double-quoted meta content specifically. Don't use [^"'] because
  // descriptions legitimately contain apostrophes (e.g., "Here's who...").
  // Use function replacements to avoid `$` in user content being misinterpreted
  // as backreferences (e.g., `$2,200` → captured group + ",200").
  return html
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/,
      (_, p1, p2) => p1 + escaped + p2)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/,
      (_, p1, p2) => p1 + escaped + p2)
    .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/,
      (_, p1, p2) => p1 + escaped + p2);
}

/**
 * For state pages: extract state name (from title) and tax structure
 * phrase (from existing description), then build a compact replacement.
 */
function compactStateDesc(html) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (!titleMatch) return null;
  const tm = titleMatch[1].match(/^(.+?)\s+Self-Employment Tax Calculator/);
  if (!tm) return null;
  const stateName = tm[1];

  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/);
  if (!descMatch) return null;
  const oldDesc = descMatch[1];

  let stateTaxPhrase = '';
  // (graduated rates from X% to Y%)
  const mGrad = oldDesc.match(/graduated rates from ([0-9.]+)% to ([0-9.]+)%/);
  if (mGrad) {
    stateTaxPhrase = `${stateName} graduated ${mGrad[1]}%-${mGrad[2]}%`;
  }
  // (a flat rate of X%) or (an effective flat rate of X%) — strip any nested
  // parenthetical detail (Ohio "above $26,050", Massachusetts "9% above
  // ~$1.1M"). Original regex tried to keep these but produced unclosed
  // parens because the close-paren regex stopped inside the nested group.
  const mFlat = oldDesc.match(/(?:a |an effective )?flat rate of ([0-9.]+%)/);
  if (mFlat && !stateTaxPhrase) {
    stateTaxPhrase = `${stateName} flat ${mFlat[1]}`;
  }
  // (no state income tax)
  if (/no state income tax/.test(oldDesc)) {
    stateTaxPhrase = `no ${stateName} income tax`;
  }

  if (!stateTaxPhrase) return null;

  // For DC the title says "District of Columbia" (20 chars) which makes the
  // standard template overrun 160. Use a shorter display name in the meta
  // and drop "QBI" to keep within budget.
  if (stateName === 'District of Columbia') {
    return `Free 2026 Washington DC self-employment tax calculator. Federal SE tax + DC graduated 4%-10.75%. Take-home pay and quarterly estimates.`;
  }

  // Standard template ~140-155 chars depending on state name length.
  const standard = `Free 2026 ${stateName} self-employment tax calculator. Federal SE tax + ${stateTaxPhrase}. Take-home pay, QBI, quarterly estimates.`;
  if (standard.length <= 160) return standard;
  // Fallback that drops "QBI" — saves ~5 chars.
  return `Free 2026 ${stateName} self-employment tax calculator. Federal SE tax + ${stateTaxPhrase}. Take-home pay and quarterly estimates.`;
}

// Hand-crafted descriptions for main pages (kept tight at ~140-155 chars).
const FIXED_DESCS = {
  'index.html':
    'Free 2026 tax calculators for freelancers: self-employment tax, quarterly estimates, LLC vs S-Corp, rate calc. OBBBA-aware. All 51 states. No signup.',
  'calculators/self-employment-tax/index.html':
    'Free 2026 self-employment tax calculator. Federal SE tax (15.3%), income tax, QBI, and state tax for all 51 states. OBBBA-aware. Take-home pay + quarterlies.',
  'calculators/quarterly-tax/index.html':
    'Free 2026 quarterly estimated tax calculator for freelancers. Calculate 4 payments, safe harbor, and underpayment penalty risk. Federal + 51 states.',
  'calculators/llc-vs-scorp/index.html':
    'Free 2026 LLC vs S-Corp tax calculator. Compare self-employment tax to S-Corp payroll savings. See net annual savings and break-even income.',
  'calculators/rate-calculator/index.html':
    'Free 2026 freelance hourly rate calculator. Reverse-engineer the rate you need to charge after taxes and expenses. All 51 states. OBBBA-aware.',
  'calculators/expense-estimator/index.html':
    'Free 2026 Schedule C expense calculator for freelancers. Home office, vehicle, meals, equipment — see how deductions reduce your federal + state tax.',
  'articles/2026-salt-cap-explained/index.html':
    'OBBBA raised the SALT cap to $40,400 for 2026 with a $500K MAGI phaseout. Worked examples for freelancers in CA, NY, NJ, and TX.',
  'articles/2026-obbba-freelancer-tax-changes/index.html':
    'How OBBBA changes 2026 taxes for freelancers: permanent QBI, $40,400 SALT cap, $2,200 child credit, no-tax-on-tips, senior deduction. Worked examples.',
  'articles/state-freelance-tax-comparison/index.html':
    'Compare 2026 freelance tax burdens across 51 states. State income tax, deductions, and local surcharges affect take-home pay. Worked examples at $75K-$150K.',
  'articles/how-indiecalc-works/index.html':
    'How IndieCalc calculates your 2026 freelance taxes — methodology, data sources, and why your inputs never leave your browser. No tracking.',
};

let okCount = 0;
let warnCount = 0;
const warnings = [];

for (const [relPath, newDesc] of Object.entries(FIXED_DESCS)) {
  const file = path.join(ROOT, relPath);
  if (!fs.existsSync(file)) { console.log('MISSING: ' + relPath); continue; }
  let html = fs.readFileSync(file, 'utf8');
  if (newDesc.length < TARGET_MIN || newDesc.length > TARGET_MAX) {
    warnings.push(`${relPath}: ${newDesc.length} chars (out of ${TARGET_MIN}-${TARGET_MAX} range)`);
    warnCount++;
  } else {
    okCount++;
  }
  html = setDesc(html, newDesc);
  fs.writeFileSync(file, html);
}

// Process all state pages
const stateDir = 'calculators/self-employment-tax';
const states = fs.readdirSync(path.join(ROOT, stateDir))
  .filter(s => fs.statSync(path.join(ROOT, stateDir, s)).isDirectory());

for (const slug of states) {
  const file = path.join(ROOT, stateDir, slug, 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  const newDesc = compactStateDesc(html);
  if (!newDesc) {
    warnings.push(`${slug}: could not generate (skipped)`);
    warnCount++;
    continue;
  }
  if (newDesc.length < TARGET_MIN || newDesc.length > TARGET_MAX) {
    warnings.push(`${slug}: ${newDesc.length} chars — "${newDesc.substring(0, 60)}..."`);
    warnCount++;
  } else {
    okCount++;
  }
  html = setDesc(html, newDesc);
  fs.writeFileSync(file, html);
}

console.log(`OK (in 120-160 range): ${okCount}`);
console.log(`Warnings: ${warnCount}`);
if (warnings.length) {
  console.log('\nWarnings detail:');
  warnings.forEach(w => console.log('  ' + w));
}
