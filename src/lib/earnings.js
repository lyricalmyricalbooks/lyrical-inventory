// Pure artist-earnings / profit-sharing math.
// Dependency-free (no DOM, no Firestore) so the reconciliation logic can be
// imported anywhere and unit-tested in isolation.

// Effective revenue cap for a tier. A "break-even" tier caps at the book's
// production cost; otherwise it uses the tier's own revenueUpTo (or null = no cap).
export function tierEffectiveCap(tier, productionCost = 0) {
  const isBreakEvenTier = (tier.label || '').toLowerCase().includes('break');
  if (isBreakEvenTier && productionCost > 0) return productionCost;
  return Number.isFinite(tier.revenueUpTo) && tier.revenueUpTo > 0 ? tier.revenueUpTo : null;
}

// Compute artist earnings, payouts, and held-funds reconciliation for one book.
//   book  : { profitTiers, productionCost, ... }
//   state : { hist, revenue, artistPayouts }
// Returns null when no profit tiers are configured.
//
// Direct-to-artist sales (entries flagged `artistPending`) are folded into the
// tier walk so the money the artist collected and is holding is reflected:
// their share counts toward lifetime earnings, while the gross held and the
// publisher cut still owed are tracked separately for reconciliation.
export function calcArtistEarnings(book, state) {
  if (!book) return null;
  const s = state || {};
  const tiers = book.profitTiers && book.profitTiers.length > 0
    ? [...book.profitTiers].sort((a, b) => (a.revenueUpTo || Infinity) - (b.revenueUpTo || Infinity))
    : [];

  if (tiers.length === 0) return null;

  let totalArtistEarned = 0;
  let cumulativeRevenue = 0;
  let heldByArtistGross = 0;   // full cash collected directly, not yet forwarded
  let heldByArtistShare = 0;   // the artist's own share within that held cash
  const perTier = tiers.map(t => ({ tier: t, revenue: 0, artistEarned: 0 }));

  const capOf = (t) => tierEffectiveCap(t, book.productionCost);

  const sortedHist = [...(s.hist || [])].reverse()
    .filter(h => !h.voided && !h.gratuity && h.qty > 0 && h.price > 0);

  sortedHist.forEach(h => {
    const isHeld = !!h.artistPending;
    let revRemaining = h.qty * h.price;
    if (isHeld) heldByArtistGross += revRemaining;
    while (revRemaining > 0.001) {
      const tierIdx = tiers.findIndex(t => capOf(t) !== null && cumulativeRevenue < capOf(t));
      const idx = tierIdx === -1 ? tiers.length - 1 : tierIdx;
      const tier = tiers[idx];
      const tCap = capOf(tier);
      const isLastTier = idx === tiers.length - 1 || tCap === null;
      const capacity = isLastTier ? revRemaining : Math.min(revRemaining, tCap - cumulativeRevenue);
      const earned = capacity * (tier.artistPct / 100);
      totalArtistEarned += earned;
      if (isHeld) heldByArtistShare += earned;
      perTier[idx].revenue += capacity;
      perTier[idx].artistEarned += earned;
      cumulativeRevenue += capacity;
      revRemaining -= capacity;
    }
  });

  const payouts = (s.artistPayouts || []).filter(p => !p.voided);
  const totalPaidToArtist = payouts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  // The artist already holds heldByArtistGross in cash, so net it against what
  // they're owed. This can go negative — meaning the artist is holding more than
  // their share and owes the publisher the difference (the unforwarded cut).
  const owedToArtist = totalArtistEarned - totalPaidToArtist - heldByArtistGross;
  const publisherCutHeldByArtist = heldByArtistGross - heldByArtistShare;

  return {
    totalArtistEarned,
    cumulativeRevenue,
    // Publisher keeps their cut of every sale, including the cut the artist is
    // still holding (state.revenue excludes pending transfers, so add it back).
    netPublisher: ((s.revenue || 0) + heldByArtistGross) - totalArtistEarned,
    perTier,
    totalPaidToArtist,
    owedToArtist,
    heldByArtistGross,
    heldByArtistShare,
    publisherCutHeldByArtist,
    payouts
  };
}
