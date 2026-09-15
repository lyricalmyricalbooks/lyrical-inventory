// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeFoundReceipt } from '../src/lib/receipt-finder.js';

const mocks = vi.hoisted(() => ({ saved: null, save: vi.fn(), load: vi.fn(), clear: vi.fn(), extract: vi.fn(), list: vi.fn(), message: vi.fn(), check: vi.fn() }));
vi.mock('../src/lib/receipt-finder-store.js', () => ({ createReceiptFinderStore: () => ({
  load: mocks.load, save: mocks.save, clear: mocks.clear,
}) }));
vi.mock('../src/lib/receipt-finder-client.js', () => ({
  createReceiptFinderClient: () => ({ profile: async () => ({ emailAddress: 'publisher@example.com' }),
    list: mocks.list, message: mocks.message, attachment: async (_id, file) => file }),
  extractFoundReceipts: mocks.extract, decodeGmailBase64: () => new Uint8Array(),
  checkReceiptFinderService: mocks.check,
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
  document.body.innerHTML = '<span id="email-account-pill"></span><div id="email-panel-gmail"></div>';
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  deps = { user: () => ({ uid: 'publisher', getIdToken: async () => 'id-token' }), publisher: () => true,
    categories: ['Other'], inferCategory: () => 'Other', expenses: () => [], toast: vi.fn(), confirm: async () => true,
    upload: vi.fn(), commit: vi.fn(), accept: vi.fn(), rate: async () => 1 };
  window._fbConnectReceiptGmail = vi.fn(async () => 'access-token');
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
    expect(document.querySelector('[data-finder-list]').textContent).toContain('No receipts match');
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
  it('clears mailbox content immediately on sign-out', async () => {
    await mount();
    const callback = window._fbOnAuthStateChanged.mock.calls[0][0];
    callback(null);
    expect(document.getElementById('email-panel-gmail').textContent).toBe('');
  });
});
