// Pure inventory math — no DOM, no Firestore — so on-hand reconciliation can be
// imported anywhere and unit-tested in isolation.

// Derive on-hand stock purely from a book's records: everything ever printed,
// minus direct sales, minus books currently out on consignment, plus any good
// returns that came back. Consignment SALES are excluded — those copies already
// left inventory as a Shipment, so counting them again would double-subtract.
// (There is no "restock" action in the app, so maxPrint is the only baseline.)
export function deriveOnHand(s, book) {
  if (!book || !Number.isFinite(book.maxPrint)) {
    return (s && s.stock) || 0;
  }
  let stock = book.maxPrint;
  for (const h of ((s && s.hist) || [])) {
    if (h.voided || h.consignmentLink) continue;
    stock -= (h.qty || 0);
  }
  for (const e of ((s && s.ledger) || [])) {
    if (e.voided) continue;
    if (e.type === 'Shipment') stock -= (e.qty || 0);
    else if (e.type === 'Return' && e.status === 'restocked') stock += (e.qty || 0);
  }
  return Math.max(0, stock);
}

// Full accounting of a print run: where every copy is right now. By identity
// printed === onHand + directSold + consignSold + onConsignment + writtenOff, so
// `unaccounted` is normally 0 — a non-zero value flags drift the records can't
// explain (e.g. maxPrint was edited after sales began).
export function inventoryBreakdown(s, book) {
  const printed = (book && Number.isFinite(book.maxPrint)) ? book.maxPrint : ((s && s.stock) || 0);
  let directSold = 0, consignSold = 0, gratuities = 0;
  for (const h of ((s && s.hist) || [])) {
    if (h.voided) continue;
    if (h.gratuity) gratuities += (h.qty || 0);
    else if (h.consignmentLink) consignSold += (h.qty || 0); // sold through a store
    else directSold += (h.qty || 0);                    // website / manual / etc.
  }
  let shipped = 0, restocked = 0, writtenOff = 0;
  for (const e of ((s && s.ledger) || [])) {
    if (e.voided) continue;
    if (e.type === 'Shipment') shipped += (e.qty || 0);
    else if (e.type === 'Return') {
      if (e.status === 'restocked') restocked += (e.qty || 0);
      else writtenOff += (e.qty || 0);
    }
  }
  const onConsignment = Math.max(0, shipped - consignSold - restocked - writtenOff);
  const onHand = deriveOnHand(s, book);
  const accounted = onHand + directSold + consignSold + gratuities + onConsignment + writtenOff;
  return { printed, onHand, directSold, consignSold, gratuities, onConsignment, writtenOff, unaccounted: printed - accounted };
}

// Stock change a single timeline row applies to on-hand. Negative = books left
// (a direct sale or a consignment shipment); positive = a good return came back.
// Voided rows and consignment SALES are no-ops: the latter's copies already left
// as a Shipment, so the sale itself doesn't move your on-hand again.
function rowStockDelta(r) {
  if (r.type === 'consign') {
    const e = r.e;
    if (e.voided) return 0;
    if (e.type === 'Shipment') return -(e.qty || 0);
    if (e.type === 'Return' && e.status === 'restocked') return (e.qty || 0);
    return 0;
  }
  const h = r.h;
  if (h.voided || h.consignmentLink) return 0;
  return -(h.qty || 0);
}

// Build the full stock timeline for the History view: every direct sale (from
// history) plus every consignment shipment/return (from the ledger), sorted
// newest→oldest, each tagged with a running `_after` = on-hand immediately after
// that event. The walk starts at the print run (maxPrint) and ends at the
// records-true on-hand, so the column always reconciles the whole journey from
// the full print run down to now — no book silently disappears between them.
// Returned rows are descriptors: { type:'hist', h, i } or { type:'consign', e }.
export function buildOrderTimeline(s, book) {
  const rowDate = r => r.type === 'consign' ? (r.e.date || '') : (r.h.date || '');
  const timeline = ((s && s.hist) || []).map((h, i) => ({ type: 'hist', h, i }));
  for (const e of ((s && s.ledger) || [])) {
    if (e.type === 'Shipment' || e.type === 'Return') timeline.push({ type: 'consign', e });
  }
  // Keep insertion order as a stable tiebreaker so same-day rows don't shuffle.
  timeline.forEach((r, idx) => { r._ord = idx; });
  timeline.sort((a, b) => {
    const da = rowDate(a), db = rowDate(b);
    if (da !== db) return db < da ? -1 : 1;
    return a._ord - b._ord;
  });
  let running = (book && Number.isFinite(book.maxPrint)) ? book.maxPrint : ((s && s.stock) || 0);
  for (let k = timeline.length - 1; k >= 0; k--) {
    running += rowStockDelta(timeline[k]);
    timeline[k]._after = running;
  }
  return timeline;
}

// Deduplicate direct/unnamed sales that are actually duplicates of consignment sales.
export function deduplicateDirectConsignmentSales(s) {
  if (!s || !Array.isArray(s.hist)) return;
  const consignmentSales = s.hist.filter(h => h.consignmentLink && !h.voided);
  if (consignmentSales.length === 0) return;

  const toRemove = new Set();
  for (const c of consignmentSales) {
    const dIdx = s.hist.findIndex((h, idx) => {
      if (h.consignmentLink || h.gratuity || h.voided) return false;
      if (toRemove.has(idx)) return false;
      const chan = (h.chan && h.chan.trim()) ? h.chan : 'Direct';
      if (chan !== 'Direct') return false;
      
      const qtyMatch = h.qty === c.qty;
      const dateMatch = h.date === c.date;
      const priceMatch = Math.abs((h.price || 0) - (c.price || 0)) < 0.01;
      
      return qtyMatch && dateMatch && priceMatch;
    });

    if (dIdx !== -1) {
      toRemove.add(dIdx);
    }
  }

  if (toRemove.size > 0) {
    s.hist = s.hist.filter((_, idx) => !toRemove.has(idx));
  }
}

// Recalculate book stats (sold, revenue, chStats) purely from the current s.hist.
export function recalculateBookStatsFromHistory(s) {
  s.sold = 0;
  s.revenue = 0;
  s.chStats = {};

  (s.hist || []).forEach(h => {
    if (h.voided) return;
    
    const chan = h.chan || 'Manual';
    if (!s.chStats[chan]) s.chStats[chan] = { txns: 0, units: 0, revenue: 0 };
    s.chStats[chan].txns++;
    s.chStats[chan].units += (h.qty || 0);
    s.chStats[chan].revenue += (h.qty || 0) * (h.price || 0);

    if (h.gratuity) return;
    s.sold += (h.qty || 0);
    s.revenue += (h.qty || 0) * (h.price || 0);
  });
}

