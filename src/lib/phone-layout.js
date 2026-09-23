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

export function initPhoneLayouts(root) {
  if (!root) return () => {};
  root.querySelectorAll('table').forEach(enhanceRecords);
  const cleanups = [...root.querySelectorAll('.settings-sub-nav')]
    .filter(nav => nav.querySelector('.settings-sub-tab')).map(enhanceSections);
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
