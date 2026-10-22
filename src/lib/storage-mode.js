// Which storage a book's records live in.
//
// The app moved from the Realtime Database to Firestore once
// (performFullMigration), flagging `fs_mode_<id>` for every book that existed
// then. A book added afterwards was never flagged, so it kept saving to the old
// storage — where the website link can't read it, so the website never got its
// stock count. These rules decide when such a book is moved over by itself.

import { LIST_PARTS, insertRow, keyRows, splitState, stitchState } from './merge-state.js';

/**
 * What to do with one book when it loads.
 *   'skip'    nothing to do (not the publisher, the app isn't on Firestore yet,
 *             or the book is already there)
 *   'adopt'   move it: it has no Firestore copy, so its old-storage records
 *             are copied across, checked against the old copy (compareCopies)
 *             and only then is the book switched over (_fbAdoptBook)
 *   'kept'    both storages hold a copy (a book moved back by hand long ago):
 *             copying either way could lose the newer one, so leave it
 *   'unknown' the Firestore copy couldn't be checked (offline): try next time
 */
export function adoptDecision({ publisher, global, flagged, hasFirestoreData }) {
  if (!publisher || !global || flagged) return 'skip';
  if (hasFirestoreData == null) return 'unknown';
  return hasFirestoreData ? 'kept' : 'adopt';
}

/**
 * True when another device has moved this book to Firestore since this device
 * loaded its flags: a save here must not go to the old storage any more.
 */
export function movedElsewhere({ global, flaggedHere, serverFlags, bookId }) {
  return !!global && !flaggedHere && !!serverFlags && serverFlags[`fs_mode_${bookId}`] === true;
}

// The parts compared record by record. `doneIds` is a list of ticked-off ids
// that changes as work is done, so a difference there is not a missing record.
const RECORD_PARTS = LIST_PARTS.filter(part => part !== 'doneIds');

/**
 * Compare a book's old-storage copy with its new-storage copy.
 *   identical  every part (records and the book's own details) is the same —
 *              what a just-made copy must be before the book is switched over
 *   ok         every record in the old copy is also in the new one (the new one
 *              may hold more: sales recorded since the move, or later edits of
 *              the same record)
 *   onlyInOld  [{ part, row }] records the old copy has and the new one lacks.
 *              Records are matched the way the save merge matches them
 *              (keyRows), so two identical cash sales stay two.
 */
export function compareCopies(oldState, newState) {
  const oldParts = splitState(oldState || {});
  const newParts = splitState(newState || {});
  const onlyInOld = [];
  let oldRows = 0;
  let newRows = 0;
  for (const part of RECORD_PARTS) {
    const before = oldParts[part];
    const after = newParts[part];
    oldRows += before.length;
    newRows += after.length;
    const have = new Set(keyRows(part, after));
    keyRows(part, before).forEach((key, i) => { if (!have.has(key)) onlyInOld.push({ part, row: before[i] }); });
  }
  const identical = JSON.stringify(stitchState(oldParts)) === JSON.stringify(stitchState(newParts));
  return { identical, ok: onlyInOld.length === 0, onlyInOld, oldRows, newRows };
}

// What names one sale even after it is edited: its own id, the order it was
// imported from, or a typed order number on its day. A cash sale with none of
// these can only be told apart by everything it says, so an edit to it can't
// be recognised here.
function saleIdentity(row) {
  if (!row || typeof row !== 'object') return '';
  if (row.uid) return 'uid:' + row.uid;
  if (row.sheetsId) return 'sheet:' + row.sheetsId;
  const num = row.num == null ? '' : String(row.num).trim();
  return num ? `num:${num}|${row.date ?? ''}` : '';
}

/**
 * The records the storage check should show: compareCopies' onlyInOld, less
 * the old copy's version of a sale that was edited after the move. The old
 * storage stopped changing when the book moved, so a sale edited since (a
 * price, a note, a quantity) looks like a different sale there. When the new
 * copy has a sale with the same identity (saleIdentity) that the old copy
 * doesn't, that is the edited one: copying the old version over would add the
 * sale twice. Counted one for one, so two edited sales of one order need two.
 */
export function missingFromNew(oldState, newState) {
  const { onlyInOld } = compareCopies(oldState, newState);
  if (!onlyInOld.some(m => m.part === 'hist')) return onlyInOld;
  const oldHist = splitState(oldState || {}).hist;
  const newHist = splitState(newState || {}).hist;
  const oldKeys = new Set(keyRows('hist', oldHist));
  const edited = new Map();
  keyRows('hist', newHist).forEach((key, i) => {
    if (oldKeys.has(key)) return;
    const id = saleIdentity(newHist[i]);
    if (id) edited.set(id, (edited.get(id) || 0) + 1);
  });
  return onlyInOld.filter(({ part, row }) => {
    if (part !== 'hist') return true;
    const id = saleIdentity(row);
    const n = id ? edited.get(id) || 0 : 0;
    if (!n) return true;
    edited.set(id, n - 1);
    return false;
  });
}

/**
 * Put records the old copy has back into a book's state (in place): sales go
 * to their date position, everything else on the end — the same placement the
 * save merge uses. Only adds; nothing in `state` is changed or removed.
 * Returns how many were added.
 */
export function restoreRecords(state, onlyInOld = []) {
  let added = 0;
  for (const { part, row } of onlyInOld || []) {
    if (!part || row == null) continue;
    if (!Array.isArray(state[part])) state[part] = [];
    insertRow(part, state[part], JSON.parse(JSON.stringify(row)));
    added += 1;
  }
  return added;
}
