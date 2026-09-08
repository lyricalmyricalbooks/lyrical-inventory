// The app watching for orders on its own, and the card it raises when it finds
// one. These cover the wiring around lib/order-watch.js: the memory of what has
// been announced, the gates on polling, and the notification itself.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appSource, buildHarness } from './helpers/extract-decl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

const order = (id, attributes = {}) => ({
  id,
  attributes: { status: 'completed', created_at: '2026-09-05T10:00:00Z', total: '42.00', ...attributes },
});

function announceHarness({ stored = null } = {}) {
  const seen = { written: [], alerts: [] };
  const harness = buildHarness({
    names: ['BC_SEEN_ORDERS_KEY', 'readSeenOrders', 'writeSeenOrders', 'announceNewBigCartelOrders'],
    deps: {
      localStorage: {
        getItem: () => (stored === null ? null : JSON.stringify(stored)),
        setItem: (_key, value) => { seen.written.push(JSON.parse(value)); },
      },
      seedSeenOrders: (orders) => orders.map(o => `#${o.id}`),
      newOrdersSince: (orders, seenNums) => orders
        .filter(o => !seenNums.includes(`#${o.id}`))
        .map(o => ({ num: `#${o.id}`, orderId: String(o.id), customer: 'Dana' })),
      mergeSeenOrders: (a, b) => [...a, ...b],
      showNewOrderAlert: (entries) => { seen.alerts.push(entries); },
    },
    returns: '{ announceNewBigCartelOrders }',
  });
  return { ...harness, seen };
}

describe('noticing an order without being asked', () => {
  it('says nothing the first time and remembers instead', () => {
    // A store with three years of history should be told about its next sale,
    // not woken up by every sale it ever made.
    const { announceNewBigCartelOrders, seen } = announceHarness({ stored: null });
    const fresh = announceNewBigCartelOrders([order('AAAA-1'), order('BBBB-2')]);

    expect(fresh).toEqual([]);
    expect(seen.alerts).toEqual([]);
    expect(seen.written).toEqual([['#AAAA-1', '#BBBB-2']]);
  });

  it('announces the sale that was not there last time', () => {
    const { announceNewBigCartelOrders, seen } = announceHarness({ stored: ['#AAAA-1'] });
    const fresh = announceNewBigCartelOrders([order('AAAA-1'), order('BBBB-2')]);

    expect(fresh.map(o => o.num)).toEqual(['#BBBB-2']);
    expect(seen.alerts).toHaveLength(1);
    expect(seen.written).toEqual([['#AAAA-1', '#BBBB-2']]);
  });

  it('stays silent, and writes nothing, when nothing is new', () => {
    const { announceNewBigCartelOrders, seen } = announceHarness({ stored: ['#AAAA-1'] });

    expect(announceNewBigCartelOrders([order('AAAA-1')])).toEqual([]);
    expect(seen.alerts).toEqual([]);
    expect(seen.written).toEqual([]);
  });

  it('treats a browser that blocks storage as a first run rather than crashing', () => {
    const { announceNewBigCartelOrders } = buildHarness({
      names: ['BC_SEEN_ORDERS_KEY', 'readSeenOrders', 'writeSeenOrders', 'announceNewBigCartelOrders'],
      deps: {
        localStorage: {
          getItem: () => { throw new Error('blocked'); },
          setItem: () => { throw new Error('blocked'); },
        },
        seedSeenOrders: () => [],
        newOrdersSince: () => [],
        mergeSeenOrders: () => [],
        showNewOrderAlert: () => {},
      },
      returns: '{ announceNewBigCartelOrders }',
    });
    expect(() => announceNewBigCartelOrders([order('AAAA-1')])).not.toThrow();
  });
});

describe('the notification card', () => {
  function cardHarness() {
    const elements = {
      'new-order-alert': { hidden: true },
      'new-order-alert-title': { textContent: '' },
      'new-order-alert-detail': { textContent: '' },
      'new-order-alert-ship': { hidden: false },
      'new-order-alert-record': { hidden: false },
      'new-order-alert-review': { textContent: '' },
    };
    const harness = buildHarness({
      names: ['showNewOrderAlert', 'dismissNewOrderAlert'],
      deps: {
        $: (id) => elements[id],
        describeNewOrders: (list) => ({
          count: list.length,
          title: list.length === 1 ? 'New order' : `${list.length} new orders`,
          detail: `${list.map(o => o.customer).join(', ')} ordered.`,
        }),
      },
      moduleState: 'let _newOrderAlert = null;',
      returns: '{ showNewOrderAlert, dismissNewOrderAlert }',
    });
    return { ...harness, elements };
  }

  it('offers the one-press ship button for a single order', () => {
    const { showNewOrderAlert, elements } = cardHarness();
    showNewOrderAlert([{ num: '#AAAA-1', orderId: 'AAAA-1', customer: 'Dana' }]);

    expect(elements['new-order-alert'].hidden).toBe(false);
    expect(elements['new-order-alert-title'].textContent).toBe('New order');
    expect(elements['new-order-alert-detail'].textContent).toBe('Dana ordered.');
    expect(elements['new-order-alert-ship'].hidden).toBe(false);
    expect(elements['new-order-alert-record'].hidden).toBe(false);
    expect(elements['new-order-alert-review'].textContent).toBe('Review');
  });

  it('hides the ship button when there is no single order to ship', () => {
    const { showNewOrderAlert, elements } = cardHarness();
    showNewOrderAlert([
      { num: '#AAAA-1', customer: 'Dana' },
      { num: '#BBBB-2', customer: 'Sam' },
    ]);

    expect(elements['new-order-alert-ship'].hidden).toBe(true);
    // Both single-order actions go, not just one: a Record button that silently
    // picked one of four orders to move stock for is worse than no button.
    expect(elements['new-order-alert-record'].hidden).toBe(true);
    expect(elements['new-order-alert-review'].textContent).toBe('Review orders');
  });

  it('adds a later sale to the card instead of erasing the earlier one', () => {
    // The second order of the morning must not wipe the first before it has
    // been read.
    const { showNewOrderAlert, elements } = cardHarness();
    showNewOrderAlert([{ num: '#AAAA-1', customer: 'Dana' }]);
    showNewOrderAlert([{ num: '#BBBB-2', customer: 'Sam' }]);

    expect(elements['new-order-alert-title'].textContent).toBe('2 new orders');
    expect(elements['new-order-alert-detail'].textContent).toBe('Dana, Sam ordered.');
    expect(elements['new-order-alert-ship'].hidden).toBe(true);
  });

  it('does not list the same order twice when a poll repeats it', () => {
    const { showNewOrderAlert, elements } = cardHarness();
    showNewOrderAlert([{ num: '#AAAA-1', customer: 'Dana' }]);
    showNewOrderAlert([{ num: '#AAAA-1', customer: 'Dana' }]);

    expect(elements['new-order-alert-title'].textContent).toBe('New order');
  });

  it('starts fresh after being dismissed', () => {
    const { showNewOrderAlert, dismissNewOrderAlert, elements } = cardHarness();
    showNewOrderAlert([{ num: '#AAAA-1', customer: 'Dana' }]);
    dismissNewOrderAlert();
    expect(elements['new-order-alert'].hidden).toBe(true);

    showNewOrderAlert([{ num: '#BBBB-2', customer: 'Sam' }]);
    expect(elements['new-order-alert-title'].textContent).toBe('New order');
    expect(elements['new-order-alert-detail'].textContent).toBe('Sam ordered.');
  });
});

describe('the shipping tab is up to date, and the markup is wired', () => {
  it('has the card, announced to a screen reader', () => {
    expect(indexContent).toContain('id="new-order-alert"');
    expect(indexContent).toMatch(/id="new-order-alert"[^>]*role="status"/);
    expect(indexContent).toMatch(/id="new-order-alert"[^>]*aria-live="polite"/);
    // Hidden until there is something to say, so it never sits empty on screen.
    expect(indexContent).toMatch(/id="new-order-alert"[^>]*hidden/);
  });

  it('wires every button on the card', () => {
    expect(indexContent).toContain('onclick="shipNewOrderFromAlert(event)"');
    expect(indexContent).toContain('onclick="reviewNewOrdersFromAlert(event)"');
    expect(indexContent).toContain('onclick="dismissNewOrderAlert(event)"');
    expect(indexContent).toContain('aria-label="Dismiss new order notification"');
  });

  it('starts the watch once the catalogue has loaded', () => {
    expect(appSource).toContain('.then(startBigCartelOrderWatch)');
  });

  it('checks again on a timer, on return to the app, and when the signal comes back', () => {
    const watch = appSource.slice(
      appSource.indexOf('function startBigCartelOrderWatch'),
      appSource.indexOf('/** The count badge on the Big Cartel tab button'),
    );
    // The three triggers now come from the shared scheduler rather than being
    // wired here by hand; startWatch is tested directly in
    // tests/watch-schedule.test.js, and this asserts the watch goes through it.
    expect(watch).toContain('startWatch(');
    expect(watch).toContain('intervalMs: BC_ORDER_WATCH_INTERVAL_MS');
    // Guarded, so a second call cannot double every timer and event listener.
    expect(watch).toContain('if (_bcWatchStarted');
  });

  it('announces from the one place that talks to the storefront', () => {
    expect(appSource).toContain('announceNewBigCartelOrders(bcOrders)');
  });
});

describe('recording a fresh order without opening the shipping form', () => {
  function recordHarness({ order = { id: 'AAAA-1' }, result = { status: 'recorded', qty: 2, bookTitle: 'The Hound', linked: 0 } } = {}) {
    const calls = { toasts: [], tabs: [], recorded: [], planned: [] };
    const elements = { 'new-order-alert': { hidden: false } };
    const harness = buildHarness({
      names: ['recordNewOrderFromAlert', 'dismissNewOrderAlert'],
      deps: {
        $: (id) => elements[id],
        findBigCartelOrderById: () => order,
        bigCartelOrderPlan: (o) => { calls.planned.push(o); return { parcelLines: [], plan: { autoSafe: true } }; },
        recordBigCartelOrderIfMissing: async (o, plan) => { calls.recorded.push({ o, plan }); return result; },
        switchTab: (tab) => { calls.tabs.push(tab); },
        showToast: (msg, tone) => { calls.toasts.push({ msg, tone }); },
      },
      moduleState: "let _newOrderAlert = { entries: [{ num: '#AAAA-1', orderId: 'AAAA-1', customer: 'Dana' }] };",
      returns: '{ recordNewOrderFromAlert, dismissNewOrderAlert, alert: () => _newOrderAlert }',
    });
    return { ...harness, calls, elements };
  }

  it('takes the stock off the shelf and closes the card', async () => {
    const { recordNewOrderFromAlert, calls, elements, alert } = recordHarness();
    await recordNewOrderFromAlert();

    expect(calls.recorded).toHaveLength(1);
    expect(calls.toasts[0].msg).toContain('Recorded 2 × The Hound');
    expect(elements['new-order-alert'].hidden).toBe(true);
    expect(alert()).toBeNull();
  });

  it('never goes near the shipping form', async () => {
    // The entire point of the button. "Ship it" switches tabs, fills an address
    // form, chases a phone number and quotes postage; an order being fulfilled
    // next week needs none of that to have its stock come off the shelf.
    const { recordNewOrderFromAlert, calls } = recordHarness();
    await recordNewOrderFromAlert();

    expect(calls.tabs).toEqual([]);
  });

  it('mentions a label it managed to link on the way', async () => {
    const { recordNewOrderFromAlert, calls } = recordHarness({
      result: { status: 'recorded', qty: 1, bookTitle: 'The Hound', linked: 1 },
    });
    await recordNewOrderFromAlert();
    expect(calls.toasts[0].msg).toContain('linked 1 label');
  });

  it('sends an order it will not guess at to the review queue instead', async () => {
    // Held to the same guard as every other automatic record: one catalogue
    // title named outright, or a person picks the book.
    const { recordNewOrderFromAlert, calls, elements } = recordHarness({
      result: { status: 'needs-review' },
    });
    await recordNewOrderFromAlert();

    expect(calls.tabs).toEqual(['bigcartel']);
    expect(calls.toasts[0].msg).toContain('needs you to pick the book');
    expect(calls.toasts[0].tone).toBe('warn');
    expect(elements['new-order-alert'].hidden).toBe(true);
  });

  it('leaves the card up when nothing could be written', async () => {
    // Dismissing here would look like the sale had been dealt with, and take
    // the still-working "Ship it" button away with it.
    const { recordNewOrderFromAlert, calls, elements } = recordHarness({
      result: { status: 'failed' },
    });
    await recordNewOrderFromAlert();

    expect(elements['new-order-alert'].hidden).toBe(false);
    expect(calls.toasts[0].tone).toBe('err');
    expect(calls.toasts[0].msg).toContain('Try shipping it instead');
  });

  it('says so plainly when the ledger already had it', async () => {
    for (const status of ['already-recorded', 'not-owed']) {
      const { recordNewOrderFromAlert, calls, elements } = recordHarness({ result: { status } });
      await recordNewOrderFromAlert();
      expect(calls.toasts[0].msg).toContain('already in your ledger');
      expect(elements['new-order-alert'].hidden).toBe(true);
    }
  });

  it('does not record twice from one press when the order cannot be found', async () => {
    const { recordNewOrderFromAlert, calls, elements } = recordHarness({ order: null });
    await recordNewOrderFromAlert();

    expect(calls.recorded).toEqual([]);
    expect(calls.toasts[0].tone).toBe('err');
    // Card stays: "Ship it" can still fetch the order the long way round.
    expect(elements['new-order-alert'].hidden).toBe(false);
  });

  it('derives the plan the same way the shipping path does', () => {
    // Both callers ask bigCartelOrderPlan, so plan.autoSafe — the flag deciding
    // whether stock may move unattended — cannot mean two different things.
    const record = appSource.slice(
      appSource.indexOf('async function recordNewOrderFromAlert'),
      appSource.indexOf('/** Open the storefront tab to work through them. */'),
    );
    expect(record.length).toBeGreaterThan(200);
    expect(record).toContain('bigCartelOrderPlan(order)');
    expect(record).toContain('recordBigCartelOrderIfMissing(order, plan)');
    // It must not reach the shipping prefill, which is the detour it replaces.
    expect(record).not.toContain('prefillShippingFromBigCartelOrder');
    expect(record).not.toContain("switchTab('shipping')");
  });

  it('is on the card and reachable from it', () => {
    expect(indexContent).toContain('id="new-order-alert-record"');
    expect(indexContent).toContain('onclick="recordNewOrderFromAlert(event)"');
    expect(appSource).toContain('window.recordNewOrderFromAlert = recordNewOrderFromAlert;');
  });
});
