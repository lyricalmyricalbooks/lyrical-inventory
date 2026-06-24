/* Lyricalmyrical Inventory — Unified Backend (v10)
 * Features:
 *  1. Gmail scanner for Big Cartel order emails (unchanged behavior)
 *  2. Sheets sync with:
 *     - Per-book tabs + unified "Overview" tab
 *     - Void/delete by eventId (removes the matching row); any VOID/CANCEL
 *       write is treated as a delete so voided sales never linger
 *     - 'reset' action clears managed sheets for a clean client rebuild
 *       (wipes duplicates, stale VOID rows, and blank-CAD legacy rows)
 *     - CAD-equivalent column using live FX (cached 6h)
 *     - Cleaner formatting: frozen header, banding, currency formats, hidden ID col
 *  3. Email receipt scanner & fetcher (v5 additions)
 *  4. v6: receipt search actually returns results (GmailMessage has no
 *     getSnippet(), so every thread used to fail silently) and reports
 *     skipped threads instead of hiding them
 *  5. v7: getEmailContent excludes inline images so saved receipt files
 *     are real attachments, not signature logos
 *  6. v8: 'emailauthor' action sends artist payment-request emails, plus the
 *     'notifypublisher' approval-alert path. Bump flags any deploy still on v7
 *     (which lacks these) as outdated so the publisher knows to redeploy.
 *  7. v9: artist payment-request email can be routed through a third-party
 *     transactional email provider (Resend / Brevo / SendGrid / Mailgun /
 *     Postmark) via sendMail_, so it sends from a neutral "the app" address
 *     instead of the script owner's Gmail. Configure it in Script Properties
 *     (see configureMail_). With no provider configured it falls back to
 *     MailApp unchanged. Bump flags v8-and-older deploys as outdated.
 *  8. v10: adds a trailing "Invoice" column so consignment Sale rows carry the
 *     invoice number that bills them (blank on every other row). ensureSheet_
 *     now rewrites a managed sheet's header row in place when it drifts, so the
 *     new column self-labels on the next sync. Bump flags v9-and-older as
 *     outdated so the publisher redeploys to gain the column.
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
  'Notes',
  'Invoice'       // consignment sales: the invoice that bills them (blank otherwise)
];

const COL = HEADERS.reduce((m, h, i) => (m[h] = i + 1, m), {});

// ─────────────────────────────────────────────────────────────
// doGet: Gmail scanner (preserved) + default health check
// ─────────────────────────────────────────────────────────────
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'scanGmail') {
    return scanGmail_(e);
  }
  if (e && e.parameter && e.parameter.action === 'listReceiptEmails') {
    return listReceiptEmails_(e);
  }
  if (e && e.parameter && e.parameter.action === 'getEmailContent') {
    return getEmailContent_(e);
  }
  if (e && e.parameter && e.parameter.action === 'getBookData') {
    return getBookData_(e);
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return jsonOut_({
    service: 'lyrical-sheets-webhook-v11',
    scriptVersion: 'v11',
    capabilities: { reset: true, voidDeletes: true, providerEmail: true, invoiceColumn: true, getBookData: true },
    sheetName: ss ? ss.getName() : 'Standalone Script'
  });
}

function getBookData_(e) {
  try {
    const bookTitle = e.parameter.book;
    if (!bookTitle) return jsonOut_({ error: 'Book parameter required' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return jsonOut_({ error: 'Spreadsheet not active' });
    
    const rawName = bookTitle.trim();
    let sheetName = rawName.replace(/[:*?/\[\]\\]/g, '').substring(0, 95);
    if (!sheetName) sheetName = 'Overview';
    
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return jsonOut_({ book: bookTitle, rows: [] });
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return jsonOut_({ book: bookTitle, rows: [] });
    
    const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    const rows = values.map(r => {
      const obj = {};
      HEADERS.forEach((h, idx) => {
        obj[h] = r[idx];
      });
      return obj;
    });
    
    return jsonOut_({ book: bookTitle, rows });
  } catch (err) {
    return jsonOut_({ error: String(err) });
  }
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

function listReceiptEmails_(e) {
  // Wrap everything so any failure returns a CORS-safe JSON error. An uncaught
  // exception here makes Apps Script emit an HTML error page with no
  // Access-Control-Allow-Origin header, which the browser blocks and surfaces
  // as the opaque "Failed to fetch" instead of a readable message.
  try {
    const query = (e && e.parameter && e.parameter.q) || '';
    const limit = Math.min(100, parseInt((e && e.parameter && e.parameter.limit) || 50, 10) || 50);
    if (!query) {
      return jsonOut_({ error: 'Search query parameter q is required' });
    }

    // The mailbox actually being searched is the account that deployed this
    // Web App (Execute as: Me). Surfacing it lets the client confirm the search
    // is hitting the right Gmail instead of guessing.
    let account = '';
    try { account = Session.getEffectiveUser().getEmail() || ''; } catch (_) { account = ''; }

    const threads = GmailApp.search(query, 0, limit);
    const emails = [];
    let skipped = 0;
    let skipError = '';

    for (const thread of threads) {
      // Guard each thread so one unreadable message/attachment doesn't abort
      // the entire search.
      try {
        const messages = thread.getMessages();
        if (!messages.length) continue;
        // Get the latest message in the thread
        const msg = messages[messages.length - 1];
        // Skip inline images (logos, signatures) so the badge counts real
        // receipt files, and avoids pulling embedded marketing graphics.
        const attachments = msg.getAttachments({ includeInlineImages: false });

        // We only count PDF and image attachments for the list badge
        const relevantAttachments = attachments.filter(a => {
          const mime = a.getContentType();
          const name = a.getName();
          return /pdf|image/i.test(mime) || /\.(pdf|png|jpe?g|webp)$/i.test(name);
        });

        // GmailMessage has no getSnippet() — derive a preview from the plain
        // body instead. Guarded separately so an unreadable body still leaves
        // the email listed, just without a preview.
        let snippet = '';
        try {
          snippet = (msg.getPlainBody() || '').replace(/\s+/g, ' ').trim().substring(0, 180);
        } catch (_) { snippet = ''; }

        emails.push({
          id: msg.getId(),
          threadId: thread.getId(),
          subject: msg.getSubject() || '(No Subject)',
          from: msg.getFrom() || 'Unknown Sender',
          date: msg.getDate().toISOString(),
          snippet: snippet,
          hasAttachments: relevantAttachments.length > 0,
          attachmentCount: relevantAttachments.length,
          attachmentNames: relevantAttachments.map(a => a.getName())
        });
      } catch (threadErr) {
        // Record the failure instead of hiding it — if every thread fails,
        // the client can show why rather than a misleading "no emails matched".
        skipped++;
        if (!skipError) skipError = String(threadErr);
        continue;
      }
    }

    // Sort by date descending (should already be sorted but safe to ensure)
    emails.sort((a, b) => new Date(b.date) - new Date(a.date));

    return jsonOut_({
      ok: true,
      account: account,
      query: query,
      threadsFound: threads.length,
      count: emails.length,
      skipped: skipped,
      skipError: skipError,
      emails: emails
    });
  } catch (err) {
    return jsonOut_({ error: 'Gmail search failed: ' + String(err) });
  }
}

function getEmailContent_(e) {
  const id = e.parameter.id;
  if (!id) {
    return jsonOut_({ error: 'Message ID is required' });
  }

  try {
    const msg = GmailApp.getMessageById(id);
    if (!msg) {
      return jsonOut_({ error: 'Message not found' });
    }

    const body = msg.getPlainBody() || msg.getBody() || '';
    // Skip inline images (logos, signatures) — the client saves these files
    // into the local receipts folder, so only real attachments belong here.
    const attachments = msg.getAttachments({ includeInlineImages: false });
    const fileParts = [];

    for (const att of attachments) {
      const mime = att.getContentType();
      const name = att.getName();
      // Only process PDF and images to prevent huge payloads and Gemini limitations
      const isAllowed = /pdf|image/i.test(mime) || /\.(pdf|png|jpe?g|webp)$/i.test(name);
      if (isAllowed) {
        fileParts.push({
          name: name,
          mime: mime,
          base64: Utilities.base64Encode(att.getBytes())
        });
      }
    }

    return jsonOut_({
      ok: true,
      email: {
        id: msg.getId(),
        subject: msg.getSubject() || '',
        from: msg.getFrom() || '',
        date: msg.getDate().toISOString(),
        body: body,
        fileParts: fileParts
      }
    });
  } catch (err) {
    return jsonOut_({ error: 'Failed to fetch email: ' + String(err) });
  }
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

    // ── Publisher notification email ──
    if (action === 'notifypublisher') {
      const d = payload.payload || {};
      try {
        // Strip CR/LF (and other control chars) from any author-supplied value
        // before it lands in the subject or a body line, so a crafted title like
        // "Book\nBcc: evil@x.com" can't inject mail headers or extra lines.
        const clean_ = (s) => String(s == null ? '' : s).replace(/[\x00-\x1F\x7F]+/g, ' ').trim();
        const kind = clean_(d.kind || 'Submission');
        const needsAction = /approval|payment|transfer/i.test(kind);
        const prefix = needsAction ? '[ACTION REQUIRED]' : '[Lyrical Inventory]';
        const subject = `${prefix} ${kind} awaiting approval — ${clean_(d.bookTitle)}`;
        const body = [
          needsAction
            ? `An author submission requires your action: ${kind}.`
            : `A ${kind.toLowerCase()} from an author is awaiting your confirmation.`,
          '',
          `Book:      ${clean_(d.bookTitle)} (${clean_(d.bookId)})`,
          `Author:    ${clean_(d.authorEmail) || 'unknown'}`,
          `Submitted: ${clean_(d.submittedAt)}`,
          '',
          'Summary:',
          d.summary || '(no summary provided)',
          '',
          'Details:',
          JSON.stringify(d.data || {}, null, 2)
        ].join('\n');
        MailApp.sendEmail({
          to: 'lyricalmyricalbooks@gmail.com',
          subject: subject,
          body: body
        });
        return jsonOut_({ ok: true, notified: true });
      } catch (err) {
        return jsonOut_({ error: 'mail failed: ' + String(err) });
      }
    }

    // ── Email an author/artist (e.g. a payment request) ──
    if (action === 'emailauthor') {
      const d = payload.payload || {};
      try {
        // Strip CR/LF + control chars from header-bound values (subject, to) so a
        // crafted value can't inject extra mail headers. The body keeps newlines
        // but drops the other control chars for the same reason.
        const clean_ = (s) => String(s == null ? '' : s).replace(/[\x00-\x1F\x7F]+/g, ' ').trim();
        const cleanBody_ = (s) => String(s == null ? '' : s).replace(/\r/g, '').replace(/[\x00-\x09\x0B-\x1F\x7F]+/g, ' ').trim();
        const to = clean_(d.to);
        if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
          return jsonOut_({ error: 'invalid recipient' });
        }
        const bookTitle = clean_(d.bookTitle);
        const subject = clean_(d.subject) || ('Payment request' + (bookTitle ? ' — ' + bookTitle : ''));
        const body = cleanBody_(d.body) ||
          ('Hi,\n\nThis is a friendly reminder regarding outstanding payments' +
           (bookTitle ? ' for "' + bookTitle + '"' : '') +
           '. When you have a moment, please submit or forward any payments due so the ledger stays up to date.\n\nThank you,\nLyricalmyrical Books');
        // Route through sendMail_ so, when a transactional provider is
        // configured in Script Properties, the message goes out from a neutral
        // "the app" address instead of the script owner's Gmail. Reply-to is
        // intentionally left to the provider config (MAIL_REPLY_TO) rather than
        // hard-coding the publisher's Gmail, which would re-expose it.
        const sent = sendMail_({ to: to, subject: subject, body: body });
        return jsonOut_({ ok: true, emailed: true, via: sent.provider });
      } catch (err) {
        return jsonOut_({ error: 'mail failed: ' + String(err) });
      }
    }

    // ── Reset / rebuild: clear every managed sheet so the client can resend a
    // clean copy. Removes duplicate rows, stale VOID rows, and legacy rows with
    // a blank CAD Equivalent in one pass. The app remains the source of truth. ──
    if (action === 'reset' || action === 'rebuild') {
      const cleared = clearManagedSheets_(ss);
      refreshOverviewSummary_(ss);
      return jsonOut_({ ok: true, cleared });
    }

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

    // A voided/cancelled record must never persist as a row — remove any match
    // and stop, so the sheet only ever holds live entries. This is the backend
    // safety net behind the client's explicit delete on void.
    if (/VOID|CANCEL/i.test(String(data.status || ''))) {
      const removedVoid = stableId ? removeByEventId_(ss, stableId) : 0;
      refreshOverviewSummary_(ss);
      return jsonOut_({ ok: true, voided: true, removed: removedVoid });
    }

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

  const currency = normalizeCcy_(data.currency || data.paymentCurrency);
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
  row[COL.Invoice - 1]         = data.invoiceNum ?? '';

  sheet.appendRow(row);
}

function ensureSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (sheet) {
    const firstRow = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
    if (!firstRow || firstRow[0] !== '_eventId') {
      // Unmanaged / pre-v1 layout: push our header row on top of existing data.
      sheet.insertRowBefore(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    } else if (firstRow.length < HEADERS.length || HEADERS.some((h, i) => firstRow[i] !== h)) {
      // Managed sheet whose header drifted from this release (e.g. a column was
      // appended). Rewrite the header row in place so the new column is labelled.
      // Columns are only ever appended, so existing data rows stay aligned.
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
  sheet.setColumnWidth(COL.Invoice, 130);

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
  sheet.getRange(2, COL.Invoice, maxRow - 1, 1).setHorizontalAlignment('center').setFontFamily('Roboto Mono');
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

  lockDownSheet_(sheet);
}

// Convenience + integrity guards: a Currency dropdown on the data rows, and
// warning-only protection on the header row and the hidden _eventId column —
// the two things a stray fair-day edit could change to break sync matching.
// Warning-only never locks the owner out; it just prompts before an edit.
// Existing protections are detected by description so re-runs don't stack them.
function lockDownSheet_(sheet) {
  const maxRow = Math.max(sheet.getMaxRows(), 1000);

  const ccyRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'JPY', 'CHF'], true)
    .setAllowInvalid(true) // don't hard-reject legacy/un-normalized codes
    .build();
  sheet.getRange(2, COL.Currency, maxRow - 1, 1).setDataValidation(ccyRule);

  const existing = {};
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .forEach(p => { existing[p.getDescription()] = true; });
  if (!existing['LMB:header']) {
    sheet.getRange(1, 1, 1, HEADERS.length).protect()
      .setDescription('LMB:header').setWarningOnly(true);
  }
  if (!existing['LMB:id']) {
    sheet.getRange(1, COL._eventId, maxRow, 1).protect()
      .setDescription('LMB:id').setWarningOnly(true);
  }
}

function columnLetter_(col) {
  let s = '', n = col;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function removeByEventId_(ss, eventId) {
  let removed = 0;
  // Never match a blank id — that would risk deleting unrelated legacy rows
  // whose hidden id cell happens to be empty.
  if (eventId === '' || eventId === null || eventId === undefined) return 0;
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

// Clear all data rows (keeping the header) from every managed sheet — any tab
// whose A1 is "_eventId". Used by the 'reset' action so the client can rebuild
// a clean copy from the app (the source of truth), wiping duplicates, stale
// VOID rows, and legacy rows with a blank CAD Equivalent.
function clearManagedSheets_(ss) {
  let cleared = 0;
  const sheets = ss.getSheets();
  for (const sheet of sheets) {
    if (sheet.getLastColumn() < 1) continue;
    if (sheet.getRange(1, 1).getValue() !== '_eventId') continue; // managed only
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      sheet.deleteRows(2, lastRow - 1);
      cleared += (lastRow - 1);
    }
  }
  return cleared;
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

  // ── KPI panel (columns F–G), computed from Overview so it stays robust
  // regardless of how dates/currencies are stored. Refreshed on every sync. ──
  const kpi = computeOverviewKpis_(overview, ss.getSpreadsheetTimeZone());
  summary.getRange(1, 6, 1, 2).merge().setValue('Key numbers')
    .setFontWeight('bold').setFontSize(11).setFontFamily('Inter')
    .setBackground('#0f172a').setFontColor('#ffffff')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  const kpiRows = [
    ['Books sold (qty)', kpi.unitsSold],
    ['Revenue (CAD)',    kpi.revenueCAD],
    ['Entries (live)',   kpi.entries],
    ['Top book',         kpi.topBook || '—'],
    ['Top channel',      kpi.topChannel || '—'],
    [`This month (${kpi.monthLabel})`, kpi.monthCAD]
  ];
  summary.getRange(2, 6, kpiRows.length, 2).setValues(kpiRows);
  summary.setColumnWidth(5, 24);   // slim gap between the two panels
  summary.setColumnWidth(6, 185);
  summary.setColumnWidth(7, 150);
  summary.getRange(2, 6, kpiRows.length, 1).setFontWeight('bold');
  summary.getRange(2, 7, kpiRows.length, 1).setHorizontalAlignment('right');
  summary.getRange(2, 7).setNumberFormat('#,##0');                 // Books sold
  summary.getRange(4, 7).setNumberFormat('#,##0');                 // Entries
  summary.getRange(3, 7).setNumberFormat('"CA$"#,##0.00')          // Revenue
    .setFontColor('#064e3b').setFontWeight('bold').setBackground('#ecfdf5');
  summary.getRange(7, 7).setNumberFormat('"CA$"#,##0.00')          // This month
    .setFontColor('#064e3b').setFontWeight('bold').setBackground('#ecfdf5');
  summary.getRange(1, 6, kpiRows.length + 1, 2)
    .setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);
}

// Read the Overview tab and compute headline figures. "Books sold" counts only
// real sales (orders, plus consignment rows whose Event is "Sale") so that
// consignment shipments/returns don't inflate the tally. Revenue/top tallies
// use CAD Equivalent, which is 0 for non-sale consignment rows anyway.
function computeOverviewKpis_(overview, tz) {
  const zone = tz || 'America/Toronto';
  const out = {
    unitsSold: 0, revenueCAD: 0, entries: 0,
    topBook: '', topChannel: '', monthCAD: 0,
    monthLabel: Utilities.formatDate(new Date(), zone, 'yyyy-MM')
  };
  const lastRow = overview.getLastRow();
  if (lastRow < 2) return out;
  const values = overview.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const byBook = {}, byChan = {};
  for (const r of values) {
    const status = String(r[COL.Status - 1] || '').toUpperCase();
    if (status.indexOf('VOID') >= 0 || status.indexOf('CANCEL') >= 0) continue;
    const book = String(r[COL.Book - 1] || '').trim();
    const evnum = String(r[COL['Event/Num'] - 1] || '').trim();
    if (!book && !evnum) continue; // skip blank rows
    out.entries++;
    const qty = Number(r[COL.Qty - 1]) || 0;
    const cad = Number(r[COL['CAD Equivalent'] - 1]) || 0;
    const type = String(r[COL.Type - 1] || '').toLowerCase();
    const isSale = type === 'order' || (type === 'consignment' && /^sale$/i.test(evnum));
    if (isSale) out.unitsSold += qty;
    out.revenueCAD += cad;
    const chan = String(r[COL['Store/Chan'] - 1] || '').trim();
    if (book) byBook[book] = (byBook[book] || 0) + cad;
    if (chan) byChan[chan] = (byChan[chan] || 0) + cad;
    const d = r[COL.Date - 1];
    const mk = (d instanceof Date && !isNaN(d.getTime()))
      ? Utilities.formatDate(d, zone, 'yyyy-MM')
      : String(d || '').slice(0, 7);
    if (mk === out.monthLabel) out.monthCAD += cad;
  }
  out.topBook = topKey_(byBook);
  out.topChannel = topKey_(byChan);
  return out;
}

function topKey_(map) {
  let best = '', bestVal = -Infinity;
  for (const k in map) { if (map[k] > bestVal) { bestVal = map[k]; best = k; } }
  return best;
}

// ─────────────────────────────────────────────────────────────
// FX: cache 6h, fall back to last known or 1.0
// ─────────────────────────────────────────────────────────────
function convertToCAD_(amount, fromCcy) {
  const ccy = normalizeCcy_(fromCcy);
  if (!ccy || ccy === 'CAD') return amount;
  const rate = getFxRate_(ccy, 'CAD');
  if (!rate) return '';
  return Math.round(amount * rate * 100) / 100;
}

// Static fallback rates → CAD. Used only when both GOOGLEFINANCE and
// the live HTTP API fail (e.g. UrlFetchApp permission not granted yet).
// Approximate end-of-2024 rates — good enough for legacy backfill.
const FALLBACK_RATES_TO_CAD = {
  USD: 1.36, EUR: 1.47, GBP: 1.73, AUD: 0.90,
  JPY: 0.009, CHF: 1.55, MXN: 0.067, SEK: 0.13,
  NOK: 0.13,  DKK: 0.20
};

// Evaluate a GOOGLEFINANCE currency rate via a hidden helper sheet.
// If a date is given, returns the historical rate on that date (frozen);
// otherwise returns the current rate.
function evaluateGoogleFinanceRate_(from, to, dateObj) {
  if (!from || !to || from === to) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let helper = ss.getSheetByName('__FxHelper');
  if (!helper) {
    helper = ss.insertSheet('__FxHelper');
    helper.hideSheet();
  }
  const pair = `CURRENCY:${from}${to}`;
  const liveFallback = `IFERROR(GOOGLEFINANCE("${pair}"), "")`;
  let formula;
  if (dateObj instanceof Date && !isNaN(dateObj.getTime())) {
    const y = dateObj.getFullYear(), m = dateObj.getMonth() + 1, d = dateObj.getDate();
    formula = `=IFERROR(INDEX(GOOGLEFINANCE("${pair}","price",DATE(${y},${m},${d}),DATE(${y},${m},${d}+5),"DAILY"),2,2), ${liveFallback})`;
  } else {
    formula = `=${liveFallback}`;
  }
  try {
    helper.getRange('A1').setFormula(formula);
    SpreadsheetApp.flush();
    const v = helper.getRange('A1').getValue();
    helper.getRange('A1').clearContent();
    return (typeof v === 'number' && v > 0) ? v : null;
  } catch (e) {
    return null;
  }
}

// Try GOOGLEFINANCE (historical if date provided) → HTTP API → static
// fallback, in that order. Tracks failures so the backfill alert can
// surface them.
function getCadRateForRow_(fromCcy, dateObj, problems) {
  const ccy = normalizeCcy_(fromCcy);
  if (!ccy || ccy === 'CAD') return null;
  let rate = evaluateGoogleFinanceRate_(ccy, 'CAD', dateObj);
  if (rate) return rate;
  try {
    rate = getFxRate_(ccy, 'CAD');
    if (rate) return rate;
  } catch (_) {}
  if (FALLBACK_RATES_TO_CAD[ccy]) {
    if (problems) problems[ccy] = (problems[ccy] || 0) + 1;
    return FALLBACK_RATES_TO_CAD[ccy];
  }
  if (problems) problems[`${ccy}!`] = (problems[`${ccy}!`] || 0) + 1;
  return null;
}

function parseRowDate_(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

// Normalize messy currency inputs ("CA$", "C$", "$", "US$", "€", …) to
// 3-letter ISO codes so the Currency column and the FX lookup agree.
function normalizeCcy_(raw) {
  if (raw === null || raw === undefined) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const u = s.toUpperCase();
  const symMap = {
    'CA$': 'CAD', 'C$': 'CAD', 'CDN$': 'CAD', '$CAD': 'CAD',
    'US$': 'USD', 'USD$': 'USD', '$US': 'USD',
    '€': 'EUR', 'EUR€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
    'A$': 'AUD', 'AU$': 'AUD',
    'CHF': 'CHF',
    '$': 'CAD' // app's home currency
  };
  if (symMap[u]) return symMap[u];
  if (symMap[s]) return symMap[s];
  if (/^[A-Z]{3}$/.test(u)) return u;
  return u;
}

// Repair pass: normalize the Currency column (e.g. "CA$" → "CAD") and
// fill in missing CAD Equivalent values for non-CAD rows. Walks every
// managed sheet (any tab whose first column header is "_eventId"), so
// both the Overview tab and the per-book tabs get cleaned up. Uses
// GOOGLEFINANCE with the row's date for historical accuracy, falling
// back to live FX and a static rate table if those fail.
// Safe to re-run; only touches cells that need it.
function backfillCurrencyAndCad() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().filter(sh => {
    if (sh.getLastColumn() < 1 || sh.getLastRow() < 1) return false;
    return sh.getRange(1, 1).getValue() === '_eventId';
  });
  if (!sheets.length) {
    SpreadsheetApp.getUi().alert('No managed sheets found (looking for "_eventId" in A1).');
    return;
  }

  let totalNormalized = 0, totalFilled = 0;
  const perSheet = [];
  const fallbackUsage = {};

  for (const sheet of sheets) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;

    const ccyRange  = sheet.getRange(2, COL.Currency, lastRow - 1, 1);
    const totRange  = sheet.getRange(2, COL['Total/Amount'], lastRow - 1, 1);
    const cadRange  = sheet.getRange(2, COL['CAD Equivalent'], lastRow - 1, 1);
    const dateRange = sheet.getRange(2, COL.Date, lastRow - 1, 1);

    const ccyVals  = ccyRange.getValues();
    const totVals  = totRange.getValues();
    const cadVals  = cadRange.getValues();
    const dateVals = dateRange.getValues();

    let normalized = 0, filled = 0;
    for (let i = 0; i < ccyVals.length; i++) {
      const orig = ccyVals[i][0];
      const norm = normalizeCcy_(orig);
      if (norm && norm !== orig) {
        ccyVals[i][0] = norm;
        normalized++;
      }
      const ccy = ccyVals[i][0];
      const total = numOrBlank_(totVals[i][0]);
      const cad = cadVals[i][0];
      const cadBlank = cad === '' || cad === null || cad === undefined;
      if (cadBlank && total !== '' && ccy) {
        if (ccy === 'CAD') {
          cadVals[i][0] = total;
          filled++;
        } else {
          const rowDate = parseRowDate_(dateVals[i][0]);
          const rate = getCadRateForRow_(ccy, rowDate, fallbackUsage);
          if (rate) {
            cadVals[i][0] = Math.round(total * rate * 100) / 100;
            filled++;
          }
        }
      }
    }

    ccyRange.setValues(ccyVals);
    cadRange.setValues(cadVals);
    totalNormalized += normalized;
    totalFilled += filled;
    perSheet.push(`• ${sheet.getName()}: ${normalized} ccy, ${filled} CAD`);
  }

  // Clean up the hidden helper sheet so it doesn't linger.
  const helper = ss.getSheetByName('__FxHelper');
  if (helper) ss.deleteSheet(helper);

  refreshOverviewSummary_(ss);

  const fallbackNote = Object.keys(fallbackUsage).length
    ? `\n\nFX fallback used for: ${Object.entries(fallbackUsage).map(([k,v]) => `${k}×${v}`).join(', ')}`
    : '';
  SpreadsheetApp.getUi().alert(
    `Backfill done across ${sheets.length} sheet(s).\n` +
    `Currency cells normalized: ${totalNormalized}\n` +
    `CAD Equivalent cells filled: ${totalFilled}\n\n` +
    perSheet.join('\n') + fallbackNote
  );
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Inventory')
    .addItem('Normalize currencies + fill CAD', 'backfillCurrencyAndCad')
    .addItem('Monthly summary (CAD)', 'buildMonthlySummary')
    .addItem('Health check', 'healthCheck')
    .addToUi();
}

// ─────────────────────────────────────────────────────────────
// Monthly summary: a Month × Book pivot of CAD revenue (+ totals) on its own
// "Monthly (CAD)" tab, rebuilt on demand. Pulls from Overview, counts only
// real sales (skips voids and non-sale consignment rows), and is safe to
// re-run — it isn't a managed sheet, so reset/backfill leave it alone.
// ─────────────────────────────────────────────────────────────
function buildMonthlySummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const overview = ss.getSheetByName('Overview');
  if (!overview || overview.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('No data in Overview yet.');
    return;
  }
  const zone = ss.getSpreadsheetTimeZone();
  const values = overview.getRange(2, 1, overview.getLastRow() - 1, HEADERS.length).getValues();

  const byMonthBook = {};         // 'YYYY-MM' -> { book -> cad }
  const bookSet = {}, monthSet = {};
  for (const r of values) {
    const status = String(r[COL.Status - 1] || '').toUpperCase();
    if (status.indexOf('VOID') >= 0 || status.indexOf('CANCEL') >= 0) continue;
    const type = String(r[COL.Type - 1] || '').toLowerCase();
    const evnum = String(r[COL['Event/Num'] - 1] || '').trim();
    const isSale = type === 'order' || (type === 'consignment' && /^sale$/i.test(evnum));
    if (!isSale) continue;
    const cad = Number(r[COL['CAD Equivalent'] - 1]) || 0;
    if (!cad) continue;
    const book = String(r[COL.Book - 1] || '(unknown)').trim() || '(unknown)';
    const d = r[COL.Date - 1];
    const mk = (d instanceof Date && !isNaN(d.getTime()))
      ? Utilities.formatDate(d, zone, 'yyyy-MM')
      : String(d || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mk)) continue; // skip rows without a usable date
    (byMonthBook[mk] = byMonthBook[mk] || {});
    byMonthBook[mk][book] = (byMonthBook[mk][book] || 0) + cad;
    bookSet[book] = true; monthSet[mk] = true;
  }

  const months = Object.keys(monthSet).sort();
  const books = Object.keys(bookSet).sort();
  if (!months.length) {
    SpreadsheetApp.getUi().alert('No dated sales found to summarize.');
    return;
  }

  // Build the grid: header, one row per month, then a totals row.
  const header = ['Month'].concat(books, ['Total']);
  const grid = [header];
  const bookTotals = books.map(() => 0);
  let grand = 0;
  for (const m of months) {
    const row = [m];
    let monthTotal = 0;
    books.forEach((b, i) => {
      const v = (byMonthBook[m][b] || 0);
      row.push(v);
      monthTotal += v; bookTotals[i] += v;
    });
    row.push(monthTotal);
    grand += monthTotal;
    grid.push(row);
  }
  grid.push(['Total'].concat(bookTotals, [grand]));

  let sheet = ss.getSheetByName('Monthly (CAD)');
  if (!sheet) sheet = ss.insertSheet('Monthly (CAD)');
  else { sheet.clear(); sheet.clearConditionalFormatRules(); }

  const nCols = header.length, nRows = grid.length;
  sheet.getRange(1, 1, nRows, nCols).setValues(grid);

  // Formatting
  sheet.getRange(1, 1, 1, nCols)
    .setFontWeight('bold').setFontSize(11).setFontFamily('Inter')
    .setBackground('#0f172a').setFontColor('#ffffff')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 34);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
  sheet.getRange(2, 1, nRows - 1, 1).setFontWeight('bold'); // month labels
  sheet.getRange(2, 2, nRows - 1, nCols - 1)
    .setNumberFormat('"CA$"#,##0.00').setHorizontalAlignment('right');
  sheet.getRange(nRows, 1, 1, nCols).setBackground('#fef3c7').setFontWeight('bold');
  sheet.getRange(1, nCols, nRows, 1).setFontWeight('bold').setBackground('#ecfdf5').setFontColor('#064e3b');
  sheet.getRange(1, 1, nRows, nCols)
    .setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);
  sheet.setColumnWidth(1, 90);
  for (let c = 2; c <= nCols; c++) sheet.setColumnWidth(c, 130);

  SpreadsheetApp.getUi().alert(
    `Monthly summary rebuilt: ${months.length} month(s) × ${books.length} book(s).\n` +
    `Total CAD revenue: CA$${grand.toFixed(2)}`
  );
}

// ─────────────────────────────────────────────────────────────
// Health check: scan managed sheets for anomalies that would quietly break
// sync or totals, and report counts + a few examples. Read-only (touches
// nothing), so it's always safe to run.
// ─────────────────────────────────────────────────────────────
function healthCheck() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().filter(sh =>
    sh.getLastColumn() >= 1 && sh.getRange(1, 1).getValue() === '_eventId');
  if (!sheets.length) {
    SpreadsheetApp.getUi().alert('No managed sheets found (looking for "_eventId" in A1).');
    return;
  }

  const idCounts = {};            // id -> [locations]
  const blankId = [];
  const blankCad = [];
  let scanned = 0;

  for (const sheet of sheets) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;
    const vals = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    for (let i = 0; i < vals.length; i++) {
      const r = vals[i];
      const book = String(r[COL.Book - 1] || '').trim();
      const evnum = String(r[COL['Event/Num'] - 1] || '').trim();
      if (!book && !evnum) continue; // ignore blank rows
      scanned++;
      const where = `${sheet.getName()}!${i + 2}`;
      const id = String(r[COL._eventId - 1] || '').trim();
      if (!id) blankId.push(where);
      else (idCounts[id] = idCounts[id] || []).push(where);

      const status = String(r[COL.Status - 1] || '').toUpperCase();
      const isVoid = status.indexOf('VOID') >= 0 || status.indexOf('CANCEL') >= 0;
      const total = numOrBlank_(r[COL['Total/Amount'] - 1]);
      const cad = r[COL['CAD Equivalent'] - 1];
      const cadBlank = cad === '' || cad === null || cad === undefined;
      if (!isVoid && cadBlank && total !== '' && total !== 0) blankCad.push(where);
    }
  }

  const dupIds = Object.keys(idCounts).filter(id => idCounts[id].length > 1);
  const dupLocs = [];
  dupIds.forEach(id => idCounts[id].forEach(loc => dupLocs.push(loc)));

  const sample = (arr) => arr.slice(0, 6).join(', ') + (arr.length > 6 ? ', …' : '');
  const lines = [
    `Scanned ${scanned} row(s) across ${sheets.length} sheet(s).`,
    '',
    `• Duplicate sync IDs: ${dupIds.length}${dupIds.length ? '  (' + sample(dupLocs) + ')' : ''}`,
    `• Rows missing a sync ID: ${blankId.length}${blankId.length ? '  (' + sample(blankId) + ')' : ''}`,
    `• Live rows with a blank CAD Equivalent: ${blankCad.length}${blankCad.length ? '  (' + sample(blankCad) + ')' : ''}`,
    ''
  ];
  if (!dupIds.length && !blankId.length && !blankCad.length) {
    lines.push('✓ All clear — nothing to fix.');
  } else {
    lines.push('Tip: run "Repair legacy rows" in the app to fix IDs and refill CAD,');
    lines.push('or "Normalize currencies + fill CAD" to fill CAD in place.');
  }
  SpreadsheetApp.getUi().alert('Inventory health check', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
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

// ─────────────────────────────────────────────────────────────
// Outbound email — provider-agnostic sender
//
// By default email goes out through MailApp, which Google forces to send from
// the account that owns this script (e.g. lyricalmyricalbooks@gmail.com). To
// make payment-request emails come from a neutral "the app" address instead,
// configure a transactional email provider in this script's Script Properties
// (Project Settings ▸ Script Properties, or run configureMail_ once):
//
//   MAIL_PROVIDER   resend | brevo | sendgrid | mailgun | postmark
//   MAIL_API_KEY    the provider API key / server token
//   MAIL_FROM       a verified sender address, e.g. noreply@lyricalmyrical.app
//   MAIL_FROM_NAME  display name shown to recipients (optional, default below)
//   MAIL_REPLY_TO   where replies should go (optional; leave unset to keep the
//                   publisher's personal address hidden)
//   MAIL_DOMAIN     Mailgun sending domain        (Mailgun only)
//   MAIL_REGION     "eu" for Mailgun's EU region  (Mailgun only, optional)
//
// The API key lives in Script Properties on Google's servers — never in the
// repo or client code — so the static-hosting / no-client-secrets rule holds.
// If MAIL_PROVIDER (or the key / from address) is unset, this falls back to
// MailApp unchanged, so deployments keep working until a provider is set up.
function sendMail_(opts) {
  const props = PropertiesService.getScriptProperties();
  const provider = String(props.getProperty('MAIL_PROVIDER') || '').trim().toLowerCase();
  const apiKey = String(props.getProperty('MAIL_API_KEY') || '').trim();
  const fromEmail = String(props.getProperty('MAIL_FROM') || '').trim();
  const fromName = String(props.getProperty('MAIL_FROM_NAME') || 'Lyrical Inventory').trim();
  const replyTo = String(opts.replyTo || props.getProperty('MAIL_REPLY_TO') || '').trim();
  const to = String(opts.to || '').trim();
  const subject = String(opts.subject || '');
  const body = String(opts.body || '');

  // No provider configured → preserve the original MailApp behavior. This still
  // sends from the script owner's Gmail; only the display name is app-branded.
  if (!provider || !apiKey || !fromEmail) {
    const mailOpts = { to: to, subject: subject, body: body, name: fromName };
    if (replyTo) mailOpts.replyTo = replyTo;
    MailApp.sendEmail(mailOpts);
    return { provider: 'mailapp' };
  }

  const fromHeader = fromName ? (fromName + ' <' + fromEmail + '>') : fromEmail;
  let url, params;

  if (provider === 'resend') {
    url = 'https://api.resend.com/emails';
    const payload = { from: fromHeader, to: [to], subject: subject, text: body };
    if (replyTo) payload.reply_to = replyTo;
    params = {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + apiKey },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    };

  } else if (provider === 'brevo' || provider === 'sendinblue') {
    url = 'https://api.brevo.com/v3/smtp/email';
    const payload = {
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to }], subject: subject, textContent: body
    };
    if (replyTo) payload.replyTo = { email: replyTo };
    params = {
      method: 'post', contentType: 'application/json',
      headers: { 'api-key': apiKey, accept: 'application/json' },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    };

  } else if (provider === 'sendgrid') {
    url = 'https://api.sendgrid.com/v3/mail/send';
    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName },
      subject: subject,
      content: [{ type: 'text/plain', value: body }]
    };
    if (replyTo) payload.reply_to = { email: replyTo };
    params = {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + apiKey },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    };

  } else if (provider === 'mailgun') {
    const domain = String(props.getProperty('MAIL_DOMAIN') || '').trim();
    if (!domain) throw new Error('Mailgun needs MAIL_DOMAIN in Script Properties');
    const base = String(props.getProperty('MAIL_REGION') || '').trim().toLowerCase() === 'eu'
      ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
    url = base + '/v3/' + domain + '/messages';
    const form = { from: fromHeader, to: to, subject: subject, text: body };
    if (replyTo) form['h:Reply-To'] = replyTo;
    params = {
      method: 'post',
      headers: { Authorization: 'Basic ' + Utilities.base64Encode('api:' + apiKey) },
      payload: form, muteHttpExceptions: true
    };

  } else if (provider === 'postmark') {
    url = 'https://api.postmarkapp.com/email';
    const payload = {
      From: fromHeader, To: to, Subject: subject,
      TextBody: body, MessageStream: 'outbound'
    };
    if (replyTo) payload.ReplyTo = replyTo;
    params = {
      method: 'post', contentType: 'application/json',
      headers: { 'X-Postmark-Server-Token': apiKey, Accept: 'application/json' },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    };

  } else {
    throw new Error('Unknown MAIL_PROVIDER "' + provider + '" — use resend, brevo, sendgrid, mailgun or postmark');
  }

  const resp = UrlFetchApp.fetch(url, params);
  const code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(provider + ' send failed (' + code + '): ' + String(resp.getContentText()).slice(0, 500));
  }
  return { provider: provider };
}

// One-time setup convenience: fill in the blanks, run this once from the Apps
// Script editor (it writes the values into Script Properties), then BLANK the
// key out again and re-run, or just delete the key text, so the secret isn't
// left sitting in the script source. Prefer Project Settings ▸ Script
// Properties if you'd rather not paste the key here at all.
function configureMail_() {
  const cfg = {
    MAIL_PROVIDER: '',   // resend | brevo | sendgrid | mailgun | postmark
    MAIL_API_KEY: '',    // provider API key / server token
    MAIL_FROM: '',       // verified sender, e.g. noreply@lyricalmyrical.app
    MAIL_FROM_NAME: 'Lyrical Inventory',
    MAIL_REPLY_TO: '',   // optional
    MAIL_DOMAIN: '',     // Mailgun only
    MAIL_REGION: ''      // Mailgun only: "eu" or blank for US
  };
  const props = PropertiesService.getScriptProperties();
  Object.keys(cfg).forEach(function (k) {
    if (cfg[k] !== '') props.setProperty(k, String(cfg[k]));
  });
  Logger.log('Mail config saved for provider: ' + (cfg.MAIL_PROVIDER || '(unchanged)'));
}
