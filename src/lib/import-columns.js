// Reading one spreadsheet row of an order-history import: which column is the
// order number, the date, the quantity and the price, whatever the export
// called them, and what number a formatted cell really holds.

/** A header squashed for matching: "Order #" → "order", "Unit Price" → "unitprice". */
const squash = (key) => String(key).toLowerCase().replace(/[\s_#.\-:]/g, '');

// Exact names for the order-number column, best first. "Order Date" must never
// be read as the order number: every order that day would then share one
// number, and all but the first would be skipped as duplicates.
const ORDER_NUMBER_NAMES = ['order', 'ordernumber', 'orderno', 'ordernum', 'orderid', 'number', 'num', 'no', 'invoice', 'invoicenumber'];

/** The header of `row` to read `field` from ('' when there is none). */
export function importColumn(row, field) {
  const keys = Object.keys(row || {});
  const has = (k, part) => squash(k).includes(part);
  switch (field) {
    case 'num': {
      for (const name of ORDER_NUMBER_NAMES) {
        const hit = keys.find(k => squash(k) === name);
        if (hit) return hit;
      }
      return keys.find(k => (has(k, 'order') || has(k, 'num')) && !has(k, 'date')) || '';
    }
    case 'date': return keys.find(k => has(k, 'date')) || '';
    case 'chan': return keys.find(k => has(k, 'channel')) || keys.find(k => has(k, 'chan')) || '';
    case 'qty': return keys.find(k => has(k, 'qty')) || keys.find(k => has(k, 'quantity')) || '';
    case 'price': return keys.find(k => has(k, 'unit')) || keys.find(k => has(k, 'price')) || '';
    case 'notes': return keys.find(k => has(k, 'note')) || '';
    default: return '';
  }
}

/**
 * A spreadsheet cell as a number. Excel cells usually arrive as numbers
 * already; CSV cells are text, so currency symbols and thousands separators
 * ("$1,250.00") are dropped. A comma used as the decimal point ("30,00",
 * "1.250,00", as a French or European sheet writes it) is read as one.
 */
export function importAmount(value) {
  if (typeof value === 'number') return value;
  let text = String(value ?? '').replace(/[^\d.,-]/g, '');
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  // A comma after the last dot is the decimal point ("30,00", "1.250,00"),
  // unless it is a lone comma followed by exactly three digits ("1,250").
  const decimalComma = lastComma > lastDot && (lastDot !== -1 || text.length - lastComma - 1 !== 3);
  text = decimalComma ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  return parseFloat(text);
}

const blank = (v) => v === undefined || v === null || String(v).trim() === '';

/**
 * One import row read into { num, rawDate, chan, qty, price, notes }. A blank
 * quantity means one copy; a quantity of 0 or less (a cancelled line, or a
 * refund) is kept as written so the caller can leave it out rather than turn
 * it into a sale.
 */
export function mapImportRow(row) {
  const cell = (field) => { const k = importColumn(row, field); return k ? row[k] : ''; };
  const rawQty = cell('qty');
  const qty = blank(rawQty) ? 1 : importAmount(rawQty);
  const price = blank(cell('price')) ? 0 : (importAmount(cell('price')) || 0);
  return {
    num: String(cell('num') || ''),
    rawDate: cell('date') || '',
    chan: String(cell('chan') || 'Website'),
    qty: Number.isFinite(qty) ? Math.round(qty) : 0,
    price,
    notes: String(cell('notes') || ''),
  };
}
