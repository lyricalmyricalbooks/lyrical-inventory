// The per-book dashboard: the headline numbers and channel mix (updateDash),
// the stock drift banner and allocation bar, the expenses and break-even
// blocks, the author's profit tiers, and the author money card that sits on
// it — what is owed from sales, settle up, payout requests, the payout
// history and the payout form.
//
// Lifted out of src/main.js as one unit, verbatim apart from the inline
// handlers, which became plain function declarations that main.js puts on
// window. Nothing here runs at module-evaluation time (the top level is
// constants, empty state and function declarations), which is what makes the
// main.js <-> feature import cycle safe.
//
// eslint's no-undef (an error, checked in CI) is what keeps the import list
// honest: an identifier that isn't imported fails the build rather than
// throwing at click time.
import {
  $,
  animateCountValue,
  calculateArtistEarnings,
  chanLabel,
  channelColor,
  fetchLiveRate,
  isAuthor,
  isPublisherSession,
  notifyUrl,
  renderArtistTransfers,
  renderHist,
  renderPendingExpenses,
  saveState,
  settlementPayState,
  sheetsUrl,
  showToast,
  syncQueue,
  today,
  updateContextBanners,
} from '../main.js';
import { BOOKS, states, activeBook, getState, getBook } from '../core/store.js';
import {
  applyArtistSettlement,
  artistSettlementIssues,
  artistSettlementStatement,
  expensesInSettleUp,
  planArtistSettlement,
  undoArtistSettlement,
} from '../lib/artist-settlement.js';
import { calculateBreakEven } from '../lib/breakeven.js';
import { channelMixRows } from '../lib/channel-mix.js';
import { bookCurrencyCode } from '../lib/currency-migration.js';
import {
  describePayout,
  payoutNetted,
  payoutRequestCovered,
  planNetPayout,
  unpaidSalesSummary,
} from '../lib/earnings.js';
import { escapeHtml, safeHttpUrl } from '../lib/html.js';
import { deriveOnHand, deriveStockBreakdown, inventoryBreakdown } from '../lib/inventory.js';
import { rowsByKey } from '../lib/merge-state.js';
import { confirmDialog } from '../lib/modal.js';
import {
  buildPaymentMeta,
  cadEquivalentForSale,
  CODE_TO_SYMBOL,
  fmt,
  fmtD,
  fmtWhole,
  getBookCurrencyCode,
  getSym,
  isDirectToArtistSale,
  normalizeCurrencyCode,
  paymentSummary,
  roundCents,
  transferAmount,
} from '../lib/money.js';
import { expensesWithSettlements, isGratuityExpense } from '../lib/receipt-storage.js';
import {
  needsSettleUp,
  settlementPayoutSummary,
  settleUpHtml,
  settleUpModel,
} from '../lib/settle-up-view.js';
import { makeEventId, notifyPublisherSubmission, syncToSheets } from './sheets-bridge.js';

// ── DASHBOARD (per book)
function renderBookPendingAlert() {
  if (isAuthor() || activeBook === 'all') return;
  const alertDiv = $('dash-pending-approvals-alert');
  if (!alertDiv) return;

  const subs = window.authorSubmissions[activeBook] || {};
  const sCount = Object.keys(subs.sales || {}).length;
  const eCount = Object.keys(subs.expenses || {}).length;

  if (sCount > 0 || eCount > 0) {
    alertDiv.style.display = 'block';
    let contentHtml = '';
    if (sCount > 0) {
      contentHtml += `<button class="btn gold outline sm author-subs-btn" onclick="switchTab('history')">Review ${sCount} pending sale(s) →</button>`;
    }
    if (eCount > 0) {
      contentHtml += `<button class="btn gold outline sm author-subs-btn" onclick="switchTab('expenses')">Review ${eCount} pending expense(s) →</button>`;
    }

    alertDiv.innerHTML = `
      <div class="author-subs-card">
        <div>
          <div class="author-subs-title">
            <span class="pill amber">Pending</span> Author Submissions
          </div>
          <div style="font-size:var(--text-sm); color:var(--text3);">There are entries from the author waiting for your approval.</div>
        </div>
        <div class="author-subs-actions">
          ${contentHtml}
        </div>
      </div>
    `;
  } else {
    alertDiv.style.display = 'none';
  }
}

// Gross of direct-to-artist sales the artist has collected but not yet forwarded.
function heldGrossOf(s) {
  return (s.artistTransfers || []).reduce((sum, t) => sum + (transferAmount(t) || 0), 0);
}
// The book's per-channel rollup with the gross still held by the artist folded back
// into each channel's revenue (direct-to-artist sales bump txns/units but not revenue
// until forwarded). Its channel revenues sum to recognizedRevenueOf(s), so the
// "Sales by channel" total agrees with the Revenue KPI.
function chStatsWithHeld(s) {
  const out = {};
  for (const [chan, cs] of Object.entries(s.chStats || {})) out[chan] = { ...cs };
  (s.artistTransfers || []).forEach(t => {
    const amt = transferAmount(t) || 0;
    if (!amt) return;
    const row = out[t.chan] = out[t.chan] || { txns: 0, units: 0, revenue: 0 };
    row.revenue = (row.revenue || 0) + amt;
  });
  return out;
}
// Revenue recognized for a book: cash collected plus the gross still held by the
// artist. A sale is complete the moment it happens, so its full value is recognized
// immediately and the held cash is treated as a receivable — NOT as deferred revenue.
// This keeps headline revenue consistent with the units-sold, tier, earnings, and
// Financial Center figures (all of which already count completed sales), while the
// collected-vs-held split shows the publisher's actual cash position.
// Cleared at the start of every renderAll() so the cache is per-render-cycle
// and can never return a value stale from a previous state mutation.
let _revMemo = new Map();
function recognizedRevenueOf(s) {
  if (_revMemo.has(s)) return _revMemo.get(s);
  const v = (s.revenue || 0) + heldGrossOf(s);
  _revMemo.set(s, v);
  return v;
}

// ── DASHBOARD (per book)
// Signature of an on-hand drift the publisher chose to dismiss for this session.
// Cleared implicitly whenever the numbers change (the signature stops matching),
// so a genuinely new discrepancy resurfaces rather than staying hidden forever.
let _dismissedDriftSig = null;
function dismissStockDrift() {
  const b = $('d-stock-drift-banner');
  if (b) { _dismissedDriftSig = b.dataset.sig || null; b.style.display = 'none'; }
}

/* ─── DASHBOARD — SALES BY CHANNEL ────────────────────────────────────────
   The table answers "where is the money coming from?". Until now it listed
   channels in whichever order they were first used, with no total under the
   columns and no sense of proportion, so the answer had to be worked out by
   hand on every visit. These three helpers add the missing half: order, a
   share bar scaled to the leading channel, and a footer that sums the columns
   it sits under. The `chStats` rollup itself is untouched. */

/** One channel row: name, its numbers, and a bar scaled against the leader. */
function channelMixRowHtml(row, cur) {
  const label = chanLabel(row.chan ?? '');
  const col = channelColor(row.chan ?? '');
  const share = Number.isFinite(row.share) ? row.share : 0;
  const barPct = Number.isFinite(row.barPct) ? row.barPct : 0;
  // A channel that moved copies without earning (gratuities, comps) reads as a
  // dash rather than "0%", which would look like an underperforming sale.
  const shareText = (row.revenue ?? 0) > 0 ? `${share.toFixed(0)}%` : '—';
  return `<tr>
    <td style="font-weight:600;"><span class="ch-mix-chan"><span class="ch-mix-dot" style="background:${col};"></span>${escapeHtml(label)}</span></td>
    <td class="r">${row.txns ?? 0}</td>
    <td class="r">${row.units ?? 0}</td>
    <td class="r">${fmt(row.revenue ?? 0, cur)}</td>
    <td class="ch-mix-share-cell">
      <div class="ch-mix-share" title="${escapeHtml(label)} is ${shareText} of this book's revenue">
        <div class="ch-mix-track" role="img" aria-label="${escapeHtml(label)}: ${shareText} of revenue"><div class="ch-mix-fill" style="width:${barPct.toFixed(1)}%;background:${col};"></div></div>
        <span class="ch-mix-pct mono-num">${shareText}</span>
      </div>
    </td>
  </tr>`;
}

/** The footer that totals the columns it sits under, and names the leader. */
function channelMixFootHtml(totals, cur) {
  if (!totals || !totals.channels) return '';
  const leaderNote = totals.leader
    ? `${escapeHtml(chanLabel(totals.leader))} leads with ${totals.leaderShare.toFixed(0)}% of revenue`
    : 'no channel has earned yet';
  const chanCount = totals.earningChannels === totals.channels
    ? `${totals.channels} channel${totals.channels === 1 ? '' : 's'}`
    : `${totals.earningChannels} of ${totals.channels} channels earning`;
  return `<tr class="ledger-total-row">
    <td class="ledger-total-label">All channels<span class="ledger-total-sub">${chanCount} · ${leaderNote}</span></td>
    <td class="r mono-num">${totals.txns ?? 0}</td>
    <td class="r mono-num">${totals.units ?? 0}</td>
    <td class="r mono-num ledger-total-val is-neutral">${fmt(totals.revenue ?? 0, cur)}</td>
    <td class="ch-mix-share-cell"></td>
  </tr>`;
}

/** No sales on record yet — an onboarding moment, not a dead table. */
function channelMixEmptyHtml() {
  return `<div class="empty-state sys-empty">
    <div class="e-icon" aria-hidden="true">📊</div>
    <strong>No sales on this book yet</strong>
    <span>Once orders start landing, this is where you will see which channel is actually carrying the book — the shop, the fairs, or the stores that stock it.</span>
    <div class="sys-empty-actions">
      <button class="btn gold lg" onclick="switchTab('manual')">+ Record a sale</button>
      <button class="btn lg" onclick="switchTab('consignment')">Send stock to a store</button>
    </div>
  </div>`;
}

function updateDash() {
  if (!activeBook || activeBook === 'all') return;
  const s = getState(), book = getBook();
  renderBookPendingAlert();
  const cur = book.currency;
  updateContextBanners();
  $('d-book-title').textContent = book.title;
  // "Email artist for payment" button: publisher-only, needs an artist email on
  // file and a connected Sheet/Web App to actually send through.
  const emailArtistBtn = $('d-email-artist-btn');
  if (emailArtistBtn) {
    const canEmail = !isAuthor() && !!(book.authorEmail || '').trim() && !!sheetsUrl;
    emailArtistBtn.style.display = canEmail ? '' : 'none';
  }
  // Approval-emails status: publisher-only at-a-glance check that artist
  // submissions can actually reach you. "On" needs a shared notify endpoint
  // (set when the Sheet was connected); "off" means submissions sync silently.
  const notifyStatus = $('d-notify-status');
  if (notifyStatus) {
    if (isAuthor()) {
      notifyStatus.style.display = 'none';
    } else {
      const on = !!(sheetsUrl || notifyUrl);
      notifyStatus.style.display = '';
      notifyStatus.textContent = on ? '✓ Approval emails on' : '⚠ Approval emails off';
      notifyStatus.className = 'pill ' + (on ? 'green' : 'amber');
    }
  }
  $('d-book-author').textContent = (book.author || '—') + ' · List price ' + cur + book.listPrice;
  $('d-book-isbn').textContent = book.isbn || '—';
  const cost = book.productionCost || 0;
  const printed = book.maxPrint || 0;
  const breakdown = deriveStockBreakdown(s, book);
  const inventory = inventoryBreakdown(s, book);
  let stockSubText = 'of ' + printed + ' printed';
  if (!isAuthor() && cost > 0 && printed > 0) {
    stockSubText += ' · ' + fmt(cost / printed, cur) + '/book';
  }
  if (!isAuthor() && breakdown.authorHeld > 0) {
    stockSubText += ` · ${breakdown.publisherOnHand} with you · ${breakdown.authorHeld} with author`;
  }
  $('d-stock-sub').textContent = stockSubText;
  $('d-thresh-sub').textContent = 'threshold: ' + book.threshold + ' units';
  $('d-thresh-label').textContent = 'Alert at ' + book.threshold + ' units';
  animateCountValue('d-stock', s.stock); animateCountValue('h-stock', s.stock);
  renderStockDriftBanner(s, book);
  animateCountValue('d-sold', s.sold + inventory.gratuities);
  const soldSplit = $('d-sold-split');
  if (soldSplit) soldSplit.textContent = `${s.sold} sold · ${inventory.gratuities} gifted`;
  animateCountValue('d-gratuities', inventory.gratuities);
  const heldGross = heldGrossOf(s);
  const recognizedRev = recognizedRevenueOf(s);
  animateCountValue('d-revenue', fmtWhole(recognizedRev, cur)); animateCountValue('h-revenue', fmtWhole(recognizedRev, cur));
  const revSub = $('d-revenue-sub');
  if (revSub) revSub.textContent = heldGross > 0.01
    ? `${fmtWhole(s.revenue, cur)} collected · ${fmtWhole(heldGross, cur)} held by artist`
    : 'total collected';
  $('d-avg-sub').textContent = 'avg sale ' + (s.sold > 0 ? fmt(recognizedRev / s.sold, cur) : '—');
  // ⚡ Bolt Optimization: Calculate consigned and owed in a single loop
  let consigned = 0, owed = 0;
  for (let i = 0; i < s.stores.length; i++) {
    consigned += s.stores[i].outstanding || 0;
    owed += s.stores[i].amountOwed || 0;
  }
  animateCountValue('d-consigned', consigned); animateCountValue('h-consigned', consigned);
  $('d-stores').textContent = s.stores.length;
  animateCountValue('d-owed', fmtWhole(owed, cur)); $('d-owed').className = 'kpi-value' + (owed > 0 ? ' warn' : '');
  const pendingTransfers = [...(s.artistTransfers || [])];

  // Merge pending sales where they collected payment
  const pbSales2 = window.authorSubmissions[activeBook]?.sales || {};
  Object.keys(pbSales2).forEach(k => {
    const raw = (typeof pbSales2[k].data === 'string') ? JSON.parse(pbSales2[k].data) : pbSales2[k].data;
    if (isDirectToArtistSale(raw)) {
      pendingTransfers.push({
        ...raw,
        total: (raw.qty || 0) * (raw.price || 0)
      });
    }
  });

  const pendingTotal = pendingTransfers.reduce((a, t) => a + (transferAmount(t) || 0), 0);
  animateCountValue('d-artist-pending', pendingTransfers.length > 0 ? fmtWhole(pendingTotal, cur) : '—');
  $('d-artist-pending').className = 'kpi-value' + (pendingTransfers.length > 0 ? ' warn' : '');
  $('d-artist-pending-sub').textContent = pendingTransfers.length > 0 ? `${pendingTransfers.length} order${pendingTransfers.length > 1 ? 's' : ''} (incl. pending) awaiting forwarding` : 'no pending transfers';
  renderArtistTransfers();
  $('d-low').textContent = s.stock <= book.threshold ? '⚠ Low' : 'OK';
  $('d-low').className = 'kpi-value' + (s.stock <= book.threshold ? ' danger' : '');
  
  renderStockAllocationBar(s, book, breakdown);

  const al = $('d-alert');
  if (s.stock <= book.threshold) { al.className = 'stock-alert danger'; al.textContent = '⚠ Below threshold (' + book.threshold + ') — reorder now.'; }
  else if (s.stock <= book.threshold * 2) { al.className = 'stock-alert warn'; al.textContent = 'Getting low — ' + s.stock + ' units remaining.'; }
  else { al.className = 'stock-alert ok'; al.textContent = 'Stock is healthy.'; }
  const chMix = channelMixRows(chStatsWithHeld(s));
  const chFoot = $('ch-foot');
  $('ch-body').innerHTML = chMix.rows.length
    ? chMix.rows.map(r => channelMixRowHtml(r, cur)).join('')
    : `<tr class="sys-empty-row"><td colspan="5">${channelMixEmptyHtml()}</td></tr>`;
  if (chFoot) chFoot.innerHTML = chMix.rows.length ? channelMixFootHtml(chMix.totals, cur) : '';
  $('dash-con-body').innerHTML = s.stores.length ? s.stores.map(st => `<tr><td style="font-weight:600;">${escapeHtml(st.name)}</td><td class="r">${st.sent}</td><td class="r">${st.sold}</td><td class="r">${st.returned}</td><td class="r">${st.outstanding}</td><td>${st.outstanding > 0 ? '<span class="pill amber">Active</span>' : '<span class="pill gray">Settled</span>'}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty-state" style="padding:1rem;">No consignment accounts.</div></td></tr>';
  // Show danger zone only for publisher — explicitly hide for authors so it
  // doesn't linger when switching from publisher into an author view.
  if (!isAuthor()) {
    $('danger-zone-sect').style.display = '';
    $('danger-zone-block').style.display = 'flex';
  } else {
    $('danger-zone-sect').style.display = 'none';
    $('danger-zone-block').style.display = 'none';
  }
  // ── EXPENSES SUMMARY (publisher only)
  if (!isAuthor()) {
    renderExpensesSummaryBlock(s, cur);
  } else {
    // The same reimbursement has an artist-facing banner. Hide publisher
    // totals when switching views so it is not shown twice on the dashboard.
    const expSect = $('d-expenses-sect');
    const expKpi = $('d-expenses-kpi');
    if (expSect) expSect.style.display = 'none';
    if (expKpi) expKpi.style.display = 'none';
  }

  // ── BREAK-EVEN (publisher only)
  renderBreakEvenBlock(s, book, cur, cost, recognizedRev);

  // ── NET TO PUBLISHER KPI (only shown when profit sharing is configured)
  if (book.profitTiers && book.profitTiers.length > 0) {
    const earningsStats = calculateArtistEarnings(activeBook);
    if (earningsStats && $('d-net-publisher-kpi')) {
      $('d-net-publisher-kpi').style.display = '';
      animateCountValue('d-net-publisher', fmtWhole(earningsStats.netPublisher, cur));
    }
  } else if ($('d-net-publisher-kpi')) {
    $('d-net-publisher-kpi').style.display = 'none';
  }

  // ── PROFIT SHARING BREAKDOWN
  renderProfitSharingBreakdown(activeBook);
}

// Surface on-hand drift: if the stored count disagrees with what the records
// imply (a sale/return/consignment that didn't update inventory, or an
// offline-merge hiccup), nudge toward the one-click repair instead of letting
// a silently-wrong number sit on the dashboard. Reconciling on-hand is a
// publisher action, so the banner and the repair button stay hidden for
// authors — and the banner can be dismissed without forcing a recalculation.
function renderStockDriftBanner(s, book) {
  const driftBanner = $('d-stock-drift-banner');
  if (driftBanner) {
    const derivedOnHand = deriveOnHand(s, book);
    const sig = `${activeBook}:${s.stock}:${derivedOnHand}`;
    const show = !isAuthor() && derivedOnHand !== s.stock && _dismissedDriftSig !== sig;
    if (show) {
      const diff = derivedOnHand - s.stock;
      $('d-stock-drift-value').textContent = `${s.stock} on file · ${derivedOnHand} per records (${diff > 0 ? '+' : ''}${diff})`;
      driftBanner.dataset.sig = sig;
      driftBanner.style.display = '';
    } else {
      driftBanner.style.display = 'none';
    }
  }
  const recalcWrap = $('d-recalc-onhand-wrap');
  if (recalcWrap) recalcWrap.style.display = isAuthor() ? 'none' : '';
}

// The dashboard stock bar: a single bar for publisher-only stock, or a split
// publisher/author bar (plus location pills) once some stock is out with the
// author. Author view always shows the plain unclassified total.
function renderStockAllocationBar(s, book, breakdown) {
  const pct = Math.max(0, (s.stock / (book.maxPrint || 1)) * 100);
  const barAuthor = $('d-bar-author');
  const pillsEl = $('d-stock-breakdown-pills');
  const transferBtn = $('d-transfer-stock-btn');

  if (!isAuthor()) {
    if (transferBtn) transferBtn.style.display = '';
    if (breakdown.authorHeld > 0) {
      const pubPct = Math.max(0, (breakdown.publisherOnHand / (book.maxPrint || 1)) * 100);
      const authPct = Math.max(0, (breakdown.authorHeld / (book.maxPrint || 1)) * 100);
      $('d-bar').style.width = pubPct + '%';
      $('d-bar').style.background = s.stock <= book.threshold ? '#f87171' : (book.accent || 'var(--gold2)');
      if (barAuthor) {
        barAuthor.style.display = '';
        barAuthor.style.width = authPct + '%';
      }
      $('d-bar-label').textContent = `${s.stock} / ${book.maxPrint} on hand (${breakdown.publisherOnHand} pub · ${breakdown.authorHeld} author)`;
      if (pillsEl) {
        pillsEl.style.display = 'flex';
        pillsEl.innerHTML = `<span class="stock-loc-pill publisher" title="Stock at publisher warehouse">🏢 Publisher: ${breakdown.publisherOnHand}</span><span class="stock-loc-pill author" title="Stock held by author">👤 Author: ${breakdown.authorHeld}</span>`;
      }
    } else {
      $('d-bar').style.width = pct + '%';
      $('d-bar').style.background = s.stock <= book.threshold ? '#f87171' : (book.accent || 'var(--gold2)');
      if (barAuthor) { barAuthor.style.display = 'none'; barAuthor.style.width = '0%'; }
      $('d-bar-label').textContent = s.stock + ' / ' + book.maxPrint + ' units on hand';
      if (pillsEl) { pillsEl.style.display = 'none'; pillsEl.innerHTML = ''; }
    }
  } else {
    // Author mode: strictly unclassified total
    if (transferBtn) transferBtn.style.display = 'none';
    if (barAuthor) { barAuthor.style.display = 'none'; barAuthor.style.width = '0%'; }
    if (pillsEl) { pillsEl.style.display = 'none'; pillsEl.innerHTML = ''; }
    $('d-bar').style.width = pct + '%';
    $('d-bar').style.background = s.stock <= book.threshold ? '#f87171' : (book.accent || 'var(--gold2)');
    $('d-bar-label').textContent = s.stock + ' / ' + book.maxPrint + ' units on hand';
  }
}

// Publisher-only KPI tile + detail table for expenses the artist hasn't been
// reimbursed for yet (gratuities excluded — those never carry a receivable).
function renderExpensesSummaryBlock(s, cur) {
  renderPendingExpenses();
  const expenses = expensesWithSettlements(s);
  const unreceivedExp = [];
  let expTotal = 0;
  for (const e of expenses) {
    if (!e.received && !isGratuityExpense(e)) {
      unreceivedExp.push(e);
      expTotal += (e.amount || 0);
    }
  }
  const expKpi = $('d-expenses-kpi');
  const expSect = $('d-expenses-sect');
  if (unreceivedExp.length) {
    // KPI tile
    if (expKpi) { expKpi.style.display = ''; }
    animateCountValue('d-expenses-owed', fmtWhole(expTotal, cur));
    $('d-expenses-owed-sub').textContent = `${unreceivedExp.length} expense${unreceivedExp.length !== 1 ? 's' : ''} outstanding`;
    // Detail table — dark banner style. On a profit-sharing book whose money
    // card lists every one of these, the card says it all.
    const settle = expensesInSettleUp(BOOKS[activeBook], s);
    const inSettle = unreceivedExp.filter(e => settle.ids.has(String(e.id))).length;
    const onMoneyCard = inSettle === unreceivedExp.length && !!BOOKS[activeBook]?.profitTiers?.length;
    if (expSect) expSect.style.display = onMoneyCard ? 'none' : '';
    if (expSect && !onMoneyCard) {
      animateCountValue('d-exp-total', fmtWhole(expTotal, cur));
      $('d-exp-count').textContent = `${expenses.length} expense${expenses.length !== 1 ? 's' : ''} logged`;
      $('d-exp-body').innerHTML = unreceivedExp.map(e => `
        <tr>
          <td>${fmtD(e.date)}</td>
          <td class="mb-desc">${escapeHtml(e.desc)}</td>
          <td><span class="metric-banner-cat">${escapeHtml(e.cat)}</span></td>
          <td>${escapeHtml(e.ref) || '—'}</td>
          <td class="mb-amt">${fmt(e.amount, cur)}</td>
        </tr>`).join('');
      // Payment button
      const safeLink = safeHttpUrl((s.artistPaymentLink || '').trim());
      const payBtn = $('d-exp-pay-btn');
      const payHint = $('d-exp-pay-hint');
      // While the author also owes money, these come off the Settle up below.
      // A separate payment as well would pay them back twice. The link stays
      // for any still paid on their own, and for the difference when the
      // Settle up has you paying the author.
      const rest = unreceivedExp.length - inSettle;
      const showLink = !!safeLink && (rest > 0 || settle.publisherPays);
      if (payBtn) {
        payBtn.style.display = showLink ? '' : 'none';
        if (showLink) payBtn.href = safeLink;
      }
      if (payHint) {
        payHint.textContent = !inSettle
          ? (safeLink ? 'Opens payment link in a new tab' : 'Artist has not set a payment link yet')
          : rest ? `${inSettle} ${inSettle === 1 ? 'is' : 'are'} in the Settle up below · pay the other ${rest} on ${rest === 1 ? 'its' : 'their'} own`
          : settle.publisherPays ? 'In the Settle up below · pay the author its one net amount, not these on their own'
          : 'Comes off what the author owes you in the Settle up below · no separate payment';
      }
    }
  } else {
    if (expKpi) expKpi.style.display = 'none';
    if (expSect) expSect.style.display = 'none';
  }
}

// Publisher-only break-even KPI, progress bar, and status alert. Hidden
// entirely for authors, and for publishers until a production cost is set.
function renderBreakEvenBlock(s, book, cur, cost, recognizedRev) {
  if (isAuthor() || !(cost > 0)) {
    $('d-breakeven-kpi').style.display = 'none';
    $('d-breakeven-block').style.display = 'none';
    return;
  }

  $('d-breakeven-kpi').style.display = '';
  $('d-breakeven-block').style.display = '';
  const be = calculateBreakEven({
    cost,
    recognizedRev,
    listPrice: book.listPrice,
    sold: s.sold,
    stock: s.stock,
    currency: cur
  });

  $('d-breakeven-val').textContent = be.broken ? '✓ Done' : fmtWhole(be.remaining, cur) + ' to go';
  $('d-breakeven-val').className = 'kpi-value' + (be.broken ? ' gold' : '');
  $('d-breakeven-sub').textContent = `of ${fmtWhole(cost, cur)} production cost`;
  if ($('d-breakeven-kpi')) {
    $('d-breakeven-kpi').title = be.broken
      ? 'Production costs fully recovered!'
      : `${fmt(be.remaining, cur)} remaining (${be.hasListPrice ? `~${be.unitsNeededAtList} units at ${fmt(be.listPrice, cur)} list` : 'list price not set'})`;
  }

  $('d-be-title').textContent = be.broken ? 'Project has broken even' : 'Not yet broken even';
  $('d-be-sub').textContent = `Production cost: ${fmt(cost, cur)} · Revenue to date: ${fmt(recognizedRev, cur)}`;

  const bePill = $('d-be-pill');
  if (bePill) {
    if (be.broken) {
      bePill.className = 'pill green';
      bePill.textContent = '✓ 100% recovered';
      bePill.style.background = '';
      bePill.style.color = '';
    } else {
      bePill.className = be.isClose ? 'pill amber' : 'pill gold';
      bePill.textContent = `${be.pctBe.toFixed(1)}% recovered`;
      bePill.style.background = '';
      bePill.style.color = '';
    }
  }

  $('d-be-bar').style.width = be.pctBe + '%';
  $('d-be-bar').style.background = be.broken ? 'var(--green-light)' : be.pctBe >= 70 ? 'var(--orange)' : (book.accent || 'var(--gold2)');
  $('d-be-bar-label').textContent = `${fmt(recognizedRev, cur)} recovered (${be.pctBe.toFixed(1)}%)`;
  $('d-be-bar-right').textContent = be.broken ? 'Break-even reached ✓' : `of ${fmt(cost, cur)}`;
  const trackEl = $('d-be-bar-track');
  if (trackEl) {
    trackEl.title = be.broken ? 'Production costs fully recovered!' : `${fmt(recognizedRev, cur)} of ${fmt(cost, cur)} recovered (${be.pctBe.toFixed(1)}%)`;
  }
  const al = $('d-be-alert');
  if (be.broken) {
    al.className = 'stock-alert be-alert be-done';
    al.style.borderLeftColor = '';
    al.style.background = '';
    al.style.color = '';
    const profit = Math.max(0, recognizedRev - cost);
    al.innerHTML = `
      <div class="be-alert-label"><span aria-hidden="true">✓</span>Broken even</div>
      <div class="be-stats">
        <div class="be-stat">
          <span class="be-stat-num">${fmt(cost, cur)}</span>
          <span class="be-stat-label">Production cost earned back</span>
        </div>
        <div class="be-stat-divider" aria-hidden="true"></div>
        <div class="be-stat be-stat-right">
          <span class="be-stat-num">${fmt(profit, cur)}</span>
          <span class="be-stat-label">Profit since</span>
        </div>
      </div>
      <div class="be-caption">Everything this title earns from here on is profit.</div>
    `;
  } else {
    al.className = `stock-alert be-alert ${be.isClose ? 'be-close' : 'be-far'}`;
    al.style.borderLeftColor = '';
    al.style.background = '';
    al.style.color = '';
    const units = be.unitsNeededAtList;
    const unitsStat = be.hasListPrice
      ? `<span class="be-stat-num">~${units} unit${units !== 1 ? 's' : ''}</span>
         <span class="be-stat-label">At ${fmt(be.listPrice, cur)} list price</span>`
      : `<span class="be-stat-num">—</span>
         <span class="be-stat-label">Set a list price to estimate units</span>`;
    const captionParts = [];
    if (be.hasListPrice && be.paceNote) {
      captionParts.push(`Based on full list price — your realized average (${fmt(be.avgRev, cur)}/unit after splits &amp; discounts) puts it closer to ~${be.unitsNeededAtAvg} units.`);
    }
    if (be.stockNote) captionParts.push(escapeHtml(be.stockNote));

    al.innerHTML = `
      <div class="be-alert-label"><span aria-hidden="true">⚠️</span>${be.isClose ? 'Almost broken even' : 'Not yet broken even'}</div>
      <div class="be-stats">
        <div class="be-stat" title="${fmt(be.remaining, cur)} remaining of ${fmt(cost, cur)} production cost">
          <span class="be-stat-num">${fmt(be.remaining, cur)}</span>
          <span class="be-stat-label">Left to recover</span>
        </div>
        <div class="be-stat-divider" aria-hidden="true"></div>
        <div class="be-stat be-stat-right" title="${escapeHtml(be.unitsBadgeTitle)}">${unitsStat}</div>
      </div>
      ${captionParts.length ? `<div class="be-caption">${captionParts.join(' ')}</div>` : ''}
    `;
  }
}

function getProfitTiersHtml(book, stats, cur) {
  const hasCap = (t) => Number.isFinite(t.revenueUpTo) && t.revenueUpTo > 0;
  const effectiveCap = (t) => {
    const isBreakEvenTier = (t.label || '').toLowerCase().includes('break');
    if (isBreakEvenTier && book.productionCost > 0) return book.productionCost;
    return hasCap(t) ? t.revenueUpTo : null;
  };
  const tiers = [...book.profitTiers].sort((a, b) => (hasCap(a) ? a.revenueUpTo : Infinity) - (hasCap(b) ? b.revenueUpTo : Infinity));

  // Find which tier is currently active based on cumulative revenue
  const currentTier = tiers.find(t => effectiveCap(t) !== null && stats.cumulativeRevenue < effectiveCap(t)) || tiers[tiers.length - 1];
  const nextTier = tiers.find(t => effectiveCap(t) !== null && stats.cumulativeRevenue < effectiveCap(t));

  const tierHeader = `
    <div class="ps-tier-row is-head" style="display:grid; grid-template-columns: 1fr auto 70px 70px; gap:12px; align-items:center;
      font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:var(--text3);
      padding:0 8px 6px; border-bottom:var(--stroke-hair) solid rgba(0,0,0,.06); margin-bottom:6px;">
      <span>Tier</span>
      <span style="text-align:right;">Revenue in tier</span>
      <span style="text-align:right;">Earned</span>
      <span style="text-align:right;">Share</span>
    </div>`;

  const tierHtml = tiers.map((t, i) => {
    const tCap = effectiveCap(t);
    const isActive = t === currentTier;
    const isCompleted = tCap !== null && stats.cumulativeRevenue >= tCap;
    const threshold = tCap !== null ? `Up to ${fmt(tCap, cur)}` : 'No cap';
    const tierStat = (stats.perTier || []).find(p => p.tier === t);
    const earned = tierStat ? tierStat.artistEarned : 0;
    const tierRev = tierStat ? tierStat.revenue : 0;
    const prevCap = i > 0 && effectiveCap(tiers[i - 1]) !== null ? effectiveCap(tiers[i - 1]) : 0;
    const tierCap = tCap !== null ? tCap - prevCap : null;
    const tierCapText = tierCap !== null
      ? `${fmt(tierRev, cur)} / ${fmt(tierCap, cur)}`
      : fmt(tierRev, cur);
    const icon = isCompleted ? '✓' : isActive ? '●' : '○';
    const iconColor = isCompleted ? 'var(--green)' : isActive ? 'var(--gold2)' : 'rgba(0,0,0,.25)';

    return `
      <div class="ps-tier-row" style="display:grid; grid-template-columns: 1fr auto 70px 70px; gap:12px; align-items:center;
        font-size:12px; padding:8px; margin-bottom:4px;
        opacity:${isCompleted ? '.6' : '1'}; font-weight:${isActive ? '600' : '400'};
        border-radius:var(--r2);
        background:${isActive ? 'rgba(212,175,55,.08)' : 'transparent'};
        border-left:var(--stroke) solid ${isCompleted ? 'var(--green)' : isActive ? 'var(--gold2)' : 'transparent'};">
        <span style="display:flex; align-items:center; gap:8px;">
          <span style="color:${iconColor}; font-size:var(--text-xs); width:12px; display:inline-block; text-align:center;">${icon}</span>
          <span>${escapeHtml(t.label)}<br><span style="font-size:var(--text-2xs);opacity:.55;font-weight:400;">${threshold}</span></span>
        </span>
        <span style="text-align:right; font-family:var(--font-mono); font-size:var(--text-xs); opacity:.75;" title="Revenue captured in this tier">${tierCapText}</span>
        <span style="text-align:right; font-family:var(--font-mono); color:${earned > 0 ? 'var(--green)' : 'var(--text3)'};" title="Artist payout earned in this tier">${fmt(earned, cur)}</span>
        <span style="text-align:right; color:${isActive ? 'var(--gold2)' : 'var(--text3)'};">${t.artistPct}%</span>
      </div>
    `;
  }).join('');

  return { tierHeader, tierHtml, tiers, nextTier, effectiveCap };
}

function getRevenueProgressHtml(stats, tiers, nextTier, effectiveCap, cur) {
  let progressHtml = '';
  if (nextTier && effectiveCap(nextTier) !== null) {
    const isBreakEvenTier = nextTier.label.toLowerCase().includes('break');
    const target = effectiveCap(nextTier);
    const revenueLeft = Math.max(0, target - stats.cumulativeRevenue);
    const pct = Math.min(100, (stats.cumulativeRevenue / target) * 100);
    const nextTierIdx = tiers.indexOf(nextTier);
    const enterTier = tiers[nextTierIdx + 1];
    const label = isBreakEvenTier ? 'to break-even' : enterTier ? `until ${enterTier.label}` : `completing ${nextTier.label}`;
    progressHtml = `
      <div style="margin-top:1rem; padding:12px; background:var(--ink); border-radius:var(--r2); border:var(--stroke-hair) solid rgba(255,255,255,.05);">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span style="font-size:var(--text-2xs); text-transform:uppercase; color:rgba(255,255,255,.58); letter-spacing:.1em;">Revenue Progress</span>
          <span style="font-size:var(--text-xs); color:var(--gold3); font-family:var(--font-mono);">${fmt(revenueLeft, cur)} ${label}</span>
        </div>
        <div class="bar-track" style="height:5px; margin-bottom:0;">
          <div class="bar-fill" style="width:${pct}%; height:5px; border-radius:var(--r-pill);"></div>
        </div>
        <div style="font-size:var(--text-2xs);color:rgba(255,255,255,.62);margin-top:6px;">${fmt(stats.cumulativeRevenue, cur)} of ${fmt(target, cur)} to reach ${enterTier ? enterTier.label : 'next tier'}</div>
      </div>
    `;
  } else {
    // Already in the final (unlimited) tier
    progressHtml = `
      <div style="margin-top:1rem; padding:10px 14px; background:rgba(74,222,128,.08); border-radius:var(--r2); border:var(--stroke-hair) solid rgba(74,222,128,.2); font-size:var(--text-sm); color:var(--green);">
        ✓ Production costs recovered — now in post break-even tier
      </div>
    `;
  }
  return progressHtml;
}

// One line under the royalty owed saying where it comes from: the rate, the
// slice of sales it was earned on, and how many copies since when.
function owedFromSalesHtml(bookId, owed, cur) {
  const u = unpaidSalesSummary(BOOKS[bookId], states[bookId], owed);
  if (!u || u.copies <= 0) return '';
  const rate = u.rates.length === 1 ? `${u.rates[0]}%` : `${u.rates[0]}–${u.rates[u.rates.length - 1]}%`;
  // Counted from the last payout when there is one; before the first payout
  // there is no "last payout" to point at, so give the first sale's date.
  const paidBefore = (states[bookId]?.artistPayouts || []).some(p => !p.voided);
  const when = paidBefore ? ' since last payout' : u.since ? ` since ${fmtD(u.since)}` : '';
  const copies = `${u.copies} cop${u.copies === 1 ? 'y' : 'ies'} sold${when}`;
  return `<div class="ps-stat-detail">${rate} of ${fmt(u.revenue, cur)} · ${copies}</div>`;
}

function getOwedCardDetails(stats, cur) {
  const owed = stats.owedToArtist;
  const artistOwesPublisher = owed < -0.01;

  // The "Owed to artist" card flips to an overpaid state when payouts exceed the
  // artist's net earnings (the publisher's cut held by the artist is tracked
  // separately on the "Held by artist" card, not netted in here).

  let owedLabel, owedVal, owedSub, owedTone;
  if (artistOwesPublisher) {
    owedLabel = '⚠ Overpaid to artist';
    owedVal = fmt(Math.abs(owed), cur);
    owedSub = 'credit against future earnings';
    owedTone = 'critical';
  } else if (owed > 0.01) {
    owedLabel = '⚠ Owed to artist';
    owedVal = fmt(owed, cur);
    owedSub = 'action needed';
    owedTone = 'gold';
    // Debts netted into one payment: spell out the sum so the artist sees why the
    // transfer is smaller than the royalty, instead of having to ask.
    const debt = stats.owedByArtist || 0;
    if (debt > 0.01) {
      const net = Math.max(0, owed - debt);
      owedSub = isAuthor()
        ? `less ${fmt(Math.min(debt, owed), cur)} you owe the publisher → you receive ${fmt(net, cur)}`
        : `less ${fmt(Math.min(debt, owed), cur)} the artist owes you → send ${fmt(net, cur)}`;
    }
  } else {
    owedLabel = 'Owed to artist';
    owedVal = fmt(0, cur);
    // ⚡ Bolt Optimization: Replace .filter().reduce() with an imperative loop to prevent intermediate array allocations and multiple passes
    let last = null;
    const payouts = stats.payouts || [];
    for (let i = 0; i < payouts.length; i++) {
      const p = payouts[i];
      if (p.settlement && (!last || (p.date || '') > (last.date || ''))) {
        last = p;
      }
    }
    owedSub = last ? `all square · settled ${fmtD(last.date)} ✓` : 'all settled ✓';
    owedTone = 'green';
  }
  return { owedLabel, owedVal, owedSub, owedTone, owed };
}

function getArtistHeldHtml(stats, cur) {
  const hasHeld = stats.heldByArtistGross > 0.01;
  // A reporting card, not a call-out: the Settle up panel and the lead card
  // carry the action, so this one only says how much cash the author holds.
  const heldCardHtml = hasHeld ? `
      <div class="ps-stat-card">
        <div class="ps-stat-label">Held by artist</div>
        <div class="ps-stat-val is-muted">${fmt(stats.heldByArtistGross, cur)}</div>
        <div class="ps-stat-sub">${fmt(stats.publisherCutHeldByArtist, cur)} of it is ${isAuthor() ? "the publisher's" : 'yours'}</div>
      </div>` : '';
  return { heldCardHtml, hasHeld };
}

const artistSettlementPreviews = new Map();
const artistSettlementBusy = new Set();

// The Settle up panel, built fresh on every render so it can never show a
// stale figure: when a sale or payment syncs in, the panel redraws with it.
// Only for an account running both ways (needsSettleUp) — an ordinary payout
// covers the rest. `extra` is what the money card adds: { actions, notice, more }.
function getSettleUpHtml(bookId, plan, extra = {}) {
  const book = BOOKS[bookId];
  artistSettlementPreviews.set(bookId, plan);
  const author = isAuthor();
  const model = settleUpModel(plan.balance, { author });
  const html = settleUpHtml(model, {
    bookId, cur: book.currency, date: today(),
    payLinkReady: !!settlementPayState(states[bookId], { payable: plan.hasWork && plan.balance.direction === 'to-publisher', balance: plan.balance }).link,
    canRecord: !author && isPublisherSession(),
    hasWork: plan.hasWork, reviewError: !!plan.error,
    pendingSync: syncQueue.filter(q => q.bookId === bookId).length,
    statement: artistSettlementStatement(book, plan.balance, today()),
    transfers: plan.transfers,
    ...extra,
  });
  return html;
}

// The buttons and notes the money card carries, so the banners that used to
// carry them can step aside: the author's Pay button (or why there isn't one
// yet), the payment link the publisher pays back through, and the author's
// payout request.
function moneyCardActions(bookId, plan, stats, cur) {
  const s = states[bookId];
  const b = plan.balance;
  const author = isAuthor();
  const money = n => fmt(n, cur);
  if (author && plan.error) return { notice: 'Your publisher is checking an earlier payment. Nothing to send until they have.' };
  if (author && plan.hasWork && b.direction === 'to-publisher' && b.amount > 0) {
    const { link, paid } = settlementPayState(s, { plan, balance: b, payable: true });
    if (paid) return { notice: "✓ Paid — thank you! It clears once your publisher's app records it." };
    return link
      ? { actions: `<a class="btn gold sys-target" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">Pay ${money(b.amount)} →</a>` }
      : { notice: "Your payment link is on its way. Your publisher's app is preparing it." };
  }
  if (b.direction !== 'to-artist') return {};
  const buttons = [];
  const payLink = safeHttpUrl((s?.artistPaymentLink || '').trim());
  if (payLink && !author) {
    buttons.push(`<a class="btn outline sys-target" href="${escapeHtml(payLink)}" target="_blank" rel="noopener" title="Pay them the ${money(b.amount)} here, then record it">↗ Their payment link</a>`);
  } else if (!payLink) {
    buttons.push(author
      ? '<button type="button" class="btn gold sys-target" data-action="moneyCard.setUpPayLink" title="Add the link your publisher pays you through">Set up your payment link →</button>'
      : '<button type="button" class="btn outline sys-target" data-action="moneyCard.askPayLink" title="Send the author simple steps to add the link you\'ll pay them through">✉ Ask author to add payment link</button>');
  }
  let notice = '';
  if (author && stats.owedToArtist > 0.01) {
    const pending = pendingPayoutRequest(s, stats);
    buttons.push(`<button type="button" class="btn outline sys-target" id="request-payout-btn-${escapeHtml(String(bookId))}" data-action="moneyCard.requestPayout" data-book="${escapeHtml(String(bookId))}">${pending ? 'Send reminder' : 'Request payout'}</button>`);
    if (pending) notice = `✓ You asked for ${money(pending.amount)} on ${escapeHtml(pending.requestedAt ? pending.requestedAt.slice(0, 10) : '—')}. Your publisher has been told.`;
  }
  return { actions: buttons.join(''), notice };
}

// What sits folded at the foot of the money card: the lifetime figures in one
// line, how the artist is paid, and the payments already made.
function moneyCardMore(bookId, stats, cur, parts) {
  const id = escapeHtml(String(bookId));
  const n = stats.payouts?.length || 0;
  const held = stats.heldByArtistGross > 0.01 ? ` · held by ${isAuthor() ? 'you' : 'the artist'} ${fmt(stats.heldByArtistGross, cur)}` : '';
  return `<p class="ps-money-totals">Earned so far ${fmt(stats.totalArtistEarned, cur)} · ${parts.hasSettlements ? 'settled' : 'paid'} ${fmt(stats.totalPaidToArtist, cur)}${held}</p>
      <details class="ps-money-more">
        <summary>${isAuthor() ? 'How you are paid' : 'How the artist is paid'} <span aria-hidden="true">▾</span></summary>
        <div class="ps-money-more-body">${parts.tiers}</div>
      </details>
      <details class="ps-money-more" id="ps-payments-${id}">
        <summary>${parts.hasSettlements ? 'Payments &amp; settlements' : isAuthor() ? 'Payments to you' : 'Payments to the artist'} (${n}) <span aria-hidden="true">▾</span></summary>
        <div class="ps-money-more-body">${parts.payments}</div>
      </details>`;
}

// The money card leads the dashboard; without one, the breakdown keeps its
// place further down, after the metrics.
function placeProfitSharingBlock(block, lead) {
  const anchor = lead ? $('author-payment-banner') : $('artist-transfers-sect');
  if (anchor && block.nextElementSibling !== anchor) anchor.before(block);
}

// Phones get the system share sheet (Messages, Mail, WhatsApp…); everything
// else, or a share sheet that isn't there, falls back to the clipboard.
async function shareArtistSettlement(bookId) {
  const plan = artistSettlementPreviews.get(bookId);
  const book = BOOKS[bookId];
  if (!plan || !book) return;
  const text = artistSettlementStatement(book, plan.balance, today());
  if (!isAuthor() && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: `Author settlement — ${book.title}`, text });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return; // they closed the sheet on purpose
    }
  }
  return copyArtistSettlement(bookId);
}

function toggleArtistSettlementForm(bookId) {
  if (!isPublisherSession() || isAuthor()) return;
  const form = document.getElementById(`artist-settlement-form-${bookId}`);
  if (!form) return;
  form.hidden = !form.hidden;
  document.getElementById(`artist-settlement-record-button-${bookId}`)?.setAttribute('aria-expanded', String(!form.hidden));
  if (!form.hidden) document.getElementById(`as-date-${bookId}`)?.focus();
  else document.getElementById(`artist-settlement-record-button-${bookId}`)?.focus();
}

async function copyArtistSettlement(bookId, payoutId = '') {
  const record = payoutId ? findArtistPayout(bookId, payoutId) : null;
  const plan = artistSettlementPreviews.get(bookId);
  const text = record?.settlement?.statement || (plan && artistSettlementStatement(BOOKS[bookId], plan.balance, today()));
  if (!text) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    showToast('Explanation copied — ready to share with the author');
  } catch (_) {
    const field = document.getElementById(payoutId ? `artist-settlement-receipt-${bookId}-${payoutId}` : `artist-settlement-text-${bookId}`);
    if (field) {
      field.closest('details').open = true;
      field.focus(); field.select();
    }
    showToast('Clipboard access was blocked. Select and copy the explanation shown.', 'warn');
  }
}

async function recordArtistSettlement(bookId) {
  if (!isPublisherSession() || isAuthor() || artistSettlementBusy.has(bookId)) return;
  const plan = artistSettlementPreviews.get(bookId);
  const book = BOOKS[bookId];
  const current = book && states[bookId] && planArtistSettlement(book, states[bookId]);
  if (!plan || !current || plan.signature !== current.signature) { renderProfitSharingBreakdown(bookId); showToast('The balances changed — the figures above are now up to date. Check them, then record again.', 'warn'); return; }
  const value = name => document.getElementById(`as-${name}-${bookId}`)?.value || '';
  const date = value('date'), method = value('method').trim(), notes = value('notes').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showToast('Choose a payment date.', 'warn'); return; }
  artistSettlementBusy.add(bookId);
  try {
    const direction = plan.balance.direction;
    const cash = fmt(plan.balance.amount, book.currency);
    const message = direction === 'to-publisher' ? `Confirm the author has paid you ${cash}.`
      : direction === 'to-artist' ? `Confirm you have paid the author ${cash}.` : 'Confirm both balances should be offset without a cash payment.';
    if (!(await confirmDialog(`${message}\n\nThis clears the held sales and both outstanding balances in this calculation. The settlement stays in the payment history and can be undone.`, { title: 'Record author settlement', okLabel: 'Record settlement' }))) return;
    const outcome = applyArtistSettlement(BOOKS[bookId], states[bookId], plan, { date, method, notes });
    if (!outcome.ok) { renderProfitSharingBreakdown(bookId); showToast('The balances changed — the figures above are now up to date. Check them, then record again.', 'warn'); return; }
    settlePayoutRequests(bookId);
    await saveState(bookId);
    syncArtistSettlementSales(bookId, outcome.record);
    if (bookId === activeBook) { renderHist(); updateDash(); renderArtistTransfers(); }
    renderProfitSharingBreakdown(bookId);
    showToast(artistSettlementIssues(states[bookId]).size ? 'Settlement recorded — overlapping settlements need review in payment history'
      : syncQueue.some(q => q.bookId === bookId) ? 'Settlement recorded on this device — waiting to synchronize' : 'Settlement recorded — both balances cleared');
  } finally { artistSettlementBusy.delete(bookId); }
}

async function undoRecordedArtistSettlement(bookId, payoutId) {
  if (!isPublisherSession() || isAuthor() || artistSettlementBusy.has(bookId)) return;
  const record = findArtistPayout(bookId, payoutId);
  if (!record?.settlement || record.voided) return;
  artistSettlementBusy.add(bookId);
  try {
    if (!(await confirmDialog('Undo this author settlement?\n\nThis removes its effect from the balances and restores any sales it settled. It changes the records only; it does not return any money.', { title: 'Undo settlement', okLabel: 'Undo settlement', danger: true }))) return;
    const outcome = undoArtistSettlement(states[bookId], payoutId);
    if (!outcome.ok) { showToast('A linked sale changed. Review it before undoing this settlement.', 'warn'); return; }
    settlePayoutRequests(bookId);
    await saveState(bookId);
    syncArtistSettlementSales(bookId, record);
    if (bookId === activeBook) { renderHist(); updateDash(); renderArtistTransfers(); }
    renderProfitSharingBreakdown(bookId);
    showToast('Settlement undone — balances recalculated');
  } finally { artistSettlementBusy.delete(bookId); }
}

function syncArtistSettlementSales(bookId, record) {
  if (!sheetsUrl) return;
  const state = states[bookId], book = BOOKS[bookId];
  const byKey = rowsByKey('hist', state.hist || []);
  for (const link of record.settlement.heldSales) {
    const h = byKey.get(link.key);
    if (!h || h.consignmentLink) continue;
    const nativeCur = getBookCurrencyCode(book);
    const totalNative = roundCents(h.qty * h.price);
    const marker = h.artistPending ? '[PENDING ARTIST TRANSFER — NET SETTLEMENT UNDONE]' : '[AUTHOR NET SETTLEMENT RECORDED]';
    syncToSheets({
      type: 'order', book: book.title, date: h.date, num: h.num, chan: h.chan,
      qty: h.qty, price: h.price, total: totalNative, stockAfter: h.after ?? state.stock,
      notes: `${h.notes || ''} ${marker}`, sheetsId: h.sheetsId || '', currency: nativeCur,
      paymentCurrency: normalizeCurrencyCode(h.payment?.currency || nativeCur, 'CAD'),
      paymentAmount: h.payment?.amount ?? totalNative, paymentRate: h.payment?.rate ?? '',
      convertedTotal: cadEquivalentForSale({ nativeCurrency: nativeCur, totalNative, payment: h.payment }),
    });
  }
}

// Bring every request's `settled` flag in line with what has actually been paid.
// Both directions matter: deleting or reducing a payout has to re-open a request
// it used to cover, or the attention signal would stay silent about money that
// is owed again. Returns true when anything changed.
//
// Nothing wrote this flag before, so the `!r.settled` filters in
// attention-signals.js and activity-feed.js kept every request alive forever —
// a request stayed a blocking alert long after it was paid in full.
function settlePayoutRequests(bookId) {
  const s = states[bookId];
  const stats = calculateArtistEarnings(bookId);
  if (!s || !stats || !Array.isArray(s.payoutRequests)) return false;

  let changed = false;
  for (const r of s.payoutRequests) {
    const covered = payoutRequestCovered(r, stats);
    if (covered && !r.settled) {
      r.settled = true;
      r.settledAt = new Date().toISOString();
      changed = true;
    } else if (!covered && r.settled) {
      r.settled = false;
      delete r.settledAt;
      changed = true;
    }
  }
  return changed;
}

// The most recent payout request that hasn't been covered by payouts since.
// Reads the live figures as well as the stored flag so the panel is right the
// moment a payout is recorded, without waiting on a save to land.
function pendingPayoutRequest(state, stats) {
  const reqs = (state && state.payoutRequests) || [];
  if (!reqs.length) return null;
  // ⚡ Bolt Optimization: Use O(N) imperative loop instead of O(N log N) slice().sort()[0] to find the latest request
  let latest = reqs[0];
  for (let i = 1; i < reqs.length; i++) {
    if ((reqs[i].requestedAt || '') > (latest.requestedAt || '')) {
      latest = reqs[i];
    }
  }
  if (!latest || latest.settled) return null;
  return payoutRequestCovered(latest, stats) ? null : latest;
}

// Artist-facing call to action: surfaces the share of profit that's actually
// available to them right now and lets them ask for it in one click, instead
// of having to email the publisher out of band. Publishers see the same figure
// framed as an outstanding obligation, plus any request the artist has sent.
function getPayoutRequestHtml(bookId, stats, cur, owed) {
  if (!(owed > 0.01)) return '';
  const authorView = isAuthor();
  const pending = pendingPayoutRequest(states[bookId], stats);

  if (!authorView) {
    // Publisher side: only worth adding a row when the artist has asked.
    if (!pending) return '';
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;
        background:var(--gold-bg); border:var(--stroke-hair) solid var(--gold-line); border-left:var(--stroke) solid var(--gold);
        border-radius:var(--r2); padding:12px 14px; margin-bottom:1.25rem;">
        <div>
          <div style="font-weight:600; color:var(--text2); font-size:var(--text-base);">The artist requested a payout of ${fmt(pending.amount, cur)}</div>
          <div style="font-size:var(--text-xs); color:var(--text3); margin-top:2px;">Requested ${escapeHtml(pending.requestedAt ? pending.requestedAt.slice(0, 10) : '—')} · ${fmt(owed, cur)} currently owed</div>
        </div>
        <button class="btn gold" onclick="toggleArtistPayoutForm('${bookId}')">Record payout</button>
      </div>`;
  }

  const pendingHtml = pending ? `
        <div style="font-size:var(--text-xs); color:var(--text3); margin-top:6px;">
          ✓ You requested ${fmt(pending.amount, cur)} on ${escapeHtml(pending.requestedAt ? pending.requestedAt.slice(0, 10) : '—')} — the publisher has been notified.
        </div>` : '';

  return `
    <div style="background:var(--cream2); border:var(--stroke-hair) solid var(--gold-line); border-left:var(--stroke) solid var(--gold);
      border-radius:var(--r2); padding:14px 16px; margin-bottom:1.25rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap;">
        <div>
          <div class="hs-label" style="color:var(--text3);">Available to request</div>
          <div class="hs-val" style="color:var(--gold-text); font-size:24px; font-weight:700;">${fmt(owed, cur)}</div>
          <div style="font-size:var(--text-xs); color:var(--text3); margin-top:2px;">your share of profit, not yet paid out</div>
        </div>
        <button class="btn gold" id="request-payout-btn-${bookId}" style="padding:10px 18px; font-size:var(--text-sm);"
          onclick="requestArtistPayout('${bookId}')">${pending ? 'Send reminder' : 'Request payout'}</button>
      </div>
      ${pendingHtml}
    </div>`;
}

function getPayoutHistoryHtml(stats, bookId, cur) {
  const payouts = stats.payouts || [];
  const issues = artistSettlementIssues(states[bookId] || {});

  // ⚡ Bolt Optimization: Replace chained .filter().map().join() with a single imperative loop to prevent intermediate array allocations
  let undone = '';
  const _artistPayouts = states[bookId]?.artistPayouts;
  if (_artistPayouts) {
    for (const p of _artistPayouts) {
      if (p.voided && p.settlement) {
        undone += `<div class="ps-payout-row"><span class="ps-payout-row-main"><strong>Undone author settlement</strong><span class="ps-payout-row-meta">${fmtD(p.date)} · Original amount ${fmt(p.settlement.balance.amount, p.settlement.cur)} · balances recalculated</span></span></div>`;
      }
    }
  }

  if (!payouts.length) {
    return `<div class="ps-payout-empty">
      <span class="ps-payout-empty-icon" aria-hidden="true">💸</span>
      <strong>No payouts recorded yet</strong>
      <span>${isAuthor() ? 'Every payment your publisher sends you lands here' : 'Every payment you send the artist belongs here'} — it is what the balance above is measured against.</span>
    </div>${undone}`;
  }

  const book = BOOKS[bookId];

  // ⚡ Bolt Optimization: Use string comparison instead of localeCompare for sorting ISO "YYYY-MM-DD" dates
  const rows = payouts.slice().sort((a, b) => { const dA = a.date || ''; const dB = b.date || ''; return dA > dB ? -1 : (dA < dB ? 1 : 0); }).map(p => {
    if (p.settlement) {
      const balance = p.settlement.balance;
      const pid = escapeHtml(String(p.id));
      // The payout this settlement made to the artist — the same figure the
      // list's total adds — with the cash that actually moved as the detail.
      const credit = parseFloat(p.amount) || 0;
      const summary = settlementPayoutSummary(balance, credit, n => fmt(n, cur), { author: isAuthor() });
      return `<div class="ps-payout-form">
        ${issues.has(p.id) ? '<p class="ps-payout-preview is-warn">Needs review: this settlement overlaps another payment, or a sale or expense it covered changed. Check the actual payments and undo the incorrect record.</p>' : ''}
        <div class="ps-payout-row">
          <span class="ps-payout-row-main"><strong>${summary.title}</strong><span class="ps-payout-row-meta">${fmtD(p.date)}${p.method ? ' · ' + escapeHtml(p.method) : ''}</span></span>
          <span class="ps-payout-row-amt">${credit < 0 ? '−' : ''}${fmt(Math.abs(credit), cur)}</span>
        </div>
        <p class="ps-payout-preview">${escapeHtml(summary.detail)} ${p.notes ? escapeHtml(p.notes) : ''}</p>
        <div class="ps-payout-actions">
          <button class="btn sys-target" onclick="copyArtistSettlement('${bookId}', '${pid}')">Copy explanation</button>
          ${!isAuthor() ? `<button class="btn tx sys-target" onclick="undoRecordedArtistSettlement('${bookId}', '${pid}')">Undo settlement</button>` : ''}
        </div>
        <details><summary>View settlement explanation</summary>
          <label for="artist-settlement-receipt-${bookId}-${pid}">Recorded explanation for the author</label>
          <textarea id="artist-settlement-receipt-${bookId}-${pid}" rows="12" readonly>${escapeHtml(p.settlement.statement)}</textarea>
        </details>
      </div>`;
    }
    // ⚡ Bolt Optimization: Use shared escapeHtml to prevent GC pressure from inline object creation during replace operations
    // A payout handed over in another currency carries the same `payment` meta a
    // foreign sale does, so the row can show the cash that actually moved
    // ("Paid USD 50.00 @ 1.3640 → CA$68.20") beside the book-currency figure the
    // balance is measured in. A same-currency payout would only restate the
    // amount already shown, so it gets no note at all.
    const netted = payoutNetted(p);
    const isFxPayout = p.payment
      && normalizeCurrencyCode(p.payment.currency, '') !== normalizeCurrencyCode(p.cur, bookCurrencyCode(book));
    const fxNote = isFxPayout ? paymentSummary(p.payment, book, p) : '';
    const meta = [
      p.method ? escapeHtml(p.method) : '',
      p.notes ? escapeHtml(p.notes) : '',
      fxNote ? escapeHtml(fxNote) : '',
      netted > 0.005 ? `netted ${fmt(netted, cur)} owed to you` : '',
      p.editedAt ? 'edited' : '',
    ].filter(Boolean).join(' · ');
    const pid = escapeHtml(String(p.id));
    return `
        <div class="ps-payout-row">
          <span class="ps-payout-row-main">
            <span class="ps-payout-row-amt">${fmt(parseFloat(p.amount) || 0, cur)}</span>
            <span class="ps-payout-row-meta">${fmtD(p.date) ?? '—'}${meta ? ' · ' + meta : ''}</span>
          </span>
          <span class="ps-payout-row-actions">
            <button class="btn tx sm sys-target ps-payout-edit"
              onclick="editArtistPayout('${bookId}', '${pid}')" title="Edit this payout" aria-label="Edit payout">✎</button>
            <button class="btn tx sm sys-target ps-payout-del"
              onclick="deleteArtistPayout('${bookId}', '${pid}')" title="Delete this payout" aria-label="Delete payout">✕</button>
          </span>
        </div>`;
  }).join('');

  // The running total is the same figure as the "Paid to artist" card above, so
  // the list can be reconciled against it without adding the rows up by hand.
  return `${rows}${undone}
        <div class="ps-payout-total">
          <span>${payouts.length} payout${payouts.length === 1 ? '' : 's'}</span>
          <span class="ps-payout-total-val">${fmt(stats.totalPaidToArtist ?? 0, cur)}</span>
        </div>`;
}
function renderProfitSharingBreakdown(bookId) {
  artistSettlementPreviews.delete(bookId);
  const block = $('d-profit-sharing-block');
  const content = $('ps-dash-content');
  if (!block || !content) return;

  const book = BOOKS[bookId];
  if (!book || !book.profitTiers || book.profitTiers.length === 0) {
    block.style.display = 'none';
    return;
  }

  block.style.display = '';
  const stats = calculateArtistEarnings(bookId);
  if (!stats) {
    content.innerHTML = '<div class="empty-state">No earnings data yet.</div>';
    return;
  }

  const cur = book.currency;

  const { tierHeader, tierHtml, tiers, nextTier, effectiveCap } = getProfitTiersHtml(book, stats, cur);
  const progressHtml = getRevenueProgressHtml(stats, tiers, nextTier, effectiveCap, cur);
  const payoutHistoryHtml = getPayoutHistoryHtml(stats, bookId, cur);
  const hasSettlements = (states[bookId]?.artistPayouts || []).some(p => p.settlement);
  const tiersHtml = `
    <div style="margin-bottom:1rem;">
       <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
         <span class="sect sect-inline">Payout Tiers</span>
         <span style="font-size:var(--text-xs); color:var(--text3);">Publisher keeps: <strong style="color:var(--text); font-size:var(--text-base);">${fmt(stats.netPublisher, cur)}</strong></span>
       </div>
       ${tierHeader}
       ${tierHtml}
    </div>
    ${progressHtml}`;
  const owedNow = stats.owedToArtist;
  const payoutFormHtml = getPayoutFormHtml(bookId, cur, owedNow);
  const paymentsHtml = (head) => `
    <div class="ps-payout-section">
      <div class="ps-payout-head">
        ${head ? `<span class="sect sect-inline">${hasSettlements ? 'Payments & settlements' : 'Artist Payouts'}</span>` : ''}
        ${payoutFormHtml ? `<button class="btn gold" onclick="toggleArtistPayoutForm('${bookId}')">+ Record payout</button>` : ''}
      </div>
      ${payoutFormHtml}
      <div class="ps-payout-list sys-container">
        ${payoutHistoryHtml}
      </div>
    </div>`;

  // Money running both ways: one card says it all — the amount that changes
  // hands, the lines behind it, and folded underneath, how the artist is paid
  // and what has been paid. It leads the dashboard, and the banners that used
  // to repeat its figures stand aside.
  const plan = planArtistSettlement(book, states[bookId]);
  if (plan && needsSettleUp(plan.balance)) {
    const more = moneyCardMore(bookId, stats, cur, { hasSettlements, tiers: tiersHtml, payments: paymentsHtml(false) });
    const settleHtml = getSettleUpHtml(bookId, plan, { ...moneyCardActions(bookId, plan, stats, cur), more });
    block.classList.add('is-money-card');
    placeProfitSharingBlock(block, true);
    // Publisher side: the artist's payout request, if they sent one.
    const requestHtml = isAuthor() ? '' : getPayoutRequestHtml(bookId, stats, cur, owedNow);
    content.innerHTML = `${settleHtml}${requestHtml}`;
    return;
  }
  block.classList.remove('is-money-card');
  placeProfitSharingBlock(block, false);

  const { owedLabel, owedVal, owedSub, owedTone, owed } = getOwedCardDetails(stats, cur);
  const { heldCardHtml, hasHeld } = getArtistHeldHtml(stats, cur);
  const statCols = `cols-${3 + (hasHeld ? 1 : 0)}`;
  const payoutRequestHtml = getPayoutRequestHtml(bookId, stats, cur, owed);

  content.innerHTML = `
    <div class="ps-stat-grid ${statCols}">
      <div class="ps-stat-card">
        <div class="ps-stat-label">Artist earnings</div>
        <div class="ps-stat-val is-positive">${fmt(stats.totalArtistEarned, cur)}</div>
        <div class="ps-stat-sub">lifetime total</div>
      </div>
      <div class="ps-stat-card">
        <div class="ps-stat-label">${hasSettlements ? 'Earnings settled' : 'Paid to artist'}</div>
        <div class="ps-stat-val is-muted">${fmt(stats.totalPaidToArtist, cur)}</div>
        <div class="ps-stat-sub">${stats.payouts?.length || 0} payout${(stats.payouts?.length || 0) !== 1 ? 's' : ''} recorded</div>
      </div>
      ${heldCardHtml}
      <div class="ps-stat-card is-lead tone-${owedTone}">
        <div class="ps-stat-label">${owedLabel}</div>
        <div class="ps-stat-val">${owedVal}</div>
        ${owed > 0.01 ? owedFromSalesHtml(bookId, owed, cur) : ''}
        <div class="ps-stat-sub">${owedSub}</div>
      </div>
    </div>
    ${payoutRequestHtml}
    ${tiersHtml}
    ${paymentsHtml(true)}
  `;
}

// Recording and editing payouts is a publisher-only action, and not just by
// convention: `artistPayouts` is absent from the author-writable part list in
// firestore.rules, and _fbSave commits every dirty part as one batch that
// Firestore rejects wholesale if any document is denied. An author who used
// this form would get a permission-denied that saveState treats as retryable
// and re-queues forever — so the form is never rendered for them at all.
// Authors still see the full payout history and the request CTA above it.
function getPayoutFormHtml(bookId, cur, owed) {
  if (isAuthor()) return '';

  const nativeCode = normalizeCurrencyCode(cur, 'CAD');
  const curOptions = Object.keys(CODE_TO_SYMBOL).map(code =>
    `<option value="${code}"${code === nativeCode ? ' selected' : ''}>${getSym(code)} ${code}</option>`
  ).join('');

  // Offer to net what the artist owes the shop against this payment. Only worth
  // showing when there is both a royalty to pay and an open debt to take off it.
  const st = states[bookId];
  const plan = planNetPayout(owed, st && st.artistReceivables, st && st.artistPayouts);
  const netHtml = plan.offset > 0.005 ? `
        <label class="ps-payout-net" for="ap-net-${bookId}">
          <input type="checkbox" id="ap-net-${bookId}" checked onchange="onArtistPayoutNetChange('${bookId}')">
          <span>Net against what the artist owes you — clears ${fmt(plan.offset, cur)}, so you send ${fmt(plan.cashToPay, cur)}</span>
        </label>` : '';

  return `
      <div id="artist-payout-form-${bookId}" class="ps-payout-form sys-container" hidden>
        <div class="ps-payout-fields">
          <div class="form-group">
            <label for="ap-amount-${bookId}">Amount</label>
            <input type="number" id="ap-amount-${bookId}" class="ps-payout-num" step="0.01" min="0" inputmode="decimal"
              placeholder="${owed > 0.01 ? owed.toFixed(2) : '0.00'}" oninput="previewArtistPayout('${bookId}')">
          </div>
          <div class="form-group">
            <label for="ap-cur-${bookId}">Currency</label>
            <select id="ap-cur-${bookId}" class="ps-payout-num" onchange="onArtistPayoutCurrencyChange('${bookId}')">${curOptions}</select>
          </div>
          <div class="form-group">
            <label for="ap-date-${bookId}">Date</label>
            <input type="date" id="ap-date-${bookId}" class="ps-payout-num" value="${today()}">
          </div>
          <div class="form-group">
            <label for="ap-method-${bookId}">Method (optional)</label>
            <input type="text" id="ap-method-${bookId}" placeholder="e-Transfer, PayPal…">
          </div>
          <div class="form-group">
            <label for="ap-notes-${bookId}">Notes (optional)</label>
            <input type="text" id="ap-notes-${bookId}" placeholder="Anything worth remembering">
          </div>
        </div>
        <!-- Shown only while the chosen currency differs from the book's. The rate
             is fetched live; when the lookup fails the publisher types one here
             rather than being blocked from recording a payment that did happen. -->
        <div class="ps-payout-fx" id="ap-fx-row-${bookId}" hidden>
          <label for="ap-rate-${bookId}">Rate to ${escapeHtml(nativeCode)}</label>
          <input type="number" id="ap-rate-${bookId}" class="ps-payout-num" step="0.0001" min="0" inputmode="decimal"
            oninput="previewArtistPayout('${bookId}')">
          <span class="ps-payout-fx-note" id="ap-fx-note-${bookId}"></span>
        </div>
        ${netHtml}
        <!-- Live verdict on what the typed amount does to the balance. Announced
             politely so a screen reader hears the overpayment warning too. -->
        <div class="ps-payout-preview" id="ap-preview-${bookId}" role="status" aria-live="polite"></div>
        <div class="ps-payout-actions">
          <button class="btn gold" id="ap-save-${bookId}" onclick="saveArtistPayout('${bookId}')">Save payout</button>
          ${owed > 0.01 ? `<button class="btn" onclick="fillArtistPayoutFull('${bookId}')">Pay full balance (${fmt(plan.offset > 0.005 ? plan.cashToPay : owed, cur)})</button>` : ''}
          <button class="btn tx" onclick="toggleArtistPayoutForm('${bookId}')">Cancel</button>
        </div>
      </div>`;
}

// The payout the form is currently editing, as { bookId, id }, or null when the
// form is in "record a new one" mode. Only one book's breakdown is ever on
// screen, so a single slot is enough — but it is keyed by bookId anyway so a
// book switch mid-edit can't apply one book's edit to another's ledger.
let _editingPayout = null;

// Point the form at a fresh payout: empty fields, today's date, book currency,
// and the create-mode button label.
function resetArtistPayoutForm(bookId) {
  _editingPayout = null;
  const book = BOOKS[bookId];
  const set = (id, value) => { const el = document.getElementById(`${id}-${bookId}`); if (el) el.value = value; };
  set('ap-amount', '');
  set('ap-date', today());
  set('ap-method', '');
  set('ap-notes', '');
  set('ap-rate', '');
  set('ap-cur', bookCurrencyCode(book));
  const net = document.getElementById(`ap-net-${bookId}`);
  if (net) { net.checked = true; net.disabled = false; }
  const save = document.getElementById(`ap-save-${bookId}`);
  if (save) save.textContent = 'Save payout';
  syncArtistPayoutFxRow(bookId);
}

function toggleArtistPayoutForm(bookId) {
  const form = document.getElementById(`artist-payout-form-${bookId}`);
  if (!form) return;
  // On the money card the form sits in the folded payments list: unfold it.
  const fold = form.closest('details');
  if (form.hidden && fold) fold.open = true;
  form.hidden = !form.hidden;
  // Closing it abandons any in-progress edit, so the next open starts clean
  // rather than silently still pointing at the row that was being edited.
  if (form.hidden) { resetArtistPayoutForm(bookId); return; }
  // Opening it: state the balance straight away, so the reference figure is on
  // screen before the first keystroke rather than only after one.
  previewArtistPayout(bookId);
  const amount = document.getElementById(`ap-amount-${bookId}`);
  if (amount) amount.focus();
}

// Load an existing payout back into the form. Works on every payout, including
// ones generated by a consignment settlement — those are derived from a sale, so
// editing one is confirmed first and the source sale is named, the same courtesy
// the Tax Centre's ledger row edit extends.
async function editArtistPayout(bookId, payoutId) {
  const s = states[bookId];
  const book = BOOKS[bookId];
  if (!s || !book) return;
  const p = (s.artistPayouts || []).find(x => String(x.id) === String(payoutId));
  if (!p) { showToast('⚠ Payout record not found', 'err'); return; }
  if (p.settlement) { showToast('This is a combined settlement. Undo it before recording a correction.', 'warn'); return; }

  if (p.sourceNum) {
    const ok = await confirmDialog(
      `This payout was created when sale #${p.sourceNum} was settled with the artist, so its amount was worked out from that sale.\n\n` +
      `Editing it here changes the payout only — the sale itself is left as it is.`,
      { okLabel: 'Edit anyway', title: 'Edit settled payout' }
    );
    if (!ok) return;
  }

  const form = document.getElementById(`artist-payout-form-${bookId}`);
  if (!form) return;
  form.hidden = false;
  _editingPayout = { bookId, id: String(p.id) };

  const set = (id, value) => { const el = document.getElementById(`${id}-${bookId}`); if (el) el.value = value; };
  // Show the money as it was actually entered: the foreign cash and its rate
  // when the payout was made in another currency, otherwise the book figure.
  const fx = p.payment && normalizeCurrencyCode(p.payment.currency, '') !== bookCurrencyCode(book) ? p.payment : null;
  set('ap-amount', fx ? Number(fx.amount || 0).toFixed(2) : Number(p.amount || 0).toFixed(2));
  set('ap-cur', fx ? normalizeCurrencyCode(fx.currency, 'CAD') : normalizeCurrencyCode(p.cur, bookCurrencyCode(book)));
  set('ap-rate', fx && fx.rate ? String(fx.rate) : '');
  set('ap-date', p.date || today());
  set('ap-method', p.method || '');
  set('ap-notes', p.notes || '');

  // An edit keeps whatever the payout already netted; re-netting is a new payout.
  const net = document.getElementById(`ap-net-${bookId}`);
  if (net) { net.checked = false; net.disabled = true; }
  const save = document.getElementById(`ap-save-${bookId}`);
  if (save) save.textContent = 'Update payout';
  syncArtistPayoutFxRow(bookId);
  previewArtistPayout(bookId);
  const amount = document.getElementById(`ap-amount-${bookId}`);
  if (amount) amount.focus();
}

// What the form currently describes, resolved into the book's own currency.
// `nativeAmount` is the figure the balance is measured in and the one stored on
// the payout; `amount`/`code` are the cash that actually changed hands.
function readArtistPayoutForm(bookId) {
  const book = BOOKS[bookId];
  const native = bookCurrencyCode(book);
  const amountEl = document.getElementById(`ap-amount-${bookId}`);
  const curEl = document.getElementById(`ap-cur-${bookId}`);
  const rateEl = document.getElementById(`ap-rate-${bookId}`);
  const amount = parseFloat(amountEl ? amountEl.value : '');
  const code = normalizeCurrencyCode(curEl ? curEl.value : native, native);
  const isFx = code !== native;
  const typedRate = parseFloat(rateEl ? rateEl.value : '');
  const rate = isFx ? (Number.isFinite(typedRate) && typedRate > 0 ? typedRate : 0) : 1;
  const nativeAmount = Number.isFinite(amount) && rate > 0 ? roundCents(amount * rate) : NaN;
  return { native, amount, code, isFx, rate, nativeAmount };
}

// Show the rate row only for a foreign payout, and keep its hint line current.
function syncArtistPayoutFxRow(bookId) {
  const row = document.getElementById(`ap-fx-row-${bookId}`);
  if (!row) return;
  const { isFx, code, native, amount, rate, nativeAmount } = readArtistPayoutForm(bookId);
  row.hidden = !isFx;
  const note = document.getElementById(`ap-fx-note-${bookId}`);
  if (!note) return;
  if (!isFx) { note.textContent = ''; return; }
  if (!(rate > 0)) {
    note.textContent = `Enter how many ${native} one ${code} is worth.`;
    return;
  }
  const bookCur = (BOOKS[bookId] && BOOKS[bookId].currency) || native;
  note.textContent = Number.isFinite(amount) && amount > 0
    ? `${fmt(amount, code)} @ ${rate.toFixed(4)} → ${fmt(nativeAmount, bookCur)}`
    : `1 ${code} = ${rate.toFixed(4)} ${native}`;
}

// Currency changed: fetch a live rate for the new pair so the publisher doesn't
// have to look one up, falling back to the manual rate box when the lookup
// fails. Kept off the amount field's `oninput` so typing never triggers a fetch.
async function onArtistPayoutCurrencyChange(bookId) {
  const rateEl = document.getElementById(`ap-rate-${bookId}`);
  const { isFx, code, native } = readArtistPayoutForm(bookId);
  if (rateEl) rateEl.value = '';
  syncArtistPayoutFxRow(bookId);
  if (!isFx) { previewArtistPayout(bookId); return; }

  const note = document.getElementById(`ap-fx-note-${bookId}`);
  if (note) note.textContent = 'Fetching rate…';
  let rate = 0;
  try {
    const res = await fetchLiveRate(code, native);
    rate = Number(res && res.rate) || 0;
  } catch { rate = 0; }
  // The panel can re-render or the currency change again while the rate is in
  // flight; only apply it if the box is still empty and still on this pair.
  const now = readArtistPayoutForm(bookId);
  const liveRateEl = document.getElementById(`ap-rate-${bookId}`);
  if (rate > 0 && liveRateEl && !liveRateEl.value && now.code === code) {
    liveRateEl.value = String(roundCents(rate * 10000) / 10000);
  }
  syncArtistPayoutFxRow(bookId);
  previewArtistPayout(bookId);
}

// Quick-fill the amount with the whole outstanding balance. Goes through here
// rather than an inline assignment so the preview refreshes with it — `value`
// set from script fires no `input` event.
// The netting plan the form should apply: null when the box is absent, unticked
// or the payout is an edit (an edit never re-nets).
function netPlanForForm(bookId, stats) {
  const net = document.getElementById(`ap-net-${bookId}`);
  if (!net || !net.checked || net.disabled) return null;
  const s = states[bookId];
  const plan = planNetPayout(stats.owedToArtist, s && s.artistReceivables, s && s.artistPayouts);
  return plan.offset > 0.005 ? plan : null;
}

function onArtistPayoutNetChange(bookId) {
  previewArtistPayout(bookId);
}

function fillArtistPayoutFull(bookId) {
  const stats = calculateArtistEarnings(bookId);
  const amount = document.getElementById(`ap-amount-${bookId}`);
  if (!stats || !amount) return;
  const owed = stats.owedToArtist;
  if (!(owed > 0.01)) return;
  const plan = netPlanForForm(bookId, stats);
  const cash = plan ? plan.cashToPay : owed;
  // Fully netted: no cash changes hands, so leave the box empty (saving an
  // empty box with netting on records a zero-cash payout).
  amount.value = cash > 0.005 ? cash.toFixed(2) : '';
  previewArtistPayout(bookId);
  amount.focus();
}

// Say what the typed amount will do to the balance before it is saved. The
// figures come from the live earnings pipeline every time, so a payout recorded
// in another tab (or synced in from another device) can't leave a stale verdict
// on screen.
function previewArtistPayout(bookId) {
  const host = document.getElementById(`ap-preview-${bookId}`);
  const input = document.getElementById(`ap-amount-${bookId}`);
  if (!host || !input) return;

  const book = BOOKS[bookId];
  const stats = calculateArtistEarnings(bookId);
  if (!book || !stats) { host.textContent = ''; host.className = 'ps-payout-preview'; return; }

  const cur = book.currency;
  let owed = stats.owedToArtist ?? 0;
  syncArtistPayoutFxRow(bookId);

  // While editing, the row being edited is already counted in `owed`. Add it
  // back so the verdict answers "what will the balance be once this payout is
  // what I'm now typing", not "…on top of its own previous value".
  const editing = _editingPayout && _editingPayout.bookId === bookId
    ? findArtistPayout(bookId, _editingPayout.id)
    : null;
  if (editing) owed = roundCents(owed + (parseFloat(editing.amount) || 0));

  // A foreign payout is judged on its book-currency value, since that is what
  // the balance is denominated in. With no usable rate yet there is nothing to
  // compare, so say that rather than showing a wrong verdict.
  const { isFx, rate, nativeAmount } = readArtistPayoutForm(bookId);
  if (isFx && !(rate > 0)) {
    host.className = 'ps-payout-preview is-warn';
    host.textContent = `Enter a conversion rate to see what this is worth in ${cur}.`;
    return;
  }
  // With netting on, the debt clears part of the royalty first; the typed cash
  // is judged against what is left, and an empty box means "nothing to send".
  const plan = editing ? null : netPlanForForm(bookId, stats);
  if (plan) owed = roundCents(owed - plan.offset);
  const typed = isFx ? (Number.isFinite(nativeAmount) ? nativeAmount : '') : input.value;
  if (plan && (typed === '' || typed === null)) {
    host.className = 'ps-payout-preview is-neutral';
    host.textContent = plan.cashToPay > 0.005
      ? `Clears ${fmt(plan.offset, cur)} the artist owes you — send ${fmt(plan.cashToPay, cur)}.`
      : `Clears ${fmt(plan.offset, cur)} the artist owes you — nothing to send.${plan.debtLeft > 0.005 ? ` ${fmt(plan.debtLeft, cur)} stays open against future royalties.` : ''}`;
    return;
  }
  const v = describePayout(typed, owed);

  let tone = 'neutral', msg;
  if (v.tone === 'empty' || v.tone === 'invalid') {
    tone = 'neutral';
    msg = owed > 0.01
      ? `${fmt(owed, cur)} is currently owed to the artist.`
      : 'Nothing is currently owed — anything you record here counts as an advance.';
  } else if (v.tone === 'partial') {
    tone = 'neutral';
    msg = `Records ${fmt(v.amount, cur)} — leaves ${fmt(v.remaining, cur)} still owed.`;
  } else if (v.tone === 'clears') {
    tone = 'good';
    msg = `Records ${fmt(v.amount, cur)} — settles the balance in full.`;
  } else {
    tone = 'warn';
    msg = `${fmt(v.over, cur)} more than the ${fmt(Math.max(0, owed), cur)} owed — this will show as overpaid, held against future earnings.`;
  }

  host.className = `ps-payout-preview is-${tone}`;
  host.textContent = msg;
}

/** One payout row by id, tolerant of the numeric ids minted before makeEventId. */
function findArtistPayout(bookId, payoutId) {
  const s = states[bookId];
  if (!s || !Array.isArray(s.artistPayouts)) return null;
  return s.artistPayouts.find(p => String(p.id) === String(payoutId)) || null;
}

// Write the form back to the ledger — as a new payout, or over the one being
// edited. `amount` is always stored in the book's own currency (that is what the
// balance and every downstream total are denominated in); when the money moved
// in another currency the cash that actually changed hands is kept alongside it
// in `payment`, exactly as a foreign sale records it.
// A double tap on Save used to record the payout twice: the second tap read the
// still-filled form while the first was awaiting its save.
const artistPayoutSaving = new Set();
async function saveArtistPayout(bookId) {
  if (artistPayoutSaving.has(bookId)) return;
  artistPayoutSaving.add(bookId);
  try { return await saveArtistPayoutNow(bookId); }
  finally { artistPayoutSaving.delete(bookId); }
}

async function saveArtistPayoutNow(bookId) {
  const book = BOOKS[bookId];
  const s = states[bookId];
  if (!book || !s) return;

  const dateEl = document.getElementById(`ap-date-${bookId}`);
  const methodEl = document.getElementById(`ap-method-${bookId}`);
  const notesEl = document.getElementById(`ap-notes-${bookId}`);
  // The panel can re-render between the click and this handler; bail rather
  // than throwing on a field that is no longer in the document.
  if (!dateEl || !methodEl || !notesEl) return;

  const editingNow = _editingPayout && _editingPayout.bookId === bookId;
  const plan = editingNow ? null : netPlanForForm(bookId, calculateArtistEarnings(bookId) || { owedToArtist: 0 });
  const form = readArtistPayoutForm(bookId);
  // A fully-netted payment sends no cash at all: an empty amount is then valid
  // and records a zero-cash payout that carries only the offsets.
  const amountBox = document.getElementById(`ap-amount-${bookId}`);
  const cashFree = !!plan && !(amountBox && amountBox.value.trim() !== '');
  const { code, isFx, rate } = form;
  const amount = cashFree ? 0 : form.amount;
  const nativeAmount = cashFree ? 0 : form.nativeAmount;
  if (!cashFree) {
    if (!Number.isFinite(amount) || amount <= 0) { showToast('⚠ Enter a valid amount', 'warn'); return; }
    if (isFx && !(rate > 0)) { showToast('⚠ Enter a conversion rate', 'warn'); return; }
    if (!Number.isFinite(nativeAmount) || nativeAmount <= 0) { showToast('⚠ Enter a valid amount', 'warn'); return; }
  }

  if (!s.artistPayouts) s.artistPayouts = [];
  const fields = {
    date: dateEl.value || today(),
    // Rounded before it is stored: the preview and every total downstream work
    // in whole cents, so a raw 33.333 here would make the ledger disagree with
    // the figure the publisher was shown when they saved it.
    amount: roundCents(nativeAmount),
    method: (methodEl.value || '').trim(),
    notes: (notesEl.value || '').trim(),
    cur: bookCurrencyCode(book),
    payment: buildPaymentMeta({
      book, qty: 1, unitPrice: roundCents(nativeAmount),
      fxEnabled: isFx && !cashFree, fxCur: code, fxAmt: amount, fxRate: rate,
    }),
  };
  // Debts cleared by this payment. Stored on the payout (not on the debt) so
  // deleting the payout reopens them automatically.
  if (plan) fields.offsets = plan.applied;

  const editingId = _editingPayout && _editingPayout.bookId === bookId ? _editingPayout.id : null;
  const existing = editingId ? findArtistPayout(bookId, editingId) : null;
  if (editingId && !existing) {
    // The row went away under us (deleted here, or a sync landed) — don't
    // silently resurrect it as a new payout.
    showToast('⚠ That payout no longer exists', 'err');
    resetArtistPayoutForm(bookId);
    renderProfitSharingBreakdown(bookId);
    return;
  }

  if (existing) {
    if (existing.settlement) { showToast('Undo the combined settlement before recording a correction.', 'warn'); return; }
    Object.assign(existing, fields, { editedAt: new Date().toISOString() });
  } else {
    s.artistPayouts.push({ id: makeEventId(), ...fields });
  }

  settlePayoutRequests(bookId);
  await saveState(bookId);
  showToast(plan
    ? `✓ Recorded ${fmt(fields.amount, book.currency)} payout, netting ${fmt(plan.offset, book.currency)} owed to you`
    : `✓ ${existing ? 'Updated' : 'Recorded'} payout of ${fmt(fields.amount, book.currency)}`);
  resetArtistPayoutForm(bookId);
  const formEl = document.getElementById(`artist-payout-form-${bookId}`);
  if (formEl) formEl.hidden = true;
  renderProfitSharingBreakdown(bookId);
}

// Artist asks the publisher for the profit they're owed. The request is stored
// on the book's state (so it survives a reload and shows on the publisher's own
// breakdown) and emailed through the same notifyPublisher path every other
// author submission uses. The state write happens first so an offline artist
// still has the request queued locally rather than losing it outright.
async function requestArtistPayout(bookId) {
  const book = BOOKS[bookId];
  const stats = calculateArtistEarnings(bookId);
  if (!book || !stats) return;
  const cur = book.currency;
  const owed = stats.owedToArtist;
  if (!(owed > 0.01)) { showToast('⚠ Nothing is currently available to request', 'warn'); return; }

  const s = states[bookId];
  if (!s) return;
  const btn = document.getElementById(`request-payout-btn-${bookId}`);
  const oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  const req = {
    id: makeEventId(),
    requestedAt: new Date().toISOString(),
    amount: roundCents(owed),
    currency: cur,
    // The lifetime paid-to-artist total as it stands right now. Everything paid
    // beyond this counts toward covering this request, which is what lets the
    // request close itself without depending on payout dates.
    paidAtRequest: roundCents((stats.totalPaidToArtist || 0) + (stats.totalOffset || 0)),
  };
  try {
    if (!s.payoutRequests) s.payoutRequests = [];
    s.payoutRequests.push(req);
    await saveState(bookId);
    await notifyPublisherSubmission(
      'Payout Request',
      { ...req, bookTitle: book.title, lifetimeEarned: stats.totalArtistEarned, alreadyPaid: stats.totalPaidToArtist },
      `The artist requested a payout of ${fmt(owed, cur)} — their unpaid share of profit to date.`
    );
    showToast(`✓ Requested a payout of ${fmt(owed, cur)}`);
  } catch (e) {
    console.error('payout request failed', e);
    showToast('⚠ Could not send the payout request', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
    renderProfitSharingBreakdown(bookId);
  }
}

async function deleteArtistPayout(bookId, payoutId) {
  if (findArtistPayout(bookId, payoutId)?.settlement) return undoRecordedArtistSettlement(bookId, payoutId);
  if (!(await confirmDialog('Delete this payout record?', { danger: true, okLabel: 'Delete' }))) return;
  const s = states[bookId];
  if (!s || !s.artistPayouts) return;
  // String-compared because ids are now minted by makeEventId, while rows
  // written before that carry the numeric Date.now() ids.
  const gone = s.artistPayouts.find(p => String(p.id) === String(payoutId));
  const reopened = !!(gone && Array.isArray(gone.offsets) && gone.offsets.length);
  s.artistPayouts = s.artistPayouts.filter(p => String(p.id) !== String(payoutId));
  // Removing a payout can put a request back into the red, so re-evaluate
  // before the write rather than leaving a settled flag that no longer holds.
  settlePayoutRequests(bookId);
  // Awaited so the toast and the repaint follow a confirmed write, matching
  // every other mutation in this panel.
  await saveState(bookId);
  if (_editingPayout && _editingPayout.bookId === bookId && String(_editingPayout.id) === String(payoutId)) {
    resetArtistPayoutForm(bookId);
  }
  showToast(reopened ? '✓ Payout deleted — the debt it netted is owed again' : '✓ Payout deleted');
  renderProfitSharingBreakdown(bookId);
}

export {
  chStatsWithHeld,
  recognizedRevenueOf,
  updateDash,
  undoRecordedArtistSettlement,
  settlePayoutRequests,
  editArtistPayout,
  findArtistPayout,
  shareArtistSettlement,
  toggleArtistPayoutForm,
  fillArtistPayoutFull,
  previewArtistPayout,
  onArtistPayoutNetChange,
  onArtistPayoutCurrencyChange,
  saveArtistPayout,
  requestArtistPayout,
  deleteArtistPayout,
  toggleArtistSettlementForm,
  copyArtistSettlement,
  recordArtistSettlement,
  _revMemo,
  dismissStockDrift,
  getArtistHeldHtml,
  getOwedCardDetails,
  getPayoutHistoryHtml,
  getProfitTiersHtml,
  getRevenueProgressHtml,
  heldGrossOf,
  renderBookPendingAlert,
  renderProfitSharingBreakdown,
  syncArtistSettlementSales,
};
