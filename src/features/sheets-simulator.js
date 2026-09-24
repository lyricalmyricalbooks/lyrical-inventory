// Google Sheets sandbox simulator — what the practice (test) book writes to
// instead of a real spreadsheet. Rows land in localStorage under
// lm-mock-sheet-data and are drawn as a fake spreadsheet on the Sheets tab,
// so a publisher can rehearse syncing without touching their real sheet.
//
// Lifted out of src/main.js as one unit. main.js and this module import from
// each other; that cycle is fine because nothing here reads an imported name
// at module-evaluation time — every export is a function called later. The
// inline onclick handlers reach these through the Object.assign(window, …)
// list in main.js's startup, as before.
import {
  $,
  activeBook,
  isTestBookId,
  sheetsSpreadsheetUrl,
  sheetsUrl,
  showToast,
} from '../main.js';
import { escapeHtml } from '../lib/html.js';

let activeSimTab = 'Overview';

async function simulatePostToSheets(body) {
  // Simulate network latency (800ms)
  await new Promise(resolve => setTimeout(resolve, 800));

  const payload = body;
  const action = (payload.action || (payload.payload && payload.payload.action) || 'add').toString().toLowerCase();

  let mockData = {};
  try {
    mockData = JSON.parse(localStorage.getItem('lm-mock-sheet-data')) || {};
  } catch (e) {
    mockData = {};
  }

  if (!mockData['Overview']) mockData['Overview'] = [];
  if (!mockData['test1']) mockData['test1'] = [];

  const headers = [
    '_eventId', 'Date', 'Book', 'Type', 'Event/Num', 'Store/Chan',
    'Qty', 'Currency', 'Price/Rate', 'Total/Amount', 'CAD Equivalent',
    'Status', 'Notes', 'Invoice'
  ];

  if (action === 'reset' || action === 'rebuild') {
    Object.keys(mockData).forEach(k => {
      mockData[k] = [];
    });
    localStorage.setItem('lm-mock-sheet-data', JSON.stringify(mockData));
    if (typeof renderMockSpreadsheet === 'function') renderMockSpreadsheet();
    return { ok: true, reset: true, replaced: 0, removed: 0 };
  }

  let rows = [];
  if (action === 'batch') {
    rows = (payload.payload && payload.payload.rows) || payload.rows || [];
  } else if (action === 'notifypublisher') {
    return { ok: true, notified: true };
  } else if (action === 'emailauthor') {
    return { ok: true, emailed: true, via: 'mock-provider' };
  } else {
    rows = [payload.payload || payload];
  }

  let added = 0, deleted = 0, voided = 0, replaced = 0;

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i] || {};
    const rowAction = String(item.action || action || 'add').toLowerCase();
    const stableId = item.sheetsId || item.id || '';

    // Deletions / Voids
    if (rowAction === 'void' || rowAction === 'delete' || /VOID|CANCEL/i.test(String(item.status || ''))) {
      if (stableId) {
        Object.keys(mockData).forEach(tab => {
          const origLen = mockData[tab].length;
          mockData[tab] = mockData[tab].filter(r => r[0] !== stableId);
          deleted += (origLen - mockData[tab].length);
        });
        if (rowAction === 'void' || /VOID|CANCEL/i.test(String(item.status || ''))) {
          voided++;
        }
      }
      continue;
    }

    // Upsert: delete existing first
    if (stableId) {
      Object.keys(mockData).forEach(tab => {
        const origLen = mockData[tab].length;
        mockData[tab] = mockData[tab].filter(r => r[0] !== stableId);
        if (origLen > mockData[tab].length) replaced++;
      });
    }

    const currency = item.currency || item.paymentCurrency || 'EUR';
    const total = item.amountDue ?? item.total ?? 0;

    let cad = '';
    if (currency === 'CAD') {
      cad = total;
    } else if (item.convertedTotal !== undefined && item.convertedTotal !== '' && item.convertedTotal !== null) {
      cad = item.convertedTotal;
    } else if (item.paymentRate && total !== '') {
      cad = Math.round(total * parseFloat(item.paymentRate) * 100) / 100;
    } else {
      cad = Math.round(total * 1.5 * 100) / 100; // Mock exchange rate
    }

    const row = new Array(headers.length).fill('');
    row[0] = stableId;
    row[1] = item.date ?? '';
    row[2] = item.book ?? '';
    row[3] = item.type ?? '';
    row[4] = item.event ?? item.num ?? '';
    row[5] = item.store ?? item.chan ?? '';
    row[6] = item.qty ?? '';
    row[7] = currency;
    row[8] = item.rate ?? item.price ?? '';
    row[9] = total;
    row[10] = cad;
    row[11] = item.status ?? 'OK';
    row[12] = item.notes ?? '';
    row[13] = item.invoiceNum ?? '';

    const rawName = item.book ? String(item.book).trim() : 'Overview';
    let sheetName = rawName.replace(/[:*?/\[\]\\]/g, '').substring(0, 95);
    if (!sheetName) sheetName = 'Overview';

    if (!mockData[sheetName]) mockData[sheetName] = [];
    mockData[sheetName].push(row);

    if (sheetName !== 'Overview') {
      if (!mockData['Overview']) mockData['Overview'] = [];
      mockData['Overview'].push(row);
    }

    added++;
  }

  localStorage.setItem('lm-mock-sheet-data', JSON.stringify(mockData));
  if (typeof renderMockSpreadsheet === 'function') renderMockSpreadsheet();

  return { ok: true, count: rows.length, added, deleted, voided, replaced };
}

function renderMockSpreadsheet() {
  const headers = [
    'Date', 'Book', 'Type', 'Event/Num', 'Store/Chan',
    'Qty', 'Currency', 'Price/Rate', 'Total/Amount', 'CAD Equivalent',
    'Status', 'Notes', 'Invoice'
  ];

  const headerRow = $('sim-sheet-headers');
  const rowsBody = $('sim-sheet-rows');
  const tabsContainer = $('sim-sheet-tabs');
  const countEl = $('sim-sheet-row-count');

  if (!headerRow || !rowsBody || !tabsContainer) return;

  // Render headers
  let headersHtml = `<th style="background:#22222e; color:rgba(255,255,255,0.6); font-weight:normal; text-align:center; padding:6px; border:var(--stroke-hair) solid rgba(255,255,255,0.08); width:30px; user-select:none;"></th>`;
  headers.forEach(h => {
    headersHtml += `<th style="padding:6px 10px; border:var(--stroke-hair) solid rgba(255,255,255,0.08); background:#22222e; color:rgba(255,255,255,0.7); font-weight:600; text-transform:uppercase; font-size:var(--text-2xs); letter-spacing:0.02em;">${h}</th>`;
  });
  headerRow.innerHTML = headersHtml;

  let mockData = {};
  try {
    mockData = JSON.parse(localStorage.getItem('lm-mock-sheet-data')) || {};
  } catch (e) {
    mockData = {};
  }

  if (!mockData['Overview']) mockData['Overview'] = [];
  if (!mockData['test1']) mockData['test1'] = [];

  if (!mockData[activeSimTab]) activeSimTab = 'Overview';

  // Render tabs
  const tabs = Object.keys(mockData);
  let tabsHtml = '';
  tabs.forEach(tab => {
    const isActive = tab === activeSimTab;
    const activeClass = isActive ? 'active' : '';
    tabsHtml += `
      <div onclick="selectSimSheetTab('${escapeHtml(tab)}')" class="mock-sheets-tab ${activeClass}">
        📁 ${escapeHtml(tab)}
      </div>`;
  });
  tabsContainer.innerHTML = tabsHtml;

  // Render rows
  const rows = mockData[activeSimTab] || [];
  if (countEl) countEl.textContent = `${rows.length} row${rows.length === 1 ? '' : 's'} synced`;

  if (rows.length === 0) {
    rowsBody.innerHTML = `
      <tr>
        <td colspan="${headers.length + 1}" style="text-align:center; padding:48px 24px; color:rgba(255,255,255,0.6); font-style:italic;">
          Spreadsheet tab is empty. Perform a transaction or click "Sync all data" above.
        </td>
      </tr>`;
    return;
  }

  let rowsHtml = '';
  rows.forEach((r, idx) => {
    const isEven = idx % 2 === 0;
    const rowBg = isEven ? '#15151b' : '#1a1a24';

    let cellsHtml = `<td style="background:#1d1d26; color:rgba(255,255,255,0.6); border:var(--stroke-hair) solid rgba(255,255,255,0.08); text-align:center; user-select:none; font-family:sans-serif; font-size:var(--text-2xs);">${idx + 1}</td>`;

    for (let c = 1; c < r.length; c++) {
      let val = r[c] ?? '';
      let style = `padding:6px 10px; border:var(--stroke-hair) solid rgba(255,255,255,0.05);`;

      if (c === 6 || c === 8 || c === 9 || c === 10) {
        style += ` text-align:right;`;
        if (typeof val === 'number') {
          val = val.toFixed(2);
        }
      }

      if (c === 11) {
        if (/VOID|CANCEL/i.test(String(val))) {
          style += ` color:var(--rose); font-weight:bold;`;
        } else if (/OK/i.test(String(val))) {
          style += ` color:var(--emerald);`;
        }
      }

      if (c === 2) {
        style += ` color:var(--gold3); font-weight:600;`;
      }

      if (c === 3) {
        if (val === 'Shipment') style += ` color:#3b82f6;`;
        else if (val === 'Sale' || val === 'Order') style += ` color:var(--emerald);`;
        else if (val === 'Return') style += ` color:var(--orange);`;
      }

      cellsHtml += `<td style="${style}">${escapeHtml(String(val))}</td>`;
    }

    rowsHtml += `<tr style="background:${rowBg}; border-bottom:var(--stroke-hair) solid rgba(255,255,255,0.03); transition:background 0.15s;">${cellsHtml}</tr>`;
  });
  rowsBody.innerHTML = rowsHtml;
}

function selectSimSheetTab(tab) {
  activeSimTab = tab;
  renderMockSpreadsheet();
}

function clearSimulatedSheet() {
  if (confirm("Are you sure you want to clear the simulated spreadsheet? This will not affect your local app database.")) {
    localStorage.removeItem('lm-mock-sheet-data');
    activeSimTab = 'Overview';
    renderMockSpreadsheet();
    showToast("Simulated sheet cleared!");
  }
}

function updateSheetsTabUI() {
  const isTest = isTestBookId(activeBook);
  const simCard = $('sheets-simulated-card');
  const setupCard = $('sheets-setup-card');
  const connectedCard = $('sheets-connected-card');

  if (isTest) {
    if (simCard) simCard.style.display = 'block';
    if (setupCard) setupCard.style.display = 'none';
    if (connectedCard) connectedCard.style.display = 'none';
    renderMockSpreadsheet();
  } else {
    if (simCard) simCard.style.display = 'none';
    if (sheetsUrl) {
      if (setupCard) setupCard.style.display = 'none';
      if (connectedCard) connectedCard.style.display = 'block';
      const urlDisplay = $('sheets-url-display');
      if (urlDisplay) urlDisplay.textContent = sheetsUrl;
      const openBtn = $('open-sheet-link');
      if (openBtn) {
        if (sheetsSpreadsheetUrl) {
          openBtn.href = sheetsSpreadsheetUrl;
          openBtn.style.display = 'inline-flex';
        } else {
          openBtn.style.display = 'none';
        }
      }
    } else {
      if (setupCard) setupCard.style.display = 'block';
      if (connectedCard) connectedCard.style.display = 'none';
    }
  }
}

export {
  clearSimulatedSheet,
  renderMockSpreadsheet,
  selectSimSheetTab,
  simulatePostToSheets,
  updateSheetsTabUI,
};
