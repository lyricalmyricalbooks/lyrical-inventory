// Presentation adapters only: retain the original cells, amounts and handlers.
// The opt-in list deliberately excludes editable/import tables and complex headers.
const RECORDS = {
  'cust-body': { lead: 0, summary: [1, 5, 8] },
  'ml-body': { lead: 0, summary: [1, 4] },
  'all-con-body': { lead: 0, summary: [1, 4, 6] },
  'dash-con-body': { lead: 0, summary: [4, 5] },
  'ledger-body': { lead: 1, summary: [0, 2, 5, 7] },
  'hist-body': { lead: 1, summary: [0, 2, 4, 8, 9] },
  'exp-body': { lead: 'Description', summary: ['Date', 'Receipt', 'Amount', 'Amount (CAD)', 'Reimbursement', ''] },
  'tc-ledger-body': { lead: 2, summary: [0, 4, 6, 7] },
  'tc-recurring-body': { lead: 0, summary: [2, 4, 5, 6] },
  'bc-orders-list': { lead: 0, summary: [1, 2, 6, 7, 8] },
  'sheets-log-body': { lead: 0, summary: [1, 4] },
  'system-backup-list': { lead: 0, summary: [1, 2, 3] },
  // Pop-up windows sit outside the page panels but get the same record cards.
  'tc-trip-detail-body': { lead: 1, summary: [0, 5, 6] },
  'tc-cat-detail-body': { lead: 2, summary: [0, 5, 7] },
  'iv-modal-table-body': { lead: 0, summary: [3, 6] },
  'pos-confirm-items': { lead: 0, summary: [1, 2] },
};
let detailId = 0;

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
  for (const row of body.rows) {
    // Empty states and grouped rows keep their full-width message, without controls.
    if (row.cells.length !== headers.length || [...row.cells].some(c => c.colSpan !== 1 || c.rowSpan !== 1)) continue;
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
      const option = new Option(button.textContent.trim(), String(index));
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
const FOLD_AFTER = 2;
let foldId = 0;
function foldFooterActions(group) {
  if (group.dataset.phoneFolded) return;
  const buttons = [...group.children].filter(el => el.matches('button, .btn'));
  if (buttons.length <= FOLD_AFTER + 1) return;
  group.dataset.phoneFolded = '1';
  const panel = document.createElement('div');
  panel.className = 'phone-more-panel';
  panel.id = `phone-more-${++foldId}`;
  buttons.slice(FOLD_AFTER).forEach(btn => panel.append(btn));
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
    if (!isPhone() || e.pointerType !== 'touch') return;
    const title = e.target.closest?.('.overlay .modal-title');
    if (!title || e.target.closest('button, input, select, a')) return;
    const modal = title.closest('.modal');
    drag = { modal, overlay: modal.closest('.overlay'), y: e.clientY, dy: 0 };
    modal.style.transition = 'none';
  };
  const onMove = (e) => {
    if (!drag) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    drag.modal.style.transform = drag.dy ? `translateY(${drag.dy}px)` : '';
  };
  const onEnd = () => {
    if (!drag) return;
    const { modal, overlay, dy } = drag;
    drag = null;
    modal.style.transition = '';
    modal.style.transform = '';
    if (dy >= SWIPE_CLOSE_PX && overlay?.id?.startsWith('m-')) closeFn(overlay.id.slice(2));
  };
  root.addEventListener('pointerdown', onStart);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onEnd);
  root.addEventListener('pointercancel', onEnd);
  return () => {
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

export function initPhoneLayouts(root, { closeModal = (id) => globalThis.attemptCloseModal?.(id) } = {}) {
  if (!root) return () => {};
  root.querySelectorAll('table').forEach(enhanceRecords);
  const cleanups = [...root.querySelectorAll('.settings-sub-nav')]
    .filter(nav => nav.querySelector('.settings-sub-tab')).map(enhanceSections);
  root.querySelectorAll('.modal-footer > div').forEach(foldFooterActions);
  const isPhone = () => globalThis.matchMedia?.('(max-width: 600px)').matches ?? false;
  cleanups.push(enableSwipeToClose(root, closeModal, isPhone));
  if (root.ownerDocument?.defaultView) cleanups.push(trackKeyboard(root.ownerDocument.defaultView));
  // Renderers replace tbody contents after filtering or syncing. Only revisit
  // affected tables, never rebuild records or duplicate the desktop data model.
  const observer = new MutationObserver(mutations => {
    const tables = new Set();
    for (const mutation of mutations) {
      const table = mutation.target.closest?.('table');
      if (table) tables.add(table);
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches('table')) tables.add(node);
        node.querySelectorAll('table').forEach(t => tables.add(t));
      }
    }
    tables.forEach(enhanceRecords);
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => { observer.disconnect(); cleanups.forEach(cleanup => cleanup()); };
}
