import { describe, it, expect } from 'vitest';
import { deductibleAmount, deductibleRate } from '../src/lib/deductibility.js';
import { canonicalExpenseCategory } from '../src/lib/expense-categories.js';

describe('deductibility', () => {
  it('limits Meals & Entertainment to 50%', () => {
    expect(deductibleRate('Meals & Entertainment')).toBe(0.5);
    expect(deductibleAmount('Meals & Entertainment', 80)).toBe(40);
  });

  it('rounds to the cent', () => {
    expect(deductibleAmount('Meals & Entertainment', 13.93)).toBe(6.97);
  });

  it('leaves every other category fully deductible, including Travel', () => {
    expect(deductibleRate('Travel')).toBe(1);
    expect(deductibleAmount('Printing & Production', 27701.58)).toBe(27701.58);
    expect(deductibleAmount(undefined, 12)).toBe(12);
  });

  it('treats missing or junk amounts as zero', () => {
    expect(deductibleAmount('Meals & Entertainment', null)).toBe(0);
    expect(deductibleAmount('Meals & Entertainment', 'abc')).toBe(0);
  });

  it('folds the retired "Travel & Meals" name onto "Travel"', () => {
    expect(canonicalExpenseCategory('Travel & Meals')).toBe('Travel');
    expect(canonicalExpenseCategory('travel and meals')).toBe('Travel');
    expect(deductibleRate(canonicalExpenseCategory('Travel & Meals'))).toBe(1);
  });

  it('folds spelling variants onto the canonical category', () => {
    expect(canonicalExpenseCategory('meals and entertainment')).toBe('Meals & Entertainment');
    expect(canonicalExpenseCategory('Entertainment')).toBe('Meals & Entertainment');
    expect(canonicalExpenseCategory('Meals')).toBe('Travel'); // legacy alias
  });
});
