// Inventory valuation — the publisher's stock-asset report (cost basis and
// retail value of every unsold copy, on hand and out on consignment), its CSV
// and printable versions, and the inventory adjustment form that records a
// write-off or a section 10 write-down against the Tax Centre.
//
// Lifted out of src/main.js as one unit, verbatim. Everything it needs from the
// app is imported explicitly below. main.js and this module import from each
// other; that cycle is fine because nothing here runs at module-evaluation
// time — the only top-level statement besides function declarations is the
// adjustment form's mode, a plain string — and every export is called later,
// from a click handler or from main.js after start-up.
//
// eslint's no-undef (an error, checked in CI) is what keeps the import list
// honest: an identifier that isn't imported fails the build rather than
// throwing at click time.
import {
  $,
  TAX_CENTER,
  _fxRateCache,
  isAuthor,
  isTestBook,
  saveState,
  showToast,
  today,
} from '../main.js';
import { BOOKS, BOOK_LIST, states, activeBook, defaultState } from '../core/store.js';
import { renderTaxCenter } from './taxcentre.js';
import { makeEventId, syncToSheets } from './sheets-bridge.js';
import { closeM, openM } from '../lib/modal.js';
import { escapeHtml } from '../lib/html.js';
import { csvCell } from '../lib/csv.js';
import { downloadCsv } from '../lib/download.js';
import { getBookCurrencyCode, getSym, roundCents } from '../lib/money.js';
import { deriveOnHand, deriveStockBreakdown, recordInventoryDisposal } from '../lib/inventory.js';
import { createInventoryDisposalExpense, createSection10Adjustment, inventoryAdjustmentCsvRows } from '../lib/inventory-adjustment.js';
import { consignmentSyncPayload } from '../lib/consignment.js';

function calculateInventoryValuationData() {
  const items = [];
  const totals = {
    totalTitles: 0,
    totalPrintRun: 0,
    totalStockOnHand: 0,
    totalStockConsigned: 0,
    totalUnsoldUnits: 0,
    totalSoldUnits: 0,
    totalOnHandCostCAD: 0,
    totalConsignedCostCAD: 0,
    totalAssetValueCostCAD: 0,
    totalOnHandRetailCAD: 0,
    totalConsignedRetailCAD: 0,
    totalAssetValueRetailCAD: 0,
    totalPotentialGrossProfitCAD: 0,
    weightedAvgMarginPct: 0
  };

  let totalMarginSum = 0;
  let marginCount = 0;

  BOOK_LIST.forEach(book => {
    if (isTestBook(book)) return;

    const s = states[book.id] || defaultState(book);

    const stockOnHand = Math.max(0, parseInt(s.stock, 10) || 0);

    // Read real-time consignment balances from s.stores (outstanding copies)
    const storesList = Array.isArray(s.stores) ? s.stores : [];
    const storeBreakdown = storesList
      .map(st => ({
        storeName: st.name || st.storeName || st.store || 'Partner Store',
        onHand: Math.max(0, parseInt(st.outstanding || (st.qty != null && st.sold != null ? st.qty - st.sold : 0), 10))
      }))
      .filter(x => x.onHand > 0);

    // ⚡ Bolt: Imperative loops instead of .reduce() avoid array allocations in rendering functions
  let stockConsigned = 0;
    for (const st of storeBreakdown) {
      stockConsigned += st.onHand;
    }

    const totalUnsold = stockOnHand + stockConsigned;
    const publisherStockOnHand = deriveStockBreakdown(s, book).publisherOnHand;

    // ⚡ Bolt: Imperative loops instead of .reduce() avoid array allocations in rendering functions
  let totalSold = 0;
    if (s.hist) {
      for (const h of s.hist) {
        // Consignment sales are mirrored here and counted via the stores below; voided and gratuity rows are not sales.
        if (h.consignmentLink || h.voided || h.gratuity) continue;
        totalSold += (parseInt(h.qty, 10) || 0);
      }
    }
    for (const l of storesList) {
      totalSold += (parseInt(l.sold, 10) || 0);
    }

    const printRun = parseInt(book.maxPrint || book.totalPrinted || 0, 10) || (totalUnsold + totalSold);
    const compsDamaged = Math.max(0, printRun - totalUnsold - totalSold);

    const cur = getBookCurrencyCode(book);
    const isCAD = cur === 'CAD';
    const fxRate = isCAD ? 1 : (_fxRateCache[`${cur}_CAD`] || 1);

    const listPrice = parseFloat(book.listPrice || 0);
    const rawCost = parseFloat(book.productionCost || 0);

    // Derive unit print/production cost. If book.productionCost is total print run cost, divide by printRun.
    const unitCost = (rawCost > 0 && printRun > 1 && rawCost > (listPrice * 2))
      ? (rawCost / printRun)
      : rawCost;

    const unitMargin = Math.max(0, listPrice - unitCost);
    const unitMarginPct = listPrice > 0 ? (unitMargin / listPrice) * 100 : 0;

    if (listPrice > 0) {
      totalMarginSum += unitMarginPct * totalUnsold;
      marginCount += totalUnsold;
    }

    const onHandCostNative = stockOnHand * unitCost;
    const consignedCostNative = stockConsigned * unitCost;
    const totalCostNative = totalUnsold * unitCost;

    const onHandRetailNative = stockOnHand * listPrice;
    const consignedRetailNative = stockConsigned * listPrice;
    const totalRetailNative = totalUnsold * listPrice;

    const onHandCostCAD = onHandCostNative * fxRate;
    const consignedCostCAD = consignedCostNative * fxRate;
    const totalCostCAD = totalCostNative * fxRate;

    const onHandRetailCAD = onHandRetailNative * fxRate;
    const consignedRetailCAD = consignedRetailNative * fxRate;
    const totalRetailCAD = totalRetailNative * fxRate;

    const potentialGrossProfitCAD = totalRetailCAD - totalCostCAD;

    items.push({
      id: book.id,
      title: book.title || 'Untitled',
      isbn: book.isbn || '—',
      format: book.format || 'Paperback',
      printRun,
      stockOnHand,
      publisherStockOnHand,
      stockConsigned,
      totalUnsold,
      totalSold,
      compsDamaged,
      currency: cur,
      fxRate,
      listPrice,
      unitCost,
      unitMargin,
      unitMarginPct,
      onHandCostNative,
      consignedCostNative,
      totalCostNative,
      onHandRetailNative,
      consignedRetailNative,
      totalRetailNative,
      onHandCostCAD,
      consignedCostCAD,
      totalCostCAD,
      onHandRetailCAD,
      consignedRetailCAD,
      totalRetailCAD,
      potentialGrossProfitCAD,
      storeBreakdown
    });

    totals.totalTitles++;
    totals.totalPrintRun += printRun;
    totals.totalStockOnHand += stockOnHand;
    totals.totalStockConsigned += stockConsigned;
    totals.totalUnsoldUnits += totalUnsold;
    totals.totalSoldUnits += totalSold;
    totals.totalOnHandCostCAD += onHandCostCAD;
    totals.totalConsignedCostCAD += consignedCostCAD;
    totals.totalAssetValueCostCAD += totalCostCAD;
    totals.totalOnHandRetailCAD += onHandRetailCAD;
    totals.totalConsignedRetailCAD += consignedRetailCAD;
    totals.totalAssetValueRetailCAD += totalRetailCAD;
    totals.totalPotentialGrossProfitCAD += potentialGrossProfitCAD;
  });

  totals.weightedAvgMarginPct = marginCount > 0 ? (totalMarginSum / marginCount) : 0;

  return { items, totals };
}

let _inventoryAdjustmentMode = 'valuation';

function _selectedInventoryValuationItem() {
  const id = $('wo-book-id')?.value;
  return calculateInventoryValuationData().items.find(item => item.id === id) || null;
}

function _section10RecordsForBook(bookId) {
  return (TAX_CENTER.businessExpenses || [])
    .filter(entry => entry?.inventoryAdjustment?.type === 'section10' &&
      entry.inventoryAdjustment.bookId === bookId && entry.date)
    .sort((a, b) => {
      const da = String(a.date);
      const db = String(b.date);
      return db < da ? -1 : (db > da ? 1 : 0);
    });
}

function _priorSection10WriteDown(bookId, date) {
  const year = String(date || '').slice(0, 4);
  const prior = _section10RecordsForBook(bookId)
    .find(entry => String(entry.date).slice(0, 4) < year);
  const detail = prior?.inventoryAdjustment;
  return roundCents(Number(detail?.closingWriteDownCAD ?? detail?.writeDownCAD ?? 0));
}

function setInventoryAdjustmentMode(mode) {
  _inventoryAdjustmentMode = mode === 'disposal' ? 'disposal' : 'valuation';
  const valuation = _inventoryAdjustmentMode === 'valuation';
  $('wo-mode-valuation-label')?.classList.toggle('is-active', valuation);
  $('wo-mode-disposal-label')?.classList.toggle('is-active', !valuation);
  if ($('wo-mode-valuation')) $('wo-mode-valuation').checked = valuation;
  if ($('wo-mode-disposal')) $('wo-mode-disposal').checked = !valuation;
  if ($('wo-nrv-wrap')) $('wo-nrv-wrap').style.display = valuation ? '' : 'none';
  if ($('wo-nrv')) $('wo-nrv').required = valuation;
  if ($('wo-total-label')) $('wo-total-label').textContent = valuation
    ? 'Current-year tax adjustment:'
    : 'Cost basis removed:';
  if ($('wo-submit')) $('wo-submit').textContent = valuation
    ? 'Record valuation adjustment'
    : 'Record physical disposal';
  const reason = $('wo-reason');
  if (reason) reason.value = valuation ? 'Obsolete edition or title' : 'Damaged or defective inventory';
  onWriteOffBookChange();
}

function openInventoryWriteOffModal() {
  if (!window.IS_PUBLISHER || isAuthor()) return;
  const items = calculateInventoryValuationData().items.filter(item => item.totalUnsold > 0);
  const select = $('wo-book-id');
  if (!select) return;
  select.innerHTML = items.map(item =>
    `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)} · ${item.totalUnsold} unsold</option>`
  ).join('');
  if (items.some(item => item.id === activeBook)) select.value = activeBook;
  $('writeoff-form')?.reset();
  if ($('wo-date')) $('wo-date').value = today();
  if ($('wo-evidence')) $('wo-evidence').value = '';
  if ($('wo-notes')) $('wo-notes').value = '';
  setInventoryAdjustmentMode('valuation');
  openM('inventory-writeoff-modal');
}

function onWriteOffBookChange() {
  const item = _selectedInventoryValuationItem();
  const qty = $('wo-qty');
  if (!item || !qty) return;
  const available = _inventoryAdjustmentMode === 'disposal' ? item.publisherStockOnHand : item.totalUnsold;
  qty.max = String(available);
  qty.value = String(Math.min(Math.max(1, Number(qty.value) || 1), available));
  if ($('wo-unit-cost')) {
    $('wo-unit-cost').textContent = `${item.unitCost.toFixed(2)} ${item.currency} · ${item.fxRate.toFixed(4)} CAD FX`;
  }
  recalcWriteOffValue();
}

function recalcWriteOffValue() {
  const item = _selectedInventoryValuationItem();
  if (!item) return;
  const quantity = Math.max(0, Number($('wo-qty')?.value) || 0);
  const nrv = _inventoryAdjustmentMode === 'valuation'
    ? Math.max(0, Number($('wo-nrv')?.value) || 0)
    : 0;
  const closingWriteDown = roundCents(Math.max(0, quantity * (item.unitCost - Math.min(nrv, item.unitCost)) * item.fxRate));
  const priorWriteDown = _inventoryAdjustmentMode === 'valuation'
    ? _priorSection10WriteDown(item.id, $('wo-date')?.value)
    : 0;
  const taxAdjustment = roundCents(closingWriteDown - priorWriteDown);
  if ($('wo-total-deduction')) $('wo-total-deduction').textContent = `${taxAdjustment < 0 ? '−' : ''}$${Math.abs(taxAdjustment).toFixed(2)} CAD`;
  if ($('wo-stock-effect')) {
    $('wo-stock-effect').textContent = _inventoryAdjustmentMode === 'valuation'
      ? `Physical stock stays at ${item.totalUnsold} unsold copies. This is a non-cash Tax Centre adjustment.`
      : `${quantity} publisher-held ${quantity === 1 ? 'copy' : 'copies'} will be permanently removed from inventory.`;
  }
}

async function submitInventoryWriteOff() {
  if (!window.IS_PUBLISHER || isAuthor()) return;
  const item = _selectedInventoryValuationItem();
  if (!item) return showToast('Choose an inventory title', 'err');
  const quantity = Number($('wo-qty')?.value);
  const available = _inventoryAdjustmentMode === 'disposal' ? item.publisherStockOnHand : item.totalUnsold;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > available) {
    return showToast(`Quantity must be between 1 and ${available}`, 'err');
  }

  const input = {
    id: `iva_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    bookId: item.id,
    title: item.title,
    quantity,
    unitCostNative: item.unitCost,
    nrvPerUnitNative: Number($('wo-nrv')?.value),
    currency: item.currency,
    fxRate: item.fxRate,
    date: $('wo-date')?.value,
    reason: $('wo-reason')?.value,
    evidence: $('wo-evidence')?.value,
    notes: $('wo-notes')?.value,
    priorWriteDownCAD: _priorSection10WriteDown(item.id, $('wo-date')?.value),
  };

  let record;
  try {
    record = _inventoryAdjustmentMode === 'valuation'
      ? createSection10Adjustment(input)
      : createInventoryDisposalExpense(input);
  } catch (error) {
    return showToast(error.message, 'err', 5000);
  }

  if (!Array.isArray(TAX_CENTER.businessExpenses)) TAX_CENTER.businessExpenses = [];
  const previousExpenses = [...TAX_CENTER.businessExpenses];
  if (_inventoryAdjustmentMode === 'valuation') {
    const taxYear = String(record.date).slice(0, 4);
    TAX_CENTER.businessExpenses = TAX_CENTER.businessExpenses.filter(entry =>
      !(entry?.inventoryAdjustment?.type === 'section10' &&
        entry.inventoryAdjustment.bookId === item.id &&
        String(entry.date).slice(0, 4) === taxYear)
    );
  }
  TAX_CENTER.businessExpenses.unshift(record);
  try {
    const saved = await window._fbSaveSettings('taxCenter', TAX_CENTER);
    if (!saved) throw new Error('Tax Centre settings save was rejected');
  } catch (error) {
    TAX_CENTER.businessExpenses = previousExpenses;
    console.error(error);
    return showToast('Could not save the inventory adjustment', 'err', 5000);
  }

  if (_inventoryAdjustmentMode === 'disposal') {
    const s = states[item.id] || defaultState(BOOKS[item.id]);
    states[item.id] = s;
    const disposal = recordInventoryDisposal(s, {
      id: record.id,
      date: record.date,
      qty: quantity,
      reason: input.reason,
      notes: input.notes,
      sheetsId: makeEventId(),
    });
    s.stock = deriveOnHand(s, BOOKS[item.id]);
    await saveState(item.id);
    // Copies written off leave the book's stock, so the sheet shows them too.
    if (disposal) syncToSheets(consignmentSyncPayload(BOOKS[item.id], disposal));
  }

  closeM('inventory-writeoff-modal');
  openInventoryValuationModal();
  renderTaxCenter();
  showToast(_inventoryAdjustmentMode === 'valuation'
    ? '✓ Section 10 valuation recorded — stock unchanged'
    : `✓ ${quantity} ${quantity === 1 ? 'copy' : 'copies'} disposed and removed from stock`, 'ok', 5000);
}

function downloadInventoryValuationCSV() {
  const { items, totals } = calculateInventoryValuationData();
  const esc = csvCell;

  let csv = 'Lyricalmyrical Book Inventory Valuation Report\n';
  csv += 'Generated on: ' + today() + '\n';
  csv += `Active Titles: ${totals.totalTitles} | Total Unsold Units: ${totals.totalUnsoldUnits} (${totals.totalStockOnHand} Warehouse / ${totals.totalStockConsigned} Consigned)\n`;
  csv += `Total Balance Sheet Inventory Asset Cost: CAD $${totals.totalAssetValueCostCAD.toFixed(2)} | Total Retail Value: CAD $${totals.totalAssetValueRetailCAD.toFixed(2)}\n\n`;

  csv += 'Book ID,Title,ISBN,Binding / Format,Print Run,Stock On-Hand (Warehouse),Stock Consigned (Stores),Total Unsold Inventory,Lifetime Sold Units,Currency,Unit Print Cost (Native),Unit Retail Price (Native),Unit Margin (Native),Unit Margin %,FX Rate (CAD),On-Hand Asset Value Cost (CAD),Consigned Asset Value Cost (CAD),TOTAL ASSET VALUE COST (CAD),TOTAL RETAIL VALUE (CAD),POTENTIAL GROSS PROFIT (CAD)\n';

  items.forEach(item => {
    csv += `${esc(item.id)},${esc(item.title)},${esc(item.isbn)},${esc(item.format)},${item.printRun},${item.stockOnHand},${item.stockConsigned},${item.totalUnsold},${item.totalSold},${esc(item.currency)},${item.unitCost.toFixed(2)},${item.listPrice.toFixed(2)},${item.unitMargin.toFixed(2)},${item.unitMarginPct.toFixed(1)}%,${item.fxRate.toFixed(4)},${item.onHandCostCAD.toFixed(2)},${item.consignedCostCAD.toFixed(2)},${item.totalCostCAD.toFixed(2)},${item.totalRetailCAD.toFixed(2)},${item.potentialGrossProfitCAD.toFixed(2)}\n`;
  });

  csv += `TOTALS,"Total Active Titles: ${totals.totalTitles}",,,${totals.totalPrintRun},${totals.totalStockOnHand},${totals.totalStockConsigned},${totals.totalUnsoldUnits},${totals.totalSoldUnits},CAD,,,,,,${totals.totalOnHandCostCAD.toFixed(2)},${totals.totalConsignedCostCAD.toFixed(2)},${totals.totalAssetValueCostCAD.toFixed(2)},${totals.totalAssetValueRetailCAD.toFixed(2)},${totals.totalPotentialGrossProfitCAD.toFixed(2)}\n`;

  const adjustmentRows = inventoryAdjustmentCsvRows(TAX_CENTER.businessExpenses);
  if (adjustmentRows.length > 1) {
    csv += '\nSECTION 10 VALUATIONS AND PHYSICAL DISPOSALS\n';
    adjustmentRows.forEach(row => { csv += row.map(csvCell).join(',') + '\n'; });
  }

  downloadCsv(csv, `Lyrical_Inventory_Valuation_${today()}.csv`);
  showToast('✓ Comprehensive Inventory Valuation CSV exported');
}

function openInventoryValuationModal() {
  const data = calculateInventoryValuationData();
  const { items, totals } = data;

  const costEl = $('iv-stat-cost-cad');
  const retailEl = $('iv-stat-retail-cad');
  const unitsEl = $('iv-stat-unsold-units');
  const subUnitsEl = $('iv-stat-unsold-sub');
  const marginEl = $('iv-stat-margin-pct');
  const subMarginEl = $('iv-stat-margin-sub');
  const tbody = $('iv-modal-table-body');
  const tfoot = $('iv-modal-table-foot');
  const historyEl = $('iv-adjustment-history');

  if (costEl) costEl.textContent = `$${totals.totalAssetValueCostCAD.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD`;
  if (retailEl) retailEl.textContent = `$${totals.totalAssetValueRetailCAD.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD`;
  if (unitsEl) unitsEl.textContent = `${totals.totalUnsoldUnits.toLocaleString()} units`;
  if (subUnitsEl) subUnitsEl.textContent = `${totals.totalStockOnHand.toLocaleString()} Warehouse · ${totals.totalStockConsigned.toLocaleString()} Consigned`;
  if (marginEl) marginEl.textContent = `${totals.weightedAvgMarginPct.toFixed(1)}%`;
  if (subMarginEl) subMarginEl.textContent = `$${totals.totalPotentialGrossProfitCAD.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD Total Profit`;

  if (historyEl) {
    const records = (TAX_CENTER.businessExpenses || [])
      .filter(entry => entry.inventoryAdjustment)
      .sort((a, b) => {
        const da = String(a.date || '');
        const db = String(b.date || '');
        return db < da ? -1 : (db > da ? 1 : 0);
      });
    if (!records.length) {
      historyEl.innerHTML = '<strong>No valuation adjustments recorded.</strong><span>Use “Adjust Inventory” to document a Section 10 year-end value or a physical disposal.</span>';
    } else {
      const latest = records[0];
      const detail = latest.inventoryAdjustment;
      const currentAdjustment = Number(detail.taxAdjustmentCAD ?? detail.writeDownCAD ?? 0);
      historyEl.innerHTML = `<strong>${records.length} documented inventory adjustment${records.length === 1 ? '' : 's'}</strong><span>Latest: ${escapeHtml(latest.date || '—')} · ${escapeHtml(detail.title || '')} · closing write-down $${Number(detail.closingWriteDownCAD ?? detail.writeDownCAD ?? 0).toFixed(2)} CAD · current-year adjustment ${currentAdjustment < 0 ? '−' : ''}$${Math.abs(currentAdjustment).toFixed(2)} CAD. Reassess written-down inventory at each year end while copies remain on hand.</span>`;
    }
  }

  if (tbody) {
    tbody.innerHTML = items.map(item => {
      const storesTooltip = item.storeBreakdown.length
        ? ` title="${item.storeBreakdown.map(s => `${s.storeName}: ${s.onHand}`).join(' | ')}"`
        : '';
      const storePill = item.stockConsigned > 0
        ? `<span class="tag amber" style="font-size:var(--text-2xs); cursor:help;"${storesTooltip}>${item.stockConsigned} in ${item.storeBreakdown.length} store${item.storeBreakdown.length === 1 ? '' : 's'}</span>`
        : '<span style="color:var(--text3);">0</span>';

      const curSym = getSym(item.currency);

      return `
        <tr>
          <td>
            <div style="font-weight:600; color:var(--text1);">${escapeHtml(item.title)}</div>
            <div style="font-size:var(--text-2xs); color:var(--text3);">${escapeHtml(item.isbn)} · ${escapeHtml(item.format)}</div>
          </td>
          <td class="r" style="font-weight:600;">${item.stockOnHand}</td>
          <td class="r">${storePill}</td>
          <td class="r" style="font-weight:700; color:var(--gold);">${item.totalUnsold}</td>
          <td class="r" style="font-family:var(--font-mono);">${curSym}${item.unitCost.toFixed(2)}</td>
          <td class="r" style="font-family:var(--font-mono);">${curSym}${item.listPrice.toFixed(2)}</td>
          <td class="r" style="font-family:var(--font-mono); font-weight:600; color:var(--gold);">$${item.totalCostCAD.toFixed(2)}</td>
          <td class="r" style="font-family:var(--font-mono); font-weight:600; color:var(--green);">$${item.totalRetailCAD.toFixed(2)}</td>
        </tr>
      `;
    }).join('');
  }

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td>TOTALS (${totals.totalTitles} Titles)</td>
        <td class="r">${totals.totalStockOnHand}</td>
        <td class="r">${totals.totalStockConsigned}</td>
        <td class="r" style="color:var(--gold);">${totals.totalUnsoldUnits}</td>
        <td class="r" colspan="2" style="font-size:var(--text-xs); color:var(--text3);">Weighted Margin: ${totals.weightedAvgMarginPct.toFixed(1)}%</td>
        <td class="r" style="color:var(--gold); font-size:var(--text-base);">$${totals.totalAssetValueCostCAD.toFixed(2)} CAD</td>
        <td class="r" style="color:var(--green); font-size:var(--text-base);">$${totals.totalAssetValueRetailCAD.toFixed(2)} CAD</td>
      </tr>
    `;
  }

  openM('inventory-valuation-modal');
}

function printInventoryValuationReport() {
  const { items, totals } = calculateInventoryValuationData();
  const printWin = window.open('', '_blank');
  if (!printWin) {
    showToast('⚠ Popup blocked. Allow popups to print report.', 'err');
    return;
  }

  const rows = items.map(item => {
    const curSym = getSym(item.currency);
    return `
    <tr>
      <td><strong>${escapeHtml(item.title)}</strong><br><small>${escapeHtml(item.isbn)} | ${escapeHtml(item.format)}</small></td>
      <td style="text-align:right;">${item.stockOnHand}</td>
      <td style="text-align:right;">${item.stockConsigned}</td>
      <td style="text-align:right;font-weight:bold;">${item.totalUnsold}</td>
      <td style="text-align:right;">${curSym}${item.unitCost.toFixed(2)}</td>
      <td style="text-align:right;">${curSym}${item.listPrice.toFixed(2)}</td>
      <td style="text-align:right;font-weight:bold;">$${item.totalCostCAD.toFixed(2)} CAD</td>
      <td style="text-align:right;font-weight:bold;color:var(--green);">$${item.totalRetailCAD.toFixed(2)} CAD</td>
    </tr>
  `;
  }).join('');

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Lyricalmyrical Books - Inventory Valuation Report</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #111; line-height: 1.5; }
        h1 { margin: 0 0 4px 0; font-size: 24px; }
        .meta { color: #555; font-size: 13px; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
        .card { border: 1px solid #ddd; padding: 12px; border-radius: 6px; background: #fafafa; }
        .card-label { font-size: 10px; text-transform: uppercase; color: #666; font-weight: bold; }
        .card-val { font-size: 18px; font-weight: bold; margin-top: 4px; color: #111; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
        th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
        th { background: #f8fafc; font-size: 11px; text-transform: uppercase; }
        tfoot tr td { background: #f1f5f9; font-weight: bold; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>Lyricalmyrical Books — Inventory Valuation Report</h1>
      <div class="meta">Generated: ${today()} | Publisher Balance Sheet & Stock Audit</div>
      <div class="summary">
        <div class="card"><div class="card-label">Asset Cost Basis (CAD)</div><div class="card-val">$${totals.totalAssetValueCostCAD.toFixed(2)}</div></div>
        <div class="card"><div class="card-label">Retail MSRP Value (CAD)</div><div class="card-val">$${totals.totalAssetValueRetailCAD.toFixed(2)}</div></div>
        <div class="card"><div class="card-label">Total Unsold Stock</div><div class="card-val">${totals.totalUnsoldUnits} units</div></div>
        <div class="card"><div class="card-label">Weighted Profit Margin</div><div class="card-val">${totals.weightedAvgMarginPct.toFixed(1)}%</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Title &amp; ISBN</th>
            <th style="text-align:right;">Warehouse</th>
            <th style="text-align:right;">Consigned</th>
            <th style="text-align:right;">Total Unsold</th>
            <th style="text-align:right;">Unit Cost</th>
            <th style="text-align:right;">MSRP</th>
            <th style="text-align:right;">Cost Basis (CAD)</th>
            <th style="text-align:right;">Retail Value (CAD)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td>TOTALS (${totals.totalTitles} Titles)</td>
            <td style="text-align:right;">${totals.totalStockOnHand}</td>
            <td style="text-align:right;">${totals.totalStockConsigned}</td>
            <td style="text-align:right;">${totals.totalUnsoldUnits}</td>
            <td colspan="2" style="text-align:right;">Weighted Margin: ${totals.weightedAvgMarginPct.toFixed(1)}%</td>
            <td style="text-align:right;">$${totals.totalAssetValueCostCAD.toFixed(2)} CAD</td>
            <td style="text-align:right;">$${totals.totalAssetValueRetailCAD.toFixed(2)} CAD</td>
          </tr>
        </tfoot>
      </table>
    </body>
    </html>
  `);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => printWin.print(), 300);
}

export {
  calculateInventoryValuationData,
  setInventoryAdjustmentMode,
  openInventoryWriteOffModal,
  onWriteOffBookChange,
  recalcWriteOffValue,
  submitInventoryWriteOff,
  downloadInventoryValuationCSV,
  openInventoryValuationModal,
  printInventoryValuationReport,
};
