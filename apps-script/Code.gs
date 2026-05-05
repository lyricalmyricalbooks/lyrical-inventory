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
    const action = (
      payload.action ||
      (payload.payload && payload.payload.action) ||
      'add'
    ).toString().toLowerCase();

    // ── Void / delete: remove rows matching sheetsId (preferred) or eventId ──
    if (action === 'void' || action === 'delete') {
      const deleteId = (payload.payload && payload.payload.sheetsId) || eventId;
      if (!deleteId) return jsonOut_({ error: 'sheetsId or eventId required for void' });
      const removed = removeByEventId_(ss, deleteId);
      refreshOverviewSummary_(ss);
      return jsonOut_({ ok: true, removed });
    }

    // ── Add / Edit (upsert) ──
    // The client sends a stable sheetsId on the payload (set when the record
    // was first created). We prefer that over the queue-level eventId so that
    // edits and voids can match the original row.
    const data = payload.payload || {};
    const stableId = data.sheetsId || eventId || '';
    data._eventId = stableId;

    let replaced = 0;
    if (stableId) replaced = removeByEventId_(ss, stableId);

    const rawName = data.book ? String(data.book).trim() : 'Overview';
    let sheetName = rawName.replace(/[:*?/\[\]\\]/g, '').substring(0, 95);
    if (!sheetName) sheetName = 'Overview';

    processSheetEntry_(ss, sheetName, data);
    if (sheetName !== 'Overview') {
      processSheetEntry_(ss, 'Overview', data);
    }
    refreshOverviewSummary_(ss);
    return jsonOut_({ ok: true, replaced });
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

  // Prefer the CAD value captured at the time of sale (frozen rate) over a
  // live re-conversion. This keeps historical revenue from drifting as
  // rates change. Fall back to live FX only if nothing was captured.
  let cad = '';
  if (currency === 'CAD' && total !== '') {
    cad = total;
  } else if (data.convertedTotal !== undefined && data.convertedTotal !== '' && data.convertedTotal !== null) {
    cad = numOrBlank_(data.convertedTotal);
  } else if (data.paymentRate && total !== '') {
    cad = Math.round(total * parseFloat(data.paymentRate) * 100) / 100;
  } else if (currency && total !== '') {
    cad = convertToCAD_(total, currency);
  }

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
    const firstRow = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
    const looksOld = !firstRow || firstRow[0] !== '_eventId';
    if (looksOld) {
      sheet.insertRowBefore(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    }
    formatSheet_(sheet);
    return sheet;
  }
  sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  formatSheet_(sheet);
  return sheet;
}

function formatSheet_(sheet) {
  const lastCol = HEADERS.length;
  const maxRow  = Math.max(sheet.getMaxRows(), 1000);

  // ── HEADER ──────────────────────────────────────────────
  sheet.setRowHeight(1, 38);
  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange
    .setFontWeight('bold')
    .setFontSize(11)
    .setFontFamily('Inter')
    .setFontColor('#ffffff')
    .setBackground('#0f172a')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, '#0f172a', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.setFrozenRows(1);
  sheet.hideColumns(COL._eventId);

  // ── COLUMN WIDTHS ───────────────────────────────────────
  sheet.setColumnWidth(COL.Date, 105);
  sheet.setColumnWidth(COL.Book, 240);
  sheet.setColumnWidth(COL.Type, 95);
  sheet.setColumnWidth(COL['Event/Num'], 130);
  sheet.setColumnWidth(COL['Store/Chan'], 130);
  sheet.setColumnWidth(COL.Qty, 65);
  sheet.setColumnWidth(COL.Currency, 90);
  sheet.setColumnWidth(COL['Price/Rate'], 110);
  sheet.setColumnWidth(COL['Total/Amount'], 120);
  sheet.setColumnWidth(COL['CAD Equivalent'], 135);
  sheet.setColumnWidth(COL.Status, 95);
  sheet.setColumnWidth(COL.Notes, 320);

  // ── BODY DEFAULTS ───────────────────────────────────────
  const body = sheet.getRange(2, 1, maxRow - 1, lastCol);
  body
    .setFontFamily('Inter')
    .setFontSize(10)
    .setVerticalAlignment('middle');
  sheet.setRowHeights(2, maxRow - 1, 26);

  // Per-column number formats + alignment
  sheet.getRange(2, COL.Date, maxRow - 1, 1).setNumberFormat('yyyy-mm-dd').setHorizontalAlignment('center');
  sheet.getRange(2, COL.Type, maxRow - 1, 1).setHorizontalAlignment('center').setFontWeight('bold');
  sheet.getRange(2, COL['Event/Num'], maxRow - 1, 1).setHorizontalAlignment('center').setFontFamily('Roboto Mono');
  sheet.getRange(2, COL.Qty, maxRow - 1, 1).setNumberFormat('0').setHorizontalAlignment('center');
  sheet.getRange(2, COL.Currency, maxRow - 1, 1).setHorizontalAlignment('center').setFontWeight('bold');
  sheet.getRange(2, COL['Price/Rate'], maxRow - 1, 1).setNumberFormat('#,##0.00').setHorizontalAlignment('right');
  sheet.getRange(2, COL['Total/Amount'], maxRow - 1, 1).setNumberFormat('#,##0.00').setHorizontalAlignment('right');
  sheet.getRange(2, COL['CAD Equivalent'], maxRow - 1, 1)
    .setNumberFormat('"CA$"#,##0.00')
    .setHorizontalAlignment('right')
    .setFontWeight('bold')
    .setFontColor('#064e3b')
    .setBackground('#ecfdf5');
  sheet.getRange(2, COL.Status, maxRow - 1, 1).setHorizontalAlignment('center').setFontWeight('bold');

  // ── BANDING ─────────────────────────────────────────────
  try {
    const bandRange = sheet.getRange(1, 2, maxRow, lastCol - 1);
    bandRange.getBandings().forEach(b => b.remove());
    bandRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
      .setHeaderRowColor('#0f172a')
      .setFirstRowColor('#ffffff')
      .setSecondRowColor('#f1f5f9');
  } catch (_) {}

  // ── BORDERS (full grid) ─────────────────────────────────
  sheet.getRange(1, 2, maxRow, lastCol - 1)
    .setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);
  // Heavy left border on CAD column to set it apart
  sheet.getRange(1, COL['CAD Equivalent'], maxRow, 1)
    .setBorder(null, true, null, null, null, null, '#10b981', SpreadsheetApp.BorderStyle.SOLID_THICK);

  // ── CONDITIONAL FORMATTING ──────────────────────────────
  const rules = [];
  const dataRange = sheet.getRange(2, 2, maxRow - 1, lastCol - 1);
  const statusRange = sheet.getRange(2, COL.Status, maxRow - 1, 1);
  const typeRange = sheet.getRange(2, COL.Type, maxRow - 1, 1);
  const ccyRange = sheet.getRange(2, COL.Currency, maxRow - 1, 1);

  // Status pills
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('VOID').setBackground('#fee2e2').setFontColor('#991b1b').setBold(true)
    .setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('CANCEL').setBackground('#fee2e2').setFontColor('#991b1b').setBold(true)
    .setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('OK').setBackground('#dcfce7').setFontColor('#166534').setBold(true)
    .setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('PEND').setBackground('#fef9c3').setFontColor('#854d0e').setBold(true)
    .setRanges([statusRange]).build());

  // Strike-through entire row when status = VOID
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=REGEXMATCH(UPPER($${columnLetter_(COL.Status)}2),"VOID|CANCEL")`)
    .setFontColor('#9ca3af').setStrikethrough(true)
    .setRanges([dataRange]).build());

  // Type color tags (sale, expense, transfer, etc.)
  const typeColors = [
    ['SALE',     '#dbeafe', '#1e40af'],
    ['EXPENSE',  '#fee2e2', '#991b1b'],
    ['TRANSFER', '#ede9fe', '#5b21b6'],
    ['REFUND',   '#fed7aa', '#9a3412'],
    ['STOCK',    '#cffafe', '#155e75'],
    ['PRINT',    '#fce7f3', '#9d174d']
  ];
  typeColors.forEach(([word, bg, fg]) => {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains(word).setBackground(bg).setFontColor(fg).setBold(true)
      .setRanges([typeRange]).build());
  });

  // Currency tags
  const ccyColors = [
    ['CAD', '#fef2f2', '#b91c1c'],
    ['USD', '#ecfdf5', '#065f46'],
    ['EUR', '#eff6ff', '#1e3a8a'],
    ['GBP', '#fdf4ff', '#86198f'],
    ['AUD', '#fff7ed', '#9a3412'],
    ['JPY', '#f5f3ff', '#5b21b6']
  ];
  ccyColors.forEach(([word, bg, fg]) => {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(word).setBackground(bg).setFontColor(fg).setBold(true)
      .setRanges([ccyRange]).build());
  });

  sheet.setConditionalFormatRules(rules);
}

function columnLetter_(col) {
  let s = '', n = col;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
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
// Overview summary block — currency totals + CAD grand total
// Lives in a separate sheet ("__Summary") so it doesn't clutter rows.
// ─────────────────────────────────────────────────────────────
function refreshOverviewSummary_(ss) {
  const overview = ss.getSheetByName('Overview');
  if (!overview) return;
  let summary = ss.getSheetByName('__Summary');
  if (!summary) {
    summary = ss.insertSheet('__Summary');
  } else {
    summary.clear();
    summary.clearConditionalFormatRules();
  }

  const ovName = "'Overview'!";
  const ccyCol = columnLetter_(COL.Currency);
  const totCol = columnLetter_(COL['Total/Amount']);
  const cadCol = columnLetter_(COL['CAD Equivalent']);
  const statCol = columnLetter_(COL.Status);

  // Header
  summary.getRange(1, 1, 1, 4).setValues([['Currency', 'Entries', 'Total (native)', 'Total (CAD)']]);
  summary.getRange(1, 1, 1, 4)
    .setFontWeight('bold').setFontSize(11).setFontFamily('Inter')
    .setBackground('#0f172a').setFontColor('#ffffff')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  summary.setRowHeight(1, 36);
  summary.setFrozenRows(1);

  summary.setColumnWidth(1, 110);
  summary.setColumnWidth(2, 90);
  summary.setColumnWidth(3, 150);
  summary.setColumnWidth(4, 160);

  // One row per currency, generated as formulas so the sheet auto-updates
  // when you edit data in Overview directly.
  const ccyList = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'JPY'];
  const rows = ccyList.map(c => [
    c,
    `=COUNTIFS(${ovName}${ccyCol}:${ccyCol},"${c}",${ovName}${statCol}:${statCol},"<>VOID")`,
    `=SUMIFS(${ovName}${totCol}:${totCol},${ovName}${ccyCol}:${ccyCol},"${c}",${ovName}${statCol}:${statCol},"<>VOID")`,
    `=SUMIFS(${ovName}${cadCol}:${cadCol},${ovName}${ccyCol}:${ccyCol},"${c}",${ovName}${statCol}:${statCol},"<>VOID")`
  ]);
  summary.getRange(2, 1, rows.length, 4).setValues(rows);

  // Grand total in CAD
  const totalRow = rows.length + 2;
  summary.getRange(totalRow, 1).setValue('TOTAL (CAD)').setFontWeight('bold');
  summary.getRange(totalRow, 4).setFormula(`=SUM(D2:D${rows.length + 1})`).setFontWeight('bold');

  // Formatting
  summary.getRange(2, 1, rows.length, 1).setHorizontalAlignment('center').setFontWeight('bold');
  summary.getRange(2, 2, rows.length, 1).setHorizontalAlignment('center');
  summary.getRange(2, 3, rows.length, 1).setNumberFormat('#,##0.00').setHorizontalAlignment('right');
  summary.getRange(2, 4, rows.length + 1, 1)
    .setNumberFormat('"CA$"#,##0.00').setHorizontalAlignment('right')
    .setFontColor('#064e3b').setBackground('#ecfdf5').setFontWeight('bold');
  summary.getRange(1, 1, totalRow, 4)
    .setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);
  summary.getRange(totalRow, 1, 1, 4).setBackground('#fef3c7');
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
    // open.er-api.com — free, no API key required
    const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`;
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
