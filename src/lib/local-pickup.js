// Orders a customer collects in person never get a shipping label, so without
// help they sit on "Needs link" in the shipping ledger forever. When the
// checkout's shipping option names a pick-up, the order is recognised as one
// automatically; the owner can still say otherwise, and that choice wins.

const PICKUP_METHOD = /\bpick[\s-]*up\b|\bcollect(?:ion)?\s+in\s+person\b|\bin[\s-]*person\s+(?:pick|collect)/i;

/** True when a checkout shipping-option name describes a local pick-up. */
export function looksLikeLocalPickup(shippingMethod) {
  return PICKUP_METHOD.test(String(shippingMethod || ''));
}

/**
 * Returns the order as the shipping hub should see it. An order whose shipping
 * option says pick-up is treated as a $0-postage pick-up — the same shape a
 * manual "Pick-up" click saves — unless the owner already set postage by hand,
 * a label is linked to it, or they said it was not a pick-up.
 */
export function withAutoLocalPickup(order, hasLinkedPostage = false) {
  if (!order || order.localPickup || order.pickupDeclined) return order;
  if (order.manualPostagePaid || hasLinkedPostage) return order;
  if (!looksLikeLocalPickup(order.shippingMethod)) return order;
  return { ...order, localPickup: true, autoLocalPickup: true, manualPostagePaid: true, postagePaid: 0 };
}
