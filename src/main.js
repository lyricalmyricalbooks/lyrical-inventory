import './style.css';
import './firebase.js';
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({ onNeedRefresh() {} });

// ═══════════════════════════════════════════════════════
//  BOOK CATALOGUE
//  Add/edit books here. Each book gets its own Firebase
//  node, its own tab, and its own shareable URL.
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
//  BOOK CATALOGUE (Dynamicly loaded from Firebase)
// ═══════════════════════════════════════════════════════
let BOOKS = {};
let editingBookId = null;
// IDs of DEFAULT_BOOKS that the user has explicitly removed. Persisted in the
// catalog Firebase doc so the merge below doesn't resurrect them on next load.
let deletedDefaultIds = [];

function saveCatalogWithDeletions() {
  return window._fbSaveCatalog({ ...BOOKS, _deletedDefaults: deletedDefaultIds });
}
const DEFAULT_BOOKS = {
  altrove: { id: 'altrove', title: 'Un Fantastico Altrove', author: 'Silvia Clo Di Gregorio', isbn: '978-88-XXXXXX', maxPrint: 120, listPrice: 40, currency: '€', threshold: 15, productionCost: 0, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#c8913a', accentBg: 'rgba(200,145,58,.1)', urlParam: 'altrove', authorPassword: 'silvia2025' },
  hound: { id: 'hound', title: 'The Hound', author: '', isbn: '—', maxPrint: 300, listPrice: 65, currency: 'CA$', threshold: 30, productionCost: 15000, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#3a7cc8', accentBg: 'rgba(58,124,200,.1)', urlParam: 'hound', authorPassword: 'hound2025' },
  archaeology: { id: 'archaeology', title: 'Archaeology of Presence', author: 'Ilaria di Benedetto', isbn: '—', maxPrint: 80, listPrice: 40, currency: '€', threshold: 10, productionCost: 0, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#7a5c3a', accentBg: 'rgba(122,92,58,.1)', urlParam: 'archaeology', authorPassword: 'ilaria2025' },
  sistema: { id: 'sistema', title: 'Sistema_non_autorizzato', author: 'Maria Luna Tucci', isbn: '—', maxPrint: 60, listPrice: 40, currency: '€', threshold: 8, productionCost: 0, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#2a7a5c', accentBg: 'rgba(42,122,92,.1)', urlParam: 'sistema', authorPassword: 'marialuna2025' },
  nobody: { id: 'nobody', title: 'As if Nobody is Watching', author: 'Chiara Pirovano', isbn: '—', maxPrint: 100, listPrice: 40, currency: '€', threshold: 10, productionCost: 0, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#8a3a7a', accentBg: 'rgba(138,58,122,.1)', urlParam: 'nobody', authorPassword: 'chiara2025' },
  collective: { id: 'collective', title: 'Collective Photobook', author: 'Lyricalmyrical Books', isbn: '—', maxPrint: 100, listPrice: 40, currency: '€', threshold: 10, productionCost: 0, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#c8913a', accentBg: 'rgba(200,145,58,.1)', urlParam: 'collective', authorPassword: 'collective2025' }
};

async function loadCatalog() {
  try {
    const stored = await window._fbLoadCatalog(); // handles FS → RTDB fallback internally
    if (stored) {
      deletedDefaultIds = Array.isArray(stored._deletedDefaults) ? stored._deletedDefaults.slice() : [];
      const storedBooks = { ...stored };
      delete storedBooks._deletedDefaults;
      const filteredDefaults = {};
      Object.keys(DEFAULT_BOOKS).forEach(id => {
        if (!deletedDefaultIds.includes(id)) filteredDefaults[id] = DEFAULT_BOOKS[id];
      });
      BOOKS = { ...filteredDefaults, ...storedBooks };
      if (Object.keys(BOOKS).length > Object.keys(storedBooks).length) {
        await saveCatalogWithDeletions();
      }
    } else {
      BOOKS = { ...DEFAULT_BOOKS };
      deletedDefaultIds = [];
      await saveCatalogWithDeletions();
    }
  } catch (e) {
    console.error('Critical error loading catalog', e);
    BOOKS = { ...DEFAULT_BOOKS };
    deletedDefaultIds = [];
  }
}

function resetBookForm() {
  editingBookId = null;
  $('add-book-modal-title').textContent = 'Add new book';
  $('add-book-save-btn').textContent = 'Save Book';
  $('nb-id').disabled = false;
  $('nb-id').value = '';
  $('nb-title').value = '';
  $('nb-author').value = '';
  $('nb-isbn').value = '';
  $('nb-max').value = '100';
  $('nb-price').value = '40';
  $('nb-cur').value = '€';
  $('nb-thresh').value = '10';
  $('nb-accent').value = '#c8913a';
  $('nb-pw').value = '';
  $('nb-prod').value = '0';
  $('nb-paylink').value = '';
}

function openAddBookModal() {
  resetBookForm();
  openM('add-book');
}

function openEditBookModal(id) {
  const book = BOOKS[id];
  if (!book) return;
  editingBookId = id;
  $('add-book-modal-title').textContent = `Edit book · ${book.title}`;
  $('add-book-save-btn').textContent = 'Save Changes';
  $('nb-id').disabled = true;
  $('nb-id').value = book.id || '';
  $('nb-title').value = book.title || '';
  $('nb-author').value = book.author || '';
  $('nb-isbn').value = book.isbn || '—';
  $('nb-max').value = book.maxPrint ?? 100;
  $('nb-price').value = book.listPrice ?? 40;
  $('nb-cur').value = book.currency || '€';
  $('nb-thresh').value = book.threshold ?? 10;
  $('nb-accent').value = book.accent || '#c8913a';
  $('nb-pw').value = book.authorEmail || '';
  $('nb-prod').value = book.productionCost ?? 0;
  $('nb-paylink').value = book.stripeLink || '';
  openM('add-book');
}

function closeAddBookModal() {
  closeM('add-book');
  resetBookForm();
}

async function saveBookFromModal() {
  const id = $('nb-id').value.trim();
  const title = $('nb-title').value.trim();
  if (!id || !title) { showToast('ID and Title are required', 'warn'); return; }
  
  const currentBook = BOOKS[editingBookId] || BOOKS[id] || {};
  const book = {
    id,
    title,
    author: $('nb-author').value.trim(),
    isbn: $('nb-isbn').value.trim() || '—',
    maxPrint: parseInt($('nb-max').value) || 100,
    listPrice: parseFloat($('nb-price').value) || 40,
    currency: $('nb-cur').value || '€',
    threshold: parseInt($('nb-thresh').value) || 10,
    productionCost: parseFloat($('nb-prod').value) || 0,
    paymentLink: currentBook.paymentLink || 'https://paypal.me/lyricalmyricalbooks',
    stripeLink: $('nb-paylink').value.trim() || currentBook.stripeLink || '',
    accent: $('nb-accent').value,
    accentBg: hexToRgba($('nb-accent').value, 0.1),
    urlParam: currentBook.urlParam || id,
    authorEmail: ($('nb-pw').value || '').toLowerCase().trim() || currentBook.authorEmail || '',
    profitTiers: currentBook.profitTiers || []
  };
  
  if (editingBookId && editingBookId !== id) {
    delete BOOKS[editingBookId];
    if (states[editingBookId]) {
      states[id] = states[editingBookId];
      delete states[editingBookId];
    }
  }
  BOOKS[id] = book;
  if (!states[id]) states[id] = defaultState(book);
  // Re-adding a previously-deleted default removes it from the tombstone list.
  if (DEFAULT_BOOKS[id]) {
    const i = deletedDefaultIds.indexOf(id);
    if (i !== -1) deletedDefaultIds.splice(i, 1);
  }
  await saveCatalogWithDeletions();
  showToast(editingBookId ? '✓ Book updated' : '✓ Book added to catalog');
  closeAddBookModal();
  buildBookSwitcher();
  renderCatalogList();
  renderProfitSettings();
  renderCurrent();
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function renderCatalogList() {
  const container = $('catalog-list');
  if (!container) return;
  container.innerHTML = Object.values(BOOKS).map(b => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--ink);border-radius:var(--r2);border:1px solid rgba(255,255,255,0.05);">
       <div style="display:flex;align-items:center;gap:10px;">
         <div style="width:12px;height:12px;border-radius:50%;background:${b.accent}"></div>
         <div>
           <div style="font-size:13px;font-weight:600;color:var(--cream);">${b.title}</div>
           <div style="font-size:11px;color:rgba(255,255,255,.55);">${b.id} · ${b.currency}${b.listPrice}</div>
         </div>
       </div>
       <div style="display:flex;gap:8px;">
         <button class="btn sm" onclick="openEditBookModal('${b.id}')">Edit</button>
         <button class="btn sm danger-btn" onclick="deleteBook('${b.id}')">Remove</button>
       </div>
    </div>`).join('');
}

async function deleteBook(id) {
  if (!confirm(`Permanently remove "${BOOKS[id].title}" and all its inventory records?`)) return;
  delete BOOKS[id];
  delete states[id];
  if (DEFAULT_BOOKS[id] && !deletedDefaultIds.includes(id)) {
    deletedDefaultIds.push(id);
  }
  await saveCatalogWithDeletions();
  if (typeof window._fbDeleteBook === 'function') {
    try { await window._fbDeleteBook(id); } catch (e) { console.warn('fbDeleteBook failed', e); }
  }
  buildBookSwitcher();
  renderCatalogList();
  if (psActiveBookId === id) psActiveBookId = null;
  renderProfitSettings();
  renderCurrent();
  showToast('Book removed');
}

window.saveBookFromModal = saveBookFromModal;
window.openAddBookModal = openAddBookModal;
window.openEditBookModal = openEditBookModal;
window.closeAddBookModal = closeAddBookModal;
window.deleteBook = deleteBook;

// ── PAYMENT QR GENERATOR (publisher only)
let currentQR = null;

function openPaymentQRModal() {
  if (!activeBook || activeBook === 'all' || isAuthor()) return;
  const book = BOOKS[activeBook];
  const url = book.stripeLink || book.paymentLink || 'https://paypal.me/lyricalmyricalbooks';
  
  $('qr-book-title').textContent = book.title;
  $('qr-payment-link').value = url;
  
  const canvasContainer = $('payment-qr-canvas');
  canvasContainer.innerHTML = '';
  
  if (typeof QRCode !== 'undefined') {
    currentQR = new QRCode(canvasContainer, {
      text: url,
      width: 256,
      height: 256,
      colorDark : "#000000",
      colorLight : "#ffffff",
      correctLevel : QRCode.CorrectLevel.H
    });
  } else {
    canvasContainer.innerHTML = '<div style="color:var(--text3);font-size:12px;">QR Library failed to load.</div>';
  }
  
  openM('payment-qr');
}

function copyPaymentLink() {
  const link = $('qr-payment-link');
  link.select();
  document.execCommand('copy');
  showToast('Payment link copied');
}

function downloadPaymentQR() {
  const canvas = document.querySelector('#payment-qr-canvas canvas');
  if (!canvas) {
    showToast('QR code not ready', 'warn');
    return;
  }
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${BOOKS[activeBook].id}-payment-qr.png`;
  a.click();
  showToast('Downloading QR Code image');
}

window.openPaymentQRModal = openPaymentQRModal;
window.copyPaymentLink = copyPaymentLink;
window.downloadPaymentQR = downloadPaymentQR;

// ── ALL-BOOKS QR PAGE (publisher only)
function renderAllQRCodes() {
  const grid = $('qr-all-grid');
  if (!grid) return;
  grid.innerHTML = '';

  Object.values(BOOKS).forEach(book => {
    const url = book.stripeLink || book.paymentLink || '';
    const card = document.createElement('div');
    card.style.cssText = `background:var(--ink2);border:1px solid rgba(255,255,255,.08);border-radius:var(--r3);padding:1.5rem;display:flex;flex-direction:column;align-items:center;gap:1rem;`;

    // Book title header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;';
    header.innerHTML = `
      <div style="width:10px;height:10px;border-radius:50%;background:${book.accent};flex-shrink:0;"></div>
      <div style="flex:1;">
        <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:var(--cream);">${book.title}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:2px;">${book.author || '—'} · ${book.currency}${book.listPrice}</div>
      </div>`;
    card.appendChild(header);

    // QR code container
    const qrWrap = document.createElement('div');
    qrWrap.style.cssText = 'background:white;padding:14px;border-radius:var(--r2);width:196px;height:196px;display:flex;align-items:center;justify-content:center;';
    const qrEl = document.createElement('div');
    qrEl.id = `qr-all-${book.id}`;
    qrWrap.appendChild(qrEl);
    card.appendChild(qrWrap);

    if (url && typeof QRCode !== 'undefined') {
      new QRCode(qrEl, { text: url, width: 168, height: 168, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.H });
    } else {
      qrEl.innerHTML = `<div style="color:#aaa;font-size:11px;text-align:center;padding:1rem;">${url ? 'QR library not ready' : 'No Stripe link set.<br>Edit this book to add one.'}</div>`;
    }

    // Link display + actions
    const linkRow = document.createElement('div');
    linkRow.style.cssText = 'width:100%;display:flex;flex-direction:column;gap:8px;';
    linkRow.innerHTML = `
      <div style="font-size:10px;color:rgba(255,255,255,.3);font-family:'DM Mono',monospace;word-break:break-all;text-align:center;min-height:14px;">${url || 'No link configured'}</div>
      <div style="display:flex;gap:8px;">
        <button class="btn ink" style="flex:1;font-size:11px;" onclick="window.copyBookQR('${book.id}','${url.replace(/'/g,"\\'")}')">Copy link</button>
        <button class="btn gold" style="flex:1;font-size:11px;" ${url ? '' : 'disabled'} onclick="window.downloadBookQR('${book.id}')">Download</button>
      </div>`;
    card.appendChild(linkRow);
    grid.appendChild(card);
  });
}

window.renderAllQRCodes = renderAllQRCodes;

window.copyBookQR = function(bookId, url) {
  if (!url) { showToast('No link set for this book', 'warn'); return; }
  navigator.clipboard.writeText(url).then(() => showToast('Link copied')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); showToast('Link copied');
  });
};

window.downloadBookQR = function(bookId) {
  const canvas = document.querySelector(`#qr-all-${bookId} canvas`);
  if (!canvas) { showToast('QR not ready', 'warn'); return; }
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `${bookId}-payment-qr.png`;
  a.click();
  showToast(`Downloading QR for ${BOOKS[bookId]?.title || bookId}`);
};

// ── AUTHOR QR CODE PAGE (author view — single book)
let _authorQRInstance = null;

function renderAuthorQRPage() {
  const book = BOOKS[activeBook];
  if (!book) return;
  const url = book.stripeLink || book.paymentLink || '';

  // Populate header
  const titleEl = $('myqr-book-title');
  const metaEl  = $('myqr-book-meta');
  const statusEl = $('myqr-status');
  if (titleEl) titleEl.textContent = book.title;
  if (metaEl)  metaEl.textContent  = (book.author || '') + (book.author ? ' · ' : '') + book.currency + book.listPrice;

  // Set accent colour
  document.documentElement.style.setProperty('--book-accent', book.accent);

  // Clear previous QR and re-render
  const canvas = $('author-qr-canvas');
  if (!canvas) return;
  canvas.innerHTML = '';
  _authorQRInstance = null;

  if (url && typeof QRCode !== 'undefined') {
    _authorQRInstance = new QRCode(canvas, {
      text: url,
      width: 240,
      height: 240,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
    if (statusEl) statusEl.textContent = url;
    const dlBtn = $('myqr-dl-btn');
    const cpBtn = $('myqr-copy-btn');
    if (dlBtn) dlBtn.disabled = false;
    if (cpBtn) cpBtn.disabled = false;
  } else {
    if (statusEl) statusEl.innerHTML = url
      ? 'QR library not loaded. Please refresh the page.'
      : 'No payment link has been set for this book yet.<br>Ask your publisher to add the Stripe link.';
    const dlBtn = $('myqr-dl-btn');
    const cpBtn = $('myqr-copy-btn');
    if (dlBtn) dlBtn.disabled = true;
    if (cpBtn) cpBtn.disabled = true;
  }
}

window.copyAuthorQR = function() {
  const book = BOOKS[activeBook];
  if (!book) return;
  const url = book.stripeLink || book.paymentLink || '';
  if (!url) { showToast('No link configured for this book', 'warn'); return; }
  navigator.clipboard.writeText(url).then(() => showToast('Link copied')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); showToast('Link copied');
  });
};

window.downloadAuthorQR = function() {
  const canvas = document.querySelector('#author-qr-canvas canvas');
  if (!canvas) { showToast('QR not ready', 'warn'); return; }
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `${activeBook}-payment-qr.png`;
  a.click();
  showToast('Downloading QR Code');
};


// ═══════════════════════════════════════════════════════
//  ACCESS CONTROL
//  URL params:
//    ?book=hound            → author view, prompts author password
//    ?book=hound&dev=1      → skip password (dev/testing)
//    (no param)             → publisher gate, sees all books
// ═══════════════════════════════════════════════════════
const urlParams = new URLSearchParams(location.search);
const URL_BOOK = urlParams.get('book');    // e.g. 'hound'
let IS_AUTHOR_MODE = false;
let ACTIVE_BOOK_FORCED = null;
let AUTHOR_VIEW_BY_BOOK = {};

function loadAuthorViewOverrides() {
  try {
    AUTHOR_VIEW_BY_BOOK = JSON.parse(sessionStorage.getItem('lm-author-view-overrides') || '{}') || {};
  } catch (e) {
    AUTHOR_VIEW_BY_BOOK = {};
  }
}

function saveAuthorViewOverrides() {
  sessionStorage.setItem('lm-author-view-overrides', JSON.stringify(AUTHOR_VIEW_BY_BOOK));
}

function isPublisherSession() {
  return sessionStorage.getItem('lm-unlocked') === 'publisher';
}

// Runtime role check — works for both URL-based AND password-based author login
function isAuthor() {
  if (IS_AUTHOR_MODE) return true;
  const s = sessionStorage.getItem('lm-unlocked') || '';
  if (s.startsWith('author:')) return true;
  return !!(isPublisherSession() && activeBook && activeBook !== 'all' && AUTHOR_VIEW_BY_BOOK[activeBook]);
}

// ── UTILITIES
const $ = id => document.getElementById(id);
const CURRENCY_SYMBOL_TO_CODE = { '€':'EUR', '$':'CAD', 'CA$':'CAD', 'US$':'USD', '£':'GBP', '¥':'JPY', 'CHF':'CHF' };
const CODE_TO_SYMBOL = { 'EUR':'€', 'CAD':'CA$', 'USD':'US$', 'GBP':'£', 'JPY':'¥', 'CHF':'CHF', 'AUD':'A$' };
const getSym = c => CODE_TO_SYMBOL[c] || c;

function normalizeCurrencyCode(cur, fallback = 'CAD') {
  const raw = String(cur || '').trim();
  if (!raw) return fallback;
  const upper = raw.toUpperCase();
  if (CODE_TO_SYMBOL[upper]) return upper;
  if (CURRENCY_SYMBOL_TO_CODE[raw]) return CURRENCY_SYMBOL_TO_CODE[raw];
  if (upper === 'CA$' || upper === 'C$') return 'CAD';
  if (upper === 'US$') return 'USD';
  if (upper === '€' || upper === 'EUR') return 'EUR';
  return /^[A-Z]{3}$/.test(upper) ? upper : fallback;
}

const fmt = (n, cur='€') => getSym(cur) + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtNum = n => Number(n).toFixed(2);
const fmtD = d => {
  if (!d || d === '—' || d === 'Invalid Date') return '—';
  // Try parsing as-is (works for ISO and most human strings)
  let dt = new Date(d);
  // Fallback for YYYY-MM-DD to avoid timezone shifting
  if (isNaN(dt.getTime()) || (typeof d === 'string' && d.length === 10 && d.includes('-'))) {
    const noon = new Date(d + 'T12:00:00');
    if (!isNaN(noon.getTime())) dt = noon;
  }
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const today = () => new Date().toISOString().split('T')[0];

function getBookCurrencyCode(book) {
  const c = book.currency || 'EUR';
  return CURRENCY_SYMBOL_TO_CODE[c] || (String(c).length === 3 ? c : 'EUR');
}

function paymentSummary(payment, book) {
  if (!payment || !payment.currency) return '';
  const native = getBookCurrencyCode(book);
  const amount = Number(payment.amount || 0);
  const converted = Number(payment.convertedTotal || 0);
  if (payment.currency === native) return `Paid ${payment.currency} ${fmtNum(amount)}`;
  const ratePart = payment.rate ? ` @ ${payment.rate}` : '';
  return `Paid ${payment.currency} ${fmtNum(amount)}${ratePart} → ${fmt(converted, book.currency)}`;
}

function buildPaymentMeta({ book, qty, unitPrice, fxEnabled, fxCur, fxAmt, fxRate }) {
  const total = (Number(qty) || 0) * (Number(unitPrice) || 0);
  if (fxEnabled) {
    return {
      currency: fxCur || 'EUR',
      amount: Number(fxAmt) || 0,
      rate: (Number(fxRate) || 0) > 0 ? Number(fxRate) : null,
      convertedTotal: total
    };
  }
  return {
    currency: getBookCurrencyCode(book),
    amount: total,
    rate: null,
    convertedTotal: total
  };
}

// ── PER-BOOK STATE
// states[bookId] = { stock, sold, revenue, chStats, hist, stores, ledger, doneIds }
let states = {};
window.authorSubmissions = {}; // Tracks pending expenses/sales by Authors
let activeBook = null;   // currently viewed bookId, or 'all'
let orders = [], activeId = null;
let fbReady = false, lastSavedHashes = {}, lastSaveTimes = {};
let syncQueue = JSON.parse(localStorage.getItem('lm-sync-queue') || '[]');
let systemBackups = [];
const SYSTEM_BACKUP_KEY = 'systemBackups';
const SYSTEM_BACKUP_LIMIT = 30;
const BACKUP_FOLDER_DB = 'lm-backup-folder-db';
const BACKUP_FOLDER_STORE = 'handles';
const BACKUP_FOLDER_KEY = 'preferred-folder';
const RECEIPT_FOLDER_DB = 'lm-receipt-folder-db';
const RECEIPT_FOLDER_STORE = 'handles';
const RECEIPT_FOLDER_KEY = 'preferred-receipt-folder';

function queueSync(bookId, state) {
  syncQueue.push({ bookId, state, ts: Date.now() });
  localStorage.setItem('lm-sync-queue', JSON.stringify(syncQueue));
  processSyncQueue();
}

async function processSyncQueue() {
  if (!navigator.onLine || !fbReady || !syncQueue.length) return;
  const item = syncQueue[0];
  try {
    await window._fbSave(item.bookId, JSON.stringify(item.state));
    syncQueue.shift();
    localStorage.setItem('lm-sync-queue', JSON.stringify(syncQueue));
    if (syncQueue.length) processSyncQueue();
    else showToast('✅ All offline changes synced to Firestore');
  } catch (e) {
    console.error('Queue sync failed', e);
  }
}

window.addEventListener('online', processSyncQueue);
let sheetsUrl = localStorage.getItem('lm-sheets-url') || '';
let sheetsSpreadsheetUrl = localStorage.getItem('lm-sheets-spreadsheet-url') || '';
if (sheetsUrl) {
  const normalizedSavedUrl = normalizeAppsScriptUrl(sheetsUrl);
  if (normalizedSavedUrl && normalizedSavedUrl !== sheetsUrl) {
    sheetsUrl = normalizedSavedUrl;
    localStorage.setItem('lm-sheets-url', normalizedSavedUrl);
  }
}

function defaultState(book) {
  return { stock: book.maxPrint, sold: 0, revenue: 0, chStats: {}, hist: [], stores: [], ledger: [], doneIds: [], artistTransfers: [], artistPayouts: [], expenses: [], artistPaymentLink: '', invoices: [], invoiceSeq: 0 };
}

function getState() { 
  if (!states[activeBook]) {
    states[activeBook] = defaultState(BOOKS[activeBook] || Object.values(BOOKS)[0]);
  }
  return states[activeBook];
}
function getBook()  { return BOOKS[activeBook] || Object.values(BOOKS)[0]; }

// ── TOAST
function showToast(msg, type='ok', dur=2800) {
  const t=$('toast'); t.textContent=msg;
  t.className='toast show'+(type==='warn'?' warn':type==='err'?' err':'');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),dur);
}

// ── SYNC UI
function setSyncState(status, msg) {
  const dot=$('sync-dot'), label=$('sync-label'), time=$('sync-time');
  dot.className='sync-dot'+(status==='syncing'?' syncing':status==='error'?' error':'');
  label.innerHTML=msg; time.textContent=new Date().toLocaleTimeString();
}

// ── FIREBASE (per-book)
async function saveState(bookId) {
  const state = states[bookId];
  if (!state) {
    console.warn(`saveState: No local state found for bookId: ${bookId}`);
    setSyncState('error', '<b>Firestore</b> · missing state object');
    return;
  }
  const json = JSON.stringify(state);
  if (json === lastSavedHashes[bookId]) return;
  setSyncState('syncing', '<b>Firestore</b> · saving…');
  try {
    if (!fbReady || !navigator.onLine) {
      queueSync(bookId, state);
      setSyncState('ok', '<b>Firestore</b> · changes queued (offline)');
      return;
    }
    await window._fbSave(bookId, json);
    lastSavedHashes[bookId] = json;
    lastSaveTimes[bookId] = Date.now();
    setSyncState('ok', '<b>Firestore</b> · saved · live sync on');
    const ind=$('save-ind'); if(ind){ind.classList.add('show');setTimeout(()=>ind.classList.remove('show'),2000);}
  } catch(e) { 
    console.error(`Firebase Save Error [${bookId}]:`, e);
    const err = e.message || e.code || 'save failed';
    setSyncState('error', `<b>Firestore</b> · ${err}`); 
    showToast(`⚠ Sync Error: ${err}`, 'err');
  }
}

async function loadBook(bookId) {
  setSyncState('syncing', '<b>Firestore</b> · loading…');
  try {
    if (!fbReady) throw new Error('not ready');
    const json = await window._fbLoad(bookId);
    const book = BOOKS[bookId];
    if (json) {
      const loaded = JSON.parse(json);
      states[bookId] = { ...defaultState(book), ...loaded };
    } else {
      states[bookId] = defaultState(book);
    }
    if (!states[bookId].doneIds) states[bookId].doneIds = [];
    if (!states[bookId].artistTransfers) states[bookId].artistTransfers = [];
    if (!states[bookId].artistPayouts) states[bookId].artistPayouts = [];
    if (!states[bookId].expenses) states[bookId].expenses = [];
    // Sync artist payment link to book object so publisher can read it in reimbursements
    if (states[bookId].artistPaymentLink) BOOKS[bookId].artistPaymentLink = states[bookId].artistPaymentLink;
    recomputeAfters(states[bookId]);
    lastSavedHashes[bookId] = JSON.stringify(states[bookId]);
    // Watch for live updates
    window._fbWatchSubmissions(bookId, data => {
      window.authorSubmissions[bookId] = data || {};
      if (activeBook === bookId || activeBook === 'all') renderCurrent();
      else { try { updatePublisherActionBanner(); } catch(_) {} }
    });
    
    window._fbWatch(bookId, json2 => {
      if (json2 === lastSavedHashes[bookId]) return;
      const loaded = JSON.parse(json2);
      states[bookId] = { ...defaultState(book), ...loaded };
      if (!states[bookId].doneIds) states[bookId].doneIds = [];
      if (!states[bookId].artistTransfers) states[bookId].artistTransfers = [];
    if (!states[bookId].artistPayouts) states[bookId].artistPayouts = [];
      recomputeAfters(states[bookId]);
      lastSavedHashes[bookId] = json2;
      if (activeBook === bookId || activeBook === 'all') renderCurrent();
      // Suppress the echo-toast that fires right after a local save is written to Firestore
      const timeSinceLastSave = Date.now() - (lastSaveTimes[bookId] || 0);
      if (timeSinceLastSave > 3000) {
        showToast('↺ '+book.title+' updated from Firestore');
      }
    });
  } catch(e) {
    states[bookId] = defaultState(BOOKS[bookId]);
    setSyncState('error','<b>Firestore</b> · connection failed');
  }
}

async function toggleFirestoreMode() {
  if (!activeBook || activeBook === 'all') return;
  const isCurrentlyFS = window._useFirestoreForBook(activeBook);

  if (!isCurrentlyFS) {
    if (!confirm(
      `Migrate "${BOOKS[activeBook]?.title || activeBook}" to Cloud Firestore?\n\n` +
      `• This book's data will be copied to Firestore now.\n` +
      `• If this is the FIRST book being migrated, global settings (catalog, tax center, rates) will also be copied.\n` +
      `• All other books stay on Realtime Database until you migrate them individually.\n\n` +
      `You can revert at any time using this same button.`
    )) return;

    // --- Migrate global settings on first book ---
    const isFirstMigration = !window._useFirestoreGlobal();
    if (isFirstMigration) {
      try {
        showToast('Migrating global settings to Firestore…', 'ok');
        
        // TEMPORARILY enable global flag to perform the save to Firestore
        window._enableFirestoreGlobal();
        
        // Mirror current memory state to Firestore
        await saveCatalogWithDeletions();
        await saveTaxCenter();
        
        const prodCosts = {};
        const payLinks = {};
        Object.keys(BOOKS).forEach(bid => {
          if (BOOKS[bid].productionCost != null) prodCosts[bid] = BOOKS[bid].productionCost;
          if (BOOKS[bid].artistPaymentLink) payLinks[bid] = BOOKS[bid].artistPaymentLink;
        });
        await window._fbSaveSettings('productionCosts', prodCosts);
        await window._fbSaveSettings('paymentLinks', payLinks);

        showToast('✓ Global settings migrated', 'ok', 3000);
      } catch (e) {
        console.error('Global settings migration failed:', e);
        window._disableFirestoreGlobal();
        showToast('⚠ Failed to migrate global settings — check console', 'err', 5000);
        return;
      }
    }

    // --- Migrate this book's data ---
    try {
      window._setBookFirestoreMode(activeBook, true);
      await saveState(activeBook);
      await loadBook(activeBook);
      showToast(`✓ ${BOOKS[activeBook]?.title || activeBook} migrated to Cloud Firestore`, 'ok', 4000);
    } catch (e) {
      console.error('Book migration failed:', e);
      window._setBookFirestoreMode(activeBook, false);
      showToast('⚠ Failed to migrate book data', 'err');
    }

  } else {
    const anyOtherFSBook = Object.keys(BOOKS).filter(id => id !== activeBook).some(id => window._useFirestoreForBook(id));

    if (!confirm(
      `Revert "${BOOKS[activeBook]?.title || activeBook}" back to Realtime Database?\n\n` +
      `${!anyOtherFSBook ? '• No other books are on Firestore — global settings will also revert to RTDB.\n' : ''}` +
      `• Current state will be written back to the old database.`
    )) return;

    // --- Revert this book ---
    window._setBookFirestoreMode(activeBook, false);
    await saveState(activeBook);
    await loadBook(activeBook);

    // --- Revert global settings if no more books are on Firestore ---
    if (!anyOtherFSBook) {
      window._disableFirestoreGlobal();
      await saveTaxCenter();
      await saveCatalogWithDeletions();
    }

    showToast(`Reverted to Realtime Database`, 'ok', 4000);
  }
  renderCurrent();
}
window.toggleFirestoreMode = toggleFirestoreMode;

window.performFullMigration = async () => {
  if (!confirm(
    "🚨 MASS MIGRATION TO CLOUD FIRESTORE 🚨\n\n" +
    "This will read EVERY book, EVERY expense, EVERY sale, and ALL settings from the Realtime Database and bulk-slice them into Cloud Firestore.\n\n" +
    "This cannot be easily undone. Once this process reaches 100%, your application will be permanently cut over to Firestore globally.\n\n" +
    "Are you absolutely sure you want to proceed?"
  )) return;
  
  if (prompt('Type "CONFIRM" to start massive data migration:') !== "CONFIRM") {
    return showToast('Migration aborted.', 'warn');
  }

  showToast('🚀 MIGRATING MASSIVE DATA... PLEASE WAIT...', 'warn', 100000);
  document.body.style.pointerEvents = 'none';
  document.body.style.opacity = '0.7';

  try {
    const success = await window._fbMassMigrate(BOOKS);
    if (!success) throw new Error("Migration utility returned false.");
    
    // Globally enable Firestore
    window._enableFirestoreGlobal();
    // Enable for all books — persisted to Firestore so ALL devices pick this up
    Object.keys(BOOKS).forEach(id => {
      window._setBookFirestoreMode(id, true);
    });
    
    showToast('✓ FULL MIGRATION SUCCESSFUL! RELOADING...', 'ok', 100000);
    setTimeout(() => location.reload(), 3000);
  } catch (e) {
    document.body.style.pointerEvents = 'auto';
    document.body.style.opacity = '1';
    console.error("Migration error:", e);
    alert("Migration failed! Error: " + (e.message || "Unknown error"));
    showToast('⚠ Migration failed — check console', 'err', 5000);
  }
};

// ── TAX CENTER STATE (Publisher Only)
let TAX_CENTER = { businessExpenses: [], recurring: [], settings: { baseCurrency: 'CAD', geminiKey: '' } };
let _fxRateCache = { 'CAD_CAD': 1 };

async function loadTaxCenter() {
  if (isAuthor()) return;
  try {
    const json = await window._fbLoadSettings('taxCenter'); // handles FS → RTDB fallback internally
    if (json) {
      TAX_CENTER = { businessExpenses: [], recurring: [], settings: { baseCurrency: 'CAD', geminiKey: '' }, ...json };
    }
    if (TAX_CENTER.settings?.rates) Object.assign(_fxRateCache, TAX_CENTER.settings.rates);
    await refreshDailyRates();
    processRecurringExpenses();
  } catch (e) {
    console.warn('Failed to load tax center', e);
  }
}

async function saveTaxCenter() {
  if (isAuthor()) return;
  try {
    await window._fbSaveSettings('taxCenter', TAX_CENTER);
  } catch (e) {
    console.error(e);
  }
}

function processRecurringExpenses() {
  if (isAuthor() || !TAX_CENTER.recurring || TAX_CENTER.recurring.length === 0) return;
  const now = new Date();
  const currentMonthStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  
  let modified = false;
  TAX_CENTER.recurring.forEach(sub => {
    const startDate = sub.startDate || today();
    const start = new Date(startDate);
    const startDay = start.getDate();
    
    // Start checking from the month of startDate
    let checkDate = new Date(start.getFullYear(), start.getMonth(), 1);
    const todayMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    while (checkDate <= todayMonth) {
      const mStr = checkDate.getFullYear() + '-' + String(checkDate.getMonth() + 1).padStart(2, '0');
      
      // Inject if this month is after lastInjected (YYYY-MM comparison)
      if (mStr > (sub.lastInjected || '')) {
        const lastDayInMonth = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 0).getDate();
        const injectionDay = Math.min(startDay, lastDayInMonth);
        const injectionDateStr = checkDate.getFullYear() + '-' + 
                                 String(checkDate.getMonth() + 1).padStart(2, '0') + '-' + 
                                 String(injectionDay).padStart(2, '0');

        if (!TAX_CENTER.businessExpenses) TAX_CENTER.businessExpenses = [];
        const origCur = sub.currency || 'CAD';
        const fxRate = _fxRateCache[`${origCur}_CAD`] || 1;
        const baseAmount = (parseFloat(sub.amount) || 0) * fxRate;
        
        TAX_CENTER.businessExpenses.unshift({
          id: Date.now() + Math.random(),
          desc: sub.desc + ' (Recurring)',
          cat: sub.cat,
          currency: origCur,
          amount: parseFloat(sub.amount) || 0,
          fxRate: fxRate,
          baseAmount: baseAmount,
          date: injectionDateStr,
          ref: 'Auto-Injected',
          receipt: ''
        });
        
        sub.lastInjected = mStr;
        modified = true;
      }
      
      // Advance by one month
      checkDate.setMonth(checkDate.getMonth() + 1);
    }
  });
  
  if (modified) {
    saveTaxCenter();
    renderTaxCenter();
  }
}

async function refreshDailyRates() {
  if (isAuthor()) return;
  const todayStr = today();
  if (TAX_CENTER.settings && TAX_CENTER.settings.lastRateSync === todayStr && TAX_CENTER.settings.rates) {
      Object.assign(_fxRateCache, TAX_CENTER.settings.rates);
      return;
  }
  
  try {
      const res = await fetch(`https://open.er-api.com/v6/latest/CAD`);
      if (res.ok) {
          const json = await res.json();
          const rates = {};
          if (json.rates) {
             Object.keys(json.rates).forEach(cur => {
                 // Convert TO CAD rate (e.g. USD is 1.35 CAD)
                 rates[`${cur}_CAD`] = 1 / json.rates[cur]; 
             });
             rates['CAD_CAD'] = 1;
             Object.assign(_fxRateCache, rates);
             if(!TAX_CENTER.settings) TAX_CENTER.settings = { baseCurrency: 'CAD', geminiKey: '' };
             TAX_CENTER.settings.rates = rates;
             TAX_CENTER.settings.lastRateSync = todayStr;
             saveTaxCenter();
          }
      }
  } catch(e) {
      console.warn("Failed to fetch daily rates", e);
  }
}


async function loadAllBooks() {
  setSyncState('syncing','<b>Firestore</b> · loading all books.');
  await Promise.all(Object.keys(BOOKS).map(id => loadBook(id)));
  await loadTaxCenter();
  setSyncState('ok','<b>Firestore</b> · connected · live sync on');
  $('hdr-sub').textContent = 'Inventory App · Synced '+new Date().toLocaleTimeString();
  renderCurrent();
}

async function forceSync() {
  if (isAuthor() && activeBook) { await loadBook(activeBook); renderCurrent(); }
  else {
    await loadAllBooks();
    await loadTaxCenter();
  }
}

// ── BOOK SWITCHER (build custom dropdown)
function buildBookSwitcher() {
  const menu = $('book-dropdown-menu');
  if (!menu) return;
  // All books option
  menu.innerHTML = `<div class="book-dd-item active" data-id="all" onclick="switchBook('all');closeBookDropdown();" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;font-family:'Syne',sans-serif;font-size:12px;font-weight:600;color:var(--gold3);background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.06);">
    <div style="width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.25);flex-shrink:0;"></div>All books
  </div>`;
  Object.values(BOOKS).forEach(book => {
    const item = document.createElement('div');
    item.className = 'book-dd-item';
    item.dataset.id = book.id;
    item.onclick = () => { switchBook(book.id); closeBookDropdown(); };
    item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;font-family:\'Syne\',sans-serif;font-size:12px;font-weight:600;color:rgba(255,255,255,.7);transition:background .12s;border-bottom:1px solid rgba(255,255,255,.04);';
    item.onmouseover = () => item.style.background = 'rgba(255,255,255,.06)';
    item.onmouseout  = () => item.style.background = '';
    item.innerHTML = `<div style="width:8px;height:8px;border-radius:50%;background:${book.accent};flex-shrink:0;"></div>${book.title}`;
    menu.appendChild(item);
  });
}

function toggleBookDropdown() {
  const menu = $('book-dropdown-menu');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  if (isOpen) {
    menu.style.display = 'none';
  } else {
    menu.style.display = 'block';
    // Defer outside-click listener so it doesn't fire on this same click
    setTimeout(() => {
      function outsideClick(e) {
        if (!$('book-dropdown')?.contains(e.target)) {
          menu.style.display = 'none';
          document.removeEventListener('click', outsideClick);
        }
      }
      document.addEventListener('click', outsideClick);
    }, 0);
  }
}
function closeBookDropdown() {
  const menu = $('book-dropdown-menu');
  if (menu) menu.style.display = 'none';
}

function updateRoleToggleButton() {
  const btn = $('role-toggle-btn');
  if (!btn) return;
  const canToggle = isPublisherSession() && !!activeBook && activeBook !== 'all';
  if (!canToggle) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  const inAuthorPreview = !!AUTHOR_VIEW_BY_BOOK[activeBook];
  btn.textContent = inAuthorPreview ? 'Publisher view' : 'Author view';
}

function syncRoleUI() {
  const authorNow = isAuthor();
  const websiteTabBtn = $('website-tab-btn');
  const financialsTabBtn = $('financials-tab-btn');
  const taxcenterTabBtn = $('global-taxcenter-btn');
  const globalActions = $('global-actions');
  const sheetsTabBtn = $('global-sheets-btn');
  const backupsTabBtn = $('global-backups-btn');
  const qrBtn = $('d-qr-btn');
  const qrcodesTabBtn = $('qrcodes-tab-btn');
  const myqrTabBtn = $('myqr-tab-btn');
  if (websiteTabBtn) websiteTabBtn.style.display = authorNow ? 'none' : '';
  if (financialsTabBtn) financialsTabBtn.style.display = authorNow ? 'none' : '';
  if (globalActions) globalActions.style.display = authorNow ? 'none' : 'flex';
  if (taxcenterTabBtn) taxcenterTabBtn.style.display = authorNow ? 'none' : '';
  if (sheetsTabBtn) sheetsTabBtn.style.display = authorNow ? 'none' : '';
  if (backupsTabBtn) backupsTabBtn.style.display = authorNow ? 'none' : '';
  if (qrBtn) qrBtn.style.display = authorNow ? 'none' : '';
  if (qrcodesTabBtn) qrcodesTabBtn.style.display = authorNow ? 'none' : '';
  // myqr tab is AUTHOR-only
  if (myqrTabBtn) myqrTabBtn.style.display = authorNow ? '' : 'none';

  const wm = $('author-watermark');
  if (wm && isPublisherSession() && activeBook && activeBook !== 'all' && AUTHOR_VIEW_BY_BOOK[activeBook]) {
    wm.textContent = `${BOOKS[activeBook].title} · Author view preview`;
    wm.style.display = '';
  } else if (wm && !IS_AUTHOR_MODE && !(sessionStorage.getItem('lm-unlocked') || '').startsWith('author:')) {
    wm.style.display = 'none';
  }

  // When switching TO author view — redirect away from publisher-only tabs
  const publisherOnlyActive = $('tab-website')?.classList.contains('active')
    || $('tab-financials')?.classList.contains('active')
    || $('tab-taxcenter')?.classList.contains('active')
    || $('tab-sheets')?.classList.contains('active')
    || $('tab-backups')?.classList.contains('active')
    || $('tab-qrcodes')?.classList.contains('active');
  if (authorNow && publisherOnlyActive) switchTab('dashboard');

  // When switching BACK to publisher view — redirect away from author-only myqr tab
  if (!authorNow && $('tab-myqr')?.classList.contains('active')) switchTab('dashboard');

  // Invoices section: publisher-only inside the Consignment tab
  if (typeof renderInvoices === 'function') renderInvoices();
}

function toggleCurrentBookView() {
  if (!isPublisherSession() || !activeBook || activeBook === 'all') return;
  AUTHOR_VIEW_BY_BOOK[activeBook] = !AUTHOR_VIEW_BY_BOOK[activeBook];
  saveAuthorViewOverrides();
  updateRoleToggleButton();
  syncRoleUI();
  renderAll();
  showToast(
    AUTHOR_VIEW_BY_BOOK[activeBook]
      ? `Author view enabled for ${BOOKS[activeBook].title}`
      : `Publisher view restored for ${BOOKS[activeBook].title}`
  );
}

function switchBook(bookId) {
  activeBook = bookId;
  // Update custom dropdown label + dot
  const label = $('book-dropdown-label');
  const dot   = $('book-dropdown-dot');
  if (bookId === 'all') {
    if (label) label.textContent = 'All books';
    if (dot)   dot.style.background = 'rgba(255,255,255,.25)';
  } else {
    const book = BOOKS[bookId];
    if (label) label.textContent = book.title;
    if (dot)   dot.style.background = book.accent;
  }
  // Highlight active item in menu
  document.querySelectorAll('.book-dd-item').forEach(el => {
    const isActive = el.dataset.id === bookId;
    el.style.color = isActive ? 'var(--gold3)' : 'rgba(255,255,255,.7)';
    el.style.background = isActive ? 'rgba(255,255,255,.04)' : '';
  });

  if (bookId === 'all') {
    // Show combined overview, hide per-book tabs
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    $('tab-all-overview').classList.add('active');
    $('tab-bar').style.display = 'none';
    updateAllOverview();
    updateHeader();
  } else {
    $('tab-bar').style.display = '';
    const book = BOOKS[bookId];
    // Set CSS accent
    document.documentElement.style.setProperty('--book-accent', book.accent);
    document.documentElement.style.setProperty('--book-accent-bg', book.accentBg);
    switchTab('dashboard');
    updateHeader();
  }
  updateRoleToggleButton();
  syncRoleUI();
}

// ── TABS
function switchTab(name) {
  // publisher-only tabs redirect authors to dashboard
  if (isAuthor() && (name === 'website' || name === 'backups' || name === 'financials' || name === 'taxcenter' || name === 'sheets' || name === 'qrcodes')) name = 'dashboard';
  // publisher redirected away from author-only myqr tab
  if (!isAuthor() && name === 'myqr') name = 'dashboard';
  
  // Note: order exactly matches the tab-btn elements in index.html (excluding dashboard which isn't there, wait dashboard IS first!)
  // In index.html the order is: dashboard, website, manual, consignment, history, expenses, financials, taxcenter, sheets, backups, qrcodes, myqr, pos
  const names = ['dashboard','website','manual','consignment','history','expenses','financials','taxcenter','sheets','backups','qrcodes','myqr','pos'];
  
  document.querySelectorAll('.tab-btn, .header-action-btn').forEach((b) => {
    // We match by checking onclick text to be safe if order ever changes
    if (b.getAttribute('onclick')?.includes(`'${name}'`)) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  names.forEach(n => {
    const p = $('tab-'+n);
    if(p) { p.classList.remove('active'); p.style.display='none'; }
  });
  
  const overview = $('tab-all-overview');
  if (overview) {
    overview.classList.remove('active');
    overview.style.display='none';
  }

  const panel = $('tab-'+name);
  if(panel){ panel.style.display='block'; panel.classList.add('active'); }
  
  if(name==='dashboard') { updateDash(); renderArtistReimburseBanner(); renderPendingExpenses(); }
  if(name==='history') renderHist();
  if(name==='manual') updateManualForm();
  if(name==='consignment'){ renderStores(); renderLedger(); renderInvoices(); }
  if(name==='expenses'){ renderExpenses(); updateExpenseForm(); }
  if(name==='financials') renderFinancials();
  if(name==='taxcenter') renderTaxCenter();
  if(name==='sheets'){ renderSheetsLog(); renderPaymentLinkFields(); renderProductionCostFields(); renderProfitSettings(); }
  if(name==='qrcodes') renderAllQRCodes();
  if(name==='myqr') renderAuthorQRPage();
  if(name==='pos') { renderPOS(); renderPOSFxStatus(); }
}

function updateHeader() {
  if (activeBook === 'all') {
    // Sum all books
    const totalStock = Object.values(states).reduce((a,s)=>a+(s.stock||0),0);
    const totalRev = Object.values(states).reduce((a,s)=>a+(s.revenue||0),0);
    const totalCon = Object.values(states).reduce((a,s)=>a+s.stores.reduce((b,st)=>b+st.outstanding,0),0);
    $('h-stock').textContent = totalStock;
    $('h-revenue').textContent = '~'+totalRev.toFixed(0);
    $('h-consigned').textContent = totalCon;
  } else {
    const s = getState(), book = getBook();
    const cur = book.currency;
    $('h-stock').textContent = s.stock;
    $('h-revenue').textContent = fmt(s.revenue, cur);
    $('h-consigned').textContent = s.stores.reduce((a,st)=>a+st.outstanding,0);
  }
}

// ── ALL BOOKS OVERVIEW
function updateAllOverview() {
  // Book strips
  const list = $('all-books-list');
  list.innerHTML = Object.values(BOOKS).map(book => {
    const s = states[book.id] || defaultState(book);
    const consigned = s.stores.reduce((a,st)=>a+st.outstanding,0);
    const owed = s.stores.reduce((a,st)=>a+st.amountOwed,0);
    const pct = Math.max(0,s.stock/book.maxPrint*100);
    const stockClass = s.stock<=book.threshold?'danger':s.stock<=book.threshold*2?'warn':'gold';
    const cost = book.productionCost || 0;
    const broken = cost > 0 && s.revenue >= cost;
    const bePct = cost > 0 ? Math.min(100, s.revenue/cost*100) : null;
    const beBar = (!isAuthor() && bePct !== null) ? `<div style="margin-top:6px;display:flex;align-items:center;gap:8px;"><div style="flex:1;"><div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:3px;">Break-even</div><div class="bar-track" style="background:rgba(0,0,0,.08);margin-bottom:0;"><div class="bar-fill" style="width:${bePct}%;background:${broken?'#4ade80':'var(--gold2)'};"></div></div></div><span style="font-size:10px;font-family:'DM Mono',monospace;white-space:nowrap;color:${broken?'var(--green)':'var(--text3)'};">${broken?'✓ Broken even':bePct.toFixed(0)+'%'}</span></div>` : '';
    const expTotal = (s.expenses||[]).reduce((a,e)=>a+(e.amount||0),0);
    return `<div class="book-strip">
      <div class="book-strip-accent" style="background:${book.accent}"></div>
      <div class="book-strip-info">
        <div class="book-strip-title">${book.title}</div>
        <div class="book-strip-meta">${book.author||'—'} &nbsp;·&nbsp; ${book.currency}${book.listPrice} &nbsp;·&nbsp; ${book.maxPrint} printed</div>
        <div style="margin-top:8px;"><div class="bar-track" style="background:rgba(0,0,0,.08);margin-bottom:0;"><div class="bar-fill" style="width:${pct}%;background:${book.accent};"></div></div></div>
        ${beBar}
      </div>
      <div class="book-strip-kpis">
        <div class="bsk"><div class="bsk-val ${stockClass}">${s.stock}</div><div class="bsk-label">On hand</div></div>
        <div class="bsk"><div class="bsk-val">${s.sold}</div><div class="bsk-label">Sold</div></div>
        <div class="bsk"><div class="bsk-val">${owed>0?fmt(owed,book.currency):'—'}</div><div class="bsk-label">Owed</div></div>
        <div class="bsk"><div class="bsk-val${expTotal>0?' warn':''}">${expTotal>0?fmt(expTotal,book.currency):'—'}</div><div class="bsk-label">Expenses</div></div>
      </div>
      <div class="book-strip-actions">
        <button class="btn sm gold" onclick="switchBook('${book.id}')">Manage →</button>
      </div>
    </div>`;
  }).join('');

  // Combined channel table + analytics
  const rows = [];
  const channelTotals = {}; // chan -> currency -> {txns,units,revenue, books:Set}
  Object.values(BOOKS).forEach(book => {
    const s = states[book.id] || defaultState(book);
    const entries = Object.entries(s.chStats||{});
    if (!entries.length) return;
    const bookRev = entries.reduce((a,[,cs])=>a+(cs.revenue||0),0);
    let bestChan = null, bestRev = -1;
    entries.forEach(([chan,cs]) => { if ((cs.revenue||0) > bestRev) { bestRev = cs.revenue||0; bestChan = chan; } });
    entries.forEach(([chan,cs]) => {
      const txns = cs.txns||0, units = cs.units||0, rev = cs.revenue||0;
      const avgTxn = txns ? rev/txns : 0;
      const revUnit = units ? rev/units : 0;
      const sharePct = bookRev > 0 ? (rev/bookRev*100) : 0;
      const isBest = chan === bestChan && rev > 0 && entries.length > 1;
      const shareStr = bookRev > 0 ? sharePct.toFixed(0)+'%' : '—';
      const bestTag = isBest ? ' <span class="pill gold" style="font-size:9px;padding:1px 6px;margin-left:4px;vertical-align:middle;">TOP</span>' : '';
      rows.push(`<tr><td style="font-weight:600;">${book.title}${bestTag}</td><td>${chan}</td><td class="r">${txns}</td><td class="r">${units}</td><td class="r">${fmt(rev,book.currency)}</td><td class="r">${txns?fmt(avgTxn,book.currency):'—'}</td><td class="r">${units?fmt(revUnit,book.currency):'—'}</td><td class="r">${shareStr}</td></tr>`);

      const t = channelTotals[chan] = channelTotals[chan] || {};
      const c = t[book.currency] = t[book.currency] || {txns:0,units:0,revenue:0,books:new Set()};
      c.txns += txns; c.units += units; c.revenue += rev; c.books.add(book.title);
    });
  });
  $('all-ch-body').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="8"><div class="empty-state" style="padding:1rem;">No sales yet.</div></td></tr>';

  // Channel performance summary (grouped by currency to avoid mixing)
  const insights = $('all-ch-insights');
  if (insights) {
    const chanNames = Object.keys(channelTotals);
    if (!chanNames.length) {
      insights.innerHTML = '';
    } else {
      // Build per-currency leaderboards
      const byCur = {}; // currency -> [{chan, txns, units, revenue, books}]
      chanNames.forEach(chan => {
        Object.entries(channelTotals[chan]).forEach(([cur, c]) => {
          (byCur[cur] = byCur[cur] || []).push({chan, ...c});
        });
      });
      const blocks = Object.entries(byCur).map(([cur, list]) => {
        list.sort((a,b)=>b.revenue-a.revenue);
        const totalRev = list.reduce((a,x)=>a+x.revenue,0);
        const totalUnits = list.reduce((a,x)=>a+x.units,0);
        const totalTxns = list.reduce((a,x)=>a+x.txns,0);
        const top = list[0];
        const topShare = totalRev>0 ? (top.revenue/totalRev*100) : 0;
        const cards = list.map(x => {
          const share = totalRev>0 ? (x.revenue/totalRev*100) : 0;
          const avgTxn = x.txns ? x.revenue/x.txns : 0;
          const revUnit = x.units ? x.revenue/x.units : 0;
          return `<div style="background:white;border:1px solid var(--border);border-radius:var(--r1);padding:10px 12px;min-width:180px;flex:1;">
            <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:4px;">${x.chan}</div>
            <div style="font-weight:700;font-size:15px;color:var(--text2);">${fmt(x.revenue,cur)} <span style="font-size:11px;color:var(--text3);font-weight:500;">(${share.toFixed(0)}%)</span></div>
            <div class="bar-track" style="background:rgba(0,0,0,.06);margin:6px 0;height:4px;"><div class="bar-fill" style="width:${share}%;background:var(--gold2);height:4px;"></div></div>
            <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;">${x.txns} txn · ${x.units} u · ${x.txns?fmt(avgTxn,cur):'—'}/txn · ${x.units?fmt(revUnit,cur):'—'}/u</div>
          </div>`;
        }).join('');
        return `<div style="margin-bottom:1rem;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
            <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);font-weight:600;">Channel performance · ${cur}</div>
            <div style="font-size:11px;color:var(--text3);">Total ${fmt(totalRev,cur)} · ${totalTxns} txn · ${totalUnits} u${top?` · Top: <strong style="color:var(--text2);">${top.chan}</strong> (${topShare.toFixed(0)}%)`:''}</div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">${cards}</div>
        </div>`;
      }).join('');
      insights.innerHTML = blocks;
    }
  }

  // Combined consignment table
  const conRows = [];
  Object.values(BOOKS).forEach(book => {
    const s = states[book.id] || defaultState(book);
    s.stores.forEach(st => {
      conRows.push(`<tr><td style="font-weight:600;">${book.title}</td><td>${st.name}</td><td class="r">${st.sent}</td><td class="r">${st.sold}</td><td class="r">${st.outstanding}</td><td>${st.outstanding>0?'<span class="pill amber">Active</span>':'<span class="pill gray">Settled</span>'}</td></tr>`);
    });
  });
  $('all-con-body').innerHTML = conRows.length ? conRows.join('') : '<tr><td colspan="6"><div class="empty-state" style="padding:1rem;">No consignment accounts.</div></td></tr>';

  renderGlobalPendingAlert();
}

// ── BOOK CONTEXT BANNERS
function renderGlobalPendingAlert() {
  if (isAuthor()) return;
  const alertDiv = $('all-pending-approvals-alert');
  if (!alertDiv) return;

  const pendingBooks = [];
  Object.keys(window.authorSubmissions || {}).forEach(bookId => {
    const subs = window.authorSubmissions[bookId];
    const sCount = Object.keys(subs.sales || {}).length;
    const eCount = Object.keys(subs.expenses || {}).length;
    if (sCount > 0 || eCount > 0) {
      pendingBooks.push({ bookId, sCount, eCount, title: BOOKS[bookId]?.title || bookId });
    }
  });

  if (pendingBooks.length) {
    alertDiv.style.display = 'block';
    alertDiv.innerHTML = `
      <div style="background:var(--cream3); border:1px solid var(--amber); border-left:4px solid var(--amber); border-radius:var(--r2); padding:1rem;">
        <div style="font-weight:600; color:var(--text2); margin-bottom:8px; display:flex; align-items:center; gap:8px;">
          <span class="pill amber">Action Required</span> Pending Author Submissions
        </div>
        <div style="font-size:13px; color:var(--text3); margin-bottom:12px;">The following books have new sales or expenses awaiting your approval:</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${pendingBooks.map(b => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:8px 12px; border-radius:var(--r1); border:1px solid var(--border);">
              <div>
                <strong style="color:var(--text2);">${b.title}</strong>
                <span style="font-size:12px; color:var(--text3); margin-left:8px;">
                  ${b.sCount ? `${b.sCount} sale(s)` : ''} ${b.sCount && b.eCount ? '·' : ''} ${b.eCount ? `${b.eCount} expense(s)` : ''}
                </span>
              </div>
              <button class="btn sm gold" onclick="switchBook('${b.bookId}'); setTimeout(()=>switchTab('history'), 50);">Review →</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else {
    alertDiv.style.display = 'none';
  }
}

// ── BOOK CONTEXT BANNERS
function updateContextBanners() {
  if (!activeBook || activeBook === 'all') return;
  const book = getBook();
  ['dash','web','man','con','hist','exp'].forEach(sfx => {
    const t = $('bc-title-'+sfx);
    if(t) t.textContent = book.title;
  });
  const dashMeta = $('bc-meta-dash');
  if (dashMeta) dashMeta.textContent = book.author || '—';
}

// ── GLOBAL PUBLISHER ACTION BANNER (sticky, app-wide)
let _pabDismissedSignature = '';
function updatePublisherActionBanner() {
  const banner = document.getElementById('publisher-action-banner');
  if (!banner) return;
  if (isAuthor() || !isPublisherSession()) { banner.style.display = 'none'; return; }

  const subs = window.authorSubmissions || {};
  let salesCount = 0, expCount = 0;
  const booksWithPending = [];
  Object.keys(subs).forEach(bookId => {
    const sc = Object.keys(subs[bookId]?.sales || {}).length;
    const ec = Object.keys(subs[bookId]?.expenses || {}).length;
    if (sc + ec > 0) {
      booksWithPending.push({ bookId, sc, ec });
      salesCount += sc;
      expCount += ec;
    }
  });

  // Detect "artist-payment" sales (need transfer approval) for stronger wording
  let artistPaymentCount = 0;
  booksWithPending.forEach(({ bookId }) => {
    const pbSales = subs[bookId]?.sales || {};
    Object.keys(pbSales).forEach(k => {
      try {
        const raw = (typeof pbSales[k].data === 'string') ? JSON.parse(pbSales[k].data) : pbSales[k].data;
        const isDirect = raw && (raw.paymentType === 'Payment directly to artist'
          || (raw.notes || '').includes('Payment directly to artist'));
        if (isDirect) artistPaymentCount++;
      } catch(_) {}
    });
  });

  const total = salesCount + expCount;
  const signature = `${salesCount}|${expCount}|${artistPaymentCount}|${booksWithPending.map(b=>b.bookId).join(',')}`;

  if (total === 0) {
    banner.style.display = 'none';
    _pabDismissedSignature = '';
    return;
  }
  if (signature === _pabDismissedSignature) { banner.style.display = 'none'; return; }

  const titleEl = document.getElementById('pab-title');
  const subEl = document.getElementById('pab-sub');
  const actEl = document.getElementById('pab-actions');

  const parts = [];
  if (artistPaymentCount > 0) parts.push(`${artistPaymentCount} artist payment${artistPaymentCount>1?'s':''} to approve`);
  if (salesCount - artistPaymentCount > 0) parts.push(`${salesCount - artistPaymentCount} sale${(salesCount-artistPaymentCount)>1?'s':''}`);
  if (expCount > 0) parts.push(`${expCount} expense${expCount>1?'s':''}`);

  titleEl.textContent = artistPaymentCount > 0
    ? `Action required · ${artistPaymentCount} artist payment${artistPaymentCount>1?'s':''} awaiting approval`
    : `Action required · ${total} pending submission${total>1?'s':''}`;
  subEl.textContent = parts.join(' · ') + ` — across ${booksWithPending.length} book${booksWithPending.length>1?'s':''}.`;

  // Build action buttons: jump straight to the first pending book, plus per-section buttons if a single book has pending
  actEl.innerHTML = '';
  if (booksWithPending.length === 1) {
    const { bookId, sc, ec } = booksWithPending[0];
    if (sc > 0) {
      const b = document.createElement('button');
      b.className = 'pab-btn'; b.type = 'button';
      b.textContent = `Review ${sc} sale${sc>1?'s':''} →`;
      b.onclick = () => { try { switchBook(bookId); } catch(_) {} setTimeout(()=>switchTab('history'), 50); };
      actEl.appendChild(b);
    }
    if (ec > 0) {
      const b = document.createElement('button');
      b.className = 'pab-btn'; b.type = 'button';
      b.textContent = `Review ${ec} expense${ec>1?'s':''} →`;
      b.onclick = () => { try { switchBook(bookId); } catch(_) {} setTimeout(()=>switchTab('expenses'), 50); };
      actEl.appendChild(b);
    }
  } else {
    const b = document.createElement('button');
    b.className = 'pab-btn'; b.type = 'button';
    b.textContent = 'Review all →';
    b.onclick = () => { try { switchBook('all'); } catch(_) {} };
    actEl.appendChild(b);
  }

  const dismiss = document.getElementById('pab-dismiss');
  if (dismiss) {
    dismiss.onclick = () => {
      _pabDismissedSignature = signature;
      banner.style.display = 'none';
    };
  }

  banner.style.display = 'flex';
}
window.updatePublisherActionBanner = updatePublisherActionBanner;

// ── DASHBOARD (per book)
function renderBookPendingAlert() {
  if (isAuthor() || activeBook === 'all') return;
  const alertDiv = $('dash-pending-approvals-alert');
  if (!alertDiv) return;

  const subs = window.authorSubmissions[activeBook] || {};
  const sCount = Object.keys(subs.sales || {}).length;
  const eCount = Object.keys(subs.expenses || {}).length;

  if (sCount > 0 || eCount > 0) {
    alertDiv.style.display = 'block';
    let contentHtml = '';
    if (sCount > 0) {
      contentHtml += `<button class="btn gold outline sm" onclick="switchTab('history')">Review ${sCount} pending sale(s) →</button>`;
    }
    if (eCount > 0) {
      contentHtml += `<button class="btn gold outline sm" style="margin-left:8px;" onclick="switchTab('expenses')">Review ${eCount} pending expense(s) →</button>`;
    }

    alertDiv.innerHTML = `
      <div style="background:white; border:1px solid var(--border); border-left:4px solid var(--amber); border-radius:var(--r2); padding:1.25rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
        <div>
          <div style="font-weight:600; color:var(--text2); margin-bottom:4px; display:flex; align-items:center; gap:8px;">
            <span class="pill amber">Pending</span> Author Submissions
          </div>
          <div style="font-size:12px; color:var(--text3);">There are entries from the author waiting for your approval.</div>
        </div>
        <div>
          ${contentHtml}
        </div>
      </div>
    `;
  } else {
    alertDiv.style.display = 'none';
  }
}

// ── DASHBOARD (per book)
function updateDash() {
  if (!activeBook || activeBook === 'all') return;
  const s = getState(), book = getBook();
  renderBookPendingAlert();
  const cur = book.currency;
  updateContextBanners();
  $('d-book-title').textContent = book.title;
  $('d-book-author').textContent = (book.author||'—') + ' · List price '+cur+book.listPrice;
  $('d-book-isbn').textContent = book.isbn || '—';
  $('d-stock-sub').textContent = 'of '+book.maxPrint+' printed';
  $('d-thresh-sub').textContent = 'threshold: '+book.threshold+' units';
  $('d-thresh-label').textContent = 'Alert at '+book.threshold+' units';
  $('d-stock').textContent=s.stock; $('h-stock').textContent=s.stock;
  $('d-sold').textContent=s.sold;
  $('d-revenue').textContent=fmt(s.revenue,cur); $('h-revenue').textContent=fmt(s.revenue,cur);
  $('d-avg-sub').textContent='avg '+(s.sold>0?fmt(s.revenue/s.sold,cur):'—');
  const consigned=s.stores.reduce((a,st)=>a+st.outstanding,0);
  $('d-consigned').textContent=consigned; $('h-consigned').textContent=consigned;
  $('d-stores').textContent=s.stores.length;
  const owed=s.stores.reduce((a,st)=>a+st.amountOwed,0);
  $('d-owed').textContent=fmt(owed,cur); $('d-owed').className='kpi-value'+(owed>0?' warn':'');
  const pendingTransfers=[...(s.artistTransfers||[])];
  
  // Merge pending sales where they collected payment
  const pbSales2 = window.authorSubmissions[activeBook]?.sales || {};
  Object.keys(pbSales2).forEach(k => {
    const raw = (typeof pbSales2[k].data === 'string') ? JSON.parse(pbSales2[k].data) : pbSales2[k].data;
    const isDirectToArtist = raw.paymentType === 'Payment directly to artist'
      || (raw.notes || '').includes('Payment directly to artist');
    if (isDirectToArtist) {
      pendingTransfers.push({
        ...raw,
        total: (raw.qty || 0) * (raw.price || 0)
      });
    }
  });

  const pendingTotal=pendingTransfers.reduce((a,t)=>a+t.total,0);
  $('d-artist-pending').textContent=pendingTransfers.length>0?fmt(pendingTotal,cur):'—';
  $('d-artist-pending').className='kpi-value'+(pendingTransfers.length>0?' warn':'');
  $('d-artist-pending-sub').textContent=pendingTransfers.length>0?`${pendingTransfers.length} order${pendingTransfers.length>1?'s':''} (incl. pending) awaiting forwarding`:'no pending transfers';
  renderArtistTransfers();
  $('d-low').textContent=s.stock<=book.threshold?'⚠ Low':'OK';
  $('d-low').className='kpi-value'+(s.stock<=book.threshold?' danger':'');
  const pct=Math.max(0,s.stock/book.maxPrint*100);
  $('d-bar').style.width=pct+'%';
  $('d-bar').style.background=s.stock<=book.threshold?'#f87171':s.stock<=book.threshold*2?'#fb923c':book.accent;
  $('d-bar-label').textContent=s.stock+' / '+book.maxPrint+' units on hand';
  const al=$('d-alert');
  if(s.stock<=book.threshold){al.className='stock-alert danger';al.textContent='⚠ Below threshold ('+book.threshold+') — reorder now.';}
  else if(s.stock<=book.threshold*2){al.className='stock-alert warn';al.textContent='Getting low — '+s.stock+' units remaining.';}
  else{al.className='stock-alert ok';al.textContent='Stock is healthy.';}
  const ckeys=Object.keys(s.chStats||{});
  $('ch-body').innerHTML=ckeys.length?ckeys.map(k=>{const cs=s.chStats[k];return`<tr><td style="font-weight:600;">${k}</td><td class="r">${cs.txns}</td><td class="r">${cs.units}</td><td class="r">${fmt(cs.revenue,cur)}</td></tr>`;}).join(''):'<tr><td colspan="4"><div class="empty-state" style="padding:1rem;">No sales yet.</div></td></tr>';
  $('dash-con-body').innerHTML=s.stores.length?s.stores.map(st=>`<tr><td style="font-weight:600;">${st.name}</td><td class="r">${st.sent}</td><td class="r">${st.sold}</td><td class="r">${st.returned}</td><td class="r">${st.outstanding}</td><td>${st.outstanding>0?'<span class="pill amber">Active</span>':'<span class="pill gray">Settled</span>'}</td></tr>`).join(''):'<tr><td colspan="6"><div class="empty-state" style="padding:1rem;">No consignment accounts.</div></td></tr>';
  // Show danger zone only for publisher
  if (!isAuthor()) {
    $('danger-zone-sect').style.display='';
    $('danger-zone-block').style.display='flex';
  }
  // ── EXPENSES SUMMARY (publisher only)
  if(!isAuthor()){
   
    renderPendingExpenses();
    const expenses = s.expenses||[];
    const unreceivedExp = expenses.filter(e=>!e.received);
    const expKpi = $('d-expenses-kpi');
    const expSect = $('d-expenses-sect');
    if(unreceivedExp.length){
      const expTotal = unreceivedExp.reduce((a,e)=>a+(e.amount||0),0);
      // KPI tile
      if(expKpi){ expKpi.style.display=''; }
      $('d-expenses-owed').textContent = fmt(expTotal,cur);
      $('d-expenses-owed-sub').textContent = `${unreceivedExp.length} expense${unreceivedExp.length!==1?'s':''} outstanding`;
      // Detail table — dark banner style
      if(expSect){
        expSect.style.display='';
        $('d-exp-total').textContent = fmt(expTotal,cur);
        $('d-exp-count').textContent = `${expenses.length} expense${expenses.length!==1?'s':''} logged`;
        $('d-exp-body').innerHTML = unreceivedExp.map(e=>`
          <tr>
            <td style="padding:6px 0;color:rgba(255,255,255,.35);white-space:nowrap;">${fmtD(e.date)}</td>
            <td style="padding:6px 8px;color:rgba(255,255,255,.7);font-weight:500;">${e.desc}</td>
            <td style="padding:6px 8px;"><span style="font-size:10px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.4);padding:2px 8px;border-radius:100px;">${e.cat}</span></td>
            <td style="padding:6px 8px;color:rgba(255,255,255,.25);">${e.ref||'—'}</td>
            <td style="padding:6px 0;text-align:right;color:#f87171;font-weight:500;">${fmt(e.amount,cur)}</td>
          </tr>`).join('');
        // Payment button
        const artistLink = (s.artistPaymentLink||'').trim();
        const payBtn = $('d-exp-pay-btn');
        const payHint = $('d-exp-pay-hint');
        if(payBtn){
          if(artistLink){
            payBtn.href = artistLink.startsWith('http') ? artistLink : 'https://'+artistLink;
            payBtn.style.display='';
            if(payHint) payHint.textContent='Opens payment link in a new tab';
          } else {
            payBtn.style.display='none';
            if(payHint) payHint.textContent='Artist has not set a payment link yet';
          }
        }
      }
    } else {
      if(expKpi) expKpi.style.display='none';
      if(expSect) expSect.style.display='none';
    }
  }

  // ── BREAK-EVEN (publisher only)
  const cost = book.productionCost || 0;
  if(!isAuthor() && cost > 0){
    $('d-breakeven-kpi').style.display='';
    $('d-breakeven-block').style.display='';
    const pctBe = Math.min(100, s.revenue / cost * 100);
    const remaining = Math.max(0, cost - s.revenue);
    const broken = s.revenue >= cost;
    $('d-breakeven-val').textContent = broken ? '✓ Done' : fmt(remaining,cur)+' to go';
    $('d-breakeven-val').className = 'kpi-value' + (broken ? ' gold' : '');
    $('d-breakeven-sub').textContent = `of ${fmt(cost,cur)} production cost`;
    $('d-be-title').textContent = broken ? 'Project has broken even' : 'Not yet broken even';
    $('d-be-sub').textContent = `Production cost: ${fmt(cost,cur)} · Revenue to date: ${fmt(s.revenue,cur)}`;
    $('d-be-bar').style.width = pctBe+'%';
    $('d-be-bar').style.background = broken ? '#4ade80' : pctBe>=70 ? '#fb923c' : 'var(--gold2)';
    $('d-be-bar-label').textContent = `${fmt(s.revenue,cur)} recovered (${pctBe.toFixed(1)}%)`;
    $('d-be-bar-right').textContent = broken ? 'Break-even reached ✓' : `${fmt(remaining,cur)} remaining`;
    const al=$('d-be-alert');
    if(broken){al.className='stock-alert ok';al.textContent='✓ Production costs fully recovered — everything earned from here is profit.';}
    else if(pctBe>=70){al.className='stock-alert warn';al.textContent=`Almost there — ${fmt(remaining,cur)} more to recover production costs.`;}
    else{al.className='stock-alert warn';al.style.borderLeftColor='rgba(200,145,58,.5)';al.style.background='rgba(200,145,58,.08)';al.style.color='var(--gold2)';al.textContent=`${pctBe.toFixed(1)}% of production costs recovered. ${fmt(remaining,cur)} still to go.`;}
    const unitsNeeded = remaining > 0 ? Math.ceil(remaining / (book.listPrice || 1)) : 0;
    if(!broken) al.textContent += ` (~${unitsNeeded} more unit${unitsNeeded!==1?'s':''} at list price)`;
  } else {
    $('d-breakeven-kpi').style.display='none';
    $('d-breakeven-block').style.display='none';
  }

  // ── NET TO PUBLISHER KPI (only shown when profit sharing is configured)
  if (book.profitTiers && book.profitTiers.length > 0) {
    const earningsStats = calculateArtistEarnings(activeBook);
    if (earningsStats && $('d-net-publisher-kpi')) {
      $('d-net-publisher-kpi').style.display = '';
      $('d-net-publisher').textContent = fmt(earningsStats.netPublisher, cur);
    }
  } else if ($('d-net-publisher-kpi')) {
    $('d-net-publisher-kpi').style.display = 'none';
  }

  // ── PROFIT SHARING BREAKDOWN
  renderProfitSharingBreakdown(activeBook);
}

function renderProfitSharingBreakdown(bookId) {
  const block = $('d-profit-sharing-block');
  const content = $('ps-dash-content');
  if (!block || !content) return;

  const book = BOOKS[bookId];
  if (!book || !book.profitTiers || book.profitTiers.length === 0) {
    block.style.display = 'none';
    return;
  }

  block.style.display = '';
  const stats = calculateArtistEarnings(bookId);
  if (!stats) {
    content.innerHTML = '<div class="empty-state">No earnings data yet.</div>';
    return;
  }

  const cur = book.currency;
  const hasCap = (t) => Number.isFinite(t.revenueUpTo) && t.revenueUpTo > 0;
  const effectiveCap = (t) => {
    const isBreakEvenTier = (t.label || '').toLowerCase().includes('break');
    if (isBreakEvenTier && book.productionCost > 0) return book.productionCost;
    return hasCap(t) ? t.revenueUpTo : null;
  };
  const tiers = [...book.profitTiers].sort((a,b) => (hasCap(a) ? a.revenueUpTo : Infinity) - (hasCap(b) ? b.revenueUpTo : Infinity));

  // Find which tier is currently active based on cumulative revenue
  const currentTier = tiers.find(t => effectiveCap(t) !== null && stats.cumulativeRevenue < effectiveCap(t)) || tiers[tiers.length - 1];
  const nextTier    = tiers.find(t => effectiveCap(t) !== null && stats.cumulativeRevenue < effectiveCap(t));

  const tierHeader = `
    <div style="display:grid; grid-template-columns: 1fr auto 70px 70px; gap:12px; align-items:center;
      font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:var(--text3);
      padding:0 8px 6px; border-bottom:1px solid rgba(0,0,0,.06); margin-bottom:6px;">
      <span>Tier</span>
      <span style="text-align:right;">Revenue in tier</span>
      <span style="text-align:right;">Earned</span>
      <span style="text-align:right;">Share</span>
    </div>`;

  const tierHtml = tiers.map((t, i) => {
    const tCap        = effectiveCap(t);
    const isActive    = t === currentTier;
    const isCompleted = tCap !== null && stats.cumulativeRevenue >= tCap;
    const threshold   = tCap !== null ? `Up to ${fmt(tCap, cur)}` : 'No cap';
    const tierStat    = (stats.perTier || []).find(p => p.tier === t);
    const earned      = tierStat ? tierStat.artistEarned : 0;
    const tierRev     = tierStat ? tierStat.revenue : 0;
    const prevCap     = i > 0 && effectiveCap(tiers[i - 1]) !== null ? effectiveCap(tiers[i - 1]) : 0;
    const tierCap     = tCap !== null ? tCap - prevCap : null;
    const tierCapText = tierCap !== null
      ? `${fmt(tierRev, cur)} / ${fmt(tierCap, cur)}`
      : fmt(tierRev, cur);
    const icon = isCompleted ? '✓' : isActive ? '●' : '○';
    const iconColor = isCompleted ? 'var(--green)' : isActive ? 'var(--gold2)' : 'rgba(0,0,0,.25)';

    return `
      <div style="display:grid; grid-template-columns: 1fr auto 70px 70px; gap:12px; align-items:center;
        font-size:12px; padding:8px; margin-bottom:4px;
        opacity:${isCompleted ? '.6' : '1'}; font-weight:${isActive ? '600' : '400'};
        border-radius:var(--r2);
        background:${isActive ? 'rgba(212,175,55,.08)' : 'transparent'};
        border-left:3px solid ${isCompleted ? 'var(--green)' : isActive ? 'var(--gold2)' : 'transparent'};">
        <span style="display:flex; align-items:center; gap:8px;">
          <span style="color:${iconColor}; font-size:11px; width:12px; display:inline-block; text-align:center;">${icon}</span>
          <span>${t.label}<br><span style="font-size:10px;opacity:.55;font-weight:400;">${threshold}</span></span>
        </span>
        <span style="text-align:right; font-family:'DM Mono',monospace; font-size:11px; opacity:.75;" title="Revenue captured in this tier">${tierCapText}</span>
        <span style="text-align:right; font-family:'DM Mono',monospace; color:${earned > 0 ? 'var(--green)' : 'var(--text3)'};" title="Artist payout earned in this tier">${fmt(earned, cur)}</span>
        <span style="text-align:right; color:${isActive ? 'var(--gold2)' : 'var(--text3)'};">${t.artistPct}%</span>
      </div>
    `;
  }).join('');

  let progressHtml = '';
  if (nextTier && effectiveCap(nextTier) !== null) {
    const isBreakEvenTier = nextTier.label.toLowerCase().includes('break');
    const target = effectiveCap(nextTier);
    const revenueLeft = Math.max(0, target - stats.cumulativeRevenue);
    const pct = Math.min(100, (stats.cumulativeRevenue / target) * 100);
    const nextTierIdx = tiers.indexOf(nextTier);
    const enterTier = tiers[nextTierIdx + 1];
    const label = isBreakEvenTier ? 'to break-even' : enterTier ? `until ${enterTier.label}` : `completing ${nextTier.label}`;
    progressHtml = `
      <div style="margin-top:1rem; padding:12px; background:var(--ink); border-radius:var(--r2); border:1px solid rgba(255,255,255,.05);">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span style="font-size:10px; text-transform:uppercase; color:rgba(255,255,255,.58); letter-spacing:.1em;">Revenue Progress</span>
          <span style="font-size:11px; color:var(--gold2); font-family:'DM Mono',monospace;">${fmt(revenueLeft, cur)} ${label}</span>
        </div>
        <div class="bar-track" style="height:5px; margin-bottom:0;">
          <div class="bar-fill" style="width:${pct}%; background:var(--gold2); height:5px; border-radius:100px;"></div>
        </div>
        <div style="font-size:10px;color:rgba(255,255,255,.62);margin-top:6px;">${fmt(stats.cumulativeRevenue, cur)} collected · ${fmt(target, cur)} needed to reach ${enterTier ? enterTier.label : 'next tier'}</div>
      </div>
    `;
  } else {
    // Already in the final (unlimited) tier
    progressHtml = `
      <div style="margin-top:1rem; padding:10px 14px; background:rgba(74,222,128,.08); border-radius:var(--r2); border:1px solid rgba(74,222,128,.2); font-size:12px; color:var(--green);">
        ✓ Production costs recovered — now in post break-even tier
      </div>
    `;
  }

  const owed = stats.owedToArtist;
  const owedClass = owed > 0.01 ? 'owed-due' : 'owed-clear';
  const owedColor = owed > 0.01 ? 'var(--gold2)' : 'var(--green)';

  const payoutHistoryHtml = (stats.payouts || []).length > 0
    ? stats.payouts.slice().sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(p => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; font-size:12px;
          border-bottom:1px solid rgba(0,0,0,.05);">
          <span style="display:flex; flex-direction:column;">
            <span style="font-family:'DM Mono',monospace; color:var(--green); font-weight:600;">${fmt(parseFloat(p.amount) || 0, cur)}</span>
            <span style="font-size:10px; color:var(--text3);">${p.date || '—'}${p.method ? ' · ' + String(p.method).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) : ''}${p.notes ? ' · ' + String(p.notes).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) : ''}</span>
          </span>
          <button class="btn" style="padding:4px 8px; font-size:10px; background:transparent; color:var(--text3); border:1px solid rgba(0,0,0,.1);"
            onclick="deleteArtistPayout('${bookId}', ${p.id})" title="Delete this payout">✕</button>
        </div>`).join('')
    : '<div style="padding:12px; font-size:11px; color:var(--text3); text-align:center;">No payouts recorded yet.</div>';

  content.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:1.5rem;">
      <div class="card" style="margin:0; background:var(--cream2); border:none;">
        <div class="hs-label" style="color:var(--text3);">Artist earnings</div>
        <div class="hs-val" style="color:var(--green); font-size:22px;">${fmt(stats.totalArtistEarned, cur)}</div>
        <div style="font-size:10px; color:var(--text3); margin-top:2px;">lifetime total</div>
      </div>
      <div class="card" style="margin:0; background:var(--cream2); border:none;">
        <div class="hs-label" style="color:var(--text3);">Paid to artist</div>
        <div class="hs-val" style="color:var(--text); font-size:22px; opacity:.85;">${fmt(stats.totalPaidToArtist, cur)}</div>
        <div style="font-size:10px; color:var(--text3); margin-top:2px;">${stats.payouts?.length || 0} payout${(stats.payouts?.length || 0) !== 1 ? 's' : ''} recorded</div>
      </div>
      <div class="card" style="margin:0; background:${owed > 0.01 ? 'rgba(212,175,55,.12)' : 'rgba(74,222,128,.1)'}; border:1px solid ${owed > 0.01 ? 'rgba(212,175,55,.35)' : 'rgba(74,222,128,.3)'};">
        <div class="hs-label" style="color:var(--text3);">${owed > 0.01 ? '⚠ Owed to artist' : 'Owed to artist'}</div>
        <div class="hs-val" style="color:${owedColor}; font-size:22px; font-weight:700;">${fmt(Math.max(0, owed), cur)}</div>
        <div style="font-size:10px; color:${owedColor}; margin-top:2px; opacity:.8;">${owed > 0.01 ? 'action needed' : 'all paid up ✓'}</div>
      </div>
    </div>
    <div style="margin-bottom:1rem;">
       <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
         <span class="sect" style="font-size:8px; margin:0;">Payout Tiers</span>
         <span style="font-size:11px; color:var(--text3);">Publisher keeps: <strong style="color:var(--text); font-size:13px;">${fmt(stats.netPublisher, cur)}</strong></span>
       </div>
       ${tierHeader}
       ${tierHtml}
    </div>
    ${progressHtml}
    <div style="margin-top:1.5rem; padding-top:1rem; border-top:1px solid rgba(0,0,0,.08);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
        <span class="sect" style="font-size:8px; margin:0;">Artist Payouts</span>
        <button class="btn gold" style="padding:6px 12px; font-size:11px;" onclick="toggleArtistPayoutForm('${bookId}')">+ Record payout</button>
      </div>
      <div id="artist-payout-form-${bookId}" style="display:none; padding:12px; background:var(--cream2); border-radius:var(--r2); margin-bottom:12px;">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:8px;">
          <label style="font-size:11px; color:var(--text3);">Amount (${cur})
            <input type="number" id="ap-amount-${bookId}" step="0.01" min="0" placeholder="${owed > 0.01 ? owed.toFixed(2) : '0.00'}" style="width:100%; padding:6px; margin-top:2px;">
          </label>
          <label style="font-size:11px; color:var(--text3);">Date
            <input type="date" id="ap-date-${bookId}" value="${today()}" style="width:100%; padding:6px; margin-top:2px;">
          </label>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:8px;">
          <label style="font-size:11px; color:var(--text3);">Method (optional)
            <input type="text" id="ap-method-${bookId}" placeholder="e-Transfer, PayPal..." style="width:100%; padding:6px; margin-top:2px;">
          </label>
          <label style="font-size:11px; color:var(--text3);">Notes (optional)
            <input type="text" id="ap-notes-${bookId}" placeholder="..." style="width:100%; padding:6px; margin-top:2px;">
          </label>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn gold" style="padding:6px 14px; font-size:11px;" onclick="recordArtistPayout('${bookId}')">Save payout</button>
          ${owed > 0.01 ? `<button class="btn" style="padding:6px 12px; font-size:11px;" onclick="document.getElementById('ap-amount-${bookId}').value='${owed.toFixed(2)}'">Pay full balance (${fmt(owed, cur)})</button>` : ''}
          <button class="btn" style="padding:6px 12px; font-size:11px; background:transparent;" onclick="toggleArtistPayoutForm('${bookId}')">Cancel</button>
        </div>
      </div>
      <div style="background:var(--cream2); border-radius:var(--r2); overflow:hidden;">
        ${payoutHistoryHtml}
      </div>
    </div>
  `;
}

function toggleArtistPayoutForm(bookId) {
  const form = document.getElementById(`artist-payout-form-${bookId}`);
  if (form) form.style.display = form.style.display === 'none' ? '' : 'none';
}

async function recordArtistPayout(bookId) {
  const amountEl = document.getElementById(`ap-amount-${bookId}`);
  const dateEl   = document.getElementById(`ap-date-${bookId}`);
  const methodEl = document.getElementById(`ap-method-${bookId}`);
  const notesEl  = document.getElementById(`ap-notes-${bookId}`);
  const amount = parseFloat(amountEl.value);
  if (!amount || amount <= 0) { showToast('⚠ Enter a valid amount', 'warn'); return; }
  const s = states[bookId];
  if (!s) return;
  if (!s.artistPayouts) s.artistPayouts = [];
  s.artistPayouts.push({
    id: Date.now(),
    date: dateEl.value || today(),
    amount,
    method: (methodEl.value || '').trim(),
    notes: (notesEl.value || '').trim()
  });
  await saveState(bookId);
  showToast(`✓ Recorded payout of ${fmt(amount, BOOKS[bookId].currency)}`);
  renderProfitSharingBreakdown(bookId);
}

function deleteArtistPayout(bookId, payoutId) {
  if (!confirm('Delete this payout record?')) return;
  const s = states[bookId];
  if (!s || !s.artistPayouts) return;
  s.artistPayouts = s.artistPayouts.filter(p => p.id !== payoutId);
  saveState(bookId);
  showToast('✓ Payout deleted');
  renderProfitSharingBreakdown(bookId);
}

window.toggleArtistPayoutForm = toggleArtistPayoutForm;
window.recordArtistPayout = recordArtistPayout;
window.deleteArtistPayout = deleteArtistPayout;

function renderAll() {
  if (activeBook === 'all') { updateAllOverview(); updateHeader(); return; }
  updateDash(); renderStores(); renderLedger(); renderInvoices(); renderHist(); renderExpenses(); renderArtistReimburseBanner(); renderPendingExpenses();
}

function renderCurrent() {
  if (activeBook === 'all') { updateAllOverview(); updateHeader(); }
  else renderAll();
  try { updatePublisherActionBanner(); } catch(_) {}

  // Firestore DB status indicator update
  const fsBtn = document.getElementById('fs-toggle-btn');
  if (fsBtn && activeBook && activeBook !== 'all') {
    const isFS = window._useFirestoreForBook(activeBook);
    if (isFS) {
      fsBtn.innerHTML = '✓ Using Firestore<br><span style="font-size:10px;font-weight:normal">Click to fallback to old Database</span>';
      fsBtn.className = 'btn';
      fsBtn.style.background = '#e8f5e9';
      fsBtn.style.color = '#2e7d32';
      fsBtn.style.borderColor = '#c8e6c9';
    } else {
      fsBtn.innerHTML = 'Enable Firestore Mode';
      fsBtn.className = 'btn gold';
      fsBtn.style = '';
    }
  }
}

// ── ORDER RECORDING
function recordOrder(num, chan, qty, price, notes, payment = null) {
  const s = getState(), book = getBook();
  const enteredBy = isAuthor() ? 'Artist' : 'Publisher';
  s.stock = Math.max(0, s.stock - qty);
  s.sold += qty; s.revenue += qty * price;
  if (!s.chStats[chan]) s.chStats[chan]={txns:0,units:0,revenue:0};
  s.chStats[chan].txns++; s.chStats[chan].units+=qty; s.chStats[chan].revenue+=qty*price;
  const sheetsId = makeEventId();
  s.hist.unshift({num,chan,qty,price,after:s.stock,notes:notes||'',date:today(),payment,enteredBy,sheetsId});
  renderHist(); updateDash(); saveState(activeBook);
  const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  const totalNative = qty * price;
  let cadEquiv = '';
  if (nativeCur === 'CAD') cadEquiv = totalNative;
  else if (payment && payment.currency === 'CAD' && payment.amount) cadEquiv = payment.amount;
  syncToSheets({
    type:'order',book:book.title,date:today(),num,chan,qty,price,total:totalNative,stockAfter:s.stock,notes:notes||'',
    sheetsId,
    currency: nativeCur,
    paymentCurrency: normalizeCurrencyCode(payment?.currency || nativeCur, 'CAD'),
    paymentAmount: payment?.amount ?? totalNative,
    paymentRate: payment?.rate ?? '',
    convertedTotal: cadEquiv
  });
}

function renderHist() {
  const s = getState(), book = getBook(), cur = book.currency;

  const pbSales = window.authorSubmissions[activeBook]?.sales || {};
  const pendingSales = Object.keys(pbSales).map(k => {
    const raw = JSON.parse(pbSales[k].data);
    return { ...raw, _subKey: k, pendingAuth: true, after: '?' };
  });
  
  const combined = [...pendingSales, ...s.hist];

  $('hist-body').innerHTML = combined.length
    ? combined.map((h,i)=>{
        if (h.pendingAuth) {
           const actionCell = window.IS_PUBLISHER
             ? `<button class="edit-btn" onclick="approveSubmission('sales', '${h._subKey}')" style="color:var(--green);font-weight:bold;margin-right:8px;">✓ Approve</button><button class="edit-btn" onclick="rejectSubmission('sales', '${h._subKey}')" style="color:var(--red);">✕</button>`
             : `<span style="font-size:10px;color:var(--amber);">Awaiting Publisher</span>`;
           return `<tr style="opacity:0.8;background:#fffcede3;"><td class="mono">${h.num}</td><td>${h.chan} <span class="pill amber" style="font-size:10px;">Submitted</span></td><td class="r">-${h.qty}</td><td class="r">${fmt(h.price,cur)}</td><td class="r" style="font-weight:600;">${fmt(h.qty*h.price,cur)}</td><td class="r">?</td><td style="font-size:12px;color:var(--text3);">${h.notes||'—'}</td><td style="font-size:12px;color:var(--text3);"><span class="pill amber" style="font-size:10px;">Artist</span></td><td style="font-size:12px;color:var(--text3);">${fmtD(h.date)}</td><td>${actionCell}</td></tr>`;
        }
        const voided = h.voided ? ' voided' : '';
        const voidPill = h.voided ? '<span class="void-badge">Void</span>' : '';
        const editBtn = `<button class="edit-btn" onclick="openEditHist(${i})" title="Edit entry">✎</button>`;
        const isGrat = h.gratuity || h.chan === 'Gratuity';
        const isPending = h.artistPending;
        const chanCell = isGrat ? `<span class="pill gray" style="font-size:10px;">🎁 Gratuity</span>` : isPending ? `${h.chan} <span class="pill amber" style="font-size:10px;">⏳ pending</span>` : h.chan;
        const priceCell = isGrat ? '<span style="color:var(--text4);font-size:11px;">gifted</span>' : fmt(h.price,cur);
        const totalCell = isGrat ? '—' : isPending ? `<span style="color:var(--amber);">${fmt(h.qty*h.price,cur)}</span>` : fmt(h.qty*h.price,cur);
        const rowStyle = isGrat ? ' style="background:var(--cream2);font-style:italic;"' : isPending ? ' style="background:#fef9ec;"' : '';
        const isWebsite = (h.chan === 'Website') && !isGrat && !h.voided;
        const labelBtn = isWebsite
          ? (h.shipped
              ? `<button class="edit-btn" onclick="openLabelModal(${i})" title="Shipped${h.shippedDate ? ' on ' + fmtD(h.shippedDate) : ''} — click to update or reprint" style="opacity:1;color:#2e7d32;border-color:#c8e6c9;background:#e8f5e9;font-weight:600;">✓ Shipped</button>`
              : `<button class="edit-btn" onclick="openLabelModal(${i})" title="Print shipping label" style="opacity:1;color:var(--gold);border-color:var(--gold-line);background:var(--gold-bg);">📦 Ship</button>`)
          : '';
        const shippedPill = isWebsite && h.shipped
          ? ` <span class="pill" style="font-size:10px;background:#e8f5e9;color:#2e7d32;border:1px solid #c8e6c9;">✓ Shipped${h.shippedDate ? ' ' + fmtD(h.shippedDate) : ''}</span>`
          : '';
        const paymentInfo = paymentSummary(h.payment, book);
        const notesCell = paymentInfo
          ? `${h.notes || '—'}<br><span style="font-size:11px;color:var(--text4);">${paymentInfo}</span>`
          : (h.notes || '—');
        const enteredBy = h.enteredBy || (h.artistPending ? 'Artist' : 'Publisher');
        const enteredByPill = enteredBy === 'Artist'
          ? '<span class="pill amber" style="font-size:10px;">Artist</span>'
          : '<span class="pill gray" style="font-size:10px;">Publisher</span>';
        return `<tr class="${voided}"${rowStyle}><td class="mono">${h.num}${editBtn}</td><td>${chanCell}${shippedPill}</td><td class="r">${h.voided?'':'-'}${h.qty}</td><td class="r">${priceCell}</td><td class="r" style="font-weight:600;">${totalCell}</td><td class="r">${h.after}</td><td style="font-size:12px;color:var(--text3);">${notesCell||'—'}</td><td style="font-size:12px;color:var(--text3);">${enteredByPill}</td><td style="font-size:12px;color:var(--text3);">${fmtD(h.date)} ${voidPill}</td><td>${labelBtn}</td></tr>`;
      }).join('')
    : '<tr><td colspan="10"><div class="empty-state" style="padding:1.5rem;">No orders yet.</div></td></tr>';
}

// ── WEBSITE ORDERS — persistent scan memory
const SCAN_MEMORY_KEY = 'lm-scan-memory';
function getScanMemory() {
  try { return JSON.parse(localStorage.getItem(SCAN_MEMORY_KEY) || '{}'); } catch(e) { return {}; }
}
function saveScanMemory(mem) {
  localStorage.setItem(SCAN_MEMORY_KEY, JSON.stringify(mem));
}

// Build a cross-book set of all order IDs already applied across any session
function getAllAppliedIds() {
  const ids = new Set();
  Object.values(states).forEach(s => (s.doneIds || []).forEach(id => ids.add(id)));
  // Also include any order nums already in any book's history
  Object.values(states).forEach(s => (s.hist || []).forEach(h => { if (h.num) ids.add(h.num); }));
  return ids;
}

function renderOrders() {
  const s = getState(), book = getBook(), cur = book.currency;
  const list = $('orders-list');
  // Filter to current book; show all if bookId not set
  const rel = orders.filter(o => o.hasBook && (!o.bookId || o.bookId === activeBook));
  const appliedIds = getAllAppliedIds();

  // Smart filter: hide orders whose order number already exists in history
  const visible = rel.filter(o => !appliedIds.has(o.orderNum));
  const hiddenCount = rel.length - visible.length;

  if (!visible.length) {
    const msg = hiddenCount > 0
      ? `<div class="empty-state"><div class="e-icon">✅</div>All ${hiddenCount} found order(s) already applied.<br><span style="font-size:11px;color:var(--text3);">Scan again to check for newer orders.</span></div>`
      : `<div class="empty-state"><div class="e-icon">📬</div>No orders found for this book.<br><span style="font-size:11px;color:var(--text3);">Make sure your Google Sheets is connected.</span></div>`;
    list.innerHTML = msg;
    $('apply-all-btn').disabled = true;
    return;
  }

  list.innerHTML = visible.map(o => {
    const done = appliedIds.has(o.id) || appliedIds.has(o.orderNum);
    const addrParts = [o.shipAddr1, o.shipCity, o.shipProvince, o.shipCountry].filter(Boolean);
    const addrLine = addrParts.length
      ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;">📦 ${addrParts.join(', ')}</div>`
      : '';
    const listPrice = BOOKS[o.bookId]?.listPrice || book.listPrice;
    const listCur   = BOOKS[o.bookId]?.currency   || cur;
    const priceMismatch = !done && o.price && Math.abs(o.price - listPrice) > 0.5;
    const priceWarn = priceMismatch
      ? `<span style="font-size:10px;color:var(--amber);margin-left:6px;">⚠ paid ${listCur}${o.price} (list ${listCur}${listPrice})</span>`
      : '';
    const bookLabel = o.bookId && BOOKS[o.bookId]
      ? `<span style="font-size:10px;background:${BOOKS[o.bookId].accent}22;color:${BOOKS[o.bookId].accent};border-radius:100px;padding:2px 8px;margin-right:6px;">${BOOKS[o.bookId].title}</span>`
      : '';
    const viewEmailBtn = o.id
      ? `<a href="https://mail.google.com/mail/u/0/#all/${o.id}" target="_blank" class="btn sm" style="font-size:10px;opacity:.7;">📧 View</a>`
      : '';
    return `<div class="order-card${done ? ' done' : ''}">
      <div class="order-row">
        <div>
          <div class="order-num">${o.orderNum}</div>
          <div class="order-meta">${o.date} · ${o.customer || '—'} · <span style="opacity:.6;">${o.email || ''}</span></div>
          ${addrLine}
        </div>
        <span class="pill ${done ? 'gray' : 'gold'}">${done ? 'Applied' : 'New'}</span>
      </div>
      <div class="order-row" style="margin-top:8px;gap:6px;">
        <span style="font-size:12px;color:var(--text3);">${bookLabel}qty ${o.qty} · ${fmt(o.price || listPrice, listCur)}${priceWarn}</span>
        <div style="display:flex;gap:6px;align-items:center;">
          ${viewEmailBtn}
          ${!done ? `<button class="btn sm gold" onclick="applyOne('${o.id}')">Apply</button>` : '<span style="font-size:11px;color:var(--text3);">Done</span>'}
        </div>
      </div>
    </div>`;
  }).join('');

  if (hiddenCount > 0) {
    list.innerHTML += `<div style="text-align:center;font-size:11px;color:var(--text3);padding:10px 0;">${hiddenCount} already-applied order(s) hidden.</div>`;
  }

  $('apply-all-btn').disabled = !visible.some(o => !appliedIds.has(o.id) && !appliedIds.has(o.orderNum));
}

function applyOne(id) {
  const s = getState(), book = getBook();
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const alreadyDone = getAllAppliedIds().has(id) || getAllAppliedIds().has(o.orderNum);
  if (alreadyDone) { showToast('Order already applied', 'warn'); return; }
  // Use the matched book if it differs from active
  const targetBook = o.bookId && BOOKS[o.bookId] ? o.bookId : activeBook;
  const targetState = states[targetBook];
  const targetBk    = BOOKS[targetBook];
  if (!targetState || !targetBk) { showToast('Cannot find book for this order', 'err'); return; }
  // Use target book's price if not on order
  const price = o.price || targetBk.listPrice;
  targetState.stock = Math.max(0, targetState.stock - o.qty);
  targetState.sold  += o.qty;
  targetState.revenue += o.qty * price;
  if (!targetState.chStats['Website']) targetState.chStats['Website'] = { txns: 0, units: 0, revenue: 0 };
  targetState.chStats['Website'].txns++;
  targetState.chStats['Website'].units += o.qty;
  targetState.chStats['Website'].revenue += o.qty * price;
  const entry = { num: o.orderNum, chan: 'Website', qty: o.qty, price, after: targetState.stock,
    notes: 'Big Cartel', date: (o.date && o.date !== '—') ? o.date : today(),
    shipName: o.shipName || o.customer || '', shipEmail: o.email || '',
    shipAddr1: o.shipAddr1 || '', shipAddr2: o.shipAddr2 || '',
    shipCity: o.shipCity || '', shipProvince: o.shipProvince || '',
    shipPostal: o.shipPostal || '', shipCountry: o.shipCountry || 'Canada'
  };
  // Deterministic id derived from the Big Cartel order number so the same
  // import on a different device produces the same id (no duplicate rows).
  entry.sheetsId = 'bc-' + String(o.orderNum).replace(/^#/, '').replace(/[^A-Za-z0-9-]/g, '');
  targetState.hist.unshift(entry);
  if (!targetState.doneIds) targetState.doneIds = [];
  targetState.doneIds.push(id);
  // Save scan memory — record this order num as seen
  const mem = getScanMemory();
  if (!mem.appliedNums) mem.appliedNums = [];
  if (!mem.appliedNums.includes(o.orderNum)) mem.appliedNums.push(o.orderNum);
  mem.lastScan = new Date().toISOString();
  saveScanMemory(mem);
  syncToSheets({ type: 'order', book: targetBk.title, date: entry.date, num: o.orderNum, chan: 'Website', qty: o.qty, price, total: o.qty * price, stockAfter: targetState.stock, notes: 'Big Cartel', sheetsId: entry.sheetsId, currency: getBookCurrencyCode(targetBk) });
  addLog('log-web', `✓ ${o.orderNum} (${targetBk.title}): -${o.qty} → ${targetState.stock} remaining`, 'ok');
  if (targetState.stock <= targetBk.threshold) addLog('log-web', `⚠ ${targetBk.title} below threshold!`, 'warn');
  saveState(targetBook);
  renderOrders();
  if (targetBook === activeBook) updateDash();
}

function applyAll() {
  const applied = getAllAppliedIds();
  orders.filter(o => o.hasBook && !applied.has(o.id) && !applied.has(o.orderNum)).forEach(o => applyOne(o.id));
}

async function fetchOrders() {
  const book = getBook();
  const btn  = $('scan-btn');
  const log  = 'log-web';
  const MAX_RETRIES = 3;

  if (!sheetsUrl) {
    showToast('Connect Google Sheets first to scan Gmail', 'warn');
    return;
  }

  const setStatus = (msg) => { btn.innerHTML = `<span class="spinner"></span>${msg}`; btn.disabled = true; };

  // Read scan memory for smarter queries
  const mem = getScanMemory();
  const lastScanDate = mem.lastScan ? new Date(mem.lastScan) : null;
  const appliedNums  = new Set(mem.appliedNums || []);
  const daysBack     = parseInt(localStorage.getItem('lm-scan-days') || '30');
  const sinceDate    = new Date(Date.now() - daysBack * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const normalizeText = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const normalizeOrderNum = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const hit = raw.match(/#?[a-z0-9]+-[a-z0-9-]+/i);
    if (hit) {
      const v = hit[0].toUpperCase();
      return v.startsWith('#') ? v : `#${v}`;
    }
    return raw;
  };

  const inferBookIdFromText = (value) => {
    const txt = normalizeText(value);
    if (!txt) return null;
    for (const b of Object.values(BOOKS)) {
      const tokens = [b.id, b.title, b.urlParam, b.author, ...(b.title || '').split(/\s+/)]
        .filter(Boolean)
        .map(v => normalizeText(v))
        .filter(v => v.length >= 4);
      if (tokens.some(t => t && txt.includes(t))) return b.id;
    }
    return null;
  };

  setStatus('Connecting to Google Apps Script…');
  let attempt = 0;
  let parsed = null;
  let lastError;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const destUrl = sheetsUrl + (sheetsUrl.includes('?') ? '&' : '?') + 'action=scanGmail&daysBack=' + daysBack;
      const res = await fetch(destUrl, {
        method: 'GET',
        mode: 'cors'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || !data.ok) throw new Error(data.error || 'Server returned failure');
      parsed = data;
      break;
    } catch (e) {
      lastError = e;
      console.warn(`Scan attempt ${attempt} failed:`, e);
      if (attempt < MAX_RETRIES) {
        setStatus(`Retrying… (${attempt}/${MAX_RETRIES})`);
        await new Promise(res => setTimeout(res, 1200 * attempt));
      }
    }
  }

  if (!parsed) {
    addLog(log, `❌ Apps Script Scan failed: ${lastError?.message || 'Unknown error'}. Check URL or re-authorize Apps Script.`, 'err');
    orders = [];
    btn.textContent = 'Scan Gmail'; btn.disabled = false;
    return;
  }

  setStatus('Parsing results…');

  // Normalise and enrich
  orders = (parsed.orders || []).map(o => {
    const orderNum = normalizeOrderNum(o.orderNum || o.number || o.order || o.orderNumber);
    const stableId = String(o.id || orderNum).trim();
    // Use the fetched email body to identify the correct book
    const textBlob = [o.body, o.notes, o.itemTitle, o.title].filter(Boolean).join(' ');
    
    let resolvedBookId = inferBookIdFromText(textBlob) || inferBookIdFromText(o.orderNum);
    if (!resolvedBookId) {
      resolvedBookId = BOOKS[activeBook] ? activeBook : Object.keys(BOOKS)[0];
    }
    
    const qty = Math.max(1, parseInt(o.qty ?? o.quantity ?? 1, 10) || 1);
    const price = parseFloat(o.price ?? o.unitPrice ?? o.amount ?? 0) || BOOKS[resolvedBookId]?.listPrice || book.listPrice;
    
    const rawDate = o.date || o.timestamp || o.time || o.orderDate || '';
    let normalizedDate = '';
    if (rawDate) {
      const parsedDt = new Date(rawDate);
      if (!isNaN(parsedDt.getTime())) {
        normalizedDate = parsedDt.toISOString().split('T')[0];
      }
    }

    return {
      ...o,
      id: stableId || `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      hasBook: !!resolvedBookId,
      bookId: resolvedBookId,
      orderNum,
      qty,
      price,
      date: normalizedDate || today()
    };
  }).filter(o => o.orderNum);

  // Cross-session deduplication
  const allDone = getAllAppliedIds();
  [...appliedNums].forEach(n => allDone.add(n));
  const fresh = orders.filter(o => !allDone.has(o.id) && !allDone.has(o.orderNum));
  const already = orders.length - fresh.length;

  mem.lastScan = new Date().toISOString();
  saveScanMemory(mem);

  if (orders.length === 0) {
    addLog(log, `📭 No orders found in Gmail since ${sinceDate}.`, 'warn');
  } else {
    const byBook = orders.reduce((acc, o) => { acc[o.bookId] = (acc[o.bookId] || 0) + 1; return acc; }, {});
    const summary = Object.entries(byBook).map(([id, n]) => `${BOOKS[id]?.title || id} ×${n}`).join(', ');
    addLog(log, `✓ Found ${orders.length} order(s): ${summary}`, 'ok');
    if (already > 0) addLog(log, `↩ ${already} already recorded (skipped)`, 'warn');
    if (fresh.length > 0) addLog(log, `→ ${fresh.length} new order(s) ready`, 'ok');
  }
  if (lastScanDate) addLog(log, `🕐 Previous scan: ${lastScanDate.toLocaleString()}`, 'ok');

  renderOrders();
  btn.textContent = 'Scan Gmail'; btn.disabled = false;
}

// Re-scan Gmail and fill in missing shipping fields on already-applied
// orders (across all books). Useful when an earlier email parse failed
// or when the address arrived in a follow-up email.
async function backfillShipping() {
  const log = 'log-web';
  const btn = $('backfill-shipping-btn');
  if (!sheetsUrl) {
    showToast('Connect Google Sheets first to scan Gmail', 'warn');
    return;
  }
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Scanning…'; }
  addLog(log, '🔁 Re-scanning Gmail for missing shipping info…', 'ok');

  const daysBack = parseInt(localStorage.getItem('lm-scan-days') || '30');
  let parsed = null;
  try {
    const destUrl = sheetsUrl + (sheetsUrl.includes('?') ? '&' : '?') + 'action=scanGmail&daysBack=' + daysBack;
    const res = await fetch(destUrl, { method: 'GET', mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    parsed = await res.json();
    if (!parsed || !parsed.ok) throw new Error(parsed?.error || 'Server returned failure');
  } catch (e) {
    addLog(log, `❌ Backfill scan failed: ${e.message}`, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Backfill shipping info'; }
    return;
  }

  const norm = (v) => {
    const raw = String(v || '').trim();
    if (!raw) return '';
    const hit = raw.match(/#?[a-z0-9]+-[a-z0-9-]+/i);
    if (hit) {
      const upper = hit[0].toUpperCase();
      return upper.startsWith('#') ? upper : `#${upper}`;
    }
    return raw.toUpperCase();
  };

  const lookup = new Map();
  for (const o of (parsed.orders || [])) {
    const key = norm(o.orderNum);
    if (key && !lookup.has(key)) lookup.set(key, o);
  }

  const fields = ['shipName', 'shipEmail', 'shipAddr1', 'shipAddr2',
                  'shipCity', 'shipProvince', 'shipPostal', 'shipCountry'];
  let updated = 0;
  let stillMissing = 0;
  const touchedBooks = new Set();

  for (const bookId of Object.keys(states)) {
    const st = states[bookId];
    if (!st || !Array.isArray(st.hist)) continue;
    for (const h of st.hist) {
      if (h.chan !== 'Website' || h.voided) continue;
      const incomplete = !h.shipName || !h.shipAddr1 || !h.shipCity || !h.shipPostal;
      if (!incomplete) continue;
      const match = lookup.get(norm(h.num));
      if (!match) { stillMissing++; continue; }
      let changed = false;
      for (const f of fields) {
        const incoming = (match[f] || (f === 'shipName' ? match.customer : '') || (f === 'shipEmail' ? match.email : '') || '').trim();
        if (incoming && !h[f]) { h[f] = incoming; changed = true; }
      }
      if (changed) {
        updated++;
        touchedBooks.add(bookId);
      } else {
        stillMissing++;
      }
    }
  }

  for (const bookId of touchedBooks) saveState(bookId);
  renderHist();

  if (updated > 0) {
    addLog(log, `✓ Backfilled shipping info on ${updated} order(s).`, 'ok');
    showToast(`✓ Updated ${updated} order${updated === 1 ? '' : 's'}`);
  } else {
    addLog(log, `📭 No orders updated. ${stillMissing} order(s) still missing info — Gmail email may be older than the ${daysBack}-day scan window or has no parseable address.`, 'warn');
    showToast('No orders updated', 'warn');
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Backfill shipping info'; }
}

// ── MANUAL
// Session-level cache so we don't re-fetch the same currency pair twice (Uses global _fxRateCache)

async function fetchLiveRate(from, to) {
  if (from === to) return { rate: 1 };
  if (from === 'OTHER' || to === 'OTHER' || !from || !to) return { error: 'manual' };
  
  const key = `${from}_${to}`;
  if (_fxRateCache[key]) return { rate: _fxRateCache[key] };
  
  // Primary API: open.er-api.com (v6) — very reliable
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
    if (res.ok) {
      const json = await res.json();
      const rate = json?.rates?.[to];
      if (rate) {
        _fxRateCache[key] = rate;
        return { rate };
      }
    }
  } catch(e) {
    console.warn('Primary FX API failed, trying fallback...', e);
  }

  // Fallback API: Frankfurter
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
    if (res.ok) {
      const json = await res.json();
      const rate = json?.rates?.[to];
      if (rate) {
        _fxRateCache[key] = rate;
        return { rate };
      }
    }
    return { error: `API ${res.status}`, context: `${from}->${to}` };
  } catch(e) {
    return { error: 'network', details: e.message || String(e), context: `${from}->${to}` };
  }
}

// Exchange rate as of a specific date (YYYY-MM-DD), for accurate bookkeeping on
// historical expenses. Frankfurter returns the nearest prior business day for
// weekends/holidays. Cached per pair+date.
async function fetchHistoricalRate(from, to, date) {
  if (from === to) return { rate: 1 };
  if (!from || !to || from === 'OTHER' || to === 'OTHER') return { error: 'manual' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return { error: 'bad-date' };
  const key = `${from}_${to}@${date}`;
  if (_fxRateCache[key]) return { rate: _fxRateCache[key] };
  try {
    const res = await fetch(`https://api.frankfurter.app/${date}?from=${from}&to=${to}`);
    if (res.ok) {
      const json = await res.json();
      const rate = json?.rates?.[to];
      if (rate) { _fxRateCache[key] = rate; return { rate }; }
    }
  } catch (e) { /* fall through to caller's live-rate fallback */ }
  return { error: 'historical-unavailable', context: `${from}->${to}@${date}` };
}

let _manualFxRate = null;
let _expenseFxRate = null;

async function onManualCurrencyChange() {
  const resultSpan = $('m-fx-inline-result');
  const manualRateRow = $('m-manual-rate-row');
  const cur = $('m-price-cur').value;
  const book = getBook();
  const native = getBookCurrencyCode(book);

  if (cur === 'BOOK' || cur === native) {
    if (resultSpan) resultSpan.style.display = 'none';
    if (manualRateRow) manualRateRow.style.display = 'none';
    _manualFxRate = null;
    phint();
    return;
  }

  // Publisher only live conversion
  if (resultSpan) {
    resultSpan.style.display = 'inline';
    resultSpan.textContent = '(fetching rate...)';
    resultSpan.style.color = 'var(--text3)';
  }
  if (manualRateRow) manualRateRow.style.display = 'none';
  
  const key = `${cur}_${native}`;
  let rate = _fxRateCache[key];
  
  if (!rate) {
    try {
      const res = await fetchLiveRate(cur, native);
      if (res.rate) {
        rate = res.rate;
      }
    } catch(e) {}
  }
  
  if (rate) {
    _manualFxRate = rate;
    calcFx();
    if (manualRateRow) manualRateRow.style.display = 'none';
  } else {
    if (resultSpan) {
      resultSpan.textContent = '(rate unavailable — enter below)';
      resultSpan.style.color = 'var(--red)';
    }
    _manualFxRate = null;
    // Show manual rate input
    if (manualRateRow) {
      manualRateRow.style.display = 'block';
      const lbl = $('m-manual-rate-label');
      const bookCurSpan = $('m-manual-rate-book-cur');
      if (lbl) lbl.textContent = `1 ${cur} =`;
      if (bookCurSpan) bookCurSpan.textContent = native;
      if ($('m-manual-rate')) { $('m-manual-rate').value = ''; $('m-manual-rate').focus(); }
    }
  }
  phint();
}

function calcFx() {
  const resultSpan = $('m-fx-inline-result');
  if (!resultSpan || !_manualFxRate) return;
  
  const amt = parseFloat($('m-price').value) || 0;
  const book = getBook();
  const converted = amt * _manualFxRate;
  
  resultSpan.textContent = `≈ ${fmt(converted, book.currency)}`;
  resultSpan.style.color = 'var(--gold)';
}

function calcManualFxRate() {
  const rateVal = parseFloat($('m-manual-rate').value);
  const resultSpan = $('m-fx-inline-result');
  if (!rateVal || rateVal <= 0) {
    _manualFxRate = null;
    if (resultSpan) { resultSpan.style.display = 'none'; }
    return;
  }
  _manualFxRate = rateVal;
  if (resultSpan) resultSpan.style.display = 'inline';
  calcFx();
  phint();
}

async function onExpenseCurrencyChange() {
  const resultSpan = $('exp-fx-inline-result');
  const cur = $('exp-cur').value;
  const book = getBook();
  const native = getBookCurrencyCode(book);

  if (cur === native) {
    if (resultSpan) resultSpan.style.display = 'none';
    _expenseFxRate = null;
    return;
  }

  if (resultSpan) {
    resultSpan.style.display = 'inline';
    resultSpan.textContent = '(fetching rate...)';
    resultSpan.style.color = 'var(--text3)';
  }
  
  const key = `${cur}_${native}`;
  let rate = _fxRateCache[key];
  
  if (!rate) {
    try {
      const res = await fetchLiveRate(cur, native);
      if (res.rate) {
        rate = res.rate;
      }
    } catch(e) {}
  }
  
  if (rate) {
    _expenseFxRate = rate;
    calcExpenseFx();
  } else {
    if (resultSpan) {
      resultSpan.textContent = '(rate unavailable)';
      resultSpan.style.color = 'var(--red)';
    }
    _expenseFxRate = null;
  }
}

function calcExpenseFx() {
  const resultSpan = $('exp-fx-inline-result');
  if (!resultSpan || !_expenseFxRate) return;
  
  const amt = parseFloat($('exp-amount').value) || 0;
  const book = getBook();
  const converted = amt * _expenseFxRate;
  
  resultSpan.textContent = `≈ ${fmt(converted, book.currency)}`;
  resultSpan.style.color = 'var(--gold)';
}
function toggleShippingPanel(){}  // no-op, kept for safety

let _labelOrderIndex = null;

function openLabelModal(histIndex) {
  _labelOrderIndex = histIndex;
  const h = getState().hist[histIndex];
  const book = getBook();
  $('shipping-label-order-info').textContent = `${h.num} · ${book.title} × ${h.qty} · ${fmtD(h.date)}`;
  $('sl-name').value     = h.shipName     || '';
  $('sl-email').value    = h.shipEmail    || '';
  $('sl-addr1').value    = h.shipAddr1    || '';
  $('sl-addr2').value    = h.shipAddr2    || '';
  $('sl-city').value     = h.shipCity     || '';
  $('sl-province').value = h.shipProvince || '';
  $('sl-postal').value   = h.shipPostal   || '';
  $('sl-country').value  = h.shipCountry  || 'Canada';
  updateShippedStatusUI(h);
  openM('shipping-label');
}

function updateShippedStatusUI(h) {
  const status = $('sl-shipped-status');
  const toggleBtn = $('sl-toggle-shipped-btn');
  if (!status || !toggleBtn) return;
  if (h.shipped) {
    status.style.display = '';
    status.innerHTML = `✓ Shipped${h.shippedDate ? ' on ' + fmtD(h.shippedDate) : ''}`;
    toggleBtn.style.display = '';
    toggleBtn.textContent = 'Mark as not shipped';
  } else {
    status.style.display = 'none';
    toggleBtn.style.display = '';
    toggleBtn.textContent = 'Mark as shipped';
  }
}

function toggleShipped() {
  if (_labelOrderIndex == null) return;
  const h = getState().hist[_labelOrderIndex];
  if (h.shipped) {
    delete h.shipped;
    delete h.shippedDate;
  } else {
    h.shipped = true;
    h.shippedDate = today();
  }
  saveState(activeBook);
  updateShippedStatusUI(h);
  renderHist();
}

function getShippingData(){}   // no-op
function clearShippingFields(){}  // no-op
function openShippingLabel(){}  // no-op

function printShippingLabel() {
  const h = getState().hist[_labelOrderIndex];
  const book = getBook();

  // Save address to history entry so it's remembered next time
  h.shipName     = $('sl-name').value.trim();
  h.shipEmail    = $('sl-email').value.trim();
  h.shipAddr1    = $('sl-addr1').value.trim();
  h.shipAddr2    = $('sl-addr2').value.trim();
  h.shipCity     = $('sl-city').value.trim();
  h.shipProvince = $('sl-province').value.trim();
  h.shipPostal   = $('sl-postal').value.trim();
  h.shipCountry  = $('sl-country').value.trim();
  if (!h.shipped) {
    h.shipped = true;
    h.shippedDate = today();
  }
  saveState(activeBook);
  renderHist();

  const ship = { name:h.shipName, addr1:h.shipAddr1, addr2:h.shipAddr2,
                 city:h.shipCity, province:h.shipProvince, postal:h.shipPostal, country:h.shipCountry };

  const fromLines = ['Lyricalmyrical Books', '456 Montrose Ave', 'Toronto, ON  M6G 3H1', 'Canada'];

  const cityLine = [ship.city, ship.province].filter(Boolean).join(', ');
  const cityPostal = [cityLine, ship.postal].filter(Boolean).join('  ');
  const toLines = [ship.addr1, ship.addr2, cityPostal].filter(Boolean);
  const country = (ship.country||'').toUpperCase();

  const esc = (s) => String(s||'').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  const labelHTML = `
  <div class="label">
    <section class="to">
      <div class="kicker">Ship To</div>
      <div class="to-name">${esc(ship.name||'')}</div>
      <div class="to-lines">
        ${toLines.map(l=>`<div>${esc(l)}</div>`).join('')}
      </div>
      ${country ? `<div class="to-country">${esc(country)}</div>` : ''}
    </section>

    <section class="from">
      <div class="kicker">From</div>
      <div class="from-lines">
        ${fromLines.map(l=>`<div>${esc(l)}</div>`).join('')}
      </div>
    </section>
  </div>`;

  const styles = `
    @page { margin: 0; size: 4in 6in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; color: #111; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      font-size: 11pt;
    }
    .label {
      width: 4in; height: 6in;
      display: flex; flex-direction: column;
      color: #111;
    }

    .kicker {
      font-size: 7pt; font-weight: 800;
      letter-spacing: .22em; text-transform: uppercase;
      color: #111; margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1.5px solid #111;
    }

    .to {
      flex: 1;
      padding: 0.28in 0.3in 0.18in;
    }
    .to-name {
      font-size: 19pt; font-weight: 800;
      letter-spacing: -.01em; line-height: 1.1;
      margin-bottom: 8px;
    }
    .to-lines { font-size: 12pt; line-height: 1.38; color: #111; }
    .to-country {
      margin-top: 8px;
      font-size: 13pt; font-weight: 800;
      letter-spacing: .06em;
    }

    .from {
      padding: 0.18in 0.3in 0.28in;
      border-top: 1px solid #111;
    }
    .from .kicker { border-bottom: none; padding-bottom: 0; margin-bottom: 4px; color: #666; }
    .from-lines { font-size: 8.5pt; line-height: 1.45; color: #444; }

    @media print {
      body { padding: 0; }
      .label { box-shadow: none; }
    }
  `;

  const win = window.open('','_blank','width=620,height=720');
  win.document.write(`<!DOCTYPE html><html><head><title>Label — ${esc(h.num)}</title>
    <meta charset="utf-8">
    <style>${styles}</style>
    </head><body>${labelHTML}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(()=>{ win.print(); }, 350);
  closeM('shipping-label');
}


// ── ARTIST PAYMENT LINK
function saveArtistPaymentLink(){
  const val=($('artist-pay-link-input').value||'').trim();
  const s=getState();
  s.artistPaymentLink=val;
  // Also store on book object so publisher can read it
  getBook().artistPaymentLink=val;
  saveState(activeBook);
  showToast('✓ Payment link saved');
}

function renderArtistReimburseBanner(){
  const s=getState(),book=getBook(),cur=book.currency;
  // Show payment link card for authors
  const linkCard=$('artist-payment-link-card');
  if(linkCard){
    if(isAuthor()){
      linkCard.style.display='';
      const inp=$('artist-pay-link-input');
      if(inp && !inp.value) inp.value=s.artistPaymentLink||'';
    } else {
      linkCard.style.display='none';
    }
  }
  // Show received expenses banner for authors
  const banner=$('artist-reimburse-banner');
  if(!banner) return;
  if(!isAuthor()){ banner.style.display='none'; return; }
  const received=(s.expenses||[]).filter(e=>e.received);
  if(!received.length){ banner.style.display='none'; return; }
  const total=received.reduce((a,e)=>a+(e.amount||0),0);
  banner.style.display='';
  $('arb-amount').textContent=fmt(total,cur);
  $('arb-detail').textContent=`${received.length} expense${received.length!==1?'s':''} marked as received by publisher`;
  $('arb-hint').textContent='These expenses have been settled';
  $('arb-items').innerHTML=received.map(e=>`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,.35);">
        ${e.desc} · ${fmtD(e.date)} · <span style="font-size:9px;background:rgba(255,255,255,.08);padding:1px 6px;border-radius:100px;">${e.cat}</span>
      </div>
      <div style="font-family:'DM Mono',monospace;font-size:13px;color:#6ee7a8;font-weight:500;">${fmt(e.amount,cur)}</div>
    </div>`).join('');
}

function updateExpenseForm(){
  const book=getBook();
  $('exp-date').value=today();
  
  const native = getBookCurrencyCode(book);
  if ($('exp-cur')) $('exp-cur').value = native;
  if ($('exp-fx-inline-result')) $('exp-fx-inline-result').style.display = 'none';
  _expenseFxRate = null;

  if (window.IS_PUBLISHER) {
    if ($('exp-ai-btn')) $('exp-ai-btn').style.display = '';
  } else {
    if ($('exp-ai-btn')) $('exp-ai-btn').style.display = 'none';
  }
}

async function submitExpense(){
  if (!activeBook) { showToast('⚠ Error: No active book selected', 'err'); return; }
  const desc=($('exp-desc').value||'').trim();
  const cat=$('exp-cat').value;
  const date=$('exp-date').value||today();
  const ref=($('exp-ref').value||'').trim();
  const book=getBook();

  
  const curField = $('exp-cur');
  const rawAmount = parseFloat($('exp-amount').value) || 0;
  const cur = curField ? curField.value : book.currency;
  const native = getBookCurrencyCode(book);

  let amount = rawAmount;
  let currency = native;
  let fxNote = "";

  if (cur !== native && _expenseFxRate) {
    amount = rawAmount * _expenseFxRate;
    fxNote = ` (Paid ${cur} ${rawAmount.toFixed(2)})`;
  } else {
    currency = cur; // If no FX used, use the selected currency (should match native anyway)
  }
  
  const finalDesc = desc + fxNote;
  
  if(!desc){ showToast('⚠ Please enter a description','warn'); $('exp-desc').focus(); return; }
  if(!rawAmount){ showToast('⚠ Please enter an amount','warn'); $('exp-amount').focus(); return; }
  
  const fileInput = $('exp-file');
  let receiptUrl = '';
  if (fileInput && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const submitBtn = $('submit-exp-btn');
    const oldText = submitBtn.textContent;
    
    if (window.IS_PUBLISHER) {
      submitBtn.textContent = 'Saving locally...'; submitBtn.disabled = true;
      try {
        const localUrl = await saveReceiptToLocalFile(file, book.title);
        if (localUrl) receiptUrl = localUrl;
      } catch(e) {
        console.error(e);
        showToast('⚠ Error saving receipt locally', 'err');
      }
    } else {
      submitBtn.textContent = 'Uploading to cloud...'; submitBtn.disabled = true;
      try {
        const stamp = new Date().getTime();
        const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
        const path = `${activeBook}/${stamp}_${cleanName}`;
        // Add a 30s timeout so the button never hangs forever
        const uploadPromise = window._fbUploadReceipt(file, path);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Upload timed out')), 30000)
        );
        receiptUrl = await Promise.race([uploadPromise, timeoutPromise]);
      } catch(e) {
        console.error(e);
        showToast('⚠ Cloud upload failed — submitting without receipt', 'err');
      }
    }
    submitBtn.textContent = oldText; submitBtn.disabled = false;
  }

  const s=getState();
  if(!s.expenses) s.expenses=[];
  
  // Store original payment info for ledger display
  const origAmount = rawAmount;
  const origCurrency = cur;
  
  // Calculate CAD equivalence for publisher reporting (only once, at submission time)
  const cadRate = currency !== 'CAD' ? (_fxRateCache[`${currency}_CAD`] || null) : 1;
  const baseAmount = cadRate ? (amount * cadRate) : amount;
  const newExpense = {id:Date.now(),desc:finalDesc,cat,amount,currency,origAmount,origCurrency,date,ref,receipt: receiptUrl,fxRate:_expenseFxRate,baseAmount};
  
  if (isAuthor()) {
    try {
      await window._fbSubmitActivity(activeBook, 'expenses', newExpense);
      addLog('log-expenses',`${cat}: ${desc} — ${fmt(amount,currency)} (Submitted)`,'ok');
      showToast('✓ Expense submitted for approval');
      notifyPublisherSubmission('Expense', newExpense, `${cat}: ${desc} — ${fmt(amount,currency)}`);
    } catch(e) {
      console.error("Submission error:", e);
      if (e.message && e.message.includes('PERMISSION_DENIED')) {
        showToast('⚠ Permission denied by Firestore Rules', 'err');
      } else {
        showToast('⚠ Failed to submit expense', 'err');
      }
    }
  } else {
    const s=getState();
    if(!s.expenses) s.expenses=[];
    s.expenses.unshift(newExpense);
    saveState(activeBook);
    addLog('log-expenses',`${cat}: ${desc} — ${fmt(amount,currency)}`,'ok');
    showToast('✓ Expense logged');
  }
  
  renderExpenses();
  updateDash();
  $('exp-desc').value='';$('exp-amount').value='';$('exp-ref').value='';$('exp-date').value=today();
  if(fileInput) fileInput.value = '';
}

function voidExpense(id){
  const s=getState();
  s.expenses=(s.expenses||[]).filter(e=>e.id!==id);
  renderExpenses();
  updateDash();
  saveState(activeBook);
  showToast('Expense removed','warn');
}

async function scanProjectReceiptWithAI() {
    const fileInput = $('exp-file');
    if(!fileInput || fileInput.files.length === 0) { showToast('⚠ Please attach a file first', 'warn'); return; }
    
    const apiKey = TAX_CENTER.settings?.geminiKey;
    if(!apiKey) { showToast('⚠ Gemini API Key required in Config', 'err'); return; }

    const file = fileInput.files[0];
    const btn = $('exp-ai-btn');
    const oldText = btn.textContent;
    btn.textContent = 'Scanning...'; btn.disabled = true;

    try {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        await new Promise(r => reader.onload = r);
        const base64Data = reader.result.split(',')[1];
        const mimeType = file.type;

        const parts = [
            { text: "Extract these exact 3 keys from this receipt into a very strict JSON format: 'vendor', 'date' (YYYY-MM-DD), 'amount' (number floats only), 'currency' (ISO 3-letter, uppercase). No markdown, just raw JSON." },
            { inline_data: { mime_type: mimeType, data: base64Data } }
        ];

        const data = await _callGeminiForReceipts(apiKey, parts);

        let extractedJsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!extractedJsonStr) throw new Error("No text returned from AI");
        extractedJsonStr = extractedJsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
        const extracted = JSON.parse(extractedJsonStr);

        if(extracted.vendor) $('exp-desc').value = extracted.vendor;
        if(extracted.date) $('exp-date').value = extracted.date;
        if(extracted.amount) $('exp-amount').value = extracted.amount;
        if(extracted.currency && $('exp-cur')) $('exp-cur').value = extracted.currency;

        showToast('✓ Receipt data extracted');
    } catch(e) {
        console.error("AI Scan Error:", e);
        showToast(`⚠ AI extraction failed: ${e.message}`, 'err');
    }
    btn.textContent = oldText; btn.disabled = false;
}

// ── EMAIL RECEIPT IMPORT
// Module-level draft store so we don't smuggle JSON through onclick attributes.
let _emailReceiptDrafts = [];

const EXPENSE_CATEGORIES = [
  'Software & Subscriptions', 'Marketing & Advertising', 'Printing & Production',
  'Editorial & Proofreading', 'Illustration & Photography', 'Rights & Permissions',
  'ISBN, Barcodes & Cataloging', 'Shipping & Postage', 'Warehousing & Fulfillment',
  'Packaging Materials', 'Office Supplies', 'Home Office', 'Travel & Meals', 'Professional Services',
  'Sales Processing Fees',
  'Books, Research & Reference', 'Events & Exhibitions', 'Other'
];

function inferReceiptCategory(vendor, description) {
  const hay = `${vendor || ''} ${description || ''}`.toLowerCase();
  if (typeof TAX_CATEGORIES === 'object' && TAX_CATEGORIES) {
    for (const kw in TAX_CATEGORIES) {
      if (hay.includes(kw)) return TAX_CATEGORIES[kw];
    }
  }
  // Extra heuristics for common online vendors
  const map = [
    ['stripe', 'Software & Subscriptions'],
    ['paypal', 'Professional Services'],
    ['amazon', 'Office Supplies'],
    ['etsy', 'Marketing & Advertising'],
    ['canva', 'Software & Subscriptions'],
    ['notion', 'Software & Subscriptions'],
    ['github', 'Software & Subscriptions'],
    ['openai', 'Software & Subscriptions'],
    ['anthropic', 'Software & Subscriptions'],
    ['gemini', 'Software & Subscriptions'],
    ['canada post', 'Shipping & Postage'],
    ['stallion', 'Shipping & Postage'],
    ['chit chats', 'Shipping & Postage'],
    ['ingram', 'Printing & Production'],
    ['lulu', 'Printing & Production'],
    ['blurb', 'Printing & Production'],
    ['vistaprint', 'Printing & Production'],
    ['costco', 'Office Supplies'],
    ['staples', 'Office Supplies'],
    ['uline', 'Packaging Materials'],
    ['airbnb', 'Travel & Meals'],
    ['rent', 'Home Office'],
    ['landlord', 'Home Office'],
    ['property management', 'Home Office'],
    ['hydro', 'Home Office'],
    ['electric', 'Home Office'],
    ['enbridge', 'Home Office'],
    ['utility', 'Home Office'],
    ['utilities', 'Home Office'],
    ['internet', 'Home Office'],
    ['rogers', 'Home Office'],
    ['bell canada', 'Home Office'],
    ['telus', 'Home Office'],
    ['comcast', 'Home Office'],
    ['home insurance', 'Home Office'],
    ['tenant insurance', 'Home Office'],
    ['condo fee', 'Home Office'],
    ['strata', 'Home Office'],
    ['property tax', 'Home Office']
  ];
  for (const [kw, cat] of map) if (hay.includes(kw)) return cat;
  return 'Other';
}

// Best-effort date normalization to YYYY-MM-DD
function normalizeReceiptDate(s) {
  if (!s) return '';
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return '';
}

// Decode quoted-printable + strip MIME headers + collapse HTML to text
function parseEmlOrText(raw) {
  if (!raw) return '';
  let body = String(raw);
  // If it looks like a raw .eml (RFC 5322), drop headers up to first blank line
  if (/^[A-Za-z-]+:\s.+\r?\n/.test(body) && /\n\r?\n/.test(body)) {
    const idx = body.search(/\r?\n\r?\n/);
    if (idx > 0 && idx < body.length / 2) body = body.slice(idx).trim();
  }
  // Naive quoted-printable decode for =XX hex pairs and soft line breaks
  if (/=[0-9A-F]{2}/.test(body)) {
    try {
      body = body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) =>
        String.fromCharCode(parseInt(h, 16))
      );
    } catch (_) { /* ignore */ }
  }
  // Collapse HTML to text if present
  if (/<\w+[^>]*>/.test(body)) {
    const tmp = document.createElement('div');
    tmp.innerHTML = body;
    body = tmp.textContent || tmp.innerText || body;
  }
  return body.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
}

async function readReceiptFiles(files) {
  const out = []; // [{kind:'text'|'inline', text?, mime?, base64?, name}]
  for (const file of files) {
    const name = file.name || 'attachment';
    const isText = /^(text\/|message\/)/.test(file.type) ||
                   /\.(eml|txt|html?|md)$/i.test(name);
    if (isText) {
      const txt = await file.text();
      out.push({ kind: 'text', text: parseEmlOrText(txt), name });
    } else {
      const buf = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const base64 = String(buf).split(',')[1] || '';
      out.push({
        kind: 'inline',
        mime: file.type || 'application/octet-stream',
        base64,
        name
      });
    }
  }
  return out;
}

function openEmailReceiptImportModal() {
  openM('email-receipt-import-modal');
  if ($('email-receipt-results')) $('email-receipt-results').innerHTML = '';
  _emailReceiptDrafts = [];
  const fileInput = $('email-receipt-files');
  const list = $('email-receipt-files-list');
  if (fileInput) {
    fileInput.value = '';
    fileInput.onchange = () => {
      if (!list) return;
      const fs = Array.from(fileInput.files || []);
      list.innerHTML = fs.length
        ? fs.map(f => `• ${f.name} <span style="opacity:.6;">(${Math.round(f.size/1024)} KB)</span>`).join('<br>')
        : '';
    };
  }
}

function closeEmailReceiptImportModal() {
  closeM('email-receipt-import-modal');
}

async function _callGeminiForReceipts(apiKey, parts) {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastErr;
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { response_mime_type: 'application/json', temperature: 0.1 }
          })
        }
      );
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} from ${model}`);
        // Try next model on 404/400 (model unsupported), retry-once on 429/5xx
        if (res.status === 429 || res.status >= 500) {
          await new Promise(r => setTimeout(r, 800));
          const retry = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: { response_mime_type: 'application/json', temperature: 0.1 }
              })
            }
          );
          if (retry.ok) return retry.json();
        }
        continue;
      }
      return await res.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('All Gemini models failed');
}

async function extractReceiptsFromEmailText() {
  const apiKey = TAX_CENTER.settings?.geminiKey;
  if (!apiKey) { showToast('Gemini API Key required in Config', 'err'); return; }

  const pasted = ($('email-receipt-source')?.value || '').trim();
  const fileInput = $('email-receipt-files');
  const files = Array.from(fileInput?.files || []);
  if (!pasted && !files.length) { showToast('Paste emails or attach files first', 'warn'); return; }

  const btn = $('email-receipt-scan-btn');
  const prev = btn.textContent;
  if (btn) btn.disabled = true;
  btn.textContent = 'Extracting…';

  const wrap = $('email-receipt-results');
  if (wrap) wrap.innerHTML = `<div style="font-size:12px;color:var(--text3);">Reading attachments and querying Gemini…</div>`;

  try {
    const fileParts = await readReceiptFiles(files);
    const allowedCats = EXPENSE_CATEGORIES.join(' | ');
    const prompt = `You extract purchase receipts/invoices from emails for bookkeeping.
Return ONLY valid JSON: {"receipts":[{"vendor":"string","date":"YYYY-MM-DD","amount":number,"currency":"ISO 4217 uppercase","description":"short human label","reference":"order/invoice number if any","category":"one of: ${allowedCats}","sourceSnippet":"<= 240 chars of the original line(s) that justify this row","confidence":0.0}]}
Rules:
1. Include EVERY distinct purchase, payment, invoice, charge, or receipt — including subscriptions, ad spend, shipping labels, software, postage, services, and book printing. One row per receipt.
2. Skip pure shipping-tracking updates, marketing emails, password resets, statements/balances with no charge, payment requests, refunds (note refunds as negative amount).
3. Currency is the ISO 4217 code (e.g. USD, CAD, EUR, GBP, JPY). Default to CAD only if truly unknown.
4. Amount is the TOTAL paid including tax/shipping (number, no symbol). Use a dot decimal.
5. Date is when the charge was made (YYYY-MM-DD). If only month/day given, infer year from email context. If unsure, use today.
6. Pick the BEST category from the list above. Use "Other" only if nothing fits.
7. confidence is 0.0–1.0 reflecting how sure you are this is a real receipt.
8. If an attachment is a PDF/image of a receipt, extract from it directly.
9. Do not invent data. If amount/currency/date cannot be determined, omit the row entirely.
10. Output JSON only — no markdown, no commentary.`;

    const parts = [{ text: prompt }];
    const cleanedText = parseEmlOrText(pasted);
    if (cleanedText) parts.push({ text: '--- PASTED EMAIL TEXT ---\n' + cleanedText.slice(0, 120000) });
    for (const fp of fileParts) {
      if (fp.kind === 'text' && fp.text) {
        parts.push({ text: `--- FILE: ${fp.name} ---\n` + fp.text.slice(0, 60000) });
      } else if (fp.kind === 'inline' && fp.base64) {
        parts.push({ inline_data: { mime_type: fp.mime, data: fp.base64 } });
      }
    }

    const data = await _callGeminiForReceipts(apiKey, parts);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (_) {
      // Try to recover JSON from a possibly-fenced response
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { receipts: [] };
    }

    const drafts = (parsed.receipts || []).map(r => ({
      vendor: String(r.vendor || '').trim(),
      description: String(r.description || r.vendor || 'Receipt').trim(),
      date: normalizeReceiptDate(r.date) || today(),
      amount: Number(r.amount || 0),
      currency: String(r.currency || 'CAD').toUpperCase().slice(0, 3),
      reference: String(r.reference || '').trim(),
      category: EXPENSE_CATEGORIES.includes(r.category)
        ? r.category
        : inferReceiptCategory(r.vendor, r.description),
      sourceSnippet: String(r.sourceSnippet || '').slice(0, 240),
      confidence: Number(r.confidence || 0.7),
      include: true
    })).filter(r => r.amount && r.currency);

    _emailReceiptDrafts = drafts;
    renderEmailReceiptDrafts(drafts);
    if (!drafts.length) {
      showToast('No receipts detected — try pasting more context or attaching the original email file.', 'warn');
    } else {
      showToast(`✓ Found ${drafts.length} receipt${drafts.length > 1 ? 's' : ''}`);
    }
  } catch (e) {
    console.error('[email-receipt-import]', e);
    const wrap2 = $('email-receipt-results');
    if (wrap2) {
      wrap2.innerHTML = `<div style="background:rgba(220,60,60,.08);border:1px solid rgba(220,60,60,.25);border-radius:var(--r2);padding:10px 14px;font-size:12px;color:var(--red);">Extraction failed: ${(e.message || e).toString().replace(/</g,'&lt;')}<br><span style="color:var(--text3);">Verify your Gemini API key in Config and try again.</span></div>`;
    }
    showToast('Could not extract receipts', 'err');
  } finally {
    if (btn) btn.disabled = false;
    btn.textContent = prev;
  }
}

function _isLikelyDuplicateExpense(draft) {
  const list = TAX_CENTER.businessExpenses || [];
  const a = Number(draft.amount).toFixed(2);
  return list.some(e =>
    e.date === draft.date &&
    Number(e.amount).toFixed(2) === a &&
    (e.currency || 'CAD').toUpperCase() === draft.currency.toUpperCase()
  );
}

function renderEmailReceiptDrafts(receipts) {
  const wrap = $('email-receipt-results');
  if (!wrap) return;
  if (!Array.isArray(receipts) || !receipts.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:14px;font-size:12px;color:var(--text3);">No valid receipts found.</div>';
    return;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const catOptions = (sel) => EXPENSE_CATEGORIES
    .map(c => `<option${c === sel ? ' selected' : ''}>${esc(c)}</option>`).join('');
  const curOptions = (sel) => ['CAD','USD','EUR','GBP','AUD','JPY','MXN','CHF','SEK','NOK','DKK']
    .map(c => `<option${c === sel ? ' selected' : ''}>${esc(c)}</option>`).join('');

  const dupCount = receipts.filter(r => _isLikelyDuplicateExpense(r)).length;

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:12px;color:var(--text3);">${receipts.length} draft${receipts.length>1?'s':''} extracted${dupCount?` · <span style="color:var(--amber);">${dupCount} possible duplicate${dupCount>1?'s':''}</span>`:''}. Edit any field, deselect rows you don't want.</div>
      <div style="display:flex;gap:6px;">
        <button class="btn sm" type="button" onclick="toggleAllEmailDrafts(true)">Select all</button>
        <button class="btn sm" type="button" onclick="toggleAllEmailDrafts(false)">Select none</button>
      </div>
    </div>
    <div class="tbl-wrap" style="max-height:340px;overflow:auto;border:1px solid var(--border);border-radius:var(--r2);">
      <table class="tbl" style="font-size:12px;">
        <thead><tr>
          <th></th><th>Date</th><th>Vendor / Description</th><th>Category</th><th>Ref</th>
          <th class="r" style="min-width:130px;">Amount</th><th></th>
        </tr></thead>
        <tbody>
        ${receipts.map((r, i) => {
          const dup = _isLikelyDuplicateExpense(r);
          const lowConf = (r.confidence ?? 1) < 0.5;
          return `<tr data-erd-row="${i}" style="${dup?'background:rgba(220,170,40,.06);':''}">
            <td><input type="checkbox" data-erd-include="${i}" ${r.include!==false?'checked':''}></td>
            <td><input type="date" data-erd-field="date" data-erd-i="${i}" value="${esc(r.date)}" style="font-size:12px;width:130px;"></td>
            <td>
              <input type="text" data-erd-field="vendor" data-erd-i="${i}" value="${esc(r.vendor)}" placeholder="Vendor" style="font-size:12px;width:100%;margin-bottom:2px;">
              <input type="text" data-erd-field="description" data-erd-i="${i}" value="${esc(r.description)}" placeholder="Description" style="font-size:11px;width:100%;color:var(--text2);">
              ${dup?`<div style="font-size:10px;color:var(--amber);margin-top:2px;">⚠ matches an existing expense</div>`:''}
              ${lowConf?`<div style="font-size:10px;color:var(--text3);margin-top:2px;">low confidence (${(r.confidence*100|0)}%)</div>`:''}
            </td>
            <td><select data-erd-field="category" data-erd-i="${i}" style="font-size:12px;">${catOptions(r.category)}</select></td>
            <td><input type="text" data-erd-field="reference" data-erd-i="${i}" value="${esc(r.reference)}" placeholder="—" style="font-size:12px;width:120px;"></td>
            <td class="r">
              <div style="display:flex;gap:4px;align-items:center;justify-content:flex-end;">
                <select data-erd-field="currency" data-erd-i="${i}" style="font-size:12px;width:64px;">${curOptions(r.currency)}</select>
                <input type="number" step="0.01" data-erd-field="amount" data-erd-i="${i}" value="${Number(r.amount).toFixed(2)}" style="font-size:12px;width:90px;text-align:right;">
              </div>
            </td>
            <td>${r.sourceSnippet?`<button class="btn sm" type="button" title="View source snippet" onclick="alert(${JSON.stringify(r.sourceSnippet)})">👁</button>`:''}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;align-items:center;justify-content:flex-end;">
      <span style="font-size:11px;color:var(--text3);">FX rates auto-fetched at import</span>
      <button class="btn gold" type="button" onclick="importEmailReceiptDrafts()">Import selected drafts</button>
    </div>
  `;

  // Wire up edits → in-memory store
  wrap.querySelectorAll('[data-erd-field]').forEach(el => {
    el.addEventListener('change', () => {
      const i = Number(el.getAttribute('data-erd-i'));
      const f = el.getAttribute('data-erd-field');
      if (!_emailReceiptDrafts[i]) return;
      let v = el.value;
      if (f === 'amount') v = Number(v) || 0;
      if (f === 'currency') v = String(v).toUpperCase();
      if (f === 'date') v = normalizeReceiptDate(v) || v;
      _emailReceiptDrafts[i][f] = v;
    });
  });
  wrap.querySelectorAll('[data-erd-include]').forEach(cb => {
    cb.addEventListener('change', () => {
      const i = Number(cb.getAttribute('data-erd-include'));
      if (_emailReceiptDrafts[i]) _emailReceiptDrafts[i].include = !!cb.checked;
    });
  });
}

function toggleAllEmailDrafts(on) {
  _emailReceiptDrafts.forEach(d => { d.include = !!on; });
  document.querySelectorAll('[data-erd-include]').forEach(cb => { cb.checked = !!on; });
}

async function importEmailReceiptDrafts() {
  const drafts = (_emailReceiptDrafts || []).filter(r => r.include !== false);
  if (!drafts.length) { showToast('No drafts selected', 'warn'); return; }

  if (!TAX_CENTER.businessExpenses) TAX_CENTER.businessExpenses = [];
  const fallbackCat = $('email-receipt-default-cat')?.value || 'Other';
  const baseCur = TAX_CENTER.settings?.baseCurrency || 'CAD';

  const btn = document.querySelector('#email-receipt-results .btn.gold');
  if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }

  // Save attached files to local receipt storage
  const fileInput = $('email-receipt-files');
  const attachedFiles = Array.from(fileInput?.files || []);
  const savedReceiptPaths = [];
  if (attachedFiles.length) {
    for (const file of attachedFiles) {
      try {
        const path = await saveReceiptToLocalFile(file, 'email-imports');
        if (path) savedReceiptPaths.push(path);
      } catch (_) { /* local folder may not be set up */ }
    }
  }

  let imported = 0, skippedDup = 0;
  let draftIdx = 0;
  for (const item of drafts) {
    const currency = (item.currency || baseCur).toUpperCase();
    const amount = Number(item.amount || 0);
    if (!amount) continue;

    if (_isLikelyDuplicateExpense(item)) {
      skippedDup++;
      continue;
    }

    let fxRate = currency === baseCur ? 1 : (_fxRateCache[`${currency}_${baseCur}`] || 0);
    if (!fxRate) {
      try {
        const r = await fetchLiveRate(currency, baseCur);
        fxRate = r?.rate || 0;
      } catch (_) { /* fall through */ }
    }
    if (!fxRate) fxRate = 1; // last resort

    // Associate a saved receipt file: use per-draft index if available, else first saved file
    const receiptPath = savedReceiptPaths[draftIdx] || savedReceiptPaths[0] || '';
    TAX_CENTER.businessExpenses.unshift({
      id: Date.now() + Math.floor(Math.random() * 100000),
      desc: item.description || item.vendor || 'Email receipt',
      vendor: item.vendor || '',
      cat: EXPENSE_CATEGORIES.includes(item.category) ? item.category : fallbackCat,
      currency,
      amount,
      origCurrency: currency,
      origAmount: amount,
      fxRate,
      baseAmount: amount * fxRate,
      date: item.date || today(),
      ref: item.reference || 'email-import',
      receipt: receiptPath,
      sourceSnippet: item.sourceSnippet || '',
      importedFromEmail: true,
      importedAt: new Date().toISOString()
    });
    imported++;
    draftIdx++;
  }

  await saveTaxCenter();
  if (typeof renderTaxCenter === 'function') renderTaxCenter();

  const msgParts = [];
  if (imported) msgParts.push(`✓ Imported ${imported} expense${imported > 1 ? 's' : ''}`);
  if (skippedDup) msgParts.push(`${skippedDup} duplicate${skippedDup > 1 ? 's' : ''} skipped`);
  showToast(msgParts.join(' · ') || 'Nothing imported', imported ? 'ok' : 'warn');

  if (imported) closeEmailReceiptImportModal();
  else if (btn) { btn.disabled = false; btn.textContent = 'Import selected drafts'; }
}

function renderExpenses(){
  const s=getState(),book=getBook(),cur=book.currency;
  const expenses=s.expenses||[];
  const body=$('exp-body');
  if(!body)return;
  const pbExp = window.authorSubmissions[activeBook]?.expenses || {};
  const pendingAuthExpenses = Object.keys(pbExp).map(k => {
    const raw = JSON.parse(pbExp[k].data);
    return { ...raw, _subKey: k, pendingAuth: true };
  });
  const combined = [...pendingAuthExpenses, ...expenses];

  if(!combined.length){
    body.innerHTML=`<tr><td colspan="${window.IS_PUBLISHER ? 9 : 8}"><div class="empty-state" style="padding:1.5rem;">No expenses logged yet.</div></td></tr>`;
    return;
  }

  const unreceived=combined.filter(e=>!e.received && !e.pendingAuth);
  const total=unreceived.reduce((a,e)=>a+(e.amount||0),0);
  
  $('exp-head-row').innerHTML = `<tr><th>Date</th><th>Description</th><th>Category</th><th>Ref</th><th>Receipt</th><th class="r">Amount</th>${window.IS_PUBLISHER ? '<th class="r">Amount (CAD)</th>' : ''}<th>Reimbursement</th><th></th></tr>`;
  
  body.innerHTML=combined.map(e=>{
    if (e.pendingAuth) {
      const actionCell = window.IS_PUBLISHER
        ? `<button class="edit-btn" onclick="approveSubmission('expenses', '${e._subKey}')" style="color:var(--green);font-weight:bold;margin-right:8px;">✓ Approve</button><button class="edit-btn" onclick="rejectSubmission('expenses', '${e._subKey}')" style="color:var(--red);">✕</button>`
        : `<span style="font-size:10px;color:var(--amber);">Awaiting Publisher</span>`;
      return `<tr style="opacity:0.8;background:#fffcede3;">
        <td style="font-size:12px;color:var(--text3);">${fmtD(e.date)}</td>
        <td style="font-weight:600;">${e.desc}</td>
        <td><span class="pill gray" style="font-size:10px;">${e.cat}</span></td>
        <td class="mono" style="font-size:11px;color:var(--text3);">${e.ref||'—'}</td>
        <td>—</td>
        <td class="r" style="font-weight:600;">${fmt(e.amount, e.currency)}</td>
        ${window.IS_PUBLISHER ? '<td class="r">—</td>' : ''}
        <td></td>
        <td class="r">${actionCell}</td>
      </tr>`;
    }

    const statusCell=e.received
      ?'<span class="pill green" style="font-size:10px;">✓ Received</span>'
      :'<span style="font-size:11px;color:var(--text4);">Pending</span>';
    const actionCell=(!e.received && !isAuthor())
      ?`<button class="edit-btn" onclick="voidExpense(${e.id})" title="Remove" style="opacity:1;color:var(--red);">✕</button>`:'';
    const baseReceiptLink = e.receipt ? (
      e.receipt.startsWith('local://')
      ? `<a href="#" onclick="event.preventDefault(); viewLocalReceipt('${e.receipt.replace('local://','')}')" style="font-size:11px;color:var(--gold);text-decoration:underline;">View Local</a>`
      : `<a href="${e.receipt}" target="_blank" style="font-size:11px;color:var(--gold);">View</a>`
    ) : `<span style="font-size:11px;color:var(--text4); font-weight: 500;">Missing</span>`;
    const trackLink = e.trackingUrl
      ? ` <a href="${e.trackingUrl}" target="_blank" style="font-size:11px;color:var(--text3);" title="Track shipment">· Track</a>`
      : '';
    const receiptCell = baseReceiptLink + trackLink;

    // Calculate multi-currency stuff
    const eCur = e.currency || cur;
    const isBase = eCur === 'CAD';
    let baseAmountText = '';
    let baseAmountTitle = '';

    if (window.IS_PUBLISHER) {
       if (isBase) {
           baseAmountText = '-';
       } else if (e.baseAmount) {
           baseAmountText = fmt(e.baseAmount, 'CAD');
       } else if (_fxRateCache[`${eCur}_CAD`]) {
           baseAmountText = fmt(e.amount * _fxRateCache[`${eCur}_CAD`], 'CAD');
       } else {
           baseAmountText = '<span style="color:var(--amber);" title="Missing exchange rate">⚠️</span>';
       }
       // Audit trail: show the exact rate used and on which date.
       const usedRate = (Number(e.fxRate) > 0) ? Number(e.fxRate) : _fxRateCache[`${eCur}_CAD`];
       if (!isBase && usedRate > 0) {
           baseAmountTitle = `1 ${eCur} = ${usedRate.toFixed(4)} CAD${e.date ? ` on ${e.date}` : ''}`;
       }
    }

    return `<tr style="${e.received?'opacity:.5;':''}">
      <td style="font-size:12px;color:var(--text3);">${fmtD(e.date)}</td>
      <td style="font-weight:600;">${e.desc}</td>
      <td><span class="pill gray" style="font-size:10px;">${e.cat}</span></td>
      <td style="font-size:11px;color:var(--text3);">${e.ref||'—'}</td>
      <td>${receiptCell}</td>
      <td class="r" style="color:${e.received?'var(--text4)':'var(--red)'};font-family:'DM Mono',monospace;">${fmt(e.amount,eCur)}</td>
      ${window.IS_PUBLISHER ? `<td class="r" style="font-family:'DM Mono',monospace;color:var(--text3);"${baseAmountTitle ? ` title="${baseAmountTitle}"` : ''}>${baseAmountText}</td>` : ''}
      <td>${statusCell}</td>
      <td>${actionCell}</td>
    </tr>`;
  }).join('')
  +`<tr style="background:var(--cream2);">
      <td colspan="5" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);text-align:right;padding-right:16px;">Outstanding</td>
      <td class="r" style="font-weight:700;color:var(--red);font-family:'DM Mono',monospace;">${fmt(total,cur)}</td>
      <td colspan="${window.IS_PUBLISHER ? 3 : 2}"></td>
    </tr>`;
}

// ── SPREADSHEET IMPORT
let _importRows = [];

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = ''; // reset so same file can be re-selected
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const book = getBook();

      const SHORT = {'Un Fantastico Altrove':'Altrove','The Hound':'Hound','Archaeology of Presence':'Archaeology','Sistema_non_autorizzato':'Sistema','As if Nobody is Watching':'Nobody','Collective Photobook':'Collective'};
      const shortName = SHORT[book.title] || book.title;
      // Try short name first, then full name, then first sheet
      let sheetName = wb.SheetNames.find(n => n === shortName + ' — Orders')
                   || wb.SheetNames.find(n => n === book.title + ' — Orders')
                   || wb.SheetNames.find(n => n.toLowerCase().includes(shortName.toLowerCase()))
                   || wb.SheetNames.find(n => n.toLowerCase().includes(book.title.toLowerCase().slice(0,6)))
                   || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) { showToast('No data found in spreadsheet', 'warn'); return; }

      // Flexible column mapping — handles variations in header names
      const colMap = (row) => {
        const k = (name) => {
          const keys = Object.keys(row);
          return keys.find(k => k.toLowerCase().replace(/[\s_#]/g,'').includes(name)) || '';
        };
        const num   = row[k('order')] || row[k('num')] || '';
        const date  = row[k('date')] || '';
        const chan   = row[k('channel')] || row[k('chan')] || 'Website';
        const qty   = parseFloat(row[k('qty')] || row[k('quantity')] || 1) || 1;
        const price = parseFloat(row[k('unit')] || row[k('price')] || 0) || 0;
        const notes = row[k('note')] || '';
        // Parse date — handle Excel date objects, strings, etc.
        let parsedDate = today();
        if (date instanceof Date) parsedDate = date.toISOString().split('T')[0];
        else if (typeof date === 'string' && date.trim()) {
          const d = new Date(date);
          if (!isNaN(d)) parsedDate = d.toISOString().split('T')[0];
        } else if (typeof date === 'number') {
          const d = XLSX.SSF.parse_date_code(date);
          parsedDate = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
        }
        return { num: String(num||'IMP-'+Date.now()), date: parsedDate, chan: String(chan), qty: Math.abs(Math.round(qty)), price, notes: String(notes) };
      };

      _importRows = rows.map(colMap).filter(r => r.qty > 0);

      if (!_importRows.length) { showToast('Could not parse any valid rows', 'warn'); return; }

      // Build preview
      $('import-summary').innerHTML = `Found <strong>${_importRows.length} orders</strong> in sheet <em>"${sheetName}"</em> — review below then confirm.`;
      $('import-count').textContent = _importRows.length;
      $('import-preview-body').innerHTML = _importRows.map(r => `
        <tr>
          <td class="mono">${r.num}</td>
          <td style="font-size:12px;color:var(--text3);">${fmtD(r.date)}</td>
          <td>${r.chan}</td>
          <td class="r">${r.qty}</td>
          <td class="r">${book.currency}${r.price.toFixed(2)}</td>
          <td class="r" style="font-weight:600;">${book.currency}${(r.qty*r.price).toFixed(2)}</td>
          <td style="font-size:11px;color:var(--text3);">${r.notes||'—'}</td>
          <td><span class="pill blue" style="font-size:10px;">New</span></td>
        </tr>`).join('');
      openM('import');
    } catch(err) {
      showToast('Could not read file: ' + err.message, 'err');
    }
  };
  reader.readAsArrayBuffer(file);
}

function confirmImport() {
  if (!_importRows.length) return;
  const s = getState(), book = getBook();
  const existingNums = new Set(s.hist.map(h => h.num));
  let imported = 0, skipped = 0;

  // Add in reverse so newest ends up at top after unshift
  [..._importRows].reverse().forEach(r => {
    if (existingNums.has(r.num)) { skipped++; return; } // skip duplicates
    s.stock = Math.max(0, s.stock - r.qty);
    s.sold += r.qty;
    s.revenue += r.qty * r.price;
    if (!s.chStats[r.chan]) s.chStats[r.chan] = { txns:0, units:0, revenue:0 };
    s.chStats[r.chan].txns++;
    s.chStats[r.chan].units += r.qty;
    s.chStats[r.chan].revenue += r.qty * r.price;
    s.hist.unshift({ num:r.num, chan:r.chan, qty:r.qty, price:r.price, after:s.stock, notes:r.notes, date:r.date });
    imported++;
  });

  saveState(activeBook);
  renderHist();
  updateDash();
  closeM('import');
  _importRows = [];
  const msg = skipped > 0
    ? `✓ Imported ${imported} orders (${skipped} duplicates skipped)`
    : `✓ Imported ${imported} orders`;
  showToast(msg);
}

function updateManualForm() {
  const book = getBook();
  if (!book) return;
  // Pre-fill price with the book's actual list price
  const priceEl = $('m-price');
  if (priceEl) priceEl.value = book.listPrice.toFixed(2);
  // Update book context bar
  const ctxTitle = $('bc-title-man');
  if (ctxTitle) ctxTitle.textContent = book.title;
  
  const gExpWrap = $('g-expense-wrap');
  if (gExpWrap) gExpWrap.style.display = isAuthor() ? 'none' : 'flex';
  
  phint();
}

function phint(){
  const book=getBook(),p=parseFloat($('m-price').value)||0,q=parseInt($('m-qty').value)||1,h=$('m-hint');
  let t = p * q;
  
  if (_manualFxRate) {
     calcFx(); // Update the inline converted value
     const convertedP = p * _manualFxRate;
     t = convertedP * q;
     h.className='hint-text';
     h.textContent=t>0 ? `Total revenue: ${fmt(t, book.currency)}` : '';
  } else if(p<book.listPrice){
     h.className='hint-text amber';
     h.textContent=`Discounted from ${book.currency}${book.listPrice} — total ${fmt(t,book.currency)}`;
  } else {
     h.className='hint-text';
     h.textContent=q>1?`Total ${fmt(t,book.currency)}`:'';
  }
}
async function submitManual(){
  const book=getBook(),qty=parseInt($('m-qty').value)||1;
  const rawPrice=parseFloat($('m-price').value)||book.listPrice;
  const num=$('m-num').value.trim()||'MAN-'+Date.now(),chan=$('m-chan').value,notes=$('m-notes').value.trim();
  const paymentType=$('m-payment-type').value;
  if(!paymentType){
    $('m-payment-type').style.borderColor='var(--red)';
    $('m-payment-type').focus();
    showToast('⚠ Please select a payment type','warn');
    return;
  }
  $('m-payment-type').style.borderColor='';
  
  let price = rawPrice;
  let fxNote = '';
  let payment = null;
  
  const cur = $('m-price-cur').value;
  const native = getBookCurrencyCode(book);
  const isForeignCurrency = cur !== 'BOOK' && cur !== native;

  if (isForeignCurrency) {
    if (!_manualFxRate) {
      showToast('⚠ Enter an exchange rate to convert this currency', 'warn');
      if ($('m-manual-rate')) $('m-manual-rate').focus();
      return;
    }
    price = rawPrice * _manualFxRate;
    fxNote = `Paid ${cur} ${rawPrice.toFixed(2)} @ ${_manualFxRate.toFixed(4)}`;
    payment = buildPaymentMeta({ book, qty, unitPrice: price, fxEnabled: true, fxCur: cur, fxAmt: rawPrice, fxRate: _manualFxRate });
  } else {
    payment = buildPaymentMeta({ book, qty, unitPrice: price });
  }

  const fullNotes=[notes,fxNote,paymentType].filter(Boolean).join(' · ');

  // Create standard entry payload
  // paymentType stored on the payload so it can be detected in renderArtistTransfers / updateDash
  const entryPayload = { num, chan, qty, price, notes: fullNotes, payment, paymentType, date: today(), id: Date.now() };

  if (isAuthor()) {
    // Author queue route
    try {
      await window._fbSubmitActivity(activeBook, 'sales', entryPayload);
      addLog('log-manual',`${num}: -${qty} @ ${fmt(price,book.currency)} — (Submitted)`,'warn');
      const isArtistPayment = paymentType === 'Payment directly to artist';
      const notifyKind = isArtistPayment ? 'Artist Payment Approval' : 'Sale';
      const baseSummary = `${num}: -${qty} @ ${fmt(price,book.currency)}${paymentType ? ' · ' + paymentType : ''}`;
      const notifySummary = isArtistPayment
        ? `ACTION REQUIRED — artist payment of ${fmt(qty*price,book.currency)} awaiting your approval. ${baseSummary}`
        : baseSummary;
      notifyPublisherSubmission(notifyKind, entryPayload, notifySummary);

      if (isArtistPayment) {
        showToast('⏳ Order submitted — you will owe a transfer to the publisher upon approval', 'warn');
      } else {
        showToast('✓ Order submitted for approval');
      }
      
      // Update UI so the "Amount Owed" banner updates immediately
      updateDash();

    } catch (e) {
      console.error("Submission error:", e);
      if (e.message && e.message.includes('PERMISSION_DENIED')) {
        showToast('⚠ Permission denied by Firestore Rules', 'err');
      } else {
        showToast('⚠ Failed to submit order', 'err');
      }
    }
  } else {
    // Publisher direct route
    if(paymentType==='Payment directly to artist'){
      recordOrderPendingTransfer(num,chan,qty,price,fullNotes,payment);
      addLog('log-manual',`${num}: -${qty} @ ${fmt(price,book.currency)} — ⏳ awaiting artist transfer`,'warn');
      showToast('⏳ Order logged — awaiting artist transfer to publisher');
    } else {
      recordOrder(num,chan,qty,price,fullNotes,payment);
      addLog('log-manual',`${num}: -${qty} @ ${fmt(price,book.currency)}${fxNote?' ('+fxNote+')':''} → ${getState().stock} remaining`,'ok');
      if(getState().stock<=book.threshold)addLog('log-manual','⚠ Below threshold!','warn');
      showToast('✓ Order saved · syncing to Sheets…');
    }
  }

  $('m-num').value='';$('m-qty').value='1';
  $('m-price').value=book.listPrice.toFixed(2);
  $('m-notes').value='';$('m-payment-type').value='';$('m-hint').textContent='';
  $('m-price-cur').value='BOOK';
  onManualCurrencyChange(); // reset fx logic
}

window.approveSubmission = async function(type, subKey) {
  const queue = window.authorSubmissions[activeBook]?.[type] || {};
  if (!queue[subKey]) return;
  const raw = JSON.parse(queue[subKey].data);
  const s = getState();
  
  if (type === 'expenses') {
    if (!s.expenses) s.expenses = [];

    s.expenses.unshift(raw);
    saveState(activeBook);
    await window._fbDeleteSubmission(activeBook, type, subKey);
    showToast('✓ Expense approved and added to ledger');
    updateDash();
    switchTab('dashboard');
    setTimeout(() => {
      const expBanner = $('d-expenses-sect');
      if (expBanner) expBanner.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  } else if (type === 'sales') {
    let pendingTransfer = false;
    if(raw.payment?.type==='Payment directly to artist'){
      recordOrderPendingTransfer(raw.num,raw.chan,raw.qty,raw.price,raw.notes,raw.payment);
      pendingTransfer = true;
    } else {
      recordOrder(raw.num,raw.chan,raw.qty,raw.price,raw.notes,raw.payment);
    }
    await window._fbDeleteSubmission(activeBook, type, subKey);
    showToast('✓ Sale approved and added to ledger');
    updateDash();
    if (pendingTransfer) {
      switchTab('dashboard');
      setTimeout(() => {
        const transSect = $('artist-transfers-sect');
        if (transSect) transSect.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      renderHist();
    }
  }
}

window.rejectSubmission = async function(type, subKey) {
  if (!confirm('Reject this submission from the author?')) return;
  await window._fbDeleteSubmission(activeBook, type, subKey);
  showToast('Submission removed', 'warn');
  if (activeBook === 'all') updateAllOverview();
  else { updateDash(); renderHist(); renderExpenses(); }
}

function recordOrderPendingTransfer(num,chan,qty,price,notes,payment=null){
  const s=getState(),book=getBook();
  // Reduce stock and count as sold, but do NOT add to revenue yet
  s.stock=Math.max(0,s.stock-qty);
  s.sold+=qty;
  if(!s.chStats[chan])s.chStats[chan]={txns:0,units:0,revenue:0};
  s.chStats[chan].txns++;s.chStats[chan].units+=qty;
  // Add to history with pending flag
  const sheetsId = makeEventId();
  s.hist.unshift({num,chan,qty,price,after:s.stock,notes:notes||'',date:today(),artistPending:true,payment,sheetsId});
  // Add to artistTransfers queue (share sheetsId so receipt updates the same sheet row)
  s.artistTransfers.push({id:Date.now(),num,chan,qty,price,total:qty*price,notes:notes||'',date:today(),payment,sheetsId});
  renderHist();updateDash();saveState(activeBook);
  const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  const totalNative = qty * price;
  let cadEquiv = '';
  if (nativeCur === 'CAD') cadEquiv = totalNative;
  else if (payment && payment.currency === 'CAD' && payment.amount) cadEquiv = payment.amount;
  syncToSheets({
    type:'order',book:book.title,date:today(),num,chan,qty,price,total:totalNative,stockAfter:s.stock,notes:(notes||'')+' [PENDING ARTIST TRANSFER]',
    sheetsId,
    currency: nativeCur,
    paymentCurrency: normalizeCurrencyCode(payment?.currency || nativeCur, 'CAD'),
    paymentAmount: payment?.amount ?? totalNative,
    paymentRate: payment?.rate ?? '',
    convertedTotal: cadEquiv
  });
}

function markArtistTransferReceived(transferId){
  const s=getState(),book=getBook();
  const t=s.artistTransfers.find(x=>x.id===transferId);
  if(!t)return;
  // Now credit the revenue
  s.revenue+=t.total;
  if(!s.chStats[t.chan])s.chStats[t.chan]={txns:0,units:0,revenue:0};
  s.chStats[t.chan].revenue+=t.total;
  // Mark history entry as resolved
  const h=s.hist.find(x=>x.num===t.num&&x.artistPending);
  if(h){h.artistPending=false;h.notes=(h.notes?h.notes+' · ':'')+'Transfer received';}
  // Remove from pending queue
  s.artistTransfers=s.artistTransfers.filter(x=>x.id!==transferId);
  renderHist();updateDash();renderArtistTransfers();saveState(activeBook);
  const nativeCurT = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  let cadEquivT = '';
  if (nativeCurT === 'CAD') cadEquivT = t.total;
  else if (t.payment && t.payment.currency === 'CAD' && t.payment.amount) cadEquivT = t.payment.amount;
  syncToSheets({
    type:'order',book:book.title,date:today(),num:t.num,chan:t.chan,qty:t.qty,price:t.price,total:t.total,stockAfter:s.stock,notes:(t.notes||'')+' [ARTIST TRANSFER RECEIVED]',
    sheetsId: t.sheetsId || (h && h.sheetsId) || '',
    currency: nativeCurT,
    paymentCurrency: normalizeCurrencyCode(t.payment?.currency || nativeCurT, 'CAD'),
    paymentAmount: t.payment?.amount ?? t.total,
    paymentRate: t.payment?.rate ?? '',
    convertedTotal: cadEquivT
  });
  showToast(`✓ Transfer received — ${fmt(t.total,book.currency)} added to revenue`);
}

function renderArtistTransfers(){
  const s=getState(),book=getBook(),cur=book.currency;
  let transfers = [...(s.artistTransfers || [])].map(t => ({ ...t, status: 'approved' }));
  const payLink=book.paymentLink||'';

  // Merge in pending author submissions for BOTH author and publisher views
  const pbSales = window.authorSubmissions[activeBook]?.sales || {};
  Object.keys(pbSales).forEach(k => {
    const raw = (typeof pbSales[k].data === 'string') ? JSON.parse(pbSales[k].data) : pbSales[k].data;
    // Check paymentType field (set on payload) OR fallback to notes containing the text
    const isDirectToArtist = raw.paymentType === 'Payment directly to artist'
      || (raw.notes || '').includes('Payment directly to artist');
    if (isDirectToArtist) {
      transfers.push({
        ...raw,
        total: (raw.qty || 0) * (raw.price || 0),
        status: 'pending' // Flagged as pending approval
      });
    }
  });

  // ── AUTHOR BANNER
  const banner=$('author-payment-banner');
  if(banner){
    if(isAuthor() && transfers.length>0){
      const totalOwed=transfers.reduce((a,t)=>a+t.total,0);
      banner.style.display='';
      $('apb-amount').textContent=fmt(totalOwed,cur);
      $('apb-detail').textContent=`${transfers.length} transfer${transfers.length>1?'s':''} from sales collected on your end (incl. pending)`;
      const btn=$('apb-pay-btn');
      if(payLink){
        const fullLink = payLink.startsWith('http') ? payLink : 'https://'+payLink;
        btn.href=fullLink;
        btn.textContent='Send payment →';
        $('apb-link-hint').textContent='Opens payment link in a new tab';
      } else {
        btn.href='#';
        btn.onclick=e=>{e.preventDefault();};
        btn.textContent='Contact publisher';
        $('apb-link-hint').textContent='Payment link not set — contact your publisher';
      }
      $('apb-transfers').innerHTML=transfers.map(t=>`
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap; opacity: ${t.status==='pending'?'.6': '1'}">
          <div style="font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,.35);">
            ${t.num} · ${fmtD(t.date)} · ${t.qty}× ${t.status==='pending'?' (Pending Approval)':''}
          </div>
          <div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--gold2);font-weight:500;">${fmt(t.total,cur)}</div>
        </div>`).join('');
    } else {
      banner.style.display='none';
    }
  }

  // ── PUBLISHER PANEL
  const sect=$('artist-transfers-sect'),list=$('artist-transfers-list');
  if(!sect)return;
  if(!transfers.length){sect.style.display='none';return;}
  sect.style.display='';
  const fullPayLink = payLink.startsWith('http') ? payLink : payLink ? 'https://'+payLink : '';
  const payHtml = fullPayLink
    ? `<a href="${fullPayLink}" target="_blank" class="btn sm" style="text-decoration:none;background:var(--green-bg);color:var(--green);border-color:rgba(42,99,72,.2);">↗ Payment link</a>`
    : `<span style="font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;">No payment link set</span>`;
  
  list.innerHTML=transfers.map(t=>`
    <div style="background:white;border:1px solid var(--border);border-left:3px solid var(--amber);border-radius:var(--r2);padding:1rem 1.25rem;margin-bottom:10px;box-shadow:var(--shadow);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;opacity: ${t.status==='pending'?'.6':'1'};">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span class="pill amber">⏳ Awaiting transfer</span>
          <span style="font-family:'DM Mono',monospace;font-size:13px;font-weight:600;">${t.num}</span>
          ${t.status === 'pending' ? `<span class="pill gray" style="font-size:10px;">Pending Approval</span>` : ''}
        </div>
        <div style="font-size:12px;color:var(--text3);">${fmtD(t.date)} · ${t.chan} · ${t.qty}× · <strong style="color:var(--amber);">${fmt(t.total,cur)} held</strong></div>
        <div style="font-size:11px;color:var(--text4);margin-top:3px;">${t.notes||'—'}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        ${payHtml}
        ${t.status === 'pending' 
          ? `<button class="btn sm outline" disabled>Approve sale first</button>`
          : `<button class="btn gold" onclick="markArtistTransferReceived(${t.id})">✓ Mark transfer received</button>`}
      </div>
    </div>`).join('');
}

function markExpenseReceived(id){
  const s=getState(),book=getBook(),cur=book.currency;
  const e=s.expenses.find(x=>x.id===id);
  if(!e) return;
  e.received=true;
  e.receivedDate=today();
  saveState(activeBook);
  renderPendingExpenses(); renderExpenses(); updateDash();
  showToast(`✓ Expense marked as received — ${fmt(e.amount,cur)}`);
}

function renderPendingExpenses(){
  const s=getState(),book=getBook(),cur=book.currency;
  const pending=(s.expenses||[]).filter(e=>!e.received);
  const sect=$('d-pending-expenses-sect'),list=$('d-pending-expenses-list');
  if(!sect) return;
  if(!pending.length){sect.style.display='none';return;}
  sect.style.display='';
  const artistLink=(s.artistPaymentLink||'').trim();
  const fullLink=artistLink?(artistLink.startsWith('http')?artistLink:'https://'+artistLink):'';
  const payHtml=fullLink
    ?`<a href="${fullLink}" target="_blank" class="btn sm" style="text-decoration:none;background:var(--green-bg);color:var(--green);border-color:rgba(42,99,72,.2);">↗ Payment link</a>`
    :`<span style="font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;">No payment link set</span>`;
  list.innerHTML=pending.map(e=>`
    <div style="background:white;border:1px solid var(--border);border-left:3px solid var(--amber);border-radius:var(--r2);padding:1rem 1.25rem;margin-bottom:10px;box-shadow:var(--shadow);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span class="pill amber">⏳ Awaiting payment</span>
          <span style="font-family:'DM Mono',monospace;font-size:13px;font-weight:600;">${fmt(e.amount,cur)}</span>
        </div>
        <div style="font-size:12px;color:var(--text3);">${fmtD(e.date)} · <span style="background:var(--cream3);padding:1px 7px;border-radius:100px;font-size:10px;">${e.cat}</span> · <strong style="color:var(--text2);">${e.desc}</strong></div>
        <div style="font-size:11px;color:var(--text4);margin-top:3px;">${e.ref||''}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        ${payHtml}
        <button class="btn gold" onclick="markExpenseReceived(${e.id})">✓ Mark received</button>
      </div>
    </div>`).join('');
}


window.toggleGratuityExpense = function() {
  const cb = $('g-expense-cb');
  const fields = $('g-expense-fields');
  if (cb.checked) {
    fields.style.display = 'grid';
    const book = getBook();
    const unitCost = (book.productionCost || 0) / (book.maxPrint || 1);
    $('g-exp-val').value = unitCost.toFixed(2);
    updateGratuityExpenseHint();
  } else {
    fields.style.display = 'none';
  }
}

window.updateGratuityExpenseHint = function() {
  const qty = parseInt($('g-qty').value) || 1;
  const val = parseFloat($('g-exp-val').value) || 0;
  const book = getBook();
  $('g-exp-total').textContent = fmt(qty * val, book.currency);
}

function submitGratuity(){
  const book=getBook(),qty=parseInt($('g-qty').value)||1,ref=$('g-ref').value.trim(),notes=$('g-notes').value.trim(),date=$('g-date').value||today();
  const expenseIt = $('g-expense-cb') && $('g-expense-cb').checked;
  let expVal = 0;
  if (expenseIt) expVal = parseFloat($('g-exp-val').value) || 0;

  const s=getState();
  if(qty>s.stock){showToast('⚠ Not enough stock on hand','warn');return;}
  const num='GRAT-'+Date.now().toString().slice(-6);
  // Reduce stock only — no revenue, no sold count
  s.stock=Math.max(0,s.stock-qty);
  if(!s.chStats['Gratuity'])s.chStats['Gratuity']={txns:0,units:0,revenue:0};
  s.chStats['Gratuity'].txns++;s.chStats['Gratuity'].units+=qty;
  const sheetsId = makeEventId();
  s.hist.unshift({num,chan:'Gratuity',qty,price:0,after:s.stock,notes:(ref?(ref+(notes?' · '+notes:'')):notes)||'',date,gratuity:true,sheetsId});
  
  if(expenseIt && expVal > 0) {
    if(!s.expenses) s.expenses = [];
    const totalExp = qty * expVal;
    
    const currency = getBookCurrencyCode(book);
    const cadRate = currency !== 'CAD' ? (_fxRateCache[`${currency}_CAD`] || null) : 1;
    const baseAmount = cadRate ? (totalExp * cadRate) : totalExp;

    s.expenses.unshift({
      id: Date.now(),
      desc: `Gratuity: ${ref || notes || 'Gifted copy'}`,
      cat: 'Marketing',
      amount: totalExp,
      currency: currency,
      origAmount: totalExp,
      origCurrency: currency,
      baseAmount: baseAmount,
      date: date,
      ref: num,
      received: false
    });
  }

  renderHist();
  if(expenseIt) renderExpenses();
  updateDash();saveState(activeBook);
  syncToSheets({type:'order',book:book.title,date,num,chan:'Gratuity',qty,price:0,total:0,stockAfter:s.stock,notes:(ref?ref+' · ':'')+notes,sheetsId,currency:getBookCurrencyCode(book)});
  addLog('log-gratuity',`${num}: ${qty} gifted → ${s.stock} remaining`,'ok');
  if(s.stock<=book.threshold)addLog('log-gratuity','⚠ Below threshold!','warn');
  $('g-ref').value='';$('g-qty').value='1';$('g-notes').value='';$('g-date').value=today();
  if($('g-expense-cb')) {
    $('g-expense-cb').checked=false;
    toggleGratuityExpense();
  }
  showToast('✓ Gratuity logged' + (expenseIt && expVal > 0 ? ' and expensed' : ''));
}

window.backfillGratuityExpenses = function() {
  const book = getBook();
  const s = getState();
  if (!s.hist) return;
  if (!s.expenses) s.expenses = [];
  
  const unitCost = (book.productionCost || 0) / (book.maxPrint || 1);
  if (unitCost <= 0) {
    showToast('⚠ Book has no production cost to expense', 'warn');
    return;
  }

  let added = 0;
  let patched = 0;
  // find all gratuities in history
  const gratuities = s.hist.filter(h => h.gratuity && !h.voided);
  
  gratuities.forEach(h => {
    const existing = s.expenses.find(e => e.ref === h.num || (e.date === h.date && e.desc.includes(h.notes || 'Gifted')));
    const amount = h.qty * unitCost;
    const currency = getBookCurrencyCode(book);
    const cadRate = currency !== 'CAD' ? (_fxRateCache[`${currency}_CAD`] || null) : 1;
    const baseAmount = cadRate ? (amount * cadRate) : amount;

    if (existing) {
      if (!existing.currency) {
        existing.currency = currency;
        existing.origAmount = amount;
        existing.origCurrency = currency;
        existing.baseAmount = baseAmount;
        patched++;
      }
    } else {
      s.expenses.push({
        id: Date.now() + Math.floor(Math.random() * 1000) + added,
        desc: `Gratuity: ${h.notes || 'Gifted copy'}`,
        cat: 'Marketing',
        amount: amount,
        currency: currency,
        origAmount: amount,
        origCurrency: currency,
        baseAmount: baseAmount,
        date: h.date,
        ref: h.num,
        received: false
      });
      added++;
    }
  });

  if (added > 0 || patched > 0) {
    // sort expenses to keep newest first
    s.expenses.sort((a,b) => b.id - a.id);
    renderExpenses();
    updateDash();
    saveState(activeBook);
    if(typeof renderTaxCenter === 'function') renderTaxCenter();
    showToast(`✓ Backfilled ${added} and fixed ${patched} past gratuity expenses`);
  } else {
    showToast('All past gratuities are already accounted for properly');
  }
}

function storeById(id){return getState().stores.find(s=>s.id===id);}
function addStore(){
  const name=$('ns-name').value.trim();if(!name)return;
  getState().stores.push({id:Date.now(),name,contact:$('ns-contact').value.trim(),email:$('ns-email').value.trim(),city:$('ns-city').value.trim(),rate:parseFloat($('ns-rate').value)||40,notes:$('ns-notes').value.trim(),sent:0,sold:0,returned:0,outstanding:0,amountOwed:0});
  closeM('add-store');['ns-name','ns-contact','ns-email','ns-city','ns-notes'].forEach(id=>$(id).value='');$('ns-rate').value='40';renderStores();updateDash();saveState(activeBook);showToast('✓ Store added');
}
function renderStores(){
  const s=getState(),el=$('stores-list'),book=getBook(),cur=book.currency;
  if(!s.stores.length){el.innerHTML='<div class="empty-state"><div class="e-icon">🏪</div>No stores yet. Add your first consignment account.</div>';return;}
  el.innerHTML=s.stores.map(st=>{
    const sp=st.outstanding===0&&st.sent>0?'<span class="pill gray">Settled</span>':st.amountOwed>0?'<span class="pill amber">Payment due</span>':'<span class="pill green">Active</span>';
    return`<div class="store-card"><div class="store-head"><div><div class="store-name">${st.name}</div><div class="store-meta">${[st.city,st.contact,st.email].filter(Boolean).join(' · ')} · ${st.rate}% commission</div></div>${sp}</div><div class="store-kpis"><div class="sk"><div class="sk-l">Sent</div><div class="sk-v">${st.sent}</div></div><div class="sk"><div class="sk-l">Sold</div><div class="sk-v">${st.sold}</div></div><div class="sk"><div class="sk-l">Outstanding</div><div class="sk-v ${st.outstanding>0?'warn':''}">${st.outstanding}</div></div><div class="sk"><div class="sk-l">Owed</div><div class="sk-v ${st.amountOwed>0?'warn':''}">${st.amountOwed>0?fmt(st.amountOwed,cur):'—'}</div></div></div><div class="store-actions"><button class="btn sm gold" onclick="openSend(${st.id})">Send books</button><button class="btn sm ink" onclick="openSale(${st.id})" ${!st.outstanding?'disabled':''}>Record sale</button><button class="btn sm" onclick="openRet(${st.id})" ${!st.outstanding?'disabled':''}>Return</button><button class="btn sm danger-btn" onclick="removeStore(${st.id})">Remove</button></div></div>`;
  }).join('');
}
function removeStore(id){if(!confirm('Remove store?'))return;getState().stores=getState().stores.filter(s=>s.id!==id);renderStores();updateDash();saveState(activeBook);}
function openSend(id){activeId=id;const st=storeById(id);$('send-sname').textContent=st.name;$('send-rate').value=st.rate;openM('send-books');}
function confirmSend(){
  const s=getState(),book=getBook(),st=storeById(activeId),qty=parseInt($('send-qty').value)||0,date=$('send-date').value,rate=parseFloat($('send-rate').value)||st.rate,notes=$('send-notes').value.trim();
  if(qty>s.stock){alert('Not enough stock on hand!');return;}
  s.stock-=qty;st.sent+=qty;st.outstanding+=qty;
  const sheetsId = makeEventId();
  s.ledger.push({id:Date.now(),storeId:st.id,storeName:st.name,type:'Shipment',date,qty,rate,amountDue:0,paid:'n/a',notes,status:'sent',sheetsId});
  closeM('send-books');renderStores();renderLedger();updateDash();saveState(activeBook);
  syncToSheets({type:'consignment',book:book.title,date,store:st.name,event:'Shipment',qty,rate,amountDue:0,notes,status:'sent',sheetsId,currency:getBookCurrencyCode(book)});
  showToast(`✓ ${qty} books sent to ${st.name}`);
}
function openSale(id){activeId=id;const book=getBook();$('sale-sym').textContent=book.currency;$('sale-price').value=book.listPrice.toFixed(2);$('sale-sname').textContent=storeById(id).name;openM('record-sale');}
function confirmSale(){
  const s=getState(),book=getBook(),cur=book.currency,st=storeById(activeId),qty=parseInt($('sale-qty').value)||0,date=$('sale-date').value,price=parseFloat($('sale-price').value)||book.listPrice,paid=$('sale-paid').value,notes=$('sale-notes').value.trim();
  if(qty>st.outstanding){alert('Qty exceeds outstanding books.');return;}
  const gross=qty*price,pub=gross*(1-st.rate/100);
  st.sold+=qty;st.outstanding-=qty;st.amountOwed+=paid==='pending'?pub:0;
  s.sold+=qty;s.revenue+=pub;
  if(!s.chStats['Consignment'])s.chStats['Consignment']={txns:0,units:0,revenue:0};
  s.chStats['Consignment'].txns++;s.chStats['Consignment'].units+=qty;s.chStats['Consignment'].revenue+=pub;
  const num='CON-'+st.name.replace(/\s+/g,'').slice(0,5).toUpperCase()+'-'+Date.now().toString().slice(-4);
  // Share one sheetsId between the hist mirror and the ledger entry so they
  // map to the SAME row in Sheets — editing or voiding either updates the
  // single underlying row instead of producing duplicates.
  const sheetsId = makeEventId();
  s.hist.unshift({num,chan:'Consignment',qty,price:pub/qty,after:s.stock,notes:st.name,date,sheetsId,consignmentLink:true});
  s.ledger.push({id:Date.now(),storeId:st.id,storeName:st.name,type:'Sale',date,qty,rate:st.rate,amountDue:pub,paid,notes,status:paid,sheetsId});
  closeM('record-sale');renderStores();renderLedger();renderHist();updateDash();saveState(activeBook);
  syncToSheets({type:'consignment',book:book.title,date,store:st.name,event:'Sale',qty,rate:st.rate,amountDue:pub,notes,status:paid,sheetsId,currency:getBookCurrencyCode(book)});
  showToast(`✓ Sale recorded — ${fmt(pub,cur)} due to you`);
}
function openRet(id){activeId=id;$('ret-sname').textContent=storeById(id).name;openM('return');}
function confirmReturn(){
  const s=getState(),book=getBook(),st=storeById(activeId),qty=parseInt($('ret-qty').value)||0,date=$('ret-date').value,cond=$('ret-cond').value,notes=$('ret-notes').value.trim();
  if(qty>st.outstanding){alert('Qty exceeds outstanding.');return;}
  st.returned+=qty;st.outstanding-=qty;const good=cond.startsWith('Good');if(good)s.stock+=qty;
  const sheetsId = makeEventId();
  s.ledger.push({id:Date.now(),storeId:st.id,storeName:st.name,type:'Return',date,qty,rate:st.rate,amountDue:0,paid:'n/a',notes:(notes?notes+' · ':'')+cond,status:good?'restocked':'written off',sheetsId});
  closeM('return');renderStores();renderLedger();updateDash();saveState(activeBook);
  syncToSheets({type:'consignment',book:book.title,date,store:st.name,event:'Return',qty,rate:st.rate,amountDue:0,notes:cond,status:good?'restocked':'written off',sheetsId,currency:getBookCurrencyCode(book)});
  showToast(good?`✓ ${qty} books returned to stock`:`✓ ${qty} books written off`);
}
function markPaid(lid){
  const s=getState(),book=getBook(),e=s.ledger.find(x=>x.id===lid);if(!e)return;
  const st=storeById(e.storeId);if(st)st.amountOwed=Math.max(0,st.amountOwed-e.amountDue);
  e.paid='paid';e.status='paid';renderLedger();renderStores();updateDash();saveState(activeBook);
  showToast(`✓ Payment of ${fmt(e.amountDue,book.currency)} marked as received`);
}
function renderLedger(){
  const s=getState(),book=getBook(),cur=book.currency,b=$('ledger-body');
  if(!s.ledger.length){b.innerHTML='<tr><td colspan="8"><div class="empty-state" style="padding:1rem;">No entries.</div></td></tr>';return;}
  const pill=e=>{
    if(e.voided)return'<span class="void-badge">Void</span>';
    if(e.type==='Shipment')return'<span class="pill blue">Sent</span>';
    if(e.status==='paid')return'<span class="pill green">Paid</span>';
    if(e.status==='pending')return'<span class="pill amber">Pending</span>';
    if(e.status==='restocked')return'<span class="pill green">Restocked</span>';
    if(e.status==='written off')return'<span class="pill red">Written off</span>';
    return`<span class="pill gray">${e.status}</span>`;
  };
  // Map ledger indices so edit buttons can reference them correctly (ledger is displayed reversed)
  const indexed = s.ledger.map((e,i)=>({e,i}));
  b.innerHTML=[...indexed].reverse().map(({e,i})=>{
    const voided = e.voided?' voided':'';
    const editBtn = `<button class="edit-btn" onclick="openEditLedger(${i})" title="Edit entry">✎</button>`;
    return`<tr class="${voided}"><td style="font-size:12px;color:var(--text3);">${fmtD(e.date)}</td><td style="font-weight:600;">${e.storeName}${editBtn}</td><td>${e.type}</td><td class="r">${e.qty}</td><td class="r">${e.type==='Sale'?e.rate+'%':'—'}</td><td class="r" style="font-weight:600;">${e.amountDue>0?fmt(e.amountDue,cur):'—'}</td><td style="font-size:12px;color:var(--text3);">${e.notes||'—'}</td><td>${pill(e)}${e.status==='pending'&&!e.voided?` <button class="btn sm" style="margin-left:6px;" onclick="markPaid(${e.id})">Mark paid</button>`:''}</td></tr>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════
//  INVOICES (publisher-only, lives inside Consignment tab)
// ═══════════════════════════════════════════════════════════════════════
const INVOICE_SETTINGS_KEY = 'lm-invoice-settings';
function getInvoiceSettings(){
  try { return JSON.parse(localStorage.getItem(INVOICE_SETTINGS_KEY) || '{}'); }
  catch(e){ return {}; }
}
function saveInvoiceSettingsObj(o){ localStorage.setItem(INVOICE_SETTINGS_KEY, JSON.stringify(o||{})); }

function openInvoiceTemplateSettings(){
  const s = getInvoiceSettings();
  $('ivs-name').value  = s.name  || 'Lyricalmyrical Books';
  $('ivs-email').value = s.email || '';
  $('ivs-addr').value  = s.addr  || '';
  $('ivs-vat').value   = s.vat   || '';
  $('ivs-web').value   = s.web   || '';
  $('ivs-terms').value = s.terms || 'Net 30. Payment via Stripe, PayPal, or bank transfer.';
  $('ivs-footer').value= s.footer|| 'Thank you for stocking our books.';
  $('ivs-bank').value  = s.bank  || '';
  if ($('ivs-stripe-key'))  $('ivs-stripe-key').value  = s.stripeKey || '';
  if ($('ivs-stripe-auto')) $('ivs-stripe-auto').checked = s.stripeAuto !== false; // default ON
  if ($('ivs-stripe-test')) $('ivs-stripe-test').checked = !!s.stripeTest;
  openM('invoice-settings');
}
function saveInvoiceSettings(){
  saveInvoiceSettingsObj({
    name:  $('ivs-name').value.trim(),
    email: $('ivs-email').value.trim(),
    addr:  $('ivs-addr').value.trim(),
    vat:   $('ivs-vat').value.trim(),
    web:   $('ivs-web').value.trim(),
    terms: $('ivs-terms').value.trim(),
    footer:$('ivs-footer').value.trim(),
    bank:  $('ivs-bank').value.trim(),
    stripeKey:  $('ivs-stripe-key')  ? $('ivs-stripe-key').value.trim() : '',
    stripeAuto: $('ivs-stripe-auto') ? !!$('ivs-stripe-auto').checked : true,
    stripeTest: $('ivs-stripe-test') ? !!$('ivs-stripe-test').checked : false,
  });
  closeM('invoice-settings');
  showToast('✓ Invoice settings saved');
}

// ── STRIPE DYNAMIC PAYMENT LINK (exact-amount Checkout per invoice) ─────
const _STRIPE_ZERO_DECIMAL_INV = new Set(['BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF']);

async function createStripePaymentLinkForInvoice(invoice){
  const settings = getInvoiceSettings();
  const key = (settings.stripeKey || '').trim();
  if (!key) throw new Error('Stripe key not set — open Invoice Settings to add one');
  if (!/^(rk|sk)_/.test(key)) throw new Error("That doesn't look like a Stripe restricted/secret key (expected rk_… or sk_…)");

  const book = BOOKS[activeBook] || getBook();
  // prefer the stored ISO code; fall back to symbol→code lookup
  const curCode = (invoice.currencyCode || getBookCurrencyCode({ currency: invoice.currency || book.currency }) || 'EUR').toLowerCase();
  const isZeroDec = _STRIPE_ZERO_DECIMAL_INV.has(curCode.toUpperCase());
  const total = Number(invoice.total || 0);
  const amount = isZeroDec ? Math.round(total) : Math.round(total * 100);
  if (amount < 50 && !isZeroDec) throw new Error('Amount too small for Stripe (minimum 0.50)');
  if (amount < 1) throw new Error('Amount must be greater than zero');

  const description = `${invoice.num} — ${invoice.storeName || 'Consignment store'} (${book.title || 'Book'})`;

  // 1. Create a Price (with inline product_data — Stripe creates the product on the fly)
  const priceParams = new URLSearchParams();
  priceParams.set('unit_amount', String(amount));
  priceParams.set('currency', curCode);
  priceParams.set('product_data[name]', description.slice(0, 250));
  priceParams.set('nickname', invoice.num);
  // attach metadata to the price so it shows up in the Stripe dashboard
  priceParams.set('metadata[invoice_num]', invoice.num || '');
  priceParams.set('metadata[store_name]', invoice.storeName || '');
  priceParams.set('metadata[book_id]',   book.id || '');

  const priceRes = await fetch('https://api.stripe.com/v1/prices', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: priceParams.toString(),
  });
  if (!priceRes.ok){
    const err = await priceRes.json().catch(()=>({}));
    throw new Error('Stripe price: ' + (err.error?.message || ('HTTP ' + priceRes.status)));
  }
  const price = await priceRes.json();

  // 2. Create the Payment Link
  const linkParams = new URLSearchParams();
  linkParams.set('line_items[0][price]', price.id);
  linkParams.set('line_items[0][quantity]', '1');
  linkParams.set('metadata[invoice_num]', invoice.num || '');
  linkParams.set('metadata[store_id]',   String(invoice.storeId || ''));
  linkParams.set('metadata[store_name]', invoice.storeName || '');
  linkParams.set('metadata[book_id]',    book.id || '');
  linkParams.set('payment_intent_data[description]', description.slice(0, 350));
  linkParams.set('payment_intent_data[metadata][invoice_num]', invoice.num || '');
  linkParams.set('payment_intent_data[metadata][store_name]', invoice.storeName || '');
  linkParams.set('payment_intent_data[statement_descriptor_suffix]', (invoice.num || 'Invoice').replace(/[^A-Za-z0-9\- ]/g,'').slice(0, 22));
  linkParams.set('allow_promotion_codes', 'false');
  linkParams.set('billing_address_collection', 'auto');

  const linkRes = await fetch('https://api.stripe.com/v1/payment_links', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: linkParams.toString(),
  });
  if (!linkRes.ok){
    const err = await linkRes.json().catch(()=>({}));
    throw new Error('Stripe payment link: ' + (err.error?.message || ('HTTP ' + linkRes.status)));
  }
  const link = await linkRes.json();

  return {
    url: link.url,
    paymentLinkId: link.id,
    priceId: price.id,
    amount, currency: curCode,
    livemode: !!link.livemode,
    createdAt: Date.now(),
  };
}

async function deactivateStripePaymentLink(paymentLinkId){
  const key = (getInvoiceSettings().stripeKey || '').trim();
  if (!key || !paymentLinkId) return;
  try {
    const params = new URLSearchParams();
    params.set('active', 'false');
    await fetch(`https://api.stripe.com/v1/payment_links/${encodeURIComponent(paymentLinkId)}`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  } catch(e){ /* best effort */ }
}

function invoicesVisibleHere(){
  // Publisher only, single-book view only (invoice numbering is per-book)
  return !!window.IS_PUBLISHER && !isAuthor() && activeBook && activeBook !== 'all';
}

function renderInvoices(){
  const section = $('invoices-section');
  if (!section) return;
  if (!invoicesVisibleHere()) { section.style.display = 'none'; return; }
  section.style.display = '';

  const s = getState(), book = getBook(), cur = book.currency, list = $('invoices-list'), summary = $('inv-summary');
  const invs = (s.invoices || []).slice().sort((a,b)=> (b.date||'').localeCompare(a.date||'') || (b.createdAt||0) - (a.createdAt||0));

  // Mark overdue automatically (visual only, not persisted)
  const todayStr = today();
  for (const inv of invs) {
    if (inv.status === 'sent' && inv.dueDate && inv.dueDate < todayStr) inv._overdue = true;
  }

  // Summary line
  const outstanding = invs.filter(i => i.status === 'sent').reduce((a,i)=> a + (i.total || 0), 0);
  const paid       = invs.filter(i => i.status === 'paid').reduce((a,i)=> a + (i.total || 0), 0);
  const drafts     = invs.filter(i => i.status === 'draft').length;
  summary.textContent = `${invs.length} total · ${fmt(outstanding, cur)} outstanding · ${fmt(paid, cur)} collected${drafts?` · ${drafts} draft${drafts>1?'s':''}`:''}`;

  if (!invs.length){
    list.innerHTML = '<div class="empty-state"><div class="e-icon">📄</div>No invoices yet. Click <strong>+ New invoice</strong> to bill a consignment store.</div>';
    return;
  }

  list.innerHTML = invs.map(inv => {
    const statusLabel = inv._overdue ? 'OVERDUE' : (inv.status||'draft').toUpperCase();
    const statusCls   = inv._overdue ? 'overdue' : (inv.status||'draft');
    const due = inv.dueDate ? fmtD(inv.dueDate) : '—';
    const stripeChip = isDynamicStripeLink(inv)
      ? `<span title="Dynamic Stripe Checkout · exact amount" style="display:inline-block;margin-left:6px;background:#0e0c0a;color:#f0c060;font-size:8px;font-weight:700;letter-spacing:.16em;padding:2px 6px;border-radius:99px;">💳 STRIPE</span>`
      : '';
    return `<div class="invoice-card">
      <div class="inv-c-num">${inv.num}${stripeChip}</div>
      <div class="inv-c-store">${inv.storeName || '—'}<div class="inv-c-store-meta">${[inv.storeEmail, inv.storeCity].filter(Boolean).join(' · ') || '—'}</div></div>
      <div class="inv-c-cell">Issued<strong>${fmtD(inv.date)}</strong></div>
      <div class="inv-c-cell">Due<strong>${due}</strong></div>
      <div class="inv-c-cell amt">Total<strong>${fmt(inv.total||0, cur)}</strong></div>
      <div class="inv-c-actions" style="flex-direction:column;align-items:stretch;gap:6px;">
        <span class="inv-status ${statusCls}" style="display:inline-block;font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;padding:4px 10px;border-radius:99px;text-align:center;
          background:${statusCls==='paid'?'#e0f5ea':statusCls==='sent'?'#ebf2ff':statusCls==='overdue'?'#fde6e0':statusCls==='cancelled'?'#eee':'#e9e6e0'};
          color:${statusCls==='paid'?'#1d7a4a':statusCls==='sent'?'#1d4cb3':statusCls==='overdue'?'#a13a1b':statusCls==='cancelled'?'#5a544c':'#6b665e'};">${statusLabel}</span>
        <div style="display:flex;gap:4px;justify-content:flex-end;">
          <button class="btn sm" onclick="viewInvoice('${inv.id}')">View</button>
          <button class="btn sm ink" onclick="openCreateInvoice(null,'${inv.id}')">Edit</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── invoice editor state ────────────────────────────────────────────────
let invoiceCtx = null; // { editingId, items: [{description,qty,unitPrice}] }

function openCreateInvoice(storeId, editingId){
  const s = getState(), book = getBook();
  // Populate store dropdown
  const sel = $('inv-store');
  sel.innerHTML = '<option value="">— Select store —</option>' + (s.stores||[]).map(st => `<option value="${st.id}">${st.name}${st.city?' · '+st.city:''}</option>`).join('');

  // set currency dropdown — default to book currency
  const bookCurCode = getBookCurrencyCode(book);
  if ($('inv-currency')) $('inv-currency').value = bookCurCode;
  $('inv-discount-sym').textContent = getSym(bookCurCode);

  if (editingId){
    const inv = (s.invoices||[]).find(i => i.id === editingId);
    if (!inv) { showToast('Invoice not found', 'err'); return; }
    invoiceCtx = { editingId, items: JSON.parse(JSON.stringify(inv.items || [])) };
    $('inv-edit-title').textContent = `Edit ${inv.num}`;
    sel.value     = inv.storeId || '';
    $('inv-num').value  = inv.num || '';
    $('inv-date').value = inv.date || today();
    $('inv-due').value  = inv.dueDate || '';
    $('inv-discount').value = inv.discount || 0;
    $('inv-tax').value      = inv.taxRate  || 0;
    $('inv-paylink').value  = inv.paymentLink || '';
    $('inv-notes').value    = inv.notes || '';
    $('inv-terms').value    = inv.terms || '';
    $('inv-delete-btn').style.display = '';
    // restore invoice's own currency
    const invCurCode = normalizeCurrencyCode(inv.currency || bookCurCode, bookCurCode);
    if ($('inv-currency')) $('inv-currency').value = invCurCode;
    $('inv-discount-sym').textContent = getSym(invCurCode);
  } else {
    invoiceCtx = { editingId: null, items: [] };
    $('inv-edit-title').textContent = 'New invoice';
    sel.value = storeId ? String(storeId) : '';
    $('inv-num').value  = nextInvoiceNumber();
    $('inv-date').value = today();
    // default due date = 30 days from today
    const d = new Date(); d.setDate(d.getDate()+30);
    $('inv-due').value = d.toISOString().split('T')[0];
    $('inv-discount').value = 0;
    $('inv-tax').value = 0;
    $('inv-paylink').value = '';
    const settings = getInvoiceSettings();
    $('inv-notes').value = '';
    $('inv-terms').value = settings.terms || 'Net 30. Payment via Stripe, PayPal, or bank transfer.';
    $('inv-delete-btn').style.display = 'none';
    if (storeId) prefillFromPendingSales(storeId);
    else addInvoiceItem();
  }
  renderInvoiceItems();
  recalcInvoiceTotals();
  openM('invoice-edit');
}

function nextInvoiceNumber(){
  const s = getState(), book = getBook();
  const year = new Date().getFullYear();
  const prefix = (book.id || 'BOOK').slice(0,6).toUpperCase();
  // determine next seq from existing invoices for this year
  const existing = (s.invoices||[]).filter(i => (i.num||'').includes(`-${year}-`));
  const maxSeq = existing.reduce((m,i)=>{
    const mt = /-(\d+)$/.exec(i.num||''); return mt ? Math.max(m, parseInt(mt[1],10)) : m;
  }, s.invoiceSeq || 0);
  return `INV-${prefix}-${year}-${String(maxSeq+1).padStart(3,'0')}`;
}

function onInvoiceStoreChange(){
  // No automatic refill — user might be editing. Just keep selection.
}

function getInvoiceCurrency(){
  const sel = $('inv-currency');
  if (sel && sel.value) return sel.value;
  return getBookCurrencyCode(getBook());
}

function onInvoiceCurrencyChange(){
  const code = getInvoiceCurrency();
  $('inv-discount-sym').textContent = getSym(code);
  renderInvoiceItems();
  recalcInvoiceTotals();
}

function addInvoiceItem(description='', qty=1, unitPrice=0){
  invoiceCtx.items.push({ description, qty, unitPrice });
  renderInvoiceItems();
  recalcInvoiceTotals();
}

function removeInvoiceItem(idx){
  invoiceCtx.items.splice(idx, 1);
  renderInvoiceItems();
  recalcInvoiceTotals();
}

function updateInvoiceItem(idx, field, value){
  const it = invoiceCtx.items[idx]; if (!it) return;
  if (field === 'description') it.description = value;
  else it[field] = parseFloat(value) || 0;
  // Re-render only the amount cell for performance
  const amtEl = document.querySelector(`#inv-items-body tr[data-i="${idx}"] .inv-item-amt`);
  if (amtEl) amtEl.textContent = fmt((it.qty||0)*(it.unitPrice||0), getSym(getInvoiceCurrency()));
  recalcInvoiceTotals();
}

function renderInvoiceItems(){
  const body = $('inv-items-body'), cur = getSym(getInvoiceCurrency());
  if (!invoiceCtx.items.length){
    body.innerHTML = `<tr><td colspan="5" style="font-size:12px;color:var(--text3);padding:14px;text-align:center;">No line items. Click <strong>+ Add line</strong>.</td></tr>`;
    return;
  }
  body.innerHTML = invoiceCtx.items.map((it, i) => `<tr class="inv-item-row" data-i="${i}">
    <td><input type="text" value="${escapeHTML(it.description||'')}" placeholder="e.g. ${getBook().title} — consignment sale, Sept 2026" oninput="updateInvoiceItem(${i},'description',this.value)"></td>
    <td><input type="number" min="0" step="1" value="${it.qty||0}" oninput="updateInvoiceItem(${i},'qty',this.value)"></td>
    <td><input type="number" min="0" step="0.01" value="${(it.unitPrice||0).toFixed(2)}" oninput="updateInvoiceItem(${i},'unitPrice',this.value)"></td>
    <td class="r"><span class="inv-item-amt">${fmt((it.qty||0)*(it.unitPrice||0), cur)}</span></td>
    <td><button type="button" class="inv-item-remove" onclick="removeInvoiceItem(${i})" title="Remove line">×</button></td>
  </tr>`).join('');
}

function escapeHTML(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function recalcInvoiceTotals(){
  const cur = getSym(getInvoiceCurrency());
  const subtotal = invoiceCtx.items.reduce((a,it)=> a + (parseFloat(it.qty)||0) * (parseFloat(it.unitPrice)||0), 0);
  const discount = parseFloat($('inv-discount').value) || 0;
  const taxRate  = parseFloat($('inv-tax').value) || 0;
  const taxable  = Math.max(0, subtotal - discount);
  const tax      = taxable * (taxRate/100);
  const total    = taxable + tax;
  $('inv-sub-val').textContent  = fmt(subtotal, cur);
  $('inv-disc-val').textContent = discount ? '−' + fmt(discount, cur) : fmt(0, cur);
  $('inv-tax-val').textContent  = fmt(tax, cur);
  $('inv-total-val').textContent= fmt(total, cur);
  return { subtotal, discount, taxRate, tax, total };
}

function prefillFromPendingSales(forceStoreId){
  const s = getState(), book = getBook();
  const storeId = forceStoreId ? Number(forceStoreId) : Number($('inv-store').value);
  if (!storeId) { showToast('Pick a store first', 'warn'); return; }
  $('inv-store').value = String(storeId);
  const store = (s.stores||[]).find(st => st.id === storeId);
  if (!store) return;
  // pull all unpaid, un-voided Sale ledger entries for that store
  const pending = (s.ledger||[]).filter(e => e.storeId === storeId && e.type === 'Sale' && !e.voided && e.status !== 'paid');
  if (!pending.length){
    showToast('No unpaid consignment sales for this store', 'warn');
    if (!invoiceCtx.items.length) addInvoiceItem();
    return;
  }
  // group by month
  invoiceCtx.items = pending.map(e => ({
    description: `${book.title} — consignment sale${e.date?' · '+fmtD(e.date):''} (qty ${e.qty} @ ${(100-e.rate).toFixed(0)}% net)`,
    qty: e.qty,
    unitPrice: e.qty ? (e.amountDue / e.qty) : 0,
    _ledgerId: e.id,
  }));
  renderInvoiceItems();
  recalcInvoiceTotals();
  showToast(`✓ Imported ${pending.length} pending sale${pending.length>1?'s':''}`);
}

function saveInvoice(status){
  const s = getState(), book = getBook();
  const storeId = Number($('inv-store').value);
  if (!storeId){ showToast('Choose a store to bill', 'err'); return; }
  if (!invoiceCtx.items.length){ showToast('Add at least one line item', 'err'); return; }
  const store = (s.stores||[]).find(st => st.id === storeId);
  if (!store){ showToast('Store not found', 'err'); return; }

  const totals = recalcInvoiceTotals();
  if (totals.total <= 0){ showToast('Invoice total must be greater than zero', 'err'); return; }

  const num = ($('inv-num').value || '').trim() || nextInvoiceNumber();
  const date = $('inv-date').value || today();
  const dueDate = $('inv-due').value || '';
  // Use the currency selected in the editor (ISO code → symbol for storage, consistent with book.currency pattern)
  const invoiceCurCode = getInvoiceCurrency();
  const invoiceCurSym  = getSym(invoiceCurCode); // e.g. "US$", "€"

  const payload = {
    id: invoiceCtx.editingId || ('inv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,7)),
    num, storeId, storeName: store.name, storeEmail: store.email||'', storeCity: store.city||'', storeContact: store.contact||'',
    date, dueDate,
    items: invoiceCtx.items.map(it => ({ description: it.description||'', qty: parseFloat(it.qty)||0, unitPrice: parseFloat(it.unitPrice)||0, _ledgerId: it._ledgerId || null })),
    subtotal: totals.subtotal,
    discount: totals.discount,
    taxRate: totals.taxRate,
    tax: totals.tax,
    total: totals.total,
    currency: invoiceCurSym,  // stored as symbol (€, CA$, US$…) consistent with book.currency
    currencyCode: invoiceCurCode, // ISO code stored alongside for Stripe
    paymentLink: $('inv-paylink').value.trim() || '',
    notes: $('inv-notes').value.trim(),
    terms: $('inv-terms').value.trim(),
    status,
    createdAt: invoiceCtx.editingId ? (s.invoices.find(i=>i.id===invoiceCtx.editingId)?.createdAt || Date.now()) : Date.now(),
    updatedAt: Date.now(),
  };

  let oldStripeLinkId = null;
  if (invoiceCtx.editingId){
    const idx = s.invoices.findIndex(i => i.id === invoiceCtx.editingId);
    if (idx >= 0) {
      // preserve paid metadata if existing
      const old = s.invoices[idx];
      payload.paidAt = old.paidAt || null;
      payload.paidMethod = old.paidMethod || null;
      // preserve Stripe link only if amount/currency unchanged
      const amountChanged = (Number(old.total||0).toFixed(2) !== Number(payload.total||0).toFixed(2))
                          || (old.currency !== payload.currency);
      if (old.stripe && !amountChanged) {
        payload.stripe = old.stripe;
      } else if (old.stripe) {
        // amount changed → invalidate old link (will deactivate below)
        oldStripeLinkId = old.stripe.paymentLinkId;
      }
      s.invoices[idx] = payload;
    } else {
      s.invoices.push(payload);
    }
  } else {
    s.invoices = s.invoices || [];
    s.invoices.push(payload);
    // bump seq counter for safety
    const mt = /-(\d+)$/.exec(num);
    if (mt) s.invoiceSeq = Math.max(s.invoiceSeq || 0, parseInt(mt[1],10));
  }

  saveState(activeBook);
  closeM('invoice-edit');
  renderInvoices();
  showToast(status === 'draft' ? '✓ Draft saved' : '✓ Invoice saved');

  // Stripe Payment Link: auto-create on finalize (or regenerate after edit)
  const settings = getInvoiceSettings();
  const shouldAutoStripe = status !== 'draft' && settings.stripeAuto !== false && !!settings.stripeKey && !payload.stripe;
  if (oldStripeLinkId) deactivateStripePaymentLink(oldStripeLinkId);

  if (shouldAutoStripe){
    showToast('Creating Stripe Payment Link…', 'ok', 1800);
    createStripePaymentLinkForInvoice(payload).then(stripe => {
      const s2 = getState();
      const inv = (s2.invoices||[]).find(i => i.id === payload.id);
      if (!inv) return;
      inv.stripe = stripe;
      inv.paymentLink = stripe.url; // also set as the primary payment link so QR/etc. use it
      saveState(activeBook);
      renderInvoices();
      setTimeout(()=> viewInvoice(payload.id), 60);
      showToast(`✓ Stripe link ready — ${fmt(payload.total, payload.currency)} owed`);
    }).catch(err => {
      console.error('Stripe link creation failed:', err);
      showToast('Stripe link failed: ' + err.message, 'err', 5000);
      setTimeout(()=> viewInvoice(payload.id), 60);
    });
  } else {
    setTimeout(()=> viewInvoice(payload.id), 80);
  }
}

async function regenerateStripeLinkFromView(){
  if (!currentViewInvoiceId) return;
  const s = getState();
  const inv = (s.invoices||[]).find(i => i.id === currentViewInvoiceId);
  if (!inv) return;
  const settings = getInvoiceSettings();
  if (!settings.stripeKey){
    if (confirm('No Stripe key configured yet. Open Invoice Settings to add one?')) {
      closeM('invoice-view');
      setTimeout(openInvoiceTemplateSettings, 80);
    }
    return;
  }
  const oldId = inv.stripe?.paymentLinkId;
  const btn = $('inv-stripe-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Creating…'; }
  try {
    const stripe = await createStripePaymentLinkForInvoice(inv);
    if (oldId) deactivateStripePaymentLink(oldId);
    inv.stripe = stripe;
    inv.paymentLink = stripe.url;
    saveState(activeBook);
    renderInvoices();
    viewInvoice(currentViewInvoiceId);
    showToast(`✓ Stripe link ready — ${fmt(inv.total, inv.currency)} owed`);
  } catch(e){
    console.error(e);
    showToast('Stripe: ' + e.message, 'err', 5500);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💳 Stripe link'; }
  }
}

function deleteInvoice(){
  if (!invoiceCtx || !invoiceCtx.editingId) return;
  const s = getState();
  const inv = (s.invoices||[]).find(i => i.id === invoiceCtx.editingId);
  if (!inv) return;
  if (!confirm(`Delete invoice ${inv.num}? This cannot be undone.`)) return;
  s.invoices = s.invoices.filter(i => i.id !== invoiceCtx.editingId);
  saveState(activeBook);
  closeM('invoice-edit');
  renderInvoices();
  showToast('✓ Invoice deleted');
}

// ── invoice view (printable) ────────────────────────────────────────────
let currentViewInvoiceId = null;

function viewInvoice(id){
  const s = getState();
  const inv = (s.invoices||[]).find(i => i.id === id);
  if (!inv){ showToast('Invoice not found', 'err'); return; }
  currentViewInvoiceId = id;
  $('invoice-print-area').innerHTML = renderInvoicePaperHTML(inv);
  // hide mark-paid button if already paid
  const mp = $('inv-mark-paid-btn');
  if (mp) mp.style.display = inv.status === 'paid' ? 'none' : '';
  openM('invoice-view');
  // Render QR if QRCode library is available
  setTimeout(()=>{
    const qrEl = document.querySelector('#invoice-print-area .inv-qr');
    const url = effectivePaymentLink(inv);
    if (qrEl && url && typeof QRCode !== 'undefined'){
      qrEl.innerHTML = '';
      new QRCode(qrEl, { text: url, width: 104, height: 104, colorDark: '#0e0c0a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    }
  }, 30);
}

function effectivePaymentLink(inv){
  const book = BOOKS[activeBook] || getBook();
  // Dynamic Stripe link (exact amount) always wins
  if (inv.stripe && inv.stripe.url) return inv.stripe.url;
  let url = inv.paymentLink || book.stripeLink || book.paymentLink || '';
  if (!url) return '';
  // Best-effort: append client_reference_id for Stripe Payment Links so the payment is tagged
  try {
    if (/buy\.stripe\.com/i.test(url)) {
      const u = new URL(url);
      if (!u.searchParams.has('client_reference_id')) u.searchParams.set('client_reference_id', inv.num);
      if (inv.storeEmail && !u.searchParams.has('prefilled_email')) u.searchParams.set('prefilled_email', inv.storeEmail);
      url = u.toString();
    }
  } catch(e){}
  return url;
}

function isDynamicStripeLink(inv){ return !!(inv && inv.stripe && inv.stripe.url); }

function renderInvoicePaperHTML(inv){
  const settings = getInvoiceSettings();
  const book = BOOKS[activeBook] || getBook();
  const cur = inv.currency || book.currency;
  const payUrl = effectivePaymentLink(inv);
  const todayStr = today();
  const overdue = inv.status === 'sent' && inv.dueDate && inv.dueDate < todayStr;
  const statusLabel = overdue ? 'OVERDUE' : (inv.status||'draft').toUpperCase();
  const statusCls   = overdue ? 'overdue' : (inv.status||'draft');

  const accent = book.accent || '#c8913a';
  const itemsHtml = (inv.items||[]).map(it => `<tr>
    <td>${escapeHTML(it.description||'—')}</td>
    <td class="r">${(it.qty||0)}</td>
    <td class="r">${fmt(it.unitPrice||0, cur)}</td>
    <td class="r"><strong>${fmt((it.qty||0)*(it.unitPrice||0), cur)}</strong></td>
  </tr>`).join('');

  const payMethodsLabel = [
    payUrl && /buy\.stripe\.com/i.test(payUrl) ? 'Stripe' : null,
    payUrl && /paypal/i.test(payUrl) ? 'PayPal' : null,
    payUrl && /^[^\s@]+@[^\s@]+$/.test(payUrl) ? 'Interac e-Transfer' : null,
    settings.bank ? 'Bank transfer' : null,
  ].filter(Boolean).join(' · ') || 'See payment instructions below';

  const dyn = isDynamicStripeLink(inv);
  const testBadge = (dyn && inv.stripe.livemode === false) ? `<span style="display:inline-block;margin-left:8px;background:#fde6e0;color:#a13a1b;font-size:9px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;padding:3px 8px;border-radius:99px;">Test mode</span>` : '';
  const dynBadge = dyn ? `<div style="display:inline-flex;align-items:center;gap:6px;background:#0e0c0a;color:#f0c060;font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;padding:5px 12px;border-radius:99px;margin-bottom:10px;">✓ Stripe checkout · exact amount${testBadge?' ':''}${testBadge}</div>` : '';
  const payCopy = dyn
    ? `Click below to pay <strong>${fmt(inv.total||0, cur)}</strong> via Stripe Checkout. The amount is locked to this invoice — no risk of paying the wrong quarter.`
    : `Click below to pay <strong>${fmt(inv.total||0, cur)}</strong> securely, or scan the QR with your phone.`;

  const payBlock = payUrl ? `
    <section class="inv-pay no-print" style="--book-accent:${accent};">
      <div class="inv-pay-info">
        ${dynBadge}
        <h3>Pay this invoice</h3>
        <p>${payCopy}</p>
        <a class="pay-btn" href="${payUrl}" target="_blank" rel="noopener">Pay ${fmt(inv.total||0, cur)} →</a>
        <div class="pay-methods">${payMethodsLabel}</div>
      </div>
      <div class="inv-qr"></div>
    </section>` : '';

  const bankBlock = settings.bank ? `
    <div class="inv-notes-block">
      <h4>Bank transfer details</h4>
      <div>${escapeHTML(settings.bank)}</div>
    </div>` : '';

  return `<div style="--book-accent:${accent};">
    <header class="inv-head">
      <div class="inv-brand">
        <h1>${escapeHTML(settings.name || 'Lyricalmyrical Books')}</h1>
        <div class="inv-sub">${escapeHTML(book.title)}${book.author?' — '+escapeHTML(book.author):''}</div>
        <div class="inv-addr">${escapeHTML(settings.addr || '')}${settings.email?'\n'+escapeHTML(settings.email):''}${settings.web?'\n'+escapeHTML(settings.web):''}${settings.vat?'\nVAT/Tax ID: '+escapeHTML(settings.vat):''}</div>
      </div>
      <div class="inv-id">
        <div class="inv-word">Invoice</div>
        <div class="inv-num">${escapeHTML(inv.num)}</div>
        <div><span class="inv-status ${statusCls}">${statusLabel}</span></div>
      </div>
    </header>

    <section class="inv-meta-grid">
      <div>
        <label>Billed to</label>
        <strong>${escapeHTML(inv.storeName||'—')}</strong>
        <div class="inv-meta-sub">${[inv.storeContact, inv.storeEmail, inv.storeCity].filter(Boolean).map(escapeHTML).join('\n')}</div>
      </div>
      <div>
        <label>Issue date</label>
        <strong>${fmtD(inv.date)}</strong>
        ${inv.dueDate?`<div class="inv-meta-sub">Due ${fmtD(inv.dueDate)}</div>`:''}
      </div>
      <div>
        <label>Amount due</label>
        <strong style="color:${statusCls==='paid'?'#1d7a4a':'#0e0c0a'};font-size:18px;">${fmt(inv.total||0, cur)}</strong>
        <div class="inv-meta-sub">${(inv.items||[]).reduce((a,i)=>a+(i.qty||0),0)} item${(inv.items||[]).reduce((a,i)=>a+(i.qty||0),0)===1?'':'s'}</div>
      </div>
    </section>

    <table class="inv-items">
      <thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div class="inv-totals">
      <div class="tr"><span>Subtotal</span><span class="val">${fmt(inv.subtotal||0, cur)}</span></div>
      ${(inv.discount||0)>0 ? `<div class="tr"><span>Discount</span><span class="val">−${fmt(inv.discount, cur)}</span></div>` : ''}
      ${(inv.taxRate||0)>0 ? `<div class="tr"><span>Tax (${inv.taxRate}%)</span><span class="val">${fmt(inv.tax||0, cur)}</span></div>` : ''}
      <div class="grand"><div class="tr" style="padding:0;color:inherit;"><span>Total due</span><span class="val">${fmt(inv.total||0, cur)}</span></div></div>
    </div>

    ${payBlock}

    <div class="inv-notes">
      ${inv.notes?`<div class="inv-notes-block"><h4>Notes</h4><div>${escapeHTML(inv.notes)}</div></div>`:''}
      ${inv.terms?`<div class="inv-notes-block"><h4>Terms</h4><div>${escapeHTML(inv.terms)}</div></div>`:''}
      ${bankBlock}
    </div>

    <div class="inv-foot">${escapeHTML(settings.footer || 'Thank you for stocking our books.')}</div>
  </div>`;
}

function editInvoiceFromView(){
  if (!currentViewInvoiceId) return;
  closeM('invoice-view');
  setTimeout(()=> openCreateInvoice(null, currentViewInvoiceId), 60);
}

function markInvoicePaidFromView(){
  if (!currentViewInvoiceId) return;
  const s = getState(), book = getBook();
  const inv = (s.invoices||[]).find(i => i.id === currentViewInvoiceId);
  if (!inv) return;
  if (!confirm(`Mark ${inv.num} as PAID? This will also mark any linked pending consignment sales as paid.`)) return;
  inv.status = 'paid';
  inv.paidAt = Date.now();
  inv.paidMethod = isDynamicStripeLink(inv) ? 'Stripe Checkout'
                : (inv.paymentLink && /buy\.stripe\.com/i.test(inv.paymentLink)) ? 'Stripe'
                : (inv.paymentLink && /paypal/i.test(inv.paymentLink))           ? 'PayPal'
                : (book.stripeLink ? 'Stripe' : 'Other');
  // best-effort: deactivate the Stripe Payment Link so it can't be paid twice
  if (inv.stripe?.paymentLinkId) deactivateStripePaymentLink(inv.stripe.paymentLinkId);
  // settle any linked pending ledger entries
  for (const it of (inv.items||[])){
    if (it._ledgerId){
      const e = s.ledger.find(x => x.id === it._ledgerId);
      if (e && e.status === 'pending' && !e.voided){
        const st = (s.stores||[]).find(x => x.id === e.storeId);
        if (st) st.amountOwed = Math.max(0, (st.amountOwed||0) - (e.amountDue||0));
        e.status = 'paid';
        e.paid = 'paid';
      }
    }
  }
  saveState(activeBook);
  renderInvoices();
  renderStores();
  renderLedger();
  updateDash();
  viewInvoice(currentViewInvoiceId);
  showToast(`✓ ${inv.num} marked paid`);
}

function printInvoice(){
  if (!currentViewInvoiceId) return;
  window.print();
}

function copyInvoicePayLink(){
  if (!currentViewInvoiceId) return;
  const inv = getState().invoices.find(i => i.id === currentViewInvoiceId);
  if (!inv) return;
  const url = effectivePaymentLink(inv);
  if (!url){ showToast('No payment link set for this book or invoice', 'warn'); return; }
  navigator.clipboard.writeText(url).then(
    () => showToast('✓ Payment link copied'),
    () => showToast('Could not copy — your browser blocked it', 'err')
  );
}

function emailInvoice(){
  if (!currentViewInvoiceId) return;
  const inv = getState().invoices.find(i => i.id === currentViewInvoiceId);
  if (!inv) return;
  const settings = getInvoiceSettings();
  const cur = inv.currency || getBook().currency;
  const payUrl = effectivePaymentLink(inv);
  const subject = `Invoice ${inv.num} — ${settings.name || 'Lyricalmyrical Books'}`;
  const lines = [
    `Hi ${inv.storeContact || inv.storeName || 'there'},`,
    ``,
    `Please find invoice ${inv.num} (${fmt(inv.total||0, cur)}) attached. Issued ${fmtD(inv.date)}${inv.dueDate?', due '+fmtD(inv.dueDate):''}.`,
    ``,
    payUrl ? `Pay online: ${payUrl}` : ``,
    ``,
    inv.notes ? `Notes: ${inv.notes}` : ``,
    ``,
    `Thank you,`,
    settings.name || 'Lyricalmyrical Books',
  ].filter(Boolean).join('\n');
  const to = encodeURIComponent(inv.storeEmail || '');
  const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines)}`;
  window.location.href = url;
}

function downloadInvoiceHTML(){
  if (!currentViewInvoiceId) return;
  const inv = getState().invoices.find(i => i.id === currentViewInvoiceId);
  if (!inv) return;
  const head = document.head.innerHTML;
  const body = `<body style="background:#f0ece4;padding:40px;"><div class="invoice-paper" style="background:#fff;">${$('invoice-print-area').innerHTML}</div></body>`;
  const html = `<!doctype html><html><head>${head}</head>${body}</html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${inv.num}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  showToast('✓ Invoice downloaded (open & print to PDF)');
}

// ── EDIT & VOID SYSTEM ─────────────────────────────────────────────────────
let editCtx = null; // { kind:'hist'|'ledger', idx, snapshot }

function openEditHist(idx) {
  const s = getState(), book = getBook(), h = s.hist[idx];
  if (!h) return;
  editCtx = { kind:'hist', idx, snapshot: JSON.parse(JSON.stringify(h)) };
  $('edit-modal-title').textContent = 'Edit order entry';
  $('edit-modal-type-badge').textContent = h.chan + ' order';
  $('edit-order-fields').style.display = '';
  $('edit-ledger-fields').style.display = 'none';
  $('edit-sym').textContent = book.currency;
  $('edit-num').value = h.num;
  $('edit-date').value = h.date;
  $('edit-qty').value = h.qty;
  $('edit-price').value = h.price.toFixed(2);
  $('edit-chan').value = h.chan;
  $('edit-notes').value = h.notes || '';
  $('edit-diff-preview').style.display = 'none';
  const voidZone = $('edit-void-zone');
  if (h.voided) {
    $('edit-void-btn').textContent = 'Unvoid this entry';
    $('edit-void-body').textContent = 'This entry is currently voided. Unvoiding will re-apply its stock and revenue effects.';
  } else {
    $('edit-void-btn').textContent = 'Void this entry';
    $('edit-void-body').textContent = 'Voiding reverses all stock and revenue effects. The entry stays visible as struck-through for your records.';
  }
  openM('edit-entry');
}

function openEditLedger(idx) {
  const s = getState(), book = getBook(), e = s.ledger[idx];
  if (!e) return;
  editCtx = { kind:'ledger', idx, snapshot: JSON.parse(JSON.stringify(e)) };
  $('edit-modal-title').textContent = 'Edit consignment entry';
  $('edit-modal-type-badge').textContent = e.storeName + ' · ' + e.type;
  $('edit-order-fields').style.display = 'none';
  $('edit-ledger-fields').style.display = '';
  $('edit-l-date').value = e.date;
  $('edit-l-qty').value = e.qty;
  $('edit-l-rate').value = e.rate;
  $('edit-l-notes').value = e.notes || '';
  if (e.voided) {
    $('edit-void-btn').textContent = 'Unvoid this entry';
    $('edit-void-body').textContent = 'This entry is currently voided. Unvoiding will re-apply its effects on consignment stock and payments.';
  } else {
    $('edit-void-btn').textContent = 'Void this entry';
    $('edit-void-body').textContent = 'Voiding reverses the qty and payment effects of this entry. It stays visible as struck-through.';
  }
  openM('edit-entry');
}

function saveEntryEdit() {
  if (!editCtx) return;
  const s = getState(), book = getBook();
  if (editCtx.kind === 'hist') {
    const old = editCtx.snapshot;
    const h = s.hist[editCtx.idx];
    const newQty = parseInt($('edit-qty').value) || old.qty;
    const newPrice = parseFloat($('edit-price').value) || old.price;
    const newChan = $('edit-chan').value;
    const newNum = $('edit-num').value.trim() || old.num;
    const newDate = $('edit-date').value || old.date;
    const newNotes = $('edit-notes').value.trim();

    if (!h.voided) {
      // Reverse old effect
      s.stock += old.qty;
      s.sold -= old.qty;
      s.revenue -= old.qty * old.price;
      if (s.chStats[old.chan]) {
        s.chStats[old.chan].txns--;
        s.chStats[old.chan].units -= old.qty;
        s.chStats[old.chan].revenue -= old.qty * old.price;
        if (s.chStats[old.chan].txns <= 0) delete s.chStats[old.chan];
      }
      // Apply new effect
      s.stock = Math.max(0, s.stock - newQty);
      s.sold += newQty;
      s.revenue += newQty * newPrice;
      if (!s.chStats[newChan]) s.chStats[newChan] = {txns:0,units:0,revenue:0};
      s.chStats[newChan].txns++;
      s.chStats[newChan].units += newQty;
      s.chStats[newChan].revenue += newQty * newPrice;
    }

    // Update the record
    h.num = newNum; h.chan = newChan; h.qty = newQty; h.price = newPrice;
    h.date = newDate; h.notes = newNotes;
    h.edited = true;

    // Sync edit to sheets — upsert replaces the old row via sheetsId.
    // Skip for consignment-mirrored hist entries: the matching ledger row is
    // the canonical record and would just overwrite this write.
    if (sheetsUrl && !h.consignmentLink) {
      const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
      const totalNative = h.qty * h.price;
      let cadEquiv = '';
      if (nativeCur === 'CAD') cadEquiv = totalNative;
      else if (h.payment && h.payment.currency === 'CAD' && h.payment.amount) cadEquiv = h.payment.amount;
      syncToSheets({
        type: 'order', book: book.title,
        date: h.date, num: h.num, chan: h.chan,
        qty: h.qty, price: h.price, total: totalNative,
        stockAfter: h.after, notes: h.notes,
        sheetsId: h.sheetsId || '',
        currency: nativeCur,
        paymentCurrency: normalizeCurrencyCode(h.payment?.currency || nativeCur, 'CAD'),
        paymentAmount: h.payment?.amount ?? totalNative,
        paymentRate: h.payment?.rate ?? '',
        convertedTotal: cadEquiv,
        enteredBy: h.enteredBy || '',
        status: h.voided ? 'VOID' : 'OK'
      });
    }

  } else {
    // Ledger entry edit (date, qty, rate, notes — non-destructive for stock, 
    // since consignment stock effects are complex; just update the displayed values)
    const e = s.ledger[editCtx.idx];
    e.date = $('edit-l-date').value || e.date;
    e.notes = $('edit-l-notes').value.trim();
    // qty and rate — update display only, reverse/reapply amountDue if sale
    const newQty = parseInt($('edit-l-qty').value) || e.qty;
    const newRate = parseFloat($('edit-l-rate').value) || e.rate;
    if (e.type === 'Sale' && !e.voided) {
      // Find the store and adjust owed
      const st = getState().stores.find(st=>st.id===e.storeId);
      if (st) {
        const oldDue = e.amountDue;
        // We need the sale price — estimate from old amountDue
        const salePrice = oldDue > 0 ? (oldDue / (e.qty * (1 - e.rate/100))) : book.listPrice;
        const newDue = newQty * salePrice * (1 - newRate/100);
        if (e.paid === 'pending' && st) {
          st.amountOwed = Math.max(0, st.amountOwed - oldDue + newDue);
        }
        s.revenue = Math.max(0, s.revenue - oldDue + newDue);
        if (s.chStats['Consignment']) {
          s.chStats['Consignment'].revenue = Math.max(0, s.chStats['Consignment'].revenue - oldDue + newDue);
          s.chStats['Consignment'].units += (newQty - e.qty);
        }
        st.sold += (newQty - e.qty);
        e.amountDue = newDue;
      }
    }
    e.qty = newQty;
    e.rate = newRate;
    e.edited = true;

    // Sync ledger edit to sheets — upsert replaces the old row via sheetsId
    if (sheetsUrl && e.sheetsId) {
      syncToSheets({
        type: 'consignment', book: book.title,
        date: e.date, store: e.storeName, event: e.type,
        qty: e.qty, rate: e.rate, amountDue: e.amountDue || 0,
        notes: e.notes || '', status: e.voided ? 'VOID' : (e.status || ''),
        sheetsId: e.sheetsId,
        currency: getBookCurrencyCode(book)
      });
    }
  }

  closeM('edit-entry');
  renderAll(); updateDash(); saveState(activeBook);
  showToast('✓ Entry updated');
}

function syncLedgerVoid(e, isVoided) {
  if (!e || !sheetsUrl || !e.sheetsId) return;
  if (isVoided) {
    syncToSheets({
      action: 'delete',
      type: 'consignment',
      book: getBook().title,
      sheetsId: e.sheetsId
    });
  } else {
    syncToSheets({
      type: 'consignment', book: getBook().title,
      date: e.date, store: e.storeName, event: e.type,
      qty: e.qty, rate: e.rate, amountDue: e.amountDue || 0,
      notes: e.notes || '', status: e.status || 'OK',
      sheetsId: e.sheetsId,
      currency: getBookCurrencyCode(getBook())
    });
  }
}


function recomputeAfters(s) {
  // Walk history newest→oldest and recompute each entry's `after` value
  // so the Stock After column stays accurate after voids/unvoids.
  let running = s.stock;
  for (const h of s.hist) {
    h.after = running;
    if (!h.voided) running += h.qty;
  }
}

function syncHistoryVoidDeletion(h, isVoided) {
  if (!h || !sheetsUrl) return;
  // Consignment-mirrored hist entries are handled via the ledger row.
  if (h.consignmentLink) return;
  if (isVoided) {
    // Hard delete: send void action with the stable sheetsId so the backend
    // can find and remove the exact row regardless of when it was written.
    syncToSheets({
      action: 'delete',
      type: 'order',
      book: getBook().title,
      sheetsId: h.sheetsId || ''
    });
    return;
  }
  // Unvoid: re-sync the full entry (upsert will replace the row)
  const book = getBook();
  const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  const totalNative = h.qty * h.price;
  let cadEquiv = '';
  if (nativeCur === 'CAD') cadEquiv = totalNative;
  else if (h.payment && h.payment.currency === 'CAD' && h.payment.amount) cadEquiv = h.payment.amount;
  syncToSheets({
    type: 'order',
    book: book.title,
    date: h.date,
    num: h.num,
    chan: h.chan,
    qty: h.qty,
    price: h.price,
    total: totalNative,
    stockAfter: h.after,
    notes: h.notes || '',
    sheetsId: h.sheetsId || '',
    currency: nativeCur,
    paymentCurrency: normalizeCurrencyCode(h.payment?.currency || nativeCur, 'CAD'),
    paymentAmount: h.payment?.amount ?? totalNative,
    paymentRate: h.payment?.rate ?? '',
    convertedTotal: cadEquiv,
    enteredBy: h.enteredBy || '',
    status: 'OK'
  });
}

function voidEntry() {
  if (!editCtx) return;
  const s = getState(), book = getBook();

  if (editCtx.kind === 'hist') {
    const h = s.hist[editCtx.idx];
    if (!h) return;
    if (!h.voided) {
      // VOID: reverse effects
      s.stock += h.qty;
      s.sold = Math.max(0, s.sold - h.qty);
      s.revenue = Math.max(0, s.revenue - h.qty * h.price);
      if (s.chStats[h.chan]) {
        s.chStats[h.chan].txns = Math.max(0, s.chStats[h.chan].txns - 1);
        s.chStats[h.chan].units = Math.max(0, s.chStats[h.chan].units - h.qty);
        s.chStats[h.chan].revenue = Math.max(0, s.chStats[h.chan].revenue - h.qty * h.price);
        if (s.chStats[h.chan].txns <= 0) delete s.chStats[h.chan];
      }
      h.voided = true;
      recomputeAfters(s);
      syncHistoryVoidDeletion(h, true);
      showToast('Entry voided — stock & revenue reversed (Sheets row delete queued)', 'warn');
    } else {
      // UNVOID: re-apply effects
      s.stock = Math.max(0, s.stock - h.qty);
      s.sold += h.qty;
      s.revenue += h.qty * h.price;
      if (!s.chStats[h.chan]) s.chStats[h.chan] = {txns:0,units:0,revenue:0};
      s.chStats[h.chan].txns++;
      s.chStats[h.chan].units += h.qty;
      s.chStats[h.chan].revenue += h.qty * h.price;
      h.voided = false;
      recomputeAfters(s);
      syncHistoryVoidDeletion(h, false);
      showToast('Entry unvoided — effects restored (Sheets row restore queued)');
    }
  } else {
    const e = s.ledger[editCtx.idx];
    if (!e) return;
    const st = s.stores.find(st=>st.id===e.storeId);
    if (!e.voided) {
      // VOID consignment entry
      if (e.type === 'Shipment' && st) { st.sent = Math.max(0,st.sent-e.qty); st.outstanding = Math.max(0,st.outstanding-e.qty); s.stock += e.qty; }
      if (e.type === 'Sale' && st) { st.sold = Math.max(0,st.sold-e.qty); st.outstanding += e.qty; s.sold = Math.max(0,s.sold-e.qty); s.revenue = Math.max(0,s.revenue-e.amountDue); if(e.paid==='pending')st.amountOwed = Math.max(0,st.amountOwed-e.amountDue); if(s.chStats['Consignment']){s.chStats['Consignment'].txns=Math.max(0,s.chStats['Consignment'].txns-1);s.chStats['Consignment'].units=Math.max(0,s.chStats['Consignment'].units-e.qty);s.chStats['Consignment'].revenue=Math.max(0,s.chStats['Consignment'].revenue-e.amountDue);} }
      if (e.type === 'Return' && st) { st.returned = Math.max(0,st.returned-e.qty); st.outstanding += e.qty; if(e.status==='restocked') s.stock = Math.max(0,s.stock-e.qty); }
      e.voided = true;
      syncLedgerVoid(e, true);
      showToast('Consignment entry voided — effects reversed (Sheets row delete queued)', 'warn');
    } else {
      // UNVOID consignment entry
      if (e.type === 'Shipment' && st) { st.sent += e.qty; st.outstanding += e.qty; s.stock = Math.max(0,s.stock-e.qty); }
      if (e.type === 'Sale' && st) { st.sold += e.qty; st.outstanding = Math.max(0,st.outstanding-e.qty); s.sold += e.qty; s.revenue += e.amountDue; if(e.paid==='pending')st.amountOwed += e.amountDue; if(!s.chStats['Consignment'])s.chStats['Consignment']={txns:0,units:0,revenue:0}; s.chStats['Consignment'].txns++;s.chStats['Consignment'].units+=e.qty;s.chStats['Consignment'].revenue+=e.amountDue; }
      if (e.type === 'Return' && st) { st.returned += e.qty; st.outstanding = Math.max(0,st.outstanding-e.qty); if(e.status==='restocked')s.stock += e.qty; }
      e.voided = false;
      syncLedgerVoid(e, false);
      showToast('Consignment entry unvoided — effects restored (Sheets row restore queued)');
    }
  }

  closeM('edit-entry');
  renderAll(); updateDash(); saveState(activeBook);
}

// ── RESET
function resetBookData(){
  const book=getBook();
  if(!confirm(`Reset ALL data for "${book.title}"? Orders, history and consignment will be cleared. Your Google Sheet backup is untouched.`))return;
  if(!confirm('Last chance — this cannot be undone. Reset now?'))return;
  states[activeBook]=defaultState(book);lastSavedHashes[activeBook]='';
  renderAll();saveState(activeBook);showToast('✓ Book data reset. Sheet backup untouched.','warn',4000);
}

// ── MODAL HELPERS
function openM(id){$('m-'+id).style.display='flex';const d=id==='send-books'?'send-date':id==='record-sale'?'sale-date':'ret-date';if($(d))$(d).value=today();}
function closeM(id){$('m-'+id).style.display='none';}
function addLog(lid,msg,type=''){const el=$(lid);el.style.display='block';const s=document.createElement('span');s.className='log-line '+type;s.textContent=new Date().toLocaleTimeString()+' · '+msg;el.appendChild(s);el.scrollTop=el.scrollHeight;}

// ── GOOGLE SHEETS
function updateSheetsBadge(){
  [$('sheets-badge'),$('sheets-badge2')].forEach(b=>{
    if(!b)return;
    b.textContent=sheetsUrl?'📊 Sheets: live':'📊 Sheets: not set up';
    b.className=sheetsUrl?'sheets-badge':'sheets-badge off';
  });
  const openLink=$('sheets-open-link');if(openLink){if(sheetsSpreadsheetUrl){openLink.href=sheetsSpreadsheetUrl;openLink.style.display='';}else openLink.style.display='none';}
  const cardLink=$('open-sheet-link');if(cardLink){if(sheetsSpreadsheetUrl){cardLink.href=sheetsSpreadsheetUrl;cardLink.style.display='';}else cardLink.style.display='none';}
}
function normalizeAppsScriptUrl(rawUrl){
  const cleaned=(rawUrl||'').trim();
  if(!cleaned) return '';
  try{
    const u=new URL(cleaned);
    if(!/script\.google\.com$/i.test(u.hostname)) return '';
    // Support URLs with /u/index/ segments (multi-account login)
    const m=u.pathname.match(/\/macros\/(?:u\/\d+\/)?s\/([^/]+)\/(exec|dev)/i);
    if(!m) return '';
    const deploymentId=m[1];
    const type=m[2];
    
    u.pathname=`/macros/s/${deploymentId}/${type}`;
    u.search='';
    u.hash='';
    return u.toString();
  }catch(_){
    return '';
  }
}
async function probeSheetsConnection(url){
  // 1. Try a GET handshake first (Most reliable for initial verification)
  try {
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json && json.service === 'lyrical-sheets-webhook-v2') {
        return { ok: true, method: 'GET', sheetName: json.sheetName };
      }
    }
  } catch (e) {
    console.warn('GET probe failed', e);
  }

  // 2. Try a POST probe if GET failed or we want to verify write-access
  const probePayload = {
    version: 2,
    eventId: `probe-${Date.now().toString(36)}`,
    sentAt: new Date().toISOString(),
    payload: {
      type: 'order',
      book: 'Connection Probe',
      date: today(),
      num: 'PROBE',
      chan: 'Probe',
      qty: 0,
      price: 0,
      total: 0,
      stockAfter: 0,
      notes: 'Connection probe'
    }
  };
  
  const res = await fetch(url, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(probePayload)
  });
  
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json().catch(() => null);
  if (!json || json.ok !== true) throw new Error('Probe response was not { ok: true }');
  
  return { ok: true, method: 'POST' };
}

async function connectSheets(){
  const rawUrl=$('sheets-url-input').value.trim(),spreadUrl=($('sheets-spreadsheet-input').value||'').trim();
  const normalizedUrl=normalizeAppsScriptUrl(rawUrl);
  if(!normalizedUrl){showToast('Paste a deployed Web App URL (…/macros/s/<id>/exec)','warn');return;}
  if(rawUrl.includes('/dev')) showToast('Using /exec endpoint for public sync (recommended).','warn',3000);
  try{
    const info = await probeSheetsConnection(normalizedUrl);
    showToast(`✓ Connection verified: ${info.sheetName || 'Active'}`);
  }catch(e){
    // If the error is 'Failed to fetch', it's likely a CORS issue.
    // Since we have a no-cors fallback for actual data delivery,
    // let's show a helpful warning but still allow the connection.
    if ((e && e.message && e.message.includes('fetch')) || !navigator.onLine) {
      showToast('⚠ Connection unverified (CORS). Link saved anyway — try a test row.', 'warn', 5000);
    } else {
      showToast(`Connection error: ${e.message || 'Unknown'}`,'err', 4000);
      return;
    }
  }
  sheetsUrl=normalizedUrl;localStorage.setItem('lm-sheets-url',normalizedUrl);
  if(spreadUrl){
    sheetsSpreadsheetUrl=spreadUrl;
    localStorage.setItem('lm-sheets-spreadsheet-url',spreadUrl);
  }else{
    sheetsSpreadsheetUrl='';
    localStorage.removeItem('lm-sheets-spreadsheet-url');
  }
  showSheetsConnected();
  showToast('✓ Google Sheets connected and verified!');
}
function disconnectSheets(){if(!confirm('Disconnect?'))return;sheetsUrl='';sheetsSpreadsheetUrl='';localStorage.removeItem('lm-sheets-url');localStorage.removeItem('lm-sheets-spreadsheet-url');localStorage.removeItem('lm-sheets-secret');$('sheets-setup-card').style.display='';$('sheets-connected-card').style.display='none';updateSheetsBadge();showToast('Sheets disconnected','warn');}
function showSheetsConnected(){$('sheets-setup-card').style.display='none';$('sheets-connected-card').style.display='';$('sheets-url-display').textContent=sheetsUrl;updateSheetsBadge();}
function testSheets(){
  if(!sheetsUrl)return;
  const btn=document.querySelector('[onclick="testSheets()"]');
  if(btn){btn.textContent='Testing…';btn.disabled=true;}
  // Use POST so verification works even when Apps Script has no doGet().
  syncToSheets({
    type:'order',
    book:'Test',
    date:today(),
    num:'TEST-'+Date.now().toString().slice(-4),
    chan:'Test',
    qty:0,
    price:0,
    total:0,
    stockAfter:0,
    notes:'Connection test — check your sheet for this row'
  });
  showToast('✓ Test row sent — check your Google Sheet');
  setTimeout(()=>{if(btn){btn.textContent='Test connection';btn.disabled=false;}},500);
}
// Sheets delivery engine (rebuilt): durable queue + retry + deterministic event IDs
const SHEETS_QUEUE_KEY='lm-sheets-write-queue-v2';
const SHEETS_LOG_KEY='lm-sheets-log-v2';
const MAX_SHEETS_RETRIES=6;
const RETRY_BASE_MS=1200;
let _sheetsQueue=JSON.parse(localStorage.getItem(SHEETS_QUEUE_KEY)||'[]');
let _sheetsWriting=false;
let sheetsLog=JSON.parse(localStorage.getItem(SHEETS_LOG_KEY)||'[]');

function persistSheetsQueue(){ localStorage.setItem(SHEETS_QUEUE_KEY, JSON.stringify(_sheetsQueue)); }
function persistSheetsLog(){ localStorage.setItem(SHEETS_LOG_KEY, JSON.stringify(sheetsLog)); }
function makeEventId(){ return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`; }

// Stamp a stable sheetsId on every existing record that lacks one so future
// edits/voids can be matched against the corresponding sheet row.
// Operates on the in-memory `states` object and persists each touched book.
async function backfillSheetsIds() {
  let hist = 0, ledger = 0, transfers = 0;
  const touched = new Set();
  for (const bookId of Object.keys(states || {})) {
    const s = states[bookId];
    if (!s) continue;
    let dirty = false;
    if (Array.isArray(s.hist)) {
      for (const h of s.hist) if (!h.sheetsId) { h.sheetsId = makeEventId(); hist++; dirty = true; }
    }
    if (Array.isArray(s.ledger)) {
      for (const e of s.ledger) if (!e.sheetsId) { e.sheetsId = makeEventId(); ledger++; dirty = true; }
    }
    if (Array.isArray(s.artistTransfers)) {
      for (const t of s.artistTransfers) if (!t.sheetsId) { t.sheetsId = makeEventId(); transfers++; dirty = true; }
    }
    if (dirty) touched.add(bookId);
  }
  for (const bookId of touched) await saveState(bookId);
  return { hist, ledger, transfers, books: touched.size };
}
window.backfillSheetsIds = backfillSheetsIds;

async function backfillAndResync() {
  if (!sheetsUrl) { showToast('Connect Google Sheets first', 'warn'); return; }
  if (!confirm(
    'This will:\n' +
    '1. Stamp a stable ID on every record missing one\n' +
    '2. Re-send every record to Sheets so existing rows get the new ID\n' +
    '   (the backend will replace duplicates rather than create them)\n\n' +
    'Continue?'
  )) return;
  const counts = await backfillSheetsIds();
  showToast(`Stamped IDs on ${counts.hist + counts.ledger + counts.transfers} record(s) across ${counts.books} book(s)`);
  if (typeof pushAllToSheets === 'function') pushAllToSheets();
}
window.backfillAndResync = backfillAndResync;
function retryDelayMs(attempt){ return Math.min(60000, RETRY_BASE_MS * Math.pow(2, Math.max(0,attempt-1))); }

async function postToSheets(body){
  const payload = JSON.stringify(body);
  
  try{
    const res=await fetch(sheetsUrl,{
      method:'POST',
      mode:'cors',
      headers:{
        'Content-Type':'text/plain;charset=utf-8'
      },
      body:payload
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(()=>null);
    if (data && data.ok) return data;
    if (data && data.error) throw new Error(data.error);
    return { ok: true };
  }catch(e){
    // Fallback to no-cors for strict environments.
    await fetch(sheetsUrl, {
      method:'POST',
      mode:'no-cors',
      headers:{
        'Content-Type':'text/plain;charset=utf-8'
      },
      body:payload
    });
    return 'unknown';
  }
}

async function notifyPublisherSubmission(kind, data, summary){
  if(!sheetsUrl) return;
  try{
    const book = (typeof getBook === 'function') ? getBook() : (BOOKS && BOOKS[activeBook]) || {};
    await postToSheets({
      version: 2,
      action: 'notifyPublisher',
      eventId: 'notify-' + Date.now(),
      payload: {
        action: 'notifyPublisher',
        kind,
        bookId: activeBook,
        bookTitle: book.title || activeBook || '',
        authorEmail: book.authorEmail || '',
        submittedAt: new Date().toISOString(),
        summary: summary || '',
        data
      }
    });
  }catch(e){ console.warn('notifyPublisher failed', e); }
}

async function _processQueue(){
  if(_sheetsWriting||!_sheetsQueue.length||!sheetsUrl||!navigator.onLine)return;
  _sheetsWriting=true;
  const item=_sheetsQueue[0];
  try{
    const resp = await postToSheets({
      version:2,
      eventId:item.id,
      action:item.payload && item.payload.action,
      sentAt:new Date().toISOString(),
      payload:item.payload
    });
    const replaced = resp && typeof resp.replaced === 'number' ? resp.replaced : 0;
    const removed  = resp && typeof resp.removed  === 'number' ? resp.removed  : 0;
    let suffix = '';
    if (item.payload && (item.payload.action === 'delete' || item.payload.action === 'void')) {
      suffix = removed ? ` · removed ${removed}` : ' · row not found';
    } else if (replaced > 0) {
      suffix = ` · replaced ${replaced}`;
    }
    addSheetsLog(item.book,item.type,item.summary+suffix,'ok');
    _sheetsQueue.shift();
    persistSheetsQueue();
    updateBulkProgress();
  }catch(e){
    item.attempts=(item.attempts||0)+1;
    item.lastError=(e&&e.message)||'network error';
    item.nextTryAt=Date.now()+retryDelayMs(item.attempts);
    persistSheetsQueue();
    if(item.attempts>=MAX_SHEETS_RETRIES){
      addSheetsLog(item.book,item.type,item.summary+' [max retries reached]','err');
      _sheetsQueue.shift();
      persistSheetsQueue();
      updateBulkProgress();
    }else{
      addSheetsLog(item.book,item.type,item.summary+` [retry ${item.attempts}/${MAX_SHEETS_RETRIES}]`,'retry');
    }
  }
  _sheetsWriting=false;
  const next=_sheetsQueue[0];
  if(next){
    const wait=Math.max(250, (next.nextTryAt||0)-Date.now());
    setTimeout(_processQueue, wait);
  }
}

function syncToSheets(payload){
  if(!sheetsUrl)return;
  const summary=payload.type==='order'
    ?`${payload.num} · ${payload.chan} · ${payload.qty}×`
    :`${payload.store} · ${payload.event} · ${payload.qty}×`;
  // Use the record's own sheetsId as the queue id so the backend can match
  // and replace the row; fall back to a fresh id for first-time writes.
  const queueId = payload.sheetsId || makeEventId();
  _sheetsQueue.push({
    id: queueId,
    payload,
    summary,
    book:payload.book,
    type:payload.type==='order'?'Order':'Consignment',
    attempts:0,
    nextTryAt:Date.now()
  });
  persistSheetsQueue();
  addSheetsLog(payload.book,payload.type==='order'?'Order':'Consignment',summary,'queued');
  _processQueue();
}

let _isBulkSync = false;
let _bulkTotal = 0;
let _bulkDone = 0;

async function pushAllToSheets() {
  if(!sheetsUrl) { showToast('Connect Google Sheets first','warn'); return; }
  if(!confirm('This will enqueue all historical records for all books, then deliver them with retry. Continue?')) return;

  const btn = $('push-all-btn');
  const bar = $('sync-progress-bar');
  const fill = $('sync-progress-fill');
  const stats = $('sync-stats');

  _isBulkSync = true;
  if (btn) btn.disabled = true;
  btn.textContent = 'Queueing...';
  bar.style.display = 'block';
  stats.style.display = 'block';
  fill.style.width = '0%';

  const toSync = [];
  Object.keys(BOOKS).forEach(bid => {
    const s = states[bid] || defaultState(BOOKS[bid]);
    const book = BOOKS[bid];
    const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
    (s.hist || []).forEach(h => {
      if (h.consignmentLink) return; // ledger is the canonical row
      const totalNative = h.qty * h.price;
      let cadEquiv = '';
      if (nativeCur === 'CAD') cadEquiv = totalNative;
      else if (h.payment && h.payment.currency === 'CAD' && h.payment.amount) cadEquiv = h.payment.amount;
      toSync.push({
        type:'order', book:book.title, date:h.date, num:h.num, chan:h.chan,
        qty: h.voided ? 0 : h.qty, price:h.price, total: h.voided ? 0 : totalNative, stockAfter:h.after,
        notes:(h.voided?'[VOID] ':'')+(h.notes||''),
        sheetsId: h.sheetsId || '',
        currency: nativeCur,
        paymentCurrency: normalizeCurrencyCode(h.payment?.currency || nativeCur, 'CAD'),
        paymentAmount: h.payment?.amount ?? totalNative,
        paymentRate: h.payment?.rate ?? '',
        convertedTotal: h.voided ? '' : cadEquiv,
        status: h.voided ? 'VOID' : 'OK'
      });
    });
    (s.ledger || []).forEach(e => {
      const ledgerCur = normalizeCurrencyCode(book.currency, 'CAD');
      const totalNative = e.amountDue || 0;
      let cadEquiv = '';
      if (ledgerCur === 'CAD') cadEquiv = totalNative;
      toSync.push({
        type:'consignment', book:book.title, date:e.date, store:e.storeName,
        event:e.type, qty: e.voided ? 0 : e.qty, rate:e.rate, amountDue: e.voided ? 0 : totalNative,
        notes:(e.voided?'[VOID] ':'')+(e.notes||''), status: e.voided ? 'VOID' : e.status,
        sheetsId: e.sheetsId || '',
        currency: ledgerCur,
        convertedTotal: e.voided ? '' : cadEquiv
      });
    });
  });

  _bulkTotal = toSync.length;
  _bulkDone = 0;

  if(_bulkTotal === 0) {
    showToast('No records found to sync','warn');
    _isBulkSync = false;
    if (btn) btn.disabled = false;
    btn.textContent = 'Sync all data';
    bar.style.display = 'none';
    stats.style.display = 'none';
    return;
  }

  stats.textContent = `Queueing ${_bulkTotal} records...`;
  for(const row of toSync) syncToSheets(row);
  btn.textContent = 'Syncing...';
}

function updateBulkProgress() {
  if(!_isBulkSync) return;
  _bulkDone++;
  const pct = Math.min(100, (_bulkDone / _bulkTotal) * 100);
  const fill = $('sync-progress-fill');
  const stats = $('sync-stats');
  const btn = $('push-all-btn');

  if(fill) fill.style.width = pct + '%';
  if(stats) stats.textContent = `Syncing: ${_bulkDone} / ${_bulkTotal} (${Math.round(pct)}%)`;

  if(_bulkDone >= _bulkTotal) {
    _isBulkSync = false;
    if(btn) { btn.disabled = false; btn.textContent = 'Sync all data'; }
    if(stats) stats.textContent = `✓ Queue processed: ${_bulkTotal} records.`;
    showToast(`✓ Sheets queue processed: ${_bulkTotal} records.`);
    setTimeout(() => {
      if(!_isBulkSync) {
        if($('sync-progress-bar')) $('sync-progress-bar').style.display = 'none';
        if($('sync-stats')) $('sync-stats').style.display = 'none';
      }
    }, 4000);
  }
}

function addSheetsLog(book,type,summary,status){
  sheetsLog.unshift({time:new Date().toLocaleTimeString(),book,type,summary,status});
  if(sheetsLog.length>120)sheetsLog.pop();
  persistSheetsLog();
  renderSheetsLog();
}
let _syncLogPage = 0;
function renderSheetsLog(){
  const b=$('sheets-log-body');
  if(!b) return;
  if(!sheetsLog.length){
    b.innerHTML='<tr><td colspan="5" class="sheets-empty">No sync events yet.</td></tr>';
    return;
  }
  const PAGE_SIZE=15;
  const totalPages=Math.ceil(sheetsLog.length/PAGE_SIZE);
  if(_syncLogPage>=totalPages) _syncLogPage=Math.max(0,totalPages-1);
  const pageItems=sheetsLog.slice(_syncLogPage*PAGE_SIZE, (_syncLogPage+1)*PAGE_SIZE);

  const labelFor=(st)=> st==='ok'?'Written':st==='unknown'?'Sent (unverified)':st==='queued'?'Queued':st==='retry'?'Retrying':'Failed';
  const classFor=(st)=> st==='ok'||st==='unknown'?'ok':st==='queued'||st==='retry'?'syncing':'err';
  const iconFor=(st)=> st==='ok'?'✓':st==='unknown'?'~':st==='queued'?'…':st==='retry'?'↻':'⚠';

  let html=pageItems.map(l=>`<tr>
      <td class="sheets-time">${l.time}</td>
      <td class="sheets-book">${l.book}</td>
      <td><span class="sheets-type">${l.type}</span></td>
      <td class="sheets-summary">${l.summary}</td>
      <td>
        <span class="log-status ${classFor(l.status)}"></span>
        <span class="sheets-status ${classFor(l.status)}">${iconFor(l.status)} ${labelFor(l.status)}</span>
      </td>
    </tr>`).join('');

  if(totalPages>1){
    html+=`<tr><td colspan="5" class="sheets-pager">
      <button class="btn sm" onclick="_syncLogPage=Math.max(0,_syncLogPage-1);renderSheetsLog()" ${_syncLogPage===0?'disabled':''}>← Prev</button>
      <span class="sheets-page-label">Page ${_syncLogPage+1} of ${totalPages}</span>
      <button class="btn sm" onclick="_syncLogPage=Math.min(${totalPages-1},_syncLogPage+1);renderSheetsLog()" ${_syncLogPage===totalPages-1?'disabled':''}>Next →</button>
    </td></tr>`;
  }
  b.innerHTML=html;
}
function copyGasCode(){navigator.clipboard.writeText($('gas-code').textContent).then(()=>showToast('✓ Code copied!'));}
async function verifyUrl(){
  if(!sheetsUrl)return;
  const btn=$('verify-url-btn');
  if(btn){ btn.textContent='Verifying...'; btn.disabled=true; }
  
  try {
    // Try a GET request first to see if the endpoint is alive
    const res = await fetch(sheetsUrl);
    if(res.ok) {
      const data = await res.json();
      if(data && data.service === 'lyrical-sheets-webhook-v2') {
        showToast(`✓ Connection verified: ${data.sheetName || 'Active'}`);
        addSheetsLog('System', 'Verify', 'Handshake successful', 'ok');
      } else {
        showToast('⚠ Unexpected response from URL', 'warn');
      }
    } else {
       // If GET fails but URL looks right, it might be a POST-only deployment or CORS
       showToast('Queuing test row (GET unverified)', 'warn');
    }
  } catch(e) {
    showToast('Queuing test row (Network check failed)', 'warn');
  }

  syncToSheets({
    type:'order',book:'Test',date:today(),num:'VERIFY-'+Date.now().toString().slice(-4),
    chan:'Verify URL',qty:0,price:0,total:0,stockAfter:0,notes:'Verify URL button test'
  });
  
  setTimeout(() => { if(btn){ btn.textContent='↗ Verify URL'; btn.disabled=false; } }, 1000);
}
window.addEventListener('online',()=>_processQueue());
setTimeout(()=>_processQueue(),300);

// ── DATA BACKUPS & PORTABILITY
function backupFileName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `lyrical-backup-${stamp}.json`;
}

async function openBackupHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BACKUP_FOLDER_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(BACKUP_FOLDER_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveBackupFolderHandle(handle) {
  const db = await openBackupHandleDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUP_FOLDER_STORE, 'readwrite');
    tx.objectStore(BACKUP_FOLDER_STORE).put(handle, BACKUP_FOLDER_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadBackupFolderHandle() {
  const db = await openBackupHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUP_FOLDER_STORE, 'readonly');
    const req = tx.objectStore(BACKUP_FOLDER_STORE).get(BACKUP_FOLDER_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function updateBackupFolderDisplay(text) {
  const el = $('backup-folder-display');
  if (el) el.textContent = text;
}

async function writeBackupToChosenFolder(data, filename) {
  if (!('showDirectoryPicker' in window)) return false;
  try {
    const dirHandle = await loadBackupFolderHandle();
    if (!dirHandle) return false;
    const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
    const result = permission === 'granted' ? permission : await dirHandle.requestPermission({ mode: 'readwrite' });
    if (result !== 'granted') return false;

    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    updateBackupFolderDisplay(`Backup folder: ${dirHandle.name}`);
    return true;
  } catch (e) {
    console.warn('Direct backup write failed', e);
    return false;
  }
}

async function chooseBackupFolder() {
  if (!('showDirectoryPicker' in window)) {
    showToast('Folder selection is not supported in this browser', 'warn');
    return;
  }
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveBackupFolderHandle(dirHandle);
    updateBackupFolderDisplay(`Backup folder: ${dirHandle.name}`);
    showToast('✓ Backup folder saved');
  } catch (e) {
    if (e?.name !== 'AbortError') showToast('Could not save backup folder', 'err');
  }
}

// ── LOCAL RECEIPT FILING
async function openReceiptHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(RECEIPT_FOLDER_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(RECEIPT_FOLDER_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveReceiptFolderHandle(handle) {
  const db = await openReceiptHandleDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(RECEIPT_FOLDER_STORE, 'readwrite');
    tx.objectStore(RECEIPT_FOLDER_STORE).put(handle, RECEIPT_FOLDER_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadReceiptFolderHandle() {
  const db = await openReceiptHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECEIPT_FOLDER_STORE, 'readonly');
    const req = tx.objectStore(RECEIPT_FOLDER_STORE).get(RECEIPT_FOLDER_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function setupReceiptFolder() {
  if (!('showDirectoryPicker' in window)) {
    showToast('Folder selection is not supported in this browser', 'warn');
    return;
  }
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveReceiptFolderHandle(dirHandle);
    renderTaxCenter();
    showToast('✓ Receipt folder connected');
  } catch (e) {
    if (e?.name !== 'AbortError') showToast('Could not save folder', 'err');
  }
}

async function authorizeReceiptFolder() {
  const handle = await loadReceiptFolderHandle();
  if (!handle) return;
  try {
    if (await handle.requestPermission({ mode: 'readwrite' }) === 'granted') {
      renderTaxCenter();
      showToast('✓ Folder access authorized');
    }
  } catch (e) {
    showToast('⚠ Authorization failed', 'err');
  }
}

async function saveReceiptToLocalFile(file, subfolderName = '') {
  const dirHandle = await loadReceiptFolderHandle();
  if (!dirHandle) return null;
  try {
    const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && await dirHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') return null;
    
    const receiptsDir = await dirHandle.getDirectoryHandle('receipts', { create: true });
    
    let targetDir = receiptsDir;
    if (subfolderName) {
      targetDir = await receiptsDir.getDirectoryHandle(subfolderName, { create: true });
    }

    const stamp = new Date().toISOString().split('T')[0];
    const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const filename = `${stamp}_${cleanName}`;
    
    const fileHandle = await targetDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();
    
    return subfolderName ? `local://${subfolderName}/${filename}` : `local://${filename}`;
  } catch (e) {
    console.error('Local receipt save failed', e);
    return null;
  }
}

async function viewLocalReceipt(path) {
  const dirHandle = await loadReceiptFolderHandle();
  if (!dirHandle) { showToast('⚠ Receipt folder not connected', 'warn'); return; }
  try {
    const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && await dirHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') return;
    
    const receiptsDir = await dirHandle.getDirectoryHandle('receipts');
    let fileHandle;
    
    if (path.includes('/')) {
      const [subfolder, filename] = path.split('/');
      const subDir = await receiptsDir.getDirectoryHandle(subfolder);
      fileHandle = await subDir.getFileHandle(filename);
    } else {
      fileHandle = await receiptsDir.getFileHandle(path);
    }

    const file = await fileHandle.getFile();
    const url = URL.createObjectURL(file);
    window.open(url, '_blank');
  } catch (e) {
    console.error('Failed to open local receipt', e);
    showToast('⚠ Could not find or open local file', 'err');
  }
}

async function initializeBackupFolderDisplay() {
  if (!('showDirectoryPicker' in window)) {
    updateBackupFolderDisplay('Backup folder: Browser Downloads (folder picker not supported)');
    return;
  }
  try {
    const dirHandle = await loadBackupFolderHandle();
    updateBackupFolderDisplay(dirHandle ? `Backup folder: ${dirHandle.name}` : 'Backup folder: Browser Downloads (default)');
    
    // Auto-sync receipts if publisher and folder connected
    if (window.IS_PUBLISHER && dirHandle) {
      setTimeout(() => syncAllReceipts(), 2000); // Wait for initial app load
    }
  } catch (e) {
    updateBackupFolderDisplay('Backup folder: Browser Downloads (default)');
  }
}

async function syncAllReceipts() {
  if (!window.IS_PUBLISHER) return;
  const dirHandle = await loadReceiptFolderHandle();
  if (!dirHandle) return;

  let totalSynced = 0;

  // 1. Sync Tax Center Business Expenses
  if (TAX_CENTER.businessExpenses) {
    for (let exp of TAX_CENTER.businessExpenses) {
      if (exp.receipt && exp.receipt.startsWith('http')) {
        const localPath = await downloadAndLocalizeReceipt(exp.receipt, 'Business');
        if (localPath) {
          exp.receipt = localPath;
          totalSynced++;
        }
      }
    }
    if (totalSynced > 0) saveTaxCenter();
  }

  // 2. Sync Per-Book Expenses
  for (const bid in BOOKS) {
    const book = BOOKS[bid];
    const state = await window._fbLoad(bid);
    if (!state || !state.expenses) continue;

    let bookSynced = 0;
    for (let exp of state.expenses) {
      if (exp.receipt && exp.receipt.startsWith('http')) {
        const localPath = await downloadAndLocalizeReceipt(exp.receipt, book.title || bid);
        if (localPath) {
          exp.receipt = localPath;
          bookSynced++;
          totalSynced++;
        }
      }
    }
    if (bookSynced > 0) {
      await window._fbSave(bid, JSON.stringify(state));
    }
  }

  if (totalSynced > 0) {
    showToast(`✓ Synced ${totalSynced} receipts to local folder`);
    renderTaxCenter();
  }
}

async function downloadAndLocalizeReceipt(url, projectName) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    
    // Create a pseudo-file object for our saver
    const filename = url.split('%2F').pop().split('?')[0]; 
    const file = new File([blob], filename, { type: blob.type });

    // Save locally
    const localRef = await saveReceiptToLocalFile(file, projectName.replace(/[^a-zA-Z0-9.\-_]/g, '_'));
    
    if (localRef) {
      // DELETE from cloud now that it's safe locally
      await window._fbDeleteReceipt(url);
      return localRef.replace('local://', '');
    }
  } catch (e) {
    console.error("Sync failed for", url, e);
  }
  return null;
}

async function exportToJSON() {
  const data = buildBackupPayload();
  const filename = backupFileName();
  const savedToFolder = await writeBackupToChosenFolder(data, filename);

  if (!savedToFolder) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  
  localStorage.setItem('lm-last-backup-ts', Date.now().toString());
  updateLastBackupDisplay();
  if($('backup-reminder')) $('backup-reminder').style.display = 'none';
  showToast(savedToFolder ? '✓ JSON backup saved to your selected folder' : '✓ JSON backup downloaded');
}

function maybeAutoDownloadDailyBackup() {
  // Auto-download once per calendar day (local time) when app is opened.
  // This still requires the app to be open on that day.
  const todayKey = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
  const lastAutoDay = localStorage.getItem('lm-last-auto-backup-day');
  if (lastAutoDay === todayKey) return;

  const lastManualOrAutoTs = parseInt(localStorage.getItem('lm-last-backup-ts') || '0', 10);
  if (Number.isFinite(lastManualOrAutoTs) && lastManualOrAutoTs > 0) {
    const lastDate = new Date(lastManualOrAutoTs).toLocaleDateString('sv-SE');
    if (lastDate === todayKey) {
      localStorage.setItem('lm-last-auto-backup-day', todayKey);
      return;
    }
  }

  exportToJSON();
  localStorage.setItem('lm-last-auto-backup-day', todayKey);
}

function updateLastBackupDisplay() {
  const ts = localStorage.getItem('lm-last-backup-ts');
  const el = $('last-backup-display');
  if (!el) return;
  if (!ts) { el.textContent = 'Last backup: Never'; return; }
  const date = new Date(parseInt(ts));
  el.textContent = `Last backup: ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
}

function checkDailyBackup() {
  const ts = localStorage.getItem('lm-last-backup-ts');
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  
  if (!ts || (now - parseInt(ts)) > ONE_DAY) {
    if($('backup-reminder')) $('backup-reminder').style.display = 'flex';
  } else {
    if($('backup-reminder')) $('backup-reminder').style.display = 'none';
  }
}

function buildBackupPayload() {
  return {
    version: '2.5',
    timestamp: new Date().toISOString(),
    BOOKS: BOOKS,
    states: states,
    TAX_CENTER: TAX_CENTER,
    productionCosts: JSON.parse(localStorage.getItem('lm-production-costs') || '{}'),
    paymentLinks: JSON.parse(localStorage.getItem('lm-payment-links') || '{}')
  };
}

async function saveSystemBackups() {
  await window._fbSaveSettings(SYSTEM_BACKUP_KEY, systemBackups);
}

async function loadSystemBackups() {
  try {
    const stored = await window._fbLoadSettings(SYSTEM_BACKUP_KEY);
    systemBackups = Array.isArray(stored) ? stored : [];
  } catch (e) {
    systemBackups = [];
  }
  renderSystemBackups();
}

let _sysBackupPage = 0;
function renderSystemBackups() {
  const body = $('system-backup-list');
  const status = $('system-backup-status');
  if (!body) return;

  if (!systemBackups.length) {
    body.innerHTML = '<tr><td colspan="4"><div class="empty-state">No system backups yet.</div></td></tr>';
    if (status) status.textContent = 'No automatic backups yet.';
    return;
  }

  const sorted = [...systemBackups].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  if(_sysBackupPage >= totalPages) _sysBackupPage = Math.max(0, totalPages - 1);
  const pageItems = sorted.slice(_sysBackupPage * PAGE_SIZE, (_sysBackupPage + 1) * PAGE_SIZE);

  let html = pageItems.map(b => `
    <tr>
      <td>${new Date(b.createdAt).toLocaleString()}</td>
      <td>${b.type === 'manual' ? 'Manual' : 'Auto daily'}</td>
      <td class="r">${Object.keys(b.snapshot?.BOOKS || {}).length}</td>
      <td class="r"><button class="btn sm" onclick="restoreSystemBackup('${b.id}')">Restore</button></td>
    </tr>
  `).join('');

  if(totalPages > 1){
    html+=`<tr><td colspan="4" style="text-align:center;padding:1rem;background:rgba(0,0,0,.15);">
      <button class="btn sm" onclick="_sysBackupPage=Math.max(0,_sysBackupPage-1);renderSystemBackups()" ${_sysBackupPage===0?'disabled':''}>← Prev</button>
      <span style="margin:0 15px;font-size:12px;color:var(--text2);font-family:'DM Mono',monospace;">Page ${_sysBackupPage+1} of ${totalPages}</span>
      <button class="btn sm" onclick="_sysBackupPage=Math.min(${totalPages-1},_sysBackupPage+1);renderSystemBackups()" ${_sysBackupPage===totalPages-1?'disabled':''}>Next →</button>
    </td></tr>`;
  }
  body.innerHTML = html;

  const latest = sorted[0];
  if (status) status.textContent = `Latest system backup: ${new Date(latest.createdAt).toLocaleString()}`;
}

async function createSystemBackup(type = 'auto') {
  const dayKey = today();
  if (type === 'auto' && systemBackups.some(b => b.dayKey === dayKey)) return false;

  const entry = {
    id: `sb-${Date.now()}`,
    dayKey,
    type,
    createdAt: Date.now(),
    snapshot: buildBackupPayload()
  };
  systemBackups.unshift(entry);
  if (systemBackups.length > SYSTEM_BACKUP_LIMIT) {
    systemBackups = systemBackups.slice(0, SYSTEM_BACKUP_LIMIT);
  }
  await saveSystemBackups();
  renderSystemBackups();
  return true;
}

async function ensureDailySystemBackup() {
  if (!isPublisherSession() || isAuthor()) return;
  await loadSystemBackups();
  const created = await createSystemBackup('auto');
  if (created) showToast('✓ Daily system backup created');
}

async function createSystemBackupNow() {
  await loadSystemBackups();
  await createSystemBackup('manual');
  showToast('✓ System backup created');
}

async function applyBackupData(data) {
  // 1. Restore Catalog
  BOOKS = data.BOOKS;
  // Rebuild the default-deletion tombstones from the restored catalog so
  // defaults missing from the backup don't reappear after the next load.
  deletedDefaultIds = Object.keys(DEFAULT_BOOKS).filter(id => !BOOKS[id]);
  await saveCatalogWithDeletions();

  // 2. Restore individual book states
  for (const bid in data.states) {
    await window._fbSave(bid, JSON.stringify(data.states[bid]));
  }

  // 3. Tax Center
  if (data.TAX_CENTER) {
    TAX_CENTER = data.TAX_CENTER;
    await saveTaxCenter();
  }

  // 4. Metadata
  if (data.productionCosts) {
    await window._fbSaveSettings('productionCosts', data.productionCosts);
    localStorage.setItem('lm-production-costs', JSON.stringify(data.productionCosts));
  }
  if (data.paymentLinks) {
    await window._fbSaveSettings('paymentLinks', data.paymentLinks);
    localStorage.setItem('lm-payment-links', JSON.stringify(data.paymentLinks));
  }
}

async function restoreSystemBackup(id) {
  const backup = systemBackups.find(b => b.id === id);
  if (!backup || !backup.snapshot) return;
  if (!confirm('Restore this system backup? This will OVERWRITE your current database and reload the app.')) return;
  try {
    await applyBackupData(backup.snapshot);
    showToast('✓ System backup restored! Reloading...');
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    console.error('System restore failed', e);
    showToast('Error restoring system backup', 'err');
  }
}

async function handleBackupImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const info = $('import-info');
  if (info) info.textContent = `Reading ${file.name}...`;
  
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (!data.BOOKS || !data.states) throw new Error('Invalid backup format: Missing core data');
      
      if (!confirm('Are you sure? This will OVERWRITE your entire existing database and reload the app.')) {
        if (info) info.textContent = 'Import cancelled';
        return;
      }
      
      await applyBackupData(data);
      
      showToast('✓ Restore successful! Reloading...');
      setTimeout(() => location.reload(), 1500);
      
    } catch (err) {
      console.error('Import failed', err);
      showToast('Error: Invalid backup file', 'err');
      if (info) info.textContent = 'Import failed (invalid file)';
    }
  };
  reader.readAsText(file);
}

function exportAllToCSV() {
  const rows = [[
    'Logged At',
    'Event ID',
    'Book',
    'Type',
    'Date',
    'Reference',
    'Channel/Store',
    'Qty',
    'Price/Rate',
    'Total/Amount Due',
    'Payment Currency',
    'Payment Amount',
    'FX Rate',
    'Converted Total',
    'Stock After',
    'Status',
    'Notes'
  ]];
  const loggedAt = new Date().toISOString();
  
  Object.keys(BOOKS).forEach(bid => {
    const s = states[bid] || defaultState(BOOKS[bid]);
    const bookTitle = BOOKS[bid].title;
    
    // History
    (s.hist || []).forEach(h => {
      rows.push([
        loggedAt,
        h.id || '',
        bookTitle,
        'Order',
        h.date || '',
        h.num || '',
        h.chan || '',
        h.qty ?? '',
        h.price ?? '',
        (h.qty || 0) * (h.price || 0),
        h.payment?.currency || '',
        h.payment?.amount ?? '',
        h.payment?.rate ?? '',
        h.payment?.convertedTotal ?? '',
        h.after ?? '',
        h.voided ? 'VOID' : 'OK',
        h.notes || ''
      ]);
    });
    
    // Ledger
    (s.ledger || []).forEach(l => {
      rows.push([
        loggedAt,
        l.id || '',
        bookTitle,
        'Consignment',
        l.date || '',
        l.event || l.type || '',
        l.storeName || '',
        l.qty ?? '',
        l.rate ?? '',
        l.amountDue ?? '',
        '',
        '',
        '',
        '',
        '',
        l.status || (l.voided ? 'VOID' : 'OK'),
        l.notes || ''
      ]);
    });

    // Expenses
    (s.expenses || []).forEach(e => {
      rows.push([
        loggedAt,
        e.id || '',
        bookTitle,
        'Expense',
        e.date || '',
        e.cat || 'Expense',
        e.ref || '',
        '',
        '',
        e.amount ?? '',
        '',
        '',
        '',
        '',
        '',
        e.received ? 'RECEIVED' : 'PENDING',
        e.desc || ''
      ]);
    });
  });
  
  if (rows.length === 1) { showToast('No records to export', 'warn'); return; }
  
  const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lyrical-records-export-${today()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  showToast('✓ CSV Export downloaded');
}

// ── PAYMENT LINKS
function renderProductionCostFields(){
  const container=$('production-cost-fields');
  if(!container)return;
  container.innerHTML=Object.values(BOOKS).map(book=>`
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;min-width:220px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${book.accent};flex-shrink:0;"></div>
        <span style="font-size:13px;font-weight:600;color:var(--text);">${book.title}</span>
        <span style="font-size:11px;color:var(--text3);">${book.currency}</span>
      </div>
      <div class="form-group" style="flex:1;margin:0;">
        <div class="price-wrap">
          <span class="sym">${book.currency}</span>
          <input type="number" id="pc-${book.id}" value="${book.productionCost||''}" placeholder="0.00" step="0.01" min="0">
        </div>
      </div>
    </div>`).join('');
}

async function saveProductionCosts(){
  const stored={};
  Object.values(BOOKS).forEach(book=>{
    const inp=$('pc-'+book.id);
    if(inp){
      const previousCost = book.productionCost || 0;
      const val=parseFloat(inp.value)||0;
      book.productionCost=val;
      stored[book.id]=val;

      // Keep the first break-even tier aligned when it still represents production-cost recovery.
      if (Array.isArray(book.profitTiers) && book.profitTiers.length > 0) {
        const firstTier = book.profitTiers[0];
        const tierLabel = (firstTier?.label || '').toLowerCase();
        const shouldSyncThreshold =
          firstTier?.revenueUpTo !== null &&
          (Math.abs((firstTier.revenueUpTo || 0) - previousCost) < 0.0001 || tierLabel.includes('break-even'));

        if (shouldSyncThreshold) firstTier.revenueUpTo = val;
      }
    }
  });
  // Save to Firebase + localStorage fallback
  try{ await window._fbSaveSettings('productionCosts', stored); }catch(_){}
  localStorage.setItem('lm-production-costs',JSON.stringify(stored));
  // Persist synced profitTiers so the threshold survives a page reload
  try{ await saveCatalogWithDeletions(); }catch(_){}
  showToast('✓ Break-even targets saved');
  if(activeBook&&activeBook!=='all') updateDash();
  else updateAllOverview();
}

async function loadProductionCosts(){
  try{
    // Try Firebase first
    const stored = await window._fbLoadSettings('productionCosts');
    if(stored){ Object.values(BOOKS).forEach(b=>{ if(stored[b.id]!=null) b.productionCost=stored[b.id]; }); return; }
  }catch(_){}
  // Fallback to localStorage
  try{
    const stored=JSON.parse(localStorage.getItem('lm-production-costs')||'{}');
    Object.values(BOOKS).forEach(b=>{ if(stored[b.id]!=null) b.productionCost=stored[b.id]; });
  }catch(_){}
}

function renderPaymentLinkFields(){
  const container=$('payment-link-fields');
  if(!container)return;
  container.innerHTML=Object.values(BOOKS).map(book=>`
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;min-width:200px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${book.accent};flex-shrink:0;"></div>
        <span style="font-size:13px;font-weight:600;color:var(--text);">${book.title}</span>
      </div>
      <div class="form-group" style="flex:1;margin:0;">
        <input type="text" id="pl-${book.id}" value="${book.paymentLink||''}" placeholder="https://paypal.me/… or email@interac.ca">
      </div>
    </div>`).join('');
}

async function savePaymentLinks(){
  Object.values(BOOKS).forEach(book=>{
    const inp=$('pl-'+book.id);
    if(inp) book.paymentLink=inp.value.trim();
  });
  const stored={};
  Object.values(BOOKS).forEach(b=>stored[b.id]=b.paymentLink||'');
  // Save to Firebase (syncs across all devices) + localStorage as fallback
  try{ await window._fbSaveSettings('paymentLinks', stored); }catch(_){}
  localStorage.setItem('lm-payment-links',JSON.stringify(stored));
  showToast('✓ Payment links saved');
  if(activeBook&&activeBook!=='all') renderArtistTransfers();
}

async function loadPaymentLinks(){
  try{
    // Try Firebase first
    const stored = await window._fbLoadSettings('paymentLinks');
    if(stored){ Object.values(BOOKS).forEach(b=>{ if(stored[b.id]) b.paymentLink=stored[b.id]; }); return; }
  }catch(_){}
}

// ── PROFIT SHARING LOGIC
let psActiveBookId = null;

function renderProfitSettings() {
  if (isAuthor()) return;
  const card = $('profit-sharing-settings-card');
  if (!card) return;
  card.style.display = '';

  // Re-render the selector every time, but preserve the current selection
  const selectorCont = $('ps-book-selector-container');
  if (selectorCont) {
    const currentVal = psActiveBookId || '';
    selectorCont.innerHTML = `
      <select id="ps-book-selector">
        <option value="">Select a book...</option>
        ${Object.values(BOOKS).map(b => `<option value="${b.id}" ${b.id===currentVal?'selected':''}>${b.title}</option>`).join('')}
      </select>
    `;
    const sel = $('ps-book-selector');
    if (sel) {
      sel.addEventListener('change', () => {
        psActiveBookId = sel.value || null;
        renderProfitTierList();
      });
    }
  }

  renderProfitTierList();
}

function renderProfitTierList() {
  const list = $('profit-tier-list');
  if (!list) return;

  list.innerHTML = '';

  if (!psActiveBookId || !BOOKS[psActiveBookId]) {
    list.innerHTML = '<div class="empty-state">Select a book to manage profit tiers.</div>';
    return;
  }

  const book = BOOKS[psActiveBookId];
  if (!book.profitTiers) book.profitTiers = [];
  const tiers = book.profitTiers;
  const cur = book.currency || '€';

  if (tiers.length === 0) {
    list.innerHTML = '<div class="empty-state">No tiers defined yet. Click "+ Add Tier" to start. The first tier typically covers the period before production costs are recovered.</div>';
    return;
  }

  tiers.forEach((t, i) => {
    const isLast = i === tiers.length - 1;
    const row = document.createElement('div');
    row.style.cssText = 'display:grid; grid-template-columns: 2fr 1.5fr 1fr auto; gap:10px; align-items:end; background:var(--cream2); padding:12px; border-radius:var(--r2); border:1px solid var(--border);';

    function makeField(labelText, type, val, onChange) {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';
      wrap.style.margin = '0';
      const lbl = document.createElement('label');
      lbl.textContent = labelText;
      const inp = document.createElement('input');
      inp.type = type;
      inp.value = val;
      inp.style.width = '100%';
      inp.addEventListener('input', () => onChange(inp.value));
      inp.addEventListener('change', () => onChange(inp.value));
      wrap.appendChild(lbl);
      wrap.appendChild(inp);
      return wrap;
    }

    const labelField = makeField('Label', 'text', t.label, v => { t.label = v; });
    const pctField   = makeField('Artist %', 'number', t.artistPct, v => { t.artistPct = parseFloat(v) || 0; });

    // Revenue threshold field: editable for all but last, which is always ∞
    const threshWrap = document.createElement('div');
    threshWrap.className = 'form-group';
    threshWrap.style.margin = '0';
    const threshLbl = document.createElement('label');
    threshLbl.textContent = `Revenue threshold (${cur})`;
    threshWrap.appendChild(threshLbl);

    if (isLast) {
      const pill = document.createElement('div');
      pill.style.cssText = 'height:38px; display:flex; align-items:center; font-family:\'DM Mono\',monospace; font-size:13px; font-weight:600; color:var(--gold); padding:0 4px;';
      pill.textContent = '∞ Unlimited (final tier)';
      threshWrap.appendChild(pill);
    } else {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.value = t.revenueUpTo || '';
      inp.placeholder = 'e.g. production cost';
      inp.style.width = '100%';
      inp.addEventListener('input', () => { t.revenueUpTo = parseFloat(inp.value) || 0; });
      inp.addEventListener('change', () => { t.revenueUpTo = parseFloat(inp.value) || 0; });
      threshWrap.appendChild(inp);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn sm danger-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.style.marginBottom = '2px';
    removeBtn.addEventListener('click', () => {
      book.profitTiers.splice(i, 1);
      renderProfitTierList();
    });

    row.appendChild(labelField);
    row.appendChild(threshWrap);
    row.appendChild(pctField);
    row.appendChild(removeBtn);
    list.appendChild(row);
  });

  // Legend hint
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:11px; color:var(--text3); margin-top:6px; line-height:1.6;';
  hint.textContent = 'Revenue threshold: cumulative gross revenue at which the NEXT tier begins. The final tier has no ceiling.';
  list.appendChild(hint);
}

function addProfitTier() {
  if (!psActiveBookId || !BOOKS[psActiveBookId]) {
    showToast('Select a book first', 'warn');
    return;
  }
  const book = BOOKS[psActiveBookId];
  if (!book.profitTiers) book.profitTiers = [];
  const tiers = book.profitTiers;
  const productionCost = book.productionCost || 0;

  if (tiers.length === 0) {
    // First tier: pre break-even. Revenue threshold = production cost.
    tiers.push({ label: 'Pre Break-even', revenueUpTo: productionCost || 1000, artistPct: 15 });
  } else if (tiers.length === 1) {
    // Second tier: post break-even. No ceiling — this is the final tier.
    tiers.push({ label: 'Post Break-even', revenueUpTo: null, artistPct: 35 });
  } else {
    // Additional tiers: insert before the last (unlimited) tier
    const prev = tiers[tiers.length - 2];
    const newThreshold = prev.revenueUpTo ? prev.revenueUpTo * 2 : productionCost * 2;
    const lastTier = tiers.pop(); // pull off the unlimited final tier
    tiers.push({ label: `Tier ${tiers.length + 1}`, revenueUpTo: newThreshold, artistPct: Math.max(lastTier.artistPct + 5, 10) });
    tiers.push(lastTier);  // put unlimited tier back at the end
  }
  renderProfitTierList();
}

function removeProfitTier(idx) {
  if (!psActiveBookId || !BOOKS[psActiveBookId]) return;
  BOOKS[psActiveBookId].profitTiers.splice(idx, 1);
  renderProfitTierList();
}

function updateProfitTierField(idx, field, val) {
  if (!psActiveBookId || !BOOKS[psActiveBookId]) return;
  const tier = BOOKS[psActiveBookId].profitTiers[idx];
  if (!tier) return;
  if (field === 'upTo' || field === 'artistPct') tier[field] = parseFloat(val) || 0;
  else tier[field] = val;
}

async function saveProfitTiers() {
  if (!psActiveBookId) { showToast('No book selected', 'warn'); return; }
  const ind = $('ps-save-indicator');
  if (ind) ind.classList.add('show');
  try {
    await saveCatalogWithDeletions();
    showToast('✓ Profit tiers saved');
    if (activeBook === psActiveBookId) updateDash();
  } catch(e) {
    showToast('⚠ Error saving tiers', 'err');
  } finally {
    if (ind) setTimeout(() => ind.classList.remove('show'), 1500);
  }
}

function calculateArtistEarnings(bookId) {
  const book = BOOKS[bookId];
  if (!book) return null;
  const s = states[bookId] || defaultState(book);
  const tiers = book.profitTiers && book.profitTiers.length > 0
    ? [...book.profitTiers].sort((a,b) => (a.revenueUpTo || Infinity) - (b.revenueUpTo || Infinity))
    : [];

  if (tiers.length === 0) return null;

  let totalArtistEarned = 0;
  let cumulativeRevenue = 0;
  const perTier = tiers.map(t => ({ tier: t, revenue: 0, artistEarned: 0 }));

  const sortedHist = [...s.hist].reverse().filter(h => !h.voided && !h.gratuity && !h.artistPending && h.qty > 0 && h.price > 0);

  const tierEffectiveCap = (t) => {
    const isBreakEvenTier = (t.label || '').toLowerCase().includes('break');
    if (isBreakEvenTier && book.productionCost > 0) return book.productionCost;
    return Number.isFinite(t.revenueUpTo) && t.revenueUpTo > 0 ? t.revenueUpTo : null;
  };

  sortedHist.forEach(h => {
    let revRemaining = h.qty * h.price;
    while (revRemaining > 0.001) {
      const tierIdx = tiers.findIndex(t => tierEffectiveCap(t) !== null && cumulativeRevenue < tierEffectiveCap(t));
      const idx = tierIdx === -1 ? tiers.length - 1 : tierIdx;
      const tier = tiers[idx];
      const tCap = tierEffectiveCap(tier);
      const isLastTier = idx === tiers.length - 1 || tCap === null;
      const capacity = isLastTier ? revRemaining : Math.min(revRemaining, tCap - cumulativeRevenue);
      const earned = capacity * (tier.artistPct / 100);
      totalArtistEarned += earned;
      perTier[idx].revenue += capacity;
      perTier[idx].artistEarned += earned;
      cumulativeRevenue += capacity;
      revRemaining -= capacity;
    }
  });

  const payouts = (s.artistPayouts || []).filter(p => !p.voided);
  const totalPaidToArtist = payouts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const owedToArtist = totalArtistEarned - totalPaidToArtist;

  return {
    totalArtistEarned,
    cumulativeRevenue,
    netPublisher: s.revenue - totalArtistEarned,
    perTier,
    totalPaidToArtist,
    owedToArtist,
    payouts
  };
}

// ── FINANCIAL CENTER LOGIC
function calculateFinancials(year) {
  const result = {
    revenue: 0,
    cogs: 0,
    opex: 0,
    shares: 0,
    profit: 0,
    bookStats: [], 
    expCats: {},
    missingReceiptsCount: 0
  };

  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59);

  // Helper for consistent amount extraction
  const getAmt = (e) => e.baseAmount || e.amountCAD || e.amount || 0;

  // 1. Process Book-specific data
  Object.values(BOOKS).forEach(book => {
    const s = states[book.id] || defaultState(book);
    const unitCost = (book.productionCost || 0) / (book.maxPrint || 1);
    
    let bookRev = 0;
    let bookUnits = 0;
    
    (s.hist || []).forEach(h => {
      const d = new Date(h.date);
      if (!h.voided && !h.gratuity && d >= start && d <= end) {
        bookRev += (parseFloat(h.qty) || 0) * (parseFloat(h.price) || 0);
        bookUnits += (parseInt(h.qty) || 0);
      }
    });
    
    const bookCogs = bookUnits * unitCost;
    const bookShares = filterArtistEarningsByYear(book.id, year);
    
    result.revenue += bookRev;
    result.cogs += bookCogs;
    result.shares += bookShares;
    
    result.bookStats.push({
      title: book.title,
      units: bookUnits,
      revenue: bookRev,
      unitCost: unitCost,
      cogs: bookCogs,
      shares: bookShares,
      net: bookRev - bookCogs - bookShares
    });
    
    (s.expenses || []).forEach(e => {
      const d = new Date(e.date);
      if (!e.voided && d >= start && d <= end) {
        const amt = getAmt(e);
        result.opex += amt;
        const cat = e.cat || 'Uncategorized';
        if (!result.expCats[cat]) result.expCats[cat] = { count: 0, total: 0, missingReceipts: 0 };
        result.expCats[cat].count++;
        result.expCats[cat].total += amt;
        if (!e.receipt) {
          result.expCats[cat].missingReceipts++;
          result.missingReceiptsCount++;
        }
      }
    });
  });

  // 2. Process Global Publisher Expenses (Tax Center)
  (TAX_CENTER.businessExpenses || []).forEach(e => {
    const d = new Date(e.date);
    if (!e.voided && d >= start && d <= end) {
      const amt = getAmt(e);
      result.opex += amt;
      const cat = e.cat || 'Uncategorized (Publisher)';
      if (!result.expCats[cat]) result.expCats[cat] = { count: 0, total: 0, missingReceipts: 0 };
      result.expCats[cat].count++;
      result.expCats[cat].total += amt;
      if (!e.receipt) {
        result.expCats[cat].missingReceipts++;
        result.missingReceiptsCount++;
      }
    }
  });

  result.profit = result.revenue - result.cogs - result.opex - result.shares;
  return result;
}

function filterArtistEarningsByYear(bookId, year) {
  const book = BOOKS[bookId];
  const s = states[bookId] || defaultState(book);
  const tiers = [...(book.profitTiers || [])].sort((a,b) => (a.revenueUpTo || Infinity) - (b.revenueUpTo || Infinity));
  if (tiers.length === 0) return 0;

  const start = new Date(year, 0, 1);
  const end   = new Date(year, 11, 31, 23, 59, 59);

  let yearArtistEarned = 0;
  let cumulativeRevenue = 0;

  // Walk history chronologically so cumulative revenue tracks correctly across all time
  const sortedHist = [...s.hist].reverse().filter(h => !h.voided && !h.gratuity && !h.artistPending && h.qty > 0 && h.price > 0);

  sortedHist.forEach(h => {
    const inYear = new Date(h.date) >= start && new Date(h.date) <= end;
    let revRemaining = h.qty * h.price;
    while (revRemaining > 0.001) {
      const tier = tiers.find(t => t.revenueUpTo !== null && cumulativeRevenue < t.revenueUpTo) || tiers[tiers.length - 1];
      const isLastTier = tier === tiers[tiers.length - 1] || tier.revenueUpTo === null;
      const capacity = isLastTier ? revRemaining : Math.min(revRemaining, tier.revenueUpTo - cumulativeRevenue);
      if (inYear) yearArtistEarned += capacity * (tier.artistPct / 100);
      cumulativeRevenue += capacity;
      revRemaining -= capacity;
    }
  });

  return yearArtistEarned;
}

function renderFinancials() {
  if (isAuthor()) return;
  const yearStr = $('fin-year-selector').value;
  const year = parseInt(yearStr);
  const fin = calculateFinancials(year);
  const cur = getBook().currency || '€';

  $('fin-rev').textContent = fmt(fin.revenue, cur);
  $('fin-cogs').textContent = fmt(fin.cogs, cur);
  $('fin-exp').textContent = fmt(fin.opex + fin.shares, cur);
  
  const totalExpCount = Object.values(fin.expCats).reduce((a,c)=>a+c.count,0);
  let subText = `${totalExpCount} expense${totalExpCount!==1?'s':''} logged`;
  if(fin.missingReceiptsCount > 0) {
    subText += ` · <span style="color:var(--red);font-weight:600;">${fin.missingReceiptsCount} missing receipt${fin.missingReceiptsCount!==1?'s':''}</span>`;
  }
  $('fin-exp-sub').innerHTML = subText;
  $('fin-profit').textContent = fmt(fin.profit, cur);
  
  const expBody = $('fin-exp-body');
  if (expBody) {
    const sortedCats = Object.entries(fin.expCats).sort((a,b) => b[1].total - a[1].total);
    expBody.innerHTML = sortedCats.map(([cat, val]) => `
      <tr>
        <td style="font-weight:600; display:flex; align-items:center;">${cat} ${val.missingReceipts ? `<span class="pill" style="margin-left:8px; font-size:9px; background:var(--red); color:var(--dark); font-weight:600;">${val.missingReceipts} missing</span>` : ''}</td>
        <td class="r">${val.count} txn</td>
        <td class="r" style="font-weight:700; color:var(--red);">${fmt(val.total, cur)}</td>
      </tr>
    `).join('') || '<tr><td colspan="3"><div class="empty-state">No expenses for this period.</div></td></tr>';
  }

  const booksBody = $('fin-books-body');
  if (booksBody) {
    booksBody.innerHTML = fin.bookStats.map(bs => `
      <tr>
        <td style="font-weight:600;">${bs.title}</td>
        <td class="r">${bs.units}</td>
        <td class="r">${fmt(bs.revenue, cur)}</td>
        <td class="r">${fmt(bs.unitCost, cur)}</td>
        <td class="r">${fmt(bs.cogs, cur)}</td>
        <td class="r" style="font-weight:700; color:${bs.net > 0 ? 'var(--green)' : 'var(--text)'};">${fmt(bs.net, cur)}</td>
      </tr>
    `).join('') || '<tr><td colspan="6"><div class="empty-state">No data available.</div></td></tr>';
  }
}

function downloadTaxReport() {
  const year = $('fin-year-selector').value;
  const fin = calculateFinancials(parseInt(year));
  
  let csv = 'Date,Type,Book/Source,Category,Description,Receipt URL,Revenue,COGS,Expense,Artist Payout,Net\n';
  
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59);

  Object.values(BOOKS).forEach(book => {
    const s = states[book.id] || defaultState(book);
    s.hist.filter(h => !h.voided && !h.gratuity).forEach(h => {
      const d = new Date(h.date);
      if (d >= start && d <= end) {
        csv += `${h.date},Order,${book.title},Sale,"${h.chan} Order #${h.num}",,${(h.qty*h.price).toFixed(2)},0,0,0,${(h.qty*h.price).toFixed(2)}\n`;
      }
    });

    (s.expenses || []).forEach(e => {
        const d = new Date(e.date);
        if (d >= start && d <= end) {
          csv += `${e.date},Expense,${book.title},${e.cat},"${e.desc}","${e.receipt || ''}",0,0,${e.amount.toFixed(2)},0,-${e.amount.toFixed(2)}\n`;
        }
    });
  });

  // Summary lines for COGS and Shares
  csv += `\nSUMMARY FOR ${year},,,,,,,,,\n`;
  fin.bookStats.forEach(bs => {
    csv += `${year}-12-31,COGS Summary,${bs.title},COGS,Inventory Recovery,,0,${bs.cogs.toFixed(2)},0,0,-${bs.cogs.toFixed(2)}\n`;
    csv += `${year}-12-31,Artist Share,${bs.title},Royalty,Tiered Payout,,0,0,0,${bs.shares.toFixed(2)},-${bs.shares.toFixed(2)}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', `Lyrical_Tax_Report_${year}.csv`);
  a.click();
}

// ── GOOGLE AUTHENTICATION
window.tryGoogleLogin = async function() {
  const err = $('pw-err');
  err.textContent = 'Contacting Google...';
  try {
    await window._fbSignInWithGoogle();
    err.textContent = 'Authenticating...';
  } catch (e) {
    console.error(e);
    err.textContent = 'Sign-in failed or was cancelled.';
    setTimeout(() => { err.textContent = ''; }, 3000);
  }
};

function logout() {
  window._fbSignOut().then(() => {
    sessionStorage.removeItem('lm-author-view-overrides');
    window.location.reload();
  });
}

function showApp(role, bookId) {
  $('pw-gate').style.display='none';
  $('pw-app').style.display='';
  if (role === 'author' || IS_AUTHOR_MODE) {
    document.getElementById('main-app').classList.add('author-mode');
    const allOv = $('tab-all-overview');
    if(allOv){ allOv.style.display='none'; allOv.classList.remove('active'); }
    $('tab-bar').style.display = '';
    const wm=$('author-watermark'); if(wm){wm.textContent=BOOKS[bookId||ACTIVE_BOOK_FORCED]?.title+' · Author view';wm.style.display='';}
    const sheetsBtn=$('sheets-tab-btn'); if(sheetsBtn)sheetsBtn.style.display='none';
    const websiteTabBtn=$('website-tab-btn'); if(websiteTabBtn) websiteTabBtn.style.display='none';
    const backupsBtn=$('backups-tab-btn'); if(backupsBtn) backupsBtn.style.display='none';
    const websitePanel=$('tab-website');
    if (websitePanel) {
      websitePanel.style.display='none';
      websitePanel.classList.remove('active');
    }
    const openLink=$('sheets-open-link'); if(openLink)openLink.style.display='none !important';
    const style=document.createElement('style');
    style.textContent='#sheets-open-link{display:none!important;}#open-sheet-link{display:none!important;}#d-breakeven-kpi{display:none!important;}#d-breakeven-block{display:none!important;}#d-reimburse-sect{display:none!important;}#d-expenses-sect{display:none!important;}#d-expenses-kpi{display:none!important;}#d-reimburse-kpi{display:none!important;}#danger-zone-sect{display:none!important;}#danger-zone-block{display:none!important;}#import-btn{display:none!important;}#tab-all-overview{display:none!important;}#backups-tab-btn{display:none!important;}#exp-ai-btn{display:none!important;}';
    document.head.appendChild(style);
  } else {
    // Publisher — show import button and financials tab
    const importBtn=$('import-btn'); if(importBtn)importBtn.style.display='';
    const finBtn=$('financials-tab-btn'); if(finBtn)finBtn.style.display='';
    const websiteTabBtn=$('website-tab-btn'); if(websiteTabBtn) websiteTabBtn.style.display='';
    const backupsBtn=$('backups-tab-btn'); if(backupsBtn) backupsBtn.style.display='';
  }
  updateRoleToggleButton();
  syncRoleUI();
  boot(bookId || ACTIVE_BOOK_FORCED);
}

async function boot(forcedBook) {
  buildBookSwitcher();
  await loadPaymentLinks();
  await loadProductionCosts();
  renderCatalogList();
  renderProfitSettings();
  if(sheetsUrl) showSheetsConnected();
  updateSheetsBadge();
  updateLastBackupDisplay();
  initializeBackupFolderDisplay();
  checkDailyBackup();
  maybeAutoDownloadDailyBackup();
  processSyncQueue();

  const initFn = () => {
    fbReady = true;
    if (forcedBook) {
      // Author mode — load only this book
      activeBook = forcedBook;
      const book = BOOKS[forcedBook];
      if (!book) { showToast('Book not found', 'err'); return; }
      document.documentElement.style.setProperty('--book-accent', book.accent);
      document.documentElement.style.setProperty('--book-accent-bg', book.accentBg);
      $('tab-all-overview').style.display='none';
      $('tab-all-overview').classList.remove('active');
      $('tab-bar').style.display = '';
      $('tab-dashboard').style.display='block';
      $('tab-dashboard').classList.add('active');
      loadBook(forcedBook).then(()=>{
        setSyncState('ok','<b>Firestore</b> · connected');
        $('hdr-sub').textContent=book.title+' · Author View · Synced '+new Date().toLocaleTimeString();
        renderAll();updateHeader();updateRoleToggleButton();syncRoleUI();
      });
    } else {
      // Publisher
      activeBook = 'all';
      loadAllBooks().then(() => ensureDailySystemBackup());
      updateRoleToggleButton();
      syncRoleUI();
    }
  };

  initFn();
}

// ── TAX CENTER LOGIC
const TC_CATEGORIES = [
  'Software & Subscriptions', 'Marketing & Advertising', 'Printing & Production',
  'Editorial & Proofreading', 'Illustration & Photography', 'Rights & Permissions',
  'ISBN, Barcodes & Cataloging', 'Shipping & Postage', 'Warehousing & Fulfillment',
  'Packaging Materials', 'Office Supplies', 'Home Office', 'Travel & Meals', 'Professional Services',
  'Books, Research & Reference', 'Events & Exhibitions', 'Artist Royalties', 'Other'
];

function changeExpenseCategory(itemId, newCat) {
  const exp = (TAX_CENTER.businessExpenses || []).find(e => e.id == itemId);
  if (!exp) return;
  if (exp.cat === newCat) return;
  exp.cat = newCat;
  saveTaxCenter();
  renderTaxCenter();
  showToast(`✓ Moved to ${newCat}`);
}

const TC_LEDGER_PAGE_SIZE = 25;
let _tcLedgerPage = 0;

function setTcLedgerPage(n) {
  _tcLedgerPage = n;
  renderTaxCenter();
}

function renderTaxCenter() {
  if (isAuthor()) return;
  // Initialize AI key input UI
  if($('tc-api-key') && TAX_CENTER.settings?.geminiKey) $('tc-api-key').value = TAX_CENTER.settings.geminiKey;
  if($('stripe-fees-key') && TAX_CENTER.settings?.stripeKey) $('stripe-fees-key').value = TAX_CENTER.settings.stripeKey;
  const _stripeStatusEl = $('stripe-fees-status');
  if (_stripeStatusEl && !_stripeStatusEl.textContent && TAX_CENTER.settings?.stripeFeesLastImportAt) {
    const last = new Date(TAX_CENTER.settings.stripeFeesLastImportAt);
    if (!isNaN(last)) {
      const days = Math.floor((Date.now() - last.getTime()) / 86400000);
      const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
      _stripeStatusEl.textContent = `Fees last inserted into ledger ${ago} (${last.toISOString().slice(0, 10)}). Fetch again to refresh.`;
    }
  }
  if($('tc-shippo-key') && TAX_CENTER.settings?.shippoKey) $('tc-shippo-key').value = TAX_CENTER.settings.shippoKey;
  const _shippoStatusEl = $('tc-shippo-status');
  if (_shippoStatusEl && TAX_CENTER.settings?.shippoLastImportAt) {
    const last = new Date(TAX_CENTER.settings.shippoLastImportAt);
    if (!isNaN(last)) {
      const days = Math.floor((Date.now() - last.getTime()) / 86400000);
      const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
      _shippoStatusEl.textContent = `Last synced ${ago} (${last.toISOString().slice(0, 10)}). Imports non-refunded transaction rates as Shipping & Postage expenses.`;
    }
  }

  // Update receipt folder display
  loadReceiptFolderHandle().then(async handle => {
    const el = $('receipt-folder-display');
    if (!el) return;
    if (!handle) {
      el.innerHTML = `Status: <span style="color:var(--text3);">Saving to Cloud (Firestore)</span>`;
      return;
    }
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      el.innerHTML = `Status: <span style="color:var(--green);">✓ Connected to folder: <strong>${handle.name}</strong></span>`;
    } else {
      el.innerHTML = `Status: <span style="color:var(--amber);">⚠ Access Required: <strong>${handle.name}</strong></span> 
        <button class="btn tx" onclick="authorizeReceiptFolder()" style="margin-left:10px;padding:2px 8px;font-size:11px;background:var(--gold3);color:black;">Authorize Access</button>`;
    }
  });

  const baseCurrency = TAX_CENTER.settings?.baseCurrency || 'CAD';
  const yearSelect = $('tc-year');
  const selectedYear = yearSelect ? yearSelect.value : 'all';

  let totalGrossSales = 0;
  let totalOperatingExpenses = 0;
  let allLedger = [];
  
  Object.keys(BOOKS).forEach(bid => {
    const s = states[bid] || defaultState(BOOKS[bid]);
    const b = BOOKS[bid];
    const cur = getBookCurrencyCode(b);
    
    // Determine conversion to CAD for sales
    const hRate = _fxRateCache[`${cur}_CAD`] || 1;
    
    // Add sales to ledger
    (s.hist || []).filter(h => !h.artistPending || h.voided).forEach(h => {
        const hYear = h.date ? h.date.substring(0, 4) : '';
        if (selectedYear !== 'all' && hYear !== selectedYear) return;

        const unitPrice = h.price ?? h.unitPrice ?? 0;
        const amt = h.voided ? 0 : (unitPrice * (h.qty || 1));
        const baseAmt = amt * hRate;
        totalGrossSales += baseAmt;
        
        allLedger.push({
            date: h.date,
            type: 'Sale',
            desc: `${b.title} (Qty: ${h.qty || 1})`,
            cat: 'Income',
            ref: h.num,
            origCurrency: cur,
            origAmount: amt,
            baseAmount: baseAmt,
            hasRateError: !hRate,
            isIncome: true,
            sourceType: 'sale',
            sourceId: bid,
            itemId: h.id
        });
    });
    
    // Add book specific expenses
    (s.expenses || []).forEach(e => {
        const eYear = e.date ? e.date.substring(0, 4) : '';
        if (selectedYear !== 'all' && eYear !== selectedYear) return;

        // Use stored origCurrency/origAmount for display, and stored baseAmount to avoid double-conversion.
        // Fallback for legacy entries that don't have baseAmount stored.
        const displayOrigCur = e.origCurrency || e.currency || 'CAD';
        const displayOrigAmt = e.origAmount != null ? e.origAmount : (e.amount || 0);
        const bookCur = e.currency || 'CAD';
        
        let eBase;
        if (e.baseAmount != null) {
          // Pre-calculated at submission time — no double conversion
          eBase = e.baseAmount;
        } else {
          // Legacy entry: calculate once now
          const eRate = _fxRateCache[`${bookCur}_CAD`] || 1;
          eBase = (e.amount || 0) * eRate;
        }
        
        totalOperatingExpenses += eBase;
        
        allLedger.push({
            date: e.date,
            type: 'Expense',
            desc: e.desc + ` (${b.title})`,
            cat: e.cat || 'Project Expense',
            ref: e.ref || '',
            receipt: e.receipt || '',
            origCurrency: displayOrigCur,
            origAmount: displayOrigAmt,
            baseAmount: eBase,
            hasRateError: false,
            isIncome: false,
            sourceType: 'bookExpense',
            sourceId: bid,
            itemId: e.id
        });
    });
    
    // Add artist payments
    (s.artistTransfers || []).filter(t => t.paid).forEach(t => {
        const tDate = t.paidDate || t.date || '';
        const tYear = tDate ? tDate.substring(0, 4) : '';
        if (selectedYear !== 'all' && tYear !== selectedYear) return;

        const tBase = (t.total || 0) * hRate;
        allLedger.push({
            date: tDate,
            type: 'Expense',
            desc: `Artist Payout (${b.title})`,
            cat: 'Artist Royalties',
            ref: t.num,
            origCurrency: cur,
            origAmount: t.total || 0,
            baseAmount: tBase,
            hasRateError: !hRate,
            isIncome: false,
            sourceType: 'artistPayout',
            sourceId: bid,
            itemId: t.id
        });
    });
  });

  (TAX_CENTER.businessExpenses || []).forEach(e => {
      const eYear = e.date ? e.date.substring(0, 4) : '';
      if (selectedYear !== 'all' && eYear !== selectedYear) return;

      const eCur = e.currency || 'CAD';
      // Use stored baseAmount when available to avoid re-conversion
      const eBase = e.baseAmount != null ? e.baseAmount : (e.amount || 0) * (_fxRateCache[`${eCur}_CAD`] || 1);
      
      totalOperatingExpenses += eBase;
      
      allLedger.push({
            date: e.date,
            type: 'Business Exp.',
            desc: e.desc,
            cat: e.cat || 'Other',
            ref: e.ref || '',
            receipt: e.receipt || '',
            origCurrency: eCur,
            origAmount: e.amount || 0,
            baseAmount: eBase,
            hasRateError: false,
            isIncome: false,
            sourceType: 'businessExpense',
            itemId: e.id,
            trip: e.trip || ''
        });
  });

  const netCashFlow = totalGrossSales - totalOperatingExpenses;
  
  if ($('tc-sales')) $('tc-sales').textContent = fmt(totalGrossSales, baseCurrency);
  if ($('tc-expenses')) $('tc-expenses').textContent = fmt(totalOperatingExpenses, baseCurrency);
  if ($('tc-net')) $('tc-net').textContent = fmt(netCashFlow, baseCurrency);
  
  // Trips panel + autocomplete suggestions
  const tripBody = $('tc-trip-body');
  const tripSummary = {};
  (TAX_CENTER.businessExpenses || []).forEach(e => {
    const eYear = e.date ? e.date.substring(0, 4) : '';
    if (selectedYear !== 'all' && eYear !== selectedYear) return;
    const t = (e.trip || '').trim();
    if (!t) return;
    const eCur = e.currency || 'CAD';
    const eBase = e.baseAmount != null ? e.baseAmount : (e.amount || 0) * (_fxRateCache[`${eCur}_CAD`] || 1);
    if (!tripSummary[t]) tripSummary[t] = { total: 0, count: 0, items: [] };
    tripSummary[t].total += eBase;
    tripSummary[t].count++;
    tripSummary[t].items.push({ ...e, baseAmount: eBase, origCurrency: eCur, origAmount: e.amount || 0 });
  });
  window._tcTripDetail = { baseCurrency, byName: tripSummary };

  // Populate datalists for trip autocomplete (use ALL trips ever seen, not just filtered year)
  const allTripNames = Array.from(new Set(
    (TAX_CENTER.businessExpenses || []).map(e => (e.trip || '').trim()).filter(Boolean)
  )).sort();
  ['tc-trip-suggestions', 'tc-trip-suggestions-modal'].forEach(id => {
    const dl = $(id);
    if (dl) dl.innerHTML = allTripNames.map(t => `<option value="${t.replace(/"/g,'&quot;')}">`).join('');
  });

  if (tripBody) {
    const tripList = Object.keys(tripSummary).map(t => ({ name: t, ...tripSummary[t] })).sort((a,b) => b.total - a.total);
    tripBody.innerHTML = tripList.map(t => `
        <tr onclick="showTripDetail(this.dataset.trip)" data-trip="${t.name.replace(/"/g,'&quot;')}" style="cursor:pointer;" title="Click to view ${t.count} expense${t.count===1?'':'s'}">
          <td style="color:var(--gold);text-decoration:underline;">✈ ${t.name}</td>
          <td class="r">${t.count}</td>
          <td class="r" style="font-weight:bold;color:var(--red);">- ${fmt(t.total, baseCurrency)}</td>
        </tr>
    `).join('') || `<tr><td colspan="3" class="r" style="text-align:center;color:var(--text3);">No trips yet — add a Trip name when logging an expense to group them here.</td></tr>`;
  }

  const catBody = $('tc-category-body');
  if (catBody) {
      const expenses = allLedger.filter(item => !item.isIncome);
      const catSummary = {};
      expenses.forEach(ex => {
          const c = ex.cat || 'Uncategorized';
          if (!catSummary[c]) catSummary[c] = { total: 0, count: 0, items: [] };
          catSummary[c].total += ex.baseAmount;
          catSummary[c].count++;
          catSummary[c].items.push(ex);
      });
      const catList = Object.keys(catSummary).map(c => ({ name: c, ...catSummary[c] })).sort((a,b) => b.total - a.total);

      // Stash by index so the detail modal can read transactions without escaping issues.
      window._tcCategoryDetail = {
        baseCurrency,
        byName: catSummary
      };

      catBody.innerHTML = catList.map(c => `
          <tr onclick="showCategoryDetail(this.dataset.cat)" data-cat="${c.name.replace(/"/g,'&quot;')}" style="cursor:pointer;" title="Click to view ${c.count} transaction${c.count===1?'':'s'}">
            <td style="color:var(--gold3);text-decoration:underline;">${c.name}</td>
            <td class="r">${c.count}</td>
            <td class="r" style="font-weight:bold;color:var(--red);">- ${fmt(c.total, baseCurrency)}</td>
          </tr>
      `).join('') || `<tr><td colspan="3" class="r" style="text-align:center;">No deductible expenses recorded</td></tr>`;
  }

  allLedger.sort((a,b) => new Date(b.date) - new Date(a.date));

  // Clamp page to valid range
  const totalPages = Math.max(1, Math.ceil(allLedger.length / TC_LEDGER_PAGE_SIZE));
  if (_tcLedgerPage >= totalPages) _tcLedgerPage = totalPages - 1;
  if (_tcLedgerPage < 0) _tcLedgerPage = 0;
  const pageStart = _tcLedgerPage * TC_LEDGER_PAGE_SIZE;
  const pageLedger = allLedger.slice(pageStart, pageStart + TC_LEDGER_PAGE_SIZE);

  const ledTbody = $('tc-ledger-body');
  if(ledTbody) {
      ledTbody.innerHTML = pageLedger.map(item => {
        // Build receipt/ref cell
        let refCell = '';
        let r = item.receipt || '';
        let displayRef = item.ref || '';
        // Legacy cleanup: if ref contains a local link, extract it
        if (displayRef && displayRef.includes('local://')) {
          const match = displayRef.match(/href="([^"]+)"/);
          if (match) r = match[1];
          displayRef = '';
        }
        if (displayRef) refCell = displayRef;
        else if (!r) refCell = '';
        else if (r.startsWith('local://')) {
          const fn = r.replace('local://', '');
          refCell = `<a href="#" onclick="event.preventDefault(); viewLocalReceipt('${fn}')" style="color:var(--gold3);text-decoration:underline;">View Local</a>`;
        } else {
          refCell = `<a href="${r}" target="_blank" style="color:var(--gold3);">Receipt</a>`;
        }

        // Show original amount in its native currency; show CAD equivalent separately
        const origSym = getSym(item.origCurrency || 'CAD');
        const origDisplay = `${origSym}${Number(item.origAmount || 0).toFixed(2)}`;
        const cadDisplay = `${item.isIncome ? '+' : '-'}${fmt(item.baseAmount, baseCurrency)}`;

        const catCell = item.sourceType === 'businessExpense'
          ? `<select onchange="changeExpenseCategory('${item.itemId}', this.value)" style="font-size:11px;padding:2px 4px;background:transparent;color:inherit;border:1px solid rgba(255,255,255,.15);border-radius:4px;max-width:170px;" title="Change category">
              ${TC_CATEGORIES.map(c => `<option value="${c.replace(/"/g,'&quot;')}"${c===item.cat?' selected':''}>${c}</option>`).join('')}
              ${TC_CATEGORIES.includes(item.cat) ? '' : `<option value="${(item.cat||'').replace(/"/g,'&quot;')}" selected>${item.cat||''}</option>`}
            </select>`
          : item.cat;

        let descCell = item.desc || '';
        if (item.sourceType === 'businessExpense') {
          const tripText = (item.trip || '').replace(/"/g,'&quot;');
          const tripPill = item.trip
            ? `<span onclick="event.stopPropagation();openEditTrip('${item.itemId}')" style="display:inline-block;margin-top:3px;font-size:10px;background:var(--gold-bg);color:var(--gold);border:1px solid var(--gold-line);border-radius:10px;padding:1px 8px;cursor:pointer;" title="Edit trip">✈ ${item.trip}</span>`
            : `<span onclick="event.stopPropagation();openEditTrip('${item.itemId}')" style="display:inline-block;margin-top:3px;font-size:10px;color:var(--text3);border:1px dashed var(--border);border-radius:10px;padding:1px 8px;cursor:pointer;" title="Assign to a trip">+ trip</span>`;
          descCell = `<div>${item.desc || ''}</div>${tripPill}`;
        }

        return `
        <tr style="color:${item.isIncome ? 'var(--green)' : 'var(--red)'}">
            <td style="font-size:12px;">${item.date || '—'}</td>
            <td><span class="tag ${item.isIncome ? 'green' : 'amber'}">${item.type}</span></td>
            <td style="font-size:12px;">${descCell}</td>
            <td style="font-size:12px;">${catCell}</td>
            <td style="font-size:12px;">${refCell}</td>
            <td class="r" style="font-size:12px;">${origDisplay}</td>
            <td class="r" style="font-weight:600;">${cadDisplay}</td>
            <td class="r">${item.itemId ? `<button class="btn-icon" onclick="removeLedgerEntry('${item.sourceType}', '${item.sourceId||''}', '${item.itemId}')" title="Delete entry">🗑️</button>` : ''}</td>
        </tr>`;
      }).join('') || `<tr><td colspan="8" style="text-align:center;padding:1rem;color:var(--text3);">No data for selected period</td></tr>`;
  }

  // Pagination controls
  const pgWrap = $('tc-ledger-pagination');
  if (pgWrap) {
    if (totalPages <= 1) {
      pgWrap.innerHTML = '';
    } else {
      const from = allLedger.length ? pageStart + 1 : 0;
      const to = Math.min(pageStart + TC_LEDGER_PAGE_SIZE, allLedger.length);
      const btnStyle = 'padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;border:1px solid var(--border);background:var(--cream2);color:var(--text);';
      const activeBtnStyle = 'padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;border:1px solid var(--gold);background:var(--gold);color:var(--ink);font-weight:600;';
      // Show at most 7 page buttons around current page
      const maxBtns = 7;
      let startBtn = Math.max(0, _tcLedgerPage - Math.floor(maxBtns / 2));
      let endBtn = Math.min(totalPages - 1, startBtn + maxBtns - 1);
      if (endBtn - startBtn < maxBtns - 1) startBtn = Math.max(0, endBtn - maxBtns + 1);
      let btns = '';
      if (startBtn > 0) btns += `<button style="${btnStyle}" onclick="setTcLedgerPage(0)">1</button><span style="color:var(--text3);padding:0 4px;">…</span>`;
      for (let p = startBtn; p <= endBtn; p++) {
        btns += `<button style="${p === _tcLedgerPage ? activeBtnStyle : btnStyle}" onclick="setTcLedgerPage(${p})">${p + 1}</button>`;
      }
      if (endBtn < totalPages - 1) btns += `<span style="color:var(--text3);padding:0 4px;">…</span><button style="${btnStyle}" onclick="setTcLedgerPage(${totalPages - 1})">${totalPages}</button>`;
      pgWrap.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;flex-wrap:wrap;gap:8px;">
          <span style="font-size:12px;color:var(--text3);">Showing ${from}–${to} of ${allLedger.length} entries</span>
          <div style="display:flex;gap:4px;align-items:center;">
            <button style="${btnStyle}" onclick="setTcLedgerPage(${_tcLedgerPage - 1})" ${_tcLedgerPage === 0 ? 'disabled' : ''}>‹ Prev</button>
            ${btns}
            <button style="${btnStyle}" onclick="setTcLedgerPage(${_tcLedgerPage + 1})" ${_tcLedgerPage === totalPages - 1 ? 'disabled' : ''}>Next ›</button>
          </div>
        </div>`;
    }
  }

  const recBody = $('tc-recurring-body');
  if(recBody) {
      recBody.innerHTML = (TAX_CENTER.recurring || []).map((sub, i) => `
        <tr>
            <td>${sub.desc}</td>
            <td>${sub.cat}</td>
            <td>${fmt(sub.amount, sub.currency||'CAD')}</td>
            <td>${sub.startDate || '-'}</td>
            <td>${sub.lastInjected || 'Never'}</td>
            <td><button class="btn tx" onclick="removeRecurring(${i})">Remove</button></td>
        </tr>
      `).join('') || `<tr><td colspan="5" class="r" style="text-align:center;">No active subscriptions</td></tr>`;
  }
}

async function removeLedgerEntry(type, bid, id) {
  if (!confirm('Are you sure you want to permanently delete this entry from the ledger?')) return;
  
  if (type === 'businessExpense') {
    TAX_CENTER.businessExpenses = (TAX_CENTER.businessExpenses || []).filter(e => e.id != id);
    saveTaxCenter(); 
  } else if (type === 'bookExpense') {
    const s = states[bid];
    if (s && s.expenses) {
      s.expenses = s.expenses.filter(e => e.id != id);
      saveState(bid);
    }
  } else if (type === 'artistPayout') {
    const s = states[bid];
    if (s && s.artistTransfers) {
      s.artistTransfers = s.artistTransfers.filter(t => t.id != id);
      saveState(bid);
    }
  } else if (type === 'sale') {
      const s = states[bid];
      if (s && s.hist) {
          s.hist = s.hist.filter(h => h.id != id);
          saveState(bid);
      }
  }
  
  renderTaxCenter();
  showToast('✓ Entry removed from ledger');
}

let _tcEditTripId = null;
let _tcOpenTripName = null;

function openEditTrip(itemId) {
  const exp = (TAX_CENTER.businessExpenses || []).find(e => e.id == itemId);
  if (!exp) return;
  _tcEditTripId = itemId;
  $('tc-edit-trip-context').textContent = `${exp.desc || 'Expense'} · ${exp.date || ''}`;
  $('tc-edit-trip-input').value = exp.trip || '';
  openM('tc-edit-trip');
  setTimeout(() => $('tc-edit-trip-input').focus(), 50);
}

function saveTripAssignment() {
  if (_tcEditTripId == null) return;
  const newTrip = ($('tc-edit-trip-input').value || '').trim();
  const exp = (TAX_CENTER.businessExpenses || []).find(e => e.id == _tcEditTripId);
  if (!exp) return;
  exp.trip = newTrip;
  saveTaxCenter();
  closeM('tc-edit-trip');
  _tcEditTripId = null;
  renderTaxCenter();
  showToast(newTrip ? `✓ Assigned to ${newTrip}` : '✓ Removed from trip');
}

function showTripDetail(tripName) {
  const detail = window._tcTripDetail;
  if (!detail || !detail.byName[tripName]) return;
  const { baseCurrency } = detail;
  const { items, total, count } = detail.byName[tripName];
  _tcOpenTripName = tripName;

  const sorted = items.slice().sort((a,b) => new Date(a.date) - new Date(b.date));
  const rows = sorted.map(item => {
    let r = item.receipt || '';
    let refCell = '';
    if (!r) refCell = '';
    else if (r.startsWith('local://')) {
      const fn = r.replace('local://', '');
      refCell = `<a href="#" onclick="event.preventDefault(); viewLocalReceipt('${fn}')" style="color:var(--gold3);text-decoration:underline;">View Local</a>`;
    } else {
      refCell = `<a href="${r}" target="_blank" style="color:var(--gold3);">Receipt</a>`;
    }
    const origSym = getSym(item.origCurrency || 'CAD');
    const origDisplay = `${origSym}${Number(item.origAmount || 0).toFixed(2)}`;
    return `
      <tr style="color:var(--red);">
        <td style="font-size:12px;">${item.date || '—'}</td>
        <td style="font-size:12px;">${item.desc || ''}</td>
        <td style="font-size:12px;">${item.cat || ''}</td>
        <td style="font-size:12px;">${refCell}</td>
        <td class="r" style="font-size:12px;">${origDisplay}</td>
        <td class="r" style="font-weight:600;">- ${fmt(item.baseAmount, baseCurrency)}</td>
        <td><button class="btn" style="font-size:10px;padding:3px 8px;" onclick="openEditTrip('${item.id}')" title="Move to a different trip">Move</button></td>
      </tr>`;
  }).join('');

  $('tc-trip-detail-title').textContent = tripName;
  $('tc-trip-detail-summary').innerHTML = `${count} expense${count===1?'':'s'} · <span style="color:var(--red);font-weight:bold;">Trip total: - ${fmt(total, baseCurrency)}</span>`;
  $('tc-trip-detail-body').innerHTML = rows;
  openM('tc-trip-detail');
}

function renameTripPrompt() {
  if (!_tcOpenTripName) return;
  const next = (window.prompt('Rename trip', _tcOpenTripName) || '').trim();
  if (!next || next === _tcOpenTripName) return;
  let changed = 0;
  (TAX_CENTER.businessExpenses || []).forEach(e => {
    if ((e.trip || '') === _tcOpenTripName) { e.trip = next; changed++; }
  });
  if (changed === 0) return;
  saveTaxCenter();
  closeM('tc-trip-detail');
  _tcOpenTripName = null;
  renderTaxCenter();
  showToast(`✓ Renamed trip (${changed} expense${changed===1?'':'s'})`);
}

function showCategoryDetail(catName) {
  const detail = window._tcCategoryDetail;
  if (!detail || !detail.byName[catName]) return;
  const { baseCurrency } = detail;
  const { items, total, count } = detail.byName[catName];

  const sorted = items.slice().sort((a,b) => new Date(b.date) - new Date(a.date));

  const rows = sorted.map(item => {
    let refCell = '';
    let r = item.receipt || '';
    let displayRef = item.ref || '';
    if (displayRef && displayRef.includes('local://')) {
      const match = displayRef.match(/href="([^"]+)"/);
      if (match) r = match[1];
      displayRef = '';
    }
    if (displayRef) refCell = displayRef;
    else if (!r) refCell = '';
    else if (r.startsWith('local://')) {
      const fn = r.replace('local://', '');
      refCell = `<a href="#" onclick="event.preventDefault(); viewLocalReceipt('${fn}')" style="color:var(--gold3);text-decoration:underline;">View Local</a>`;
    } else {
      refCell = `<a href="${r}" target="_blank" style="color:var(--gold3);">Receipt</a>`;
    }
    const origSym = getSym(item.origCurrency || 'CAD');
    const origDisplay = `${origSym}${Number(item.origAmount || 0).toFixed(2)}`;
    const moveCell = item.sourceType === 'businessExpense'
      ? `<select onchange="changeExpenseCategory('${item.itemId}', this.value)" style="font-size:11px;padding:2px 4px;border:1px solid rgba(255,255,255,.15);border-radius:4px;max-width:170px;" title="Move to another category">
          ${TC_CATEGORIES.map(c => `<option value="${c.replace(/"/g,'&quot;')}"${c===item.cat?' selected':''}>${c}</option>`).join('')}
        </select>`
      : '<span style="font-size:11px;color:var(--text3);">—</span>';
    return `
      <tr style="color:var(--red);">
        <td style="font-size:12px;">${item.date || '—'}</td>
        <td><span class="tag amber">${item.type}</span></td>
        <td style="font-size:12px;">${item.desc || ''}</td>
        <td style="font-size:12px;">${refCell}</td>
        <td class="r" style="font-size:12px;">${origDisplay}</td>
        <td class="r" style="font-weight:600;">- ${fmt(item.baseAmount, baseCurrency)}</td>
        <td>${moveCell}</td>
      </tr>`;
  }).join('');

  $('tc-cat-detail-title').textContent = catName;
  $('tc-cat-detail-summary').innerHTML = `${count} transaction${count===1?'':'s'} · <span style="color:var(--red);font-weight:bold;">Total: - ${fmt(total, baseCurrency)}</span>`;
  $('tc-cat-detail-body').innerHTML = rows;
  openM('tc-cat-detail');
}

async function saveTaxCenterSettings() {
    const btn = $('tc-save-config-btn');
    const oldText = btn.textContent;
    btn.textContent = 'Saving...'; btn.disabled = true;

    if(!TAX_CENTER.settings) TAX_CENTER.settings = {};
    TAX_CENTER.settings.geminiKey = document.getElementById('tc-api-key').value.trim();
    
    try {
        await saveTaxCenter();
        showToast('✓ Settings saved to Firebase');
    } catch(e) {
        console.error(e);
        showToast('⚠ Failed to save settings', 'err');
    }
    
    btn.textContent = oldText; btn.disabled = false;
}

async function scanReceiptWithAI() {
    const fileInput = $('tc-exp-file');
    if(!fileInput || fileInput.files.length === 0) { showToast('⚠ Please attach a file first', 'warn'); return; }
    
    const apiKey = TAX_CENTER.settings?.geminiKey || document.getElementById('tc-api-key').value.trim();
    if(!apiKey) { showToast('⚠ Gemini API Key required in Config', 'err'); return; }

    const file = fileInput.files[0];
    const btn = $('tc-ai-scan-btn');
    const oldText = btn.textContent;
    btn.textContent = 'Scanning...'; btn.disabled = true;

    try {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        await new Promise(r => reader.onload = r);
        const base64Data = reader.result.split(',')[1];
        const mimeType = file.type;

        const parts = [
            { text: "Extract these exact 4 keys from this receipt into a very strict JSON format: 'vendor', 'date' (YYYY-MM-DD), 'amount' (number floats only), 'currency' (ISO 3-letter, uppercase, e.g., CAD, USD). No markdown, just raw JSON. If currency is not found, assume CAD." },
            { inline_data: { mime_type: mimeType, data: base64Data } }
        ];

        const data = await _callGeminiForReceipts(apiKey, parts);

        let extractedJsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!extractedJsonStr) throw new Error("No text returned from AI");

        extractedJsonStr = extractedJsonStr.replace(/```json/g, '').replace(/```/g, '').trim();

        const extracted = JSON.parse(extractedJsonStr);

        if(extracted.vendor) $('tc-exp-desc').value = extracted.vendor;
        if(extracted.date) $('tc-exp-date').value = extracted.date;
        if(extracted.amount) $('tc-exp-amount').value = extracted.amount;
        if(extracted.currency) $('tc-exp-cur').value = extracted.currency;

        const ev = new Event('input');
        $('tc-exp-desc').dispatchEvent(ev);

        showToast('✓ Receipt data extracted');
    } catch(e) {
        console.error("AI Scan Error:", e);
        showToast(`⚠ AI extraction failed: ${e.message}`, 'err');
    }
    btn.textContent = oldText; btn.disabled = false;
}


async function importShippoShippingFromApi() {
  const keyEl = $('tc-shippo-key');
  const statusEl = $('tc-shippo-status');
  const btn = $('tc-shippo-btn');
  const token = (keyEl?.value || '').trim();
  if (!token) { showToast('⚠ Enter your Shippo API token first', 'warn'); return; }

  if (!TAX_CENTER.settings) TAX_CENTER.settings = {};
  if (TAX_CENTER.settings.shippoKey !== token) {
    TAX_CENTER.settings.shippoKey = token;
    saveTaxCenter().catch(e => console.warn('Shippo key save failed', e));
  }

  btn.disabled = true;
  if (statusEl) statusEl.textContent = 'Fetching Shippo transactions…';

  if (!TAX_CENTER.businessExpenses) TAX_CENTER.businessExpenses = [];
  const existingRefs = new Set((TAX_CENTER.businessExpenses || [])
    .filter(e => e && e.ref && String(e.ref).startsWith('shippo:'))
    .map(e => String(e.ref)));
  // Source of truth is current expense refs, so deleted/edited rows don't get permanently blocked
  // by stale saved object IDs from prior runs.
  const importedIds = new Set(Array.from(existingRefs)
    .map(ref => String(ref).replace(/^shippo:/, ''))
    .filter(Boolean));
  const fetchedIds = new Set();
  const pendingExpenses = [];

  // The list endpoint returns `rate` as a bare object-ID string (no cost on the
  // transaction itself), so we request expand[]=rate to get amount/currency
  // inline. If a row still arrives unexpanded, fall back to fetching the rate.
  const _rateCostCache = new Map();
  async function getTxCost(tx) {
    if (tx.rate && typeof tx.rate === 'object') {
      return { amount: parseFloat(tx.rate.amount), currency: String(tx.rate.currency || 'USD').toUpperCase() };
    }
    if (tx.rate_amount != null || tx.amount != null) {
      return { amount: parseFloat(tx.rate_amount != null ? tx.rate_amount : tx.amount),
               currency: String(tx.rate_currency || tx.currency || 'USD').toUpperCase() };
    }
    if (tx.rate && typeof tx.rate === 'string') {
      if (_rateCostCache.has(tx.rate)) return _rateCostCache.get(tx.rate);
      try {
        const r = await fetch(`https://api.goshippo.com/rates/${tx.rate}`, {
          headers: { Authorization: `ShippoToken ${token}`, 'Content-Type': 'application/json' }
        });
        if (r.ok) {
          const rate = await r.json();
          const out = { amount: parseFloat(rate.amount), currency: String(rate.currency || 'USD').toUpperCase() };
          _rateCostCache.set(tx.rate, out);
          return out;
        }
      } catch (_) { /* fall through to NaN */ }
    }
    return { amount: NaN, currency: 'USD' };
  }

  // Shippo label URLs can expire, so try to save a permanent copy to the local
  // receipts folder. Best-effort: returns a local:// path on success, otherwise
  // null so the caller keeps the original URL. May fail on CORS or no folder.
  async function saveLabelLocally(labelUrl, txId) {
    if (!labelUrl || typeof saveReceiptToLocalFile !== 'function') return null;
    try {
      const r = await fetch(labelUrl);
      if (!r.ok) return null;
      const blob = await r.blob();
      const ext = (blob.type && blob.type.includes('png')) ? 'png'
        : (/\.png(\?|$)/i.test(labelUrl) ? 'png' : 'pdf');
      const file = new File([blob], `shippo_${txId}.${ext}`, { type: blob.type || 'application/pdf' });
      return await saveReceiptToLocalFile(file, 'Shippo');
    } catch (_) {
      return null;
    }
  }

  let imported = 0;
  let skipped = 0;
  let alreadyImported = 0; // already in the ledger from a prior run (deduped)
  let totalUsd = 0;
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore && page <= 200) {
      // Shippo list transactions endpoint:
      //   GET /transactions with optional filters (rate, object_status,
      //   tracking_status, page, results). We intentionally avoid status
      //   query filters here so valid paid labels in non-default states
      //   still appear and can be imported.
      const url = `https://api.goshippo.com/transactions/?page=${page}&results=100&expand[]=rate`;
      const resp = await fetch(url, {
        headers: {
          Authorization: `ShippoToken ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`Shippo API error ${resp.status}${txt ? `: ${txt.slice(0,140)}` : ''}`);
      }
      const json = await resp.json();
      const rows = json.results || [];
      for (const tx of rows) {
        const status = String(tx?.status || '').toUpperCase();
        if (!tx || status === 'REFUNDED' || status === 'ERROR' || status === 'INVALID') { skipped++; continue; }
        const txId = String(tx.object_id || '').trim();
        if (!txId) { skipped++; continue; } // require stable ID so repeat imports are idempotent
        const ref = `shippo:${txId}`;
        // Dedupe before the (possibly networked) cost lookup so re-syncs stay cheap.
        // Keyed on Shippo's stable object_id (persisted as ref:"shippo:<id>"),
        // so re-running weeks later only adds labels not already in the ledger.
        if (fetchedIds.has(txId) || importedIds.has(txId) || existingRefs.has(ref)) { alreadyImported++; continue; }

        const { amount, currency } = await getTxCost(tx);
        if (!Number.isFinite(amount) || amount <= 0) { skipped++; continue; }

        existingRefs.add(ref);
        importedIds.add(txId);
        fetchedIds.add(txId);

        const dateRaw = tx.object_created || tx.object_updated || '';
        const date = /^\d{4}-\d{2}-\d{2}/.test(dateRaw) ? dateRaw.slice(0, 10) : today();

        // Convert to CAD for the master ledger using the rate as of the label's
        // date (what the CRA expects), falling back to live then cached rates.
        let fxRate = currency === 'CAD' ? 1 : 0;
        if (currency !== 'CAD') {
          try { const h = await fetchHistoricalRate(currency, 'CAD', date); fxRate = h?.rate || 0; } catch (_) { /* fall through */ }
          if (!fxRate) { try { const r = await fetchLiveRate(currency, 'CAD'); fxRate = r?.rate || 0; } catch (_) { /* fall through */ } }
          if (!fxRate) fxRate = _fxRateCache[`${currency}_CAD`] || 0;
        }
        if (!fxRate) fxRate = 1; // last resort so the cost is still recorded

        const labelUrl = tx.label_url || '';
        const localReceipt = labelUrl ? await saveLabelLocally(labelUrl, txId) : null;

        pendingExpenses.push({
          id: Date.now() + imported + 1,
          desc: `Shippo shipping label${tx.tracking_number ? ` #${tx.tracking_number}` : ''}`,
          cat: 'Shipping & Postage',
          currency,
          amount,
          origCurrency: currency,
          origAmount: amount,
          fxRate,
          baseAmount: amount * fxRate,
          date,
          ref,
          receipt: localReceipt || labelUrl,
          trackingUrl: tx.tracking_url_provider || '',
          trip: ''
        });
        imported++;
        if (currency === 'USD') totalUsd += amount;
      }

      hasMore = Boolean(json.next);
      page += 1;
      if (statusEl) statusEl.textContent = `Fetched ${imported + skipped} transactions…`; 
    }

    if (imported > 0) {
      // Build a cost breakdown so the confirmation reflects what will actually
      // be written: total CAD, original amounts per currency, and date range.
      const totalCad = pendingExpenses.reduce((s, e) => s + (e.baseAmount || 0), 0);
      const byCur = {};
      for (const e of pendingExpenses) byCur[e.currency] = (byCur[e.currency] || 0) + (e.amount || 0);
      const curLines = Object.keys(byCur).sort()
        .map(c => `  • ${byCur[c].toFixed(2)} ${c}`).join('\n');
      const dates = pendingExpenses.map(e => e.date).filter(Boolean).sort();
      const range = dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : '—';

      const accept = confirm(
        `Add ${imported} new Shippo shipping cost${imported === 1 ? '' : 's'} to your master ledger?\n\n` +
        `Total: ${totalCad.toFixed(2)} CAD\n` +
        `Original amounts:\n${curLines}\n` +
        `Dates: ${range}\n` +
        (alreadyImported ? `Already in ledger (skipped): ${alreadyImported}\n` : '') +
        `\nOnly new labels are listed above — nothing is written until you click OK.`
      );
      if (!accept) {
        if (statusEl) statusEl.textContent = `Found ${imported} new Shippo transactions (${totalCad.toFixed(2)} CAD). Import cancelled before ledger insertion.`;
        showToast('Shippo import cancelled before insertion', 'warn');
        return;
      }
    }

    if (pendingExpenses.length > 0) {
      TAX_CENTER.businessExpenses.unshift(...pendingExpenses.reverse());
    }

    TAX_CENTER.settings.shippoImportedObjectIds = Array.from(importedIds).slice(-10000);
    TAX_CENTER.settings.shippoLastImportAt = new Date().toISOString();
    await saveTaxCenter();
    renderTaxCenter();
    const dupNote = alreadyImported ? ` ${alreadyImported} already imported.` : '';
    if (statusEl) statusEl.textContent = imported
      ? `Imported ${imported} new Shippo transactions.${dupNote}${skipped ? ` ${skipped} skipped.` : ''}${totalUsd ? ` USD imported: ${totalUsd.toFixed(2)}.` : ''}`
      : `No new Shippo transactions to import.${dupNote}${skipped ? ` ${skipped} skipped.` : ''}`;
    showToast(
      imported
        ? `✓ Imported ${imported} new Shippo expense${imported === 1 ? '' : 's'}`
        : (alreadyImported ? `No new Shippo expenses (${alreadyImported} already imported)` : 'No new Shippo expenses to import'),
      imported ? 'ok' : 'warn'
    );
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = `Error: ${e.message || e}`;
    showToast('⚠ Shippo import failed', 'err');
  } finally {
    btn.disabled = false;
  }
}

async function submitTaxExpense() {
  const desc = ($('tc-exp-desc').value || '').trim();
  const cat = $('tc-exp-cat').value;
  const currency = $('tc-exp-cur').value || 'CAD';
  const amount = parseFloat($('tc-exp-amount').value) || 0;
  const date = $('tc-exp-date').value || today();
  
  if(!desc){ showToast('⚠ Please enter a description','warn'); $('tc-exp-desc').focus(); return; }
  if(!amount){ showToast('⚠ Please enter an amount','warn'); $('tc-exp-amount').focus(); return; }

  const fileInput = $('tc-exp-file');
  let receiptUrl = '';
  if(fileInput && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const submitBtn = $('tc-submit-exp-btn');
    const oldText = submitBtn.textContent;
    submitBtn.textContent = 'Saving locally...'; submitBtn.disabled = true;
    try {
      // For Tax Centre, use a "General" subfolder or the project name if applicable
      const localUrl = await saveReceiptToLocalFile(file, 'General');
      if (localUrl) receiptUrl = localUrl;
    } catch(e) {
      console.error(e);
      showToast('⚠ Error saving receipt', 'err');
      submitBtn.textContent = oldText; submitBtn.disabled = false;
      return;
    }
    submitBtn.textContent = oldText; submitBtn.disabled = false;
  }

  // Multi-currency calculation
  const fxRate = _fxRateCache[`${currency}_CAD`] || 1;
  const baseAmount = amount * fxRate;

  if(!TAX_CENTER.businessExpenses) TAX_CENTER.businessExpenses = [];
  const trip = ($('tc-exp-trip')?.value || '').trim();
  TAX_CENTER.businessExpenses.unshift({id: Date.now(), desc, cat, currency, amount, fxRate, baseAmount, date, ref: '', receipt: receiptUrl, trip});

  saveTaxCenter();
  renderTaxCenter();
  showToast(trip ? `✓ Logged to trip: ${trip}` : '✓ Business Expense logged');
  $('tc-exp-desc').value='';$('tc-exp-amount').value='';$('tc-exp-date').value=today();
  if($('tc-exp-trip')) $('tc-exp-trip').value='';
  if(fileInput) fileInput.value = '';
}

function addRecurring() {
  const desc = ($('tc-rec-desc').value || '').trim();
  const cat = $('tc-rec-cat').value;
  const currency = $('tc-rec-cur').value || 'CAD';
  const amount = parseFloat($('tc-rec-amount').value) || 0;
  const startDate = $('tc-rec-start').value || today();

  if(!desc || !amount) { showToast('⚠ Details required','warn'); return; }
  if(!TAX_CENTER.recurring) TAX_CENTER.recurring = [];
  TAX_CENTER.recurring.push({ desc, cat, currency, amount, startDate, lastInjected: '' });
  saveTaxCenter();
  renderTaxCenter();
  showToast('✓ Subscription added');
  $('tc-rec-desc').value=''; $('tc-rec-amount').value=''; $('tc-rec-start').value='';
}

function removeRecurring(idx) {
    TAX_CENTER.recurring.splice(idx, 1);
    saveTaxCenter();
    renderTaxCenter();
    showToast('✓ Subscription removed');
}

function downloadTaxLedgerCSV() {
    const rows = [];
    rows.push(['Date','Type','Description','Category','Orig Amount','Base Amount']);
    const ledTbody = $('tc-ledger-body');
    if (!ledTbody) return;
    ledTbody.querySelectorAll('tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if(tds.length === 7) {
           rows.push([
               `"${tds[0].innerText}"`,
               `"${tds[1].innerText}"`,
               `"${tds[2].innerText}"`,
               `"${tds[3].innerText}"`,
               `"${tds[5].innerText.replace('⚠️', '').trim()}"`,
               `"${tds[6].innerText}"`
           ]);
        }
    });
    const csvStr = rows.map(r=>r.join(',')).join('\n');
    const blob = new Blob([csvStr],{type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tax_Ledger_${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Smart categorization listener
const TAX_CATEGORIES = {
    'squarespace': 'Software & Subscriptions',
    'shopify': 'Software & Subscriptions',
    'google': 'Software & Subscriptions',
    'hosting': 'Software & Subscriptions',
    'domain': 'Software & Subscriptions',
    'adobe': 'Software & Subscriptions',
    'meta': 'Marketing & Advertising',
    'facebook': 'Marketing & Advertising',
    'instagram': 'Marketing & Advertising',
    'ads': 'Marketing & Advertising',
    'mailchimp': 'Marketing & Advertising',
    'usps': 'Shipping & Postage',
    'fedex': 'Shipping & Postage',
    'ups': 'Shipping & Postage',
    'royal mail': 'Shipping & Postage',
    'post office': 'Shipping & Postage',
    'stamps': 'Shipping & Postage',
    'paper': 'Office Supplies',
    'ink': 'Office Supplies',
    'boxes': 'Office Supplies',
    'mailers': 'Office Supplies',
    'flight': 'Travel & Meals',
    'uber': 'Travel & Meals',
    'hotel': 'Travel & Meals',
    'dinner': 'Travel & Meals',
    'lunch': 'Travel & Meals',
    'accountant': 'Professional Services',
    'legal': 'Professional Services',
    'lawyer': 'Professional Services',
    'printer': 'Printing & Production',
    'printing': 'Printing & Production',
    'proof': 'Editorial & Proofreading',
    'editor': 'Editorial & Proofreading',
    'copyedit': 'Editorial & Proofreading',
    'illustration': 'Illustration & Photography',
    'illustrator': 'Illustration & Photography',
    'photo': 'Illustration & Photography',
    'photographer': 'Illustration & Photography',
    'licensing': 'Rights & Permissions',
    'rights': 'Rights & Permissions',
    'permission': 'Rights & Permissions',
    'isbn': 'ISBN, Barcodes & Cataloging',
    'barcode': 'ISBN, Barcodes & Cataloging',
    'cataloging': 'ISBN, Barcodes & Cataloging',
    'warehouse': 'Warehousing & Fulfillment',
    'fulfillment': 'Warehousing & Fulfillment',
    'packaging': 'Packaging Materials',
    'bubble wrap': 'Packaging Materials',
    'research': 'Books, Research & Reference',
    'reference': 'Books, Research & Reference',
    'museum': 'Events & Exhibitions',
    'exhibition': 'Events & Exhibitions',
    'fair': 'Events & Exhibitions',
};

document.addEventListener('DOMContentLoaded', () => {
    const descInput = document.getElementById('tc-exp-desc');
    if(descInput) {
        descInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            const catSelect = document.getElementById('tc-exp-cat');
            if(!catSelect) return;
            for(const keyword in TAX_CATEGORIES) {
                if(val.includes(keyword)) {
                    catSelect.value = TAX_CATEGORIES[keyword];
                    break;
                }
            }
        });
    }
});


document.addEventListener('DOMContentLoaded', () => {
  const numericIds = ['nb-max','nb-price','nb-thresh','nb-prod','m-qty','m-price','sale-qty','sale-price','sent-qty','exp-amt','tc-exp-amt'];
  numericIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('inputmode', 'decimal');
  });
});

// ── EVENT POS ──
let posCart = {};
let posPendingSale = null;
const POS_FX_STORAGE_KEY = 'lm_pos_exchange_rates_v1';
const POS_FX_FETCHED_AT_KEY = 'lm_pos_fx_fetched_at';
const POS_DEFAULT_CAD_RATES = { CAD: 1, EUR: 1.47, USD: 1.36, GBP: 1.73 };
let posExchangeRates = loadPosExchangeRates();

// Default to the native currency of the first book in the catalog, falling back to EUR
function _getPosDefaultCurrency() {
  const firstBook = Object.values(BOOKS)[0];
  return firstBook ? currencyToCode(firstBook.currency) : 'EUR';
}
let posTransactionCurrency = _getPosDefaultCurrency();

function loadPosExchangeRates() {
  try {
    const raw = localStorage.getItem(POS_FX_STORAGE_KEY);
    if (!raw) return { ...POS_DEFAULT_CAD_RATES };
    const parsed = JSON.parse(raw);
    return { ...POS_DEFAULT_CAD_RATES, ...parsed, CAD: 1 };
  } catch {
    return { ...POS_DEFAULT_CAD_RATES };
  }
}

function savePosExchangeRates() {
  localStorage.setItem(POS_FX_STORAGE_KEY, JSON.stringify(posExchangeRates));
}

// Delegate to the canonical helpers defined earlier so the POS uses the
// same symbol↔code mapping as the rest of the app (avoids CA$/CAD and
// $/USD ambiguities).
function currencyToCode(cur) {
  return normalizeCurrencyCode(cur, 'EUR');
}

function codeToSymbol(code) {
  return getSym(code);
}

function posFormat(amount, currencyCode) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amount || 0);
}

function convertCurrency(amount, fromCode, toCode) {
  if (fromCode === toCode) return amount;
  const fromRate = posExchangeRates[fromCode];
  const toRate = posExchangeRates[toCode];
  if (!fromRate || !toRate) return null;
  const cadValue = amount * fromRate;
  return cadValue / toRate;
}

function getPOSCurrencies() {
  const fromBooks = Object.values(BOOKS).map((b) => currencyToCode(b.currency));
  const unique = Array.from(new Set([...fromBooks, 'EUR', 'CAD', 'USD']));
  return unique.filter(Boolean);
}

function buildPOSCartRows() {
  const items = [];
  for (const [bookId, qty] of Object.entries(posCart)) {
    if (!qty) continue;
    const book = BOOKS[bookId];
    if (!book) continue;
    const sourceCode = currencyToCode(book.currency);
    const convertedUnit = convertCurrency(book.listPrice || 0, sourceCode, posTransactionCurrency);
    items.push({
      book,
      qty,
      sourceCode,
      sourceUnit: book.listPrice || 0,
      sourceLine: (book.listPrice || 0) * qty,
      convertedUnit,
      convertedLine: convertedUnit === null ? null : convertedUnit * qty
    });
  }
  return items;
}

function renderPOS() {
  const grid = $('pos-grid');
  if(!grid) return;

  const cartRows = buildPOSCartRows();
  const cartItemsEl = $('pos-cart-items');
  const subtotalEl = $('pos-subtotal-lines');
  const totalEl = $('pos-total');
  const totalNoteEl = $('pos-total-note');
  const selectorEl = $('pos-currency');
  const currencyOptions = getPOSCurrencies();
  if (!currencyOptions.includes(posTransactionCurrency)) posTransactionCurrency = currencyOptions[0] || 'EUR';

  if (selectorEl) {
    selectorEl.innerHTML = currencyOptions.map((code) => `<option value="${code}">${code}</option>`).join('');
    selectorEl.value = posTransactionCurrency;
  }

  let convertedTotal = 0;
  let hasMissingFx = false;
  const mixedTotals = {};
  cartRows.forEach((row) => {
    mixedTotals[row.sourceCode] = (mixedTotals[row.sourceCode] || 0) + row.sourceLine;
    if (row.convertedLine === null) hasMissingFx = true;
    else convertedTotal += row.convertedLine;
  });

  const booksToRender = isAuthor() && activeBook !== 'all' ? { [activeBook]: BOOKS[activeBook] } : BOOKS;
  grid.innerHTML = Object.values(booksToRender).map((book) => {
    const qty = posCart[book.id] || 0;
    const sourceCode = currencyToCode(book.currency);
    const converted = convertCurrency(book.listPrice || 0, sourceCode, posTransactionCurrency);
    const convertedLabel = converted === null
      ? `No FX rate → ${posFormat(book.listPrice || 0, sourceCode)}`
      : `${posFormat(converted, posTransactionCurrency)} (${sourceCode})`;
    return `
      <div class="card pos-card" style="display:flex; flex-direction:column; justify-content:space-between; padding:1.1rem;">
        <div>
          <div style="font-family:'Playfair Display',serif; font-size:18px; font-weight:600; margin-bottom:4px; color:var(--cream);">${book.title}</div>
          <div style="font-size:12px; color:var(--text3);">${posFormat(book.listPrice || 0, sourceCode)} · ${convertedLabel}</div>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:1rem; background:rgba(255,255,255,.05); border-radius:var(--r2); padding:6px;">
          <button class="btn sm pos-qty-btn" style="width:36px;height:36px;padding:0;display:flex;align-items:center;justify-content:center;font-size:18px;" onclick="posUpdateQty('${book.id}', -1)">-</button>
          <span style="font-size:18px; font-weight:700; font-family:'DM Mono',monospace; width:40px; text-align:center;">${qty}</span>
          <button class="btn sm pos-qty-btn" style="width:36px;height:36px;padding:0;display:flex;align-items:center;justify-content:center;font-size:18px;" onclick="posUpdateQty('${book.id}', 1)">+</button>
        </div>
      </div>
    `;
  }).join('');

  if (cartItemsEl) {
    cartItemsEl.innerHTML = cartRows.length ? cartRows.map((row) => `
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.08);">
        <div>
          <div style="font-size:13px;color:var(--cream);font-weight:600;">${row.book.title}</div>
          <div style="font-size:11px;color:var(--text3);">${row.qty} × ${posFormat(row.sourceUnit, row.sourceCode)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:13px;color:var(--cream);">${row.convertedLine === null ? posFormat(row.sourceLine, row.sourceCode) : posFormat(row.convertedLine, posTransactionCurrency)}</div>
          <button class="btn sm" style="padding:2px 6px;font-size:11px;margin-top:3px;" onclick="posRemoveItem('${row.book.id}')">Remove</button>
        </div>
      </div>
    `).join('') : '<div style="font-size:12px;color:var(--text3);padding:8px 0;">Cart is empty.</div>';
  }

  if (subtotalEl) {
    const subtotalRows = Object.entries(mixedTotals).map(([code, amount]) => `<div>${code}: ${posFormat(amount, code)}</div>`).join('');
    subtotalEl.innerHTML = subtotalRows || '<div>—</div>';
  }

  if (totalEl) {
    totalEl.textContent = hasMissingFx
      ? Object.entries(mixedTotals).map(([code, amount]) => `${codeToSymbol(code)}${amount.toFixed(2)}`).join(' + ')
      : posFormat(convertedTotal, posTransactionCurrency);
  }
  if (totalNoteEl) {
    totalNoteEl.textContent = hasMissingFx
      ? 'Mixed currency total: configure FX rates or finish in native currencies.'
      : `Transaction currency: ${posTransactionCurrency}`;
  }
}

window.posUpdateQty = function(bookId, delta) {
  posCart[bookId] = Math.max(0, (posCart[bookId] || 0) + delta);
  if (posCart[bookId] === 0) delete posCart[bookId];
  renderPOS();
};

window.posRemoveItem = function(bookId) {
  delete posCart[bookId];
  renderPOS();
};

window.posSetCurrency = function(code) {
  posTransactionCurrency = code || posTransactionCurrency;
  renderPOS();
};

// Fetch live rates for all POS currencies (CAD-pivot) and populate both
// posExchangeRates and _fxRateCache so Tax Center conversions stay correct.
window.posConfigureRates = async function() {
  const currencies = getPOSCurrencies().filter(c => c !== 'CAD');
  const btn = document.querySelector('[onclick="posConfigureRates()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Fetching…'; }

  let fetched = 0, failed = [];
  for (const code of currencies) {
    // Rate: how many CAD per 1 unit of `code` (e.g. 1 EUR → 1.47 CAD)
    const result = await fetchLiveRate(code, 'CAD');
    if (result.rate) {
      posExchangeRates[code] = result.rate;
      _fxRateCache[`${code}_CAD`] = result.rate;
      fetched++;
    } else {
      failed.push(code);
    }
    // Also cache the inverse (CAD→code) for book-currency→txn-currency conversion
    if (result.rate) {
      _fxRateCache[`CAD_${code}`] = 1 / result.rate;
    }
    // For non-CAD book currencies vs non-CAD txn currencies, cache cross-pairs too
    for (const other of currencies) {
      if (other === code) continue;
      const crossResult = await fetchLiveRate(code, other);
      if (crossResult.rate) _fxRateCache[`${code}_${other}`] = crossResult.rate;
    }
  }
  posExchangeRates.CAD = 1;
  _fxRateCache['CAD_CAD'] = 1;
  savePosExchangeRates();
  localStorage.setItem(POS_FX_FETCHED_AT_KEY, new Date().toISOString());

  renderPOS();
  renderPOSFxStatus();

  if (btn) { btn.disabled = false; btn.textContent = 'FX Rates'; }
  if (failed.length) {
    showToast(`Rates updated (${fetched} live · ${failed.join(', ')} unavailable — using cached)`, 'warn');
  } else {
    showToast(`✓ Live FX rates updated for ${fetched} currencies`, 'ok');
  }
};

// Render a small status line below the FX button showing rate freshness
function renderPOSFxStatus() {
  const el = document.getElementById('pos-fx-status');
  if (!el) return;
  const ts = localStorage.getItem(POS_FX_FETCHED_AT_KEY);
  if (!ts) {
    el.textContent = 'Using saved rates — click FX Rates to refresh';
    el.style.color = 'var(--amber)';
  } else {
    const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    const label = mins < 2 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins/60)}h ago`;
    el.textContent = `Live rates fetched ${label}`;
    el.style.color = 'var(--green)';
  }
};

// ── POS cart-to-manual-entry adapter
// Maps a POS cart item into the exact payload shape that recordOrder expects,
// so that POS sales and manual entry sales are written to the ledger identically.
//
// fxRate must be the live rate from paymentCurrency → bookNativeCurrency
// (i.e. the same direction fetchLiveRate uses), matching how manual entry works.
function _posItemToManualPayload(book, qty, paymentMethod, basePrice, txnCurCode, convertedUnitInTxnCur, nativePerTxnRate) {
  const nativeCurCode = getBookCurrencyCode(book);
  const isFx = txnCurCode !== nativeCurCode;

  // Amount actually paid in the transaction currency (what the customer handed over)
  const foreignTotal = qty * convertedUnitInTxnCur;

  const payment = buildPaymentMeta({
    book,
    qty,
    unitPrice: basePrice,          // native-currency unit price (for revenue/ledger)
    fxEnabled: isFx,
    fxCur: txnCurCode,             // what currency was actually paid
    fxAmt: foreignTotal,           // total amount paid in that currency
    fxRate: nativePerTxnRate || 1  // rate: 1 txnCur = N nativeCur  (e.g. 1 CAD = 0.68 EUR)
  });

  const num = `POS-${Date.now().toString().slice(-6)}`;
  const chan = 'Book Fair';
  const notes = paymentMethod;
  return { num, chan, qty, price: basePrice, notes, payment };
}

window.posCheckout = function() {
  const method = $('pos-payment-method').value;
  const rows = buildPOSCartRows();
  
  if(rows.length === 0) {
      showToast('Cart is empty', 'warn');
      return;
  }

  const hasMissingFx = rows.some((row) => row.convertedLine === null);
  const totalCharged = hasMissingFx
    ? rows.map((row) => `${row.sourceCode} ${row.sourceLine.toFixed(2)}`).join(' + ')
    : posFormat(rows.reduce((sum, row) => sum + (row.convertedLine || 0), 0), posTransactionCurrency);

  const timestamp = new Date();
  const localeTs = timestamp.toLocaleString('en-CA');
  posPendingSale = {
    method,
    rows,
    hasMissingFx,
    totalCharged,
    currency: posTransactionCurrency,
    timestampIso: timestamp.toISOString(),
    timestampLabel: localeTs
  };

  $('pos-confirm-items').innerHTML = rows.map((row) => {
    const lineDisplay = row.convertedLine === null ? posFormat(row.sourceLine, row.sourceCode) : posFormat(row.convertedLine, posTransactionCurrency);
    return `<tr><td>${row.book.title}</td><td class="r">${row.qty}</td><td class="r">${lineDisplay}</td></tr>`;
  }).join('');
  $('pos-confirm-payment').textContent = method;
  $('pos-confirm-timestamp').textContent = localeTs;
  $('pos-confirm-total').textContent = totalCharged;
  openM('pos-sale-confirm');
};

window.posConfirmSale = async function() {
  if (!posPendingSale) return;

  const previousBook = activeBook;

  for (const row of posPendingSale.rows) {
    const book = row.book;
    const qty = row.qty;

    // basePrice = native-currency unit price (what flows into revenue, ledger, and Sheets)
    const basePrice = row.sourceUnit;
    const nativeCurCode = getBookCurrencyCode(book);

    // txnCurCode = the currency the customer actually paid in
    const txnCurCode = (row.convertedUnit === null) ? row.sourceCode : posPendingSale.currency;
    const isFx = txnCurCode !== nativeCurCode;

    // convertedUnitInTxnCur = unit price expressed in the txn currency
    const convertedUnitInTxnCur = (row.convertedUnit === null) ? row.sourceUnit : row.convertedUnit;

    // nativePerTxnRate: how many native units = 1 txn-currency unit
    // e.g. for a EUR-priced book paid in CAD: rate = how many EUR per 1 CAD
    // This must match the direction fetchLiveRate(txnCur, nativeCur) returns,
    // which is exactly what _fxRateCache[`${txnCurCode}_${nativeCurCode}`] holds.
    let nativePerTxnRate = 1;
    if (isFx) {
      const cacheKey = `${txnCurCode}_${nativeCurCode}`;
      if (_fxRateCache[cacheKey]) {
        nativePerTxnRate = _fxRateCache[cacheKey];
      } else {
        // Derive from CAD-pivot posExchangeRates as fallback:
        // (txnCur → CAD) / (nativeCur → CAD)  = txnCur → nativeCur
        const txnToCAD    = posExchangeRates[txnCurCode]    || 1;
        const nativeToCAD = posExchangeRates[nativeCurCode] || 1;
        nativePerTxnRate = txnToCAD / nativeToCAD;
        // Cache it for paymentSummary to use
        _fxRateCache[cacheKey] = nativePerTxnRate;
      }
    }

    // Temporarily set activeBook so recordOrder's getState()/getBook() resolve correctly
    activeBook = book.id;

    const { num, chan, notes, payment } = _posItemToManualPayload(
      book, qty, posPendingSale.method,
      basePrice, txnCurCode, convertedUnitInTxnCur, nativePerTxnRate
    );

    // recordOrder is the single shared sale-writing function used by manual entry.
    // basePrice (native currency) drives revenue so it's always in the book's own currency.
    recordOrder(num, chan, qty, basePrice, notes, payment);
  }

  activeBook = previousBook;

  closeM('pos-sale-confirm');
  posPendingSale = null;
  posCart = {};
  renderPOS();
  if (typeof renderAllOverview === 'function') renderAllOverview();
  updateHeader();
  showToast('✓ Sale complete — recorded to ledger', 'ok');
};

window.posPrintReceipt = function() {
  if (!posPendingSale) return;
  const rowsHtml = posPendingSale.rows.map((row) => {
    const line = row.convertedLine === null ? posFormat(row.sourceLine, row.sourceCode) : posFormat(row.convertedLine, posPendingSale.currency);
    return `<tr><td>${row.book.title}</td><td>${row.qty}</td><td style="text-align:right;">${line}</td></tr>`;
  }).join('');
  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) return;
  win.document.write(`
    <html><head><title>POS Receipt</title><style>body{font-family:Arial,sans-serif;padding:16px;} table{width:100%;border-collapse:collapse;} td,th{padding:6px 0;border-bottom:1px solid #ddd;} .r{text-align:right;} .mt{margin-top:12px;}</style></head>
    <body>
      <h2>Lyricalmyrical Books</h2>
      <div>Timestamp: ${posPendingSale.timestampLabel}</div>
      <div>Payment: ${posPendingSale.method}</div>
      <table class="mt"><thead><tr><th>Item</th><th>Qty</th><th class="r">Line</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      <h3 class="r">Total: ${posPendingSale.totalCharged}</h3>
    </body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
};

// ── PRINTABLE SALES TRACKER ──
let salesTrackerCustomBooks = [];

function renderSalesTrackerBookList() {
  const list = document.getElementById('st-books-list');
  if (!list) return;
  const booksToShow = isAuthor() && activeBook !== 'all'
    ? { [activeBook]: BOOKS[activeBook] }
    : BOOKS;
  const inventoryEntries = Object.values(booksToShow);

  const inventoryHtml = inventoryEntries.map((book) => `
    <label style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer;background:rgba(0,0,0,.03);">
      <input type="checkbox" class="st-book-check" data-kind="inv" value="${book.id}" checked style="width:16px;height:16px;cursor:pointer;">
      <span style="flex:1;font-size:13px;color:#111;font-weight:600;">${escapeHtml(book.title)}</span>
      <span style="font-size:11px;color:#555;">${escapeHtml(book.author || '')}</span>
    </label>
  `).join('');

  const customHtml = salesTrackerCustomBooks.map((book, idx) => `
    <label style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer;background:rgba(212,175,55,.12);border:1px dashed rgba(212,175,55,.5);">
      <input type="checkbox" class="st-book-check" data-kind="custom" value="${idx}" checked style="width:16px;height:16px;cursor:pointer;">
      <span style="flex:1;font-size:13px;color:#111;font-weight:600;">${escapeHtml(book.title)}</span>
      <span style="font-size:11px;color:#555;">${escapeHtml(book.author || '')}</span>
      <button type="button" onclick="salesTrackerRemoveCustom(${idx})" style="background:none;border:none;color:#a00;cursor:pointer;font-size:14px;padding:0 4px;" title="Remove">✕</button>
    </label>
  `).join('');

  if (!inventoryEntries.length && !salesTrackerCustomBooks.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text3);">No books available. Add a custom book below.</div>';
  } else {
    list.innerHTML = inventoryHtml + customHtml;
  }
}

window.openSalesTrackerModal = function() {
  const dateInput = document.getElementById('st-date');
  if (dateInput && !dateInput.value) dateInput.value = today();
  renderSalesTrackerBookList();
  openM('sales-tracker');
};

window.salesTrackerSelectAll = function(checked) {
  document.querySelectorAll('.st-book-check').forEach((el) => { el.checked = !!checked; });
};

window.salesTrackerAddCustom = function() {
  const titleEl = document.getElementById('st-custom-title');
  const authorEl = document.getElementById('st-custom-author');
  const title = (titleEl.value || '').trim();
  const author = (authorEl.value || '').trim();
  if (!title) {
    showToast('Enter a book title', 'warn');
    titleEl.focus();
    return;
  }
  salesTrackerCustomBooks.push({ title, author });
  titleEl.value = '';
  authorEl.value = '';
  renderSalesTrackerBookList();
  titleEl.focus();
};

window.salesTrackerRemoveCustom = function(idx) {
  salesTrackerCustomBooks.splice(idx, 1);
  renderSalesTrackerBookList();
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.printSalesTracker = function() {
  const eventName = (document.getElementById('st-event').value || '').trim();
  const dateValue = (document.getElementById('st-date').value || '').trim();
  let cols = parseInt(document.getElementById('st-cols').value, 10);
  if (!cols || cols < 1) cols = 10;
  if (cols > 30) cols = 30;

  const currencyCode = document.getElementById('st-currency').value || 'EUR';
  const currencySymbol = codeToSymbol(currencyCode);

  const selected = Array.from(document.querySelectorAll('.st-book-check'))
    .filter((el) => el.checked)
    .map((el) => ({ kind: el.dataset.kind, value: el.value }));

  if (!selected.length) {
    showToast('Select at least one book to include', 'warn');
    return;
  }

  const includeNotes = !!document.getElementById('st-notes').checked;

  const dateLabel = dateValue
    ? new Date(dateValue + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const colHeaders = Array.from({ length: cols }, (_, i) => `<th class="num">${i + 1}</th>`).join('');

  const bookRows = selected.map((sel) => {
    let title = '';
    let author = '';
    if (sel.kind === 'custom') {
      const cb = salesTrackerCustomBooks[parseInt(sel.value, 10)];
      if (!cb) return '';
      title = cb.title;
      author = cb.author || '';
    } else {
      const book = BOOKS[sel.value];
      if (!book) return '';
      title = book.title;
      author = book.author || '';
    }
    const tallyCells = Array.from({ length: cols }, () => '<td class="tally"></td>').join('');
    if (includeNotes) {
      const priceCells = Array.from({ length: cols }, () => '<td class="price-paid"></td>').join('');
      return `
        <tr>
          <td class="title" rowspan="2">
            <div class="title-name">${escapeHtml(title)}</div>
            ${author ? `<div class="title-meta">${escapeHtml(author)}</div>` : ''}
          </td>
          ${tallyCells}
          <td class="total" rowspan="2"></td>
        </tr>
        <tr class="price-row">
          ${priceCells}
        </tr>
      `;
    }
    return `
      <tr>
        <td class="title">
          <div class="title-name">${escapeHtml(title)}</div>
          ${author ? `<div class="title-meta">${escapeHtml(author)}</div>` : ''}
        </td>
        ${tallyCells}
        <td class="total"></td>
      </tr>
    `;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Book Sales Tracker${eventName ? ' — ' + escapeHtml(eventName) : ''}</title>
    <style>
      @page { size: letter landscape; margin: 0.4in; }
      * { box-sizing: border-box; }
      html, body { background: #fff; color: #111; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif; padding: 0.2in; }
      .header { text-align: center; margin-bottom: 14px; }
      .header h1 { margin: 0; font-size: 26pt; font-weight: 800; letter-spacing: -.01em; }
      .meta { display: flex; gap: 36px; margin-bottom: 12px; font-size: 12pt; }
      .meta-row { flex: 1; display: flex; align-items: baseline; gap: 8px; border-bottom: 1.5px solid #111; padding-bottom: 4px; }
      .meta-row .label { font-weight: 800; }
      .meta-row .value { flex: 1; font-weight: 500; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1.2px solid #111; padding: 0; height: 56px; }
      thead th { background: #e8e8e8; font-size: 11pt; font-weight: 800; text-align: center; height: 32px; padding: 4px; }
      thead th.title-col { text-align: left; padding-left: 10px; width: 22%; }
      thead th.total-col { background: #f4e4b8; width: 80px; }
      td.title { padding: 8px 10px; vertical-align: middle; }
      td.title .title-name { font-weight: 700; font-size: 11.5pt; line-height: 1.2; }
      td.title .title-meta { font-size: 9pt; color: #555; margin-top: 2px; }
      td.tally { background: #fff; }
      td.total { background: #fdf0c8; }
      td.price-paid { background: #fafafa; height: 28px; font-size: 9pt; color: #666; text-align: center; vertical-align: middle; }
      tr.price-row td.price-paid::before { content: "${currencySymbol} ___"; color: #bbb; font-size: 8pt; }
      tfoot td { border: none; padding-top: 14px; }
      .grand-row { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 18px; }
      .grand-label { font-size: 14pt; font-weight: 800; }
      .grand-box { width: 110px; height: 44px; border: 1.5px solid #111; background: #fdf0c8; }
      @media print { body { padding: 0; } }
    </style>
    </head><body>
      <div class="header"><h1>Book Sales Tracker</h1></div>
      <div class="meta">
        <div class="meta-row"><span class="label">Event:</span><span class="value">${escapeHtml(eventName)}</span></div>
        <div class="meta-row"><span class="label">Date:</span><span class="value">${escapeHtml(dateLabel)}</span></div>
      </div>
      <table>
        <thead>
          <tr>
            <th class="title-col">Book Title</th>
            ${colHeaders}
            <th class="total-col">TOTAL</th>
          </tr>
        </thead>
        <tbody>${bookRows}</tbody>
      </table>
      <div class="grand-row">
        <div class="grand-label">GRAND TOTAL</div>
        <div class="grand-box"></div>
      </div>
    </body></html>`;

  const win = window.open('', '_blank', 'width=1100,height=800');
  if (!win) {
    showToast('Pop-up blocked — allow pop-ups to print', 'warn');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 350);
  closeM('sales-tracker');
};

// ── PRINTABLE PAYMENT QR CODES ──
function renderQRPrintBookList() {
  const list = document.getElementById('qrp-books-list');
  if (!list) return;
  const booksToShow = isAuthor() && activeBook !== 'all'
    ? { [activeBook]: BOOKS[activeBook] }
    : BOOKS;
  const entries = Object.values(booksToShow);
  if (!entries.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text3);">No books available.</div>';
    return;
  }
  list.innerHTML = entries.map((book) => {
    const url = book.stripeLink || book.paymentLink || '';
    const hasUrl = !!url;
    return `
      <label style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer;background:rgba(0,0,0,.03);${hasUrl ? '' : 'opacity:.55;'}">
        <input type="checkbox" class="qrp-book-check" value="${book.id}" ${hasUrl ? 'checked' : ''} ${hasUrl ? '' : 'disabled'} style="width:16px;height:16px;cursor:pointer;">
        <span style="flex:1;font-size:13px;color:#111;font-weight:600;">${escapeHtml(book.title)}</span>
        <span style="font-size:11px;color:#555;">${escapeHtml(book.author || '')}</span>
        ${hasUrl ? '' : '<span style="font-size:10px;color:#a00;text-transform:uppercase;letter-spacing:.1em;">no link</span>'}
      </label>
    `;
  }).join('');
}

window.openQRPrintModal = function() {
  renderQRPrintBookList();
  openM('qr-print');
};

window.qrPrintSelectAll = function(checked) {
  document.querySelectorAll('.qrp-book-check').forEach((el) => {
    if (!el.disabled) el.checked = !!checked;
  });
};

window.printPaymentQRCodes = function() {
  const cols = Math.max(1, Math.min(6, parseInt(document.getElementById('qrp-cols').value, 10) || 3));
  const baseCur = document.getElementById('qrp-base-cur').value || 'auto';
  const showEUR = !!document.getElementById('qrp-show-eur').checked;
  const showCAD = !!document.getElementById('qrp-show-cad').checked;
  const showUSD = !!document.getElementById('qrp-show-usd').checked;

  const selectedIds = Array.from(document.querySelectorAll('.qrp-book-check'))
    .filter((el) => el.checked && !el.disabled)
    .map((el) => el.value);

  if (!selectedIds.length) {
    showToast('Select at least one book with a payment link', 'warn');
    return;
  }

  const currenciesShown = [];
  if (showCAD) currenciesShown.push('CAD');
  if (showEUR) currenciesShown.push('EUR');
  if (showUSD) currenciesShown.push('USD');

  const booksData = selectedIds.map((id) => {
    const book = BOOKS[id];
    const url = book.stripeLink || book.paymentLink || '';
    const nativeCode = currencyToCode(book.currency);
    const listedCode = baseCur === 'auto' ? nativeCode : baseCur;
    const listedAmount = baseCur === 'auto'
      ? (book.listPrice || 0)
      : convertCurrency(book.listPrice || 0, nativeCode, listedCode);

    const prices = currenciesShown.map((code) => {
      let amount;
      let approx = false;
      if (code === listedCode) {
        amount = listedAmount;
      } else if (listedAmount != null) {
        amount = convertCurrency(listedAmount, listedCode, code);
        approx = true;
      } else {
        amount = null;
      }
      const symbol = codeToSymbol(code);
      let display;
      if (amount == null) {
        display = '—';
      } else {
        const rounded = approx ? amount.toFixed(2) : amount.toFixed(2);
        display = `${approx ? '~' : ''}${symbol}${rounded}`;
      }
      return { currency: code, amount: display, base: code === listedCode };
    });

    return { id: book.id, title: book.title, author: book.author || '', url, prices };
  });

  const cardsHtml = booksData.map((book, i) => {
    const priceRows = book.prices.map((p) => `
      <tr${p.base ? ' class="base-price"' : ''}>
        <td>${escapeHtml(p.currency)}</td>
        <td>${escapeHtml(p.amount)}</td>
      </tr>
    `).join('');
    const pricesTable = book.prices.length ? `
      <table class="prices">
        <thead><tr><th>Currency</th><th>Price</th></tr></thead>
        <tbody>${priceRows}</tbody>
      </table>
    ` : '';
    return `
      <div class="card">
        <div class="card-num">${String(i + 1).padStart(2, '0')}</div>
        <div class="qr-frame"><div id="qr-${i}" data-url="${escapeHtml(book.url)}"></div></div>
        <div class="card-title">${escapeHtml(book.title)}</div>
        ${pricesTable}
        <div class="card-url">${escapeHtml(book.url)}</div>
      </div>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Lyricalmyrical Books — Payment QR Codes</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Jost:wght@200;300;400&display=swap" rel="stylesheet">
<style>
  :root {
    --ink: #1c1814;
    --paper: #faf8f4;
    --rule: #d6cfc4;
    --accent: #8b6f47;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--paper); font-family: 'Jost', sans-serif; font-weight: 300; color: var(--ink); }

  .header { text-align: center; padding: 48px 40px 32px; border-bottom: 1px solid var(--rule); }
  .header::before { content: ''; display: block; width: 40px; height: 1px; background: var(--accent); margin: 0 auto 18px; }
  .brand { font-family: 'Cormorant Garamond', serif; font-size: 2.4rem; font-weight: 300; letter-spacing: 0.12em; line-height: 1; }
  .brand em { font-style: italic; }
  .tagline { margin-top: 9px; font-size: 0.62rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--accent); }
  .date-line { margin-top: 5px; font-size: 0.58rem; letter-spacing: 0.18em; text-transform: uppercase; color: #aaa; }

  .grid { display: flex; flex-wrap: wrap; justify-content: center; }

  .card {
    width: calc(100% / ${cols});
    padding: 32px 24px 28px; border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule);
    display: flex; flex-direction: column; align-items: center; position: relative;
  }
  .card:nth-child(${cols}n) { border-right: none; }
  .card::before, .card::after { content: ''; position: absolute; width: 7px; height: 7px; border-color: var(--accent); border-style: solid; opacity: 0.35; }
  .card::before { top: 9px; left: 9px; border-width: 1px 0 0 1px; }
  .card::after  { bottom: 9px; right: 9px; border-width: 0 1px 1px 0; }

  .card-num { font-size: 0.52rem; letter-spacing: 0.22em; color: var(--accent); text-transform: uppercase; margin-bottom: 12px; font-weight: 400; }

  .qr-frame { width: 156px; height: 156px; padding: 9px; background: #fff; border: 1px solid var(--rule); display: flex; align-items: center; justify-content: center; margin-bottom: 18px; flex-shrink: 0; }

  .card-title { font-family: 'Cormorant Garamond', serif; font-size: 1.1rem; font-style: italic; font-weight: 400; text-align: center; line-height: 1.3; margin-bottom: 14px; }

  .prices { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .prices thead tr { border-bottom: 1px solid var(--rule); }
  .prices thead th { font-size: 0.52rem; font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: #aaa; padding: 0 0 5px; text-align: left; }
  .prices thead th:last-child { text-align: right; }
  .prices tbody tr { border-bottom: 1px solid #f0ebe3; }
  .prices tbody tr:last-child { border-bottom: none; }
  .prices tbody td { font-size: 0.68rem; padding: 5px 0; color: var(--ink); letter-spacing: 0.04em; }
  .prices tbody td:first-child { color: var(--accent); font-size: 0.6rem; letter-spacing: 0.15em; text-transform: uppercase; font-weight: 400; }
  .prices tbody td:last-child { text-align: right; font-family: 'Cormorant Garamond', serif; font-size: 0.85rem; }
  .prices .base-price td:first-child { color: var(--ink); }

  .card-url { font-size: 0.5rem; color: #c0b8ae; word-break: break-all; text-align: center; margin-top: 8px; line-height: 1.5; }

  .footer { border-top: 1px solid var(--rule); padding: 18px 40px; display: flex; align-items: center; justify-content: space-between; }
  .footer-brand { font-family: 'Cormorant Garamond', serif; font-size: 0.82rem; font-style: italic; color: #aaa; letter-spacing: 0.08em; }
  .footer-note { font-size: 0.58rem; letter-spacing: 0.14em; text-transform: uppercase; color: #bbb; }

  .print-bar { position: fixed; bottom: 22px; right: 22px; z-index: 100; }
  .print-btn { background: var(--ink); color: var(--paper); border: none; font-family: 'Jost', sans-serif; font-size: 0.68rem; font-weight: 300; letter-spacing: 0.16em; text-transform: uppercase; padding: 12px 26px; cursor: pointer; transition: background 0.2s; }
  .print-btn:hover { background: var(--accent); }

  @media print {
    @page { size: A4; margin: 0; }
    body { background: white; }
    .print-bar { display: none; }
    .header { padding: 32px 28px 24px; }
    .brand { font-size: 2rem; }
    .card { padding: 24px 18px 20px; }
    .qr-frame { width: 140px; height: 140px; }
  }
</style>
</head>
<body>

<header class="header">
  <div class="brand"><em>Lyricalmyrical</em> Books</div>
  <div class="tagline">Scan to purchase · Secured by Stripe</div>
  <div class="date-line" id="date-line"></div>
</header>

<div class="grid">${cardsHtml}</div>

<footer class="footer">
  <span class="footer-brand">Lyricalmyrical Books</span>
  <span class="footer-note">All transactions secured by Stripe · Adaptive Pricing enabled</span>
</footer>

<div class="print-bar">
  <button class="print-btn" onclick="window.print()">↓ Print / Save PDF</button>
</div>

<script>
document.getElementById('date-line').textContent = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
function renderQRs() {
  if (typeof QRCode === 'undefined') { setTimeout(renderQRs, 120); return; }
  document.querySelectorAll('[id^="qr-"]').forEach(function(el) {
    var url = el.getAttribute('data-url');
    if (!url) return;
    new QRCode(el, { text: url, width: 138, height: 138, colorDark: "#1c1814", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
  });
}
renderQRs();
<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1100,height=800');
  if (!win) {
    showToast('Pop-up blocked — allow pop-ups to print', 'warn');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  closeM('qr-print');
};

// ── TAX SEASON EXPORT ──
window.downloadFullTaxSeasonExport = function() {
  const yearSelect = document.getElementById('tc-year');
  const year = yearSelect ? yearSelect.value : 'all';
  const isAllTime = (year === 'all');
  
  let csv = 'Lyricalmyrical Tax Season Export\n';
  csv += 'Generated on: ' + today() + '\n';
  csv += 'Tax Year: ' + (isAllTime ? 'All Time' : year) + '\n\n';
  
  const esc = (txt) => `"${(txt || '').toString().replace(/"/g, '""')}"`;
  const getAmt = (e) => (parseFloat(e.baseAmount || e.amountCAD || e.amount || 0));

  // Section 1: Revenue by Book
  csv += '--- REVENUE BY BOOK ---\n';
  csv += 'Book Title,Gross Revenue,Net Revenue (after COGS & Royalty),Total Units Sold\n';
  
  Object.values(BOOKS).forEach(book => {
      const s = states[book.id] || defaultState(book);
      
      // Filter history
      const filteredHist = s.hist.filter(h => {
          if (h.voided || h.gratuity) return false;
          if (isAllTime) return true;
          return h.date && h.date.startsWith(year);
      });
      
      const sold = filteredHist.reduce((acc, h) => acc + (h.qty||0), 0);
      const revenue = filteredHist.reduce((acc, h) => acc + ((h.qty||0) * (h.price||0)), 0);
      
      // Filter expenses
      const filteredExpenses = (s.expenses || []).filter(e => {
          if (e.voided) return false;
          if (isAllTime) return true;
          return e.date && e.date.startsWith(year);
      });
      const expTotal = filteredExpenses.reduce((acc, e) => acc + getAmt(e), 0);
      
      // Royalty
      let shares = 0;
      if (isAllTime) {
          const earn = (typeof calculateArtistEarnings === 'function') ? calculateArtistEarnings(book.id) : null;
          shares = (earn && typeof earn === 'object') ? (earn.totalArtistEarned || 0) : (earn || 0);
      } else {
          shares = (typeof filterArtistEarningsByYear === 'function') ? filterArtistEarningsByYear(book.id, parseInt(year)) : 0;
      }
      
      const net = revenue - expTotal - shares;
      csv += `${esc(book.title)},${revenue.toFixed(2)},${net.toFixed(2)},${sold}\n`;
  });
  
  // Section 2: All Expenses & Payouts
  csv += '\n--- ALL EXPENSES & PAYOUTS ---\n';
  csv += 'Date,Book/Entity,Category,Description,Amount (CAD),Receipt Link\n';
  
  // 2a. Book-level expenses & payouts
  Object.values(BOOKS).forEach(book => {
      const s = states[book.id] || defaultState(book);
      
      // Book Expenses
      (s.expenses || []).filter(e => {
          if (e.voided) return false;
          if (isAllTime) return true;
          return e.date && e.date.startsWith(year);
      }).forEach(e => {
          csv += `${e.date},${esc(book.title)},${esc(e.cat)},${esc(e.desc)},${getAmt(e).toFixed(2)},${esc(e.receipt)}\n`;
      });

      // Artist Payouts (Transfers)
      (s.artistTransfers || []).filter(t => {
          if (isAllTime) return true;
          return t.date && t.date.startsWith(year);
      }).forEach(t => {
          // Use .total for payouts as per state structure
          csv += `${t.date},${esc(book.title)},"Artist Payout","Transfer to Artist",${(parseFloat(t.total || t.amount || 0)).toFixed(2)},""\n`;
      });
  });
  
  // 2b. Include Tax Center business expenses (General Publisher Expenses)
  const ledger = TAX_CENTER.businessExpenses || [];
  ledger.filter(l => {
      if (l.voided) return false;
      if (isAllTime) return true;
      return l.date && l.date.startsWith(year);
  }).forEach(l => {
      csv += `${l.date},"Publisher (General)",${esc(l.cat)},${esc(l.desc)},${getAmt(l).toFixed(2)},${esc(l.receipt)}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', `Lyrical_Tax_Season_${isAllTime ? 'AllTime' : year}_Export.csv`);
  a.click();
};

// ── STRIPE FEES BY YEAR
const _STRIPE_ZERO_DECIMAL = new Set(['BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF']);
function _stripeMinorToMajor(amt, cur) {
  return _STRIPE_ZERO_DECIMAL.has((cur || '').toUpperCase()) ? amt : amt / 100;
}

const _STRIPE_TYPE_LABELS = {
  charge: 'Customer payments',
  payment: 'Customer payments',
  refund: 'Refunds issued',
  payment_refund: 'Refunds issued',
  payment_refund_reversal: 'Refund reversals',
  refund_failure: 'Failed refunds',
  payout: 'Payouts to your bank',
  payout_cancel: 'Cancelled payouts',
  payout_failure: 'Failed payouts',
  stripe_fee: 'Stripe service fees',
  application_fee: 'App / platform fees',
  application_fee_refund: 'App fee refunds',
  adjustment: 'Adjustments',
  transfer: 'Transfers',
  transfer_cancel: 'Cancelled transfers',
  transfer_failure: 'Failed transfers',
  transfer_refund: 'Transfer refunds',
  dispute: 'Disputes / chargebacks',
  dispute_reversal: 'Dispute reversals',
  reserve_transaction: 'Reserve holds',
  reserved_funds: 'Reserved funds',
  topup: 'Account top-ups',
  topup_reversal: 'Top-up reversals',
  contribution: 'Contributions',
  issuing_authorization_hold: 'Card auth hold',
  issuing_authorization_release: 'Card auth release',
  issuing_transaction: 'Card transaction',
  issuing_dispute: 'Card dispute',
  tax_fee: 'Tax fees',
};
function _stripeFriendlyType(t) {
  return _STRIPE_TYPE_LABELS[t] || (t || 'Other').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function _stripeFmtMoney(amt, cur) {
  const sign = amt < 0 ? '-' : '';
  const abs = Math.abs(amt);
  return `${sign}${cur ? cur + ' ' : ''}${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function fetchStripeFeesByYear() {
  const keyEl = document.getElementById('stripe-fees-key');
  const statusEl = document.getElementById('stripe-fees-status');
  const btn = document.getElementById('stripe-fees-btn');
  const wrap = document.getElementById('stripe-fees-results-wrap');
  const key = (keyEl.value || '').trim();
  if (!key) { statusEl.textContent = 'Please paste a Stripe restricted key.'; return; }
  if (!/^(rk|sk)_/.test(key)) { statusEl.innerHTML = '<span style="color:var(--red);">That doesn\'t look like a Stripe secret/restricted key (expected rk_… or sk_…).</span>'; return; }

  // Persist the key so the user doesn't have to re-paste it next time.
  try {
    if (!TAX_CENTER.settings) TAX_CENTER.settings = {};
    if (TAX_CENTER.settings.stripeKey !== key) {
      TAX_CENTER.settings.stripeKey = key;
      if (typeof saveTaxCenter === 'function') saveTaxCenter().catch(e => console.warn('Stripe key save failed:', e));
    }
  } catch (e) { console.warn('Stripe key persist failed:', e); }

  btn.disabled = true;
  statusEl.textContent = 'Fetching balance transactions…';
  wrap.innerHTML = '';
  wrap.style.display = 'none';
  const reconcileWrap = document.getElementById('stripe-fees-reconcile-wrap');
  if (reconcileWrap) { reconcileWrap.innerHTML = ''; reconcileWrap.style.display = 'none'; }

  // Bucket per year+currency+type. Stripe balance_transactions include many types:
  //   charge, refund, payment, payment_refund, adjustment, stripe_fee, payout, payout_failure, etc.
  // Mixing them gives garbage fee%; we keep them split and surface "Sales (charges)" separately.
  const data = {}; // year -> cur -> type -> {gross, fee, net, count}
  const byYearCurAll = {}; // year -> cur -> { gross, fee, net, count } across types
  const allTxns = []; // for CSV/audit
  let count = 0;
  let starting_after = null;

  try {
    while (true) {
      const params = new URLSearchParams({ limit: '100' });
      if (starting_after) params.set('starting_after', starting_after);
      const resp = await fetch(`https://api.stripe.com/v1/balance_transactions?${params.toString()}`, {
        headers: { 'Authorization': 'Bearer ' + key }
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${resp.status}`);
      }
      const json = await resp.json();
      for (const tx of (json.data || [])) {
        const year = new Date((tx.created || 0) * 1000).getUTCFullYear();
        const cur = (tx.currency || '').toUpperCase();
        const type = tx.type || 'unknown';
        const y = data[year] = data[year] || {};
        const c = y[cur] = y[cur] || {};
        const t = c[type] = c[type] || { gross: 0, fee: 0, net: 0, count: 0 };
        t.gross += tx.amount || 0;
        t.fee   += tx.fee || 0;
        t.net   += tx.net || 0;
        t.count += 1;
        const ya = byYearCurAll[year] = byYearCurAll[year] || {};
        const ca = ya[cur] = ya[cur] || { gross: 0, fee: 0, net: 0, count: 0 };
        ca.gross += tx.amount || 0;
        ca.fee   += tx.fee || 0;
        ca.net   += tx.net || 0;
        ca.count += 1;
        allTxns.push({
          id: tx.id, created: tx.created, year, currency: cur, type,
          amount: tx.amount, fee: tx.fee, net: tx.net,
          source: tx.source, description: tx.description || ''
        });
        count++;
      }
      statusEl.textContent = `Fetched ${count} transactions…`;
      if (!json.has_more || !json.data.length) break;
      starting_after = json.data[json.data.length - 1].id;
    }

    window._stripeFeesAudit = allTxns; // available for CSV download / console inspection

    // Per year+currency aggregates used for ledger insertion and reconciliation.
    const SALES_FEE_TYPES = new Set(['charge', 'payment']);
    const ledgerData = [];
    for (const yr of Object.keys(data)) {
      for (const cur of Object.keys(data[yr])) {
        let salesFeeMinor = 0, salesCount = 0, totalFeeMinor = 0, salesGrossMinor = 0, stripeBillingMinor = 0;
        for (const t of Object.keys(data[yr][cur])) {
          totalFeeMinor += data[yr][cur][t].fee;
          if (SALES_FEE_TYPES.has(t)) {
            salesFeeMinor += data[yr][cur][t].fee;
            salesGrossMinor += data[yr][cur][t].gross;
            salesCount += data[yr][cur][t].count;
          }
          // Stripe billing/service fees (monthly fee, Radar, etc.) post as their
          // own negative-amount transactions; the cost is abs(amount/gross).
          if (t === 'stripe_fee') stripeBillingMinor += Math.abs(data[yr][cur][t].gross);
        }
        if (salesFeeMinor > 0 || stripeBillingMinor > 0 || salesGrossMinor > 0) {
          ledgerData.push({ year: Number(yr), cur, salesFeeMinor, salesCount, totalFeeMinor, salesGrossMinor, stripeBillingMinor });
        }
      }
    }
    window._stripeFeesLedgerData = ledgerData;

    const years = Object.keys(data).sort((a, b) => Number(b) - Number(a)); // newest first
    const cards = [];
    const SALES_TYPES = new Set(['charge', 'payment']); // gross sales (positive amount, has fee)
    for (const year of years) {
      const curs = Object.keys(data[year]).sort();
      for (const cur of curs) {
        const types = data[year][cur];
        const salesAgg = { gross: 0, fee: 0, net: 0, count: 0 };
        for (const t of Object.keys(types)) {
          if (SALES_TYPES.has(t)) {
            salesAgg.gross += types[t].gross;
            salesAgg.fee   += types[t].fee;
            salesAgg.net   += types[t].net;
            salesAgg.count += types[t].count;
          }
        }

        // Headline (sales) section
        let headline;
        if (salesAgg.count > 0) {
          const gross = _stripeMinorToMajor(salesAgg.gross, cur);
          const fee   = _stripeMinorToMajor(salesAgg.fee, cur);
          const net   = _stripeMinorToMajor(salesAgg.net, cur);
          const pct   = salesAgg.gross ? (salesAgg.fee / salesAgg.gross) * 100 : 0;
          headline = `
            <div style="display:flex;flex-wrap:wrap;gap:1.5rem;align-items:flex-end;">
              <div style="flex:2;min-width:240px;">
                <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px;">Stripe fees on your sales</div>
                <div style="font-family:'DM Mono',monospace;font-size:32px;font-weight:500;color:var(--red);line-height:1;">${_stripeFmtMoney(fee, cur)}</div>
                <div style="font-size:13px;color:var(--text2);margin-top:8px;line-height:1.5;">
                  on <strong>${_stripeFmtMoney(gross, cur)}</strong> across <strong>${salesAgg.count}</strong> customer ${salesAgg.count === 1 ? 'payment' : 'payments'}<br>
                  You received <strong style="color:var(--green);">${_stripeFmtMoney(net, cur)}</strong> net into your Stripe balance
                </div>
              </div>
              <div style="flex:1;min-width:120px;text-align:right;">
                <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px;">Effective rate</div>
                <div style="font-family:'DM Mono',monospace;font-size:32px;font-weight:500;color:var(--gold);line-height:1;">${pct.toFixed(2)}%</div>
                <div style="font-size:11px;color:var(--text3);margin-top:8px;">of gross sales</div>
              </div>
            </div>`;
        } else {
          headline = `<div style="font-size:13px;color:var(--text3);font-style:italic;">No customer payments in this year — only balance activity below.</div>`;
        }

        // Detail rows for other activity
        const otherTypes = Object.keys(types).filter(t => !SALES_TYPES.has(t)).sort();
        const detailRows = [];
        if (salesAgg.count > 0) {
          const gross = _stripeMinorToMajor(salesAgg.gross, cur);
          const fee   = _stripeMinorToMajor(salesAgg.fee, cur);
          const net   = _stripeMinorToMajor(salesAgg.net, cur);
          detailRows.push(`<tr style="background:rgba(200,145,58,.06);">
            <td><strong>Customer payments</strong><div style="font-size:10px;color:var(--text3);">charge · payment</div></td>
            <td class="r">${salesAgg.count}</td>
            <td class="r">${_stripeFmtMoney(gross, '')}</td>
            <td class="r" style="color:var(--red);">${_stripeFmtMoney(fee, '')}</td>
            <td class="r"><strong>${_stripeFmtMoney(net, '')}</strong></td>
          </tr>`);
        }
        for (const t of otherTypes) {
          const r = types[t];
          const gross = _stripeMinorToMajor(r.gross, cur);
          const fee   = _stripeMinorToMajor(r.fee, cur);
          const net   = _stripeMinorToMajor(r.net, cur);
          detailRows.push(`<tr>
            <td>${_stripeFriendlyType(t)}<div style="font-size:10px;color:var(--text3);">${t}</div></td>
            <td class="r">${r.count}</td>
            <td class="r">${_stripeFmtMoney(gross, '')}</td>
            <td class="r" style="color:${fee !== 0 ? 'var(--red)' : 'var(--text3)'};">${fee !== 0 ? _stripeFmtMoney(fee, '') : '—'}</td>
            <td class="r">${_stripeFmtMoney(net, '')}</td>
          </tr>`);
        }

        const tot = byYearCurAll[year][cur];
        const tgross = _stripeMinorToMajor(tot.gross, cur);
        const tfee   = _stripeMinorToMajor(tot.fee, cur);
        const tnet   = _stripeMinorToMajor(tot.net, cur);
        const detailId = `stripe-detail-${year}-${cur}`;

        cards.push(`
          <div class="card" style="margin-bottom:1rem;padding:1.25rem 1.4rem;">
            <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:10px;">
              <div style="font-family:'Playfair Display',serif;font-size:22px;color:var(--text);">${year}</div>
              <span class="pill gold">${cur}</span>
            </div>
            ${headline}
            ${detailRows.length ? `
            <div style="margin-top:14px;">
              <button type="button" class="btn tag" onclick="(function(el){var d=document.getElementById('${detailId}');var open=d.style.display!=='none';d.style.display=open?'none':'';el.innerHTML=(open?'▸':'▾')+' '+el.dataset.label;})(this)" data-label="Show all balance activity (${detailRows.length} line ${detailRows.length === 1 ? 'item' : 'items'})" style="background:transparent;border:1px dashed var(--gold-line);">▸ Show all balance activity (${detailRows.length} line ${detailRows.length === 1 ? 'item' : 'items'})</button>
              <div id="${detailId}" style="display:none;margin-top:12px;">
                <div class="tbl-wrap" style="margin-bottom:8px;">
                  <table class="tbl">
                    <thead><tr><th>Activity</th><th class="r">Count</th><th class="r">Amount</th><th class="r">Stripe fee</th><th class="r">Net</th></tr></thead>
                    <tbody>${detailRows.join('')}
                      <tr style="border-top:2px solid var(--gold-line);font-weight:600;background:var(--cream2);">
                        <td>All activity total<div style="font-size:10px;color:var(--text3);font-weight:400;">matches Stripe Dashboard Balance report</div></td>
                        <td class="r">${tot.count}</td>
                        <td class="r">${_stripeFmtMoney(tgross, '')}</td>
                        <td class="r" style="color:var(--red);">${_stripeFmtMoney(tfee, '')}</td>
                        <td class="r">${_stripeFmtMoney(tnet, '')}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style="font-size:11px;color:var(--text3);line-height:1.5;">
                  <strong>Customer payments</strong> is the line that answers "what % does Stripe take from my sales".
                  The other rows (refunds, payouts, service fees, adjustments) are non-sale balance movements — included so the total reconciles with Stripe's Balance report.
                </div>
              </div>
            </div>` : ''}
          </div>`);
      }
    }

    wrap.innerHTML = cards.length
      ? cards.join('')
      : '<div class="card" style="text-align:center;color:var(--text3);padding:2rem;">No balance transactions found.</div>';
    wrap.style.display = '';
    statusEl.innerHTML = `<span style="color:var(--green);">✓ Done — ${count} balance transactions across ${years.length} year(s). Key saved for next time.</span>
      <br><span style="font-size:11px;color:var(--text3);">Verify against your Stripe Dashboard: <a href="https://dashboard.stripe.com/balance" target="_blank" rel="noopener" style="color:var(--gold);">Balance</a> · <a href="https://dashboard.stripe.com/reports/balance" target="_blank" rel="noopener" style="color:var(--gold);">Balance reports</a> (set the date range to a calendar year). Click "Download audit CSV" below for the raw per-transaction data.</span>`;
    document.getElementById('stripe-fees-download-btn').style.display = '';
    document.getElementById('stripe-fees-clear-btn').style.display = '';
    const hasLedgerData = window._stripeFeesLedgerData.length > 0;
    const insertBtn = document.getElementById('stripe-fees-insert-btn');
    if (insertBtn) insertBtn.style.display = hasLedgerData ? '' : 'none';
    const reconcileBtn = document.getElementById('stripe-fees-reconcile-btn');
    if (reconcileBtn) reconcileBtn.style.display = hasLedgerData ? '' : 'none';
    // Populate the year filter for ledger insertion (newest first, plus "All years").
    const yearSel = document.getElementById('stripe-fees-year');
    if (yearSel) {
      const ledgerYears = [...new Set(window._stripeFeesLedgerData.map(r => r.year))].sort((a, b) => b - a);
      yearSel.innerHTML = `<option value="all">All years</option>` + ledgerYears.map(y => `<option value="${y}">${y}</option>`).join('');
      yearSel.style.display = hasLedgerData ? '' : 'none';
    }
  } catch (e) {
    const msg = String(e.message || e);
    let hint = '';
    if (/Failed to fetch|NetworkError|CORS/i.test(msg)) {
      hint = '<br><span style="font-size:11px;">If this is a CORS error, run <code>scripts/stripe-fees-by-year.js</code> locally instead — your browser may be blocking direct Stripe API calls.</span>';
    }
    statusEl.innerHTML = `<span style="color:var(--red);">Error: ${msg}</span>${hint}`;
  } finally {
    btn.disabled = false;
  }
}

// Insert Stripe processing fees on sales into the master ledger, one entry per
// year+currency, categorized as "Sales Processing Fees" and converted to CAD at
// the year-end rate. Idempotent: re-running upserts by ref "stripe-fees:<yr>:<cur>"
// so the current year's running total is refreshed without duplicating.
async function insertStripeFeesIntoLedger() {
  let rows = window._stripeFeesLedgerData || [];
  if (!rows.length) { showToast('Run "Fetch fees" first.', 'warn'); return; }

  // Optional year filter so the user can insert just one year at a time.
  const yearSel = document.getElementById('stripe-fees-year');
  const yearFilter = yearSel && yearSel.value !== 'all' ? Number(yearSel.value) : null;
  if (yearFilter != null) rows = rows.filter(r => r.year === yearFilter);

  if (!TAX_CENTER.businessExpenses) TAX_CENTER.businessExpenses = [];
  if (!TAX_CENTER.settings) TAX_CENTER.settings = {};
  const currentYear = new Date().getFullYear();

  // CAD rate for a year+currency: year-end rate for closed years, today's for the
  // current (still-accruing) year, with live then cached fallbacks.
  const rateFor = async (cur, year) => {
    if (cur === 'CAD') return 1;
    const fxDate = year < currentYear ? `${year}-12-31` : today();
    let rate = 0;
    try { const h = await fetchHistoricalRate(cur, 'CAD', fxDate); rate = h?.rate || 0; } catch (_) { /* fall through */ }
    if (!rate) { try { const lr = await fetchLiveRate(cur, 'CAD'); rate = lr?.rate || 0; } catch (_) { /* fall through */ } }
    if (!rate) rate = _fxRateCache[`${cur}_CAD`] || 0;
    return rate || 1;
  };

  const planned = [];
  for (const r of rows) {
    const cur = r.cur.toUpperCase();
    const entryDate = r.year < currentYear ? `${r.year}-12-31` : today();
    const fxRate = await rateFor(cur, r.year);

    const salesFee = _stripeMinorToMajor(r.salesFeeMinor, r.cur);
    if (salesFee > 0) {
      planned.push({
        year: r.year,
        ref: `stripe-fees:${r.year}:${cur}`,
        desc: `Stripe processing fees on sales ${r.year}${r.salesCount ? ` (${r.salesCount} payment${r.salesCount === 1 ? '' : 's'})` : ''}`,
        cat: 'Sales Processing Fees',
        currency: cur, amount: salesFee, origCurrency: cur, origAmount: salesFee,
        fxRate, baseAmount: salesFee * fxRate, date: entryDate,
      });
    }

    const billing = _stripeMinorToMajor(r.stripeBillingMinor, r.cur);
    if (billing > 0) {
      planned.push({
        year: r.year,
        ref: `stripe-billing:${r.year}:${cur}`,
        desc: `Stripe billing & service fees ${r.year}`,
        cat: 'Software & Subscriptions',
        currency: cur, amount: billing, origCurrency: cur, origAmount: billing,
        fxRate, baseAmount: billing * fxRate, date: entryDate,
      });
    }
  }
  if (!planned.length) { showToast('No Stripe fees to insert for that selection.', 'warn'); return; }

  const byRef = new Map((TAX_CENTER.businessExpenses || [])
    .filter(e => e && typeof e.ref === 'string' && (e.ref.startsWith('stripe-fees:') || e.ref.startsWith('stripe-billing:')))
    .map(e => [e.ref, e]));
  const newCount = planned.filter(p => !byRef.has(p.ref)).length;
  const updateCount = planned.length - newCount;
  const totalCad = planned.reduce((s, p) => s + (p.baseAmount || 0), 0);
  const lines = planned.sort((a, b) => a.ref.localeCompare(b.ref))
    .map(p => `  • ${p.year} ${p.cat === 'Software & Subscriptions' ? 'billing' : 'sales fees'}: ${p.amount.toFixed(2)} ${p.currency} → ${p.baseAmount.toFixed(2)} CAD`).join('\n');

  const scope = yearFilter != null ? `${yearFilter}` : 'all years';
  const accept = confirm(
    `Insert Stripe fees (${scope}) into your master ledger?\n\n` +
    `${newCount} new${updateCount ? `, ${updateCount} updated (refreshed in place)` : ''}\n` +
    `Total: ${totalCad.toFixed(2)} CAD\n\n${lines}\n\n` +
    `Nothing is written until you click OK.`
  );
  if (!accept) { showToast('Stripe fee insertion cancelled', 'warn'); return; }

  let inserted = 0, updated = 0;
  for (const p of planned) {
    const existing = byRef.get(p.ref);
    if (existing) {
      Object.assign(existing, {
        desc: p.desc, cat: p.cat, currency: p.currency, amount: p.amount,
        origCurrency: p.origCurrency, origAmount: p.origAmount,
        fxRate: p.fxRate, baseAmount: p.baseAmount, date: p.date,
      });
      updated++;
    } else {
      const { year: _y, ...rest } = p;
      TAX_CENTER.businessExpenses.unshift({ id: Date.now() + inserted + 1, ...rest, receipt: '', trip: '' });
      inserted++;
    }
  }

  TAX_CENTER.settings.stripeFeesLastImportAt = new Date().toISOString();
  await saveTaxCenter();
  renderTaxCenter();
  showToast(`✓ Stripe fees: ${inserted} added${updated ? `, ${updated} updated` : ''}`, 'ok');
  const statusEl = document.getElementById('stripe-fees-status');
  if (statusEl) statusEl.innerHTML += `<br><span style="color:var(--green);">Ledger updated: ${inserted} added${updated ? `, ${updated} updated` : ''} (${totalCad.toFixed(2)} CAD).</span>`;
}

// Compare what Stripe says you collected (gross customer payments, converted to
// CAD) against the sales you recorded in the app, per year — a quick gap check.
async function reconcileStripeAgainstSales() {
  const rows = window._stripeFeesLedgerData || [];
  const wrap = document.getElementById('stripe-fees-reconcile-wrap');
  if (!rows.length) { showToast('Run "Fetch fees" first.', 'warn'); return; }
  if (wrap) { wrap.style.display = ''; wrap.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px;">Computing reconciliation…</div>'; }
  const currentYear = new Date().getFullYear();

  // Stripe gross customer payments per year, converted to CAD.
  const stripeByYear = {};
  for (const r of rows) {
    const cur = r.cur.toUpperCase();
    const grossMajor = _stripeMinorToMajor(r.salesGrossMinor, r.cur);
    if (!(grossMajor > 0)) continue;
    let rate = 1;
    if (cur !== 'CAD') {
      const fxDate = r.year < currentYear ? `${r.year}-12-31` : today();
      try { const h = await fetchHistoricalRate(cur, 'CAD', fxDate); rate = h?.rate || 0; } catch (_) { /* fall through */ }
      if (!rate) { try { const lr = await fetchLiveRate(cur, 'CAD'); rate = lr?.rate || 0; } catch (_) { /* fall through */ } }
      if (!rate) rate = _fxRateCache[`${cur}_CAD`] || 1;
    }
    stripeByYear[r.year] = (stripeByYear[r.year] || 0) + grossMajor * rate;
  }

  // Recorded sales per year from the app's per-book history.
  const salesByYear = {};
  for (const book of Object.values(BOOKS)) {
    const s = states[book.id] || (typeof defaultState === 'function' ? defaultState(book) : { hist: [] });
    for (const h of (s.hist || [])) {
      if (h.voided || h.gratuity || !h.date) continue;
      const y = Number(String(h.date).slice(0, 4));
      if (!y) continue;
      salesByYear[y] = (salesByYear[y] || 0) + (h.qty || 0) * (h.price || 0);
    }
  }

  const years = [...new Set([...Object.keys(stripeByYear), ...Object.keys(salesByYear)].map(Number))].sort((a, b) => b - a);
  if (!years.length) { if (wrap) wrap.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px;">No data to reconcile.</div>'; return; }

  const fmtCad = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const bodyRows = years.map(y => {
    const stripe = stripeByYear[y] || 0;
    const recorded = salesByYear[y] || 0;
    const diff = recorded - stripe;
    const aligned = Math.abs(diff) < 0.01 || (stripe > 0 && Math.abs(diff) / stripe < 0.02); // within 2%
    const diffColor = aligned ? 'var(--green)' : 'var(--amber)';
    return `<tr>
      <td>${y}</td>
      <td class="r" style="font-family:'DM Mono',monospace;">${fmtCad(stripe)}</td>
      <td class="r" style="font-family:'DM Mono',monospace;">${fmtCad(recorded)}</td>
      <td class="r" style="font-family:'DM Mono',monospace;color:${diffColor};">${diff >= 0 ? '+' : ''}${fmtCad(diff)}</td>
      <td class="r">${aligned ? '<span class="pill green" style="font-size:10px;">✓ Aligned</span>' : '<span class="pill" style="font-size:10px;background:var(--amber);color:#3a2a05;">Review</span>'}</td>
    </tr>`;
  }).join('');

  if (wrap) wrap.innerHTML = `
    <div class="card" style="margin-bottom:1rem;padding:1.1rem 1.3rem;">
      <div style="font-family:'Playfair Display',serif;font-size:16px;margin-bottom:8px;">Reconciliation — Stripe vs recorded sales</div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Year</th><th class="r">Stripe collected (CAD)</th><th class="r">Recorded sales (CAD)</th><th class="r">Difference</th><th class="r">Status</th></tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
      <div style="font-size:11px;color:var(--text3);line-height:1.5;margin-top:8px;">
        <strong>Stripe collected</strong> = gross customer payments (charge/payment) converted to CAD at the year-end rate.
        <strong>Recorded sales</strong> = qty × price from your book history, summed as entered.
        Differences can be legitimate (cash/PayPal sales, refunds, Stripe payments not yet logged as sales) — this is a directional check, not an exact tie-out.
      </div>
    </div>`;
}

async function clearStoredStripeKey() {
  try {
    if (TAX_CENTER.settings) delete TAX_CENTER.settings.stripeKey;
    const keyEl = document.getElementById('stripe-fees-key');
    if (keyEl) keyEl.value = '';
    if (typeof saveTaxCenter === 'function') await saveTaxCenter();
    showToast('Stripe key cleared.');
  } catch (e) {
    console.error(e);
    showToast('⚠ Failed to clear key', 'err');
  }
}

function downloadStripeFeesAuditCSV() {
  const rows = window._stripeFeesAudit || [];
  if (!rows.length) { showToast('Run a Stripe fees fetch first.', 'warn'); return; }
  const header = ['id','created_iso','year','currency','type','amount_major','fee_major','net_major','source','description'];
  const esc = v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.id,
      new Date(r.created * 1000).toISOString(),
      r.year, r.currency, r.type,
      _stripeMinorToMajor(r.amount, r.currency).toFixed(2),
      _stripeMinorToMajor(r.fee, r.currency).toFixed(2),
      _stripeMinorToMajor(r.net, r.currency).toFixed(2),
      r.source || '', r.description || ''
    ].map(esc).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stripe-balance-transactions-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Global exposure for HTML handlers (cleaned up)
Object.assign(window, {
  fetchStripeFeesByYear, downloadStripeFeesAuditCSV, clearStoredStripeKey, insertStripeFeesIntoLedger, reconcileStripeAgainstSales,
  logout, switchTab, toggleBookDropdown, switchBook, forceSync,
  toggleCurrentBookView,
  fetchOrders, applyOne, applyAll, onManualCurrencyChange, calcFx, calcManualFxRate, submitManual,
  onExpenseCurrencyChange, calcExpenseFx,

  submitGratuity, openM, closeM, addStore, openSend, confirmSend, openSale, confirmSale,
  openRet, confirmReturn, openEditHist, openEditLedger, saveEntryEdit, voidEntry,
  resetBookData, connectSheets, disconnectSheets, testSheets, verifyUrl,
  pushAllToSheets, backfillAndResync, copyGasCode, saveProductionCosts, savePaymentLinks,
  handleImportFile, confirmImport, openLabelModal, printShippingLabel, toggleShipped, backfillShipping,
  saveArtistPaymentLink, markArtistTransferReceived, markExpenseReceived,
  submitExpense, voidExpense, markPaid, removeStore, addProfitTier, removeProfitTier, 
  saveProfitTiers, renderProfitSettings, updateProfitTierField, renderProfitTierList,
  renderFinancials, downloadTaxReport, createSystemBackupNow, restoreSystemBackup, handleBackupImportFile,
  chooseBackupFolder, exportToJSON, exportAllToCSV, downloadFullTaxSeasonExport,
  submitTaxExpense, importShippoShippingFromApi, addRecurring, removeRecurring, downloadTaxLedgerCSV, renderTaxCenter,
  removeLedgerEntry, setupReceiptFolder, viewLocalReceipt, setTcLedgerPage,
  saveTaxCenterSettings, scanReceiptWithAI, scanProjectReceiptWithAI,
  openEmailReceiptImportModal, closeEmailReceiptImportModal, extractReceiptsFromEmailText, importEmailReceiptDrafts, toggleAllEmailDrafts,
  showCategoryDetail, changeExpenseCategory,
  showTripDetail, openEditTrip, saveTripAssignment, renameTripPrompt,
  // Invoices
  renderInvoices, openCreateInvoice, viewInvoice,
  addInvoiceItem, removeInvoiceItem, updateInvoiceItem,
  onInvoiceStoreChange, prefillFromPendingSales, recalcInvoiceTotals,
  saveInvoice, deleteInvoice, editInvoiceFromView, markInvoicePaidFromView,
  printInvoice, copyInvoicePayLink, emailInvoice, downloadInvoiceHTML,
  openInvoiceTemplateSettings, saveInvoiceSettings,
  regenerateStripeLinkFromView, onInvoiceCurrencyChange,
});

// ── STARTUP ROUTING
let authStateHandled = false;
async function initStartup() {
  // Master Publisher Email
  const publisherEmail = 'lyricalmyrical@gmail.com'; 

  window._fbOnAuthStateChanged(async user => {
    if (!user) {
      // Not logged in
      setupGate(null);
      const err = document.getElementById('pw-err');
      if (err) err.textContent = '';
      return;
    }
    
    // Load shared Firestore mode flags FIRST — before any data reads.
    // This ensures all devices agree on which database to use.
    await window._fbLoadModeFlags();

    // NOW that we have a valid token, we pull the protected catalog.
    await loadCatalog(); 
    loadAuthorViewOverrides();

    // Check access
    const uEmail = user.email.toLowerCase().trim();
    if (uEmail === publisherEmail || uEmail === 'lyricalmyricalbooks@gmail.com') {
      window.IS_PUBLISHER = true;
      IS_AUTHOR_MODE = false;
      showApp('publisher', null);
      return;
    }

    // Artist Check
    const matchedBookId = Object.keys(BOOKS).find(id => {
      const dbEmail = (BOOKS[id].authorEmail || '').toLowerCase().trim();
      return dbEmail === uEmail;
    });

    if (matchedBookId) {
      window.IS_PUBLISHER = false;
      IS_AUTHOR_MODE = true;
      ACTIVE_BOOK_FORCED = matchedBookId;
      showApp('author', matchedBookId);
      return;
    }
    
    // No match
    window._fbSignOut();
    setupGate(`Your Google account (${user.email}) is not authorized for any books.`);
    const err = document.getElementById('pw-err');
    if (err) err.textContent = '';
  });
}

function setupGate(errMsg) {
  $('pw-gate').style.display='';
  $('pw-app').style.display='none';
  document.querySelector('#gate-sub').textContent = 'Inventory App';
  document.querySelector('#pw-gate .wm').textContent = 'Lyricalmyrical Books';
  const desc = document.getElementById('gate-desc');
  if (desc) {
    desc.style.display = errMsg ? 'block' : 'none';
    desc.innerHTML = errMsg ? `<span style="color:var(--red);font-weight:600;">${errMsg}</span>` : '';
  }
}

// Global IS_PUBLISHER override for UI hooks
window.IS_PUBLISHER = false;
window.isPublisherSession = () => window.IS_PUBLISHER;
window.isAuthor = () => IS_AUTHOR_MODE || (window.IS_PUBLISHER && activeBook && activeBook !== 'all' && AUTHOR_VIEW_BY_BOOK[activeBook]);

if (window._fbReady) { initStartup(); }
else { document.addEventListener('firebase-ready', initStartup); }
