// Register-only books: books that exist only at the Point of Sale (a zine,
// a friend's title on the table) with their own price, accent and Stripe
// payment link. The add / edit / remove dialog, its live QR preview, and the
// one-tap Stripe link all live here; the books themselves are kept in
// posExtraBooks in main.js, which persists them in the catalog document.
//
// Lifted out of src/main.js as one unit, verbatim apart from the dialog's
// handlers becoming plain function declarations (main.js puts them on
// window). main.js and this module import from each other; that cycle is fine
// because nothing here runs at module-evaluation time — the only top-level
// statement besides function declarations is the id of the book being edited.
//
// posExtraBooks and posCart are live bindings: main.js replaces them when the
// catalog loads or a sale completes, and this module only ever mutates them.
//
// eslint's no-undef (an error, checked in CI) is what keeps the import list
// honest: an identifier that isn't imported fails the build rather than
// throwing at click time.
import {
  $,
  copyTextWithFallback,
  createStripePaymentLinkForBook,
  posExtraBooks,
  saveCatalogWithDeletions,
  showToast,
  syncCatalog,
  updateModalAccentPreview,
} from '../main.js';
import { BOOKS } from '../core/store.js';
import { posCart, renderPOS } from './pos.js';
import { closeM, confirmDialog, openM } from '../lib/modal.js';
import { hexToRgba, setSelectCurrency } from '../lib/money.js';

// The register-only book the dialog is editing, or null when adding one.
let editingPosBookId = null;

// ─────────────────────────────────────────────────────────────────────────
// POS-ONLY BOOKS — add / edit / remove + instant Stripe link & QR
// These books live entirely in posExtraBooks (persisted in the catalog doc
// under _posExtra). They surface only at the POS, the printable sales tracker,
// and the printable QR sheet — never in the catalog, inventory, ledger, or
// financials. Each can mint a Stripe Payment Link (and matching QR) on the spot.
// ─────────────────────────────────────────────────────────────────────────
// Build a collision-free, URL-safe id, prefixed so it can never shadow a
// catalog book in posResolveBook (which checks BOOKS first).
function _posSlugId(title) {
  let base = 'pos-' + ((title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'book');
  let id = base, n = 2;
  while (BOOKS[id] || (posExtraBooks[id] && id !== editingPosBookId)) { id = base + '-' + (n++); }
  return id;
}

function openPosBookModal(id) {
  editingPosBookId = id || null;
  const book = id ? posExtraBooks[id] : null;
  $('pb-modal-title').textContent = book ? `Edit POS-only book · ${book.title}` : 'Add POS-only book';
  $('pb-save-btn').textContent = book ? 'Save changes' : 'Add to POS';
  $('pb-title').value = book?.title || '';
  $('pb-author').value = book?.author || '';
  $('pb-price').value = book?.listPrice ?? 40;
  setSelectCurrency($('pb-cur'), book?.currency || '€');
  $('pb-accent').value = book?.accent || '#c8913a';
  $('pb-paylink').value = book?.stripeLink || book?.paymentLink || '';
  const removeBtn = $('pb-remove-btn');
  if (removeBtn) removeBtn.style.display = book ? '' : 'none';
  renderPosBookModalQR();
  updateModalAccentPreview($('pb-accent'));
  openM('pos-book');
}

function closePosBookModal() { closeM('pos-book'); editingPosBookId = null; }

function renderPosBookModalQR() {
  const wrap = $('pb-qr-canvas');
  if (!wrap) return;
  const url = ($('pb-paylink')?.value || '').trim();
  const note = $('pb-qr-note');
  wrap.innerHTML = '';
  if (!url) {
    wrap.innerHTML = '<div style="color:var(--text3);font-size:var(--text-xs);text-align:center;padding:1rem;">Add or generate a payment link to preview its QR.</div>';
    if (note) note.textContent = '';
    return;
  }
  if (typeof QRCode !== 'undefined') {
    new QRCode(wrap, { text: url, width: 180, height: 180, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.H });
    if (note) note.textContent = 'Customers scan this to pay via Stripe.';
  } else {
    wrap.innerHTML = '<div style="color:var(--text3);font-size:var(--text-xs);">QR library not ready.</div>';
  }
}

async function generatePosBookStripeLink() {
  const btn = $('pb-gen-stripe-btn');
  const title = ($('pb-title')?.value || '').trim();
  const listPrice = parseFloat($('pb-price')?.value) || 0;
  const currency = $('pb-cur')?.value || '€';
  if (!title) { showToast('Set a title first', 'warn'); return; }
  if (!(listPrice > 0)) { showToast('Set a price first', 'warn'); return; }
  const id = editingPosBookId || _posSlugId(title);
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Creating…'; }
  try {
    const url = await createStripePaymentLinkForBook({ id, title, listPrice, currency, isbn: '' });
    if ($('pb-paylink')) $('pb-paylink').value = url;
    renderPosBookModalQR();
    showToast('✓ Stripe link & QR ready — Save to keep it');
  } catch (e) {
    showToast('Stripe: ' + (e.message || e), 'err', 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Generate Stripe link'; }
  }
}

function copyPosBookLink() {
  const url = ($('pb-paylink')?.value || '').trim();
  if (!url) { showToast('No link to copy', 'warn'); return; }
  copyTextWithFallback(url).then(() => showToast('Link copied'));
}

function downloadPosBookQR() {
  const canvas = document.querySelector('#pb-qr-canvas canvas');
  if (!canvas) { showToast('Generate or add a link first', 'warn'); return; }
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `${editingPosBookId || _posSlugId($('pb-title')?.value || 'book')}-payment-qr.png`;
  a.click();
  showToast('Downloading QR Code image');
}

async function savePosBook() {
  const title = ($('pb-title')?.value || '').trim();
  if (!title) { showToast('Title is required', 'warn'); $('pb-title')?.focus(); return; }
  const listPrice = parseFloat($('pb-price')?.value) || 0;
  const currency = $('pb-cur')?.value || '€';
  const accent = $('pb-accent')?.value || '#c8913a';
  const link = ($('pb-paylink')?.value || '').trim();
  const id = editingPosBookId || _posSlugId(title);

  await syncCatalog();

  const existing = posExtraBooks[id] || {};
  posExtraBooks[id] = {
    ...existing,
    id,
    title,
    author: ($('pb-author')?.value || '').trim(),
    isbn: existing.isbn || '—',
    listPrice,
    currency,
    accent,
    accentBg: hexToRgba(accent, 0.1),
    stripeLink: link,
    paymentLink: existing.paymentLink || '',
    maxPrint: 999999,
    threshold: 0,
    posOnly: true,
    sold: existing.sold || 0,
    revenue: existing.revenue || 0,
  };
  try { await saveCatalogWithDeletions(); } catch (e) { console.warn('POS-only save failed', e); }
  showToast(editingPosBookId ? '✓ POS-only book updated' : '✓ POS-only book added');
  editingPosBookId = null;
  closeM('pos-book');
  renderPOS();
}

function removeCurrentPosBook() { if (editingPosBookId) window.removePosBook(editingPosBookId); }

async function removePosBook(id) {
  const book = posExtraBooks[id];
  if (!book) return;
  if (!(await confirmDialog(`Remove POS-only book "${book.title}"?\n\nIt will disappear from the POS, the sales tracker, and the QR sheet. Its isolated sales tally is discarded.`, { danger: true, okLabel: 'Remove' }))) return;

  await syncCatalog();

  delete posExtraBooks[id];
  delete posCart[id];
  try { await saveCatalogWithDeletions(); } catch (e) { console.warn('POS-only remove failed', e); }
  if (editingPosBookId === id) { editingPosBookId = null; closeM('pos-book'); }
  showToast('POS-only book removed');
  renderPOS();
}

export {
  _posSlugId,
  openPosBookModal,
  closePosBookModal,
  generatePosBookStripeLink,
  copyPosBookLink,
  downloadPosBookQR,
  savePosBook,
  removeCurrentPosBook,
  removePosBook,
  renderPosBookModalQR,
};
