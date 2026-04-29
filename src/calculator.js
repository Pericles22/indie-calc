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
 *
 * @param {number} netProfit - SE net profit
 * @param {object} federal - Federal tax data
 * @param {string} filingStatus - Filing status
 * @param {number} otherIncome - Non-SE income (W-2 + investment)
 * @param {number} [investmentIncome=0] - Subset of otherIncome that is portfolio
 *   (interest, dividends, gains, rental, royalties). NOT W-2 wages, so it does
 *   NOT reduce the Add'l Medicare threshold per Form 8959.
 */
function calculateSETax(netProfit, federal, filingStatus, otherIncome, investmentIncome) {
  // Floor SE earnings at $0 — losses don't generate negative SE tax.
  const seBase = Math.max(0, netProfit) * federal.seNetFactor;

  // Social Security (capped at wage base)
  const ssBase = Math.min(seBase, federal.ssWageBase);
  const socialSecurity = ssBase * federal.ssRate;

  // Medicare (no cap)
  const medicare = seBase * federal.medicareRate;

  // Additional Medicare: threshold reduced by W-2 WAGES only (Form 8959 line 7).
  // Investment income / portfolio income is NOT W-2 wages, so it does not
  // reduce the threshold for the SE share of Add'l Medicare.
  const baseThreshold = federal.additionalMedicareThreshold[filingStatus] || 200000;
  const w2Wages = Math.max(0, (otherIncome || 0) - Math.max(0, investmentIncome || 0));
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
 *
 * NOTE on federal AGI conformity: most states start their income tax
 * computation from federal AGI (which already subtracts the deductible
 * half-SE, SE health insurance, SE retirement, etc.). This engine
 * approximates that for states with `subtractsHalfSE: true` only — for
 * states that conform but lack the flag, state tax may be slightly
 * overstated. Tracked as a known refinement.
 *
 * @param {number} totalIncome - Total income (SE + other)
 * @param {object} state - State data from STATES
 * @param {string} filingStatus - Filing status
 * @param {string} [locality] - Optional locality key: 'nyc', 'yonkers', 'ohioMunicipal', or null
 * @param {number} [halfSEDeduction=0] - Deductible half-SE tax (subtracted for CA et al.)
 */
function calculateStateTax(totalIncome, state, filingStatus, locality, halfSEDeduction) {
  if (!state.hasIncomeTax) {
    return { total: 0, stateOnly: 0, localityTax: 0, locality: null, effectiveRate: 0, notes: state.notes };
  }

  // Apply state-level above-the-line subtractions before brackets, where
  // the state conforms to the federal half-SE deduction.
  const halfSE = state.subtractsHalfSE ? Math.max(0, halfSEDeduction || 0) : 0;
  let taxableIncome = Math.max(0, totalIncome - halfSE);

  // Apply standard deduction if available
  if (state.standardDeduction) {
    const deduction = state.standardDeduction[filingStatus] || state.standardDeduction.single;
    taxableIncome = Math.max(0, taxableIncome - deduction);
  }

  // Apply personal exemption if available
  if (state.personalExemption) {
    taxableIncome = Math.max(0, taxableIncome - state.personalExemption);
  }

  let stateOnly = 0;

  if (state.flatRate) {
    if (state.flatRateFloor) {
      // Ohio-style: flat rate only on income above floor
      stateOnly = Math.max(0, taxableIncome - state.flatRateFloor) * state.flatRate;
    } else {
      stateOnly = taxableIncome * state.flatRate;
    }
  } else if (state.brackets) {
    const bracketKey = state.brackets[filingStatus] ? filingStatus : 'single';
    const result = calculateBracketTax(taxableIncome, state.brackets[bracketKey]);
    stateOnly = result.total;
  }

  // California SDI (now uncapped per SB 951; applied to SE income only,
  // since SDI on W-2 wages is withheld by the employer separately).
  if (state.sdiRate) {
    const sdiBase = Math.min(Math.max(0, totalIncome), state.sdiWageCap || Infinity);
    stateOnly += sdiBase * state.sdiRate;
  }

  // Optional locality tax. Modeled as a flat rate × taxable state income
  // (post-state-deductions), which is a reasonable approximation for NYC,
  // Yonkers, and most Ohio municipal income taxes.
  let localityTax = 0;
  let localityName = null;
  if (locality && state.localities && state.localities[locality]) {
    const loc = state.localities[locality];
    localityName = loc.name || locality;
    if (loc.flatRate) {
      // For NYC, the city tax has its own brackets, but a flat-rate average works for an estimator.
      localityTax = Math.max(0, taxableIncome) * loc.flatRate;
    } else if (loc.brackets) {
      const lkey = loc.brackets[filingStatus] ? filingStatus : 'single';
      localityTax = calculateBracketTax(Math.max(0, taxableIncome), loc.brackets[lkey]).total;
    } else if (loc.surchargeOfStateTax) {
      // Yonkers: surcharge on state tax liability (16.75% historically).
      localityTax = stateOnly * loc.surchargeOfStateTax;
    }
  }

  const total = stateOnly + localityTax;
  const effectiveRate = totalIncome > 0 ? total / totalIncome : 0;

  return { total, stateOnly, localityTax, locality: localityName, effectiveRate, notes: state.notes };
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
 * @param {number} [params.propertyTax=0] - Real estate / personal property tax paid (counts toward SALT)
 * @param {number} [params.otherItemized=0] - Other itemized deductions: mortgage interest, charitable
 *   contributions, medical expenses above 7.5% AGI floor, etc. (DOES NOT include SALT — that's auto-computed)
 * @param {boolean} [params.isSenior=false] - Whether primary taxpayer is 65+
 * @param {boolean} [params.spouseIsSenior=false] - Whether spouse is 65+ (MFJ only); doubles senior deduction
 * @param {boolean} [params.isSSTB=false] - Whether the business is an SSTB
 * @param {number} [params.healthInsurance=0] - Self-employed health insurance premiums
 * @param {number} [params.retirementContrib=0] - SEP IRA / Solo 401(k) contributions
 * @param {number} [params.otherAboveLine=0] - Other above-the-line deductions (home office, student loan)
 * @returns {object} Complete tax breakdown
 *
 * Edge cases considered for SALT itemization:
 *   - Min: TX/FL freelancer, no state tax, no property → standard always wins
 *   - Boundary: $200K MFJ in CA, ~$15K state tax + $5K property → SALT $20K < $32,200 standard → standard wins
 *   - Max: $500K single in CA, ~$45K state tax + $20K property → SALT capped at $40,400 → itemize
 *   - State tax already includes CA SDI etc., which qualifies as state income tax under IRC §164
 */
function calculateAll(params, federal, state) {
  const {
    netProfit,
    filingStatus,
    otherIncome = 0,
    investmentIncome = 0,
    qualifiedTips = 0,
    propertyTax = 0,
    otherItemized = 0,
    locality = null,
    isSenior = false,
    spouseIsSenior = false,
    isSSTB = false,
    healthInsurance = 0,
    retirementContrib = 0,
    otherAboveLine = 0,
  } = params;

  // Step 1: Self-employment tax (with W-2 wages affecting Add'l Medicare).
  const seTax = calculateSETax(netProfit, federal, filingStatus, otherIncome, investmentIncome);

  // Step 2: State tax (computed early so it can flow into SALT itemization).
  // Pass half-SE so states with subtractsHalfSE=true (e.g. CA conformity) can subtract it.
  const stateTax = calculateStateTax(
    Math.max(0, netProfit) + Math.max(0, otherIncome),
    state,
    filingStatus,
    locality,
    seTax.deductibleHalf,
  );

  // Step 3: Build federal taxable income with itemized-vs-standard choice.
  const totalIncome = Math.max(0, netProfit) + Math.max(0, otherIncome);
  const standardDeduction = federal.standardDeduction[filingStatus] || federal.standardDeduction.single;

  // SALT deduction (OBBBA §70120: $40,400 cap for 2026, up from $10,000).
  // Per IRC §164(b)(5), state income tax + state/local property tax + (sales tax in lieu of income tax)
  // are aggregated and capped. Mandatory employee contributions to state disability/PFL programs
  // (e.g., CA SDI) are treated as deductible state income tax. Our state tax engine already includes SDI.
  const saltCap = federal.saltCap || 10000;
  const saltUncapped = stateTax.total + Math.max(0, propertyTax);
  const saltDeduction = Math.min(saltUncapped, saltCap);
  const itemizedTotal = saltDeduction + Math.max(0, otherItemized);
  const usedItemized = itemizedTotal > standardDeduction;
  const deductionUsed = Math.max(itemizedTotal, standardDeduction);

  // OBBBA §70201 "No Tax on Tips": up to $25,000 of qualified tip income is
  // exempt from federal income tax (NOT from SE tax / FICA — Social Security and
  // Medicare still apply). Treated here as an above-the-line deduction so it
  // reduces AGI and therefore federal income tax base, but leaves SE tax intact.
  const tipExemptionCap = federal.tipExemption || 0;
  const tipExemption = Math.min(Math.max(0, qualifiedTips), tipExemptionCap);

  // Above-the-line deductions reduce AGI.
  // SE health insurance + SE retirement come from the user's accordion.
  const aboveLineDeductions = healthInsurance + retirementContrib + otherAboveLine + seTax.deductibleHalf + tipExemption;

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

  // Step 4: Federal income tax through brackets.
  const bracketKey = federal.brackets[filingStatus] ? filingStatus : 'single';
  const federalIncomeTax = calculateBracketTax(federalTaxableIncome, federal.brackets[bracketKey]);

  // Step 4a: NIIT (§1411) — 3.8% on the lesser of net investment income or
  // MAGI excess over threshold. SE income is earned, not investment, so it's
  // not subject to NIIT directly — but portfolio income (interest, dividends,
  // capital gains, rental, royalties) is.
  //
  // Convention: callers include investment income inside `otherIncome` (so
  // brackets tax it at ordinary rates) AND pass `investmentIncome` to flag
  // the NIIT-eligible subset.
  //
  // MAGI for NIIT ≈ AGI for most freelancers (no §911 foreign earned-income
  // add-back). AGI = totalIncome - aboveLineDeductions. The senior deduction
  // and standard/itemized deductions are below-the-line and do NOT reduce
  // MAGI, so we exclude them.
  let niitTax = 0;
  if (federal.niitRate && investmentIncome > 0) {
    const niitThreshold = (federal.niitThreshold && federal.niitThreshold[filingStatus]) || 200000;
    const magi = Math.max(0, totalIncome - aboveLineDeductions);
    const magiExcess = Math.max(0, magi - niitThreshold);
    const niitBase = Math.min(Math.max(0, investmentIncome), magiExcess);
    niitTax = niitBase * federal.niitRate;
  }

  // Step 5: Totals.
  const totalFederalTax = seTax.total + federalIncomeTax.total + niitTax;
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
      // standardDeduction kept for backward compat — this is the deduction actually used,
      // which is the larger of standard or itemized. Use deductionUsed/usedItemized for clarity.
      standardDeduction: deductionUsed,
      deductionUsed,
      standardDeductionAmount: standardDeduction,
      itemizedDeduction: itemizedTotal,
      saltDeduction,
      saltUncapped,
      saltCap,
      usedItemized,
      tipExemption,
      halfSEDeduction: seTax.deductibleHalf,
      qbiDeduction,
      qbiBase,
      seniorDeduction,
      tax: federalIncomeTax.total,
      breakdown: federalIncomeTax.breakdown,
    },
    stateTax,
    niit: { tax: niitTax, investmentIncome: Math.max(0, investmentIncome) },
    summary: {
      selfEmploymentTax: seTax.total,
      federalIncomeTax: federalIncomeTax.total,
      niit: niitTax,
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
