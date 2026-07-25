// Three-way merge for a book's synced state.
//
// Why this exists: _fbSave splits each book into per-part Firestore documents
// and used to write every dirty part with a plain setDoc — a whole-array
// replace. Each document carried a `ts`, but nothing ever read it back, so
// there was no divergence check at all. Two devices editing the same book while
// offline (the laptop at home and the phone at a book fair — the app's actual
// use case) both replayed their full local array on reconnect, and whichever
// synced second silently erased the other's sales. Nothing surfaced: no error,
// no conflict prompt, just a ledger quietly missing rows.
//
// The fix is a real three-way merge against the last-known-remote snapshot
// (the base), which _fbSave already tracks per part in window._fsHashes. Kept
// pure and DOM-/Firestore-free so the row-identity rules below — the fiddly
// part — can be unit-tested directly.

// Parts _fbSave breaks a state object into. Everything else is lumped into
// `metadata`.
//
// Order matters: stitchState() below emits these keys in this sequence, and
// _fbLoad/_fbWatch already stitch in exactly this order so that JSON.stringify
// output stays byte-comparable against the stored per-part hashes. Reordering
// would make every hash comparison report a false difference.
export const LIST_PARTS = [
  'hist', 'ledger', 'expenses', 'stores', 'artistTransfers', 'artistPayouts', 'doneIds',
];

// Parts whose rows carry a stable `id` (minted as Date.now() at creation).
export const ID_KEYED_PARTS = new Set([
  'ledger', 'expenses', 'stores', 'artistTransfers', 'artistPayouts',
]);

// Metadata fields recomputed from hist/ledger by recomputeAfters(). Merging
// them row-by-row is meaningless — they're outputs, not inputs — so the merge
// carries local values through and main.js recomputes once the merge lands.
export const DERIVED_METADATA_KEYS = new Set(['stock', 'sold', 'revenue', 'chStats']);

// Monotonic counters: never take "the other side's" value, take the highest so
// neither device reissues a number the other already used.
export const COUNTER_METADATA_KEYS = new Set(['invoiceSeq']);

// Key order varies between devices (spread order, JSON round-trips), so plain
// JSON.stringify would report false differences. Sort keys at every level.
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

const same = (a, b) => stableStringify(a) === stableStringify(b);

// Identity for a hist row. hist entries have no id field — they're
// {num, chan, qty, price, after, notes, date, ...} — so rows minted before this
// change can only be identified by content.
//
// `after` is deliberately excluded: it's a running balance recomputed by
// recomputeAfters(), so including it would make every row downstream of an
// insertion look like a different row. `sheetsId` is included and does most of
// the work for imported rows — Big Cartel and Stripe entries mint it
// deterministically from the order/charge number precisely so the same import
// on two devices produces the same row.
//
// `uid` is honoured if a row carries one, but rows are deliberately NOT stamped
// with one at creation. Imported rows already have deterministic cross-device
// identity via sheetsId, and stamping a random uid over that would turn one
// order imported on two devices into two rows — the opposite of the intent.
// Consequence: for two uid-less rows edited concurrently on both devices, the
// content key changes on both sides and the merge keeps both versions rather
// than reporting a conflict. Recording sales (the offline case that loses
// money) is handled exactly; concurrent edits of the same historical row are
// the rarer, softer failure.
function histContentKey(row) {
  if (!row || typeof row !== 'object') return 'v:' + stableStringify(row);
  if (row.uid) return 'uid:' + row.uid;
  return 'c:' + stableStringify({
    num: row.num ?? null,
    chan: row.chan ?? null,
    qty: row.qty ?? null,
    price: row.price ?? null,
    date: row.date ?? null,
    notes: row.notes ?? null,
    sheetsId: row.sheetsId ?? null,
  });
}

function baseKeyFor(part, row) {
  if (part === 'hist') return histContentKey(row);
  if (ID_KEYED_PARTS.has(part)) {
    if (row && typeof row === 'object' && row.id != null) return 'id:' + String(row.id);
    return 'v:' + stableStringify(row); // legacy/id-less row — fall back to content
  }
  return 'v:' + stableStringify(row); // doneIds and other scalar lists
}

// Multiset keying: two rows that are genuinely identical (say, two separate
// cash sales of one book at the same price on the same day, neither carrying an
// order number) must stay two rows. Suffixing each duplicate with its
// occurrence index keeps counts correct instead of collapsing them into one.
export function keyRows(part, rows) {
  const seen = new Map();
  return (rows || []).map(row => {
    const k = baseKeyFor(part, row);
    const n = seen.get(k) || 0;
    seen.set(k, n + 1);
    return n === 0 ? k : `${k}#${n}`;
  });
}

// A uid/id key names one specific row, so at most one can exist per side and
// "present on both sides" means the same row. A content key only says "a row
// that looks like this", so several may legitimately coexist and the sides have
// to be reconciled by counting. The two need different merge arithmetic.
function isStableKey(key) {
  return key.startsWith('uid:') || key.startsWith('id:');
}

function groupRows(part, rows) {
  const map = new Map();
  (rows || []).forEach(row => {
    const k = baseKeyFor(part, row);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  });
  return map;
}

// hist reads newest-first (entries are unshifted), so a row arriving from
// another device belongs at its date position rather than tacked on the end.
// Everything else is append-ordered and keeps that.
function insertRow(part, rows, row) {
  if (part !== 'hist') { rows.push(row); return; }
  const date = row && row.date;
  if (!date) { rows.push(row); return; }
  const at = rows.findIndex(r => String(r && r.date || '') < String(date));
  if (at === -1) rows.push(row); else rows.splice(at, 0, row);
}

/**
 * Three-way merge of one list part.
 *
 * base   last state both sides agreed on (the last snapshot we read from the
 *        server, tracked in window._fsHashes)
 * remote what the server holds now
 * local  what this device wants to write
 *
 * Add/remove are resolved against base so a row deleted on one side isn't
 * resurrected by the other. When both sides changed the same row, local wins
 * and the row is reported in `conflicts` — the write still goes through, but
 * the caller can tell the user something was overwritten rather than pretending
 * the merge was clean.
 */
export function mergeRows(part, base, remote, local) {
  const B = groupRows(part, base);
  const R = groupRows(part, remote);
  const L = groupRows(part, local);
  const conflicts = [];

  // Per key, work out which row versions survive and how many.
  const survivors = new Map();
  for (const key of new Set([...B.keys(), ...R.keys(), ...L.keys()])) {
    const b = B.get(key) || [];
    const r = R.get(key) || [];
    const l = L.get(key) || [];

    // Same row on both sides: keep whichever version actually changed, and only
    // call it a conflict when both moved away from base.
    const resolve = (lr, rr, br) => {
      if (!lr) return rr;
      if (!rr) return lr;
      if (same(lr, rr)) return lr;
      if (br && same(br, lr)) return rr;  // only remote edited
      if (br && same(br, rr)) return lr;  // only local edited
      conflicts.push({ part, key, local: lr, remote: rr });
      return lr;                          // both edited — local wins, but loudly
    };

    if (isStableKey(key)) {
      // Set semantics. A row known to base survives only while both sides still
      // have it; a row absent from base is an addition from whichever side has
      // it. Either way there is at most one.
      const keep = b.length ? (l.length > 0 && r.length > 0) : (l.length > 0 || r.length > 0);
      survivors.set(key, keep ? [resolve(l[0], r[0], b[0])] : []);
      continue;
    }

    // Multiset semantics for content-keyed (legacy, uid-less) rows: counts are
    // all we have to go on. Rows beyond the base count on each side are that
    // side's additions and both sides' additions must survive — otherwise two
    // devices each recording an indistinguishable cash sale would net one sale.
    const shared = Math.min(l.length, r.length, b.length);
    const survivingBase = Math.max(
      0,
      b.length - Math.max(0, b.length - l.length) - Math.max(0, b.length - r.length),
    );
    const total = survivingBase + Math.max(0, l.length - b.length) + Math.max(0, r.length - b.length);

    const candidates = [];
    for (let i = 0; i < shared; i++) candidates.push(resolve(l[i], r[i], b[i]));
    for (let i = shared; i < l.length; i++) candidates.push(l[i]);
    for (let i = shared; i < r.length; i++) candidates.push(r[i]);
    survivors.set(key, candidates.slice(0, total));
  }

  // Emit local rows first, in local order, so this device's view stays stable.
  const out = [];
  const used = new Map();
  const take = (row, insert) => {
    const key = baseKeyFor(part, row);
    const pool = survivors.get(key) || [];
    const n = used.get(key) || 0;
    if (n >= pool.length) return;          // budget spent — row didn't survive
    used.set(key, n + 1);
    if (insert) insertRow(part, out, pool[n]); else out.push(pool[n]);
  };
  (local || []).forEach(row => take(row, false));
  // Then whatever the other device added, placed by date for hist.
  (remote || []).forEach(row => take(row, true));

  return { rows: out, conflicts };
}

// metadata is the leftover object: derived counters, config strings, and the
// arrays that aren't split into their own documents (invoices, payoutRequests,
// openCall). Merge it key by key so an invoice added on one device doesn't
// vanish because the other device also touched an unrelated field.
export function mergeMetadata(base, remote, local) {
  const b = base && typeof base === 'object' ? base : {};
  const r = remote && typeof remote === 'object' ? remote : {};
  const l = local && typeof local === 'object' ? local : {};
  const out = {};
  const conflicts = [];

  for (const key of new Set([...Object.keys(b), ...Object.keys(r), ...Object.keys(l)])) {
    const hasR = Object.prototype.hasOwnProperty.call(r, key);
    const hasL = Object.prototype.hasOwnProperty.call(l, key);
    const hasB = Object.prototype.hasOwnProperty.call(b, key);

    if (DERIVED_METADATA_KEYS.has(key)) { if (hasL) out[key] = l[key]; continue; }

    if (COUNTER_METADATA_KEYS.has(key)) {
      const nums = [b[key], r[key], l[key]].map(Number).filter(Number.isFinite);
      if (nums.length) out[key] = Math.max(...nums);
      continue;
    }

    if (!hasR && !hasL) continue;                    // removed on both sides
    if (!hasR) { if (!hasB) out[key] = l[key]; continue; } // added locally / deleted remotely
    if (!hasL) { if (!hasB) out[key] = r[key]; continue; } // added remotely / deleted locally

    if (same(r[key], l[key])) { out[key] = l[key]; continue; }

    // Object-arrays carrying ids merge row-wise; anything else is a scalar
    // decision resolved against base.
    if (Array.isArray(r[key]) && Array.isArray(l[key])) {
      const listPart = ID_KEYED_PARTS.has(key) ? key : 'ledger'; // id-keyed semantics
      const looksIdKeyed = [...r[key], ...l[key]]
        .every(x => x && typeof x === 'object' && x.id != null);
      if (looksIdKeyed) {
        const m = mergeRows(listPart, Array.isArray(b[key]) ? b[key] : [], r[key], l[key]);
        out[key] = m.rows;
        m.conflicts.forEach(c => conflicts.push({ ...c, part: `metadata.${key}` }));
        continue;
      }
    }

    if (hasB && same(b[key], l[key])) { out[key] = r[key]; continue; } // only remote changed
    if (hasB && same(b[key], r[key])) { out[key] = l[key]; continue; } // only local changed
    out[key] = l[key];
    conflicts.push({ part: `metadata.${key}`, key, local: l[key], remote: r[key] });
  }

  return { value: out, conflicts };
}

// The split/stitch pair _fbSave, _fbLoad and _fbWatch all rely on. Kept here so
// the part list can't drift between the writer and the readers — a part missing
// from one side would silently stop syncing.
export function splitState(state) {
  const rest = { ...(state && typeof state === 'object' ? state : {}) };
  const parts = {};
  for (const key of LIST_PARTS) {
    parts[key] = Array.isArray(rest[key]) ? rest[key] : [];
    delete rest[key];
  }
  parts.metadata = rest;
  return parts;
}

export function stitchState(parts) {
  const p = parts || {};
  const out = { ...(p.metadata && typeof p.metadata === 'object' ? p.metadata : {}) };
  // Fixed key order so JSON.stringify is stable across split→stitch round trips
  // and hash comparisons don't report false differences.
  for (const key of LIST_PARTS) out[key] = Array.isArray(p[key]) ? p[key] : [];
  return out;
}

// Dispatch for a single part name, so callers don't repeat the branch.
export function mergePart(part, base, remote, local) {
  if (part === 'metadata') return mergeMetadata(base, remote, local);
  const { rows, conflicts } = mergeRows(
    part,
    Array.isArray(base) ? base : [],
    Array.isArray(remote) ? remote : [],
    Array.isArray(local) ? local : [],
  );
  return { value: rows, conflicts };
}
