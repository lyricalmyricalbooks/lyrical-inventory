import { test, expect } from 'vitest';
const P = process.env.COPY ? '../../src/lib/receipt-match.js' : '../../src/lib/receipt-match.js';
test('feb 31 rejected', async () => { const { dateFromName } = await import(P); expect(dateFromName('2026-02-31_x.pdf')).toBe(''); expect(dateFromName('2026-02-28_x.pdf')).toBe('2026-02-28'); });
