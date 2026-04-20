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
 *
 * Per IRS Form 8959, the Additional Medicare 0.9% threshold is reduced
 * dollar-for-dollar by W-2 wages before being applied to SE earnings.
 *
 * The deductible "half-SE" portion is the EMPLOYER-equivalent of regular
 * SS + Medicare only — NOT 50% of Additional Medicare (Add'l Medicare is
 * an employee-only tax with no employer match).
 *
 * Negative net profit (loss) produces $0 SE tax in this engine; net
 * operating loss handling is out of scope.
 */
function calculateSETax(netProfit, federal, filingStatus, otherIncome) {
  // Floor SE earnings at $0 — losses don't generate negative SE tax.
  const seBase = Math.max(0, netProfit) * federal.seNetFactor;

  // Social Security (capped at wage base)
  const ssBase = Math.min(seBase, federal.ssWageBase);
  const socialSecurity = ssBase * federal.ssRate;

  // Medicare (no cap)
  const medicare = seBase * federal.medicareRate;

  // Additional Medicare: threshold reduced by W-2 wages first (Form 8959).
  // Compares COMBINED wages + SE earnings; SE pays 0.9% on its share.
  const baseThreshold = federal.additionalMedicareThreshold[filingStatus] || 200000;
  const w2Wages = Math.max(0, otherIncome || 0);
  const effectiveThreshold = Math.max(0, baseThreshold - w2Wages);
  const additionalMedicare = seBase > effectiveThreshold
    ? (seBase - effectiveThreshold) * federal.additionalMedicareRate
    : 0;

  const total = socialSecurity + medicare + additionalMedicare;

  // Half-SE deduction: 50% of regular SS+Medicare ONLY (not Add'l Medicare).
  const deductibleHalf = (socialSecurity + medicare) / 2;

  return { total, socialSecurity, medicare, additionalMedicare, taxableBase: seBase, deductibleHalf };
}

/**
 * Calculate state income tax.
 *
 * State tax is applied to TOTAL income (SE + other), since most states
 * tax all sources of income, not only self-employment income.
 */
function calculateStateTax(totalIncome, state, filingStatus) {
  if (!state.hasIncomeTax) {
    return { total: 0, effectiveRate: 0, notes: state.notes };
  }

  let taxableIncome = Math.max(0, totalIncome);

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

  // California SDI (now uncapped per SB 951; applied to SE income only,
  // since SDI on W-2 wages is withheld by the employer separately).
  if (state.sdiRate) {
    const sdiBase = Math.min(Math.max(0, totalIncome), state.sdiWageCap || Infinity);
    total += sdiBase * state.sdiRate;
  }

  const effectiveRate = totalIncome > 0 ? total / totalIncome : 0;

  return { total, effectiveRate, notes: state.notes };
}

/**
 * Calculate the QBI deduction with proper §199A phase-in, SSTB handling,
 * and the overall taxable-income cap.
 *
 * Inputs:
 *   - netProfit: gross self-employment income
 *   - reducedQBI: QBI base after subtracting (a) deductible half-SE,
 *     (b) self-employed health insurance, (c) SE retirement contributions
 *   - taxableIncomeBeforeQBI: AGI minus standard deduction (no QBI yet)
 *   - filingStatus
 *   - federal: tax data
 *   - isSSTB: whether the business is a Specified Service Trade or
 *     Business (law, accounting, health, consulting, athletics,
 *     financial services, performing arts, brokerage)
 */
function calculateQBI(netProfit, reducedQBI, taxableIncomeBeforeQBI, filingStatus, federal, isSSTB) {
  if (federal.qbiDeductionRate <= 0 || netProfit <= 0) return 0;

  const threshold = federal.qbiThreshold[filingStatus] || federal.qbiThreshold.single;
  const phaseInRange = federal.qbiPhaseInRange[filingStatus] || federal.qbiPhaseInRange.single;
  const overallCap = Math.max(0, taxableIncomeBeforeQBI) * federal.qbiDeductionRate;

  // Below threshold: full 20% (subject to overall cap and OBBBA $400 minimum).
  if (taxableIncomeBeforeQBI <= threshold) {
    let deduction = Math.min(reducedQBI * federal.qbiDeductionRate, overallCap);
    if (federal.qbiMinimumDeduction
        && netProfit >= (federal.qbiMinimumQBIThreshold || 1000)
        && deduction < federal.qbiMinimumDeduction) {
      deduction = Math.min(federal.qbiMinimumDeduction, overallCap);
    }
    return deduction;
  }

  // Above threshold + phase-in range: SSTB fully denied; non-SSTB falls
  // back to W-2 wages / UBIA limit (which a sole proprietor with no
  // employees and no qualified property cannot meet → effectively $0).
  if (taxableIncomeBeforeQBI >= threshold + phaseInRange) {
    if (isSSTB) {
      // OBBBA $400 minimum still applies if eligible (active material participation).
      return federal.qbiMinimumDeduction
        && netProfit >= (federal.qbiMinimumQBIThreshold || 1000)
        ? Math.min(federal.qbiMinimumDeduction, overallCap)
        : 0;
    }
    // Non-SSTB above phase-in: solo proprietor with no W-2 wages → $0.
    return federal.qbiMinimumDeduction
      && netProfit >= (federal.qbiMinimumQBIThreshold || 1000)
      ? Math.min(federal.qbiMinimumDeduction, overallCap)
      : 0;
  }

  // Within the phase-in range: linear reduction.
  const phaseInPct = (taxableIncomeBeforeQBI - threshold) / phaseInRange;
  const fullDeduction = reducedQBI * federal.qbiDeductionRate;

  if (isSSTB) {
    // SSTB: percentage of QBI is reduced by phaseInPct (linear to zero).
    const allowed = fullDeduction * (1 - phaseInPct);
    let deduction = Math.min(allowed, overallCap);
    if (federal.qbiMinimumDeduction
        && netProfit >= (federal.qbiMinimumQBIThreshold || 1000)
        && deduction < federal.qbiMinimumDeduction) {
      deduction = Math.min(federal.qbiMinimumDeduction, overallCap);
    }
    return deduction;
  }

  // Non-SSTB: assume no W-2 wages / UBIA (typical solo proprietor),
  // so the W-2-wages-limit phase-in reduces the deduction linearly to $0.
  const allowed = fullDeduction * (1 - phaseInPct);
  let deduction = Math.min(allowed, overallCap);
  if (federal.qbiMinimumDeduction
      && netProfit >= (federal.qbiMinimumQBIThreshold || 1000)
      && deduction < federal.qbiMinimumDeduction) {
    deduction = Math.min(federal.qbiMinimumDeduction, overallCap);
  }
  return deduction;
}

/**
 * Full calculation: federal SE tax + federal income tax + state tax
 * @param {object} params
 * @param {number} params.netProfit - Net self-employment income (after business expenses)
 * @param {string} params.filingStatus - 'single', 'marriedJoint', 'marriedSeparate', 'headOfHousehold'
 * @param {number} [params.otherIncome=0] - W-2 or other non-SE income
 * @param {number} [params.deductions=0] - Additional itemized deductions above standard (0 = use standard)
 * @param {boolean} [params.isSenior=false] - Whether primary taxpayer is 65+
 * @param {boolean} [params.spouseIsSenior=false] - Whether spouse is 65+ (MFJ only); doubles senior deduction
 * @param {boolean} [params.isSSTB=false] - Whether the business is an SSTB
 * @param {number} [params.healthInsurance=0] - Self-employed health insurance premiums
 * @param {number} [params.retirementContrib=0] - SEP IRA / Solo 401(k) contributions
 * @param {number} [params.otherAboveLine=0] - Other above-the-line deductions (home office, student loan)
 * @returns {object} Complete tax breakdown
 */
function calculateAll(params, federal, state) {
  const {
    netProfit,
    filingStatus,
    otherIncome = 0,
    deductions = 0,
    isSenior = false,
    spouseIsSenior = false,
    isSSTB = false,
    healthInsurance = 0,
    retirementContrib = 0,
    otherAboveLine = 0,
  } = params;

  // Step 1: Self-employment tax (with W-2 wages affecting Add'l Medicare).
  const seTax = calculateSETax(netProfit, federal, filingStatus, otherIncome);

  // Step 2: Build federal taxable income.
  const totalIncome = Math.max(0, netProfit) + Math.max(0, otherIncome);
  const standardDeduction = federal.standardDeduction[filingStatus] || federal.standardDeduction.single;
  const deductionUsed = deductions > 0 ? deductions : standardDeduction;

  // Above-the-line deductions reduce AGI.
  // SE health insurance + SE retirement come from the user's accordion.
  const aboveLineDeductions = healthInsurance + retirementContrib + otherAboveLine + seTax.deductibleHalf;

  // Senior deduction (OBBBA §70103): $6,000 per qualifying senior, MFJ
  // doubles to $12,000 if both spouses qualify. Phases out at 6% above
  // $75K single / $150K MFJ AGI.
  let seniorDeduction = 0;
  if (isSenior && federal.seniorDeduction) {
    const seniorThreshold = (filingStatus === 'marriedJoint') ? 150000 : 75000;
    const seniorCount = (filingStatus === 'marriedJoint' && spouseIsSenior) ? 2 : 1;
    const baseDeduction = federal.seniorDeduction * seniorCount;
    if (totalIncome <= seniorThreshold) {
      seniorDeduction = baseDeduction;
    } else {
      seniorDeduction = Math.max(0, baseDeduction - (totalIncome - seniorThreshold) * 0.06);
    }
  }

  // QBI deduction. Per §199A, the QBI base is reduced by the deductible
  // part of SE tax, SE health insurance, and SE retirement contributions.
  // The QBI deduction itself is computed AFTER standard deduction (it's a
  // "below-the-line" deduction taken on top of the standard deduction).
  const qbiBase = Math.max(0,
    Math.max(0, netProfit) - seTax.deductibleHalf - healthInsurance - retirementContrib
  );
  const taxableIncomeBeforeQBI = Math.max(0,
    totalIncome - aboveLineDeductions - seniorDeduction - deductionUsed
  );
  const qbiDeduction = calculateQBI(
    netProfit,
    qbiBase,
    taxableIncomeBeforeQBI,
    filingStatus,
    federal,
    isSSTB,
  );

  const federalTaxableIncome = Math.max(0, taxableIncomeBeforeQBI - qbiDeduction);

  // Step 3: Federal income tax through brackets.
  const bracketKey = federal.brackets[filingStatus] ? filingStatus : 'single';
  const federalIncomeTax = calculateBracketTax(federalTaxableIncome, federal.brackets[bracketKey]);

  // Step 4: State income tax on TOTAL income (most states tax all sources).
  const stateTax = calculateStateTax(totalIncome, state, filingStatus);

  // Step 5: Totals.
  const totalFederalTax = seTax.total + federalIncomeTax.total;
  const totalTax = totalFederalTax + stateTax.total;
  const takeHome = totalIncome - totalTax;
  const effectiveRate = totalIncome > 0 ? totalTax / totalIncome : 0;
  const federalEffectiveRate = totalIncome > 0 ? totalFederalTax / totalIncome : 0;
  const quarterlyPayment = totalTax / 4;

  return {
    inputs: {
      netProfit,
      otherIncome,
      totalIncome,
      filingStatus,
      stateName: state.name,
      isSSTB,
    },
    selfEmploymentTax: seTax,
    federalIncomeTax: {
      taxableIncome: federalTaxableIncome,
      taxableIncomeBeforeQBI,
      standardDeduction: deductionUsed,
      halfSEDeduction: seTax.deductibleHalf,
      qbiDeduction,
      qbiBase,
      seniorDeduction,
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

if (typeof module !== 'undefined') module.exports = { calculateAll, calculateBracketTax, calculateSETax, calculateStateTax, calculateQBI };
