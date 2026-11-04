// Dates the owner sees must be the day on their own clock. toISOString() is
// UTC, which rolls over in the evening in Canada (and before breakfast east
// of UTC), so a stock handoff, an imported spreadsheet date or an undated
// receipt landed on the wrong day. The suite runs in UTC, where the two
// agree, so these run the modules in a child process on another clock.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runIn(tz, body) {
  const script = `
    import { transferAuthorStock } from './src/lib/inventory.js';
    import { parseImportDate } from './src/lib/import-batch.js';
    import { datePart } from './src/lib/receipt-naming.js';
    const out = {};
    ${body}
    console.log(JSON.stringify(out));`;
  const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, env: { ...process.env, TZ: tz }, encoding: 'utf8',
  });
  return JSON.parse(stdout.trim().split('\n').pop());
}

describe('dates use the local calendar day', () => {
  it('in Toronto at 9:30 pm, today is still today', () => {
    const out = runIn('America/Toronto', `
      const evening = new Date(2026, 9, 3, 21, 30);
      const RealDate = Date;
      globalThis.Date = class extends RealDate {
        constructor(...a) { super(...(a.length ? a : [evening.getTime()])); }
        static now() { return evening.getTime(); }
      };
      const s = { stock: 10, authorStock: 0, hist: [], ledger: [] };
      out.handoff = transferAuthorStock(s, { maxPrint: 10 }, 2, '').transfer.date;
      out.receipt = datePart('', evening);
      out.receiptParsed = datePart('Oct 3, 2026 9:30 PM', evening);
    `);
    expect(out).toEqual({ handoff: '2026-10-03', receipt: '2026-10-03', receiptParsed: '2026-10-03' });
  });

  it('a spreadsheet date cell (local midnight) keeps its day east of UTC', () => {
    const out = runIn('Europe/Berlin', `
      out.cell = parseImportDate(new Date(2025, 2, 4), { todayStr: 'x' }).date;
      // A few seconds short of midnight, as SheetJS can produce.
      out.drifted = parseImportDate(new Date(new Date(2025, 2, 4).getTime() - 28000), { todayStr: 'x' }).date;
    `);
    expect(out).toEqual({ cell: '2025-03-04', drifted: '2025-03-04' });
  });
});
