const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function write(p, s) { fs.writeFileSync(path.join(ROOT, p), s); }

/**
 * State-specific content. Each entry contains 3-4 H3-led sections covering:
 * - State income tax structure
 * - State-specific deductions / PTE elections
 * - Quarterly estimated payments
 * - Common freelancer gotchas
 *
 * Goal: 250-350 words of unique, accurate, state-specific content per state.
 */
const STATE_GUIDES = {
  california: {
    name: 'California',
    body: `
      <h3>California State Income Tax for Freelancers</h3>
      <p>California taxes freelance and self-employment income at graduated rates from 1% to 12.3%, plus an additional 1% Mental Health Services Tax on income above $1 million — the highest top marginal rate in the country at 13.3%. Unlike most states, California does <strong>not</strong> conform to the federal QBI deduction, so the 20% deduction reduces your federal taxable income but not your California taxable income. California also does not allow the deduction for half of self-employment tax at the state level.</p>

      <h3>AB-150 Pass-Through Entity Tax (PTET)</h3>
      <p>If you operate as an LLC taxed as an S-Corp or partnership, California's PTET (originally enacted as AB-150 in 2021 and extended through 2031 under SB 132 signed June 2025) lets the entity pay a flat 9.3% state tax on qualified net income at the entity level, which is then deductible on your federal return — bypassing the SALT cap. Each owner receives a corresponding state tax credit on their CA personal return for their share of PTET paid, so net California tax stays roughly the same — the federal SALT-cap workaround is what's unlocked, not a state tax cut. For freelancers earning $200K+ as an S-Corp, this can save $1,500–$5,000/year in federal tax. Sole proprietors filing on Schedule C cannot elect PTET — it's an S-Corp/partnership/multi-member-LLC-only benefit, which strengthens the case for converting at higher income levels. For 2026, electing entities must make the required first installment by June 15 or face a 12.5% credit reduction.</p>

      <h3>Quarterly Estimated Payments in California</h3>
      <p>California's quarterly schedule is more aggressive than federal: 30% in Q1 (April 15), 40% in Q2 (June 15), 0% in Q3, and 30% in Q4 (January 15). File Form 540-ES. The safe harbor is 100% of prior year liability (110% if AGI exceeded $150K). Underpayment triggers Form 5805 penalties.</p>

      <h3>Common California Freelancer Gotchas</h3>
      <p>California's State Disability Insurance (SDI) rate increased to 1.3% for 2026 (up from 1.2% in 2025 and 1.1% in 2024), applied to all wages with no income cap — but only on W-2 wages, not Schedule C income. If you operate as an S-Corp, your reasonable salary is subject to SDI in addition to federal payroll taxes, so the SDI cost is now a meaningful consideration in the LLC-vs-S-Corp analysis at higher salary levels. AB-5 (the gig-worker classification law) doesn't change your tax treatment as a 1099 freelancer but can affect whether your clients <em>should</em> be 1099-ing you in the first place.</p>

      <p style="font-size: 12px; color: var(--hint); margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--rule);"><strong>Note on 2026 brackets:</strong> California's 2026 income tax brackets are derived from inflation-indexed adjustments to the 2025 official tables. The Franchise Tax Board typically finalizes 2026 bracket cutoffs in the second half of the year. The graduated-rate ranges and rate structure shown here reflect the legislatively enacted schedule and the FTB's annual indexing methodology, not speculative estimates.</p>
    `,
  },

  'new-york': {
    name: 'New York',
    body: `
      <h3>New York State Income Tax for Freelancers</h3>
      <p>New York taxes self-employment income at graduated rates from 4% to 10.9%, with the top bracket kicking in at $25 million for single filers. Most freelancers fall in the 5.5–6.85% range (the 9.65% bracket starts above $1.08 million for single filers). New York's tax base starts with federal AGI rather than federal taxable income, so the federal QBI deduction (which is below-the-line) does <strong>not</strong> reduce New York taxable income — your 20% QBI benefit cuts federal tax only.</p>

      <h3>NYC and Yonkers Local Taxes</h3>
      <p>If you live in New York City, add NYC's graduated income tax (3.078–3.876%) on top of state tax — making NYC freelancers' combined marginal rate among the highest in the country (up to ~14.8%). Yonkers residents pay a 16.75% surcharge on their state tax. Non-residents working in NYC don't owe NYC income tax (the commuter tax was repealed in 1999) but do still owe NY state tax on NY-sourced income.</p>

      <h3>NY Pass-Through Entity Tax (PTET)</h3>
      <p>Like California, New York offers a PTET election for S-Corps, partnerships, and LLCs taxed as such. The entity pays NY state tax (and NYC tax, separately) at graduated rates: 6.85% on the first $2M, 9.65% from $2M–$5M, 10.30% from $5M–$25M, and 10.90% above $25M. The federal deduction for the PTET payment effectively bypasses the SALT cap, while each partner/shareholder receives a corresponding NY state tax credit on their personal return — so net NY tax is roughly unchanged and the federal deduction is what's unlocked. For a freelancer earning $300K through an S-Corp in NYC, PTET savings can exceed $7,000/year.</p>

      <h3>Quarterly Estimated Payments in New York</h3>
      <p>NY follows the standard four-quarter federal schedule (April 15, June 15, September 15, January 15). File Form IT-2105. The safe harbor matches federal: 100% of prior year (110% if NY AGI > $150K). NYC residents must include estimated NYC tax in their state estimated payments — same form, separate calculation.</p>

      <p style="font-size: 12px; color: var(--hint); margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--rule);"><strong>Note on 2026 brackets:</strong> New York's 2026 income tax brackets are derived from inflation-indexed adjustments to the 2025 official tables. The Department of Taxation and Finance typically finalizes 2026 bracket cutoffs late in the year. The graduated-rate ranges and structure shown here reflect the legislatively enacted schedule and the Department's annual indexing methodology, not speculative estimates.</p>
    `,
  },

  texas: {
    name: 'Texas',
    body: `
      <h3>No Texas State Income Tax for Freelancers</h3>
      <p>Texas has no personal state income tax — your freelance income is only taxed at the federal level. This makes Texas one of the most tax-advantaged states in the country for high-earning self-employed workers, especially those who would otherwise pay 5–13% in California, New York, or Oregon.</p>

      <h3>Texas Franchise Tax — Most Freelancers Owe Nothing, But LLCs Must Still File</h3>
      <p>Texas imposes a franchise tax (the "margin tax") on most legal entities, but the no-tax-due threshold for 2026 reports is $2.65 million in annualized total revenue (up from $2.47 million for 2025) — well above what most freelancers earn. Sole proprietors not operating through an LLC are <strong>exempt</strong> from franchise tax entirely. However, single-member LLCs <strong>are</strong> taxable entities for Texas franchise tax purposes even when treated as disregarded entities federally — Texas looks at legal formation, not federal tax election. If you operate as a Texas LLC (single- or multi-member) or S-Corp under the threshold, you owe $0 in franchise tax but must still file an annual Public Information Report (PIR) or Ownership Information Report (OIR) with the Comptroller.</p>

      <h3>Quarterly Federal Estimated Payments</h3>
      <p>Texas freelancers don't make state quarterly payments (no state income tax) but must still pay federal quarterly estimates if they expect to owe $1,000+ for the year. Standard federal due dates: April 15, June 15, September 15, January 15. Use Form 1040-ES. The safe harbor is 100% of prior year (110% if AGI > $150K).</p>

      <h3>Common Texas Freelancer Gotchas</h3>
      <p>Texas doesn't recognize S-Corp federal elections for franchise tax purposes the same way most states do — an S-Corp in Texas is still subject to franchise tax above the threshold, regardless of federal election. Sales tax may apply if you sell tangible goods or certain services (consulting on software, data processing, security services); rates run 6.25–8.25% depending on local jurisdiction. If you have nexus in another state from remote clients, you may owe income tax there even though you live in Texas.</p>
    `,
  },

  florida: {
    name: 'Florida',
    body: `
      <h3>No Florida State Income Tax for Freelancers</h3>
      <p>Florida has no personal state income tax — freelance and self-employment income is taxed only at the federal level. Combined with no estate tax and no inheritance tax, Florida is one of the most tax-friendly states in the U.S. for self-employed workers, retirees, and high earners.</p>

      <h3>Florida Corporate Income Tax — Sole Props and LLCs Exempt</h3>
      <p>Florida does levy a 5.5% corporate income tax, but it applies only to C-Corps. Sole proprietors filing Schedule C, single-member LLCs treated as disregarded entities, and S-Corps (which pass through to your personal return) are <strong>not</strong> subject to Florida corporate tax. This makes the LLC-S-Corp conversion analysis especially favorable for Florida freelancers — the federal SE tax savings aren't offset by additional state tax.</p>

      <h3>Quarterly Federal Estimated Payments</h3>
      <p>Florida freelancers make no state estimated payments but must pay federal quarterly estimates if expecting to owe $1,000+. Standard federal due dates apply (April 15, June 15, September 15, January 15). File Form 1040-ES. Safe harbor is 100% of prior year (110% if AGI > $150K).</p>

      <h3>Common Florida Freelancer Gotchas</h3>
      <p>Florida's sales tax is 6% state-wide plus county discretionary surtaxes (typically 0.5–1.5%). Sales of tangible goods are taxable; most professional services (consulting, writing, design) are not, but commercial rent is taxable at a reduced rate. If you sell digital products or SaaS, taxability is complex and often depends on whether the buyer is in Florida. Florida does require LLCs to file an Annual Report ($138.75 for LLCs) by May 1 every year — missing this triggers a $400 penalty and potential dissolution.</p>
    `,
  },

  illinois: {
    name: 'Illinois',
    body: `
      <h3>Illinois State Income Tax for Freelancers</h3>
      <p>Illinois imposes a flat 4.95% state income tax on freelance and self-employment income. Unlike graduated states, your effective state rate doesn't change with income — a $50K freelancer pays the same rate as a $500K freelancer. Illinois conforms to most federal deductions but does <strong>not</strong> conform to the federal QBI deduction, so your 20% QBI benefit reduces your federal tax only.</p>

      <h3>Illinois PTE Tax (Pass-Through Entity)</h3>
      <p>Illinois enacted a PTE tax election that lets S-Corps, partnerships, and multi-member LLCs pay state tax at the entity level (4.95%), creating a federal deduction that bypasses the SALT cap. Each owner receives a corresponding refundable Illinois tax credit on their personal return for their share of PTE tax paid, so net Illinois tax stays roughly the same — the workaround unlocks the federal deduction, it doesn't reduce state tax. For Illinois freelancers operating as S-Corps with $150K+ in income, this can save $750–$2,500/year in federal tax. Sole proprietors filing Schedule C are not eligible — election requires a pass-through entity structure.</p>

      <h3>Quarterly Estimated Payments in Illinois</h3>
      <p>Illinois follows the federal four-quarter schedule (April 15, June 15, September 15, January 15). File Form IL-1040-ES. The safe harbor is 100% of prior year liability or 90% of current year. Failure to make timely payments triggers Form IL-2210 penalties calculated at the federal short-term rate plus 3%.</p>

      <h3>Common Illinois Freelancer Gotchas</h3>
      <p>If you live in Chicago, there's no separate Chicago income tax (unlike NYC), but Cook County and the City of Chicago levy various business-related taxes — ranging from the Chicago Business License fee (varies by activity) to the Personal Property Lease Transaction Tax (9% on leased software/equipment) which can apply to certain SaaS subscriptions. Illinois sales tax is 6.25% state plus local add-ons (Chicago combined is 10.25%, the highest big-city sales tax in the U.S.); most professional services are not taxable.</p>
    `,
  },

  pennsylvania: {
    name: 'Pennsylvania',
    body: `
      <h3>Pennsylvania State Income Tax for Freelancers</h3>
      <p>Pennsylvania imposes a flat 3.07% state income tax — one of the lowest flat rates among states with income tax. PA's tax base is unusual: it does <strong>not</strong> allow most federal itemized deductions, the standard deduction, or the QBI deduction at the state level. However, PA does allow ordinary and necessary business expenses for self-employed individuals on PA Schedule UE, which mirrors much of federal Schedule C.</p>

      <h3>Local Earned Income Tax (EIT)</h3>
      <p>Most PA municipalities and school districts impose a local Earned Income Tax of 1–4% on top of state tax. Philadelphia's Wage Tax is 3.74% for residents and 3.43% for non-residents (effective July 1, 2025; rates are adjusted on July 1 each year and are scheduled to drop further to 3.70%/3.39% in upcoming years). Pittsburgh's combined EIT is roughly 3% (1% city + 2% school district). The EIT/Wage Tax is collected separately from state tax — most PA freelancers must file with both the PA Department of Revenue and their local tax collector (Berkheimer, Keystone, etc.).</p>

      <h3>Quarterly Estimated Payments in Pennsylvania</h3>
      <p>PA requires quarterly payments on the federal schedule (April 15, June 15, September 15, January 15). File Form PA-40 ES. The safe harbor is 100% of prior year liability. Local EIT is also paid quarterly to your local collector — the form and due dates vary by collector but are typically aligned with federal/state deadlines.</p>

      <h3>Common Pennsylvania Freelancer Gotchas</h3>
      <p>PA does not recognize S-Corp federal elections the same way most states do — PA's "S-Corp" election is separate (filed via REV-1640) and treats the entity differently for state tax. Most freelancers shouldn't elect PA S-Corp status; the federal election alone gives you the SE tax savings without complicating PA filings. Philadelphia also imposes a Business Income & Receipts Tax (BIRT) of 1.415 mills on gross receipts plus 5.81% on net income for businesses operating in the city — this applies to many Philadelphia-based freelancers.</p>
    `,
  },

  ohio: {
    name: 'Ohio',
    body: `
      <h3>Ohio Business Income Deduction (BID) — A Major Freelancer Benefit</h3>
      <p>Ohio offers the most generous state-level small-business tax break in the country: the Business Income Deduction (BID). The first $250,000 of business income (single filer; $125,000 for married filing separately) is <strong>completely exempt</strong> from Ohio state income tax. Income above the threshold is taxed at a flat 3%. For an Ohio freelancer earning $200,000 net, this means $0 in Ohio state income tax — a significant advantage over comparable states like Illinois (~$9,900) or Pennsylvania (~$6,140).</p>

      <h3>Ohio's Standard Tax Rates</h3>
      <p>Ohio moved to a flat 2.75% state income tax on nonbusiness income (W-2 wages, investment income, retirement distributions) above $26,050 for 2026 — down from a graduated structure with a 3.5% top rate in 2024–2025. Most freelancers will qualify for the Business Income Deduction and pay little or no state tax on Schedule C income, but any wage income from a side job or spouse's income still flows through the new flat 2.75% rate.</p>

      <h3>Local Municipal Income Tax (RITA / CCA)</h3>
      <p>Most Ohio cities impose a municipal income tax of 1–3% on residents and non-residents working in the city. Cleveland is 2.5%, Columbus is 2.5%, Cincinnati is 1.8%, Akron is 2.5%. The BID does <strong>not</strong> apply at the municipal level — your full freelance income is subject to local tax. Most cities are administered by RITA (Regional Income Tax Agency) or CCA (Central Collection Agency); a few self-administer. Quarterly estimated payments are required to your local collector.</p>

      <h3>Quarterly Estimated Payments in Ohio</h3>
      <p>Ohio quarterly estimates use the federal schedule (April 15, June 15, September 15, January 15). File Form IT-1040ES. Safe harbor is 100% of prior year. Most freelancers benefit from BID enough that state estimated payments are minimal or zero, but municipal estimates often exceed state liability — don't forget the local quarterlies.</p>
    `,
  },

  washington: {
    name: 'Washington',
    body: `
      <h3>No Washington State Income Tax for Freelancers</h3>
      <p>Washington has no personal state income tax on wages or self-employment income. Combined with no corporate income tax, this makes WA one of the most tax-friendly states for high-earning freelancers — particularly tech consultants, developers, and Seattle-area knowledge workers earning $200K+ where comparable California or Oregon residents pay 9–13% in state tax.</p>

      <h3>Washington Business & Occupation (B&O) Tax</h3>
      <p>Washington imposes a B&O tax on gross receipts of businesses, which <strong>does</strong> apply to most freelancers. Rates vary by activity classification: 1.75% for "Service & Other Activities" with under $5 million in income (the bucket most consultants and freelancers fall into); 2.1% for service businesses over $5 million in income (effective October 1, 2025); 0.484% for retailing; 0.471% for wholesaling. Beginning January 1, 2026, businesses with more than $250 million in annual taxable income owe an additional 0.5% surcharge on top of regular B&O. The state's annual B&O filing threshold is $125,000 in gross receipts — under that, you generally don't need to register or file. The Small Business B&O Credit further reduces tax for service-classified filers up to $160/month (phasing out as tax due exceeds $160 and zeroing at $320). Seattle separately raised its city B&O exemption from $100,000 to $2 million effective January 1, 2026, removing most freelancers from city B&O entirely. Even if your credit zeros out your state liability, you must still file.</p>

      <h3>Washington Capital Gains Tax</h3>
      <p>WA's 7% capital gains tax (enacted 2021, upheld by the WA Supreme Court in 2023) was restructured for 2026 into a tiered rate: 7% on the first $1 million of long-term gains above the standard deduction, and 9.9% on amounts above $1 million. The standard deduction is approximately $285,000 for 2026 (up from $278,000 in 2025), indexed annually. The tax affects freelancers selling appreciated stock, real estate, or business assets — but does not apply to ordinary self-employment income. Real estate transactions, retirement accounts, and certain qualified small business stock are excluded.</p>

      <h3>Quarterly Federal Estimated Payments</h3>
      <p>WA freelancers make no state income tax estimates (no income tax) but must pay federal quarterly estimates on the standard schedule (April 15, June 15, September 15, January 15) using Form 1040-ES. Seattle imposes a "JumpStart" payroll expense tax on businesses with payroll above $7M and high-comp employees, but this rarely applies to solo freelancers.</p>
    `,
  },

  massachusetts: {
    name: 'Massachusetts',
    body: `
      <h3>Massachusetts State Income Tax for Freelancers</h3>
      <p>Massachusetts imposes a 5% flat state income tax on most income, plus a 4% surtax on Massachusetts taxable income above $1,107,750 for 2026 (the "Millionaire's Tax" / Question 1, indexed annually for inflation — was $1,083,150 in 2025) for a top combined rate of 9% on high earners. For most freelancers earning under $1M, the effective state rate is a clean 5%. MA does not conform to the federal QBI deduction.</p>

      <h3>Massachusetts PTE Excise (PTE Tax)</h3>
      <p>Massachusetts allows pass-through entities (S-Corps, partnerships, LLCs taxed as such) to elect to pay state tax at the entity level under Chapter 63D. The entity pays 5% (and the millionaire's surtax if applicable), creating a federal deduction that bypasses the SALT cap. Each owner receives a refundable MA tax credit on their personal return for their share of PTE excise paid, so net Massachusetts tax is roughly unchanged — the federal SALT-cap workaround is what's unlocked. For MA freelancers in S-Corps earning $200K+, PTE savings typically run $1,500–$4,000/year in federal tax.</p>

      <h3>Quarterly Estimated Payments in Massachusetts</h3>
      <p>MA quarterly estimates follow the federal schedule (April 15, June 15, September 15, January 15). File Form 1-ES. Safe harbor is 80% of current year or 100% of prior year (whichever is less). Underpayment triggers M-2210 penalties. The 4% surtax must also be estimated quarterly — high earners cross-check their estimates against the surtax threshold to avoid penalty.</p>

      <h3>Common Massachusetts Freelancer Gotchas</h3>
      <p>MA's 4% surtax is calculated on Massachusetts taxable income, not federal AGI — selling a business, exercising stock options, or having a windfall year can push you over the $1.1M threshold and trigger the surtax even if your normal income is well below. Plan major capital events with this in mind. MA does not allow itemized deductions in the federal sense (mortgage interest, etc., aren't deductible at the state level) — freelancers can deduct certain business expenses on Schedule C-EZ but personal itemized deductions don't carry over to Massachusetts.</p>
    `,
  },

  'new-jersey': {
    name: 'New Jersey',
    body: `
      <h3>New Jersey State Income Tax for Freelancers</h3>
      <p>New Jersey taxes freelance income at graduated rates from 1.4% to 10.75%, with the top bracket starting at $1 million. Most freelancers fall in the 5.525–8.97% range. NJ does <strong>not</strong> conform to the federal QBI deduction. NJ also doesn't allow the federal half-SE tax deduction at the state level, so your NJ taxable income is generally higher than your federal taxable income for the same business.</p>

      <h3>NJ Business Alternative Income Tax (BAIT)</h3>
      <p>NJ's BAIT is one of the strongest PTE workarounds in the country. S-Corps, partnerships, and multi-member LLCs taxed as such can elect to pay state tax at the entity level on a tiered schedule: 5.675% on the first $250,000 of distributive proceeds, 6.52% from $250,000 to $1 million, and 10.9% on amounts above $1 million. The election creates a federal deduction that bypasses the SALT cap, and the state then issues a refundable credit to each individual partner/shareholder. For a NJ freelancer earning $300K through an S-Corp, BAIT savings often exceed $7,500/year in federal tax — the largest PTE benefit of any state. Single-member LLCs taxed as disregarded entities and sole proprietors do not qualify.</p>

      <h3>Quarterly Estimated Payments in New Jersey</h3>
      <p>NJ uses the federal four-quarter schedule (April 15, June 15, September 15, January 15). File Form NJ-1040-ES. Safe harbor is 100% of prior year liability or 80% of current year. Failure to pay triggers underpayment interest at the federal short-term rate + 3%.</p>

      <h3>Common New Jersey Freelancer Gotchas</h3>
      <p>NJ does not allow net operating loss carryovers for sole proprietors filing Schedule C — a bad year can't offset a good year for state tax purposes (federal does allow). NJ also taxes nonresident-sourced income at the same rates if you work in NJ; if you live in PA but work for NJ clients, the PA-NJ reciprocity agreement covers wages but NOT self-employment income, so 1099 freelancers crossing state lines often owe NJ tax even as PA residents. Newark imposes a 1% payroll tax that doesn't apply to most freelancers but can affect S-Corp owners taking salary.</p>

      <p style="font-size: 12px; color: var(--hint); margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--rule);"><strong>Note on 2026 brackets:</strong> New Jersey's 2026 income tax brackets reflect the legislatively enacted graduated-rate schedule. NJ statutorily fixes its bracket cutoffs (they are not inflation-indexed annually), so the rates and ranges shown here are the operative 2026 rates unless changed by future legislation.</p>
    `,
  },

  georgia: {
    name: 'Georgia',
    body: `
      <h3>Georgia State Income Tax for Freelancers</h3>
      <p>Georgia currently imposes a flat 5.19% state income tax on all freelance and self-employment income, set by HB 111 (signed by Governor Kemp on April 15, 2025), which reduced the rate from 5.39% in 2024 and put the state on a path of annual 0.10% reductions toward 4.99%. In the 2026 legislative session, lawmakers passed an additional acceleration bill (currently on the Governor's desk and expected to be signed) that would bring the rate directly to 4.99% effective for tax year 2026, with a longer-term legislative target of 3.99%. Pending the Governor's signature, the operative 2026 rate may be 4.99%; otherwise it remains 5.19%. The flat rate applies regardless of income level. Georgia conforms to federal taxable income calculations including the standard deduction, which simplifies state filing for most freelancers.</p>

      <h3>Georgia Pass-Through Entity Tax</h3>
      <p>Georgia enacted a PTE tax election in 2022. S-Corps, partnerships, and multi-member LLCs can elect to pay GA state tax at the entity level (at the prevailing flat rate), generating a federal deduction that bypasses the SALT cap. Owners receive a corresponding refundable Georgia tax credit on their personal return, so net state tax is roughly unchanged — the federal deduction is what's unlocked, not a state tax reduction. For Georgia freelancers operating as S-Corps with $150K+ in income, the federal tax savings typically run $500–$2,000/year.</p>

      <h3>Quarterly Estimated Payments in Georgia</h3>
      <p>Georgia quarterly estimates align with the federal schedule (April 15, June 15, September 15, January 15). File Form 500-ES. Safe harbor is 100% of prior year or 70% of current year. Failure to pay timely triggers underpayment penalty interest based on the federal underpayment rate.</p>

      <h3>Georgia Non-Conformity to OBBBA Tip and Overtime Deductions</h3>
      <p>Georgia's IRC conformity date currently sits at January 1, 2025, which predates OBBBA's July 4, 2025 enactment. As a result, Georgia has <strong>not</strong> conformed to the federal "No Tax on Tips" (OBBBA §70201) or "No Tax on Overtime" (OBBBA §70202) deductions. If you take those federal deductions, Georgia adds the amounts back when computing Georgia taxable income — meaning you still owe Georgia state tax on tip and overtime income even when it's exempt from federal income tax. The Georgia legislature has considered conformity bills (e.g., HB 375) but none had been enacted as of early 2026; check current Georgia Department of Revenue guidance before filing.</p>

      <h3>Common Georgia Freelancer Gotchas</h3>
      <p>Georgia does <strong>not</strong> conform to the federal QBI deduction, so your 20% QBI benefit reduces your federal tax only. Atlanta and other Georgia cities don't impose a separate municipal income tax (unlike Ohio or Pennsylvania), making local tax compliance simpler. Georgia has a Net Worth Tax on corporations (including LLCs taxed as C-Corps) ranging from $10–$5,000 annually; LLCs taxed as partnerships or disregarded entities are exempt.</p>
    `,
  },

  utah: {
    name: 'Utah',
    body: `
      <h3>Utah State Income Tax for Freelancers</h3>
      <p>Utah imposes a flat 4.45% state income tax on freelance and self-employment income for tax year 2026, following SB 60 enacted in the 2026 legislative session (down from 4.50% in 2025 and 4.65% in 2024 — the sixth consecutive annual reduction). Utah uses a "single rate" system where the same rate applies to all income, but there are non-refundable Taxpayer Tax Credits that effectively reduce tax for lower-income filers. Most middle-and-high-income freelancers pay close to the full 4.45%.</p>

      <h3>Utah's Taxpayer Tax Credit</h3>
      <p>Utah's primary deduction mechanism is the Taxpayer Tax Credit, which equals 6% of the federal standard deduction (or itemized deductions) plus the personal exemption. The credit phases out at higher incomes — for single filers it begins to phase out at ~$16,700 AGI and is fully phased out around $100,000. Most full-time freelancers will see little to no credit benefit and pay the flat 4.45% on most income.</p>

      <h3>Utah PTE Tax Election</h3>
      <p>Utah enacted a PTE tax in 2022. S-Corps, partnerships, and multi-member LLCs taxed as such can elect to pay state tax at the entity level (4.45% for 2026), creating a federal deduction that bypasses the SALT cap. Owners receive a corresponding refundable Utah tax credit on their personal return, so net Utah tax is roughly unchanged — the workaround unlocks the federal deduction, not a state tax cut. For Utah S-Corp freelancers earning $150K+, federal savings typically run $500–$1,500/year.</p>

      <h3>Quarterly Estimated Payments in Utah</h3>
      <p>Utah requires quarterly estimates aligned with the federal schedule (April 15, June 15, September 15, January 15). File Form TC-546. Safe harbor is 90% of current year or 100% of prior year. Underpayment triggers interest at the federal underpayment rate plus 2%. Most Utah municipalities don't impose a local income tax, simplifying multi-jurisdiction compliance compared to Ohio or Pennsylvania.</p>
    `,
  },

  colorado: {
    name: 'Colorado',
    body: `
      <h3>Colorado State Income Tax for Freelancers</h3>
      <p>Colorado imposes a flat 4.40% state income tax on freelance and self-employment income (rate set by Proposition 116 in 2020 and Proposition HH adjustments since). Colorado's tax base starts with federal taxable income, so federal deductions including QBI and the half-SE deduction flow through to reduce Colorado tax — making it one of the more freelancer-friendly states procedurally.</p>

      <h3>Colorado Pass-Through Entity Tax (SALT Parity Act)</h3>
      <p>Colorado enacted a PTE tax election in 2021. S-Corps and partnerships pay state tax at the entity level (4.40%) and the federal deduction bypasses the SALT cap. Owners receive a corresponding refundable Colorado tax credit on their personal return for their share of PTE tax paid, so net CO tax is roughly unchanged — the federal deduction is what's unlocked. For CO S-Corp freelancers earning $175K+, federal savings typically run $500–$1,500/year. The election is annual and made on Form DR 1705.</p>

      <h3>Quarterly Estimated Payments in Colorado</h3>
      <p>Colorado quarterly estimates align with the federal schedule (April 15, June 15, September 15, January 15). File Form DR 0104EP. Safe harbor is 100% of prior year liability or 70% of current year. Underpayment penalty is calculated on Form DR 0204 at the federal short-term rate plus 3%.</p>

      <h3>Common Colorado Freelancer Gotchas</h3>
      <p>Several Colorado cities (Denver, Aurora, Glendale, Greenwood Village, Sheridan) impose an Occupational Privilege Tax (OPT) — a flat $5.75/month per employee plus $4.00/month employer fee in Denver, for example. This applies to S-Corp owners taking salary in those cities. Sole proprietors filing Schedule C are generally not subject to OPT. Denver also has its own sales tax structure layered on state sales tax, which can affect freelancers selling products. Colorado offers TABOR refunds in years with surplus revenue — these aren't predictable but reduce effective state tax.</p>
    `,
  },
};

function insertStateGuide(html, slug) {
  const guide = STATE_GUIDES[slug];
  if (!guide) return null;

  // Find methodology div as insertion point
  const methodologyMatch = html.match(/(\s*)<div\s+class=["']methodology["']/);
  if (!methodologyMatch) return null;

  const insertBefore = methodologyMatch.index;

  const guideHtml = `\n  <section class="state-guide">\n    <h2>${guide.name} Freelancer Tax Guide for 2026</h2>\n    ${guide.body.trim()}\n  </section>\n`;

  // Avoid duplicating if already present
  if (html.includes('class="state-guide"')) {
    // Replace existing
    return html.replace(
      /\s*<section\s+class=["']state-guide["']>[\s\S]*?<\/section>\s*/,
      guideHtml
    );
  }

  return html.substring(0, insertBefore) + guideHtml + html.substring(insertBefore);
}

// Add CSS for the new section if not already present in the head
function ensureGuideCss(html) {
  if (html.includes('.state-guide')) return html;

  const css = `
  .state-guide {
    background: var(--white); border: 1px solid var(--rule); border-radius: 12px;
    padding: 28px 32px; margin: 32px 0;
  }
  .state-guide h2 { font-size: 22px; font-weight: 700; margin: 0 0 16px; color: var(--dark); }
  .state-guide h3 {
    font-size: 16px; font-weight: 600; margin: 20px 0 8px; color: var(--dark);
    padding: 0; border: none;
  }
  .state-guide p { font-size: 14px; color: var(--medium); margin: 0 0 12px; line-height: 1.7; }
  .state-guide strong { color: var(--dark); font-weight: 600; }
  .state-guide em { font-style: italic; }
  @media (max-width: 600px) {
    .state-guide { padding: 20px 18px; }
    .state-guide h2 { font-size: 19px; }
  }
`;

  // Insert before </style>
  return html.replace(/<\/style>/, css + '</style>');
}

let updated = 0;
let skipped = 0;
for (const slug of Object.keys(STATE_GUIDES)) {
  const file = `calculators/self-employment-tax/${slug}/index.html`;
  let html;
  try { html = read(file); } catch (e) { console.log('SKIP (not found): ' + file); skipped++; continue; }

  const result = insertStateGuide(html, slug);
  if (!result) { console.log('SKIP (no insertion point): ' + file); skipped++; continue; }

  const final = ensureGuideCss(result);
  write(file, final);
  console.log(`Added guide: ${slug} (${STATE_GUIDES[slug].body.replace(/<[^>]*>/g, '').trim().length} chars unique content)`);
  updated++;
}

console.log(`\n${updated} state guides added. ${skipped} skipped.`);
