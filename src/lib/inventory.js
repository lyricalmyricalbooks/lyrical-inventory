// Pure inventory math — no DOM, no Firestore — so on-hand reconciliation can be
// imported anywhere and unit-tested in isolation.

// Derive on-hand stock purely from a book's records: everything ever printed,
// minus direct sales, minus books currently out on consignment, plus any good
// returns that came back. Consignment SALES are excluded — those copies already
// left inventory as a Shipment, so counting them again would double-subtract.
// (There is no "restock" action in the app, so maxPrint is the only baseline.)
export function deriveOnHand(s, book) {
  let stock = (book && Number.isFinite(book.maxPrint)) ? book.maxPrint : ((s && s.stock) || 0);
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
