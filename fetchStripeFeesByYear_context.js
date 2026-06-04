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
function _stripeFmtMoney(amt, cur) {
  const sign = amt < 0 ? '-' : '';
  const abs = Math.abs(amt);
  return `${sign}${cur ? cur + ' ' : ''}${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function fetchStripeFeesByYear() {
  const keyEl = document.getElementById('stripe-fees-key');
  const statusEl = document.getElementById('stripe-fees-status');
  const btn = document.getElementById('stripe-fees-btn');
  const wrap = document.getElementById('stripe-fees-results-wrap');
  const key = (keyEl.value || '').trim();
  if (!key) { statusEl.textContent = 'Please paste a Stripe restricted key.'; return; }
  if (!/^(rk|sk)_/.test(key)) { statusEl.innerHTML = '<span style="color:var(--red);">That doesn\'t look like a Stripe secret/restricted key (expected rk_… or sk_…).</span>'; return; }

  // Persist the key so the user doesn't have to re-paste it next time.
  try {
    if (!TAX_CENTER.settings) TAX_CENTER.settings = {};
    if (TAX_CENTER.settings.stripeKey !== key) {
      TAX_CENTER.settings.stripeKey = key;
      if (typeof saveTaxCenter === 'function') saveTaxCenter().catch(e => console.warn('Stripe key save failed:', e));
    }
  } catch (e) { console.warn('Stripe key persist failed:', e); }

  btn.disabled = true;
  statusEl.textContent = 'Fetching balance transactions…';
  wrap.innerHTML = '';
  wrap.style.display = 'none';
  const reconcileWrap = document.getElementById('stripe-fees-reconcile-wrap');
  if (reconcileWrap) { reconcileWrap.innerHTML = ''; reconcileWrap.style.display = 'none'; }

  // Bucket per year+currency+type. Stripe balance_transactions include many types:
  //   charge, refund, payment, payment_refund, adjustment, stripe_fee, payout, payout_failure, etc.
  // Mixing them gives garbage fee%; we keep them split and surface "Sales (charges)" separately.
  const data = {}; // year -> cur -> type -> {gross, fee, net, count}
  const byYearCurAll = {}; // year -> cur -> { gross, fee, net, count } across types
  const allTxns = []; // for CSV/audit
  let count = 0;
  let starting_after = null;

  try {
    while (true) {
      const params = new URLSearchParams({ limit: '100' });
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
        const year = new Date((tx.created || 0) * 1000).getUTCFullYear();
        const cur = (tx.currency || '').toUpperCase();
        const type = tx.type || 'unknown';
        const y = data[year] = data[year] || {};
        const c = y[cur] = y[cur] || {};
        const t = c[type] = c[type] || { gross: 0, fee: 0, net: 0, count: 0 };
        t.gross += tx.amount || 0;
        t.fee   += tx.fee || 0;
        t.net   += tx.net || 0;
        t.count += 1;
        const ya = byYearCurAll[year] = byYearCurAll[year] || {};
        const ca = ya[cur] = ya[cur] || { gross: 0, fee: 0, net: 0, count: 0 };
        ca.gross += tx.amount || 0;
        ca.fee   += tx.fee || 0;
        ca.net   += tx.net || 0;
        ca.count += 1;
        allTxns.push({
          id: tx.id, created: tx.created, year, currency: cur, type,
          amount: tx.amount, fee: tx.fee, net: tx.net,
          source: tx.source, description: tx.description || ''
        });
        count++;
      }
      statusEl.textContent = `Fetched ${count} transactions…`;
      if (!json.has_more || !json.data.length) break;
      starting_after = json.data[json.data.length - 1].id;
    }

    window._stripeFeesAudit = allTxns; // available for CSV download / console inspection

    // Per year+currency aggregates used for ledger insertion and reconciliation.
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
          // Stripe billing/service fees (monthly fee, Radar, etc.) post as their
          // own negative-amount transactions; the cost is abs(amount/gross).
          if (t === 'stripe_fee') stripeBillingMinor += Math.abs(data[yr][cur][t].gross);
        }
        if (salesFeeMinor > 0 || stripeBillingMinor > 0 || salesGrossMinor > 0) {
          ledgerData.push({ year: Number(yr), cur, salesFeeMinor, salesCount, totalFeeMinor, salesGrossMinor, stripeBillingMinor });
        }
      }
    }
    window._stripeFeesLedgerData = ledgerData;

    const years = Object.keys(data).sort((a, b) => Number(b) - Number(a)); // newest first
    const cards = [];
    const SALES_TYPES = new Set(['charge', 'payment']); // gross sales (positive amount, has fee)
    for (const year of years) {
      const curs = Object.keys(data[year]).sort();
      for (const cur of curs) {
        const types = data[year][cur];
        const salesAgg = { gross: 0, fee: 0, net: 0, count: 0 };
        for (const t of Object.keys(types)) {
          if (SALES_TYPES.has(t)) {
            salesAgg.gross += types[t].gross;
            salesAgg.fee   += types[t].fee;
            salesAgg.net   += types[t].net;
            salesAgg.count += types[t].count;
          }
        }

        // Headline (sales) section
        let headline;
        if (salesAgg.count > 0) {
          const gross = _stripeMinorToMajor(salesAgg.gross, cur);
          const fee   = _stripeMinorToMajor(salesAgg.fee, cur);
          const net   = _stripeMinorToMajor(salesAgg.net, cur);
          const pct   = salesAgg.gross ? (salesAgg.fee / salesAgg.gross) * 100 : 0;
          headline = `
            <div style="display:flex;flex-wrap:wrap;gap:1.5rem;align-items:flex-end;">
              <div style="flex:2;min-width:240px;">
                <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px;">Stripe fees on your sales</div>
                <div style="font-family:'DM Mono',monospace;font-size:32px;font-weight:500;color:var(--red);line-height:1;">${_stripeFmtMoney(fee, cur)}</div>
                <div style="font-size:13px;color:var(--text2);margin-top:8px;line-height:1.5;">
                  on <strong>${_stripeFmtMoney(gross, cur)}</strong> across <strong>${salesAgg.count}</strong> customer ${salesAgg.count === 1 ? 'payment' : 'payments'}<br>
                  You received <strong style="color:var(--green);">${_stripeFmtMoney(net, cur)}</strong> net into your Stripe balance
                </div>
              </div>
              <div style="flex:1;min-width:120px;text-align:right;">
                <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px;">Effective rate</div>
                <div style="font-family:'DM Mono',monospace;font-size:32px;font-weight:500;color:var(--gold);line-height:1;">${pct.toFixed(2)}%</div>
                <div style="font-size:11px;color:var(--text3);margin-top:8px;">of gross sales</div>
              </div>
            </div>`;
        } else {
          headline = `<div style="font-size:13px;color:var(--text3);font-style:italic;">No customer payments in this year — only balance activity below.</div>`;
        }

        // Detail rows for other activity
        const otherTypes = Object.keys(types).filter(t => !SALES_TYPES.has(t)).sort();
        const detailRows = [];
        if (salesAgg.count > 0) {
          const gross = _stripeMinorToMajor(salesAgg.gross, cur);
          const fee   = _stripeMinorToMajor(salesAgg.fee, cur);
          const net   = _stripeMinorToMajor(salesAgg.net, cur);
          detailRows.push(`<tr style="background:rgba(200,145,58,.06);">
            <td><strong>Customer payments</strong><div style="font-size:10px;color:var(--text3);">charge · payment</div></td>
            <td class="r">${salesAgg.count}</td>
            <td class="r">${_stripeFmtMoney(gross, '')}</td>
            <td class="r" style="color:var(--red);">${_stripeFmtMoney(fee, '')}</td>
            <td class="r"><strong>${_stripeFmtMoney(net, '')}</strong></td>
          </tr>`);
        }
        for (const t of otherTypes) {
          const r = types[t];
          const gross = _stripeMinorToMajor(r.gross, cur);
          const fee   = _stripeMinorToMajor(r.fee, cur);
          const net   = _stripeMinorToMajor(r.net, cur);
          detailRows.push(`<tr>
            <td>${_stripeFriendlyType(t)}<div style="font-size:10px;color:var(--text3);">${t}</div></td>
            <td class="r">${r.count}</td>
            <td class="r">${_stripeFmtMoney(gross, '')}</td>
            <td class="r" style="color:${fee !== 0 ? 'var(--red)' : 'var(--text3)'};">${fee !== 0 ? _stripeFmtMoney(fee, '') : '—'}</td>
            <td class="r">${_stripeFmtMoney(net, '')}</td>
          </tr>`);
        }

        const tot = byYearCurAll[year][cur];
        const tgross = _stripeMinorToMajor(tot.gross, cur);
        const tfee   = _stripeMinorToMajor(tot.fee, cur);
        const tnet   = _stripeMinorToMajor(tot.net, cur);
        const detailId = `stripe-detail-${year}-${cur}`;

        cards.push(`
          <div class="card" style="margin-bottom:1rem;padding:1.25rem 1.4rem;">
            <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:10px;">
              <div style="font-family:'Playfair Display',serif;font-size:22px;color:var(--text);">${year}</div>
              <span class="pill gold">${cur}</span>
            </div>
            ${headline}
            ${detailRows.length ? `
            <div style="margin-top:14px;">
              <button type="button" class="btn tag" onclick="(function(el){var d=document.getElementById('${detailId}');var open=d.style.display!=='none';d.style.display=open?'none':'';el.innerHTML=(open?'▸':'▾')+' '+el.dataset.label;})(this)" data-label="Show all balance activity (${detailRows.length} line ${detailRows.length === 1 ? 'item' : 'items'})" style="background:transparent;border:1px dashed var(--gold-line);">▸ Show all balance activity (${detailRows.length} line ${detailRows.length === 1 ? 'item' : 'items'})</button>
              <div id="${detailId}" style="display:none;margin-top:12px;">
                <div class="tbl-wrap" style="margin-bottom:8px;">
                  <table class="tbl">
                    <thead><tr><th>Activity</th><th class="r">Count</th><th class="r">Amount</th><th class="r">Stripe fee</th><th class="r">Net</th></tr></thead>
                    <tbody>${detailRows.join('')}
                      <tr style="border-top:2px solid var(--gold-line);font-weight:600;background:var(--cream2);">
                        <td>All activity total<div style="font-size:10px;color:var(--text3);font-weight:400;">matches Stripe Dashboard Balance report</div></td>
                        <td class="r">${tot.count}</td>
                        <td class="r">${_stripeFmtMoney(tgross, '')}</td>
                        <td class="r" style="color:var(--red);">${_stripeFmtMoney(tfee, '')}</td>
                        <td class="r">${_stripeFmtMoney(tnet, '')}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style="font-size:11px;color:var(--text3);line-height:1.5;">
                  <strong>Customer payments</strong> is the line that answers "what % does Stripe take from my sales".
                  The other rows (refunds, payouts, service fees, adjustments) are non-sale balance movements — included so the total reconciles with Stripe's Balance report.
                </div>
              </div>
            </div>` : ''}
          </div>`);
      }
    }

    wrap.innerHTML = cards.length
      ? cards.join('')
      : '<div class="card" style="text-align:center;color:var(--text3);padding:2rem;">No balance transactions found.</div>';
    wrap.style.display = '';
    statusEl.innerHTML = `<span style="color:var(--green);">✓ Done — ${count} balance transactions across ${years.length} year(s). Key saved for next time.</span>
      <br><span style="font-size:11px;color:var(--text3);">Verify against your Stripe Dashboard: <a href="https://dashboard.stripe.com/balance" target="_blank" rel="noopener" style="color:var(--gold);">Balance</a> · <a href="https://dashboard.stripe.com/reports/balance" target="_blank" rel="noopener" style="color:var(--gold);">Balance reports</a> (set the date range to a calendar year). Click "Download audit CSV" below for the raw per-transaction data.</span>`;
    document.getElementById('stripe-fees-download-btn').style.display = '';
    document.getElementById('stripe-fees-clear-btn').style.display = '';
    const hasLedgerData = window._stripeFeesLedgerData.length > 0;
    const insertBtn = document.getElementById('stripe-fees-insert-btn');
    if (insertBtn) insertBtn.style.display = hasLedgerData ? '' : 'none';
    const reconcileBtn = document.getElementById('stripe-fees-reconcile-btn');
    if (reconcileBtn) reconcileBtn.style.display = hasLedgerData ? '' : 'none';
    // Populate the year filter for ledger insertion (newest first, plus "All years").
    const yearSel = document.getElementById('stripe-fees-year');
    if (yearSel) {
      const ledgerYears = [...new Set(window._stripeFeesLedgerData.map(r => r.year))].sort((a, b) => b - a);
      yearSel.innerHTML = `<option value="all">All years</option>` + ledgerYears.map(y => `<option value="${y}">${y}</option>`).join('');
      yearSel.style.display = hasLedgerData ? '' : 'none';
    }
  } catch (e) {
    const msg = String(e.message || e);
    let hint = '';
    if (/Failed to fetch|NetworkError|CORS/i.test(msg)) {
      hint = '<br><span style="font-size:11px;">If this is a CORS error, run <code>scripts/stripe-fees-by-year.js</code> locally instead — your browser may be blocking direct Stripe API calls.</span>';
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
async function insertStripeFeesIntoLedger() {
  let rows = window._stripeFeesLedgerData || [];
  if (!rows.length) { showToast('Run "Fetch fees" first.', 'warn'); return; }

  // Optional year filter so the user can insert just one year at a time.
  const yearSel = document.getElementById('stripe-fees-year');
  const yearFilter = yearSel && yearSel.value !== 'all' ? Number(yearSel.value) : null;
  if (yearFilter != null) rows = rows.filter(r => r.year === yearFilter);

  if (!TAX_CENTER.businessExpenses) TAX_CENTER.businessExpenses = [];
  if (!TAX_CENTER.settings) TAX_CENTER.settings = {};
  const currentYear = new Date().getFullYear();

  // CAD rate for a year+currency: year-end rate for closed years, today's for the
  // current (still-accruing) year, with live then cached fallbacks.
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
  for (const r of rows) {
    const cur = r.cur.toUpperCase();
    const entryDate = r.year < currentYear ? `${r.year}-12-31` : today();
    const fxRate = await rateFor(cur, r.year);

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
