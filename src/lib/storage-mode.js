// Which storage a book's records live in.
//
// The app moved from the Realtime Database to Firestore once
// (performFullMigration), flagging `fs_mode_<id>` for every book that existed
// then. A book added afterwards was never flagged, so it kept saving to the old
// storage — where the website link can't read it, so the website never got its
// stock count. These rules decide when such a book is moved over by itself.

/**
 * What to do with one book when it loads.
 *   'skip'    nothing to do (not the publisher, the app isn't on Firestore yet,
 *             or the book is already there)
 *   'adopt'   flag it for Firestore: it has no Firestore copy, so the load's
 *             self-heal copies the old-storage records across
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
