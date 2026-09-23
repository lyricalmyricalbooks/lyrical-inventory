// CSV assembly (and, at the bottom, parsing).
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

// ── Parsing

// Split raw spreadsheet text (pasted rows or a .csv file's contents) into
// records of trimmed fields. Understands what Excel actually produces:
// quoted fields with commas inside ("Ackman, Jeremy"), doubled quotes for a
// literal quote (""), newlines inside a quoted Notes field, a UTF-8 BOM, and
// CRLF line endings. Tab-separated rows (Excel copy-paste) are detected per
// record so a comma inside an unquoted name can't split it.
export function splitDelimitedRecords(raw) {
  const text = String(raw == null ? '' : raw).replace(/^\uFEFF/, '');

  // Pass 1: cut into logical records at newlines that are outside quotes,
  // so a multi-line quoted Notes cell stays inside its record.
  const records = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQuotes = !inQuotes; cur += ch; }
    else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      records.push(cur);
      cur = '';
    } else cur += ch;
  }
  records.push(cur);

  // Pass 2: split each record into fields — tab-delimited when the record
  // contains a tab (Excel paste), comma otherwise — honoring quotes so a
  // quoted field can carry the delimiter, and unescaping doubled quotes.
  const splitFields = (rec, delim) => {
    const fields = [];
    let field = '';
    let q = false;
    for (let i = 0; i < rec.length; i++) {
      const ch = rec[i];
      if (q) {
        if (ch === '"') {
          if (rec[i + 1] === '"') { field += '"'; i++; }
          else q = false;
        } else field += ch;
      } else if (ch === '"' && field.trim() === '') {
        q = true;
        field = ''; // drop any stray spaces before the opening quote
      } else if (ch === delim) {
        fields.push(field.trim());
        field = '';
      } else field += ch;
    }
    fields.push(field.trim());
    return fields;
  };

  const result = [];
  for (const rec of records) {
    const fields = splitFields(rec, rec.includes('\t') ? '\t' : ',');
    if (fields.some(f => f !== '')) result.push(fields);
  }
  return result;
}

// A .csv file's contents as one object per data row, keyed by the header row —
// the same shape SheetJS's sheet_to_json({ defval: '' }) gives, so a CSV import
// can skip the Excel library (and its network fetch) entirely. Missing trailing
// cells read as ''; blank rows are dropped.
export function csvToObjects(raw) {
  const [headers = [], ...rows] = splitDelimitedRecords(raw);
  return rows.map(fields => Object.fromEntries(headers.map((h, i) => [h, fields[i] ?? ''])));
}
