// ── BACK GESTURE CLOSES THE POP-UP ON TOP ───────────────────────────────
//
// On an Android phone the back gesture (or button) used to leave the page, or
// close the installed app, with a pop-up still open and its typing unsaved.
// A CloseWatcher is the browser's own hook for "the user asked to close
// something": while one is armed, back goes to it instead of to the page's
// history. Browsers without it (Safari, Firefox) keep today's behaviour, and
// iPhones have no back button to press.
//
// At most one watcher is held at a time. With none held, a new one always
// gets its own turn, so re-arming after "Keep editing", or for the pop-up
// underneath, works without the person tapping anything first.
//
// This is a LEAF module: the host passes in how to find the pop-up on top and
// how to ask it to close (the same path as Esc, unsaved-changes check included).

/**
 * @param {{ getTop: () => (string|null), requestClose: (id: string) => any, win?: Window }} opts
 * @returns {{ sync: () => void }}
 */
export function installBackClose({ getTop, requestClose, win = globalThis.window } = {}) {
  const Watcher = win && win.CloseWatcher;
  if (typeof Watcher !== 'function' || typeof getTop !== 'function' || typeof requestClose !== 'function') {
    return { sync() {} };
  }
  let watcher = null;

  // Called whenever a pop-up opens or closes. While back is being handled,
  // the pop-ups it opens (the "Discard your changes?" question) arm their own
  // watcher here, so back answers that question too.
  function sync() {
    const top = getTop();
    if (top && !watcher) {
      try { watcher = new Watcher(); } catch { watcher = null; return; }
      watcher.onclose = onBack;
    } else if (!top && watcher) {
      const w = watcher;
      watcher = null;
      try { w.destroy(); } catch { /* already gone */ }
    }
  }

  async function onBack() {
    // The browser has used this watcher up; the next one is armed by sync().
    watcher = null;
    const top = getTop();
    if (!top) return;
    try {
      await requestClose(top);
    } catch {
      /* a failed close leaves the pop-up open; sync() re-arms for it */
    }
    sync();
  }

  return { sync };
}
