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
  BOOK_LIST,
  TAX_CENTER,
  _fxRateCache,
  defaultState,
  fetchHistoricalRate,
  fetchLiveRate,
  getReconStripeKey,
  isAuthor,
  showToast,
  states,
  today,
} from '../main.js';
import { renderTaxCenter, saveTaxCenter } from './taxcentre.js';
import { confirmDialog } from '../lib/modal.js';
import { pushAppAlert } from '../lib/app-alert.js';
import { integrationBackoffMs, noteIntegrationFailure, noteIntegrationSuccess } from '../lib/integration-watch.js';
import { browserWatchState, effectiveInterval, startWatch } from '../lib/watch-schedule.js';
import { isZeroDecimalCurrency } from '../lib/invoice-payments.js';
import { STRIPE_FEE_INTERVAL_MS, describeFeeSweep, dueForFeeSweep, feeSweepFromYear, startOfYear } from '../lib/stripe-fee-schedule.js';
import { toCsv } from '../lib/csv.js';
import { downloadCsv } from '../lib/download.js';

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

function renderStripeFeesCards(data, byYearCurAll) {
  const years = Object.keys(data).sort((a, b) => Number(b) - Number(a));
  const cards = [];
  const SALES_TYPES = new Set(['charge', 'payment']);

  for (const year of years) {
    const curs = Object.keys(data[year]).sort();
    for (const cur of curs) {
      const types = data[year][cur];
      const salesAgg = { gross: 0, fee: 0, net: 0, count: 0 };
      for (const t of Object.keys(types)) {
        if (SALES_TYPES.has(t)) {
          salesAgg.gross += types[t].gross;
          salesAgg.fee += types[t].fee;
          salesAgg.net += types[t].net;
          salesAgg.count += types[t].count;
        }
      }

      let headline;
      if (salesAgg.count > 0) {
        const gross = _stripeMinorToMajor(salesAgg.gross, cur);
        const fee = _stripeMinorToMajor(salesAgg.fee, cur);
        const net = _stripeMinorToMajor(salesAgg.net, cur);
        const pct = salesAgg.gross ? (salesAgg.fee / salesAgg.gross) * 100 : 0;
        headline = `
          <div style="display:flex;flex-wrap:wrap;gap:1.5rem;align-items:flex-end;">
            <div style="flex:2;min-width:240px;">
              <div style="font-size:var(--text-xs);color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px;">Stripe fees on your sales</div>
              <div style="font-family:var(--font-mono);font-size:32px;font-weight:500;color:var(--red);line-height:1;">${_stripeFmtMoney(fee, cur)}</div>
              <div style="font-size:var(--text-base);color:var(--text2);margin-top:8px;line-height:1.5;">
                on <strong>${_stripeFmtMoney(gross, cur)}</strong> across <strong>${salesAgg.count}</strong> customer ${salesAgg.count === 1 ? 'payment' : 'payments'}<br>
                You received <strong style="color:var(--green);">${_stripeFmtMoney(net, cur)}</strong> net into your Stripe balance
              </div>
            </div>
            <div style="flex:1;min-width:120px;text-align:right;">
              <div style="font-size:var(--text-xs);color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px;">Effective rate</div>
              <div style="font-family:var(--font-mono);font-size:32px;font-weight:500;color:var(--gold);line-height:1;">${pct.toFixed(2)}%</div>
              <div style="font-size:var(--text-xs);color:var(--text3);margin-top:8px;">of gross sales</div>
            </div>
          </div>`;
      } else {
        headline = `<div style="font-size:var(--text-base);color:var(--text3);font-style:italic;">No customer payments in this year — only balance activity below.</div>`;
      }

      const otherTypes = Object.keys(types).filter(t => !SALES_TYPES.has(t)).sort();
      const detailRows = [];
      if (salesAgg.count > 0) {
        const gross = _stripeMinorToMajor(salesAgg.gross, cur);
        const fee = _stripeMinorToMajor(salesAgg.fee, cur);
        const net = _stripeMinorToMajor(salesAgg.net, cur);
        detailRows.push(`<tr style="background:rgba(232,64,42,.06);">
          <td><strong>Customer payments</strong><div style="font-size:var(--text-2xs);color:var(--text3);">charge · payment</div></td>
          <td class="r">${salesAgg.count}</td>
          <td class="r">${_stripeFmtMoney(gross, '')}</td>
          <td class="r" style="color:var(--red);">${_stripeFmtMoney(fee, '')}</td>
          <td class="r"><strong>${_stripeFmtMoney(net, '')}</strong></td>
        </tr>`);
      }
      for (const t of otherTypes) {
        const r = types[t];
        const gross = _stripeMinorToMajor(r.gross, cur);
        const fee = _stripeMinorToMajor(r.fee, cur);
        const net = _stripeMinorToMajor(r.net, cur);
        detailRows.push(`<tr>
          <td>${_stripeFriendlyType(t)}<div style="font-size:var(--text-2xs);color:var(--text3);">${t}</div></td>
          <td class="r">${r.count}</td>
          <td class="r">${_stripeFmtMoney(gross, '')}</td>
          <td class="r" style="color:${fee !== 0 ? 'var(--red)' : 'var(--text3)'};">${fee !== 0 ? _stripeFmtMoney(fee, '') : '—'}</td>
          <td class="r">${_stripeFmtMoney(net, '')}</td>
        </tr>`);
      }

      const tot = byYearCurAll[year][cur];
      const tgross = _stripeMinorToMajor(tot.gross, cur);
      const tfee = _stripeMinorToMajor(tot.fee, cur);
      const tnet = _stripeMinorToMajor(tot.net, cur);
      const detailId = `stripe-detail-${year}-${cur}`;

      cards.push(`
        <div class="card" style="margin-bottom:1rem;padding:1.25rem 1.4rem;">
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:14px;border-bottom:var(--stroke-hair) solid var(--border);padding-bottom:10px;">
            <div style="font-family:var(--font-display);font-size:var(--text-xl);color:var(--text);">${year}</div>
            <span class="pill gold">${cur}</span>
          </div>
          ${headline}
          ${detailRows.length ? `
          <div style="margin-top:14px;">
            <button type="button" class="btn tag" onclick="(function(el){const d=document.getElementById('${detailId}');const open=d.style.display!=='none';d.style.display=open?'none':'';el.innerHTML=(open?'▸':'▾')+' '+el.dataset.label;})(this)" data-label="Show all balance activity (${detailRows.length} line ${detailRows.length === 1 ? 'item' : 'items'})" style="background:transparent;border:var(--stroke-hair) dashed var(--gold-line);">▸ Show all balance activity (${detailRows.length} line ${detailRows.length === 1 ? 'item' : 'items'})</button>
            <div id="${detailId}" style="display:none;margin-top:12px;">
              <div class="tbl-wrap" style="margin-bottom:8px;">
                <table class="tbl">
                  <thead><tr><th>Activity</th><th class="r">Count</th><th class="r">Amount</th><th class="r">Stripe fee</th><th class="r">Net</th></tr></thead>
                  <tbody>${detailRows.join('')}
                    <tr style="border-top:var(--stroke) solid var(--gold-line);font-weight:600;background:var(--cream2);">
                      <td>All activity total<div style="font-size:var(--text-2xs);color:var(--text3);font-weight:400;">matches Stripe Dashboard Balance report</div></td>
                      <td class="r">${tot.count}</td>
                      <td class="r">${_stripeFmtMoney(tgross, '')}</td>
                      <td class="r" style="color:var(--red);">${_stripeFmtMoney(tfee, '')}</td>
                      <td class="r">${_stripeFmtMoney(tnet, '')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style="font-size:var(--text-xs);color:var(--text3);line-height:1.5;">
                <strong>Customer payments</strong> is the line that answers "what % does Stripe take from my sales".
                The other rows (refunds, payouts, service fees, adjustments) are non-sale balance movements — included so the total reconciles with Stripe's Balance report.
              </div>
            </div>
          </div>` : ''}
        </div>`);
    }
  }

  return { cardsHtml: cards.join(''), years };
}

async function fetchStripeFeesByYear() {
  const keyEl = document.getElementById('stripe-fees-key');
  const statusEl = document.getElementById('stripe-fees-status');
  const btn = document.getElementById('stripe-fees-btn');
  const wrap = document.getElementById('stripe-fees-results-wrap');
  const key = (keyEl.value || '').trim();
  if (!key) { statusEl.textContent = 'Please paste a Stripe restricted key.'; return; }
  if (!/^(rk|sk)_/.test(key)) { statusEl.innerHTML = '<span style="color:var(--red);">That doesn\'t look like a Stripe secret/restricted key (expected rk_… or sk_…).</span>'; return; }

  try {
    if (!TAX_CENTER.settings) TAX_CENTER.settings = {};
    if (TAX_CENTER.settings.stripeKey !== key) {
      TAX_CENTER.settings.stripeKey = key;
      saveTaxCenter().catch(e => console.warn('Stripe key save failed:', e));
    }
  } catch (e) { console.warn('Stripe key persist failed:', e); }

  btn.disabled = true;
  statusEl.textContent = 'Fetching balance transactions…';
  wrap.innerHTML = '';
  wrap.style.display = 'none';
  const reconcileWrap = document.getElementById('stripe-fees-reconcile-wrap');
  if (reconcileWrap) { reconcileWrap.innerHTML = ''; reconcileWrap.style.display = 'none'; }

  try {
    const allTxns = await fetchStripeTransactions(key, (count) => {
      statusEl.textContent = `Fetched ${count} transactions…`;
    });

    window._stripeFeesAudit = allTxns;

    const { data, byYearCurAll, ledgerData } = aggregateStripeTransactions(allTxns);
    window._stripeFeesLedgerData = ledgerData;

    const { cardsHtml, years } = renderStripeFeesCards(data, byYearCurAll);

    wrap.innerHTML = cardsHtml
      ? cardsHtml
      : '<div class="card" style="text-align:center;color:var(--text3);padding:2rem;">No balance transactions found.</div>';
    wrap.style.display = '';

    statusEl.innerHTML = `<span style="color:var(--green);">✓ Done — ${allTxns.length} balance transactions across ${years.length} year(s). Key saved for next time.</span>
      <br><span style="font-size:var(--text-xs);color:var(--text3);">Verify against your Stripe Dashboard: <a href="https://dashboard.stripe.com/balance" target="_blank" rel="noopener" style="color:var(--gold);">Balance</a> · <a href="https://dashboard.stripe.com/reports/balance" target="_blank" rel="noopener" style="color:var(--gold);">Balance reports</a> (set the date range to a calendar year). Click "Download audit CSV" below for the raw per-transaction data.</span>`;

    document.getElementById('stripe-fees-download-btn').style.display = '';
    document.getElementById('stripe-fees-clear-btn').style.display = '';

    const hasLedgerData = ledgerData.length > 0;
    const insertBtn = document.getElementById('stripe-fees-insert-btn');
    if (insertBtn) insertBtn.style.display = hasLedgerData ? '' : 'none';
    const reconcileBtn = document.getElementById('stripe-fees-reconcile-btn');
    if (reconcileBtn) reconcileBtn.style.display = hasLedgerData ? '' : 'none';

    const yearSel = document.getElementById('stripe-fees-year');
    if (yearSel) {
      const ledgerYears = [...new Set(ledgerData.map(r => r.year))].sort((a, b) => b - a);
      yearSel.innerHTML = `<option value="all">All years</option>` + ledgerYears.map(y => `<option value="${y}">${y}</option>`).join('');
      yearSel.style.display = hasLedgerData ? '' : 'none';
    }
  } catch (e) {
    const msg = String(e.message || e);
    let hint = '';
    if (/Failed to fetch|NetworkError|CORS/i.test(msg)) {
      hint = '<br><span style="font-size:var(--text-xs);">If this is a CORS error, run <code>scripts/stripe-fees-by-year.js</code> locally instead — your browser may be blocking direct Stripe API calls.</span>';
    }
    statusEl.innerHTML = `<span style="color:var(--red);">Error: ${msg}</span>${hint}`;
  } finally {
    btn.disabled = false;
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
  if (!rows.length) { showToast('Run "Fetch fees" first.', 'warn'); return; }

  // Optional year filter so the user can insert just one year at a time.
  const yearSel = document.getElementById('stripe-fees-year');
  const yearFilter = yearSel && yearSel.value !== 'all' ? Number(yearSel.value) : null;
  if (yearFilter != null) rows = rows.filter(r => r.year === yearFilter);

  const planned = await planStripeFeeRows(rows);
  if (!planned.length) { showToast('No Stripe fees to insert for that selection.', 'warn'); return; }

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
    `Insert Stripe fees (${scope}) into your master ledger?\n\n` +
    `${newCount} new${updateCount ? `, ${updateCount} updated (refreshed in place)` : ''}\n` +
    `Total: ${totalCad.toFixed(2)} CAD\n\n${lines}\n\n` +
    `Nothing is written until you confirm.`,
    { title: 'Insert Stripe fees', okLabel: 'Insert fees' }
  );
  if (!accept) { showToast('Stripe fee insertion cancelled', 'warn'); return; }

  const { inserted, updated } = writeStripeFeeRows(planned);
  await saveTaxCenter();
  renderTaxCenter();
  showToast(`✓ Stripe fees: ${inserted} added${updated ? `, ${updated} updated` : ''}`, 'ok');
  const statusEl = document.getElementById('stripe-fees-status');
  if (statusEl) statusEl.innerHTML += `<br><span style="color:var(--green);">Ledger updated: ${inserted} added${updated ? `, ${updated} updated` : ''} (${totalCad.toFixed(2)} CAD).</span>`;
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
  if (!rows.length) { showToast('Run "Fetch fees" first.', 'warn'); return; }
  if (wrap) { wrap.style.display = ''; wrap.innerHTML = '<div style="font-size:var(--text-sm);color:var(--text3);padding:8px;">Computing reconciliation…</div>'; }
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
  if (!years.length) { if (wrap) wrap.innerHTML = '<div style="font-size:var(--text-sm);color:var(--text3);padding:8px;">No data to reconcile.</div>'; return; }

  const fmtCad = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const bodyRows = years.map(y => {
    const stripe = stripeByYear[y] || 0;
    const recorded = salesByYear[y] || 0;
    const diff = recorded - stripe;
    const aligned = Math.abs(diff) < 0.01 || (stripe > 0 && Math.abs(diff) / stripe < 0.02); // within 2%
    const diffColor = aligned ? 'var(--green)' : 'var(--amber)';
    return `<tr>
      <td>${y}</td>
      <td class="r" style="font-family:var(--font-mono);">${fmtCad(stripe)}</td>
      <td class="r" style="font-family:var(--font-mono);">${fmtCad(recorded)}</td>
      <td class="r" style="font-family:var(--font-mono);color:${diffColor};">${diff >= 0 ? '+' : ''}${fmtCad(diff)}</td>
      <td class="r">${aligned ? '<span class="pill green" style="font-size:var(--text-2xs);">✓ Aligned</span>' : '<span class="pill" style="font-size:var(--text-2xs);background:var(--amber);color:var(--on-status);">Review</span>'}</td>
    </tr>`;
  }).join('');

  if (wrap) wrap.innerHTML = `
    <div class="card" style="margin-bottom:1rem;padding:1.1rem 1.3rem;">
      <div style="font-family:var(--font-ui);font-size:16px;margin-bottom:8px;">Reconciliation — Stripe vs recorded sales</div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Year</th><th class="r">Stripe collected (CAD)</th><th class="r">Recorded sales (CAD)</th><th class="r">Difference</th><th class="r">Status</th></tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
      <div style="font-size:var(--text-xs);color:var(--text3);line-height:1.5;margin-top:8px;">
        <strong>Stripe collected</strong> = gross customer payments (charge/payment) converted to CAD at the year-end rate.
        <strong>Recorded sales</strong> = qty × price from your book history, summed as entered.
        Differences can be legitimate (cash/PayPal sales, refunds, Stripe payments not yet logged as sales) — this is a directional check, not an exact tie-out.
      </div>
    </div>`;
}

async function clearStoredStripeKey() {
  try {
    if (TAX_CENTER.settings) delete TAX_CENTER.settings.stripeKey;
    const keyEl = document.getElementById('stripe-fees-key');
    if (keyEl) keyEl.value = '';
    await saveTaxCenter();
    showToast('Stripe key cleared.');
  } catch (e) {
    console.error(e);
    showToast('⚠ Failed to clear key', 'err');
  }
}

function downloadStripeFeesAuditCSV() {
  const rows = window._stripeFeesAudit || [];
  if (!rows.length) { showToast('Run a Stripe fees fetch first.', 'warn'); return; }
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
  downloadCsv(toCsv(lines), `stripe-balance-transactions-${new Date().toISOString().slice(0, 10)}.csv`);
}

export {
  _stripeMinorToMajor,
  _stripeFriendlyType,
  _stripeFmtMoney,
  fetchStripeTransactions,
  aggregateStripeTransactions,
  renderStripeFeesCards,
  fetchStripeFeesByYear,
  insertStripeFeesIntoLedger,
  sweepStripeFees,
  startStripeFeeWatch,
  reconcileStripeAgainstSales,
  clearStoredStripeKey,
  downloadStripeFeesAuditCSV,
};
