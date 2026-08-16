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
  RECEIPT_SCAN_SCHEMA,
  TAX_CATEGORIES,
  TAX_CENTER,
  TC_CATEGORIES,
  _buildReceiptScanPrompt,
  _callGeminiForReceipts,
  _editingExpense,
  _parseReceiptJson,
  _prepareReceiptUpload,
  isGratuityExpense,
  saveState,
  showToast,
  states,
} from '../main.js';
import { escapeHtml } from '../lib/html.js';
import { fmt } from '../lib/money.js';
import { openM, closeM, confirmDialog } from '../lib/modal.js';
import { toCsv } from '../lib/csv.js';
import { downloadBlob } from '../lib/download.js';
import { createZip, textEntry } from '../lib/zip.js';
import { planFile } from '../lib/receipt-match.js';
import {
  cloudReceiptRefs, externalLinkRefs, isCloudReceipt, isExternalLink,
  isLocalReceipt, isOurCloudReceipt, isRentExpense, localRefPath,
  receiptOwners, receiptRefsOf, toLocalRef, uniqueFileName, writeReceiptRefs,
} from '../lib/receipt-storage.js';
import {
  PREVIEW_MAX_EDGE, PREVIEW_QUALITY, cacheKeyFor, cachePlanFor, cacheStats,
  formatCacheSize, planEviction, previewDimensions, uncachedRefs,
} from '../lib/receipt-cache.js';
import {
  describeDestination, receiptFileName, receiptFolderPath, vendorFrom,
} from '../lib/receipt-naming.js';
import {
  isExpiringLabelUrl, isLabelUrlExpired, shippoTxIdFromRef,
} from '../lib/shippo-invoices.js';
import { renderTaxCenter, saveTaxCenter, tcExpenseRowDrop } from './taxcentre.js';

const RECEIPT_FOLDER_DB = 'lm-receipt-folder-db';
const RECEIPT_FOLDER_STORE = 'handles';
const RECEIPT_FOLDER_KEY = 'preferred-receipt-folder';
// Standby copies of receipt files, so a moved folder can't blank the ledger.
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
    return `<a href="${r}" target="_blank" rel="noopener" style="color:var(--gold3);">${label}</a>`;
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
    'Lyrical Inventory — receipt move diagnostic',
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

export {
  _localReceiptCell,
  _setReceiptCamStatus,
  _stopReceiptCamStream,
  attachReceiptToExpenseRow,
  authorizeReceiptFolder,
  backfillReceiptCache,
  batchScanAndRelinkReceipts,
  cacheAllReceiptsNow,
  cacheReceiptFile,
  captureReceiptPhoto,
  checkReceiptFolderHealth,
  chooseOrganizerSource,
  closeCloudReceiptsModal,
  closeExportReceiptsModal,
  closeReceiptCameraModal,
  closeReceiptOrganizer,
  cloudReceiptOwners,
  cloudReceiptQueue,
  copyReceiptDiagnostic,
  deleteCachedReceipt,
  evictReceiptCacheToBudget,
  exportReceiptsZip,
  formatReceiptDiagnostic,
  getPendingWebcamReceipt,
  listCachedReceiptMeta,
  listFilesRecursive,
  loadReceiptFolderHandle,
  makeReceiptPreview,
  openBlobInTab,
  openCloudReceiptsModal,
  openExportReceiptsModal,
  openReceiptCacheDb,
  openReceiptCameraModal,
  openReceiptHandleDb,
  openReceiptOrganizer,
  organizerCandidateExpenses,
  organizerReadUnclear,
  readCachedReceipt,
  readReceiptBytes,
  receiptExportYears,
  receiptFolderReachable,
  receiptWaitingDays,
  receiptsForExport,
  reclaimCloudReceipts,
  reclaimCloudReceiptsNow,
  reclaimOneReceipt,
  renderOrganizerTable,
  renderReceiptCacheStatus,
  renderReceiptFolderAlert,
  renderReceiptProblemPanel,
  resolveLocalReceiptFile,
  retakeReceiptPhoto,
  runReceiptExport,
  runReceiptOrganizer,
  saveReceiptBestEffort,
  saveReceiptFolderHandle,
  saveReceiptToLocalFile,
  setPendingWebcamReceipt,
  setupReceiptFolder,
  summarizeReceiptProblems,
  toggleOrganizerSkip,
  uploadReceiptToCloud,
  useReceiptPhoto,
  viewLocalReceipt,
};
