import { describe, expect, it } from 'vitest';
import {
  SHIPPING_EMAIL_SENDERS,
  extractAmount,
  extractCurrency,
  extractTrackingNumber,
  looksLikeShippingEmail,
  parseShippingEmail,
  shippingEmailQuery,
} from '../src/lib/shipping-email.js';

describe('the Gmail search for carrier mail', () => {
  it('asks by sender and by subject', () => {
    const query = shippingEmailQuery();
    expect(query).toContain('from:canadapost.ca');
    expect(query).toContain('from:ups.com');
    expect(query).toContain('subject:"shipping label"');
  });

  it('narrows to what has arrived since a date', () => {
    // Without this a background scan reads the same history every run.
    expect(shippingEmailQuery({ since: '2026-09-01' })).toContain('after:2026/09/01');
  });

  it('drops a date it cannot render, rather than sending a broken search', () => {
    expect(shippingEmailQuery({ since: 'last week' })).not.toContain('after:');
    expect(shippingEmailQuery({ since: '' })).not.toContain('after:');
  });

  it('takes an extra sender for a carrier not on the list', () => {
    expect(shippingEmailQuery({ extraSenders: ['someregional.example'] }))
      .toContain('from:someregional.example');
  });

  it('covers the carriers this shop actually uses', () => {
    expect(SHIPPING_EMAIL_SENDERS).toContain('canadapost.ca');
    expect(SHIPPING_EMAIL_SENDERS).toContain('ups.com');
  });
});

describe('finding a tracking number', () => {
  it('reads the common carrier shapes', () => {
    expect(extractTrackingNumber('Your tracking number is EE123456789CA.')).toBe('EE123456789CA');
    expect(extractTrackingNumber('Tracking: 1Z999AA10123456784')).toBe('1Z999AA10123456784');
    expect(extractTrackingNumber('Ref 9400111899223197428490')).toBe('9400111899223197428490');
  });

  it('reads a Canada Post number written with spaces', () => {
    expect(extractTrackingNumber('EE 123 456 789 CA')).toBe('EE123456789CA');
  });

  it('discards a number whose carrier it cannot identify', () => {
    // A wrong carrier becomes a tracking link that 404s and a customer told to
    // look in the wrong place, so an unattributable number is no number.
    expect(extractTrackingNumber('Order 12345 confirmed')).toBe('');
    expect(extractTrackingNumber('Invoice ABC-123')).toBe('');
  });

  it('finds nothing in nothing', () => {
    expect(extractTrackingNumber('')).toBe('');
    expect(extractTrackingNumber(null)).toBe('');
  });
});

describe('finding the amount', () => {
  it('reads a labelled total', () => {
    expect(extractAmount('Total charged: $24.10')).toBe(24.1);
    expect(extractAmount('Amount paid CAD 18.45')).toBe(18.45);
    expect(extractAmount('Postage cost: 9.99')).toBe(9.99);
    expect(extractAmount('Grand Total  $1,234.56')).toBe(1234.56);
  });

  it('refuses a bare figure with nothing saying what it is', () => {
    // A loose $24.10 is as likely to be a subtotal, a discount or a footer
    // price as the postage. Guessing puts a wrong number in the ledger; a blank
    // gets flagged and looked at.
    expect(extractAmount('Thanks for shipping with us. $24.10')).toBeNull();
    expect(extractAmount('Save 20% on your next order — $5.00 off')).toBeNull();
  });

  it('answers null rather than zero when it finds nothing', () => {
    expect(extractAmount('See attached for pricing')).toBeNull();
    expect(extractAmount('')).toBeNull();
  });

  it('spots a US-dollar quote', () => {
    expect(extractCurrency('Total charged: USD 24.10')).toBe('USD');
    expect(extractCurrency('Total charged: $24.10')).toBe('CAD');
  });
});

describe('deciding an email is shipping mail', () => {
  it('accepts one carrying a real tracking number', () => {
    expect(looksLikeShippingEmail({ subject: 'Your label', body: 'EE123456789CA' })).toBe(true);
  });

  it('rejects mail that merely mentions shipping', () => {
    // The storefront's own order confirmations say "shipping" too, and they are
    // handled by an entirely different path.
    expect(looksLikeShippingEmail({ subject: 'Your order has shipped!', body: 'Thanks for your order' })).toBe(false);
    expect(looksLikeShippingEmail({ subject: 'Save on shipping', body: 'Free shipping this week' })).toBe(false);
  });
});

describe('reading one carrier email without an AI', () => {
  const email = {
    subject: 'Your Canada Post shipping label',
    body: 'Tracking number: EE 123 456 789 CA\nTotal charged: $18.45\nThank you.',
    date: '2026-09-02T10:00:00Z',
    from: 'no-reply@canadapost.ca',
  };

  it('gets the number, the carrier, the total and the day', () => {
    expect(parseShippingEmail(email)).toMatchObject({
      trackingNumber: 'EE123456789CA',
      carrier: 'Canada Post',
      amount: 18.45,
      currency: 'CAD',
      date: '2026-09-02',
    });
  });

  it('files a label whose total it could not find', () => {
    const parsed = parseShippingEmail({ ...email, body: 'Tracking number: EE123456789CA. See attached.' });
    expect(parsed.trackingNumber).toBe('EE123456789CA');
    expect(parsed.amount).toBeNull();
  });

  it('gives up rather than half-reading, so the AI can try instead', () => {
    expect(parseShippingEmail({ subject: 'Your label', body: 'Attached.' })).toBeNull();
    expect(parseShippingEmail({})).toBeNull();
  });

  it('never guesses who the parcel went to', () => {
    // A carrier email names the shop as often as the buyer, and a wrong
    // recipient does not fail loudly — it links the postage to the wrong
    // customer's order. The tracking number is the better match signal.
    const parsed = parseShippingEmail({
      ...email,
      body: `${email.body}\nShip from: Lyricalmyrical Books\nAttn: Dana Okafor`,
    });
    expect(parsed.recipientName).toBe('');
    expect(parsed.recipientPostal).toBe('');
  });

  it('names itself from the carrier it identified', () => {
    expect(parseShippingEmail({ subject: '', body: '1Z999AA10123456784' }).desc).toBe('UPS label');
  });
});
