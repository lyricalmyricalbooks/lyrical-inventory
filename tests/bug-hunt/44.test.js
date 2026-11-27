import { test, expect } from 'vitest';
import { dueDateFromTerms } from '../../src/lib/invoices.js';
test('impossible date', () => { expect(dueDateFromTerms('2026-02-31', 0)).toBe(''); });
