import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  personNameParts,
  normalizeTrackingNumber,
  formatTrackingNumber,
  carrierFromTracking,
  trackingUrlFor,
  isPostageExpense,
  isPostageLinked,
  postageRecipientName,
  scorePostageOrderMatch,
  suggestPostageMatches,
  autoMatchPostage,
  postageLinkPatch,
} from '../src/lib/postage-matching.js';
import { appSource } from './helpers/extract-decl.js';

// The real case this was built for: a Canada Post counter receipt for
// Daniela Dawson, entered by hand in the Tax Centre with no recipient field.
const dawsonReceipt = {
  ref: 'D373183465',
  cat: 'Shipping & Postage',
  desc: 'Canada Post — Tracked Packet - USA postage',
  amount: 15.97,
  currency: 'CAD',
  date: '2026-08-22',
  recipientName: 'DANIELA DAWSON',
};

const orders = [
  { num: '#ABCD-111111', date: '2026-08-21', shipName: 'Daniela Dawson' },
  { num: '#EFGH-222222', date: '2026-08-20', shipName: 'Colin Smith' },
  { num: '#IJKL-333333', date: '2026-08-19', shipName: 'Marcus Dawson' },
];

describe('reading a name off a receipt', () => {
  it('handles the shouty all-caps a shipping label prints', () => {
    expect(personNameParts('DANIELA DAWSON')).toMatchObject({ first: 'daniela', last: 'dawson' });
  });

  it('handles the surname-first form an address export uses', () => {
    expect(personNameParts('Dawson, Daniela')).toMatchObject({ first: 'daniela', last: 'dawson' });
  });

  it('folds accents so one spelling matches the other', () => {
    expect(normalizeName('Zoë Müller')).toBe('zoe muller');
    expect(personNameParts('Zoë Müller').last).toBe('muller');
  });

  it('ignores titles and suffixes on either side', () => {
    expect(personNameParts('Dr. John Barnard Jr.')).toMatchObject({ first: 'john', last: 'barnard' });
  });

  it('treats a lone word as the surname, which is what a one-word entry is', () => {
    expect(personNameParts('Dawson')).toMatchObject({ first: '', last: 'dawson' });
  });

  it('keeps a hyphenated surname whole', () => {
    expect(personNameParts('Mary Jane Okonkwo-Bell').last).toBe('okonkwo-bell');
  });

  it('returns empty parts for junk rather than inventing a name', () => {
    expect(personNameParts('')).toMatchObject({ last: '', tokens: [] });
    expect(personNameParts('   ')).toMatchObject({ last: '' });
  });
});

describe('tracking numbers', () => {
  it('treats the spaced and unspaced forms as the same parcel', () => {
    expect(normalizeTrackingNumber('LE 055 214 725 CA')).toBe('LE055214725CA');
    expect(normalizeTrackingNumber('le055214725ca')).toBe('LE055214725CA');
  });

  it('prints a Canada Post number back in its readable form', () => {
    expect(formatTrackingNumber('le055214725ca')).toBe('LE 055 214 725 CA');
  });

  it('identifies the carrier from the number shape', () => {
    expect(carrierFromTracking('LE055214725CA')).toBe('Canada Post');
    expect(carrierFromTracking('1Z999AA10123456784')).toBe('UPS');
    expect(carrierFromTracking('9400111899223197428490')).toBe('USPS');
  });

  it('says nothing rather than guessing a carrier it cannot recognise', () => {
    // A wrong carrier means a tracking link that 404s for the customer.
    expect(carrierFromTracking('XYZ')).toBe('');
    expect(trackingUrlFor('XYZ')).toBe('');
    expect(trackingUrlFor('')).toBe('');
  });

  it('builds a real tracking page for a Canada Post parcel', () => {
    expect(trackingUrlFor('LE 055 214 725 CA')).toContain('canadapost-postescanada.ca');
    expect(trackingUrlFor('LE 055 214 725 CA')).toContain('LE055214725CA');
  });
});

describe('which ledger rows count as postage', () => {
  it('accepts a counter receipt, not only a Shippo label', () => {
    expect(isPostageExpense(dawsonReceipt)).toBe(true);
  });

  it('ignores an expense from another category', () => {
    expect(isPostageExpense({ ...dawsonReceipt, cat: 'Software & Subscriptions' })).toBe(false);
  });

  it('never treats a refund credit as postage that shipped something', () => {
    expect(isPostageExpense({ ...dawsonReceipt, ref: 'shippo-refund:abc', amount: -15.97 })).toBe(false);
    expect(isPostageExpense({ ...dawsonReceipt, amount: 0 })).toBe(false);
  });

  it('knows a linked receipt from an unlinked one', () => {
    expect(isPostageLinked(dawsonReceipt)).toBe(false);
    expect(isPostageLinked({ shippingMatchStatus: 'matched', shippingOrderNumber: '#ABCD-111111' })).toBe(true);
    // Status without a number is not a link — it would show as matched with
    // nothing behind it.
    expect(isPostageLinked({ shippingMatchStatus: 'matched' })).toBe(false);
  });

  it('reads a name the owner typed into the description', () => {
    expect(postageRecipientName({ desc: 'Canada Post — Daniela Dawson' })).toBe('Daniela Dawson');
  });

  it('does not mistake the tail of an ordinary description for a name', () => {
    expect(postageRecipientName({ desc: 'Canada Post — Tracked Packet - USA postage' })).toBe('');
    expect(postageRecipientName({ desc: 'Postage 15.97' })).toBe('');
  });
});

describe('matching a receipt to its order', () => {
  it('puts the exact name first and calls it confident', () => {
    const [best] = suggestPostageMatches(dawsonReceipt, orders);
    expect(best).toMatchObject({ orderNumber: '#ABCD-111111', tier: 'confident' });
    expect(best.reason).toContain('Name matches exactly');
  });

  it('keeps a same-surname stranger as a weak second, never the pick', () => {
    const matches = suggestPostageMatches(dawsonReceipt, orders);
    const marcus = matches.find(m => m.orderNumber === '#IJKL-333333');
    expect(marcus.tier).toBe('weak');
    expect(marcus.reason).toContain('First name differs');
    expect(matches[0].score).toBeGreaterThan(marcus.score);
  });

  it('matches on the surname alone when the first name was shortened', () => {
    const match = scorePostageOrderMatch({ ...dawsonReceipt, recipientName: 'Dani Dawson' }, orders[0]);
    expect(match.tier).toBe('likely');
    expect(match.reason).toContain('Surname Dawson matches');
    expect(match.reason).toContain('First initial matches');
  });

  it('rejects an order with no name in common', () => {
    expect(scorePostageOrderMatch(dawsonReceipt, orders[1])).toBeNull();
  });

  it('rejects postage bought long after, or well before, the order', () => {
    expect(scorePostageOrderMatch({ ...dawsonReceipt, date: '2026-12-01' }, orders[0])).toBeNull();
    expect(scorePostageOrderMatch({ ...dawsonReceipt, date: '2026-07-01' }, orders[0])).toBeNull();
  });

  it('still matches on the name when a date is unreadable', () => {
    const match = scorePostageOrderMatch({ ...dawsonReceipt, date: '' }, orders[0]);
    expect(match).not.toBeNull();
    expect(match.tier).toBe('confident');
  });

  it('will not offer an order that already has postage against it', () => {
    const matches = suggestPostageMatches(dawsonReceipt, orders, { takenOrderNumbers: ['#ABCD-111111'] });
    expect(matches.every(m => m.orderNumber !== '#ABCD-111111')).toBe(true);
  });

  it('re-ranks against a name typed over the stored one', () => {
    const [best] = suggestPostageMatches(dawsonReceipt, orders, { recipientOverride: 'Colin Smith' });
    expect(best.orderNumber).toBe('#EFGH-222222');
  });
});

describe('linking by name without asking', () => {
  it('links the one receipt whose match is unambiguous', () => {
    const done = autoMatchPostage([dawsonReceipt], orders);
    expect(done.map(p => p.match.orderNumber)).toEqual(['#ABCD-111111']);
  });

  it('refuses when two orders share the name closely enough to be a coin flip', () => {
    const twins = [
      { num: '#AAAA-111111', date: '2026-08-21', shipName: 'Daniela Dawson' },
      { num: '#BBBB-222222', date: '2026-08-20', shipName: 'Daniela Dawson' },
    ];
    expect(autoMatchPostage([dawsonReceipt], twins)).toEqual([]);
  });

  it('refuses when two receipts both want the same order', () => {
    // At most one can be right, and picking either puts real money on the
    // wrong customer.
    const second = { ...dawsonReceipt, ref: 'D999', date: '2026-08-23' };
    expect(autoMatchPostage([dawsonReceipt, second], [orders[0]])).toEqual([]);
  });

  it('refuses a merely likely match', () => {
    expect(autoMatchPostage([{ ...dawsonReceipt, recipientName: 'Dani Dawson' }], orders)).toEqual([]);
  });

  it('leaves a receipt with no readable name alone', () => {
    expect(autoMatchPostage([{ ...dawsonReceipt, recipientName: '', desc: 'Postage' }], orders)).toEqual([]);
  });
});

describe('what a link writes onto the receipt', () => {
  const patch = postageLinkPatch('abcd-111111', {
    recipientName: 'Daniela Dawson',
    trackingNumber: 'LE 055 214 725 CA',
    method: 'recipient-name',
  });

  it('normalizes the order number the way every reader expects', () => {
    expect(patch.shippingOrderNumber).toBe('#ABCD-111111');
    expect(patch.shippingMatchStatus).toBe('matched');
    expect(patch.shippingMatchMethod).toBe('recipient-name');
  });

  it('stores the tracking number with a carrier and an openable link', () => {
    expect(patch.trackingNumber).toBe('LE055214725CA');
    expect(patch.trackingCarrier).toBe('Canada Post');
    expect(patch.trackingUrl).toContain('canadapost');
  });

  it('writes no tracking keys at all when none was given', () => {
    const bare = postageLinkPatch('#ABCD-111111');
    expect('trackingNumber' in bare).toBe(false);
    expect('trackingUrl' in bare).toBe(false);
  });

  it('stores no carrier or URL for a number it cannot place', () => {
    const odd = postageLinkPatch('#ABCD-111111', { trackingNumber: 'REF-12345' });
    expect(odd.trackingNumber).toBe('REF12345');
    expect('trackingCarrier' in odd).toBe(false);
    expect('trackingUrl' in odd).toBe(false);
  });
});

describe('the shipping hub counts every carrier', () => {
  it('feeds all postage into the hub, not only Shippo labels', () => {
    // One filter feeds the P&L, scorecard, ledger and insights. If it narrows
    // back to `shippo:`, a counter receipt silently stops costing anything.
    expect(appSource).toContain('(TAX_CENTER.businessExpenses || []).filter(isPostageExpense)');
    expect(appSource).not.toMatch(/const shippoExpenses = \(TAX_CENTER\.businessExpenses \|\| \[\]\)\.filter\(e => String\(e\?\.ref \|\| ''\)\.startsWith\('shippo:'\)\)/);
  });

  it('offers counter receipts in the order-side link picker too', () => {
    expect(appSource).toContain('isPostageExpense(e) && !isPostageLinked(e)');
  });

  it('exposes the worklist handlers to the inline onclick attributes', () => {
    expect(appSource).toContain('autoMatchPostageReceipts, dismissPostageExpense, scanPostageReceipt, promptLedgerTracking');
  });

  it('puts the tracking number on the order, not only on the receipt', () => {
    expect(appSource).toContain('storeTrackingOnOrder');
    expect(appSource).toMatch(/storeTrackingOnOrder[\s\S]{0,900}entry\.trackingNumber = tracking/);
  });

  it('asks the AI reader for the two fields only a postage receipt carries', () => {
    expect(appSource).toContain('shipRecipient');
    expect(appSource).toContain('shipTracking');
    expect(appSource).toContain('readShippingFieldsFromReceipt');
  });
});
