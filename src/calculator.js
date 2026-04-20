/**
 * Self-Employment Tax Calculator Engine
 *
 * Calculates federal SE tax, federal income tax, and state income tax
 * for self-employed individuals / freelancers.
 *
 * All calculations are estimates for informational purposes only.
 */

/**
 * Calculate tax through progressive brackets
 * @param {number} taxableIncome - Income to apply brackets to
 * @param {Array<{min: number, max: number, rate: number}>} brackets - Tax brackets
 * @returns {{total: number, breakdown: Array<{bracket: string, rate: number, taxable: number, tax: number}>}}
 */
function calculateBracketTax(taxableIncome, brackets) {
  const breakdown = [];
  let total = 0;

  for (const bracket of brackets) {
    if (taxableIncome <= bracket.min) break;
    const taxableInBracket = Math.min(taxableIncome, bracket.max) - bracket.min;
    const tax = taxableInBracket * bracket.rate;
    total += tax;
    breakdown.push({
      bracket: bracket.max === Infinity
        ? `Over $${bracket.min.toLocaleString()}`
        : `$${bracket.min.toLocaleString()} – $${bracket.max.toLocaleString()}`,
      rate: bracket.rate,
      taxable: taxableInBracket,
      tax: tax,
    });
  }

  return { total, breakdown };
}

/**
 * Calculate self-employment tax
 * @param {number} netProfit - Net self-employment income
 * @param {object} federal - Federal tax data for the year
 * @returns {{total: number, socialSecurity: number, medicare: number, additionalMedicare: number, taxableBase: number, deductibleHalf: number}}
 */
function calculateSETax(netProfit, federal, filingStatus) {
  const taxableBase = netProfit * federal.seNetFactor;

  // Social Security (capped at wage base)
  const ssBase = Math.min(taxableBase, federal.ssWageBase);
  const socialSecurity = ssBase * federal.ssRate;

  // Medicare (no cap)
  const medicare = taxableBase * federal.medicareRate;

  // Additional Medicare (above threshold)
  const threshold = federal.additionalMedicareThreshold[filingStatus] || 200000;
  const additionalMedicare = taxableBase > threshold
    ? (taxableBase - threshold) * federal.additionalMedicareRate
    : 0;

  const total = socialSecurity + medicare + additionalMedicare;
  const deductibleHalf = total / 2;

  return { total, socialSecurity, medicare, additionalMedicare, taxableBase, deductibleHalf };
}

/**
 * Calculate state income tax
 * @param {number} netProfit - Net self-employment income
 * @param {object} state - State tax data
 * @param {string} filingStatus - 'single', 'marriedJoint', etc.
 * @returns {{total: number, effectiveRate: number, notes: string}}
 */
function calculateStateTax(netProfit, state, filingStatus) {
  if (!state.hasIncomeTax) {
    return { total: 0, effectiveRate: 0, notes: state.notes };
  }

  let taxableIncome = netProfit;

  // Apply standard deduction if available
  if (state.standardDeduction) {
    const deduction = state.standardDeduction[filingStatus] || state.standardDeduction.single;
    taxableIncome = Math.max(0, taxableIncome - deduction);
  }

  // Apply personal exemption if available
  if (state.personalExemption) {
    taxableIncome = Math.max(0, taxableIncome - state.personalExemption);
  }

  let total = 0;

  if (state.flatRate) {
    if (state.flatRateFloor) {
      // Ohio-style: flat rate only on income above floor
      total = Math.max(0, taxableIncome - state.flatRateFloor) * state.flatRate;
    } else {
      total = taxableIncome * state.flatRate;
    }
  } else if (state.brackets) {
    const bracketKey = state.brackets[filingStatus] ? filingStatus : 'single';
    const result = calculateBracketTax(taxableIncome, state.brackets[bracketKey]);
    total = result.total;
  }

  // California SDI
  if (state.sdiRate) {
    const sdiBase = Math.min(netProfit, state.sdiWageCap || Infinity);
    total += sdiBase * state.sdiRate;
  }

  const effectiveRate = netProfit > 0 ? total / netProfit : 0;

  return { total, effectiveRate, notes: state.notes };
}

/**
 * Full calculation: federal SE tax + federal income tax + state tax
 * @param {object} params
 * @param {number} params.netProfit - Net self-employment income (after business expenses)
 * @param {string} params.filingStatus - 'single', 'marriedJoint', 'marriedSeparate', 'headOfHousehold'
 * @param {string} params.stateKey - Key in STATES object
 * @param {string} params.taxYear - '2026', '2027', etc.
 * @param {number} [params.otherIncome=0] - W-2 or other non-SE income
 * @param {number} [params.deductions=0] - Additional itemized deductions above standard (0 = use standard)
 * @param {boolean} [params.isSenior=false] - Whether taxpayer is 65+ (OBBBA senior deduction)
 * @param {number} [params.extraDeductions=0] - Additional above-the-line deductions (health insurance, retirement, etc.)
 * @returns {object} Complete tax breakdown
 */
function calculateAll(params, federal, state) {
  const { netProfit, filingStatus, otherIncome = 0, deductions = 0, isSenior = false, extraDeductions = 0 } = params;

  // Step 1: Self-employment tax
  const seTax = calculateSETax(netProfit, federal, filingStatus);

  // Step 2: Determine taxable income for federal income tax
  const totalIncome = netProfit + otherIncome;
  const standardDeduction = federal.standardDeduction[filingStatus] || federal.standardDeduction.single;
  const deductionUsed = deductions > 0 ? deductions : standardDeduction;

  // QBI deduction (up to 20% of net business income, phased out above threshold)
  const qbiThreshold = federal.qbiThreshold[filingStatus] || federal.qbiThreshold.single;
  const qbiEligible = totalIncome <= qbiThreshold;
  let qbiDeduction = 0;
  if (federal.qbiDeductionRate > 0) {
    qbiDeduction = qbiEligible ? netProfit * federal.qbiDeductionRate : 0;
    // OBBBA minimum deduction: at least $400 if QBI >= $1,000 and materially participates
    if (federal.qbiMinimumDeduction && netProfit >= 1000 && qbiDeduction < federal.qbiMinimumDeduction) {
      qbiDeduction = federal.qbiMinimumDeduction;
    }
  }

  // Senior deduction (OBBBA: $6,000 for 65+, phases out at 6% above $75K single / $150K joint)
  let seniorDeduction = 0;
  if (isSenior && federal.seniorDeduction) {
    const seniorThreshold = (filingStatus === 'marriedJoint') ? 150000 : 75000;
    if (totalIncome <= seniorThreshold) {
      seniorDeduction = federal.seniorDeduction;
    } else {
      const phaseOutAmount = (totalIncome - seniorThreshold) * 0.06;
      seniorDeduction = Math.max(0, federal.seniorDeduction - phaseOutAmount);
    }
  }

  const federalTaxableIncome = Math.max(0,
    totalIncome - seTax.deductibleHalf - deductionUsed - qbiDeduction - seniorDeduction - extraDeductions
  );

  // Step 3: Federal income tax
  const bracketKey = federal.brackets[filingStatus] ? filingStatus : 'single';
  const federalIncomeTax = calculateBracketTax(federalTaxableIncome, federal.brackets[bracketKey]);

  // Step 4: State income tax
  const stateTax = calculateStateTax(netProfit, state, filingStatus);

  // Step 5: Totals
  const totalFederalTax = seTax.total + federalIncomeTax.total;
  const totalTax = totalFederalTax + stateTax.total;
  const takeHome = totalIncome - totalTax;
  const effectiveRate = totalIncome > 0 ? totalTax / totalIncome : 0;
  const federalEffectiveRate = totalIncome > 0 ? totalFederalTax / totalIncome : 0;

  // Quarterly estimated payment
  const quarterlyPayment = totalTax / 4;

  return {
    inputs: {
      netProfit,
      otherIncome,
      totalIncome,
      filingStatus,
      stateName: state.name,
    },
    selfEmploymentTax: seTax,
    federalIncomeTax: {
      taxableIncome: federalTaxableIncome,
      standardDeduction: deductionUsed,
      halfSEDeduction: seTax.deductibleHalf,
      qbiDeduction,
      qbiEligible,
      tax: federalIncomeTax.total,
      breakdown: federalIncomeTax.breakdown,
    },
    stateTax,
    summary: {
      selfEmploymentTax: seTax.total,
      federalIncomeTax: federalIncomeTax.total,
      totalFederalTax: totalFederalTax,
      stateTax: stateTax.total,
      totalTax,
      takeHome,
      effectiveRate,
      federalEffectiveRate,
      stateEffectiveRate: stateTax.effectiveRate,
      quarterlyPayment,
      monthlySetAside: totalTax / 12,
    },
  };
}

if (typeof module !== 'undefined') module.exports = { calculateAll, calculateBracketTax, calculateSETax, calculateStateTax };
