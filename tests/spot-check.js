/**
 * Comprehensive spot-check test suite for the IndieCalc tax calculator.
 *
 * Validates SE tax arithmetic, federal income tax brackets, state tax logic,
 * QBI deduction rules, senior deduction phase-out, and edge cases across
 * a wide matrix of income levels, filing statuses, and states.
 *
 * Usage: node tests/spot-check.js
 */

const { calculateAll, calculateBracketTax, calculateSETax, calculateStateTax, calculateQBI } = require('../src/calculator.js');
const { FEDERAL, STATES } = require('../src/tax-data.js');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const YEAR = '2026';
const federal = FEDERAL[YEAR];

const TOLERANCE = 0.015; // $0.015 tolerance for floating-point rounding

const INCOME_LEVELS = [
  0, 1000, 2000, 5000, 10000, 15000, 25000, 50000, 75000,
  100000, 150000, 184500, 191950, 200000, 250000, 400000,
  500000, 750000, 1000000,
];

const FILING_STATUSES = ['single', 'marriedJoint', 'marriedSeparate', 'headOfHousehold'];

const TEST_STATES = [
  'texas', 'florida', 'california', 'newYork', 'illinois',
  'ohio', 'newJersey', 'washington', 'georgia', 'northCarolina',
];

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------
let totalTests = 0;
let passCount = 0;
let failCount = 0;
const failures = [];

function assert(condition, message, details) {
  totalTests++;
  if (condition) {
    passCount++;
  } else {
    failCount++;
    failures.push({ message, ...details });
  }
}

function approxEqual(a, b, tol) {
  return Math.abs(a - b) <= (tol || TOLERANCE);
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function scenarioLabel(params, stateName) {
  return `$${params.netProfit.toLocaleString()} ${params.filingStatus} in ${stateName}` +
    (params.healthInsurance ? ` +health$${params.healthInsurance}` : '') +
    (params.retirementContrib ? ` +retire$${params.retirementContrib}` : '') +
    (params.isSenior ? ' (senior)' : '') +
    (params.isSSTB ? ' (SSTB)' : '');
}

// ---------------------------------------------------------------------------
// 1. Broad matrix: structural invariants
// ---------------------------------------------------------------------------
function runMatrixTests() {
  console.log('=== Matrix Tests: structural invariants ===\n');

  for (const income of INCOME_LEVELS) {
    for (const status of FILING_STATUSES) {
      for (const stateKey of TEST_STATES) {
        const state = STATES[stateKey];
        const params = { netProfit: income, filingStatus: status };
        const label = scenarioLabel(params, state.name);
        let result;

        try {
          result = calculateAll(params, federal, state);
        } catch (err) {
          assert(false, `CRASH: ${label}`, { error: err.message });
          continue;
        }

        const se = result.selfEmploymentTax;
        const fed = result.federalIncomeTax;
        const sum = result.summary;

        // --- All numbers finite ---
        const numericFields = [
          se.total, se.socialSecurity, se.medicare, se.additionalMedicare,
          se.deductibleHalf, se.taxableBase,
          fed.taxableIncome, fed.tax, fed.qbiDeduction, fed.seniorDeduction,
          sum.totalTax, sum.takeHome, sum.effectiveRate, sum.quarterlyPayment,
          sum.selfEmploymentTax, sum.federalIncomeTax, sum.stateTax,
          sum.federalEffectiveRate, sum.stateEffectiveRate, sum.monthlySetAside,
        ];
        for (const val of numericFields) {
          assert(isFiniteNumber(val), `Finite check failed: ${label}`, { value: val });
        }

        // --- SE tax components add up ---
        const seComponentSum = se.socialSecurity + se.medicare + se.additionalMedicare;
        assert(
          approxEqual(se.total, seComponentSum),
          `SE components don't add up: ${label}`,
          { expected: seComponentSum, actual: se.total }
        );

        // --- SS tax capped ---
        // SS base = min(seBase, ssWageBase), so max SS = ssWageBase * ssRate
        const ssCap = federal.ssWageBase * federal.ssRate;
        assert(
          se.socialSecurity <= ssCap + TOLERANCE,
          `SS exceeds cap: ${label}`,
          { ssTax: se.socialSecurity, cap: ssCap }
        );

        // --- Additional Medicare threshold ---
        const addMedThreshold = federal.additionalMedicareThreshold[status] || 200000;
        const seBase = Math.max(0, income) * federal.seNetFactor;
        if (seBase <= addMedThreshold) {
          assert(
            approxEqual(se.additionalMedicare, 0),
            `Additional Medicare should be 0 below threshold: ${label}`,
            { additionalMedicare: se.additionalMedicare, seBase, threshold: addMedThreshold }
          );
        }

        // --- Half-SE deduction = (SS + Medicare) / 2 ---
        const expectedHalfSE = (se.socialSecurity + se.medicare) / 2;
        assert(
          approxEqual(se.deductibleHalf, expectedHalfSE),
          `Half-SE deduction wrong: ${label}`,
          { expected: expectedHalfSE, actual: se.deductibleHalf }
        );

        // --- Federal taxable income non-negative ---
        assert(
          fed.taxableIncome >= 0,
          `Negative federal taxable income: ${label}`,
          { taxableIncome: fed.taxableIncome }
        );

        // --- Take-home = total income - total tax ---
        const expectedTakeHome = result.inputs.totalIncome - sum.totalTax;
        assert(
          approxEqual(sum.takeHome, expectedTakeHome),
          `Take-home mismatch: ${label}`,
          { expected: expectedTakeHome, actual: sum.takeHome }
        );

        // --- Effective rate = total tax / total income ---
        const expectedRate = result.inputs.totalIncome > 0
          ? sum.totalTax / result.inputs.totalIncome
          : 0;
        assert(
          approxEqual(sum.effectiveRate, expectedRate, 0.0001),
          `Effective rate mismatch: ${label}`,
          { expected: expectedRate, actual: sum.effectiveRate }
        );

        // --- State tax = 0 for no-income-tax states ---
        if (!state.hasIncomeTax) {
          assert(
            approxEqual(sum.stateTax, 0),
            `State tax should be $0: ${label}`,
            { stateTax: sum.stateTax }
          );
        }

        // --- Quarterly payment = total tax / 4 ---
        const expectedQuarterly = sum.totalTax / 4;
        assert(
          approxEqual(sum.quarterlyPayment, expectedQuarterly),
          `Quarterly payment mismatch: ${label}`,
          { expected: expectedQuarterly, actual: sum.quarterlyPayment }
        );

        // --- Total tax = SE + federal income + state ---
        const expectedTotal = sum.selfEmploymentTax + sum.federalIncomeTax + sum.stateTax;
        assert(
          approxEqual(sum.totalTax, expectedTotal),
          `Total tax breakdown mismatch: ${label}`,
          { expected: expectedTotal, actual: sum.totalTax }
        );

        // --- Effective rate between 0 and 1 (or exactly 0 for $0 income) ---
        if (income > 0) {
          assert(
            sum.effectiveRate >= 0 && sum.effectiveRate < 1,
            `Effective rate out of range: ${label}`,
            { effectiveRate: sum.effectiveRate }
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. QBI deduction tests
// ---------------------------------------------------------------------------
function runQBITests() {
  console.log('=== QBI Deduction Tests ===\n');
  const state = STATES.texas; // No state tax, simplifies checking

  // QBI enabled (default): 20% of net profit minus half-SE (when below threshold)
  for (const income of [10000, 50000, 100000, 150000]) {
    const params = { netProfit: income, filingStatus: 'single' };
    const result = calculateAll(params, federal, state);
    const se = result.selfEmploymentTax;
    const qbiBase = Math.max(0, income - se.deductibleHalf);
    const taxableBeforeQBI = result.federalIncomeTax.taxableIncomeBeforeQBI;

    if (taxableBeforeQBI <= federal.qbiThreshold.single) {
      const expected20 = qbiBase * 0.20;
      const overallCap = taxableBeforeQBI * 0.20;
      const expectedQBI = Math.min(expected20, overallCap);
      // Also check $400 minimum
      const finalExpected = (income >= 1000 && expectedQBI < 400)
        ? Math.min(400, overallCap)
        : expectedQBI;
      assert(
        approxEqual(result.federalIncomeTax.qbiDeduction, finalExpected, 1),
        `QBI deduction wrong for $${income} single`,
        { expected: finalExpected, actual: result.federalIncomeTax.qbiDeduction, qbiBase, overallCap }
      );
    }
  }

  // $2,000 income: should get $400 minimum QBI deduction
  {
    const params = { netProfit: 2000, filingStatus: 'single' };
    const result = calculateAll(params, federal, state);
    const qbi = result.federalIncomeTax.qbiDeduction;
    // At $2K income, 20% of QBI base is small, so minimum $400 should apply
    // (but capped by overall cap = taxableIncomeBeforeQBI * 0.20)
    const overallCap = result.federalIncomeTax.taxableIncomeBeforeQBI * 0.20;
    if (overallCap >= 400) {
      assert(
        qbi >= 400 - TOLERANCE,
        `$2K income should get $400 min QBI`,
        { actual: qbi }
      );
    } else {
      assert(
        approxEqual(qbi, overallCap, 1),
        `$2K income QBI capped at overall cap`,
        { actual: qbi, overallCap }
      );
    }
  }

  // $500 income: below $1,000 QBI minimum threshold, no minimum applies
  {
    const params = { netProfit: 500, filingStatus: 'single' };
    const result = calculateAll(params, federal, state);
    const qbi = result.federalIncomeTax.qbiDeduction;
    // 20% of a very small QBI base -- should NOT get $400 minimum
    const qbiBase = Math.max(0, 500 - result.selfEmploymentTax.deductibleHalf);
    const raw20 = qbiBase * 0.20;
    assert(
      qbi <= raw20 + TOLERANCE || approxEqual(qbi, 0),
      `$500 income should NOT get $400 minimum QBI`,
      { actual: qbi, raw20 }
    );
  }

  // $0 income: QBI should be 0
  {
    const params = { netProfit: 0, filingStatus: 'single' };
    const result = calculateAll(params, federal, state);
    assert(
      approxEqual(result.federalIncomeTax.qbiDeduction, 0),
      `$0 income QBI should be 0`,
      { actual: result.federalIncomeTax.qbiDeduction }
    );
  }

  // High income (above QBI threshold + phase-in): QBI should be $400 min or $0
  {
    const params = { netProfit: 500000, filingStatus: 'single' };
    const result = calculateAll(params, federal, state);
    const qbi = result.federalIncomeTax.qbiDeduction;
    // Above threshold + phaseInRange (201775 + 75000 = 276775), sole prop -> $400 min or $0
    assert(
      approxEqual(qbi, 400, 1) || approxEqual(qbi, 0),
      `$500K single QBI should be $400 min or $0`,
      { actual: qbi }
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Senior deduction tests
// ---------------------------------------------------------------------------
function runSeniorTests() {
  console.log('=== Senior Deduction Tests ===\n');
  const state = STATES.texas;

  // Single, $75K: at threshold, full $6,000 deduction
  {
    const params = { netProfit: 75000, filingStatus: 'single', isSenior: true };
    const result = calculateAll(params, federal, state);
    assert(
      approxEqual(result.federalIncomeTax.seniorDeduction, 6000, 1),
      `Senior deduction at $75K single should be $6,000`,
      { actual: result.federalIncomeTax.seniorDeduction }
    );
  }

  // Single, $150K: phase-out. $150K - $75K = $75K over threshold. 75000 * 0.06 = $4,500 reduction.
  // Deduction = $6,000 - $4,500 = $1,500
  {
    const params = { netProfit: 150000, filingStatus: 'single', isSenior: true };
    const result = calculateAll(params, federal, state);
    const expected = Math.max(0, 6000 - (150000 - 75000) * 0.06);
    assert(
      approxEqual(result.federalIncomeTax.seniorDeduction, expected, 1),
      `Senior deduction at $150K single should be $${expected}`,
      { expected, actual: result.federalIncomeTax.seniorDeduction }
    );
  }

  // Single, $175K: fully phased out. $175K - $75K = $100K * 0.06 = $6K reduction = $0
  {
    const params = { netProfit: 175000, filingStatus: 'single', isSenior: true };
    const result = calculateAll(params, federal, state);
    assert(
      approxEqual(result.federalIncomeTax.seniorDeduction, 0, 1),
      `Senior deduction at $175K single should be $0`,
      { actual: result.federalIncomeTax.seniorDeduction }
    );
  }

  // MFJ, $150K: at threshold, both seniors = $12,000
  {
    const params = { netProfit: 150000, filingStatus: 'marriedJoint', isSenior: true, spouseIsSenior: true };
    const result = calculateAll(params, federal, state);
    assert(
      approxEqual(result.federalIncomeTax.seniorDeduction, 12000, 1),
      `Senior deduction at $150K MFJ both seniors should be $12,000`,
      { actual: result.federalIncomeTax.seniorDeduction }
    );
  }

  // MFJ, $150K: only primary senior = $6,000
  {
    const params = { netProfit: 150000, filingStatus: 'marriedJoint', isSenior: true, spouseIsSenior: false };
    const result = calculateAll(params, federal, state);
    assert(
      approxEqual(result.federalIncomeTax.seniorDeduction, 6000, 1),
      `Senior deduction at $150K MFJ one senior should be $6,000`,
      { actual: result.federalIncomeTax.seniorDeduction }
    );
  }

  // Non-senior should get $0
  {
    const params = { netProfit: 75000, filingStatus: 'single', isSenior: false };
    const result = calculateAll(params, federal, state);
    assert(
      approxEqual(result.federalIncomeTax.seniorDeduction, 0),
      `Non-senior should get $0 senior deduction`,
      { actual: result.federalIncomeTax.seniorDeduction }
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Extra deductions (health insurance, retirement)
// ---------------------------------------------------------------------------
function runExtraDeductionTests() {
  console.log('=== Extra Deduction Tests ===\n');
  const state = STATES.texas;

  // Health insurance reduces QBI base and AGI
  {
    const base = calculateAll({ netProfit: 100000, filingStatus: 'single' }, federal, state);
    const withHealth = calculateAll({
      netProfit: 100000, filingStatus: 'single', healthInsurance: 12000,
    }, federal, state);

    // QBI base should be lower
    assert(
      withHealth.federalIncomeTax.qbiBase < base.federalIncomeTax.qbiBase,
      `Health insurance should reduce QBI base`,
      { baseQBI: base.federalIncomeTax.qbiBase, withHealthQBI: withHealth.federalIncomeTax.qbiBase }
    );

    // Federal taxable income should be lower
    assert(
      withHealth.federalIncomeTax.taxableIncome < base.federalIncomeTax.taxableIncome,
      `Health insurance should reduce taxable income`,
      { baseTI: base.federalIncomeTax.taxableIncome, withHealthTI: withHealth.federalIncomeTax.taxableIncome }
    );
  }

  // Retirement contribution reduces QBI base and AGI
  {
    const base = calculateAll({ netProfit: 100000, filingStatus: 'single' }, federal, state);
    const withRetire = calculateAll({
      netProfit: 100000, filingStatus: 'single', retirementContrib: 20000,
    }, federal, state);

    assert(
      withRetire.federalIncomeTax.qbiBase < base.federalIncomeTax.qbiBase,
      `Retirement should reduce QBI base`,
      { baseQBI: base.federalIncomeTax.qbiBase, withRetireQBI: withRetire.federalIncomeTax.qbiBase }
    );

    assert(
      withRetire.federalIncomeTax.taxableIncome < base.federalIncomeTax.taxableIncome,
      `Retirement should reduce taxable income`,
      { baseTI: base.federalIncomeTax.taxableIncome, withRetireTI: withRetire.federalIncomeTax.taxableIncome }
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Known-good specific scenarios
// ---------------------------------------------------------------------------
function runKnownGoodTests() {
  console.log('=== Known-Good Scenario Tests ===\n');

  // --- $100,000 single in Texas ---
  {
    const result = calculateAll(
      { netProfit: 100000, filingStatus: 'single' },
      federal, STATES.texas
    );
    const se = result.selfEmploymentTax;
    const seBase = 100000 * 0.9235; // 92,350

    // SE tax: 92350 * 0.153 = ~14,129.55
    const expectedSS = seBase * 0.124;
    const expectedMed = seBase * 0.029;
    const expectedSE = expectedSS + expectedMed; // No additional medicare (below $200K)

    assert(
      approxEqual(se.taxableBase, seBase, 0.01),
      `$100K TX: SE base should be $${seBase.toFixed(2)}`,
      { expected: seBase, actual: se.taxableBase }
    );
    assert(
      approxEqual(se.socialSecurity, expectedSS, 0.01),
      `$100K TX: SS tax should be ~$${expectedSS.toFixed(2)}`,
      { expected: expectedSS, actual: se.socialSecurity }
    );
    assert(
      approxEqual(se.medicare, expectedMed, 0.01),
      `$100K TX: Medicare should be ~$${expectedMed.toFixed(2)}`,
      { expected: expectedMed, actual: se.medicare }
    );
    assert(
      approxEqual(se.total, expectedSE, 0.10),
      `$100K TX: Total SE should be ~$${expectedSE.toFixed(2)}`,
      { expected: expectedSE, actual: se.total }
    );
    assert(
      approxEqual(se.additionalMedicare, 0),
      `$100K TX: No additional Medicare`,
      { actual: se.additionalMedicare }
    );

    // State tax should be $0
    assert(
      approxEqual(result.summary.stateTax, 0),
      `$100K TX: State tax should be $0`,
      { actual: result.summary.stateTax }
    );
  }

  // --- $184,500 single: SS should hit exactly the cap ---
  {
    const result = calculateAll(
      { netProfit: 184500, filingStatus: 'single' },
      federal, STATES.texas
    );
    const se = result.selfEmploymentTax;
    const seBase = 184500 * 0.9235; // 170,385.75
    // seBase > ssWageBase (184500), so SS is capped
    const expectedSSBase = Math.min(seBase, 184500);
    const expectedSS = expectedSSBase * 0.124;

    assert(
      approxEqual(se.socialSecurity, expectedSS, 0.01),
      `$184.5K: SS should be capped at wage base`,
      { expected: expectedSS, actual: se.socialSecurity }
    );
  }

  // --- $250,000 single: additional Medicare should kick in ---
  {
    const result = calculateAll(
      { netProfit: 250000, filingStatus: 'single' },
      federal, STATES.texas
    );
    const se = result.selfEmploymentTax;
    const seBase = 250000 * 0.9235; // 230,875
    const expectedAddMed = (seBase - 200000) * 0.009; // (230875 - 200000) * 0.009 = ~277.88

    assert(
      se.additionalMedicare > 0,
      `$250K single: Additional Medicare should be > 0`,
      { actual: se.additionalMedicare }
    );
    assert(
      approxEqual(se.additionalMedicare, expectedAddMed, 0.10),
      `$250K single: Additional Medicare should be ~$${expectedAddMed.toFixed(2)}`,
      { expected: expectedAddMed, actual: se.additionalMedicare }
    );
  }

  // --- $250,000 marriedJoint: additional Medicare should NOT kick in (threshold is $250K) ---
  {
    const result = calculateAll(
      { netProfit: 250000, filingStatus: 'marriedJoint' },
      federal, STATES.texas
    );
    const se = result.selfEmploymentTax;
    const seBase = 250000 * 0.9235; // 230,875
    // MFJ threshold is $250K, seBase is $230,875 < $250K
    assert(
      approxEqual(se.additionalMedicare, 0),
      `$250K MFJ: Additional Medicare should be $0 (seBase < $250K threshold)`,
      { actual: se.additionalMedicare, seBase }
    );
  }

  // --- $1,000,000 single: no crash (previous Infinity bug) ---
  {
    let crashed = false;
    let result;
    try {
      result = calculateAll(
        { netProfit: 1000000, filingStatus: 'single' },
        federal, STATES.california
      );
      // Also try JSON.stringify to catch Infinity serialization
      const json = JSON.stringify(result);
      assert(
        !json.includes('Infinity') && !json.includes('NaN'),
        `$1M CA: JSON should not contain Infinity or NaN`,
        { jsonSnippet: json.substring(0, 200) }
      );
    } catch (err) {
      crashed = true;
      assert(false, `$1M CA: CRASHED`, { error: err.message });
    }
    if (!crashed) {
      assert(
        result.summary.totalTax > 0,
        `$1M CA: Total tax should be > 0`,
        { totalTax: result.summary.totalTax }
      );
    }
  }

  // --- $0 income: all zeros ---
  {
    const result = calculateAll(
      { netProfit: 0, filingStatus: 'single' },
      federal, STATES.texas
    );
    assert(
      approxEqual(result.summary.totalTax, 0),
      `$0 income: Total tax should be $0`,
      { actual: result.summary.totalTax }
    );
    assert(
      approxEqual(result.selfEmploymentTax.total, 0),
      `$0 income: SE tax should be $0`,
      { actual: result.selfEmploymentTax.total }
    );
    assert(
      approxEqual(result.summary.takeHome, 0),
      `$0 income: Take-home should be $0`,
      { actual: result.summary.takeHome }
    );
    assert(
      approxEqual(result.summary.effectiveRate, 0),
      `$0 income: Effective rate should be 0`,
      { actual: result.summary.effectiveRate }
    );
  }

  // --- $2,000 single with QBI: $400 minimum ---
  {
    const result = calculateAll(
      { netProfit: 2000, filingStatus: 'single' },
      federal, STATES.texas
    );
    const qbi = result.federalIncomeTax.qbiDeduction;
    const overallCap = result.federalIncomeTax.taxableIncomeBeforeQBI * 0.20;
    // At $2K income, standard deduction ($16,100) wipes out all taxable income
    // so taxableIncomeBeforeQBI = 0, overallCap = 0, and QBI deduction = 0
    // because min($400, $0) = $0
    if (overallCap >= 400) {
      assert(qbi >= 400 - TOLERANCE, `$2K QBI should be >= $400`, { actual: qbi, overallCap });
    } else {
      // When taxable income before QBI is 0, the overall cap is 0, so QBI = 0
      assert(
        approxEqual(qbi, Math.min(400, overallCap), 1),
        `$2K QBI capped by overall taxable income cap`,
        { actual: qbi, overallCap }
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 6. State-specific tests
// ---------------------------------------------------------------------------
function runStateTests() {
  console.log('=== State-Specific Tests ===\n');

  // No-income-tax states
  for (const stateKey of ['texas', 'florida', 'washington']) {
    const result = calculateAll(
      { netProfit: 100000, filingStatus: 'single' },
      federal, STATES[stateKey]
    );
    assert(
      approxEqual(result.summary.stateTax, 0),
      `${STATES[stateKey].name} should have $0 state tax`,
      { actual: result.summary.stateTax }
    );
  }

  // Illinois flat tax: 4.95% on (income - personal exemption)
  {
    const income = 100000;
    const result = calculateAll(
      { netProfit: income, filingStatus: 'single' },
      federal, STATES.illinois
    );
    const taxableForState = Math.max(0, income - 2625); // personal exemption
    const expectedStateTax = taxableForState * 0.0495;
    assert(
      approxEqual(result.summary.stateTax, expectedStateTax, 1),
      `Illinois $100K: state tax should be ~$${expectedStateTax.toFixed(2)}`,
      { expected: expectedStateTax, actual: result.summary.stateTax }
    );
  }

  // Ohio flat rate with floor: 2.75% on income above $26,050
  {
    const income = 100000;
    const result = calculateAll(
      { netProfit: income, filingStatus: 'single' },
      federal, STATES.ohio
    );
    const expectedStateTax = Math.max(0, income - 26050) * 0.0275;
    assert(
      approxEqual(result.summary.stateTax, expectedStateTax, 1),
      `Ohio $100K: state tax should be ~$${expectedStateTax.toFixed(2)}`,
      { expected: expectedStateTax, actual: result.summary.stateTax }
    );
  }

  // Ohio below floor: $0 tax
  {
    const income = 20000;
    const result = calculateAll(
      { netProfit: income, filingStatus: 'single' },
      federal, STATES.ohio
    );
    assert(
      approxEqual(result.summary.stateTax, 0),
      `Ohio $20K: state tax should be $0 (below floor)`,
      { actual: result.summary.stateTax }
    );
  }

  // Georgia flat tax with standard deduction
  {
    const income = 100000;
    const result = calculateAll(
      { netProfit: income, filingStatus: 'single' },
      federal, STATES.georgia
    );
    const taxableForState = Math.max(0, income - 12000); // standard deduction single
    const expectedStateTax = taxableForState * 0.0519;
    assert(
      approxEqual(result.summary.stateTax, expectedStateTax, 1),
      `Georgia $100K: state tax should be ~$${expectedStateTax.toFixed(2)}`,
      { expected: expectedStateTax, actual: result.summary.stateTax }
    );
  }

  // North Carolina flat tax with standard deduction
  {
    const income = 100000;
    const result = calculateAll(
      { netProfit: income, filingStatus: 'single' },
      federal, STATES.northCarolina
    );
    const taxableForState = Math.max(0, income - 12750);
    const expectedStateTax = taxableForState * 0.0399;
    assert(
      approxEqual(result.summary.stateTax, expectedStateTax, 1),
      `NC $100K: state tax should be ~$${expectedStateTax.toFixed(2)}`,
      { expected: expectedStateTax, actual: result.summary.stateTax }
    );
  }

  // California: should include SDI on top of bracket tax
  {
    const income = 100000;
    const result = calculateAll(
      { netProfit: income, filingStatus: 'single' },
      federal, STATES.california
    );
    // SDI at 1.3% on full income
    const sdi = income * 0.013;
    assert(
      result.summary.stateTax > sdi,
      `CA $100K: state tax should be > SDI alone ($${sdi})`,
      { stateTax: result.summary.stateTax, sdiMinimum: sdi }
    );
    // State tax should be substantial for CA
    assert(
      result.summary.stateTax > 2000,
      `CA $100K: state tax should be > $2,000`,
      { actual: result.summary.stateTax }
    );
  }
}

// ---------------------------------------------------------------------------
// 7. Federal bracket tax sanity checks
// ---------------------------------------------------------------------------
function runBracketTests() {
  console.log('=== Federal Bracket Tests ===\n');

  // Manual calculation for single $50,000 taxable income
  {
    const brackets = federal.brackets.single;
    const taxableIncome = 50000;
    // 10% on 0-12400 = 1,240
    // 12% on 12400-50000 = 37600 * 0.12 = 4,512
    const expected = 12400 * 0.10 + (50000 - 12400) * 0.12;
    const result = calculateBracketTax(taxableIncome, brackets);
    assert(
      approxEqual(result.total, expected, 0.01),
      `Bracket tax on $50K single should be $${expected.toFixed(2)}`,
      { expected, actual: result.total }
    );
  }

  // $0 taxable income: $0 tax
  {
    const result = calculateBracketTax(0, federal.brackets.single);
    assert(
      approxEqual(result.total, 0),
      `Bracket tax on $0 should be $0`,
      { actual: result.total }
    );
  }

  // Very high income: hits all brackets
  {
    const result = calculateBracketTax(1000000, federal.brackets.single);
    assert(
      result.total > 0 && isFiniteNumber(result.total),
      `Bracket tax on $1M should be positive and finite`,
      { actual: result.total }
    );
    // Breakdown should have entries
    assert(
      result.breakdown.length > 0,
      `Bracket tax on $1M should have breakdown entries`,
      { breakdownLength: result.breakdown.length }
    );
  }
}

// ---------------------------------------------------------------------------
// 8. SE tax edge cases
// ---------------------------------------------------------------------------
function runSETaxEdgeCases() {
  console.log('=== SE Tax Edge Cases ===\n');

  // Negative income: should return all zeros
  {
    const result = calculateSETax(-50000, federal, 'single', 0);
    assert(
      approxEqual(result.total, 0),
      `Negative income SE tax should be $0`,
      { actual: result.total }
    );
    assert(
      approxEqual(result.socialSecurity, 0),
      `Negative income SS should be $0`,
      { actual: result.socialSecurity }
    );
  }

  // Exactly at SS wage base: SS = wageBase * seNetFactor * ssRate (seBase < wageBase, so not capped)
  {
    // At $184,500 net profit, seBase = 184500 * 0.9235 = 170,385.75
    // This is BELOW the wage base of $184,500, so SS is NOT capped
    const result = calculateSETax(184500, federal, 'single', 0);
    const seBase = 184500 * 0.9235;
    const expectedSS = seBase * 0.124; // seBase < wageBase
    assert(
      approxEqual(result.socialSecurity, expectedSS, 0.01),
      `$184.5K SE: SS should be $${expectedSS.toFixed(2)}`,
      { expected: expectedSS, actual: result.socialSecurity }
    );
  }

  // Income well above SS wage base: SS capped at wageBase * ssRate
  {
    const result = calculateSETax(500000, federal, 'single', 0);
    const ssCap = federal.ssWageBase * federal.ssRate; // 184500 * 0.124 = 22878
    assert(
      approxEqual(result.socialSecurity, ssCap, 0.01),
      `$500K SE: SS should be capped at $${ssCap.toFixed(2)}`,
      { expected: ssCap, actual: result.socialSecurity }
    );
  }

  // Additional Medicare with W-2 wages reducing threshold
  {
    // Single, $150K SE + $100K W-2 wages.
    // Threshold = $200K, reduced by $100K W-2 = $100K effective threshold.
    // seBase = 150000 * 0.9235 = 138,525
    // Additional Medicare = (138525 - 100000) * 0.009 = $346.73
    const result = calculateSETax(150000, federal, 'single', 100000);
    const seBase = 150000 * 0.9235;
    const effectiveThreshold = 200000 - 100000;
    const expectedAddMed = (seBase - effectiveThreshold) * 0.009;
    assert(
      approxEqual(result.additionalMedicare, expectedAddMed, 0.01),
      `$150K SE + $100K W-2: Additional Medicare should be ~$${expectedAddMed.toFixed(2)}`,
      { expected: expectedAddMed, actual: result.additionalMedicare }
    );
  }
}

// ---------------------------------------------------------------------------
// 9. All 50 states + DC smoke test
// ---------------------------------------------------------------------------
function runAllStatesSmoke() {
  console.log('=== All States Smoke Test ===\n');

  for (const [stateKey, state] of Object.entries(STATES)) {
    for (const income of [0, 50000, 200000]) {
      for (const status of ['single', 'marriedJoint']) {
        const label = `$${income.toLocaleString()} ${status} in ${state.name}`;
        try {
          const result = calculateAll(
            { netProfit: income, filingStatus: status },
            federal, state
          );
          assert(
            isFiniteNumber(result.summary.totalTax),
            `Finite total tax: ${label}`,
            { totalTax: result.summary.totalTax }
          );
          assert(
            result.summary.totalTax >= 0,
            `Non-negative total tax: ${label}`,
            { totalTax: result.summary.totalTax }
          );
          // JSON serialization check (catches Infinity)
          const json = JSON.stringify(result);
          assert(
            !json.includes('Infinity') && !json.includes('NaN'),
            `No Infinity/NaN in JSON: ${label}`,
            {}
          );
        } catch (err) {
          assert(false, `CRASH: ${label}`, { error: err.message });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Run everything
// ---------------------------------------------------------------------------
console.log('============================================================');
console.log('  IndieCalc Tax Calculator — Comprehensive Spot-Check Suite');
console.log('============================================================\n');

runMatrixTests();
runQBITests();
runSeniorTests();
runExtraDeductionTests();
runBracketTests();
runSETaxEdgeCases();
runStateTests();
runKnownGoodTests();
runAllStatesSmoke();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('  RESULTS');
console.log('============================================================\n');
console.log(`  Total assertions: ${totalTests}`);
console.log(`  PASSED:           ${passCount}`);
console.log(`  FAILED:           ${failCount}`);
console.log('');

if (failures.length > 0) {
  console.log('--- FAILURES ---\n');
  for (const f of failures) {
    console.log(`  FAIL: ${f.message}`);
    const { message, ...rest } = f;
    if (Object.keys(rest).length > 0) {
      console.log(`        ${JSON.stringify(rest)}`);
    }
    console.log('');
  }
} else {
  console.log('  All tests passed!\n');
}

console.log('============================================================');
process.exit(failCount > 0 ? 1 : 0);
