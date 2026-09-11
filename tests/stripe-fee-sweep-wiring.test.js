// Stripe's processing fees filing themselves: the writer the manual tool and
// the background job now share, and the sweep's guarantees about the ledger.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appSource, buildHarness } from './helpers/extract-decl.js';

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
    expect(indexContent.match(/data-health-badge="shippo,canadapost,shipping-email,stripe-fees"/g))
      .toHaveLength(2);
  });
});
