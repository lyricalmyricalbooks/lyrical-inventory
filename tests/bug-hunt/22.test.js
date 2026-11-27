import { test, expect } from 'vitest';
import { bookForCode } from '../../src/lib/barcode-scan.js';
import { bookForCode as fixed } from '../../src/lib/barcode-scan.js';
const books = { a: { id: 'a', isbn: '9780306406157' } };
test('orig', () => expect(bookForCode('0306406152', books)?.id).toBe('a'));
test('fixed', () => expect(fixed('0306406152', books)?.id).toBe('a'));
