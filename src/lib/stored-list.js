// A list saved in this browser's localStorage, read back safely.
//
// A saved value can be anything by the time it is read: truncated, corrupt,
// hand-edited, or written as something other than a list by an older version
// of the app. Every one of those reads as an empty list here, so a caller can
// always filter, map or spread the result. Storage that is blocked outright
// (private mode, a locked-down browser) reads as empty too.
export function readStoredList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (_) { return []; }
}
