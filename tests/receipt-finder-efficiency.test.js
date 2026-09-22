// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { receiptWorthReading, mergeFinderSnapshot } from '../src/lib/receipt-finder.js';
import { compactEmailText, emailHtmlText, gmailMessage, parseReceiptJson, receiptBodyForAi, systemicReceiptFailure,
  createReceiptFinderClient } from '../src/lib/receipt-finder-client.js';

const b64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const utf8 = text => b64(new TextEncoder().encode(text));
const message = parts => ({ id: 'm1', payload: { headers: [{ name: 'Subject', value: 'Your receipt' }], mimeType: 'multipart/alternative', parts } });

describe('reading email text cheaply', () => {
  it('drops invisible preview padding and collapses blank space', () => {
    expect(compactEmailText('Hi‌͏ ‌­\n\n\n   Total   $5.00  ')).toBe('Hi\nTotal $5.00');
  });

  it('keeps table cells apart so amounts stay next to their labels', () => {
    const text = emailHtmlText('<style>.x{}</style><table><tr><td>Subtotal</td><td>$10.00</td></tr><tr><td>Tax</td><td>$1.30</td></tr></table>');
    expect(text).toBe('Subtotal $10.00\nTax $1.30');
  });

  it('reads the HTML part when the plain-text part is only a "view in browser" stub', () => {
    const email = gmailMessage(message([
      { mimeType: 'text/plain', body: { data: utf8('View this email in your browser.') } },
      { mimeType: 'text/html', body: { data: utf8('<p>Order total</p><p>CA$42.00</p>') } },
    ]), 'me@example.com');
    expect(email.body).toBe('Order total\nCA$42.00');
  });

  it('reads a Latin-1 receipt without turning £ into a replacement mark', () => {
    const email = gmailMessage(message([{ mimeType: 'text/html',
      headers: [{ name: 'Content-Type', value: 'text/html; charset="ISO-8859-1"' }],
      body: { data: b64([0x3c, 0x70, 0x3e, 0xa3, 0x35, 0x2e, 0x30, 0x30, 0x3c, 0x2f, 0x70, 0x3e]) } }]), 'me@example.com');
    expect(email.body).toBe('£5.00');
  });

  it('cuts the covering note down when an attached file is the invoice', () => {
    const long = 'a'.repeat(20000);
    expect(receiptBodyForAi(long, false)).toBe(long);
    const trimmed = receiptBodyForAi(long, true);
    expect(trimmed.length).toBeLessThan(6100);
    expect(trimmed).toContain('[Middle omitted]');
  });
});

describe('deciding what is worth an AI read', () => {
  it('skips mail with no amount and nothing attached', () => {
    expect(receiptWorthReading({ subject: 'Your parcel shipped', body: 'Track it here', fileParts: [] })).toBe(false);
    expect(receiptWorthReading({ subject: 'Order #4412 confirmed', body: 'Thanks!', fileParts: [] })).toBe(false);
  });

  it('keeps anything with an amount or an attachment', () => {
    expect(receiptWorthReading({ subject: '', body: 'Total: 12.50', fileParts: [] })).toBe(true);
    expect(receiptWorthReading({ subject: 'Payment of CAD 40', body: '', fileParts: [] })).toBe(true);
    expect(receiptWorthReading({ subject: 'Paiement', body: '1 234,56 €', fileParts: [] })).toBe(true);
    expect(receiptWorthReading({ subject: 'Reçu', body: 'Montant : 12,50 $', fileParts: [] })).toBe(true);
    expect(receiptWorthReading({ subject: 'Invoice', body: 'Attached.', fileParts: [{ name: 'inv.pdf' }] })).toBe(true);
  });
});

describe('hostile email text cannot stall a scan', () => {
  // Both checks used to take the square of the input's length on these shapes:
  // 100,000 characters meant well over the test timeout. Linear now.
  it('checks a very long run of digits for an amount at once', () => {
    const started = performance.now();
    expect(receiptWorthReading({ subject: '', body: '1'.repeat(100000), fileParts: [] })).toBe(false);
    expect(receiptWorthReading({ subject: '', body: 'total ' + '1,'.repeat(50000), fileParts: [] })).toBe(false);
    expect(receiptWorthReading({ subject: '', body: '1'.repeat(100000) + ' $', fileParts: [] })).toBe(true);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('cleans a long padded AI answer at once', () => {
    const started = performance.now();
    expect(() => parseReceiptJson('a' + ' '.repeat(100000) + 'x')).toThrow(/could not be read/);
    expect(parseReceiptJson('```json\n{"receipts":[]}' + ' '.repeat(100000) + '```')).toEqual({ receipts: [] });
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('recognising a failure that would repeat on every email', () => {
  it('stops for a lapsed Gmail connection', () => {
    expect(systemicReceiptFailure(Object.assign(new Error('Gmail access expired.'), { stopsScan: true }))).toBe('Gmail access expired.');
  });

  it('stops for an in-app AI key refusal or spent allowance, reported by status', () => {
    expect(systemicReceiptFailure(Object.assign(new Error('HTTP 429 from gemini-2.5-flash'), { status: 429 }))).toMatch(/usage limit/);
    expect(systemicReceiptFailure(Object.assign(new Error('OpenRouter: the backup key was rejected'), { status: 401 }))).toMatch(/refused/);
    expect(systemicReceiptFailure(new Error('API key not valid. Please pass a valid API key.'))).toMatch(/refused/);
  });

  it('still recognises the script’s own wording, as text or as an error', () => {
    expect(systemicReceiptFailure('Receipt AI is unavailable (429). Retry later.')).toMatch(/allowance/);
    expect(systemicReceiptFailure(Object.assign(new Error('friendly text'), { systemic: 'Key refused.' }))).toBe('Key refused.');
  });

  it('leaves a problem with one email to that email', () => {
    expect(systemicReceiptFailure(new Error('This email is too large for AI extraction.'))).toBeNull();
    expect(systemicReceiptFailure(Object.assign(new Error('Unsupported file'), { status: 400 }))).toBeNull();
  });
});

describe('reading the AI answer', () => {
  it('accepts JSON wrapped in a code fence or surrounding words', () => {
    expect(parseReceiptJson('```json\n{"receipts":[]}\n```')).toEqual({ receipts: [] });
    expect(parseReceiptJson('Here you go: {"receipts":[{"vendor":"A"}]} Done.')).toEqual({ receipts: [{ vendor: 'A' }] });
  });

  it('says plainly when the answer is not JSON at all', () => {
    expect(() => parseReceiptJson('Sorry, I cannot help')).toThrow(/could not be read/);
  });
});

describe('talking to Gmail', () => {
  const ok = body => ({ ok: true, status: 200, json: async () => body });
  const fail = (status, body = {}, headers = {}) => ({ ok: false, status, json: async () => body, headers: { get: key => headers[key] ?? null } });

  it('waits and retries when Gmail is briefly rate-limiting', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(fail(429, {}, { 'retry-after': '2' }))
      .mockResolvedValueOnce(fail(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }))
      .mockResolvedValueOnce(ok({ emailAddress: 'me@example.com' }));
    const pause = vi.fn(async () => {});
    const client = createReceiptFinderClient({ token: () => 't', fetchImpl, pause });
    await expect(client.profile()).resolves.toEqual({ emailAddress: 'me@example.com' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(pause.mock.calls[0][0]).toBe(2000);
  });

  it('marks a lapsed or refused connection so the scan can stop', async () => {
    const onExpired = vi.fn();
    const expired = createReceiptFinderClient({ token: () => 't', fetchImpl: async () => fail(401), onExpired });
    await expect(expired.profile()).rejects.toMatchObject({ stopsScan: true, status: 401 });
    expect(onExpired).toHaveBeenCalled();
    const refused = createReceiptFinderClient({ token: () => 't', fetchImpl: async () => fail(403, { error: { errors: [{ reason: 'insufficientPermissions' }] } }) });
    await expect(refused.profile()).rejects.toMatchObject({ stopsScan: true, status: 403 });
  });

  it('keeps a Gmail server error with its one email instead of stopping every scan on it', async () => {
    const client = createReceiptFinderClient({ token: () => 't', fetchImpl: async () => fail(500), pause: async () => {} });
    const error = await client.profile().catch(e => e);
    expect(error.status).toBe(500);
    expect(error.stopsScan).toBe(false);
    expect(systemicReceiptFailure(error)).toBeNull();
  });

  it('asks Gmail only for the fields it reads', async () => {
    const fetchImpl = vi.fn(async () => ok({ messages: [] }));
    await createReceiptFinderClient({ token: () => 't', fetchImpl }).list('receipt', '');
    expect(fetchImpl.mock.calls[0][0]).toContain('fields=messages%2Fid%2CnextPageToken');
  });
});

describe('saving the mailbox without undoing deletions', () => {
  const stored = () => ({ drafts: [], emails: { 'a:1': { body: 'big', fileParts: [] }, 'a:2': { body: 'kept' } },
    scans: { 'a:1': { error: 'x' }, 'a:2': { done: true }, 'a:3': { error: 'y' } } });

  it('still never treats a key missing from this tab as deleted', () => {
    const merged = mergeFinderSnapshot(stored(), { drafts: [], emails: {}, scans: {} });
    expect(Object.keys(merged.scans)).toEqual(['a:1', 'a:2', 'a:3']);
    expect(Object.keys(merged.emails)).toEqual(['a:1', 'a:2']);
  });

  it('removes what is named as removed, and never stores the list itself', () => {
    const merged = mergeFinderSnapshot(stored(), { drafts: [], emails: {}, scans: {}, removed: { emails: ['a:1'], scans: ['a:1', 'a:3'] } });
    expect(Object.keys(merged.emails)).toEqual(['a:2']);
    expect(Object.keys(merged.scans)).toEqual(['a:2']);
    expect(merged.removed).toBeUndefined();
  });

  it('keeps a finished read, and a key re-read after it was removed', () => {
    const merged = mergeFinderSnapshot(stored(), { drafts: [], emails: { 'a:1': { body: 'new' } }, scans: { 'a:1': { done: true } },
      removed: { emails: ['a:1'], scans: ['a:1', 'a:2'] } });
    expect(merged.emails['a:1'].body).toBe('new');
    expect(merged.scans['a:1'].done).toBe(true);
    expect(merged.scans['a:2'].done).toBe(true);
  });
});
