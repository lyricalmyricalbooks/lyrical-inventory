// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';
import { initPhoneLayouts } from '../src/lib/phone-layout.js';
let stop;
beforeEach(() => { stop?.(); document.body.innerHTML = ''; });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture() {
  document.body.innerHTML = `<div id="app"><table><thead><tr><th>Name</th><th>Email</th><th>Orders</th><th>Units</th><th>Books</th><th>Spend</th><th>Last order</th><th>Source</th><th>Action</th></tr></thead><tbody id="cust-body"><tr><td>Ada</td><td>ada@example.test</td><td>2</td><td>3</td><td>A very long book title</td><td>CA$125.00</td><td>2026-09-23</td><td>Website</td><td><button id="action">Unsubscribe</button></td></tr></tbody></table></div>`;
  return document.getElementById('app');
}
test('record details expand without replacing the original controls or money', () => {
  const root = fixture(); const action = document.getElementById('action'); let clicks = 0;
  action.addEventListener('click', () => clicks++);
  stop = initPhoneLayouts(root);
  const row = document.querySelector('tbody tr');
  const toggle = row.querySelector('.phone-record-toggle');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(row.cells[4].dataset.phoneLabel).toBe('Books');
  expect(row.cells[4].classList.contains('phone-record-detail')).toBe(true);
  toggle.click();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(row.classList.contains('phone-record-open')).toBe(true);
  expect(row.cells[5].textContent).toBe('CA$125.00');
  expect(document.getElementById('action')).toBe(action); action.click(); expect(clicks).toBe(1);
});
test('rerendered rows are enhanced once; empty and spanning rows remain intact', async () => {
  stop = initPhoneLayouts(fixture());
  const body = document.getElementById('cust-body');
  const original = body.firstElementChild.outerHTML;
  body.innerHTML = '<tr><td colspan="9">No customers found</td></tr>';
  await tick(); expect(body.querySelector('button')).toBeNull();
  body.innerHTML = original.replace(/<button[^>]*class="phone-record-toggle"[\s\S]*?<\/button>/, '');
  await tick(); await tick();
  expect(body.querySelectorAll('.phone-record-toggle')).toHaveLength(1);
});
test('changing the phone section picker invokes the existing tab action and follows it back', async () => {
  document.body.innerHTML = '<div id="app"><div class="settings-sub-nav" aria-label="Tax sections"><button class="settings-sub-tab active">Overview</button><button class="settings-sub-tab">Email receipts</button></div></div>';
  const buttons = [...document.querySelectorAll('button')];
  for (const button of buttons) button.onclick = () => { buttons.forEach(b => b.classList.toggle('active', b === button)); };
  stop = initPhoneLayouts(document.getElementById('app'));
  const select = document.querySelector('.phone-section-picker select');
  select.value = '1'; select.dispatchEvent(new Event('change')); await tick();
  expect(buttons[1].classList.contains('active')).toBe(true);
  buttons[0].click(); await tick(); expect(select.value).toBe('0');
  expect(document.querySelectorAll('.phone-section-picker')).toHaveLength(1);
});
test.each([false, true])('expense cards keep description, selection and actions visible (publisher=%s)', publisher => {
  const headings = [...(publisher ? [] : ['']), 'Date', 'Description', 'Category', 'Ref', 'Receipt', 'Amount', ...(publisher ? ['Amount (CAD)'] : []), 'Reimbursement', ''];
  document.body.innerHTML = `<div id="app"><table><thead><tr>${headings.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody id="exp-body"><tr>${headings.map((h, i) => `<td>${!h ? (!publisher && i === 0 ? '<input type="checkbox" aria-label="Select expense">' : '<button>Edit expense</button>') : h === 'Description' ? 'Print run' : h === 'Amount (CAD)' ? 'CA$200.00' : h}</td>`).join('')}</tr></tbody></table></div>`;
  stop = initPhoneLayouts(document.getElementById('app'));
  const row = document.querySelector('tbody tr');
  expect(row.querySelector('.phone-record-lead').textContent).toContain('Print run');
  for (const cell of row.cells) {
    if (cell.querySelector('input, button:not(.phone-record-toggle)') || cell.textContent === 'CA$200.00') {
      expect(cell.classList.contains('phone-record-detail')).toBe(false);
    }
  }
});
test('grouped consignment puts its Details control outside the hidden spacer', () => {
  document.body.innerHTML = '<div id="app"><table><thead><tr><th>Book</th><th>Store</th><th>Sent</th><th>Sold</th><th>Outstanding</th><th>Sell-through</th><th>Status</th></tr></thead><tbody id="all-con-body"><tr class="con-nested-row"><td class="con-nested-spacer" aria-hidden="true"></td><td>Corner Bookshop</td><td>10</td><td>4</td><td>6</td><td>40%</td><td>Active</td></tr></tbody></table></div>';
  stop = initPhoneLayouts(document.getElementById('app'));
  const toggle = document.querySelector('.phone-record-toggle');
  expect(toggle.closest('[aria-hidden="true"]')).toBeNull();
  expect(toggle.parentElement.textContent).toContain('Corner Bookshop');
});
test('pop-up window tables outside the app shell become record cards', () => {
  document.body.innerHTML = '<div id="pw-app"></div><div class="overlay"><div class="modal"><table><thead><tr><th>Date</th><th>Description</th><th>Tax Category</th><th>Receipt</th><th>Amount (Orig)</th><th>Amount (CAD)</th><th></th></tr></thead><tbody id="tc-trip-detail-body"><tr><td>2026-09-01</td><td>Train to fair</td><td>Travel</td><td>—</td><td>US$40.00</td><td>CA$54.20</td><td><button>Edit</button></td></tr></tbody></table></div></div>';
  stop = initPhoneLayouts(document.body);
  const row = document.querySelector('#tc-trip-detail-body tr');
  expect(row.classList.contains('phone-record')).toBe(true);
  expect(row.cells[1].classList.contains('phone-record-lead')).toBe(true);
  expect(row.cells[5].classList.contains('phone-record-detail')).toBe(false);
  expect(row.cells[2].classList.contains('phone-record-detail')).toBe(true);
});

test('a crowded pop-up footer keeps two actions and folds the rest, moving the real buttons', () => {
  document.body.innerHTML = `<div class="overlay" id="m-trip"><div class="modal"><div class="modal-footer"><div>
    ${[1, 2, 3, 4, 5, 6, 7].map(n => `<button class="btn" id="b${n}">B${n}</button>`).join('')}
  </div><button class="btn">Close</button></div></div></div>`;
  const b5 = document.getElementById('b5'); let clicks = 0; b5.addEventListener('click', () => clicks++);
  stop = initPhoneLayouts(document.body);
  const group = document.querySelector('.modal-footer > div');
  const panel = group.querySelector('.phone-more-panel');
  expect([...panel.children].map(b => b.id)).toEqual(['b3', 'b4', 'b5', 'b6', 'b7']);
  expect(group.querySelector('#b1').parentElement).toBe(group);
  const toggle = group.querySelector('.phone-more-toggle');
  expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
  toggle.click();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(group.classList.contains('phone-more-open')).toBe(true);
  document.getElementById('b5').click(); expect(clicks).toBe(1);
});

test('a short footer is left alone', () => {
  document.body.innerHTML = '<div class="modal"><div class="modal-footer"><div><button class="btn">A</button><button class="btn">B</button><button class="btn">C</button></div></div></div>';
  stop = initPhoneLayouts(document.body);
  expect(document.querySelector('.phone-more-toggle')).toBeNull();
});

describe('swipe down to close', () => {
  const setup = (phone) => {
    document.body.innerHTML = '<div class="overlay" id="m-fair-today"><div class="modal"><div class="modal-title"><span>Today</span><button class="modal-close-btn">x</button></div><p>body</p></div></div>';
    const closed = [];
    const orig = window.matchMedia;
    window.matchMedia = () => ({ matches: phone });
    stop = initPhoneLayouts(document.body, { closeModal: (id) => closed.push(id) });
    window.matchMedia = orig;
    return closed;
  };
  const drag = (el, from, to, type = 'touch') => {
    const ev = (name, y) => { const e = new Event(name, { bubbles: true }); Object.assign(e, { clientY: y, pointerType: type }); return e; };
    el.dispatchEvent(ev('pointerdown', from));
    el.dispatchEvent(ev('pointermove', to));
    el.dispatchEvent(ev('pointerup', to));
  };
  test('a long swipe on the title closes through the page\'s own dismiss', () => {
    const origMM = window.matchMedia; window.matchMedia = () => ({ matches: true });
    const closed = setup(true);
    window.matchMedia = () => ({ matches: true });
    drag(document.querySelector('.modal-title span'), 100, 260);
    window.matchMedia = origMM;
    expect(closed).toEqual(['fair-today']);
  });
  test('a short swipe, a mouse drag, or a swipe on the body does not', () => {
    window.matchMedia = () => ({ matches: true });
    const closed = setup(true);
    window.matchMedia = () => ({ matches: true });
    drag(document.querySelector('.modal-title span'), 100, 150);
    drag(document.querySelector('.modal-title span'), 100, 300, 'mouse');
    drag(document.querySelector('.modal p'), 100, 300);
    expect(closed).toEqual([]);
  });
});
