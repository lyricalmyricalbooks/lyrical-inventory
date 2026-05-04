/* Lyricalmyrical Inventory — Unified Backend (v3)
 * Features:
 *  1. Gmail scanner for Big Cartel order emails (unchanged behavior)
 *  2. Sheets sync with:
 *     - Per-book tabs + unified "Overview" tab
 *     - Void/delete by eventId (removes the matching row)
 *     - CAD-equivalent column using live FX (cached 6h)
 *     - Cleaner formatting: frozen header, banding, currency formats, hidden ID col
 */

const HEADERS = [
  '_eventId',     // hidden — used for void/delete lookups
  'Date',
  'Book',
  'Type',
  'Event/Num',
  'Store/Chan',
  'Qty',
  'Currency',
  'Price/Rate',
  'Total/Amount',
  'CAD Equivalent',
  'Status',
  'Notes'
];

const COL = HEADERS.reduce((m, h, i) => (m[h] = i + 1, m), {});

// ─────────────────────────────────────────────────────────────
// doGet: Gmail scanner (preserved) + default health check
// ─────────────────────────────────────────────────────────────
function doGet(e) {
  if (e.parameter && e.parameter.action === 'scanGmail') {
    return scanGmail_(e);
  }
  return jsonOut_({
    service: 'lyrical-sheets-webhook-v3',
    sheetName: SpreadsheetApp.getActiveSpreadsheet().getName()
  });
}

function scanGmail_(e) {
  const daysBack = parseInt(e.parameter.daysBack || 30);
  const threads = GmailApp.search(
    `from:support@bigcartel.com "You've received a new order!" newer_than:${daysBack}d`,
    0, 50
  );
  const orders = [];

  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      const body = msg.getPlainBody() || msg.getBody();
      if (!body) continue;

      const orderNumMatch = body.match(/Order number[\s\S]{0,100}?(#[A-Z0-9-]+)/i)
        || body.match(/(#[A-Z0-9]+-\d+)/i);
      const dateMatch = body.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,\s+\d{4})/i);
      const subtotalMatch = body.match(/(?:\n|\r|^|\s)Subtotal[\s\n]*\$?\s*([0-9.,]+)/i);

      let shipName='', shipAddr1='', shipCity='', shipProvince='', shipPostal='', shipCountry='', shipEmail='';
      const shipBlock = body.match(/Shipping address\s*\n+([\s\S]*?)(?:\n\s*\n|\n\s*Contact)/i);
      if (shipBlock) {
        const lines = shipBlock[1].split(/\r?\n/).map(l => l.trim()).filter(l => l);
        if (lines.length >= 3) {
          shipName = lines[0];
          shipAddr1 = lines[1];
          let bottomLine = lines[lines.length-1];
          let cityLine = lines[lines.length-2];
          if (!bottomLine.includes(',')) shipCountry = bottomLine;
          else cityLine = bottomLine;
          const cityMatch = cityLine.match(/^(.*?),\s*(.*?)\s+([A-Z0-9\s-]+)$/i);
          if (cityMatch) {
            shipCity = cityMatch[1].trim();
            shipProvince = cityMatch[2].trim();
            shipPostal = cityMatch[3].trim();
          } else {
            shipCity = cityLine;
          }
        }
      }
      const emailMatch = body.match(/Contact and payment info\s*\n+([^\s]+@[^\s]+)/i);
      if (emailMatch) shipEmail = emailMatch[1].trim();

      if (orderNumMatch) {
        orders.push({
          id: msg.getId(),
          orderNum: orderNumMatch[1].trim(),
          date: dateMatch ? dateMatch[1].trim() : msg.getDate().toISOString().split('T')[0],
          price: subtotalMatch ? parseFloat(subtotalMatch[1].replace(/,/g, '')) : 0,
          customer: shipName,
          email: shipEmail,
          shipName, shipAddr1, shipCity, shipProvince, shipPostal, shipCountry,
          body: body.substring(0, 1500)
        });
      }
    }
  }
  return jsonOut_({ ok: true, orders });
}

// ─────────────────────────────────────────────────────────────
// doPost: sync (add) + void/delete by eventId
// ─────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.version !== 2) {
      return jsonOut_({ error: 'Unknown payload format' });
    }

    const eventId = payload.eventId;
    if (eventId && eventId.toString().startsWith('probe-')) {
      return jsonOut_({ ok: true });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = (payload.action || 'add').toLowerCase();

    // ── Void / delete: remove rows matching eventId from all tabs ──
    if (action === 'void' || action === 'delete') {
      if (!eventId) return jsonOut_({ error: 'eventId required for void' });
      const removed = removeByEventId_(ss, eventId);
      return jsonOut_({ ok: true, removed });
    }

    // ── Add ──
    const data = payload.payload || {};
    data._eventId = eventId || '';

    const rawName = data.book ? String(data.book).trim() : 'Overview';
    let sheetName = rawName.replace(/[:*?/\[\]\\]/g, '').substring(0, 95);
    if (!sheetName) sheetName = 'Overview';

    processSheetEntry_(ss, sheetName, data);
    if (sheetName !== 'Overview') {
      processSheetEntry_(ss, 'Overview', data);
    }
    return jsonOut_({ ok: true });
  } catch (err) {
    return jsonOut_({ error: String(err) });
  }
}

// ─────────────────────────────────────────────────────────────
// Sheet helpers
// ─────────────────────────────────────────────────────────────
function processSheetEntry_(ss, sheetName, data) {
  const sheet = ensureSheet_(ss, sheetName);

  const currency = (data.currency || data.paymentCurrency || '').toUpperCase();
  const total = numOrBlank_(data.amountDue ?? data.total);
  const cad = (currency && total !== '') ? convertToCAD_(total, currency) : '';

  const row = new Array(HEADERS.length).fill('');
  row[COL._eventId - 1]        = data._eventId || '';
  row[COL.Date - 1]            = data.date ?? '';
  row[COL.Book - 1]            = data.book ?? '';
  row[COL.Type - 1]            = data.type ?? '';
  row[COL['Event/Num'] - 1]    = data.event ?? data.num ?? '';
  row[COL['Store/Chan'] - 1]   = data.store ?? data.chan ?? '';
  row[COL.Qty - 1]             = numOrBlank_(data.qty);
  row[COL.Currency - 1]        = currency;
  row[COL['Price/Rate'] - 1]   = numOrBlank_(data.rate ?? data.price);
  row[COL['Total/Amount'] - 1] = total;
  row[COL['CAD Equivalent'] - 1] = cad;
  row[COL.Status - 1]          = data.status ?? 'OK';
  row[COL.Notes - 1]           = data.notes ?? '';

  sheet.appendRow(row);
}

function ensureSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (sheet) {
    // Migrate older sheets missing the new columns
    const firstRow = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
    const looksOld = !firstRow || firstRow[0] !== '_eventId';
    if (looksOld) {
      // Insert a fresh header row at top; keep existing data below as-is
      sheet.insertRowBefore(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      formatSheet_(sheet);
    }
    return sheet;
  }
  sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  formatSheet_(sheet);
  return sheet;
}

function formatSheet_(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange
    .setFontWeight('bold')
    .setBackground('#1f2937')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('left');
  sheet.setFrozenRows(1);

  // Hide internal ID column
  sheet.hideColumns(COL._eventId);

  // Column widths
  sheet.setColumnWidth(COL.Date, 100);
  sheet.setColumnWidth(COL.Book, 220);
  sheet.setColumnWidth(COL.Type, 80);
  sheet.setColumnWidth(COL['Event/Num'], 120);
  sheet.setColumnWidth(COL['Store/Chan'], 120);
  sheet.setColumnWidth(COL.Qty, 60);
  sheet.setColumnWidth(COL.Currency, 80);
  sheet.setColumnWidth(COL['Price/Rate'], 100);
  sheet.setColumnWidth(COL['Total/Amount'], 110);
  sheet.setColumnWidth(COL['CAD Equivalent'], 120);
  sheet.setColumnWidth(COL.Status, 80);
  sheet.setColumnWidth(COL.Notes, 300);

  // Number formats on money columns (whole sheet downward)
  const lastRow = Math.max(sheet.getMaxRows(), 1000);
  sheet.getRange(2, COL['Price/Rate'], lastRow - 1, 1).setNumberFormat('#,##0.00');
  sheet.getRange(2, COL['Total/Amount'], lastRow - 1, 1).setNumberFormat('#,##0.00');
  sheet.getRange(2, COL['CAD Equivalent'], lastRow - 1, 1).setNumberFormat('"CA$"#,##0.00');
  sheet.getRange(2, COL.Qty, lastRow - 1, 1).setNumberFormat('0');

  // Alternating row banding
  try {
    const bandRange = sheet.getRange(1, 2, lastRow, HEADERS.length - 1); // skip hidden col
    const bandings = bandRange.getBandings();
    bandings.forEach(b => b.remove());
    bandRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY)
      .setHeaderRowColor('#1f2937')
      .setFirstRowColor('#ffffff')
      .setSecondRowColor('#f6f8fa');
  } catch (_) {}

  // Conditional format: red text for VOID/CANCELLED status
  const rules = sheet.getConditionalFormatRules();
  const statusRange = sheet.getRange(2, COL.Status, lastRow - 1, 1);
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains('VOID')
      .setFontColor('#b91c1c')
      .setBold(true)
      .setRanges([statusRange])
      .build()
  );
  sheet.setConditionalFormatRules(rules);
}

function removeByEventId_(ss, eventId) {
  let removed = 0;
  const sheets = ss.getSheets();
  for (const sheet of sheets) {
    if (sheet.getLastRow() < 2) continue;
    const firstRow = sheet.getRange(1, 1).getValue();
    if (firstRow !== '_eventId') continue; // only our managed sheets
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    // Iterate from bottom so row indices stay valid as we delete
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(eventId)) {
        sheet.deleteRow(i + 2);
        removed++;
      }
    }
  }
  return removed;
}

// ─────────────────────────────────────────────────────────────
// FX: cache 6h, fall back to last known or 1.0
// ─────────────────────────────────────────────────────────────
function convertToCAD_(amount, fromCcy) {
  if (!fromCcy || fromCcy === 'CAD') return amount;
  const rate = getFxRate_(fromCcy, 'CAD');
  if (!rate) return '';
  return Math.round(amount * rate * 100) / 100;
}

function getFxRate_(from, to) {
  const cache = CacheService.getScriptCache();
  const key = `fx_${from}_${to}`;
  const hit = cache.get(key);
  if (hit) return parseFloat(hit);

  try {
    const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      const j = JSON.parse(resp.getContentText());
      const r = j && j.rates && j.rates[to];
      if (r) {
        cache.put(key, String(r), 21600); // 6h
        PropertiesService.getScriptProperties().setProperty(key, String(r));
        return r;
      }
    }
  } catch (_) {}

  // Fallback to last persisted value
  const persisted = PropertiesService.getScriptProperties().getProperty(key);
  return persisted ? parseFloat(persisted) : null;
}

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────
function numOrBlank_(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? '' : n;
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
