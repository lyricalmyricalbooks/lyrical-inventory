// One press on a web order should record the sale, fill the shipping form from
// what was bought, and fetch the rates — while never spending money and never
// moving stock on a guess. These cover the wiring that makes that true.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appSource, buildHarness } from './helpers/extract-decl.js';
import { orderParcelPlan } from '../src/lib/order-parcel-prefill.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

const BOOKS = {
  altrove: { id: 'altrove', title: 'Altrove', listPrice: 32.5, shipWeight: 1.2, shipWeightUnit: 'lb' },
  hound: { id: 'hound', title: 'The Hound', listPrice: 40 },
};

const formElements = () => ({
  'ship-preset-book': { value: '', options: [{ value: '' }, { value: 'altrove' }, { value: 'hound' }] },
  'sp-qty': { value: '1' },
  'sp-height': { value: '1' },
  'sp-weight': { value: '1.2' },
  'sp-customs-value': { value: '' },
  'sp-customs-description': { value: '' },
  'sp-customs-total': { textContent: '' },
});

function parcelHarness(elements) {
  const calls = { preset: 0, readiness: 0 };
  const harness = buildHarness({
    names: ['scaleShippoSpecsForQty', 'updateShippoCustomsTotalHint', 'applyOrderParcelPlan'],
    deps: {
      $: (id) => elements[id],
      BOOKS,
      onShippoBookPresetChange: () => { calls.preset++; return 'book'; },
      renderShippoRateReadiness: () => { calls.readiness++; },
    },
    moduleState: 'let shippoBaseSpecs = { height: 1, weight: 1.2 };',
    returns: '{ applyOrderParcelPlan }',
  });
  return { ...harness, calls };
}

describe('filling the parcel from an order', () => {
  it('loads the book, the count and the declared value in one go', () => {
    const elements = formElements();
    const { applyOrderParcelPlan } = parcelHarness(elements);

    const plan = orderParcelPlan(
      [{ title: 'Altrove', bookId: 'altrove', qty: 3, unitPrice: 30, confidence: 'exact' }],
      BOOKS,
    );
    const applied = applyOrderParcelPlan(plan);

    expect(applied).toMatchObject({ source: 'book', qty: 3 });
    expect(elements['ship-preset-book'].value).toBe('altrove');
    expect(elements['sp-qty'].value).toBe('3');
    // Three copies of a 1.2 lb book, stacked.
    expect(elements['sp-weight'].value).toBe(3.6);
    expect(elements['sp-height'].value).toBe(3);
    expect(elements['sp-customs-value'].value).toBe('30.00');
    expect(elements['sp-customs-description'].value).toBe('Altrove - printed books');
    expect(elements['sp-customs-total'].textContent).toBe('Declared to customs: 3 × 30.00 = 90.00 CAD');
  });

  it('leaves the form alone when the order names no catalogue book', () => {
    const elements = formElements();
    const { applyOrderParcelPlan } = parcelHarness(elements);
    const plan = orderParcelPlan([{ title: 'Tote bag', bookId: '', qty: 1 }], BOOKS);

    expect(applyOrderParcelPlan(plan)).toBeNull();
    expect(elements['ship-preset-book'].value).toBe('');
    expect(elements['sp-qty'].value).toBe('1');
  });

  it('does not write a book the preset list cannot hold', () => {
    // The catalogue has the book but the tab has not finished rendering its
    // options; writing the value anyway leaves the box fields describing
    // nothing at all.
    const elements = formElements();
    elements['ship-preset-book'].options = [{ value: '' }];
    const { applyOrderParcelPlan, calls } = parcelHarness(elements);
    const plan = orderParcelPlan([{ bookId: 'altrove', qty: 1, confidence: 'exact' }], BOOKS);

    expect(applyOrderParcelPlan(plan)).toBeNull();
    expect(calls.preset).toBe(0);
  });
});

describe('fetching rates without being asked', () => {
  function quoteHarness({ enabled = true, key = 'shippo_live_x', missing = [] } = {}) {
    const seen = { quotes: 0, summaries: [] };
    const harness = buildHarness({
      names: ['maybeAutoQuoteRates'],
      deps: {
        autoQuoteEnabled: () => enabled,
        TAX_CENTER: { settings: { shippoKey: key } },
        shippoRateFormState: () => ({ missing }),
        renderOrderPrefillSummary: (state) => { seen.summaries.push(state); },
        calculateShippoRates: async () => { seen.quotes++; },
      },
      returns: '{ maybeAutoQuoteRates }',
    });
    return { ...harness, seen };
  }

  it('quotes as soon as the form has everything', async () => {
    const { maybeAutoQuoteRates, seen } = quoteHarness();
    await expect(maybeAutoQuoteRates({ orderNumber: '#ABC-1' })).resolves.toBe(true);
    expect(seen.quotes).toBe(1);
    // The summary says it is working, then says it is done.
    expect(seen.summaries.map(s => s.quoting)).toEqual([true, false]);
  });

  it('stays put when the publisher has switched it off', async () => {
    const { maybeAutoQuoteRates, seen } = quoteHarness({ enabled: false });
    await expect(maybeAutoQuoteRates({})).resolves.toBe(false);
    expect(seen.quotes).toBe(0);
  });

  it('stays put when the form is still missing something', async () => {
    const { maybeAutoQuoteRates, seen } = quoteHarness({ missing: [{ id: 'st-zip' }] });
    await expect(maybeAutoQuoteRates({})).resolves.toBe(false);
    expect(seen.quotes).toBe(0);
  });

  it('stays put when no Shippo key is configured', async () => {
    const { maybeAutoQuoteRates, seen } = quoteHarness({ key: '' });
    await expect(maybeAutoQuoteRates({})).resolves.toBe(false);
    expect(seen.quotes).toBe(0);
  });

  it('clears the working state even when the rate call throws', async () => {
    const seen = { summaries: [] };
    const { maybeAutoQuoteRates } = buildHarness({
      names: ['maybeAutoQuoteRates'],
      deps: {
        autoQuoteEnabled: () => true,
        TAX_CENTER: { settings: { shippoKey: 'k' } },
        shippoRateFormState: () => ({ missing: [] }),
        renderOrderPrefillSummary: (state) => { seen.summaries.push(state); },
        calculateShippoRates: async () => { throw new Error('offline'); },
        console: { warn() {} },
      },
      returns: '{ maybeAutoQuoteRates }',
    });
    await expect(maybeAutoQuoteRates({})).resolves.toBe(true);
    expect(seen.summaries.at(-1).quoting).toBe(false);
  });
});

describe('recording the sale on the way to the label', () => {
  const order = {
    id: 'GPWT-916083',
    attributes: { status: 'completed', created_at: '2026-09-01T10:00:00Z', total: '65.00' },
  };

  function recordHarness({ ledgerNumbers = [], commit = null } = {}) {
    const seen = { commits: [], linked: 0, renders: 0 };
    const harness = buildHarness({
      names: ['recordBigCartelOrderIfMissing'],
      deps: {
        BOOKS,
        bigCartelOrderNumber: (o) => `#${o.id}`,
        bigCartelLedgerNumbers: () => ledgerNumbers,
        sameOrderNumber: (a, b) => String(a).toUpperCase() === String(b).toUpperCase(),
        findLedgerGaps: () => ({
          missing: [{ num: '#GPWT-916083', orderId: 'GPWT-916083', date: '2026-09-01', qty: 2, unitPrice: 30, email: 'a@b.c' }],
        }),
        getBigCartelIncluded: () => [],
        extractBigCartelAddress: () => ({ name: 'Dana', street1: '1 Main' }),
        commitRecoveredWebsiteOrder: commit || ((bookId, form) => {
          seen.commits.push({ bookId, ...form });
          return { num: '#GPWT-916083' };
        }),
        buildBigCartelOrderEntry: () => ({ num: '#GPWT-916083' }),
        renderBigCartelLedgerGaps: () => { seen.renders++; },
        renderBigCartelGapBadge: () => {},
        scheduleRender: () => {},
        autoLinkPostageForOrder: async () => { seen.linked = 1; return 1; },
        console: { error() {}, warn() {} },
      },
      moduleState: 'let _bcGapResult = { missing: [{ num: "#GPWT-916083" }] };',
      returns: '{ recordBigCartelOrderIfMissing }',
    });
    return { ...harness, seen };
  }

  const exactPlan = () => orderParcelPlan(
    [{ title: 'Altrove', bookId: 'altrove', qty: 2, unitPrice: 30, confidence: 'exact' }], BOOKS);

  it('records an order that names one catalogue book outright', async () => {
    const { recordBigCartelOrderIfMissing, seen } = recordHarness();
    const result = await recordBigCartelOrderIfMissing(order, exactPlan());

    expect(result).toMatchObject({ status: 'recorded', qty: 2, linked: 1, bookTitle: 'Altrove' });
    expect(seen.commits).toEqual([{ bookId: 'altrove', qty: 2, price: 30 }]);
    // The review queue is redrawn so its badge stops claiming this is missing.
    expect(seen.renders).toBe(1);
  });

  it('refuses to move stock for a box holding two different titles', async () => {
    const plan = orderParcelPlan([
      { bookId: 'altrove', qty: 1, confidence: 'exact' },
      { bookId: 'hound', qty: 1, confidence: 'exact' },
    ], BOOKS);
    const { recordBigCartelOrderIfMissing, seen } = recordHarness();

    expect((await recordBigCartelOrderIfMissing(order, plan)).status).toBe('needs-review');
    expect(seen.commits).toEqual([]);
  });

  it('refuses to move stock for a book deduced from the amount paid', async () => {
    const plan = orderParcelPlan([{ bookId: 'altrove', qty: 2, confidence: 'price' }], BOOKS);
    const { recordBigCartelOrderIfMissing, seen } = recordHarness();

    expect((await recordBigCartelOrderIfMissing(order, plan)).status).toBe('needs-review');
    expect(seen.commits).toEqual([]);
  });

  it('does not record the same order twice', async () => {
    const { recordBigCartelOrderIfMissing, seen } = recordHarness({ ledgerNumbers: ['#GPWT-916083'] });

    expect((await recordBigCartelOrderIfMissing(order, exactPlan())).status).toBe('already-recorded');
    expect(seen.commits).toEqual([]);
  });

  it('reports a failed save rather than pretending the sale is recorded', async () => {
    const { recordBigCartelOrderIfMissing } = recordHarness({
      commit: () => { throw new Error('no such book'); },
    });
    expect((await recordBigCartelOrderIfMissing(order, exactPlan())).status).toBe('failed');
  });

  it('still reports the sale as recorded when linking postage fails', async () => {
    const { recordBigCartelOrderIfMissing } = buildHarness({
      names: ['recordBigCartelOrderIfMissing'],
      deps: {
        BOOKS,
        bigCartelOrderNumber: (o) => `#${o.id}`,
        bigCartelLedgerNumbers: () => [],
        sameOrderNumber: (a, b) => a === b,
        findLedgerGaps: () => ({ missing: [{ num: '#GPWT-916083', qty: 2, unitPrice: 30 }] }),
        getBigCartelIncluded: () => [],
        extractBigCartelAddress: () => ({}),
        commitRecoveredWebsiteOrder: () => ({ num: '#GPWT-916083' }),
        buildBigCartelOrderEntry: () => ({}),
        renderBigCartelLedgerGaps: () => {},
        renderBigCartelGapBadge: () => {},
        scheduleRender: () => {},
        autoLinkPostageForOrder: async () => { throw new Error('offline'); },
        console: { error() {}, warn() {} },
      },
      moduleState: 'let _bcGapResult = null;',
      returns: '{ recordBigCartelOrderIfMissing }',
    });
    const result = await recordBigCartelOrderIfMissing(order, exactPlan());
    expect(result).toMatchObject({ status: 'recorded', linked: 0 });
  });
});

describe('the shipping tab shows what was filled in for you', () => {
  it('has a summary line and an opt-out for automatic rates', () => {
    expect(indexContent).toContain('id="ship-order-prefill-summary"');
    expect(indexContent).toContain('id="ship-auto-quote-toggle"');
    expect(indexContent).toContain('onchange="onShippoAutoQuoteToggle()"');
    // Announced, so the summary is not silent to a screen reader.
    expect(indexContent).toMatch(/id="ship-order-prefill-summary"[^>]*aria-live="polite"/);
  });

  it('restores the publisher’s choice when the tab opens', () => {
    expect(appSource).toContain('setShippoAutoQuote(autoQuoteEnabled())');
  });

  it('treats a missing or unreadable browser store as "on"', () => {
    expect(appSource).toMatch(/localStorage\.getItem\(AUTO_QUOTE_PREF_KEY\) !== 'off'/);
    expect(appSource).toMatch(/catch \(_\) \{ return true; \}/);
  });

  it('sends the order’s books along with its address', () => {
    // Both destination lists carry what was bought, so choosing either fills
    // the box as well as the recipient.
    expect(appSource).toContain('parcelLines: bigCartelOrderLines(o, getBigCartelIncluded(), BOOKS)');
    expect(appSource).toContain('JSON.stringify({ ...addrObj, parcelLines })');
    expect(appSource).toContain('parcelLinesFromLedgerEntry(h, h._bookId, BOOKS)');
  });

  it('keeps buying a label a deliberate press', () => {
    // Nothing in the automatic path may reach the purchase calls.
    const autoPath = appSource.slice(
      appSource.indexOf('async function maybeAutoQuoteRates'),
      appSource.indexOf('/** The parcel lines behind') > -1
        ? appSource.indexOf('/** The parcel lines behind')
        : appSource.indexOf('async function onShippoPreFillDestChange'),
    );
    expect(autoPath).not.toContain('buyShippoLabel');
    expect(autoPath).not.toContain('buyCanadaPostLabelHandler');
  });
});
