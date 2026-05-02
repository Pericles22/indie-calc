/**
 * Federal and State Tax Data — Multi-Year
 *
 * Federal brackets from Tax Foundation.
 * State brackets from published state revenue department data.
 * SE tax rate: 15.3% (12.4% SS + 2.9% Medicare) on 92.35% of net earnings.
 *
 * DISCLAIMER: These rates are estimates for informational purposes only.
 * Consult a qualified tax professional for your specific situation.
 */

const TAX_YEARS = ['2026']; // Add '2027' when IRS publishes (expected Oct 2026)

const FEDERAL = {};

FEDERAL['2026'] = {
  standardDeduction: {
    single: 16100,
    marriedJoint: 32200,
    marriedSeparate: 16100,
    headOfHousehold: 24150,
  },
  brackets: {
    single: [
      { min: 0, max: 12400, rate: 0.10 },
      { min: 12400, max: 50400, rate: 0.12 },
      { min: 50400, max: 105700, rate: 0.22 },
      { min: 105700, max: 201775, rate: 0.24 },
      { min: 201775, max: 256225, rate: 0.32 },
      { min: 256225, max: 640600, rate: 0.35 },
      { min: 640600, max: Infinity, rate: 0.37 },
    ],
    marriedJoint: [
      { min: 0, max: 24800, rate: 0.10 },
      { min: 24800, max: 100800, rate: 0.12 },
      { min: 100800, max: 211400, rate: 0.22 },
      { min: 211400, max: 403550, rate: 0.24 },
      { min: 403550, max: 512450, rate: 0.32 },
      { min: 512450, max: 768700, rate: 0.35 },
      { min: 768700, max: Infinity, rate: 0.37 },
    ],
    marriedSeparate: [
      { min: 0, max: 12400, rate: 0.10 },
      { min: 12400, max: 50400, rate: 0.12 },
      { min: 50400, max: 105700, rate: 0.22 },
      { min: 105700, max: 201775, rate: 0.24 },
      { min: 201775, max: 256225, rate: 0.32 },
      { min: 256225, max: 384350, rate: 0.35 },
      { min: 384350, max: Infinity, rate: 0.37 },
    ],
    headOfHousehold: [
      { min: 0, max: 17650, rate: 0.10 },
      { min: 17650, max: 64400, rate: 0.12 },
      { min: 64400, max: 105700, rate: 0.22 },
      { min: 105700, max: 201775, rate: 0.24 },
      { min: 201775, max: 256225, rate: 0.32 },
      { min: 256225, max: 640600, rate: 0.35 },
      { min: 640600, max: Infinity, rate: 0.37 },
    ],
  },
  seTaxRate: 0.153,
  seNetFactor: 0.9235,
  ssWageBase: 184500, // SSA confirmed for 2026
  ssRate: 0.124,
  medicareRate: 0.029,
  additionalMedicareThreshold: { single: 200000, marriedJoint: 250000, marriedSeparate: 125000, headOfHousehold: 200000 },
  additionalMedicareRate: 0.009,
  qbiDeductionRate: 0.20,
  qbiMinimumDeduction: 400, // OBBBA §70105: guaranteed $400 minimum if QBI >= $1,000 from active business with material participation
  qbiMinimumQBIThreshold: 1000, // OBBBA: minimum applies only when QBI >= $1,000
  qbiPhaseInRange: { single: 75000, marriedJoint: 150000, marriedSeparate: 75000, headOfHousehold: 75000 }, // OBBBA expanded ranges from $50K/$100K
  qbiThreshold: { single: 201775, marriedJoint: 403550, marriedSeparate: 201775, headOfHousehold: 201775 }, // 2026: tied to top of 24% bracket per §199A indexing
  seniorDeduction: 6000, // OBBBA §70103: additional deduction per qualifying senior (65+); doubles for MFJ if both spouses qualify
  // CTC refundable portion (Additional Child Tax Credit): $1,700/child for 2026
  // Refundable amount = min(actcMax, max(0, earnedIncome - actcEarnedIncomeFloor) * actcEarnedIncomeRate)
  actcMaxPerChild: 1700,
  actcEarnedIncomeFloor: 2500,
  actcEarnedIncomeRate: 0.15,
  // SALT cap (OBBBA §70120): increased from $10,000 to $40,400 for 2026.
  // Married filing separately gets exactly half the cap.
  // saltCapBase: keyed by filing status; the post-phaseout cap is computed dynamically.
  saltCapBase: {
    single: 40400,
    marriedJoint: 40400,
    marriedSeparate: 20200,
    headOfHousehold: 40400,
  },
  // MAGI phaseout: cap reduces by 30% of MAGI excess over the threshold,
  // floored at the original $10,000 ($5,000 MFS) cap. Phaseout completes
  // around MAGI = threshold + $101,333 (single/MFJ/HoH) at which point
  // the effective cap returns to the pre-OBBBA $10,000 floor.
  saltCapPhaseoutThreshold: {
    single: 500000,
    marriedJoint: 500000,
    marriedSeparate: 250000,
    headOfHousehold: 500000,
  },
  saltCapPhaseoutRate: 0.30,
  saltCapFloor: {
    single: 10000,
    marriedJoint: 10000,
    marriedSeparate: 5000,
    headOfHousehold: 10000,
  },
  // Legacy field kept for backward-compat with code that reads federal.saltCap directly.
  saltCap: 40400,
  // OBBBA itemized deduction limitation ("2/37 rule"): for taxpayers in the
  // top 37% bracket, itemized deductions are reduced by 2/37 (~5.4%) of the
  // lesser of (a) total itemized deductions or (b) taxable income excess
  // over the 37% bracket threshold. Effectively caps the value of itemized
  // deductions at 35% rather than 37%.
  itemizedLimitationRate: 2 / 37,
  // The 37% bracket threshold is derived from federal.brackets[filingStatus]
  // at runtime (find the bracket where rate === 0.37 and use its `min`).
  tipExemption: 25000, // OBBBA §70201: "No Tax on Tips" — up to $25K in qualified tips exempt from income tax (not SE tax)
  // OBBBA §70202: "No Tax on Overtime" — above-the-line deduction for qualified overtime
  // compensation reported separately on W-2/1099. MFS gets full single cap.
  // Phaseout: $100 reduction per $1,000 of MAGI excess over threshold (10% rate).
  // Complete phaseout: cap = 0 at MAGI >= threshold + ($cap × 10) i.e. $275K single, $550K MFJ.
  overtimeDeductionMax: { single: 12500, marriedJoint: 25000, marriedSeparate: 12500, headOfHousehold: 12500 },
  overtimePhaseoutThreshold: { single: 150000, marriedJoint: 300000, marriedSeparate: 150000, headOfHousehold: 150000 },
  overtimePhaseoutRate: 0.10,
  // OBBBA permanent: above-the-line charitable deduction for taxpayers who claim
  // the standard deduction. Cash gifts to public charities only (no DAFs, no
  // appreciated stock, no household goods). Itemizers route through Schedule A
  // (where the new 0.5%-of-AGI floor applies — not modeled here).
  charitableNonItemizerMax: { single: 1000, marriedJoint: 2000, marriedSeparate: 1000, headOfHousehold: 1000 },
  // Net Investment Income Tax (§1411): 3.8% surtax on lesser of
  //   (a) net investment income, or
  //   (b) MAGI minus filing-status threshold.
  // Thresholds are NOT inflation-adjusted (statutory).
  niitRate: 0.038,
  niitThreshold: { single: 200000, marriedJoint: 250000, marriedSeparate: 125000, headOfHousehold: 200000 },
};

/**
 * State tax data for the 10 highest-population states.
 * Rates are for 2026 tax year (2025 rates adjusted where 2026 published).
 * States with no income tax are included with empty brackets.
 */
const STATES = {
  california: {
    name: 'California',
    abbreviation: 'CA',
    hasIncomeTax: true,
    standardDeduction: { single: 5722, marriedJoint: 11444 }, // 2026 inflation-adjusted (~3.2% bump from 2025)
    brackets: {
      // 2026 brackets per FTB published schedule. The "13.3%" top bracket
      // represents the 12.3% marginal rate plus the 1% Mental Health
      // Services Tax surcharge on income above $1M.
      single: [
        { min: 0, max: 10756, rate: 0.01 },
        { min: 10756, max: 25499, rate: 0.02 },
        { min: 25499, max: 40245, rate: 0.04 },
        { min: 40245, max: 55866, rate: 0.06 },
        { min: 55866, max: 70606, rate: 0.08 },
        { min: 70606, max: 360659, rate: 0.093 },
        { min: 360659, max: 432787, rate: 0.103 },
        { min: 432787, max: 721314, rate: 0.113 },
        { min: 721314, max: 1000000, rate: 0.123 },
        { min: 1000000, max: Infinity, rate: 0.133 },
      ],
      marriedJoint: [
        { min: 0, max: 21512, rate: 0.01 },
        { min: 21512, max: 50998, rate: 0.02 },
        { min: 50998, max: 80490, rate: 0.04 },
        { min: 80490, max: 111732, rate: 0.06 },
        { min: 111732, max: 141212, rate: 0.08 },
        { min: 141212, max: 721318, rate: 0.093 },
        { min: 721318, max: 865574, rate: 0.103 },
        { min: 865574, max: 1000000, rate: 0.113 },
        { min: 1000000, max: 1442628, rate: 0.123 },
        { min: 1442628, max: Infinity, rate: 0.133 },
      ],
    },
    sdiRate: 0.013, // 2026: increased from 1.2% in 2025
    sdiWageCap: Infinity, // SB 951 removed the wage cap effective Jan 1, 2024
    subtractsHalfSE: true, // CA conforms to federal AGI start, which already deducts half-SE.
    notes: 'California charges SDI (State Disability Insurance) at 1.3% on ALL wages (no cap, per SB 951). The Mental Health Services Tax (1% above $1M) is rolled into the 13.3% top bracket.',
    sourceUrl: 'https://www.ftb.ca.gov/file/personal/tax-rates.html',
  },
  texas: {
    name: 'Texas',
    abbreviation: 'TX',
    hasIncomeTax: false,
    brackets: {},
    notes: 'Texas has no state income tax.',
    sourceUrl: 'https://comptroller.texas.gov/',
  },
  florida: {
    name: 'Florida',
    abbreviation: 'FL',
    hasIncomeTax: false,
    brackets: {},
    notes: 'Florida has no state income tax.',
    sourceUrl: 'https://floridarevenue.com/',
  },
  newYork: {
    name: 'New York',
    abbreviation: 'NY',
    hasIncomeTax: true,
    standardDeduction: { single: 8000, marriedJoint: 16050 },
    brackets: {
      single: [
        { min: 0, max: 8500, rate: 0.04 },
        { min: 8500, max: 11700, rate: 0.045 },
        { min: 11700, max: 13900, rate: 0.0525 },
        { min: 13900, max: 80650, rate: 0.0585 },
        { min: 80650, max: 215400, rate: 0.0625 },
        { min: 215400, max: 1077550, rate: 0.0685 },
        { min: 1077550, max: 5000000, rate: 0.0965 },
        { min: 5000000, max: 25000000, rate: 0.103 },
        { min: 25000000, max: Infinity, rate: 0.109 },
      ],
      marriedJoint: [
        { min: 0, max: 17150, rate: 0.04 },
        { min: 17150, max: 23600, rate: 0.045 },
        { min: 23600, max: 27900, rate: 0.0525 },
        { min: 27900, max: 161550, rate: 0.0585 },
        { min: 161550, max: 323200, rate: 0.0625 },
        { min: 323200, max: 2155350, rate: 0.0685 },
        { min: 2155350, max: 5000000, rate: 0.0965 },
        { min: 5000000, max: 25000000, rate: 0.103 },
        { min: 25000000, max: Infinity, rate: 0.109 },
      ],
    },
    notes: 'New York City residents pay an additional 3.078-3.876% city income tax. Yonkers residents pay a 16.75% surcharge on state tax.',
    sourceUrl: 'https://www.tax.ny.gov/pit/file/tax_tables.htm',
    localities: {
      // NYC personal income tax: graduated 3.078%-3.876% (2026 rates).
      // Same brackets for single and MFJ at the upper end; using flat-rate
      // approximation at the top marginal rate for an estimator.
      nyc: {
        name: 'New York City',
        brackets: {
          single: [
            { min: 0, max: 12000, rate: 0.03078 },
            { min: 12000, max: 25000, rate: 0.03762 },
            { min: 25000, max: 50000, rate: 0.03819 },
            { min: 50000, max: Infinity, rate: 0.03876 },
          ],
          marriedJoint: [
            { min: 0, max: 21600, rate: 0.03078 },
            { min: 21600, max: 45000, rate: 0.03762 },
            { min: 45000, max: 90000, rate: 0.03819 },
            { min: 90000, max: Infinity, rate: 0.03876 },
          ],
        },
      },
      // Yonkers: 16.75% surcharge on NY state tax liability.
      yonkers: {
        name: 'Yonkers',
        surchargeOfStateTax: 0.1675,
      },
    },
  },
  illinois: {
    name: 'Illinois',
    abbreviation: 'IL',
    hasIncomeTax: true,
    flatRate: 0.0495,
    personalExemption: 2625,
    notes: 'Illinois uses a flat income tax rate of 4.95%. Source: Tax Foundation 2026.',
    sourceUrl: 'https://tax.illinois.gov/individuals.html',
  },
  pennsylvania: {
    name: 'Pennsylvania',
    abbreviation: 'PA',
    hasIncomeTax: true,
    flatRate: 0.0307,
    notes: 'Pennsylvania uses a flat income tax rate of 3.07%. Many municipalities also levy a local earned income tax (typically 1-3%).',
    sourceUrl: 'https://www.revenue.pa.gov/TaxTypes/PIT/Pages/default.aspx',
  },
  ohio: {
    name: 'Ohio',
    abbreviation: 'OH',
    hasIncomeTax: true,
    flatRate: 0.0275,
    flatRateFloor: 26050,
    notes: 'Ohio uses a flat rate of 2.75% on nonbusiness income above $26,050. Many Ohio cities levy additional municipal income taxes (typically 1-2.5%). Source: Tax Foundation 2026.',
    sourceUrl: 'https://tax.ohio.gov/individual/resources/annual-tax-rates',
    localities: {
      // Approximation across major Ohio cities (Columbus, Cleveland, Cincinnati typically 2.5%).
      ohioMunicipal: {
        name: 'Ohio municipal (avg 2.5%)',
        flatRate: 0.025,
      },
    },
  },
  georgia: {
    name: 'Georgia',
    abbreviation: 'GA',
    hasIncomeTax: true,
    flatRate: 0.0519,
    standardDeduction: { single: 12000, marriedJoint: 24000 },
    notes: 'Georgia uses a flat tax rate of 5.19% (reduced from 5.49% in 2025). Source: Tax Foundation 2026.',
    sourceUrl: 'https://dor.georgia.gov/individual-income-tax',
  },
  northCarolina: {
    name: 'North Carolina',
    abbreviation: 'NC',
    hasIncomeTax: true,
    flatRate: 0.0399,
    standardDeduction: { single: 12750, marriedJoint: 25500 },
    notes: 'North Carolina uses a flat tax rate of 3.99% (phasedown completed 2026). Source: Tax Foundation 2026.',
    sourceUrl: 'https://www.ncdor.gov/taxes-forms/individual-income-tax',
  },
  michigan: {
    name: 'Michigan',
    abbreviation: 'MI',
    hasIncomeTax: true,
    flatRate: 0.0425,
    personalExemption: 5600,
    notes: 'Michigan uses a flat income tax rate of 4.25%. Some cities (Detroit, Grand Rapids) levy additional local income taxes. Source: Tax Foundation 2026.',
    sourceUrl: 'https://www.michigan.gov/taxes/iit',
  },

  // ===== REMAINING 40 STATES =====

  // No Income Tax States
  alaska: { name: 'Alaska', abbreviation: 'AK', hasIncomeTax: false, brackets: {}, notes: 'Alaska has no state income tax.' },
  nevada: { name: 'Nevada', abbreviation: 'NV', hasIncomeTax: false, brackets: {}, notes: 'Nevada has no state income tax.' },
  southDakota: { name: 'South Dakota', abbreviation: 'SD', hasIncomeTax: false, brackets: {}, notes: 'South Dakota has no state income tax.' },
  tennessee: { name: 'Tennessee', abbreviation: 'TN', hasIncomeTax: false, brackets: {}, notes: 'Tennessee has no state income tax. Hall Tax on interest/dividends fully phased out in 2021.' },
  washington: { name: 'Washington', abbreviation: 'WA', hasIncomeTax: false, brackets: {}, notes: 'Washington has no state income tax on earned income. A 7% capital gains tax applies to long-term gains exceeding $278,000.' },
  wyoming: { name: 'Wyoming', abbreviation: 'WY', hasIncomeTax: false, brackets: {}, notes: 'Wyoming has no state income tax.' },
  newHampshire: { name: 'New Hampshire', abbreviation: 'NH', hasIncomeTax: false, brackets: {}, notes: 'New Hampshire has no state income tax. The Interest & Dividends Tax was fully phased out effective January 1, 2025.' },

  // Flat Rate States
  arizona: { name: 'Arizona', abbreviation: 'AZ', hasIncomeTax: true, flatRate: 0.025, standardDeduction: { single: 8350, marriedJoint: 16700 }, notes: 'Flat rate of 2.50%. Source: Tax Foundation 2026.' },
  colorado: { name: 'Colorado', abbreviation: 'CO', hasIncomeTax: true, flatRate: 0.044, standardDeduction: { single: 16100, marriedJoint: 32200 }, notes: 'Flat rate of 4.40%. Source: Tax Foundation 2026.' },
  idaho: { name: 'Idaho', abbreviation: 'ID', hasIncomeTax: true, flatRate: 0.053, standardDeduction: { single: 14600, marriedJoint: 29200 }, notes: 'Flat rate of 5.30% (reduced from 5.695% via HB 40). Source: Tax Foundation 2026.' },
  indiana: { name: 'Indiana', abbreviation: 'IN', hasIncomeTax: true, flatRate: 0.0295, personalExemption: 1000, notes: 'Flat rate of 2.95%. $1,000 personal exemption. Counties also levy local income tax. Source: Tax Foundation 2026.' },
  iowa: { name: 'Iowa', abbreviation: 'IA', hasIncomeTax: true, flatRate: 0.038, standardDeduction: { single: 16100, marriedJoint: 32200 }, notes: 'Flat rate of 3.80%. Source: Tax Foundation 2026.' },
  kentucky: { name: 'Kentucky', abbreviation: 'KY', hasIncomeTax: true, flatRate: 0.035, standardDeduction: { single: 3360, marriedJoint: 3360 }, notes: 'Flat rate of 3.50% (reduced from 4.00%). Source: Tax Foundation 2026.' },
  louisiana: { name: 'Louisiana', abbreviation: 'LA', hasIncomeTax: true, flatRate: 0.03, standardDeduction: { single: 12875, marriedJoint: 25750 }, notes: 'Flat rate of 3.00%. Source: Tax Foundation 2026.' },
  mississippi: { name: 'Mississippi', abbreviation: 'MS', hasIncomeTax: true, flatRate: 0.04, standardDeduction: { single: 2300, marriedJoint: 4600 }, personalExemption: 6000, notes: 'Flat rate of 4.00% (reduced from 4.40%). First $10,000 exempt. Source: Tax Foundation 2026.' },
  missouri: { name: 'Missouri', abbreviation: 'MO', hasIncomeTax: true, flatRate: 0.04, standardDeduction: { single: 15750, marriedJoint: 31500 }, notes: 'Flat rate of 4.00% effective 2026. Replaced graduated system. Source: Tax Foundation 2026.' },
  utah: { name: 'Utah', abbreviation: 'UT', hasIncomeTax: true, flatRate: 0.0445, notes: 'Flat rate of 4.45% for 2026 (reduced from 4.50% via SB 60, retroactive to January 1, 2026 — sixth consecutive annual cut). Credit-based system equivalent to 6% of federal standard deduction. Source: Utah State Tax Commission, SB 60 (2026).' },

  // Graduated Bracket States
  alabama: { name: 'Alabama', abbreviation: 'AL', hasIncomeTax: true, standardDeduction: { single: 3000, marriedJoint: 8500 }, personalExemption: 1500, brackets: { single: [{ min: 0, max: 500, rate: 0.02 },{ min: 500, max: 3000, rate: 0.04 },{ min: 3000, max: Infinity, rate: 0.05 }], marriedJoint: [{ min: 0, max: 1000, rate: 0.02 },{ min: 1000, max: 6000, rate: 0.04 },{ min: 6000, max: Infinity, rate: 0.05 }] }, notes: 'Graduated rates 2%-5%. Source: Tax Foundation 2026.' },
  arkansas: { name: 'Arkansas', abbreviation: 'AR', hasIncomeTax: true, standardDeduction: { single: 2470, marriedJoint: 4940 }, brackets: { single: [{ min: 0, max: 4600, rate: 0.02 },{ min: 4600, max: Infinity, rate: 0.039 }], marriedJoint: [{ min: 0, max: 4600, rate: 0.02 },{ min: 4600, max: Infinity, rate: 0.039 }] }, notes: 'Graduated rates 2%-3.9%. Source: Tax Foundation 2026.' },
  connecticut: { name: 'Connecticut', abbreviation: 'CT', hasIncomeTax: true, personalExemption: 15000, brackets: { single: [{ min: 0, max: 10000, rate: 0.02 },{ min: 10000, max: 50000, rate: 0.045 },{ min: 50000, max: 100000, rate: 0.055 },{ min: 100000, max: 200000, rate: 0.06 },{ min: 200000, max: 250000, rate: 0.065 },{ min: 250000, max: 500000, rate: 0.069 },{ min: 500000, max: Infinity, rate: 0.0699 }], marriedJoint: [{ min: 0, max: 20000, rate: 0.02 },{ min: 20000, max: 100000, rate: 0.045 },{ min: 100000, max: 200000, rate: 0.055 },{ min: 200000, max: 400000, rate: 0.06 },{ min: 400000, max: 500000, rate: 0.065 },{ min: 500000, max: 1000000, rate: 0.069 },{ min: 1000000, max: Infinity, rate: 0.0699 }] }, notes: 'Graduated rates 2%-6.99%. No standard deduction. Source: Tax Foundation 2026.' },
  delaware: { name: 'Delaware', abbreviation: 'DE', hasIncomeTax: true, standardDeduction: { single: 3250, marriedJoint: 6500 }, brackets: { single: [{ min: 0, max: 2000, rate: 0 },{ min: 2000, max: 5000, rate: 0.022 },{ min: 5000, max: 10000, rate: 0.039 },{ min: 10000, max: 20000, rate: 0.048 },{ min: 20000, max: 25000, rate: 0.052 },{ min: 25000, max: 60000, rate: 0.0555 },{ min: 60000, max: Infinity, rate: 0.066 }], marriedJoint: [{ min: 0, max: 2000, rate: 0 },{ min: 2000, max: 5000, rate: 0.022 },{ min: 5000, max: 10000, rate: 0.039 },{ min: 10000, max: 20000, rate: 0.048 },{ min: 20000, max: 25000, rate: 0.052 },{ min: 25000, max: 60000, rate: 0.0555 },{ min: 60000, max: Infinity, rate: 0.066 }] }, notes: 'Graduated rates 0%-6.6%. Source: Tax Foundation 2026.' },
  hawaii: { name: 'Hawaii', abbreviation: 'HI', hasIncomeTax: true, standardDeduction: { single: 4400, marriedJoint: 8800 }, personalExemption: 1144, brackets: { single: [{ min: 0, max: 9600, rate: 0.014 },{ min: 9600, max: 14400, rate: 0.032 },{ min: 14400, max: 19200, rate: 0.055 },{ min: 19200, max: 24000, rate: 0.064 },{ min: 24000, max: 36000, rate: 0.068 },{ min: 36000, max: 48000, rate: 0.072 },{ min: 48000, max: 125000, rate: 0.076 },{ min: 125000, max: 175000, rate: 0.079 },{ min: 175000, max: 225000, rate: 0.0825 },{ min: 225000, max: 275000, rate: 0.09 },{ min: 275000, max: 325000, rate: 0.10 },{ min: 325000, max: Infinity, rate: 0.11 }], marriedJoint: [{ min: 0, max: 19200, rate: 0.014 },{ min: 19200, max: 28800, rate: 0.032 },{ min: 28800, max: 38400, rate: 0.055 },{ min: 38400, max: 48000, rate: 0.064 },{ min: 48000, max: 72000, rate: 0.068 },{ min: 72000, max: 96000, rate: 0.072 },{ min: 96000, max: 250000, rate: 0.076 },{ min: 250000, max: 350000, rate: 0.079 },{ min: 350000, max: 450000, rate: 0.0825 },{ min: 450000, max: 550000, rate: 0.09 },{ min: 550000, max: 650000, rate: 0.10 },{ min: 650000, max: Infinity, rate: 0.11 }] }, notes: 'Graduated rates 1.4%-11%. 12 brackets. Source: Tax Foundation 2026.' },
  kansas: { name: 'Kansas', abbreviation: 'KS', hasIncomeTax: true, standardDeduction: { single: 3605, marriedJoint: 8240 }, personalExemption: 9160, brackets: { single: [{ min: 0, max: 23000, rate: 0.052 },{ min: 23000, max: Infinity, rate: 0.0558 }], marriedJoint: [{ min: 0, max: 46000, rate: 0.052 },{ min: 46000, max: Infinity, rate: 0.0558 }] }, notes: 'Graduated rates 5.2%-5.58%. Large personal exemption. Source: Tax Foundation 2026.' },
  maine: { name: 'Maine', abbreviation: 'ME', hasIncomeTax: true, standardDeduction: { single: 8350, marriedJoint: 16700 }, personalExemption: 5300, brackets: { single: [{ min: 0, max: 27399, rate: 0.058 },{ min: 27399, max: 64849, rate: 0.0675 },{ min: 64849, max: Infinity, rate: 0.0715 }], marriedJoint: [{ min: 0, max: 54849, rate: 0.058 },{ min: 54849, max: 129749, rate: 0.0675 },{ min: 129749, max: Infinity, rate: 0.0715 }] }, notes: 'Graduated rates 5.8%-7.15%. Source: Tax Foundation 2026.' },
  maryland: { name: 'Maryland', abbreviation: 'MD', hasIncomeTax: true, standardDeduction: { single: 3350, marriedJoint: 6700 }, personalExemption: 3200, brackets: { single: [{ min: 0, max: 1000, rate: 0.02 },{ min: 1000, max: 2000, rate: 0.03 },{ min: 2000, max: 3000, rate: 0.04 },{ min: 3000, max: 100000, rate: 0.0475 },{ min: 100000, max: 125000, rate: 0.05 },{ min: 125000, max: 150000, rate: 0.0525 },{ min: 150000, max: 250000, rate: 0.055 },{ min: 250000, max: 500000, rate: 0.0575 },{ min: 500000, max: 1000000, rate: 0.0625 },{ min: 1000000, max: Infinity, rate: 0.065 }], marriedJoint: [{ min: 0, max: 1000, rate: 0.02 },{ min: 1000, max: 2000, rate: 0.03 },{ min: 2000, max: 3000, rate: 0.04 },{ min: 3000, max: 150000, rate: 0.0475 },{ min: 150000, max: 175000, rate: 0.05 },{ min: 175000, max: 225000, rate: 0.0525 },{ min: 225000, max: 300000, rate: 0.055 },{ min: 300000, max: 600000, rate: 0.0575 },{ min: 600000, max: 1200000, rate: 0.0625 },{ min: 1200000, max: Infinity, rate: 0.065 }] }, notes: 'Graduated rates 2%-6.5%. Counties also levy local income tax (1.75%-3.2%). Source: Tax Foundation 2026.' },
  massachusetts: { name: 'Massachusetts', abbreviation: 'MA', hasIncomeTax: true, personalExemption: 4400, brackets: { single: [{ min: 0, max: 1107750, rate: 0.05 },{ min: 1107750, max: Infinity, rate: 0.09 }], marriedJoint: [{ min: 0, max: 1107750, rate: 0.05 },{ min: 1107750, max: Infinity, rate: 0.09 }] }, notes: 'Effectively flat at 5% for most taxpayers. 4% millionaire surtax above $1,107,750 (2026 indexed). No standard deduction. Source: MA DOR / Tax Foundation 2026.' },
  minnesota: { name: 'Minnesota', abbreviation: 'MN', hasIncomeTax: true, standardDeduction: { single: 15300, marriedJoint: 30600 }, brackets: { single: [{ min: 0, max: 33310, rate: 0.0535 },{ min: 33310, max: 109430, rate: 0.068 },{ min: 109430, max: 203150, rate: 0.0785 },{ min: 203150, max: Infinity, rate: 0.0985 }], marriedJoint: [{ min: 0, max: 48700, rate: 0.0535 },{ min: 48700, max: 193480, rate: 0.068 },{ min: 193480, max: 337930, rate: 0.0785 },{ min: 337930, max: Infinity, rate: 0.0985 }] }, notes: 'Graduated rates 5.35%-9.85%. Source: Tax Foundation 2026.' },
  montana: { name: 'Montana', abbreviation: 'MT', hasIncomeTax: true, standardDeduction: { single: 16100, marriedJoint: 32200 }, brackets: { single: [{ min: 0, max: 47500, rate: 0.047 },{ min: 47500, max: Infinity, rate: 0.0565 }], marriedJoint: [{ min: 0, max: 95000, rate: 0.047 },{ min: 95000, max: Infinity, rate: 0.0565 }] }, notes: 'Graduated rates 4.7%-5.65%. Source: Tax Foundation 2026.' },
  nebraska: { name: 'Nebraska', abbreviation: 'NE', hasIncomeTax: true, standardDeduction: { single: 8850, marriedJoint: 17700 }, brackets: { single: [{ min: 0, max: 2400, rate: 0.0246 },{ min: 2400, max: 18000, rate: 0.0351 },{ min: 18000, max: Infinity, rate: 0.0455 }], marriedJoint: [{ min: 0, max: 4800, rate: 0.0246 },{ min: 4800, max: 36000, rate: 0.0351 },{ min: 36000, max: Infinity, rate: 0.0455 }] }, notes: 'Graduated rates 2.46%-4.55%. Source: Tax Foundation 2026.' },
  newJersey: { name: 'New Jersey', abbreviation: 'NJ', hasIncomeTax: true, personalExemption: 1000, brackets: { single: [{ min: 0, max: 20000, rate: 0.014 },{ min: 20000, max: 35000, rate: 0.0175 },{ min: 35000, max: 40000, rate: 0.035 },{ min: 40000, max: 75000, rate: 0.0553 },{ min: 75000, max: 500000, rate: 0.0637 },{ min: 500000, max: 1000000, rate: 0.0897 },{ min: 1000000, max: Infinity, rate: 0.1075 }], marriedJoint: [{ min: 0, max: 20000, rate: 0.014 },{ min: 20000, max: 50000, rate: 0.0175 },{ min: 50000, max: 70000, rate: 0.0245 },{ min: 70000, max: 80000, rate: 0.035 },{ min: 80000, max: 150000, rate: 0.0553 },{ min: 150000, max: 500000, rate: 0.0637 },{ min: 500000, max: 1000000, rate: 0.0897 },{ min: 1000000, max: Infinity, rate: 0.1075 }] }, notes: 'Graduated rates 1.4%-10.75%. No standard deduction. Source: Tax Foundation 2026.' },
  newMexico: { name: 'New Mexico', abbreviation: 'NM', hasIncomeTax: true, standardDeduction: { single: 16100, marriedJoint: 32200 }, brackets: { single: [{ min: 0, max: 5500, rate: 0.015 },{ min: 5500, max: 16500, rate: 0.032 },{ min: 16500, max: 33500, rate: 0.043 },{ min: 33500, max: 66500, rate: 0.047 },{ min: 66500, max: 210000, rate: 0.049 },{ min: 210000, max: Infinity, rate: 0.059 }], marriedJoint: [{ min: 0, max: 8000, rate: 0.015 },{ min: 8000, max: 25000, rate: 0.032 },{ min: 25000, max: 50000, rate: 0.043 },{ min: 50000, max: 100000, rate: 0.047 },{ min: 100000, max: 315000, rate: 0.049 },{ min: 315000, max: Infinity, rate: 0.059 }] }, notes: 'Graduated rates 1.5%-5.9%. Source: Tax Foundation 2026.' },
  northDakota: { name: 'North Dakota', abbreviation: 'ND', hasIncomeTax: true, standardDeduction: { single: 16100, marriedJoint: 32200 }, brackets: { single: [{ min: 0, max: 48475, rate: 0 },{ min: 48475, max: 244825, rate: 0.0195 },{ min: 244825, max: Infinity, rate: 0.025 }], marriedJoint: [{ min: 0, max: 80975, rate: 0 },{ min: 80975, max: 298075, rate: 0.0195 },{ min: 298075, max: Infinity, rate: 0.025 }] }, notes: 'Graduated rates 0%-2.5%. Effectively no tax on first ~$48K single. Source: Tax Foundation 2026.' },
  oklahoma: { name: 'Oklahoma', abbreviation: 'OK', hasIncomeTax: true, standardDeduction: { single: 6350, marriedJoint: 12700 }, personalExemption: 1000, brackets: { single: [{ min: 0, max: 3750, rate: 0 },{ min: 3750, max: 4900, rate: 0.025 },{ min: 4900, max: 7200, rate: 0.035 },{ min: 7200, max: Infinity, rate: 0.045 }], marriedJoint: [{ min: 0, max: 7500, rate: 0 },{ min: 7500, max: 9800, rate: 0.025 },{ min: 9800, max: 14400, rate: 0.035 },{ min: 14400, max: Infinity, rate: 0.045 }] }, notes: 'Graduated rates 0%-4.5%. Source: Tax Foundation 2026.' },
  oregon: { name: 'Oregon', abbreviation: 'OR', hasIncomeTax: true, standardDeduction: { single: 2910, marriedJoint: 5820 }, brackets: { single: [{ min: 0, max: 4550, rate: 0.0475 },{ min: 4550, max: 11400, rate: 0.0675 },{ min: 11400, max: 125000, rate: 0.0875 },{ min: 125000, max: Infinity, rate: 0.099 }], marriedJoint: [{ min: 0, max: 9100, rate: 0.0475 },{ min: 9100, max: 22800, rate: 0.0675 },{ min: 22800, max: 250000, rate: 0.0875 },{ min: 250000, max: Infinity, rate: 0.099 }] }, notes: 'Graduated rates 4.75%-9.9%. Source: Tax Foundation 2026.' },
  rhodeIsland: { name: 'Rhode Island', abbreviation: 'RI', hasIncomeTax: true, standardDeduction: { single: 11200, marriedJoint: 22400 }, personalExemption: 5250, brackets: { single: [{ min: 0, max: 82050, rate: 0.0375 },{ min: 82050, max: 186450, rate: 0.0475 },{ min: 186450, max: Infinity, rate: 0.0599 }], marriedJoint: [{ min: 0, max: 82050, rate: 0.0375 },{ min: 82050, max: 186450, rate: 0.0475 },{ min: 186450, max: Infinity, rate: 0.0599 }] }, notes: 'Graduated rates 3.75%-5.99%. Source: Tax Foundation 2026.' },
  southCarolina: { name: 'South Carolina', abbreviation: 'SC', hasIncomeTax: true, standardDeduction: { single: 8350, marriedJoint: 16700 }, brackets: { single: [{ min: 0, max: 3640, rate: 0 },{ min: 3640, max: 18230, rate: 0.03 },{ min: 18230, max: Infinity, rate: 0.06 }], marriedJoint: [{ min: 0, max: 3640, rate: 0 },{ min: 3640, max: 18230, rate: 0.03 },{ min: 18230, max: Infinity, rate: 0.06 }] }, notes: 'Graduated rates 0%-6%. Source: Tax Foundation 2026.' },
  vermont: { name: 'Vermont', abbreviation: 'VT', hasIncomeTax: true, standardDeduction: { single: 7650, marriedJoint: 15300 }, personalExemption: 5300, brackets: { single: [{ min: 0, max: 49400, rate: 0.0335 },{ min: 49400, max: 119700, rate: 0.066 },{ min: 119700, max: 249700, rate: 0.076 },{ min: 249700, max: Infinity, rate: 0.0875 }], marriedJoint: [{ min: 0, max: 82500, rate: 0.0335 },{ min: 82500, max: 199450, rate: 0.066 },{ min: 199450, max: 304000, rate: 0.076 },{ min: 304000, max: Infinity, rate: 0.0875 }] }, notes: 'Graduated rates 3.35%-8.75%. Source: Tax Foundation 2026.' },
  virginia: { name: 'Virginia', abbreviation: 'VA', hasIncomeTax: true, standardDeduction: { single: 8750, marriedJoint: 17500 }, personalExemption: 930, brackets: { single: [{ min: 0, max: 3000, rate: 0.02 },{ min: 3000, max: 5000, rate: 0.03 },{ min: 5000, max: 17000, rate: 0.05 },{ min: 17000, max: Infinity, rate: 0.0575 }], marriedJoint: [{ min: 0, max: 3000, rate: 0.02 },{ min: 3000, max: 5000, rate: 0.03 },{ min: 5000, max: 17000, rate: 0.05 },{ min: 17000, max: Infinity, rate: 0.0575 }] }, notes: 'Graduated rates 2%-5.75%. Source: Tax Foundation 2026.' },
  westVirginia: { name: 'West Virginia', abbreviation: 'WV', hasIncomeTax: true, personalExemption: 2000, brackets: { single: [{ min: 0, max: 10000, rate: 0.0222 },{ min: 10000, max: 25000, rate: 0.0296 },{ min: 25000, max: 40000, rate: 0.0333 },{ min: 40000, max: 60000, rate: 0.0444 },{ min: 60000, max: Infinity, rate: 0.0482 }], marriedJoint: [{ min: 0, max: 10000, rate: 0.0222 },{ min: 10000, max: 25000, rate: 0.0296 },{ min: 25000, max: 40000, rate: 0.0333 },{ min: 40000, max: 60000, rate: 0.0444 },{ min: 60000, max: Infinity, rate: 0.0482 }] }, notes: 'Graduated rates 2.22%-4.82%. No standard deduction. Source: Tax Foundation 2026.' },
  wisconsin: { name: 'Wisconsin', abbreviation: 'WI', hasIncomeTax: true, standardDeduction: { single: 13960, marriedJoint: 25840 }, personalExemption: 700, brackets: { single: [{ min: 0, max: 15110, rate: 0.035 },{ min: 15110, max: 51950, rate: 0.044 },{ min: 51950, max: 332720, rate: 0.053 },{ min: 332720, max: Infinity, rate: 0.0765 }], marriedJoint: [{ min: 0, max: 20150, rate: 0.035 },{ min: 20150, max: 69260, rate: 0.044 },{ min: 69260, max: 443630, rate: 0.053 },{ min: 443630, max: Infinity, rate: 0.0765 }] }, notes: 'Graduated rates 3.5%-7.65%. Source: Tax Foundation 2026.' },
  districtOfColumbia: { name: 'District of Columbia', abbreviation: 'DC', hasIncomeTax: true, standardDeduction: { single: 16100, marriedJoint: 32200 }, brackets: { single: [{ min: 0, max: 10000, rate: 0.04 },{ min: 10000, max: 40000, rate: 0.06 },{ min: 40000, max: 60000, rate: 0.065 },{ min: 60000, max: 250000, rate: 0.085 },{ min: 250000, max: 500000, rate: 0.0925 },{ min: 500000, max: 1000000, rate: 0.0975 },{ min: 1000000, max: Infinity, rate: 0.1075 }], marriedJoint: [{ min: 0, max: 10000, rate: 0.04 },{ min: 10000, max: 40000, rate: 0.06 },{ min: 40000, max: 60000, rate: 0.065 },{ min: 60000, max: 250000, rate: 0.085 },{ min: 250000, max: 500000, rate: 0.0925 },{ min: 500000, max: 1000000, rate: 0.0975 },{ min: 1000000, max: Infinity, rate: 0.1075 }] }, notes: 'Graduated rates 4%-10.75%. Not a state but included for completeness. Source: Tax Foundation 2026.' },
};

if (typeof module !== 'undefined') module.exports = { FEDERAL, STATES, TAX_YEARS };
