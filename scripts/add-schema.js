const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://indie-calc.com';

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function write(p, s) { fs.writeFileSync(path.join(ROOT, p), s); }

// Insert one or more JSON-LD scripts before </head>. Removes any existing IndieCalc-managed schema first.
function setSchema(html, scripts) {
  // Strip any existing managed schema blocks (marked with data-schema="indiecalc")
  html = html.replace(
    /\s*<script\s+type=["']application\/ld\+json["']\s+data-schema=["']indiecalc["']>[\s\S]*?<\/script>/g,
    ''
  );
  const blob = scripts.map(s =>
    '<script type="application/ld+json" data-schema="indiecalc">' + JSON.stringify(s) + '</script>'
  ).join('\n');
  return html.replace('</head>', blob + '\n</head>');
}

function getMeta(html, name) {
  const m = html.match(new RegExp('<meta\\s+name=["\']' + name + '["\']\\s+content=["\']([^"\']*)["\']', 'i'));
  return m ? m[1] : null;
}

function getTitle(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/);
  return m ? m[1].trim() : '';
}

function organizationNode() {
  return {
    '@type': 'Organization',
    '@id': SITE + '/#organization',
    name: 'IndieCalc',
    url: SITE + '/',
    description: 'Free, accurate 2026 tax calculators for freelancers, contractors, and self-employed.',
  };
}

function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': SITE + '/#website',
    url: SITE + '/',
    name: 'IndieCalc',
    description: 'Free 2026 tax calculators for freelancers and self-employed.',
    publisher: { '@id': SITE + '/#organization' },
    inLanguage: 'en-US',
  };
}

function webAppNode({ url, name, description }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name,
    url,
    description,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Any (browser-based)',
    browserRequirements: 'Requires JavaScript',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    isAccessibleForFree: true,
    creator: { '@type': 'Organization', name: 'IndieCalc', url: SITE + '/' },
    inLanguage: 'en-US',
  };
}

function articleNode({ url, headline, description, datePublished, dateModified }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: { '@type': 'Organization', name: 'IndieCalc', url: SITE + '/' },
    publisher: {
      '@type': 'Organization',
      name: 'IndieCalc',
      url: SITE + '/',
    },
    datePublished,
    dateModified,
    inLanguage: 'en-US',
  };
}

function breadcrumbNode(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

function faqNode(questions) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(q => ({
      '@type': 'Question',
      name: q.q,
      acceptedAnswer: { '@type': 'Answer', text: q.a },
    })),
  };
}

// Generic FAQ items for state pages (same questions, state-specific would be even better but bulk for now)
function stateFAQ(stateName, hasNoStateTax) {
  const taxAnswer = hasNoStateTax
    ? `${stateName} has no state income tax on freelance or self-employment income. You only owe federal taxes — self-employment tax (15.3%) and federal income tax — on your net earnings.`
    : `As a freelancer in ${stateName}, you owe federal self-employment tax (15.3%), federal income tax, and ${stateName} state income tax on your net earnings. The exact state rate depends on your income level and filing status.`;
  return [
    {
      q: `How is self-employment tax calculated in ${stateName} for 2026?`,
      a: `Self-employment tax is a federal 15.3% tax on 92.35% of your net self-employment earnings (12.4% Social Security up to $184,500 for 2026 + 2.9% Medicare with no cap). It is the same in every state. ${stateName} freelancers pay this on top of federal income tax${hasNoStateTax ? ' (no state income tax in ' + stateName + ').' : ' and ' + stateName + ' state income tax.'}`,
    },
    {
      q: `What state taxes do freelancers pay in ${stateName}?`,
      a: taxAnswer,
    },
    {
      q: `Do I need to make quarterly estimated tax payments in ${stateName}?`,
      a: `Yes, if you expect to owe $1,000 or more in federal taxes for 2026, you must make quarterly estimated payments to the IRS. ${hasNoStateTax ? '' : `${stateName} also requires estimated payments if you expect to owe state tax above its threshold. `}The 2026 federal due dates are April 15, June 15, September 15, and January 15, 2027.`,
    },
    {
      q: `What deductions can ${stateName} freelancers claim in 2026?`,
      a: `Federal deductions for self-employed include the QBI deduction (up to 20% of qualified business income, made permanent under OBBBA), the deductible half of self-employment tax, self-employed health insurance premiums, retirement plan contributions (SEP IRA, Solo 401(k)), home office deduction, and ordinary business expenses. ${hasNoStateTax ? '' : `${stateName} state-level deductions vary; consult a tax professional for state-specific items.`}`,
    },
  ];
}

// Identify "no state income tax" states from description
function hasNoStateTax(html) {
  return /\(no state income tax\)/i.test(html);
}

// Capitalize state slug to display name (handle multi-word and DC)
function slugToStateName(slug) {
  if (slug === 'district-of-columbia') return 'Washington, D.C.';
  return slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Escape user-controlled text for safe HTML rendering. The FAQ Q&A strings
 * are author-controlled but may contain $ and other characters; we escape
 * the standard XML-significant set so the rendered HTML stays valid.
 */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a visible FAQ section (HTML) from the same Q&A data that feeds the
 * FAQPage JSON-LD schema. Google's FAQ schema policy requires the schema
 * content to match visible page content; this function produces that match.
 */
function renderFAQ(stateName, faqs) {
  const items = faqs.map(f =>
    '    <details>\n' +
    '      <summary>' + escHtml(f.q) + '</summary>\n' +
    '      <p>' + escHtml(f.a) + '</p>\n' +
    '    </details>'
  ).join('\n');
  return '\n  <section class="state-faq" data-faq="indiecalc">\n' +
    '    <h2>Frequently Asked Questions: ' + escHtml(stateName) + ' Freelancer Taxes</h2>\n' +
    items + '\n' +
    '  </section>\n';
}

/**
 * Insert the visible FAQ section into the page. Idempotent: any prior
 * data-faq="indiecalc" section is replaced. Insertion point: before the
 * .methodology div (mirrors the .state-guide insertion pattern), with
 * a </main> fallback for pages that lack a methodology div.
 */
function setVisibleFAQ(html, faqs, stateName) {
  html = html.replace(
    /\s*<section\s+class=["']state-faq["']\s+data-faq=["']indiecalc["']>[\s\S]*?<\/section>\s*/g,
    ''
  );
  const faqHtml = renderFAQ(stateName, faqs);
  const methodologyMatch = html.match(/(\s*)<div\s+class=["']methodology["']/);
  if (methodologyMatch) {
    return html.substring(0, methodologyMatch.index) + faqHtml + html.substring(methodologyMatch.index);
  }
  return html.replace(/<\/main>/, faqHtml + '\n</main>');
}

/**
 * Inject the .state-faq CSS block once per page. Idempotent on repeated runs.
 */
function ensureFAQCss(html) {
  if (html.includes('.state-faq {')) return html;
  const css = `
  .state-faq {
    background: var(--white); border: 1px solid var(--rule); border-radius: 12px;
    padding: 28px 32px; margin: 32px 0;
  }
  .state-faq h2 { font-size: 22px; font-weight: 700; margin: 0 0 16px; color: var(--dark); }
  .state-faq details { border-top: 1px solid var(--rule); padding: 16px 0; }
  .state-faq details:first-of-type { border-top: none; padding-top: 4px; }
  .state-faq summary {
    font-size: 15px; font-weight: 600; color: var(--dark); cursor: pointer;
    list-style: none; padding-right: 24px; position: relative; line-height: 1.4;
  }
  .state-faq summary::-webkit-details-marker { display: none; }
  .state-faq summary::after {
    content: '+'; position: absolute; right: 0; top: 0;
    font-size: 22px; color: var(--teal); font-weight: 400;
  }
  .state-faq details[open] summary::after { content: '−'; }
  .state-faq p { font-size: 14px; color: var(--medium); margin: 12px 0 0; line-height: 1.7; }
  @media (max-width: 600px) {
    .state-faq { padding: 20px 18px; }
    .state-faq h2 { font-size: 19px; }
  }
`;
  return html.replace(/<\/style>/, css + '</style>');
}

// === HOMEPAGE ===
{
  const file = 'index.html';
  let html = read(file);
  const url = SITE + '/';
  const title = getTitle(html);
  const desc = getMeta(html, 'description');

  const schemas = [
    {
      '@context': 'https://schema.org',
      '@graph': [
        websiteNode(),
        organizationNode(),
      ],
    },
    breadcrumbNode([{ name: 'Home', url }]),
  ];
  html = setSchema(html, schemas);
  write(file, html);
  console.log('Schema: ' + file);
}

// === MAIN CALCULATOR PAGES ===
const mainCalcs = [
  { file: 'calculators/self-employment-tax/index.html', slug: 'self-employment-tax', label: 'Self-Employment Tax Calculator' },
  { file: 'calculators/quarterly-tax/index.html', slug: 'quarterly-tax', label: 'Quarterly Estimated Tax Calculator' },
  { file: 'calculators/llc-vs-scorp/index.html', slug: 'llc-vs-scorp', label: 'LLC vs S-Corp Calculator' },
  { file: 'calculators/rate-calculator/index.html', slug: 'rate-calculator', label: 'Freelance Rate Calculator' },
  { file: 'calculators/expense-estimator/index.html', slug: 'expense-estimator', label: 'Schedule C Expense Calculator' },
];

for (const c of mainCalcs) {
  let html = read(c.file);
  const url = SITE + '/calculators/' + c.slug + '/';
  const title = getTitle(html);
  const desc = getMeta(html, 'description');
  const schemas = [
    webAppNode({ url, name: title.replace(/\s*\|\s*IndieCalc\s*$/, ''), description: desc }),
    breadcrumbNode([
      { name: 'Home', url: SITE + '/' },
      { name: 'Calculators', url: SITE + '/calculators/' },
      { name: c.label, url },
    ]),
  ];
  html = setSchema(html, schemas);
  write(c.file, html);
  console.log('Schema: ' + c.file);
}

// === STATE PAGES (51) ===
const stateDir = 'calculators/self-employment-tax';
const states = fs.readdirSync(path.join(ROOT, stateDir))
  .filter(s => fs.statSync(path.join(ROOT, stateDir, s)).isDirectory());

for (const slug of states) {
  const file = path.join(stateDir, slug, 'index.html');
  let html = read(file);
  const stateName = slugToStateName(slug);
  const url = SITE + '/calculators/self-employment-tax/' + slug + '/';
  const title = getTitle(html);
  const desc = getMeta(html, 'description');
  const noTax = hasNoStateTax(html);

  const faqs = stateFAQ(stateName, noTax);
  const schemas = [
    webAppNode({ url, name: title.replace(/\s*\|\s*IndieCalc\s*$/, ''), description: desc }),
    faqNode(faqs),
    breadcrumbNode([
      { name: 'Home', url: SITE + '/' },
      { name: 'Self-Employment Tax', url: SITE + '/calculators/self-employment-tax/' },
      { name: stateName, url },
    ]),
  ];
  html = setSchema(html, schemas);
  html = setVisibleFAQ(html, faqs, stateName);
  html = ensureFAQCss(html);
  write(file, html);
}
console.log('Schema + visible FAQ: 51 state pages');

// === ARTICLES ===
const articles = [
  { file: 'articles/2026-salt-cap-explained/index.html', slug: '2026-salt-cap-explained', published: '2026-04-28', modified: '2026-04-30' },
  { file: 'articles/2026-obbba-freelancer-tax-changes/index.html', slug: '2026-obbba-freelancer-tax-changes', published: '2026-04-15', modified: '2026-04-30' },
  { file: 'articles/state-freelance-tax-comparison/index.html', slug: 'state-freelance-tax-comparison', published: '2026-04-20', modified: '2026-04-30' },
  { file: 'articles/how-indiecalc-works/index.html', slug: 'how-indiecalc-works', published: '2026-04-15', modified: '2026-04-30' },
];

for (const a of articles) {
  let html = read(a.file);
  const url = SITE + '/articles/' + a.slug + '/';
  const title = getTitle(html).replace(/\s*\|\s*IndieCalc\s*$/, '');
  const desc = getMeta(html, 'description');
  const schemas = [
    articleNode({
      url,
      headline: title,
      description: desc,
      datePublished: a.published,
      dateModified: a.modified,
    }),
    breadcrumbNode([
      { name: 'Home', url: SITE + '/' },
      { name: 'Articles', url: SITE + '/articles/' },
      { name: title, url },
    ]),
  ];
  html = setSchema(html, schemas);
  write(a.file, html);
  console.log('Schema: ' + a.file);
}

console.log('\nAll schema added.');
