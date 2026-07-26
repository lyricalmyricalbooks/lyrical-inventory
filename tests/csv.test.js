import { describe, it, expect } from 'vitest';
import { csvCell, csvRow, toCsv } from '../src/lib/csv.js';

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
