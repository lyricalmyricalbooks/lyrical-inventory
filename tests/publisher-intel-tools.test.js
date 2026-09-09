import { describe, it, expect } from 'vitest';
import {
  INTEL_TOOL_NAMES,
  INTEL_TOOL_SCHEMAS,
  IN_PERSON_CHANNELS,
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
    expect(alias.suggestedFix).toEqual({ kind: 'recategorizeExpense', value: 'Travel & Meals' });
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

describe('proposeCorrection', () => {
  const propose = (args, ctx = fixture()) => runIntelTool('proposeCorrection', args, ctx);

  it('describes the change without making it', () => {
    const ctx = fixture();
    const out = propose({ kind: 'recategorizeExpense', expenseId: 'b1', value: 'Travel & Meals' }, ctx);
    expect(out.ok).toBe(true);
    expect(out.proposal).toMatchObject({ before: 'travel', after: 'Travel & Meals', field: 'cat', scope: 'business' });
    // Nothing was written. This is the whole safety argument for the feature.
    expect(ctx.taxCenter.businessExpenses.find(e => e.id === 'b1').cat).toBe('travel');
  });

  it('refuses a change to a row that is not there', () => {
    expect(propose({ kind: 'recategorizeExpense', expenseId: 'nope', value: 'Other' }).ok).toBe(false);
  });

  it('refuses a category this app does not have', () => {
    const ctx = fixture();
    ctx.expenseCategories = ['Travel & Meals', 'Other'];
    const out = propose({ kind: 'recategorizeExpense', expenseId: 'b1', value: 'Yacht Hire' }, ctx);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/not one of this app/i);
  });

  it('refuses anything but the two reversible corrections', () => {
    const out = propose({ kind: 'voidExpense', expenseId: 'b1', value: 'x' });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/recategorizeExpense and setExpenseTrip/);
  });

  it('refuses a change that would change nothing', () => {
    expect(propose({ kind: 'setExpenseTrip', expenseId: 'b1', value: 'Toronto Word Fair' }).ok).toBe(false);
  });
});
