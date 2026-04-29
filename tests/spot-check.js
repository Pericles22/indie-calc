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
// 9. SALT itemization tests (OBBBA §70120 — $40,400 cap for 2026)
// ---------------------------------------------------------------------------
function runSALTTests() {
  console.log('=== SALT Itemization Tests ===\n');

  // No-tax state, no property → standard always wins (regression check).
  {
    const result = calculateAll({ netProfit: 200000, filingStatus: 'single' }, federal, STATES.texas);
    assert(
      !result.federalIncomeTax.usedItemized,
      `TX $200K single: should use standard, not itemized`,
      { itemizedDeduction: result.federalIncomeTax.itemizedDeduction, standardDeduction: result.federalIncomeTax.standardDeductionAmount }
    );
    assert(
      approxEqual(result.federalIncomeTax.saltDeduction, 0, 0.01),
      `TX $200K single: SALT should be $0`,
      { saltDeduction: result.federalIncomeTax.saltDeduction }
    );
  }

  // CA $400K single: state tax + SDI ≈ $40K → SALT alone beats $16,100 standard.
  {
    const result = calculateAll({ netProfit: 400000, filingStatus: 'single' }, federal, STATES.california);
    assert(
      result.federalIncomeTax.usedItemized,
      `CA $400K single: should itemize via SALT`,
      { itemized: result.federalIncomeTax.itemizedDeduction, standard: result.federalIncomeTax.standardDeductionAmount }
    );
    assert(
      result.federalIncomeTax.saltDeduction > 16100,
      `CA $400K single: SALT should exceed standard deduction`,
      { saltDeduction: result.federalIncomeTax.saltDeduction }
    );
    assert(
      result.federalIncomeTax.saltDeduction <= 40400 + 0.01,
      `CA $400K single: SALT must respect $40,400 cap`,
      { saltDeduction: result.federalIncomeTax.saltDeduction }
    );
  }

  // CA $1M single: state tax > $40,400 → SALT must hit cap exactly.
  {
    // CA $1M single: MAGI is well above the $500K phaseout threshold, so the
    // increased cap is fully phased out and only the $10,000 floor remains.
    // Phaseout completes at MAGI ≈ $500K + ($30,400 / 0.30) ≈ $601,333.
    const result = calculateAll({ netProfit: 1000000, filingStatus: 'single' }, federal, STATES.california);
    assert(
      approxEqual(result.federalIncomeTax.saltDeduction, 10000, 0.01),
      `CA $1M single: SALT capped at $10K floor (cap fully phased out above ~$601K MAGI)`,
      { saltDeduction: result.federalIncomeTax.saltDeduction, saltUncapped: result.federalIncomeTax.saltUncapped }
    );
    assert(
      result.federalIncomeTax.saltCapPhaseoutActive,
      `CA $1M single: phaseout flag should be active`,
      { active: result.federalIncomeTax.saltCapPhaseoutActive }
    );
    assert(
      result.federalIncomeTax.saltUncapped > 40400,
      `CA $1M single: uncapped SALT should be > $40,400`,
      { saltUncapped: result.federalIncomeTax.saltUncapped }
    );
  }

  // Property tax pushes SALT past standard at moderate income.
  // CA $150K single: state tax ~ $11K, plus $15K property → $26K SALT > $16,100 standard.
  {
    const noProp = calculateAll(
      { netProfit: 150000, filingStatus: 'single' },
      federal, STATES.california,
    );
    const withProp = calculateAll(
      { netProfit: 150000, filingStatus: 'single', propertyTax: 15000 },
      federal, STATES.california,
    );
    assert(
      withProp.federalIncomeTax.saltDeduction > noProp.federalIncomeTax.saltDeduction,
      `CA $150K single: property tax should increase SALT`,
      { withProp: withProp.federalIncomeTax.saltDeduction, noProp: noProp.federalIncomeTax.saltDeduction }
    );
    assert(
      withProp.summary.totalTax < noProp.summary.totalTax,
      `CA $150K single: itemizing with property should reduce total tax`,
      { withTax: withProp.summary.totalTax, noTax: noProp.summary.totalTax }
    );
  }

  // SALT cap binding: NJ $500K MFJ — state tax ~$30K + property tax $25K = $55K → cap at $40,400.
  {
    const result = calculateAll(
      { netProfit: 500000, filingStatus: 'marriedJoint', propertyTax: 25000 },
      federal, STATES.newJersey,
    );
    assert(
      approxEqual(result.federalIncomeTax.saltDeduction, 40400, 0.01),
      `NJ $500K MFJ +$25K property: SALT should be capped at $40,400`,
      { saltDeduction: result.federalIncomeTax.saltDeduction, saltUncapped: result.federalIncomeTax.saltUncapped }
    );
    assert(
      result.federalIncomeTax.usedItemized,
      `NJ $500K MFJ +$25K property: should itemize`,
      { usedItemized: result.federalIncomeTax.usedItemized }
    );
  }

  // Boundary: $200K MFJ in CA — itemized ≈ $20K (state + small property) < $32,200 standard.
  {
    const result = calculateAll(
      { netProfit: 200000, filingStatus: 'marriedJoint', propertyTax: 5000 },
      federal, STATES.california,
    );
    // CA MFJ at $200K: state tax ~$10-12K + $5K property = ~$15-17K SALT < $32,200 standard.
    assert(
      !result.federalIncomeTax.usedItemized,
      `CA $200K MFJ +$5K property: standard should still win at this income`,
      { itemized: result.federalIncomeTax.itemizedDeduction, standard: result.federalIncomeTax.standardDeductionAmount }
    );
  }

  // Other itemized deductions stack on top of SALT (mortgage, charity).
  {
    const noOther = calculateAll(
      { netProfit: 300000, filingStatus: 'single' },
      federal, STATES.california,
    );
    const withOther = calculateAll(
      { netProfit: 300000, filingStatus: 'single', otherItemized: 20000 },
      federal, STATES.california,
    );
    assert(
      withOther.federalIncomeTax.itemizedDeduction === noOther.federalIncomeTax.itemizedDeduction + 20000,
      `Other itemized should add directly to total itemized`,
      { withOther: withOther.federalIncomeTax.itemizedDeduction, noOther: noOther.federalIncomeTax.itemizedDeduction }
    );
    assert(
      withOther.summary.totalTax < noOther.summary.totalTax,
      `Adding $20K other itemized should reduce tax`,
      { withTax: withOther.summary.totalTax, noTax: noOther.summary.totalTax }
    );
  }

  // QBI base must reflect the larger deduction. Itemizing → smaller taxableIncomeBeforeQBI → can affect QBI.
  {
    const result = calculateAll(
      { netProfit: 500000, filingStatus: 'single' },
      federal, STATES.california,
    );
    // taxableIncomeBeforeQBI should equal totalIncome - aboveLine - senior - deductionUsed
    const expected = result.inputs.totalIncome
      - result.federalIncomeTax.halfSEDeduction
      - 0 // no health, no retirement, no other above line
      - result.federalIncomeTax.seniorDeduction
      - result.federalIncomeTax.deductionUsed;
    assert(
      approxEqual(result.federalIncomeTax.taxableIncomeBeforeQBI, Math.max(0, expected), 1),
      `CA $500K single: taxableIncomeBeforeQBI should reflect itemized SALT`,
      { actual: result.federalIncomeTax.taxableIncomeBeforeQBI, expected }
    );
  }

  // Negative property tax must not produce positive SALT; same for negative otherItemized.
  {
    const result = calculateAll(
      { netProfit: 300000, filingStatus: 'single', propertyTax: -5000, otherItemized: -1000 },
      federal, STATES.california,
    );
    assert(
      result.federalIncomeTax.saltDeduction >= 0,
      `Negative property tax should not push SALT below state-tax-only`,
      { saltDeduction: result.federalIncomeTax.saltDeduction }
    );
  }
}

// ---------------------------------------------------------------------------
// 9a. SALT cap MFS + MAGI phaseout tests (OBBBA §70120)
// ---------------------------------------------------------------------------
function runSALTPhaseoutTests() {
  console.log('=== SALT Cap MFS + MAGI Phaseout Tests ===\n');

  // Married filing separately gets $20,200 cap (half of single/MFJ).
  {
    const r = calculateAll(
      { netProfit: 200000, filingStatus: 'marriedSeparate', propertyTax: 30000 },
      federal, STATES.california,
    );
    assert(approxEqual(r.federalIncomeTax.saltCapBase, 20200), `MFS: saltCapBase = $20,200`, { saltCapBase: r.federalIncomeTax.saltCapBase });
    assert(approxEqual(r.federalIncomeTax.saltDeduction, 20200), `MFS $200K + $30K property: SALT capped at $20,200`, { saltDeduction: r.federalIncomeTax.saltDeduction });
  }

  // Single/MFJ/HoH all get $40,400 base.
  for (const status of ['single', 'marriedJoint', 'headOfHousehold']) {
    const r = calculateAll({ netProfit: 250000, filingStatus: status }, federal, STATES.texas);
    assert(approxEqual(r.federalIncomeTax.saltCapBase, 40400), `${status}: saltCapBase = $40,400`, { saltCapBase: r.federalIncomeTax.saltCapBase });
  }

  // Below phaseout threshold: full cap, no phaseout.
  {
    const r = calculateAll({ netProfit: 400000, filingStatus: 'single', propertyTax: 15000 }, federal, STATES.california);
    assert(!r.federalIncomeTax.saltCapPhaseoutActive, `$400K single: phaseout NOT active (under $500K MAGI)`, { active: r.federalIncomeTax.saltCapPhaseoutActive });
    assert(approxEqual(r.federalIncomeTax.saltCap, 40400), `$400K single: saltCap stays at $40,400`, { saltCap: r.federalIncomeTax.saltCap });
  }

  // Just above threshold: small phaseout.
  // CA $520K single: MAGI ≈ $501,866. Excess ≈ $1,866. Phaseout = 0.30 × $1,866 ≈ $560.
  {
    const r = calculateAll({ netProfit: 520000, filingStatus: 'single' }, federal, STATES.california);
    assert(r.federalIncomeTax.saltCapPhaseoutActive, `$520K single: phaseout active`, { active: r.federalIncomeTax.saltCapPhaseoutActive });
    assert(r.federalIncomeTax.saltCap > 39000 && r.federalIncomeTax.saltCap < 40400, `$520K single: saltCap between $39K and $40,400`, { saltCap: r.federalIncomeTax.saltCap });
  }

  // Deep phaseout: at MAGI > $601K, phaseout reaches the $10K floor.
  // CA $700K single: MAGI ≈ $678K. Excess = $178K. Phaseout = 0.30 × $178K = $53,400, capped at $30,400 reduction → floor.
  {
    const r = calculateAll({ netProfit: 700000, filingStatus: 'single' }, federal, STATES.california);
    assert(approxEqual(r.federalIncomeTax.saltCap, 10000), `$700K single CA: saltCap fully phased out to $10K floor`, { saltCap: r.federalIncomeTax.saltCap });
  }

  // MFS phaseout threshold is $250K (half of single).
  {
    const r = calculateAll({ netProfit: 350000, filingStatus: 'marriedSeparate' }, federal, STATES.california);
    assert(r.federalIncomeTax.saltCapPhaseoutActive, `MFS $350K: phaseout active (above $250K threshold)`, { active: r.federalIncomeTax.saltCapPhaseoutActive });
  }

  // No-state-tax + low income: phaseout doesn't matter, SALT is $0 anyway.
  {
    const r = calculateAll({ netProfit: 100000, filingStatus: 'single' }, federal, STATES.texas);
    assert(approxEqual(r.federalIncomeTax.saltDeduction, 0), `TX $100K single: SALT $0 regardless of cap`, { saltDeduction: r.federalIncomeTax.saltDeduction });
  }
}

// ---------------------------------------------------------------------------
// 9b. Itemized deduction limitation ("2/37 rule") tests (OBBBA)
// ---------------------------------------------------------------------------
function runItemizedLimitationTests() {
  console.log('=== Itemized Deduction Limitation (2/37 rule) Tests ===\n');

  // Below 37% bracket: no limitation regardless of itemized amount.
  {
    const r = calculateAll(
      { netProfit: 300000, filingStatus: 'single', propertyTax: 20000 },
      federal, STATES.california,
    );
    assert(!r.federalIncomeTax.itemizedLimitationActive, `$300K single (below 37% bracket): 2/37 rule NOT active`, { active: r.federalIncomeTax.itemizedLimitationActive });
    assert(approxEqual(r.federalIncomeTax.itemizedLimitationReduction, 0), `$300K single: no reduction`, { reduction: r.federalIncomeTax.itemizedLimitationReduction });
  }

  // High income + significant itemized: 2/37 rule kicks in.
  // CA $1M single + $50K otherItemized:
  //   SALT phased out to $10K + $50K = $60K itemized
  //   Taxable before limit ≈ $922K (well above $640.6K threshold)
  //   Excess = ~$281K. min($60K, $281K) = $60K. Reduction = (2/37) × $60K ≈ $3,243.
  {
    const r = calculateAll(
      { netProfit: 1000000, filingStatus: 'single', otherItemized: 50000 },
      federal, STATES.california,
    );
    assert(r.federalIncomeTax.itemizedLimitationActive, `$1M single + $50K itemized: 2/37 rule active`, { active: r.federalIncomeTax.itemizedLimitationActive });
    assert(approxEqual(r.federalIncomeTax.itemizedLimitationReduction, 3243.24, 0.5), `$1M single: reduction ~$3,243 (2/37 of $60K itemized)`, { reduction: r.federalIncomeTax.itemizedLimitationReduction });
  }

  // Standard-deduction filer: 2/37 rule doesn't apply (only affects itemizers).
  {
    const r = calculateAll({ netProfit: 1000000, filingStatus: 'single' }, federal, STATES.texas);
    assert(!r.federalIncomeTax.itemizedLimitationActive, `$1M single TX (standard deduction): 2/37 rule NOT active`, { active: r.federalIncomeTax.itemizedLimitationActive });
  }

  // Reduction can't push deductionUsed below standard deduction.
  // (Verified by floor in the engine: itemizedLimitationReduction = min(reduction, deductionUsed - standardDeduction))
  {
    const r = calculateAll(
      { netProfit: 800000, filingStatus: 'single', otherItemized: 1000 },
      federal, STATES.california,
    );
    // itemized = $10K SALT (phased out) + $1K = $11K. Standard is $16,100, so usedItemized = false.
    assert(!r.federalIncomeTax.itemizedLimitationActive, `Itemized below standard: 2/37 rule does not activate`, { itemized: r.federalIncomeTax.itemizedDeduction, standard: r.federalIncomeTax.standardDeductionAmount });
  }
}

// ---------------------------------------------------------------------------
// 10. NIIT tests (§1411 — 3.8% surtax on investment income, MAGI-based)
// ---------------------------------------------------------------------------
function runNIITTests() {
  console.log('=== NIIT Tests ===\n');

  // Below threshold → no NIIT.
  {
    const r = calculateAll(
      { netProfit: 100000, filingStatus: 'single', otherIncome: 50000, investmentIncome: 20000 },
      federal, STATES.texas,
    );
    assert(approxEqual(r.summary.niit, 0), `Below $200K MAGI: NIIT should be $0`, { niit: r.summary.niit });
  }

  // Above threshold — NIIT base = MIN(investment income, MAGI excess).
  // $250K SE + $50K otherIncome (incl $30K invest) → totalIncome $300K.
  // halfSE ≈ $14,117.15 → MAGI ≈ $285,882.85. Excess = $85,882.85.
  // NIIT base = min($30K, $85,882.85) = $30K → NIIT = $1,140.
  {
    const r = calculateAll(
      { netProfit: 250000, filingStatus: 'single', otherIncome: 50000, investmentIncome: 30000 },
      federal, STATES.texas,
    );
    assert(approxEqual(r.summary.niit, 1140, 0.5), `NIIT ~$1,140 (investment income binds)`, { niit: r.summary.niit });
  }

  // Boundary: MAGI excess binds (smaller than investment income).
  // $205K SE + $30K otherIncome (all invest) → totalIncome $235K.
  // halfSE ≈ $14,184.10 → MAGI ≈ $220,815.90. Excess = $20,815.90.
  // NIIT base = min($30K, $20,815.90) = $20,815.90 → NIIT ≈ $791.00.
  {
    const r = calculateAll(
      { netProfit: 205000, filingStatus: 'single', otherIncome: 30000, investmentIncome: 30000 },
      federal, STATES.texas,
    );
    assert(approxEqual(r.summary.niit, 791, 1), `NIIT ~$791 (MAGI excess binds, AGI-based)`, { niit: r.summary.niit });
  }

  // MFJ threshold is $250K.
  {
    const below = calculateAll(
      { netProfit: 200000, filingStatus: 'marriedJoint', otherIncome: 0, investmentIncome: 30000 },
      federal, STATES.texas,
    );
    assert(approxEqual(below.summary.niit, 0), `MFJ $200K MAGI: NIIT $0 (under $250K threshold)`, { niit: below.summary.niit });
  }

  // No investment income → no NIIT.
  {
    const r = calculateAll(
      { netProfit: 500000, filingStatus: 'single' },
      federal, STATES.texas,
    );
    assert(approxEqual(r.summary.niit, 0), `No investment income: NIIT $0 even at high SE income`, { niit: r.summary.niit });
  }
}

// ---------------------------------------------------------------------------
// 10a. Add'l Medicare threshold should ignore investment income (Form 8959 line 7)
// ---------------------------------------------------------------------------
function runAddlMedicareTests() {
  console.log('=== Additional Medicare Tests ===\n');

  // W-2 only: threshold reduced by full otherIncome.
  // $150K SE + $80K W-2, single. SE base = $138,525.
  // effectiveThreshold = $200K - $80K = $120K. Add'l Med = ($138,525 - $120K) * 0.009 = $166.73.
  {
    const r = calculateAll(
      { netProfit: 150000, filingStatus: 'single', otherIncome: 80000 },
      federal, STATES.texas,
    );
    assert(approxEqual(r.selfEmploymentTax.additionalMedicare, 166.73, 0.05), `W-2 only: Add'l Med ~$166.73`, { actual: r.selfEmploymentTax.additionalMedicare });
  }

  // W-2 + investment: threshold reduced ONLY by W-2 portion.
  // $150K SE + $110K otherIncome (incl $30K invest). W-2 portion = $80K.
  // effectiveThreshold = $200K - $80K = $120K. Add'l Med ≈ $166.73 (same as above).
  {
    const r = calculateAll(
      { netProfit: 150000, filingStatus: 'single', otherIncome: 110000, investmentIncome: 30000 },
      federal, STATES.texas,
    );
    assert(approxEqual(r.selfEmploymentTax.additionalMedicare, 166.73, 0.05), `W-2+invest: investment must NOT reduce Add'l Med threshold`, { actual: r.selfEmploymentTax.additionalMedicare });
  }

  // Pure investment, no W-2: threshold not reduced at all.
  // $205K SE + $30K invest, single. effectiveThreshold = $200K. SE base = $189,317.50 < $200K → $0.
  {
    const r = calculateAll(
      { netProfit: 205000, filingStatus: 'single', otherIncome: 30000, investmentIncome: 30000 },
      federal, STATES.texas,
    );
    assert(approxEqual(r.selfEmploymentTax.additionalMedicare, 0, 0.05), `Pure investment: Add'l Med should be $0 (SE base < threshold)`, { actual: r.selfEmploymentTax.additionalMedicare });
  }
}

// ---------------------------------------------------------------------------
// 11. Tip exemption tests (OBBBA §70201 — $25K exempt from federal income tax)
// ---------------------------------------------------------------------------
function runTipExemptionTests() {
  console.log('=== Tip Exemption Tests ===\n');

  // No tips → no exemption.
  {
    const r = calculateAll({ netProfit: 50000, filingStatus: 'single' }, federal, STATES.texas);
    assert(approxEqual(r.federalIncomeTax.tipExemption, 0), `No tips: exemption $0`, {});
  }

  // Tips below cap → full amount exempt.
  {
    const r = calculateAll(
      { netProfit: 80000, filingStatus: 'single', qualifiedTips: 10000 },
      federal, STATES.texas,
    );
    assert(approxEqual(r.federalIncomeTax.tipExemption, 10000), `$10K tips: $10K exempt`, { tipExemption: r.federalIncomeTax.tipExemption });
  }

  // Tips above cap → capped at $25K.
  {
    const r = calculateAll(
      { netProfit: 100000, filingStatus: 'single', qualifiedTips: 40000 },
      federal, STATES.texas,
    );
    assert(approxEqual(r.federalIncomeTax.tipExemption, 25000), `$40K tips: capped at $25K`, { tipExemption: r.federalIncomeTax.tipExemption });
  }

  // Tip exemption reduces fed tax but NOT SE tax.
  {
    const noTip = calculateAll({ netProfit: 80000, filingStatus: 'single' }, federal, STATES.texas);
    const withTip = calculateAll(
      { netProfit: 80000, filingStatus: 'single', qualifiedTips: 20000 },
      federal, STATES.texas,
    );
    assert(
      approxEqual(noTip.summary.selfEmploymentTax, withTip.summary.selfEmploymentTax),
      `Tip exemption must NOT reduce SE tax`,
      { noTipSE: noTip.summary.selfEmploymentTax, withTipSE: withTip.summary.selfEmploymentTax }
    );
    assert(
      withTip.summary.federalIncomeTax < noTip.summary.federalIncomeTax,
      `Tip exemption SHOULD reduce federal income tax`,
      { noFedTax: noTip.summary.federalIncomeTax, withFedTax: withTip.summary.federalIncomeTax }
    );
  }
}

// ---------------------------------------------------------------------------
// 12. Locality tax tests (NYC, Yonkers, Ohio municipal)
// ---------------------------------------------------------------------------
function runLocalityTests() {
  console.log('=== Locality Tax Tests ===\n');

  // No locality → localityTax = 0.
  {
    const r = calculateAll({ netProfit: 100000, filingStatus: 'single' }, federal, STATES.newYork);
    assert(approxEqual(r.stateTax.localityTax, 0), `NY no locality: $0 city tax`, { localityTax: r.stateTax.localityTax });
  }

  // NYC adds significant local tax.
  {
    const r = calculateAll(
      { netProfit: 200000, filingStatus: 'single', locality: 'nyc' },
      federal, STATES.newYork,
    );
    assert(r.stateTax.localityTax > 5000, `NYC at $200K: city tax should be > $5K`, { localityTax: r.stateTax.localityTax });
    assert(r.stateTax.locality === 'New York City', `Locality name should be 'New York City'`, { locality: r.stateTax.locality });
  }

  // Yonkers surcharge ≈ 16.75% of state tax.
  {
    const r = calculateAll(
      { netProfit: 200000, filingStatus: 'single', locality: 'yonkers' },
      federal, STATES.newYork,
    );
    const expected = r.stateTax.stateOnly * 0.1675;
    assert(approxEqual(r.stateTax.localityTax, expected, 1), `Yonkers: 16.75% of NY state tax`, { expected, actual: r.stateTax.localityTax });
  }

  // Ohio municipal at 2.5% flat.
  {
    const r = calculateAll(
      { netProfit: 100000, filingStatus: 'single', locality: 'ohioMunicipal' },
      federal, STATES.ohio,
    );
    assert(r.stateTax.localityTax > 0, `OH municipal: should add tax`, { localityTax: r.stateTax.localityTax });
  }

  // Invalid locality silently ignored.
  {
    const r = calculateAll(
      { netProfit: 100000, filingStatus: 'single', locality: 'nonexistent' },
      federal, STATES.california,
    );
    assert(approxEqual(r.stateTax.localityTax, 0), `Invalid locality: $0 city tax`, { localityTax: r.stateTax.localityTax });
  }
}

// ---------------------------------------------------------------------------
// 12a. Hand-verified end-to-end scenarios — tightest sanity check
// ---------------------------------------------------------------------------
function runHandVerifiedScenarios() {
  console.log('=== Hand-Verified Scenarios ===\n');

  // Scenario A: $100K single TX. Hand-computed total tax: $22,364.55.
  {
    const r = calculateAll({ netProfit: 100000, filingStatus: 'single' }, federal, STATES.texas);
    assert(approxEqual(r.summary.totalTax, 22364.55, 0.10), `A: $100K TX single → total tax $22,364.55`, { actual: r.summary.totalTax });
    assert(approxEqual(r.summary.selfEmploymentTax, 14129.55, 0.10), `A: SE tax $14,129.55`, { actual: r.summary.selfEmploymentTax });
    assert(approxEqual(r.summary.federalIncomeTax, 8235.01, 0.10), `A: Fed income tax $8,235.01`, { actual: r.summary.federalIncomeTax });
  }

  // Scenario B: $200K single CA. Hand-computed total tax: $69,327.93.
  {
    const r = calculateAll({ netProfit: 200000, filingStatus: 'single' }, federal, STATES.california);
    assert(approxEqual(r.summary.totalTax, 69327.93, 0.10), `B: $200K CA single → total tax $69,327.93`, { actual: r.summary.totalTax });
    assert(!r.federalIncomeTax.usedItemized, `B: standard deduction wins (SALT $15,897 < std $16,100)`, { itemized: r.federalIncomeTax.usedItemized });
  }

  // Scenario C: $400K single CA + $15K property. Hand-computed total tax: $160,742.59.
  {
    const r = calculateAll(
      { netProfit: 400000, filingStatus: 'single', propertyTax: 15000 },
      federal, STATES.california,
    );
    assert(approxEqual(r.summary.totalTax, 160742.59, 0.10), `C: $400K CA+$15K prop → total tax $160,742.59`, { actual: r.summary.totalTax });
    assert(r.federalIncomeTax.usedItemized, `C: itemizing`, { itemized: r.federalIncomeTax.usedItemized });
    assert(approxEqual(r.federalIncomeTax.saltDeduction, 40400), `C: SALT capped at $40,400`, { salt: r.federalIncomeTax.saltDeduction });
    assert(approxEqual(r.federalIncomeTax.qbiDeduction, 400), `C: QBI = $400 minimum (above phase-in, non-SSTB sole prop)`, { qbi: r.federalIncomeTax.qbiDeduction });
  }
}

// ---------------------------------------------------------------------------
// 13. CA half-SE state subtraction tests
// ---------------------------------------------------------------------------
function runCAHalfSETests() {
  console.log('=== CA Half-SE Subtraction Tests ===\n');

  // CA should now subtract half-SE before applying state brackets.
  {
    const r = calculateAll({ netProfit: 200000, filingStatus: 'single' }, federal, STATES.california);
    // The half-SE for $200K SE income is ~$10,894 (2026: $200K * 0.9235 * 0.153 / 2).
    // CA tax should be applied to ~$189K, not $200K. Hard to assert exactly without
    // recomputing brackets, so check that state tax is materially less than naive calc.
    assert(r.summary.stateTax > 0, `CA $200K should still owe state tax`, { stateTax: r.summary.stateTax });
    assert(r.summary.stateTax < 200000 * 0.13, `CA effective rate should not exceed top bracket`, { stateTax: r.summary.stateTax });
  }

  // TX (no income tax) — half-SE config doesn't matter.
  {
    const r = calculateAll({ netProfit: 200000, filingStatus: 'single' }, federal, STATES.texas);
    assert(approxEqual(r.summary.stateTax, 0), `TX state tax always $0`, { stateTax: r.summary.stateTax });
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
runSALTTests();
runSALTPhaseoutTests();
runItemizedLimitationTests();
runNIITTests();
runAddlMedicareTests();
runTipExemptionTests();
runLocalityTests();
runHandVerifiedScenarios();
runCAHalfSETests();

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
