// Which Stripe payments the publisher set aside as "not an inventory sale",
// shared by every device she uses.
//
// WHY THIS EXISTS
// The Stripe worklist remembered a Dismiss only in the browser it was pressed
// in. A payment dismissed on the laptop, because the sale had already been
// typed in by hand, came back on the phone looking unrecorded, and pressing
// Record there counted the sale twice and took two copies off the shelf.
//
// HOW IT SYNCS
// The choices live in the Tax Centre document (publisher-only, already where
// the Stripe key is kept) as a list that only ever grows, merged as a union
// across devices (UNION_METADATA_KEYS in merge-state.js). Each entry is one
// decision with its time: "d|<charge>|<ms>" set aside, "u|<charge>|<ms>"
// brought back. The latest decision for a charge wins, so an Undo on one
// device is not undone by the other device's older copy.

/** The Tax Centre field that holds the list. */
export const STRIPE_DISMISSALS_KEY = 'stripeDismissals';

/** Decisions older than this are dropped; Stripe's worklist never reaches back that far. */
export const DISMISSAL_KEEP_MS = 400 * 86400000;

const ENTRY = /^([du])\|([A-Za-z0-9_-]{1,120})\|(\d{1,16})$/;

function parse(entry) {
  const match = ENTRY.exec(String(entry || ''));
  return match ? { kind: match[1], id: match[2], at: Number(match[3]) } : null;
}

/**
 * The latest decision for every charge in the list.
 * Returns { dismissed: Set, undone: Set } of charge ids.
 */
export function dismissalState(entries = []) {
  const latest = new Map();
  (Array.isArray(entries) ? entries : []).forEach(raw => {
    const entry = parse(raw);
    if (!entry) return;
    const prev = latest.get(entry.id);
    // On a tie, set aside wins: keeping a payment out of the list is the safe side.
    if (!prev || entry.at > prev.at || (entry.at === prev.at && entry.kind === 'd')) latest.set(entry.id, entry);
  });
  const dismissed = new Set();
  const undone = new Set();
  latest.forEach(entry => (entry.kind === 'd' ? dismissed : undone).add(entry.id));
  return { dismissed, undone };
}

/**
 * The list with these decisions added, and anything older than `keepMs`
 * dropped. `changes` is [{ id, dismissed: true|false }]. Returns the same
 * array when nothing changed, so a caller can skip saving.
 */
export function withDismissals(entries = [], changes = [], now = Date.now(), keepMs = DISMISSAL_KEEP_MS) {
  const list = Array.isArray(entries) ? entries : [];
  const { dismissed } = dismissalState(list);
  const added = [];
  (Array.isArray(changes) ? changes : []).forEach(change => {
    const id = String(change?.id || '');
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) return;
    if (!!change.dismissed === dismissed.has(id)) return;
    added.push(`${change.dismissed ? 'd' : 'u'}|${id}|${Math.floor(now)}`);
    if (change.dismissed) dismissed.add(id); else dismissed.delete(id);
  });
  const kept = list.filter(raw => {
    const entry = parse(raw);
    return entry && now - entry.at <= keepMs;
  });
  if (!added.length && kept.length === list.length) return list;
  return [...kept, ...added];
}

/**
 * This device's remembered dismissals brought in line with the shared list:
 * a charge set aside elsewhere is set aside here, and one brought back
 * elsewhere is brought back here. Returns a new { [chargeId]: true } map.
 */
export function mergeDismissedMap(local = {}, entries = []) {
  const { dismissed, undone } = dismissalState(entries);
  const out = {};
  Object.keys(local || {}).forEach(id => { if (local[id] && !undone.has(id)) out[id] = local[id]; });
  dismissed.forEach(id => { out[id] = true; });
  return out;
}
