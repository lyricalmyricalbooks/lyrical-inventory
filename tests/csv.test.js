import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { csvCell, csvRow, csvToObjects, toCsv } from '../src/lib/csv.js';

// These exports go to an accountant and to spreadsheet imports, so a cell that
// silently shifts the columns after it is a real reporting error, not a
// cosmetic one. Before this module the escaping was written out by hand in
// about ten places and one export skipped it entirely.
describe('csvCell', () => {
  it('quotes every value, so no caller has to decide', () => {
    expect(csvCell('plain')).toBe('"plain"');
  });

  it('keeps a comma inside one field instead of splitting the row', () => {
    // "Sticks, Stones" is one book, not two columns.
    expect(csvCell('Sticks, Stones')).toBe('"Sticks, Stones"');
  });

  it('doubles embedded quotes', () => {
    expect(csvCell('6" x 9" prints')).toBe('"6"" x 9"" prints"');
  });

  it('keeps a newline inside the field', () => {
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('writes an empty cell for null and undefined, not the text "null"', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });

  it('keeps a numeric zero rather than blanking it', () => {
    // One of the replaced helpers used `(txt || '')`, which turned a real 0
    // into an empty cell — a missing figure in a financial export.
    expect(csvCell(0)).toBe('"0"');
    expect(csvCell(0.0)).toBe('"0"');
  });

  it('handles a value that is only quotes', () => {
    expect(csvCell('""')).toBe('""""""');
  });
});

describe('csvRow', () => {
  it('escapes each cell and joins with commas', () => {
    expect(csvRow(['a', 'b,c', 'd"e'])).toBe('"a","b,c","d""e"');
  });

  it('tolerates a missing row', () => {
    expect(csvRow(null)).toBe('');
    expect(csvRow([])).toBe('');
  });
});

describe('toCsv', () => {
  it('joins rows with newlines', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('"a","b"\n"c","d"');
  });

  it('emits CRLF when asked', () => {
    expect(toCsv([['a'], ['b']], { eol: '\r\n' })).toBe('"a"\r\n"b"');
  });

  it('prefixes the BOM only when asked', () => {
    expect(toCsv([['a']], { bom: true }).charCodeAt(0)).toBe(0xfeff);
    expect(toCsv([['a']]).charCodeAt(0)).not.toBe(0xfeff);
  });

  it('round-trips a comma-bearing title as a single field', () => {
    const csv = toCsv([['Title', 'Qty'], ['Sticks, Stones', 2]]);
    const secondRow = csv.split('\n')[1];
    expect(secondRow).toBe('"Sticks, Stones","2"');
  });

  it('tolerates no rows', () => {
    expect(toCsv([])).toBe('');
    expect(toCsv(null)).toBe('');
  });
});

// The order-history import reads .csv files with this instead of SheetJS, so a
// CSV import works offline before the Excel library has ever been downloaded.
describe('csvToObjects', () => {
  it('keys each data row by the header row, the way sheet_to_json does', () => {
    const text = '\uFEFFOrder #,Date,Channel,Qty,Unit Price,Notes\r\n'
      + '1001,2026-03-05,Website,2,25.00,"Signed, dedicated"\r\n'
      + '\r\n'
      + '1002,2026-03-06,Fair,1,20\r\n';
    expect(csvToObjects(text)).toEqual([
      { 'Order #': '1001', Date: '2026-03-05', Channel: 'Website', Qty: '2', 'Unit Price': '25.00', Notes: 'Signed, dedicated' },
      { 'Order #': '1002', Date: '2026-03-06', Channel: 'Fair', Qty: '1', 'Unit Price': '20', Notes: '' },
    ]);
  });

  it('tolerates an empty file or a header with no rows', () => {
    expect(csvToObjects('')).toEqual([]);
    expect(csvToObjects('Order,Qty\n')).toEqual([]);
  });
});

// The last two hand-rolled escapers (Stripe fees audit, mailing list) outlived
// the consolidation above. Doubling quotes by hand anywhere outside csv.js means
// a new export has re-invented csvCell, and may get the rules wrong again.
describe('no hand-rolled CSV escaping outside csv.js', () => {
  const files = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (path.endsWith('.js') && !path.endsWith(join('lib', 'csv.js'))) files.push(path);
    }
  };
  walk(join(__dirname, '..', 'src'));

  it('finds no other place doubling double quotes for a CSV cell', () => {
    const offenders = files.filter(f => readFileSync(f, 'utf8').includes(`.replace(/"/g, '""')`));
    expect(offenders).toEqual([]);
  });
});
