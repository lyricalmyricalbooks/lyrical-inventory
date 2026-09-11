// An invoice settling itself when Stripe says a store paid: the one writer that
// does it, and the background sweep's guarantees about money.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appSource, buildHarness } from './helpers/extract-decl.js';
import { histMirrorForLedger } from '../src/lib/consignment.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

const CHARGE = 'ch_3Nabcdef';

/**
 * The real settle chain: applyInvoicePaid and the canonical settleLedgerSalePaid
 * it delegates to, with the true histMirrorForLedger from lib injected — so the
 * ledger row, the store's owed balance and the history mirror all move for real.
 */
function paidHarness({ book = { id: 'hound', stripeLink: '' } } = {}) {
  const saved = [];
  const deactivated = [];
  const harness = buildHarness({
    names: ['invoicePaidMethod', 'settleLedgerSalePaid', 'applyInvoicePaid'],
    deps: {
      BOOKS: { [book.id]: book },
      histMirrorForLedger,
      isDynamicStripeLink: (inv) => !!(inv && inv.stripe && inv.stripe.url),
      deactivateStripePaymentLink: (id) => { deactivated.push(id); },
      saveState: (id) => { saved.push(id); },
    },
    returns: '{ applyInvoicePaid, invoicePaidMethod }',
  });
  return { ...harness, saved, deactivated };
}

/** A store owing 120.50 on one pending consignment sale, invoiced. */
function ledgerFixture() {
  const sale = {
    id: 'led-1', storeId: 7, storeName: 'Riverbend Books', type: 'Sale',
    date: '2026-09-01', qty: 5, rate: 0.6, amountDue: 120.5,
    status: 'pending', paid: 'pending', sheetsId: 'cons-1',
  };
  const mirror = {
    num: 'CONS-1', consignmentLink: true, sheetsId: 'cons-1',
    notes: 'Riverbend Books', date: '2026-09-01', qty: 5,
  };
  const inv = {
    id: 'inv-1', num: 'INV-2026-222', status: 'sent', total: 120.5,
    currency: 'CA$', currencyCode: 'CAD', storeName: 'Riverbend Books', storeId: 7,
    items: [{ description: '5 copies', qty: 5, unitPrice: 24.1, _ledgerId: 'led-1' }],
    stripe: { url: 'https://buy.stripe.com/x', paymentLinkId: 'plink_1' },
  };
  const s = {
    ledger: [sale], hist: [mirror], invoices: [inv],
    stores: [{ id: 7, name: 'Riverbend Books', amountOwed: 120.5 }],
  };
  return { s, inv, sale, mirror };
}

describe('one writer marks an invoice paid', () => {
  it('moves the invoice, the sale, the mirror and the store balance together', () => {
    // The whole point: four records that have to agree, or the consignment
    // balance quietly disagrees with the invoice it came from.
    const { s, inv, sale, mirror } = ledgerFixture();
    const { applyInvoicePaid, saved } = paidHarness();

    expect(applyInvoicePaid(inv, 'hound', s, { chargeId: CHARGE, paidAt: 111 })).toBe(true);

    expect(inv).toMatchObject({ status: 'paid', paidAt: 111, stripeChargeId: CHARGE });
    expect(sale).toMatchObject({ status: 'paid', paid: 'paid' });
    expect(mirror.paidState).toBe('paid');
    expect(s.stores[0].amountOwed).toBe(0);
    expect(saved).toEqual(['hound']);
  });

  it('decrements the store balance exactly once for one sale', () => {
    // An invoice listing the same ledger row twice must not bill the store's
    // balance twice — settleLedgerSalePaid's pending guard is what stops it.
    const { s, inv } = ledgerFixture();
    inv.items.push({ description: 'duplicate line', qty: 5, unitPrice: 24.1, _ledgerId: 'led-1' });
    const { applyInvoicePaid } = paidHarness();

    applyInvoicePaid(inv, 'hound', s, { chargeId: CHARGE });
    expect(s.stores[0].amountOwed).toBe(0);
  });

  it('leaves a voided sale alone', () => {
    const { s, inv, sale } = ledgerFixture();
    sale.voided = true;
    const { applyInvoicePaid } = paidHarness();

    applyInvoicePaid(inv, 'hound', s, { chargeId: CHARGE });
    expect(sale.status).toBe('pending');
    expect(s.stores[0].amountOwed).toBe(120.5);
    // The invoice still settles — the publisher was paid for it either way.
    expect(inv.status).toBe('paid');
  });

  it('does not touch a sale somebody already settled', () => {
    const { s, inv, sale } = ledgerFixture();
    sale.status = 'paid'; sale.paid = 'paid';
    s.stores[0].amountOwed = 0;
    const { applyInvoicePaid } = paidHarness();

    applyInvoicePaid(inv, 'hound', s, { chargeId: CHARGE });
    expect(s.stores[0].amountOwed).toBe(0);
  });

  it('closes the payment link so the same invoice cannot be paid twice', () => {
    const { s, inv } = ledgerFixture();
    const { applyInvoicePaid, deactivated } = paidHarness();

    applyInvoicePaid(inv, 'hound', s, { chargeId: CHARGE });
    expect(deactivated).toEqual(['plink_1']);
  });

  it('stamps no charge id when settled by hand', () => {
    // The stamp means "Stripe charge X settled this". A manual settle has no
    // charge behind it and must not claim one, or the sweep would later think
    // it had already applied a charge it never saw.
    const { s, inv } = ledgerFixture();
    const { applyInvoicePaid } = paidHarness();

    applyInvoicePaid(inv, 'hound', s, {});
    expect(inv.stripeChargeId).toBeUndefined();
    expect(inv.status).toBe('paid');
  });

  it('records how it was paid, and takes the caller’s word when given', () => {
    const { s, inv } = ledgerFixture();
    const { applyInvoicePaid, invoicePaidMethod } = paidHarness();

    applyInvoicePaid(inv, 'hound', s, { method: 'Stripe Checkout' });
    expect(inv.paidMethod).toBe('Stripe Checkout');

    // And works out a sensible answer when not told.
    expect(invoicePaidMethod({ stripe: { url: 'x' } }, {})).toBe('Stripe Checkout');
    expect(invoicePaidMethod({ paymentLink: 'https://paypal.me/x' }, {})).toBe('PayPal');
    expect(invoicePaidMethod({}, { stripeLink: 'https://buy.stripe.com/y' })).toBe('Stripe');
    expect(invoicePaidMethod({}, {})).toBe('Other');
    // A book that is not in BOOKS must not throw on the way to 'Other'.
    expect(invoicePaidMethod({}, undefined)).toBe('Other');
  });

  it('refuses an invoice or a state it was not given', () => {
    const { applyInvoicePaid } = paidHarness();
    expect(applyInvoicePaid(null, 'hound', {})).toBe(false);
    expect(applyInvoicePaid({ id: 'i' }, 'hound', null)).toBe(false);
  });
});

describe('the modal delegates instead of writing its own copy', () => {
  const modal = appSource.slice(
    appSource.indexOf('async function markInvoicePaidFromView'),
    appSource.indexOf('function printInvoice'),
  );

  it('calls the shared writer', () => {
    expect(modal).toContain('applyInvoicePaid(inv, bookId, s)');
  });

  it('no longer writes the paid fields itself', () => {
    // There were already two writers of inv.status = 'paid'; a third by
    // copy-paste is how the invoice and the store's owed balance drift apart.
    expect(modal).not.toContain("inv.status = 'paid'");
    expect(modal).not.toContain('inv.paidAt =');
    expect(modal).not.toContain('settleLedgerSalePaid');
  });

  it('keeps the confirmation it always had', () => {
    // Settling by hand is still a deliberate act; only the background path is
    // allowed to do it without asking.
    expect(modal).toContain('confirmDialog(');
  });
});

describe('the Stripe invoice sweep and money', () => {
  const sweep = appSource.slice(
    appSource.indexOf('async function sweepStripeInvoicePayments'),
    appSource.indexOf('function startStripeInvoiceWatch'),
  );

  it('runs for the publisher only', () => {
    // An author cannot read the Stripe key at all, and must never trigger a
    // global financial mutation.
    expect(sweep).toContain('if (!window.IS_PUBLISHER || isAuthor()) return null;');
  });

  it('acts only on a charge that names an invoice it can find', () => {
    expect(sweep).toContain("if (c.kind !== 'invoice' || !c.inv || !c.bookId) continue;");
    expect(sweep).toContain('classifyStripePayment(payment)');
  });

  it('settles only on the one verdict that authorises it', () => {
    expect(sweep).toContain('judgeInvoicePayment({ payment, invoice: inv })');
    expect(sweep).toContain('if (!verdictSettles(judged.verdict)) continue;');
  });

  it('checks for a reversal before asking the classifier anything', () => {
    // The bug this ordering fixes: classifyStripePayment answers `recorded` for
    // any charge this device already handled, and answers it BEFORE it looks for
    // an invoice number. So a refund of a charge the sweep had settled came back
    // classified as handled, was skipped by the kind check, and the reversal
    // alert the publisher asked for could never fire.
    const reversalAt = sweep.indexOf('payment.refunded || payment.disputed');
    const classifyAt = sweep.indexOf('classifyStripePayment(payment)');
    expect(reversalAt).toBeGreaterThan(0);
    expect(classifyAt).toBeGreaterThan(0);
    expect(reversalAt).toBeLessThan(classifyAt);
  });

  it('finds the reversed charge by the stamp on the invoice, not by the classifier', () => {
    expect(sweep).toContain('_findInvoiceByCharge(payment.id)');
    expect(sweep).toContain('if (cited?.inv) showInvoiceReversalAlert(payment, cited.inv);');
    const finder = appSource.slice(
      appSource.indexOf('function _findInvoiceByCharge'),
      appSource.indexOf('function showInvoiceReversalAlert'),
    );
    expect(finder).toContain('i.stripeChargeId === id');
    // Across every book, because an invoice lives in the book it was written on.
    expect(finder).toContain('Object.keys(states)');
  });

  it('records a short payment instead of only counting it', () => {
    // The publisher asked for it to be recorded and flagged, not just flagged:
    // the money did arrive and is hers, even though the invoice is not settled.
    expect(sweep).toContain('if (verdictNeedsAttention(judged.verdict))');
    expect(sweep).toContain('inv.stripePartPayments.push(buildPartPaymentNote({ payment, judged }))');
    expect(sweep).toContain('attention++');
  });

  it('does not re-raise a dismissed card for the same short payment forever', () => {
    // A short payment changes nothing about the invoice's status, so without a
    // record of having seen it the next poll rediscovers it and pushes the card
    // again — five minutes after she dismissed it, and every five minutes after
    // that. This is the defect fixed in #746, in a new place.
    expect(sweep).toContain('if (partPaymentAlreadyNoted(inv, payment.id)) continue;');
  });

  it('stamps the charge so a second device does not settle it again', () => {
    expect(sweep).toContain('chargeId: payment.id');
    expect(sweep).toContain('saveReconMemory(mem)');
  });

  it('writes its memory of handled charges once, not once per invoice', () => {
    // It is one whole blob in browser storage; re-reading and re-writing it
    // inside the loop earns nothing. Sliced from the loop's first line to the
    // batched write that follows it, so this is the loop body and nothing else —
    // an assertion on index order alone would pass either way.
    const loopBody = sweep.slice(
      sweep.indexOf('for (const payment of payments) {'),
      sweep.indexOf('if (recorded.length) {'),
    );
    expect(loopBody.length).toBeGreaterThan(100);
    expect(loopBody).not.toContain('getReconMemory');
    expect(loopBody).not.toContain('saveReconMemory');
    expect(loopBody).toContain('recorded.push(');
  });

  it('asks Stripe only about the window since it last looked', () => {
    // Without this every poll drags hundreds of charges over to learn nothing.
    expect(sweep).toContain('fetchStripePaymentsForReconcile(1, { since: stripeInvoiceSweepSince() })');
    const fetcher = appSource.slice(
      appSource.indexOf('async function fetchStripePaymentsForReconcile'),
      appSource.indexOf('function _reconRecordedChargeIds'),
    );
    expect(fetcher).toContain("params.set('created[gte]'");
  });

  it('overlaps that window by a day, because a missed payment is silent', () => {
    const since = appSource.slice(
      appSource.indexOf('function stripeInvoiceSweepSince'),
      appSource.indexOf('function showInvoiceReversalAlert'),
    );
    expect(since).toContain('86400000');
  });

  it('repaints once for the whole sweep, not once per invoice', () => {
    // Settling three invoices should not rebuild five views three times.
    const loopEnd = sweep.indexOf('writeStripeInvoiceStamp(Date.now())');
    expect(loopEnd).toBeGreaterThan(0);
    expect(sweep.indexOf('renderInvoices()')).toBeGreaterThan(loopEnd);
    expect(sweep.indexOf('showInvoicePaymentAlert(')).toBeGreaterThan(loopEnd);
  });

  it('says nothing at all on a poll that found nothing', () => {
    expect(sweep).toContain('if (settled || attention) {');
  });

  it('never writes the whole tax document', () => {
    // saveTaxCenter serialises the entire ledger; a background poll that called
    // it would be the defect self-caught in #745, once every five minutes.
    expect(sweep).not.toContain('saveTaxCenter');
  });

  it('reports its own health under its own name', () => {
    expect(sweep).toContain("noteIntegrationSuccess('stripe')");
    expect(sweep).toContain("noteIntegrationFailure('stripe', error");
    expect(sweep).toContain("integrationBackoffMs('stripe'");
  });

  it('runs through the shared scheduler rather than its own timers', () => {
    const start = appSource.slice(
      appSource.indexOf('function startStripeInvoiceWatch'),
      appSource.indexOf('function reconcileDismiss'),
    );
    expect(start).toContain('startWatch(');
    expect(start).toContain('if (_stripeInvoiceWatchStarted');
  });

  it('is started at boot and reachable from the Check now button', () => {
    expect(appSource).toContain('startStripeInvoiceWatch();');
    expect(appSource).toContain("if (id === 'stripe') return sweepStripeInvoicePayments({ force: true });");
  });

  it('marks the Consignment tab when Stripe stops answering', () => {
    expect(indexContent.match(/data-health-badge="stripe"/g)).toHaveLength(2);
    expect(indexContent).toMatch(/data-health-badge="stripe"[^>]*aria-label="[^"]+"/);
  });

  it('can take the publisher to the invoice the card is about', () => {
    const open = appSource.slice(
      appSource.indexOf('function openInvoiceFromAlert'),
      appSource.indexOf('async function sweepStripeInvoicePayments'),
    );
    expect(open).toContain("switchTab('consignment')");
    expect(open).toContain('viewInvoice(invoiceId)');
    // An invoice deleted since the card was raised must not blank the screen.
    expect(open).toContain('if (!found?.inv)');
    expect(appSource).toContain('window.openInvoiceFromAlert = openInvoiceFromAlert;');
  });

  it('shows a figure only when one currency settled', () => {
    const alert = appSource.slice(
      appSource.indexOf('function showInvoicePaymentAlert'),
      appSource.indexOf('function openInvoiceFromAlert'),
    );
    // Adding euros to dollars for a single headline number would be inventing
    // an exchange rate.
    expect(alert).toContain('codes.length === 1');
  });
});

describe('the zero-decimal currency list is named once', () => {
  it('is gone from main.js, which held two identical copies', () => {
    // ¥500 is 500 minor units, not 50000 — a factor of a hundred, not a
    // rounding error, so there must not be a second list to drift from.
    expect(appSource).not.toContain('_STRIPE_ZERO_DECIMAL');
    expect(appSource).toContain('isZeroDecimalCurrency(');
  });
});
