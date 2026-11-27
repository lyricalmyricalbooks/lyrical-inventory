import { describe, it, expect, vi } from 'vitest';
import { statementDate, statementAmount, parseStatement, plaidLines, applyPlaidSync, mergeLines, matchBankLines, shopWords, describeBankCheck } from '../src/lib/bank-match.js';
import { plaidCall, syncBank } from '../src/lib/bank-link-client.js';
import { fetchReceiptLink, receiptDailySchedule } from '../src/lib/receipt-finder-client.js';

const ENDPOINT = 'https://script.google.com/macros/s/abc/exec';
const reply = body => ({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body });

describe('reading statement dates and amounts', () => {
  it('reads the ways Canadian banks write a day', () => {
    expect(statementDate('2026-11-20')).toBe('2026-11-20');
    expect(statementDate('11/20/2026')).toBe('2026-11-20');
    expect(statementDate('20/11/2026')).toBe('2026-11-20');
    expect(statementDate('03/04/2026', true)).toBe('2026-04-03');
    expect(statementDate('Nov 20, 2026')).toBe('2026-11-20');
    expect(statementDate('20 Nov 2026')).toBe('2026-11-20');
    expect(statementDate('20261120')).toBe('2026-11-20');
    expect(statementDate('02/30/2026')).toBe('');
    expect(statementDate('Balance')).toBe('');
  });
  it('reads amounts with signs, brackets, credits and thousands', () => {
    expect(statementAmount('$1,234.56')).toBe(1234.56);
    expect(statementAmount('(12.00)')).toBe(-12);
    expect(statementAmount('-12.00')).toBe(-12);
    expect(statementAmount('12.00 CR')).toBe(-12);
    expect(statementAmount('1.234,56')).toBe(1234.56);
    expect(statementAmount('')).toBeNull();
    expect(statementAmount('abc')).toBeNull();
  });
});

describe('reading a statement file', () => {
  it('reads an RBC-style file with an amount column (charges negative)', () => {
    const csv = 'Account Type,Account Number,Transaction Date,Cheque Number,Description 1,Description 2,CAD$,USD$\n'
      + 'Chequing,123,11/20/2026,,SQ *PAPER SUPPLY CO,TORONTO,-56.50,\n'
      + 'Chequing,123,11/21/2026,,PAYROLL DEPOSIT,,1000.00,\n'
      + 'Chequing,123,11/22/2026,,AMAZON WEB SERVICES,,,-10.00';
    const { lines, problem } = parseStatement(csv, { fileName: 'rbc.csv' });
    expect(problem).toBe('');
    expect(lines).toEqual([
      expect.objectContaining({ date: '2026-11-20', description: 'SQ *PAPER SUPPLY CO TORONTO', amount: 56.5, currency: 'CAD', source: 'file:rbc.csv' }),
      expect.objectContaining({ date: '2026-11-21', amount: -1000 }),
      expect.objectContaining({ date: '2026-11-22', amount: 10, currency: 'USD' }),
    ]);
  });
  it('reads a TD-style file with no header, debit and credit columns', () => {
    const { lines } = parseStatement('11/20/2026,PAPER CO,56.50,,900.00\n11/21/2026,E-TRANSFER IN,,200.00,1100.00');
    expect(lines.map(l => l.amount)).toEqual([56.5, -200]);
  });
  it('flips a card statement that lists charges as positive', () => {
    const csv = 'Date,Description,Amount\n2026-11-01,A,10.00\n2026-11-02,B,20.00\n2026-11-03,C,30.00\n2026-11-04,PAYMENT THANK YOU,-60.00';
    expect(parseStatement(csv).lines.map(l => l.amount)).toEqual([10, 20, 30, -60]);
  });
  it('keeps two identical charges on the same day apart', () => {
    const { lines } = parseStatement('Date,Description,Debit,Credit\n2026-11-01,COFFEE,4.50,\n2026-11-01,COFFEE,4.50,');
    expect(new Set(lines.map(l => l.id)).size).toBe(2);
    expect(mergeLines(lines, lines)).toHaveLength(2);
  });
  it('explains a file it cannot read', () => {
    expect(parseStatement('hello,world\nfoo,bar').problem).toMatch(/does not look like a bank statement/);
    expect(parseStatement('').problem).toBe('The file is empty.');
  });
});

describe('Plaid transactions', () => {
  const t = (id, extra = {}) => ({ transaction_id: id, date: '2026-11-20', name: 'PAPER CO', amount: 12, iso_currency_code: 'CAD', pending: false, ...extra });
  it('becomes lines, leaving out pending charges', () => {
    expect(plaidLines([t('a'), t('b', { pending: true })], 'RBC')).toEqual([
      { id: 'plaid:a', date: '2026-11-20', description: 'PAPER CO', amount: 12, currency: 'CAD', source: 'bank:RBC' },
    ]);
  });
  it('applies added, changed and removed charges', () => {
    let lines = applyPlaidSync([], { added: [t('a'), t('b')] }, 'RBC');
    lines = applyPlaidSync(lines, { modified: [t('a', { amount: 13 })], removed: ['b'] }, 'RBC');
    expect(lines.map(l => [l.id, l.amount])).toEqual([['plaid:a', 13]]);
  });
});

describe('matching charges to receipts', () => {
  const line = (id, date, description, amount, currency = 'CAD') => ({ id, date, description, amount, currency, source: 'file' });
  const exp = (id, date, vendor, amount, currency = 'CAD', extra = {}) => ({ id, date, vendor, amount, currency, ...extra });

  it('strips the card noise from a bank description', () => {
    expect(shopWords('SQ *PAPER SUPPLY CO #4421 TORONTO')).toBe('paper supply co toronto');
  });

  it('matches the exact amount a few days later, and lists what has no receipt', () => {
    const lines = [line('1', '2026-11-22', 'SQ *PAPER SUPPLY', 56.5), line('2', '2026-11-23', 'UBER TRIP', 13.93), line('3', '2026-11-24', 'DEPOSIT', -100)];
    const result = matchBankLines(lines, [exp('e1', '2026-11-20', 'Paper Supply Co', 56.5), exp('e2', '2026-10-01', 'Old', 13.93)]);
    expect(result.matched).toEqual([expect.objectContaining({ line: lines[0], sure: true, why: 'Same amount, shop and week' })]);
    expect(result.missing.map(l => l.id)).toEqual(['2']);
    expect(describeBankCheck(result)).toBe('1 charge matched to a receipt, 1 with no receipt yet.');
  });

  it('prefers the shop’s name when two receipts share an amount', () => {
    const lines = [line('1', '2026-11-20', 'STAPLES 123', 20)];
    const result = matchBankLines(lines, [exp('a', '2026-11-20', 'Coffee', 20), exp('b', '2026-11-20', 'Staples', 20)]);
    expect(result.matched[0].expense.id).toBe('b');
    expect(result.unmatched.map(e => e.id)).toEqual(['a']);
  });

  it('never uses one receipt for two charges', () => {
    const lines = [line('1', '2026-11-20', 'A', 20), line('2', '2026-11-21', 'A', 20)];
    const result = matchBankLines(lines, [exp('a', '2026-11-20', 'A', 20)]);
    expect(result.matched).toHaveLength(1);
    expect(result.missing).toHaveLength(1);
  });

  it('offers a foreign-currency purchase to confirm, by shop and day', () => {
    const lines = [line('1', '2026-11-21', 'ADOBE SYSTEMS', 27.9)];
    const result = matchBankLines(lines, [exp('a', '2026-11-20', 'Adobe Systems', 19.99, 'USD', { fxRate: 1.4, baseAmount: 27.99 })]);
    expect(result.matched).toEqual([expect.objectContaining({ sure: false, why: 'Same shop, paid in USD' })]);
  });

  it('follows the publisher’s own choices', () => {
    const lines = [line('1', '2026-11-20', 'A', 20), line('2', '2026-11-20', 'TRANSFER', 500)];
    const result = matchBankLines(lines, [exp('a', '2026-11-25', 'Something else', 99)], { links: { 1: 'a', 2: 'none' } });
    expect(result.matched).toEqual([expect.objectContaining({ why: 'You matched these' })]);
    expect(result.missing).toEqual([]);
  });

  it('only looks inside the chosen dates', () => {
    const lines = [line('1', '2026-01-05', 'A', 20), line('2', '2026-11-20', 'B', 30)];
    expect(matchBankLines(lines, [], { from: '2026-11-01' }).missing.map(l => l.id)).toEqual(['2']);
  });
});

describe('talking to the Sheet script', () => {
  it('sends the sign-in with the hourly switch (the script refuses it without one)', async () => {
    const fetchImpl = vi.fn(async () => reply({ ok: true, enabled: true, every: 'hour' }));
    await receiptDailySchedule({ endpoint: ENDPOINT, idToken: 'tok', op: 'status', fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ action: 'receiptDailySchedule', idToken: 'tok' });
  });

  it('downloads a receipt link through the script, and never throws for one it cannot get', async () => {
    const file = vi.fn(async () => reply({ ok: true, file: { mimeType: 'application/pdf', data: 'JVBERi0=' } }));
    expect(await fetchReceiptLink({ endpoint: ENDPOINT, idToken: 't', link: 'https://x.example/r', fetchImpl: file }))
      .toEqual({ file: expect.objectContaining({ mime: 'application/pdf', base64: 'JVBERi0=', name: 'linked-receipt.pdf' }) });
    expect(JSON.parse(file.mock.calls[0][1].body)).toMatchObject({ action: 'receiptLinkFetch', idToken: 't', payload: { link: 'https://x.example/r' } });
    const page = vi.fn(async () => reply({ ok: true, text: 'Total $5.00' }));
    expect(await fetchReceiptLink({ endpoint: ENDPOINT, link: 'https://x.example/r', fetchImpl: page })).toEqual({ text: 'Total $5.00' });
    const no = vi.fn(async () => reply({ ok: false, reason: 'The link needs you to sign in' }));
    expect(await fetchReceiptLink({ endpoint: ENDPOINT, link: 'https://x.example/r', fetchImpl: no })).toEqual({ reason: 'The link needs you to sign in' });
    const down = vi.fn(async () => { throw new TypeError('offline'); });
    expect((await fetchReceiptLink({ endpoint: ENDPOINT, link: 'https://x.example/r', fetchImpl: down })).reason).toBeTruthy();
    expect((await fetchReceiptLink({ endpoint: '', link: 'https://x.example/r' })).reason).toBeTruthy();
  });

  it('pages through a bank’s transactions until there are no more', async () => {
    const pages = [
      { ok: true, added: [{ transaction_id: 'a', date: '2026-11-20', name: 'A', amount: 5, iso_currency_code: 'CAD' }], modified: [], removed: [], nextCursor: 'c1', hasMore: true },
      { ok: true, added: [{ transaction_id: 'b', date: '2026-11-21', name: 'B', amount: 6, iso_currency_code: 'CAD' }], modified: [], removed: [], nextCursor: 'c2', hasMore: false },
    ];
    const fetchImpl = vi.fn(async () => reply(pages.shift()));
    const got = await syncBank({ endpoint: ENDPOINT, idToken: 't', item: { itemId: 'i1', institution: 'RBC' }, cursor: 'c0', fetchImpl });
    expect(got).toMatchObject({ cursor: 'c2', done: true });
    expect(got.lines.map(l => l.id)).toEqual(['plaid:a', 'plaid:b']);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).payload).toEqual({ op: 'sync', itemId: 'i1', cursor: 'c0' });
    await expect(plaidCall({ endpoint: ENDPOINT, op: 'status', fetchImpl: async () => reply({ ok: false, error: 'Plaid said INVALID' }) })).rejects.toThrow('Plaid said INVALID');
  });
});
