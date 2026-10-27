// Presentation adapters only: retain the original cells, amounts and handlers.
// The opt-in list deliberately excludes editable/import tables and complex headers.
const RECORDS = {
  'cust-body': { lead: 0, summary: [1, 5, 8] },
  'ml-body': { lead: 0, summary: [1, 4] },
  // All books → consignment: Book leads; Store, Returned, Outstanding and Status show on the card.
  // Returned sits before Outstanding so Sent = Sold + Returned + Outstanding reads down the card.
  'all-con-body': { lead: 0, summary: [1, 4, 5, 7] },
  'dash-con-body': { lead: 0, summary: [4, 5] },
  // Sales by channel on the Dashboard: Channel leads, Units / Revenue / Share
  // carry the card, Transactions folds away. Its Revenue column was cut off.
  'ch-body': { lead: 0, summary: [2, 3, 4] },
  // Tax Centre: category and trip totals were cut off at the right edge.
  'tc-category-body': { lead: 0, summary: [1, 3] },
  'tc-trip-body': { lead: 0, summary: [1, 2] },
  // Artist expenses on the book dashboard: its Reference and Amount columns
  // used to be cut off inside the banner on a phone.
  'd-exp-body': { lead: 1, summary: [0, 4], card: true },
  'ledger-body': { lead: 1, summary: [0, 2, 5, 7] },
  // Order History: the summary is order #, channel, total, date and the action.
  // Qty moves behind the disclosure with the unit price and stock after. `card`
  // makes a tap anywhere on the order's card open it, not just the small button.
  'hist-body': { lead: 1, summary: [0, 4, 8, 9], card: true },
  // Expenses: description leads, with the amount on the top line and date and receipt
  // beneath. Category, reference, CAD value and reimbursement fold behind Details.
  // '' is the bulk-select box (author view) and the actions cell; the CSS keeps the
  // actions behind Details unless the row awaits approval.
  'exp-body': { lead: 'Description', summary: ['Date', 'Receipt', 'Amount', ''] },
  'tc-ledger-body': { lead: 2, summary: [0, 4, 6, 7] },
  'tc-recurring-body': { lead: 0, summary: [2, 4, 5, 6] },
  'bc-orders-list': { lead: 0, summary: [1, 2, 6, 7, 8] },
  'sheets-log-body': { lead: 0, summary: [1, 4] },
  // Payments: reconciled list. Customer leads; Date, Amount, Status and Undo
  // stay visible on the card, so the Undo button never scrolls off-screen.
  'recon-matched-body': { lead: 2, summary: [0, 1, 3, 4] },
  'system-backup-list': { lead: 0, summary: [1, 2, 3] },
  // Pop-up windows sit outside the page panels but get the same record cards.
  'tc-trip-detail-body': { lead: 1, summary: [0, 5, 6] },
  'tc-cat-detail-body': { lead: 2, summary: [0, 5, 7] },
  'iv-modal-table-body': { lead: 0, summary: [3, 6] },
  'pos-confirm-items': { lead: 0, summary: [1, 2] },
};
let detailId = 0;

// A grouped heading row (All books → consignment, "Group by book") opens with
// one cell spanning the first columns, then the book's totals. Left alone its
// numbers fell down the screen as bare figures; each total now carries its
// column's name and the row reads as a compact summary strip. A single cell
// spanning the whole row is a message, not a heading, and stays as it is.
// Footer total rows get the same labelled strip. A figure that spans several
// columns gets no label rather than the first column's name — the Expenses
// totals pill read "Amount (CAD)".
function labelGroupRow(row, names) {
  const cells = [...row.cells];
  if (cells.length < 2 || cells.some(c => c.rowSpan !== 1)) return;
  let col = 0;
  cells.forEach((cell, index) => {
    cell.dataset.phoneLabel = index > 0 && cell.colSpan > 1 ? '' : (names[col] || '');
    cell.classList.toggle('phone-record-lead', index === 0);
    col += cell.colSpan;
  });
  row.classList.add('phone-group-row');
}

function enhanceRecords(table) {
  const body = table.tBodies[0];
  const config = RECORDS[body?.id];
  const headers = table.tHead?.rows[0]?.cells;
  if (!config || !headers?.length) return;
  const names = [...headers].map(h => h.textContent.trim());
  const lead = typeof config.lead === 'number' ? config.lead : names.indexOf(config.lead);
  if (lead < 0) return;
  table.classList.add('phone-records');
  table.setAttribute('role', 'table');
  table.tHead.setAttribute('role', 'rowgroup');
  table.tHead.rows[0].setAttribute('role', 'row');
  [...headers].forEach(h => { h.scope = 'col'; h.setAttribute('role', 'columnheader'); });
  body.setAttribute('role', 'rowgroup');
  for (const row of table.tFoot?.rows || []) labelGroupRow(row, names);
  for (const row of body.rows) {
    // Empty states and grouped rows keep their full-width message, without controls.
    if (row.cells.length !== headers.length || [...row.cells].some(c => c.colSpan !== 1 || c.rowSpan !== 1)) {
      labelGroupRow(row, names);
      continue;
    }
    const rowLead = row.cells[lead].getAttribute('aria-hidden') === 'true'
      ? [...row.cells].findIndex(cell => cell.getAttribute('aria-hidden') !== 'true') : lead;
    if (rowLead < 0) continue;
    row.classList.add('phone-record');
    row.setAttribute('role', 'row');
    const details = [];
    [...row.cells].forEach((cell, index) => {
      cell.setAttribute('role', 'cell');
      cell.dataset.phoneLabel = names[index] || (cell.querySelector('input[type=checkbox]') ? 'Select' : 'Actions');
      const detail = cell.getAttribute('aria-hidden') !== 'true' && index !== rowLead && !config.summary.includes(index) && !config.summary.includes(names[index]);
      cell.classList.toggle('phone-record-detail', detail);
      cell.classList.toggle('phone-record-lead', index === rowLead);
      if (detail) {
        if (!cell.id) cell.id = `phone-record-field-${++detailId}`;
        details.push(cell.id);
      }
    });
    if (!details.length || row.querySelector('.phone-record-toggle')) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'phone-record-toggle';
    button.textContent = 'Details';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', details.join(' '));
    button.setAttribute('aria-label', `Show details: ${row.cells[rowLead].textContent.trim()}`);
    button.addEventListener('click', event => {
      event.stopPropagation();
      const open = row.classList.toggle('phone-record-open');
      button.setAttribute('aria-expanded', String(open));
      button.textContent = open ? 'Less detail' : 'Details';
      button.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} details`);
    });
    row.cells[rowLead].append(button);
    if (config.card) {
      row.addEventListener('click', event => {
        // Controls inside the card (edit, ship, approve) keep their own taps.
        if (event.target.closest('button, a, input, select, textarea, label')) return;
        if (!window.matchMedia?.('(max-width: 768px)')?.matches) return;
        button.click();
      });
    }
  }
}

function enhanceSections(nav) {
  const label = document.createElement('label');
  label.className = 'phone-section-picker';
  const title = document.createElement('span');
  title.textContent = nav.getAttribute('aria-label') || 'Section';
  const select = document.createElement('select');
  label.append(title, select);
  nav.before(label);
  nav.classList.add('has-phone-picker');
  let buttons = [];
  const sync = () => {
    buttons = [...nav.querySelectorAll('.settings-sub-tab')];
    const options = buttons.map((button, index) => {
      // A leading emoji is decoration the phone hides; the option is the words.
      const words = button.cloneNode(true);
      words.querySelectorAll('.lead-emoji').forEach(el => el.remove());
      const option = new Option(words.textContent.trim(), String(index));
      option.disabled = button.disabled || button.hidden || button.style.display === 'none';
      option.selected = button.classList.contains('active') || button.getAttribute('aria-selected') === 'true';
      return option;
    });
    select.replaceChildren(...options);
  };
  select.addEventListener('change', () => buttons[Number(select.value)]?.click());
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'hidden', 'style', 'disabled'] });
  return () => observer.disconnect();
}

// Footers with more than three actions (the trip window has seven) keep the
// first two in view and fold the rest behind "More actions" on a phone. The
// original buttons are moved, never copied, so their handlers stay the same;
// on a wide screen the wrapper is display:contents and nothing changes.
// Never folded: the gold main action (Save Book sat behind "More actions"),
// and a button that is hidden for now — a wizard's Back shows up on a later
// step and must appear in place, not inside the fold. A fold that would hold
// a single button is not worth the extra tap, so the footer is left alone.
const FOLD_AFTER = 2;
let foldId = 0;
export function foldFooterActions(group) {
  if (group.dataset.phoneFolded) return;
  const buttons = [...group.children].filter(el => el.matches('button, .btn'));
  if (buttons.length <= FOLD_AFTER + 1) return;
  const hiddenNow = (el) => el.hidden || el.style.display === 'none';
  const shown = buttons.filter(el => !hiddenNow(el));
  const kept = new Set(shown.slice(0, FOLD_AFTER));
  const toFold = shown.filter(el => !kept.has(el) && !el.classList.contains('gold'));
  if (toFold.length < 2) return;
  group.dataset.phoneFolded = '1';
  const panel = document.createElement('div');
  panel.className = 'phone-more-panel';
  panel.id = `phone-more-${++foldId}`;
  toFold.forEach(btn => panel.append(btn));
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn phone-more-toggle';
  toggle.textContent = 'More actions';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', panel.id);
  toggle.addEventListener('click', () => {
    const open = group.classList.toggle('phone-more-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Fewer actions' : 'More actions';
  });
  group.append(toggle, panel);
}

// Bottom sheets close with a downward swipe from their title bar, the way
// phone sheets do. Only on touch, only from the title, so scrolling a long
// form never closes it; the close goes through the page's own dismiss so the
// unsaved-changes guard still asks first.
const SWIPE_CLOSE_PX = 90;
function enableSwipeToClose(root, closeFn, isPhone) {
  let drag = null;
  const onStart = (e) => {
    if (drag || !isPhone() || e.pointerType !== 'touch') return;
    const title = e.target.closest?.('.overlay .modal-title');
    if (!title || e.target.closest('button, input, select, a')) return;
    const modal = title.closest('.modal');
    drag = { modal, overlay: modal.closest('.overlay'), pointerId: e.pointerId, y: e.clientY, dy: 0, transition: modal.style.transition, transform: modal.style.transform };
    modal.style.transition = 'none';
  };
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    drag.modal.style.transform = drag.dy ? `translateY(${drag.dy}px)` : '';
  };
  const reset = () => {
    if (!drag) return;
    const { modal, transition, transform } = drag;
    drag = null;
    modal.style.transition = transition;
    modal.style.transform = transform;
  };
  const onEnd = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { overlay, y } = drag;
    reset();
    if (e.type === 'pointerup' && isPhone() && e.clientY - y >= SWIPE_CLOSE_PX && overlay?.id?.startsWith('m-')) closeFn(overlay.id.slice(2));
  };
  root.addEventListener('pointerdown', onStart);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onEnd);
  root.addEventListener('pointercancel', onEnd);
  return () => {
    reset();
    root.removeEventListener('pointerdown', onStart);
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerup', onEnd);
    root.removeEventListener('pointercancel', onEnd);
  };
}

// The on-screen keyboard covers the bottom of the page without resizing it on
// most phones, hiding a sheet's Save button. Publish its height so the sheet
// can sit above it.
function trackKeyboard(win) {
  const vv = win.visualViewport;
  if (!vv) return () => {};
  const docEl = win.document.documentElement;
  const update = () => {
    const covered = Math.max(0, Math.round(win.innerHeight - vv.height - vv.offsetTop));
    docEl.style.setProperty('--kb-inset', `${covered}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
  return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
}

// The bottom menu scrolls sideways when its tabs don't fit (the author view has
// more than a phone can show), and so does Today's row of book chips. Mark the strip while tabs remain off to the
// right, so the stylesheet can fade that edge as a "there's more" cue.
function trackStripMore(strip) {
  const win = strip.ownerDocument.defaultView;
  const update = () => {
    const hidden = strip.scrollWidth - strip.clientWidth - strip.scrollLeft;
    const more = hidden > 4;
    // Only write on a change: the observer below also sees this class.
    if (strip.classList.contains('has-more-right') !== more) strip.classList.toggle('has-more-right', more);
  };
  strip.addEventListener('scroll', update, { passive: true });
  win?.addEventListener('resize', update);
  // Tabs appear and disappear as the role or book changes.
  const observer = new MutationObserver(update);
  observer.observe(strip, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  update();
  return () => {
    strip.removeEventListener('scroll', update);
    win?.removeEventListener('resize', update);
    observer.disconnect();
  };
}

// Rendered buttons, pills and headings often start with an emoji ("📒 Ledger").
// On a phone those read as clip-art next to the ink marks, so the emoji goes in
// the same hidden .lead-emoji span the static markup uses. Status marks the
// words rely on (✕ ✓ ⚠ ★ arrows) and icon-only buttons are left alone.
const LEAD_EMOJI_HOSTS = 'button, a, summary, h2, h3, h4, h5, label, [class*="pill"], [class*="badge"], [class*="-title"], [class*="-meta"]';
const LEAD_EMOJI = /^(\s*)((?:\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)\s+)(?=\S)/u;
const KEEP_MARKS = /^[\u2190-\u21FF\u2713-\u2718\u26A0\u2605\u2606\u270E]/u;

export function wrapLeadEmoji(el) {
  const first = el.firstChild;
  if (!first || first.nodeType !== 3) return false;
  const m = LEAD_EMOJI.exec(first.nodeValue);
  if (!m || KEEP_MARKS.test(m[2])) return false;
  const doc = el.ownerDocument;
  const span = doc.createElement('span');
  span.className = 'lead-emoji';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = m[2];
  first.nodeValue = first.nodeValue.slice(m[0].length);
  el.insertBefore(span, first);
  if (m[1]) el.insertBefore(doc.createTextNode(m[1]), span);
  return true;
}

export function wrapLeadEmojiIn(root) {
  if (root.nodeType !== 1) return;
  if (root.matches(LEAD_EMOJI_HOSTS)) wrapLeadEmoji(root);
  root.querySelectorAll(LEAD_EMOJI_HOSTS).forEach(wrapLeadEmoji);
}

export function initPhoneLayouts(root, { closeModal = (id) => globalThis.attemptCloseModal?.(id) } = {}) {
  if (!root) return () => {};
  root.querySelectorAll('table').forEach(enhanceRecords);
  const cleanups = [...root.querySelectorAll('.settings-sub-nav')]
    .filter(nav => nav.querySelector('.settings-sub-tab')).map(enhanceSections);
  root.querySelectorAll('.modal-footer > div').forEach(foldFooterActions);
  const isPhone = () => globalThis.matchMedia?.('(max-width: 600px)').matches ?? false;
  cleanups.push(enableSwipeToClose(root, closeModal, isPhone));
  if (root.ownerDocument?.defaultView) cleanups.push(trackKeyboard(root.ownerDocument.defaultView));
  root.querySelectorAll('.tab-bar, .today-books').forEach(strip => cleanups.push(trackStripMore(strip)));
  // Renderers replace tbody contents after filtering or syncing. Only revisit
  // affected tables, never rebuild records or duplicate the desktop data model.
  const phoneWidth = globalThis.matchMedia?.('(max-width: 768px)');
  if (phoneWidth?.matches) wrapLeadEmojiIn(root);
  phoneWidth?.addEventListener?.('change', e => { if (e.matches) wrapLeadEmojiIn(root); });
  const observer = new MutationObserver(mutations => {
    const tables = new Set();
    const phone = phoneWidth?.matches;
    for (const mutation of mutations) {
      const table = mutation.target.closest?.('table');
      if (table) tables.add(table);
      if (phone && mutation.target.matches?.(LEAD_EMOJI_HOSTS)) wrapLeadEmoji(mutation.target);
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches('table')) tables.add(node);
        node.querySelectorAll('table').forEach(t => tables.add(t));
        if (phone) wrapLeadEmojiIn(node);
      }
    }
    tables.forEach(enhanceRecords);
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => { observer.disconnect(); cleanups.forEach(cleanup => cleanup()); };
}
