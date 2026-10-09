import { describe, expect, test } from 'vitest';
import { salesForDay } from '../src/lib/today-summary.js';

const DAY = '2026-10-08';
const row = (o) => ({ num: 'A1', chan: 'In Person', qty: 1, price: 10, date: DAY, ...o });

describe('Today so far: what counts as sold today', () => {
  test('nothing sold gives zeros', () => {
    expect(salesForDay([{ id: 'a', hist: [] }], DAY)).toEqual({ sales: 0, units: 0, totals: {} });
    expect(salesForDay(undefined, DAY)).toEqual({ sales: 0, units: 0, totals: {} });
  });

  test('leaves out voids, gratuities (free copies) and other days', () => {
    const books = [{ id: 'a', currency: 'CAD', hist: [
      row({ num: '1', qty: 2, price: 20 }),
      row({ num: '2', voided: true }),
      row({ num: '3', chan: 'Gratuity', price: 0, gratuity: true }),
      row({ num: '4', chan: 'Gratuity', price: 0 }),
      row({ num: '5', date: '2026-10-07' }),
    ] }];
    expect(salesForDay(books, DAY)).toEqual({ sales: 1, units: 2, totals: { CAD: 40 } });
  });

  test('one checkout across two books is one sale', () => {
    const books = [
      { id: 'a', currency: 'CAD', hist: [row({ num: 'S1', chan: 'Book Fair', qty: 1, price: 40 })] },
      { id: 'b', currency: 'CAD', hist: [row({ num: 'S1', chan: 'Book Fair', qty: 2, price: 10 })] },
    ];
    expect(salesForDay(books, DAY)).toEqual({ sales: 1, units: 3, totals: { CAD: 60 } });
  });

  test('the same number on another channel is a different sale', () => {
    const books = [{ id: 'a', currency: 'CAD', hist: [row({ num: '7', chan: 'Website' }), row({ num: '7', chan: 'In Person' })] }];
    expect(salesForDay(books, DAY).sales).toBe(2);
  });

  test('rows with no number each count as a sale', () => {
    const books = [{ id: 'a', currency: 'CAD', hist: [row({ num: '' }), row({ num: '' })] }];
    expect(salesForDay(books, DAY).sales).toBe(2);
  });

  test('keeps currencies apart, preferring the currency each row was recorded in', () => {
    const books = [
      { id: 'a', currency: 'CAD', hist: [row({ num: '1', price: 40 })] },
      { id: 'b', currency: 'CAD', hist: [row({ num: '2', price: 25, cur: 'EUR' })] },
    ];
    expect(salesForDay(books, DAY).totals).toEqual({ CAD: 40, EUR: 25 });
  });

  test('counts sales held by the artist and consignment sales at the stored price, as the Dashboard does', () => {
    const books = [{ id: 'a', currency: 'CAD', hist: [
      row({ num: 'D1', artistPending: true, directToArtist: true, price: 30 }),
      row({ num: 'C1', chan: 'Consignment', consignmentLink: true, qty: 4, price: 6 }),
    ] }];
    expect(salesForDay(books, DAY)).toEqual({ sales: 2, units: 5, totals: { CAD: 54 } });
  });
});
