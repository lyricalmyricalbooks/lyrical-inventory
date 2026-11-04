// Stripe's processing fees filing themselves: the writer the manual tool and
// the background job now share, and the sweep's guarantees about the ledger.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appSource, buildHarness } from './helpers/extract-decl.js';
import { getBookCurrencyCode, roundCents } from '../src/lib/money.js';
import { saleCadAmounts } from '../src/lib/sale-fx.js';
import { escapeHtml } from '../src/lib/html.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

/** The real upsert, with a ledger it can actually write into. */
function writerHarness(businessExpenses = []) {
  const TAX_CENTER = { businessExpenses, settings: {} };
  const harness = buildHarness({
    names: ['writeStripeFeeRows'],
    deps: { TAX_CENTER },
    returns: '{ writeStripeFeeRows }',
  });
  return { ...harness, TAX_CENTER };
}

const row = (over = {}) => ({
  year: 2026, ref: 'stripe-fees:2026:CAD', desc: 'Stripe processing fees on sales 2026',
  cat: 'Sales Processing Fees', currency: 'CAD', amount: 42.5,
  origCurrency: 'CAD', origAmount: 42.5, fxRate: 1, baseAmount: 42.5,
  date: '2026-09-09', ...over,
});

describe('filing a fee row', () => {
  it('adds a row that was not there', () => {
    const { writeStripeFeeRows, TAX_CENTER } = writerHarness();
    expect(writeStripeFeeRows([row()])).toMatchObject({ inserted: 1, updated: 0, totalCad: 42.5 });
    expect(TAX_CENTER.businessExpenses).toHaveLength(1);
    expect(TAX_CENTER.businessExpenses[0]).toMatchObject({
      ref: 'stripe-fees:2026:CAD', amount: 42.5, cat: 'Sales Processing Fees',
    });
  });

  it('refreshes the same year in place rather than filing it twice', () => {
    // The property the whole fortnightly idea rests on. Running every two weeks
    // must keep one row current, not stack twenty-six of them into the year.
    const { writeStripeFeeRows, TAX_CENTER } = writerHarness();
    writeStripeFeeRows([row({ amount: 10, baseAmount: 10 })]);
    const result = writeStripeFeeRows([row({ amount: 42.5, baseAmount: 42.5 })]);

    expect(result).toMatchObject({ inserted: 0, updated: 1 });
    expect(TAX_CENTER.businessExpenses).toHaveLength(1);
    expect(TAX_CENTER.businessExpenses[0].amount).toBe(42.5);
  });

  it('re-dates and re-prices a year once it has closed', () => {
    // What the year-end run is actually for: the row stops being dated "today"
    // and starts being dated the 31st, at that day's exchange rate.
    const { writeStripeFeeRows, TAX_CENTER } = writerHarness();
    writeStripeFeeRows([row({ currency: 'USD', ref: 'stripe-fees:2026:USD', date: '2026-12-20', fxRate: 1.35, baseAmount: 57.4 })]);
    writeStripeFeeRows([row({ currency: 'USD', ref: 'stripe-fees:2026:USD', date: '2026-12-31', fxRate: 1.38, baseAmount: 58.65 })]);

    expect(TAX_CENTER.businessExpenses).toHaveLength(1);
    expect(TAX_CENTER.businessExpenses[0]).toMatchObject({
      date: '2026-12-31', fxRate: 1.38, baseAmount: 58.65,
    });
  });

  it('keeps each year and each currency apart', () => {
    const { writeStripeFeeRows, TAX_CENTER } = writerHarness();
    writeStripeFeeRows([
      row({ year: 2025, ref: 'stripe-fees:2025:CAD' }),
      row({ year: 2026, ref: 'stripe-fees:2026:CAD' }),
      row({ year: 2026, ref: 'stripe-fees:2026:USD', currency: 'USD' }),
    ]);
    expect(TAX_CENTER.businessExpenses).toHaveLength(3);
  });

  it('never touches an expense that is not a Stripe fee row', () => {
    // The publisher's own hand-entered expenses share the same array.
    const mine = { id: 1, ref: '', desc: 'Paper', amount: 80 };
    const postage = { id: 2, ref: 'postage:EE123', desc: 'Label', amount: 12 };
    const { writeStripeFeeRows, TAX_CENTER } = writerHarness([mine, postage]);
    writeStripeFeeRows([row()]);

    expect(mine).toEqual({ id: 1, ref: '', desc: 'Paper', amount: 80 });
    expect(postage.amount).toBe(12);
    expect(TAX_CENTER.businessExpenses).toHaveLength(3);
  });

  it('stamps when money last moved, and only then', () => {
    const { writeStripeFeeRows, TAX_CENTER } = writerHarness();
    writeStripeFeeRows([]);
    expect(TAX_CENTER.settings.stripeFeesLastImportAt).toBeUndefined();
    writeStripeFeeRows([row()]);
    expect(TAX_CENTER.settings.stripeFeesLastImportAt).toBeTruthy();
  });
});

describe('the manual tool still asks first', () => {
  const manual = appSource.slice(
    appSource.indexOf('async function insertStripeFeesIntoLedger'),
    appSource.indexOf('// ─── Stripe fees, filed on a fortnightly clock'),
  );

  it('keeps its confirmation dialog', () => {
    // Pressing the button by hand is still a deliberate act; only the
    // background job is allowed to file without asking.
    expect(manual.length).toBeGreaterThan(200);
    expect(manual).toContain('confirmDialog(');
  });

  it('shares the planner and the writer rather than keeping its own copy', () => {
    expect(manual).toContain('await planStripeFeeRows(rows)');
    expect(manual).toContain('writeStripeFeeRows(planned)');
    // The upsert loop moved out; a second copy is how two callers drift.
    expect(manual).not.toContain('TAX_CENTER.businessExpenses.unshift(');
  });
});

describe('the fortnightly sweep and the ledger', () => {
  const sweep = appSource.slice(
    appSource.indexOf('async function sweepStripeFees'),
    appSource.indexOf('function startStripeFeeWatch'),
  );

  it('runs for the publisher only', () => {
    expect(sweep.length).toBeGreaterThan(400);
    expect(sweep).toContain('if (!window.IS_PUBLISHER || isAuthor()) return null;');
  });

  it('asks the shared schedule whether a run is owed', () => {
    expect(sweep).toContain('dueForFeeSweep({');
    expect(sweep).toContain('owed.due');
  });

  it('only asks Stripe about the years it may rewrite', () => {
    // The manual tool pulls every transaction the account ever had. A job
    // running on its own bounds the window to the years it is allowed to touch.
    expect(sweep).toContain('feeSweepFromYear({ lastRunAt, now })');
    expect(sweep).toContain('since: startOfYear(fromYear)');
    const fetcher = appSource.slice(
      appSource.indexOf('async function fetchStripeTransactions'),
      appSource.indexOf('function aggregateStripeTransactions'),
    );
    expect(fetcher).toContain("params.set('created[gte]'");
  });

  it('leaves older, already-filed years alone', () => {
    // A background job keeps the books current; it does not quietly restate
    // years that were closed and filed.
    expect(sweep).toContain('r.year >= fromYear');
  });

  it('does not write the whole tax document on a run that files nothing', () => {
    // saveTaxCenter serialises the entire ledger. Guarded behind an actual
    // change, and the scheduling stamp lives in browser storage instead.
    expect(sweep).toContain('if (!planned.length) return { inserted: 0, updated: 0, totalCad: 0 };');
    expect(sweep).toContain('if (result.inserted || result.updated) {');
    // Comments stripped first: this function's own comment explains why it does
    // NOT call saveTaxCenter, and an assertion that cannot tell a mention from a
    // call is not an assertion about the code.
    const stamp = appSource.slice(
      appSource.indexOf('function writeStripeFeeStamp'),
      appSource.indexOf('/** The card announcing fees that filed themselves. */'),
    ).replace(/\/\/[^\n]*/g, '');
    expect(stamp).toContain('localStorage.setItem(STRIPE_FEE_LAST_KEY');
    expect(stamp).not.toContain('saveTaxCenter');
  });

  it('says nothing on a quiet fortnight', () => {
    // describeFeeSweep answers null when nothing was filed, and the card is
    // only raised on a real change.
    expect(sweep).toContain('showStripeFeeAlert(describeFeeSweep(');
  });

  it('reports its own health under its own name', () => {
    // Its own name, not the invoice watch's: a broken exchange-rate lookup and
    // a refused Stripe key on invoices are different faults, and one clearing
    // the other would hide a real one.
    expect(sweep).toContain("noteIntegrationSuccess('stripe-fees')");
    expect(sweep).toContain("noteIntegrationFailure('stripe-fees', error");
    expect(sweep).toContain("integrationBackoffMs('stripe-fees'");
  });

  it('is polled often enough to catch a year ending', () => {
    // A fortnightly timer would sail straight past the 31st of December on a
    // laptop shut for the holidays; the schedule decides, the timer just asks.
    const start = appSource.slice(
      appSource.indexOf('function startStripeFeeWatch'),
      appSource.indexOf('// Compare what Stripe says you collected'),
    );
    expect(start).toContain('startWatch(');
    expect(start).toContain('intervalMs: 60 * 60 * 1000');
    expect(start).toContain('if (_stripeFeeWatchStarted');
  });

  it('is started at boot and reachable from the Check now button', () => {
    expect(appSource).toContain('startStripeFeeWatch();');
    expect(appSource).toContain("if (id === 'stripe-fees') return sweepStripeFees({ force: true });");
  });

  it('marks the Tax Centre when Stripe stops answering', () => {
    expect(indexContent.match(/data-health-badge="shippo,canadapost,shipping-email,stripe-fees,receipt-scan"/g))
      .toHaveLength(1);
  });
});

describe('a fee with no exchange rate to be had', () => {
  /** The real planner, with the rate lookup answering from a table. */
  function plannerHarness(rates = {}) {
    const asked = [];
    const { planStripeFeeRows } = buildHarness({
      names: ['_stripeMinorToMajor', 'planStripeFeeRows'],
      deps: {
        isZeroDecimalCurrency: () => false,
        today: () => '2026-11-04',
        resolveExpenseRate: async (cur, date) => { asked.push(`${cur}@${date}`); return rates[`${cur}@${date}`] || 0; },
      },
      returns: '{ planStripeFeeRows }',
    });
    return { planStripeFeeRows, asked };
  }
  const now = new Date('2026-11-04T12:00:00').getTime();
  const usd2025 = { year: 2025, cur: 'usd', salesFeeMinor: 5000, stripeBillingMinor: 0, salesCount: 3 };

  it('is filed flagged missing with no CAD value, not 1:1', async () => {
    const { planStripeFeeRows, asked } = plannerHarness();
    const [p] = await planStripeFeeRows([usd2025], { now });
    expect(asked).toEqual(['USD@2025-12-31']);
    expect(p).toMatchObject({ amount: 50, currency: 'USD', fxRate: null, baseAmount: null, fxMissing: true, date: '2025-12-31' });
  });

  it('is converted at the year-end rate when there is one', async () => {
    const { planStripeFeeRows } = plannerHarness({ 'USD@2025-12-31': 1.4 });
    const [p] = await planStripeFeeRows([usd2025], { now });
    expect(p).toMatchObject({ fxRate: 1.4, baseAmount: 70, fxMissing: false });
  });

  it('keeps a rate the row was already healed with, rather than blanking it', () => {
    const healed = { id: 9, ref: 'stripe-fees:2025:USD', currency: 'USD', amount: 50, fxRate: 1.4, baseAmount: 70, date: '2025-12-31', fxMissing: false };
    const { writeStripeFeeRows, TAX_CENTER } = writerHarness([healed]);
    writeStripeFeeRows([row({ year: 2025, ref: 'stripe-fees:2025:USD', currency: 'USD', amount: 50, fxRate: null, baseAmount: null, fxMissing: true, date: '2025-12-31' })]);
    expect(TAX_CENTER.businessExpenses[0]).toMatchObject({ fxRate: 1.4, baseAmount: 70, fxMissing: false });
  });

  it('marks a refiled row missing when it never had a rate', () => {
    const { writeStripeFeeRows, TAX_CENTER } = writerHarness();
    writeStripeFeeRows([row({ ref: 'stripe-fees:2025:USD', currency: 'USD', fxRate: null, baseAmount: null, fxMissing: true })]);
    expect(TAX_CENTER.businessExpenses[0]).toMatchObject({ fxRate: null, baseAmount: null, fxMissing: true });
  });
});

describe('Stripe vs your recorded sales', () => {
  // The cross-check against the real conversion helpers, with a fake page.
  async function runRecon({ books, states, stripeRows, rates = {}, cache = {} }) {
    const wrap = { style: {}, innerHTML: '' };
    const { reconcileStripeAgainstSales } = buildHarness({
      names: ['_stripeMinorToMajor', 'reconcileStripeAgainstSales'],
      deps: {
        window: { _stripeFeesLedgerData: stripeRows },
        document: { getElementById: () => wrap },
        showToast: () => {},
        isZeroDecimalCurrency: () => false,
        today: () => '2026-11-04',
        resolveExpenseRate: async (cur, date) => rates[`${cur}@${date}`] || 0,
        BOOK_LIST: books,
        states,
        defaultState: () => ({ hist: [] }),
        getBookCurrencyCode,
        saleCadAmounts,
        _fxRateCache: cache,
        roundCents,
        escapeHtml,
      },
      returns: '{ reconcileStripeAgainstSales }',
    });
    await reconcileStripeAgainstSales();
    return wrap.innerHTML;
  }

  it('converts a foreign book\'s sales to CAD at each sale\'s date, as the Tax Centre does', async () => {
    const html = await runRecon({
      books: [{ id: 'altrove', title: 'Altrove', currency: '€' }, { id: 'home', title: 'Home', currency: 'CAD' }],
      states: {
        altrove: { hist: [
          { date: '2025-03-10', qty: 2, price: 20 },
          { date: '2025-04-01', qty: 1, price: 10, artistPending: true },
        ] },
        home: { hist: [{ date: '2025-05-05', qty: 1, price: 15 }] },
      },
      stripeRows: [{ year: 2025, cur: 'cad', salesGrossMinor: 1000 }],
      cache: { 'EUR_CAD@2025-03-10': 1.5 },
    });
    // 2 × €20 at 1.5 = 60, plus CA$15 — not 40 + 15 in mixed currencies.
    expect(html).toContain('75.00');
    expect(html).not.toContain('55.00');
  });

  it('leaves out, and names, Stripe money it has no rate for instead of counting it 1:1', async () => {
    const html = await runRecon({
      books: [{ id: 'home', title: 'Home', currency: 'CAD' }],
      states: { home: { hist: [{ date: '2025-05-05', qty: 1, price: 15 }] } },
      stripeRows: [{ year: 2025, cur: 'usd', salesGrossMinor: 10000 }],
    });
    expect(html).toContain('2025 USD');
    expect(html).not.toContain('100.00');
  });
});
