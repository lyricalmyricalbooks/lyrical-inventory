// CSV assembly.
//
// This existed in about ten places, written slightly differently each time —
// `esc`, `cell`, or inlined into a template literal — and one export skipped
// escaping altogether and interpolated values straight into the row. Whether a
// book titled "Sticks, Stones" exported as one column or two came down to which
// screen you exported it from.

// Always quoted, never conditionally.
//
// A quoted field is the only form that is safe for all three characters that
// can break a row — comma, double quote, newline — so quoting unconditionally
// removes the need to decide, and to get that decision right in ten places.
// The cost is a few bytes per cell; every spreadsheet and parser strips the
// quotes on the way back in.
//
// null and undefined become an empty cell. Several of the old copies used
// `String(c)`, which wrote the literal text `null` into the file for a missing
// value; others used `(txt || '')`, which also turned a real numeric 0 into an
// empty cell. Neither is what an export should say.
export function csvCell(value) {
  if (value == null) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

// One record. Cells are escaped here so callers can't forget to.
export function csvRow(cells) {
  return (cells || []).map(csvCell).join(',');
}

/**
 * Rows (arrays of raw, unescaped values) to a complete CSV document.
 *
 * @param {Array<Array<*>>} rows
 * @param {object}  [opts]
 * @param {boolean} [opts.bom]  Prefix U+FEFF. Excel needs it to read UTF-8 as
 *   UTF-8 rather than as the local codepage, which is the difference between
 *   an accented title surviving a round trip and arriving as mojibake. Off by
 *   default because some parsers treat it as data, and the exports that did not
 *   already emit it may be feeding one.
 * @param {string}  [opts.eol]  RFC 4180 says CRLF; '\n' is the norm here and
 *   is what every consumer of these files already accepts.
 */
export function toCsv(rows, { bom = false, eol = '\n' } = {}) {
  const body = (rows || []).map(csvRow).join(eol);
  return bom ? '﻿' + body : body;
}
