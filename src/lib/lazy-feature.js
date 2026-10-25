// Load a screen's module the first time it's needed instead of in the first
// download.
//
// `load` is a `() => import('./feature.js')` — Vite turns that into its own
// file. `names` are the module's functions that inline handlers in the page
// reach on `window` (onclick="ocAdd()"). Until the module arrives, each of
// those names is a stub that loads it and then calls through; once it has
// arrived the stubs are swapped for the real functions, so later clicks run
// synchronously exactly as before.
//
//   const openCall = lazyFeature(() => import('./opencall.js'), ['ocAdd', …]);
//   openCall.stubs            → { ocAdd: stub, … } to register on window
//   await openCall.get()      → the module (loaded once, shared promise)
//   openCall.module()         → the module once it has arrived, else null —
//                               for "repaint it if it's showing" calls that
//                               must not pull the file in just to do nothing
//   openCall.call('renderOpenCall', …args)
//                             → runs it now if the module has arrived (so the
//                               screen paints in the same tick, as it did when
//                               it was bundled), otherwise loads it first and
//                               returns a promise of the result
//
// If the file can't be fetched (offline before it was ever saved, or a tab
// left open across a deploy), `onError` is told and the next call tries again.
// `call` and the stubs then resolve to undefined rather than rejecting, so a
// tap or a start-up step doesn't leave an unhandled error behind; `get` still
// rejects, for callers that need to know.
export function lazyFeature(load, names, {
  target = typeof window === 'undefined' ? null : window,
  onError = null,
} = {}) {
  let pending = null;
  let mod = null;

  function get() {
    if (!pending) {
      pending = load().then(m => {
        mod = m;
        if (target) {
          for (const name of names) {
            if (typeof m[name] === 'function') target[name] = m[name];
          }
        }
        return m;
      }, err => {
        // A failed fetch must not stick: the next tap tries again.
        pending = null;
        if (onError) onError(err);
        throw err;
      });
    }
    return pending;
  }

  function call(name, ...args) {
    if (mod) return mod[name](...args);
    return get().then(m => m[name](...args), () => undefined);
  }

  const stubs = {};
  for (const name of names) {
    stubs[name] = (...args) => call(name, ...args);
  }

  return { get, call, stubs, module: () => mod };
}
