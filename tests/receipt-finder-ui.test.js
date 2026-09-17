// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeFoundReceipt } from '../src/lib/receipt-finder.js';

const mocks = vi.hoisted(() => ({ saved: null, token: null, save: vi.fn(), load: vi.fn(), clear: vi.fn(),
  loadToken: vi.fn(), saveToken: vi.fn(), clearToken: vi.fn(), aiTest: vi.fn(),
  extract: vi.fn(), list: vi.fn(), message: vi.fn(), check: vi.fn() }));
vi.mock('../src/lib/receipt-finder-store.js', () => ({ createReceiptFinderStore: () => ({
  load: mocks.load, save: mocks.save, clear: mocks.clear,
  loadToken: mocks.loadToken, saveToken: mocks.saveToken, clearToken: mocks.clearToken,
}) }));
vi.mock('../src/lib/receipt-finder-client.js', () => ({
  createReceiptFinderClient: () => ({ profile: async () => ({ emailAddress: 'publisher@example.com' }),
    list: mocks.list, message: mocks.message, attachment: async (_id, file) => file }),
  extractFoundReceipts: mocks.extract, decodeGmailBase64: () => new Uint8Array(),
  checkReceiptFinderService: mocks.check,
  testReceiptAiService: mocks.aiTest,
  describeAiTest: result => result.aiOk
    ? { level: 'ready', headline: 'Google accepted the key.', steps: [] }
    : result.aiStatus === 429
      ? { level: 'warn', headline: 'Google’s AI allowance for your key is used up for now.', steps: ['Wait a few minutes.'], blocksScan: false }
      : { level: 'error', headline: 'Google would not accept the AI key in your script.', steps: ['Use a key that starts with AIza.'], blocksScan: true },
  systemicReceiptFailure: message => /\(429\)/.test(message)
    ? 'Google’s AI allowance for your key is used up for now. Wait a few minutes.' : null,
  FINDER_ENDPOINT_PATTERN: /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/,
}));

const source = { id: 'm1', account: 'publisher@example.com', body: 'Original invoice evidence', from: 'Printer', subject: 'Invoice #123', fileParts: [] };
function state() {
  const draft = normalizeFoundReceipt({ vendor: 'Printer', amount: 113, currency: 'CAD', date: '2026-09-01', reference: '123', confidence: 0.3 }, source);
  return { drafts: [draft], emails: { 'publisher@example.com:m1': source }, endpoint: 'https://script.google.com/macros/s/test/exec', scans: {}, account: 'publisher@example.com' };
}
let deps;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  mocks.saved = state();
  mocks.load.mockImplementation(async () => structuredClone(mocks.saved));
  mocks.save.mockImplementation(async (_uid, value) => { mocks.saved = structuredClone(value); });
  mocks.list.mockResolvedValue({ messages: [{ id: 'm2' }] });
  mocks.message.mockResolvedValue({ ...source, id: 'm2', subject: 'Receipt notice' });
  mocks.extract.mockResolvedValue({ receipts: [{ vendor: 'Courier', amount: 10, currency: 'CAD', date: '2026-09-01', confidence: 0.9 }] });
  mocks.check.mockResolvedValue({ level: 'ready', headline: 'Ready to scan using gemini-2.5-flash.', steps: [] });
  mocks.aiTest.mockResolvedValue({ ok: true, aiOk: true, aiStatus: 200, model: 'gemini-2.5-flash' });
  mocks.token = null;
  mocks.loadToken.mockImplementation(async () => mocks.token);
  mocks.saveToken.mockImplementation(async (_uid, value) => { mocks.token = structuredClone(value); });
  mocks.clearToken.mockImplementation(async () => { mocks.token = null; });
  document.body.innerHTML = '<span id="email-account-pill"></span><div id="email-panel-gmail"></div>';
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  deps = { user: () => ({ uid: 'publisher', getIdToken: async () => 'id-token' }), publisher: () => true,
    categories: ['Other'], inferCategory: () => 'Other', expenses: () => [], toast: vi.fn(), confirm: async () => true,
    upload: vi.fn(), commit: vi.fn(), accept: vi.fn(), rate: async () => 1 };
  window._fbConnectReceiptGmail = vi.fn(async () => ({ token: 'access-token', expiresAt: Date.now() + 3300000 }));
  window._fbOnAuthStateChanged = vi.fn();
});
const settle = () => new Promise(resolve => setTimeout(resolve, 20));
async function mount() {
  const module = await import('../src/features/receipt-finder.js');
  await module.mountReceiptFinder(document.getElementById('email-panel-gmail'), deps);
  return module;
}

describe('receipt finder UI', () => {
  it('restores review details offline and keeps uncertain imports disabled', async () => {
    await mount();
    expect(document.body.textContent).toContain('Original invoice evidence');
    expect(document.querySelector('[data-action="import"]').disabled).toBe(true);
    expect(document.querySelector('[data-reviewed]')).not.toBeNull();
  });
  it('saves edits and explicit review, then queues offline without a cloud write', async () => {
    await mount();
    const vendor = document.querySelector('[data-field="vendor"]');
    vendor.value = 'Correct Printer'; vendor.dispatchEvent(new Event('change', { bubbles: true })); await settle();
    const reviewed = document.querySelector('[data-reviewed]');
    reviewed.checked = true; reviewed.dispatchEvent(new Event('change', { bubbles: true })); await settle();
    expect(document.querySelector('[data-action="import"]').disabled).toBe(false);
    document.querySelector('[data-action="import"]').click(); await settle();
    expect(mocks.saved.drafts[0]).toMatchObject({ vendor: 'Correct Printer', reviewed: true, status: 'queued' });
    expect(deps.commit).not.toHaveBeenCalled();
  });
  it('filters without losing saved drafts or changing their real identities', async () => {
    await mount();
    document.querySelector('[data-status="ready"]').click();
    expect(document.querySelector('[data-finder-list]').textContent).toContain('Nothing matches this view');
    document.querySelector('[data-status="review"]').click();
    expect(document.querySelector('[data-draft]').dataset.draft).toBe('publisher@example.com:m1:0');
  });
  it('connects read-only and automatically extracts candidate messages', async () => {
    await mount();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    document.querySelector('[data-action="connect"]').click(); await settle();
    document.querySelector('[data-action="scan"]').click(); await settle(); await settle();
    expect(mocks.list).toHaveBeenCalledOnce(); expect(mocks.extract).toHaveBeenCalledOnce();
    expect(mocks.saved.drafts).toHaveLength(2);
    expect(document.querySelector('[data-finder-list]').textContent).toContain('Courier');
  });
  it('keeps extraction errors visible and retryable', async () => {
    await mount();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    mocks.extract.mockRejectedValue(new Error('Receipt AI is unavailable'));
    document.querySelector('[data-action="connect"]').click(); await settle();
    document.querySelector('[data-action="scan"]').click(); await settle(); await settle();
    expect(document.querySelector('[data-finder-errors]').textContent).toContain('Receipt AI is unavailable');
    expect(mocks.saved.scans['publisher@example.com:m2'].done).not.toBe(true);
  });
  it('escapes email and vendor markup in the review screen', async () => {
    mocks.saved.drafts[0].vendor = '<img src=x onerror=alert(1)>';
    mocks.saved.emails['publisher@example.com:m1'].body = '<script>bad()</script>';
    await mount();
    expect(document.querySelectorAll('img,script')).toHaveLength(0);
    expect(document.querySelector('.finder-email').textContent).toContain('<script>');
  });
  it('names the missing setup steps without starting a scan', async () => {
    mocks.check.mockResolvedValue({ level: 'error', headline: 'One thing is still missing.',
      steps: ['Add GEMINI_API_KEY — a Gemini key restricted to the Generative Language API — in the script’s Script Properties. It never goes into this app.'] });
    await mount();
    document.querySelector('[data-action="check-setup"]').click(); await settle();
    const panel = document.querySelector('[data-finder-check]');
    expect(panel.className).toContain('is-error');
    expect(panel.textContent).toContain('GEMINI_API_KEY');
    expect(panel.querySelector('.pill.red')).not.toBeNull();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('confirms a ready deployment after saving the address', async () => {
    await mount();
    document.querySelector('[data-action="save-setup"]').click(); await settle();
    expect(mocks.check).toHaveBeenCalledWith({ endpoint: 'https://script.google.com/macros/s/test/exec' });
    expect(document.querySelector('[data-finder-check]').className).toContain('is-ready');
    expect(document.querySelector('[data-finder-status]').textContent).toContain('ready to scan');
  });
  it('reuses a saved Gmail connection instead of asking for access again', async () => {
    // The connection used to live only in memory, and Google was asked to
    // re-run its full consent screen every time, so the publisher had to
    // grant Gmail access on every single visit.
    mocks.token = { token: 'saved-token', expiresAt: Date.now() + 600000, account: 'publisher@example.com' };
    await mount();
    expect(window._fbConnectReceiptGmail).not.toHaveBeenCalled();
    expect(document.querySelector('[data-action="connect"]').textContent).toBe('Disconnect Gmail');
    expect(document.getElementById('email-account-pill').textContent).toContain('publisher@example.com');
  });
  it('treats an expired saved connection as disconnected and discards it', async () => {
    mocks.token = { token: 'stale-token', expiresAt: Date.now() - 1000, account: 'publisher@example.com' };
    await mount();
    expect(mocks.clearToken).toHaveBeenCalledWith('publisher');
    expect(document.querySelector('[data-action="connect"]').textContent).toContain('Reconnect');
    expect(document.querySelector('[data-conn-note]').textContent).toContain('run out');
  });
  it('remembers the connection it just made, with its expiry', async () => {
    await mount();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    document.querySelector('[data-action="connect"]').click(); await settle();
    expect(mocks.token).toMatchObject({ token: 'access-token', account: 'publisher@example.com' });
    expect(mocks.token.expiresAt).toBeGreaterThan(Date.now());
  });
  it('drops the saved connection on disconnect and on sign-out', async () => {
    mocks.token = { token: 'saved-token', expiresAt: Date.now() + 600000, account: 'publisher@example.com' };
    await mount();
    document.querySelector('[data-action="connect"]').click(); await settle();
    expect(mocks.token).toBeNull();
    mocks.token = { token: 'saved-token', expiresAt: Date.now() + 600000, account: 'publisher@example.com' };
    window._fbOnAuthStateChanged.mock.calls[0][0](null); await settle();
    expect(mocks.token).toBeNull();
  });
  it('refuses to scan through a deployment that cannot read receipts', async () => {
    // An unknown action on an older Google Sheet script falls through to its
    // row-writing path, so scanning against one would append junk rows to the
    // publisher's spreadsheet. No email may be sent until it says it can read.
    mocks.check.mockResolvedValue({ level: 'error', headline: 'Your Google Sheet script is too old to read receipts.',
      steps: ['Copy the script shown in the Connect your Google Sheet tab and deploy a new version.'] });
    await mount();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    document.querySelector('[data-action="connect"]').click(); await settle();
    document.querySelector('[data-action="scan"]').click(); await settle(); await settle();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(deps.toast).toHaveBeenCalledWith(expect.stringContaining('too old'), 'err');
  });
  it('falls back to the connected Google Sheet script when no address is saved', async () => {
    mocks.saved.endpoint = '';
    deps.service = () => 'https://script.google.com/macros/s/sheets/exec';
    await mount();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    document.querySelector('[data-action="connect"]').click(); await settle();
    document.querySelector('[data-action="scan"]').click(); await settle(); await settle();
    expect(mocks.check).toHaveBeenCalledWith({ endpoint: 'https://script.google.com/macros/s/sheets/exec' });
    expect(mocks.extract.mock.calls[0][0].endpoint).toBe('https://script.google.com/macros/s/sheets/exec');
  });
  it('reads candidate emails in parallel rather than one after another', async () => {
    mocks.list.mockResolvedValue({ messages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    mocks.message.mockImplementation(async id => ({ ...source, id, subject: 'Receipt ' + id }));
    let open = 0, peak = 0;
    mocks.extract.mockImplementation(async () => {
      peak = Math.max(peak, ++open);
      await new Promise(resolve => setTimeout(resolve, 5));
      open--;
      return { receipts: [] };
    });
    await mount();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    document.querySelector('[data-action="connect"]').click(); await settle();
    document.querySelector('[data-action="scan"]').click();
    await new Promise(resolve => setTimeout(resolve, 120));
    expect(mocks.extract).toHaveBeenCalledTimes(3);
    expect(peak).toBeGreaterThan(1);
  });
  it('does not keep the saved copy of an email that held no receipt', async () => {
    // Every scanned email's body and attachment bytes used to be kept forever,
    // so the saved mailbox — and therefore every later save — grew with each
    // scan of an ordinary inbox, whether or not anything was found.
    mocks.extract.mockResolvedValue({ receipts: [] });
    await mount();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    document.querySelector('[data-action="connect"]').click(); await settle();
    document.querySelector('[data-action="scan"]').click(); await settle(); await settle();
    expect(mocks.saved.scans['publisher@example.com:m2'].done).toBe(true);
    expect(mocks.saved.emails['publisher@example.com:m2']).toBeUndefined();
    expect(mocks.saved.emails['publisher@example.com:m1']).toBeDefined();
  });
  it('says plainly when a search matched no mail at all', async () => {
    mocks.list.mockResolvedValue({ messages: [] });
    await mount();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    document.querySelector('[data-action="connect"]').click(); await settle();
    document.querySelector('[data-action="scan"]').click(); await settle(); await settle();
    expect(document.querySelector('[data-finder-status]').textContent).toContain('No emails matched');
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it('surfaces unreadable emails as an alert rather than only a collapsed list', async () => {
    await mount();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    mocks.extract.mockRejectedValue(new Error('Receipt AI is unavailable'));
    document.querySelector('[data-action="connect"]').click(); await settle();
    document.querySelector('[data-action="scan"]').click(); await settle(); await settle();
    const alert = document.querySelector('[data-finder-alert]');
    expect(alert.className).toContain('is-warn');
    expect(alert.textContent).toContain('could not be read');
    expect(alert.querySelector('[data-action="retry-failed"]')).not.toBeNull();
  });
  it('offers a one-click switch when the saved address is a retired Receipt Finder', async () => {
    // Reported from the field: the publisher had done everything asked of them,
    // but a saved standalone address still won over the connected Sheet script.
    // The app told them to "clear this address" while the only field that does
    // it sat inside a collapsed disclosure, with no button anywhere.
    deps.service = () => 'https://script.google.com/macros/s/sheets/exec';
    mocks.check.mockResolvedValue({ level: 'error', fix: 'use-sheets',
      headline: 'This is an older Receipt Finder script the app can no longer read.',
      steps: ['You no longer need a second script — switch to the Google Sheet script you have already connected.'] });
    await mount();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    document.querySelector('[data-action="connect"]').click(); await settle();
    document.querySelector('[data-action="scan"]').click(); await settle(); await settle();
    // The problem, and its remedy, must be at the top of the panel — not only
    // in the status line and the collapsed Advanced section.
    const gate = document.querySelector('[data-finder-gate]');
    expect(gate.hidden).toBe(false);
    expect(gate.textContent).toContain('older Receipt Finder script');
    const fix = gate.querySelector('[data-action="use-sheets"]');
    expect(fix).not.toBeNull();

    mocks.check.mockResolvedValue({ level: 'ready', headline: 'Ready to scan.', steps: [] });
    fix.click(); await settle();
    expect(mocks.saved.endpoint).toBe('');
    expect(mocks.check).toHaveBeenLastCalledWith({ endpoint: 'https://script.google.com/macros/s/sheets/exec' });
    expect(document.querySelector('[data-finder-gate]').hidden).toBe(true);
  });
  it('does not offer the switch when there is no Google Sheet script to switch to', async () => {
    deps.service = () => '';
    mocks.check.mockResolvedValue({ level: 'error', fix: 'use-sheets', headline: 'The script did not answer.', steps: ['Check the address.'] });
    await mount();
    document.querySelector('[data-action="check-setup"]').click(); await settle();
    expect(document.querySelector('[data-action="use-sheets"]')).toBeNull();
    expect(document.querySelector('[data-finder-gate]').textContent).toContain('Check the address.');
  });
  it('discards failures recorded against a service that is no longer in use', async () => {
    // 75 failures from the retired deployment were still on screen after the
    // switch, as a standing alarm about a service the app no longer calls.
    mocks.saved.scans = {
      'publisher@example.com:old1': { error: 'Receipt extraction failed', subject: 'One', endpoint: 'https://script.google.com/macros/s/old/exec' },
      'publisher@example.com:old2': { error: 'Receipt extraction failed', subject: 'Two' },
      'publisher@example.com:kept': { done: true, subject: 'Read fine', count: 0 },
    };
    await mount();
    expect(document.querySelector('[data-finder-alert]').textContent).toContain('2 emails');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    document.querySelector('[data-action="connect"]').click(); await settle();
    document.querySelector('[data-action="scan"]').click(); await settle(); await settle();
    expect(mocks.saved.scans['publisher@example.com:old1']).toBeUndefined();
    expect(mocks.saved.scans['publisher@example.com:old2']).toBeUndefined();
    // A successfully read email is not a failure and survives the switch.
    expect(mocks.saved.scans['publisher@example.com:kept'].done).toBe(true);
  });
  it('lets the publisher clear old failures without retrying them', async () => {
    mocks.saved.scans = { 'publisher@example.com:old1': { error: 'Receipt extraction failed', subject: 'One' } };
    await mount();
    document.querySelector('[data-action="clear-failures"]').click(); await settle();
    expect(mocks.saved.scans['publisher@example.com:old1']).toBeUndefined();
    expect(document.querySelector('[data-finder-alert]').textContent).toBe('');
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it('refuses to call a key Ready when Google turns it down', async () => {
    // The publisher had a filled-in GEMINI_API_KEY and a setup check that said
    // Ready, while every scanned email failed. Presence is not acceptance.
    mocks.check.mockResolvedValue({ level: 'ready', headline: 'Ready.', steps: [],
      report: { capabilities: { receiptExtraction: true, receiptSelfTest: true } } });
    mocks.aiTest.mockResolvedValue({ ok: true, aiOk: false, aiStatus: 403 });
    await mount();
    document.querySelector('[data-action="check-setup"]').click(); await settle();
    expect(mocks.aiTest).toHaveBeenCalled();
    const panel = document.querySelector('[data-finder-check]');
    expect(panel.className).toContain('is-error');
    expect(panel.textContent).toContain('would not accept');
    expect(document.querySelector('[data-finder-gate]').hidden).toBe(false);
  });
  it('skips the live key test on a deployment too old to offer it', async () => {
    mocks.check.mockResolvedValue({ level: 'ready', headline: 'Ready.', steps: [],
      report: { capabilities: { receiptExtraction: true } } });
    await mount();
    document.querySelector('[data-action="check-setup"]').click(); await settle();
    expect(mocks.aiTest).not.toHaveBeenCalled();
    expect(document.querySelector('[data-finder-check]').className).toContain('is-ready');
  });
  it('names why an email could not be read, in the alert itself', async () => {
    // The count alone was useless: the cause sat in a collapsed list below the
    // results, and the most common cause is something only the owner can fix.
    mocks.saved.scans = {
      'publisher@example.com:a': { error: 'Google would not accept the AI key in your script.', subject: 'One' },
      'publisher@example.com:b': { error: 'Google would not accept the AI key in your script.', subject: 'Two' },
    };
    await mount();
    const alert = document.querySelector('[data-finder-alert]');
    expect(alert.textContent).toContain('2 emails could not be read');
    expect(alert.textContent).toContain('would not accept the AI key');
    // One shared cause must not be reported as several.
    expect(alert.textContent).not.toContain('other reason');
    expect(document.querySelector('.finder-errors').open).toBe(true);
  });
  it('a momentary gap in the signed-in user does not kill a running scan', async () => {
    // startReceiptFinder runs on every modal open and every book reload. It
    // treated an unresolved user as a sign-out, aborting the scan and wiping
    // the mailbox view; real sign-out still arrives on the auth callback.
    const module = await mount();
    const before = document.getElementById('email-panel-gmail').innerHTML;
    deps.user = () => undefined;
    await module.startReceiptFinder(deps);
    expect(document.getElementById('email-panel-gmail').innerHTML).toBe(before);
    expect(document.querySelector('[data-draft]')).not.toBeNull();
  });
  it('will not spend a Gmail read on a key Google has already refused', async () => {
    // Otherwise a scan works through the whole mailbox failing every email in
    // turn against a key that was never going to be accepted.
    mocks.check.mockResolvedValue({ level: 'ready', headline: 'Ready.', steps: [],
      report: { capabilities: { receiptExtraction: true, receiptSelfTest: true } } });
    mocks.aiTest.mockResolvedValue({ ok: true, aiOk: false, aiStatus: 401 });
    await mount();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    document.querySelector('[data-action="connect"]').click(); await settle();
    document.querySelector('[data-action="scan"]').click(); await settle(); await settle();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(deps.toast).toHaveBeenCalledWith(expect.stringContaining('would not accept'), 'err');
  });
  it('stops at the first spent-allowance failure instead of spending more on it', async () => {
    // One exhausted allowance became 77 failed emails and 77 more requests
    // against it, every one of which was always going to fail the same way.
    mocks.list.mockResolvedValue({ messages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] });
    mocks.message.mockImplementation(async id => ({ ...source, id, subject: 'Receipt ' + id }));
    mocks.extract.mockRejectedValue(new Error('Receipt AI is unavailable (429). Retry later.'));
    await mount();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    document.querySelector('[data-action="connect"]').click(); await settle();
    document.querySelector('[data-action="scan"]').click(); await settle(); await settle();
    // Concurrency means a few may already be in flight, but it must not work
    // through the whole batch.
    expect(mocks.extract.mock.calls.length).toBeLessThan(4);
    const status = document.querySelector('[data-finder-status]').textContent;
    expect(status).toContain('nothing more was spent');
    expect(status).toMatch(/allowance/i);
  });
  it('lets a scan start while rate-limited, since that clears by itself', async () => {
    // A spent allowance is a wait, not a misconfiguration — gating the button
    // on it would leave the publisher unable to try at all.
    mocks.check.mockResolvedValue({ level: 'ready', headline: 'Ready.', steps: [],
      report: { capabilities: { receiptExtraction: true, receiptSelfTest: true } } });
    mocks.aiTest.mockResolvedValue({ ok: true, aiOk: false, aiStatus: 429 });
    await mount();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    document.querySelector('[data-action="connect"]').click(); await settle();
    document.querySelector('[data-action="scan"]').click(); await settle(); await settle();
    expect(mocks.list).toHaveBeenCalled();
    const gate = document.querySelector('[data-finder-gate]').textContent;
    expect(gate).not.toMatch(/would not accept/);
  });
  it('clears mailbox content immediately on sign-out', async () => {
    await mount();
    const callback = window._fbOnAuthStateChanged.mock.calls[0][0];
    callback(null);
    expect(document.getElementById('email-panel-gmail').textContent).toBe('');
  });
});

describe('receipt finder with app AI keys', () => {
  it('scans without a script URL and passes the shared reader', async () => {
    mocks.saved.endpoint = '';
    deps.hasAppAi = () => true;
    deps.readAi = vi.fn();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    await mount();
    document.querySelector('[data-action="connect"]').click(); await settle();
    document.querySelector('[data-action="scan"]').click(); await settle();
    expect(mocks.extract).toHaveBeenCalledWith(expect.objectContaining({ readAi: deps.readAi, idToken: undefined }));
    expect(mocks.saved.scans['publisher@example.com:m2'].done).toBe(true);
  });
});
