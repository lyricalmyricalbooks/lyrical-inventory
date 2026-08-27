import { describe, it, expect, beforeEach } from 'vitest';

describe('Production Cost Calculator from Tax Centre', () => {
  let mockTaxCenter;
  let mockStates;
  let mockBooks;
  let mockFxRates;

  beforeEach(() => {
    mockFxRates = {
      'CAD_CAD': 1,
      'EUR_CAD': 1.50,
      'CAD_EUR': 0.6666666666666666,
      'USD_CAD': 1.35,
      'CAD_USD': 0.7407407407407407,
      'EUR_EUR': 1,
      'USD_USD': 1
    };

    mockBooks = {
      'collective': {
        id: 'collective',
        title: 'Collective Photobook',
        currency: '€',
        listPrice: 40,
        maxPrint: 100,
        productionCost: 0
      },
      'zine-vol1': {
        id: 'zine-vol1',
        title: 'Lyrical Zine Vol 1',
        currency: '$',
        listPrice: 15,
        maxPrint: 200,
        productionCost: 500
      }
    };

    mockTaxCenter = {
      businessExpenses: [
        {
          id: 101,
          date: '2026-03-01',
          desc: 'Hardcover Offset Printing Run',
          vendor: 'Artisan Press Berlin',
          category: 'Manufacturing / Printing',
          amount: 4000,
          currency: 'EUR',
          bookId: 'collective'
        },
        {
          id: 102,
          date: '2026-03-10',
          desc: 'Cover Foil Stamping & Binding',
          vendor: 'Custom Binding Co',
          category: 'Printing',
          amount: 2000,
          currency: 'EUR',
          bookId: 'collective'
        },
        {
          id: 103,
          date: '2026-04-05',
          desc: 'Shipping Boxes & Bubble Mailers',
          vendor: 'Uline Canada',
          category: 'Supplies',
          amount: 150,
          currency: 'CAD',
          bookId: ''
        },
        {
          id: 104,
          date: '2026-05-01',
          desc: 'Annual Adobe InDesign License',
          vendor: 'Adobe Systems',
          category: 'Software / Subscriptions',
          amount: 360,
          currency: 'CAD',
          bookId: ''
        }
      ]
    };

    mockStates = {
      'collective': {
        expenses: [
          {
            id: 201,
            date: '2026-02-15',
            desc: 'Digital Proofing & Press Proofs',
            vendor: 'ColorProof Studio',
            category: 'Production',
            amount: 300,
            currency: 'EUR'
          }
        ]
      }
    };
  });

  function getNormalizedCurCode(cur) {
    if (!cur) return 'CAD';
    if (cur === '€' || cur === 'EUR') return 'EUR';
    if (cur === '$' || cur === 'CAD') return 'CAD';
    if (cur === 'USD' || cur === 'US$') return 'USD';
    if (cur === 'GBP' || cur === '£') return 'GBP';
    if (cur === 'MXN') return 'MXN';
    return cur;
  }

  function convertExpenseToTargetCurrency(amt, fromCur, toCur, fxRates) {
    if (!amt || isNaN(amt)) return 0;
    fromCur = getNormalizedCurCode(fromCur);
    toCur = getNormalizedCurCode(toCur);
    if (fromCur === toCur) return amt;

    const pairKey = `${fromCur}_${toCur}`;
    if (fxRates && fxRates[pairKey]) {
      return amt * fxRates[pairKey];
    }

    const invPairKey = `${toCur}_${fromCur}`;
    if (fxRates && fxRates[invPairKey] && fxRates[invPairKey] > 0) {
      return amt / fxRates[invPairKey];
    }

    const fromToCad = fromCur === 'CAD' ? 1 : (fxRates?.[`${fromCur}_CAD`] || 1);
    const toToCad = toCur === 'CAD' ? 1 : (fxRates?.[`${toCur}_CAD`] || 1);

    if (toToCad > 0) {
      return (amt * fromToCad) / toToCad;
    }

    return amt;
  }

  function isProductionCategory(cat) {
    if (!cat) return false;
    const lower = cat.toLowerCase();
    return lower.includes('print') || lower.includes('manufactur') || lower.includes('product') ||
           lower.includes('suppl') || lower.includes('proof') || lower.includes('bind') ||
           lower.includes('paper') || lower.includes('press') || lower.includes('cost of goods');
  }

  function collectAllExpenses(taxCenter, states, books) {
    const list = [];
    (taxCenter.businessExpenses || []).forEach(e => {
      list.push({
        id: String(e.id),
        date: e.date,
        desc: e.desc,
        vendor: e.vendor || '',
        category: e.category || 'General',
        amount: Number(e.amount) || 0,
        currency: getNormalizedCurCode(e.currency),
        bookId: e.bookId || ''
      });
    });

    Object.entries(states || {}).forEach(([bId, s]) => {
      if (s && Array.isArray(s.expenses)) {
        s.expenses.forEach(e => {
          list.push({
            id: `book_${bId}_${e.id}`,
            date: e.date,
            desc: e.desc,
            vendor: e.vendor || '',
            category: e.category || 'Production',
            amount: Number(e.amount) || 0,
            currency: getNormalizedCurCode(e.currency || books[bId]?.currency || 'CAD'),
            bookId: bId
          });
        });
      }
    });

    return list;
  }

  it('aggregates expenses from both global Tax Centre and per-book states', () => {
    const all = collectAllExpenses(mockTaxCenter, mockStates, mockBooks);
    expect(all.length).toBe(5);
    expect(all.some(e => e.id === '101')).toBe(true);
    expect(all.some(e => e.id === 'book_collective_201')).toBe(true);
  });

  it('identifies production categories reliably', () => {
    expect(isProductionCategory('Manufacturing / Printing')).toBe(true);
    expect(isProductionCategory('Printing')).toBe(true);
    expect(isProductionCategory('Production')).toBe(true);
    expect(isProductionCategory('Supplies')).toBe(true);
    expect(isProductionCategory('Digital Proofing & Press Proofs')).toBe(true);
    expect(isProductionCategory('Software / Subscriptions')).toBe(false);
    expect(isProductionCategory('Travel / Hotel')).toBe(false);
  });

  it('correctly converts multi-currency expenses to target book currency', () => {
    // 150 CAD converted to EUR (150 * (1/1.50) = 100 EUR)
    const converted = convertExpenseToTargetCurrency(150, 'CAD', 'EUR', mockFxRates);
    expect(converted).toBeCloseTo(100, 2);

    // 4000 EUR in EUR remains 4000 EUR
    const sameCur = convertExpenseToTargetCurrency(4000, 'EUR', 'EUR', mockFxRates);
    expect(sameCur).toBe(4000);
  });

  it('filters expenses by production presets and search query', () => {
    const all = collectAllExpenses(mockTaxCenter, mockStates, mockBooks);
    
    // Search for "foil"
    const query = 'foil';
    const foilMatches = all.filter(e => e.desc.toLowerCase().includes(query) || e.vendor.toLowerCase().includes(query));
    expect(foilMatches.length).toBe(1);
    expect(foilMatches[0].desc).toBe('Cover Foil Stamping & Binding');

    // Filter by book "collective"
    const bookMatches = all.filter(e => e.bookId === 'collective');
    expect(bookMatches.length).toBe(3); // 101, 102, 201
  });

  it('computes exact break-even production cost sum for collective photobook', () => {
    const all = collectAllExpenses(mockTaxCenter, mockStates, mockBooks);
    const selectedIds = new Set(['101', '102', 'book_collective_201']); // 4000 EUR + 2000 EUR + 300 EUR

    let totalEUR = 0;
    all.forEach(exp => {
      if (selectedIds.has(exp.id)) {
        totalEUR += convertExpenseToTargetCurrency(exp.amount, exp.currency, 'EUR', mockFxRates);
      }
    });

    expect(totalEUR).toBe(6300);

    // With 6300 EUR production cost and 40 EUR retail price:
    const listPrice = 40;
    const printRun = 100;
    const unitMfgCost = totalEUR / printRun; // 63.00
    const breakevenCopies = Math.ceil(totalEUR / listPrice); // 158 copies

    expect(unitMfgCost).toBe(63.00);
    expect(breakevenCopies).toBe(158);
  });
});
