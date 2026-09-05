// Labels bought elsewhere finding their customer: the tracking tier, the
// worklist that now shows them, the sweep that files them, and the tracking
// number that goes back onto the order.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appSource, buildHarness } from './helpers/extract-decl.js';
import {
  autoLinkConfidentShippingMatches,
  isUnresolvedShippoPostage,
  needsAmountAttention,
  reconcileShippingExpense,
} from '../src/lib/shipping-reconciliation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

const CP_TRACKING = 'EE123456789CA';

const orders = [
  { num: '#AAAA-1', date: '2026-09-01', shipName: 'Dana Okafor', shipPostal: 'K1V 8L5', trackingNumber: CP_TRACKING },
  { num: '#BBBB-2', date: '2026-09-01', shipName: 'Sam Reyes', shipPostal: '60616' },
];

describe('a tracking number is an identity, not a resemblance', () => {
  it('matches the order carrying the same number', () => {
    expect(reconcileShippingExpense({ trackingNumber: CP_TRACKING, date: '2026-09-02' }, orders))
      .toMatchObject({ shippingSuggestedOrderNumber: '#AAAA-1', shippingMatchTier: 'tracking' });
  });

  it('matches however the number was written down', () => {
    expect(reconcileShippingExpense({ trackingNumber: 'ee 123 456 789 ca', date: '2026-09-02' }, orders)
      .shippingMatchTier).toBe('tracking');
  });

  it('matches outside the date window, unlike every other tier', () => {
    // A nearby date makes a name match more plausible. It has nothing to add to
    // a carrier-issued number: if the numbers agree, that is the parcel, posted
    // the same day or a month later.
    const late = reconcileShippingExpense({ trackingNumber: CP_TRACKING, date: '2026-11-30' }, orders);
    expect(late.shippingSuggestedOrderNumber).toBe('#AAAA-1');

    // The name tier, for contrast, goes out of range.
    const byName = reconcileShippingExpense(
      { recipientName: 'Sam Reyes', recipientPostal: '60616', date: '2026-11-30' }, orders);
    expect(byName.shippingMatchStatus).toBe('unmatched');
  });

  it('outranks the name tiers when both could match', () => {
    const both = reconcileShippingExpense({
      trackingNumber: CP_TRACKING, recipientName: 'Sam Reyes', recipientPostal: '60616', date: '2026-09-02',
    }, orders);
    expect(both.shippingMatchTier).toBe('tracking');
    expect(both.shippingSuggestedOrderNumber).toBe('#AAAA-1');
  });

  it('is trusted enough to link without being asked', () => {
    const expense = { ref: 'postage:EE123456789CA', ...reconcileShippingExpense({ trackingNumber: CP_TRACKING, date: '2026-09-02' }, orders) };
    expect(autoLinkConfidentShippingMatches([expense], orders).map(l => l.orderNumber)).toEqual(['#AAAA-1']);
  });

  it('still refuses when two labels claim the same order', () => {
    // The guard that outlives every new tier.
    const one = reconcileShippingExpense({ trackingNumber: CP_TRACKING, date: '2026-09-02' }, orders);
    expect(autoLinkConfidentShippingMatches([
      { ref: 'postage:a', ...one },
      { ref: 'postage:b', ...one },
    ], orders)).toEqual([]);
  });

  it('ignores an order with no tracking number rather than matching blanks', () => {
    expect(reconcileShippingExpense({ trackingNumber: '', date: '2026-09-02' }, orders).shippingMatchTier)
      .toBeUndefined();
  });
});

describe('the worklist shows postage from anywhere, not only Shippo', () => {
  const unlinked = { shippingMatchStatus: 'unmatched' };

  it('includes a label bought outside the app', () => {
    // This used to test ref.startsWith('shippo:'), so a Canada Post label
    // awaiting a link appeared in no list at all — not here, not on the badge.
    expect(isUnresolvedShippoPostage({ ref: 'postage:EE123456789CA', ...unlinked })).toBe(true);
    expect(isUnresolvedShippoPostage({ ref: 'postage-email:msg-1', ...unlinked })).toBe(true);
  });

  it('still includes Shippo postage', () => {
    expect(isUnresolvedShippoPostage({ ref: 'shippo:abc', ...unlinked })).toBe(true);
  });

  it('excludes a refund, which reverses a label rather than paying for one', () => {
    expect(isUnresolvedShippoPostage({ ref: 'shippo-refund:r1', ...unlinked })).toBe(false);
  });

  it('excludes anything already settled either way', () => {
    expect(isUnresolvedShippoPostage({ ref: 'postage:x', shippingMatchStatus: 'matched' })).toBe(false);
    expect(isUnresolvedShippoPostage({ ref: 'postage:x', shippingMatchStatus: 'dismissed' })).toBe(false);
  });

  it('excludes an expense that is not postage at all', () => {
    expect(isUnresolvedShippoPostage({ ref: 'stripe:fee-1', ...unlinked })).toBe(false);
    expect(isUnresolvedShippoPostage({})).toBe(false);
  });

  it('counts a label whose amount could not be read as its own kind of unfinished', () => {
    expect(needsAmountAttention({ ref: 'postage:x', amountUnknown: true })).toBe(true);
    expect(needsAmountAttention({ ref: 'postage:x', amountUnknown: false })).toBe(false);
    // A hand-entered expense with a blank amount is the publisher's own doing.
    expect(needsAmountAttention({ ref: '', amountUnknown: true })).toBe(false);
  });

  it('is shown beside the review count rather than left implicit', () => {
    expect(appSource).toContain('needs an amount');
    expect(appSource).toContain('(TAX_CENTER.businessExpenses || []).filter(needsAmountAttention).length');
  });
});

describe('the tracking number goes back onto the order', () => {
  function backHarness(hist) {
    const saved = [];
    const harness = buildHarness({
      names: ['writeTrackingBackToOrders'],
      deps: {
        states: { altrove: { hist } },
        normalizeShippingOrderNumber: (v) => String(v || '').trim().toUpperCase(),
        cpText: (v) => String(v ?? '').trim(),
        saveState: (id) => { saved.push(id); },
        renderHist: () => {},
        today: () => '2026-09-05',
      },
      returns: '{ writeTrackingBackToOrders }',
    });
    return { ...harness, saved };
  }

  const linked = (tracking) => ({
    ref: 'postage:x', shippingOrderNumber: '#AAAA-1', shippingMatchStatus: 'matched',
    trackingNumber: tracking, date: '2026-09-02',
  });

  it('stamps the number and marks the order shipped', () => {
    // The publisher typed this by hand before, or more often did not, and the
    // order sat looking unshipped.
    const hist = [{ num: '#AAAA-1' }];
    const { writeTrackingBackToOrders, saved } = backHarness(hist);

    expect(writeTrackingBackToOrders([linked(CP_TRACKING)])).toBe(1);
    expect(hist[0]).toMatchObject({ trackingNumber: CP_TRACKING, shipped: true, shippedDate: '2026-09-02' });
    expect(saved).toEqual(['altrove']);
  });

  it('never overwrites a tracking number the order already has', () => {
    // An order already naming a number was shipped by some route this does not
    // know about; replacing a true record with a plausible one is worse.
    const hist = [{ num: '#AAAA-1', trackingNumber: 'ALREADY-THERE' }];
    const { writeTrackingBackToOrders, saved } = backHarness(hist);

    expect(writeTrackingBackToOrders([linked(CP_TRACKING)])).toBe(0);
    expect(hist[0].trackingNumber).toBe('ALREADY-THERE');
    expect(saved).toEqual([]);
  });

  it('leaves a voided order alone', () => {
    const hist = [{ num: '#AAAA-1', voided: true }];
    const { writeTrackingBackToOrders } = backHarness(hist);
    expect(writeTrackingBackToOrders([linked(CP_TRACKING)])).toBe(0);
  });

  it('ignores postage that is not linked, or carries no number', () => {
    const hist = [{ num: '#AAAA-1' }];
    const { writeTrackingBackToOrders } = backHarness(hist);
    expect(writeTrackingBackToOrders([{ ...linked(CP_TRACKING), shippingMatchStatus: 'suggested' }])).toBe(0);
    expect(writeTrackingBackToOrders([linked('')])).toBe(0);
    expect(writeTrackingBackToOrders([])).toBe(0);
  });

  it('does not disturb an order that was already marked shipped', () => {
    const hist = [{ num: '#AAAA-1', shipped: true, shippedDate: '2026-08-01' }];
    const { writeTrackingBackToOrders } = backHarness(hist);
    writeTrackingBackToOrders([linked(CP_TRACKING)]);
    expect(hist[0].shippedDate).toBe('2026-08-01');
    expect(hist[0].trackingNumber).toBe(CP_TRACKING);
  });
});

describe('the Canada Post sweep only ever reads', () => {
  // Ends at the function's own closing, not at the next declaration: the doc
  // comment that follows names buyCanadaPostLabel to explain the contrast, and
  // sweeping that in would make the money-safety assertion below vacuous.
  const sweep = appSource.slice(
    appSource.indexOf('async function sweepCanadaPostShipments'),
    appSource.indexOf(' * Put the tracking number on the order'),
  );

  it('sends no payload, which is what makes every call a GET', () => {
    const read = appSource.slice(
      appSource.indexOf('async function cpRead'),
      appSource.indexOf('function cpShipmentIdsFrom'),
    );
    expect(read).toContain("jsonPayload: ''");
  });

  it('refuses to let a read be answered with a fabricated shipment', () => {
    // Both are otherwise inferred from the word "shipments" in the path, which
    // every one of these read endpoints contains — and with simulation on, a
    // failed read could return an invented shipment.
    const read = appSource.slice(
      appSource.indexOf('async function cpRead'),
      appSource.indexOf('function cpShipmentIdsFrom'),
    );
    expect(read).toContain('isShipment: false');
    expect(read).toContain('allowSimulation: false');
  });

  it('never reaches a call that spends money or commits a batch', () => {
    expect(sweep).not.toContain('buyCanadaPostLabel');
    expect(sweep).not.toContain('createShipmentPath');
    expect(sweep).not.toContain('resolveManifestEndpoint');
    expect(sweep).not.toContain('refundCanadaPostShipment');
  });

  it('grades each label as it files it, or nothing would ever auto-link', () => {
    // An expense filed with no match status is neither suggested nor matched,
    // so the auto-linker skips it and every label waits for a human.
    expect(sweep).toContain('reconcileShippingExpense({');
    expect(sweep).toContain('applyConfidentShippingLinks()');
    expect(sweep).toContain('writeTrackingBackToOrders(');
  });

  it('does not file the same shipment twice', () => {
    expect(sweep).toContain('known.has(postageCandidateRef(candidate))');
    expect(sweep).toContain('known.add(ref)');
  });

  it('overlaps its date window by a day, because a missed label is silent', () => {
    const stamp = appSource.slice(
      appSource.indexOf('function cpSweepFromDate'),
      appSource.indexOf('async function cpRead'),
    );
    expect(stamp).toContain('86400000');
  });

  it('reports its own health like the other two watches', () => {
    expect(sweep).toContain("noteIntegrationSuccess('canadapost')");
    expect(sweep).toContain("noteIntegrationFailure('canadapost', error");
    expect(sweep).toContain("integrationBackoffMs('canadapost'");
  });

  it('is started at boot and reachable from the Check now button', () => {
    expect(appSource).toContain('startCanadaPostSweep();');
    expect(appSource).toContain("if (id === 'canadapost') return sweepCanadaPostShipments({ force: true });");
  });

  it('runs through the shared scheduler rather than its own timers', () => {
    const start = appSource.slice(
      appSource.indexOf('function startCanadaPostSweep'),
      appSource.indexOf('const SHIPPO_WATCH_INTERVAL_MS'),
    );
    expect(start).toContain('startWatch(');
    expect(start).toContain('if (_cpSweepStarted');
  });

  it('marks the Tax Centre tab for either shipping service', () => {
    expect(indexContent).toContain('data-health-badge="shippo,canadapost,shipping-email"');
  });
});

describe('the carrier email sweep, for what Canada Post cannot be asked about', () => {
  const sweep = appSource.slice(
    appSource.indexOf('async function sweepShippingEmails'),
    appSource.indexOf('function startShippingEmailSweep'),
  );

  it('searches Gmail through the scanner that already exists', () => {
    // Reusing listReceiptEmails and getEmailContents is what keeps the Apps
    // Script unchanged: the query comes from the client, so there is no version
    // bump and nothing for the publisher to redeploy.
    expect(sweep).toContain("gmailJson('listReceiptEmails'");
    expect(sweep).toContain("gmailJson('getEmailContents'");
    expect(sweep).toContain('shippingEmailQuery({ since })');
  });

  it('treats a script that answers 200 with an error as a failure', () => {
    // Apps Script reports a bad query or a stale deployment this way, so
    // without the check a broken scan looks like a scan that found nothing.
    const json = appSource.slice(
      appSource.indexOf('async function gmailJson'),
      appSource.indexOf('async function sweepShippingEmails'),
    );
    expect(json).toContain('if (data && data.error) throw new Error(String(data.error));');
  });

  it('files nothing from an email it could not read', () => {
    // parseShippingEmail answers null when there is no verifiable tracking
    // number — a newsletter, a delivery notice, the storefront's own order mail.
    expect(sweep).toContain('if (!parsed) return;');
  });

  it('grades each label as it files it, exactly as the Canada Post sweep does', () => {
    expect(sweep).toContain('reconcileShippingExpense({');
    expect(sweep).toContain('applyConfidentShippingLinks()');
    expect(sweep).toContain('writeTrackingBackToOrders(');
  });

  it('does not file a label the Canada Post sweep already filed', () => {
    // Both can see the same Canada Post label. The tracking number is the ref
    // both key on, so whichever arrives second finds it already there.
    expect(sweep).toContain('known.has(ref)');
    expect(sweep).toContain('known.add(ref)');
    expect(sweep).toContain('postageCandidateRef(candidate)');
  });

  it('overlaps its date window by a day, because a missed email is silent', () => {
    expect(sweep).toContain('86400000');
  });

  it('reports its own health under its own name', () => {
    // Its own name, not Canada Post's: an expired Apps Script deployment and a
    // refused Canada Post key are different problems with different fixes.
    expect(sweep).toContain("noteIntegrationSuccess('shipping-email')");
    expect(sweep).toContain("noteIntegrationFailure('shipping-email', error");
    expect(sweep).toContain("integrationBackoffMs('shipping-email'");
  });

  it('says which source the labels came from', () => {
    // Two sweeps finding labels minutes apart would otherwise overwrite each
    // other's card, and the publisher would see one number for two events.
    expect(sweep).toContain("source: 'your email'");
    const alert = appSource.slice(
      appSource.indexOf('function showPostageSweepAlert'),
      appSource.indexOf('function startCanadaPostSweep'),
    );
    expect(alert).toContain('id: `postage-sweep-${source.replace(');
  });

  it('is started at boot and reachable from the Check now button', () => {
    expect(appSource).toContain('startShippingEmailSweep();');
    expect(appSource).toContain("if (id === 'shipping-email') return sweepShippingEmails({ force: true });");
  });

  it('runs through the shared scheduler rather than its own timers', () => {
    const start = appSource.slice(
      appSource.indexOf('function startShippingEmailSweep'),
      appSource.indexOf('const SHIPPO_WATCH_INTERVAL_MS'),
    );
    expect(start).toContain('startWatch(');
    expect(start).toContain('if (_emailSweepStarted');
  });
});
