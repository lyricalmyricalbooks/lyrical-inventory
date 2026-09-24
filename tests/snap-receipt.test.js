// A receipt photo taken from Today lands in the Tax Centre expense form and is
// read by the same scan as the desktop — nothing is saved until you check it.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

let app, win;
beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'b', title: 'B' })] });
  win = app.window;
}, 30000);

function pick(file) {
  const input = document.getElementById('snap-receipt-input');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  return win.snapReceiptChosen(input);
}

describe('Snap a receipt', () => {
  it('opens the phone camera, not a webcam window', () => {
    const input = document.getElementById('snap-receipt-input');
    expect(input.getAttribute('capture')).toBe('environment');
    expect(input.accept).toBe('image/*');
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    win.snapReceipt();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('attaches the photo to the expense form without saving an expense', async () => {
    // jsdom has no DataTransfer or settable FileList; phone browsers have both.
    globalThis.DataTransfer = win.DataTransfer = class { constructor() { this.files = []; this.items = { add: (f) => this.files.push(f) }; } };
    Object.defineProperty(document.getElementById('tc-exp-file'), 'files', { configurable: true, writable: true, value: [] });
    const before = JSON.stringify(app.main.TAX_CENTER?.expenses || []);
    const file = new win.File(['x'], 'receipt.jpg', { type: 'image/jpeg' });
    Object.defineProperty(win.navigator, 'onLine', { configurable: true, get: () => false });
    await pick(file);
    expect(document.getElementById('tab-taxcenter').style.display).not.toBe('none');
    expect(document.getElementById('tc-exp-file').files[0].name).toBe('receipt.jpg');
    expect(JSON.stringify(app.main.TAX_CENTER?.expenses || [])).toBe(before);
  });

  it('reads a receipt snapped with no signal once the signal returns, unless it was typed in by hand', async () => {
    globalThis.DataTransfer = win.DataTransfer = class { constructor() { this.files = []; this.items = { add: (f) => this.files.push(f) }; } };
    const fileInput = document.getElementById('tc-exp-file');
    Object.defineProperty(fileInput, 'files', { configurable: true, writable: true, value: [] });
    app.main.TAX_CENTER.settings.geminiKey = 'test-key';
    const onLine = (v) => Object.defineProperty(win.navigator, 'onLine', { configurable: true, get: () => v });
    const toast = () => document.getElementById('toast').textContent;

    onLine(false);
    await pick(new win.File(['a'], 'a.jpg', { type: 'image/jpeg' }));
    document.getElementById('tc-exp-desc').value = '';
    document.getElementById('tc-exp-amount').value = '';
    onLine(true);
    win.dispatchEvent(new win.Event('online'));
    expect(toast()).toMatch(/Back online — reading your receipt/);

    onLine(false);
    await pick(new win.File(['b'], 'b.jpg', { type: 'image/jpeg' }));
    document.getElementById('tc-exp-desc').value = 'Table fee';
    onLine(true);
    win.dispatchEvent(new win.Event('online'));
    expect(toast()).not.toMatch(/Back online/);
  });

  it('ignores a cancelled camera', async () => {
    await expect(pick(undefined)).resolves.toBeUndefined();
  });
});
