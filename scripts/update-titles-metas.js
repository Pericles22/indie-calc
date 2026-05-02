const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function write(p, s) { fs.writeFileSync(path.join(ROOT, p), s); }

function replaceTitle(html, newTitle) {
  return html.replace(/<title>[\s\S]*?<\/title>/, '<title>' + newTitle + '</title>');
}

function replaceDescription(html, newDesc) {
  return html.replace(
    /<meta\s+name=["']description["']\s+content=["'][^"']*["']\s*\/?>/,
    '<meta name="description" content="' + newDesc.replace(/"/g, '&quot;') + '">'
  );
}

function replaceOgTitle(html, newTitle) {
  return html.replace(
    /<meta\s+property=["']og:title["']\s+content=["'][^"']*["']\s*\/?>/,
    '<meta property="og:title" content="' + newTitle.replace(/"/g, '&quot;') + '">'
  );
}

function replaceOgDescription(html, newDesc) {
  return html.replace(
    /<meta\s+property=["']og:description["']\s+content=["'][^"']*["']\s*\/?>/,
    '<meta property="og:description" content="' + newDesc.replace(/"/g, '&quot;') + '">'
  );
}

function replaceTwitterTitle(html, newTitle) {
  return html.replace(
    /<meta\s+name=["']twitter:title["']\s+content=["'][^"']*["']\s*\/?>/,
    '<meta name="twitter:title" content="' + newTitle.replace(/"/g, '&quot;') + '">'
  );
}

function replaceTwitterDescription(html, newDesc) {
  return html.replace(
    /<meta\s+name=["']twitter:description["']\s+content=["'][^"']*["']\s*\/?>/,
    '<meta name="twitter:description" content="' + newDesc.replace(/"/g, '&quot;') + '">'
  );
}

function update(p, title, desc) {
  let html = read(p);
  html = replaceTitle(html, title);
  if (desc) html = replaceDescription(html, desc);
  // Also update OG / Twitter if present
  html = replaceOgTitle(html, title);
  if (desc) html = replaceOgDescription(html, desc);
  html = replaceTwitterTitle(html, title);
  if (desc) html = replaceTwitterDescription(html, desc);
  write(p, html);
  console.log('Updated: ' + p);
}

// === Homepage ===
update(
  'index.html',
  'Free 2026 Tax Calculators for Freelancers — OBBBA-Aware, 51 States | IndieCalc',
  'Free 2026 tax calculators for freelancers and self-employed. Self-employment tax, quarterly estimates, LLC vs S-Corp, and rate calculators — OBBBA-aware, all 51 states. No signup, no email required.'
);

// === Main calculator pages ===
update(
  'calculators/self-employment-tax/index.html',
  '2026 Self-Employment Tax Calculator (Free) — All 51 States, OBBBA-Aware | IndieCalc',
  'Free 2026 self-employment tax calculator for freelancers. Federal SE tax (15.3%), income tax, QBI deduction, and state tax for all 51 states. OBBBA-aware. See your take-home pay and quarterly estimated payments.'
);

update(
  'calculators/quarterly-tax/index.html',
  '2026 Quarterly Estimated Tax Calculator — Safe Harbor + Penalty Risk | IndieCalc',
  'Free 2026 quarterly estimated tax calculator for freelancers. See your 4 quarterly payments, safe harbor amount, and underpayment penalty risk. Federal + all 51 states. OBBBA-aware.'
);

update(
  'calculators/llc-vs-scorp/index.html',
  'LLC vs S-Corp Calculator 2026 — Tax Savings + Break-Even Income | IndieCalc',
  'Free 2026 LLC vs S-Corp tax calculator. Compare self-employment tax to S-Corp payroll tax savings. See your net annual savings, reasonable salary guidance, and break-even income for converting.'
);

update(
  'calculators/rate-calculator/index.html',
  'Freelance Hourly Rate Calculator 2026 — Reverse-Engineer Your Take-Home | IndieCalc',
  'Free 2026 freelance hourly rate calculator. Work backwards from your income goal to find the hourly rate you need to charge after taxes, expenses, and self-employment tax. All 51 states.'
);

update(
  'calculators/expense-estimator/index.html',
  'Schedule C Expense Calculator 2026 — Freelance Tax Deductions | IndieCalc',
  'Free 2026 Schedule C business expense estimator. See how home office, vehicle, meals, equipment, and other deductions reduce your freelance tax bill dollar-for-dollar. Federal + state savings.'
);

// === Articles ===
update(
  'articles/2026-salt-cap-explained/index.html',
  '2026 SALT Cap Explained: Who Benefits from the New $40,400 Limit | IndieCalc',
  'OBBBA raised the SALT cap from $10K to $40,400 for 2026, with a MAGI phaseout above $500K. Here is who actually benefits, with worked examples for freelancers in CA, NY, NJ, and TX.'
);

update(
  'articles/2026-obbba-freelancer-tax-changes/index.html',
  '2026 OBBBA Tax Changes for Freelancers — QBI, SALT, Senior Deduction | IndieCalc',
  'How the One Big Beautiful Bill Act changes 2026 taxes for freelancers and self-employed: permanent QBI deduction, $2,200 child credit, $40,400 SALT cap, senior deduction, and more — with worked examples.'
);

update(
  'articles/state-freelance-tax-comparison/index.html',
  'Freelance Tax by State 2026 — How Your State Affects Take-Home Pay | IndieCalc',
  'Compare freelance tax burdens across all 51 states. See how state income tax rates, deductions, and local surcharges affect your self-employed take-home pay — with worked examples at $75K, $100K, and $150K.'
);

update(
  'articles/how-indiecalc-works/index.html',
  'How IndieCalc Calculates Your Taxes (2026) — Methodology & Sources | IndieCalc',
  'How IndieCalc calculates your 2026 taxes, step by step. Our data sources, the logic behind self-employment tax math, and why your data never leaves your browser.'
);

// === State pages: flip "Self-Employment Tax Calculator 2026 — STATE" to "STATE Self-Employment Tax Calculator 2026"
const stateDir = 'calculators/self-employment-tax';
const states = fs.readdirSync(path.join(ROOT, stateDir))
  .filter(s => fs.statSync(path.join(ROOT, stateDir, s)).isDirectory());

for (const slug of states) {
  const file = path.join(stateDir, slug, 'index.html');
  let html = read(file);

  // Extract current title to get the state name
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);
  if (!titleMatch) {
    console.log('SKIP (no title): ' + file);
    continue;
  }
  const oldTitle = titleMatch[1].trim();
  // Pattern: "Self-Employment Tax Calculator 2026 — STATE | IndieCalc"
  const m = oldTitle.match(/^Self-Employment Tax Calculator 2026\s+[—–-]\s+(.+?)\s*\|\s*IndieCalc$/);
  if (!m) {
    console.log('SKIP (title pattern mismatch): ' + file + ' :: ' + oldTitle);
    continue;
  }
  const stateName = m[1];
  const newTitle = stateName + ' Self-Employment Tax Calculator 2026 — Federal + State | IndieCalc';

  // For descriptions, replace the leading "Free [State]" with a more keyword-rich phrasing
  // Pattern: "Free [State] self-employment tax calculator for 2026. Calculate federal SE tax (15.3%), income tax, and ..."
  // New:     "Free 2026 [State] self-employment tax calculator for freelancers. Self-employment tax rate, federal income tax, and ..."
  html = replaceTitle(html, newTitle);
  html = replaceOgTitle(html, newTitle);
  html = replaceTwitterTitle(html, newTitle);

  // Tweak description to include "freelance" and "self-employment tax rate" keywords
  const descRe = /<meta\s+name=["']description["']\s+content=["']([^"']*)["']\s*\/?>/;
  const descMatch = html.match(descRe);
  if (descMatch) {
    let oldDesc = descMatch[1];
    // Replace "Free [State] self-employment tax calculator for 2026" with "Free 2026 [State] self-employment tax rate calculator for freelancers"
    let newDesc = oldDesc.replace(
      /^Free\s+(.+?)\s+self-employment tax calculator for 2026\.\s+Calculate/,
      'Free 2026 $1 self-employment tax calculator for freelancers. Calculate'
    );
    // Append a take-home / state income tax keyword phrase if not present
    if (!/state income tax/i.test(newDesc) && !/no state income tax/i.test(newDesc)) {
      // Already has state tax mention via state name; leave as-is
    }
    if (newDesc !== oldDesc) {
      html = replaceDescription(html, newDesc);
      html = replaceOgDescription(html, newDesc);
      html = replaceTwitterDescription(html, newDesc);
    }
  }

  write(file, html);
}

console.log('\nDone. ' + states.length + ' state pages processed.');
