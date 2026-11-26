import { test, expect } from 'vitest';
import { dateFromName } from '../../src/lib/receipt-match.js';
test('finds later date', () => { expect(dateFromName('receipt_20261399_then_2026-04-20.pdf')).toBe('2026-04-20'); });
