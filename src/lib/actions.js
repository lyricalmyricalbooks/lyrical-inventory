// Buttons that name an action instead of carrying code.
//
//   <button data-action="intel.apply" data-batch="b1">Make this change</button>
//   registerActions({ 'intel.apply': (el) => applyIntelProposal(el.dataset.batch) });
//
// One listener on the document runs the named action for whatever was clicked,
// changed or typed into, however recently that markup was drawn:
//
//   data-action="name"     on click
//   data-on-change="name"  on change (checkboxes, selects)
//   data-on-input="name"   on input (typing)
//
// Why not an inline click handler with the value pasted into its call: that
// attribute is code the browser compiles from the page. Anything interpolated
// into it — a book title, an order id, a suggestion the assistant wrote — is
// one stray quote away from running as script, and escaping it for HTML doesn't help, because the browser decodes
// the HTML before it runs the JS. Values here travel in data-* attributes,
// which are only ever read as text. Once no inline handlers are left, the page
// can also ask the browser to refuse inline script altogether.
//
// A handler gets (element, event). Names are global, so prefix them with the
// screen (`intel.`, `bc.`); registering a name twice is an error.

const registry = new Map();
const EVENTS = { click: 'action', change: 'onChange', input: 'onInput' };
let wired = false;

/** @param {Record<string, (el: HTMLElement, event: Event) => unknown>} handlers */
export function registerActions(handlers) {
  for (const [name, fn] of Object.entries(handlers)) {
    if (registry.has(name)) throw new Error(`Action "${name}" is already registered`);
    if (typeof fn !== 'function') throw new Error(`Action "${name}" is not a function`);
    registry.set(name, fn);
  }
  wire();
}

/** For tests: the names currently registered. */
export function registeredActions() {
  return [...registry.keys()];
}

function wire() {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  for (const type of Object.keys(EVENTS)) document.addEventListener(type, run);
}

/** @param {Event} event */
function run(event) {
  const key = EVENTS[event.type];
  const attr = key === 'action' ? 'data-action' : key === 'onChange' ? 'data-on-change' : 'data-on-input';
  const target = /** @type {Element | null} */ (event.target instanceof Element ? event.target : null);
  const el = /** @type {HTMLElement | null} */ (target && target.closest(`[${attr}]`));
  if (!el) return;
  const name = el.dataset[key];
  const fn = registry.get(name);
  if (!fn) {
    console.warn(`[actions] nothing registered for "${name}"`);
    return;
  }
  // An async handler's failure is reported rather than left unhandled.
  try {
    const out = fn(el, event);
    if (out && typeof out.then === 'function') out.then(null, err => console.error(`[actions] ${name} failed`, err));
  } catch (err) {
    console.error(`[actions] ${name} failed`, err);
  }
}
