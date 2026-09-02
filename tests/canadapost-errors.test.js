import { describe, it, expect } from 'vitest';
import {
  CANADAPOST_AUTH_CODES,
  CANADAPOST_AUTHORIZATION_CODES,
  CANADAPOST_TRACKING_CODES,
  CANADAPOST_VALIDATION_CODES,
  CANADAPOST_SERVICE_CODES,
  CANADAPOST_SHIPMENT_CODES,
  CANADAPOST_PAYMENT_METHOD_CODES,
  CANADAPOST_MIN_RETRY_MS,
  CANADAPOST_MAX_RETRY_MS,
  CANADAPOST_TOKEN_REFRESH_RETRIES,
  CANADAPOST_FAILURE_CATEGORIES,
  parseCanadaPostMessages,
  classifyCanadaPostCode,
  classifyCanadaPostFailure,
  canadaPostBackoffMs,
} from '../src/lib/canadapost-errors.js';
import { CANADAPOST_THROTTLE_COOLDOWN_MS } from '../src/lib/canadapost-throttle.js';

// ─────────────────────────────────────────────────────────────────────────
// Why this file exists:
//
// Canada Post answers a failure with a list of codes and developer-facing
// descriptions, and the status it arrives with says something different again.
// Judging that at each call site is how an account with no payment method saved
// gets retried nine times and then reported to the publisher as "shipping is
// down" — a whole afternoon spent on the wrong problem.
//
// These tests hold three things. The code says WHAT went wrong; the status says
// whether calling again is safe, which for label creation is the difference
// between one label and two paid-for labels. And whatever the answer, the shop
// owner gets one sentence with no codes in it, because that sentence is the
// entire failure as far as the person at the printer is concerned.
// ─────────────────────────────────────────────────────────────────────────

const body = (...messages) => JSON.stringify({ messages });

// Every jargon word an owner would have to go and look up. The summary is the
// one string in the result that is written for them rather than for a log.
const JARGON = /\b(HTTP|API|OAuth|JSON|token|endpoint|status|retry|throttle|payload|null|undefined|code)\b/i;

describe('placing a message code in its published range', () => {
  it('reads each documented range, including the zero-padded numeric form', () => {
    expect(classifyCanadaPostCode('AA001')).toBe('auth');
    expect(classifyCanadaPostCode('AA006')).toBe('auth');
    expect(classifyCanadaPostCode('AA007')).toBe('authorization');
    expect(classifyCanadaPostCode('AA010')).toBe('authorization');
    expect(classifyCanadaPostCode('003')).toBe('tracking');
    expect(classifyCanadaPostCode('008')).toBe('tracking');
    expect(classifyCanadaPostCode('1128')).toBe('validation');
    expect(classifyCanadaPostCode('1743')).toBe('validation');
    expect(classifyCanadaPostCode('7000')).toBe('service');
    expect(classifyCanadaPostCode('7322')).toBe('service');
    expect(classifyCanadaPostCode('8064')).toBe('shipment');
    expect(classifyCanadaPostCode('9208')).toBe('shipment');
  });

  it('treats a padded code and a bare number as the same code, since Canada Post prints both', () => {
    expect(classifyCanadaPostCode('003')).toBe(classifyCanadaPostCode('3'));
    expect(classifyCanadaPostCode(3)).toBe('tracking');
    expect(classifyCanadaPostCode(1128)).toBe('validation');
    expect(classifyCanadaPostCode('aa004')).toBe('auth');
    expect(classifyCanadaPostCode('  AA008  ')).toBe('authorization');
  });

  it('keeps the lettered codes in their own numbering space', () => {
    // AA1128 is not a validation code spelled oddly; it is a code never seen.
    expect(classifyCanadaPostCode('AA1128')).toBe('unknown');
    expect(classifyCanadaPostCode('ZZ001')).toBe('unknown');
  });

  it('says so plainly rather than guessing at anything outside those ranges', () => {
    for (const code of ['002', 'AA011', '1127', '1744', '6999', '7323', '8063', '9209', '0']) {
      expect(classifyCanadaPostCode(code)).toBe('unknown');
    }
  });

  it('survives being handed nothing, or something that is not a code at all', () => {
    for (const code of ['', '   ', null, undefined, {}, [], NaN, 'BANANA', '12A']) {
      expect(classifyCanadaPostCode(code)).toBe('unknown');
    }
  });

  it('publishes the range bounds instead of leaving them scattered as numbers', () => {
    expect(CANADAPOST_AUTH_CODES).toEqual({ prefix: 'AA', min: 1, max: 6 });
    expect(CANADAPOST_AUTHORIZATION_CODES).toEqual({ prefix: 'AA', min: 7, max: 10 });
    expect(CANADAPOST_TRACKING_CODES).toEqual({ prefix: '', min: 3, max: 8 });
    expect(CANADAPOST_VALIDATION_CODES).toEqual({ prefix: '', min: 1128, max: 1743 });
    expect(CANADAPOST_SERVICE_CODES).toEqual({ prefix: '', min: 7000, max: 7322 });
    expect(CANADAPOST_SHIPMENT_CODES).toEqual({ prefix: '', min: 8064, max: 9208 });
  });
});

describe('reading the messages Canada Post sent', () => {
  it('reads the documented envelope out of a raw response body', () => {
    expect(parseCanadaPostMessages(body(
      { code: '1128', description: 'Postal code is required' },
      { code: '7003', description: 'Service unavailable to that destination' },
    ))).toEqual([
      { code: '1128', description: 'Postal code is required' },
      { code: '7003', description: 'Service unavailable to that destination' },
    ]);
  });

  it('reads a body that has already been parsed, a bare list, and a lone message', () => {
    const one = { code: 'AA004', description: 'Expired' };
    expect(parseCanadaPostMessages({ messages: [one] })).toEqual([one]);
    expect(parseCanadaPostMessages([one])).toEqual([one]);
    expect(parseCanadaPostMessages(one)).toEqual([one]);
  });

  it('keeps a code as text, so a padded code survives the round trip', () => {
    expect(parseCanadaPostMessages(body({ code: '003' }))).toEqual([{ code: '003', description: '' }]);
    expect(parseCanadaPostMessages(body({ code: 1128 }))).toEqual([{ code: '1128', description: '' }]);
  });

  it('returns nothing at all for a body that is not the documented shape', () => {
    // This runs on the failure path already; an exception here would replace a
    // readable Canada Post problem with an unreadable one of our own.
    for (const junk of ['', '   ', null, undefined, 0, 'not json {', '<html>Gateway error</html>', '"a string"', '[]', '{}']) {
      expect(parseCanadaPostMessages(junk)).toEqual([]);
    }
  });

  it('drops entries carrying neither a code nor a description', () => {
    expect(parseCanadaPostMessages(body({}, null, 'text', { description: 'kept' })))
      .toEqual([{ code: '', description: 'kept' }]);
  });
});

describe('deciding whether a failure is worth calling again', () => {
  it('waits and asks again while Canada Post is still working on it', () => {
    const result = classifyCanadaPostFailure({ status: 202 });
    expect(result.category).toBe('pending');
    expect(result.retryable).toBe(true);
    expect(result.retryAfterMs).toBeGreaterThanOrEqual(CANADAPOST_MIN_RETRY_MS);
  });

  it('never repeats a rejected shipment, and keeps the exact wording for the screen', () => {
    const result = classifyCanadaPostFailure({
      status: 400,
      body: body({ code: '1128', description: 'Postal code is required' }),
    });
    expect(result.category).toBe('validation');
    expect(result.retryable).toBe(false);
    expect(result.retryAfterMs).toBe(0);
    expect(result.detail).toBe('Postal code is required');
  });

  it('gets a fresh sign-in and tries once more, but only once', () => {
    const result = classifyCanadaPostFailure({ status: 401, body: body({ code: 'AA004' }) });
    expect(result.category).toBe('auth');
    expect(result.refreshToken).toBe(true);
    expect(result.retryable).toBe(true);
    expect(result.retryLimit).toBe(CANADAPOST_TOKEN_REFRESH_RETRIES);
    expect(result.retryLimit).toBe(1);
  });

  it('stops on a refused request, because repeating it will be refused the same way', () => {
    const result = classifyCanadaPostFailure({ status: 403, body: body({ code: 'AA008' }) });
    expect(result.category).toBe('authorization');
    expect(result.retryable).toBe(false);
    expect(result.refreshToken).toBe(false);
  });

  it('stops when there is nothing on file, which for an old parcel is simply true', () => {
    const result = classifyCanadaPostFailure({ status: 404 });
    expect(result.retryable).toBe(false);
    expect(result.summary).toMatch(/three months/i);
  });

  it('uses the tracking wording when Canada Post names a tracking code itself', () => {
    const result = classifyCanadaPostFailure({ status: 404, body: body({ code: '004' }) });
    expect(result.category).toBe('tracking');
    expect(result.summary).toMatch(/tracking number/i);
  });

  it('waits and tries again when the trouble is at Canada Post end', () => {
    for (const status of [500, 502, 503]) {
      const result = classifyCanadaPostFailure({ status });
      expect(result.category).toBe('outage');
      expect(result.retryable).toBe(true);
      expect(result.retryAfterMs).toBeGreaterThanOrEqual(CANADAPOST_MIN_RETRY_MS);
    }
  });

  it('waits out the whole window when Canada Post is turning calls away', () => {
    const byStatus = classifyCanadaPostFailure({ status: 429 });
    expect(byStatus.category).toBe('throttled');
    expect(byStatus.retryable).toBe(true);
    expect(byStatus.retryAfterMs).toBe(CANADAPOST_THROTTLE_COOLDOWN_MS);

    const byWording = classifyCanadaPostFailure({ status: 200, body: 'Server Rejected by SLM Monitor' });
    expect(byWording.category).toBe('throttled');
  });

  it('does not repeat an answer it could not read, since a second label costs real postage', () => {
    const result = classifyCanadaPostFailure({ status: 0, body: '<html>Gateway error</html>' });
    expect(result.category).toBe('unknown');
    expect(result.retryable).toBe(false);
    expect(result.messages).toEqual([]);
  });

  it('survives being called with nothing at all', () => {
    const result = classifyCanadaPostFailure();
    expect(result.category).toBe('unknown');
    expect(result.retryable).toBe(false);
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('lets the code say what went wrong while the status still decides on trying again', () => {
    // A service code under a plain rejection is a service problem, but it is no
    // more repeatable for being one.
    const result = classifyCanadaPostFailure({ status: 400, body: body({ code: '7003' }) });
    expect(result.category).toBe('service');
    expect(result.retryable).toBe(false);
  });

  it('carries every message through untouched, so nothing Canada Post said is lost', () => {
    const result = classifyCanadaPostFailure({
      status: 400,
      body: body({ code: '1128', description: 'first' }, { code: '1200', description: 'second' }),
    });
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]).toEqual({ code: '1200', description: 'second' });
  });

  it('only ever reports a category it has published', () => {
    const samples = [
      { status: 202 }, { status: 400 }, { status: 401 }, { status: 403 }, { status: 404 },
      { status: 429 }, { status: 500 }, { status: 0 },
      { status: 400, body: body({ code: '9154' }) },
      { status: 400, body: body({ code: '8100' }) },
    ];
    for (const sample of samples) {
      expect(CANADAPOST_FAILURE_CATEGORIES).toContain(classifyCanadaPostFailure(sample).category);
    }
  });
});

describe('an account with no payment method saved', () => {
  it('reads all payment method codes (9153, 9154, 9174) as a billing problem rather than a shipping one', () => {
    for (const code of CANADAPOST_PAYMENT_METHOD_CODES) {
      const result = classifyCanadaPostFailure({ status: 400, body: body({ code: String(code) }) });
      expect(result.category).toBe('payment');
      expect(result.summary).toMatch(/payment|credit card/i);
    }
  });

  it('parses Developer Portal errors array with errorCode 9174 and message', () => {
    const devPortalPayload = JSON.stringify({
      title: 'Validation failed',
      detail: 'Errors occurred while processing the request.',
      errors: [
        {
          errorCode: '9174',
          message: 'To pay by credit card, a default payment card must be indicated on your Canada Post online profile.'
        }
      ]
    });
    const messages = parseCanadaPostMessages(devPortalPayload);
    expect(messages).toHaveLength(1);
    expect(messages[0].code).toBe('9174');
    expect(messages[0].description).toContain('default payment card');

    const failure = classifyCanadaPostFailure({ status: 400, body: devPortalPayload });
    expect(failure.category).toBe('payment');
    expect(failure.retryable).toBe(false);
  });

  it('gives the one of them Canada Post also lists as transient a single retry', () => {
    // Canada Post documents 9153 twice over: as a missing default payment
    // method, and in the retry-after-a-second set. Both readings are honoured
    // rather than one being picked quietly — one retry in case it really was
    // transient, and the payment-method message either way.
    const result = classifyCanadaPostFailure({ status: 400, body: body({ code: '9153' }) });
    expect(result.retryable).toBe(true);
    expect(result.retryLimit).toBe(1);
    expect(result.retryAfterMs).toBeGreaterThanOrEqual(CANADAPOST_MIN_RETRY_MS);
  });

  it('does not retry the other ones at all, because no amount of trying saves a card', () => {
    for (const code of ['9154', '9174']) {
      const result = classifyCanadaPostFailure({ status: 400, body: body({ code }) });
      expect(result.retryable).toBe(false);
      expect(result.retryAfterMs).toBe(0);
    }
  });

  it('still places payment codes in the shipment range they are published in', () => {
    expect(classifyCanadaPostCode('9153')).toBe('shipment');
    expect(classifyCanadaPostCode('9154')).toBe('shipment');
    expect(classifyCanadaPostCode('9174')).toBe('shipment');
  });
});

describe('the sentence the shop owner actually reads', () => {
  const samples = [
    { status: 202 },
    { status: 400, body: body({ code: '1128', description: 'PostalCode: mandatory field missing' }) },
    { status: 401, body: body({ code: 'AA001', description: 'Invalid credentials' }) },
    { status: 403, body: body({ code: 'AA009' }) },
    { status: 404 },
    { status: 404, body: body({ code: '004' }) },
    { status: 429 },
    { status: 500 },
    { status: 400, body: body({ code: '7200' }) },
    { status: 400, body: body({ code: '8500' }) },
    { status: 400, body: body({ code: '9154' }) },
    { status: 0, body: 'nonsense' },
  ];

  it('is one finished sentence in every case, never an empty space on the screen', () => {
    for (const sample of samples) {
      const { summary } = classifyCanadaPostFailure(sample);
      expect(summary.length).toBeGreaterThan(30);
      expect(summary.endsWith('.')).toBe(true);
    }
  });

  it('never puts an error number in front of the owner', () => {
    for (const sample of samples) {
      expect(classifyCanadaPostFailure(sample).summary).not.toMatch(/\d/);
    }
  });

  it('never uses a word the owner would have to go and look up', () => {
    for (const sample of samples) {
      expect(classifyCanadaPostFailure(sample).summary).not.toMatch(JARGON);
    }
  });

  it('keeps Canada Post own wording beside the sentence rather than inside it', () => {
    const result = classifyCanadaPostFailure({
      status: 400,
      body: body({ code: '1128', description: 'PostalCode: mandatory field missing' }),
    });
    expect(result.detail).toBe('PostalCode: mandatory field missing');
    expect(result.summary).not.toContain('PostalCode');
  });
});

describe('how long to wait before trying again', () => {
  it('never comes back sooner than the documented second', () => {
    expect(canadaPostBackoffMs(0)).toBe(CANADAPOST_MIN_RETRY_MS);
    expect(canadaPostBackoffMs(0, 10)).toBe(CANADAPOST_MIN_RETRY_MS);
    expect(canadaPostBackoffMs(-4)).toBe(CANADAPOST_MIN_RETRY_MS);
  });

  it('doubles the wait each time so a busy gateway is left alone', () => {
    expect(canadaPostBackoffMs(1)).toBe(2_000);
    expect(canadaPostBackoffMs(2)).toBe(4_000);
    expect(canadaPostBackoffMs(3)).toBe(8_000);
  });

  it('stops growing, so a batch never looks hung to whoever is waiting on it', () => {
    expect(canadaPostBackoffMs(20)).toBe(CANADAPOST_MAX_RETRY_MS);
    expect(CANADAPOST_MAX_RETRY_MS).toBeLessThanOrEqual(30_000);
  });

  it('falls back to the documented second when handed junk', () => {
    expect(canadaPostBackoffMs('nonsense')).toBe(CANADAPOST_MIN_RETRY_MS);
    expect(canadaPostBackoffMs(undefined, undefined)).toBe(CANADAPOST_MIN_RETRY_MS);
  });
});
