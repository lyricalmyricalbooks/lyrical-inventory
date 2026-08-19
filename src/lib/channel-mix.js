/**
 * "Sales by channel" — the dashboard's answer to "where is the money actually
 * coming from?"
 *
 * The table it feeds used to render whatever order the channels happened to be
 * created in, with no total under the columns and no sense of proportion. That
 * makes the one question it exists to answer ("is the website carrying this
 * book, or the fairs?") a mental-arithmetic exercise on every visit.
 *
 * This is the shaping step only — it reads the already-aggregated `chStats`
 * rollup and never recomputes it. `chStats` is maintained by the sale/refund
 * paths in main.js and stays the single source of truth.
 */

/**
 * Shape a book's `chStats` rollup ({ [channel]: { txns, units, revenue } })
 * into display rows plus the footer totals.
 *
 * Rows come back biggest-earner-first, each carrying:
 *   - `share`  — percent of total revenue (what the number means)
 *   - `barPct` — width relative to the top channel (what the bar draws)
 *
 * Those two differ on purpose: sharing the scale with the leader keeps a small
 * channel visibly small instead of stretching it to fill the cell.
 *
 * @param {Record<string, {txns?:number, units?:number, revenue?:number}>|null|undefined} chStats
 * @returns {{rows: Array<object>, totals: object}}
 */
export function channelMixRows(chStats) {
  const rows = [];
  let txns = 0;
  let units = 0;
  let revenue = 0;

  for (const [chan, raw] of Object.entries(chStats || {})) {
    if (!raw || typeof raw !== 'object') continue;
    // A single malformed rollup entry must not turn the footer into "NaN".
    const t = Number.isFinite(Number(raw.txns)) ? Number(raw.txns) : 0;
    const u = Number.isFinite(Number(raw.units)) ? Number(raw.units) : 0;
    const r = Number.isFinite(Number(raw.revenue)) ? Number(raw.revenue) : 0;
    rows.push({ chan, txns: t, units: u, revenue: r, share: 0, barPct: 0 });
    txns += t;
    units += u;
    revenue += r;
  }

  // Biggest earner first. Units and then name break ties so the order is stable
  // across renders rather than following the order channels were first used.
  rows.sort((a, b) => (
    b.revenue - a.revenue
    || b.units - a.units
    || (a.chan < b.chan ? -1 : a.chan > b.chan ? 1 : 0)
  ));

  let maxRevenue = 0;
  for (const row of rows) {
    if (row.revenue > maxRevenue) maxRevenue = row.revenue;
  }

  let earningChannels = 0;
  for (const row of rows) {
    if (row.revenue > 0) earningChannels += 1;
    row.share = revenue > 0 ? (row.revenue / revenue) * 100 : 0;
    // Clamped so a refund-heavy channel (negative revenue) draws an empty bar
    // rather than a negative width the browser would silently discard.
    row.barPct = maxRevenue > 0 ? Math.max(0, Math.min(100, (row.revenue / maxRevenue) * 100)) : 0;
  }

  const leader = rows.length && rows[0].revenue > 0 ? rows[0] : null;

  return {
    rows,
    totals: {
      txns,
      units,
      revenue,
      channels: rows.length,
      earningChannels,
      leader: leader ? leader.chan : null,
      leaderShare: leader ? leader.share : 0,
    },
  };
}
