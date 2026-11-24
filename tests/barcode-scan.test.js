// @vitest-environment jsdom
// Scanning a book's barcode at the register: the camera on Android Chrome, or
// a plugged-in scanner that types the code and presses Enter.
import { beforeAll, describe, expect, it } from 'vitest';
import { bookForCode, cameraScanSupported, isbn10to13, openCameraScanner } from '../src/lib/barcode-scan.js';
import { loadApp, makeBook } from './helpers/load-app.js';

describe('bookForCode', () => {
  const books = {
    a: { id: 'a', isbn: '978-1-910-34567-8' },
    b: { id: 'b', isbn: '0-306-40615-2' },
    c: { id: 'c', isbn: '—' },
  };
  it('matches the printed ISBN-13, ignoring dashes', () => {
    expect(bookForCode('9781910345678', books).id).toBe('a');
  });
  it('matches a book stored with an ISBN-10 to the ISBN-13 on its barcode', () => {
    expect(isbn10to13('0-306-40615-2')).toBe('9780306406157');
    expect(bookForCode('9780306406157', books).id).toBe('b');
  });
  it('picks nothing for an unknown code, a short code or a code on two books', () => {
    expect(bookForCode('9780000000002', books)).toBeNull();
    expect(bookForCode('1234', books)).toBeNull();
    expect(bookForCode('9781910345678', { ...books, d: { id: 'd', isbn: '9781910345678' } })).toBeNull();
  });
});

describe('the camera scanner', () => {
  it('is offered only where the phone can read barcodes', () => {
    expect(cameraScanSupported({ navigator: { mediaDevices: { getUserMedia() {} } } })).toBe(false);
    expect(cameraScanSupported({ BarcodeDetector: function () {}, navigator: { mediaDevices: { getUserMedia() {} } } })).toBe(true);
  });

  it('hands over the first code it reads, then stops the camera and closes', async () => {
    let stopped = false;
    const win = Object.create(window);
    win.BarcodeDetector = class { async detect() { return [{ rawValue: '9781910345678' }]; } };
    Object.defineProperty(win, 'navigator', { value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped = true; } }] }) } } });
    HTMLMediaElement.prototype.play = async () => {};
    const code = await new Promise(resolve => openCameraScanner({ onCode: resolve }, win));
    expect(code).toBe('9781910345678');
    expect(stopped).toBe(true);
    expect(document.querySelector('.scan-overlay')).toBeNull();
  });

  it('explains a blocked camera in plain words', async () => {
    const win = Object.create(window);
    win.BarcodeDetector = class { async detect() { return []; } };
    Object.defineProperty(win, 'navigator', { value: { mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error('no'), { name: 'NotAllowedError' }); } } } });
    const msg = await new Promise(resolve => openCameraScanner({ onCode: () => {}, onError: resolve }, win));
    expect(msg).toMatch(/camera is blocked/);
    expect(document.querySelector('.scan-overlay')).toBeNull();
  });
});

describe('a scanner typing into the register search', () => {
  let app;
  beforeAll(async () => {
    app = await loadApp({ books: [makeBook({ id: 'harbour', title: 'Harbour Lights', isbn: '978-1-910-34567-8' })] });
  }, 30000);

  // The register's own count of copies in the sale.
  const inCart = () => document.getElementById('pos-mobile-cart-count').textContent;
  const scan = (value) => {
    const input = document.getElementById('pos-search-input');
    input.value = value;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return input;
  };

  it('adds the book to the sale and clears the search for the next scan', () => {
    const input = scan('9781910345678');
    expect(inCart()).toBe('1');
    expect(input.value).toBe('');
    scan('9781910345678');
    expect(inCart()).toBe('2');
  });

  it('leaves an unknown code in the search box and adds nothing', () => {
    const before = inCart();
    const input = scan('9780000000002');
    expect(inCart()).toBe(before);
    expect(input.value).toBe('9780000000002');
  });
});
