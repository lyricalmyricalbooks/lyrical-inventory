import { describe, it, expect } from 'vitest';
import {
  INTEL_TOOL_NAMES,
  INTEL_TOOL_SCHEMAS,
  IN_PERSON_CHANNELS,
  MAX_EDITS_PER_BATCH,
  MAX_TOOL_ROWS,
  runIntelTool,
} from '../src/lib/publisher-intel-tools.js';

// The Intelligence panel hands these results straight to a language model,
// which will then state them to the publisher as fact. A wrong figure here is
// not a rendering bug — it is the app confidently misreporting its own books.
// So most of what follows is about the ways this data is easy to get wrong.

const book = (over = {}) => ({
  title: 'The Hound', author: 'A. Writer', currency: '$', maxPrint: 100,
  listPrice: 20, productionCost: 500, threshold: 10, pubGratuity: 60, authorGratuity: 40,
  ...over,
});

function fixture(over = {}) {
  const books = { hound: book() };
  const states = {
    hound: {
      stock: 40, sold: 30, revenue: 600,
      chStats: { Website: { txns: 5, units: 10, revenue: 200 } },
      hist: [
        { num: '1001', chan: 'Fair', qty: 3, price: 20, date: '2026-06-14', notes: 'Toronto Word Fair', cur: 'CAD' },
        { num: '1002', chan: 'Website', qty: 1, price: 20, date: '2026-06-20', cur: 'CAD' },
        // The mirror of the consignment sale below. Counting both double-counts.
        { num: 'C-1', chan: 'Consignment', qty: 5, price: 20, date: '2026-06-02', consignmentLink: true, cur: 'CAD' },
        { num: 'G-1', chan: 'Gratuity', qty: 2, price: 0, date: '2026-06-03', gratuity: true, cur: 'CAD' },
        { num: 'V-1', chan: 'Website', qty: 9, price: 20, date: '2026-06-05', voided: true, cur: 'CAD' },
      ],
      ledger: [
        { id: 1, type: 'Shipment', qty: 20, date: '2026-05-01', storeName: 'Bookshop' },
        { id: 2, type: 'Sale', qty: 5, amountDue: 60, date: '2026-06-02', storeName: 'Bookshop', cur: 'CAD', paid: 'paid' },
      ],
      expenses: [
        { id: 'e1', desc: 'Table fee', cat: 'Events', amount: 150, currency: 'CAD', date: '2026-06-14', trip: 'Toronto Word Fair' },
      ],
      stores: [],
    },
  };
  const taxCenter = {
    settings: { baseCurrency: 'CAD' },
    tripBudgets: { 'Toronto Word Fair': 400 },
    businessExpenses: [
      { id: 'b1', desc: 'Train', cat: 'travel', amount: 120, currency: 'CAD', baseAmount: 120, date: '2026-06-13', trip: 'Toronto Word Fair' },
      { id: 'b2', desc: 'Hotel', cat: 'Travel & Meals', amount: 200, currency: 'USD', date: '2026-06-13', trip: 'Toronto Word Fair', fxMissing: true },
    ],
  };
  const tripsSummary = {
    'Toronto Word Fair': {
      total: 320, count: 2, latestDate: '2026-06-14',
      categories: { 'Travel & Meals': 320 },
      items: [{ date: '2026-06-13' }, { date: '2026-06-14' }],
      record: { name: 'Toronto Word Fair', destination: 'Toronto', startDate: '2026-06-13', endDate: '2026-06-15' },
    },
  };
  return {
    books, states, taxCenter, tripsSummary,
    recognizedRevenue: (s) => s.revenue,
    ...over,
  };
}

describe('the tool surface itself', () => {
  it('declares a schema for every tool it can run, and no others', () => {
    expect(INTEL_TOOL_SCHEMAS.map(s => s.name).sort()).toEqual([...INTEL_TOOL_NAMES].sort());
  });

  it('answers an unknown tool instead of throwing', () => {
    // A model naming a tool that does not exist has to be recoverable: the loop
    // feeds the error back so it can correct itself. Throwing would end the
    // turn with nothing to show the publisher.
    const out = runIntelTool('queryTheVibes', {}, fixture());
    expect(out.error).toMatch(/no tool called/i);
  });

  it('answers rather than throws when a tool is handed something unusable', () => {
    const out = runIntelTool('queryLedger', {}, { books: {}, states: {} });
    expect(out.error).toBeTruthy();
  });
});

describe('querySales', () => {
  it('counts a consignment sale once, not twice', () => {
    // The canonical row lives on the store ledger and is mirrored into history
    // with consignmentLink. Summing both is the single easiest way to overstate
    // revenue in this app, so it is pinned here.
    const out = runIntelTool('querySales', {}, fixture());
    const cad = out.totalsByCurrency.find(t => t.code === 'CAD');
    expect(cad.units).toBe(9);           // 3 fair + 1 website + 5 consignment
    expect(out.rows.filter(r => r.kind === 'consignment')).toHaveLength(1);
    expect(out.rows.some(r => r.orderNum === 'C-1')).toBe(false);
  });

  it('reports the publisher cut for a consignment sale, not the shelf price', () => {
    const out = runIntelTool('querySales', {}, fixture());
    const consign = out.rows.find(r => r.kind === 'consignment');
    expect(consign.revenue).toBe(60);    // amountDue, not 5 x 20
  });

  it('leaves out voided rows and gifted copies unless asked', () => {
    const out = runIntelTool('querySales', {}, fixture());
    expect(out.rows.some(r => r.orderNum === 'V-1')).toBe(false);
    expect(out.rows.some(r => r.kind === 'gratuity')).toBe(false);

    const withGifts = runIntelTool('querySales', { includeGratuities: true }, fixture());
    const gift = withGifts.rows.find(r => r.kind === 'gratuity');
    expect(gift.revenue).toBe(0);        // a gifted copy earns nothing
  });

  it('never adds two currencies into one figure', () => {
    const ctx = fixture();
    ctx.books.other = book({ title: 'Other', currency: '€' });
    ctx.states.other = {
      stock: 5, sold: 1, hist: [{ num: 'E1', chan: 'Website', qty: 2, price: 10, date: '2026-06-11', cur: 'EUR' }],
      ledger: [], expenses: [], stores: [], chStats: {},
    };
    const out = runIntelTool('querySales', {}, ctx);
    expect(out.totalsByCurrency.map(t => t.code).sort()).toEqual(['CAD', 'EUR']);
    expect(out.totalsByCurrency.find(t => t.code === 'EUR').revenue).toBe(20);
  });

  it('caps the rows it returns but never the totals', () => {
    const ctx = fixture();
    ctx.states.hound.hist = Array.from({ length: MAX_TOOL_ROWS + 40 }, (_, i) => ({
      num: `n${i}`, chan: 'Website', qty: 1, price: 2, date: '2026-03-01', cur: 'CAD',
    }));
    ctx.states.hound.ledger = [];
    const out = runIntelTool('querySales', {}, ctx);
    expect(out.rows).toHaveLength(MAX_TOOL_ROWS);
    expect(out.truncated).toBe(true);
    expect(out.matched).toBe(MAX_TOOL_ROWS + 40);
    // The total covers every match, not just the rows that came back.
    expect(out.totalsByCurrency[0].revenue).toBe((MAX_TOOL_ROWS + 40) * 2);
  });
});

describe('queryExpenses', () => {
  it('folds an old category spelling onto the canonical one and says it did', () => {
    const out = runIntelTool('queryExpenses', { scope: 'business' }, fixture());
    const train = out.rows.find(r => r.id === 'b1');
    expect(train.category).toBe('Travel & Meals');
    expect(train.storedCategory).toBe('travel');
    expect(out.byCategory.find(c => c.category === 'Travel & Meals').count).toBe(2);
  });

  it('uses the stamped CAD figure and never re-converts a foreign row', () => {
    const out = runIntelTool('queryExpenses', { scope: 'business' }, fixture());
    const hotel = out.rows.find(r => r.id === 'b2');
    // 200 USD with no rate recorded: reported as USD 200, flagged, and not
    // silently treated as 200 Canadian dollars.
    expect(hotel.currency).toBe('USD');
    expect(hotel.amount).toBe(200);
    expect(hotel.amountCAD).toBeUndefined();
    expect(hotel.rateMissing).toBe(true);
    expect(out.totalCAD).toBe(120);       // only the row that has a CAD figure
    expect(out.rowsWithCadFigure).toBe(1);
  });

  it('reports who is still owed money using the app own definition', () => {
    const out = runIntelTool('queryExpenses', { scope: 'book' }, fixture());
    expect(out.reimbursement).toEqual([
      expect.objectContaining({ bookId: 'hound', code: 'CAD', outstanding: 150, settled: 0 }),
    ]);
  });
});

describe('queryEvents', () => {
  it('joins a trip cost, its budget and the sales made there', () => {
    const out = runIntelTool('queryEvents', { name: 'toronto' }, fixture());
    const ev = out.rows[0];
    expect(ev.name).toBe('Toronto Word Fair');
    expect(ev.spendCAD).toBe(320);
    expect(ev.budgetCAD).toBe(400);
    expect(ev.budgetVarianceCAD).toBe(80);
    expect(ev.salesUnits).toBe(3);        // the in-person sale inside its dates
    expect(ev.marginCAD).toBe(60 - 320);
  });

  it('matches a sale that names the event even outside its dates', () => {
    const ctx = fixture();
    ctx.states.hound.hist.push({
      num: 'PRE-1', chan: 'Website', qty: 4, price: 20, date: '2026-01-02',
      notes: 'pre-order for Toronto Word Fair', cur: 'CAD',
    });
    const out = runIntelTool('queryEvents', { name: 'toronto' }, ctx);
    expect(out.rows[0].salesMatchedByName).toBe(1);
    expect(out.rows[0].salesUnits).toBe(7);
  });

  it('refuses to state one margin when the takings span currencies', () => {
    const ctx = fixture();
    ctx.states.hound.hist.push({
      num: 'X1', chan: 'Fair', qty: 1, price: 15, date: '2026-06-14', cur: 'EUR',
    });
    const out = runIntelTool('queryEvents', { name: 'toronto' }, ctx);
    expect(out.rows[0].marginCAD).toBeNull();
    expect(out.rows[0].marginNote).toMatch(/more than one currency/i);
  });

  it('treats the four in-person channels as event sales', () => {
    expect(IN_PERSON_CHANNELS).toEqual(['POS', 'Fair', 'Event', 'In Person']);
  });
});

describe('queryCatalog', () => {
  it('agrees with the app own stock breakdown', () => {
    const out = runIntelTool('queryCatalog', {}, fixture());
    const row = out.rows[0];
    expect(row.directSold).toBe(4);       // 3 fair + 1 website; the void excluded
    expect(row.consignSold).toBe(5);
    expect(row.gratuities).toBe(2);
    expect(row.breakEven.recovered).toBe(true);
  });

  it('leaves break-even out when no production cost is set', () => {
    const ctx = fixture();
    ctx.books.hound.productionCost = 0;
    expect(runIntelTool('queryCatalog', {}, ctx).rows[0].breakEven).toBeUndefined();
  });
});

describe('findAnomalies', () => {
  it('reports checked rules rather than opinions', () => {
    const out = runIntelTool('findAnomalies', {}, fixture());
    expect(out.byKind['category-alias']).toBe(2);        // "travel" and "Events"
    expect(out.byKind['missing-exchange-rate']).toBe(1);
    const alias = out.rows.find(r => r.kind === 'category-alias' && r.expenseId === 'b1');
    expect(alias.suggestedFix).toEqual({ target: 'businessExpense', field: 'category', value: 'Travel & Meals' });
  });

  it('spots one cost entered twice', () => {
    const ctx = fixture();
    ctx.taxCenter.businessExpenses.push({ ...ctx.taxCenter.businessExpenses[0], id: 'b3' });
    const out = runIntelTool('findAnomalies', {}, ctx);
    expect(out.byKind['possible-duplicate']).toBe(1);
  });

  it('puts what matters most at the top', () => {
    expect(runIntelTool('findAnomalies', {}, fixture()).rows[0].severity).toBe('high');
  });
});

describe('proposeEdits', () => {
  const propose = (edits, ctx = fixture(), summary = 'test') =>
    runIntelTool('proposeEdits', { summary, edits }, ctx);

  it('stages a change without making it', () => {
    const ctx = fixture();
    const out = propose([{ target: 'businessExpense', id: 'b1', field: 'category', value: 'Travel & Meals' }], ctx);
    expect(out.ok).toBe(true);
    expect(out.batch.items[0]).toMatchObject({
      target: 'businessExpense', field: 'cat', beforeText: 'travel', afterText: 'Travel & Meals', risk: 'descriptive',
    });
    // Nothing was written. This is the whole safety argument for the feature.
    expect(ctx.taxCenter.businessExpenses.find(e => e.id === 'b1').cat).toBe('travel');
  });

  it('puts ISBNs on books, which is the job it was widened for', () => {
    const ctx = fixture();
    ctx.books.other = book({ title: 'Other' });
    ctx.states.other = { hist: [], ledger: [], expenses: [], stores: [], chStats: {} };
    const out = propose([
      { target: 'book', id: 'hound', field: 'isbn', value: '978-0-306-40615-7' },
      { target: 'book', id: 'other', field: 'isbn', value: '0306406152' },
    ], ctx);
    expect(out.batch.items).toHaveLength(2);
    expect(out.batch.items.map(i => i.afterText)).toEqual(['978-0-306-40615-7', '0306406152']);
    expect(ctx.books.hound.isbn).toBeUndefined();
  });

  it('refuses an ISBN whose check digit does not match', () => {
    // A transposed digit is the realistic failure here, and it is invisible
    // until a shop cannot order the book.
    const out = propose([{ target: 'book', id: 'hound', field: 'isbn', value: '978-0-306-40615-6' }]);
    expect(out.ok).toBe(false);
    expect(out.rejected[0].reason).toMatch(/check digit/i);
  });

  it('stages the good rows and reports the bad ones, rather than refusing everything', () => {
    // Twelve ISBNs with one typo must not cost the other eleven.
    const out = propose([
      { target: 'book', id: 'hound', field: 'isbn', value: '9780306406157' },
      { target: 'book', id: 'ghost', field: 'isbn', value: '9780306406157' },
      { target: 'book', id: 'hound', field: 'listPrice', value: 'not a number' },
    ]);
    expect(out.ok).toBe(true);
    expect(out.batch.items).toHaveLength(1);
    expect(out.batch.rejected).toHaveLength(2);
    expect(out.batch.rejected[0].reason).toMatch(/no book with id "ghost"/i);
  });

  it('accepts a value written the way a person would write it', () => {
    const out = propose([{ target: 'book', id: 'hound', field: 'listPrice', value: 'CA$1,299.00' }]);
    expect(out.batch.items[0].after).toBe(1299);
  });

  it('will not touch a field that decides who can read a book', () => {
    // The author email builds the ownership map the security rules read, so it
    // is an access boundary rather than a data field.
    for (const field of ['authorEmail', 'authorPassword']) {
      const out = propose([{ target: 'book', id: 'hound', field, value: 'someone@example.com' }]);
      expect(out.ok).toBe(false);
      expect(out.rejected[0].reason).toMatch(/is not something that can be changed/i);
    }
  });

  it('marks the changes that move money', () => {
    const out = propose([
      { target: 'book', id: 'hound', field: 'isbn', value: '9780306406157' },
      { target: 'book', id: 'hound', field: 'listPrice', value: '30' },
    ]);
    expect(out.batch.moneyEditCount).toBe(1);
    expect(out.batch.items.find(i => i.field === 'listPrice').risk).toBe('money');
    expect(out.batch.items.find(i => i.field === 'isbn').risk).toBe('descriptive');
  });

  it('warns when the publisher and author shares would stop adding up', () => {
    // Nothing downstream would complain; it would just pay the wrong amount.
    const out = propose([{ target: 'book', id: 'hound', field: 'publisherSplitPct', value: '70' }]);
    expect(out.batch.warnings[0]).toMatch(/110%/);
  });

  it('does not warn when both halves of the split move together', () => {
    const out = propose([
      { target: 'book', id: 'hound', field: 'publisherSplitPct', value: '70' },
      { target: 'book', id: 'hound', field: 'authorSplitPct', value: '30' },
    ]);
    expect(out.batch.warnings).toEqual([]);
  });

  it('recalculates the Canadian figure when an amount changes', () => {
    // Every report reads the stamped figure in preference to the native one, so
    // a stale one would look applied on screen and change nothing in the totals.
    const ctx = fixture();
    ctx.taxCenter.businessExpenses[0].fxRate = 1;
    const out = propose([{ target: 'businessExpense', id: 'b1', field: 'amount', value: '150' }], ctx);
    expect(out.batch.items[0].sidePatch).toEqual({ baseAmount: 150 });
  });

  it('clears the Canadian figure when the currency itself changes', () => {
    const ctx = fixture();
    ctx.taxCenter.businessExpenses[0].currency = 'CAD';
    const out = propose([{ target: 'businessExpense', id: 'b1', field: 'currency', value: 'USD' }], ctx);
    expect(out.batch.items[0].sidePatch).toEqual({ baseAmount: null, fxMissing: true });
    expect(out.batch.items[0].sideEffect).toMatch(/exchange rate/i);
  });

  it('reaches shops and trip budgets too, not only books and expenses', () => {
    const ctx = fixture();
    ctx.states.hound.stores = [{ id: 's1', name: 'Bookshop', rate: 40 }];
    const out = propose([
      { target: 'store', id: 's1', bookId: 'hound', field: 'commissionPct', value: '45' },
      { target: 'tripBudget', id: 'Toronto Word Fair', field: 'amount', value: '500' },
    ], ctx);
    expect(out.batch.items.map(i => i.target)).toEqual(['store', 'tripBudget']);
    expect(ctx.states.hound.stores[0].rate).toBe(40);
    expect(ctx.taxCenter.tripBudgets['Toronto Word Fair']).toBe(400);
  });

  it('refuses a change that would change nothing', () => {
    const out = propose([{ target: 'businessExpense', id: 'b1', field: 'trip', value: 'Toronto Word Fair' }]);
    expect(out.ok).toBe(false);
    expect(out.rejected[0].reason).toMatch(/nothing to change/i);
  });

  it('refuses two edits to the same field in one batch', () => {
    // They would apply in array order and the first would vanish silently.
    const out = propose([
      { target: 'book', id: 'hound', field: 'isbn', value: '9780306406157' },
      { target: 'book', id: 'hound', field: 'isbn', value: '0306406152' },
    ]);
    expect(out.batch.items).toHaveLength(1);
    expect(out.batch.rejected[0].reason).toMatch(/already being changed/i);
  });

  it('refuses a category this app does not have', () => {
    const ctx = fixture();
    ctx.expenseCategories = ['Travel & Meals', 'Other'];
    const out = propose([{ target: 'businessExpense', id: 'b1', field: 'category', value: 'Yacht Hire' }], ctx);
    expect(out.ok).toBe(false);
    expect(out.rejected[0].reason).toMatch(/not one of this app/i);
  });

  it('refuses a kind of record it has no business writing to', () => {
    const out = propose([{ target: 'ledgerRow', id: '1', field: 'amount', value: '5' }]);
    expect(out.ok).toBe(false);
    expect(out.rejected[0].reason).toMatch(/not a kind of record/i);
  });

  it('caps how much can be put up for approval at once', () => {
    const many = Array.from({ length: MAX_EDITS_PER_BATCH + 1 }, () => (
      { target: 'book', id: 'hound', field: 'isbn', value: '9780306406157' }
    ));
    expect(propose(many).ok).toBe(false);
    expect(propose(many).error).toMatch(/most that can be put up/i);
  });

  it('says so plainly when handed nothing to do', () => {
    expect(propose([]).error).toMatch(/no changes were given/i);
  });
});
