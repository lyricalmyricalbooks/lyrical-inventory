import { describe, it, expect, vi } from 'vitest';
import { receiptQuery, receiptMoney, receiptDate, normalizeFoundReceipt, receiptProblems, receiptDuplicate, receiptReviewStatus, receiptExpense, mergeFinderSnapshot, receiptSkipReason, emailSenderName, emailDay, receiptWaitReason } from '../src/lib/receipt-finder.js';
import { createReceiptFinderClient, extractFoundReceipts, decodeGmailBase64, gmailMessage } from '../src/lib/receipt-finder-client.js';
import { flushReceiptOutbox } from '../src/lib/receipt-finder-outbox.js';

const email = { id: 'mail1', account: 'publisher@example.com', fileParts: [{ attachmentId: 'pdf1' }] };
const raw = { vendor: 'Printer', reference: 'INV-1', date: '2026-09-01', currency: 'CAD', amount: 113, subtotal: 100, tax: 13, shipping: 0, confidence: 0.95, paymentStatus: 'paid' };
const draft = overrides => ({ ...normalizeFoundReceipt(raw, email), ...overrides });

describe('receipt discovery and review', () => {
  it('combines date, sender, attachment and category filters, with inclusive end date', () => {
    expect(receiptQuery({ after: '2026-08-01', before: '2026-08-31', sender: 'a" OR from:me', attachments: true, category: 'shipping' }))
      .toContain('after:2026/08/01 before:2026/09/01 from:"a  OR from:me"');
    expect(receiptQuery({ attachments: true })).toContain('filename:pdf');
    expect(receiptQuery({ category: 'invoices' })).toContain('(invoice OR bill)');
  });
  it('looks for receipt-shaped mail by default, and never the publisher\'s own or app notifications', () => {
    // The old default matched "order", "tax" and "shipping" anywhere and buried
    // a real receipt past the 100th result, behind notifications about this app.
    const fallback = receiptQuery({});
    expect(fallback).toContain('category:purchases');
    expect(fallback).toContain('subject:(receipt OR invoice');
    expect(fallback).not.toMatch(/\bOR tax OR order\b/);
    expect(fallback).toContain('-from:me');
    expect(fallback).toContain('-from:notifications@github.com');
    // A typed search replaces the default but keeps the exclusions.
    const typed = receiptQuery({ query: 'anthropic' });
    expect(typed.startsWith('anthropic ')).toBe(true);
    expect(typed).not.toContain('category:purchases');
    expect(typed).toContain('-from:me');
  });
  it.each([['1,234.56', 1234.56], ['1.234,56', 1234.56], ['69,00', 69], ['620,98 €', null], ['$45.00', 45], ['-15,25', -15.25], [null, null], ['', null], ['1,234', null], ['garbage', null]])('parses money %s without guessing', (value, expected) => {
    expect(receiptMoney(value)).toBe(expected);
  });
  it('rejects impossible dates', () => {
    expect(receiptDate('2026-02-30')).toBe('');
    expect(receiptDate('2024-02-29')).toBe('2024-02-29');
  });
  it('keeps incomplete receipts for review, without guessed date, currency or amount', () => {
    const row = normalizeFoundReceipt({ vendor: 'Printer', confidence: 0 }, email);
    expect(row).toMatchObject({ date: '', amount: null, currency: '', confidence: 0, selected: false });
    expect(receiptReviewStatus(row)).toBe('review');
    expect(receiptProblems(row)).toHaveLength(3);
  });
  it('requires human review of low confidence even if complete', () => {
    expect(receiptReviewStatus(draft({ confidence: 0.2 }))).toBe('review');
    expect(receiptReviewStatus(draft({ confidence: 0.2, reviewed: true }))).toBe('ready');
    expect(receiptReviewStatus(draft({ confidence: 0.2, reviewed: true, amount: null }))).toBe('review');
  });
  it('checks subtotal/tax/shipping in minor units', () => {
    expect(receiptProblems(draft({ amount: 0.3, subtotal: 0.1, tax: 0.2, shipping: 0 }))).toEqual([]);
    expect(receiptProblems(draft({ amount: 100 }))).toContain('Subtotal, tax and shipping do not match the total');
  });
  it('preserves payment state and financial detail, rounding converted totals', () => {
    const row = draft({ amount: 113.17, subtotal: null, paymentStatus: 'unpaid', dueDate: '2026-10-01' });
    const expense = receiptExpense(row, 1.333, ['file.pdf']);
    expect(expense).toMatchObject({ amount: 113.17, baseAmount: 150.86, paymentStatus: 'unpaid', dueDate: '2026-10-01', emailMsgId: 'mail1', receipt: 'file.pdf', emailAttachmentIds: ['pdf1'] });
    expect(() => receiptExpense(row, 0)).toThrow('conversion rate');
  });
  it('places PDF/image attachments before the email body and stamps receiptCloudAt only for cloud URLs', () => {
    const row = draft({ attachments: [{ name: 'invoice.pdf', mime: 'application/pdf' }] });
    const localExp = receiptExpense(row, 1, {
      bodyRef: 'local://2026/Other/2026-09-01_Printer_CAD-113.00_2.html',
      attachmentRefs: ['local://2026/Other/2026-09-01_Printer_CAD-113.00.pdf'],
      hasCloud: false,
    });
    expect(localExp.receipt).toBe('local://2026/Other/2026-09-01_Printer_CAD-113.00.pdf');
    expect(localExp.receiptFiles).toEqual([
      'local://2026/Other/2026-09-01_Printer_CAD-113.00.pdf',
      'local://2026/Other/2026-09-01_Printer_CAD-113.00_2.html',
    ]);
    expect(localExp.emailAttachments[0].downloadUrl).toBe('local://2026/Other/2026-09-01_Printer_CAD-113.00.pdf');
    expect(localExp.receiptCloudAt).toBeUndefined();

    const cloudExp = receiptExpense(row, 1, {
      bodyRef: 'https://firebasestorage.googleapis.com/v0/b/x/o/email.txt?alt=media',
      attachmentRefs: [],
      hasCloud: true,
    });
    expect(cloudExp.receipt).toContain('firebasestorage');
    expect(cloudExp.receiptCloudAt).toBeTruthy();
  });
});

describe('receipt duplicates', () => {
  it('does not merge unrelated vendors with the same date and total', () => {
    const expense = receiptExpense(draft(), 1);
    expect(receiptDuplicate(draft({ id: 'other', messageId: 'mail2', vendor: 'Another vendor', reference: '' }), [expense])).toBeNull();
  });
  it('finds a forwarded invoice through vendor and reference', () => {
    const expense = receiptExpense(draft(), 1);
    expect(receiptDuplicate(draft({ id: 'forwarded', messageId: 'mail2' }), [expense])).toBe(expense);
  });
  it('does not discard a second invoice in one email', () => {
    const expense = receiptExpense(draft(), 1);
    const other = draft({ id: 'second', reference: 'INV-2', amount: 200 });
    expect(receiptDuplicate(other, [expense])).toBeNull();
    expect(receiptDuplicate({ ...other, amount: expense.amount }, [expense])).toBeNull();
  });
  it('does not conflate equal message IDs from different mailboxes', () => {
    const expense = receiptExpense(draft(), 1);
    expect(receiptDuplicate(draft({ id: 'second', account: 'someone@example.com', reference: '', vendor: 'Other' }), [expense])).toBeNull();
  });
});

describe('read-only Gmail and protected extraction', () => {
  it('passes the query and pagination token with bearer auth only in headers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [], nextPageToken: 'next' }) });
    const client = createReceiptFinderClient({ token: () => 'secret', fetchImpl });
    await client.list('invoice after:2026/01/01', 'page');
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain('pageToken=page'); expect(url).not.toContain('secret');
    expect(options.headers.Authorization).toBe('Bearer secret');
    expect(options.method).toBeUndefined();
  });
  it('expires access cleanly and never silently falls back to the public Sheets endpoint', async () => {
    const onExpired = vi.fn();
    const client = createReceiptFinderClient({ token: () => 'expired', fetchImpl: async () => ({ status: 401, ok: false }), onExpired });
    await expect(client.profile()).rejects.toThrow('Reconnect'); expect(onExpired).toHaveBeenCalledOnce();
  });
  it('skips an unusable attachment instead of failing the whole email', async () => {
    // One 15 MB scan, or one attachment Gmail will not hand over, used to throw
    // and take the email's body and its other (perfectly readable) invoices
    // down with it. The file is marked and the rest of the email goes on.
    const client = createReceiptFinderClient({ token: () => 'token', fetchImpl: vi.fn() });
    const big = await client.attachment('id', { name: 'big.pdf', size: 13000000 });
    expect(big.base64).toBe(''); expect(big.skipped).toContain('12 MB');
    const missing = await client.attachment('id', { name: 'missing.pdf' });
    expect(missing.skipped).toContain('Could not download');
  });
  it('decodes Gmail base64url correctly', () => {
    expect([...decodeGmailBase64('-_8')]).toEqual([251, 255]);
  });
  it('reads the subject, sender and date whatever case Gmail writes the header names in', () => {
    // Gmail sends "Subject"; matching only "subject" left every email blank,
    // so every set-aside row read "(no subject)".
    const parsed = gmailMessage({ id: 'm', payload: { headers: [
      { name: 'Subject', value: 'Your receipt for $12.00' }, { name: 'FROM', value: 'Kobo <no-reply@kobo.com>' }, { name: 'date', value: 'Tue, 22 Sep 2026 12:00:00 -0400' },
    ], mimeType: 'text/plain', body: { data: '' } } }, 'p@example.com');
    expect(parsed).toMatchObject({ subject: 'Your receipt for $12.00', from: 'Kobo <no-reply@kobo.com>', date: 'Tue, 22 Sep 2026 12:00:00 -0400' });
    // A price only in the subject now keeps the email in for an AI read.
    expect(receiptSkipReason(parsed)).toBe('');
  });
  it('fills a missing vendor and date from the email, and holds the receipt for a check', () => {
    const email = { id: 'e', account: 'p@example.com', from: '"Staples" <orders@staples.ca>', date: 'Tue, 22 Sep 2026 12:00:00 -0400', fileParts: [] };
    const draft = normalizeFoundReceipt({ vendor: '', date: '', amount: 20, currency: 'CAD', confidence: 0.95 }, email);
    expect(draft).toMatchObject({ vendor: 'Staples', date: '2026-09-22', filledFromEmail: ['vendor', 'date'], selected: false });
    expect(receiptReviewStatus(draft)).toBe('review');
    expect(receiptReviewStatus({ ...draft, reviewed: true })).toBe('ready');
    // What the AI found always wins over the email.
    const found = normalizeFoundReceipt({ vendor: 'Staples Business', date: '2026-09-01', amount: 20, currency: 'CAD', confidence: 0.95 }, email);
    expect(found.filledFromEmail).toBeUndefined();
    expect(found).toMatchObject({ vendor: 'Staples Business', date: '2026-09-01' });
  });
  it('names the shop from the sender, never a robot name or a mail service', () => {
    expect(emailSenderName('"Amazon.ca" <auto-confirm@amazon.ca>')).toBe('Amazon.ca');
    expect(emailSenderName('billing@shopify.com')).toBe('Shopify');
    expect(emailSenderName('noreply <no-reply@mail.squareup.com>')).toBe('Squareup');
    expect(emailSenderName('orders@amazon.co.uk')).toBe('Amazon');
    expect(emailSenderName('someone@gmail.com')).toBe('');
    expect(emailDay('not a date')).toBe('');
  });
  it('keeps an inline PDF invoice but drops an inline signature logo', () => {
    // Several suppliers send the invoice as `Content-Disposition: inline`.
    // Dropping every inline part left those emails with nothing to read.
    const inline = name => ({ name: 'Content-Disposition', value: `inline; filename="${name}"` });
    const parsed = gmailMessage({ id: 'm', payload: { headers: [], parts: [
      { filename: 'invoice.pdf', mimeType: 'application/pdf', headers: [inline('invoice.pdf')], body: { attachmentId: 'a1', size: 10 } },
      { filename: 'logo.png', mimeType: 'image/png', headers: [inline('logo.png')], body: { attachmentId: 'a2', size: 10 } },
    ] } }, 'p@example.com');
    expect(parsed.fileParts.map(file => file.name)).toEqual(['invoice.pdf']);
  });
  it('leaves out an attachment type the AI service would reject the whole email over', () => {
    // The service accepts PDFs and a fixed set of image types. One GIF used to
    // make it refuse the email, losing the real PDF invoice alongside it.
    const parsed = gmailMessage({ id: 'm', payload: { headers: [], parts: [
      { filename: 'invoice.pdf', mimeType: 'application/pdf', body: { attachmentId: 'a1', size: 10 } },
      { filename: 'banner.gif', mimeType: 'image/gif', body: { attachmentId: 'a2', size: 10 } },
      { filename: 'scan.jpg', mimeType: 'image/jpeg; name="scan.jpg"', body: { attachmentId: 'a3', size: 10 } },
    ] } }, 'p@example.com');
    expect(parsed.fileParts.map(file => file.name)).toEqual(['invoice.pdf', 'scan.jpg']);
    expect(parsed.fileParts[1].mime).toBe('image/jpeg');
  });
  it('pads base64url bytes into the form the script’s allow-list accepts', async () => {
    const allowList = /^[A-Za-z0-9+/]*={0,2}$/;
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, receipts: [] }) }));
    await extractFoundReceipts({ endpoint: 'https://script.google.com/macros/s/test/exec', idToken: 'id', fetchImpl,
      email: { ...email, body: 'receipt', fileParts: [{ name: 'a.pdf', mime: 'application/pdf', base64: 'ab-_cd' }] } });
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(sent.files[0].inlineData.data).toMatch(allowList);
    expect(sent.files[0].inlineData.data).toBe('ab+/cd==');
  });
  it('sends one body both the Sheet script and an older standalone deployment can read', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, receipts: [] }) }));
    await extractFoundReceipts({ endpoint: 'https://script.google.com/macros/s/test/exec', idToken: 'id', fetchImpl,
      email: { ...email, body: 'receipt', fileParts: [] } });
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    // The Sheet script routes on `action`; the standalone one reads the same
    // fields straight off the top level. Nesting them would double the files.
    expect(sent).toMatchObject({ version: 2, action: 'extractReceipt', idToken: 'id' });
    expect(sent.email.body).toBe('receipt');
    expect(sent.payload).toBeUndefined();
  });
  it('rejects non-Apps Script extraction URLs before sending an ID token', async () => {
    const fetchImpl = vi.fn();
    await expect(extractFoundReceipts({ endpoint: 'https://attacker.example', idToken: 'id', email, fetchImpl })).rejects.toThrow('Google Sheet script');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('retains malformed AI responses as failures, not empty successful scans', async () => {
    await expect(extractFoundReceipts({ endpoint: 'https://script.google.com/macros/s/test/exec', idToken: 'id',
      email: { ...email, body: 'receipt', fileParts: [] }, fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true }) }) })).rejects.toThrow('invalid response');
  });
});

describe('durable import outbox', () => {
  it('preserves another tab’s drafts, edits, completed scans and import acknowledgements', () => {
    const previous = { drafts: [draft({ id: 'first', status: 'imported', updatedAt: 2 }), draft({ id: 'other-tab', updatedAt: 3 })], scans: { m1: { done: true } }, emails: {} };
    const incoming = { drafts: [draft({ id: 'first', status: 'queued', updatedAt: 9 }), draft({ id: 'new', updatedAt: 4 })], scans: { m1: { error: 'stale failure' } }, emails: {} };
    const merged = mergeFinderSnapshot(previous, incoming);
    expect(merged.drafts.map(row => row.id)).toEqual(['first', 'other-tab', 'new']);
    expect(merged.drafts[0].status).toBe('imported'); expect(merged.scans.m1.done).toBe(true);
  });
  function fixture(overrides = {}) {
    const row = draft({ status: 'queued' });
    const state = { drafts: [row], emails: { [`${email.account}:${email.id}`]: email } };
    const deps = { canSync: () => true, expenses: () => [], rate: async () => 1, files: async () => ['receipt.pdf'],
      commit: vi.fn(async expense => ({ expense })), accept: vi.fn(), save: vi.fn(async () => {}), render: vi.fn(), ...overrides };
    return { state, row, deps };
  }
  it('leaves queued records untouched offline', async () => {
    const { state, row, deps } = fixture({ canSync: () => false });
    await flushReceiptOutbox(state, deps); expect(row.status).toBe('queued'); expect(deps.commit).not.toHaveBeenCalled();
  });
  it('does not invent an FX rate or lose the pending receipt', async () => {
    const { state, row, deps } = fixture({ rate: async () => null });
    await flushReceiptOutbox(state, deps); expect(row.status).toBe('queued'); expect(row.error).toContain('conversion'); expect(deps.commit).not.toHaveBeenCalled();
  });
  it('retains source-upload failures for retry', async () => {
    const { state, row, deps } = fixture({ files: async () => { throw new Error('Upload failed'); } });
    await flushReceiptOutbox(state, deps); expect(row.status).toBe('queued'); expect(row.error).toBe('Upload failed');
    expect(deps.commit).not.toHaveBeenCalled();
  });
  it('acknowledges only after commit, and does not submit acknowledged rows twice', async () => {
    const { state, row, deps } = fixture();
    await flushReceiptOutbox(state, deps); await flushReceiptOutbox(state, deps);
    expect(row.status).toBe('imported'); expect(deps.commit).toHaveBeenCalledOnce(); expect(deps.accept).toHaveBeenCalledOnce();
  });
  it('keeps a subscription receipt with its charge instead of filing a second expense', async () => {
    const attach = vi.fn(async () => {});
    const { state, row, deps } = fixture({ subscription: vi.fn(async () => ({ kind: 'attach', attach })) });
    await flushReceiptOutbox(state, deps);
    expect(attach).toHaveBeenCalledWith(['receipt.pdf']);
    expect(deps.commit).not.toHaveBeenCalled();
    expect(row.status).toBe('imported');
  });
  it('skips a second copy of a subscription receipt, and holds one only the owner can place', async () => {
    const skip = fixture({ subscription: async () => ({ kind: 'skip' }) });
    await flushReceiptOutbox(skip.state, skip.deps);
    expect(skip.row.status).toBe('imported'); expect(skip.deps.commit).not.toHaveBeenCalled();

    const hold = fixture({ subscription: async () => ({ kind: 'hold', message: 'Amount differs from the subscription' }) });
    await flushReceiptOutbox(hold.state, hold.deps);
    expect(hold.row.status).toBe('queued'); expect(hold.row.error).toBe('Amount differs from the subscription');
    expect(hold.deps.commit).not.toHaveBeenCalled();
  });
  it('continues after one receipt fails', async () => {
    const { state, deps } = fixture();
    state.drafts.push(draft({ id: 'second', reference: 'INV-2', status: 'queued' }));
    deps.commit.mockRejectedValueOnce(new Error('Network lost'));
    await flushReceiptOutbox(state, deps);
    expect(state.drafts.map(row => row.status)).toEqual(['queued', 'imported']);
  });
  it('holds the receipt and never commits an attachmentless expense when no file can be saved', async () => {
    const { state, row, deps } = fixture({ files: async () => ({ bodyRef: '', attachmentRefs: [], hasCloud: false }) });
    await flushReceiptOutbox(state, deps);
    expect(row.status).toBe('queued');
    expect(row.error).toContain('Could not save the receipt file');
    expect(deps.commit).not.toHaveBeenCalled();
  });
});

describe('receipt finder — a date that has not happened yet', () => {
  it('sends an invoice dated in the future to review instead of filing it', async () => {
    const { receiptProblems } = await import('../src/lib/receipt-finder.js');
    const base = { vendor: 'Lulu', currency: 'CAD', amount: 20, subtotal: null, tax: null, shipping: null };
    const next = new Date(); next.setDate(next.getDate() + 30);
    const future = next.toISOString().slice(0, 10);
    expect(receiptProblems({ ...base, date: future })).toContain('Invoice date is in the future — check the day, month and year');
    expect(receiptProblems({ ...base, date: '2026-01-15' })).toEqual([]);
  });
});


describe('why a receipt waits', () => {
  const base = { vendor: 'Paper Supply Co', date: '2026-11-20', currency: 'CAD', amount: 169.5, subtotal: 150, tax: 19.5, confidence: 0.95, lineItems: [] };
  it('names the first thing holding it back in a few words', () => {
    expect(receiptWaitReason({ ...base }, 'review')).toEqual({ text: 'No GST/HST number', tone: 'amber' });
    expect(receiptWaitReason({ ...base, supplierTaxNumber: '123456789RT0001', lineItems: [{ description: 'Paper', amount: 140 }] }, 'review').text).toBe('Line items don’t add up');
    expect(receiptWaitReason({ ...base, vendor: '' }, 'review').text).toBe('Shop name missing');
    expect(receiptWaitReason({ ...base, supplierTaxNumber: 'x', currency: 'USD', tax: null, subtotal: null }, 'review')).toEqual({ text: 'Confirm the currency', tone: 'blue' });
  });
  it('uses the status itself once nothing is in the way', () => {
    expect(receiptWaitReason(base, 'duplicate')).toEqual({ text: 'Same order as another', tone: 'red' });
    expect(receiptWaitReason(base, 'ready').text).toBe('Ready');
    expect(receiptWaitReason(base, 'ignored')).toEqual({ text: 'Dismissed', tone: 'gray' });
  });
});
