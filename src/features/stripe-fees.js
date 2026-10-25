// Stripe fees: the yearly Stripe fees report (balance transactions pulled
// from Stripe and totalled by year and currency), filing those fees into the
// Tax Centre as business expenses, the fortnightly background sweep that does
// that filing on its own, the cross-check of Stripe charges against recorded
// sales, and the audit CSV.
//
// Lifted out of src/main.js as one unit, verbatim. Everything it needs from the
// app is imported explicitly below. main.js and this module import from each
// other; that cycle is fine because nothing here calls into main.js at
// module-evaluation time — the top-level statements are constants, a number
// formatter and two flags — and every export is called later, from a click
// handler, the sweep's timer, or main.js after start-up.
//
// eslint's no-undef (an error, checked in CI) is what keeps the import list
// honest: an identifier that isn't imported fails the build rather than
// throwing at click time.
import {
  TAX_CENTER,
  _fxRateCache,
  fetchHistoricalRate,
  fetchLiveRate,
  getReconStripeKey,
  isAuthor,
  showToast,
  today,
} from '../main.js';
import { BOOK_LIST, states, defaultState } from '../core/store.js';
import { renderTaxCenter, saveTaxCenter } from './taxcentre.js';
import { confirmDialog } from '../lib/modal.js';
import { pushAppAlert } from '../lib/app-alert.js';
import { integrationBackoffMs, noteIntegrationFailure, noteIntegrationSuccess } from '../lib/integration-watch.js';
import { browserWatchState, effectiveInterval, startWatch } from '../lib/watch-schedule.js';
import { isZeroDecimalCurrency } from '../lib/invoice-payments.js';
import { STRIPE_FEE_INTERVAL_MS, describeFeeSweep, dueForFeeSweep, feeSweepFromYear, startOfYear } from '../lib/stripe-fee-schedule.js';
import { toCsv } from '../lib/csv.js';
import { downloadCsv } from '../lib/download.js';
import { escapeHtml } from '../lib/html.js';
import {
  buildStripeFeeReport, busiestMonth, compareWithPriorYear, describeAge, effectiveRate,
  ledgerFilingStatus, ledgerRowsFromReport, mergeReportYears, REPORT_VERSION, SALES_TYPES,
} from '../lib/stripe-fees-report.js';
import '../styles/stripe-fees.css';

// ── STRIPE FEES BY YEAR
function _stripeMinorToMajor(amt, cur) {
  return isZeroDecimalCurrency(cur) ? amt : amt / 100;
}

const _STRIPE_TYPE_LABELS = {
  charge: 'Customer payments',
  payment: 'Customer payments',
  refund: 'Refunds issued',
  payment_refund: 'Refunds issued',
  payment_refund_reversal: 'Refund reversals',
  refund_failure: 'Failed refunds',
  payout: 'Payouts to your bank',
  payout_cancel: 'Cancelled payouts',
  payout_failure: 'Failed payouts',
  stripe_fee: 'Stripe service fees',
  application_fee: 'App / platform fees',
  application_fee_refund: 'App fee refunds',
  adjustment: 'Adjustments',
  transfer: 'Transfers',
  transfer_cancel: 'Cancelled transfers',
  transfer_failure: 'Failed transfers',
  transfer_refund: 'Transfer refunds',
  dispute: 'Disputes / chargebacks',
  dispute_reversal: 'Dispute reversals',
  reserve_transaction: 'Reserve holds',
  reserved_funds: 'Reserved funds',
  topup: 'Account top-ups',
  topup_reversal: 'Top-up reversals',
  contribution: 'Contributions',
  issuing_authorization_hold: 'Card auth hold',
  issuing_authorization_release: 'Card auth release',
  issuing_transaction: 'Card transaction',
  issuing_dispute: 'Card dispute',
  tax_fee: 'Tax fees',
};
function _stripeFriendlyType(t) {
  return _STRIPE_TYPE_LABELS[t] || (t || 'Other').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
// Number.toLocaleString with options builds a fresh Intl.NumberFormat on every
// call; _stripeFmtMoney runs per row in the Stripe tables and per payment on
// every reconciliation search keystroke, so build the formatter once.
const _STRIPE_MONEY_FMT = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function _stripeFmtMoney(amt, cur) {
  const sign = amt < 0 ? '-' : '';
  const abs = Math.abs(amt);
  return `${sign}${cur ? cur + ' ' : ''}${_STRIPE_MONEY_FMT.format(abs)}`;
}

async function fetchStripeTransactions(key, onProgress, { since = 0 } = {}) {
  const allTxns = [];
  let count = 0;
  let starting_after = null;

  while (true) {
    const params = new URLSearchParams({ limit: '100' });
    // The manual tool asks for every transaction the account has ever had and
    // passes nothing here. A job running on its own only ever rewrites the
    // years it is allowed to touch, so it bounds the window to those — the
    // difference between a handful of requests and every page since day one.
    if (since > 0) params.set('created[gte]', String(Math.floor(since / 1000)));
    if (starting_after) params.set('starting_after', starting_after);
    const resp = await fetch(`https://api.stripe.com/v1/balance_transactions?${params.toString()}`, {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${resp.status}`);
    }
    const json = await resp.json();
    for (const tx of (json.data || [])) {
      const year = new Date((tx.created || 0) * 1000).getFullYear();
      const cur = (tx.currency || '').toUpperCase();
      const type = tx.type || 'unknown';
      allTxns.push({
        id: tx.id, created: tx.created, year, currency: cur, type,
        amount: tx.amount, fee: tx.fee, net: tx.net,
        source: tx.source, description: tx.description || ''
      });
      count++;
    }
    if (onProgress) onProgress(count);
    if (!json.has_more || !json.data.length) break;
    starting_after = json.data[json.data.length - 1].id;
  }
  return allTxns;
}

function aggregateStripeTransactions(allTxns) {
  const data = {};
  const byYearCurAll = {};

  for (const tx of allTxns) {
    const year = tx.year;
    const cur = tx.currency;
    const type = tx.type;

    const y = data[year] = data[year] || {};
    const c = y[cur] = y[cur] || {};
    const t = c[type] = c[type] || { gross: 0, fee: 0, net: 0, count: 0 };
    t.gross += tx.amount || 0;
    t.fee += tx.fee || 0;
    t.net += tx.net || 0;
    t.count += 1;

    const ya = byYearCurAll[year] = byYearCurAll[year] || {};
    const ca = ya[cur] = ya[cur] || { gross: 0, fee: 0, net: 0, count: 0 };
    ca.gross += tx.amount || 0;
    ca.fee += tx.fee || 0;
    ca.net += tx.net || 0;
    ca.count += 1;
  }

  const SALES_FEE_TYPES = new Set(['charge', 'payment']);
  const ledgerData = [];
  for (const yr of Object.keys(data)) {
    for (const cur of Object.keys(data[yr])) {
      let salesFeeMinor = 0, salesCount = 0, totalFeeMinor = 0, salesGrossMinor = 0, stripeBillingMinor = 0;
      for (const t of Object.keys(data[yr][cur])) {
        totalFeeMinor += data[yr][cur][t].fee;
        if (SALES_FEE_TYPES.has(t)) {
          salesFeeMinor += data[yr][cur][t].fee;
          salesGrossMinor += data[yr][cur][t].gross;
          salesCount += data[yr][cur][t].count;
        }
        if (t === 'stripe_fee') stripeBillingMinor += Math.abs(data[yr][cur][t].gross);
      }
      if (salesFeeMinor > 0 || stripeBillingMinor > 0 || salesGrossMinor > 0) {
        ledgerData.push({ year: Number(yr), cur, salesFeeMinor, salesCount, totalFeeMinor, salesGrossMinor, stripeBillingMinor });
      }
    }
  }

  return { data, byYearCurAll, ledgerData };
}

// ── The report on screen
//
// One year at a time, newest first, with "All years" as the overview: a long
// stack of every year and currency buried the year someone came to look at.
// The report is kept between visits (browser storage, never the tax document —
// it is a cache of what Stripe said, and it is rewritten on every fetch), so
// opening the Tax Centre offline still shows the last figures, dated.

const STRIPE_FEES_REPORT_KEY = 'lm-stripe-fees-report';
const _SF_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

let _sfReport = null;
let _sfYear = null;
let _sfWired = false;

function loadSavedStripeFeesReport() {
  try {
    const saved = JSON.parse(localStorage.getItem(STRIPE_FEES_REPORT_KEY) || 'null');
    return saved && saved.version === REPORT_VERSION && Array.isArray(saved.years) ? saved : null;
  } catch (_) { return null; }
}

function saveStripeFeesReport(report) {
  try { localStorage.setItem(STRIPE_FEES_REPORT_KEY, JSON.stringify(report)); } catch (_) { /* private mode or full */ }
}

function _sfMoney(minor, cur) {
  return _stripeFmtMoney(_stripeMinorToMajor(minor, cur), cur);
}

const _SF_LEDGER_PILLS = {
  filed: '<span class="pill green">✓ In your ledger</span>',
  stale: '<span class="pill amber">↻ Ledger out of date</span>',
  missing: '<span class="pill gray">○ Not in ledger yet</span>',
  none: '<span class="pill gray">— Nothing to file</span>',
};

/** "2025", or "Jan–Oct 2025" when the year being compared is still running. */
function _sfPriorLabel(cmp) {
  return cmp.partial ? `${_SF_MONTHS[0].slice(0, 3)}–${_SF_MONTHS[cmp.throughMonth].slice(0, 3)} ${cmp.priorYear}` : String(cmp.priorYear);
}

/** Compare a running year only with the same months of the year before. */
function _sfCompare(report, year, cur, now = new Date()) {
  return compareWithPriorYear(report, year, cur, { throughMonth: year === now.getFullYear() ? now.getMonth() : 11 });
}

function _sfChangeLine(cmp) {
  if (!cmp) return 'First year on record';
  const up = cmp.feeChange > 0;
  const arrow = cmp.feeChange === 0 ? '＝' : up ? '▲' : '▼';
  const pct = cmp.feeChangePct == null ? '' : ` ${Math.abs(cmp.feeChangePct).toFixed(0)}%`;
  return `${arrow}${pct} vs ${_sfPriorLabel(cmp)}`;
}

function _sfRateLine(cmp) {
  if (!cmp) return 'of what customers paid';
  const pts = cmp.rateChange;
  if (Math.abs(pts) < 0.005) return `same as ${_sfPriorLabel(cmp)}`;
  return `${pts > 0 ? '▲' : '▼'} ${Math.abs(pts).toFixed(2)} pts vs ${_sfPriorLabel(cmp)}`;
}

function _sfLedgerNote(status, entry, cur) {
  const what = entry.billing
    ? `${escapeHtml(_sfMoney(entry.sales.fee, cur))} in fees on sales plus ${escapeHtml(_sfMoney(entry.billing, cur))} of Stripe billing`
    : `${escapeHtml(_sfMoney(entry.sales.fee, cur))} in fees on sales`;
  if (status.state === 'stale') {
    return `<p class="sf-note is-active">Your ledger holds ${escapeHtml(_stripeFmtMoney(status.ledgerAmount, cur))}; Stripe now says ${escapeHtml(_stripeFmtMoney(status.stripeAmount, cur))} (${what}). Filing again updates the same entries rather than adding new ones.</p>`;
  }
  if (status.state === 'missing') {
    return `<p class="sf-note">Not in your ledger yet: ${what}. File it to claim it as a business expense.</p>`;
  }
  return '';
}

function _sfMonthChart(entry, year, cur, now = new Date()) {
  const best = busiestMonth(entry.months);
  if (!best) return '';
  const max = best.fee;
  const lastMonth = year === now.getFullYear() ? now.getMonth() : 11;
  const bars = entry.months.map((m, i) => {
    const future = i > lastMonth;
    const h = future || !m.fee ? 0 : Math.max(4, Math.round((m.fee / max) * 100));
    const said = future
      ? `${_SF_MONTHS[i]}: still to come`
      : `${_SF_MONTHS[i]}: ${_sfMoney(m.fee, cur)} in fees on ${m.count} payment${m.count === 1 ? '' : 's'}`;
    return `<li class="sf-bar${future ? ' is-future' : ''}" title="${escapeHtml(said)}">
        <span class="sf-bar-track"><span class="sf-bar-fill" style="--sf-h:${h}%"></span></span>
        <span class="sf-bar-label" aria-hidden="true">${_SF_MONTHS[i].slice(0, 1)}</span>
        <span class="sr-only">${escapeHtml(said)}</span>
      </li>`;
  }).join('');
  return `
    <div class="sf-chart">
      <div class="sf-chart-head">
        <span class="sf-label">Fees by month</span>
        <span class="sf-chart-note">Busiest: ${_SF_MONTHS[best.month]}, ${escapeHtml(_sfMoney(best.fee, cur))}</span>
      </div>
      <ol class="sf-bars" aria-label="Stripe fees by month, ${year}, ${escapeHtml(cur)}">${bars}</ol>
    </div>`;
}

function _sfActivityTable(entry, cur) {
  const rows = [];
  const s = entry.sales;
  if (s.count > 0) {
    rows.push(`<tr class="sf-row-lead">
      <td><strong>Customer payments</strong><div class="sf-type">charge · payment</div></td>
      <td class="r">${s.count}</td>
      <td class="r">${_stripeFmtMoney(_stripeMinorToMajor(s.gross, cur), '')}</td>
      <td class="r sf-fee">${_stripeFmtMoney(_stripeMinorToMajor(s.fee, cur), '')}</td>
      <td class="r"><strong>${_stripeFmtMoney(_stripeMinorToMajor(s.net, cur), '')}</strong></td>
    </tr>`);
  }
  for (const t of Object.keys(entry.types).filter(t => !SALES_TYPES.has(t)).sort()) {
    const r = entry.types[t];
    const fee = _stripeMinorToMajor(r.fee, cur);
    rows.push(`<tr>
      <td>${escapeHtml(_stripeFriendlyType(t))}<div class="sf-type">${escapeHtml(t)}</div></td>
      <td class="r">${r.count}</td>
      <td class="r">${_stripeFmtMoney(_stripeMinorToMajor(r.gross, cur), '')}</td>
      <td class="r${fee !== 0 ? ' sf-fee' : ' sf-dim'}">${fee !== 0 ? _stripeFmtMoney(fee, '') : '—'}</td>
      <td class="r">${_stripeFmtMoney(_stripeMinorToMajor(r.net, cur), '')}</td>
    </tr>`);
  }
  const tot = entry.total;
  return `
    <details class="sf-details">
      <summary>All balance activity <span class="sf-count">${rows.length} line${rows.length === 1 ? '' : 's'}</span></summary>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Activity</th><th class="r">Count</th><th class="r">Amount</th><th class="r">Stripe fee</th><th class="r">Net</th></tr></thead>
          <tbody>${rows.join('')}</tbody>
          <tfoot><tr class="sf-row-total">
            <td>All activity<div class="sf-type">matches Stripe's Balance report</div></td>
            <td class="r">${tot.count}</td>
            <td class="r">${_stripeFmtMoney(_stripeMinorToMajor(tot.gross, cur), '')}</td>
            <td class="r sf-fee">${_stripeFmtMoney(_stripeMinorToMajor(tot.fee, cur), '')}</td>
            <td class="r">${_stripeFmtMoney(_stripeMinorToMajor(tot.net, cur), '')}</td>
          </tr></tfoot>
        </table>
      </div>
      <p class="sf-foot">"Customer payments" is the line that answers what Stripe takes from your sales. The rest (refunds, payouts, Stripe's own billing, adjustments) moves money in and out of your balance, and is listed so the total matches Stripe's Balance report.</p>
    </details>`;
}

function _sfCurrencySection(report, year, cur, ledger) {
  const entry = report.byYear[year][cur];
  const s = entry.sales;
  const status = ledgerFilingStatus(entry, year, cur, ledger);
  const cmp = _sfCompare(report, year, cur);
  const id = `sf-h-${year}-${String(cur).replace(/[^A-Za-z0-9]/g, '')}`;

  const strip = s.count > 0 ? `
    <div class="hist-recon-strip">
      <div class="hist-kpi-container">
        <div class="hist-kpi-card highlight-gold is-lead">
          <div class="hist-kpi-icon" aria-hidden="true">💳</div>
          <div class="hist-kpi-content">
            <div class="hist-kpi-label">Fees on sales</div>
            <div class="hist-kpi-val">${escapeHtml(_sfMoney(s.fee, cur))}</div>
            <div class="hist-kpi-sub">on ${escapeHtml(_sfMoney(s.gross, cur))} from ${s.count} payment${s.count === 1 ? '' : 's'} · ${_sfChangeLine(cmp)}</div>
          </div>
        </div>
        <div class="hist-kpi-card">
          <div class="hist-kpi-icon" aria-hidden="true">％</div>
          <div class="hist-kpi-content">
            <div class="hist-kpi-label">Effective rate</div>
            <div class="hist-kpi-val">${effectiveRate(s).toFixed(2)}%</div>
            <div class="hist-kpi-sub">${_sfRateLine(cmp)}</div>
          </div>
        </div>
        <div class="hist-kpi-card highlight-green">
          <div class="hist-kpi-icon" aria-hidden="true">🏦</div>
          <div class="hist-kpi-content">
            <div class="hist-kpi-label">You kept</div>
            <div class="hist-kpi-val">${escapeHtml(_sfMoney(s.net, cur))}</div>
            <div class="hist-kpi-sub">after Stripe's cut${entry.billing ? ` · plus ${escapeHtml(_sfMoney(entry.billing, cur))} in Stripe billing` : ''}</div>
          </div>
        </div>
      </div>
    </div>` : '<p class="sf-note">No customer payments this year, only other balance activity (listed below).</p>';

  return `
    <section class="sf-cur" aria-labelledby="${id}">
      <div class="sf-cur-head">
        <h4 class="sf-cur-title" id="${id}">${year} <span class="pill gold">${escapeHtml(cur)}</span></h4>
        ${_SF_LEDGER_PILLS[status.state]}
      </div>
      ${strip}
      ${_sfLedgerNote(status, entry, cur)}
      ${_sfMonthChart(entry, year, cur)}
      ${_sfActivityTable(entry, cur)}
    </section>`;
}

function _sfOverview(report, ledger) {
  const rows = [];
  for (const year of report.years) {
    for (const cur of Object.keys(report.byYear[year]).sort()) {
      const entry = report.byYear[year][cur];
      const s = entry.sales;
      const cmp = _sfCompare(report, year, cur);
      const status = ledgerFilingStatus(entry, year, cur, ledger);
      rows.push(`<tr>
        <td><button type="button" class="sf-year-link" data-sf-year="${year}" aria-label="Show ${year} in detail">${year}</button></td>
        <td><span class="pill gold">${escapeHtml(cur)}</span></td>
        <td class="r">${s.count}</td>
        <td class="r">${_stripeFmtMoney(_stripeMinorToMajor(s.gross, cur), '')}</td>
        <td class="r sf-fee">${_stripeFmtMoney(_stripeMinorToMajor(s.fee, cur), '')}</td>
        <td class="r">${s.count ? effectiveRate(s).toFixed(2) + '%' : '—'}</td>
        <td class="r sf-dim">${cmp ? _sfChangeLine(cmp).replace(/ vs .*$/, '') : '—'}</td>
        <td>${_SF_LEDGER_PILLS[status.state]}</td>
      </tr>`);
    }
  }
  return `
    <div class="tbl-wrap">
      <table class="tbl sf-overview">
        <thead><tr><th>Year</th><th>Currency</th><th class="r">Payments</th><th class="r">Sales</th><th class="r">Stripe fees</th><th class="r">Rate</th><th class="r">Fees vs year before</th><th>Ledger</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`;
}

/**
 * The report's HTML for one year, or every year when year is 'all'.
 * Kept under its old name and export: the payments screen's helpers list it.
 */
function renderStripeFeesCards(report, year, ledger = []) {
  const years = report?.years || [];
  if (!years.length) return { cardsHtml: '', years };
  const picker = [...years.map(y => String(y)), 'all'].map(y => {
    const on = String(year) === y;
    return `<button type="button" class="filter-segmented-pill${on ? ' active' : ''}" data-sf-year="${y}" aria-pressed="${on}">${y === 'all' ? 'All years' : y}</button>`;
  }).join('');
  const body = year === 'all'
    ? _sfOverview(report, ledger)
    : Object.keys(report.byYear[year] || {}).sort().map(cur => _sfCurrencySection(report, year, cur, ledger)).join('');
  const fetched = report.fetchedAt ? new Date(report.fetchedAt) : null;
  const cardsHtml = `
    <div class="sf-report">
      <div class="sf-toolbar">
        <div class="filter-segmented-control sf-years" role="group" aria-label="Show year">${picker}</div>
        ${fetched ? `<span class="sf-fresh" title="${escapeHtml(fetched.toLocaleString())}">From Stripe ${describeAge(report.fetchedAt)} · ${Number(report.txnCount || 0).toLocaleString()} transactions</span>` : ''}
      </div>
      ${body}
    </div>`;
  return { cardsHtml, years };
}

/** Paint the report (restoring the saved one if this visit hasn't fetched). */
function renderStripeFeesReport() {
  const wrap = document.getElementById('stripe-fees-results-wrap');
  if (!wrap) return;
  if (!_sfReport) {
    _sfReport = loadSavedStripeFeesReport();
    if (_sfReport && !(window._stripeFeesLedgerData || []).length) window._stripeFeesLedgerData = ledgerRowsFromReport(_sfReport);
  }
  if (!_sfWired) {
    _sfWired = true;
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sf-year]');
      if (!btn) return;
      _sfYear = btn.dataset.sfYear === 'all' ? 'all' : Number(btn.dataset.sfYear);
      renderStripeFeesReport();
      wrap.querySelector(`.sf-years [data-sf-year="${_sfYear}"]`)?.focus();
    });
  }
  const report = _sfReport;
  if (!report) { wrap.style.display = 'none'; _sfSyncActions(); return; }
  if (_sfYear !== 'all' && !report.years.includes(_sfYear)) _sfYear = report.years[0] ?? 'all';

  const { cardsHtml } = renderStripeFeesCards(report, _sfYear, TAX_CENTER.businessExpenses || []);
  wrap.innerHTML = cardsHtml || `<div class="empty-state"><div class="e-icon">💳</div>Stripe has no balance activity on this account yet.</div>`;
  wrap.style.display = '';
  _sfSyncActions();
}

/** The buttons under the report follow what it holds and which year is showing. */
function _sfSyncActions() {
  const hasReport = !!_sfReport?.years?.length;
  const ledgerRows = window._stripeFeesLedgerData || [];
  const yearRows = _sfYear === 'all' ? ledgerRows : ledgerRows.filter(r => r.year === _sfYear);
  const scope = _sfYear === 'all' ? 'all years' : String(_sfYear);
  const show = (id, on, label) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = on ? '' : 'none';
    if (label) el.textContent = label;
  };
  show('stripe-fees-insert-btn', yearRows.length > 0, `➕ File ${scope} in ledger`);
  show('stripe-fees-reconcile-btn', ledgerRows.length > 0);
  show('stripe-fees-download-btn', (window._stripeFeesAudit || []).length > 0,
    `⬇ Download ${_sfYear === 'all' ? 'all' : _sfYear} transactions (CSV)`);
  show('stripe-fees-clear-btn', hasReport || !!TAX_CENTER.settings?.stripeKey);
  const fetchBtn = document.getElementById('stripe-fees-btn');
  if (fetchBtn && !fetchBtn.disabled) fetchBtn.textContent = hasReport ? 'Refresh from Stripe' : 'Fetch Stripe fees';
}

async function fetchStripeFeesByYear() {
  const keyEl = document.getElementById('stripe-fees-key');
  const statusEl = document.getElementById('stripe-fees-status');
  const btn = document.getElementById('stripe-fees-btn');
  const wrap = document.getElementById('stripe-fees-results-wrap');
  const key = (keyEl.value || '').trim();
  if (!key) { statusEl.textContent = 'Paste a Stripe restricted key first.'; keyEl.focus(); return; }
  if (!/^(rk|sk)_/.test(key)) { statusEl.innerHTML = '<span class="sf-error">That doesn\'t look like a Stripe secret or restricted key. It should start with rk_ or sk_.</span>'; keyEl.focus(); return; }
  if (navigator.onLine === false) {
    statusEl.textContent = _sfReport
      ? "You're offline. Showing the last report fetched from Stripe; refresh once you're back online."
      : "You're offline. Fetch the report once you're back online.";
    return;
  }

  try {
    if (!TAX_CENTER.settings) TAX_CENTER.settings = {};
    if (TAX_CENTER.settings.stripeKey !== key) {
      TAX_CENTER.settings.stripeKey = key;
      saveTaxCenter().catch(e => console.warn('Stripe key save failed:', e));
    }
  } catch (e) { console.warn('Stripe key persist failed:', e); }

  btn.disabled = true;
  btn.textContent = 'Fetching…';
  statusEl.textContent = 'Asking Stripe for your balance transactions…';
  const hadReport = !!_sfReport;
  if (!hadReport) {
    wrap.innerHTML = '<div class="sf-loading" aria-hidden="true"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>';
    wrap.style.display = '';
  } else {
    wrap.classList.add('is-refreshing');
  }
  const reconcileWrap = document.getElementById('stripe-fees-reconcile-wrap');
  if (reconcileWrap) { reconcileWrap.innerHTML = ''; reconcileWrap.style.display = 'none'; }

  try {
    const allTxns = await fetchStripeTransactions(key, (count) => {
      statusEl.textContent = `Fetched ${count.toLocaleString()} transactions so far…`;
    });

    window._stripeFeesAudit = allTxns;
    const { ledgerData } = aggregateStripeTransactions(allTxns);
    window._stripeFeesLedgerData = ledgerData;

    _sfReport = buildStripeFeeReport(allTxns);
    saveStripeFeesReport(_sfReport);
    if (_sfYear == null || (_sfYear !== 'all' && !_sfReport.years.includes(_sfYear))) _sfYear = _sfReport.years[0] ?? 'all';
    btn.disabled = false;
    renderStripeFeesReport();

    statusEl.innerHTML = `<span class="sf-ok">✓ ${allTxns.length.toLocaleString()} transactions across ${_sfReport.years.length} year${_sfReport.years.length === 1 ? '' : 's'}. Your key is saved for next time.</span>
      <span class="sf-hint">Check it against Stripe: <a href="https://dashboard.stripe.com/reports/balance" target="_blank" rel="noopener">Balance report</a> (set the dates to one calendar year).</span>`;
  } catch (e) {
    const msg = String(e.message || e);
    let hint = '';
    if (/Failed to fetch|NetworkError|CORS/i.test(msg)) {
      hint = '<span class="sf-hint">Your browser couldn\'t reach Stripe. Check your connection; if it keeps happening, run <code>scripts/stripe-fees-by-year.js</code> on a computer instead.</span>';
    }
    statusEl.innerHTML = `<span class="sf-error">Couldn't fetch from Stripe: ${escapeHtml(msg)}</span>${hint}${hadReport ? '<span class="sf-hint">Still showing the last report.</span>' : ''}`;
    if (!hadReport) { wrap.innerHTML = ''; wrap.style.display = 'none'; }
  } finally {
    btn.disabled = false;
    wrap.classList.remove('is-refreshing');
    _sfSyncActions();
  }
}

// Insert Stripe processing fees on sales into the master ledger, one entry per
// year+currency, categorized as "Sales Processing Fees" and converted to CAD at
// the year-end rate. Idempotent: re-running upserts by ref "stripe-fees:<yr>:<cur>"
// so the current year's running total is refreshed without duplicating.
//
// Split into three because the fortnightly background job needs the middle two
// without the first: planning is where the money is worked out, writing is
// where it lands, and the interactive wrapper is the confirmation dialog and
// the DOM around them. One planner and one writer, two callers.

/**
 * Work out the ledger rows a set of aggregated Stripe years should produce.
 *
 * Async because the currency conversion is fetched: a closed year is converted
 * at ITS year-end rate, a year still running at today's. That distinction is
 * the whole reason a year has to be re-filed once it ends.
 */
async function planStripeFeeRows(rows, { now = Date.now() } = {}) {
  const currentYear = new Date(now).getFullYear();

  const rateFor = async (cur, year) => {
    if (cur === 'CAD') return 1;
    const fxDate = year < currentYear ? `${year}-12-31` : today();
    let rate = 0;
    try { const h = await fetchHistoricalRate(cur, 'CAD', fxDate); rate = h?.rate || 0; } catch (_) { /* fall through */ }
    if (!rate) { try { const lr = await fetchLiveRate(cur, 'CAD'); rate = lr?.rate || 0; } catch (_) { /* fall through */ } }
    if (!rate) rate = _fxRateCache[`${cur}_CAD`] || 0;
    return rate || 1;
  };

  const planned = [];
  const fxRates = await Promise.all(rows.map(r => rateFor(r.cur.toUpperCase(), r.year)));
  let i = 0;
  for (const r of rows) {
    const cur = r.cur.toUpperCase();
    const entryDate = r.year < currentYear ? `${r.year}-12-31` : today();
    const fxRate = fxRates[i++];

    const salesFee = _stripeMinorToMajor(r.salesFeeMinor, r.cur);
    if (salesFee > 0) {
      planned.push({
        year: r.year,
        ref: `stripe-fees:${r.year}:${cur}`,
        desc: `Stripe processing fees on sales ${r.year}${r.salesCount ? ` (${r.salesCount} payment${r.salesCount === 1 ? '' : 's'})` : ''}`,
        cat: 'Sales Processing Fees',
        currency: cur, amount: salesFee, origCurrency: cur, origAmount: salesFee,
        fxRate, baseAmount: salesFee * fxRate, date: entryDate,
      });
    }

    const billing = _stripeMinorToMajor(r.stripeBillingMinor, r.cur);
    if (billing > 0) {
      planned.push({
        year: r.year,
        ref: `stripe-billing:${r.year}:${cur}`,
        desc: `Stripe billing & service fees ${r.year}`,
        cat: 'Software & Subscriptions',
        currency: cur, amount: billing, origCurrency: cur, origAmount: billing,
        fxRate, baseAmount: billing * fxRate, date: entryDate,
      });
    }
  }
  return planned;
}

/**
 * File planned fee rows into the ledger, upserting by ref.
 *
 * Deliberately does NOT save or re-render: the caller decides, so a background
 * run that plans nothing never touches the tax document. saveTaxCenter()
 * serialises the whole ledger, and calling it on an idle poll is the defect
 * this app has already shipped once.
 */
function writeStripeFeeRows(planned) {
  if (!TAX_CENTER.businessExpenses) TAX_CENTER.businessExpenses = [];
  if (!TAX_CENTER.settings) TAX_CENTER.settings = {};

  const byRef = new Map((TAX_CENTER.businessExpenses || [])
    .filter(e => e && typeof e.ref === 'string' && (e.ref.startsWith('stripe-fees:') || e.ref.startsWith('stripe-billing:')))
    .map(e => [e.ref, e]));

  let inserted = 0, updated = 0;
  for (const p of planned) {
    const existing = byRef.get(p.ref);
    if (existing) {
      Object.assign(existing, {
        desc: p.desc, cat: p.cat, currency: p.currency, amount: p.amount,
        origCurrency: p.origCurrency, origAmount: p.origAmount,
        fxRate: p.fxRate, baseAmount: p.baseAmount, date: p.date,
      });
      updated++;
    } else {
      const { year: _y, ...rest } = p;
      TAX_CENTER.businessExpenses.unshift({ id: Date.now() + inserted + 1, ...rest, receipt: '', trip: '' });
      inserted++;
    }
  }
  const totalCad = planned.reduce((s, p) => s + (p.baseAmount || 0), 0);
  if (inserted || updated) TAX_CENTER.settings.stripeFeesLastImportAt = new Date().toISOString();
  return { inserted, updated, totalCad };
}

async function insertStripeFeesIntoLedger() {
  let rows = window._stripeFeesLedgerData || [];
  if (!rows.length) { showToast('Fetch the report from Stripe first.', 'warn'); return; }

  // Files the year the report is showing, or every year from "All years".
  const yearFilter = typeof _sfYear === 'number' ? _sfYear : null;
  if (yearFilter != null) rows = rows.filter(r => r.year === yearFilter);

  const planned = await planStripeFeeRows(rows);
  if (!planned.length) { showToast(`Stripe charged no fees to file for ${yearFilter ?? 'any year'}.`, 'warn'); return; }

  const byRef = new Map((TAX_CENTER.businessExpenses || [])
    .filter(e => e && typeof e.ref === 'string' && (e.ref.startsWith('stripe-fees:') || e.ref.startsWith('stripe-billing:')))
    .map(e => [e.ref, e]));
  const newCount = planned.filter(p => !byRef.has(p.ref)).length;
  const updateCount = planned.length - newCount;
  const totalCad = planned.reduce((s, p) => s + (p.baseAmount || 0), 0);
  // ⚡ Bolt Optimization: Use string comparison instead of localeCompare for sorting ref strings
  const lines = planned.sort((a, b) => a.ref > b.ref ? 1 : (a.ref < b.ref ? -1 : 0))
    .map(p => `  • ${p.year} ${p.cat === 'Software & Subscriptions' ? 'billing' : 'sales fees'}: ${p.amount.toFixed(2)} ${p.currency} → ${p.baseAmount.toFixed(2)} CAD`).join('\n');

  const scope = yearFilter != null ? `${yearFilter}` : 'all years';
  const accept = await confirmDialog(
    `File Stripe fees (${scope}) in your master ledger as business expenses?\n\n` +
    `${newCount} new${updateCount ? `, ${updateCount} updated in place` : ''}\n` +
    `Total: ${totalCad.toFixed(2)} CAD\n\n${lines}\n\n` +
    `Nothing is written until you confirm.`,
    { title: 'File Stripe fees', okLabel: 'File fees' }
  );
  if (!accept) { showToast('Nothing filed', 'warn'); return; }

  const { inserted, updated } = writeStripeFeeRows(planned);
  await saveTaxCenter();
  renderTaxCenter();
  renderStripeFeesReport();
  showToast(`✓ Stripe fees: ${inserted} added${updated ? `, ${updated} updated` : ''}`, 'ok');
  const statusEl = document.getElementById('stripe-fees-status');
  if (statusEl) statusEl.innerHTML = `<span class="sf-ok">✓ Ledger updated: ${inserted} added${updated ? `, ${updated} updated` : ''} (${totalCad.toFixed(2)} CAD).</span>`;
}

// ─── Stripe fees, filed on a fortnightly clock ────────────────────────────
//
// Everything above is the manual tool: paste a key, press Fetch, press Insert,
// confirm a dialog. It works, and it only ever happens when the publisher
// remembers — which for a figure that matters once a year, at tax time, means
// the year's card fees are usually months out of date and last year's were
// never closed off at all.
//
// Two obligations, both in lib/stripe-fee-schedule.js: every fortnight, and
// whenever a calendar year has ended since the last run. The second is not
// "run on the 31st of December" — a web page cannot run on a day nobody opens
// it. It is "never let a year end without a run covering it", which the filing
// code turns into the thing that actually matters: a closed year is re-dated to
// the 31st and re-converted at that day's exchange rate, instead of keeping
// whatever mid-December date and rate it happened to be filed with.

const STRIPE_FEE_LAST_KEY = 'lm-stripe-fee-sweep-last';

let _stripeFeeWatchStarted = false;
let _stripeFeeSweeping = false;

function readStripeFeeStamp() {
  try { return Number(localStorage.getItem(STRIPE_FEE_LAST_KEY)) || 0; } catch (_) { return 0; }
}

function writeStripeFeeStamp(at) {
  // Browser storage, deliberately, not the tax document: this is written on
  // every run including the ones that file nothing, and saveTaxCenter()
  // serialises the whole ledger. TAX_CENTER keeps stripeFeesLastImportAt, which
  // records the last time money actually moved.
  try { localStorage.setItem(STRIPE_FEE_LAST_KEY, String(at)); } catch (_) { /* private mode */ }
}

/** The card announcing fees that filed themselves. */
function showStripeFeeAlert(said) {
  if (!said) return;
  pushAppAlert({
    id: 'stripe-fee-sweep',
    icon: said.yearEnd ? '📅' : '💳',
    title: said.title,
    detail: said.detail,
    tone: '',
    actionLabel: 'Open Tax Centre',
    action: "switchTab('taxcenter')",
  });
}

/**
 * Ask Stripe what its fees came to, and file them.
 *
 * Returns what it filed, or null when it was not due or could not run.
 */
async function sweepStripeFees({ force = false } = {}) {
  // Publisher only: the Stripe key is publisher-only in the security rules, and
  // an author must never trigger a write to the shared ledger.
  if (!window.IS_PUBLISHER || isAuthor()) return null;

  const key = getReconStripeKey();
  const configured = !!key && /^(rk|sk)_/.test(key);
  const { online, visible } = browserWatchState();
  const lastRunAt = readStripeFeeStamp();
  const now = Date.now();

  const owed = dueForFeeSweep({
    lastRunAt,
    now,
    intervalMs: effectiveInterval(
      STRIPE_FEE_INTERVAL_MS,
      integrationBackoffMs('stripe-fees', STRIPE_FEE_INTERVAL_MS),
    ),
  });
  // The schedule says whether a run is owed; the gates say whether it can
  // happen at all. A year-end run that is owed while the laptop is shut is
  // still owed when it opens — which is the whole point of the boundary rule.
  const gatesOk = configured && online && !_stripeFeeSweeping && (force || visible);
  if (!gatesOk || (!force && !owed.due)) return null;

  _stripeFeeSweeping = true;
  try {
    const fromYear = feeSweepFromYear({ lastRunAt, now });
    const txns = await fetchStripeTransactions(key, null, { since: startOfYear(fromYear) });
    const { ledgerData } = aggregateStripeTransactions(txns);
    // Keep the saved report current too, so the Tax Centre opens on figures
    // this run just fetched rather than whatever the last manual fetch said.
    const merged = mergeReportYears(_sfReport || loadSavedStripeFeesReport(), buildStripeFeeReport(txns), fromYear);
    if (merged) {
      _sfReport = merged;
      saveStripeFeesReport(merged);
      window._stripeFeesLedgerData = ledgerRowsFromReport(merged);
      renderStripeFeesReport();
    }

    // Only the years this run is entitled to rewrite. Anything older was closed
    // and filed already, and a background job is for keeping the books current,
    // not for quietly restating history.
    const rows = (ledgerData || []).filter(r => r.year >= fromYear);
    const planned = await planStripeFeeRows(rows, { now });

    writeStripeFeeStamp(Date.now());
    noteIntegrationSuccess('stripe-fees');
    if (!planned.length) return { inserted: 0, updated: 0, totalCad: 0 };

    const result = writeStripeFeeRows(planned);
    if (result.inserted || result.updated) {
      await saveTaxCenter().catch(e => console.warn('Stripe fee sweep save failed', e));
      renderTaxCenter();
      renderStripeFeesReport();
      showStripeFeeAlert(describeFeeSweep({ ...result, reason: force ? 'interval' : owed.reason }));
    }
    return result;
  } catch (error) {
    console.warn('Stripe fee sweep failed', error);
    noteIntegrationFailure('stripe-fees', error, { online, configured });
    return null;
  } finally {
    _stripeFeeSweeping = false;
  }
}

function startStripeFeeWatch() {
  if (_stripeFeeWatchStarted || typeof window === 'undefined') return;
  _stripeFeeWatchStarted = true;
  // Polled hourly rather than fortnightly: the schedule itself decides what is
  // owed, and a fortnightly timer would sail straight past the 31st of December
  // on a laptop that was shut for the holidays.
  startWatch(() => { sweepStripeFees(); }, { intervalMs: 60 * 60 * 1000 });
}

// Compare what Stripe says you collected (gross customer payments, converted to
// CAD) against the sales you recorded in the app, per year — a quick gap check.
async function reconcileStripeAgainstSales() {
  const rows = window._stripeFeesLedgerData || [];
  const wrap = document.getElementById('stripe-fees-reconcile-wrap');
  if (!rows.length) { showToast('Fetch the report from Stripe first.', 'warn'); return; }
  if (wrap) { wrap.style.display = ''; wrap.innerHTML = '<p class="sf-note" role="status">Comparing Stripe with your recorded sales…</p>'; }
  const currentYear = new Date().getFullYear();

  // Stripe gross customer payments per year, converted to CAD.
  const stripeByYear = {};
  for (const r of rows) {
    const cur = r.cur.toUpperCase();
    const grossMajor = _stripeMinorToMajor(r.salesGrossMinor, r.cur);
    if (!(grossMajor > 0)) continue;
    let rate = 1;
    if (cur !== 'CAD') {
      const fxDate = r.year < currentYear ? `${r.year}-12-31` : today();
      try { const h = await fetchHistoricalRate(cur, 'CAD', fxDate); rate = h?.rate || 0; } catch (_) { /* fall through */ }
      if (!rate) { try { const lr = await fetchLiveRate(cur, 'CAD'); rate = lr?.rate || 0; } catch (_) { /* fall through */ } }
      if (!rate) rate = _fxRateCache[`${cur}_CAD`] || 1;
    }
    stripeByYear[r.year] = (stripeByYear[r.year] || 0) + grossMajor * rate;
  }

  // Recorded sales per year from the app's per-book history.
  const salesByYear = {};
  for (const book of BOOK_LIST) {
    const s = states[book.id] || defaultState(book);
    for (const h of (s.hist || [])) {
      if (h.voided || h.gratuity || !h.date) continue;
      const y = Number(String(h.date).slice(0, 4));
      if (!y) continue;
      salesByYear[y] = (salesByYear[y] || 0) + (h.qty || 0) * (h.price || 0);
    }
  }

  const years = [...new Set([...Object.keys(stripeByYear), ...Object.keys(salesByYear)].map(Number))].sort((a, b) => b - a);
  if (!years.length) { if (wrap) wrap.innerHTML = '<p class="sf-note">Neither Stripe nor your sales history has anything to compare yet.</p>'; return; }

  const fmtCad = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const bodyRows = years.map(y => {
    const stripe = stripeByYear[y] || 0;
    const recorded = salesByYear[y] || 0;
    const diff = recorded - stripe;
    const aligned = Math.abs(diff) < 0.01 || (stripe > 0 && Math.abs(diff) / stripe < 0.02); // within 2%
    return `<tr>
      <td>${y}</td>
      <td class="r">${fmtCad(stripe)}</td>
      <td class="r">${fmtCad(recorded)}</td>
      <td class="r ${aligned ? 'sf-ok' : 'sf-warn'}">${diff >= 0 ? '+' : ''}${fmtCad(diff)}</td>
      <td class="r">${aligned ? '<span class="pill green">✓ Matches</span>' : '<span class="pill amber">! Worth a look</span>'}</td>
    </tr>`;
  }).join('');

  if (wrap) wrap.innerHTML = `
    <section class="sf-recon" aria-labelledby="sf-recon-h">
      <div class="sf-cur-head">
        <h4 class="sf-cur-title" id="sf-recon-h">Stripe vs your recorded sales</h4>
        <button type="button" class="card-x" aria-label="Close the comparison" title="Press Compare with sales again to bring it back" onclick="this.closest('#stripe-fees-reconcile-wrap').style.display='none'">✕</button>
      </div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Year</th><th class="r">Stripe collected (CAD)</th><th class="r">Recorded sales (CAD)</th><th class="r">Difference</th><th class="r">Status</th></tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
      <p class="sf-foot"><strong>Stripe collected</strong> is what customers paid through Stripe, converted to CAD at the year-end rate. <strong>Recorded sales</strong> is quantity × price from your book history. A gap isn't always a mistake: cash and PayPal sales, refunds, and Stripe payments not yet logged as sales all show up here. Treat it as a pointer, not an exact tie-out.</p>
    </section>`;
}

async function clearStoredStripeKey() {
  try {
    if (TAX_CENTER.settings) delete TAX_CENTER.settings.stripeKey;
    const keyEl = document.getElementById('stripe-fees-key');
    if (keyEl) keyEl.value = '';
    // The saved report goes with the key: forgetting Stripe on a shared
    // computer shouldn't leave its figures behind in the browser.
    try { localStorage.removeItem(STRIPE_FEES_REPORT_KEY); } catch (_) { /* private mode */ }
    _sfReport = null;
    window._stripeFeesAudit = [];
    window._stripeFeesLedgerData = [];
    renderStripeFeesReport();
    const statusEl = document.getElementById('stripe-fees-status');
    if (statusEl) statusEl.textContent = '';
    await saveTaxCenter();
    showToast('Stripe key and saved report cleared.');
  } catch (e) {
    console.error(e);
    showToast('⚠ Failed to clear key', 'err');
  }
}

function downloadStripeFeesAuditCSV() {
  const all = window._stripeFeesAudit || [];
  if (!all.length) { showToast('Fetch the report from Stripe first.', 'warn'); return; }
  const rows = typeof _sfYear === 'number' ? all.filter(r => r.year === _sfYear) : all;
  const header = ['id', 'created_iso', 'year', 'currency', 'type', 'amount_major', 'fee_major', 'net_major', 'source', 'description'];
  const lines = [header];
  for (const r of rows) {
    lines.push([
      r.id,
      new Date(r.created * 1000).toISOString(),
      r.year, r.currency, r.type,
      _stripeMinorToMajor(r.amount, r.currency).toFixed(2),
      _stripeMinorToMajor(r.fee, r.currency).toFixed(2),
      _stripeMinorToMajor(r.net, r.currency).toFixed(2),
      r.source || '', r.description || ''
    ]);
  }
  const scope = typeof _sfYear === 'number' ? `${_sfYear}-` : '';
  downloadCsv(toCsv(lines), `stripe-balance-transactions-${scope}${new Date().toISOString().slice(0, 10)}.csv`);
}

export {
  _stripeMinorToMajor,
  _stripeFriendlyType,
  _stripeFmtMoney,
  fetchStripeTransactions,
  aggregateStripeTransactions,
  renderStripeFeesCards,
  renderStripeFeesReport,
  fetchStripeFeesByYear,
  insertStripeFeesIntoLedger,
  sweepStripeFees,
  startStripeFeeWatch,
  reconcileStripeAgainstSales,
  clearStoredStripeKey,
  downloadStripeFeesAuditCSV,
};
