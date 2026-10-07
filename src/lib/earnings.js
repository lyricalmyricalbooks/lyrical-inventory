// Pure artist-earnings / profit-sharing math.
// Dependency-free (no DOM, no Firestore) so the reconciliation logic can be
// imported anywhere and unit-tested in isolation.

import { roundCents } from './money.js';

// Effective revenue cap for a tier. A "break-even" tier caps at the book's
// production cost; otherwise it uses the tier's own revenueUpTo (or null = no cap).
export function tierEffectiveCap(tier, productionCost = 0) {
  const isBreakEvenTier = (tier.label || '').toLowerCase().includes('break');
  if (isBreakEvenTier && productionCost > 0) return productionCost;
  return Number.isFinite(tier.revenueUpTo) && tier.revenueUpTo > 0 ? tier.revenueUpTo : null;
}

// How much of each receivable (money the artist owes the shop) has been netted
// against royalties, keyed by receivable id.
//
// Derived from the payouts rather than stored on the receivable: a payout that
// netted a debt carries `offsets: [{ id, amount }]`, so deleting or voiding that
// payout reopens the debt on its own, with no second write to forget.
//
// Each debt can only ever absorb its own amount. Two devices netting the same
// debt while offline would otherwise count it twice and understate what the
// artist is owed; the surplus is ignored here and shows up honestly as extra
// cash paid. An offset pointing at a voided or missing debt counts for nothing,
// so forgiving a debt puts the royalty it had reduced back on what is owed.
export function appliedOffsets(payouts, receivables) {
  const raw = new Map();
  for (const p of (payouts || [])) {
    if (!p || p.voided || !Array.isArray(p.offsets)) continue;
    for (const o of p.offsets) {
      const amt = parseFloat(o && o.amount) || 0;
      if (!o || o.id == null || amt <= 0) continue;
      raw.set(String(o.id), roundCents((raw.get(String(o.id)) || 0) + amt));
    }
  }
  const applied = new Map();
  for (const r of (receivables || [])) {
    if (!r || r.voided) continue;
    const got = raw.get(String(r.id));
    if (got) applied.set(String(r.id), Math.min(got, roundCents(parseFloat(r.amount) || 0)));
  }
  return applied;
}

// Debt one payout cleared by netting (as recorded on it), for display. The
// balance math caps this per debt; a single row just reports what it says.
export function payoutNetted(p) {
  if (!p || !Array.isArray(p.offsets)) return 0;
  let n = 0;
  for (const o of p.offsets) n = roundCents(n + (parseFloat(o && o.amount) || 0));
  return n;
}

// Still-unsettled part of one receivable, given what has been netted so far.
export function receivableOpen(r, applied = 0) {
  if (!r || r.voided) return 0;
  const open = roundCents((parseFloat(r.amount) || 0) - (parseFloat(applied) || 0));
  return open > 0 ? open : 0;
}

export function sumOpenReceivables(list, payouts) {
  const applied = appliedOffsets(payouts, list);
  let total = 0;
  for (const r of (list || [])) total = roundCents(total + receivableOpen(r, applied.get(String(r.id))));
  return total;
}

// Work out ONE combined payment: royalties owed to the artist minus what they
// owe the shop, applied oldest receivable first. Pure — the caller records the
// cash payout with `offsets: applied` in a single state write.
//   cashToPay   : what to actually send (0 when the debt is as big or bigger)
//   offset      : total debt cleared by this payment
//   applied     : [{ id, amount }] per receivable, stored on the payout
//   debtLeft    : debt still open afterwards (carries to future royalties)
export function planNetPayout(owedToArtist, receivables, payouts) {
  const owed = Math.max(0, roundCents(Number(owedToArtist) || 0));
  const already = appliedOffsets(payouts, receivables);
  const open = (receivables || [])
    .filter(r => receivableOpen(r, already.get(String(r.id))) > 0)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let room = owed;
  let offset = 0;
  const applied = [];
  for (const r of open) {
    if (room <= 0) break;
    const take = Math.min(receivableOpen(r, already.get(String(r.id))), room);
    applied.push({ id: r.id, amount: roundCents(take) });
    offset = roundCents(offset + take);
    room = roundCents(room - take);
  }
  return {
    gross: owed,
    offset,
    cashToPay: roundCents(owed - offset),
    applied,
    debtLeft: roundCents(sumOpenReceivables(receivables, payouts) - offset)
  };
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

  // ⚡ Bolt Optimization: Replace O(N) array allocations (spread, reverse, filter) with a backward imperative loop
  const hist = s.hist || [];
  for (let i = hist.length - 1; i >= 0; i--) {
    const h = hist[i];
    if (h.voided || h.gratuity || !(h.qty > 0) || !(h.price > 0)) continue;

    const isHeld = !!h.artistPending;
    let revRemaining = roundCents(h.qty * h.price);
    if (isHeld) heldByArtistGross = roundCents(heldByArtistGross + revRemaining);
    while (revRemaining > 0.001) {
      const tierIdx = tiers.findIndex(t => capOf(t) !== null && cumulativeRevenue < capOf(t));
      const idx = tierIdx === -1 ? tiers.length - 1 : tierIdx;
      const tier = tiers[idx];
      const tCap = capOf(tier);
      const isLastTier = idx === tiers.length - 1 || tCap === null;
      const capacity = isLastTier ? revRemaining : Math.min(revRemaining, tCap - cumulativeRevenue);
      const earned = roundCents(capacity * (tier.artistPct / 100));
      totalArtistEarned = roundCents(totalArtistEarned + earned);
      if (isHeld) heldByArtistShare = roundCents(heldByArtistShare + earned);
      perTier[idx].revenue = roundCents(perTier[idx].revenue + capacity);
      perTier[idx].artistEarned = roundCents(perTier[idx].artistEarned + earned);
      cumulativeRevenue = roundCents(cumulativeRevenue + capacity);
      revRemaining = roundCents(revRemaining - capacity);
    }
  }

  // ⚡ Bolt Optimization: Loop Fusion
  // Combined .filter() and .reduce() into a single pass to eliminate intermediate array allocations
  const payouts = [];
  let sumPayouts = 0;
  for (const p of (s.artistPayouts || [])) {
    if (!p.voided) {
      payouts.push(p);
      sumPayouts = roundCents(sumPayouts + (parseFloat(p.amount) || 0));
    }
  }
  const totalPaidToArtist = sumPayouts;
  // By holding direct-sale cash the artist has effectively collected their OWN
  // share of those sales, so only that share reduces what the publisher owes.
  // The publisher's cut sitting in the held cash is a separate receivable
  // (publisherCutHeldByArtist) — it is NOT a payment to the artist, so it must
  // not reduce owedToArtist. owedToArtist still goes negative on genuine
  // overpayment (payouts exceeding net earnings).
  // Royalties settled by netting against what the artist owes (capped per debt).
  let totalOffset = 0;
  for (const v of appliedOffsets(payouts, s.artistReceivables).values()) totalOffset = roundCents(totalOffset + v);
  const owedToArtist = roundCents(totalArtistEarned - totalPaidToArtist - heldByArtistShare - totalOffset);
  const publisherCutHeldByArtist = roundCents(heldByArtistGross - heldByArtistShare);
  // Other money the artist owes the shop (wholesale copies, advances, manual
  // debts). Kept apart from owedToArtist so the royalty balance stays pure;
  // netPayable is what actually changes hands if the two are offset.
  const owedByArtist = sumOpenReceivables(s.artistReceivables, payouts);
  const netPayable = roundCents(owedToArtist - owedByArtist);

  return {
    owedByArtist,
    netPayable,
    totalOffset,
    totalArtistEarned,
    cumulativeRevenue,
    // Publisher keeps their cut of every sale, including the cut the artist is
    // still holding (state.revenue excludes pending transfers, so add it back).
    netPublisher: roundCents(((s.revenue || 0) + heldByArtistGross) - totalArtistEarned),
    perTier,
    totalPaidToArtist,
    owedToArtist,
    heldByArtistGross,
    heldByArtistShare,
    publisherCutHeldByArtist,
    payouts
  };
}

// Has enough been paid since a payout request was made to cover what it asked
// for?
//
// A request carries `paidAtRequest` — the lifetime paid-to-artist total at the
// moment it was sent — so "paid since" is a subtraction rather than a guess.
// The date comparison this replaced asked whether any payout was dated on or
// after the request's day, which marked a brand-new request settled the instant
// it was made on a day that already had a payout recorded earlier.
//
// Legacy requests written before that stamp existed have nothing to subtract
// from, so they fall back to the conservative reading: covered once the artist
// is owed nothing at all.
export function payoutRequestCovered(req, stats) {
  if (!req || !stats) return false;
  const asked = Number(req.amount) || 0;
  const paidBefore = Number(req.paidAtRequest);
  if (!Number.isFinite(paidBefore)) return (stats.owedToArtist ?? 0) <= 0.01;
  // Money netted against what the artist owes settles a request just as cash
  // does, and `paidAtRequest` is stamped on the same combined basis.
  const paidSince = roundCents((stats.totalPaidToArtist || 0) + (stats.totalOffset || 0) - paidBefore);
  // Same half-cent deadband describePayout uses, so a request is not left open
  // by a rounding crumb.
  return paidSince >= asked - 0.005;
}

// What a payout of `amountRaw` would do to the outstanding balance, worked out
// BEFORE it is written to the ledger. Pure and currency-format-free: the caller
// formats `amount` / `remaining` / `over` with its own money helper, so this
// stays testable without a DOM or a locale.
//
// The case that matters is `over`. Recording more than is owed is legal (an
// advance against future royalties) but it silently flips the panel's balance
// card into "⚠ Overpaid to artist" only AFTER saving — so the publisher had no
// way to notice the typo while it was still a keystroke away.
//
// tone:
//   'empty'   — nothing typed yet; no verdict to give
//   'invalid' — not a number, or zero/negative
//   'partial' — valid, and a balance survives it
//   'clears'  — valid, and it settles the balance to the cent
//   'over'    — valid, but larger than what is owed
export function describePayout(amountRaw, owed) {
  const owedNet = roundCents(Number(owed) || 0);
  const blank = { amount: 0, remaining: Math.max(0, owedNet), over: 0 };

  if (amountRaw === '' || amountRaw === null || amountRaw === undefined) {
    return { tone: 'empty', ...blank };
  }
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return { tone: 'invalid', ...blank };

  const paid = roundCents(amount);
  const left = roundCents(owedNet - paid);

  // Half-cent deadband on both sides: a balance of 0.004 is settled, not a
  // lingering debt, and paying 0.004 over is not an overpayment.
  if (left > 0.005) return { tone: 'partial', amount: paid, remaining: left, over: 0 };
  if (left < -0.005) return { tone: 'over', amount: paid, remaining: 0, over: roundCents(-left) };
  return { tone: 'clears', amount: paid, remaining: 0, over: 0 };
}
