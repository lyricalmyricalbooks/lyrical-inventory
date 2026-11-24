// Book barcodes: the camera scanner built into Android Chrome (BarcodeDetector,
// free, no download), and the matching of a scanned or typed code to a book.
// A USB or Bluetooth scanner types the code and presses Enter, so that path
// works on every device, iPhones included, through the same bookForCode.

import { bareIsbn } from './app-search.js';

/** The ISBN-13 an ISBN-10 is printed as on the barcode ("978" + 9 digits + check). */
export function isbn10to13(isbn10) {
  const d = bareIsbn(isbn10);
  if (d.length !== 10) return '';
  const core = `978${d.slice(0, 9)}`;
  if (!/^\d{12}$/.test(core)) return '';
  const sum = [...core].reduce((acc, c, i) => acc + Number(c) * (i % 2 ? 3 : 1), 0);
  return core + String((10 - (sum % 10)) % 10);
}

function isbnForms(isbn) {
  const d = bareIsbn(isbn);
  if (!d) return [];
  const forms = [d];
  if (d.length === 10) forms.push(isbn10to13(d));
  return forms.filter(Boolean);
}

/**
 * The one book whose ISBN is this code, or null. A code that matches two
 * books (the same ISBN typed on both) matches neither, so a scan never picks
 * the wrong one.
 */
export function bookForCode(code, books) {
  const c = bareIsbn(code);
  if (c.length < 8) return null;
  const hits = Object.values(books || {}).filter(b => b && isbnForms(b.isbn).includes(c));
  return hits.length === 1 ? hits[0] : null;
}

/** True where the phone's own camera scanner can be used. */
export function cameraScanSupported(win = globalThis) {
  return !!(win && typeof win.BarcodeDetector === 'function' && win.navigator?.mediaDevices?.getUserMedia);
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

/**
 * Opens a full-screen camera view and calls onCode with the first barcode it
 * reads, then closes. onError gets a plain-language message when the camera
 * can't be used. Returns a function that closes the view.
 */
export function openCameraScanner({ onCode, onError, title = 'Scan a book' }, win = globalThis) {
  const doc = win.document;
  let stream = null, timer = 0, closed = false;
  const wrap = doc.createElement('div');
  wrap.className = 'scan-overlay';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', title);
  wrap.innerHTML = `<div class="scan-box">
      <p class="scan-title">${title}</p>
      <video class="scan-video" playsinline muted></video>
      <p class="scan-hint">Hold the barcode on the back of the book inside the frame.</p>
      <button type="button" class="btn" data-scan-close>Cancel</button>
    </div>`;
  const close = () => {
    if (closed) return;
    closed = true;
    win.clearTimeout(timer);
    stream?.getTracks().forEach(t => t.stop());
    wrap.remove();
    doc.removeEventListener('keydown', onKey);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  wrap.querySelector('[data-scan-close]').addEventListener('click', close);
  doc.addEventListener('keydown', onKey);
  doc.body.appendChild(wrap);

  const fail = msg => { close(); onError?.(msg); };
  let detector;
  try { detector = new win.BarcodeDetector({ formats: FORMATS }); }
  catch (_) { fail('This phone’s camera can’t read barcodes. Type the ISBN in the search box instead.'); return close; }

  const video = wrap.querySelector('video');
  win.navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    .then(s => {
      stream = s;
      if (closed) { s.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = s;
      return video.play();
    })
    .then(() => {
      const tick = async () => {
        if (closed) return;
        try {
          const found = await detector.detect(video);
          const code = found && found[0] && found[0].rawValue;
          if (code) { close(); onCode(String(code)); return; }
        } catch (_) { /* a frame that isn't ready yet; try the next one */ }
        timer = win.setTimeout(tick, 200);
      };
      tick();
    })
    .catch(err => {
      if (closed) return;
      fail(err && err.name === 'NotAllowedError'
        ? 'The camera is blocked for this app. Allow it in the browser’s site settings, or type the ISBN instead.'
        : 'The camera couldn’t start. Type the ISBN in the search box instead.');
    });
  return close;
}
