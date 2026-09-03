// Receipts — the receipt side of expenses: the connected local folder, webcam
// capture, the on-device cache and its health checks, cloud reclaim, the ZIP
// export and the organiser that files loose scans against expenses.
//
// The fifth feature lifted out of src/main.js, after Open Call, Shipping, the
// Tax Centre and Big Cartel. Functions moved verbatim; no logic changed.
//
// This is the first of three steps. Receipt CAPTURE (the dropzone, email
// import, the Gmail inbox, the AI scan and batch entry) and the expense ledger
// itself are still in main.js and move here next, at which point the five
// scanner names imported below stop crossing the seam.
//
// Deliberately left behind: system backup / JSON export, which sat in the
// middle of this range but shares nothing with receipts, and
// initializeBackupFolderDisplay, which is backup's startup hook even though it
// kicks off the receipt folder health pass.
//
// Cycles with main.js, taxcentre.js and shipping.js. Safe for the reason
// asserted in tests/features-boundary.test.js: nothing here runs at
// module-evaluation time, so no import is read before it is initialised.
import {
  $,
  BOOKS,
  TAX_CATEGORIES,
  TAX_CENTER,
  TC_CATEGORIES,
  _editingExpense,
  _fxRateCache,
  activeBook,
  addLog,
  fetchLiveRate,
  fetchSheetsCapabilities,
  getBook,
  getState,
  isAuthor,
  isGratuityExpense,
  isPermissionDenied,
  notifyPublisherSubmission,
  reportClientError,
  saveState,
  sheetsUrl,
  showToast,
  states,
  today,
  updateDash,
} from '../main.js';
import { escapeHtml } from '../lib/html.js';
import { followableUrl } from '../lib/receipt-links.js';
import { fmt, fmtD, getBookCurrencyCode, normalizeCurrencyCode } from '../lib/money.js';
import { expenseLedgerTotals, expenseTotalsCopy } from '../lib/expense-totals.js';
import { closeM, confirmDialog, openM } from '../lib/modal.js';
import { toCsv } from '../lib/csv.js';
import { downloadBlob } from '../lib/download.js';
import { createZip, textEntry } from '../lib/zip.js';
import { planFile } from '../lib/receipt-match.js';
import { renderTaxCenter, saveTaxCenter, tcExpenseRowDrop } from './taxcentre.js';
import {
  cloudReceiptRefs,
  expenseMissingReceipt,
  externalLinkRefs,
  isCloudReceipt,
  isExternalLink,
  isLocalReceipt,
  isOurCloudReceipt,
  isRentExpense,
  localRefPath,
  receiptOwners,
  receiptRefsOf,
  toLocalRef,
  uniqueFileName,
  writeReceiptRefs,
} from '../lib/receipt-storage.js';
import {
  PREVIEW_MAX_EDGE,
  PREVIEW_QUALITY,
  cacheKeyFor,
  cachePlanFor,
  cacheStats,
  formatCacheSize,
  planEviction,
  previewDimensions,
  uncachedRefs,
} from '../lib/receipt-cache.js';
import {
  describeDestination,
  receiptFileName,
  receiptFolderPath,
  vendorFrom,
} from '../lib/receipt-naming.js';
import { isExpiringLabelUrl, isLabelUrlExpired, shippoTxIdFromRef } from '../lib/shippo-invoices.js';

// IndexedDB names for the folder handle and the on-device receipt cache.
// They moved out of main.js with this domain; nothing else uses them.
const RECEIPT_FOLDER_DB = 'lm-receipt-folder-db';
const RECEIPT_FOLDER_STORE = 'handles';
const RECEIPT_FOLDER_KEY = 'preferred-receipt-folder';
const RECEIPT_CACHE_DB = 'lm-receipt-cache-db';
const RECEIPT_CACHE_STORE = 'blobs';

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
    return null;
  }
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveReceiptFolderHandle(dirHandle);
    renderTaxCenter();
    showToast('✓ Receipt folder connected');
    return dirHandle;
  } catch (e) {
    if (e?.name !== 'AbortError') showToast('Could not save folder', 'err');
    return null;
  }
}

// ── WEBCAM RECEIPT CAPTURE
let _receiptCamStream = null;
let _receiptCamBlob = null;
// Filled when a webcam capture has already been written to the local
// receipts folder, so submitTaxExpense() reuses the path instead of
// re-saving the same file (which would create a duplicate).
let _pendingWebcamReceipt = null;
// Read and written from both sides of the coming receipts/expenses split (the
// capture sets it here; submitTaxExpense and saveExpenseEdit read and clear it).
// An ES import is read-only, so once this declaration moves into a feature
// module the far side cannot assign to it — the accessors are what keep that
// working. Introduced ahead of the move so the move itself stays mechanical.
function getPendingWebcamReceipt() { return _pendingWebcamReceipt; }
function setPendingWebcamReceipt(v) { _pendingWebcamReceipt = v; }

function _setReceiptCamStatus(msg) {
  const s = $('receipt-cam-status');
  if (!s) return;
  if (msg) { s.style.display = 'flex'; s.textContent = msg; s.style.alignItems = 'center'; s.style.justifyContent = 'center'; s.style.inset = '0'; s.style.background = 'rgba(0,0,0,.55)'; }
  else { s.style.display = 'none'; s.textContent = ''; }
}

async function openReceiptCameraModal() {
  const modal = $('m-receipt-camera-modal');
  const video = $('receipt-cam-video');
  const canvas = $('receipt-cam-canvas');
  if (!modal || !video) return;

  _receiptCamBlob = null;
  video.style.display = 'block';
  canvas.style.display = 'none';
  $('receipt-cam-capture-btn').style.display = '';
  $('receipt-cam-retake-btn').style.display = 'none';
  $('receipt-cam-use-btn').style.display = 'none';
  $('receipt-cam-preview-note').style.display = 'none';
  modal.style.display = 'flex';

  if (!navigator.mediaDevices?.getUserMedia) {
    _setReceiptCamStatus('Webcam access not supported in this browser.');
    return;
  }
  _setReceiptCamStatus('Requesting camera…');
  try {
    _receiptCamStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    video.srcObject = _receiptCamStream;
    _setReceiptCamStatus('');
  } catch (e) {
    console.error('Camera error', e);
    const msg = e?.name === 'NotAllowedError'
      ? 'Camera permission denied. Allow access in your browser settings.'
      : e?.name === 'NotFoundError' ? 'No camera detected on this device.'
        : 'Could not start camera.';
    _setReceiptCamStatus(msg);
  }
}

function _stopReceiptCamStream() {
  if (_receiptCamStream) {
    _receiptCamStream.getTracks().forEach(t => t.stop());
    _receiptCamStream = null;
  }
  const video = $('receipt-cam-video');
  if (video) video.srcObject = null;
}

function closeReceiptCameraModal() {
  _stopReceiptCamStream();
  _receiptCamBlob = null;
  const modal = $('m-receipt-camera-modal');
  if (modal) modal.style.display = 'none';
  _setReceiptCamStatus('');
}

function captureReceiptPhoto() {
  const video = $('receipt-cam-video');
  const canvas = $('receipt-cam-canvas');
  if (!video || !canvas || !video.videoWidth) {
    showToast('⚠ Camera not ready yet', 'warn');
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if (!blob) { showToast('⚠ Capture failed', 'err'); return; }
    _receiptCamBlob = blob;
    video.style.display = 'none';
    canvas.style.display = 'block';
    $('receipt-cam-capture-btn').style.display = 'none';
    $('receipt-cam-retake-btn').style.display = '';
    $('receipt-cam-use-btn').style.display = '';
    $('receipt-cam-preview-note').style.display = 'block';
  }, 'image/jpeg', 0.92);
}

function retakeReceiptPhoto() {
  _receiptCamBlob = null;
  const video = $('receipt-cam-video');
  const canvas = $('receipt-cam-canvas');
  if (video) video.style.display = 'block';
  if (canvas) canvas.style.display = 'none';
  $('receipt-cam-capture-btn').style.display = '';
  $('receipt-cam-retake-btn').style.display = 'none';
  $('receipt-cam-use-btn').style.display = 'none';
  $('receipt-cam-preview-note').style.display = 'none';
}

async function useReceiptPhoto() {
  if (!_receiptCamBlob) { showToast('⚠ No photo captured', 'warn'); return; }
  const isEditing = $('m-edit-expense') && $('m-edit-expense').style.display !== 'none';
  const fileInput = isEditing ? $('edit-exp-file') : $('tc-exp-file');
  if (!fileInput) { showToast('⚠ Receipt field not available', 'err'); return; }
  const preview = isEditing ? $('edit-exp-file-preview') : $('tc-exp-file-preview');
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
  const file = new File([_receiptCamBlob], `webcam-receipt-${stamp}.jpg`, { type: 'image/jpeg' });

  // Always attach to the file input so the standard submit flow has a
  // fallback path even if the immediate local save can't run.
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));

  // If no local receipt folder is connected yet, prompt the user to pick
  // one right now — they explicitly asked for the photo to be saved to
  // local storage, so an unconfigured destination is worth surfacing.
  let folderHandle = await loadReceiptFolderHandle();
  if (!folderHandle) {
    if (!('showDirectoryPicker' in window)) {
      if (preview) preview.textContent = `📷 Captured: ${file.name} (${(file.size / 1024).toFixed(0)} KB) — local file saving not supported in this browser; will be embedded in the cloud record on submit.`;
      showToast('⚠ Local folder saving not supported in this browser', 'warn', 4000);
      closeReceiptCameraModal();
      return;
    }
    const proceed = await confirmDialog('No local receipt folder is connected yet. Pick one now so the photo can be saved as a file?', { okLabel: 'Choose folder…', cancelLabel: 'Skip for now', title: 'Save photo locally' });
    if (proceed) {
      await setupReceiptFolder();
      folderHandle = await loadReceiptFolderHandle();
    }
  }

  if (folderHandle) {
    const btn = $('receipt-cam-use-btn');
    if (btn) { btn.disabled = true; btn.textContent = '💾 Saving…'; }
    try {
      const subfolder = (isEditing && _editingExpense?.type === 'bookExpense' && BOOKS[_editingExpense?.bid])
        ? BOOKS[_editingExpense.bid].title
        : 'General';
      const localUrl = await saveReceiptToLocalFile(file, subfolder.replace(/[^a-zA-Z0-9.\-_]/g, '_'));
      if (localUrl) {
        _pendingWebcamReceipt = { name: file.name, size: file.size, url: localUrl };
        if (preview) {
          const relPath = localUrl.replace('local://', '');
          preview.innerHTML = `📷 Saved: <strong>${escapeHtml(file.name)}</strong> (${(file.size / 1024).toFixed(0)} KB) — <a href="#" onclick="event.preventDefault(); viewLocalReceipt('${escapeHtml(relPath)}')" style="color:var(--gold);text-decoration:underline;">View receipt</a>`;
        }
        showToast('✓ Photo saved to local receipt folder', 'ok');
        closeReceiptCameraModal();
        return;
      }
      // saveReceiptToLocalFile already toasts on permission/write failure
      if (preview) preview.textContent = `📷 Captured: ${file.name} (${(file.size / 1024).toFixed(0)} KB) — local save failed; will retry on submit.`;
    } catch (e) {
      console.error('Immediate webcam receipt save failed', e);
      showToast('⚠ Could not save photo locally — will retry on submit', 'err', 4000);
      if (preview) preview.textContent = `📷 Captured: ${file.name} (${(file.size / 1024).toFixed(0)} KB) — local save failed; will retry on submit.`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✓ Use Photo'; }
    }
    closeReceiptCameraModal();
    return;
  }

  if (preview) preview.textContent = `📷 Captured: ${file.name} (${(file.size / 1024).toFixed(0)} KB) — no folder connected; submit to save in cloud.`;
  showToast('✓ Photo attached — submit to save', 'ok');
  closeReceiptCameraModal();
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

/**
 * Find a file by name anywhere under a directory.
 *
 * Was three levels of hand-unrolled loops, which stopped exactly one level too
 * shallow once receipts were filed under year, category and book — the deepest
 * receipts became unfindable by the very fallback meant to rescue them.
 * Breadth-first so the common shallow case still returns immediately, with a
 * depth cap so an unexpected folder tree cannot hang the app.
 */
async function findFileHandleInDir(dirHandle, targetFilename, maxDepth = 6) {
  if (!dirHandle || !targetFilename) return null;
  let level = [dirHandle];

  for (let depth = 0; depth <= maxDepth && level.length; depth++) {
    const next = [];
    for (const dir of level) {
      try {
        for await (const entry of dir.values()) {
          if (entry.kind === 'file' && entry.name === targetFilename) return entry;
          if (entry.kind === 'directory') next.push(entry);
        }
      } catch (_) { /* skip a folder we cannot read */ }
    }
    level = next;
  }
  return null;
}

async function getAllFilesInReceiptFolder(dirHandle) {
  if (!dirHandle) return [];
  const results = [];
  try {
    async function scanDir(handle, prefix = '') {
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          results.push({
            path: prefix ? `${prefix}/${entry.name}` : entry.name,
            name: entry.name
          });
        } else if (entry.kind === 'directory') {
          await scanDir(entry, prefix ? `${prefix}/${entry.name}` : entry.name);
        }
      }
    }
    await scanDir(dirHandle);
  } catch (e) {
    console.warn('Error reading receipt folder file list', e);
  }
  return results;
}

async function batchScanAndRelinkReceipts() {
  let handle = await loadReceiptFolderHandle();
  if (!handle) {
    const connect = await confirmDialog('No receipt folder connected. Connect your local receipt folder to scan and re-link files now?', { okLabel: 'Connect Folder', cancelLabel: 'Cancel', title: 'Batch Re-link Receipts' });
    if (connect) {
      handle = await setupReceiptFolder();
      if (!handle) return;
    } else {
      return;
    }
  }

  const allDiskFiles = await getAllFilesInReceiptFolder(handle);
  let totalChecked = 0;
  let totalRelinked = 0;
  let totalUnlinked = 0;

  const expenses = TAX_CENTER.businessExpenses || [];
  for (const exp of expenses) {
    const files = Array.isArray(exp.receiptFiles) && exp.receiptFiles.length ? exp.receiptFiles : (exp.receipt ? [exp.receipt] : []);
    if (!files.length) continue;
    totalChecked++;

    let expModified = false;
    const updatedFiles = await Promise.all(files.map(async (r) => {
      if (typeof r === 'string' && r.startsWith('local://')) {
        const fn = r.replace('local://', '');
        const baseFilename = fn.split('/').pop();
        const existing = await findFileHandleInDir(handle, baseFilename);
        if (!existing && allDiskFiles.length > 0) {
          const match = allDiskFiles.find(f => f.name.toLowerCase() === baseFilename.toLowerCase())
            || allDiskFiles.find(f => exp.date && f.name.includes(exp.date));
          if (match) {
            expModified = true;
            return `local://${match.path}`;
          } else {
            totalUnlinked++;
          }
        }
      }
      return r;
    }));

    if (expModified) {
      exp.receiptFiles = updatedFiles;
      exp.receipt = updatedFiles[0] || '';
      totalRelinked++;
    }
  }

  if (totalRelinked > 0) {
    await saveTaxCenter();
    renderTaxCenter();
  }

  const msg = `✓ Receipt Batch Audit Completed\n\n• ${totalChecked} expense receipts verified\n• ${totalRelinked} mislinked files auto-relinked\n• ${totalUnlinked} files unlinked / missing on disk`;
  confirmDialog(msg, { title: 'Batch Re-link Results', okLabel: 'OK', cancelLabel: 'Close' });
  showToast(`✓ Batch audit finished: ${totalRelinked} receipts auto-relinked`, 'ok');
}

async function attachReceiptToExpenseRow(sourceType, sourceId, itemId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,.pdf';
  input.onchange = async () => {
    if (!input.files || !input.files.length) return;
    const fakeEvent = { preventDefault: () => {}, stopPropagation: () => {}, dataTransfer: { files: input.files } };
    await tcExpenseRowDrop(fakeEvent, null, sourceType, sourceId, itemId);
  };
  input.click();
}

async function handleFolderError(e, title, message) {
  console.error(title, e);
  const reconnect = await confirmDialog(
    message + '\n\nWould you like to re-select the connected folder now?',
    { title: title, okLabel: 'Re-connect Folder', cancelLabel: 'Cancel' }
  );
  if (reconnect) {
    const handle = await setupReceiptFolder();
    return !!handle;
  }
  return false;
}

// ── RECEIPT CACHE
// The standby copy of every filed receipt, held in IndexedDB and reachable with
// no folder handle involved. See src/lib/receipt-cache.js for why this exists:
// a moved folder invalidates the stored handle, and every lookup strategy runs
// through that handle, so they all fail together and the whole ledger stops
// rendering at once.
async function openReceiptCacheDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(RECEIPT_CACHE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(RECEIPT_CACHE_STORE)) {
        req.result.createObjectStore(RECEIPT_CACHE_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function _cacheTx(db, mode) {
  return db.transaction(RECEIPT_CACHE_STORE, mode).objectStore(RECEIPT_CACHE_STORE);
}

function _reqPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Shrink an oversized receipt photo to something worth keeping as a standby.
 * Returns null when the image can't be decoded or is already small enough, in
 * which case the caller decides whether to store the original or skip it.
 */
async function makeReceiptPreview(blob) {
  if (typeof createImageBitmap !== 'function') return null;
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob);
    const { width, height, scaled } = previewDimensions(bitmap.width, bitmap.height, PREVIEW_MAX_EDGE);
    if (!scaled) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    return await new Promise(res => canvas.toBlob(res, 'image/jpeg', PREVIEW_QUALITY));
  } catch (e) {
    console.warn('Receipt preview failed', e);
    return null;
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}

/**
 * Keep a standby copy of one receipt. Never throws and never blocks the caller's
 * real work — a receipt that failed to cache is still filed on disk, and the
 * backfill will pick it up on a later pass.
 */
async function cacheReceiptFile(ref, file, { kindHint = '' } = {}) {
  const key = cacheKeyFor(ref);
  if (!key || !file) return false;

  try {
    const plan = cachePlanFor({ size: file.size, type: file.type, name: file.name });
    let blob = file;
    let kind = 'original';

    if (plan.store === 'preview') {
      const preview = await makeReceiptPreview(file);
      if (preview) {
        blob = preview;
        kind = 'preview';
      } else if (file.size > 12 * 1024 * 1024) {
        // Undecodable and very large — filing it would crowd out receipts that
        // can actually be shown.
        return false;
      }
    } else if (plan.store === 'skip') {
      return false;
    }

    const db = await openReceiptCacheDb();
    const now = new Date().toISOString();
    await _reqPromise(_cacheTx(db, 'readwrite').put({
      key,
      blob,
      kind: kindHint || kind,
      name: file.name || key.split('/').pop(),
      type: blob.type || file.type || '',
      size: blob.size || 0,
      cachedAt: now,
      lastSeenAt: now,
    }));
    db.close();
    await evictReceiptCacheToBudget();
    return true;
  } catch (e) {
    console.warn('Receipt cache write failed', e);
    return false;
  }
}

/** The standby copy, if there is one. Bumps recency so eviction spares it. */
async function readCachedReceipt(ref) {
  const key = cacheKeyFor(ref);
  if (!key) return null;
  try {
    const db = await openReceiptCacheDb();
    const entry = await _reqPromise(_cacheTx(db, 'readonly').get(key));
    if (entry && entry.blob) {
      entry.lastSeenAt = new Date().toISOString();
      try { await _reqPromise(_cacheTx(db, 'readwrite').put(entry)); } catch (_) { /* recency is best-effort */ }
    }
    db.close();
    return entry && entry.blob ? entry : null;
  } catch (e) {
    console.warn('Receipt cache read failed', e);
    return null;
  }
}

/** Entry metadata without the blobs, for eviction planning and the readout. */
async function listCachedReceiptMeta() {
  try {
    const db = await openReceiptCacheDb();
    const all = await _reqPromise(_cacheTx(db, 'readonly').getAll());
    db.close();
    return (all || []).map(({ key, kind, name, type, size, cachedAt, lastSeenAt }) =>
      ({ key, kind, name, type, size, cachedAt, lastSeenAt }));
  } catch (e) {
    return [];
  }
}

async function evictReceiptCacheToBudget() {
  try {
    const entries = await listCachedReceiptMeta();
    const doomed = planEviction(entries);
    if (!doomed.length) return 0;
    const db = await openReceiptCacheDb();
    const store = _cacheTx(db, 'readwrite');
    await Promise.all(doomed.map(key => _reqPromise(store.delete(key))));
    db.close();
    return doomed.length;
  } catch (e) {
    console.warn('Receipt cache eviction failed', e);
    return 0;
  }
}

async function deleteCachedReceipt(ref) {
  const key = cacheKeyFor(ref);
  if (!key) return;
  try {
    const db = await openReceiptCacheDb();
    await _reqPromise(_cacheTx(db, 'readwrite').delete(key));
    db.close();
  } catch (_) { /* a stale cache entry is harmless */ }
}

async function saveReceiptToLocalFile(file, subfolderName = '', meta = null) {
  const dirHandle = await loadReceiptFolderHandle();
  if (!dirHandle) return null;
  try {
    const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && await dirHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') return null;

    // The folder the owner picked IS the receipts folder. This used to nest a
    // `receipts/` directory inside it, which produced paths like
    // "…/receipts/General receipts/receipts/2026/Office Supplies/General/" —
    // four levels of app-invented nesting inside a folder already named for
    // receipts. Files go straight into the chosen folder now.
    //
    // `subfolderName` is a flat legacy destination (email-imports, Shippo). It
    // is NOT a book title, and passing it as one is what appended that stray
    // "General" level to every Tax Centre receipt.
    const segments = meta
      ? receiptFolderPath(meta)
      : (subfolderName ? [subfolderName] : []);

    let targetDir = dirHandle;
    for (const segment of segments) {
      targetDir = await targetDir.getDirectoryHandle(segment, { create: true });
    }

    const desiredName = meta
      ? receiptFileName({ ...meta, originalName: file.name, mimeType: file.type })
      : `${new Date().toISOString().split('T')[0]}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;

    // Two receipts saved the same day from files with the same name would land
    // on the same path, and `create: true` + createWritable() truncates rather
    // than refusing — the first receipt would be gone with nothing to show for
    // it. Suffix instead, which matters most during a reclaim (a whole backlog
    // written in one pass, where repeated names like "receipt.jpg" are normal).
    const filename = await uniqueFileName(desiredName, async (name) => {
      try {
        await targetDir.getFileHandle(name, { create: false });
        return true;
      } catch (_) {
        return false;
      }
    });

    const fileHandle = await targetDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();

    const relative = [...segments, filename].join('/');
    // Cache before returning, so a receipt is viewable even if the folder moves
    // between now and the next time the owner looks for it.
    await cacheReceiptFile(relative, file);
    return `local://${relative}`;
  } catch (e) {
    await handleFolderError(e, 'Error Saving Receipt', 'Receipt file save failed. The folder may have been moved or disconnected.');
    return null;
  }
}

/**
 * Park a receipt in cloud storage — the fallback when the local folder can't be
 * reached at save time.
 *
 * The alternative used to be dropping the file silently: the expense saved, the
 * receipt didn't, and nothing said so. An expense with no receipt is the one an
 * accountant disallows, so the bytes go somewhere no matter what, and
 * reclaimCloudReceipts() brings them down to the folder afterwards.
 *
 * Resolves to a download URL, or throws — callers decide what a failure means.
 */
async function uploadReceiptToCloud(file, subfolderName = 'General') {
  if (typeof window._fbUploadReceipt !== 'function') {
    throw new Error('Cloud receipt storage is unavailable');
  }
  const stamp = new Date().getTime();
  const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
  const safeFolder = (subfolderName || 'General').replace(/[^a-zA-Z0-9.\-_]/g, '_');
  // Bound it so the submit button can never hang on a stalled upload.
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Upload timed out')), 30000)
  );
  return Promise.race([
    window._fbUploadReceipt(file, `${safeFolder}/${stamp}_${cleanName}`),
    timeout,
  ]);
}

/**
 * Save one receipt the best way currently available: the connected folder if it
 * can be reached, the cloud if it can't.
 *
 * Returns `{ ref, storage }` where storage is 'local' | 'cloud' | 'none', so the
 * caller can stamp receiptCloudAt and say something truthful in its toast.
 */
async function saveReceiptBestEffort(file, subfolderName = 'General', meta = null) {
  let localRef = null;
  try {
    localRef = await saveReceiptToLocalFile(file, subfolderName, meta);
  } catch (e) {
    console.error('Local receipt save failed', e);
    localRef = null;
  }
  if (localRef) return { ref: localRef, storage: 'local' };

  try {
    const url = await uploadReceiptToCloud(file, subfolderName);
    if (url) return { ref: url, storage: 'cloud' };
  } catch (e) {
    console.error('Cloud receipt fallback failed', e);
  }
  return { ref: '', storage: 'none' };
}

// Build the ledger's receipt cell from an expense/ledger item. Supports the
// new receiptFiles array (body + each attachment, each independently viewable)
// and falls back to the single legacy receipt string. Local files open via
// viewLocalReceipt; remote URLs open in a new tab.
function _localReceiptCell(item) {
  const files = (Array.isArray(item.receiptFiles) && item.receiptFiles.length)
    ? item.receiptFiles
    : (item.receipt ? [item.receipt] : []);
  if (!files.length) {
    if (isGratuityExpense(item)) {
      return '<span class="pill gray" style="font-size:10px;" title="Gifted / promotional author copy (receipt exempt)">Gratuity copy</span>';
    }
    if (isRentExpense(item)) {
      return '<span class="pill gray" style="font-size:10px;" title="Rent / lease payment (receipt exempt — documented via tenancy lease & bank statement)">Lease record</span>';
    }
    if (item.sourceType === 'businessExpense' || item.sourceType === 'bookExpense') {
      return `<button class="btn sm outline" type="button" onclick="attachReceiptToExpenseRow('${item.sourceType || ''}', '${item.sourceId || ''}', '${item.itemId || ''}')" style="font-size:10px;padding:1px 6px;color:var(--gold-text);" title="Attach receipt file">📎 Attach</button>`;
    }
    return '';
  }
  const multi = files.length > 1;
  return files.map((r, idx) => {
    if (typeof r === 'string' && r.startsWith('local://')) {
      const fn = r.replace('local://', '');
      const base = fn.split('/').pop();
      const label = multi ? `View ${idx + 1}` : 'View Local';
      return `<a href="#" title="${escapeHtml(base)}" onclick="event.preventDefault(); viewLocalReceipt('${fn.replace(/'/g, "\\'")}')" style="color:var(--gold3);text-decoration:underline;">${label}</a>`;
    }
    // A stored Shippo label link is signed and expires a year after the label
    // was created, so linking to it directly hands the owner a link that dies
    // on its own. The transaction id is on the expense, so mint a fresh one
    // when they actually click.
    const shippoTx = shippoTxIdFromRef(item.ref);
    if (shippoTx && isExpiringLabelUrl(r)) {
      const expired = isLabelUrlExpired(r);
      const label = multi ? `Label ${idx + 1}` : 'Label';
      return `<a href="#" title="${expired ? 'This saved link has expired — opens a fresh one from Shippo' : 'Opens a fresh link from Shippo'}" onclick="event.preventDefault(); openShippoLabel('${escapeHtml(String(item.ref))}')" style="color:var(--gold3);text-decoration:underline;">${label}${expired ? ' ↻' : ''}</a>`;
    }
    const label = multi ? `Receipt ${idx + 1}` : 'Receipt';
    const href = followableUrl(r);
    return href
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="color:var(--gold3);">${label}</a>`
      : `<span style="color:var(--text3);" title="This receipt reference cannot be opened">${label}</span>`;
  }).join(' · ');
}

// Find one receipt file inside the connected folder and hand back the File.
// Three strategies, in order: the `receipts/` subfolder, the folder root, then
// a deep search by basename — which is what makes a receipt survive the user
// reorganising or renaming subfolders. Extracted so the printable trip report
// can read the same files viewLocalReceipt opens; throws when nothing matches,
// so callers decide whether that is fatal or just an omitted thumbnail.
/**
 * Walk a full folder-relative path from a starting directory.
 *
 * The previous version destructured `path.split('/')` into exactly
 * `[subfolder, filename]`, so it only ever handled one level of nesting. Once
 * receipts were filed under year and category, "2026/Office Supplies/x.pdf"
 * resolved subfolder="2026" and filename="Office Supplies" and always failed —
 * every organised receipt fell through to the slow basename search, and
 * anything deeper than that search's limit could not be opened at all.
 */
async function fileHandleAtPath(dirHandle, path) {
  const parts = String(path || '').split('/').filter(Boolean);
  if (!parts.length) return null;
  const filename = parts.pop();
  let dir = dirHandle;
  for (const segment of parts) {
    dir = await dir.getDirectoryHandle(segment, { create: false });
  }
  return dir.getFileHandle(filename);
}

async function resolveLocalReceiptFile(dirHandle, path) {
  let fileHandle = null;
  const baseFilename = String(path || '').split('/').pop();

  // The chosen folder is the root. Receipts filed before that was true live
  // under a nested `receipts/`, so that stays as a fallback rather than
  // stranding everything saved earlier.
  for (const attempt of [
    () => fileHandleAtPath(dirHandle, path),
    async () => {
      const legacy = await dirHandle.getDirectoryHandle('receipts', { create: false });
      return fileHandleAtPath(legacy, path);
    },
  ]) {
    try {
      fileHandle = await attempt();
      if (fileHandle) break;
    } catch (_) { /* try the next location */ }
  }

  // Last resort: find it by name anywhere in the tree, which is what lets a
  // receipt survive the owner reorganising their folders by hand.
  if (!fileHandle) {
    fileHandle = await findFileHandleInDir(dirHandle, baseFilename);
  }

  if (!fileHandle) {
    throw new Error(`File "${baseFilename}" not found in connected folder.`);
  }

  return fileHandle.getFile();
}

// Whether the connected folder answered last time we asked. Drives the one
// banner in the Tax Centre, so a moved folder is reported once rather than as a
// dialog per receipt the owner clicks.
let _receiptFolderReachable = true;

function _noteReceiptFolderHealth(reachable) {
  if (_receiptFolderReachable === reachable) return;
  _receiptFolderReachable = reachable;
  renderReceiptFolderAlert();
}

function receiptFolderReachable() {
  return _receiptFolderReachable;
}

/**
 * The folder-has-vanished banner.
 *
 * Rendered here rather than from the Tax Centre module because this file owns
 * the folder handle and the cache, and the element is static markup nothing else
 * rewrites. Shown once instead of raising a reconnect dialog every time the
 * owner clicks a receipt — which is exactly what moving the folder used to feel
 * like.
 */
function renderReceiptFolderAlert() {
  const el = $('tc-folder-alert');
  if (!el) return;
  if (_receiptFolderReachable) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<div class="tc-folder-alert-inner">`
    + `<span class="tc-folder-alert-icon">⚠️</span>`
    + `<div class="tc-folder-alert-text">`
    + `<strong>Your receipts folder can't be found.</strong> It was probably moved or renamed. `
    + `Receipts still open from offline device cache, and new uploads save to cloud until you reconnect.`
    + `</div>`
    + `<button class="btn sm gold" type="button" onclick="setupReceiptFolder()">Reconnect Folder</button>`
    + `</div>`;
  el.style.display = '';
}

/** How many receipts have a standby copy on this device, and how much space. */
async function renderReceiptCacheStatus() {
  const el = $('tc-cache-status');
  if (!el) return;
  const { count, bytes, previews } = cacheStats(await listCachedReceiptMeta());
  if (!count) {
    el.innerHTML = `<div class="tc-cache-bar"><span class="tc-cache-badge">💾 Device Cache</span> <span class="tc-cache-desc">No receipts saved on this device yet — save them so they still open if your folder moves or you go offline.</span></div>`;
    el.style.display = '';
    return;
  }
  el.innerHTML = `<div class="tc-cache-bar is-cached">`
    + `<span class="tc-cache-badge">💾 Device Cache</span> `
    + `<span class="tc-cache-desc"><strong>${count} receipt${count === 1 ? '' : 's'}</strong> (${escapeHtml(formatCacheSize(bytes))}) saved on this device`
    + (previews ? ` · ${previews} stored as compact previews` : '')
    + ` — ready for instant offline viewing even if folders move.</span>`
    + `</div>`;
  el.style.display = '';
}

/**
 * Ask the folder whether it is still there.
 *
 * A stale handle usually still reports its permission happily and only fails
 * when something is actually read, so this opens the `receipts/` directory —
 * cheap, and it is the one directory the app knows it created.
 */
async function checkReceiptFolderHealth() {
  const dirHandle = await loadReceiptFolderHandle().catch(() => null);
  if (!dirHandle) {
    _noteReceiptFolderHealth(true); // nothing connected is not "broken"
    return { connected: false, reachable: true, handle: null };
  }
  try {
    const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      // Needs a click to regrant; not the same as a folder that has vanished.
      _noteReceiptFolderHealth(true);
      return { connected: true, reachable: true, needsPermission: true, handle: dirHandle };
    }
    // Reading the folder is the test. It used to open a `receipts/`
    // subdirectory, which no longer exists now the chosen folder is the root —
    // and a missing subfolder was never good evidence that a folder had gone.
    for await (const _ of dirHandle.values()) break;
    _noteReceiptFolderHealth(true);
    return { connected: true, reachable: true, handle: dirHandle };
  } catch (e) {
    console.warn('Receipt folder unreachable', e);
    _noteReceiptFolderHealth(false);
    return { connected: true, reachable: false, handle: dirHandle };
  }
}

/**
 * Give every local receipt a standby copy, for the ones filed before the cache
 * existed — precisely the receipts most exposed to a folder move.
 *
 * Bounded per pass so opening the app never turns into a long disk crawl; the
 * next startup continues where this one stopped.
 */
async function backfillReceiptCache({ limit = 40, interactive = false } = {}) {
  if (!window.IS_PUBLISHER) return { cached: 0, missing: 0, remaining: 0 };

  const health = await checkReceiptFolderHealth();
  if (!health.connected || !health.reachable || health.needsPermission) {
    if (interactive) {
      showToast(health.connected
        ? '⚠ Your receipts folder isn\'t reachable — reconnect it first'
        : '⚠ Connect a receipts folder first', 'warn', 5000);
    }
    return { cached: 0, missing: 0, remaining: 0 };
  }

  const refs = cloudReceiptOwners()
    .flatMap(o => receiptRefsOf(o.exp))
    .filter(r => typeof r === 'string' && r.startsWith('local://'));

  const cachedKeys = (await listCachedReceiptMeta()).map(e => e.key);
  const todo = uncachedRefs(refs, cachedKeys);
  if (!todo.length) {
    if (interactive) showToast('✓ Every receipt already has an offline copy', 'ok');
    return { cached: 0, missing: 0, remaining: 0 };
  }

  const batch = todo.slice(0, limit);
  let cached = 0;
  let missing = 0;

  for (const ref of batch) {
    try {
      const file = await resolveLocalReceiptFile(health.handle, cacheKeyFor(ref));
      if (await cacheReceiptFile(ref, file)) cached++;
    } catch (_) {
      // Already unreachable on disk — the re-link tool is the cure for that.
      missing++;
    }
  }

  if (interactive) {
    const remaining = todo.length - batch.length;
    showToast(
      `✓ ${cached} receipt${cached === 1 ? '' : 's'} saved for offline viewing` +
      (missing ? ` · ${missing} not found on disk` : '') +
      (remaining ? ` · ${remaining} to go` : ''),
      missing ? 'warn' : 'ok',
      5000
    );
    renderTaxCenter();
    renderReceiptCacheStatus();
  }

  return { cached, missing, remaining: todo.length - batch.length };
}

/** Tax Centre button target for the backfill. */
async function cacheAllReceiptsNow() {
  return backfillReceiptCache({ limit: 500, interactive: true });
}

/** Open a blob in a new tab, revoking the object URL once it has loaded. */
function openBlobInTab(blob) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  // Revoke late: revoking immediately can beat the new tab to the bytes.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return win;
}

/**
 * Show a receipt, from the folder if it is reachable and from the standby copy
 * if it is not.
 *
 * The folder stays the preferred source — it holds the original bytes and the
 * cache may hold a downscaled preview. But the folder failing is no longer the
 * end of the road: this used to raise a reconnect dialog per receipt, so moving
 * the folder meant every receipt in the ledger stopped opening and the owner got
 * a dialog for each one they tried.
 */
async function viewLocalReceipt(path) {
  const dirHandle = await loadReceiptFolderHandle().catch(() => null);

  if (dirHandle) {
    try {
      const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
      if (permission === 'granted' || await dirHandle.requestPermission({ mode: 'readwrite' }) === 'granted') {
        const file = await resolveLocalReceiptFile(dirHandle, path);
        openBlobInTab(file);
        _noteReceiptFolderHealth(true);
        // Refresh the standby copy while the real file is in hand.
        cacheReceiptFile(path, file);
        return;
      }
    } catch (e) {
      console.warn('Receipt not reachable in folder, trying cached copy', e);
    }
  }

  const cached = await readCachedReceipt(path);
  if (cached) {
    openBlobInTab(cached.blob);
    _noteReceiptFolderHealth(false);
    showToast(
      cached.kind === 'preview'
        ? 'Showing a saved copy — reconnect your receipts folder for the original'
        : 'Showing a saved copy — your receipts folder isn\'t reachable right now',
      'warn',
      5000
    );
    return;
  }

  // Nothing on disk and nothing cached: now a reconnect is genuinely the only
  // way forward, so it is worth asking.
  _noteReceiptFolderHealth(false);
  const reconnected = await handleFolderError(
    new Error(`Receipt "${path}" not found`),
    'Receipt Not Found',
    dirHandle
      ? 'That receipt isn\'t in the connected folder and no saved copy is stored on this device. The folder may have been moved.'
      : 'No receipts folder is connected on this device, and no saved copy of this receipt is stored here.'
  );
  if (reconnected) viewLocalReceipt(path);
}

/**
 * Every expense the reclaim walks, bound to this app's live data.
 *
 * Reads the in-memory `states` rather than re-fetching each book: writing back
 * through saveState() then merges with whatever else is on screen, instead of
 * racing a stale copy over an edit the owner just made somewhere else.
 */
function cloudReceiptOwners() {
  return receiptOwners(TAX_CENTER.businessExpenses, states, BOOKS);
}

/**
 * Fetch one cloud receipt down into the connected folder and drop the cloud
 * copy. Returns the new `local://` reference, or null if anything went wrong.
 *
 * Order matters and is the whole point: the cloud copy is deleted only once the
 * local write has come back clean. A failed fetch (offline, expired URL) leaves
 * the receipt exactly where it was, so a reclaim that runs at a bad moment
 * costs nothing but a retry.
 */
async function reclaimOneReceipt(url, meta, problems = null) {
  // Record why this one failed rather than collapsing every cause into null.
  // A whole batch failing identically is the signature of a systemic problem —
  // an object that no longer exists, revoked access, a blocked request — and
  // "check your connection" actively misdirects when that happens.
  const note = (stage, detail) => {
    if (problems) problems.push({ url, stage, detail, desc: meta && meta.desc });
    console.warn(`Receipt reclaim failed [${stage}]`, detail, url);
    return null;
  };

  let response;
  try {
    response = await fetch(url);
  } catch (e) {
    // A network-layer rejection: offline, DNS, or the request being blocked
    // before a status ever comes back.
    return note('download', `${e.name || 'Error'}: ${e.message || 'request failed'}`);
  }
  if (!response.ok) {
    const hint = response.status === 404
      ? 'the file is no longer in cloud storage'
      : response.status === 403
        ? 'access denied — the link may have been revoked'
        : 'unexpected response from cloud storage';
    return note('download', `HTTP ${response.status} — ${hint}`);
  }

  try {
    const blob = await response.blob();

    // Firebase download URLs encode the object path, so the last %2F segment is
    // the stored filename; the query string carries the access token.
    const raw = url.split('%2F').pop().split('?')[0];
    let filename = 'receipt';
    try { filename = decodeURIComponent(raw) || 'receipt'; } catch (_) { filename = raw || 'receipt'; }

    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    // Named and filed from the expense, so what lands on disk reads as
    // "2026/Office Supplies/2026-05-10_Staples_CAD-24.99.jpg" rather than
    // whatever the phone or the email attachment happened to call it.
    const localRef = await saveReceiptToLocalFile(file, '', { ...meta, originalName: filename });
    if (!localRef) {
      return note('save', 'downloaded fine, but could not be written to the folder');
    }

    // Safely on disk — now let go of the cloud copy.
    await window._fbDeleteReceipt(url);
    return toLocalRef(localRef);
  } catch (e) {
    return note('save', `${e.name || 'Error'}: ${e.message || 'could not save the file'}`);
  }
}

/**
 * Turn a batch of reclaim failures into something the owner can hand back.
 *
 * Groups by the actual reason, because forty receipts failing the same way is a
 * single problem with one fix, not forty problems.
 */
function summarizeReceiptProblems(problems) {
  const groups = new Map();
  (problems || []).forEach(p => {
    const key = `${p.stage}: ${p.detail}`;
    if (!groups.has(key)) groups.set(key, { reason: key, count: 0, examples: [] });
    const g = groups.get(key);
    g.count++;
    if (g.examples.length < 3) g.examples.push(p.desc || p.url);
  });
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** Plain-text diagnostic for the clipboard. */
function formatReceiptDiagnostic(problems, context = {}) {
  const groups = summarizeReceiptProblems(problems);
  const lines = [
    'Lyricalmyrical Inventory — receipt move diagnostic',
    `When: ${new Date().toISOString()}`,
    `Attempted: ${problems.length} receipt${problems.length === 1 ? '' : 's'}`,
  ];
  if (context.folder) lines.push(`Folder: ${context.folder}`);
  lines.push('', 'Reasons:');
  groups.forEach(g => {
    lines.push(`  ${g.count}x  ${g.reason}`);
    g.examples.forEach(e => lines.push(`        e.g. ${e}`));
  });
  return lines.join('\n');
}

/**
 * Walk every receipt currently parked in the cloud back down into the connected
 * folder, deleting each cloud copy as it lands.
 *
 * Runs quietly at startup and loudly from the Tax Centre button. Deliberately
 * sequential: these writes share directory handles and a filename-collision
 * check, and a reclaim is a rare batch of a few dozen files at most — ordering
 * them costs nothing measurable and removes any chance of two writes racing for
 * the same name.
 */
async function reclaimCloudReceipts({ interactive = false } = {}) {
  if (!window.IS_PUBLISHER) {
    if (interactive) showToast('⚠ Only the publisher account files receipts locally', 'warn');
    return { moved: 0, failed: 0 };
  }

  let dirHandle = await loadReceiptFolderHandle();
  if (!dirHandle) {
    if (!interactive) return { moved: 0, failed: 0 };
    if (!('showDirectoryPicker' in window)) {
      showToast('⚠ This browser can\'t save to a local folder — receipts stay in the cloud', 'warn', 5000);
      return { moved: 0, failed: 0 };
    }
    const connect = await confirmDialog(
      'No receipt folder is connected yet. Choose the folder your receipts should live in, and any waiting in the cloud will be moved into it now.',
      { title: 'Move receipts to your folder', okLabel: 'Choose folder…', cancelLabel: 'Cancel' }
    );
    if (!connect) return { moved: 0, failed: 0 };
    dirHandle = await setupReceiptFolder();
    if (!dirHandle) return { moved: 0, failed: 0 };
  }

  // A handle restored from IndexedDB comes back without permission after a
  // browser restart, and the grant prompt needs a user gesture — so ask only on
  // the interactive path and let the startup pass wait for a click.
  try {
    let perm = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      if (!interactive) return { moved: 0, failed: 0 };
      perm = await dirHandle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        showToast('⚠ Folder access denied — receipts stay in the cloud for now', 'warn', 5000);
        return { moved: 0, failed: 0 };
      }
    }
  } catch (e) {
    console.error('Receipt folder permission check failed', e);
    if (interactive) showToast('⚠ Could not reach the receipt folder', 'err');
    return { moved: 0, failed: 0 };
  }

  const owners = cloudReceiptOwners().filter(o => cloudReceiptRefs(o.exp).length);
  if (!owners.length) {
    if (interactive) showToast('✓ Nothing waiting — every receipt is already in your folder', 'ok');
    return { moved: 0, failed: 0 };
  }

  const btn = $('tc-reclaim-btn');
  const btnText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Moving…'; }

  let moved = 0;
  let failed = 0;
  let taxTouched = false;
  const booksTouched = new Set();
  const problems = [];

  for (const { exp, subfolder, scope, bid } of owners) {
    const refs = receiptRefsOf(exp);
    const next = [];
    let changed = false;
    // Book expenses file under their title; Tax Centre ones don't need the
    // extra level, since 'General' would only ever be one folder.
    const meta = {
      date: exp.date,
      desc: exp.desc,
      cat: exp.cat,
      amount: exp.origAmount ?? exp.amount,
      currency: exp.origCurrency || exp.currency,
      book: scope === 'book' ? subfolder : '',
    };

    for (const ref of refs) {
      // Only our own stored files can be downloaded. An external link — a
      // Shippo label, a vendor's invoice page — belongs to another site, and a
      // browser cannot read its bytes however many times we ask.
      if (!isOurCloudReceipt(ref)) { next.push(ref); continue; }
      const localRef = await reclaimOneReceipt(ref, { ...meta, index: next.length }, problems);
      if (localRef) {
        next.push(localRef);
        changed = true;
        moved++;
      } else {
        // Keep the cloud reference — a receipt that didn't come down is still
        // reachable where it is, and the next reclaim will try again.
        next.push(ref);
        failed++;
      }
    }

    if (!changed) continue;
    writeReceiptRefs(exp, next);
    // Once nothing of this expense is left in the cloud, its wait is over and
    // the age stamp would otherwise keep ageing forever.
    if (!cloudReceiptRefs(exp).length) delete exp.receiptCloudAt;
    if (scope === 'tax') taxTouched = true;
    else booksTouched.add(bid);
  }

  if (taxTouched) await saveTaxCenter();
  for (const bid of booksTouched) await saveState(bid);

  if (btn) { btn.disabled = false; btn.textContent = btnText; }

  // Keep the last batch's failures so the Receipts panel can explain them and
  // hand the owner something to paste back.
  _lastReceiptProblems = problems;
  _lastReceiptProblemContext = { folder: dirHandle.name || '' };

  if (moved > 0) {
    renderTaxCenter();
    const where = dirHandle.name ? ` in ${dirHandle.name}` : '';
    showToast(
      failed > 0
        ? `✓ Moved ${moved} receipt${moved === 1 ? '' : 's'}${where} · ${failed} couldn't be moved yet`
        : `✓ Moved ${moved} receipt${moved === 1 ? '' : 's'} into your folder${where} and cleared the cloud copies`,
      failed > 0 ? 'warn' : 'ok',
      5000
    );
  } else if (interactive) {
    // Say the actual reason. The old message blamed the connection for every
    // cause, which sent the owner chasing a problem they did not have.
    const groups = summarizeReceiptProblems(problems);
    const top = groups[0];
    showToast(
      top
        ? `⚠ Could not move ${failed} receipt${failed === 1 ? '' : 's'} — ${top.reason}`
        : `⚠ Could not move ${failed} receipt${failed === 1 ? '' : 's'}`,
      'err',
      7000
    );
  }
  if (interactive) renderReceiptProblemPanel();

  return { moved, failed, problems };
}

// The failures from the most recent move, for the diagnostic panel.
let _lastReceiptProblems = [];
let _lastReceiptProblemContext = {};

/**
 * Explain the last batch of failures, grouped by cause, with a button that puts
 * the detail on the clipboard. This is the instrument that answers "why did all
 * forty fail" without asking a non-technical owner to open devtools.
 */
function renderReceiptProblemPanel() {
  const el = $('tc-receipt-problems');
  if (!el) return;
  if (!_lastReceiptProblems.length) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const groups = summarizeReceiptProblems(_lastReceiptProblems);
  el.innerHTML = `<div class="tc-problem-head">`
    + `<span class="tc-problem-icon">⚠️</span>`
    + `<div><strong>${_lastReceiptProblems.length} receipt${_lastReceiptProblems.length === 1 ? '' : 's'} could not be moved:</strong></div>`
    + `</div>`
    + `<ul class="tc-problem-list">${groups.map(g =>
      `<li><strong>${g.count}×</strong> ${escapeHtml(g.reason)}</li>`).join('')}</ul>`
    + `<div class="tc-problem-action">`
    + `<button class="btn sm" type="button" onclick="copyReceiptDiagnostic()">📋 Copy diagnostic report</button>`
    + `</div>`;
  el.style.display = '';
}

async function copyReceiptDiagnostic() {
  const text = formatReceiptDiagnostic(_lastReceiptProblems, _lastReceiptProblemContext);
  try {
    await navigator.clipboard.writeText(text);
    showToast('✓ Details copied — paste them to whoever is helping you', 'ok', 4000);
  } catch (_) {
    // Clipboard can be blocked; fall back to something selectable.
    const win = window.open('', '_blank');
    if (win) win.document.write(`<pre>${escapeHtml(text)}</pre>`);
    else showToast('⚠ Could not copy — check the browser console for details', 'warn');
  }
}

/** Tax Centre button target — the reclaim, with prompts and a spoken result. */
async function reclaimCloudReceiptsNow() {
  return reclaimCloudReceipts({ interactive: true });
}

// ── RECEIPT EXPORT
// Handing someone an organized folder of receipts, without depending on the
// File System Access API. A zip download works in every browser including a
// phone, needs no permission, and cannot be broken by moving a folder — which
// is the whole reason the old "keep the folder in sync" model kept failing.

/**
 * Every receipt that should appear in an export, with the expense it belongs to.
 * Optionally narrowed to one tax year.
 */
function receiptsForExport(year = null) {
  const rows = [];
  cloudReceiptOwners().forEach(({ exp, subfolder, scope }) => {
    const refs = receiptRefsOf(exp);
    if (!refs.length) return;
    const expYear = String(exp.date || '').slice(0, 4);
    if (year && expYear !== String(year)) return;

    refs.forEach((ref, index) => {
      rows.push({
        ref,
        index,
        exp,
        book: scope === 'book' ? subfolder : '',
        meta: {
          date: exp.date,
          desc: exp.desc,
          cat: exp.cat,
          amount: exp.origAmount ?? exp.amount,
          currency: exp.origCurrency || exp.currency,
          book: scope === 'book' ? subfolder : '',
          index,
        },
      });
    });
  });
  return rows;
}

/** The tax years that actually have receipts, newest first. */
function receiptExportYears() {
  const years = new Set();
  receiptsForExport().forEach(r => {
    const y = String(r.exp.date || '').slice(0, 4);
    if (/^\d{4}$/.test(y)) years.add(y);
  });
  return [...years].sort().reverse();
}

/**
 * Get the bytes for one receipt, wherever they happen to be.
 *
 * Three sources in order of fidelity: the folder (originals), the cloud
 * (originals), then the on-device cache (which may hold a downscaled preview).
 * The cache is last because a preview is a worse artifact for an accountant —
 * but it beats a gap in the export.
 */
async function readReceiptBytes(ref, dirHandle) {
  if (isLocalReceipt(ref)) {
    const path = localRefPath(ref);
    if (dirHandle) {
      try {
        const file = await resolveLocalReceiptFile(dirHandle, path);
        return { blob: file, source: 'folder' };
      } catch (_) { /* fall through to the cache */ }
    }
    const cached = await readCachedReceipt(path);
    if (cached) return { blob: cached.blob, source: cached.kind === 'preview' ? 'preview' : 'device' };
    return null;
  }

  if (isOurCloudReceipt(ref)) {
    try {
      const res = await fetch(ref);
      if (res.ok) return { blob: await res.blob(), source: 'cloud' };
      return { error: `HTTP ${res.status}` };
    } catch (e) {
      return { error: `${e.name || 'Error'}: ${e.message || 'download failed'}` };
    }
  }

  // An external link is somebody else's file. It cannot go in the export, so
  // the manifest records the link instead — which is still what an accountant
  // needs to go and look at it.
  if (isCloudReceipt(ref)) return { error: 'external link — kept in the summary sheet', link: ref };
  return null;
}

/**
 * Build and download an organized zip of receipts.
 *
 * The manifest is the part an accountant actually works from — it ties every
 * file back to a ledger line, so the folder is auditable without opening each
 * PDF. Anything that could not be retrieved is listed in the manifest too,
 * rather than quietly missing.
 */
async function exportReceiptsZip(year = null) {
  const rows = receiptsForExport(year);
  if (!rows.length) {
    showToast('⚠ No receipts to export for that year', 'warn');
    return { exported: 0, missing: 0 };
  }

  const btn = $('tc-export-run-btn');
  const oldText = btn ? btn.textContent : '';
  const progress = $('tc-export-progress');
  if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }

  const dirHandle = await loadReceiptFolderHandle().catch(() => null);
  const files = [];
  const manifest = [['Date', 'Vendor', 'Description', 'Category', 'Book', 'Amount', 'Currency', 'File', 'Source']];
  let missing = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (progress) progress.textContent = `Collecting ${i + 1} of ${rows.length}…`;

    const got = await readReceiptBytes(row.ref, dirHandle);
    const vendor = vendorFrom(row.exp.desc) || '';

    if (!got || !got.blob) {
      missing++;
      manifest.push([
        row.exp.date || '', vendor, row.exp.desc || '', row.exp.cat || '', row.book,
        String(row.meta.amount ?? ''), row.meta.currency || '',
        // A link is more useful in the sheet than the words "not retrievable".
        got && got.link ? got.link : '(not retrievable)',
        got && got.error ? got.error : 'missing',
      ]);
      continue;
    }

    const name = receiptFileName({ ...row.meta, vendor, originalName: localRefPath(row.ref).split('/').pop(), mimeType: got.blob.type });
    const path = [...receiptFolderPath(row.meta), name].join('/');
    files.push({ name: path, data: new Uint8Array(await got.blob.arrayBuffer()), date: new Date(row.exp.date || Date.now()) });
    manifest.push([
      row.exp.date || '', vendor, row.exp.desc || '', row.exp.cat || '', row.book,
      String(row.meta.amount ?? ''), row.meta.currency || '', path, got.source,
    ]);
  }

  if (progress) progress.textContent = 'Building the zip…';
  files.push(textEntry('manifest.csv', toCsv(manifest)));

  const label = year ? `-${year}` : '';
  downloadBlob(createZip(files), `Lyricalmyrical-Receipts${label}.zip`);

  if (btn) { btn.disabled = false; btn.textContent = oldText; }
  if (progress) progress.textContent = '';
  closeM('export-receipts');

  showToast(
    missing
      ? `✓ Exported ${files.length - 1} receipt${files.length - 1 === 1 ? '' : 's'} · ${missing} could not be retrieved (listed in the summary sheet)`
      : `✓ Exported ${files.length - 1} receipt${files.length - 1 === 1 ? '' : 's'} with a summary sheet`,
    missing ? 'warn' : 'ok',
    6000
  );
  return { exported: files.length - 1, missing };
}

function openExportReceiptsModal() {
  const sel = $('tc-export-year');
  if (sel) {
    const years = receiptExportYears();
    sel.innerHTML = `<option value="">All years</option>`
      + years.map(y => `<option value="${y}">${y}</option>`).join('');
    // Default to the most recent year with receipts — the usual reason to
    // export is the tax year just finished.
    if (years.length) sel.value = years[0];
  }
  const progress = $('tc-export-progress');
  if (progress) progress.textContent = '';
  openM('export-receipts');
}

function closeExportReceiptsModal() { closeM('export-receipts'); }

async function runReceiptExport() {
  const year = ($('tc-export-year')?.value || '').trim();
  return exportReceiptsZip(year || null);
}

// ── RECEIPT ORGANIZER
// A one-time tidy-up for a folder that already exists: fifty-odd PDFs named by
// whatever produced them, sitting flat in "General receipts".
//
// Non-destructive by construction. Files are *copied* into a new destination
// folder, and the originals are never renamed, moved or deleted. These are tax
// records — the cost of a wrong guess is losing a deduction, so nothing here
// touches the only copy, and nothing is written until the owner has seen the
// plan and pressed the button.

let _organizerFiles = [];   // { handle, name, size }
let _organizerPlans = [];   // planFile() output, one per file, editable
let _organizerSource = null;
let _organizerDest = null;

/** Every file in a directory tree, depth-limited so a stray huge folder can't hang. */
async function listFilesRecursive(dirHandle, prefix = '', depth = 0) {
  const out = [];
  if (depth > 3) return out;
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      // Only things that can plausibly be a receipt.
      if (!/\.(pdf|jpe?g|png|webp|heic|heif|gif)$/i.test(entry.name)) continue;
      out.push({ handle: entry, name: entry.name, path: prefix ? `${prefix}/${entry.name}` : entry.name });
    } else if (entry.kind === 'directory') {
      out.push(...await listFilesRecursive(entry, prefix ? `${prefix}/${entry.name}` : entry.name, depth + 1));
    }
  }
  return out;
}

/** Every expense the organizer can match against, across the Tax Centre and books. */
function organizerCandidateExpenses() {
  return cloudReceiptOwners().map(o => ({
    ...o.exp,
    _book: o.scope === 'book' ? o.subfolder : '',
  }));
}

async function openReceiptOrganizer() {
  if (!('showDirectoryPicker' in window)) {
    showToast('⚠ Tidying a folder needs Chrome or Edge on a computer', 'warn', 5000);
    return;
  }
  _organizerFiles = [];
  _organizerPlans = [];
  _organizerSource = null;
  _organizerDest = null;
  const body = $('organizer-body');
  if (body) body.innerHTML = '<div class="organizer-empty">Choose the folder your receipts are in to begin. Nothing is changed until you say so.</div>';
  const status = $('organizer-status');
  if (status) status.textContent = '';
  const runBtn = $('organizer-run-btn');
  if (runBtn) runBtn.style.display = 'none';
  openM('receipt-organizer');
}

function closeReceiptOrganizer() { closeM('receipt-organizer'); }

/** Pick the messy folder and build the plan. */
async function chooseOrganizerSource() {
  try {
    _organizerSource = await window.showDirectoryPicker({ mode: 'read' });
  } catch (e) {
    if (e?.name !== 'AbortError') showToast('Could not open that folder', 'err');
    return;
  }

  const status = $('organizer-status');
  if (status) status.textContent = 'Reading the folder…';

  _organizerFiles = await listFilesRecursive(_organizerSource);
  if (!_organizerFiles.length) {
    if (status) status.textContent = '';
    showToast('No receipt files found in that folder', 'warn');
    return;
  }

  const expenses = organizerCandidateExpenses();
  _organizerPlans = _organizerFiles.map(f => ({
    ...planFile({ name: f.name }, expenses, TAX_CATEGORIES),
    source: f,
  }));

  renderOrganizerTable();
  if (status) {
    const needing = _organizerPlans.filter(p => p.needsOcr).length;
    status.textContent = `${_organizerFiles.length} file${_organizerFiles.length === 1 ? '' : 's'} found in "${_organizerSource.name}".`
      + (needing ? ` ${needing} need${needing === 1 ? 's' : ''} a closer look — use Read the unclear ones to have them read automatically.` : '');
  }
  const runBtn = $('organizer-run-btn');
  if (runBtn) runBtn.style.display = '';
}

/**
 * Read the files the filename couldn't explain, using the receipt OCR that
 * already exists for the expense form. Bounded and sequential — this costs real
 * API calls, so it runs only on the files that need it.
 */
async function organizerReadUnclear() {
  const apiKey = TAX_CENTER.settings?.geminiKey || '';
  if (!apiKey) { showToast('⚠ Add a Gemini API key in Config first', 'err', 5000); return; }

  const todo = _organizerPlans.filter(p => p.needsOcr);
  if (!todo.length) { showToast('✓ Nothing needs reading — every file was understood from its name', 'ok'); return; }

  const btn = $('organizer-ocr-btn');
  const status = $('organizer-status');
  const oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; }

  const expenses = organizerCandidateExpenses();
  let read = 0;
  for (let i = 0; i < todo.length; i++) {
    const plan = todo[i];
    if (btn) btn.textContent = `Reading ${i + 1}/${todo.length}…`;
    if (status) status.textContent = `Reading ${plan.source.name}…`;
    try {
      const file = await plan.source.handle.getFile();
      const upload = await _prepareReceiptUpload(file);
      const out = await _callGeminiForReceipts(apiKey, [
        { text: _buildReceiptScanPrompt() },
        { inline_data: { mime_type: upload.mime, data: upload.base64 } },
      ], { schema: RECEIPT_SCAN_SCHEMA, maxOutputTokens: 2048 });
      const parsed = _parseReceiptJson(out?.text || '') || {};

      // Re-plan with what the file itself says, which usually turns an
      // unmatched file into a confident one.
      const enriched = {
        name: plan.source.name,
        date: parsed.date || '',
        vendor: parsed.vendor || parsed.merchant || parsed.desc || '',
        amount: Number(parsed.amount) || undefined,
        currency: parsed.currency || '',
        cat: parsed.category && TC_CATEGORIES.includes(parsed.category) ? parsed.category : '',
      };
      Object.assign(plan, planFile(enriched, expenses, TAX_CATEGORIES), { source: plan.source, ocr: true });
      read++;
    } catch (e) {
      console.warn('Could not read receipt', plan.source.name, e);
      plan.ocrFailed = true;
    }
  }

  if (btn) { btn.disabled = false; btn.textContent = oldText; }
  if (status) status.textContent = `Read ${read} of ${todo.length}.`;
  renderOrganizerTable();
}

function renderOrganizerTable() {
  const body = $('organizer-body');
  if (!body) return;
  if (!_organizerPlans.length) {
    body.innerHTML = '<div class="organizer-empty">Nothing to show yet.</div>';
    return;
  }

  body.innerHTML = `<table class="organizer-table"><thead><tr>
      <th>File</th><th>Goes to</th><th>Matched expense</th><th></th>
    </tr></thead><tbody>${_organizerPlans.map((p, i) => {
    const dest = p.meta.date && p.meta.cat
      ? `${escapeHtml(receiptFolderPath(p.meta).join(' › '))}<br><span class="organizer-name">${escapeHtml(receiptFileName({ ...p.meta, originalName: p.source.name }))}</span>`
      : '<span class="organizer-warn">Not enough information yet</span>';
    const matched = p.matched
      ? `${escapeHtml(p.match.desc || '')}<br><span class="organizer-why">${escapeHtml(p.reasons.join(', '))}</span>`
      : (p.ambiguous
        ? '<span class="organizer-warn">Matches more than one expense</span>'
        : '<span class="organizer-why">No match — filed by its own details</span>');
    return `<tr class="${p.needsReview ? 'needs-review' : ''}">
        <td><span class="organizer-src">${escapeHtml(p.source.name)}</span></td>
        <td>${dest}</td>
        <td>${matched}</td>
        <td><label class="organizer-skip"><input type="checkbox" ${p.skip ? 'checked' : ''} onchange="toggleOrganizerSkip(${i}, this.checked)"> Skip</label></td>
      </tr>`;
  }).join('')}</tbody></table>`;
}

function toggleOrganizerSkip(index, skip) {
  if (_organizerPlans[index]) _organizerPlans[index].skip = !!skip;
}

/**
 * Copy every planned file into a fresh destination folder.
 *
 * Copies — never moves. The source folder is left exactly as it was, so if the
 * result is wrong the owner still has everything, and can simply delete the new
 * folder and try again.
 */
async function runReceiptOrganizer() {
  const usable = _organizerPlans.filter(p => !p.skip && p.meta.date && p.meta.cat);
  if (!usable.length) {
    showToast('⚠ Nothing is ready to file yet — read the unclear ones first', 'warn', 5000);
    return;
  }

  const proceed = await confirmDialog(
    `Copy ${usable.length} receipt${usable.length === 1 ? '' : 's'} into a new, organized folder?\n\n`
    + 'Your existing folder is left exactly as it is — nothing is renamed, moved or deleted there. '
    + 'Choose an empty folder for the tidy copy.',
    { title: 'Tidy receipts into a new folder', okLabel: 'Choose destination…', cancelLabel: 'Cancel' }
  );
  if (!proceed) return;

  try {
    _organizerDest = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (e) {
    if (e?.name !== 'AbortError') showToast('Could not open that folder', 'err');
    return;
  }
  if (_organizerDest === _organizerSource) {
    showToast('⚠ Pick a different folder from the original', 'warn', 5000);
    return;
  }

  const btn = $('organizer-run-btn');
  const status = $('organizer-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Copying…'; }

  const manifest = [['Original file', 'New location', 'Date', 'Vendor', 'Category', 'Amount', 'Currency', 'Matched expense']];
  let copied = 0;
  let failed = 0;

  for (let i = 0; i < usable.length; i++) {
    const plan = usable[i];
    if (status) status.textContent = `Copying ${i + 1} of ${usable.length}…`;
    try {
      const file = await plan.source.handle.getFile();
      const segments = receiptFolderPath(plan.meta);
      let dir = _organizerDest;
      for (const seg of segments) dir = await dir.getDirectoryHandle(seg, { create: true });

      const desired = receiptFileName({ ...plan.meta, originalName: plan.source.name, mimeType: file.type });
      const filename = await uniqueFileName(desired, async (n) => {
        try { await dir.getFileHandle(n, { create: false }); return true; } catch (_) { return false; }
      });

      const handle = await dir.getFileHandle(filename, { create: true });
      const writable = await handle.createWritable();
      await writable.write(file);
      await writable.close();

      manifest.push([
        plan.source.name, [...segments, filename].join('/'), plan.meta.date,
        plan.meta.vendor || '', plan.meta.cat, String(plan.meta.amount ?? ''), plan.meta.currency || '',
        plan.matched ? (plan.match.desc || '') : '',
      ]);
      copied++;
    } catch (e) {
      console.error('Could not copy', plan.source.name, e);
      failed++;
    }
  }

  // A summary sheet next to the copies, so the result is auditable without
  // opening every file.
  try {
    const mHandle = await _organizerDest.getFileHandle('receipts-index.csv', { create: true });
    const w = await mHandle.createWritable();
    await w.write(new Blob([toCsv(manifest)], { type: 'text/csv' }));
    await w.close();
  } catch (e) {
    console.warn('Could not write the index', e);
  }

  if (btn) { btn.disabled = false; btn.textContent = '🗃 Copy into a tidy folder'; }
  if (status) status.textContent = '';
  closeReceiptOrganizer();
  showToast(
    failed
      ? `✓ Copied ${copied} receipt${copied === 1 ? '' : 's'} · ${failed} could not be copied · originals untouched`
      : `✓ Copied ${copied} receipt${copied === 1 ? '' : 's'} into "${_organizerDest.name}", sorted by year and category. Your original folder is unchanged.`,
    failed ? 'warn' : 'ok',
    7000
  );
}

/**
 * The receipts currently waiting in the cloud, oldest first, with everything the
 * viewer needs to describe each one.
 */
function cloudReceiptQueue(now = new Date()) {
  const rows = [];
  cloudReceiptOwners().forEach(({ exp, subfolder, scope }) => {
    // Both kinds, labelled — the owner needs to see that a Shippo label is a
    // link to someone else's file, not a receipt we hold.
    const ours = cloudReceiptRefs(exp);
    const links = externalLinkRefs(exp);
    const refs = [...ours, ...links];
    if (!refs.length) return;
    rows.push({
      id: String(exp.id || ''),
      desc: exp.desc || 'Expense',
      cat: exp.cat || 'Uncategorised',
      date: exp.date || '',
      amount: exp.origAmount ?? exp.amount ?? 0,
      currency: exp.origCurrency || exp.currency || 'CAD',
      book: scope === 'book' ? subfolder : '',
      urls: refs,
      waitingDays: receiptWaitingDays(exp, now),
      destination: describeDestination({
        date: exp.date,
        cat: exp.cat,
        book: scope === 'book' ? subfolder : '',
      }),
    });
  });
  return rows.sort((a, b) => b.waitingDays - a.waitingDays);
}

function receiptWaitingDays(exp, now = new Date()) {
  const raw = exp.receiptCloudAt || exp.date || '';
  if (!raw) return 0;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000));
}

/**
 * Show every receipt held outside the local folder, and say plainly which kind
 * each one is.
 *
 * The distinction is the point. A file in our own storage can be downloaded and
 * filed. A link to a Shippo label is somebody else's file: openable in a tab,
 * never downloadable, and not proof of payment in any case.
 */
function openCloudReceiptsModal() {
  const rows = cloudReceiptQueue();
  const modal = $('m-cloud-receipts');
  const body = $('cloud-receipts-body');
  const countEl = $('cloud-receipts-count');
  if (!modal || !body) return;

  let ourFiles = 0;
  for (const r of rows) {
    if (!r.urls) continue;
    for (const u of r.urls) {
      if (isOurCloudReceipt(u)) ourFiles++;
    }
  }
  let linked = 0;
  for (const r of rows) {
    if (!r.urls) continue;
    for (const u of r.urls) {
      if (isExternalLink(u)) linked++;
    }
  }

  if (countEl) {
    const bits = [];
    if (ourFiles) bits.push(`${ourFiles} stored file${ourFiles === 1 ? '' : 's'}`);
    if (linked) bits.push(`${linked} link${linked === 1 ? '' : 's'} to files on other websites`);
    countEl.textContent = bits.length ? bits.join(' · ') : 'Nothing stored outside your folder';
  }

  body.innerHTML = rows.length
    ? rows.map(r => {
      const links = r.urls.map((u, i) => {
        const external = isExternalLink(u);
        const label = r.urls.length > 1 ? `Open ${i + 1}` : 'Open';
        return `<a href="${escapeHtml(u)}" target="_blank" rel="noopener" class="cloud-receipt-open">${label}${external ? ' ↗' : ''}</a>`;
      }).join(' · ');

      const allExternal = r.urls.every(isExternalLink);
      const note = allExternal
        ? '<span class="cloud-receipt-external">On another website — can be opened, but not saved into your folder</span>'
        : `Will file into <strong>${escapeHtml(r.destination)}</strong>`;

      return `<div class="cloud-receipt-row">
        <div class="cloud-receipt-main">
          <div class="cloud-receipt-desc">${escapeHtml(r.desc)}</div>
          <div class="cloud-receipt-meta">${escapeHtml(r.date || '—')} · ${escapeHtml(r.cat)}${r.book ? ` · ${escapeHtml(r.book)}` : ''} · ${escapeHtml(fmt(r.amount, r.currency))}</div>
          <div class="cloud-receipt-dest">${note}</div>
        </div>
        <div class="cloud-receipt-side">${links}</div>
      </div>`;
    }).join('')
    : '<div class="cloud-receipt-empty">Every receipt is already filed in your folder.</div>';

  openM('cloud-receipts');
}

function closeCloudReceiptsModal() {
  closeM('cloud-receipts');
}


// ── RECEIPT CAPTURE ─────────────────────────────────────────────────────
// The dropzone, the email/Gmail receipt import, the AI scan and batch expense
// entry. Moved here in the step after the filing half, which is why the AI
// scanner no longer crosses the seam: the organiser calls it directly now.

// ── Receipt dropzone (expense form) — styled file chip + drag-and-drop.
// Reflects the chosen file into a chip and toggles the dropzone prompt. The
// underlying #exp-file input stays the single source of truth that
// submitExpense / scanProjectReceiptWithAI read from.
function expFileChosen() {
  const input = $('exp-file'), chip = $('exp-file-chip'), nameEl = $('exp-file-name'), dz = $('exp-dropzone');
  const hasFile = input && input.files && input.files.length > 0;
  if (nameEl && hasFile) nameEl.textContent = input.files[0].name;
  if (chip) chip.style.display = hasFile ? 'flex' : 'none';
  if (dz) dz.style.display = hasFile ? 'none' : 'flex';
}
function expFileClear(ev) {
  if (ev) ev.preventDefault();
  const input = $('exp-file');
  if (input) input.value = '';
  expFileChosen();
}
function expFileDragOver(ev) { ev.preventDefault(); const dz = $('exp-dropzone'); if (dz) dz.classList.add('drag'); }
function expFileDragLeave(ev) { ev.preventDefault(); const dz = $('exp-dropzone'); if (dz) dz.classList.remove('drag'); }
function expFileDrop(ev) {
  ev.preventDefault();
  const dz = $('exp-dropzone'); if (dz) dz.classList.remove('drag');
  const input = $('exp-file');
  if (input && ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length > 0) {
    try { input.files = ev.dataTransfer.files; } catch (e) { /* older browsers: ignore */ }
    expFileChosen();
  }
}

// Project-ledger receipt scan. The shared runner also fills category and ref,
// which this form has but the old 3-key prompt never asked for.
async function scanProjectReceiptWithAI() {
  return _runReceiptScan({
    fileId: 'exp-file', btnId: 'exp-ai-btn',
    descId: 'exp-desc', dateId: 'exp-date', amountId: 'exp-amount',
    curId: 'exp-cur', catId: 'exp-cat', refId: 'exp-ref'
  });
}

// ── EMAIL RECEIPT IMPORT
// Module-level draft store so we don't smuggle JSON through onclick attributes.
let _emailReceiptDrafts = [];
let _activeEmailImportTab = 'gmail';
let _gmailEmailsFetched = [];
let _gmailSearchMeta = null;
let _emailContentCache = {};
// Selection lived only in `:checked` DOM nodes, so re-rendering the list (a
// fresh search, a preset chip) silently wiped it. This is the source of truth;
// the checkbox `checked` state is just its rendering.
let _gmailSelectedIds = new Set();
// Receipts pushed in by the Gmail add-on (Firestore `emailReceiptInbox`).
let _emailInboxItems = [];
let _emailInboxSeen = null; // Set of seen ids; null until the first snapshot.

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
  // Format in LOCAL time. toISOString() converts to UTC, so any evening
  // timestamp ("2026-03-05 20:14") rolled forward a day west of Greenwich —
  // which then broke _findDuplicateExpense's exact date-string match and let
  // the same purchase import twice.
  if (!isNaN(d.getTime())) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
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
  _activeEmailImportTab = 'gmail';
  _gmailSelectedIds = new Set();
  _activeGmailPresetIdx = -1;
  _emailAttExcluded = {};
  _emailExtractCache = {};

  // Connection pill status
  const pill = $('email-account-pill');
  if (pill) {
    if (sheetsUrl) {
      pill.textContent = '● Gmail Connected';
      pill.className = 'pill green email-connected-pill';
    } else {
      pill.textContent = '○ Gmail Not Connected';
      pill.className = 'pill amber email-connected-pill';
    }
  }

  // Progressive category strip begins hidden until drafts exist
  const bulkCatBar = $('email-bulk-category-bar');
  if (bulkCatBar) bulkCatBar.style.display = 'none';

  // Reset tab to Gmail
  switchEmailImportTab('gmail');

  // Render Preset chips
  renderGmailChips();

  // Set default search query
  const queryInput = $('email-gmail-search-query');
  if (queryInput) {
    queryInput.value = 'newer_than:30d (subject:(receipt OR invoice OR bill OR order OR purchase OR payment) OR "receipt" OR "invoice" OR "payment")';
    // Enter-to-search: previously the only way to run a hand-edited query was
    // to click the Search button — the field itself did nothing on Enter.
    queryInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); searchGmailEmails(); } };
  }

  // Msg ids are immutable, so a previous search's results and downloaded
  // content are never stale — re-render them instead of paying for the whole
  // search + content fetch again every time the modal is reopened.
  if (_gmailEmailsFetched.length) {
    renderGmailEmailsList();
  } else {
    const listWrap = $('email-gmail-list-wrap');
    if (listWrap) {
      listWrap.innerHTML = `
        <div class="email-zero-state">
          <div class="email-zero-state-icon" aria-hidden="true">📭</div>
          <div class="email-zero-state-title">Ready to scan your inbox</div>
          <div class="email-zero-state-sub">Select a quick preset above (like <b>Past 30 Days</b>) or enter a supplier name to find recent expense receipts.</div>
        </div>`;
    }
  }

  const fileInput = $('email-receipt-files');
  const list = $('email-receipt-files-list');
  const dropzone = $('email-receipt-dropzone');
  if (fileInput) {
    fileInput.value = '';
    fileInput.onchange = () => {
      if (list) {
        const fs = Array.from(fileInput.files || []);
        list.innerHTML = fs.length
          ? fs.map(f => `• ${f.name} <span style="opacity:.6;">(${Math.round(f.size / 1024)} KB)</span>`).join('<br>')
          : '';
      }
      _updateEmailExtractButtonLabel();
    };

    if (dropzone) {
      dropzone.ondragover = (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--gold)'; };
      dropzone.ondragleave = () => { dropzone.style.borderColor = ''; };
      dropzone.ondrop = (e) => {
        e.preventDefault();
        dropzone.style.borderColor = '';
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          fileInput.files = e.dataTransfer.files;
          fileInput.dispatchEvent(new Event('change'));
        }
      };
    }
  }
  const sourceInput = $('email-receipt-source');
  if (sourceInput) sourceInput.oninput = () => _updateEmailExtractButtonLabel();

  _updateEmailExtractButtonLabel();

  // Surface anything the Gmail add-on has pushed in as ready-to-edit drafts.
  loadGmailInboxDrafts();
}

function closeEmailReceiptImportModal() {
  // Closing the modal must actually stop an in-flight extraction — otherwise
  // it keeps hitting Apps Script and Gemini against a hidden, orphaned UI.
  if (_emailExtractAbort) _emailExtractAbort.abort();
  const bulkCatBar = $('email-bulk-category-bar');
  if (bulkCatBar) bulkCatBar.style.display = 'none';
  closeM('email-receipt-import-modal');
}

// ── Gmail add-on inbox ───────────────────────────────────────────────
// The add-on writes draft expenses to Firestore `emailReceiptInbox`; we watch
// that collection live and feed items into the existing review/import flow.
function startEmailInboxWatcher() {
  if (isAuthor() || typeof window._fbWatchEmailInbox !== 'function') return;
  window._fbWatchEmailInbox(items => {
    _emailInboxItems = Array.isArray(items) ? items : [];
    const ids = new Set(_emailInboxItems.map(i => i._inboxId));
    // Only toast for items that landed after the first snapshot, so we don't
    // shout on every page load about a backlog the user already knows about.
    if (_emailInboxSeen) {
      const fresh = _emailInboxItems.filter(i => !_emailInboxSeen.has(i._inboxId));
      if (fresh.length) {
        showToast(`📥 ${fresh.length} receipt${fresh.length > 1 ? 's' : ''} sent from Gmail — open Import from Email to review`, 'ok', 6000);
      }
    }
    _emailInboxSeen = ids;
    updateEmailInboxBadge();
    // If the import modal is already open, refresh the loaded drafts live.
    const modal = $('m-email-receipt-import-modal');
    if (modal && modal.style.display !== 'none') loadGmailInboxDrafts();
  });
}

function updateEmailInboxBadge() {
  const badge = $('email-inbox-badge');
  if (!badge) return;
  const n = _emailInboxItems.length;
  badge.textContent = n ? String(n) : '';
  badge.style.display = n ? '' : 'none';
}

// Map an inbox doc to the editable-draft shape the import table expects.
function _inboxItemToDraft(item) {
  return {
    vendor: item.vendor || '',
    description: item.description || item.vendor || 'Email receipt',
    date: normalizeReceiptDate(item.date) || today(),
    amount: Number(item.amount || 0),
    currency: String(item.currency || 'CAD').toUpperCase().slice(0, 3),
    reference: item.reference || '',
    category: EXPENSE_CATEGORIES.includes(item.category)
      ? item.category
      : inferReceiptCategory(item.vendor, item.description),
    sourceSnippet: item.sourceSnippet || '',
    confidence: typeof item.confidence === 'number' ? item.confidence : 1,
    include: true,
    // Receipt file(s) the add-on uploaded to Firebase Storage.
    receipt: item.receipt || '',
    receiptUrls: Array.isArray(item.receiptUrls) ? item.receiptUrls : (item.receipt ? [item.receipt] : []),
    _inboxId: item._inboxId
  };
}

// Load add-on receipts into the import modal's draft table (with a banner).
// A live Firestore snapshot calls this on every change to the inbox queue —
// including while the user is mid-review of a Gemini extraction. It used to
// unconditionally overwrite _emailReceiptDrafts, silently discarding any
// edits to a batch that didn't come from the inbox queue.
function loadGmailInboxDrafts(force) {
  if (!_emailInboxItems.length) return;

  const hasUnsavedReview = !force && _emailReceiptDrafts.length > 0
    && _emailReceiptDrafts.some(d => !d._inboxId);
  if (hasUnsavedReview) {
    const wrap = $('email-receipt-results');
    if (wrap && !wrap.querySelector('[data-inbox-pending-banner]')) {
      const n = _emailInboxItems.length;
      const banner = document.createElement('div');
      banner.setAttribute('data-inbox-pending-banner', '1');
      banner.className = 'email-extract-summary';
      banner.innerHTML = `📥 ${n} new receipt${n > 1 ? 's' : ''} arrived from the Gmail add-on — `
        + `<button type="button" class="btn sm" onclick="loadGmailInboxDrafts(true)">Load them</button> (replaces the drafts below)`;
      wrap.prepend(banner);
    }
    return;
  }

  _emailReceiptDrafts = _emailInboxItems.map(_inboxItemToDraft);
  renderEmailReceiptDrafts(_emailReceiptDrafts);
  const wrap = $('email-receipt-results');
  if (wrap && !wrap.querySelector('[data-inbox-banner]')) {
    const banner = document.createElement('div');
    banner.setAttribute('data-inbox-banner', '1');
    banner.style.cssText = 'background:rgba(40,140,90,.08);border:1px solid rgba(40,140,90,.25);border-radius:var(--r2);padding:8px 12px;margin-bottom:10px;font-size:12px;color:var(--text2);line-height:1.5;';
    const n = _emailInboxItems.length;
    banner.innerHTML = `📥 <b>${n}</b> receipt${n > 1 ? 's' : ''} sent from the Gmail add-on. Review below and import — each imported row is cleared from the queue.`;
    wrap.prepend(banner);
  }
}

// Pull the receipt file(s) the Gmail add-on staged in Firebase Storage into the
// local receipts folder — the same place manually-attached email receipts go —
// and return the local:// path of the first one. Returns '' when no folder is
// connected, so the caller keeps the cloud URL as the receipt instead.
async function localizeInboxReceiptFiles(item) {
  if (typeof saveReceiptToLocalFile !== 'function') return '';
  const urls = (Array.isArray(item.receiptUrls) && item.receiptUrls.length)
    ? item.receiptUrls
    : (item.receipt && /^https?:/i.test(item.receipt) ? [item.receipt] : []);
  if (!urls.length) return '';

  const downloadedFiles = await Promise.all(urls.map(async (url) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      // Filename from the Storage object path: …/o/receipts%2Femail-imports%2F<id>%2F<name>?…
      let name = decodeURIComponent((url.split('/o/')[1] || '').split('?')[0] || '').split('/').pop();
      name = (name || 'receipt').replace(/[^a-zA-Z0-9.\-_]/g, '') || 'receipt';
      return { url, blob, name };
    } catch (_) {
      return null;
    }
  }));

  let firstLocal = '';
  for (const dl of downloadedFiles) {
    if (!dl) continue;
    const { url, blob, name } = dl;
    try {
      const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
      const local = await saveReceiptToLocalFile(file, 'email-imports');
      if (local) {
        if (!firstLocal) firstLocal = local;
        // The cloud copy was only a staging area — remove it now it's local.
        try { await window._fbDeleteReceipt(url); } catch (_) { }
      }
    } catch (_) { /* skip this file, keep going */ }
  }
  return firstLocal;
}

function switchEmailImportTab(tab) {
  _activeEmailImportTab = tab;
  const tabGmail = $('email-tab-gmail');
  const tabManual = $('email-tab-manual');
  const panelGmail = $('email-panel-gmail');
  const panelManual = $('email-panel-manual');
  if (tab === 'gmail') {
    tabGmail?.classList.add('active');
    tabManual?.classList.remove('active');
    if (panelGmail) panelGmail.style.display = 'block';
    if (panelManual) panelManual.style.display = 'none';
  } else {
    tabGmail?.classList.remove('active');
    tabManual?.classList.add('active');
    if (panelGmail) panelGmail.style.display = 'none';
    if (panelManual) panelManual.style.display = 'block';
  }
  _updateEmailExtractButtonLabel();
}

// Single source of truth for the quick-preset chips — this used to be
// copy-pasted into both renderGmailChips and applyGmailPresetQuery, so
// editing one without the other made a chip's label lie about its query.
const GMAIL_RECEIPT_PRESETS = [
  { icon: '🕒', label: 'Past 7 Days', query: 'newer_than:7d -from:me (subject:(receipt OR invoice OR bill OR order OR purchase OR payment) OR "receipt" OR "invoice" OR "payment")' },
  { icon: '📅', label: 'Past 30 Days', query: 'newer_than:30d -from:me (subject:(receipt OR invoice OR bill OR order OR purchase OR payment) OR "receipt" OR "invoice" OR "payment")' },
  { icon: '📎', label: 'With Attachments', query: 'newer_than:30d has:attachment -from:me (receipt OR invoice OR bill)' },
  { icon: '🧾', label: 'Invoices / Bills', query: '-from:me (subject:(receipt OR invoice OR bill OR payment OR order OR purchase OR confirmation) OR "receipt" OR "invoice" OR "payment")' },
  { icon: '📦', label: 'Shipping costs', query: '-from:me subject:(shipping OR postage OR label OR shippo OR ups OR fedex OR dhl OR tracking)' }
];
let _activeGmailPresetIdx = -1;

function renderGmailChips() {
  const chipsContainer = $('email-gmail-chips');
  if (!chipsContainer) return;
  chipsContainer.innerHTML = GMAIL_RECEIPT_PRESETS.map((p, idx) => {
    return `<button type="button" class="filter-chip${idx === _activeGmailPresetIdx ? ' active' : ''}" onclick="applyGmailPresetQuery(${idx})"><span aria-hidden="true">${p.icon}</span> ${escapeHtml(p.label)}</button>`;
  }).join('');
}

function applyGmailPresetQuery(index) {
  const p = GMAIL_RECEIPT_PRESETS[index];
  if (!p) return;
  _activeGmailPresetIdx = index;
  const input = $('email-gmail-search-query');
  if (input) input.value = p.query;
  document.querySelectorAll('#email-gmail-chips .filter-chip').forEach((chip, idx) => {
    chip.classList.toggle('active', idx === index);
  });
  searchGmailEmails();
}

async function searchGmailEmails() {
  if (!sheetsUrl) {
    showToast('Connect Google Sheets first to scan Gmail', 'warn');
    return;
  }
  if (!navigator.onLine) {
    showToast('Offline — reconnect to search Gmail. You can still use Paste & Upload.', 'warn');
    return;
  }
  const queryInput = $('email-gmail-search-query');
  const query = (queryInput?.value || '').trim();
  if (!query) {
    showToast('Please enter a search query', 'warn');
    return;
  }

  const btn = $('email-gmail-search-btn');
  const prevBtnText = btn ? btn.textContent : 'Search';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Searching…';
  }

  const listWrap = $('email-gmail-list-wrap');
  if (listWrap) {
    listWrap.innerHTML = `
      <div style="padding:40px 20px;text-align:center;">
        <div class="spinner" style="width:20px;height:20px;margin-bottom:12px;"></div>
        <div style="font-size:12px;color:var(--text3);">Searching Gmail inbox (Apps Script)…</div>
      </div>`;
  }

  // Apps Script reports its own errors as HTTP 200 + {error: ...} — that is a
  // deterministic failure (bad query, stale deployment) and retrying it three
  // times just burns ~3x the wait to show the exact same message. Only an
  // actual transport failure (network drop, 5xx) is worth retrying.
  const MAX_RETRIES = 2;
  let attempt = 0;
  let lastError = null;
  let data = null;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const destUrl = sheetsUrl + (sheetsUrl.includes('?') ? '&' : '?') + 'action=listReceiptEmails&limit=50&q=' + encodeURIComponent(query);
      const res = await fetch(destUrl, { method: 'GET', mode: 'cors' });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.retryable = res.status >= 500;
        throw err;
      }
      data = await res.json();
      if (!data || !data.ok) {
        const err = new Error(data?.error || 'Server returned failure');
        err.retryable = false;
        throw err;
      }
      break;
    } catch (err) {
      lastError = err;
      data = null;
      console.warn(`[searchGmailEmails] attempt ${attempt}/${MAX_RETRIES} failed:`, err);
      const isNetworkDrop = /failed to fetch|networkerror|load failed/i.test(err.message || '');
      if (attempt < MAX_RETRIES && (err.retryable || isNetworkDrop)) {
        if (listWrap) {
          listWrap.innerHTML = `
            <div style="padding:40px 20px;text-align:center;">
              <div class="spinner" style="width:20px;height:20px;margin-bottom:12px;"></div>
              <div style="font-size:12px;color:var(--text3);">Retrying… (${attempt}/${MAX_RETRIES})</div>
            </div>`;
        }
        await new Promise(r => setTimeout(r, 600));
      } else {
        break;
      }
    }
  }

  if (data && data.ok) {
    _gmailEmailsFetched = data.emails || [];
    // Capture which mailbox answered and how much it matched, so the UI can
    // prove the search actually reached Gmail (and which account's Gmail).
    _gmailSearchMeta = {
      account: data.account || '',
      query: data.query || query,
      threadsFound: typeof data.threadsFound === 'number' ? data.threadsFound : null,
      count: typeof data.count === 'number' ? data.count : _gmailEmailsFetched.length,
      skipped: typeof data.skipped === 'number' ? data.skipped : 0,
      skipError: data.skipError || ''
    };
    renderGmailEmailsList();
  } else {
    const msg = (lastError && lastError.message) ? lastError.message : String(lastError || 'Unknown error');
    // A raw "Failed to fetch" means the browser couldn't read a CORS response —
    // almost always an outdated or unauthorized Apps Script deployment rather
    // than a bad query. Point the user at the real fix instead of a vague hint.
    const isNetwork = /failed to fetch|networkerror|load failed|cors/i.test(msg);
    const hint = isNetwork
      ? 'The Apps Script didn\'t return a readable response. Re-deploy the latest <code>Code.gs</code> as a Web App (Execute as: <b>Me</b> · Who has access: <b>Anyone</b>) and authorize Gmail access when prompted, then try again.'
      : 'Check that the Apps Script Web App URL is correct and the latest code is deployed.';
    if (listWrap) {
      listWrap.innerHTML = `
        <div class="empty-state" style="padding:20px;color:var(--red);">
          ❌ Search failed: ${escapeHtml(msg)}<br>
          <span style="font-size:11px;color:var(--text3);margin-top:6px;display:block;">${hint}</span>
        </div>`;
    }
    showToast(isNetwork ? 'Gmail search failed: Re-deploy Apps Script' : 'Gmail search failed', 'err');
  }

  if (btn) {
    btn.disabled = false;
    btn.textContent = prevBtnText;
  }
}

function renderGmailEmailsList() {
  const listWrap = $('email-gmail-list-wrap');
  if (!listWrap) return;
  if (!_gmailEmailsFetched.length) {
    const meta = _gmailSearchMeta || {};
    const acct = meta.account ? escapeHtml(meta.account) : '';
    // Gmail matched threads but every one failed to read — an Apps Script
    // problem (usually a stale deployment), not an empty mailbox. Say so,
    // with the real error, instead of the misleading "no emails matched".
    const allSkipped = typeof meta.threadsFound === 'number' && meta.threadsFound > 0;
    const acctLine = allSkipped
      ? `Gmail matched <b>${meta.threadsFound}</b> conversation${meta.threadsFound > 1 ? 's' : ''}${acct ? ` in <b>${acct}</b>` : ''}, but none could be read.`
      : (acct
        ? `Searched the Gmail account <b>${acct}</b> — no emails matched.`
        : 'No matching emails found.');
    const hint = allSkipped
      ? `The deployed Apps Script hit an error on every email — copy the latest code from the <b>Connect your Google Sheet</b> tab and deploy a new version.${meta.skipError ? `<br>Error: <code>${escapeHtml(meta.skipError)}</code>` : ''}`
      : `If your receipts are in a different Google account, re-deploy the Apps Script from that account.
          Otherwise widen the window (try the <b>Past 30 Days</b> chip) or simplify the query.`;
    const q = meta.query ? escapeHtml(meta.query) : '';
    listWrap.innerHTML = `
      <div class="empty-state" style="padding:26px 20px;font-size:12px;color:var(--text3);text-align:center;line-height:1.6;">
        <span style="font-size:24px;display:block;margin-bottom:8px;">📭</span>
        ${acctLine}
        <span style="font-size:11px;display:block;margin-top:8px;">${hint}</span>
        ${q ? `<code style="font-size:10px;display:block;margin-top:8px;word-break:break-all;">${q}</code>` : ''}
      </div>`;
    return;
  }

  const importedMsgIds = new Set(
    (TAX_CENTER.businessExpenses || []).map(e => e.emailMsgId).filter(Boolean)
  );

  const esc = escapeHtml;
  const rowsHtml = _gmailEmailsFetched.map((email) => {
    const dateStr = new Date(email.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
    const attNames = Array.isArray(email.attachmentNames) ? email.attachmentNames : [];
    const attachmentBadge = email.hasAttachments
      ? `<span class="pill gray" style="font-size:10px;padding:1px 6px;" title="${esc(attNames.join(', '))}">📎 ${email.attachmentCount}</span>`
      : '—';

    const fromParts = (email.from || '').match(/^(.*?)\s*<.*>$/);
    const cleanFrom = fromParts ? fromParts[1].replace(/['"]/g, '').trim() : (email.from || 'Unknown');
    const isChecked = _gmailSelectedIds.has(email.id);
    const isImported = importedMsgIds.has(email.id);

    return `
      <tr class="email-list-row${isChecked ? ' selected' : ''}" id="email-row-${email.id}">
        <td class="email-list-cell" style="width:36px;text-align:center;">
          <input type="checkbox" class="gmail-email-cb" data-msg-id="${email.id}" ${isChecked ? 'checked' : ''} onchange="toggleEmailRowSelection('${email.id}', this.checked)">
        </td>
        <td class="email-list-cell" style="white-space:nowrap;color:var(--text3);font-size:11px;">${dateStr}</td>
        <td class="email-list-cell"><div class="email-sender" title="${esc(email.from || '')}">${esc(cleanFrom)}</div></td>
        <td class="email-list-cell">
          <div class="email-subject">${esc(email.subject || '(No subject)')}${isImported ? ' <span class="pill green" style="font-size:9px;padding:1px 5px;">imported</span>' : ''}</div>
          <div class="email-snippet" title="${esc(email.snippet || '')}">${esc(email.snippet || '')}</div>
        </td>
        <td class="email-list-cell" style="text-align:center;">${attachmentBadge}</td>
        <td class="email-list-cell" style="text-align:center;">
          <button type="button" class="btn sm" id="email-preview-btn-${email.id}" onclick="toggleEmailPreview('${email.id}')">Preview</button>
        </td>
      </tr>
      <tr id="email-preview-row-${email.id}" style="display:none;background:var(--cream3);">
        <td colspan="6" class="email-list-cell" style="padding:0;">
          <div class="email-preview-drawer" id="email-preview-drawer-${email.id}">
            <!-- populated dynamically -->
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const meta = _gmailSearchMeta || {};
  const shown = _gmailEmailsFetched.length;
  const moreNote = (typeof meta.threadsFound === 'number' && meta.threadsFound > shown) ? ` of ${meta.threadsFound} matched` : '';
  const skippedNote = meta.skipped ? ` · ${meta.skipped} unreadable` : '';
  const metaHeader = `
    <div class="email-list-meta-header">
      <span>✓ Searched ${meta.account ? `<b>${escapeHtml(meta.account)}</b>` : 'Gmail'}</span>
      <span style="white-space:nowrap;display:flex;align-items:center;gap:8px;">
        ${shown} shown${moreNote}${skippedNote}
        <button type="button" class="btn sm" onclick="searchGmailEmails()" title="Re-run this search to catch anything new">↻ Refresh</button>
      </span>
    </div>`;

  // Preserve scroll position across the rebuild — otherwise every checkbox
  // click that triggers a re-render (there are none today, but future ones)
  // and every re-search jumps back to row 1.
  const prevScroll = listWrap.scrollTop;

  listWrap.innerHTML = `
    ${metaHeader}
    <table class="email-list-table">
      <thead>
        <tr>
          <th style="width:36px;"><input type="checkbox" id="gmail-email-select-all" onchange="toggleAllGmailSelections(this.checked)"></th>
          <th style="width:64px;">Date</th>
          <th style="width:20%;">Sender</th>
          <th>Subject</th>
          <th style="width:56px;text-align:center;">Files</th>
          <th style="width:74px;text-align:center;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
  listWrap.scrollTop = prevScroll;
  _updateEmailExtractButtonLabel();
}

function toggleEmailRowSelection(msgId, isChecked) {
  if (isChecked) _gmailSelectedIds.add(msgId);
  else _gmailSelectedIds.delete(msgId);
  const row = $('email-row-' + msgId);
  if (row) row.classList.toggle('selected', isChecked);
  _updateEmailExtractButtonLabel();
}

function toggleAllGmailSelections(isChecked) {
  const checkboxes = document.querySelectorAll('.gmail-email-cb');
  checkboxes.forEach(cb => {
    cb.checked = isChecked;
    const msgId = cb.getAttribute('data-msg-id');
    toggleEmailRowSelection(msgId, isChecked);
  });
}

// Keeps the shared footer button honest about which tab's data it will act
// on and how many emails are selected, instead of a static "Extract drafts"
// that silently no-ops if the user is looking at the wrong tab.
function _updateEmailExtractButtonLabel() {
  const btn = $('email-receipt-scan-btn');
  if (!btn) return;
  if (_activeEmailImportTab === 'gmail') {
    const n = _gmailSelectedIds.size;
    btn.textContent = n ? `✨ Extract from ${n} email${n > 1 ? 's' : ''}` : '✨ Select emails to extract';
    btn.disabled = !n;
  } else {
    const pasted = ($('email-receipt-source')?.value || '').trim();
    const files = ($('email-receipt-files')?.files || []).length;
    btn.textContent = '✨ Extract from pasted text';
    btn.disabled = !pasted && !files;
  }
}

async function toggleEmailPreview(msgId) {
  const row = $('email-preview-row-' + msgId);
  const btn = $('email-preview-btn-' + msgId);
  if (!row || !btn) return;

  const isVisible = row.style.display !== 'none';
  if (isVisible) {
    row.style.display = 'none';
    btn.textContent = 'Preview';
  } else {
    row.style.display = '';
    btn.textContent = 'Close';

    const drawer = $('email-preview-drawer-' + msgId);
    if (drawer && !_emailContentCache[msgId]) {
      drawer.innerHTML = `
        <div style="padding:16px;text-align:center;">
          <div class="spinner" style="width:14px;height:14px;margin-bottom:6px;"></div>
          <div style="font-size:11px;color:var(--text3);">Fetching email contents &amp; attachments…</div>
        </div>`;

      try {
        const destUrl = sheetsUrl + (sheetsUrl.includes('?') ? '&' : '?') + 'action=getEmailContent&id=' + msgId;
        const res = await fetch(destUrl, { method: 'GET', mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data || !data.ok) throw new Error(data.error || 'Failed to fetch content');

        _emailContentCache[msgId] = data.email;
        renderEmailPreviewContent(msgId, drawer);
      } catch (err) {
        console.error('[toggleEmailPreview]', err);
        drawer.innerHTML = `<div style="padding:12px;color:var(--red);font-size:11px;">Error loading content: ${escapeHtml(err.message || err)}</div>`;
      }
    } else if (drawer) {
      renderEmailPreviewContent(msgId, drawer);
    }
  }
}

// Build a self-contained HTML receipt from an email that has no file
// attachment (e.g. an emailed HTML receipt like Anthropic/Stripe). Saving
// this means every imported expense gets a locally-viewable receipt in the
// ledger instead of showing "Missing".
function _emailBodyToReceiptFile(email, item) {
  const subject = email.subject || item.description || item.vendor || 'Email receipt';
  const meta = [
    email.from ? `From: ${email.from}` : '',
    email.date ? `Date: ${email.date}` : '',
    item.reference ? `Reference: ${item.reference}` : ''
  ].filter(Boolean).map(escapeHtml).join('<br>');
  const bodyHtml = escapeHtml(email.body || '').replace(/\n/g, '<br>');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:24px auto;padding:0 18px;color:#1a1a1a;line-height:1.5;}
h1{font-size:18px;margin:0 0 4px;}.meta{color:#666;font-size:12px;margin-bottom:18px;border-bottom:1px solid #ddd;padding-bottom:12px;}
.body{font-size:13px;white-space:normal;}</style></head>
<body><h1>${escapeHtml(subject)}</h1><div class="meta">${meta}</div><div class="body">${bodyHtml}</div></body></html>`;
  const nameBase = (item.vendor || subject || 'receipt')
    .replace(/[^a-zA-Z0-9.\-_ ]/g, '').trim().slice(0, 60) || 'receipt';
  return new File([html], `${nameBase}.html`, { type: 'text/html' });
}

// Per-message set of attachment indices the user has explicitly UNticked in
// the preview drawer. The drawer's DOM is destroyed every time it's closed
// and reopened, so without this store, unticking a fat irrelevant PDF and
// reopening the drawer silently re-armed it for the Gemini upload.
let _emailAttExcluded = {};

// Which of an email's PDF/image attachments are selected for scanning/saving.
// The preview drawer's checkboxes only exist once the drawer has been opened
// — so no checkboxes in the DOM means "all attachments", not "none".
// Otherwise the common select → extract flow (which never opens a preview)
// would silently drop every file.
function _selectedFileParts(msgId, email) {
  const all = (email && email.fileParts) || [];
  const boxes = Array.from(document.querySelectorAll(`.email-att-cb-${msgId}`));
  if (boxes.length) {
    return boxes
      .filter(cb => cb.checked)
      .map(cb => all[parseInt(cb.getAttribute('data-idx'))])
      .filter(Boolean);
  }
  const excluded = _emailAttExcluded[msgId];
  if (!excluded || !excluded.size) return all.slice();
  return all.filter((_, idx) => !excluded.has(idx));
}

function renderEmailPreviewContent(msgId, container) {
  const email = _emailContentCache[msgId];
  if (!email || !container) return;

  const esc = escapeHtml;
  const truncatedBody = email.body.length > 2500 ? email.body.substring(0, 2500) + '\n\n[TRUNCATED FOR PREVIEW]' : email.body;
  const excluded = _emailAttExcluded[msgId];

  let attachmentsHtml = '';
  if (email.fileParts && email.fileParts.length) {
    const listItems = email.fileParts.map((f, idx) => {
      const isDoc = f.mime === 'application/pdf';
      const typeLabel = isDoc ? 'PDF Document' : 'Image';
      const icon = isDoc ? '📄' : '🖼️';
      const isChecked = !(excluded && excluded.has(idx));
      return `
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:4px 0;padding:2px 0;">
          <input type="checkbox" class="email-att-cb-${msgId}" data-idx="${idx}" ${isChecked ? 'checked' : ''} onchange="_setEmailAttExcluded('${msgId}', ${idx}, !this.checked)" style="width:14px;height:14px;">
          <span style="font-family:'DM Mono',monospace;font-size:11px;">${icon} ${esc(f.name)} <span style="opacity:.6;font-size:10px;">(${typeLabel})</span></span>
        </label>
      `;
    }).join('');

    attachmentsHtml = `
      <div style="margin-top:10px;border-top:1px dashed var(--border);padding-top:8px;">
        <div style="font-weight:700;font-size:11px;margin-bottom:6px;color:var(--text2);">Include attachments in AI Scan (${email.fileParts.length}):</div>
        <div style="background:var(--surface-card);padding:6px 12px;border:1px solid var(--border2);border-radius:var(--r);max-height:100px;overflow-y:auto;">
          ${listItems}
        </div>
      </div>
    `;
  } else {
    attachmentsHtml = `<div style="margin-top:6px;font-size:10px;color:var(--text3);font-style:italic;">No PDF or image attachments found.</div>`;
  }

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:4px;">
      <div style="font-weight:700;font-size:11px;color:var(--text2);margin-bottom:4px;">Email Body Preview:</div>
      <div class="email-preview-body">${esc(truncatedBody)}</div>
      ${attachmentsHtml}
    </div>
  `;
}

function _setEmailAttExcluded(msgId, idx, isExcluded) {
  if (!_emailAttExcluded[msgId]) _emailAttExcluded[msgId] = new Set();
  if (isExcluded) _emailAttExcluded[msgId].add(idx);
  else _emailAttExcluded[msgId].delete(idx);
}

// Calls Gemini API to read a receipt/invoice and return its text response as a string.
// Accepts Gemini-style `parts` (e.g. `{ text }` and `{ inline_data: { mime_type, data } }`).
// Runs directly browser → Google API using the publisher's own key.
// Gemini 2.0 Flash and 2.0 Flash-Lite were retired on 2026-06-01 — keeping them
// in the fallback chain meant every escalation re-uploaded the whole payload to
// a model that could only fail.
const GEMINI_RECEIPT_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];

// Above this serialized size, don't probe the fallback chain — re-uploading
// megabytes to guess at a model costs far more than surfacing the error.
const GEMINI_SINGLE_ATTEMPT_BYTES = 2_000_000;

async function _callGeminiForReceipts(apiKey, parts, opts = {}) {
  const { signal, schema, maxOutputTokens = 8192 } = opts;

  // Serialize ONCE. This used to sit inside the per-attempt closure, so each
  // model and each retry re-stringified and re-uploaded the entire body.
  const generationConfig = {
    response_mime_type: 'application/json',
    temperature: 0.1,
    maxOutputTokens
  };
  if (schema) generationConfig.response_schema = schema;
  const body = JSON.stringify({ contents: [{ parts }], generationConfig });

  const models = body.length > GEMINI_SINGLE_ATTEMPT_BYTES
    ? GEMINI_RECEIPT_MODELS.slice(0, 1)
    : GEMINI_RECEIPT_MODELS;

  let lastErr;
  for (const model of models) {
    try {
      const send = () => fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal }
      );
      let res = await send();
      // Retry transient overload / rate-limit / server errors with exponential
      // backoff. A single flat 800ms retry lands right back inside the same
      // congestion window that caused the 429, so the attempt was mostly
      // wasted; jitter stops parallel email extractions from resonating.
      for (let attempt = 0; attempt < 2 && !res.ok && (res.status === 429 || res.status >= 500); attempt++) {
        const retryAfter = Number(res.headers?.get?.('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 8000)
          : (700 * Math.pow(2, attempt)) + Math.random() * 400;
        await new Promise(r => setTimeout(r, wait));
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        res = await send();
      }
      if (!res.ok) {
        let detail = `HTTP ${res.status} from ${model}`;
        // Escalating to another model only helps when THIS model is the
        // problem. A rejected key or a malformed payload fails identically on
        // every model, so probing the chain just re-uploads the image twice
        // more before showing the same error.
        let shouldStop = res.status === 400 || res.status === 401 || res.status === 403;
        try {
          const err = await res.json();
          if (err?.error?.message) {
            detail = err.error.message;
            if (res.status === 429 || /prepayment|credits|billing|quota|API key/i.test(detail)) {
              shouldStop = true;
            }
          }
        } catch (_) { }
        lastErr = new Error(detail);
        // `throw` here lands in this iteration's own catch below, which used to
        // record it as just another failed model and move on — so the
        // stop-on-billing/quota check never actually stopped anything and a
        // dead key still paid to upload the image three times. Mark it so the
        // catch re-throws instead of swallowing.
        if (shouldStop) { lastErr.__fatal = true; throw lastErr; }
        continue;
      }
      const data = await res.json();
      const cand = data.candidates?.[0];
      // Newer flash models emit a thought part first. Reading only parts[0].text
      // made a perfectly good answer look like a failure and escalated to the
      // next model — another full upload.
      const text = (cand?.content?.parts || [])
        .filter(p => p && p.text && !p.thought)
        .map(p => p.text)
        .join('')
        .trim();
      const finish = cand?.finishReason;
      if (finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') {
        lastErr = new Error(`Gemini stopped early (${finish})`);
        continue;
      }
      if (text) return { text, truncated: finish === 'MAX_TOKENS', model };
      lastErr = new Error(`Empty response from ${model}`);
    } catch (e) {
      // A cancel must never be mistaken for a model failure worth retrying.
      if (e && e.name === 'AbortError') throw e;
      // Nor an error every model in the chain would give identically.
      if (e && e.__fatal) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error('All Gemini models failed');
}

// Structured output beats prompt rules: `enum` stops a near-miss category like
// "Software" from being silently rerouted to Other, and NUMBER stops
// Number("1,234.56") -> NaN from silently dropping the row.
const RECEIPT_EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    receipts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          sourceSnippet: { type: 'STRING' },
          vendor: { type: 'STRING' },
          date: { type: 'STRING' },
          amount: { type: 'NUMBER' },
          currency: { type: 'STRING' },
          description: { type: 'STRING' },
          reference: { type: 'STRING' },
          category: { type: 'STRING', enum: EXPENSE_CATEGORIES },
          confidence: { type: 'NUMBER' }
        },
        required: ['vendor', 'date', 'amount', 'currency', 'category']
      }
    }
  },
  required: ['receipts']
};

// ── AI RECEIPT SCAN (single attached file → expense form)
// The two "✨ AI Scan" buttons used to be near-duplicate functions that read a
// phone photo straight to base64, asked for JSON in prose, then poked raw
// strings into strict `number`/`date` inputs. Everything below exists to fix
// one of those three steps.

// A phone capture is 4–12 MB and base64 adds ~33% on top, so the upload was
// the bulk of every scan's wall time — and anything over
// GEMINI_SINGLE_ATTEMPT_BYTES silently forfeited the model fallback chain too.
// 1600px on the long edge keeps receipt text comfortably legible for OCR while
// typically taking a 6 MB capture under 400 KB.
const RECEIPT_SCAN_MAX_EDGE = 1600;
const RECEIPT_SCAN_JPEG_QUALITY = 0.82;
// Under this, re-encoding costs more time than the smaller upload saves.
const RECEIPT_SCAN_SKIP_DOWNSCALE_BYTES = 220_000;
// A scan that never settles left the button reading "Scanning..." forever.
const RECEIPT_SCAN_TIMEOUT_MS = 45_000;

const RECEIPT_MIME_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf'
};

// Some Android pickers and share targets hand over a File with an empty
// `type`. That empty string went straight into `mime_type` and Gemini rejected
// the request outright.
function _receiptMimeFor(file) {
  if (file && file.type) return file.type;
  const ext = String(file?.name || '').split('.').pop().toLowerCase();
  return RECEIPT_MIME_BY_EXT[ext] || 'application/octet-stream';
}

function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    // The old scan awaited `reader.onload` alone. A read failure (file removed
    // from disk mid-scan, an iOS memory error, a revoked permission) never
    // settled that promise, so the whole scan hung with no error and no way
    // back except a reload.
    r.onload = () => {
      const s = String(r.result || '');
      const comma = s.indexOf(',');
      if (comma >= 0) resolve(s.slice(comma + 1));
      else reject(new Error('Could not read that file'));
    };
    r.onerror = () => reject(r.error || new Error('Could not read that file'));
    r.onabort = () => reject(new Error('File read cancelled'));
    r.readAsDataURL(file);
  });
}

// Returns { mime, base64, scaled, bytes }. Always resolves to *something*
// uploadable: every downscale failure path (HEIC on a browser that can't
// decode it, a canvas taint, an OOM on a huge scan) falls back to the
// original bytes rather than failing the scan.
async function _prepareReceiptUpload(file) {
  const mime = _receiptMimeFor(file);
  const raw = async () => ({ mime, base64: await _fileToBase64(file), scaled: false, bytes: file.size });
  if (!/^image\//.test(mime) || file.size <= RECEIPT_SCAN_SKIP_DOWNSCALE_BYTES) return raw();
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return raw();

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, RECEIPT_SCAN_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return raw();
    // Flatten onto white first: a PNG scan with an alpha channel composites
    // transparent pixels as BLACK on JPEG, which turns a white receipt into an
    // unreadable dark rectangle.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', RECEIPT_SCAN_JPEG_QUALITY));
    // Re-encoding an already-tight JPEG can come out bigger; never ship the
    // worse of the two.
    if (!blob || blob.size >= file.size) return raw();
    return { mime: 'image/jpeg', base64: await _fileToBase64(blob), scaled: true, bytes: blob.size };
  } catch (_) {
    return raw();
  } finally {
    try { bitmap?.close?.(); } catch (_) { /* not all browsers implement close */ }
  }
}

// Prompt-only "return strict JSON" was the root of most bad scans: the model
// fenced the output, added a preamble, returned "$1,234.56" as a string, or
// invented a category outside the ledger's list. A response schema makes the
// shape non-negotiable, so the regex salvage below is only a backstop.
const RECEIPT_SCAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    vendor: { type: 'STRING' },
    date: { type: 'STRING' },
    amount: { type: 'NUMBER' },
    currency: { type: 'STRING' },
    description: { type: 'STRING' },
    reference: { type: 'STRING' },
    category: { type: 'STRING', enum: EXPENSE_CATEGORIES },
    confidence: { type: 'NUMBER' },
    // Shipping receipts only. On a postage receipt the addressee's name and
    // the tracking number are the only things that also identify the website
    // order it paid for, and they appear nowhere but on the paper — so the
    // reader that is already looking at the document may as well lift them.
    shipRecipient: { type: 'STRING' },
    shipTracking: { type: 'STRING' }
  },
  required: ['vendor', 'date', 'amount', 'currency']
};

// "Extract these exact 4 keys" never said WHICH number to extract, so a
// receipt with a subtotal, tax line and total was a coin flip.
function _buildReceiptScanPrompt() {
  return `You are reading ONE receipt or invoice for a book publisher's bookkeeping. Return JSON matching the schema.

amount — the final grand total actually charged, including tax, tip and shipping. Never the subtotal, never a single line item, never the pre-discount figure. If the document shows "Balance due", "Amount paid", or "Total charged", use that number.
currency — ISO 4217, uppercase. Take an explicit code if printed. Otherwise infer from the symbol plus locale cues: "$" alongside GST/HST/QST or a Canadian address is CAD; "$" alongside a US state or "Sales Tax" is USD; "A$" is AUD; "£" is GBP; "€" is EUR. Only fall back to CAD when nothing at all indicates otherwise.
date — the purchase/transaction date as YYYY-MM-DD. Not the due date, print date, delivery date, or statement period. For an ambiguous NN/NN/YYYY, use the convention of the vendor's country.
vendor — the merchant being paid. Not the customer, and not the payment processor unless the processor is itself the merchant.
description — a short plain label for what was bought, 60 characters or less.
reference — the invoice, order, or receipt number if one is printed, otherwise "".
category — the single best fit from the allowed list.
confidence — 0 to 1, covering how certain you are of the amount and date together.
shipRecipient — ONLY on a shipping/postage receipt or label: the full name of the person the parcel is addressed TO. Never the sender, and never the publisher's own name or business name. Return "" on any other kind of receipt.
shipTracking — ONLY on a shipping/postage receipt or label: the tracking, article, or barcode number for the parcel, exactly as printed. Prefer a number labelled "Tracking Number", "Numéro de repérage", or "Article". Not the order number, not the authorization code, not the postage-paid or account number. Return "" if none is printed or on any other kind of receipt.

If the image is blurry, cropped, or partly unreadable, still return your best reading and set confidence below 0.4.`;
}

// A <select> silently ignores an assignment to a value it has no <option> for.
// `cur.value = 'AUD'` on the Tax Center form (CAD/USD/EUR/GBP only) therefore
// left the PREVIOUS currency selected and logged an Australian receipt as
// Canadian — a wrong number in the ledger with nothing on screen to hint at
// it. Report the mismatch instead of quietly getting the money wrong.
function _applyScanCurrency(el, code) {
  if (!el || !code) return null;
  const want = String(code).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  if (!want) return null;
  if (el.tagName === 'SELECT') {
    const match = Array.from(el.options).find(o => (o.value || o.textContent || '').trim().toUpperCase() === want);
    if (!match) return { ok: false, code: want };
    el.value = match.value || match.textContent.trim();
    return { ok: true, code: want };
  }
  el.value = want;
  return { ok: true, code: want };
}

function _applyScanCategory(el, category, vendor, description) {
  if (!el) return false;
  const cat = EXPENSE_CATEGORIES.includes(category)
    ? category
    : inferReceiptCategory(vendor, description);
  if (!cat) return false;
  const match = Array.from(el.options || []).find(o => (o.value || o.textContent || '').trim() === cat);
  if (!match) return false;
  el.value = match.value || match.textContent.trim();
  return true;
}

// Read ONE receipt file and return the parsed fields. The single "✨ AI Scan"
// buttons and the batch scanner all go through here, so a prompt or schema
// change lands on every screen at once — the same reason the two hand-written
// prompts were collapsed into one in the first place.
async function _extractReceiptFromFile(apiKey, file, opts = {}) {
  const { signal } = opts;
  const upload = await _prepareReceiptUpload(file);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const out = await _callGeminiForReceipts(apiKey, [
    { text: _buildReceiptScanPrompt() },
    { inline_data: { mime_type: upload.mime, data: upload.base64 } }
  ], {
    signal,
    schema: RECEIPT_SCAN_SCHEMA,
    // One receipt's JSON is a few hundred tokens; the old 8192 default let a
    // confused model ramble, which cost latency on every scan. Kept at 2048
    // rather than tighter because these flash models spend part of the
    // budget on thought parts before the answer.
    maxOutputTokens: 2048
  });

  return _parseReceiptJson(out?.text || '') || {};
}

/**
 * Re-open a receipt that is already filed, as a File the scanner can read.
 *
 * The scan path elsewhere always has a live <input type=file> to read from.
 * Re-reading a receipt logged weeks ago has no such input, so this walks the
 * same folder → cached-copy → URL ladder viewLocalReceipt() uses. Returns null
 * when the file cannot be found anywhere, so callers can say so plainly.
 */
async function loadReceiptFileForScan(receiptRef) {
  const ref = String(receiptRef || '').trim();
  if (!ref) return null;

  if (!ref.startsWith('local://')) {
    const res = await fetch(ref);
    if (!res.ok) throw new Error(`could not be downloaded (HTTP ${res.status})`);
    const blob = await res.blob();
    return new File([blob], ref.split('/').pop() || 'receipt', { type: blob.type || 'application/octet-stream' });
  }

  const path = ref.replace('local://', '');
  const dirHandle = await loadReceiptFolderHandle().catch(() => null);
  if (dirHandle) {
    try {
      const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
      if (permission === 'granted' || await dirHandle.requestPermission({ mode: 'readwrite' }) === 'granted') {
        const file = await resolveLocalReceiptFile(dirHandle, path);
        cacheReceiptFile(path, file);
        _noteReceiptFolderHealth(true);
        return file;
      }
    } catch (e) {
      console.warn('Receipt not reachable in folder, trying cached copy', e);
    }
  }

  const cached = await readCachedReceipt(path);
  if (cached?.blob) {
    _noteReceiptFolderHealth(false);
    return new File([cached.blob], path.split('/').pop() || 'receipt', {
      type: cached.blob.type || 'application/octet-stream',
    });
  }
  return null;
}

/**
 * Read the two things only a postage receipt carries: who it was posted to,
 * and the tracking number.
 *
 * Shares the receipt reader the expense form already uses, so there is one
 * prompt and one schema rather than a second one to drift out of step. The
 * caller decides what to do with the answer — nothing here writes to the
 * ledger, because a misread name must never link money on its own.
 */
async function readShippingFieldsFromReceipt(receiptRef, { signal } = {}) {
  const apiKey = TAX_CENTER.settings?.geminiKey || '';
  if (!apiKey) throw new Error('add your Gemini key in the Tax Centre config first');
  const file = await loadReceiptFileForScan(receiptRef);
  if (!file) throw new Error('the receipt file could not be opened from your folder');
  const parsed = await _extractReceiptFromFile(apiKey, file, { signal });
  return {
    recipient: String(parsed?.shipRecipient || '').trim(),
    tracking: String(parsed?.shipTracking || '').trim(),
    reference: String(parsed?.reference || '').trim(),
  };
}

// In-flight scan, so a second click cancels instead of hitting a dead button.
let _receiptScanAbort = null;

// Single implementation behind both "✨ AI Scan" buttons. `cfg` names the form
// field ids; everything else is shared so the two forms can't drift apart the
// way their two hand-written prompts did.
async function _runReceiptScan(cfg) {
  const fileInput = $(cfg.fileId);
  const btn = $(cfg.btnId);

  if (_receiptScanAbort) { _receiptScanAbort.abort(); return; }
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    showToast('⚠ Please attach a file first', 'warn');
    return;
  }

  const apiKey = TAX_CENTER.settings?.geminiKey
    || (cfg.keyId && $(cfg.keyId)?.value.trim())
    || '';
  if (!apiKey) { showToast('⚠ Gemini API Key required in Config', 'err'); return; }

  const file = fileInput.files[0];
  const oldText = btn ? btn.textContent : '';
  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ac.abort(); }, RECEIPT_SCAN_TIMEOUT_MS);
  _receiptScanAbort = ac;
  // Deliberately NOT disabled — a disabled button can't receive the cancel
  // click, which is how the old one became unrecoverable when a request hung.
  if (btn) btn.textContent = 'Scanning… (tap to cancel)';

  const shimmerFields = [cfg.descId, cfg.amountId, cfg.dateId, cfg.catId, cfg.curId]
    .map(id => id && $(id)).filter(Boolean);
  shimmerFields.forEach(el => el.classList.add('tc-field-shimmer'));

  try {
    const parsed = await _extractReceiptFromFile(apiKey, file, { signal: ac.signal });
    const applied = [];
    const warnings = [];

    const vendor = String(parsed.vendor || '').trim();
    const description = String(parsed.description || '').trim();
    const descEl = $(cfg.descId);
    if (descEl && (vendor || description)) {
      const both = vendor && description && !description.toLowerCase().includes(vendor.toLowerCase());
      descEl.value = both ? `${vendor} — ${description}` : (vendor || description);
      applied.push('vendor');
    }

    // Coerce before assigning: a number input rejects "1,234.56" outright and
    // becomes an EMPTY string, so a comma-formatted total used to wipe the
    // field and read as "the AI found nothing".
    const amount = _parseReceiptAmount(parsed.amount);
    const amtEl = $(cfg.amountId);
    if (amtEl && amount > 0) { amtEl.value = amount.toFixed(2); applied.push('amount'); }
    else warnings.push('amount');

    // Same trap for `type="date"`: "Mar 4, 2025" or "03/04/2025" silently
    // blanked the field.
    const date = normalizeReceiptDate(parsed.date);
    const dateEl = $(cfg.dateId);
    if (dateEl && date) { dateEl.value = date; applied.push('date'); }
    else warnings.push('date');

    const cur = _applyScanCurrency($(cfg.curId), parsed.currency);
    if (cur?.ok) applied.push('currency');
    else if (cur) warnings.push(`${cur.code} not available here`);

    // Only when there is something to categorise. inferReceiptCategory falls
    // back to "Other", so running it on an empty extraction would set a field
    // and make a scan that read nothing at all report partial success.
    const haveSubject = vendor || description || EXPENSE_CATEGORIES.includes(parsed.category);
    if (haveSubject && _applyScanCategory($(cfg.catId), parsed.category, vendor, description)) {
      applied.push('category');
    }

    const refEl = cfg.refId && $(cfg.refId);
    if (refEl && parsed.reference) { refEl.value = String(parsed.reference).trim(); applied.push('ref'); }

    // Writing `.value` fires nothing, so both forms' FX preview kept showing
    // the previous receipt's conversion until the user touched a field.
    for (const id of [cfg.curId, cfg.amountId, cfg.descId, cfg.dateId, cfg.catId, cfg.refId]) {
      const el = id && $(id);
      if (!el) continue;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.classList.add('tc-field-extracted');
      setTimeout(() => el.classList.remove('tc-field-extracted'), 2200);
    }

    if (!applied.length) {
      showToast('⚠ Could not read that receipt — try a sharper, straighter photo', 'err');
      return;
    }
    const conf = Number(parsed.confidence);
    const lowConf = Number.isFinite(conf) && conf > 0 && conf < 0.5;
    // The old blanket "✓ Receipt data extracted" fired even when three of four
    // fields were empty, which is exactly when the user needed to look.
    showToast(
      `✓ Read ${applied.join(', ')}${warnings.length ? ` · check ${warnings.join(', ')}` : ''}${lowConf ? ' · low confidence' : ''}`,
      (warnings.length || lowConf) ? 'warn' : 'ok',
      (warnings.length || lowConf) ? 4200 : 2800
    );
  } catch (e) {
    if (e && e.name === 'AbortError') {
      showToast(timedOut ? '⚠ Scan timed out — check your connection and retry' : 'Scan cancelled', 'warn');
    } else {
      console.error('AI Scan Error:', e);
      showToast(`⚠ AI extraction failed: ${e.message || e}`, 'err', 4200);
    }
  } finally {
    clearTimeout(timer);
    _receiptScanAbort = null;
    shimmerFields.forEach(el => el.classList.remove('tc-field-shimmer'));
    if (btn) { btn.textContent = oldText; btn.disabled = false; }
  }
}

// ── BATCH EXPENSE ENTRY
// One-at-a-time is the right shape for a single subscription charge. It is the
// wrong shape for coming home from a book fair with fourteen receipts in a
// pocket: fourteen trips through the form, fourteen scans, fourteen chances to
// lose one. Everything below is that same pile handled as one queue — drop them
// all in, scan them together, fix the few the reader got wrong, post once.

// Rows currently staged in the batch sheet. Addressed by `uid`, never by index:
// a scan finishing while the owner deletes a row would otherwise write the
// scanned values into whichever row slid up into that slot.
let _batchExpenseRows = [];
// 'business' = the Tax Centre operating ledger, 'project' = the active book's.
let _batchExpenseDest = 'business';
let _batchExpenseUid = 0;
// In-flight batch scan, so the button can cancel the whole run.
let _batchScanAbort = null;
// True while scanning or logging — blocks a second run over the same rows.
let _batchExpenseBusy = false;

const BATCH_EXPENSE_CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'MXN', 'JPY', 'CHF'];

// Receipts read in parallel. Three keeps a pile of a dozen moving without
// tripping Gemini's rate limiter — and a 429 costs more time than it saves,
// because the retry re-uploads the whole image.
const BATCH_SCAN_CONCURRENCY = 3;

/** Where a batch can currently be posted, in the order they're offered. */
function batchExpenseDestinations() {
  const out = [];
  // The Tax Centre ledger is publisher-only: saveTaxCenter() no-ops for an
  // author, so offering it would silently drop the whole batch.
  if (!isAuthor()) out.push({ id: 'business', label: 'Business ledger', sub: 'Tax Centre operating costs' });
  if (activeBook && getBook()) {
    out.push({ id: 'project', label: getBook().title || 'This book', sub: "This project's expense ledger" });
  }
  return out;
}

/** The currency a fresh row starts in for the current destination. */
function _batchExpenseDefaultCurrency() {
  if (_batchExpenseDest === 'project') {
    const book = getBook();
    if (book) return getBookCurrencyCode(book);
  }
  return (TAX_CENTER.settings?.baseCurrency || 'CAD').toUpperCase();
}

/**
 * The categories the batch offers for the current destination.
 *
 * The business side is deliberately the union of both lists. The Tax Centre's
 * own picker and TC_CATEGORIES have never quite agreed — the picker offers
 * "Sales Processing Fees", TC_CATEGORIES offers "Artist Royalties" — and the
 * AI reads receipts against EXPENSE_CATEGORIES. Offering only one of the three
 * means a correctly-read category silently lands in the row as blank.
 */
function _batchExpenseCategories() {
  if (_batchExpenseDest === 'project') return EXPENSE_CATEGORIES;
  return TC_CATEGORIES.concat(EXPENSE_CATEGORIES.filter(c => !TC_CATEGORIES.includes(c)));
}

/**
 * The currencies a row can be held in.
 *
 * The destination's own currency is always included: a book priced in a
 * currency outside the standard list would otherwise have no option to select,
 * and a <select> silently ignores a value it has no option for — so the row
 * would show, and log, whatever happened to be first in the list instead.
 */
function _batchExpenseCurrencies() {
  const own = _batchExpenseDefaultCurrency();
  return BATCH_EXPENSE_CURRENCIES.includes(own)
    ? BATCH_EXPENSE_CURRENCIES
    : [own, ...BATCH_EXPENSE_CURRENCIES];
}

function _batchExpenseNewRow(file) {
  return {
    uid: `bx${++_batchExpenseUid}`,
    file: file || null,
    fileName: file ? file.name : '',
    include: true,
    // ready → scanning → scanned | failed. 'manual' is a row typed by hand,
    // which has nothing to scan and must never be reported as a scan failure.
    status: file ? 'ready' : 'manual',
    error: '',
    confidence: null,
    vendor: '',
    description: '',
    date: today(),
    amount: '',
    currency: _batchExpenseDefaultCurrency(),
    // Only if it's still one of this ledger's categories — a remembered value
    // the dropdown has no option for would show blank and log as itself.
    category: _batchExpenseCategories().includes(localStorage.getItem('lastExpenseCategory'))
      ? localStorage.getItem('lastExpenseCategory')
      : '',
    reference: ''
  };
}

function _batchExpenseRow(uid) {
  return _batchExpenseRows.find(r => r.uid === uid) || null;
}

/**
 * The single description line a row will be logged under.
 * When the description already names the vendor ("Lulu print run") that string
 * is the more useful of the two, so it wins — repeating the vendor in front of
 * it only pads the ledger, and dropping it loses what was actually bought.
 */
function _batchExpenseDescription(row) {
  const vendor = String(row.vendor || '').trim();
  const desc = String(row.description || '').trim();
  if (vendor && desc && !desc.toLowerCase().includes(vendor.toLowerCase())) return `${vendor} — ${desc}`;
  return desc || vendor;
}

/**
 * Why a row looks like something already recorded, or ''.
 * 'ledger' — matches an expense already in the destination ledger.
 * 'batch'  — matches an earlier row in this same pile, which is what dropping
 *            the same photo in twice looks like.
 * Matched on date + amount + currency, the same test the email import uses.
 */
function _batchExpenseDuplicate(row) {
  const amount = Number(row.amount) || 0;
  if (!amount || !row.date) return '';
  const cur = String(row.currency || '').toUpperCase();

  const twin = _batchExpenseRows.find(r =>
    r !== row && r.include !== false &&
    r.date === row.date &&
    Math.abs((Number(r.amount) || 0) - amount) < 0.005 &&
    String(r.currency || '').toUpperCase() === cur
  );
  // Only the later of a matched pair is flagged, so a genuine pair of
  // identical charges doesn't light up both rows and read as four.
  if (twin && _batchExpenseRows.indexOf(twin) < _batchExpenseRows.indexOf(row)) return 'batch';

  if (_batchExpenseDest === 'business') {
    return _findDuplicateExpense({ date: row.date, amount, currency: cur }) ? 'ledger' : '';
  }
  const hit = (getState().expenses || []).some(e =>
    e.date === row.date &&
    Math.abs(((e.origAmount ?? e.amount) || 0) - amount) < 0.005 &&
    String(e.origCurrency || e.currency || '').toUpperCase() === cur
  );
  return hit ? 'ledger' : '';
}

function openBatchExpenseModal(dest) {
  // Reopening mid-run would clear the rows the running batch is still walking.
  if (_batchExpenseBusy) { showToast('⚠ The batch is still working — give it a moment', 'warn'); return; }
  const options = batchExpenseDestinations();
  if (!options.length) { showToast('⚠ Pick a book first', 'warn'); return; }
  _batchExpenseDest = options.some(o => o.id === dest) ? dest : options[0].id;
  _batchExpenseRows = [];
  const fileInput = $('bx-files');
  if (fileInput) fileInput.value = '';
  if ($('bx-trip')) $('bx-trip').value = '';
  _batchExpenseProgress(0, 0, '');
  renderBatchExpenseModal();
  // Esc and a backdrop tap route through closeM, not through the Cancel
  // button, so the abort has to hang off the close event or a cancelled modal
  // would leave a scan burning API calls against rows nobody can see.
  const overlay = $('m-batch-expense');
  if (overlay) overlay.addEventListener('modal-close', _onBatchExpenseModalClose, { once: true });
  openM('batch-expense');
}

function _onBatchExpenseModalClose() {
  if (_batchScanAbort) { _batchScanAbort.abort(); _batchScanAbort = null; }
}

function closeBatchExpenseModal() {
  if (_batchScanAbort) { _batchScanAbort.abort(); _batchScanAbort = null; }
  closeM('batch-expense');
}

/** Destination picker, trip field and category dropdown for the chosen ledger. */
function renderBatchExpenseModal() {
  const options = batchExpenseDestinations();
  const destWrap = $('bx-dest');
  if (destWrap) {
    // Built with DOM calls rather than an innerHTML template, because the one
    // value here that isn't ours is the book's own title. Going through
    // textContent means a title containing a quote or an angle bracket is
    // never markup at any point, instead of relying on an escape being applied
    // at every interpolation forever.
    destWrap.textContent = '';
    if (options.length < 2) {
      const one = options[0] || { label: '', sub: '' };
      const line = document.createElement('div');
      line.className = 'bx-dest-single';
      line.append('Logging to ');
      const name = document.createElement('strong');
      name.textContent = one.label;
      line.append(name, ` · ${one.sub}`);
      destWrap.append(line);
    } else {
      options.forEach(o => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bx-dest-btn' + (o.id === _batchExpenseDest ? ' active' : '');
        const label = document.createElement('span');
        label.className = 'bx-dest-label';
        label.textContent = o.label;
        const sub = document.createElement('span');
        sub.className = 'bx-dest-sub';
        sub.textContent = o.sub;
        btn.append(label, sub);
        btn.addEventListener('click', () => setBatchExpenseDest(o.id));
        destWrap.append(btn);
      });
    }
  }

  // Trips group a whole batch far more often than a single receipt — a fair,
  // a signing weekend — so it is asked once for the pile, not once per row.
  const tripWrap = $('bx-trip-wrap');
  if (tripWrap) tripWrap.style.display = _batchExpenseDest === 'business' ? '' : 'none';
  const tripList = $('bx-trip-options');
  if (tripList) {
    const trips = Array.from(new Set((TAX_CENTER.businessExpenses || []).map(e => e.trip).filter(Boolean)));
    tripList.innerHTML = trips.map(t => `<option value="${escapeHtml(t)}"></option>`).join('');
  }

  const bulkCat = $('bx-bulk-cat');
  if (bulkCat) {
    bulkCat.innerHTML = `<option value="">Set category…</option>`
      + _batchExpenseCategories().map(c => `<option>${escapeHtml(c)}</option>`).join('');
  }

  // Scanning needs a key, and an author has no Tax Centre to keep one in.
  const canScan = !!(TAX_CENTER.settings?.geminiKey) && !isAuthor();
  const scanBtn = $('bx-scan-btn');
  if (scanBtn) scanBtn.style.display = canScan ? '' : 'none';
  const scanHint = $('bx-scan-hint');
  if (scanHint) {
    scanHint.textContent = canScan
      ? 'Reads the vendor, date, total, currency and category off every receipt you added.'
      : 'Add a Gemini API key in the Tax Centre config to read receipts automatically.';
  }

  renderBatchExpenseRows();
}

function setBatchExpenseDest(dest) {
  if (_batchExpenseBusy) { showToast('⚠ Finish the batch first', 'warn'); return; }
  if (dest === _batchExpenseDest) return;
  _batchExpenseDest = dest;
  // The two ledgers keep money in different currencies and use different
  // category lists, so re-point anything still holding the old defaults.
  const fallbackCur = _batchExpenseDefaultCurrency();
  const cats = _batchExpenseCategories();
  _batchExpenseRows.forEach(r => {
    if (!r.currency) r.currency = fallbackCur;
    if (r.category && !cats.includes(r.category)) r.category = '';
  });
  renderBatchExpenseModal();
}

function _batchExpenseAddFiles(files) {
  const added = Array.from(files || []).filter(Boolean);
  if (!added.length) return;
  added.forEach(f => _batchExpenseRows.push(_batchExpenseNewRow(f)));
  renderBatchExpenseRows();
  showToast(`Added ${added.length} receipt${added.length > 1 ? 's' : ''}`);
}

function batchExpenseFilesChosen() {
  const input = $('bx-files');
  if (!input || !input.files) return;
  _batchExpenseAddFiles(input.files);
  // Cleared so re-picking the same file still fires `change` — the rows own
  // the File objects now, the input is only a doorway.
  input.value = '';
}
function batchExpenseDragOver(ev) { ev.preventDefault(); const dz = $('bx-dropzone'); if (dz) dz.classList.add('drag'); }
function batchExpenseDragLeave(ev) { ev.preventDefault(); const dz = $('bx-dropzone'); if (dz) dz.classList.remove('drag'); }
function batchExpenseDrop(ev) {
  ev.preventDefault();
  const dz = $('bx-dropzone'); if (dz) dz.classList.remove('drag');
  if (ev.dataTransfer && ev.dataTransfer.files) _batchExpenseAddFiles(ev.dataTransfer.files);
}

function batchExpenseAddBlankRow() {
  _batchExpenseRows.push(_batchExpenseNewRow(null));
  renderBatchExpenseRows();
  const el = document.querySelector(`[data-bx-uid="${_batchExpenseRows[_batchExpenseRows.length - 1].uid}"][data-bx-field="vendor"]`);
  if (el) el.focus();
}

function removeBatchExpenseRow(uid) {
  const row = _batchExpenseRow(uid);
  if (!row) return;
  if (row.status === 'scanning') { showToast('⚠ That receipt is still being read', 'warn'); return; }
  _batchExpenseRows = _batchExpenseRows.filter(r => r.uid !== uid);
  renderBatchExpenseRows();
}

function toggleAllBatchExpenses(on) {
  _batchExpenseRows.forEach(r => { r.include = !!on; });
  renderBatchExpenseRows();
}

function deselectDuplicateBatchExpenses() {
  let n = 0;
  // Snapshot first: unticking as we go changes what _batchExpenseDuplicate
  // sees for the rows after it, so a run of three copies would only lose one.
  const flagged = _batchExpenseRows.filter(r => r.include !== false && _batchExpenseDuplicate(r));
  flagged.forEach(r => { r.include = false; n++; });
  renderBatchExpenseRows();
  showToast(n ? `Deselected ${n} likely duplicate${n > 1 ? 's' : ''}` : 'No duplicates flagged', n ? 'ok' : 'warn');
}

/** Apply the toolbar's category (or date) to every selected row at once. */
function applyBatchExpenseBulk(field) {
  const src = field === 'date' ? $('bx-bulk-date') : $('bx-bulk-cat');
  const value = src?.value || '';
  if (!value) { showToast(`⚠ Choose a ${field === 'date' ? 'date' : 'category'} first`, 'warn'); return; }
  let n = 0;
  _batchExpenseRows.forEach(r => {
    if (r.include === false) return;
    if (field === 'date') r.date = value; else r.category = value;
    n++;
  });
  renderBatchExpenseRows();
  showToast(n ? `Applied to ${n} row${n > 1 ? 's' : ''}` : 'No rows selected', n ? 'ok' : 'warn');
}

const BATCH_STATUS_LABEL = {
  ready: '⏳ Not read yet',
  scanning: '✨ Reading…',
  scanned: '✓ Read',
  failed: '⚠ Could not read',
  manual: 'Typed in'
};

function _batchExpenseStatusCell(row) {
  const dup = _batchExpenseDuplicate(row);
  const conf = Number(row.confidence);
  const bits = [`<span class="bx-status bx-status-${row.status}">${BATCH_STATUS_LABEL[row.status] || ''}</span>`];
  if (row.status === 'scanned' && Number.isFinite(conf) && conf > 0 && conf < 0.5) {
    bits.push(`<span class="bx-flag">low confidence — check the total</span>`);
  }
  if (dup === 'ledger') bits.push(`<span class="bx-flag bx-flag-warn">already in the ledger</span>`);
  if (dup === 'batch') bits.push(`<span class="bx-flag bx-flag-warn">same as a row above</span>`);
  if (row.error) bits.push(`<span class="bx-flag bx-flag-bad">${escapeHtml(row.error)}</span>`);
  return bits.join('');
}

function renderBatchExpenseRows() {
  const wrap = $('bx-rows');
  if (!wrap) return;
  const rows = _batchExpenseRows;

  if (!rows.length) {
    wrap.innerHTML = `<div class="empty-state bx-empty">Nothing staged yet. Drop your receipts above, or add a row to type one in by hand.</div>`;
    _updateBatchExpenseSummary();
    return;
  }

  const cats = _batchExpenseCategories();
  const catOptions = (sel) => `<option value="">Category…</option>`
    + cats.map(c => `<option${c === sel ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
  const currencies = _batchExpenseCurrencies();
  const curOptions = (sel) => (currencies.includes(sel) ? currencies : [sel, ...currencies])
    .filter(Boolean)
    .map(c => `<option${c === sel ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');

  wrap.innerHTML = `
    <div class="tbl-wrap bx-tbl-wrap">
      <table class="tbl bx-tbl">
        <thead><tr>
          <th class="bx-col-check"></th>
          <th>Receipt</th><th>Date</th><th>Vendor / what it was</th><th>Category</th><th>Ref</th>
          <th class="r bx-col-amount">Amount</th><th class="bx-col-actions"></th>
        </tr></thead>
        <tbody>
        ${rows.map(r => `
          <tr data-bx-row="${r.uid}"${_batchExpenseDuplicate(r) ? ' class="bx-dup"' : ''}>
            <td class="bx-col-check"><input type="checkbox" data-bx-include="${r.uid}" ${r.include !== false ? 'checked' : ''} aria-label="Include this expense"></td>
            <td class="bx-cell-file">
              <div class="bx-fname" title="${escapeHtml(r.fileName || 'No receipt attached')}">${r.file ? `🧾 ${escapeHtml(r.fileName)}` : '<span class="bx-nofile">no receipt</span>'}</div>
              <div class="bx-status-wrap" data-bx-status="${r.uid}">${_batchExpenseStatusCell(r)}</div>
            </td>
            <td><input type="date" data-bx-uid="${r.uid}" data-bx-field="date" value="${escapeHtml(r.date || '')}" aria-label="Date"></td>
            <td class="bx-cell-desc">
              <input type="text" data-bx-uid="${r.uid}" data-bx-field="vendor" value="${escapeHtml(r.vendor || '')}" placeholder="Vendor" aria-label="Vendor">
              <input type="text" data-bx-uid="${r.uid}" data-bx-field="description" value="${escapeHtml(r.description || '')}" placeholder="What it was" aria-label="Description">
            </td>
            <td><select data-bx-uid="${r.uid}" data-bx-field="category" aria-label="Category">${catOptions(r.category)}</select></td>
            <td><input type="text" data-bx-uid="${r.uid}" data-bx-field="reference" value="${escapeHtml(r.reference || '')}" placeholder="—" aria-label="Reference"></td>
            <td class="r bx-cell-amount">
              <select data-bx-uid="${r.uid}" data-bx-field="currency" aria-label="Currency">${curOptions(r.currency)}</select>
              <input type="number" step="0.01" min="0" data-bx-uid="${r.uid}" data-bx-field="amount" value="${r.amount === '' ? '' : escapeHtml(String(r.amount))}" placeholder="0.00" aria-label="Amount">
            </td>
            <td class="bx-col-actions">
              ${r.file ? `<button class="btn sm" type="button" title="Read this receipt again" aria-label="Read this receipt again" onclick="rescanBatchExpenseRow('${r.uid}')">✨</button>` : ''}
              <button class="btn sm" type="button" title="Remove this row" aria-label="Remove this row" onclick="removeBatchExpenseRow('${r.uid}')">🗑️</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  wrap.querySelectorAll('[data-bx-field]').forEach(el => {
    el.addEventListener('change', () => {
      const row = _batchExpenseRow(el.getAttribute('data-bx-uid'));
      if (!row) return;
      const field = el.getAttribute('data-bx-field');
      let v = el.value;
      if (field === 'currency') v = String(v).toUpperCase();
      if (field === 'date') v = normalizeReceiptDate(v) || v;
      row[field] = v;
      // Editing a row is how a wrongly-flagged duplicate gets cleared, and how
      // a mistyped amount creates a new one — so the flags follow every edit.
      row.error = '';
      _repaintBatchExpenseStatuses();
      _updateBatchExpenseSummary();
    });
  });
  wrap.querySelectorAll('[data-bx-include]').forEach(cb => {
    cb.addEventListener('change', () => {
      const row = _batchExpenseRow(cb.getAttribute('data-bx-include'));
      if (row) row.include = !!cb.checked;
      _repaintBatchExpenseStatuses();
      _updateBatchExpenseSummary();
    });
  });

  _updateBatchExpenseSummary();
}

/**
 * Refresh only the status/flag cells and the duplicate tint.
 * A full re-render here would throw away whatever the owner is mid-way through
 * typing in another row, which is exactly when a scan tends to land.
 */
function _repaintBatchExpenseStatuses() {
  _batchExpenseRows.forEach(row => {
    const cell = document.querySelector(`[data-bx-status="${row.uid}"]`);
    if (cell) cell.innerHTML = _batchExpenseStatusCell(row);
    const tr = document.querySelector(`[data-bx-row="${row.uid}"]`);
    if (tr) tr.classList.toggle('bx-dup', !!_batchExpenseDuplicate(row));
  });
}

/** Push a scanned row's values back into its inputs without redrawing the table. */
function _paintBatchExpenseRow(row) {
  const set = (field, value) => {
    const el = document.querySelector(`[data-bx-uid="${row.uid}"][data-bx-field="${field}"]`);
    if (!el) return;
    // A <select> silently ignores a value it has no <option> for, which is how
    // an AUD receipt used to end up logged as Canadian. Leave the field alone
    // and let the row's own warning say so instead.
    if (el.tagName === 'SELECT' && !Array.from(el.options).some(o => (o.value || o.textContent).trim() === value)) return;
    el.value = value;
  };
  set('date', row.date || '');
  set('vendor', row.vendor || '');
  set('description', row.description || '');
  set('category', row.category || '');
  set('reference', row.reference || '');
  set('currency', row.currency || '');
  set('amount', row.amount === '' ? '' : String(row.amount));
  _repaintBatchExpenseStatuses();
  _updateBatchExpenseSummary();
}

/** Selected-row count and per-currency totals, so the pile can be sanity-checked. */
function _updateBatchExpenseSummary() {
  const el = $('bx-summary');
  const submit = $('bx-submit-btn');
  const selected = _batchExpenseRows.filter(r => r.include !== false);
  const totals = {};
  selected.forEach(r => {
    const amt = Number(r.amount) || 0;
    if (!amt) return;
    const cur = String(r.currency || '').toUpperCase() || _batchExpenseDefaultCurrency();
    totals[cur] = (totals[cur] || 0) + amt;
  });
  // Currency code spelled out: two of these share a "$", and a batch summary
  // that reads "$340.19 + $55.00" hides which pile is which.
  const parts = Object.keys(totals).sort().map(c => `${fmt(totals[c], c)} ${c}`);
  if (el) {
    el.textContent = selected.length
      ? `${selected.length} selected${parts.length ? ` · ${parts.join(' + ')}` : ''}`
      : 'Nothing selected';
  }
  if (submit) {
    submit.disabled = !selected.length || _batchExpenseBusy;
    if (!_batchExpenseBusy) {
      submit.textContent = selected.length
        ? `Log ${selected.length} expense${selected.length > 1 ? 's' : ''}`
        : 'Log expenses';
    }
  }
  const unscanned = _batchExpenseRows.filter(r => r.file && r.status !== 'scanned').length;
  const scanBtn = $('bx-scan-btn');
  if (scanBtn && !_batchExpenseBusy) {
    scanBtn.textContent = unscanned ? `✨ AI Scan ${unscanned} receipt${unscanned > 1 ? 's' : ''}` : '✨ AI Scan';
    scanBtn.disabled = !unscanned;
  }
}

function _batchExpenseProgress(done, total, label) {
  const wrap = $('bx-progress');
  const bar = $('bx-progress-bar');
  const text = $('bx-progress-text');
  if (!wrap) return;
  if (total <= 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  if (bar) bar.style.width = `${Math.round((done / total) * 100)}%`;
  if (text) text.textContent = `${label} ${done} of ${total}`;
}

/** Copy one Gemini reading onto a row, keeping whatever it couldn't determine. */
function _applyBatchScanResult(row, parsed) {
  const vendor = String(parsed.vendor || '').trim();
  const description = String(parsed.description || '').trim();
  const amount = _parseReceiptAmount(parsed.amount);
  const date = normalizeReceiptDate(parsed.date);
  const warn = [];

  if (vendor) row.vendor = vendor;
  if (description) row.description = description;
  if (amount > 0) row.amount = amount.toFixed(2); else warn.push('amount');
  if (date) row.date = date; else warn.push('date');

  const want = String(parsed.currency || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  if (want && _batchExpenseCurrencies().includes(want)) row.currency = want;
  else if (want) warn.push(`currency (${want})`);

  const cats = _batchExpenseCategories();
  const cat = cats.includes(parsed.category) ? parsed.category : inferReceiptCategory(vendor, description);
  if (cat && cats.includes(cat)) row.category = cat;

  if (parsed.reference) row.reference = String(parsed.reference).trim();

  const conf = Number(parsed.confidence);
  row.confidence = Number.isFinite(conf) ? conf : null;
  // Nothing usable came back at all — say so on the row rather than leaving it
  // looking scanned-and-empty, which reads as "the receipt had no total".
  if (!vendor && !description && amount <= 0 && !date) {
    row.status = 'failed';
    row.error = 'Nothing readable — try a sharper photo, or type it in';
    return;
  }
  row.status = 'scanned';
  row.error = warn.length ? `check ${warn.join(', ')}` : '';
}

async function scanAllBatchExpenses(force) {
  if (_batchScanAbort) { _batchScanAbort.abort(); return; }
  const targets = _batchExpenseRows.filter(r => r.file && (force || r.status !== 'scanned'));
  if (!targets.length) { showToast('⚠ No receipts left to read', 'warn'); return; }

  const apiKey = TAX_CENTER.settings?.geminiKey || '';
  if (!apiKey) { showToast('⚠ Gemini API Key required in Config', 'err'); return; }

  const btn = $('bx-scan-btn');
  const ac = new AbortController();
  _batchScanAbort = ac;
  _batchExpenseBusy = true;
  // A whole pile takes as long as it takes, so the only bound worth having is
  // the owner's — the button stays live so it can cancel.
  if (btn) { btn.textContent = 'Reading… (tap to cancel)'; btn.disabled = false; }

  targets.forEach(r => { r.status = 'scanning'; r.error = ''; });
  _repaintBatchExpenseStatuses();

  let done = 0;
  _batchExpenseProgress(0, targets.length, 'Read');

  try {
    const results = await _runExtractionPool(targets, BATCH_SCAN_CONCURRENCY, async (row) => {
      const parsed = await _extractReceiptFromFile(apiKey, row.file, { signal: ac.signal });
      _applyBatchScanResult(row, parsed);
      _paintBatchExpenseRow(row);
      _batchExpenseProgress(++done, targets.length, 'Read');
      return true;
    });

    const failed = results.filter(r => r && !r.ok);
    failed.forEach(r => {
      r.item.status = 'failed';
      r.item.error = (r.error?.message || 'Could not read this one').slice(0, 90);
    });
    _repaintBatchExpenseStatuses();

    const ok = targets.length - failed.length;
    showToast(
      failed.length
        ? `Read ${ok} of ${targets.length} — ${failed.length} need${failed.length > 1 ? '' : 's'} typing in by hand`
        : `✓ Read all ${ok} receipt${ok > 1 ? 's' : ''} — check the totals before logging`,
      failed.length ? 'warn' : 'ok',
      failed.length ? 5200 : 3600
    );
  } catch (e) {
    if (e && e.name === 'AbortError') {
      // Rows still queued behind the cancel never got a reading; put them back
      // rather than leaving them stuck reading forever.
      _batchExpenseRows.forEach(r => { if (r.status === 'scanning') r.status = 'ready'; });
      _repaintBatchExpenseStatuses();
      showToast('Scan cancelled', 'warn');
    } else {
      console.error('Batch scan error:', e);
      showToast(`⚠ AI scan failed: ${e.message || e}`, 'err', 4200);
    }
  } finally {
    _batchScanAbort = null;
    _batchExpenseBusy = false;
    _batchExpenseProgress(0, 0, '');
    if (btn) btn.disabled = false;
    _updateBatchExpenseSummary();
  }
}

async function rescanBatchExpenseRow(uid) {
  const row = _batchExpenseRow(uid);
  if (!row || !row.file) return;
  if (_batchScanAbort) { showToast('⚠ A scan is already running', 'warn'); return; }
  const apiKey = TAX_CENTER.settings?.geminiKey || '';
  if (!apiKey) { showToast('⚠ Gemini API Key required in Config', 'err'); return; }

  const ac = new AbortController();
  _batchScanAbort = ac;
  row.status = 'scanning'; row.error = '';
  _repaintBatchExpenseStatuses();
  try {
    _applyBatchScanResult(row, await _extractReceiptFromFile(apiKey, row.file, { signal: ac.signal }));
    _paintBatchExpenseRow(row);
  } catch (e) {
    row.status = 'failed';
    row.error = (e && e.name === 'AbortError') ? 'Cancelled' : String(e?.message || e).slice(0, 90);
    _repaintBatchExpenseStatuses();
  } finally {
    _batchScanAbort = null;
  }
}

/** Warm every rate the batch will need in one go, instead of one await per row. */
async function _warmBatchExpenseRates(currencies, target) {
  const to = String(target || 'CAD').toUpperCase();
  const needed = Array.from(new Set(currencies.map(c => String(c || to).toUpperCase())))
    .filter(c => c !== to && !_fxRateCache[`${c}_${to}`]);
  if (!needed.length) return;
  await Promise.all(needed.map(c => fetchLiveRate(c, to).catch(() => null)));
}

async function submitBatchExpenses() {
  if (_batchExpenseBusy) { showToast('⚠ Still working — hang on', 'warn'); return; }
  const rows = _batchExpenseRows.filter(r => r.include !== false);
  if (!rows.length) { showToast('⚠ Nothing selected to log', 'warn'); return; }

  // An expense with no amount or no name is one the owner can't find again.
  // Refuse the batch and point at the rows rather than quietly dropping them.
  const invalid = rows.filter(r => !(Number(r.amount) > 0) || !_batchExpenseDescription(r));
  if (invalid.length) {
    invalid.forEach(r => { r.error = 'Needs a description and an amount'; });
    _repaintBatchExpenseStatuses();
    showToast(`⚠ ${invalid.length} row${invalid.length > 1 ? 's need' : ' needs'} a description and an amount`, 'warn', 4600);
    return;
  }

  const dupes = rows.filter(r => _batchExpenseDuplicate(r) === 'ledger');
  if (dupes.length) {
    const proceed = await confirmDialog(
      `${dupes.length} of these already look like expenses in your ledger (same date, same amount). Log them again anyway?`,
      { title: 'Possible duplicates', okLabel: 'Log them all', cancelLabel: 'Let me deselect them' }
    );
    if (!proceed) return;
  }

  _batchExpenseBusy = true;
  const submit = $('bx-submit-btn');
  if (submit) { submit.disabled = true; submit.textContent = 'Logging…'; }
  let posted;
  try {
    posted = _batchExpenseDest === 'business'
      ? await _postBatchToBusinessLedger(rows)
      : await _postBatchToProjectLedger(rows);
  } catch (e) {
    // Anything the per-row handling didn't catch — a failed ledger write, a
    // dead connection. The rows stay staged so the batch can be retried
    // rather than retyped from the receipts all over again.
    console.error('Batch expense logging failed:', e);
    reportClientError('batch-expense-log-failed', e && e.message, { stack: e && e.stack });
    _batchExpenseBusy = false;
    _batchExpenseProgress(0, 0, '');
    renderBatchExpenseRows();
    showToast('⚠ Could not log this batch — nothing was lost, try again', 'err', 6000);
    return;
  }
  _batchExpenseBusy = false;

  const bits = [];
  if (posted.logged) bits.push(`✓ Logged ${posted.logged} expense${posted.logged > 1 ? 's' : ''}${posted.pending ? ' for approval' : ''}`);
  if (posted.failed) bits.push(`${posted.failed} could not be saved`);
  showToast(bits.join(' · ') || 'Nothing logged', posted.failed ? 'err' : 'ok', posted.failed ? 6000 : 3200);

  // Receipts are the part an accountant asks for, so never let a "✓ Logged"
  // imply they all landed. The expenses are in either way — say which ones
  // still need a file, and where to attach it.
  if (posted.receiptsLost) {
    showToast(
      `⚠ ${posted.receiptsLost} receipt${posted.receiptsLost > 1 ? 's' : ''} could not be saved — the expense${posted.receiptsLost > 1 ? 's are' : ' is'} logged, attach the file from the ledger row`,
      'err', 7000
    );
  }

  if (posted.failed) {
    // Keep only what didn't make it, so a retry can't double-post the rest.
    _batchExpenseRows = _batchExpenseRows.filter(r => posted.failedUids.has(r.uid));
    _batchExpenseProgress(0, 0, '');
    renderBatchExpenseRows();
    if (submit) submit.disabled = false;
    return;
  }
  _batchExpenseProgress(0, 0, '');
  closeBatchExpenseModal();
}

/** Post the batch into the Tax Centre's operating ledger. Publisher only. */
async function _postBatchToBusinessLedger(rows) {
  const base = (TAX_CENTER.settings?.baseCurrency || 'CAD').toUpperCase();
  await _warmBatchExpenseRates(rows.map(r => r.currency), base);

  if (!TAX_CENTER.businessExpenses) TAX_CENTER.businessExpenses = [];
  const trip = ($('bx-trip')?.value || '').trim();
  let logged = 0, receiptsLost = 0, done = 0;
  const entries = [];
  // One base per batch plus the row's own offset. A bare Date.now() per row
  // collides whenever two saves land in the same millisecond, and every ledger
  // action — edit, delete, attach a receipt — addresses a row by this id.
  const idBase = Date.now() + Math.floor(Math.random() * 100000);

  for (const row of rows) {
    _batchExpenseProgress(done, rows.length, 'Logged');
    const currency = String(row.currency || base).toUpperCase();
    const amount = Number(row.amount) || 0;
    const desc = _batchExpenseDescription(row);
    const cat = row.category || 'Other';

    let receipt = '';
    if (row.file) {
      const saved = await saveReceiptBestEffort(row.file, 'General', { date: row.date, desc, cat, amount, currency });
      receipt = saved.ref;
      if (saved.storage === 'none') receiptsLost++;
      else if (saved.storage === 'cloud') row._cloud = true;
    }

    const fxRate = currency === base ? 1 : (_fxRateCache[`${currency}_${base}`] || 1);
    const entry = {
      id: idBase + logged,
      desc, cat, currency, amount, fxRate,
      baseAmount: amount * fxRate,
      date: row.date || today(),
      ref: row.reference || '',
      receipt,
      trip
    };
    // What the Tax Centre reads when it counts receipts still waiting to come
    // down from the cloud into the folder.
    if (row._cloud) entry.receiptCloudAt = new Date().toISOString();
    entries.push(entry);
    logged++;
    done++;
    _batchExpenseProgress(done, rows.length, 'Logged');
  }

  // Newest-first, matching how a single submit lands them.
  entries.reverse().forEach(e => TAX_CENTER.businessExpenses.unshift(e));
  await saveTaxCenter();
  if (typeof renderTaxCenter === 'function') renderTaxCenter();
  return { logged, failed: 0, failedUids: new Set(), receiptsLost, pending: false };
}

/** Post the batch into the active book's own expense ledger. */
async function _postBatchToProjectLedger(rows) {
  const book = getBook();
  const native = getBookCurrencyCode(book);
  await _warmBatchExpenseRates(rows.map(r => r.currency), native);
  await _warmBatchExpenseRates([native, ...rows.map(r => r.currency)], 'CAD');

  const author = isAuthor();
  const s = getState();
  if (!s.expenses) s.expenses = [];

  let logged = 0, receiptsLost = 0, done = 0;
  const failedUids = new Set();
  const entries = [];
  const idBase = Date.now() + Math.floor(Math.random() * 100000);

  for (const row of rows) {
    _batchExpenseProgress(done, rows.length, 'Logged');
    const origCurrency = String(row.currency || native).toUpperCase();
    const origAmount = Number(row.amount) || 0;
    const cat = row.category || 'Other';

    // Same conversion the single-expense form does: convert into the book's
    // own currency when a rate is available, and keep the currency actually
    // paid in the description so the ledger still shows what left the account.
    let amount = origAmount;
    let currency = native;
    let fxNote = '';
    let fxRate = null;
    if (origCurrency !== native) {
      const rate = _fxRateCache[`${origCurrency}_${native}`];
      if (rate) { amount = origAmount * rate; fxRate = rate; fxNote = ` (Paid ${origCurrency} ${origAmount.toFixed(2)})`; }
      else { currency = origCurrency; }
    }
    const desc = _batchExpenseDescription(row) + fxNote;

    let receipt = '';
    if (row.file) {
      if (author) {
        try {
          receipt = await uploadReceiptToCloud(row.file, activeBook);
        } catch (e) {
          console.error('Batch receipt upload failed', e);
        }
      } else {
        const saved = await saveReceiptBestEffort(row.file, book.title, {
          date: row.date, desc, cat, amount: origAmount, currency: origCurrency, book: book.title
        });
        receipt = saved.ref;
        if (saved.storage === 'cloud') row._cloud = true;
      }
      if (!receipt) receiptsLost++;
    }

    const cadRate = currency !== 'CAD' ? (_fxRateCache[`${currency}_CAD`] || null) : 1;
    const entry = {
      id: idBase + logged,
      desc, cat, amount, currency, origAmount, origCurrency,
      date: row.date || today(),
      ref: row.reference || '',
      receipt,
      fxRate,
      baseAmount: cadRate ? amount * cadRate : amount
    };
    if (row._cloud || (author && receipt)) entry.receiptCloudAt = new Date().toISOString();

    if (author) {
      try {
        await window._fbSubmitActivity(activeBook, 'expenses', entry);
        addLog('log-expenses', `${cat}: ${desc} — ${fmt(amount, currency)} (Submitted)`, 'ok');
        logged++;
      } catch (e) {
        console.error('Batch submission error:', e);
        reportClientError('batch-expense-submit-failed', e && e.message, { stack: e && e.stack });
        failedUids.add(row.uid);
      }
    } else {
      entries.push(entry);
      addLog('log-expenses', `${cat}: ${desc} — ${fmt(amount, currency)}`, 'ok');
      logged++;
    }
    done++;
    _batchExpenseProgress(done, rows.length, 'Logged');
  }

  if (entries.length) {
    entries.reverse().forEach(e => s.expenses.unshift(e));
    await saveState(activeBook);
  }
  if (author && logged) {
    // One alert for the pile. Sending the publisher an email per receipt is
    // how a batch of fourteen turns into fourteen ignored notifications.
    const cats = Array.from(new Set(rows.map(r => r.category || 'Other')));
    let minDate = '', maxDate = '';
    for (let i = 0; i < rows.length; i++) {
      const d = rows[i].date;
      if (!d) continue;
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }
    await notifyPublisherSubmission('Expense approval', {
      batch: `${logged} expenses`,
      categories: cats,
      dates: `${minDate} → ${maxDate}`
    }, `${logged} expenses submitted for approval`);
  }
  renderExpenses();
  updateDash();
  return { logged, failed: failedUids.size, failedUids, receiptsLost, pending: author };
}

// In-flight extraction, so Cancel and closing the modal can actually stop it.
let _emailExtractAbort = null;
// Gemini output keyed by Gmail message id — adjusting the selection and
// re-running no longer re-pays for emails already extracted this session.
let _emailExtractCache = {};

function _buildReceiptPrompt() {
  const allowedCats = EXPENSE_CATEGORIES.join(' | ');
  return `You extract purchase receipts/invoices from a single email for bookkeeping.
Return JSON matching the provided schema: {"receipts":[…]}
Rules:
1. Include EVERY distinct purchase, payment, invoice, charge, or receipt — including subscriptions, ad spend, shipping labels, software, postage, services, and book printing. One row per receipt.
2. Skip pure shipping-tracking updates, marketing emails, password resets, statements/balances with no charge, payment requests, refunds (note refunds as negative amount).
3. Currency is the ISO 4217 code (e.g. USD, CAD, EUR, GBP, JPY). Default to CAD only if truly unknown.
4. Amount is the TOTAL paid including tax/shipping (number, no symbol). Use a dot decimal.
5. Date is when the charge was made (YYYY-MM-DD). If only month/day given, infer year from email context. If unsure, use today.
6. category must be one of: ${allowedCats}. Use "Other" only if nothing fits.
7. confidence is 0.0–1.0 reflecting how sure you are this is a real receipt.
8. If an attachment is a PDF/image of a receipt, extract from it directly.
9. Do not invent data. If amount/currency/date cannot be determined, omit the row entirely.
10. sourceSnippet is <= 240 chars of the original line(s) that justify the row.
If this email contains no purchase at all, return {"receipts":[]}.`;
}

// Run `worker` over `items` with at most `limit` in flight. Never rejects —
// each slot's outcome is captured so one bad email can't discard the rest.
async function _runExtractionPool(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        try {
          out[i] = { ok: true, value: await worker(items[i], i) };
        } catch (e) {
          if (e && e.name === 'AbortError') throw e;
          out[i] = { ok: false, error: e, item: items[i] };
        }
      }
    })
  );
  return out;
}

async function _fetchEmailContent(msgId, signal) {
  if (_emailContentCache[msgId]) return _emailContentCache[msgId];
  const destUrl = sheetsUrl + (sheetsUrl.includes('?') ? '&' : '?')
    + 'action=getEmailContent&id=' + encodeURIComponent(msgId);
  const res = await fetch(destUrl, { method: 'GET', mode: 'cors', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !data.ok) throw new Error(data.error || 'Failed to fetch content');
  _emailContentCache[msgId] = data.email;
  return data.email;
}

// Batch-fetch content for messages not already cached, chunked at 12 per
// Apps Script call (server-enforced cap). Collapses what used to be one
// Apps Script round-trip — with its own cold start — per selected email
// into a small handful of calls. Only used when the deployed Apps Script
// advertises `batchEmailContent`; older deployments fall through to
// _fetchEmailContent's one-at-a-time path inside the extraction pool.
async function _batchFetchEmailContents(msgIds, signal) {
  const need = msgIds.filter(id => !_emailContentCache[id]);
  if (!need.length) return;
  const chunks = [];
  for (let i = 0; i < need.length; i += 12) chunks.push(need.slice(i, i + 12));
  await Promise.all(chunks.map(async (chunk) => {
    try {
      const destUrl = sheetsUrl + (sheetsUrl.includes('?') ? '&' : '?')
        + 'action=getEmailContents&ids=' + encodeURIComponent(chunk.join(','));
      const res = await fetch(destUrl, { method: 'GET', mode: 'cors', signal });
      if (!res.ok) return; // fall back to per-message fetch for this chunk
      const data = await res.json();
      if (!data || !data.ok) return;
      (data.emails || []).forEach(email => { _emailContentCache[email.id] = email; });
    } catch (_) {
      // A chunk failure just means those messages fetch one-at-a-time later.
    }
  }));
}

// The batch endpoint returns attachment metadata only (no base64) to keep the
// response small. Fetch bytes for just the attachments actually selected,
// in parallel, so a deselected multi-MB PDF never crosses the wire at all.
async function _hydrateSelectedAttachmentBytes(msgId, files, signal) {
  const missing = files.filter(f => f && !f.base64);
  if (!missing.length) return;
  await Promise.all(missing.map(async (f) => {
    try {
      const destUrl = sheetsUrl + (sheetsUrl.includes('?') ? '&' : '?')
        + 'action=getAttachment&messageId=' + encodeURIComponent(msgId)
        + '&idx=' + encodeURIComponent(f.idx != null ? f.idx : '')
        + '&name=' + encodeURIComponent(f.name || '');
      const res = await fetch(destUrl, { method: 'GET', mode: 'cors', signal });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok && data.base64) f.base64 = data.base64;
    } catch (_) {
      // Leave f.base64 unset — the caller filters those out before uploading.
    }
  }));
}

// Gemini sometimes returns "1,234.56" or "$45.00" despite the NUMBER schema.
// Coercing here beats the old silent `.filter()` drop.
function _parseReceiptAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function _parseReceiptJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    // Truncated or fenced output — salvage what we can rather than throwing
    // away the whole email.
    const m = String(text || '').match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch (_e) { /* fall through */ }
    }
    return { receipts: [] };
  }
}

// Map raw Gemini rows onto editable drafts, reporting what was unusable
// instead of silently discarding it.
function _draftsFromReceiptRows(rows, msgId) {
  const drafts = [];
  let dropped = 0;
  for (const r of (rows || [])) {
    const amount = _parseReceiptAmount(r.amount);
    const currency = String(r.currency || 'CAD').toUpperCase().slice(0, 3);
    if (!amount || !currency) { dropped++; continue; }
    const email = msgId ? _emailContentCache[msgId] : null;
    drafts.push({
      vendor: String(r.vendor || '').trim(),
      description: String(r.description || r.vendor || 'Receipt').trim(),
      date: normalizeReceiptDate(r.date) || today(),
      amount,
      currency,
      reference: String(r.reference || '').trim(),
      category: EXPENSE_CATEGORIES.includes(r.category)
        ? r.category
        : inferReceiptCategory(r.vendor, r.description),
      sourceSnippet: String(r.sourceSnippet || '').slice(0, 240),
      confidence: Number(r.confidence || 0.7),
      include: true,
      msgId: msgId || '',
      selectedAtts: (msgId && email) ? _selectedFileParts(msgId, email) : []
    });
  }
  return { drafts, dropped };
}

// Live progress panel pinned above the drafts table, with a Cancel that works.
function _renderExtractProgress(state) {
  const wrap = $('email-receipt-results');
  if (!wrap) return;
  let panel = wrap.querySelector('[data-extract-progress]');
  if (!panel) {
    panel = document.createElement('div');
    panel.setAttribute('data-extract-progress', '1');
    panel.className = 'email-extract-progress';
    wrap.prepend(panel);
  }
  if (state.done) { panel.remove(); return; }
  const pct = state.total ? Math.round((state.completed / state.total) * 100) : 0;
  panel.innerHTML = `
    <div class="email-extract-progress-head">
      <span class="spinner" style="width:13px;height:13px;"></span>
      <span>Reading email ${Math.min(state.completed + 1, state.total)} of ${state.total}${state.found ? ` · ${state.found} receipt${state.found === 1 ? '' : 's'} found` : ''}</span>
      <button type="button" class="btn sm" onclick="cancelEmailReceiptExtraction()">Cancel</button>
    </div>
    <div class="email-extract-progress-bar"><span style="width:${pct}%;"></span></div>`;
}

function cancelEmailReceiptExtraction() {
  if (_emailExtractAbort) {
    _emailExtractAbort.abort();
    showToast('Extraction cancelled', 'warn');
  }
}

// One-line accounting of what happened, shown above the drafts table so a
// partial batch failure or a silently-dropped row is never invisible.
function _renderExtractSummary({ total, failures, alreadyImported, droppedRows, truncated }) {
  const wrap = $('email-receipt-results');
  if (!wrap) return;
  const bits = [];
  if (alreadyImported) bits.push(`${alreadyImported} already imported, skipped`);
  if (failures && failures.length) bits.push(`${failures.length} of ${total} couldn't be read — <button type="button" class="btn sm" onclick="retryFailedEmailExtractions()">Retry</button>`);
  if (droppedRows) bits.push(`${droppedRows} row${droppedRows > 1 ? 's' : ''} had no usable amount/currency and were skipped`);
  if (truncated) bits.push(`a response was truncated — some receipts on a busy email may be missing`);
  if (!bits.length) return;
  const banner = document.createElement('div');
  banner.className = 'email-extract-summary';
  banner.innerHTML = bits.join(' · ');
  wrap.prepend(banner);
  if (failures && failures.length) _lastFailedEmailIds = failures.map(f => f.item);
}

let _lastFailedEmailIds = [];
function retryFailedEmailExtractions() {
  if (!_lastFailedEmailIds.length) return;
  _gmailSelectedIds = new Set(_lastFailedEmailIds);
  document.querySelectorAll('.gmail-email-cb').forEach(cb => {
    const id = cb.getAttribute('data-msg-id');
    cb.checked = _gmailSelectedIds.has(id);
    toggleEmailRowSelection(id, cb.checked);
  });
  extractReceiptsFromEmailText();
}

async function extractReceiptsFromEmailText() {
  const apiKey = TAX_CENTER.settings?.geminiKey;
  if (!apiKey) { showToast('Gemini API Key required in Config', 'err'); return; }
  if (!navigator.onLine) {
    showToast('Offline — reconnect to extract receipts', 'warn');
    return;
  }

  const btn = $('email-receipt-scan-btn');
  const prev = btn.textContent;
  const wrap = $('email-receipt-results');

  let parts = [];
  const prompt = _buildReceiptPrompt();

  if (_activeEmailImportTab === 'gmail') {
    const msgIds = _gmailSelectedIds.size
      ? Array.from(_gmailSelectedIds)
      : Array.from(document.querySelectorAll('.gmail-email-cb:checked'))
        .map(cb => cb.getAttribute('data-msg-id'));
    if (!msgIds.length) {
      showToast('Select at least one email to extract drafts from', 'warn');
      return;
    }

    // Emails already imported carry their message id on the expense, so this
    // is an exact skip — no tokens spent re-extracting last month's receipts.
    const importedMsgIds = new Set(
      (TAX_CENTER.businessExpenses || []).map(e => e.emailMsgId).filter(Boolean)
    );
    const todo = msgIds.filter(id => !importedMsgIds.has(id));
    const alreadyImported = msgIds.length - todo.length;
    if (!todo.length) {
      showToast(`All ${msgIds.length} selected email${msgIds.length === 1 ? ' is' : 's are'} already imported`, 'warn');
      return;
    }

    _emailExtractAbort = new AbortController();
    const signal = _emailExtractAbort.signal;
    const timeoutId = setTimeout(() => _emailExtractAbort && _emailExtractAbort.abort(), 180000);

    if (btn) { btn.disabled = true; btn.textContent = 'Extracting…'; }
    if (wrap) wrap.innerHTML = '';

    const collected = [];
    const failures = [];
    let completed = 0;
    let droppedRows = 0;
    let truncatedAny = false;
    _renderExtractProgress({ completed: 0, total: todo.length, found: 0 });

    // On a deployed Apps Script new enough to advertise it, fetch every
    // message's content in a handful of batched calls up front instead of
    // one call per message inside the pool below. Falls through silently on
    // an older deployment — _fetchEmailContent's per-message path still runs.
    try {
      const caps = await fetchSheetsCapabilities();
      if (caps && caps.batchEmailContent) {
        await _batchFetchEmailContents(todo, signal);
      }
    } catch (_) { /* fall back to per-message fetch below */ }

    try {
      await _runExtractionPool(todo, 3, async (msgId) => {
        let rows;
        if (_emailExtractCache[msgId]) {
          rows = _emailExtractCache[msgId];
        } else {
          const email = await _fetchEmailContent(msgId, signal);
          const selected = _selectedFileParts(msgId, email);
          // The batch endpoint sends attachment metadata only — fetch bytes
          // for just the files actually selected, not everything on the
          // message.
          await _hydrateSelectedAttachmentBytes(msgId, selected, signal);
          const emailParts = [
            { text: prompt },
            {
              text: `--- SUBJECT: "${email.subject}" FROM: ${email.from} DATE: ${email.date} ---\n`
                + String(email.body || '').slice(0, 80000)
            }
          ];
          for (const f of selected) {
            if (f && f.base64) emailParts.push({ inline_data: { mime_type: f.mime, data: f.base64 } });
          }
          const out = await _callGeminiForReceipts(apiKey, emailParts, {
            signal,
            schema: RECEIPT_EXTRACTION_SCHEMA
          });
          if (out.truncated) truncatedAny = true;
          rows = _parseReceiptJson(out.text || '{}').receipts || [];
          _emailExtractCache[msgId] = rows;
        }

        const { drafts, dropped } = _draftsFromReceiptRows(rows, msgId);
        droppedRows += dropped;
        collected.push(...drafts);
        completed++;
        // Rows land as they arrive instead of after the whole batch.
        _emailReceiptDrafts = collected.slice();
        renderEmailReceiptDrafts(_emailReceiptDrafts);
        _renderExtractProgress({ completed, total: todo.length, found: collected.length });
        return drafts;
      }).then(results => {
        results.forEach(r => { if (r && !r.ok) failures.push(r); });
      });
    } catch (e) {
      if (e && e.name === 'AbortError') {
        _renderExtractProgress({ done: true });
        if (btn) { btn.disabled = false; btn.textContent = prev; }
        _emailExtractAbort = null;
        clearTimeout(timeoutId);
        _emailReceiptDrafts = collected.slice();
        renderEmailReceiptDrafts(_emailReceiptDrafts);
        return;
      }
      console.error('[email-receipt-import] extraction failed', e);
    } finally {
      clearTimeout(timeoutId);
      _emailExtractAbort = null;
    }

    _renderExtractProgress({ done: true });
    _emailReceiptDrafts = collected.slice();
    renderEmailReceiptDrafts(_emailReceiptDrafts);
    _renderExtractSummary({
      total: todo.length,
      found: collected.length,
      failures,
      alreadyImported,
      droppedRows,
      truncated: truncatedAny
    });

    if (btn) { btn.disabled = false; btn.textContent = prev; }
    if (collected.length) {
      showToast(`✓ Found ${collected.length} receipt${collected.length > 1 ? 's' : ''}`);
    } else if (!failures.length) {
      showToast('No receipts detected in the selected emails', 'warn');
    }
    return;
  }

  parts.push({ text: prompt });

  {
    const pasted = ($('email-receipt-source')?.value || '').trim();
    const fileInput = $('email-receipt-files');
    const files = Array.from(fileInput?.files || []);
    if (!pasted && !files.length) { showToast('Paste emails or attach files first', 'warn'); return; }

    if (btn) btn.disabled = true;
    btn.textContent = 'Extracting…';
    if (wrap) wrap.innerHTML = `<div style="font-size:12px;color:var(--text3);">Reading attachments and querying Gemini…</div>`;

    try {
      const fileParts = await readReceiptFiles(files);
      const cleanedText = parseEmlOrText(pasted);
      if (cleanedText) parts.push({ text: '--- PASTED EMAIL TEXT ---\n' + cleanedText.slice(0, 120000) });
      for (const fp of fileParts) {
        if (fp.kind === 'text' && fp.text) {
          parts.push({ text: `--- FILE: ${fp.name} ---\n` + fp.text.slice(0, 60000) });
        } else if (fp.kind === 'inline' && fp.base64) {
          parts.push({ inline_data: { mime_type: fp.mime, data: fp.base64 } });
        }
      }
    } catch (e) {
      console.error('[email-receipt-import] file read failed', e);
      if (wrap) {
        wrap.innerHTML = `<div style="background:rgba(220,60,60,.08);border:1px solid rgba(220,60,60,.25);border-radius:var(--r2);padding:10px 14px;font-size:12px;color:var(--red);">File read failed: ${(e.message || e).toString().replace(/</g, '&lt;')}</div>`;
      }
      showToast('Could not read files', 'err');
      if (btn) btn.disabled = false;
      btn.textContent = prev;
      return;
    }
  }

  if (wrap) wrap.innerHTML = `<div style="font-size:12px;color:var(--text3);">Sending content to Gemini AI…</div>`;
  try {
    const out = await _callGeminiForReceipts(apiKey, parts, { schema: RECEIPT_EXTRACTION_SCHEMA });
    const parsed = _parseReceiptJson(out?.text || '{}');
    const { drafts, dropped } = _draftsFromReceiptRows(parsed.receipts, '');

    _emailReceiptDrafts = drafts;
    renderEmailReceiptDrafts(drafts);
    if (!drafts.length) {
      showToast('No receipts detected — check your pasted text or files.', 'warn');
    } else {
      showToast(`✓ Found ${drafts.length} receipt${drafts.length > 1 ? 's' : ''}${dropped ? ` (${dropped} row${dropped > 1 ? 's' : ''} unreadable, skipped)` : ''}`);
    }
  } catch (e) {
    console.error('[email-receipt-import] Gemini failed', e);
    if (wrap) {
      wrap.innerHTML = `<div style="background:rgba(220,60,60,.08);border:1px solid rgba(220,60,60,.25);border-radius:var(--r2);padding:10px 14px;font-size:12px;color:var(--red);">Extraction failed: ${(e.message || e).toString().replace(/</g, '&lt;')}<br><span style="color:var(--text3);">Verify your Gemini API key and parameters.</span></div>`;
    }
    showToast('Could not extract receipts', 'err');
  } finally {
    if (btn) btn.disabled = false;
    btn.textContent = prev;
  }
}

// The existing expense a draft would duplicate (same date, amount, currency),
// or null. Used both to flag duplicates and to attach receipt files to an
// already-imported expense that has none yet.
function _findDuplicateExpense(draft) {
  const list = TAX_CENTER.businessExpenses || [];
  const a = Number(draft.amount).toFixed(2);
  const cur = String(draft.currency || 'CAD').toUpperCase();
  return list.find(e =>
    e.date === draft.date &&
    Number(e.amount).toFixed(2) === a &&
    (e.currency || 'CAD').toUpperCase() === cur
  ) || null;
}

function _isLikelyDuplicateExpense(draft) {
  return !!_findDuplicateExpense(draft);
}

// True when an expense already has at least one viewable receipt on file.
function _expenseHasReceipt(e) {
  return !!(e && ((Array.isArray(e.receiptFiles) && e.receiptFiles.length) || e.receipt));
}

function renderEmailReceiptDrafts(receipts) {
  const wrap = $('email-receipt-results');
  const bulkCatBar = $('email-bulk-category-bar');
  if (!wrap) return;
  if (!Array.isArray(receipts) || !receipts.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:14px;font-size:var(--text-sm);color:var(--text3);">No valid receipts found.</div>';
    if (bulkCatBar) bulkCatBar.style.display = 'none';
    return;
  }
  if (bulkCatBar) bulkCatBar.style.display = 'flex';
  const esc = escapeHtml;
  const catOptions = (sel) => EXPENSE_CATEGORIES
    .map(c => `<option${c === sel ? ' selected' : ''}>${esc(c)}</option>`).join('');
  const curOptions = (sel) => ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'JPY', 'MXN', 'CHF', 'SEK', 'NOK', 'DKK']
    .map(c => `<option${c === sel ? ' selected' : ''}>${esc(c)}</option>`).join('');

  const dupCount = receipts.filter(r => _isLikelyDuplicateExpense(r)).length;

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:var(--text-sm);color:var(--content-secondary);">${receipts.length} draft${receipts.length > 1 ? 's' : ''} extracted${dupCount ? ` · <span style="color:var(--amber);font-weight:600;">${dupCount} possible duplicate${dupCount > 1 ? 's' : ''}</span>` : ''}. Edit any field, deselect rows you don't want.</div>
      <div style="display:flex;gap:6px;">
        <button class="btn sm" type="button" onclick="toggleAllEmailDrafts(true)">Select all</button>
        <button class="btn sm" type="button" onclick="toggleAllEmailDrafts(false)">Select none</button>
        ${dupCount ? `<button class="btn sm" type="button" onclick="deselectDuplicateEmailDrafts()">Deselect duplicates</button>` : ''}
      </div>
    </div>
    <div class="tbl-wrap" style="max-height:340px;overflow:auto;border:1px solid var(--border-default);border-radius:var(--r2);">
      <table class="tbl" style="font-size:var(--text-sm);">
        <thead><tr>
          <th></th><th>Date</th><th>Vendor / Description</th><th>Category</th><th>Ref</th>
          <th class="r" style="min-width:130px;">Amount</th><th></th>
        </tr></thead>
        <tbody>
        ${receipts.map((r, i) => {
    const dup = _isLikelyDuplicateExpense(r);
    const lowConf = (r.confidence ?? 1) < 0.5;
    return `<tr data-erd-row="${i}" style="${dup ? 'background:rgba(220,170,40,.06);' : ''}">
            <td><input type="checkbox" data-erd-include="${i}" ${r.include !== false ? 'checked' : ''}></td>
            <td><input type="date" data-erd-field="date" data-erd-i="${i}" value="${esc(r.date)}" style="font-size:var(--text-sm);width:130px;font-family:'DM Mono',monospace;font-feature-settings:'tnum' 1;"></td>
            <td>
              <input type="text" data-erd-field="vendor" data-erd-i="${i}" value="${esc(r.vendor)}" placeholder="Vendor" style="font-size:var(--text-sm);width:100%;margin-bottom:2px;">
              <input type="text" data-erd-field="description" data-erd-i="${i}" value="${esc(r.description)}" placeholder="Description" style="font-size:var(--text-xs);width:100%;color:var(--content-secondary);">
              ${dup ? `<div style="font-size:var(--text-2xs);color:var(--amber);margin-top:2px;font-weight:600;">⚠ matches an existing expense</div>` : ''}
              ${lowConf ? `<div style="font-size:var(--text-2xs);color:var(--content-muted);margin-top:2px;">low confidence (${(r.confidence * 100 | 0)}%)</div>` : ''}
              ${r.msgId
        ? `<div style="font-size:var(--text-2xs);color:var(--content-muted);margin-top:2px;">${(r.selectedAtts && r.selectedAtts.length) ? `📎 ${r.selectedAtts.length} file${r.selectedAtts.length > 1 ? 's' : ''} + email` : `📄 email`} → receipts folder on import</div>`
        : ''}
            </td>
            <td><select data-erd-field="category" data-erd-i="${i}" style="font-size:var(--text-sm);">${catOptions(r.category)}</select></td>
            <td><input type="text" data-erd-field="reference" data-erd-i="${i}" value="${esc(r.reference)}" placeholder="—" style="font-size:var(--text-sm);width:120px;"></td>
            <td class="r">
              <div style="display:flex;gap:4px;align-items:center;justify-content:flex-end;">
                <select data-erd-field="currency" data-erd-i="${i}" style="font-size:var(--text-sm);width:68px;font-family:'DM Mono',monospace;">${curOptions(r.currency)}</select>
                <input type="number" step="0.01" data-erd-field="amount" data-erd-i="${i}" value="${Number(r.amount).toFixed(2)}" style="font-size:var(--text-sm);width:90px;text-align:right;font-family:'DM Mono',monospace;font-feature-settings:'tnum' 1;">
              </div>
            </td>
            <td>${r.sourceSnippet ? `<button class="btn sm" type="button" title="View source snippet" aria-label="View source snippet" onclick="confirmDialog(${JSON.stringify(r.sourceSnippet)}, {title:'Source snippet', okLabel:'OK', cancelLabel:'Close'})">👁</button>` : ''}</td>
          </tr>`;
  }).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;align-items:center;justify-content:flex-end;">
      <span style="font-size:var(--text-xs);color:var(--content-muted);font-family:'DM Mono',monospace;">FX rates auto-fetched at import</span>
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

// The one bulk action a re-import overlap actually calls for: untick every
// row that already matches an existing expense, in one click instead of
// hunting each ⚠ row individually.
function deselectDuplicateEmailDrafts() {
  let n = 0;
  _emailReceiptDrafts.forEach((d, i) => {
    if (_isLikelyDuplicateExpense(d)) {
      d.include = false;
      n++;
      const cb = document.querySelector(`[data-erd-include="${i}"]`);
      if (cb) cb.checked = false;
    }
  });
  if (n) showToast(`Deselected ${n} duplicate${n > 1 ? 's' : ''}`);
}

// Repurposes the (previously dead — every draft's category was already
// guaranteed valid, so its "fallback" branch was unreachable) category
// dropdown into a bulk-apply: fixing 10 miscategorised rows was previously
// 10 separate dropdown interactions.
function applyBulkCategoryToEmailDrafts() {
  const cat = $('email-receipt-default-cat')?.value;
  if (!cat) return;
  let n = 0;
  _emailReceiptDrafts.forEach((d, i) => {
    if (d.include === false) return;
    d.category = cat;
    n++;
    const sel = document.querySelector(`[data-erd-field="category"][data-erd-i="${i}"]`);
    if (sel) sel.value = cat;
  });
  if (n) showToast(`Set category on ${n} selected draft${n > 1 ? 's' : ''}`);
  else showToast('No drafts selected', 'warn');
}

// Save every receipt file for one draft into the local folder and return their
// local:// paths. For a Gmail Search receipt that's the email body AND each
// selected attachment, ordered PDF → email body → image (so the primary link
// is the most receipt-like file). Saved once per source email via the shared
// gmailSavedByMsg cache. Falls back to the add-on copy, a cloud URL, or a
// manually-attached file when there are no Gmail files.
async function _saveDraftReceiptFiles(item, ctx) {
  const { gmailSavedByMsg, savedReceiptPaths, draftIdx } = ctx;

  let addonLocal = '';
  if (item._inboxId) addonLocal = await localizeInboxReceiptFiles(item);

  let emailFiles = [];
  if (item.msgId && typeof saveReceiptToLocalFile === 'function') {
    if (gmailSavedByMsg[item.msgId] !== undefined) {
      emailFiles = gmailSavedByMsg[item.msgId];
    } else {
      const email = _emailContentCache[item.msgId];
      const atts = item.selectedAtts || [];
      const isPdf = a => /pdf/i.test(a.mime || '') || /\.pdf$/i.test(a.name || '');
      const ordered = [...atts.filter(isPdf), '__BODY__', ...atts.filter(a => !isPdf(a))];
      const paths = [];
      for (const entry of ordered) {
        try {
          if (entry === '__BODY__') {
            if (email && (email.body || email.subject)) {
              const bp = await saveReceiptToLocalFile(_emailBodyToReceiptFile(email, item), 'email-imports');
              if (bp) paths.push(bp);
            }
          } else {
            const byteChars = atob(entry.base64.replace(/\s/g, ''));
            const byteArray = new Uint8Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
            const file = new File([byteArray], entry.name, { type: entry.mime });
            const lp = await saveReceiptToLocalFile(file, 'email-imports');
            if (lp) paths.push(lp);
          }
        } catch (err) {
          console.error('Failed to save receipt file locally', err);
        }
      }
      emailFiles = paths;
      gmailSavedByMsg[item.msgId] = paths;
    }
  }

  if (emailFiles.length) return emailFiles.slice();
  const fallback = addonLocal || item.receipt || savedReceiptPaths[draftIdx] || savedReceiptPaths[0] || '';
  return fallback ? [fallback] : [];
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

  // Warm the FX cache for every distinct currency up front — previously the
  // first draft of each currency blocked the whole import loop on its own
  // await, one at a time, even though _fxRateCache already dedupes by pair.
  const baseCurUp = (TAX_CENTER.settings?.baseCurrency || 'CAD').toUpperCase();
  const neededCurrencies = Array.from(new Set(
    drafts.map(d => (d.currency || baseCurUp).toUpperCase()).filter(c => c !== baseCurUp)
  )).filter(c => !_fxRateCache[`${c}_${baseCurUp}`]);
  if (neededCurrencies.length) {
    await Promise.all(neededCurrencies.map(c => fetchLiveRate(c, baseCurUp).catch(() => null)));
  }

  let imported = 0, skippedDup = 0, relinked = 0;
  let draftIdx = 0;
  const gmailSavedByMsg = {}; // msgId → [saved local:// paths] for that email
  for (const item of drafts) {
    const currency = (item.currency || baseCur).toUpperCase();
    const amount = Number(item.amount || 0);
    if (!amount) continue;

    // If this draft matches an existing expense that already has a receipt,
    // there's nothing to do. If it matches one that has NO receipt yet, fall
    // through and attach the files we're about to save instead of skipping —
    // this is how a previously-imported expense gets its "View Local" link.
    const dup = _findDuplicateExpense({ ...item, currency });
    if (dup && _expenseHasReceipt(dup)) {
      skippedDup++;
      draftIdx++;
      continue;
    }

    const receiptFiles = await _saveDraftReceiptFiles(item, { gmailSavedByMsg, savedReceiptPaths, draftIdx });
    const receiptPath = receiptFiles[0] || '';
    draftIdx++;

    if (dup) {
      // Existing receiptless expense — attach what we just saved.
      if (receiptFiles.length) {
        dup.receipt = receiptPath;
        dup.receiptFiles = receiptFiles;
        if (item.msgId && !dup.emailMsgId) dup.emailMsgId = item.msgId;
        relinked++;
      } else {
        skippedDup++;
      }
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
      receiptFiles,
      emailMsgId: item.msgId || '',
      sourceSnippet: item.sourceSnippet || '',
      importedFromEmail: true,
      importedAt: new Date().toISOString()
    });
    imported++;
  }

  await saveTaxCenter();

  // Drafts that came from the Gmail add-on carry an _inboxId — remove those
  // Firestore docs now that they've been reviewed so the queue stays clean.
  const inboxIds = drafts.map(d => d._inboxId).filter(Boolean);
  if (inboxIds.length && typeof window._fbDeleteInboxItem === 'function') {
    await Promise.all(inboxIds.map(id => window._fbDeleteInboxItem(id)));
    // ⚡ Bolt Optimization: Replace O(N) Array.includes with O(1) Set.has inside filter loop
    const inboxIdsSet = new Set(inboxIds);
    _emailInboxItems = _emailInboxItems.filter(i => !inboxIdsSet.has(i._inboxId));
    updateEmailInboxBadge();
  }

  if (typeof renderTaxCenter === 'function') renderTaxCenter();

  const msgParts = [];
  if (imported) msgParts.push(`✓ Imported ${imported} expense${imported > 1 ? 's' : ''}`);
  if (relinked) msgParts.push(`📎 ${relinked} receipt${relinked > 1 ? 's' : ''} linked to existing`);
  if (skippedDup) msgParts.push(`${skippedDup} duplicate${skippedDup > 1 ? 's' : ''} skipped`);
  showToast(msgParts.join(' · ') || 'Nothing imported', (imported || relinked) ? 'ok' : 'warn');

  if (imported || relinked) closeEmailReceiptImportModal();
  else if (btn) { btn.disabled = false; btn.textContent = 'Import selected drafts'; }
}

// ── EXPENSE FORM & LEDGER ───────────────────────────────────────────────
// The expense form and the ledger table that lists what it records. They live
// with the receipts because a receipt only exists as an attachment to one of
// these rows — keeping them apart meant a change to either could break the
// other with nothing to catch it.

let _expenseFxRate = null;
function updateExpenseForm() {
  const book = getBook();
  $('exp-date').value = today();
  populateExpenseCategoryDropdown();

  const native = getBookCurrencyCode(book);
  const curField = $('exp-cur');
  if (curField) curField.value = localStorage.getItem('lastExpenseCurrency') || native;
  if ($('exp-fx-inline-result')) $('exp-fx-inline-result').style.display = 'none';
  _expenseFxRate = null;

  if (window.IS_PUBLISHER) {
    if ($('exp-ai-btn')) $('exp-ai-btn').style.display = '';
  } else {
    if ($('exp-ai-btn')) $('exp-ai-btn').style.display = 'none';
  }
}

// Fills #exp-cat from the canonical EXPENSE_CATEGORIES list (shared with
// email-receipt import & tax center) instead of the old hardcoded 8-option
// list, so manually-logged and AI-imported expenses land in the same
// categories. Defaults to whichever category was last used.
function populateExpenseCategoryDropdown() {
  const sel = $('exp-cat');
  if (!sel || sel.options.length) return;
  sel.innerHTML = EXPENSE_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  const last = localStorage.getItem('lastExpenseCategory');
  if (last && EXPENSE_CATEGORIES.includes(last)) sel.value = last;
}

async function submitExpense() {
  if (!activeBook) { showToast('⚠ Error: No active book selected', 'err'); return; }
  const desc = ($('exp-desc').value || '').trim();
  const cat = $('exp-cat').value;
  const date = $('exp-date').value || today();
  const ref = ($('exp-ref').value || '').trim();
  const book = getBook();

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

  if (!desc) { showToast('⚠ Please enter a description', 'warn'); $('exp-desc').focus(); return; }
  if (!rawAmount) { showToast('⚠ Please enter an amount', 'warn'); $('exp-amount').focus(); return; }

  const existingExpenses = (getState().expenses || []);
  const isDuplicate = existingExpenses.some(e =>
    e.date === date &&
    e.desc.trim().toLowerCase() === desc.toLowerCase() &&
    Math.abs((e.origAmount ?? e.amount) - rawAmount) < 0.005
  );
  if (isDuplicate) {
    const proceed = await confirmDialog(
      `An expense dated ${fmtD(date)} for "${desc}" (${fmt(rawAmount, cur)}) already exists. Log it again anyway?`,
      { title: 'Possible duplicate expense' }
    );
    if (!proceed) return;
  }

  const fileInput = $('exp-file');
  let receiptUrl = '';
  let receiptStorage = 'none';
  if (fileInput && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const submitBtn = $('submit-exp-btn');
    const oldText = submitBtn.textContent;

    if (window.IS_PUBLISHER) {
      // Folder first, cloud as the safety net — same deal as the Tax Centre.
      // A publisher on a machine with no folder connected used to lose the
      // receipt here without a word.
      submitBtn.textContent = 'Saving receipt…'; submitBtn.disabled = true;
      const saved = await saveReceiptBestEffort(file, book.title, {
        date, desc: finalDesc, cat, amount: rawAmount, currency: cur, book: book.title,
      });
      receiptUrl = saved.ref;
      receiptStorage = saved.storage;
      if (receiptStorage === 'cloud') {
        showToast('Receipt saved to the cloud — it moves to your folder when it\'s available', 'warn', 5000);
      } else if (receiptStorage === 'none') {
        showToast('⚠ Receipt could not be saved — logging the expense without it', 'err', 5000);
      }
    } else {
      submitBtn.textContent = 'Uploading to cloud...'; submitBtn.disabled = true;
      try {
        receiptUrl = await uploadReceiptToCloud(file, activeBook);
        receiptStorage = receiptUrl ? 'cloud' : 'none';
      } catch (e) {
        console.error(e);
        showToast('⚠ Cloud upload failed — submitting without receipt', 'err');
      }
    }
    submitBtn.textContent = oldText; submitBtn.disabled = false;
  }

  const s = getState();
  if (!s.expenses) s.expenses = [];

  // Store original payment info for ledger display
  const origAmount = rawAmount;
  const origCurrency = cur;

  // Calculate CAD equivalence for publisher reporting (only once, at submission time)
  const cadRate = currency !== 'CAD' ? (_fxRateCache[`${currency}_CAD`] || null) : 1;
  const baseAmount = cadRate ? (amount * cadRate) : amount;
  const newExpense = { id: Date.now(), desc: finalDesc, cat, amount, currency, origAmount, origCurrency, date, ref, receipt: receiptUrl, fxRate: _expenseFxRate, baseAmount };
  // Starts the clock the Tax Centre reads when it counts what's waiting.
  if (receiptStorage === 'cloud') newExpense.receiptCloudAt = new Date().toISOString();

  if (isAuthor()) {
    try {
      await window._fbSubmitActivity(activeBook, 'expenses', newExpense);
      addLog('log-expenses', `${cat}: ${desc} — ${fmt(amount, currency)} (Submitted)`, 'ok');
      showToast('✓ Expense submitted for approval');
      notifyPublisherSubmission('Expense', newExpense, `${cat}: ${desc} — ${fmt(amount, currency)}`);
    } catch (e) {
      console.error("Submission error:", e);
      reportClientError('submit-expense-failed', e && e.message, { stack: e && e.stack });
      showToast(isPermissionDenied(e)
        ? '⚠ Permission denied — this book is not linked to your account. Nothing was submitted.'
        : '⚠ Could not submit the expense — nothing was recorded. Check your connection and try again.', 'err', 6000);
    }
  } else {
    const s = getState();
    if (!s.expenses) s.expenses = [];
    s.expenses.unshift(newExpense);
    saveState(activeBook);
    addLog('log-expenses', `${cat}: ${desc} — ${fmt(amount, currency)}`, 'ok');
    showToast('✓ Expense logged');
  }

  localStorage.setItem('lastExpenseCategory', cat);
  localStorage.setItem('lastExpenseCurrency', cur);

  renderExpenses();
  updateDash();
  $('exp-desc').value = ''; $('exp-amount').value = ''; $('exp-ref').value = ''; $('exp-date').value = today();
  if (fileInput) fileInput.value = '';
  if (typeof window.expFileChosen === 'function') window.expFileChosen();
  $('exp-desc').focus();
}

function voidExpense(id) {
  const s = getState();
  s.expenses = (s.expenses || []).filter(e => e.id !== id);
  renderExpenses();
  updateDash();
  saveState(activeBook);
  showToast('Expense removed', 'warn');
}
// Rows the author can select for a bulk reimbursement request (unreceived,
// approved, non-gratuity expenses). Persists selection across re-renders.
// Plain module state rather than a window property: nothing outside this file
// reads it, and a column-0 `window.x = …` runs at import time, which a feature
// module may not do (see tests/features-boundary.test.js).
const _expReimburseSelection = new Set();

// "Show me only the expenses with nothing backing them up." Off by default, and
// reset automatically the moment the last gap is filled, so the filter can never
// leave the ledger looking emptier than it is.
let _expMissingReceiptOnly = false;

/**
 * The expense ledger's footer: one row per currency the ledger holds.
 *
 * Reuses the consignment ledger's `.ledger-total-row` furniture rather than the
 * one-off inline styling this footer used to carry, so the two money tables in
 * the app total themselves the same way — including the currency chip that
 * appears only once there is more than one bucket to tell apart.
 *
 * Renders nothing when there is nothing to total (a ledger of gratuity copies
 * only): a "CA$0.00 outstanding" line under rows that all say "Publisher
 * expense" states a total nobody asked for.
 */
function expenseTotalsFootHtml(totals, showSelectCol) {
  if (!totals || !totals.length) return '';
  // The missing-receipt filter hides rows but must never shrink the total — the
  // money is still owed whether or not its receipt has been filed. Saying which
  // set the figure covers is the difference between "I owe CA$40" and "I owe
  // CA$40 on the ones I haven't filed yet".
  const scopeTag = _expMissingReceiptOnly
    ? ' <span class="ledger-total-scope">whole ledger</span>'
    : '';
  const labelSpan = showSelectCol ? 6 : 5;
  const tailSpan = window.IS_PUBLISHER ? 3 : 2;
  return totals.map((t) => {
    const copy = expenseTotalsCopy(t);
    const valueClass = copy.status === 'outstanding' ? 'is-owed' : 'is-clear';
    const statusPill = copy.status === 'outstanding'
      ? '<span class="pill amber">● Outstanding</span>'
      : '<span class="pill green">✓ Clear</span>';
    const codeTag = totals.length > 1
      ? ` <span class="chip-status gray">${escapeHtml(copy.code)}</span>`
      : '';
    return `<tr class="ledger-total-row">
      <td colspan="${labelSpan}" class="ledger-total-label is-end">${escapeHtml(copy.label)}${scopeTag}<span class="ledger-total-sub">${escapeHtml(copy.sub)}</span></td>
      <td class="r mono-num ledger-total-val ${valueClass}">${fmt(copy.amount, copy.code)}</td>
      <td colspan="${tailSpan}">${statusPill}${codeTag}</td>
    </tr>`;
  }).join('');
}

function renderExpenses() {
  const s = getState(), book = getBook(), cur = book.currency;
  const expenses = s.expenses || [];
  const body = $('exp-body');
  if (!body) return;
  const pbExp = window.authorSubmissions[activeBook]?.expenses || {};
  const pendingAuthExpenses = Object.keys(pbExp).map(k => {
    const raw = JSON.parse(pbExp[k].data);
    return { ...raw, _subKey: k, pendingAuth: true };
  });
  const combined = [...pendingAuthExpenses, ...expenses];
  const showSelectCol = isAuthor() && !window.IS_PUBLISHER;

  // Selection can only ever contain currently-eligible ids; drop anything
  // that got received/voided elsewhere since the last render.
  const eligibleIds = new Set(combined.filter(e => !e.received && !e.pendingAuth && !isGratuityExpense(e)).map(e => e.id));
  for (const id of _expReimburseSelection) if (!eligibleIds.has(id)) _expReimburseSelection.delete(id);

  // The gap an accountant asks about: money out, nothing filed against it.
  // Author submissions awaiting approval are excluded — the publisher cannot
  // attach a receipt to a row that is not in the ledger yet.
  const missingReceipt = combined.filter(e => !e.pendingAuth && expenseMissingReceipt(e));
  if (!missingReceipt.length) _expMissingReceiptOnly = false;
  updateExpenseMissingReceiptButton(missingReceipt.length);

  if (!combined.length) {
    body.innerHTML = `
      <tr>
        <td colspan="${window.IS_PUBLISHER ? 9 : (showSelectCol ? 9 : 8)}" style="padding:0;border:none;">
          <div class="empty-state exp-empty-state" style="padding:var(--space-6) var(--space-4);text-align:center;">
            <div class="e-icon" aria-hidden="true">🧾</div>
            <strong style="font-size:var(--text-base);font-weight:700;color:var(--content-primary);display:block;margin-bottom:var(--space-1);">No Expenses Logged Yet</strong>
            <p style="font-size:var(--text-xs);color:var(--content-secondary);max-width:400px;margin:0 auto var(--space-3);line-height:var(--leading-snug);">Track production runs, freight, ISBN, marketing, or convention expenses for this book to calculate true net revenue and artist royalty pools.</p>
            <div style="display:flex;justify-content:center;gap:var(--space-2);flex-wrap:wrap;">
              <button type="button" class="btn sm gold" onclick="openBatchExpenseModal('book')" style="min-height:var(--target-min);display:inline-flex;align-items:center;gap:6px;" title="Batch log receipts and expenses">
                <span aria-hidden="true">📄</span>
                <span>Batch Log Expenses</span>
              </button>
            </div>
          </div>
        </td>
      </tr>
    `;
    updateBulkReimburseButton();
    return;
  }

  const visible = _expMissingReceiptOnly ? missingReceipt : combined;

  // One running total per currency the ledger actually holds, rather than one
  // raw sum printed in the book's currency. The form offers six currencies and
  // defaults to CAD whatever the book is priced in, so the old single figure
  // could carry a euro sign over dollars, or add the two together.
  const expTotals = expenseLedgerTotals(combined, getBookCurrencyCode(book));

  $('exp-head-row').innerHTML = `<tr>${showSelectCol ? '<th></th>' : ''}<th>Date</th><th>Description</th><th>Category</th><th>Ref</th><th>Receipt</th><th class="r">Amount</th>${window.IS_PUBLISHER ? '<th class="r">Amount (CAD)</th>' : ''}<th>Reimbursement</th><th></th></tr>`;

  body.innerHTML = visible.map(e => {
    if (e.pendingAuth) {
      const actionCell = window.IS_PUBLISHER
        ? `<div class="approval-actions"><button class="appr-btn approve" onclick="approveSubmission('expenses', '${e._subKey}')" aria-label="Approve submission"><span class="ico">✓</span>Approve</button><button class="appr-btn reject" onclick="rejectSubmission('expenses', '${e._subKey}')" title="Reject submission" aria-label="Reject submission">✕</button></div>`
        : `<span style="font-size:10px;color:var(--amber);">Awaiting Publisher</span>`;
      return `<tr style="opacity:0.8;background:var(--amber-bg);">
        ${showSelectCol ? '<td></td>' : ''}
        <td class="mono" style="color:var(--text3);">${fmtD(e.date) ?? '—'}</td>
        <td style="font-weight:600;">${escapeHtml(e.desc)}</td>
        <td><span class="pill gray" style="font-size:10px;">${escapeHtml(e.cat)}</span></td>
        <td class="mono" style="font-size:11px;color:var(--text3);">${escapeHtml(e.ref) || '—'}</td>
        <td>—</td>
        <td class="r" style="font-weight:600;">${fmt(e.amount, e.currency)}</td>
        ${window.IS_PUBLISHER ? '<td class="r">—</td>' : ''}
        <td></td>
        <td class="r">${actionCell}</td>
      </tr>`;
    }

    const isGratuity = isGratuityExpense(e);
    const statusCell = isGratuity
      ? '<span class="pill gray" style="font-size:10px;" title="Gifted-copy cost — publisher absorbed, not reimbursed to author">Publisher expense</span>'
      : e.received
        ? '<span class="pill green" style="font-size:10px;">✓ Received</span>'
        : '<span style="font-size:11px;color:var(--text3);">Pending</span>';
    const actionCell = (!e.received && !isAuthor() && !isGratuity)
      ? `<button class="edit-btn" onclick="voidExpense(${e.id})" title="Remove" aria-label="Remove" style="opacity:1;color:var(--red);">✕</button>` : '';
    const baseReceiptLink = e.receipt ? (
      e.receipt.startsWith('local://')
        ? `<a href="#" onclick="event.preventDefault(); viewLocalReceipt('${escapeHtml(e.receipt.replace('local://', ''))}')" style="font-size:11px;color:var(--gold);text-decoration:underline;">View Local</a>`
        : (followableUrl(e.receipt)
          ? `<a href="${escapeHtml(followableUrl(e.receipt))}" target="_blank" rel="noopener" style="font-size:11px;color:var(--gold);">View</a>`
          // Not local and not a followable address — a link here would look
          // ordinary and do nothing, which is how the shipping ledger's dead
          // reference link went unnoticed for so long.
          : `<span class="pill gray" style="font-size:10px;" title="This receipt reference cannot be opened">Unopenable ref</span>`)
    ) : isGratuity
      ? `<span class="pill gray" style="font-size:10px;" title="Gifted / promotional author copy (receipt exempt)">Gratuity copy</span>`
      : isRentExpense(e)
        ? `<span class="pill gray" style="font-size:10px;" title="Rent / lease payment (receipt exempt — verified via lease agreement & bank record)">Lease record</span>`
        // A gap in the paper trail is the one thing on this row that costs money
        // later, so it gets the same amber needs-attention pill the rest of the
        // app uses — not the faintest text in the row, which is what it was.
        : expenseMissingReceipt(e)
          ? `<span class="pill amber" style="font-size:10px;" title="No receipt attached — this is the expense an accountant will ask you to produce at tax time">⚠ No receipt</span>`
          : `<span class="pill gray" style="font-size:10px;" title="Backed by the reference in the Ref column">Ref on file</span>`;
    // A tracking URL can arrive straight from a carrier API response, so it is
    // external text reaching an href — allow-listed and escaped like any other.
    const trackHref = followableUrl(e.trackingUrl);
    const trackLink = trackHref
      ? ` <a href="${escapeHtml(trackHref)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--text3);" title="Track shipment">· Track</a>`
      : '';
    const receiptCell = baseReceiptLink + trackLink;

    // Calculate multi-currency stuff
    const eCur = e.currency || cur;
    const isBase = !eCur || eCur === 'CAD' || eCur === 'CA$' || normalizeCurrencyCode(eCur) === 'CAD';
    let baseAmountText = '';
    let baseAmountTitle = '';

    if (window.IS_PUBLISHER) {
      if (isBase) {
        baseAmountText = '-';
      } else if (e.baseAmount) {
        baseAmountText = fmt(e.baseAmount, 'CAD');
      } else if (Number(e.fxRate) > 0) {
        baseAmountText = fmt(e.amount * Number(e.fxRate), 'CAD');
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

    const selectCell = showSelectCol
      ? (eligibleIds.has(e.id)
        ? `<td><input type="checkbox" onchange="toggleExpenseReimburseSelect(${e.id}, this.checked)" ${_expReimburseSelection.has(e.id) ? 'checked' : ''}></td>`
        : '<td></td>')
      : '';

    const isSettledReimbursable = e.received && !isGratuity;
    return `<tr style="${isSettledReimbursable ? 'opacity:.5;' : ''}">
      ${selectCell}
      <td class="mono" style="color:var(--text3);">${fmtD(e.date) ?? '—'}</td>
      <td style="font-weight:600;">${escapeHtml(e.desc)}</td>
      <td><span class="pill gray" style="font-size:10px;">${escapeHtml(e.cat)}</span></td>
      <td class="mono" style="font-size:11px;color:var(--text3);">${escapeHtml(e.ref) || '—'}</td>
      <td>${receiptCell}</td>
      <td class="r" style="color:${isSettledReimbursable ? 'var(--text4)' : 'var(--red)'};font-family:'DM Mono',monospace;">${fmt(e.amount, eCur)}</td>
      ${window.IS_PUBLISHER ? `<td class="r" style="font-family:'DM Mono',monospace;color:var(--text3);"${baseAmountTitle ? ` title="${baseAmountTitle}"` : ''}>${baseAmountText}</td>` : ''}
      <td>${statusCell}</td>
      <td>${actionCell}</td>
    </tr>`;
  }).join('')
    + expenseTotalsFootHtml(expTotals, showSelectCol);

  updateBulkReimburseButton();
}

function toggleExpenseReimburseSelect(id, checked) {
  if (checked) _expReimburseSelection.add(id);
  else _expReimburseSelection.delete(id);
  updateBulkReimburseButton();
}

// Narrows the ledger to the expenses with no proof filed against them, so the
// list of things to chase is the list on screen. Purely a view toggle — nothing
// is written, so it works the same offline.
function toggleExpenseReceiptFilter() {
  _expMissingReceiptOnly = !_expMissingReceiptOnly;
  renderExpenses();
}

// Keeps the "no receipt" chip above the ledger honest: hidden when the paper
// trail is complete, otherwise labelled with the live count and carrying its
// own pressed state for screen readers.
function updateExpenseMissingReceiptButton(count) {
  const btn = $('exp-missing-receipt-btn');
  if (!btn) return;
  const labelEl = $('exp-missing-receipt-label');
  const n = Number(count) || 0;
  btn.style.display = n > 0 ? '' : 'none';
  if (labelEl) labelEl.textContent = `${n} without a receipt`;
  btn.classList.toggle('is-on', _expMissingReceiptOnly);
  btn.setAttribute('aria-pressed', _expMissingReceiptOnly ? 'true' : 'false');
  btn.title = _expMissingReceiptOnly
    ? 'Showing only expenses with no receipt — click to show every expense again'
    : `${n} expense${n === 1 ? ' has' : 's have'} no receipt attached. Click to show only those.`;
}

function updateBulkReimburseButton() {
  const btn = $('exp-bulk-reimburse-btn');
  const countEl = $('exp-bulk-reimburse-count');
  if (!btn) return;
  const n = _expReimburseSelection.size;
  if (countEl) countEl.textContent = n;
  btn.style.display = n > 0 ? '' : 'none';
}

// Sends one consolidated "please reimburse these" notification to the
// publisher for every expense the author checked, instead of chasing each
// one down individually.
async function requestBulkReimbursement() {
  const ids = Array.from(_expReimburseSelection);
  if (!ids.length) return;
  const s = getState(), book = getBook(), cur = book.currency;
  const idSet = new Set(ids);
  const items = (s.expenses || []).filter(e => idSet.has(e.id));
  if (!items.length) { _expReimburseSelection.clear(); updateBulkReimburseButton(); return; }

  const total = items.reduce((sum, e) => sum + (e.amount || 0), 0);
  const summary = `Reimbursement requested for ${items.length} expense${items.length !== 1 ? 's' : ''} — ${fmt(total, cur)}`;
  const btn = $('exp-bulk-reimburse-btn');
  const oldText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    await notifyPublisherSubmission('Reimbursement request', items, summary);
    showToast(`✓ Requested reimbursement for ${items.length} expense${items.length !== 1 ? 's' : ''}`);
    _expReimburseSelection.clear();
    renderExpenses();
  } catch (e) {
    console.error(e);
    showToast('⚠ Could not send reimbursement request', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
  }
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
    } catch (e) { }
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

export {
  calcExpenseFx,
  loadReceiptFileForScan,
  onExpenseCurrencyChange,
  readShippingFieldsFromReceipt,
  EXPENSE_CATEGORIES,
  RECEIPT_SCAN_SCHEMA,
  _applyScanCategory,
  _applyScanCurrency,
  _buildReceiptScanPrompt,
  _callGeminiForReceipts,
  _emailBodyToReceiptFile,
  _expenseFxRate,
  _expenseHasReceipt,
  _extractReceiptFromFile,
  _fileToBase64,
  _findDuplicateExpense,
  _inboxItemToDraft,
  _isLikelyDuplicateExpense,
  _localReceiptCell,
  _prepareReceiptUpload,
  _receiptMimeFor,
  _runReceiptScan,
  _saveDraftReceiptFiles,
  _selectedFileParts,
  _setEmailAttExcluded,
  _setReceiptCamStatus,
  _stopReceiptCamStream,
  applyBatchExpenseBulk,
  applyBulkCategoryToEmailDrafts,
  applyGmailPresetQuery,
  attachReceiptToExpenseRow,
  authorizeReceiptFolder,
  backfillReceiptCache,
  batchExpenseAddBlankRow,
  batchExpenseDestinations,
  batchExpenseDragLeave,
  batchExpenseDragOver,
  batchExpenseDrop,
  batchExpenseFilesChosen,
  batchScanAndRelinkReceipts,
  cacheAllReceiptsNow,
  cacheReceiptFile,
  cancelEmailReceiptExtraction,
  captureReceiptPhoto,
  checkReceiptFolderHealth,
  chooseOrganizerSource,
  closeBatchExpenseModal,
  closeCloudReceiptsModal,
  closeEmailReceiptImportModal,
  closeExportReceiptsModal,
  closeReceiptCameraModal,
  closeReceiptOrganizer,
  cloudReceiptOwners,
  cloudReceiptQueue,
  copyReceiptDiagnostic,
  deleteCachedReceipt,
  deselectDuplicateBatchExpenses,
  deselectDuplicateEmailDrafts,
  evictReceiptCacheToBudget,
  expFileChosen,
  expFileClear,
  expFileDragLeave,
  expFileDragOver,
  expFileDrop,
  exportReceiptsZip,
  extractReceiptsFromEmailText,
  formatReceiptDiagnostic,
  getPendingWebcamReceipt,
  importEmailReceiptDrafts,
  inferReceiptCategory,
  listCachedReceiptMeta,
  listFilesRecursive,
  loadGmailInboxDrafts,
  loadReceiptFolderHandle,
  localizeInboxReceiptFiles,
  makeReceiptPreview,
  normalizeReceiptDate,
  openBatchExpenseModal,
  openBlobInTab,
  openCloudReceiptsModal,
  openEmailReceiptImportModal,
  openExportReceiptsModal,
  openReceiptCacheDb,
  openReceiptCameraModal,
  openReceiptHandleDb,
  openReceiptOrganizer,
  organizerCandidateExpenses,
  organizerReadUnclear,
  parseEmlOrText,
  readCachedReceipt,
  readReceiptBytes,
  readReceiptFiles,
  receiptExportYears,
  receiptFolderReachable,
  receiptWaitingDays,
  receiptsForExport,
  reclaimCloudReceipts,
  reclaimCloudReceiptsNow,
  reclaimOneReceipt,
  removeBatchExpenseRow,
  renderBatchExpenseModal,
  renderBatchExpenseRows,
  renderEmailPreviewContent,
  renderEmailReceiptDrafts,
  renderExpenses,
  renderGmailChips,
  renderGmailEmailsList,
  renderOrganizerTable,
  renderReceiptCacheStatus,
  renderReceiptFolderAlert,
  renderReceiptProblemPanel,
  requestBulkReimbursement,
  rescanBatchExpenseRow,
  resolveLocalReceiptFile,
  retakeReceiptPhoto,
  retryFailedEmailExtractions,
  runReceiptExport,
  runReceiptOrganizer,
  saveReceiptBestEffort,
  saveReceiptFolderHandle,
  saveReceiptToLocalFile,
  scanAllBatchExpenses,
  scanProjectReceiptWithAI,
  searchGmailEmails,
  setBatchExpenseDest,
  setPendingWebcamReceipt,
  setupReceiptFolder,
  startEmailInboxWatcher,
  submitBatchExpenses,
  submitExpense,
  summarizeReceiptProblems,
  switchEmailImportTab,
  toggleAllBatchExpenses,
  toggleAllEmailDrafts,
  toggleAllGmailSelections,
  toggleEmailPreview,
  toggleEmailRowSelection,
  toggleExpenseReceiptFilter,
  toggleExpenseReimburseSelect,
  toggleOrganizerSkip,
  updateEmailInboxBadge,
  updateExpenseForm,
  uploadReceiptToCloud,
  useReceiptPhoto,
  viewLocalReceipt,
  voidExpense,
};
