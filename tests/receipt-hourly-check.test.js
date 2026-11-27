import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

// The hourly receipt check in the Google Sheet script (v60), run for real in a
// sandbox with Gmail, Firestore and Gemini stood in for.
const source = fs.readFileSync(path.resolve('apps-script/Code.gs'), 'utf8');
const NOW = Date.parse('2026-11-27T12:00:00Z');
class PinnedDate extends Date {
  constructor(...args) { if (args.length) super(...args); else super(NOW); }
  static now() { return NOW; }
}

function hourly({ properties = {}, messages = [], receipts = [{ vendor: 'Printer', amount: 42, currency: 'CAD', date: '2026-11-27' }], aiStatus = 200, senders = null, triggers = [] } = {}) {
  const props = { GEMINI_API_KEY: 'server-secret', ...properties };
  const written = [], searches = [], aiCalls = [], created = [];
  const ctx = vm.createContext({
    Date: PinnedDate,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => (key in props ? props[key] : null),
      setProperty: (key, value) => { props[key] = value; },
    }) },
    UrlFetchApp: { fetch: (url, options = {}) => {
      url = String(url);
      if (url.startsWith('https://firestore.googleapis.com/') && url.endsWith('/settings/receiptSenders')) {
        return { getResponseCode: () => (senders ? 200 : 404),
          getContentText: () => JSON.stringify({ fields: { data: { stringValue: JSON.stringify(senders || {}) } } }) };
      }
      if (url.startsWith('https://firestore.googleapis.com/') && url.endsWith('/settings/taxCenter')) {
        return { getResponseCode: () => 404, getContentText: () => '{}' };
      }
      if (url.startsWith('https://firestore.googleapis.com/')) {
        written.push(JSON.parse(JSON.parse(options.payload).fields.data.stringValue));
        return { getResponseCode: () => 200, getContentText: () => '{}' };
      }
      aiCalls.push({ url, body: JSON.parse(options.payload) });
      return { getResponseCode: () => aiStatus, getContentText: () => JSON.stringify({ candidates: [{ finishReason: 'STOP',
        content: { parts: [{ text: JSON.stringify({ receipts: typeof receipts === 'function' ? receipts(aiCalls.length) : receipts }) }] } }] }) };
    } },
    GmailApp: { search: (q) => { searches.push(q); return [messages]; }, getMessagesForThreads: threads => threads },
    ScriptApp: {
      getOAuthToken: () => 'owner-token',
      getProjectTriggers: () => triggers,
      deleteTrigger: t => { triggers.splice(triggers.indexOf(t), 1); },
      newTrigger: name => ({ timeBased: () => ({
        everyHours: n => ({ create: () => { created.push({ name, every: n + 'h' }); triggers.push({ getHandlerFunction: () => name }); } }),
        atHour: hour => ({ everyDays: () => ({ create: () => { created.push({ name, hour }); triggers.push({ getHandlerFunction: () => name }); } }) }),
      }) }),
    },
    Utilities: { formatDate: date => date.toISOString().slice(0, 10), base64Encode: () => 'AAAA' },
    Session: { getScriptTimeZone: () => 'UTC' },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getName: () => 'Ledger' }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
    console,
  });
  vm.runInContext(source, ctx);
  vm.runInContext("verifyFirebaseCaller_ = () => ({ uid: \"p\" }); requirePublisher_ = verifyFirebaseCaller_;", ctx);
  const status = () => JSON.parse(props.RECEIPT_DAILY_STATUS || '{}');
  return { ctx, props, written, searches, aiCalls, created, triggers, status };
}

const mail = (when, { id, subject = 'Your receipt', from = 'Printer <billing@printer.ca>', body = 'Total $42.00', html = '', attachments = [] } = {}) => ({
  getDate: () => new Date(when), getSubject: () => subject, getFrom: () => from, getPlainBody: () => body,
  getBody: () => html, getId: () => id || 'msg-' + when, getAttachments: () => attachments,
});
const secs = iso => Math.floor(Date.parse(iso) / 1000);

describe('hourly receipt check (v60)', () => {
  it('reads mail since it last looked and files what it finds, without guessing a currency', () => {
    const s = hourly({
      properties: { RECEIPT_HOURLY_SINCE: String(secs('2026-11-27T11:00:00Z')) },
      messages: [mail('2026-11-27T11:20:00Z')],
      receipts: [{ vendor: 'Printer', amount: 42, subtotal: 37.17, tax: 4.83, supplierTaxNumber: '123456789RT0001', taxLines: [{ name: 'HST', rate: 13, amount: 4.83 }] }],
    });
    s.ctx.receiptHourlyScan();
    expect(s.searches[0]).toContain('category:purchases');
    expect(s.searches[0]).toContain('after:' + (secs('2026-11-27T11:00:00Z') - 3600));
    expect(s.written).toHaveLength(1);
    expect(s.written[0]).toMatchObject({ vendor: 'Printer', currency: '', source: 'hourly-sweep', subtotal: 37.17, tax: 4.83,
      supplierTaxNumber: '123456789RT0001', taxLines: [{ name: 'HST', rate: 13, amount: 4.83 }], emailSubject: 'Your receipt' });
    // Next hour starts where this one began.
    expect(s.props.RECEIPT_HOURLY_SINCE).toBe(String(secs('2026-11-27T12:00:00Z')));
    expect(s.status().text).toMatch(/Read 1 email, found 1 receipt/);
  });

  it('never pays twice for an email it already read', () => {
    const s = hourly({ properties: { RECEIPT_HOURLY_SINCE: String(secs('2026-11-27T11:00:00Z')), RECEIPT_HOURLY_SEEN: JSON.stringify(['msg-a']) },
      messages: [mail('2026-11-27T10:30:00Z', { id: 'msg-a' }), mail('2026-11-27T11:10:00Z', { id: 'msg-b' })] });
    s.ctx.receiptHourlyScan();
    expect(s.aiCalls).toHaveLength(1);
    expect(JSON.parse(s.props.RECEIPT_HOURLY_SEEN)).toEqual(['msg-a', 'msg-b']);
  });

  it('sets aside notices and amount-less mail without an AI read', () => {
    const s = hourly({ messages: [
      mail('2026-11-27T11:00:00Z', { subject: 'Your order has shipped' }),
      mail('2026-11-27T11:05:00Z', { body: 'Hello there' }),
      mail('2026-11-27T11:10:00Z', { body: 'Hello there', attachments: [{ getContentType: () => 'application/pdf', getSize: () => 1000, getBytes: () => [] }] }),
    ] });
    s.ctx.receiptHourlyScan();
    expect(s.aiCalls).toHaveLength(1);
    expect(s.status().text).toMatch(/2 set aside as not receipts/);
  });

  it('follows the sender lists saved in the app', () => {
    const s = hourly({ senders: { never: ['spam.com'], always: ['shop.ca'] }, messages: [
      mail('2026-11-27T11:00:00Z', { from: 'deals@mail.spam.com' }),
      mail('2026-11-27T11:05:00Z', { from: 'orders@shop.ca', body: 'Thanks for your order', subject: 'Hi' }),
    ] });
    s.ctx.receiptHourlyScan();
    // The never sender is skipped; the always sender is read despite no amount.
    expect(s.aiCalls).toHaveLength(1);
    expect(s.status().text).toMatch(/1 from senders you never want read/);
  });

  it('passes on the order details a store embedded in its email', () => {
    const html = '<script type="application/ld+json">{"@type":"Order","merchant":{"name":"Paper Co"},"orderNumber":"PS-9","price":"42.00","priceCurrency":"CAD"}</script>';
    const s = hourly({ messages: [mail('2026-11-27T11:00:00Z', { html })] });
    s.ctx.receiptHourlyScan();
    const sent = JSON.parse(s.aiCalls[0].body.contents[0].parts[0].text);
    expect(sent.orderStructuredData).toMatchObject({ vendor: 'Paper Co', reference: 'PS-9', amount: 42, currency: 'CAD' });
  });

  it('leaves what it cannot finish for the next hour instead of skipping it', () => {
    const many = Array.from({ length: 30 }, (_, i) => mail(new Date(Date.parse('2026-11-27T10:00:00Z') + i * 60000).toISOString(), { id: 'm' + i }));
    const s = hourly({ messages: many });
    s.ctx.receiptHourlyScan();
    expect(s.aiCalls).toHaveLength(25);
    // The cursor stops just before the 26th email.
    expect(Number(s.props.RECEIPT_HOURLY_SINCE)).toBe(secs('2026-11-27T10:25:00Z') - 1);
    expect(s.status().text).toMatch(/5 more will be read next hour/);
  });

  it('stops on a spent allowance and keeps its place', () => {
    const s = hourly({ properties: { RECEIPT_HOURLY_SINCE: String(secs('2026-11-27T09:00:00Z')) }, aiStatus: 429,
      messages: [mail('2026-11-27T11:00:00Z'), mail('2026-11-27T11:30:00Z')] });
    s.ctx.receiptHourlyScan();
    expect(s.written).toHaveLength(0);
    expect(Number(s.props.RECEIPT_HOURLY_SINCE)).toBe(secs('2026-11-27T11:00:00Z') - 1);
    expect(s.status().text).toMatch(/Stopped/);
  });

  it('lists an email whose receipt is only behind a link', () => {
    const html = '<p>Thanks for paying $12.00</p><a href="https://pay.example.com/r/1">View receipt</a>';
    const s = hourly({ receipts: [], messages: [mail('2026-11-27T11:00:00Z', { id: 'link-1', subject: 'Payment received', html })] });
    s.ctx.receiptHourlyScan();
    expect(JSON.parse(s.props.RECEIPT_LINK_ONLY)).toEqual([expect.objectContaining({ id: 'link-1', link: 'https://pay.example.com/r/1', subject: 'Payment received' })]);
  });

  it('starts from the daily scan’s last day when switched over, and never more than two weeks back', () => {
    const s = hourly();
    expect(s.ctx.receiptHourlyStart_('', secs('2026-11-27T12:00:00Z'), '2026-11-25')).toBe(secs('2026-11-26T00:00:00Z'));
    expect(s.ctx.receiptHourlyStart_('', secs('2026-11-27T12:00:00Z'), '')).toBe(secs('2026-11-25T12:00:00Z'));
    expect(s.ctx.receiptHourlyStart_(String(secs('2026-01-01T00:00:00Z')), secs('2026-11-27T12:00:00Z'), '')).toBe(secs('2026-11-13T12:00:00Z'));
  });

  it('never throws out of the trigger', () => {
    const s = hourly();
    s.ctx.GmailApp.search = () => { throw new Error('Gmail unavailable'); };
    expect(() => s.ctx.receiptHourlyScan()).not.toThrow();
    expect(s.status().text).toContain('Failed');
  });

  it('is armed every hour, replacing the daily trigger, and reports itself', () => {
    const triggers = [{ getHandlerFunction: () => 'receiptDailyScan' }];
    const s = hourly({ triggers });
    const call = payload => s.ctx.doPost({ postData: { contents: JSON.stringify({ version: 2, action: 'receiptDailySchedule', payload }) } });
    expect(call({ op: 'set', enabled: true, every: 'hour' })).toMatchObject({ ok: true, enabled: true, every: 'hour' });
    expect(s.created).toEqual([{ name: 'receiptHourlyScan', every: '1h' }]);
    expect(triggers.map(t => t.getHandlerFunction())).toEqual(['receiptHourlyScan']);
    call({ op: 'set', enabled: false });
    expect(triggers).toHaveLength(0);
    expect(s.ctx.doGet({ parameter: {} }).capabilities.receiptHourlySweep).toBe(true);
  });
});
