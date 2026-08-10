// Design system foundation (tokens + interaction baseline) loads first so that
// unlayered legacy rules in style.css keep winning on any conflict.
import './styles/system.css';
import './style.css';
import './firebase.js';
import { registerSW } from 'virtual:pwa-register';
import {
  getSym,
  normalizeCurrencyCode,
  fmt,
  fmtD,
  getBookCurrencyCode,
  paymentSummary,
  buildPaymentMeta,
  cadEquivalentForSale,
  hexToRgba,
  PAYMENT_TYPE_DIRECT_TO_ARTIST,
  isDirectToArtistSale,
  getContrastColor,
  lightenColor,
  getContrastSafeText,
} from './lib/money.js';
import {
  bookCurrencyCode,
  collectNativeAmounts,
  detectCurrencyMismatch,
  planCurrencyChange,
  applyCurrencyChange,
  stampNativeCurrency,
  appendCurrencyLog,
  describePlan,
} from './lib/currency-migration.js';
import { calcArtistEarnings, tierEffectiveCap } from './lib/earnings.js';
import { escapeHtml } from './lib/html.js';
import {
  QR_PRESET_PRICE_CURRENCIES,
  loadQrPresets,
  saveQrPresets,
  upsertQrPreset,
  removeQrPreset,
  findQrPreset,
  qrPresetId,
  qrPresetMissingBooks,
  qrPresetSummary,
} from './lib/qr-presets.js';
import {
  loadStPresets,
  saveStPresets,
  upsertStPreset,
  removeStPreset,
  findStPreset,
  stPresetId,
  stPresetMissingBooks,
  stPresetSummary,
} from './lib/sales-tracker-presets.js';
import {
  saveTaxCenter,
  processRecurringExpenses,
  tcExpenseRowDragOver,
  tcExpenseRowDragLeave,
  tcExpenseRowDrop,
  downloadTaxReport,
  _tcSaveLedgerPrefs,
  _tcRestoreLedgerPrefs,
  setTcLedgerPage,
  tcLedgerSearchInput,
  tcLedgerTypeFilter,
  tcYearChange,
  tcLedgerYearChange,
  tcClearLedgerFilters,
  _tcApplyLedgerFilter,
  _tcRenderRecurringSubscriptions,
  _tcRenderLedgerPagination,
  _tcRenderLedgerFilterChip,
  _tcRenderLedgerFoot,
  _tcRenderLedgerTable,
  _tcRenderCategoryPanel,
  tcSetTripsView,
  _tcGetTripsSummaryAll,
  tcRenderQuickTripChips,
  tcUpdateTripSelectedPreview,
  tcClearSelectedTrip,
  tcOpenTripDropdown,
  tcCloseTripDropdown,
  tcToggleTripDropdown,
  tcFilterTripDropdown,
  tcSelectTripOption,
  _tcTripRecords,
  _tcFindTripRecord,
  openNewTrip,
  openEditTripDetails,
  tcNewTripValidate,
  saveNewTrip,
  deleteTripRecord,
  logExpenseForTrip,
  openPendingExpense,
  tcPendingValidate,
  tcPendingRemindIn,
  savePendingExpense,
  deletePendingExpense,
  snoozePendingExpense,
  confirmPendingExpense,
  _tcClearConfirmedPending,
  _tcPendingList,
  _tcRenderPendingPanel,
  exportTripPDF,
  _tcTripReportReceipts,
  _tcIsPdfName,
  _tcBlobToDataUrl,
  _tcPdfToImages,
  _tcResolveReceiptImages,
  _tcRenderTripsPanel,
  _tcBuildLedger,
  _tcRenderStatusHeaders,
  renderTaxCenter,
  _tcSvgEsc,
  _tcDeltaChip,
  _tcRenderCashFlowSummary,
  _tcCashFlowBucketRows,
  _tcRenderSelectedCashFlowBucket,
  tcSelectCashFlowBucket,
  tcSetCashFlowDetailType,
  tcClearCashFlowBucket,
  _tcBuildCashFlowChart,
  openEditArtistPayout,
  saveTaxCenterSettings,
  openRecurringEditor,
  saveRecurringEditor,
  updateRecurringPreview,
  toggleRecurringPause,
  tcSetRecurringFilter,
  tcShowRecurringCharges,
  removeRecurring,
  downloadTaxLedgerCSV,
} from './features/taxcentre.js';
import {
  reconcileApplyBigCartel,
  extractBigCartelAddress,
  renderBigCartelTab,
  testBigCartelConnection,
  saveBigCartelSettings,
  loadBigCartelData,
  copyBigCartelOrderAddress,
  openBigCartelAddressPreview,
  prefillShippingFromBigCartelOrder,
  switchBigCartelSubTab,
  syncBigCartelShippingPaid,
  triggerBigCartelShippingSync,
} from './features/bigcartel.js';
import {
  _shippoDestMasterList,
  getShippingReconciliationOrders,
  renderOrderShippingSummary,
  backfillShipping,
  _toggleShippingPanel,
  openLabelModal,
  updateShippedStatusUI,
  toggleShipped,
  printShippingLabel,
  shippingPurchaseRowPayload,
  getShippoTxCost,
  saveShippoLabelLocally,
  fetchShippoTransactionsPageAPI,
  fetchShippoObject,
  fetchShippoContext,
  renderShippingReconciliationWorklist,
  closeShippingReconciliation,
  openShippingReconciliation,
  clearShippingReconciliationList,
  linkShippingExpense,
  processShippoTxToExpense,
  importShippoShippingFromApi,
  getBookPresetSpecs,
  initShippingTab,
  getFallbackShippingPhone,
  renderCustomShippoDestPicker,
  setShippoDestMenuOpenState,
  toggleShippoDestDropdown,
  setShippoDestCategoryFilter,
  filterShippoDestMenu,
  selectShippoDestCustomItem,
  clearShippoDestSelection,
  getRecentShippingOrders,
  saveShippoApiKey,
  editShippoApiKey,
  onShippoPreFillDestChange,
  onShippoBookPresetChange,
  isCanadaPostRate,
  moneyAmount,
  roundShippingCharge,
  buildShippingChargePrediction,
  renderShippingChargePrediction,
  collectShippoMessages,
  renderShippoDiagnostics,
  buyShippoLabel,
  calculateShippoRates,
  editPostageCost,
  unlinkManualPostage,
  dismissShippingAnalysisOrder,
  restoreShippingAnalysisOrder,
  toggleAllShipAnalysisOrders,
  updateShipAnalysisBatchActionUI,
  batchDismissShippingAnalysisOrders,
  toggleShipAnalysisCarrierFilter,
  toggleShipAnalysisRegionFilter,
  toggleShipAnalysisWeightFilter,
  clearAllShipAnalysisFilters,
  changeShipAnalysisPage,
  onShipAnalysisBookFilterChange,
  setShipAnalysisMarginFilter,
  onShipAnalysisSearch,
  onInlinePostageChange,
  confirmSuggestedShippoLink,
  openManualShippoLinkModal,
  filterManualShippoLinkRows,
  doManualShippoLink,
  closeManualShippoLinkModal,
  unlinkShippoExpense,
  getShipRecoPercentile,
  setShipRecoPercentile,
  onShipInsightsToggle,
  onShipRecoModeChange,
  onShipRecoPercentileChange,
  onShipRecoWeightSelectChange,
  onShipRecoCustomWeightChange,
  updateManualShippingRates,
  applySmartShippingRates,
  renderShippingAnalysisHub,
  updateShippingSimulation,
  downloadFilteredShippingLedgerCSV,
  updateShippoBaseSpecsFromInputs,
  onShippoQuantityChange,
  renderShippoIncotermHint,
  onShippoIncotermChange,
  onShippoDestCountryChange,
  updateShippoCustomsTotalHint,
  verifyDestinationAddress,
  applyVerifiedAddressCorrections,
  dismissAddressVerification,
  verifyLedgerOrderAddress,
  batchVerifyLedgerAddresses,
  applyLedgerAddressCorrections,
} from './features/shipping.js';
import {
  ocList,
  ocBlockedForAuthor_,
  ocEnsureQueues_,
  ocQueueNextStep_,
  ocStamp_,
  ocUiOpen_,
  ocToggleSection,
  ocTogglePhotoPick,
  ocSetSort,
  ocSetTmplTab,
  ocUpdateTmplPreview,
  ocThreadForStage,
  openOcBulkModal,
  ocBulkModalEscHandler,
  closeOcBulkModal,
  renderOcBulkModalContent,
  ocBulkSelectAll,
  ocBulkUpdateCount,
  sendOcBulkTestEmail,
  onOcBulkStageChange,
  sendOcBulkEmails,
  cancelOcBulkSend,
  ocInitials,
  openOcBulkRemoveModal,
  closeOcBulkRemoveModal,
  renderOcBulkRemoveModalContent,
  ocBulkRemoveSelectAll,
  ocBulkRemoveUpdateCount,
  ocBulkRemoveFilter,
  executeOcBulkRemove,
  renderOpenCall,
  ocToggleResend,
  ocSaveResendConfig,
  ocSaveSenderConfig,
  ocFetchMailSenderInfo,
  _ocScheduleCache,
  _ocScheduleCacheSet,
  _ocScheduleRequest,
  ocSnapshotContributors_,
  ocPushSnapshot_,
  ocScheduleSnapshotPush_,
  ocSetServerSchedule,
  ocRefreshScheduleStatus_,
  ocLoadSenderAliases,
  handleOcPhotoKeydown,
  addOcPhotoChip,
  removeOcPhotoChip,
  renderOcPhotoChips,
  ocAddPhotoToContributor,
  ocRemovePhotoFromContributor,
  ocAdd,
  ocToggleImport,
  ocRunImport,
  ocToggle,
  ocDelete,
  ocReadProposalCreditEdit_,
  ocFlashCard_,
  ocApproveProposal,
  ocDismissProposal,
  ocApproveAllProposals,
  ocOutboxRemove,
  ocOutboxSendAll,
  ocCopyEmails,
  ocSearch,
  ocFilterByStage,
  checkOcEmailTypo,
  applyOcEmailCorrection,
  loadOpenCalls,
  _persistOpenCalls,
  migrateLegacyOpenCalls,
  ocCreateProject,
  ocRenameProject,
  ocDeleteProject,
  ocSwitchProject,
  ocToggleColorPalette,
  ocApplyColor,
  updateOpenCallBadges,
  ocApplyParsedImport_,
  handleOcCsvFile,
  triggerOcCsvUpload,
  handleOcCsvUpload,
  handleOcCsvDragOver,
  handleOcCsvDragLeave,
  handleOcCsvDrop,
  ocComposeStageEmail,
  openOcEmailPreviewModal,
  closeOcEmailPreviewModal,
  ocPreviewModalSend,
  ocPreviewModalEditInWizard,
  ocScanReplies,
  openOcImportGmailModal,
  closeOcImportGmailModal,
  renderOcImportGmailModal,
  ocImportGmailSearch,
  ocImportGmailSelectAll,
  ocImportGmailConfirm,
  ocScanRepliesSingle,
  ocToggleInlineThread,
  openOcEditModal,
  closeOcEditModal,
  renderOcEditModalContent,
  ocClearUndeliverable,
  saveOcContributor,
  downloadOcAttachment,
  ocUpdateBulkPreview,
  ocSaveTemplates,
  exportOpenCallCSV,
} from './features/opencall.js';
import { csvCell, toCsv } from './lib/csv.js';
import { downloadText, downloadCsv } from './lib/download.js';
import { OC_STAGES } from './lib/opencall.js';
import { deriveOnHand, buildOrderTimeline, inventoryBreakdown, deduplicateDirectConsignmentSales, recalculateBookStatsFromHistory } from './lib/inventory.js';
import { histMirrorForLedger, stampLedgerInvoiceLink, reconcileConsignmentInvoiceLinks, consignmentSyncPayload } from './lib/consignment.js';

// ─────────────────────────────────────────────
// CLIENT ERROR REPORTING
// ─────────────────────────────────────────────
// Installed first thing, before any app code runs, so errors thrown during
// start-up are caught too.
//
// Until now nothing observed failures in the field. An exception inside an
// async handler becomes a rejected promise and disappears — no console anyone
// reads, no toast, no report. That is how a "Relink" button calling a
// non-existent promptDialog stayed broken: it rendered fine and did nothing.
// On a POS and ledger app the first sign of a fault should not be a customer
// mentioning it.
//
// Deliberately silent to the user. Toasting every scripting error would be
// worse than the disease; these go to a publisher-only Firestore collection to
// be read after the fact.
const ERR_MAX_PER_SESSION = 25;
const _errSeen = new Set();
let _errCount = 0;
let _errPending = [];   // buffered until Firebase is ready (start-up errors)
let _errFlushing = false;

function _errSignature(entry) {
  return [entry.kind, entry.message, entry.source, entry.line].join('|');
}

function _flushClientErrors() {
  if (_errFlushing || !_errPending.length) return;
  if (typeof window._fbLogClientError !== 'function') return;
  _errFlushing = true;
  const batch = _errPending;
  _errPending = [];
  Promise.allSettled(batch.map(e => window._fbLogClientError(e)))
    .catch(() => { })
    .finally(() => {
      _errFlushing = false;
      // Anything that arrived mid-flight goes out on the next tick.
      if (_errPending.length) setTimeout(_flushClientErrors, 0);
    });
}

// Each context field is gathered behind its own guard. This function runs
// before most of the module has evaluated, so reading a `let` declared further
// down (IS_AUTHOR_MODE, activeBook) throws a temporal-dead-zone ReferenceError
// during start-up — and a start-up error is precisely the one worth keeping.
// Degrade the field, never the report.
function _errField(read, fallback) {
  try { const v = read(); return v == null ? fallback : v; } catch (_) { return fallback; }
}

// Nothing in here may throw: an error reporter that raises its own error would
// recurse through the very listeners that called it.
function reportClientError(kind, message, extra = {}) {
  try {
    if (_errCount >= ERR_MAX_PER_SESSION) return;
    const entry = {
      kind,
      message: String(message ?? 'unknown').slice(0, 500),
      stack: String(extra.stack || '').slice(0, 2000),
      source: String(extra.source || '').slice(0, 300),
      line: Number(extra.line) || 0,
      // Context that makes a report actionable without carrying book data,
      // customer details or anything else private into the log.
      tab: _errField(() => (document.querySelector('.tab-panel.active') || {}).id, ''),
      role: _errField(() => (window.IS_PUBLISHER ? 'publisher' : (IS_AUTHOR_MODE ? 'author' : 'anon')), 'unknown'),
      book: _errField(() => (typeof activeBook === 'string' ? activeBook : ''), ''),
      online: _errField(() => !!navigator.onLine, false),
      build: _errField(() => (typeof __GIT_COMMIT_DATE__ === 'string' ? __GIT_COMMIT_DATE__ : ''), ''),
      ua: _errField(() => String(navigator.userAgent || '').slice(0, 300), ''),
      ts: Date.now(),
    };

    // One report per distinct fault per session — a failure inside a render
    // loop would otherwise write thousands of identical rows.
    const sig = _errSignature(entry);
    if (_errSeen.has(sig)) return;
    _errSeen.add(sig);
    _errCount++;

    if (_errPending.length < 50) _errPending.push(entry);
    _flushClientErrors();
  } catch (_) {
    // Reporting is best-effort by definition.
  }
}

window.addEventListener('error', (e) => {
  reportClientError('error', e && e.message, {
    stack: e && e.error && e.error.stack,
    source: e && e.filename,
    line: e && e.lineno,
  });
});

// The important one. `await somethingUndefined()` inside a click handler lands
// here and nowhere else.
window.addEventListener('unhandledrejection', (e) => {
  const r = e && e.reason;
  reportClientError('unhandledrejection', (r && r.message) || r, { stack: r && r.stack });
});

// Start-up errors are buffered until Firebase can accept them.
document.addEventListener('firebase-ready', _flushClientErrors);
window.addEventListener('online', _flushClientErrors);

let updateSWFunc = null;

function revealUpdatingScreen() {
  const upScreen = document.getElementById('updating-screen');
  if (!upScreen) return;
  upScreen.setAttribute('aria-hidden', 'false');
  upScreen.classList.add('is-visible');
}

function hideUpdatePrompt() {
  const pwaPrompt = document.getElementById('pwa-update-prompt');
  if (!pwaPrompt) return;
  pwaPrompt.classList.remove('is-visible');
}

function bindUpdatePromptInteractions() {
  const pwaPrompt = document.getElementById('pwa-update-prompt');
  if (!pwaPrompt || pwaPrompt.dataset.bound === 'true') return;
  pwaPrompt.dataset.bound = 'true';
  pwaPrompt.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    window.triggerPwaUpdate();
  });
  pwaPrompt.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest('button')) return;
    event.preventDefault();
    window.triggerPwaUpdate();
  });
}

const _updateSW = registerSW({
  onNeedRefresh() {
    updateSWFunc = () => {
      hideUpdatePrompt();
      revealUpdatingScreen();
      setTimeout(() => {
        _updateSW(true);
      }, 520);
    };

    const pwaPrompt = document.getElementById('pwa-update-prompt');
    if (pwaPrompt) {
      bindUpdatePromptInteractions();
      pwaPrompt.classList.add('is-visible');
    }
  },
  onOfflineReady() {
    showToast('✓ App is ready to work offline', 'ok');
  }
});

window.triggerPwaUpdate = function () {
  if (typeof updateSWFunc === 'function') {
    updateSWFunc();
  }
};

window.dismissPwaUpdate = function (event) {
  if (event) event.stopPropagation();
  hideUpdatePrompt();
};

// ═══════════════════════════════════════════════════════
//  BOOK CATALOGUE
//  Add/edit books here. Each book gets its own Firebase
//  node, its own tab, and its own shareable URL.
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
//  BOOK CATALOGUE (Dynamicly loaded from Firebase)
// ═══════════════════════════════════════════════════════
export let BOOKS = {};
export let BOOK_LIST = []; // always mirrors Object.values(BOOKS) — updated at every BOOKS mutation
let editingBookId = null;
let WEBSITE_PAYMENT_METHODS = ['stripe', 'paypal', 'interac', 'cash_card'];
let pmSelectedBookId = '';
// IDs of DEFAULT_BOOKS that the user has explicitly removed. Persisted in the
// catalog Firebase doc so the merge below doesn't resurrect them on next load.
let deletedDefaultIds = [];
// POS-only books. These live entirely outside BOOKS so they never touch the
// catalog, inventory, ledger, financials, or history (all of which iterate
// BOOKS). They surface only at the Point of Sale, the printable sales tracker,
// and the printable payment-QR sheet. Keyed by id. Each carries an isolated
// `sold`/`revenue` tally updated at checkout. Persisted in the catalog doc
// under `_posExtra` so it syncs across devices and survives offline.
let posExtraBooks = {};
let editingPosBookId = null;

export function isTestBook(b) {
  if (!b) return false;
  const idLower = String(b.id || '').toLowerCase().trim();
  const titleLower = String(b.title || '').toLowerCase().trim();
  return idLower === 'test1' || idLower === 'testpage' || idLower.includes('test') ||
    titleLower === 'test1' || titleLower === 'testpage' || titleLower.includes('test');
}

export function isTestBookId(bid) {
  if (!bid) return false;
  const str = String(bid).toLowerCase().trim();
  if (str === 'test1' || str === 'testpage' || str.includes('test')) return true;
  if (BOOKS && BOOKS[bid]) return isTestBook(BOOKS[bid]);
  if (BOOKS) {
    const found = Object.values(BOOKS).find(b => (b.id && String(b.id).toLowerCase() === str) || (b.title && String(b.title).toLowerCase() === str));
    if (found) return isTestBook(found);
  }
  return false;
}

// Build the rules-readable ownership map from the live catalog. Keyed by book
// id → owning author's (lowercased) Google email; books with no author are left
// out so they stay publisher-only.
// The test profile renders purple throughout, so a screen full of seeded mock
// data is never mistaken for real sales.
//
// This used to be enforced by src/test-profile-tint-fix.js, a separate script
// loaded after main.js that ran two MutationObservers: one watched
// documentElement's style attribute and rewrote the accent variables just after
// switchBook had set them, and one watched the whole of document.body with
// subtree:true and re-coloured dots on every DOM change anywhere in the app —
// in a UI that assigns innerHTML in 300-odd places, so it ran constantly.
//
// None of that is needed. Every accent variable and every coloured dot already
// derives from book.accent, so normalising that single property once at load
// time produces the same appearance with no observers and no repainting after
// the fact.
const TEST_BOOK_ACCENT = '#8b5cf6';
const TEST_BOOK_ACCENT_BG = 'rgba(139, 92, 246, 0.1)';

function normalizeTestBookAccents() {
  Object.values(BOOKS || {}).forEach(b => {
    if (isTestBook(b)) {
      b.accent = TEST_BOOK_ACCENT;
      b.accentBg = TEST_BOOK_ACCENT_BG;
    }
  });
  BOOK_LIST = Object.values(BOOKS);
}

// A 6% wash of the active book's accent behind the whole page. Read by
// `body{background:var(--body-bg-tint)}` in style.css.
function applyBodyTint(bookId) {
  const book = (bookId && bookId !== 'all') ? BOOKS[bookId] : null;
  const accent = book && book.accent;
  // hexToRgba expects #rrggbb; anything else (a CSS keyword, a var()) can't be
  // faded, so fall back to no tint rather than emitting a broken colour.
  const tint = (typeof accent === 'string' && /^#[0-9a-f]{6}$/i.test(accent))
    ? hexToRgba(accent, 0.06)
    : 'transparent';
  document.documentElement.style.setProperty('--body-bg-tint', tint);
}

function ownersFromBooks() {
  const owners = {};
  Object.keys(BOOKS).forEach(id => {
    const email = (BOOKS[id].authorEmail || '').toLowerCase().trim();
    if (email) owners[id] = email;
  });
  return owners;
}

function saveCatalogWithDeletions() {
  // Keep the rules-readable ownership map in step with the catalog so the
  // tightened security rules can verify author→book ownership. Publisher-only —
  // authors can't write settings (rules reject), so skip to avoid noisy errors.
  if (window.IS_PUBLISHER && typeof window._fbSaveBookOwners === 'function') {
    window._fbSaveBookOwners(ownersFromBooks());
  }
  return window._fbSaveCatalog({ ...BOOKS, _deletedDefaults: deletedDefaultIds, _posExtra: posExtraBooks });
}
const DEFAULT_BOOKS = {
  altrove: { id: 'altrove', title: 'Un Fantastico Altrove', author: 'Silvia Clo Di Gregorio', isbn: '—', maxPrint: 120, listPrice: 40, currency: '€', threshold: 15, productionCost: 0, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#c8913a', accentBg: 'rgba(200,145,58,.1)', urlParam: 'altrove', authorPassword: 'silvia2025' },
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
      posExtraBooks = (stored._posExtra && typeof stored._posExtra === 'object') ? { ...stored._posExtra } : {};
      const storedBooks = { ...stored };
      delete storedBooks._deletedDefaults;
      delete storedBooks._posExtra;
      const filteredDefaults = {};
      Object.keys(DEFAULT_BOOKS).forEach(id => {
        if (!deletedDefaultIds.includes(id)) filteredDefaults[id] = DEFAULT_BOOKS[id];
      });
      BOOKS = { ...filteredDefaults, ...storedBooks };
      BOOK_LIST = Object.values(BOOKS);
      normalizeTestBookAccents();
      if (Object.keys(BOOKS).length > Object.keys(storedBooks).length) {
        await saveCatalogWithDeletions();
      }
    } else {
      BOOKS = { ...DEFAULT_BOOKS };
      BOOK_LIST = Object.values(BOOKS);
      normalizeTestBookAccents();
      deletedDefaultIds = [];
      posExtraBooks = {};
      await saveCatalogWithDeletions();
    }
  } catch (e) {
    console.error('Critical error loading catalog', e);
    BOOKS = { ...DEFAULT_BOOKS };
    BOOK_LIST = Object.values(BOOKS);
    normalizeTestBookAccents();
    deletedDefaultIds = [];
    posExtraBooks = {};
  }
}

async function syncCatalog() {
  await loadCatalog();
  await loadPaymentLinks();
  await loadProductionCosts();
  await loadWebsitePaymentMethods();
  if (window.IS_PUBLISHER) {
    try {
      await saveCatalogWithDeletions();
    } catch (_) { }
  }
}

function switchBookModalTab(tabName) {
  const tabs = ['general', 'sales', 'costs'];
  tabs.forEach(t => {
    const btn = $('book-modal-tab-' + t);
    const panel = $('book-panel-' + t);
    if (btn && panel) {
      if (t === tabName) {
        btn.classList.add('active');
        panel.style.display = '';
      } else {
        btn.classList.remove('active');
        panel.style.display = 'none';
      }
    }
  });
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
  if ($('nb-pub-grat')) $('nb-pub-grat').value = '0';
  if ($('nb-author-grat')) $('nb-author-grat').value = '0';
  $('nb-paylink').value = '';
  if ($('nb-payment-link')) $('nb-payment-link').value = 'https://paypal.me/lyricalmyricalbooks';
  $('nb-ship-length').value = '';
  $('nb-ship-width').value = '';
  $('nb-ship-height').value = '';
  $('nb-ship-dim-unit').value = 'in';
  $('nb-ship-weight').value = '';
  $('nb-ship-weight-unit').value = 'lb';
  $('nb-ship-hs').value = '490199';
  switchBookModalTab('general');
}

function openAddBookModal() {
  resetBookForm();
  updateModalAccentPreview($('nb-accent'));
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
  if ($('nb-pub-grat')) $('nb-pub-grat').value = book.pubGratuity ?? 0;
  if ($('nb-author-grat')) $('nb-author-grat').value = book.authorGratuity ?? 0;
  $('nb-paylink').value = book.stripeLink || '';
  if ($('nb-payment-link')) $('nb-payment-link').value = book.paymentLink || 'https://paypal.me/lyricalmyricalbooks';
  $('nb-ship-length').value = book.shipLength ?? '';
  $('nb-ship-width').value = book.shipWidth ?? '';
  $('nb-ship-height').value = book.shipHeight ?? '';
  $('nb-ship-dim-unit').value = book.shipDimUnit || 'in';
  $('nb-ship-weight').value = book.shipWeight ?? '';
  $('nb-ship-weight-unit').value = book.shipWeightUnit || 'lb';
  $('nb-ship-hs').value = book.shipHsCode || '490199';
  switchBookModalTab('general');
  updateModalAccentPreview($('nb-accent'));
  openM('add-book');
}

function closeAddBookModal() {
  closeM('add-book');
  resetBookForm();
}

function isValidPaymentLink(str) {
  if (!str) return true; // Optional/cleared is fine
  // Email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // URL validation
  let isUrl = false;
  try {
    const url = new URL(str);
    isUrl = url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    isUrl = false;
  }
  return emailRegex.test(str) || isUrl;
}

function updateUnsavedIndicator() {
  const ind = $('add-book-unsaved-indicator');
  if (!ind) return;
  const isChanged = _modalSnapshots['add-book'] !== undefined && _modalFieldSig('add-book') !== _modalSnapshots['add-book'];
  if (isChanged) {
    ind.classList.add('show');
  } else {
    ind.classList.remove('show');
  }
}
window.updateUnsavedIndicator = updateUnsavedIndicator;

// ── BOOK CURRENCY RESTATEMENT ────────────────────────────────────────────────
// Changing a book's currency is not a cosmetic edit. Every monetary number on
// the book is stored as a bare Number whose currency is inferred from
// `book.currency` at render time, so flipping that field retroactively
// re-denominates the entire history: a €32 sale becomes a CA$32 sale, revenue
// and artist tiers shift by the FX gap, and nothing warns you. This dialog
// stands in the way of that, and doubles as the repair tool for a book where it
// already happened.

let _ccCtx = null;

// Rates keyed by the entry date they apply to. Populated on demand from the FX
// APIs; '' is the key for undated records (rollups, list price, store balances).
async function _ccFetchRates(from, to, dates) {
  const out = {};
  const live = await fetchLiveRate(from, to);
  if (live && live.rate) out[''] = live.rate;
  // Sequential and deduped: a book with 200 sales usually spans a few dozen
  // distinct days, and firing them all at once gets us rate-limited.
  for (const d of dates) {
    const r = await fetchHistoricalRate(from, to, d);
    out[d] = (r && r.rate) ? r.rate : (out[''] || 0);
  }
  return out;
}

function _ccRateFor(date) {
  if (!_ccCtx) return 0;
  if (_ccCtx.rateMode === 'flat') return _ccCtx.flatRate || 0;
  const byDate = _ccCtx.rates || {};
  // Undated records and any date the FX API couldn't serve fall back to the
  // flat/live rate, so a weekend sale or an offline lookup never silently
  // drops an amount out of the conversion.
  return byDate[date || ''] || byDate[''] || _ccCtx.flatRate || 0;
}

// Build the plan for the current dialog state. Book-level fields the user
// retyped in the same save are excluded: if they changed the currency AND typed
// a new list price, that price is already in the new currency and converting it
// would double the move.
function _ccBuildPlan() {
  if (!_ccCtx) return null;
  const manual = _ccCtx.manualBookFields || [];
  return planCurrencyChange({
    state: _ccCtx.state,
    book: _ccCtx.book,
    from: _ccCtx.from,
    to: _ccCtx.to,
    rateFor: _ccRateFor,
    skip: (f) => f.scope === 'book' && manual.includes(f.label),
  });
}

export function onCurrencyModeChange() {
  const relabel = $('cc-mode-relabel')?.checked;
  const rateBlock = $('cc-rate-block');
  if (rateBlock) rateBlock.style.display = relabel ? 'none' : '';
  refreshCurrencyPreview();
}

export async function onCurrencyRateModeChange() {
  if (!_ccCtx) return;
  _ccCtx.rateMode = $('cc-rate-mode')?.value || 'historical';
  const note = $('cc-rate-note');
  if (_ccCtx.rateMode === 'historical' && !_ccCtx.ratesLoaded) {
    if (note) note.textContent = 'Looking up the rate for each entry date…';
    _ccCtx.rates = await _ccFetchRates(_ccCtx.from, _ccCtx.to, _ccCtx.dates);
    _ccCtx.ratesLoaded = true;
  }
  _ccUpdateRateNote();
  refreshCurrencyPreview();
}

function _ccUpdateRateNote() {
  const note = $('cc-rate-note');
  if (!note || !_ccCtx) return;
  if (_ccCtx.rateMode === 'flat') {
    note.textContent = `Every amount moves at the same rate. Good when you simply re-priced the book in ${_ccCtx.to}.`;
    return;
  }
  const resolved = _ccCtx.dates.filter(d => (_ccCtx.rates || {})[d]).length;
  note.textContent = resolved
    ? `Each entry converts at the ${_ccCtx.from}→${_ccCtx.to} rate on its own date (${resolved} of ${_ccCtx.dates.length} dates found). The rate above covers undated figures and any date the lookup missed.`
    : `No rates could be fetched — you may be offline. Type a rate above and every amount will use it.`;
}

export function refreshCurrencyPreview() {
  const host = $('cc-preview');
  if (!host || !_ccCtx) return;
  const applyBtn = $('cc-apply');

  if ($('cc-mode-relabel')?.checked) {
    const count = collectNativeAmounts(_ccCtx.state, _ccCtx.book).length;
    host.innerHTML = `<div class="cc-preview-empty">No number will change. ${count} amount${count === 1 ? '' : 's'} will simply be marked as already being in <strong>${escapeHtml(_ccCtx.to)}</strong>.</div>`;
    if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Relabel'; }
    return;
  }

  _ccCtx.flatRate = parseFloat($('cc-rate')?.value) || 0;
  const plan = _ccBuildPlan();
  _ccCtx.plan = plan;

  if (!plan || plan.changes.length === 0) {
    host.innerHTML = `<div class="cc-preview-empty">${escapeHtml(describePlan(plan) || 'Enter a rate to see what will change.')}</div>`;
    if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Convert'; }
    return;
  }

  const MAX = 40;
  const shown = plan.changes.slice(0, MAX);
  const more = plan.changes.length - shown.length;
  const fromSym = getSym(plan.from), toSym = getSym(plan.to);

  host.innerHTML = `
    <div class="cc-preview-head">
      <span>${escapeHtml(describePlan(plan))}</span>
      <strong>${escapeHtml(fmt(plan.totalBefore, fromSym))} → ${escapeHtml(fmt(plan.totalAfter, toSym))}</strong>
    </div>
    <div class="cc-preview-scroll">
      <table class="cc-preview-tbl">
        <thead><tr><th>What</th><th class="r">Rate</th><th class="r">Before</th><th class="r">After</th></tr></thead>
        <tbody>
          ${shown.map(c => `<tr>
            <td>${escapeHtml(c.field.label)}${c.field.date ? ` <span class="muted-note">${escapeHtml(fmtD(c.field.date))}</span>` : ''}</td>
            <td class="r muted-note">${c.rate.toFixed(4)}</td>
            <td class="r cc-before">${escapeHtml(fmt(c.before, fromSym))}</td>
            <td class="r cc-after">${escapeHtml(fmt(c.after, toSym))}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${more > 0 ? `<p class="field-note">…and ${more} more amount${more === 1 ? '' : 's'}.</p>` : ''}`;
  if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Convert'; }
}

// Open the dialog and resolve with the chosen action, or null when cancelled.
// Resolving does NOT mutate anything — the caller applies the result, so a
// cancel at any point leaves the book exactly as it was.
function openCurrencyChangeDialog({ book, state, from, to, manualBookFields = [], title, intro }) {
  const fromCode = normalizeCurrencyCode(from, 'CAD');
  const toCode = normalizeCurrencyCode(to, 'CAD');

  const dates = [...new Set(
    collectNativeAmounts(state, book).map(f => f.date).filter(Boolean)
  )].sort();

  _ccCtx = {
    book, state, from: fromCode, to: toCode, manualBookFields,
    dates, rates: {}, ratesLoaded: false, rateMode: 'historical', flatRate: 0, plan: null,
  };

  if ($('cc-title')) $('cc-title').textContent = title || 'Change book currency';
  if ($('cc-intro')) $('cc-intro').textContent = intro || '';
  if ($('cc-rate-pair')) $('cc-rate-pair').textContent = `${fromCode} → ${toCode}`;
  if ($('cc-rate')) $('cc-rate').value = '';
  if ($('cc-rate-mode')) $('cc-rate-mode').value = 'historical';
  if ($('cc-mode-convert')) $('cc-mode-convert').checked = true;
  if ($('cc-mode-relabel')) $('cc-mode-relabel').checked = false;
  if ($('cc-mode-convert-sub')) {
    $('cc-mode-convert-sub').textContent =
      `Restate every ${fromCode} figure into ${toCode} at an exchange rate — prices, totals, ledger, store balances and payouts all move together.`;
  }
  if ($('cc-mode-relabel-sub')) {
    $('cc-mode-relabel-sub').textContent =
      `Leave every figure exactly as it is and just mark it as ${toCode}. Use this only when the amounts were always ${toCode} and the symbol was wrong.`;
  }
  onCurrencyModeChange();

  return new Promise(resolve => {
    const ok = $('cc-apply'), cancel = $('cc-cancel'), overlay = $('m-currency-change');
    if (!ok || !cancel || !overlay) { resolve(null); return; }

    const cleanup = (result) => {
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      overlay.removeEventListener('modal-close', onCancel);
      closeM('currency-change');
      resolve(result);
    };
    const onOk = () => {
      if ($('cc-mode-relabel')?.checked) { cleanup({ mode: 'relabel', to: toCode, from: fromCode }); return; }
      refreshCurrencyPreview();
      const plan = _ccCtx && _ccCtx.plan;
      if (!plan || plan.changes.length === 0) {
        showToast('⚠ Enter an exchange rate first', 'warn');
        $('cc-rate')?.focus();
        return;
      }
      cleanup({ mode: 'convert', to: toCode, from: fromCode, plan });
    };
    const onCancel = () => cleanup(null);

    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    overlay.addEventListener('modal-close', onCancel);

    openM('currency-change');
    // Prefill the live rate in the background so the common case is one click.
    fetchLiveRate(fromCode, toCode).then(r => {
      if (!_ccCtx || _ccCtx.from !== fromCode) return;   // dialog moved on
      if (r && r.rate) {
        _ccCtx.rates[''] = r.rate;
        const el = $('cc-rate');
        if (el && !el.value) { el.value = r.rate.toFixed(4); }
        _ccCtx.flatRate = r.rate;
      }
      onCurrencyRateModeChange();
    });
  });
}

// Persist a dialog result onto a book + its state, including the audit log.
function applyCurrencyResult(result, book, state) {
  if (!result) return null;
  if (result.mode === 'relabel') {
    const stamped = stampNativeCurrency(state, book, result.to);
    appendCurrencyLog(book, { from: result.from, to: result.to, mode: 'relabel', records: stamped });
    return { converted: 0, stamped };
  }
  const applied = applyCurrencyChange(result.plan);
  appendCurrencyLog(book, {
    from: result.from, to: result.to, mode: 'convert',
    records: applied.stamped, amounts: applied.converted,
  });
  return applied;
}

// Repair entry point for a book whose history is stranded in a previous
// currency — the state this app lands in when the currency was changed before
// this dialog existed. Reachable from the History tab's reconciliation strip.
export async function restateBookCurrency() {
  // A restatement rewrites one book's ledger, so it needs a book actually
  // selected — the "All books" view has no single currency to restate into.
  if (!activeBook || activeBook === 'all') {
    showToast('⚠ Pick a single book first — a restatement applies to one book', 'warn');
    return;
  }
  const book = getBook(), s = getState();
  if (!book) return;
  const toCode = bookCurrencyCode(book);
  const { mismatched, code } = detectCurrencyMismatch(s, book);
  const fromCode = code || (toCode === 'CAD' ? 'EUR' : 'CAD');

  const result = await openCurrencyChangeDialog({
    book, state: s, from: fromCode, to: toCode,
    title: `Restate history · ${book.title}`,
    intro: mismatched
      ? `${mismatched} amount${mismatched === 1 ? ' is' : 's are'} still recorded in ${fromCode} while this book is now priced in ${toCode}. Restate them so every total, tier and payout is in one currency again.`
      : `This book is priced in ${toCode}. If its history was actually recorded in ${fromCode} — because the currency was switched after those entries were made — restate it here so totals stop mixing two currencies.`,
  });
  if (!result) return;

  const applied = applyCurrencyResult(result, book, s);
  recomputeAfters(s, book);
  await saveState(activeBook);
  await saveCatalogWithDeletions();
  renderAll(); updateDash(); renderCurrent();
  showToast(result.mode === 'relabel'
    ? `✓ ${applied.stamped} record${applied.stamped === 1 ? '' : 's'} relabelled as ${result.to}`
    : `✓ ${applied.converted} amount${applied.converted === 1 ? '' : 's'} restated into ${result.to}`);

  await offerSheetsResyncAfterRestate(result.to);
}

// The Google Sheet still holds the pre-restatement numbers, so leaving it be
// means the app and the spreadsheet now disagree on every historical figure.
// Offer the in-place resync that reconciles them.
async function offerSheetsResyncAfterRestate(toCode) {
  if (!sheetsUrl || typeof pushAllToSheets !== 'function') return;
  const ok = await confirmDialog(
    `Your Google Sheet still has the old amounts. Push the restated ${toCode} figures to it now? `
    + `Rows are matched by their stable ids, so this updates them in place rather than adding duplicates.`,
    { title: 'Update the Google Sheet', okLabel: 'Push to Sheets', cancelLabel: 'Later' }
  );
  if (ok) pushAllToSheets({ skipConfirm: true });
}

async function saveBookFromModal() {
  // Validate fields and automatically switch to the correct tab if validation fails
  const isValid = validateFields([
    { id: 'nb-id', test: val => val.trim().length > 0, msg: 'Book ID is required' },
    { id: 'nb-title', test: val => val.trim().length > 0, msg: 'Title is required' },
    { id: 'nb-payment-link', test: val => isValidPaymentLink(val.trim()), msg: 'Must be a valid URL or email address' }
  ]);

  if (!isValid) {
    if ($('nb-payment-link').closest('.form-group').classList.contains('invalid')) {
      switchBookModalTab('costs');
    } else if ($('nb-id').closest('.form-group').classList.contains('invalid') || $('nb-title').closest('.form-group').classList.contains('invalid')) {
      switchBookModalTab('general');
    }
    return;
  }

  // Book id doubles as a database key and is used in URLs/handlers, so
  // restrict it to a safe slug (lowercase letters, digits, dashes).
  const rawId = $('nb-id').value.trim();
  const id = rawId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  await syncCatalog();

  const currentBook = BOOKS[editingBookId] || BOOKS[id] || {};
  const book = {
    id,
    title: $('nb-title').value.trim(),
    author: $('nb-author').value.trim(),
    isbn: $('nb-isbn').value.trim() || '—',
    maxPrint: parseInt($('nb-max').value) || 100,
    listPrice: parseFloat($('nb-price').value) || 40,
    currency: $('nb-cur').value || '€',
    threshold: parseInt($('nb-thresh').value) || 10,
    productionCost: parseFloat($('nb-prod').value) || 0,
    pubGratuity: parseInt($('nb-pub-grat')?.value) || 0,
    authorGratuity: parseInt($('nb-author-grat')?.value) || 0,
    paymentLink: $('nb-payment-link') ? $('nb-payment-link').value.trim() || 'https://paypal.me/lyricalmyricalbooks' : currentBook.paymentLink || 'https://paypal.me/lyricalmyricalbooks',
    stripeLink: $('nb-paylink').value.trim() || currentBook.stripeLink || '',
    accent: $('nb-accent').value,
    accentBg: hexToRgba($('nb-accent').value, 0.1),
    urlParam: currentBook.urlParam || id,
    authorEmail: ($('nb-pw').value || '').toLowerCase().trim() || currentBook.authorEmail || '',
    profitTiers: currentBook.profitTiers || [],
    acceptedMethods: currentBook.acceptedMethods || ['stripe', 'paypal', 'interac', 'cash_card'],
    useGlobalMethods: currentBook.useGlobalMethods ?? true,
    shipLength: parseFloat($('nb-ship-length').value) || null,
    shipWidth: parseFloat($('nb-ship-width').value) || null,
    shipHeight: parseFloat($('nb-ship-height').value) || null,
    shipDimUnit: $('nb-ship-dim-unit').value || 'in',
    shipWeight: parseFloat($('nb-ship-weight').value) || null,
    shipWeightUnit: $('nb-ship-weight-unit').value || 'lb',
    shipHsCode: $('nb-ship-hs').value.trim() || '490199'
  };

  // Keep the first break-even tier aligned when it still represents production-cost recovery.
  const previousCost = currentBook.productionCost || 0;
  const val = book.productionCost;
  if (Array.isArray(book.profitTiers) && book.profitTiers.length > 0) {
    const firstTier = book.profitTiers[0];
    const tierLabel = (firstTier?.label || '').toLowerCase();
    const shouldSyncThreshold =
      firstTier?.revenueUpTo !== null &&
      (Math.abs((firstTier.revenueUpTo || 0) - previousCost) < 0.0001 || tierLabel.includes('break-even'));

    if (shouldSyncThreshold) firstTier.revenueUpTo = val;
  }

  // A currency change re-denominates every figure already on the books, so ask
  // what to do with the history BEFORE committing the edit. Cancelling here
  // aborts the whole save and leaves the modal open, so the book is never left
  // half-changed. Book-level prices the user retyped in this same save are
  // excluded from the conversion — those are already in the new currency.
  const prevCurrency = currentBook.currency;
  let currencyResult = null;
  if (editingBookId && prevCurrency && prevCurrency !== book.currency) {
    const targetState = states[editingBookId] || states[id];
    const manualBookFields = [];
    if ((currentBook.listPrice ?? null) !== book.listPrice) manualBookFields.push('List price');
    if ((currentBook.productionCost ?? null) !== book.productionCost) manualBookFields.push('Production cost');

    currencyResult = await openCurrencyChangeDialog({
      book, state: targetState,
      from: prevCurrency, to: book.currency, manualBookFields,
      title: `Change currency · ${book.title}`,
      intro: `This book's stored amounts are all in ${normalizeCurrencyCode(prevCurrency, 'EUR')}. `
        + `Switching to ${normalizeCurrencyCode(book.currency, 'CAD')} without restating them would leave every past sale, `
        + `total and payout carrying the new symbol but the old number.`
        + (manualBookFields.length ? ` (${manualBookFields.join(' and ')} won't be converted — you just edited ${manualBookFields.length === 1 ? 'it' : 'them'} by hand.)` : ''),
    });
    if (!currencyResult) return;   // cancelled — nothing is saved
  }

  if (editingBookId && editingBookId !== id) {
    delete BOOKS[editingBookId];
    if (states[editingBookId]) {
      states[id] = states[editingBookId];
      delete states[editingBookId];
    }
  }
  BOOKS[id] = book;
  BOOK_LIST = Object.values(BOOKS);
  if (!states[id]) states[id] = defaultState(book);

  if (currencyResult) {
    applyCurrencyResult(currencyResult, book, states[id]);
    // Rollups (revenue, chStats) are re-derived from the now-converted prices,
    // so the headline figures agree with the individual rows.
    recomputeAfters(states[id], book);
    await saveState(id);
  }
  // Re-adding a previously-deleted default removes it from the tombstone list.
  if (DEFAULT_BOOKS[id]) {
    const i = deletedDefaultIds.indexOf(id);
    if (i !== -1) deletedDefaultIds.splice(i, 1);
  }

  // Compile and sync productionCosts & paymentLinks to Firebase/localStorage for backward compatibility
  const prodCosts = {};
  const payLinks = {};
  BOOK_LIST.forEach(b => {
    prodCosts[b.id] = b.productionCost || 0;
    payLinks[b.id] = b.paymentLink || '';
  });
  await window._fbSaveSettings('productionCosts', prodCosts);
  localStorage.setItem('lm-production-costs', JSON.stringify(prodCosts));
  await window._fbSaveSettings('paymentLinks', payLinks);
  localStorage.setItem('lm-payment-links', JSON.stringify(payLinks));

  await saveCatalogWithDeletions();

  if ($('add-book-unsaved-indicator')) $('add-book-unsaved-indicator').classList.remove('show');

  showToast(editingBookId ? '✓ Book updated' : '✓ Book added to catalog');
  closeAddBookModal();
  buildBookSwitcher();
  renderCatalogList();
  renderProfitSettings();
  // Refresh the dropdown header (label/dot/accent) if the active book was edited.
  if (activeBook && activeBook !== 'all' && BOOKS[activeBook]) {
    const ab = BOOKS[activeBook];
    const lbl = $('book-dropdown-label'); if (lbl) lbl.textContent = ab.title;
    const dt = $('book-dropdown-dot'); if (dt) dt.style.background = ab.accent;
    document.documentElement.style.setProperty('--book-accent', ab.accent);
    document.documentElement.style.setProperty('--book-accent-bg', ab.accentBg);
  }
  renderCurrent();

  // Asked last, once the book modal is out of the way, so the two dialogs
  // don't stack.
  if (currencyResult) await offerSheetsResyncAfterRestate(currencyResult.to);
}

function renderCatalogList() {
  const container = $('catalog-list');
  if (!container) return;

  const testContainer = $('test-catalog-list');

  // Find test books (e.g. title or id contains "test")
  const testBooks = BOOK_LIST.filter(b => b.id.toLowerCase().includes('test') || b.title.toLowerCase().includes('test'));
  const regularBooks = BOOK_LIST.filter(b => !b.id.toLowerCase().includes('test') && !b.title.toLowerCase().includes('test'));

  container.innerHTML = regularBooks.map(b => `
    <div class="catalog-card">
       <div style="display:flex;align-items:center;gap:14px;">
         <div class="catalog-dot" style="background:${b.accent}"></div>
         <div class="catalog-info">
           <h4>${escapeHtml(b.title)}</h4>
           <p>${escapeHtml(b.id)} · ${b.currency}${b.listPrice}</p>
         </div>
       </div>
       <div class="catalog-actions">
         <button class="btn sm" onclick="openEditBookModal('${escapeHtml(b.id)}')">Edit</button>
         <button class="btn sm danger-btn" onclick="deleteBook('${escapeHtml(b.id)}')">Remove</button>
       </div>
    </div>`).join('');

  if (testContainer) {
    if (testBooks.length === 0) {
      testContainer.innerHTML = `
        <div style="text-align:center;padding:1.5rem;color:var(--text3);font-size:13px;border:1px dashed var(--border);border-radius:var(--r2);">
          No test books found.
        </div>`;
    } else {
      testContainer.innerHTML = testBooks.map(b => `
        <div class="catalog-card">
           <div style="display:flex;align-items:center;gap:14px;">
             <div class="catalog-dot" style="background:${b.accent}"></div>
             <div class="catalog-info">
               <h4>${escapeHtml(b.title)}</h4>
               <p>${escapeHtml(b.id)} · ${b.currency}${b.listPrice}</p>
             </div>
           </div>
           <div class="catalog-actions">
             <button class="btn sm" onclick="openEditBookModal('${escapeHtml(b.id)}')">Edit</button>
             <button class="btn sm danger-btn" onclick="deleteBook('${escapeHtml(b.id)}')">Remove</button>
           </div>
        </div>`).join('');
    }
  }
}


async function deleteBook(id) {
  await syncCatalog();
  if (!BOOKS[id]) {
    showToast('Book already removed or does not exist', 'warn');
    buildBookSwitcher();
    renderCatalogList();
    renderProfitSettings();
    return;
  }
  if (!(await confirmDialog(`Permanently remove "${BOOKS[id].title}" and all its inventory records?`, { danger: true, okLabel: 'Remove book' }))) return;
  delete BOOKS[id];
  BOOK_LIST = Object.values(BOOKS);
  delete states[id];
  if (DEFAULT_BOOKS[id] && !deletedDefaultIds.includes(id)) {
    deletedDefaultIds.push(id);
  }
  await saveCatalogWithDeletions();
  if (typeof window._fbDeleteBook === 'function') {
    try { await window._fbDeleteBook(id); } catch (e) {
      console.warn('fbDeleteBook failed', e);
      showToast('⚠ Cloud delete failed — local data removed but cloud copy may remain', 'err', 5000);
    }
  }
  buildBookSwitcher();
  renderCatalogList();
  if (psActiveBookId === id) psActiveBookId = null;
  renderProfitSettings();
  // If the deleted book was being viewed, fall back to the All Books overview.
  if (activeBook === id) switchBook('all');
  else renderCurrent();
  showToast('Book removed');
}

window.saveBookFromModal = saveBookFromModal;
window.openAddBookModal = openAddBookModal;
window.openEditBookModal = openEditBookModal;
window.closeAddBookModal = closeAddBookModal;
window.deleteBook = deleteBook;
window.switchBookModalTab = switchBookModalTab;

// ── PAYMENT QR GENERATOR (publisher only)
let _currentQR = null;

function openPaymentQRModal() {
  if (!activeBook || activeBook === 'all' || isAuthor()) return;
  const book = BOOKS[activeBook];

  const titleEl = $('qr-book-title');
  if (titleEl) titleEl.textContent = book.title;

  const curSelect = $('pqr-currency');
  if (curSelect) curSelect.value = currencyToCode(book.currency) || 'CAD';

  const overrideInput = $('pqr-override-price');
  if (overrideInput) {
    const curCode = curSelect ? curSelect.value : 'CAD';
    overrideInput.value = book.priceOverrides?.[curCode] || '';
    overrideInput.placeholder = (book.listPrice || 0).toFixed(2);
  }

  updateSingleBookPaymentQR();
  openM('payment-qr');
}

function updateSingleBookPaymentQR() {
  if (!activeBook || activeBook === 'all') return;
  const book = BOOKS[activeBook];
  const curCode = $('pqr-currency')?.value || currencyToCode(book.currency) || 'CAD';
  const overrideVal = parseFloat($('pqr-override-price')?.value);
  const hasOverride = !isNaN(overrideVal) && overrideVal > 0;
  const targetPrice = hasOverride ? overrideVal : (book.listPrice || 0);

  let url = getEffectiveBookPaymentLink(book) || 'https://paypal.me/lyricalmyricalbooks';
  if (hasOverride && !url.includes('amount=')) {
    // Include parameter hint for payment processors if not custom Stripe link
    const joiner = url.includes('?') ? '&' : '?';
    url = `${url}${joiner}amount=${targetPrice.toFixed(2)}&currency=${curCode}`;
  }

  const linkInput = $('qr-payment-link');
  if (linkInput) linkInput.value = url;

  const canvasContainer = $('payment-qr-canvas');
  if (canvasContainer) {
    canvasContainer.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      _currentQR = new QRCode(canvasContainer, {
        text: url,
        width: 230,
        height: 230,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    }
  }
}

async function generateSingleBookStripeQR() {
  if (!activeBook || activeBook === 'all') return;
  const book = BOOKS[activeBook];
  const curCode = $('pqr-currency')?.value || 'CAD';
  const overrideVal = parseFloat($('pqr-override-price')?.value);
  const targetPrice = (!isNaN(overrideVal) && overrideVal > 0) ? overrideVal : (book.listPrice || 0);

  const btn = $('pqr-gen-stripe-btn');
  const restoreText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Minting Stripe QR…'; }

  try {
    const url = await createStripePaymentLinkForAmount({
      amountMajor: targetPrice,
      currencyCode: curCode,
      description: `${book.title} (${curCode} ${targetPrice.toFixed(2)})`,
      metadata: { book_id: book.id, sku: book.id, override: 'true' }
    });

    if (!book.priceOverrides) book.priceOverrides = {};
    if (!isNaN(overrideVal) && overrideVal > 0) {
      book.priceOverrides[curCode] = overrideVal;
    }

    const linkInput = $('qr-payment-link');
    if (linkInput) linkInput.value = url;

    const canvasContainer = $('payment-qr-canvas');
    if (canvasContainer) {
      canvasContainer.innerHTML = '';
      if (typeof QRCode !== 'undefined') {
        _currentQR = new QRCode(canvasContainer, {
          text: url,
          width: 230,
          height: 230,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      }
    }
    showToast(`✓ Stripe QR generated for ${curCode} ${targetPrice.toFixed(2)}`);
  } catch (e) {
    showToast('Stripe: ' + (e.message || e), 'err', 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = restoreText; }
  }
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
window.updateSingleBookPaymentQR = updateSingleBookPaymentQR;
window.generateSingleBookStripeQR = generateSingleBookStripeQR;
window.copyPaymentLink = copyPaymentLink;
window.downloadPaymentQR = downloadPaymentQR;

// ── ALL-BOOKS QR PAGE (publisher only)
function renderAllQRCodes() {
  const grid = $('qr-all-grid');
  if (!grid) return;
  grid.innerHTML = '';

  BOOK_LIST.forEach(book => {
    const url = getEffectiveBookPaymentLink(book);
    const card = document.createElement('div');
    card.style.cssText = `background:var(--ink2);border:1px solid rgba(255,255,255,.08);border-radius:var(--r3);padding:1.5rem;display:flex;flex-direction:column;align-items:center;gap:1rem;`;

    // Book title header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;';
    header.innerHTML = `
      <div style="width:10px;height:10px;border-radius:50%;background:${book.accent};flex-shrink:0;"></div>
      <div style="flex:1;">
        <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:var(--cream);">${escapeHtml(book.title)}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:2px;">${escapeHtml(book.author) || '—'} · ${book.currency}${book.listPrice}</div>
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
        <button class="btn ink" style="flex:1;font-size:11px;" onclick="window.copyBookQR('${book.id}','${url.replace(/'/g, "\\'")}')">Copy link</button>
        <button class="btn gold" style="flex:1;font-size:11px;" ${url ? '' : 'disabled'} onclick="window.downloadBookQR('${book.id}')">Download</button>
      </div>`;
    card.appendChild(linkRow);
    grid.appendChild(card);
  });
}

window.renderAllQRCodes = renderAllQRCodes;

window.copyBookQR = function (bookId, url) {
  if (!url) { showToast('No link set for this book', 'warn'); return; }
  navigator.clipboard.writeText(url).then(() => showToast('Link copied')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); showToast('Link copied');
  });
};

window.downloadBookQR = function (bookId) {
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
  const url = getEffectiveBookPaymentLink(book);

  // Populate header
  const titleEl = $('myqr-book-title');
  const metaEl = $('myqr-book-meta');
  const statusEl = $('myqr-status');
  if (titleEl) titleEl.textContent = book.title;
  if (metaEl) metaEl.textContent = (book.author || '') + (book.author ? ' · ' : '') + book.currency + book.listPrice;

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

window.copyAuthorQR = function () {
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

window.downloadAuthorQR = function () {
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
const _URL_BOOK = urlParams.get('book');    // e.g. 'hound'
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
  // Source of truth is the runtime flag set after Google sign-in (showApp).
  // The legacy 'lm-unlocked' sessionStorage key is never written, so relying on
  // it here hid the "Author view" preview toggle from every signed-in publisher.
  return !!window.IS_PUBLISHER;
}

// Runtime role check — works for both URL-based AND password-based author login
export function isAuthor() {
  if (IS_AUTHOR_MODE) return true;
  const s = sessionStorage.getItem('lm-unlocked') || '';
  if (s.startsWith('author:')) return true;
  return !!(isPublisherSession() && activeBook && activeBook !== 'all' && AUTHOR_VIEW_BY_BOOK[activeBook]);
}

// ── UTILITIES
export const $ = id => document.getElementById(id);

// Set a KPI value. Previously this ran a count-up tween, but on startup the
// header refreshes several times (initial render + sync), so the tween kept
// restarting from 0 and the numbers spun erratically. Just show the final
// value — it appears naturally and stays stable.
function animateCountValue(id, target, _duration, _formatFunc) {
  const obj = $(id);
  if (!obj) return;
  obj.textContent = target;
}

// Micro-animations for view state changes
function triggerCardAnimations() {
  const cards = document.querySelectorAll('.card, .kpi, .metric-banner, .stock-block, .store-card, .stock-alert');
  cards.forEach(card => {
    // Reset animation
    card.style.animation = 'none';
    card.offsetHeight; // trigger reflow
    card.style.animation = null;
  });
}
// Money helpers (CURRENCY_SYMBOL_TO_CODE, CODE_TO_SYMBOL, getSym,
// normalizeCurrencyCode, fmt, fmtNum, fmtD, getBookCurrencyCode,
// paymentSummary, buildPaymentMeta) are imported from ./lib/money.js

export const today = () => new Date().toISOString().split('T')[0];

export const formatDateTime = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString() + ' ' + d.toTimeString().slice(0, 5);
};

// LOCAL calendar day (YYYY-MM-DD) for a timestamp — unlike today()'s UTC date,
// this matches the dates the user sees (toLocaleString), so "one backup per
// day" lines up with their calendar instead of rolling over at UTC midnight.
const localDayFromTs = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const localDayKey = () => localDayFromTs(Date.now());

// ── PER-BOOK STATE
// states[bookId] = { stock, sold, revenue, chStats, hist, stores, ledger, doneIds }
export let states = {};
window.authorSubmissions = {}; // Tracks pending expenses/sales by Authors
export let activeBook = null;   // currently viewed bookId, or 'all'
export let orders = [], activeId = null;
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

let _syncRetryTimer = null;
let _syncRetryAttempt = 0;
let _syncFlushing = false;

// Persist a not-yet-saved book state so an optimistic UI change is never
// lost. Only the LATEST snapshot per book is kept — a newer edit supersedes
// an older queued one, so rapid edits don't grow the queue unbounded.
function queueSync(bookId, state) {
  syncQueue = syncQueue.filter(item => item.bookId !== bookId);
  syncQueue.push({ bookId, state, ts: Date.now() });
  localStorage.setItem('lm-sync-queue', JSON.stringify(syncQueue));
  updatePendingIndicator();
  processSyncQueue();
}

// Reflects the number of pending (queued, not-yet-saved) book states in the
// sync status bar so an optimistic change that hasn't reached the cloud yet
// is always visible to the user.
function updatePendingIndicator() {
  const n = syncQueue.length;
  if (n > 0) {
    setSyncState('syncing', `<b>Firestore</b> · ${n} change${n === 1 ? '' : 's'} pending…`);
  }
}

async function processSyncQueue() {
  if (_syncFlushing) return;
  if (!navigator.onLine || !fbReady || !syncQueue.length) return;
  _syncFlushing = true;
  const item = syncQueue[0];
  try {
    const res = await window._fbSave(item.bookId, JSON.stringify(item.state));
    // The server copy couldn't be read, so nothing was written and the queued
    // change is still pending. Treat it exactly like a failed write: keep it
    // queued and let the backoff retry rather than dropping it.
    if (res && res.ok === false) throw new Error(res.reason || 'save-unverified');

    // This is the path that matters after a stretch offline: whatever the other
    // device wrote while we were away is now merged in, so adopt the reconciled
    // state instead of leaving the screen on our pre-merge copy.
    if (res && res.merged && res.state) {
      adoptMergedState(item.bookId, res);
      lastSaveTimes[item.bookId] = Date.now();
    } else {
      // Mark this exact snapshot as saved so saveState won't re-send it.
      const json = JSON.stringify(item.state);
      if (states[item.bookId] && JSON.stringify(states[item.bookId]) === json) {
        lastSavedHashes[item.bookId] = json;
        lastSaveTimes[item.bookId] = Date.now();
      }
    }
    syncQueue.shift();
    localStorage.setItem('lm-sync-queue', JSON.stringify(syncQueue));
    _syncRetryAttempt = 0;
    _syncFlushing = false;
    if (syncQueue.length) {
      updatePendingIndicator();
      processSyncQueue();
    } else {
      setSyncState('ok', '<b>Firestore</b> · connected · live sync on');
      showToast('✅ All changes synced');
    }
  } catch (e) {
    console.error('Queue sync failed', e);
    _syncFlushing = false;
    // Schedule an automatic retry with exponential backoff (capped at 30s)
    // so a transient failure reconciles itself without user action.
    _syncRetryAttempt++;
    const delay = Math.min(30000, 2000 * Math.pow(2, _syncRetryAttempt - 1));
    setSyncState('error', `<b>Firestore</b> · ${syncQueue.length} pending · retrying…`);
    if (_syncRetryAttempt === 1) {
      showToast('⚠ Save failed — your change is saved locally and will retry', 'err', 4000);
    }
    clearTimeout(_syncRetryTimer);
    _syncRetryTimer = setTimeout(processSyncQueue, delay);
  }
}

window.addEventListener('online', processSyncQueue);
export let sheetsUrl = localStorage.getItem('lm-sheets-url') || '';
let sheetsSpreadsheetUrl = localStorage.getItem('lm-sheets-spreadsheet-url') || '';
// Apps Script Web App endpoint used ONLY to fire the "needs approval"
// notification email. The publisher connects the Sheet on their own device, but
// the approval-needed email has to be sent from the ARTIST's browser at submit
// time — and that device never ran the Sheet setup. So we mirror the endpoint
// into shared cloud settings (settings/notifyEndpoint) on connect and load it
// here on every device, giving artist sessions a URL to POST the email to.
let notifyUrl = localStorage.getItem('lm-notify-url') || '';
// The Apps Script `scriptVersion` the client expects. Bump this (and the value
// in apps-script/Code.gs) whenever Code.gs gains behaviour that needs a fresh
// deploy — the connection card flags any older deployed version as outdated.
const EXPECTED_SCRIPT_VERSION = 'v23';
if (sheetsUrl) {
  const normalizedSavedUrl = normalizeAppsScriptUrl(sheetsUrl);
  if (normalizedSavedUrl && normalizedSavedUrl !== sheetsUrl) {
    sheetsUrl = normalizedSavedUrl;
    localStorage.setItem('lm-sheets-url', normalizedSavedUrl);
  }
}

export function defaultState(book) {
  return { stock: book.maxPrint, sold: 0, revenue: 0, chStats: {}, hist: [], stores: [], ledger: [], doneIds: [], artistTransfers: [], artistPayouts: [], payoutRequests: [], expenses: [], artistPaymentLink: '', invoices: [], invoiceSeq: 0, openCall: [] };
}

export function getState() {
  if (!states[activeBook]) {
    states[activeBook] = defaultState(BOOKS[activeBook] || BOOK_LIST[0]);
  }
  return states[activeBook];
}
export function getBook() { return BOOKS[activeBook] || BOOK_LIST[0]; }

// ── TOAST
export function showToast(msg, type = 'ok', dur = 2800) {
  const t = $('toast'); t.textContent = msg;
  t.className = 'toast show' + (type === 'warn' ? ' warn' : type === 'err' ? ' err' : '');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), dur);
}
// Expose so modules loaded before main.js completes (firebase.js) can call back.
window.showToast = showToast;

// The two backends report a rules rejection differently: Firestore sets
// code:'permission-denied' and a message of "Missing or insufficient
// permissions", while the Realtime Database puts PERMISSION_DENIED in the
// message text. The submission handlers only checked the RTDB spelling, so a
// Firestore book's rejection fell through to the generic failure message.
function isPermissionDenied(err) {
  if (!err) return false;
  if (err.code === 'permission-denied' || err.code === 'PERMISSION_DENIED') return true;
  return typeof err.message === 'string' && err.message.includes('PERMISSION_DENIED');
}

// Styled replacement for window.confirm — returns a Promise<boolean>.
// Falls back to native confirm() if the modal isn't present (e.g. very
// early bootstrap or unit tests).
export function confirmDialog(message, opts = {}) {
  const overlay = $('m-confirm');
  const body = $('m-confirm-body');
  const titleEl = $('m-confirm-title');
  const ok = $('m-confirm-ok');
  const cancel = $('m-confirm-cancel');
  if (!overlay || !body || !ok || !cancel) {
    // Should never happen in production, but keep a working fallback.

    return Promise.resolve(window.confirm(message));
  }
  body.textContent = String(message ?? '');
  if (titleEl) titleEl.textContent = opts.title || 'Are you sure?';
  ok.textContent = opts.okLabel || 'Confirm';
  cancel.textContent = opts.cancelLabel || 'Cancel';
  ok.classList.toggle('danger-btn', !!opts.danger);
  ok.classList.toggle('gold', !opts.danger);

  return new Promise(resolve => {
    const cleanup = (result) => {
      overlay.removeEventListener('modal-close', onCloseEvent);
      closeM('confirm');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onEnter);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onCloseEvent = () => cleanup(false);
    const onEnter = (e) => {
      if (e.key === 'Enter') cleanup(true);
    };

    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    overlay.addEventListener('modal-close', onCloseEvent);
    document.addEventListener('keydown', onEnter);

    openM('confirm');
    // Focus the safe (cancel) button by default for destructive prompts.
    setTimeout(() => (opts.danger ? cancel : ok).focus(), 0);
  });
}

// Styled single-line text prompt — the confirmDialog sibling for "type a value"
// flows (replaces the browser's blocking prompt()). Resolves to the entered
// string, or null if the user cancelled/dismissed, so callers can distinguish
// "cancelled" from "deliberately cleared".
function promptDialog(message, defaultValue = '', opts = {}) {
  const overlay = $('m-prompt');
  const body = $('m-prompt-body');
  const titleEl = $('m-prompt-title');
  const input = $('m-prompt-input');
  const ok = $('m-prompt-ok');
  const cancel = $('m-prompt-cancel');
  if (!overlay || !body || !input || !ok || !cancel) {
    // Should never happen in production, but keep a working fallback.
    return Promise.resolve(window.prompt(message, defaultValue));
  }
  body.textContent = String(message ?? '');
  if (titleEl) titleEl.textContent = opts.title || 'Enter a value';
  ok.textContent = opts.okLabel || 'OK';
  cancel.textContent = opts.cancelLabel || 'Cancel';
  input.value = String(defaultValue ?? '');
  input.placeholder = opts.placeholder || '';

  return new Promise(resolve => {
    const cleanup = (result) => {
      overlay.removeEventListener('modal-close', onCloseEvent);
      closeM('prompt');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onOk = () => cleanup(input.value);
    const onCancel = () => cleanup(null);
    const onCloseEvent = () => cleanup(null);
    // Scoped to the input rather than the document so this dialog's Enter key
    // can't also trigger a confirmDialog that happens to be listening.
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); cleanup(input.value); }
      else if (e.key === 'Escape') { e.preventDefault(); cleanup(null); }
    };

    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    overlay.addEventListener('modal-close', onCloseEvent);
    input.addEventListener('keydown', onKey);

    openM('prompt');
    setTimeout(() => { try { input.focus(); input.select(); } catch { } }, 0);
  });
}

// Non-blocking alert replacement: shows a styled toast.
// `type` is 'ok' | 'warn' | 'err'.
function notify(msg, type = 'warn') {
  showToast(msg, type, 3600);
}

// ── SYNC UI
function setSyncState(status, msg) {
  // saveState() reports the offline/queued case as status 'ok' with a "queued
  // (offline)" message; collapsing that to "Live" would falsely read as fully
  // synced — dangerous in the publisher shell where #side-sync-text is the only
  // visible status. Detect it and surface "Offline" + an amber (syncing) dot.
  const offline = (status === 'ok') && (/queued|offline/i.test(msg || '') ||
    (typeof navigator !== 'undefined' && navigator.onLine === false));
  // Derive the short word + dot class ONCE so header and sidebar can't drift.
  const word = status === 'syncing' ? 'Saving…' : status === 'error' ? 'Sync error' : offline ? 'Offline' : 'Live';
  const dotCls = 'sync-dot' + (status === 'syncing' || offline ? ' syncing' : status === 'error' ? ' error' : '');

  const dot = $('sync-dot'), label = $('sync-label'), time = $('sync-time');
  dot.className = dotCls;
  label.innerHTML = msg; time.textContent = new Date().toLocaleTimeString();
  // Short status word shown in the header pill (the full label lives in the menu).
  const pill = $('sync-pill-text');
  if (pill) pill.textContent = word;
  // Mirror the live state into the publisher app-shell sidebar footer account
  // (desktop shell only; ids are guarded so authors/mobile are unaffected).
  const sideDot = $('side-sync-dot'), sideText = $('side-sync-text');
  if (sideDot) sideDot.className = dotCls;
  if (sideText) sideText.textContent = word;
}

// ── FIREBASE (per-book)
export async function saveState(bookId) {
  const state = states[bookId];
  if (!state) {
    console.warn(`saveState: No local state found for bookId: ${bookId}`);
    setSyncState('error', '<b>Firestore</b> · missing state object');
    return;
  }
  // This book's load failed, so `state` is the empty default standing in for
  // data we never saw — not the book. Writing it would push an empty ledger
  // over the real one. The three-way merge in _fbSave would treat the unknown
  // base as empty and union the two, so nothing would actually be lost, but a
  // save here still can't mean what the user intends: they are looking at a
  // blank screen and any edit is reasoning about the wrong data.
  //
  // Self-clearing: _fbWatch replaces states[bookId] wholesale when real data
  // arrives, and the marker is a property of the object it replaces.
  if (state._loadFailed) {
    const title = (BOOKS[bookId] && BOOKS[bookId].title) || bookId;
    showToast(`⚠ Not saving — ${title} never loaded, so this screen isn't its real data. Reload first.`, 'err', 6000);
    setSyncState('error', '<b>Firestore</b> · not saving · book failed to load');
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
    const res = await window._fbSave(bookId, json);
    // Couldn't read the server copy, so _fbSave declined to overwrite it rather
    // than risk erasing a change made on another device. Queue and retry.
    if (res && res.ok === false) {
      queueSync(bookId, state);
      setSyncState('error', '<b>Firestore</b> · could not verify cloud copy · retrying…');
      return;
    }
    // Another device had written since we last synced and _fbSave merged the
    // two. Adopt the reconciled state locally so the screen matches the cloud
    // instead of the version we tried to push.
    if (res && res.merged && res.state) {
      adoptMergedState(bookId, res);
    } else {
      lastSavedHashes[bookId] = json;
    }
    lastSaveTimes[bookId] = Date.now();
    setSyncState('ok', '<b>Firestore</b> · saved · live sync on');
    const ind = $('save-ind'); if (ind) { ind.classList.add('show'); setTimeout(() => ind.classList.remove('show'), 2000); }
  } catch (e) {
    console.error(`Firebase Save Error [${bookId}]:`, e);
    // The optimistic UI already shows this change, but the cloud write
    // failed. Queue it (with backoff retry) so the change is never lost
    // and reconciles automatically instead of silently diverging.
    queueSync(bookId, state);
  }
}

// Called by _fbSave once a three-way merge has produced a combined state, before
// any of it is written. stock, revenue, per-channel stats and each history row's
// running balance are all derived from hist/ledger, so after rows from two
// devices are interleaved they have to be recomputed — otherwise the merged blob
// would carry one device's totals against both devices' rows.
window._normalizeMergedState = (bookId, merged) => {
  try {
    const book = BOOKS[bookId];
    if (book && merged) recomputeAfters(merged, book);
  } catch (e) {
    console.error('[sync] could not recompute merged state', e);
  }
  return merged;
};

// Take on the state _fbSave reconciled with another device's copy, so the
// screen shows what the cloud actually holds rather than the version this
// device tried to push.
function adoptMergedState(bookId, res) {
  const book = BOOKS[bookId];
  // Backfill any key the merge dropped (deleted on both sides) the same way
  // loadBook does, so a renderer can't trip over a missing array.
  states[bookId] = book ? { ...defaultState(book), ...res.state } : res.state;
  // Track the server's version, not the defaults-filled local one — if they
  // differ, the next saveState writes the difference instead of skipping it.
  lastSavedHashes[bookId] = JSON.stringify(res.state);
  if (activeBook === bookId || activeBook === 'all') renderCurrent();
  reportMergeOutcome(res.conflicts);
}

// A merge is normal and needs no alarm; a conflict means the same record was
// edited in two places and one version was dropped, which the user should hear
// about rather than discover in the ledger later.
function reportMergeOutcome(conflicts) {
  const n = Array.isArray(conflicts) ? conflicts.length : 0;
  if (!n) {
    showToast('↩ Merged in changes from another device', 'ok', 4000);
    return;
  }
  console.warn('[sync] merge conflicts — this device\'s version was kept:', conflicts);
  showToast(
    `⚠ Merged with another device · ${n} record${n === 1 ? '' : 's'} changed in both places kept this device's version`,
    'warn', 7000
  );
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
    recomputeAfters(states[bookId], BOOKS[bookId]);
    lastSavedHashes[bookId] = JSON.stringify(states[bookId]);
    // Watch for live updates
    window._fbWatchSubmissions(bookId, data => {
      window.authorSubmissions[bookId] = data || {};
      if (activeBook === bookId || activeBook === 'all') scheduleRender();
      else { try { updatePublisherActionBanner(); } catch (_) { } }
    });

    window._fbWatch(bookId, json2 => {
      if (json2 === lastSavedHashes[bookId]) return;
      const loaded = JSON.parse(json2);
      states[bookId] = { ...defaultState(book), ...loaded };
      if (!states[bookId].doneIds) states[bookId].doneIds = [];
      if (!states[bookId].artistTransfers) states[bookId].artistTransfers = [];
      if (!states[bookId].artistPayouts) states[bookId].artistPayouts = [];
      recomputeAfters(states[bookId], BOOKS[bookId]);
      lastSavedHashes[bookId] = json2;
      _appliedIdsCache = null;
      if (activeBook === bookId || activeBook === 'all') scheduleRender();
      // Suppress the echo-toast that fires right after a local save is written to Firestore
      const timeSinceLastSave = Date.now() - (lastSaveTimes[bookId] || 0);
      if (timeSinceLastSave > 3000) {
        showToast('↺ ' + book.title + ' updated from Firestore');
      }
    });
  } catch (e) {
    // A book that failed to load and a book with no data render identically —
    // both are an empty ledger — so say which happened. The error itself was
    // discarded entirely before this: no console line, no report, just a
    // status pill reading "connection failed" next to what looks like a book
    // with no sales in it.
    console.error('loadBook failed', bookId, e);
    reportClientError('load-book-failed', e && e.message, { stack: e && e.stack });
    states[bookId] = defaultState(BOOKS[bookId]);
    // Mark the state so a later save can tell it apart from a genuinely empty
    // book. Non-enumerable so it never reaches Firestore via JSON.stringify.
    Object.defineProperty(states[bookId], '_loadFailed', { value: true, enumerable: false, configurable: true });
    setSyncState('error', '<b>Firestore</b> · connection failed');
    const title = (BOOKS[bookId] && BOOKS[bookId].title) || bookId;
    showToast(`⚠ Could not load ${title} — showing an empty book, not real data. Reload once you're back online.`, 'err', 7000);
  }
}

async function toggleFirestoreMode() {
  if (!activeBook || activeBook === 'all') return;
  const isCurrentlyFS = window._useFirestoreForBook(activeBook);

  if (!isCurrentlyFS) {
    if (!(await confirmDialog(
      `Migrate "${BOOKS[activeBook]?.title || activeBook}" to Cloud Firestore?\n\n` +
      `• This book's data will be copied to Firestore now.\n` +
      `• If this is the FIRST book being migrated, global settings (catalog, tax center, rates) will also be copied.\n` +
      `• All other books stay on Realtime Database until you migrate them individually.\n\n` +
      `You can revert at any time using this same button.`,
      { title: 'Migrate to Firestore', okLabel: 'Migrate' }
    ))) return;

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

    if (!(await confirmDialog(
      `Revert "${BOOKS[activeBook]?.title || activeBook}" back to Realtime Database?\n\n` +
      `${!anyOtherFSBook ? '• No other books are on Firestore — global settings will also revert to RTDB.\n' : ''}` +
      `• Current state will be written back to the old database.`,
      { title: 'Revert database', okLabel: 'Revert', danger: true }
    ))) return;

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
  if (!(await confirmDialog(
    "🚨 MASS MIGRATION TO CLOUD FIRESTORE 🚨\n\n" +
    "This will read EVERY book, EVERY expense, EVERY sale, and ALL settings from the Realtime Database and bulk-slice them into Cloud Firestore.\n\n" +
    "This cannot be easily undone. Once this process reaches 100%, your application will be permanently cut over to Firestore globally.\n\n" +
    "Are you absolutely sure you want to proceed?",
    { title: 'Mass migration', okLabel: 'Proceed', danger: true }
  ))) return;

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
    showToast('⚠ Migration failed: ' + (e.message || 'Unknown error'), 'err', 6000);
  }
};

// ── TAX CENTER STATE (Publisher Only)
export let TAX_CENTER = { businessExpenses: [], recurring: [], settings: { baseCurrency: 'CAD', geminiKey: '' } };
export let _fxRateCache = { 'CAD_CAD': 1 };

export async function loadTaxCenter() {
  if (isAuthor()) return;
  try {
    const json = await window._fbLoadSettings('taxCenter'); // handles FS → RTDB fallback internally
    if (json) {
      TAX_CENTER = { businessExpenses: [], recurring: [], settings: { baseCurrency: 'CAD', geminiKey: '' }, ...json };
      if (TAX_CENTER.settings?.claudeKey && !TAX_CENTER.settings?.geminiKey) {
        TAX_CENTER.settings.geminiKey = TAX_CENTER.settings.claudeKey;
      }
    }
    if (TAX_CENTER.settings?.rates) Object.assign(_fxRateCache, TAX_CENTER.settings.rates);
    await refreshDailyRates();
    processRecurringExpenses();
  } catch (e) {
    console.warn('Failed to load tax center', e);
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
        if (!TAX_CENTER.settings) TAX_CENTER.settings = { baseCurrency: 'CAD', geminiKey: '' };
        TAX_CENTER.settings.rates = rates;
        TAX_CENTER.settings.lastRateSync = todayStr;
        saveTaxCenter();
      }
    }
  } catch (e) {
    console.warn("Failed to fetch daily rates", e);
  }
}


async function loadAllBooks() {
  setSyncState('syncing', '<b>Firestore</b> · loading all books.');
  await Promise.all(Object.keys(BOOKS).map(id => loadBook(id)));
  await loadTaxCenter();
  startEmailInboxWatcher();
  setSyncState('ok', '<b>Firestore</b> · connected · live sync on');
  updateSubheader(new Date().toLocaleTimeString());
  renderCurrent();
}

async function forceSync() {
  if (isAuthor() && activeBook) { await loadBook(activeBook); renderCurrent(); }
  else {
    // loadAllBooks() already awaits loadTaxCenter(). Calling it again here
    // re-read the settings document, and on the first sync of a day it also
    // re-fetched the FX rates: refreshDailyRates() marks the day done by
    // calling saveTaxCenter() WITHOUT awaiting it, so the second read raced
    // that write, usually won, and came back without lastRateSync set.
    await loadAllBooks();
  }
}

// ── BOOK SWITCHER (build custom dropdown)
let _bookDropdownOutsideHandler = null;

function buildBookSwitcher() {
  const menu = $('book-dropdown-menu');
  if (!menu) return;
  menu.innerHTML = '';

  const items = [{ id: 'all', title: 'All books', accent: 'rgba(255,255,255,.25)' }]
    .concat(BOOK_LIST.map(b => ({ id: b.id, title: b.title, accent: b.accent })));

  items.forEach((it, idx) => {
    const isActive = (activeBook || 'all') === it.id;
    const item = document.createElement('div');
    item.className = 'book-dd-item' + (isActive ? ' active' : '');
    item.dataset.id = it.id;
    item.style.cssText = `display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer;font-family:'Syne',sans-serif;font-size:12px;font-weight:600;color:${isActive ? 'var(--gold3)' : 'rgba(255,255,255,.7)'};background:${isActive ? 'rgba(255,255,255,.04)' : ''};border-bottom:1px solid rgba(255,255,255,${idx === 0 ? '.06' : '.04'});transition:background .12s;`;
    item.onmouseover = () => { if (!item.classList.contains('active')) item.style.background = 'rgba(255,255,255,.06)'; };
    item.onmouseout = () => { if (!item.classList.contains('active')) item.style.background = ''; };
    item.onclick = (e) => { e.stopPropagation(); switchBook(it.id); closeBookDropdown(); };
    item.innerHTML = `<div style="width:8px;height:8px;border-radius:50%;background:${it.accent};flex-shrink:0;"></div>${escapeHtml(it.title)}`;
    menu.appendChild(item);
  });
}

function toggleBookDropdown() {
  const menu = $('book-dropdown-menu');
  if (!menu) return;
  if (menu.style.display === 'block') {
    closeBookDropdown();
  } else {
    // Rebuild so highlight reflects current activeBook
    buildBookSwitcher();
    menu.style.display = 'block';
    // Defer outside-click listener so it doesn't fire on the click that opened the menu
    setTimeout(() => {
      if (_bookDropdownOutsideHandler) {
        document.removeEventListener('click', _bookDropdownOutsideHandler, true);
      }
      _bookDropdownOutsideHandler = (e) => {
        if (!$('book-dropdown')?.contains(e.target)) closeBookDropdown();
      };
      document.addEventListener('click', _bookDropdownOutsideHandler, true);
    }, 0);
  }
}
function closeBookDropdown() {
  const menu = $('book-dropdown-menu');
  if (menu) menu.style.display = 'none';
  if (_bookDropdownOutsideHandler) {
    document.removeEventListener('click', _bookDropdownOutsideHandler, true);
    _bookDropdownOutsideHandler = null;
  }
}

// ── HEADER CATEGORY MENUS (Money / Audience / Data) ──────────────────────────
let _headerMenuOutsideHandler = null;
function toggleHeaderMenu(key) {
  const wrap = document.getElementById('hmenu-' + key);
  if (!wrap) return;
  const wasOpen = wrap.classList.contains('open');
  closeHeaderMenus();
  if (!wasOpen) {
    wrap.classList.add('open');
    wrap.querySelector('.header-menu-trigger')?.setAttribute('aria-expanded', 'true');
    // Defer outside-click listener so it doesn't fire on the click that opened the menu
    setTimeout(() => {
      _headerMenuOutsideHandler = (e) => { if (!wrap.contains(e.target)) closeHeaderMenus(); };
      document.addEventListener('click', _headerMenuOutsideHandler, true);
    }, 0);
  }
}
function closeHeaderMenus() {
  document.querySelectorAll('.header-menu.open').forEach((w) => {
    w.classList.remove('open');
    w.querySelector('.header-menu-trigger')?.setAttribute('aria-expanded', 'false');
  });
  if (_headerMenuOutsideHandler) {
    document.removeEventListener('click', _headerMenuOutsideHandler, true);
    _headerMenuOutsideHandler = null;
  }
}

// ── PUBLISHER APP-SHELL: sidebar footer account menu (opens UPWARD).
// Self-contained so it never entangles with the header menu logic above.
let _sideAcctOutsideHandler = null;
let _sideAcctKeyHandler = null;
function closeSideAccount() {
  const foot = document.getElementById('side-acct');
  if (foot) foot.classList.remove('open');
  document.getElementById('side-acct-trigger')?.setAttribute('aria-expanded', 'false');
  if (_sideAcctOutsideHandler) {
    document.removeEventListener('click', _sideAcctOutsideHandler, true);
    _sideAcctOutsideHandler = null;
  }
  if (_sideAcctKeyHandler) {
    document.removeEventListener('keydown', _sideAcctKeyHandler, true);
    _sideAcctKeyHandler = null;
  }
}
function toggleSideAccount(ev) {
  if (ev) ev.stopPropagation();
  const foot = document.getElementById('side-acct');
  if (!foot) return;
  const wasOpen = foot.classList.contains('open');
  closeSideAccount();
  if (!wasOpen) {
    foot.classList.add('open');
    document.getElementById('side-acct-trigger')?.setAttribute('aria-expanded', 'true');
    // Defer the outside-click listener so it doesn't fire on the opening click.
    setTimeout(() => {
      _sideAcctOutsideHandler = (e) => { if (!foot.contains(e.target)) closeSideAccount(); };
      document.addEventListener('click', _sideAcctOutsideHandler, true);
    }, 0);
    // Esc closes the menu and returns focus to its trigger. Listener is bound
    // only while open and torn down by closeSideAccount(), so it never leaks
    // or competes with the global modal Esc handler when the menu is shut.
    _sideAcctKeyHandler = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeSideAccount();
        document.getElementById('side-acct-trigger')?.focus();
      }
    };
    document.addEventListener('keydown', _sideAcctKeyHandler, true);
  }
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

function updateSubheader() {
  // Brand tag stays a clean, constant "INVENTORY" in every view.
  const sub = $('hdr-sub');
  if (sub) sub.textContent = 'Inventory';

  // Author/book context lives on the tab bar so the brand block stays one line.
  const auth = $('tab-author');
  if (auth) {
    if (isAuthor()) {
      const book = getBook();
      auth.textContent = (book && book.title ? book.title : 'Author') + ' · Author view';
      auth.classList.add('on');
    } else {
      auth.classList.remove('on');
      auth.textContent = '';
    }
  }

  const isPub = window.IS_PUBLISHER && !isAuthor();

  const upd = $('tab-updated');
  if (upd) {
    upd.textContent = 'updated ' + __GIT_COMMIT_DATE__;
    if (isPub) {
      upd.style.cursor = 'pointer';
      upd.style.textDecoration = 'underline dotted';
      upd.title = 'Click to see what changed';
      upd.onclick = (e) => showWhatsNew(e);
    } else {
      upd.style.cursor = '';
      upd.style.textDecoration = '';
      upd.title = '';
      upd.onclick = null;
    }
  }

  // Publisher app-shell hides the tab bar, so mirror the stamp into the sidebar.
  const pubUpd = $('pub-updated');
  if (pubUpd) {
    pubUpd.textContent = 'updated ' + __GIT_COMMIT_DATE__;
    if (isPub) {
      pubUpd.style.cursor = 'pointer';
      pubUpd.style.textDecoration = 'underline dotted';
      pubUpd.title = 'Click to see what changed';
      pubUpd.onclick = (e) => showWhatsNew(e);
    } else {
      pubUpd.style.cursor = '';
      pubUpd.style.textDecoration = '';
      pubUpd.title = '';
      pubUpd.onclick = null;
    }
  }
}

// The header can't hold the brand, book switcher, action menus AND the KPI
// stats on one line at laptop widths, so on desktop the stat strip lives on
// the (mostly empty) tab bar instead. On mobile the header is intentionally
// stacked, so the stats stay in their full-width header row.
function placeKpiStrip() {
  const kpi = document.querySelector('.kpi-cluster');
  if (!kpi) return;
  const tabBar = $('tab-bar');
  const headerRight = document.querySelector('.header-right');
  const hsep = $('kpi-hsep');
  const desktop = window.matchMedia('(min-width:769px)').matches;
  if (desktop && tabBar) {
    if (kpi.parentElement !== tabBar) tabBar.insertBefore(kpi, $('tab-author'));
    if (hsep) hsep.style.display = 'none';
  } else if (headerRight) {
    if (kpi.parentElement !== headerRight) headerRight.insertBefore(kpi, hsep);
    if (hsep) hsep.style.display = '';
  }
}

let _kpiResizeBound = false;
function bindKpiResize() {
  if (_kpiResizeBound) return;
  _kpiResizeBound = true;
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(placeKpiStrip, 150); });
}

function syncRoleUI() {
  const authorNow = isAuthor();
  // Publisher app-shell (left sidebar): on only for a publisher session that is
  // NOT currently in author view. Scopes all sidebar CSS; authors/logged-out
  // see the unchanged header + tab bar. (Desktop only — CSS reverts < 861px.)
  const pwApp = document.getElementById('pw-app');
  if (pwApp) pwApp.classList.toggle('pub-shell', !authorNow && isPublisherSession());
  updateSubheader();
  placeKpiStrip();
  bindKpiResize();

  const websiteTabBtn = $('website-tab-btn');
  const financialsTabBtn = $('financials-tab-btn');
  const taxcenterTabBtn = $('global-taxcenter-btn');
  const globalActions = $('global-actions');
  const sheetsTabBtn = $('global-sheets-btn');
  const backupsTabBtn = $('global-backups-btn');
  const qrBtn = $('d-qr-btn');
  const qrcodesTabBtn = $('qrcodes-tab-btn');
  const myqrTabBtn = $('myqr-tab-btn');
  const reconcileTabBtn = $('reconcile-tab-btn');
  const opencallTabBtn = $('opencall-tab-btn');
  const webanalyticsTabBtn = $('webanalytics-tab-btn');
  const sidebarWebanalyticsBtn = $('sidebar-webanalytics-btn');
  const shippingTabBtn = $('shipping-tab-btn');
  const bigcartelTabBtn = $('bigcartel-tab-btn');
  const sidebarBigcartelBtn = $('sidebar-bigcartel-btn');

  if (reconcileTabBtn) reconcileTabBtn.style.display = authorNow ? 'none' : '';
  if (opencallTabBtn) opencallTabBtn.style.display = authorNow ? 'none' : '';
  if (websiteTabBtn) websiteTabBtn.style.display = authorNow ? 'none' : '';
  if (financialsTabBtn) financialsTabBtn.style.display = authorNow ? 'none' : '';
  if (globalActions) globalActions.style.display = authorNow ? 'none' : 'flex';
  if (taxcenterTabBtn) taxcenterTabBtn.style.display = authorNow ? 'none' : '';
  if (sheetsTabBtn) sheetsTabBtn.style.display = authorNow ? 'none' : '';
  if (backupsTabBtn) backupsTabBtn.style.display = authorNow ? 'none' : '';
  if (qrBtn) qrBtn.style.display = authorNow ? 'none' : '';
  if (qrcodesTabBtn) qrcodesTabBtn.style.display = authorNow ? 'none' : '';
  if (webanalyticsTabBtn) webanalyticsTabBtn.style.display = authorNow ? 'none' : '';
  if (sidebarWebanalyticsBtn) sidebarWebanalyticsBtn.style.display = authorNow ? 'none' : '';
  if (shippingTabBtn) shippingTabBtn.style.display = authorNow ? 'none' : '';
  if (bigcartelTabBtn) bigcartelTabBtn.style.display = authorNow ? 'none' : '';
  if (sidebarBigcartelBtn) sidebarBigcartelBtn.style.display = authorNow ? 'none' : '';
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
    || $('tab-qrcodes')?.classList.contains('active')
    || $('tab-reconcile')?.classList.contains('active')
    || $('tab-webanalytics')?.classList.contains('active')
    || $('tab-shipping')?.classList.contains('active')
    || $('tab-bigcartel')?.classList.contains('active');
  if (authorNow && publisherOnlyActive) switchTab('dashboard');

  // When switching BACK to publisher view — redirect away from author-only myqr tab
  if (!authorNow && $('tab-myqr')?.classList.contains('active')) switchTab('dashboard');

  // Invoices section: publisher-only inside the Consignment tab
  if (typeof renderInvoices === 'function') renderInvoices();

  // Update badge visibility when changing views (publisher view vs author preview)
  const badge = $('pub-update-badge');
  if (badge) {
    const lastSeen = localStorage.getItem('lm-last-seen-version');
    const currentVersion = typeof __GIT_COMMIT_DATE__ !== 'undefined' ? __GIT_COMMIT_DATE__ : 'Unknown';
    const hasUnseenUpdate = lastSeen && lastSeen !== currentVersion;
    const showBadge = hasUnseenUpdate && !authorNow && isPublisherSession();
    badge.hidden = !showBadge;
    badge.classList.toggle('is-visible', showBadge);
  }
  const stamp = $('pub-updated');
  if (stamp) {
    const lastSeen = localStorage.getItem('lm-last-seen-version');
    const currentVersion = typeof __GIT_COMMIT_DATE__ !== 'undefined' ? __GIT_COMMIT_DATE__ : 'Unknown';
    stamp.classList.toggle('has-unseen-update', Boolean(lastSeen && lastSeen !== currentVersion && !authorNow && isPublisherSession()));
  }

  // Update Profile/Test tabs visibility when changing views
  const profileToggle = $('profile-toggle-group');
  if (profileToggle) {
    profileToggle.style.display = (isPublisherSession() && !authorNow) ? 'inline-flex' : 'none';
  }
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

// ── ACTIVE BOOK / TEST PROFILE TOGGLE TABS CONTROLLER ──
window.lastActiveBookId = 'all';

function updateProfileTabs(type) {
  const activeTab = $('profile-tab-active');
  const testTab = $('profile-tab-test');
  if (!activeTab || !testTab) return;

  if (type === 'test') {
    activeTab.classList.remove('active');
    testTab.classList.add('active', 'test-active');
  } else {
    testTab.classList.remove('active', 'test-active');
    activeTab.classList.add('active');
  }
}

function selectProfileTab(type) {
  if (!isPublisherSession() || isAuthor()) return;

  const testBook = BOOK_LIST.find(isTestBook);

  if (type === 'test') {
    if (testBook) {
      if (activeBook !== testBook.id) {
        window.lastActiveBookId = activeBook;
      }
      switchBook(testBook.id);
      updateProfileTabs('test');
    } else {
      showToast('Test profile book not found in catalog', 'warn');
    }
  } else {
    const restoreId = window.lastActiveBookId || 'all';
    if (testBook && restoreId === testBook.id) {
      switchBook('all');
    } else {
      switchBook(restoreId);
    }
    updateProfileTabs('active');
  }
}
window.selectProfileTab = selectProfileTab;

// ── SEED MOCK TEST DATA FOR LEGIT TEST PROFILE ──
async function seedMockTestData() {
  const testBook = BOOK_LIST.find(isTestBook);
  if (!testBook) {
    showToast('⚠ Test book not found in catalog', 'err');
    return;
  }
  const testBookId = testBook.id;

  if (activeBook !== testBookId) return;

  if (!(await confirmDialog(
    `Reset and seed the Test Profile with rich, realistic sample data?\n\n` +
    `• This will overwrite any existing sales, consignment, and expenses for this book.\n` +
    `• It will configure a production cost of €300, 2 consignment stores, multiple sales channels, pending/received artist expenses, and a stock drift warning.`,
    { title: 'Seed Mock Test Data', okLabel: 'Seed Data' }
  ))) return;

  // 1. Reconfigure book properties in catalog
  const book = BOOKS[testBookId];
  if (!book) {
    showToast('⚠ Test book not found in catalog', 'err');
    return;
  }

  book.maxPrint = 15;
  book.listPrice = 17;
  book.currency = '€';
  book.threshold = 5;
  book.productionCost = 300;
  book.author = 'Test Author';
  book.isbn = '978-3-16-148410-0';
  book.accent = '#10b981'; // Green
  book.accentBg = 'rgba(16, 185, 129, 0.1)';
  book.paymentLink = 'https://paypal.me/testauthor';
  book.authorPaymentLink = 'https://paypal.me/testauthor';
  book.authorPassword = 'test1password';

  await saveCatalogWithDeletions();

  // 2. Build mock state
  const testState = defaultState(book);
  testState.stock = 15; // Set starting stock on hand in database (we'll intentionally drift this from derived count of 9)

  // Consignment stores
  testState.stores = [
    {
      id: 101,
      name: 'Library Store',
      contact: 'Jane Smith',
      email: 'library@test.com',
      phone: '123-456-7890',
      address: '123 Main St',
      city: 'London',
      region: 'Greater London',
      postal: 'EC1A 1BB',
      country: 'UK',
      website: 'librarystore.com',
      terms: 'Net 30',
      rate: 40,
      notes: 'Main consignment partner',
      sent: 5,
      sold: 2,
      returned: 0,
      outstanding: 3,
      amountOwed: 20.4
    },
    {
      id: 102,
      name: 'Bookish Cafe',
      contact: 'Bob Jones',
      email: 'cafe@test.com',
      phone: '789-012-3456',
      address: '456 High St',
      city: 'Paris',
      region: 'Île-de-France',
      postal: '75001',
      country: 'France',
      website: 'bookishcafe.fr',
      terms: 'Net 30',
      rate: 45,
      notes: 'Boutique coffee shop',
      sent: 3,
      sold: 3,
      returned: 0,
      outstanding: 0,
      amountOwed: 0
    }
  ];

  // Ledger entries (shipments & returns)
  testState.ledger = [
    {
      id: 1001,
      storeId: 101,
      storeName: 'Library Store',
      type: 'Shipment',
      date: '2026-07-02',
      qty: 5,
      rate: 40,
      amountDue: 0,
      paid: 'n/a',
      notes: 'Initial consignment stock',
      status: 'sent',
      sheetsId: 'evt_led_1'
    },
    {
      id: 1002,
      storeId: 102,
      storeName: 'Bookish Cafe',
      type: 'Shipment',
      date: '2026-07-03',
      qty: 3,
      rate: 45,
      amountDue: 0,
      paid: 'n/a',
      notes: 'Cafe window display copies',
      status: 'sent',
      sheetsId: 'evt_led_2'
    }
  ];

  // Sales history (direct sales, consignment sales)
  testState.hist = [
    {
      num: 1,
      chan: 'Direct',
      qty: 1,
      price: 17,
      after: 14,
      notes: 'Cash sale to local supporter',
      date: '2026-07-04',
      payment: 'Cash',
      enteredBy: 'publisher',
      sheetsId: 'evt_hist_1'
    },
    {
      num: 2,
      chan: 'Consignment',
      qty: 2,
      price: 17,
      after: 12,
      notes: 'Library Store sales batch',
      date: '2026-07-05',
      sheetsId: 'evt_hist_2',
      consignmentLink: true
    },
    {
      num: 3,
      chan: 'Retail',
      qty: 3,
      price: 17,
      after: 9,
      notes: 'Bookish Cafe buyout settlement',
      date: '2026-07-06',
      sheetsId: 'evt_hist_3',
      consignmentLink: true
    }
  ];

  // Expenses (pending & received artist reimbursements)
  testState.expenses = [
    {
      id: 201,
      desc: 'Printing proof copies (paperback)',
      cat: 'Production',
      amount: 80,
      currency: '€',
      origAmount: 80,
      origCurrency: '€',
      baseAmount: 80,
      date: '2026-07-04',
      ref: 'PR-001',
      received: false,
      gratuity: false
    },
    {
      id: 202,
      desc: 'Promotional flyers & posters',
      cat: 'Marketing',
      amount: 35,
      currency: '€',
      origAmount: 35,
      origCurrency: '€',
      baseAmount: 35,
      date: '2026-07-03',
      ref: 'FL-001',
      received: true,
      gratuity: false
    }
  ];

  // Artist transfers due
  testState.artistTransfers = [
    {
      num: 4,
      date: '2026-07-06',
      amount: 17,
      notes: 'Direct sale collected by author',
      email: 'test@artist.com',
      key: 'transfer_1',
      status: 'pending'
    }
  ];

  states[testBookId] = testState;

  // Recompute statistics
  recomputeAfters(states[testBookId], book);

  // Intentionally set stock to 15 (instead of derived 9) to showcase stock drift banner!
  states[testBookId].stock = 15;

  await saveState(testBookId);

  showToast('✓ Test profile seeded successfully!');
  switchBook(testBookId); // Force redraw
}
window.seedMockTestData = seedMockTestData;

function switchBook(bookId) {
  // Author sessions are locked to a single book; never switch them.
  if (isAuthor() && bookId !== activeBook) return;
  // If a non-'all' bookId no longer exists (e.g. just deleted), fall back to 'all'.
  if (bookId !== 'all' && !BOOKS[bookId]) bookId = 'all';
  closeBookDropdown();
  activeBook = bookId;
  // Update custom dropdown label + dot
  const label = $('book-dropdown-label');
  const dot = $('book-dropdown-dot');
  if (bookId === 'all') {
    if (label) label.textContent = 'All books';
    if (dot) dot.style.background = 'rgba(255,255,255,.25)';
  } else {
    const book = BOOKS[bookId];
    if (label) label.textContent = book.title;
    if (dot) dot.style.background = book.accent;
  }
  // Highlight active item in menu
  document.querySelectorAll('.book-dd-item').forEach(el => {
    const isActive = el.dataset.id === bookId;
    el.style.color = isActive ? 'var(--gold3)' : 'rgba(255,255,255,.7)';
    el.style.background = isActive ? 'rgba(255,255,255,.04)' : '';
  });

  if (bookId === 'all') {
    // Show combined overview, hide per-book tabs
    document.querySelectorAll('.tab-panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    const overview = $('tab-all-overview');
    if (overview) { overview.classList.add('active'); overview.style.display = 'block'; }
    $('tab-bar').style.display = 'none';
    // All-books overview isn't a sidebar destination; clear active nav + title.
    document.querySelectorAll('.snav.active').forEach(b => b.classList.remove('active'));
    const shellTitle = $('shell-page-title');
    if (shellTitle) shellTitle.textContent = 'All books';
    document.documentElement.style.setProperty('--book-accent', 'var(--gold2)');
    document.documentElement.style.setProperty('--book-accent-bg', 'var(--gold-bg)');
    document.documentElement.style.setProperty('--book-accent-light', 'var(--gold3)');
    document.documentElement.style.setProperty('--book-accent-text', 'var(--gold-text)');
    document.documentElement.style.setProperty('--book-accent-contrast', 'var(--ink)');
    applyBodyTint('all');
    updateAllOverview();
    updateHeader();
  } else {
    $('tab-bar').style.display = '';
    const book = BOOKS[bookId];
    // Set CSS accent
    document.documentElement.style.setProperty('--book-accent', book.accent);
    document.documentElement.style.setProperty('--book-accent-bg', book.accentBg);
    document.documentElement.style.setProperty('--book-accent-light', lightenColor(book.accent, 0.25));
    document.documentElement.style.setProperty('--book-accent-text', getContrastSafeText(book.accent));
    document.documentElement.style.setProperty('--book-accent-contrast', getContrastColor(book.accent));
    applyBodyTint(bookId);
    switchTab('dashboard');
    updateHeader();
  }
  // Sync the Active Book / Test Profile tabs
  const testBook = BOOK_LIST.find(isTestBook);
  if (testBook && bookId === testBook.id) {
    updateProfileTabs('test');
    if (!window._realSheetsUrlSaved) {
      window._realSheetsUrl = sheetsUrl;
      window._realSheetsSpreadsheetUrl = sheetsSpreadsheetUrl;
      window._realNotifyUrl = notifyUrl;
      window._realSheetsUrlSaved = true;
    }
    sheetsUrl = 'https://script.google.com/macros/s/mock-test1/exec';
    sheetsSpreadsheetUrl = 'https://docs.google.com/spreadsheets/d/mock-spreadsheet-test1/edit';
  } else {
    updateProfileTabs('active');
    if (bookId !== (testBook ? testBook.id : '')) {
      window.lastActiveBookId = bookId;
    }
    if (window._realSheetsUrlSaved) {
      sheetsUrl = window._realSheetsUrl || '';
      sheetsSpreadsheetUrl = window._realSheetsSpreadsheetUrl || '';
      notifyUrl = window._realNotifyUrl || '';
      window._realSheetsUrlSaved = false;
    }
  }
  if (typeof updateSheetsTabUI === 'function') {
    updateSheetsTabUI();
  }

  const seedBtn = $('d-seed-test-btn');
  if (seedBtn) {
    seedBtn.style.display = (testBook && bookId === testBook.id) ? 'inline-flex' : 'none';
  }

  updateRoleToggleButton();
  syncRoleUI();
  triggerCardAnimations();
}

// Active channel drill-down filter for the history tab. Set by tapping a
// channel row in the All-books analytics legend; cleared via the chip's ✕,
// or automatically once the active book no longer matches.
let histChanFilter = null; // { bookId, chan } | null
window.drillToChannel = function (bookId, chan) {
  histChanFilter = { bookId, chan };
  switchBook(bookId);
  switchTab('history');
};
window.clearHistChanFilter = function () { histChanFilter = null; renderHist(); };

// ── TABS
// Friendly destination labels for the publisher app-shell top bar (#shell-page-title).
const SHELL_TAB_LABELS = {
  dashboard: 'Dashboard', website: 'Website Orders', manual: 'Manual Entry',
  consignment: 'Consignment', history: 'History', expenses: 'Expenses',
  pos: 'Event POS', taxcenter: 'Tax Centre', reconcile: 'Payments', qrcodes: 'QR Codes',
  customers: 'Customers', opencall: 'Open Call', sheets: 'Sheets', backups: 'Backups',
  financials: 'Financials', myqr: 'My QR Code', webanalytics: 'Web Analytics', shipping: 'Shipping',
  bigcartel: 'Big Cartel'
};
export function switchTab(name) {
  // publisher-only tabs redirect authors to dashboard
  if (isAuthor() && (name === 'website' || name === 'backups' || name === 'financials' || name === 'taxcenter' || name === 'sheets' || name === 'qrcodes' || name === 'reconcile' || name === 'customers' || name === 'opencall' || name === 'webanalytics' || name === 'shipping' || name === 'bigcartel')) name = 'dashboard';
  // publisher redirected away from author-only myqr tab
  if (!isAuthor() && name === 'myqr') name = 'dashboard';


  // Selecting a destination closes any open header category menu (and the
  // sidebar footer account menu, if open).
  closeHeaderMenus();
  closeSideAccount();

  document.querySelectorAll('.tab-btn, .header-action-btn, .header-menu-item, .snav').forEach((b) => {
    // We match by checking onclick text to be safe if order ever changes
    if (b.getAttribute('onclick')?.includes(`'${name}'`)) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  // Keep the active sidebar item visible if the rail overflows on short screens
  // (no-op when the sidebar/active item is absent — e.g. authors / mobile).
  document.querySelector('#pub-sidebar .snav.active')?.scrollIntoView({ block: 'nearest' });

  // Reflect the destination as the slim top-bar page title (publisher app-shell).
  const shellTitle = $('shell-page-title');
  if (shellTitle) shellTitle.textContent = SHELL_TAB_LABELS[name] || '';

  // Reflect the active destination on the parent category trigger so a grouped
  // tool (e.g. Payments under Money) still lights its menu button.
  document.querySelectorAll('.header-menu').forEach((m) => {
    m.classList.toggle('has-active', !!m.querySelector('.header-menu-item.active'));
  });

  // Hide all tab panels (including bigcartel and future panels)
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });


  const overview = $('tab-all-overview');
  if (overview) {
    overview.classList.remove('active');
    overview.style.display = 'none';
  }

  const panel = $('tab-' + name);
  if (panel) { panel.style.display = 'block'; panel.classList.add('active'); }

  if (name === 'dashboard') { updateDash(); renderArtistReimburseBanner(); renderPendingExpenses(); }
  if (name === 'history') renderHist();
  if (name === 'manual') updateManualForm();
  if (name === 'consignment') { renderStores(); renderLedger(); renderInvoices(); }
  // renderArtistReimburseBanner writes into this panel too, and used to arrive
  // via renderAll()'s unconditional sweep. Now that the sweep is tab-aware,
  // entering the tab has to render it.
  if (name === 'expenses') { renderExpenses(); renderArtistReimburseBanner(); updateExpenseForm(); }
  if (name === 'opencall') renderOpenCall();
  if (name === 'reconcile') renderReconcile();
  if (name === 'customers') renderCustomers();
  if (name === 'financials') renderFinancials();
  if (name === 'taxcenter') renderTaxCenter();
  if (name === 'sheets') { loadGasCode(); renderSheetsLog(); renderProfitSettings(); switchSettingsSubTab(activeSettingsSubTab); if (typeof updateSheetsTabUI === 'function') updateSheetsTabUI(); }
  if (name === 'qrcodes') renderAllQRCodes();
  if (name === 'myqr') renderAuthorQRPage();
  if (name === 'pos') { renderPOS(); renderPOSFxStatus(); }
  if (name === 'webanalytics') renderWebAnalytics();
  if (name === 'shipping') { initShippingTab(); }
  if (name === 'bigcartel') { renderBigCartelTab(); }
}

function updateHeader() {
  if (activeBook === 'all') {
    // Sum all books in a single pass (was three separate reduce iterations).
    let totalStock = 0, totalRev = 0, totalCon = 0;
    Object.values(states).forEach(s => {
      totalStock += (s.stock || 0);
      totalRev += recognizedRevenueOf(s);
      // ⚡ Bolt Optimization: Use for-loop instead of reduce to avoid function allocation
      let storesCon = 0;
      for (let i = 0; i < s.stores.length; i++) {
        storesCon += s.stores[i].outstanding || 0;
      }
      totalCon += storesCon;
    });
    animateCountValue('h-stock', totalStock);
    animateCountValue('h-revenue', '~' + Math.round(totalRev).toLocaleString());
    animateCountValue('h-consigned', totalCon);
  } else {
    const s = getState(), book = getBook();
    const cur = book.currency;
    animateCountValue('h-stock', s.stock);
    animateCountValue('h-revenue', fmt(recognizedRevenueOf(s), cur));
    // ⚡ Bolt Optimization: Use for-loop instead of reduce to avoid function allocation
    let storesCon = 0;
    for (let i = 0; i < s.stores.length; i++) {
      storesCon += s.stores[i].outstanding || 0;
    }
    animateCountValue('h-consigned', storesCon);
  }
}

// ── ALL BOOKS OVERVIEW
function updateAllOverview() {
  const allBooksVisible = BOOK_LIST.filter(b => !isTestBook(b));

  // Book strips
  const list = $('all-books-list');
  list.innerHTML = allBooksVisible.map(book => {
    const s = states[book.id] || defaultState(book);
    // ⚡ Bolt Optimization: Calculate consigned and owed in a single loop
    let _consigned = 0, owed = 0;
    for (let i = 0; i < s.stores.length; i++) {
      _consigned += s.stores[i].outstanding || 0;
      owed += s.stores[i].amountOwed || 0;
    }
    const pct = Math.max(0, s.stock / book.maxPrint * 100);
    const stockClass = s.stock <= book.threshold ? 'danger' : s.stock <= book.threshold * 2 ? 'warn' : 'gold';
    const cost = book.productionCost || 0;
    const recognizedRev = recognizedRevenueOf(s);
    const broken = cost > 0 && recognizedRev >= cost;
    const bePct = cost > 0 ? Math.min(100, recognizedRev / cost * 100) : null;

    const beBar = (!isAuthor() && bePct !== null) ? `
      <div class="book-progress-wrapper" title="${broken ? 'Production costs fully recovered!' : `${fmt(recognizedRev, book.currency)} of ${fmt(cost, book.currency)} recovered (${bePct.toFixed(0)}%)`}">
        <div class="book-progress-header">
          <span>Break-even</span>
          <span class="progress-pct" style="color:${broken ? 'var(--green)' : 'var(--text3)'}; font-weight:700;">
            ${broken ? '✓ Broken even' : bePct.toFixed(0) + '%'}
          </span>
        </div>
        <div class="bar-track" style="background:rgba(0,0,0,.08);margin-bottom:0;">
          <div class="bar-fill" style="width:${bePct}%;${broken ? 'background:var(--green);' : ''}"></div>
        </div>
      </div>` : '';

    const expTotal = (s.expenses || []).reduce((a, e) => a + (e.amount || 0), 0);

    return `<div class="book-strip" style="--accent-color: ${book.accent}; --accent-color-bg: ${book.accentBg}; --accent-color-light: ${lightenColor(book.accent, 0.25)}; --accent-text: ${getContrastSafeText(book.accent)}; --accent-contrast: ${getContrastColor(book.accent)};">
      <div class="book-cover-3d" aria-hidden="true">
        <div class="book-cover-spine"></div>
        <div class="book-cover-front">
          <div class="book-cover-deco"></div>
        </div>
      </div>
      <div class="book-strip-info">
        <div class="book-strip-title">${escapeHtml(book.title)}</div>
        <div class="book-strip-meta">
          <span>✍ ${escapeHtml(book.author) || '—'}</span>
          <span>&nbsp;·&nbsp; 🏷 ${book.currency}${book.listPrice}</span>
          <span>&nbsp;·&nbsp; 🖨 ${book.maxPrint} printed</span>
        </div>
        <div class="book-progress-wrapper" title="${s.stock} units on hand of ${book.maxPrint} total printed (${pct.toFixed(0)}%)">
          <div class="book-progress-header">
            <span>Stock on hand</span>
            <span class="progress-pct">${s.stock} / ${book.maxPrint} (${pct.toFixed(0)}%)</span>
          </div>
          <div class="bar-track" style="background:rgba(0,0,0,.08);margin-bottom:0;">
            <div class="bar-fill" style="width:${pct}%;"></div>
          </div>
        </div>
        ${beBar}
      </div>
      <div class="book-strip-kpis">
        <div class="bsk">
          <div class="bsk-val ${stockClass}">${s.stock}</div>
          <div class="bsk-label">On hand</div>
        </div>
        <div class="bsk">
          <div class="bsk-val">${s.sold}</div>
          <div class="bsk-label">Sold</div>
        </div>
        <div class="bsk">
          <div class="bsk-val">${owed > 0 ? fmt(owed, book.currency) : '—'}</div>
          <div class="bsk-label">Owed</div>
        </div>
        <div class="bsk">
          <div class="bsk-val ${expTotal > 0 ? 'warn' : ''}">${expTotal > 0 ? fmt(expTotal, book.currency) : '—'}</div>
          <div class="bsk-label">Expenses</div>
        </div>
      </div>
      <div class="book-strip-actions">
        <button class="btn sm gold manage-btn" onclick="switchBook('${book.id}')">
          <span>Manage</span>
          <svg class="manage-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </button>
      </div>
    </div>`;
  }).join('');


  // Combined channel analytics — collect structured data grouped by currency so
  // the view can render visually (stacked bars + per-currency toggle) instead of
  // one dense, hard-to-scan table.
  const byCur = {}; // currency -> { books:[...], channelTotals:{chan:{txns,units,revenue,books:Set}} }
  allBooksVisible.forEach(book => {
    const s = states[book.id] || defaultState(book);
    const entries = Object.entries(s.chStats || {});
    if (!entries.length) return;
    // Direct-to-artist sales bump a channel's txns/units but not its revenue until
    // forwarded; fold the held gross back in per channel so the channel revenue is
    // recognized consistently with the headline figures.
    const heldByChan = {};
    (s.artistTransfers || []).forEach(t => { heldByChan[t.chan] = (heldByChan[t.chan] || 0) + (t.total || 0); });
    const revOf = (chan, cs) => (cs.revenue || 0) + (heldByChan[chan] || 0);
    const bookRev = entries.reduce((a, [chan, cs]) => a + revOf(chan, cs), 0);
    const cur = book.currency;
    const cd = byCur[cur] = byCur[cur] || { books: [], channelTotals: {} };
    const channels = entries.map(([chan, cs]) => {
      const txns = cs.txns || 0, units = cs.units || 0, rev = revOf(chan, cs);
      const t = cd.channelTotals[chan] = cd.channelTotals[chan] || { txns: 0, units: 0, revenue: 0, books: new Set() };
      t.txns += txns; t.units += units; t.revenue += rev; t.books.add(book.title);
      return {
        chan, txns, units, rev,
        avgTxn: txns ? rev / txns : 0, revUnit: units ? rev / units : 0,
        share: bookRev > 0 ? rev / bookRev * 100 : 0
      };
    }).sort((a, b) => b.rev - a.rev);
    const bestChan = (channels.length > 1 && channels[0].rev > 0) ? channels[0].chan : null;
    cd.books.push({ id: book.id, title: book.title, accent: book.accent || 'var(--gold2)', cur, total: bookRev, channels, bestChan });
  });
  Object.values(byCur).forEach(cd => cd.books.sort((a, b) => b.total - a.total));
  window._allChData = byCur;
  const curKeys = Object.keys(byCur);
  if (!curKeys.includes(window._allChCur)) window._allChCur = curKeys[0] || null;
  renderChannelAnalytics();

  // Combined consignment table — data grouped per book so the view can render
  // either a flat active-first list or collapsible per-book groups (renderConsignmentTable).
  const conBookMap = new Map();
  const conTotals = { accounts: 0, active: 0, settled: 0, sent: 0, sold: 0, outstanding: 0 };
  allBooksVisible.forEach(book => {
    const s = states[book.id] || defaultState(book);
    if (!s.stores.length) return;
    const rows = s.stores.map(st => {
      const isActive = st.outstanding > 0;
      const sent = st.sent || 0, sold = st.sold || 0;
      conTotals.accounts += 1;
      conTotals.active += isActive ? 1 : 0;
      conTotals.settled += isActive ? 0 : 1;
      conTotals.sent += sent;
      conTotals.sold += sold;
      conTotals.outstanding += st.outstanding || 0;
      return { store: st.name, sent, sold, outstanding: st.outstanding || 0, isActive, pct: sent ? Math.round((sold / sent) * 100) : 0 };
    });
    const totals = rows.reduce((a, r) => { a.sent += r.sent; a.sold += r.sold; a.outstanding += r.outstanding; a.active += r.isActive ? 1 : 0; return a; }, { sent: 0, sold: 0, outstanding: 0, active: 0 });
    conBookMap.set(book.id, { id: book.id, title: book.title, accent: book.accent || 'var(--gold2)', rows, totals });
  });
  window._allConBooks = Array.from(conBookMap.values());
  if (window._allConGrouped === undefined) {
    try { window._allConGrouped = localStorage.getItem('allConGrouped') === '1'; } catch (_) { window._allConGrouped = false; }
  }
  const sellThrough = conTotals.sent ? Math.round((conTotals.sold / conTotals.sent) * 100) : 0;
  const statsHost = $('all-con-stats');
  if (statsHost) {
    statsHost.innerHTML = `
      <div class="consignment-stat-card focus"><div class="consignment-stat-icon">📦</div><span>Outstanding</span><strong>${conTotals.outstanding}</strong><em>copies still on shelves</em></div>
      <div class="consignment-stat-card"><div class="consignment-stat-icon">🏬</div><span>Active accounts</span><strong>${conTotals.active}</strong><em>${conTotals.settled} settled</em></div>
      <div class="consignment-stat-card"><div class="consignment-stat-icon">📈</div><span>Sell-through</span><strong>${sellThrough}%</strong><em>${conTotals.sold} of ${conTotals.sent} sold</em></div>
    `;
  }
  const statusChip = $('all-con-status-chip');
  if (statusChip) {
    statusChip.className = `pill ${conTotals.active ? 'amber' : 'green'}`;
    statusChip.textContent = conTotals.accounts ? `${conTotals.accounts} account${conTotals.accounts === 1 ? '' : 's'}` : 'No accounts';
  }
  const groupToggle = $('all-con-group-toggle');
  if (groupToggle) {
    groupToggle.classList.toggle('is-on', !!window._allConGrouped);
    groupToggle.setAttribute('aria-pressed', window._allConGrouped ? 'true' : 'false');
  }
  renderConsignmentTable();

  renderGlobalPendingAlert();
}

// Renders #all-con-body from window._allConBooks, honoring the flat/grouped
// toggle (window._allConGrouped) and per-book collapse state
// (window._allConCollapsed) without recomputing the underlying totals.
function conAccountRowHtml(bookId, bookTitle, r, nested) {
  const jump = `switchBook('${bookId}'); setTimeout(()=>switchTab('consignment'), 50);`;
  const titleCell = nested ? `<td class="con-nested-spacer"></td>` : `<td style="font-weight:700;">${escapeHtml(bookTitle)}</td>`;
  return `<tr class="${r.isActive ? 'is-active' : 'is-settled'}${nested ? ' con-nested-row' : ''}">${titleCell}<td><span class="store-name-cell">${escapeHtml(r.store)}</span></td><td class="r col-sent">${r.sent}</td><td class="r">${r.sold}</td><td class="r outstanding-cell">${r.outstanding}</td><td class="col-sellthrough"><div class="con-row-progress con-row-progress-link" role="button" tabindex="0" title="${r.pct}% sold-through — view ${escapeHtml(bookTitle)} consignment" onclick="${jump}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${jump}}"><div class="con-row-progress-bar" style="width:${r.pct}%;"></div></div></td><td>${r.isActive ? '<span class="pill amber">● Active</span>' : '<span class="pill gray">✓ Settled</span>'}</td></tr>`;
}
function renderConsignmentTable() {
  const body = $('all-con-body');
  if (!body) return;
  const conBooks = window._allConBooks || [];
  if (!conBooks.length) {
    body.innerHTML = '<tr><td colspan="7"><div class="empty-state" style="padding:1rem;">No consignment accounts.</div></td></tr>';
    return;
  }
  if (!window._allConGrouped) {
    const flat = [];
    conBooks.forEach(b => b.rows.forEach(r => flat.push({ r, bookId: b.id, bookTitle: b.title })));
    flat.sort((a, b) => (b.r.isActive - a.r.isActive));
    body.innerHTML = flat.map(({ r, bookId, bookTitle }) => conAccountRowHtml(bookId, bookTitle, r)).join('');
    return;
  }
  const collapsed = window._allConCollapsed || (window._allConCollapsed = new Set());
  const sortedBooks = [...conBooks].sort((a, b) => (b.totals.active > 0) - (a.totals.active > 0));
  body.innerHTML = sortedBooks.map(b => {
    const isCollapsed = collapsed.has(b.id);
    const pct = b.totals.sent ? Math.round((b.totals.sold / b.totals.sent) * 100) : 0;
    const statusLabel = b.totals.active ? `${b.totals.active} active` : 'All settled';
    const headerRow = `<tr class="con-group-row ${b.totals.active ? 'is-active' : 'is-settled'}" onclick="toggleConGroup('${b.id}')"><td colspan="2" style="font-weight:800;"><span class="con-group-chevron${isCollapsed ? '' : ' open'}">▸</span><span class="con-group-dot" style="background:${b.accent};"></span>${escapeHtml(b.title)}</td><td class="r col-sent">${b.totals.sent}</td><td class="r">${b.totals.sold}</td><td class="r outstanding-cell">${b.totals.outstanding}</td><td class="col-sellthrough"><div class="con-row-progress" title="${pct}% sold-through"><div class="con-row-progress-bar" style="width:${pct}%;"></div></div></td><td><span class="pill ${b.totals.active ? 'amber' : 'gray'}">${b.totals.active ? '● ' : '✓ '}${statusLabel}</span></td></tr>`;
    if (isCollapsed) return headerRow;
    const sortedRows = [...b.rows].sort((a, c) => (c.isActive - a.isActive));
    return headerRow + sortedRows.map(r => conAccountRowHtml(b.id, b.title, r, true)).join('');
  }).join('');
}
// NOTE: these re-renders are deliberately NOT wrapped in withViewTransition()
// (src/lib/motion.js). View Transitions were shipped across switchTab/switchBook
// in PR #128 and reverted in PR #129 seven minutes later; the helper is kept
// available for opt-in but stays unwired until that call is revisited.
function toggleConGroup(bookId) {
  const collapsed = window._allConCollapsed || (window._allConCollapsed = new Set());
  if (collapsed.has(bookId)) collapsed.delete(bookId); else collapsed.add(bookId);
  renderConsignmentTable();
}
function toggleConGrouping() {
  window._allConGrouped = !window._allConGrouped;
  try { localStorage.setItem('allConGrouped', window._allConGrouped ? '1' : '0'); } catch (_) { /* ignore */ }
  const btn = $('all-con-group-toggle');
  if (btn) {
    btn.classList.toggle('is-on', window._allConGrouped);
    btn.setAttribute('aria-pressed', window._allConGrouped ? 'true' : 'false');
  }
  renderConsignmentTable();
}
window.toggleConGroup = toggleConGroup;
window.toggleConGrouping = toggleConGrouping;

// Polished audience snapshot for the Customers tab.
function renderCustomersStat(allCustomers) {
  const host = $('customer-audience-summary');
  if (!host) return;
  const buyers = allCustomers || buildCustomerList();
  const repeat = buyers.filter(r => r.orders >= 2).length;
  const onList = mailingSubsArray().filter(s => !_isCustomerSuppressed(s.email)).length;
  const unsubscribed = buyers.filter(r => _isCustomerSuppressed(r.email)).length;
  const mailable = Math.max(0, onList - unsubscribed);
  const conversion = buyers.length ? Math.round((onList / buyers.length) * 100) : 0;
  const stat = (label, val, hint, tone = '') => `<div class="audience-stat ${tone}"><span>${label}</span><strong>${val}</strong><em>${hint}</em></div>`;
  host.innerHTML = `<section class="audience-summary-card" aria-label="Audience snapshot">
    <div class="audience-summary-copy">
      <div class="audience-summary-icon">👥</div>
      <div>
        <div class="audience-kicker">Audience snapshot</div>
        <h3>Know who bought, who came back, and who is ready to email.</h3>
        <p>${buyers.length ? `${buyers.length} buyer${buyers.length === 1 ? '' : 's'} found across your sales channels.` : 'No buyers found yet — import sales, log POS orders, or pull Stripe payments to start building this list.'} ${conversion ? `${conversion}% are already on your mailing list.` : 'Add buyers to your mailing list when you are ready to send updates.'}</p>
      </div>
    </div>
    <div class="audience-stat-grid">
      ${stat('Buyers on file', buyers.length, 'deduped by email', 'focus')}
      ${stat('Repeat buyers', repeat, '2+ orders')}
      ${stat('On mailing list', onList, `${mailable} currently mailable`)}
      ${stat('Unsubscribed', unsubscribed, 'excluded from exports')}
    </div>
  </section>`;
}

// ── CHANNEL ANALYTICS RENDERING
// Fixed colour per sales channel so the eye can track a channel across the
// chart, the stacked book bars and the legend dots. Unknown channels get a
// stable colour hashed from a small fallback palette.
const CHANNEL_COLORS = {
  'in person': '#e5a93f', 'book fair': '#2f8f8f', 'website': '#3a7cc8',
  'gratuity': '#b8b0a5', 'consignment': '#8a5cc8', 'direct': '#c8693a', '': '#c8693a',
};
const _CHAN_FALLBACK = ['#6b8f2f', '#c84a6b', '#3a6ec8', '#a8852f', '#5c7a8a'];
function channelColor(chan) {
  const k = (chan || '').toLowerCase().trim();
  if (CHANNEL_COLORS[k] != null) return CHANNEL_COLORS[k];
  let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return _CHAN_FALLBACK[h % _CHAN_FALLBACK.length];
}
const chanLabel = (chan) => (chan && chan.trim()) ? chan : 'Direct';

function renderChannelAnalytics() {
  const host = $('all-ch-analytics');
  if (!host) return;
  const byCur = window._allChData || {};
  const curKeys = Object.keys(byCur);
  if (!curKeys.length) {
    host.innerHTML = '<div class="empty-state" style="padding:1.5rem;">No sales yet.</div>';
    return;
  }
  let cur = window._allChCur;
  if (!curKeys.includes(cur)) cur = window._allChCur = curKeys[0];
  const cd = byCur[cur];

  // Currency toggle — only when more than one currency is in play
  let toggle = '';
  if (curKeys.length > 1) {
    toggle = `<div class="ch-cur-toggle">` + curKeys.map(c => {
      const tot = (byCur[c].books || []).reduce((a, b) => a + b.total, 0);
      return `<button class="ch-cur-btn${c === cur ? ' active' : ''}" onclick="selectAllChCurrency('${c.replace(/'/g, "\\'")}')">${escapeHtml(c)} <span>${fmt(tot, c)}</span></button>`;
    }).join('') + `</div>`;
  }

  // Channel performance — comparative horizontal bar chart
  const chans = Object.entries(cd.channelTotals).map(([chan, t]) => ({ chan, ...t })).sort((a, b) => b.revenue - a.revenue);
  // ⚡ Bolt Optimization: Combine multiple channel aggregate passes into a single loop instead of 4 separate reduces
  let grandRev = 0, grandTxn = 0, grandU = 0, maxRev = 0;
  for (let i = 0; i < chans.length; i++) {
    const x = chans[i];
    grandRev += x.revenue || 0;
    grandTxn += x.txns || 0;
    grandU += x.units || 0;
    if (x.revenue > maxRev) maxRev = x.revenue;
  }
  if (maxRev === 0) maxRev = 1;
  const top = chans[0];
  const activeChans = chans.filter(x => (x.revenue || 0) > 0).length;
  const avgOrder = grandTxn ? grandRev / grandTxn : 0;
  const avgUnit = grandU ? grandRev / grandU : 0;
  const topShare = top && grandRev > 0 ? top.revenue / grandRev * 100 : 0;
  const heroColor = top ? channelColor(top.chan) : 'var(--gold2)';
  const chartRows = chans.map((x, idx) => {
    const share = grandRev > 0 ? x.revenue / grandRev * 100 : 0;
    const col = channelColor(x.chan);
    const avgTxn = x.txns ? x.revenue / x.txns : 0;
    const revUnit = x.units ? x.revenue / x.units : 0;
    return `<div class="ch-bar-row" style="--ch:${col}">
      <div class="ch-rank">${idx + 1}</div>
      <div class="ch-bar-main">
        <div class="ch-bar-head"><span class="ch-dot" style="background:${col}"></span><span class="ch-bar-name">${escapeHtml(chanLabel(x.chan))}</span><span class="ch-bar-val">${fmt(x.revenue, cur)} <em>${share.toFixed(0)}%</em></span></div>
        <div class="ch-bar-track" role="img" aria-label="${escapeHtml(chanLabel(x.chan))} generated ${share.toFixed(0)}% of ${escapeHtml(cur)} revenue"><div class="ch-bar-fill" style="width:${x.revenue / maxRev * 100}%;background:linear-gradient(90deg, ${lightenColor(col, 0.25)}, ${col});"></div></div>
        <div class="ch-bar-meta"><span>${x.txns} txn</span><span>${x.units} units</span>${x.txns ? `<span>${fmt(avgTxn, cur)}/txn</span>` : ''}${x.units ? `<span>${fmt(revUnit, cur)}/unit</span>` : ''}</div>
      </div>
    </div>`;
  }).join('');
  const chart = `<div class="ch-panel">
    <div class="ch-hero" style="--ch:${heroColor}">
      <div>
        <div class="ch-eyebrow">Channel performance</div>
        <div class="ch-hero-title">${top ? `${escapeHtml(chanLabel(top.chan))} leads at ${topShare.toFixed(0)}%` : 'No leading channel yet'}</div>
        <div class="ch-hero-sub">${fmt(grandRev, cur)} total · ${grandTxn} transactions · ${grandU} units</div>
      </div>
      <div class="ch-hero-badge">${top ? `Top channel<br><strong>${fmt(top.revenue, cur)}</strong>` : 'No sales'}</div>
    </div>
    <div class="ch-metrics">
      <div class="ch-metric"><span>Total revenue</span><strong>${fmt(grandRev, cur)}</strong></div>
      <div class="ch-metric"><span>Avg / txn</span><strong>${fmt(avgOrder, cur)}</strong></div>
      <div class="ch-metric"><span>Avg / unit</span><strong>${fmt(avgUnit, cur)}</strong></div>
      <div class="ch-metric"><span>Active channels</span><strong>${activeChans}/${chans.length}</strong></div>
    </div>
    <div class="ch-bars">${chartRows}</div>
  </div>`;

  // Per-book cards — one stacked channel-mix bar per book + colour-keyed legend
  const cards = cd.books.map(b => {
    const segs = b.channels.filter(c => c.rev > 0).map(c =>
      `<div class="ch-seg" style="width:${b.total > 0 ? c.rev / b.total * 100 : 0}%;background:${channelColor(c.chan)}" title="${escapeHtml(chanLabel(c.chan))}: ${fmt(c.rev, b.cur)}"></div>`
    ).join('') || `<div class="ch-seg" style="width:100%;background:var(--cream3)"></div>`;
    const legend = b.channels.map(c => {
      const top = c.chan === b.bestChan;
      // Rows with real transactions drill into that book + channel's order history.
      const clickable = c.txns > 0;
      const jsChan = (c.chan || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const tap = clickable
        ? ` class="ch-leg-row ch-leg-tap" title="View ${escapeHtml(chanLabel(c.chan))} orders" onclick="${escapeHtml(`drillToChannel('${b.id}','${jsChan}')`)}"`
        : ` class="ch-leg-row"`;
      return `<div${tap}>
        <span class="ch-dot" style="background:${channelColor(c.chan)}"></span>
        <span class="ch-leg-name">${escapeHtml(chanLabel(c.chan))}${top ? ' <span class="pill gold ch-top">TOP</span>' : ''}</span>
        <span class="ch-leg-val">${fmt(c.rev, b.cur)} <em>${c.share.toFixed(0)}%</em></span>
        <span class="ch-leg-meta">${c.txns} txn · ${c.units} u${clickable ? ' <span class="ch-leg-go">›</span>' : ''}</span>
      </div>`;
    }).join('');
    return `<div class="ch-book-card">
      <div class="ch-book-head"><span class="ch-book-title">${escapeHtml(b.title)}</span><span class="ch-book-total">${fmt(b.total, b.cur)}</span></div>
      <div class="ch-stack">${segs}</div>
      <div class="ch-legend">${legend}</div>
    </div>`;
  }).join('');

  host.innerHTML = toggle + chart + `<div class="ch-book-grid">${cards}</div>`;
}
window.selectAllChCurrency = function (c) { window._allChCur = c; renderChannelAnalytics(); };

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

  // Open-call contributors with an outstanding next step, grouped by book.
  const openCallBooks = [];
  Object.keys(states || {}).forEach(bookId => {
    const list = states[bookId]?.openCall;
    if (!Array.isArray(list) || !list.length) return;
    const waiting = list.filter(c => OC_STAGES.some(st => !c[st.key])).length;
    if (waiting > 0) {
      openCallBooks.push({ bookId, waiting, title: BOOKS[bookId]?.title || bookId });
    }
  });

  let html = '';
  if (pendingBooks.length) {
    html += `
      <div style="background:var(--cream3); border:1px solid var(--amber); border-left:4px solid var(--amber); border-radius:var(--r2); padding:1rem;">
        <div style="font-weight:600; color:var(--text2); margin-bottom:8px; display:flex; align-items:center; gap:8px;">
          <span class="pill amber">Action Required</span> Pending Author Submissions
        </div>
        <div style="font-size:13px; color:var(--text3); margin-bottom:12px;">The following books have new sales or expenses awaiting your approval:</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${pendingBooks.map(b => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:8px 12px; border-radius:var(--r1); border:1px solid var(--border);">
              <div>
                <strong style="color:var(--text2);">${escapeHtml(b.title)}</strong>
                <span style="font-size:12px; color:var(--text3); margin-left:8px;">
                  ${b.sCount ? `${b.sCount} sale(s)` : ''} ${b.sCount && b.eCount ? '·' : ''} ${b.eCount ? `${b.eCount} expense(s)` : ''}
                </span>
              </div>
              <button class="btn sm gold" onclick="switchBook('${b.bookId}'); setTimeout(()=>switchTab('history'), 50);">Review →</button>
            </div>
          `).join('')}
        </div>
      </div>`;
  }
  if (openCallBooks.length) {
    html += `
      <div style="background:var(--cream3); border:1px solid var(--gold-line); border-left:4px solid var(--gold); border-radius:var(--r2); padding:1rem; margin-top:${pendingBooks.length ? '12px' : '0'};">
        <div style="font-weight:600; color:var(--text2); margin-bottom:8px; display:flex; align-items:center; gap:8px;">
          <span class="pill gold">Open Call</span> Contributors awaiting their next step
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${openCallBooks.map(b => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:8px 12px; border-radius:var(--r1); border:1px solid var(--border);">
              <div>
                <strong style="color:var(--text2);">${escapeHtml(b.title)}</strong>
                <span style="font-size:12px; color:var(--text3); margin-left:8px;">${b.waiting} contributor${b.waiting > 1 ? 's' : ''} awaiting next step</span>
              </div>
              <button class="btn sm gold" onclick="switchBook('${b.bookId}'); setTimeout(()=>switchTab('opencall'), 50);">Review →</button>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  if (html) {
    alertDiv.style.display = 'block';
    alertDiv.innerHTML = html;
  } else {
    alertDiv.style.display = 'none';
  }
}

// ── BOOK CONTEXT BANNERS
function updateContextBanners() {
  if (!activeBook || activeBook === 'all') return;
  const book = getBook();
  ['dash', 'web', 'man', 'con', 'hist', 'exp'].forEach(sfx => {
    const t = $('bc-title-' + sfx);
    if (t) t.textContent = book.title;
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
        if (isDirectToArtistSale(raw)) artistPaymentCount++;
      } catch (_) { }
    });
  });

  const total = salesCount + expCount;
  const signature = `${salesCount}|${expCount}|${artistPaymentCount}|${booksWithPending.map(b => b.bookId).join(',')}`;

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
  if (artistPaymentCount > 0) parts.push(`${artistPaymentCount} artist payment${artistPaymentCount > 1 ? 's' : ''} to approve`);
  if (salesCount - artistPaymentCount > 0) parts.push(`${salesCount - artistPaymentCount} sale${(salesCount - artistPaymentCount) > 1 ? 's' : ''}`);
  if (expCount > 0) parts.push(`${expCount} expense${expCount > 1 ? 's' : ''}`);

  titleEl.textContent = artistPaymentCount > 0
    ? `Action required · ${artistPaymentCount} artist payment${artistPaymentCount > 1 ? 's' : ''} awaiting approval`
    : `Action required · ${total} pending submission${total > 1 ? 's' : ''}`;
  subEl.textContent = parts.join(' · ') + ` — across ${booksWithPending.length} book${booksWithPending.length > 1 ? 's' : ''}.`;

  // Build action buttons: jump straight to the first pending book, plus per-section buttons if a single book has pending
  actEl.innerHTML = '';
  if (booksWithPending.length === 1) {
    const { bookId, sc, ec } = booksWithPending[0];
    if (sc > 0) {
      const b = document.createElement('button');
      b.className = 'pab-btn'; b.type = 'button';
      b.textContent = `Review ${sc} sale${sc > 1 ? 's' : ''} →`;
      b.onclick = () => { try { switchBook(bookId); } catch (_) { } setTimeout(() => switchTab('history'), 50); };
      actEl.appendChild(b);
    }
    if (ec > 0) {
      const b = document.createElement('button');
      b.className = 'pab-btn'; b.type = 'button';
      b.textContent = `Review ${ec} expense${ec > 1 ? 's' : ''} →`;
      b.onclick = () => { try { switchBook(bookId); } catch (_) { } setTimeout(() => switchTab('expenses'), 50); };
      actEl.appendChild(b);
    }
  } else {
    const b = document.createElement('button');
    b.className = 'pab-btn'; b.type = 'button';
    b.textContent = 'Review all →';
    b.onclick = () => { try { switchBook('all'); } catch (_) { } };
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

// Gross of direct-to-artist sales the artist has collected but not yet forwarded.
function heldGrossOf(s) {
  return (s.artistTransfers || []).reduce((sum, t) => sum + (t.total || 0), 0);
}
// Revenue recognized for a book: cash collected plus the gross still held by the
// artist. A sale is complete the moment it happens, so its full value is recognized
// immediately and the held cash is treated as a receivable — NOT as deferred revenue.
// This keeps headline revenue consistent with the units-sold, tier, earnings, and
// Financial Center figures (all of which already count completed sales), while the
// collected-vs-held split shows the publisher's actual cash position.
// Cleared at the start of every renderAll() so the cache is per-render-cycle
// and can never return a value stale from a previous state mutation.
let _revMemo = new Map();
function recognizedRevenueOf(s) {
  if (_revMemo.has(s)) return _revMemo.get(s);
  const v = (s.revenue || 0) + heldGrossOf(s);
  _revMemo.set(s, v);
  return v;
}

// ── DASHBOARD (per book)
// Signature of an on-hand drift the publisher chose to dismiss for this session.
// Cleared implicitly whenever the numbers change (the signature stops matching),
// so a genuinely new discrepancy resurfaces rather than staying hidden forever.
let _dismissedDriftSig = null;
function dismissStockDrift() {
  const b = $('d-stock-drift-banner');
  if (b) { _dismissedDriftSig = b.dataset.sig || null; b.style.display = 'none'; }
}

function updateDash() {
  if (!activeBook || activeBook === 'all') return;
  const s = getState(), book = getBook();
  renderBookPendingAlert();
  const cur = book.currency;
  updateContextBanners();
  $('d-book-title').textContent = book.title;
  // "Email artist for payment" button: publisher-only, needs an artist email on
  // file and a connected Sheet/Web App to actually send through.
  const emailArtistBtn = $('d-email-artist-btn');
  if (emailArtistBtn) {
    const canEmail = !isAuthor() && !!(book.authorEmail || '').trim() && !!sheetsUrl;
    emailArtistBtn.style.display = canEmail ? '' : 'none';
  }
  // Approval-emails status: publisher-only at-a-glance check that artist
  // submissions can actually reach you. "On" needs a shared notify endpoint
  // (set when the Sheet was connected); "off" means submissions sync silently.
  const notifyStatus = $('d-notify-status');
  if (notifyStatus) {
    if (isAuthor()) {
      notifyStatus.style.display = 'none';
    } else {
      const on = !!(sheetsUrl || notifyUrl);
      notifyStatus.style.display = '';
      notifyStatus.textContent = on ? '✓ Approval emails on' : '⚠ Approval emails off';
      notifyStatus.className = 'pill ' + (on ? 'green' : 'amber');
    }
  }
  $('d-book-author').textContent = (book.author || '—') + ' · List price ' + cur + book.listPrice;
  $('d-book-isbn').textContent = book.isbn || '—';
  const cost = book.productionCost || 0;
  const printed = book.maxPrint || 0;
  let stockSubText = 'of ' + printed + ' printed';
  if (!isAuthor() && cost > 0 && printed > 0) {
    stockSubText += ' · ' + fmt(cost / printed, cur) + '/book';
  }
  $('d-stock-sub').textContent = stockSubText;
  $('d-thresh-sub').textContent = 'threshold: ' + book.threshold + ' units';
  $('d-thresh-label').textContent = 'Alert at ' + book.threshold + ' units';
  animateCountValue('d-stock', s.stock); animateCountValue('h-stock', s.stock);
  // Surface on-hand drift: if the stored count disagrees with what the records
  // imply (a sale/return/consignment that didn't update inventory, or an
  // offline-merge hiccup), nudge toward the one-click repair instead of letting
  // a silently-wrong number sit on the dashboard. Reconciling on-hand is a
  // publisher action, so the banner and the repair button stay hidden for
  // authors — and the banner can be dismissed without forcing a recalculation.
  const driftBanner = $('d-stock-drift-banner');
  if (driftBanner) {
    const derivedOnHand = deriveOnHand(s, book);
    const sig = `${activeBook}:${s.stock}:${derivedOnHand}`;
    const show = !isAuthor() && derivedOnHand !== s.stock && _dismissedDriftSig !== sig;
    if (show) {
      const diff = derivedOnHand - s.stock;
      $('d-stock-drift-value').textContent = `${s.stock} on file · ${derivedOnHand} per records (${diff > 0 ? '+' : ''}${diff})`;
      driftBanner.dataset.sig = sig;
      driftBanner.style.display = '';
    } else {
      driftBanner.style.display = 'none';
    }
  }
  const recalcWrap = $('d-recalc-onhand-wrap');
  if (recalcWrap) recalcWrap.style.display = isAuthor() ? 'none' : '';
  animateCountValue('d-sold', s.sold);
  const heldGross = heldGrossOf(s);
  const recognizedRev = recognizedRevenueOf(s);
  animateCountValue('d-revenue', fmt(recognizedRev, cur)); animateCountValue('h-revenue', fmt(recognizedRev, cur));
  const revSub = $('d-revenue-sub');
  if (revSub) revSub.textContent = heldGross > 0.01
    ? `${fmt(s.revenue, cur)} collected · ${fmt(heldGross, cur)} held by artist`
    : 'total collected';
  $('d-avg-sub').textContent = 'avg ' + (s.sold > 0 ? fmt(recognizedRev / s.sold, cur) : '—');
  // ⚡ Bolt Optimization: Calculate consigned and owed in a single loop
  let consigned = 0, owed = 0;
  for (let i = 0; i < s.stores.length; i++) {
    consigned += s.stores[i].outstanding || 0;
    owed += s.stores[i].amountOwed || 0;
  }
  animateCountValue('d-consigned', consigned); animateCountValue('h-consigned', consigned);
  $('d-stores').textContent = s.stores.length;
  animateCountValue('d-owed', fmt(owed, cur)); $('d-owed').className = 'kpi-value' + (owed > 0 ? ' warn' : '');
  const pendingTransfers = [...(s.artistTransfers || [])];

  // Merge pending sales where they collected payment
  const pbSales2 = window.authorSubmissions[activeBook]?.sales || {};
  Object.keys(pbSales2).forEach(k => {
    const raw = (typeof pbSales2[k].data === 'string') ? JSON.parse(pbSales2[k].data) : pbSales2[k].data;
    if (isDirectToArtistSale(raw)) {
      pendingTransfers.push({
        ...raw,
        total: (raw.qty || 0) * (raw.price || 0)
      });
    }
  });

  const pendingTotal = pendingTransfers.reduce((a, t) => a + t.total, 0);
  animateCountValue('d-artist-pending', pendingTransfers.length > 0 ? fmt(pendingTotal, cur) : '—');
  $('d-artist-pending').className = 'kpi-value' + (pendingTransfers.length > 0 ? ' warn' : '');
  $('d-artist-pending-sub').textContent = pendingTransfers.length > 0 ? `${pendingTransfers.length} order${pendingTransfers.length > 1 ? 's' : ''} (incl. pending) awaiting forwarding` : 'no pending transfers';
  renderArtistTransfers();
  $('d-low').textContent = s.stock <= book.threshold ? '⚠ Low' : 'OK';
  $('d-low').className = 'kpi-value' + (s.stock <= book.threshold ? ' danger' : '');
  const pct = Math.max(0, s.stock / book.maxPrint * 100);
  $('d-bar').style.width = pct + '%';
  $('d-bar').style.background = s.stock <= book.threshold ? '#f87171' : book.accent;
  $('d-bar-label').textContent = s.stock + ' / ' + book.maxPrint + ' units on hand';
  const al = $('d-alert');
  if (s.stock <= book.threshold) { al.className = 'stock-alert danger'; al.textContent = '⚠ Below threshold (' + book.threshold + ') — reorder now.'; }
  else if (s.stock <= book.threshold * 2) { al.className = 'stock-alert warn'; al.textContent = 'Getting low — ' + s.stock + ' units remaining.'; }
  else { al.className = 'stock-alert ok'; al.textContent = 'Stock is healthy.'; }
  const ckeys = Object.keys(s.chStats || {});
  $('ch-body').innerHTML = ckeys.length ? ckeys.map(k => { const cs = s.chStats[k]; return `<tr><td style="font-weight:600;">${escapeHtml(chanLabel(k))}</td><td class="r">${cs.txns}</td><td class="r">${cs.units}</td><td class="r">${fmt(cs.revenue, cur)}</td></tr>`; }).join('') : '<tr><td colspan="4"><div class="empty-state" style="padding:1rem;">No sales yet.</div></td></tr>';
  $('dash-con-body').innerHTML = s.stores.length ? s.stores.map(st => `<tr><td style="font-weight:600;">${escapeHtml(st.name)}</td><td class="r">${st.sent}</td><td class="r">${st.sold}</td><td class="r">${st.returned}</td><td class="r">${st.outstanding}</td><td>${st.outstanding > 0 ? '<span class="pill amber">Active</span>' : '<span class="pill gray">Settled</span>'}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty-state" style="padding:1rem;">No consignment accounts.</div></td></tr>';
  // Show danger zone only for publisher — explicitly hide for authors so it
  // doesn't linger when switching from publisher into an author view.
  if (!isAuthor()) {
    $('danger-zone-sect').style.display = '';
    $('danger-zone-block').style.display = 'flex';
  } else {
    $('danger-zone-sect').style.display = 'none';
    $('danger-zone-block').style.display = 'none';
  }
  // ── EXPENSES SUMMARY (publisher only)
  if (!isAuthor()) {

    renderPendingExpenses();
    const expenses = s.expenses || [];
    const unreceivedExp = [];
    let expTotal = 0;
    for (const e of expenses) {
      if (!e.received && !isGratuityExpense(e)) {
        unreceivedExp.push(e);
        expTotal += (e.amount || 0);
      }
    }
    const expKpi = $('d-expenses-kpi');
    const expSect = $('d-expenses-sect');
    if (unreceivedExp.length) {
      // KPI tile
      if (expKpi) { expKpi.style.display = ''; }
      animateCountValue('d-expenses-owed', fmt(expTotal, cur));
      $('d-expenses-owed-sub').textContent = `${unreceivedExp.length} expense${unreceivedExp.length !== 1 ? 's' : ''} outstanding`;
      // Detail table — dark banner style
      if (expSect) {
        expSect.style.display = '';
        animateCountValue('d-exp-total', fmt(expTotal, cur));
        $('d-exp-count').textContent = `${expenses.length} expense${expenses.length !== 1 ? 's' : ''} logged`;
        $('d-exp-body').innerHTML = unreceivedExp.map(e => `
          <tr>
            <td style="padding:6px 0;color:rgba(255,255,255,.35);white-space:nowrap;">${fmtD(e.date)}</td>
            <td style="padding:6px 8px;color:rgba(255,255,255,.7);font-weight:500;">${escapeHtml(e.desc)}</td>
            <td style="padding:6px 8px;"><span style="font-size:10px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.4);padding:2px 8px;border-radius:100px;">${escapeHtml(e.cat)}</span></td>
            <td style="padding:6px 8px;color:rgba(255,255,255,.25);">${escapeHtml(e.ref) || '—'}</td>
            <td style="padding:6px 0;text-align:right;color:#f87171;font-weight:500;">${fmt(e.amount, cur)}</td>
          </tr>`).join('');
        // Payment button
        const artistLink = (s.artistPaymentLink || '').trim();
        const payBtn = $('d-exp-pay-btn');
        const payHint = $('d-exp-pay-hint');
        if (payBtn) {
          if (artistLink) {
            payBtn.href = artistLink.startsWith('http') ? artistLink : 'https://' + artistLink;
            payBtn.style.display = '';
            if (payHint) payHint.textContent = 'Opens payment link in a new tab';
          } else {
            payBtn.style.display = 'none';
            if (payHint) payHint.textContent = 'Artist has not set a payment link yet';
          }
        }
      }
    } else {
      if (expKpi) expKpi.style.display = 'none';
      if (expSect) expSect.style.display = 'none';
    }
  }

  // ── BREAK-EVEN (publisher only)
  if (!isAuthor() && cost > 0) {
    $('d-breakeven-kpi').style.display = '';
    $('d-breakeven-block').style.display = '';
    const pctBe = Math.min(100, recognizedRev / cost * 100);
    const remaining = Math.max(0, cost - recognizedRev);
    const broken = recognizedRev >= cost;
    $('d-breakeven-val').textContent = broken ? '✓ Done' : fmt(remaining, cur) + ' to go';
    $('d-breakeven-val').className = 'kpi-value' + (broken ? ' gold' : '');
    $('d-breakeven-sub').textContent = `of ${fmt(cost, cur)} production cost`;
    $('d-be-title').textContent = broken ? 'Project has broken even' : 'Not yet broken even';
    $('d-be-sub').textContent = `Production cost: ${fmt(cost, cur)} · Revenue to date: ${fmt(recognizedRev, cur)}`;
    $('d-be-bar').style.width = pctBe + '%';
    $('d-be-bar').style.background = broken ? '#4ade80' : pctBe >= 70 ? '#fb923c' : (book.accent || 'var(--gold2)');
    $('d-be-bar-label').textContent = `${fmt(recognizedRev, cur)} recovered (${pctBe.toFixed(1)}%)`;
    $('d-be-bar-right').textContent = broken ? 'Break-even reached ✓' : `${fmt(remaining, cur)} remaining`;
    const trackEl = $('d-be-bar-track');
    if (trackEl) {
      trackEl.title = broken ? 'Production costs fully recovered!' : `${fmt(recognizedRev, cur)} of ${fmt(cost, cur)} recovered (${pctBe.toFixed(1)}%)`;
    }
    const al = $('d-be-alert');
    if (broken) {
      al.className = 'stock-alert ok';
      al.textContent = '✓ Production costs fully recovered — everything earned from here is profit.';
    } else {
      const unitsNeeded = remaining > 0 ? Math.ceil(remaining / (book.listPrice || 1)) : 0;
      const isClose = pctBe >= 70;

      al.className = 'stock-alert warn';

      if (isClose) {
        al.style.borderLeftColor = '#fb923c';
        al.style.background = 'rgba(251, 146, 60, 0.08)';
        al.style.color = '#fb923c';
      } else {
        al.style.borderLeftColor = 'rgba(200, 145, 58, 0.5)';
        al.style.background = 'rgba(200, 145, 58, 0.08)';
        al.style.color = 'var(--gold2)';
      }

      const themeColor = isClose ? '#fb923c' : 'var(--gold3)';
      const themeBg = isClose ? 'rgba(251, 146, 60, 0.12)' : 'rgba(200, 145, 58, 0.12)';
      const themeBorder = isClose ? 'rgba(251, 146, 60, 0.25)' : 'rgba(200, 145, 58, 0.25)';

      al.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; width:100%;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:13px; opacity:0.85;">⚠️</span>
            <span style="font-weight:600; font-family:'Syne', sans-serif;">${isClose ? 'Almost broken even:' : 'Not yet broken even:'}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="display:inline-flex; align-items:center; gap:6px; background:${themeBg}; border:1px solid ${themeBorder}; color:${themeColor}; font-family:'DM Mono', monospace; font-size:11px; font-weight:700; padding:4px 10px; border-radius:100px; line-height:1;">
              🎯 ${fmt(remaining, cur)} remaining
            </span>
            <span style="display:inline-flex; align-items:center; gap:6px; background:${themeBg}; border:1px solid ${themeBorder}; color:${themeColor}; font-family:'DM Mono', monospace; font-size:11px; font-weight:700; padding:4px 10px; border-radius:100px; line-height:1;">
              📚 ~${unitsNeeded} unit${unitsNeeded !== 1 ? 's' : ''} needed
            </span>
          </div>
        </div>
      `;
    }
  } else {
    $('d-breakeven-kpi').style.display = 'none';
    $('d-breakeven-block').style.display = 'none';
  }

  // ── NET TO PUBLISHER KPI (only shown when profit sharing is configured)
  if (book.profitTiers && book.profitTiers.length > 0) {
    const earningsStats = calculateArtistEarnings(activeBook);
    if (earningsStats && $('d-net-publisher-kpi')) {
      $('d-net-publisher-kpi').style.display = '';
      animateCountValue('d-net-publisher', fmt(earningsStats.netPublisher, cur));
    }
  } else if ($('d-net-publisher-kpi')) {
    $('d-net-publisher-kpi').style.display = 'none';
  }

  // ── PROFIT SHARING BREAKDOWN
  renderProfitSharingBreakdown(activeBook);
}


function getProfitTiersHtml(book, stats, cur) {
  const hasCap = (t) => Number.isFinite(t.revenueUpTo) && t.revenueUpTo > 0;
  const effectiveCap = (t) => {
    const isBreakEvenTier = (t.label || '').toLowerCase().includes('break');
    if (isBreakEvenTier && book.productionCost > 0) return book.productionCost;
    return hasCap(t) ? t.revenueUpTo : null;
  };
  const tiers = [...book.profitTiers].sort((a, b) => (hasCap(a) ? a.revenueUpTo : Infinity) - (hasCap(b) ? b.revenueUpTo : Infinity));

  // Find which tier is currently active based on cumulative revenue
  const currentTier = tiers.find(t => effectiveCap(t) !== null && stats.cumulativeRevenue < effectiveCap(t)) || tiers[tiers.length - 1];
  const nextTier = tiers.find(t => effectiveCap(t) !== null && stats.cumulativeRevenue < effectiveCap(t));

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
    const tCap = effectiveCap(t);
    const isActive = t === currentTier;
    const isCompleted = tCap !== null && stats.cumulativeRevenue >= tCap;
    const threshold = tCap !== null ? `Up to ${fmt(tCap, cur)}` : 'No cap';
    const tierStat = (stats.perTier || []).find(p => p.tier === t);
    const earned = tierStat ? tierStat.artistEarned : 0;
    const tierRev = tierStat ? tierStat.revenue : 0;
    const prevCap = i > 0 && effectiveCap(tiers[i - 1]) !== null ? effectiveCap(tiers[i - 1]) : 0;
    const tierCap = tCap !== null ? tCap - prevCap : null;
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

  return { tierHeader, tierHtml, tiers, nextTier, effectiveCap };
}

function getRevenueProgressHtml(stats, tiers, nextTier, effectiveCap, cur) {
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
          <div class="bar-fill" style="width:${pct}%; height:5px; border-radius:100px;"></div>
        </div>
        <div style="font-size:10px;color:rgba(255,255,255,.62);margin-top:6px;">${fmt(stats.cumulativeRevenue, cur)} of ${fmt(target, cur)} to reach ${enterTier ? enterTier.label : 'next tier'}</div>
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
  return progressHtml;
}

function getOwedCardDetails(stats, cur) {
  const owed = stats.owedToArtist;
  const artistOwesPublisher = owed < -0.01;

  // The "Owed to artist" card flips to an overpaid state when payouts exceed the
  // artist's net earnings (the publisher's cut held by the artist is tracked
  // separately on the "Held by artist" card, not netted in here).

  let owedLabel, owedVal, owedSub, owedCardBg, owedCardBorder, owedValColor, owedSubColor;
  if (artistOwesPublisher) {
    owedLabel = '⚠ Overpaid to artist';
    owedVal = fmt(Math.abs(owed), cur);
    owedSub = 'credit against future earnings';
    owedValColor = 'var(--red)';
    owedSubColor = 'var(--red)';
    owedCardBg = 'rgba(248,113,113,.12)';
    owedCardBorder = '1px solid rgba(248,113,113,.4)';
  } else if (owed > 0.01) {
    owedLabel = '⚠ Owed to artist';
    owedVal = fmt(owed, cur);
    owedSub = 'action needed';
    owedValColor = 'var(--gold2)';
    owedSubColor = 'var(--gold2)';
    owedCardBg = 'rgba(212,175,55,.12)';
    owedCardBorder = '1px solid rgba(212,175,55,.35)';
  } else {
    owedLabel = 'Owed to artist';
    owedVal = fmt(0, cur);
    owedSub = 'all settled ✓';
    owedValColor = 'var(--green)';
    owedSubColor = 'var(--green)';
    owedCardBg = 'rgba(74,222,128,.1)';
    owedCardBorder = '1px solid rgba(74,222,128,.3)';
  }
  return { owedLabel, owedVal, owedSub, owedCardBg, owedCardBorder, owedValColor, owedSubColor, owed };
}

function getArtistHeldHtml(stats, cur) {
  const hasHeld = stats.heldByArtistGross > 0.01;

  const heldCardHtml = hasHeld ? `
      <div class="card" style="margin:0; background:rgba(212,175,55,.08); border:1px solid rgba(212,175,55,.25);">
        <div class="hs-label" style="color:var(--text3);">Held by artist</div>
        <div class="hs-val" style="color:var(--gold2); font-size:22px;">${fmt(stats.heldByArtistGross, cur)}</div>
        <div style="font-size:10px; color:var(--text3); margin-top:2px;">incl. ${fmt(stats.publisherCutHeldByArtist, cur)} your cut</div>
      </div>` : '';

  const heldNoteHtml = hasHeld ? `
    <div style="font-size:11px; color:var(--text3); margin:-0.75rem 0 1.25rem; line-height:1.5; padding:8px 10px; background:var(--cream2); border-radius:var(--r2);">
      The artist collected <strong>${fmt(stats.heldByArtistGross, cur)}</strong> directly and hasn't forwarded it yet —
      <strong>${fmt(stats.heldByArtistShare, cur)}</strong> is their own share (so they've effectively taken that much of their earnings),
      and the remaining <strong>${fmt(stats.publisherCutHeldByArtist, cur)}</strong> is your cut to collect back from them.
      <br>Owed to artist = lifetime earnings − payouts − the artist's own share they're holding.
    </div>` : '';

  return { heldCardHtml, heldNoteHtml, hasHeld };
}

// The most recent payout request that hasn't been covered by a payout since.
// A request is "settled" once the publisher records a payout dated on or after
// it, so the artist isn't left staring at a stale "requested" pill forever.
function pendingPayoutRequest(state, stats) {
  const reqs = (state && state.payoutRequests) || [];
  if (!reqs.length) return null;
  const latest = reqs.slice().sort((a, b) => (b.requestedAt || '') > (a.requestedAt || '') ? 1 : -1)[0];
  if (!latest) return null;
  const settledSince = (stats.payouts || []).some(p => {
    const paidAt = p.date || '';
    return paidAt && latest.requestedAt && paidAt >= latest.requestedAt.slice(0, 10);
  });
  return settledSince ? null : latest;
}

// Artist-facing call to action: surfaces the share of profit that's actually
// available to them right now and lets them ask for it in one click, instead
// of having to email the publisher out of band. Publishers see the same figure
// framed as an outstanding obligation, plus any request the artist has sent.
function getPayoutRequestHtml(bookId, stats, cur, owed) {
  if (!(owed > 0.01)) return '';
  const authorView = isAuthor();
  const pending = pendingPayoutRequest(states[bookId], stats);

  if (!authorView) {
    // Publisher side: only worth adding a row when the artist has asked.
    if (!pending) return '';
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;
        background:var(--gold-bg); border:1px solid var(--gold-line); border-left:4px solid var(--gold);
        border-radius:var(--r2); padding:12px 14px; margin-bottom:1.25rem;">
        <div>
          <div style="font-weight:600; color:var(--text2); font-size:13px;">The artist requested a payout of ${fmt(pending.amount, cur)}</div>
          <div style="font-size:11px; color:var(--text3); margin-top:2px;">Requested ${escapeHtml(pending.requestedAt ? pending.requestedAt.slice(0, 10) : '—')} · ${fmt(owed, cur)} currently owed</div>
        </div>
        <button class="btn gold" style="padding:6px 12px; font-size:11px;" onclick="toggleArtistPayoutForm('${bookId}')">Record payout</button>
      </div>`;
  }

  const pendingHtml = pending ? `
        <div style="font-size:11px; color:var(--text3); margin-top:6px;">
          ✓ You requested ${fmt(pending.amount, cur)} on ${escapeHtml(pending.requestedAt ? pending.requestedAt.slice(0, 10) : '—')} — the publisher has been notified.
        </div>` : '';

  return `
    <div style="background:var(--cream2); border:1px solid var(--gold-line); border-left:4px solid var(--gold);
      border-radius:var(--r2); padding:14px 16px; margin-bottom:1.25rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap;">
        <div>
          <div class="hs-label" style="color:var(--text3);">Available to request</div>
          <div class="hs-val" style="color:var(--gold-text); font-size:24px; font-weight:700;">${fmt(owed, cur)}</div>
          <div style="font-size:11px; color:var(--text3); margin-top:2px;">your share of profit, not yet paid out</div>
        </div>
        <button class="btn gold" id="request-payout-btn-${bookId}" style="padding:10px 18px; font-size:12px;"
          onclick="requestArtistPayout('${bookId}')">${pending ? 'Send reminder' : 'Request payout'}</button>
      </div>
      ${pendingHtml}
    </div>`;
}

function getPayoutHistoryHtml(stats, bookId, cur) {
  return (stats.payouts || []).length > 0
    // ⚡ Bolt Optimization: Use string comparison instead of localeCompare for sorting ISO "YYYY-MM-DD" dates
    ? stats.payouts.slice().sort((a, b) => { const dA = a.date || ''; const dB = b.date || ''; return dA > dB ? -1 : (dA < dB ? 1 : 0); }).map(p => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; font-size:12px;
          border-bottom:1px solid rgba(0,0,0,.05);">
          <span style="display:flex; flex-direction:column;">
            <span style="font-family:'DM Mono',monospace; color:var(--green); font-weight:600;">${fmt(parseFloat(p.amount) || 0, cur)}</span>
            <!-- ⚡ Bolt Optimization: Use shared escapeHtml to prevent GC pressure from inline object creation during replace operations -->
            <span style="font-size:10px; color:var(--text3);">${p.date || '—'}${p.method ? ' · ' + escapeHtml(p.method) : ''}${p.notes ? ' · ' + escapeHtml(p.notes) : ''}</span>
          </span>
          <button class="btn" style="padding:4px 8px; font-size:10px; background:transparent; color:var(--text3); border:1px solid rgba(0,0,0,.1);"
            onclick="deleteArtistPayout('${bookId}', ${p.id})" title="Delete this payout" aria-label="Delete payout">✕</button>
        </div>`).join('')
    : '<div style="padding:12px; font-size:11px; color:var(--text3); text-align:center;">No payouts recorded yet.</div>';
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

  const { tierHeader, tierHtml, tiers, nextTier, effectiveCap } = getProfitTiersHtml(book, stats, cur);
  const progressHtml = getRevenueProgressHtml(stats, tiers, nextTier, effectiveCap, cur);
  const { owedLabel, owedVal, owedSub, owedCardBg, owedCardBorder, owedValColor, owedSubColor, owed } = getOwedCardDetails(stats, cur);
  const { heldCardHtml, heldNoteHtml, hasHeld } = getArtistHeldHtml(stats, cur);
  const payoutRequestHtml = getPayoutRequestHtml(bookId, stats, cur, owed);
  const payoutHistoryHtml = getPayoutHistoryHtml(stats, bookId, cur);

  content.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(${hasHeld ? 4 : 3}, 1fr); gap:12px; margin-bottom:1.5rem;">
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
      ${heldCardHtml}
      <div class="card" style="margin:0; background:${owedCardBg}; border:${owedCardBorder};">
        <div class="hs-label" style="color:var(--text3);">${owedLabel}</div>
        <div class="hs-val" style="color:${owedValColor}; font-size:22px; font-weight:700;">${owedVal}</div>
        <div style="font-size:10px; color:${owedSubColor}; margin-top:2px; opacity:.8;">${owedSub}</div>
      </div>
    </div>
    ${heldNoteHtml}
    ${payoutRequestHtml}
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
  const dateEl = document.getElementById(`ap-date-${bookId}`);
  const methodEl = document.getElementById(`ap-method-${bookId}`);
  const notesEl = document.getElementById(`ap-notes-${bookId}`);
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
    notes: (notesEl.value || '').trim(),
    cur: bookCurrencyCode(BOOKS[bookId])
  });
  await saveState(bookId);
  showToast(`✓ Recorded payout of ${fmt(amount, BOOKS[bookId].currency)}`);
  renderProfitSharingBreakdown(bookId);
}

// Artist asks the publisher for the profit they're owed. The request is stored
// on the book's state (so it survives a reload and shows on the publisher's own
// breakdown) and emailed through the same notifyPublisher path every other
// author submission uses. The state write happens first so an offline artist
// still has the request queued locally rather than losing it outright.
async function requestArtistPayout(bookId) {
  const book = BOOKS[bookId];
  const stats = calculateArtistEarnings(bookId);
  if (!book || !stats) return;
  const cur = book.currency;
  const owed = stats.owedToArtist;
  if (!(owed > 0.01)) { showToast('⚠ Nothing is currently available to request', 'warn'); return; }

  const s = states[bookId];
  if (!s) return;
  const btn = document.getElementById(`request-payout-btn-${bookId}`);
  const oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  const req = {
    id: Date.now(),
    requestedAt: new Date().toISOString(),
    amount: owed,
    currency: cur
  };
  try {
    if (!s.payoutRequests) s.payoutRequests = [];
    s.payoutRequests.push(req);
    await saveState(bookId);
    await notifyPublisherSubmission(
      'Payout Request',
      { ...req, bookTitle: book.title, lifetimeEarned: stats.totalArtistEarned, alreadyPaid: stats.totalPaidToArtist },
      `The artist requested a payout of ${fmt(owed, cur)} — their unpaid share of profit to date.`
    );
    showToast(`✓ Requested a payout of ${fmt(owed, cur)}`);
  } catch (e) {
    console.error('payout request failed', e);
    showToast('⚠ Could not send the payout request', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
    renderProfitSharingBreakdown(bookId);
  }
}

async function deleteArtistPayout(bookId, payoutId) {
  if (!(await confirmDialog('Delete this payout record?', { danger: true, okLabel: 'Delete' }))) return;
  const s = states[bookId];
  if (!s || !s.artistPayouts) return;
  s.artistPayouts = s.artistPayouts.filter(p => p.id !== payoutId);
  saveState(bookId);
  showToast('✓ Payout deleted');
  renderProfitSharingBreakdown(bookId);
}

window.toggleArtistPayoutForm = toggleArtistPayoutForm;
window.recordArtistPayout = recordArtistPayout;
window.requestArtistPayout = requestArtistPayout;
window.deleteArtistPayout = deleteArtistPayout;

// Which renderers own which tab.
//
// Checked against index.html: every one of these writes only into the panel of
// the tab it is listed under. renderArtistReimburseBanner appears twice because
// it genuinely writes into both the dashboard and the expenses panel.
//
// Nothing else in the app renders into a book tab, so a tab that is not on
// screen gains nothing from being rebuilt.
const TAB_RENDERERS = {
  dashboard: () => { updateDash(); renderArtistReimburseBanner(); renderPendingExpenses(); },
  consignment: () => { renderStores(); renderLedger(); renderInvoices(); },
  history: () => { renderHist(); },
  expenses: () => { renderExpenses(); renderArtistReimburseBanner(); },
};

// Read from the DOM rather than tracked in a variable, so it cannot drift from
// the panel the user is actually looking at.
function visibleTabName() {
  const panel = document.querySelector('.tab-panel.active');
  return panel && panel.id.startsWith('tab-') ? panel.id.slice(4) : '';
}

function renderAll() {
  _revMemo.clear();
  if (activeBook === 'all') { updateAllOverview(); updateHeader(); return; }
  // Only the visible tab. This used to rebuild all eight panels on every state
  // change, so recording a sale at a market walked the full history and the
  // full consignment ledger to repaint panels nobody was looking at — on the
  // POS tab, which is not in this map at all, every one of those eight was
  // pure waste. switchTab() already renders a tab when you arrive at it, so
  // the hidden ones lose nothing by being left alone.
  const render = TAB_RENDERERS[visibleTabName()];
  if (render) render();
}

function renderCurrent() {
  if (activeBook === 'all') { updateAllOverview(); updateHeader(); }
  else renderAll();
  try { updatePublisherActionBanner(); } catch (_) { }

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

// Coalesce bursts of render requests into a single paint. Firestore delivers
// each watched doc as its own snapshot, so a single remote save can fire the
// watch callback many times in a few milliseconds; without this, each one
// triggers a full renderCurrent(). rAF collapses all of them into one render
// on the next frame. State is mutated synchronously before each call, so the
// single deferred render always reflects the latest data.
let _renderScheduled = false;
function scheduleRender() {
  if (_renderScheduled) return;
  _renderScheduled = true;
  const run = () => { _renderScheduled = false; renderCurrent(); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 16);
}

// ── OPEN CALL — contributor pipeline tracker
// Mirrors the open-call spreadsheet inside the app so the whole pipeline
// (who's been emailed, who sent their credit name / files) lives in one
// screen. Stored on the active book's state.openCall array, so it syncs
// and works offline through the same saveState path as everything else.
// Stage definitions and row parsing live in ./lib/opencall.js (unit-tested).



// Review-inbox + outbox queues live on each project; older saved data predates
// them, so always ensure the fields before touching them.

// Queue the contributor's next stage email in the "Ready to send" outbox
// (no-op if nothing is ready, already queued, or previously removed).

// Stamp a stage change so the card's "waiting Nd" aging chip measures from
// the most recent movement, not from when the contributor was added.

// Collapsible workspace sections (template designer, sender/API config).
// Persisted per section so the panel opens the way you left it.


// Star/unstar one of a contributor's submitted photos as a chosen one.
// {{photo}} in every stage email resolves to the starred picks, so the
// selection email names exactly the photo(s) that won — not all five.





// The Gmail thread a stage email for `c` should reply into, or null to start a
// new one. `gmailThreadId` (captured when the first email went out, or imported
// from the artist's submission) is the canonical conversation; the per-reply
// threads are kept as fallbacks for older contributors that predate capture.


// Escape closes the bulk modal — but never mid-send, so an in-flight batch
// isn't abandoned by a stray keypress.









// Derive 1–2 uppercase initials from a contributor name for the avatar.
// Falls back to a neutral glyph when the name is empty.












// Open Call sender ("send as") config — a verified Gmail alias + display name,
// applied to every stage email for valid SPF/DKIM on a custom domain.

// Fetch the account's verified "send as" aliases + remaining daily send quota.
// Shared by the sender picker (#9) and the bulk-send quota guard (#10).

// ── Server-side scheduled scan (Apps Script time trigger) ──────────────────
// The trigger + digest config live in the Apps Script; this cache is only the
// last state we saw, so the control renders instantly and the background-scan
// cadence knows whether server findings might be waiting.




// A compact stage snapshot of every contributor (all projects) so the server
// scan knows who to watch and which stages are still open. No notes/photos —
// just what the scan needs.


// Keep the server's snapshot loosely in sync: debounced, fire-and-forget, and
// only when the schedule is actually on — a failed push just means the next
// server scan works from slightly older stage flags.















// ── Review inbox: approve / dismiss scan proposals ────────────────────────

// The proposed credit name is editable right in the inbox row (the server's
// regex is a heuristic); read the box so the approved value is what's visible.





// ── Ready-to-send outbox ───────────────────────────────────────────────────





function recordOrder(num, chan, qty, price, notes, payment = null) {
  const s = getState(), book = getBook();
  const enteredBy = isAuthor() ? 'Artist' : 'Publisher';
  s.stock = Math.max(0, s.stock - qty);
  s.sold += qty; s.revenue += qty * price;
  if (!s.chStats[chan]) s.chStats[chan] = { txns: 0, units: 0, revenue: 0 };
  s.chStats[chan].txns++; s.chStats[chan].units += qty; s.chStats[chan].revenue += qty * price;
  let updatedNotes = notes || '';
  if (num && num.startsWith('INV-')) {
    const inv = (s.invoices || []).find(i => i.num === num || i.id === num);
    if (inv && inv.discount > 0) {
      const discStr = inv.discountType === 'percent'
        ? `Invoice Discount: ${inv.discountRate}%`
        : `Invoice Discount: flat`;
      if (!updatedNotes.includes('Invoice Discount:')) {
        updatedNotes = updatedNotes ? `${updatedNotes} · ${discStr}` : discStr;
      }
    }
  }

  const sheetsId = makeEventId();
  s.hist.unshift({ num, chan, qty, price, after: s.stock, notes: updatedNotes, date: today(), payment, enteredBy, sheetsId, cur: bookCurrencyCode(book) });
  recomputeAfters(s, book);
  renderHist(); updateDash(); saveState(activeBook);
  const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  const totalNative = qty * price;
  const cadEquiv = cadEquivalentForSale({ nativeCurrency: nativeCur, totalNative, payment });
  syncToSheets({
    type: 'order', book: book.title, date: today(), num, chan, qty, price, total: totalNative, stockAfter: s.stock, notes: updatedNotes,
    sheetsId,
    currency: nativeCur,
    paymentCurrency: normalizeCurrencyCode(payment?.currency || nativeCur, 'CAD'),
    paymentAmount: payment?.amount ?? totalNative,
    paymentRate: payment?.rate ?? '',
    convertedTotal: cadEquiv
  });
}

// Order History pagination — render in pages so books with hundreds of orders
// stay snappy. The window resets when the book or active filter changes.
const HIST_PAGE = 50;
let _histLimit = HIST_PAGE;
let _histPageSig = null;
function showMoreHist() { _histLimit += HIST_PAGE; renderHist(); }
function showAllHist() { _histLimit = Infinity; renderHist(); }

// Read-only Order-History row for a consignment movement (shipment out / return
// back). These live in the ledger, but showing them inline — with the same
// running Stock After as every sale — makes it visible that consigned copies
// left on-hand: they're sitting at the store, not lost.
function renderConsignHistRow(e, after) {
  const store = escapeHtml(e.storeName || 'store');
  const restocked = e.type === 'Return' && e.status === 'restocked';
  let badge, qtyCell, label;
  if (e.type === 'Shipment') {
    badge = `<span class="ch-badge ch-store" style="font-size:10px;"><span class="ch-icon">📦</span> Consignment</span> → ${store}`;
    qtyCell = `-${e.qty}`;            // left your on-hand for the store
    label = 'SENT';
  } else if (restocked) {
    badge = `<span class="ch-badge ch-pos" style="font-size:10px;"><span class="ch-icon">↩</span> Consignment return</span> ← ${store}`;
    qtyCell = `+${e.qty}`;            // came back into on-hand
    label = 'RETURN';
  } else {
    badge = `<span class="chip-status amber" style="font-size:10px;">↩ Return · written off</span> ← ${store}`;
    qtyCell = '0';                    // off the store's books, not back on your shelf
    label = 'RETURN';
  }
  const voided = e.voided ? ' voided' : '';
  const voidPill = e.voided ? '<span class="void-badge">Void</span>' : '';
  const manageBtn = `<button class="edit-btn" onclick="switchTab('consignment')" title="Manage in the Consignment tab" aria-label="Manage in Consignment">→</button>`;
  return `<tr class="hist-row ${voided}"><td class="mono mono-num" style="color:var(--text3);">${label}</td><td>${badge}</td><td class="r mono-num">${e.voided ? '' : qtyCell}</td><td class="r mono-num"><span style="color:var(--text4);font-size:11px;">—</span></td><td class="r mono-num"><span style="color:var(--text4);font-size:11px;">—</span></td><td class="r mono-num">${after}</td><td style="font-size:12px;color:var(--text3);">${escapeHtml(e.notes) || '—'}</td><td style="font-size:12px;color:var(--text3);"><span class="chip-status gray">Consignment</span></td><td style="font-size:12px;color:var(--text3);">${fmtD(e.date)} ${voidPill}</td><td>${manageBtn}</td></tr>`;
}



// No currency parameter on purpose: customer-paid shipping is natively CAD
// and must never be FX-converted, so this formats as CAD unconditionally.

export function renderHist() {
  const s = getState(), book = getBook(), cur = book.currency;
  const bookCode = bookCurrencyCode(book);
  reconcileConsignmentInvoiceLinks(s);

  const pbSales = window.authorSubmissions[activeBook]?.sales || {};
  const pendingSales = Object.keys(pbSales).map(k => {
    const raw = JSON.parse(pbSales[k].data);
    return { ...raw, _subKey: k, pendingAuth: true, after: '?' };
  });

  if (histChanFilter && histChanFilter.bookId !== activeBook) histChanFilter = null;
  const chanFilter = histChanFilter ? histChanFilter.chan : null;

  const timeline = buildOrderTimeline(s, book);

  const rows = chanFilter !== null
    ? timeline.filter(r => r.type === 'hist' && (r.h.chan || '') === chanFilter)
    : timeline;
  let pend = pendingSales.map(h => ({ type: 'pending', h }));
  if (chanFilter !== null) pend = pend.filter(r => (r.h.chan || '') === chanFilter);
  const matchCount = rows.length + pend.length;
  const combined = [...pend, ...rows];

  const filterBar = $('hist-filter-bar');
  if (filterBar) {
    if (chanFilter !== null) {
      filterBar.style.display = '';
      filterBar.innerHTML = `<div class="hist-filter-chip"><span class="ch-dot" style="background:${channelColor(chanFilter)}"></span>Showing <strong>${escapeHtml(chanLabel(chanFilter))}</strong> orders · ${matchCount} found<button onclick="clearHistChanFilter()" title="Clear filter" aria-label="Clear filter">✕ Clear</button></div>`;
    } else {
      filterBar.style.display = 'none';
      filterBar.innerHTML = '';
    }
  }

  const recon = $('hist-recon');
  if (recon) {
    if (chanFilter === null && combined.length) {
      const bd = inventoryBreakdown(s, book);
      const printedCount = bd.printed || 0;
      const onHandCount = bd.onHand || 0;
      const distributedCount = printedCount - onHandCount;
      const sellThroughPct = printedCount > 0 ? ((distributedCount / printedCount) * 100).toFixed(1) : '0.0';

      const warn = bd.unaccounted
        ? `<div style="font-size:11px; font-weight:700; color:var(--red); margin-top:6px;">⚠️ ${Math.abs(bd.unaccounted)} unaccounted copies in reconciliation</div>`
        : '';

      // History stranded in a previous currency makes every total below it a
      // sum of two different currencies. Surface it where the numbers are read,
      // with the one-click way out.
      const mm = detectCurrencyMismatch(s, book);
      const mmNoun = mm.source === 'payment' ? 'sale' : 'amount';
      const curWarn = mm.mismatched
        ? `<div class="hist-currency-warn">
             <span><strong>${mm.mismatched} ${escapeHtml(mmNoun)}${mm.mismatched === 1 ? '' : 's'}</strong> ${mm.mismatched === 1 ? 'was' : 'were'} recorded in ${escapeHtml(mm.code)}, but this book is now priced in ${escapeHtml(bookCode)} — so those figures are being shown and summed as ${escapeHtml(bookCode)} without ever being converted.</span>
             <button class="btn sm" onclick="restateBookCurrency()">Restate into ${escapeHtml(bookCode)}</button>
           </div>`
        : '';

      recon.style.display = '';
      recon.innerHTML = `
        <div class="hist-kpi-container">
          <div class="hist-kpi-card">
            <div class="hist-kpi-label">Total Printed</div>
            <div class="hist-kpi-val">${printedCount}</div>
            <div class="hist-kpi-sub">Print Run Edition</div>
          </div>
          <div class="hist-kpi-card highlight-gold">
            <div class="hist-kpi-label">Stock On Hand</div>
            <div class="hist-kpi-val">${onHandCount}</div>
            <div class="hist-kpi-sub">${printedCount > 0 ? ((onHandCount / printedCount) * 100).toFixed(0) : 0}% available</div>
          </div>
          <div class="hist-kpi-card highlight-green">
            <div class="hist-kpi-label">Distributed & Sold</div>
            <div class="hist-kpi-val">${distributedCount}</div>
            <div class="hist-kpi-sub">${sellThroughPct}% sell-through rate</div>
          </div>
        </div>
        <div class="hist-progress-bar-wrap" title="${onHandCount} on hand of ${printedCount} printed (${sellThroughPct}% distributed)">
          <div class="hist-progress-bar-fill" style="width: ${Math.min(100, Math.max(0, sellThroughPct))}%;"></div>
        </div>
        ${warn}
        ${curWarn}
      `;
    } else {
      recon.style.display = 'none';
      recon.innerHTML = '';
    }
  }

  const formatChannelBadge = (chanName) => {
    if (!chanName) return '<span class="ch-badge">—</span>';
    const c = String(chanName).trim();
    if (c === 'Website' || c === 'Big Cartel') return `<span class="ch-badge ch-bc"><span class="ch-icon">🌐</span> Website</span>`;
    if (c === 'POS' || c === 'Fair' || c === 'Event' || c === 'In Person') return `<span class="ch-badge ch-pos"><span class="ch-icon">💳</span> In Person</span>`;
    if (c === 'Consignment' || c === 'Store') return `<span class="ch-badge ch-store"><span class="ch-icon">🏬</span> Store</span>`;
    if (c === 'Direct') return `<span class="ch-badge ch-direct"><span class="ch-icon">🤝</span> Direct</span>`;
    return `<span class="ch-badge">${escapeHtml(c)}</span>`;
  };

  const pageSig = `${activeBook}|${chanFilter ?? ''}`;
  if (_histPageSig !== pageSig) { _histLimit = HIST_PAGE; _histPageSig = pageSig; }
  const shownRows = combined.slice(0, _histLimit);
  const moreCount = combined.length - shownRows.length;
  const moreRow = moreCount > 0
    ? `<tr class="hist-more-row"><td colspan="10" style="text-align:center;padding:.9rem;"><button class="btn sm" onclick="showMoreHist()">Show ${Math.min(HIST_PAGE, moreCount)} more</button> <button class="btn sm" onclick="showAllHist()">Show all ${combined.length}</button> <span style="color:var(--text3);font-size:12px;margin-left:8px;">showing ${shownRows.length} of ${combined.length}</span></td></tr>`
    : '';

  $('hist-body').innerHTML = combined.length
    ? shownRows.map((row) => {
      if (row.type === 'consign') return renderConsignHistRow(row.e, row._after ?? row.after ?? '—');
      const h = row.h, i = row.i;
      if (h.pendingAuth) {
        const actionCell = window.IS_PUBLISHER
          ? `<div class="approval-actions"><button class="appr-btn approve" onclick="approveSubmission('sales', '${h._subKey}')" aria-label="Approve submission"><span class="ico">✓</span>Approve</button><button class="appr-btn reject" onclick="rejectSubmission('sales', '${h._subKey}')" title="Reject submission" aria-label="Reject submission">✕</button></div>`
          : `<span class="chip-status amber">Awaiting Publisher</span>`;
        return `<tr class="hist-row" style="opacity:0.8;background:#fffcede3;"><td class="mono mono-num">${escapeHtml(h.num)}</td><td>${formatChannelBadge(h.chan)} <span class="chip-status amber">Submitted</span></td><td class="r mono-num">-${h.qty}</td><td class="r mono-num">${fmt(h.price, cur)}</td><td class="r mono-num" style="font-weight:600;">${fmt(h.qty * h.price, cur)}</td><td class="r mono-num">?</td><td style="font-size:12px;color:var(--text3);">${escapeHtml(h.notes) || '—'}</td><td style="font-size:12px;color:var(--text3);"><span class="chip-status gray">Artist</span></td><td style="font-size:12px;color:var(--text3);">${fmtD(h.date)}</td><td>${actionCell}</td></tr>`;
      }
      const voided = h.voided ? ' voided' : '';
      const voidPill = h.voided ? '<span class="void-badge">Void</span>' : '';
      const editBtn = `<button class="edit-btn" onclick="openEditHist(${i})" title="Edit entry" aria-label="Edit entry">✎</button>`;
      const isGrat = h.gratuity || h.chan === 'Gratuity';
      const isPending = h.artistPending;
      
      const chanCell = isGrat ? `<span class="chip-status violet">🎁 Gratuity</span>` : isPending ? `${formatChannelBadge(h.chan)} <span class="chip-status amber">⏳ pending</span>` : formatChannelBadge(h.chan);
      // A row's amounts belong to the currency it was RECORDED in, not the one
      // the book carries today. Formatting a €32 sale with the book's current
      // CA$ makes it read as CA$32 — same digits, ~50% wrong. Rows stamped with
      // another currency render in that currency and get a badge, so stranded
      // history is visible instead of silently mixed into CAD totals.
      const rowCode = h.cur ? normalizeCurrencyCode(h.cur, bookCode) : bookCode;
      const rowCur = rowCode === bookCode ? cur : getSym(rowCode);
      const foreignPill = rowCode !== bookCode
        ? ` <span class="chip-status amber" title="Recorded in ${escapeHtml(rowCode)} — not yet restated into ${escapeHtml(bookCode)}">${escapeHtml(rowCode)}</span>`
        : '';
      const priceCell = isGrat ? '<span style="color:var(--text4);font-size:11px;">gifted</span>' : fmt(h.price, rowCur) + foreignPill;
      const totalCell = isGrat ? '—' : isPending ? `<span style="color:var(--amber);">${fmt(h.qty * h.price, rowCur)}</span>` : fmt(h.qty * h.price, rowCur);
      const rowStyle = isGrat ? ' style="font-style:italic;"' : isPending ? ' style="background:#fef9ec;"' : '';
      const isWebsite = (h.chan === 'Website' || h.chan === 'Big Cartel') && !isGrat && !h.voided;
      const labelBtn = isWebsite
        ? (h.shipped
          ? `<button class="btn-hist-action shipped" onclick="openLabelModal(${i})" title="Shipped${h.shippedDate ? ' on ' + fmtD(h.shippedDate) : ''}">✓ Shipped</button>`
          : `<button class="btn-hist-action ship" onclick="openLabelModal(${i})" title="Print shipping label">📦 Ship</button>`)
        : '';

      const paymentInfo = paymentSummary(h.payment, book, h);
      const shippingInfo = isWebsite ? renderOrderShippingSummary(h) : '';
      const notesText = escapeHtml(h.notes) || '—';
      const notesCell = [
        notesText,
        paymentInfo ? `<span style="font-size:11px;color:var(--text4);">${escapeHtml(paymentInfo)}</span>` : '',
        shippingInfo,
      ].filter(Boolean).join('<br>');
      const enteredBy = h.enteredBy || (h.artistPending ? 'Artist' : 'Publisher');
      const enteredByPill = `<span class="chip-status gray">${escapeHtml(enteredBy)}</span>`;
      const stockAfterVal = row._after ?? row.after ?? '—';
      return `<tr class="hist-row ${voided}"${rowStyle}><td class="mono mono-num">${escapeHtml(h.num)}${editBtn}</td><td>${chanCell}</td><td class="r mono-num">${h.voided ? '' : '-'}${h.qty}</td><td class="r mono-num">${priceCell}</td><td class="r mono-num" style="font-weight:600;">${totalCell}</td><td class="r mono-num">${stockAfterVal}</td><td style="font-size:12px;color:var(--text3);">${notesCell || '—'}</td><td style="font-size:12px;color:var(--text3);">${enteredByPill}</td><td style="font-size:12px;color:var(--text3);">${fmtD(h.date)} ${voidPill}</td><td>${labelBtn}</td></tr>`;
    }).join('') + moreRow
    : `<tr><td colspan="10"><div class="empty-state" style="padding:1.5rem;">${chanFilter !== null ? `No ${escapeHtml(chanLabel(chanFilter))} orders for this book.` : 'No orders yet.'}</div></td></tr>`;
}

// ── WEBSITE ORDERS — persistent scan memory
const SCAN_MEMORY_KEY = 'lm-scan-memory';
function getScanMemory() {
  try { return JSON.parse(localStorage.getItem(SCAN_MEMORY_KEY) || '{}'); } catch (e) { return {}; }
}
function saveScanMemory(mem) {
  localStorage.setItem(SCAN_MEMORY_KEY, JSON.stringify(mem));
}

// Build a cross-book set of all order IDs already applied across any session.
// Cached until explicitly invalidated — rebuilt at most once per render cycle.
let _appliedIdsCache = null;
function getAllAppliedIds() {
  if (_appliedIdsCache) return _appliedIdsCache;
  const ids = new Set();
  Object.values(states).forEach(s => {
    (s.doneIds || []).forEach(id => ids.add(id));
    (s.hist || []).forEach(h => { if (h.num) ids.add(h.num); });
  });
  _appliedIdsCache = ids;
  return ids;
}

export function renderOrders() {
  const book = getBook(), cur = book.currency;
  const list = $('orders-list');
  // Filter to current book; show all if bookId not set
  const rel = orders.filter(o => o.hasBook && (!o.bookId || o.bookId === activeBook));
  const appliedIds = getAllAppliedIds();
  const mem = getScanMemory();
  const cancelledNums = mem.cancelledNums || [];

  const showAllChk = $('show-all-orders-chk');
  const showAll = showAllChk ? showAllChk.checked : false;

  // ⚡ Bolt Optimization: Replace O(N) Array.includes with O(1) Set.has inside filter loop
  const cancelledNumsSet = new Set(cancelledNums);

  const isApplied = (o) => appliedIds.has(o.id) || appliedIds.has(o.orderNum);
  const isCancelled = (o) => cancelledNumsSet.has(o.orderNum);

  // Smart filter: hide orders whose order number already exists in history or is cancelled
  const visible = rel.filter(o => {
    if (showAll) return true;
    return !isApplied(o) && !isCancelled(o);
  });
  const hiddenCount = rel.length - visible.length;

  if (!visible.length) {
    const msg = hiddenCount > 0
      ? `<div class="empty-state web-empty success"><div class="e-icon">✅</div><strong>Everything is up to date</strong><span>All ${hiddenCount} found order(s) are already applied or hidden. Scan again to check for newer receipts.</span></div>`
      : `<div class="empty-state web-empty"><div class="e-icon">📬</div><strong>No orders found for this book</strong><span>Make sure Google Sheets is connected, then scan Gmail for recent Big Cartel receipts.</span><button class="btn ink sm" onclick="fetchOrders()">Scan Gmail</button></div>`;
    list.innerHTML = msg;
    $('apply-all-btn').disabled = true;
    return;
  }

  list.innerHTML = visible.map(o => {
    const done = isApplied(o);
    const cancelled = isCancelled(o);
    const addrParts = [o.shipAddr1, o.shipCity, o.shipProvince, o.shipCountry].filter(Boolean);
    const addrLine = addrParts.length
      ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;">📦 ${addrParts.join(', ')}</div>`
      : '';
    const listPrice = BOOKS[o.bookId]?.listPrice || book.listPrice;
    const listCur = BOOKS[o.bookId]?.currency || cur;
    const priceMismatch = !done && !cancelled && o.price && Math.abs(o.price - listPrice) > 0.5;
    const priceWarn = priceMismatch
      ? `<span style="font-size:10px;color:var(--amber);margin-left:6px;">⚠ paid ${listCur}${o.price} (list ${listCur}${listPrice})</span>`
      : '';
    const shippingBadge = renderOrderShippingSummary(o);
    const bookLabel = o.bookId && BOOKS[o.bookId]
      ? `<span style="font-size:10px;background:${BOOKS[o.bookId].accent}22;color:${BOOKS[o.bookId].accent};border-radius:100px;padding:2px 8px;margin-right:6px;">${escapeHtml(BOOKS[o.bookId].title)}</span>`
      : '';
    const viewEmailBtn = o.id
      ? `<a href="https://mail.google.com/mail/u/0/#all/${o.id}" target="_blank" class="btn sm" style="font-size:10px;opacity:.7;">📧 View</a>`
      : '';

    let cardClass = 'order-card';
    if (done) cardClass += ' done';
    else if (cancelled) cardClass += ' cancelled';

    const statusPill = done
      ? '<span class="pill gray">Applied</span>'
      : cancelled
        ? '<span class="pill red" style="background:#fbe9e7;color:#b3261e;border:1px solid #ffccbc;">Cancelled</span>'
        : '<span class="pill gold">New</span>';

    let actionsHtml = viewEmailBtn;
    if (done) {
      actionsHtml += `<button class="btn sm danger-btn" onclick="unapplyOne('${o.id}')" title="Revert this applied order back to New status">Unapply</button>
                      <button class="btn sm" onclick="reapplyOne('${o.id}')" title="Update this applied order with the latest receipt totals">Reapply</button>`;
    } else if (cancelled) {
      actionsHtml += `<button class="btn sm gold" onclick="restoreOrder('${o.orderNum}')" title="Restore this order to New status">Restore</button>`;
    } else {
      actionsHtml += `<button class="btn sm" onclick="cancelOrder('${o.orderNum}')" title="Cancel/dismiss this order" style="color:var(--text3);border-color:var(--border);background:transparent;">Cancel</button>
                      <button class="btn sm gold" onclick="applyOne('${o.id}')">Apply</button>`;
    }

    return `<div class="${cardClass}">
      <div class="order-row order-card-top">
        <div class="order-identity">
          <div class="order-num">${escapeHtml(o.orderNum)}</div>
          <div class="order-meta">${escapeHtml(o.date)} · ${escapeHtml(o.customer) || '—'} · <span>${escapeHtml(o.email)}</span></div>
          ${addrLine}
        </div>
        ${statusPill}
      </div>
      <div class="order-row order-card-bottom">
        <span class="order-summary">${bookLabel}<span>Qty ${o.qty}</span><span>${fmt(o.price || listPrice, listCur)}</span>${shippingBadge}${priceWarn}</span>
        <div class="order-actions">
          ${actionsHtml}
        </div>
      </div>
    </div>`;
  }).join('');

  if (hiddenCount > 0 && !showAll) {
    list.innerHTML += `<div class="orders-hidden-note">${hiddenCount} already-applied or hidden order(s) hidden.</div>`;
  }

  $('apply-all-btn').disabled = !visible.some(o => !isApplied(o) && !isCancelled(o));
}

function cancelOrder(orderNum) {
  const mem = getScanMemory();
  if (!mem.cancelledNums) mem.cancelledNums = [];
  if (!mem.cancelledNums.includes(orderNum)) {
    mem.cancelledNums.push(orderNum);
  }
  saveScanMemory(mem);
  renderOrders();
  showToast(`✓ Order ${orderNum} cancelled/hidden`, 'ok');
}

function restoreOrder(orderNum) {
  const mem = getScanMemory();
  if (mem.cancelledNums) {
    mem.cancelledNums = mem.cancelledNums.filter(num => num !== orderNum);
    saveScanMemory(mem);
  }
  renderOrders();
  showToast(`✓ Order ${orderNum} restored to New`, 'ok');
}

function unapplyOne(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const targetBook = o.bookId && BOOKS[o.bookId] ? o.bookId : activeBook;
  const state = states[targetBook];
  const book = BOOKS[targetBook];
  if (!state || !book) { showToast('Cannot find book for this order', 'err'); return; }

  const histIndex = (state.hist || []).findIndex(h => h.num === o.orderNum && h.chan === 'Website');
  if (histIndex === -1) {
    showToast('Applied order history not found', 'warn');
    return;
  }
  const h = state.hist[histIndex];

  if (!h.voided) {
    state.stock += h.qty;
    state.sold = Math.max(0, state.sold - h.qty);
    state.revenue = Math.max(0, state.revenue - h.qty * h.price);
    if (state.chStats['Website']) {
      state.chStats['Website'].txns = Math.max(0, state.chStats['Website'].txns - 1);
      state.chStats['Website'].units = Math.max(0, state.chStats['Website'].units - h.qty);
      state.chStats['Website'].revenue = Math.max(0, state.chStats['Website'].revenue - h.qty * h.price);
      if (state.chStats['Website'].txns <= 0) delete state.chStats['Website'];
    }
  }

  state.hist.splice(histIndex, 1);

  if (state.doneIds) {
    state.doneIds = state.doneIds.filter(x => x !== id && x !== o.id);
  }

  const mem = getScanMemory();
  if (mem.appliedNums) {
    mem.appliedNums = mem.appliedNums.filter(num => num !== o.orderNum);
    saveScanMemory(mem);
  }

  _appliedIdsCache = null;

  syncHistoryVoidDeletion(h, true);
  saveState(targetBook);

  renderOrders();
  if (targetBook === activeBook) updateDash();

  showToast(`✓ Reverted ${o.orderNum} to New`, 'ok');
}

// Update an already-applied website order in place after a receipt backfill.
// This deliberately does not decrement stock or increment sold units again.
function reapplyOne(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const targetBook = o.bookId && BOOKS[o.bookId] ? o.bookId : activeBook;
  const state = states[targetBook];
  const book = BOOKS[targetBook];
  if (!state || !book) { showToast('Cannot find book for this order', 'err'); return; }
  const history = (state.hist || []).find(h => h.num === o.orderNum && h.chan === 'Website');
  if (!history) { showToast('Applied order history not found', 'warn'); return; }
  const oldRevenue = (Number(history.qty) || 0) * (Number(history.price) || 0);
  const newPrice = Number(o.price) || Number(history.price) || Number(book.listPrice) || 0;
  const newQty = Number(history.qty) || Number(o.qty) || 1;
  const delta = newQty * newPrice - oldRevenue;
  state.revenue = (Number(state.revenue) || 0) + delta;
  if (!state.chStats.Website) state.chStats.Website = { txns: 0, units: 0, revenue: 0 };
  state.chStats.Website.revenue = (Number(state.chStats.Website.revenue) || 0) + delta;
  Object.assign(history, {
    price: newPrice,
    subtotal: Number(o.subtotal || 0) || 0,
    discountCode: o.discountCode || '',
    discountAmount: Number(o.discountAmount || 0) || 0,
    discountSource: o.discountSource || '',
    merchandisePaid: Number(o.merchandisePaid || 0) || newQty * newPrice,
    shippingMethod: o.shippingMethod || '',
    shippingPaid: Number(o.shippingPaid || 0) || 0,
    taxPaid: Number(o.taxPaid || 0) || 0,
    totalPaid: Number(o.totalPaid || 0) || 0
  });
  saveState(targetBook);
  syncToSheets({ type: 'order', book: book.title, date: history.date, num: history.num, chan: 'Website', qty: history.qty, price: history.price, total: history.qty * history.price, stockAfter: history.after, notes: 'Big Cartel', sheetsId: history.sheetsId, currency: getBookCurrencyCode(book) });
  if (history.shippingPaid > 0) syncToSheets(shippingPurchaseRowPayload(book, getBookCurrencyCode(book), history));
  renderOrders();
  updateDash();
  showToast(`✓ ${o.orderNum} updated with receipt totals`, 'ok');
}

export function applyOne(id, { deferRender = false } = {}) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const _checkedIds = getAllAppliedIds();
  const alreadyDone = _checkedIds.has(id) || _checkedIds.has(o.orderNum);
  if (alreadyDone) { showToast('Order already applied', 'warn'); return; }
  // Use the matched book if it differs from active
  const targetBook = o.bookId && BOOKS[o.bookId] ? o.bookId : activeBook;
  const targetState = states[targetBook];
  const targetBk = BOOKS[targetBook];
  if (!targetState || !targetBk) { showToast('Cannot find book for this order', 'err'); return; }
  // Use target book's price if not on order
  const price = o.price || targetBk.listPrice;
  targetState.stock = Math.max(0, targetState.stock - o.qty);
  targetState.sold += o.qty;
  targetState.revenue += o.qty * price;
  if (!targetState.chStats['Website']) targetState.chStats['Website'] = { txns: 0, units: 0, revenue: 0 };
  targetState.chStats['Website'].txns++;
  targetState.chStats['Website'].units += o.qty;
  targetState.chStats['Website'].revenue += o.qty * price;
  const entry = {
    num: o.orderNum, chan: 'Website', qty: o.qty, price, after: targetState.stock,
    notes: 'Big Cartel', date: (o.date && o.date !== '—') ? o.date : today(),
    shipName: o.shipName || o.customer || '', shipEmail: o.email || '',
    shipAddr1: o.shipAddr1 || '', shipAddr2: o.shipAddr2 || '',
    shipCity: o.shipCity || '', shipProvince: o.shipProvince || '',
    shipPostal: o.shipPostal || '', shipCountry: o.shipCountry || 'Canada',
    shippingPaid: Number(o.shippingPaid || 0) || 0,
    subtotal: Number(o.subtotal || 0) || 0,
    discountCode: o.discountCode || '',
    discountAmount: Number(o.discountAmount || 0) || 0,
    merchandisePaid: Number(o.merchandisePaid || price * o.qty) || 0,
    shippingMethod: o.shippingMethod || '',
    taxPaid: Number(o.taxPaid || 0) || 0,
    totalPaid: Number(o.totalPaid || 0) || 0,
    discountSource: o.discountSource || ''
  };
  // Deterministic id derived from the Big Cartel order number so the same
  // import on a different device produces the same id (no duplicate rows).
  entry.sheetsId = 'bc-' + String(o.orderNum).replace(/^#/, '').replace(/[^A-Za-z0-9-]/g, '');
  targetState.hist.unshift(entry);
  if (!targetState.doneIds) targetState.doneIds = [];
  targetState.doneIds.push(id);
  _appliedIdsCache = null;
  // Save scan memory — record this order num as seen
  const mem = getScanMemory();
  if (!mem.appliedNums) mem.appliedNums = [];
  if (!mem.appliedNums.includes(o.orderNum)) mem.appliedNums.push(o.orderNum);
  // Also remove from cancelledNums if it was cancelled
  if (mem.cancelledNums) {
    mem.cancelledNums = mem.cancelledNums.filter(num => num !== o.orderNum);
  }
  mem.lastScan = new Date().toISOString();
  saveScanMemory(mem);
  syncToSheets({ type: 'order', book: targetBk.title, date: entry.date, num: o.orderNum, chan: 'Website', qty: o.qty, price, total: o.qty * price, stockAfter: targetState.stock, notes: 'Big Cartel', sheetsId: entry.sheetsId, currency: getBookCurrencyCode(targetBk) });
  if (entry.shippingPaid > 0) {
    syncToSheets(shippingPurchaseRowPayload(targetBk, getBookCurrencyCode(targetBk), entry));
  }
  addLog('log-web', `✓ ${o.orderNum} (${targetBk.title}): -${o.qty} → ${targetState.stock} remaining`, 'ok');
  if (targetState.stock <= targetBk.threshold) addLog('log-web', `⚠ ${targetBk.title} below threshold!`, 'warn');
  saveState(targetBook);
  if (!deferRender) {
    renderOrders();
    if (targetBook === activeBook) updateDash();
  }
}

function isOrderEligibleForApply(order, appliedIds, cancelledNumsSet) {
  return order.hasBook &&
         !appliedIds.has(order.id) &&
         !appliedIds.has(order.orderNum) &&
         !cancelledNumsSet.has(order.orderNum);
}

function applyAll() {
  const applied = getAllAppliedIds();
  const mem = getScanMemory();
  const cancelledNumsSet = new Set(mem.cancelledNums || []);
  const toApply = orders.filter(o => isOrderEligibleForApply(o, applied, cancelledNumsSet));
  // Apply the whole batch without rendering, then paint once at the end —
  // turns N full renderOrders()/updateDash() cycles into a single render.
  toApply.forEach(o => applyOne(o.id, { deferRender: true }));
  if (toApply.length) { renderOrders(); updateDash(); }
}

async function fetchOrders() {
  const book = getBook();
  const btn = $('scan-btn');
  const log = 'log-web';
  const MAX_RETRIES = 3;

  if (!sheetsUrl) {
    showToast('Connect Google Sheets first to scan Gmail', 'warn');
    return;
  }

  const setStatus = (msg) => { btn.innerHTML = `<span class="spinner"></span>${msg}`; btn.disabled = true; };

  // Read scan memory for smarter queries
  const mem = getScanMemory();
  const lastScanDate = mem.lastScan ? new Date(mem.lastScan) : null;
  const appliedNums = new Set(mem.appliedNums || []);
  const daysBack = parseInt(localStorage.getItem('lm-scan-days') || '30');
  const sinceDate = new Date(Date.now() - daysBack * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

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
    for (const b of BOOK_LIST) {
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
      shippingPaid: parseFloat(o.shippingPaid ?? o.shipping ?? o.shippingAmount ?? 0) || 0,
      subtotal: parseFloat(o.subtotal ?? 0) || 0,
      discountCode: o.discountCode || '',
      discountAmount: parseFloat(o.discountAmount ?? 0) || 0,
      merchandisePaid: parseFloat(o.merchandisePaid ?? price * qty) || 0,
      shippingMethod: o.shippingMethod || '',
      taxPaid: parseFloat(o.taxPaid ?? 0) || 0,
      totalPaid: parseFloat(o.totalPaid ?? 0) || 0,
      discountSource: o.discountSource || '',
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

// ── MANUAL
// Session-level cache so we don't re-fetch the same currency pair twice (Uses global _fxRateCache)

export async function fetchLiveRate(from, to) {
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
  } catch (e) {
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
  } catch (e) {
    return { error: 'network', details: e.message || String(e), context: `${from}->${to}` };
  }
}

// Exchange rate as of a specific date (YYYY-MM-DD), for accurate bookkeeping on
// historical expenses. Frankfurter returns the nearest prior business day for
// weekends/holidays. Cached per pair+date.
export async function fetchHistoricalRate(from, to, date) {
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
    } catch (e) { }
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







// ── ARTIST PAYMENT LINK
function saveArtistPaymentLink() {
  const val = ($('artist-pay-link-input').value || '').trim();
  const s = getState();
  s.artistPaymentLink = val;
  // Also store on book object so publisher can read it
  getBook().artistPaymentLink = val;
  saveState(activeBook);
  showToast('✓ Payment link saved');
}

// Gratuity expenses track the publisher's own cost of gifted copies — they are
// never reimbursed to the author, so they must be excluded from every "owed /
// reimbursement" surface. Legacy records (pre-flag) are detected by their GRAT- ref.
function isGratuityExpense(e) {
  return !!(e && (e.gratuity === true || (typeof e.ref === 'string' && e.ref.startsWith('GRAT-'))));
}

function renderArtistReimburseBanner() {
  const s = getState(), book = getBook(), cur = book.currency;
  // Show payment link card for authors
  const linkCard = $('artist-payment-link-card');
  if (linkCard) {
    if (isAuthor()) {
      linkCard.style.display = '';
      const inp = $('artist-pay-link-input');
      if (inp && !inp.value) inp.value = s.artistPaymentLink || '';
    } else {
      linkCard.style.display = 'none';
    }
  }
  // Show received expenses banner for authors
  const banner = $('artist-reimburse-banner');
  if (!banner) return;
  if (!isAuthor()) { banner.style.display = 'none'; return; }
  // ⚡ Bolt Optimization: Loop Fusion
  // Combined .filter() and .reduce() into a single pass to eliminate intermediate array allocations
  const received = [];
  let total = 0;
  for (const e of (s.expenses || [])) {
    if (e.received && !isGratuityExpense(e)) {
      received.push(e);
      total += (e.amount || 0);
    }
  }
  if (!received.length) { banner.style.display = 'none'; return; }
  banner.style.display = '';
  $('arb-amount').textContent = fmt(total, cur);
  $('arb-detail').textContent = `${received.length} expense${received.length !== 1 ? 's' : ''} marked as received by publisher`;
  $('arb-hint').textContent = 'These expenses have been settled';
  $('arb-items').innerHTML = received.map(e => `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,.35);">
        ${escapeHtml(e.desc)} · ${fmtD(e.date)} · <span style="font-size:9px;background:rgba(255,255,255,.08);padding:1px 6px;border-radius:100px;">${escapeHtml(e.cat)}</span>
      </div>
      <div style="font-family:'DM Mono',monospace;font-size:13px;color:#6ee7a8;font-weight:500;">${fmt(e.amount, cur)}</div>
    </div>`).join('');
}

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
  if (fileInput && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const submitBtn = $('submit-exp-btn');
    const oldText = submitBtn.textContent;

    if (window.IS_PUBLISHER) {
      submitBtn.textContent = 'Saving locally...'; submitBtn.disabled = true;
      try {
        const localUrl = await saveReceiptToLocalFile(file, book.title);
        if (localUrl) receiptUrl = localUrl;
      } catch (e) {
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

// ── Receipt dropzone (expense form) — styled file chip + drag-and-drop.
// Reflects the chosen file into a chip and toggles the dropzone prompt. The
// underlying #exp-file input stays the single source of truth that
// submitExpense / scanProjectReceiptWithAI read from.
window.expFileChosen = function () {
  const input = $('exp-file'), chip = $('exp-file-chip'), nameEl = $('exp-file-name'), dz = $('exp-dropzone');
  const hasFile = input && input.files && input.files.length > 0;
  if (nameEl && hasFile) nameEl.textContent = input.files[0].name;
  if (chip) chip.style.display = hasFile ? 'flex' : 'none';
  if (dz) dz.style.display = hasFile ? 'none' : 'flex';
};
window.expFileClear = function (ev) {
  if (ev) ev.preventDefault();
  const input = $('exp-file');
  if (input) input.value = '';
  window.expFileChosen();
};
window.expFileDragOver = function (ev) { ev.preventDefault(); const dz = $('exp-dropzone'); if (dz) dz.classList.add('drag'); };
window.expFileDragLeave = function (ev) { ev.preventDefault(); const dz = $('exp-dropzone'); if (dz) dz.classList.remove('drag'); };
window.expFileDrop = function (ev) {
  ev.preventDefault();
  const dz = $('exp-dropzone'); if (dz) dz.classList.remove('drag');
  const input = $('exp-file');
  if (input && ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length > 0) {
    try { input.files = ev.dataTransfer.files; } catch (e) { /* older browsers: ignore */ }
    window.expFileChosen();
  }
};

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
        <div class="empty-state" style="padding:30px 20px;font-size:12px;color:var(--text3);text-align:center;">
          <span style="font-size:24px;display:block;margin-bottom:8px;">📬</span>
          Click a quick preset or search above to pull recent emails.
        </div>`;
    }
  }

  const fileInput = $('email-receipt-files');
  const list = $('email-receipt-files-list');
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
  { label: 'Past 7 Days', query: 'newer_than:7d -from:me (subject:(receipt OR invoice OR bill OR order OR purchase OR payment) OR "receipt" OR "invoice" OR "payment")' },
  { label: 'Past 30 Days', query: 'newer_than:30d -from:me (subject:(receipt OR invoice OR bill OR order OR purchase OR payment) OR "receipt" OR "invoice" OR "payment")' },
  { label: 'With Attachments', query: 'newer_than:30d has:attachment -from:me (receipt OR invoice OR bill)' },
  { label: 'Invoices / Bills', query: '-from:me (subject:(receipt OR invoice OR bill OR payment OR order OR purchase OR confirmation) OR "receipt" OR "invoice" OR "payment")' },
  { label: 'Shipping costs', query: '-from:me subject:(shipping OR postage OR label OR shippo OR ups OR fedex OR dhl OR tracking)' }
];
let _activeGmailPresetIdx = -1;

function renderGmailChips() {
  const chipsContainer = $('email-gmail-chips');
  if (!chipsContainer) return;
  chipsContainer.innerHTML = GMAIL_RECEIPT_PRESETS.map((p, idx) => {
    return `<button type="button" class="filter-chip${idx === _activeGmailPresetIdx ? ' active' : ''}" onclick="applyGmailPresetQuery(${idx})">${escapeHtml(p.label)}</button>`;
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
        <div style="background:white;padding:6px 12px;border:1px solid var(--border2);border-radius:var(--r);max-height:100px;overflow-y:auto;">
          ${listItems}
        </div>
      </div>
    `;
  } else {
    attachmentsHtml = `<div style="margin-top:6px;font-size:10px;color:var(--text4);font-style:italic;">No PDF or image attachments found.</div>`;
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
    confidence: { type: 'NUMBER' }
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

  try {
    const upload = await _prepareReceiptUpload(file);
    if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const out = await _callGeminiForReceipts(apiKey, [
      { text: _buildReceiptScanPrompt() },
      { inline_data: { mime_type: upload.mime, data: upload.base64 } }
    ], {
      signal: ac.signal,
      schema: RECEIPT_SCAN_SCHEMA,
      // One receipt's JSON is a few hundred tokens; the old 8192 default let a
      // confused model ramble, which cost latency on every scan. Kept at 2048
      // rather than tighter because these flash models spend part of the
      // budget on thought parts before the answer.
      maxOutputTokens: 2048
    });

    const parsed = _parseReceiptJson(out?.text || '') || {};
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
    for (const id of [cfg.curId, cfg.amountId, cfg.descId]) {
      const el = id && $(id);
      if (!el) continue;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
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
    if (btn) { btn.textContent = oldText; btn.disabled = false; }
  }
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
  if (!wrap) return;
  if (!Array.isArray(receipts) || !receipts.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:14px;font-size:12px;color:var(--text3);">No valid receipts found.</div>';
    return;
  }
  const esc = escapeHtml;
  const catOptions = (sel) => EXPENSE_CATEGORIES
    .map(c => `<option${c === sel ? ' selected' : ''}>${esc(c)}</option>`).join('');
  const curOptions = (sel) => ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'JPY', 'MXN', 'CHF', 'SEK', 'NOK', 'DKK']
    .map(c => `<option${c === sel ? ' selected' : ''}>${esc(c)}</option>`).join('');

  const dupCount = receipts.filter(r => _isLikelyDuplicateExpense(r)).length;

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:12px;color:var(--text3);">${receipts.length} draft${receipts.length > 1 ? 's' : ''} extracted${dupCount ? ` · <span style="color:var(--amber);">${dupCount} possible duplicate${dupCount > 1 ? 's' : ''}</span>` : ''}. Edit any field, deselect rows you don't want.</div>
      <div style="display:flex;gap:6px;">
        <button class="btn sm" type="button" onclick="toggleAllEmailDrafts(true)">Select all</button>
        <button class="btn sm" type="button" onclick="toggleAllEmailDrafts(false)">Select none</button>
        ${dupCount ? `<button class="btn sm" type="button" onclick="deselectDuplicateEmailDrafts()">Deselect duplicates</button>` : ''}
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
    return `<tr data-erd-row="${i}" style="${dup ? 'background:rgba(220,170,40,.06);' : ''}">
            <td><input type="checkbox" data-erd-include="${i}" ${r.include !== false ? 'checked' : ''}></td>
            <td><input type="date" data-erd-field="date" data-erd-i="${i}" value="${esc(r.date)}" style="font-size:12px;width:130px;"></td>
            <td>
              <input type="text" data-erd-field="vendor" data-erd-i="${i}" value="${esc(r.vendor)}" placeholder="Vendor" style="font-size:12px;width:100%;margin-bottom:2px;">
              <input type="text" data-erd-field="description" data-erd-i="${i}" value="${esc(r.description)}" placeholder="Description" style="font-size:11px;width:100%;color:var(--text2);">
              ${dup ? `<div style="font-size:10px;color:var(--amber);margin-top:2px;">⚠ matches an existing expense</div>` : ''}
              ${lowConf ? `<div style="font-size:10px;color:var(--text3);margin-top:2px;">low confidence (${(r.confidence * 100 | 0)}%)</div>` : ''}
              ${r.msgId
        ? `<div style="font-size:10px;color:var(--text3);margin-top:2px;">${(r.selectedAtts && r.selectedAtts.length) ? `📎 ${r.selectedAtts.length} file${r.selectedAtts.length > 1 ? 's' : ''} + email` : `📄 email`} → receipts folder on import</div>`
        : ''}
            </td>
            <td><select data-erd-field="category" data-erd-i="${i}" style="font-size:12px;">${catOptions(r.category)}</select></td>
            <td><input type="text" data-erd-field="reference" data-erd-i="${i}" value="${esc(r.reference)}" placeholder="—" style="font-size:12px;width:120px;"></td>
            <td class="r">
              <div style="display:flex;gap:4px;align-items:center;justify-content:flex-end;">
                <select data-erd-field="currency" data-erd-i="${i}" style="font-size:12px;width:64px;">${curOptions(r.currency)}</select>
                <input type="number" step="0.01" data-erd-field="amount" data-erd-i="${i}" value="${Number(r.amount).toFixed(2)}" style="font-size:12px;width:90px;text-align:right;">
              </div>
            </td>
            <td>${r.sourceSnippet ? `<button class="btn sm" type="button" title="View source snippet" aria-label="View source snippet" onclick="confirmDialog(${JSON.stringify(r.sourceSnippet)}, {title:'Source snippet', okLabel:'OK', cancelLabel:'Close'})">👁</button>` : ''}</td>
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

// Rows the author can select for a bulk reimbursement request (unreceived,
// approved, non-gratuity expenses). Persists selection across re-renders.
window._expReimburseSelection = window._expReimburseSelection || new Set();

export function renderExpenses() {
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
  for (const id of window._expReimburseSelection) if (!eligibleIds.has(id)) window._expReimburseSelection.delete(id);

  if (!combined.length) {
    body.innerHTML = `<tr><td colspan="${window.IS_PUBLISHER ? 9 : (showSelectCol ? 9 : 8)}"><div class="empty-state" style="padding:1.5rem;">No expenses logged yet.</div></td></tr>`;
    updateBulkReimburseButton();
    return;
  }

  // ⚡ Bolt Optimization: Loop Fusion
  // Combined .filter() and .reduce() into a single pass to eliminate intermediate array allocations
  const unreceived = [];
  let total = 0;
  for (const e of combined) {
    if (!e.received && !e.pendingAuth && !isGratuityExpense(e)) {
      unreceived.push(e);
      total += (e.amount || 0);
    }
  }

  $('exp-head-row').innerHTML = `<tr>${showSelectCol ? '<th></th>' : ''}<th>Date</th><th>Description</th><th>Category</th><th>Ref</th><th>Receipt</th><th class="r">Amount</th>${window.IS_PUBLISHER ? '<th class="r">Amount (CAD)</th>' : ''}<th>Reimbursement</th><th></th></tr>`;

  body.innerHTML = combined.map(e => {
    if (e.pendingAuth) {
      const actionCell = window.IS_PUBLISHER
        ? `<div class="approval-actions"><button class="appr-btn approve" onclick="approveSubmission('expenses', '${e._subKey}')" aria-label="Approve submission"><span class="ico">✓</span>Approve</button><button class="appr-btn reject" onclick="rejectSubmission('expenses', '${e._subKey}')" title="Reject submission" aria-label="Reject submission">✕</button></div>`
        : `<span style="font-size:10px;color:var(--amber);">Awaiting Publisher</span>`;
      return `<tr style="opacity:0.8;background:#fffcede3;">
        ${showSelectCol ? '<td></td>' : ''}
        <td style="font-size:12px;color:var(--text3);">${fmtD(e.date)}</td>
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

    const statusCell = isGratuityExpense(e)
      ? '<span class="pill gray" style="font-size:10px;" title="Gifted-copy cost — not reimbursed to the author">Publisher expense</span>'
      : e.received
        ? '<span class="pill green" style="font-size:10px;">✓ Received</span>'
        : '<span style="font-size:11px;color:var(--text4);">Pending</span>';
    const actionCell = (!e.received && !isAuthor() && !isGratuityExpense(e))
      ? `<button class="edit-btn" onclick="voidExpense(${e.id})" title="Remove" aria-label="Remove" style="opacity:1;color:var(--red);">✕</button>` : '';
    const baseReceiptLink = e.receipt ? (
      e.receipt.startsWith('local://')
        ? `<a href="#" onclick="event.preventDefault(); viewLocalReceipt('${escapeHtml(e.receipt.replace('local://', ''))}')" style="font-size:11px;color:var(--gold);text-decoration:underline;">View Local</a>`
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

    const selectCell = showSelectCol
      ? (eligibleIds.has(e.id)
        ? `<td><input type="checkbox" onchange="toggleExpenseReimburseSelect(${e.id}, this.checked)" ${window._expReimburseSelection.has(e.id) ? 'checked' : ''}></td>`
        : '<td></td>')
      : '';

    return `<tr style="${e.received ? 'opacity:.5;' : ''}">
      ${selectCell}
      <td style="font-size:12px;color:var(--text3);">${fmtD(e.date)}</td>
      <td style="font-weight:600;">${escapeHtml(e.desc)}</td>
      <td><span class="pill gray" style="font-size:10px;">${escapeHtml(e.cat)}</span></td>
      <td style="font-size:11px;color:var(--text3);">${escapeHtml(e.ref) || '—'}</td>
      <td>${receiptCell}</td>
      <td class="r" style="color:${e.received ? 'var(--text4)' : 'var(--red)'};font-family:'DM Mono',monospace;">${fmt(e.amount, eCur)}</td>
      ${window.IS_PUBLISHER ? `<td class="r" style="font-family:'DM Mono',monospace;color:var(--text3);"${baseAmountTitle ? ` title="${baseAmountTitle}"` : ''}>${baseAmountText}</td>` : ''}
      <td>${statusCell}</td>
      <td>${actionCell}</td>
    </tr>`;
  }).join('')
    + `<tr style="background:var(--cream2);">
      <td colspan="${showSelectCol ? 6 : 5}" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);text-align:right;padding-right:16px;">Outstanding</td>
      <td class="r" style="font-weight:700;color:var(--red);font-family:'DM Mono',monospace;">${fmt(total, cur)}</td>
      <td colspan="${window.IS_PUBLISHER ? 3 : 2}"></td>
    </tr>`;

  updateBulkReimburseButton();
}

function toggleExpenseReimburseSelect(id, checked) {
  if (checked) window._expReimburseSelection.add(id);
  else window._expReimburseSelection.delete(id);
  updateBulkReimburseButton();
}

function updateBulkReimburseButton() {
  const btn = $('exp-bulk-reimburse-btn');
  const countEl = $('exp-bulk-reimburse-count');
  if (!btn) return;
  const n = window._expReimburseSelection.size;
  if (countEl) countEl.textContent = n;
  btn.style.display = n > 0 ? '' : 'none';
}

// Sends one consolidated "please reimburse these" notification to the
// publisher for every expense the author checked, instead of chasing each
// one down individually.
async function requestBulkReimbursement() {
  const ids = Array.from(window._expReimburseSelection);
  if (!ids.length) return;
  const s = getState(), book = getBook(), cur = book.currency;
  const idSet = new Set(ids);
  const items = (s.expenses || []).filter(e => idSet.has(e.id));
  if (!items.length) { window._expReimburseSelection.clear(); updateBulkReimburseButton(); return; }

  const total = items.reduce((sum, e) => sum + (e.amount || 0), 0);
  const summary = `Reimbursement requested for ${items.length} expense${items.length !== 1 ? 's' : ''} — ${fmt(total, cur)}`;
  const btn = $('exp-bulk-reimburse-btn');
  const oldText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    await notifyPublisherSubmission('Reimbursement request', items, summary);
    showToast(`✓ Requested reimbursement for ${items.length} expense${items.length !== 1 ? 's' : ''}`);
    window._expReimburseSelection.clear();
    renderExpenses();
  } catch (e) {
    console.error(e);
    showToast('⚠ Could not send reimbursement request', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
  }
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

      const SHORT = { 'Un Fantastico Altrove': 'Altrove', 'The Hound': 'Hound', 'Archaeology of Presence': 'Archaeology', 'Sistema_non_autorizzato': 'Sistema', 'As if Nobody is Watching': 'Nobody', 'Collective Photobook': 'Collective' };
      const shortName = SHORT[book.title] || book.title;
      // Try short name first, then full name, then first sheet
      let sheetName = wb.SheetNames.find(n => n === shortName + ' — Orders')
        || wb.SheetNames.find(n => n === book.title + ' — Orders')
        || wb.SheetNames.find(n => n.toLowerCase().includes(shortName.toLowerCase()))
        || wb.SheetNames.find(n => n.toLowerCase().includes(book.title.toLowerCase().slice(0, 6)))
        || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) { showToast('No data found in spreadsheet', 'warn'); return; }

      // Flexible column mapping — handles variations in header names
      const colMap = (row) => {
        const k = (name) => {
          const keys = Object.keys(row);
          return keys.find(k => k.toLowerCase().replace(/[\s_#]/g, '').includes(name)) || '';
        };
        const num = row[k('order')] || row[k('num')] || '';
        const date = row[k('date')] || '';
        const chan = row[k('channel')] || row[k('chan')] || 'Website';
        const qty = parseFloat(row[k('qty')] || row[k('quantity')] || 1) || 1;
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
          parsedDate = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        }
        return { num: String(num || 'IMP-' + Date.now()), date: parsedDate, chan: String(chan), qty: Math.abs(Math.round(qty)), price, notes: String(notes) };
      };

      _importRows = rows.map(colMap).filter(r => r.qty > 0);

      if (!_importRows.length) { showToast('Could not parse any valid rows', 'warn'); return; }

      // Reset modal layout for spreadsheet import
      const modalTitle = $('import-modal-title');
      if (modalTitle) modalTitle.textContent = 'Import order history';
      const warnBox = $('import-warning-box');
      if (warnBox) {
        warnBox.style.background = '';
        warnBox.style.borderLeftColor = '';
        warnBox.style.color = '';
        warnBox.innerHTML = `⚠ This will <strong>add</strong> these rows to the current book's history. It will not overwrite existing data. Stock and revenue will be recalculated.`;
      }
      const confirmBtn = $('import-confirm-btn');
      if (confirmBtn) {
        confirmBtn.setAttribute('onclick', 'confirmImport()');
      }

      // Build preview
      $('import-summary').innerHTML = `Found <strong>${_importRows.length} orders</strong> in sheet <em>"${sheetName}"</em> — review below then confirm.`;
      $('import-count').textContent = _importRows.length;
      $('import-preview-body').innerHTML = _importRows.map(r => `
        <tr>
          <td class="mono">${escapeHtml(r.num)}</td>
          <td style="font-size:12px;color:var(--text3);">${fmtD(r.date)}</td>
          <td>${escapeHtml(r.chan)}</td>
          <td class="r">${r.qty}</td>
          <td class="r">${book.currency}${r.price.toFixed(2)}</td>
          <td class="r" style="font-weight:600;">${book.currency}${(r.qty * r.price).toFixed(2)}</td>
          <td style="font-size:11px;color:var(--text3);">${escapeHtml(r.notes) || '—'}</td>
          <td><span class="pill blue" style="font-size:10px;">New</span></td>
        </tr>`).join('');
      openM('import');
    } catch (err) {
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
    if (!s.chStats[r.chan]) s.chStats[r.chan] = { txns: 0, units: 0, revenue: 0 };
    s.chStats[r.chan].txns++;
    s.chStats[r.chan].units += r.qty;
    s.chStats[r.chan].revenue += r.qty * r.price;
    s.hist.unshift({ num: r.num, chan: r.chan, qty: r.qty, price: r.price, after: s.stock, notes: r.notes, date: r.date });
    imported++;
  });

  recomputeAfters(s, book);
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
  if (typeof window.updateGratuitySourceHint === 'function') window.updateGratuitySourceHint();
}

function phint() {
  const book = getBook(), p = parseFloat($('m-price').value) || 0, q = parseInt($('m-qty').value) || 1, h = $('m-hint');
  let t = p * q;

  if (_manualFxRate) {
    calcFx(); // Update the inline converted value
    const convertedP = p * _manualFxRate;
    t = convertedP * q;
    h.className = 'hint-text';
    h.textContent = t > 0 ? `Total revenue: ${fmt(t, book.currency)}` : '';
  } else if (p < book.listPrice) {
    h.className = 'hint-text amber';
    h.textContent = `Discounted from ${book.currency}${book.listPrice} — total ${fmt(t, book.currency)}`;
  } else {
    h.className = 'hint-text';
    h.textContent = q > 1 ? `Total ${fmt(t, book.currency)}` : '';
  }
}
async function submitManual(ev) {
  return withButtonLoading(ev, 'Saving…', async () => {
    const book = getBook(), qty = parseInt($('m-qty').value) || 1;
    const rawPrice = parseFloat($('m-price').value) || book.listPrice;
    const num = $('m-num').value.trim() || 'MAN-' + Date.now(), chan = $('m-chan').value, notes = $('m-notes').value.trim();
    const paymentType = $('m-payment-type').value;
    if (!paymentType) {
      $('m-payment-type').style.borderColor = 'var(--red)';
      $('m-payment-type').focus();
      showToast('⚠ Please select a payment type', 'warn');
      return;
    }
    $('m-payment-type').style.borderColor = '';

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

    const fullNotes = [notes, fxNote, paymentType].filter(Boolean).join(' · ');

    // Create standard entry payload. `directToArtist` is the structured flag used
    // for detection (isDirectToArtistSale); paymentType is kept for display/back-compat.
    const directToArtist = paymentType === PAYMENT_TYPE_DIRECT_TO_ARTIST;
    const entryPayload = { num, chan, qty, price, notes: fullNotes, payment, paymentType, directToArtist, date: today(), id: Date.now() };

    if (isAuthor()) {
      // Author queue route
      try {
        await window._fbSubmitActivity(activeBook, 'sales', entryPayload);
        addLog('log-manual', `${num}: -${qty} @ ${fmt(price, book.currency)} — (Submitted)`, 'warn');
        const isArtistPayment = directToArtist;
        const notifyKind = isArtistPayment ? 'Artist Payment Approval' : 'Sale';
        const baseSummary = `${num}: -${qty} @ ${fmt(price, book.currency)}${paymentType ? ' · ' + paymentType : ''}`;
        const notifySummary = isArtistPayment
          ? `ACTION REQUIRED — artist payment of ${fmt(qty * price, book.currency)} awaiting your approval. ${baseSummary}`
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
        reportClientError('submit-sale-failed', e && e.message, { stack: e && e.stack });
        showToast(isPermissionDenied(e)
          ? '⚠ Permission denied — this book is not linked to your account. Nothing was submitted.'
          : '⚠ Could not submit the order — nothing was recorded. Check your connection and try again.', 'err', 6000);
      }
    } else {
      // Publisher direct route
      if (directToArtist) {
        recordOrderPendingTransfer(num, chan, qty, price, fullNotes, payment);
        addLog('log-manual', `${num}: -${qty} @ ${fmt(price, book.currency)} — ⏳ awaiting artist transfer`, 'warn');
        showToast('⏳ Order logged — awaiting artist transfer to publisher');
      } else {
        recordOrder(num, chan, qty, price, fullNotes, payment);
        addLog('log-manual', `${num}: -${qty} @ ${fmt(price, book.currency)}${fxNote ? ' (' + fxNote + ')' : ''} → ${getState().stock} remaining`, 'ok');
        if (getState().stock <= book.threshold) addLog('log-manual', '⚠ Below threshold!', 'warn');
        showToast('✓ Order saved · syncing to Sheets…');
      }
    }

    $('m-num').value = ''; $('m-qty').value = '1';
    $('m-price').value = book.listPrice.toFixed(2);
    $('m-notes').value = ''; $('m-payment-type').value = ''; $('m-hint').textContent = '';
    $('m-price-cur').value = 'BOOK';
    onManualCurrencyChange(); // reset fx logic
  });
}

// Guard against double-taps: a second click on Approve/Reject while the first
// is still awaiting the Firestore delete would record the same sale/expense
// twice (inventory off, revenue double-counted). Keys are `${type}:${subKey}`.
const _submissionsInFlight = new Set();

window.approveSubmission = async function (type, subKey) {
  const queue = window.authorSubmissions[activeBook]?.[type] || {};
  if (!queue[subKey]) return;
  const flightKey = `${activeBook}:${type}:${subKey}`;
  if (_submissionsInFlight.has(flightKey)) return;
  _submissionsInFlight.add(flightKey);
  try {
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
      if (isDirectToArtistSale(raw)) {
        recordOrderPendingTransfer(raw.num, raw.chan, raw.qty, raw.price, raw.notes, raw.payment);
        pendingTransfer = true;
      } else {
        recordOrder(raw.num, raw.chan, raw.qty, raw.price, raw.notes, raw.payment);
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
  } finally {
    _submissionsInFlight.delete(flightKey);
  }
}

window.rejectSubmission = async function (type, subKey) {
  const flightKey = `${activeBook}:${type}:${subKey}`;
  if (_submissionsInFlight.has(flightKey)) return;
  if (!(await confirmDialog('Reject this submission from the author?', { okLabel: 'Reject', danger: true }))) return;
  _submissionsInFlight.add(flightKey);
  try {
    await window._fbDeleteSubmission(activeBook, type, subKey);
    showToast('Submission removed', 'warn');
    if (activeBook === 'all') updateAllOverview();
    else { updateDash(); renderHist(); renderExpenses(); }
  } finally {
    _submissionsInFlight.delete(flightKey);
  }
}

function recordOrderPendingTransfer(num, chan, qty, price, notes, payment = null) {
  const s = getState(), book = getBook();
  // Reduce stock and count as sold, but do NOT add to revenue yet
  s.stock = Math.max(0, s.stock - qty);
  s.sold += qty;
  if (!s.chStats[chan]) s.chStats[chan] = { txns: 0, units: 0, revenue: 0 };
  s.chStats[chan].txns++; s.chStats[chan].units += qty;
  let updatedNotes = notes || '';
  if (num && num.startsWith('INV-')) {
    const inv = (s.invoices || []).find(i => i.num === num || i.id === num);
    if (inv && inv.discount > 0) {
      const discStr = inv.discountType === 'percent'
        ? `Invoice Discount: ${inv.discountRate}%`
        : `Invoice Discount: flat`;
      if (!updatedNotes.includes('Invoice Discount:')) {
        updatedNotes = updatedNotes ? `${updatedNotes} · ${discStr}` : discStr;
      }
    }
  }

  // Add to history with pending flag. directToArtist marks this as cash the
  // artist collected directly (these only ever come from direct-to-artist sales).
  const sheetsId = makeEventId();
  s.hist.unshift({ num, chan, qty, price, after: s.stock, notes: updatedNotes, date: today(), artistPending: true, directToArtist: true, payment, sheetsId, cur: bookCurrencyCode(book) });
  // Add to artistTransfers queue (share sheetsId so receipt updates the same sheet row)
  s.artistTransfers.push({ id: Date.now(), num, chan, qty, price, total: qty * price, notes: updatedNotes, date: today(), payment, sheetsId, cur: bookCurrencyCode(book) });
  recomputeAfters(s, book);
  renderHist(); updateDash(); saveState(activeBook);
  const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  const totalNative = qty * price;
  const cadEquiv = cadEquivalentForSale({ nativeCurrency: nativeCur, totalNative, payment });
  syncToSheets({
    type: 'order', book: book.title, date: today(), num, chan, qty, price, total: totalNative, stockAfter: s.stock, notes: updatedNotes + ' [PENDING ARTIST TRANSFER]',
    sheetsId,
    currency: nativeCur,
    paymentCurrency: normalizeCurrencyCode(payment?.currency || nativeCur, 'CAD'),
    paymentAmount: payment?.amount ?? totalNative,
    paymentRate: payment?.rate ?? '',
    convertedTotal: cadEquiv
  });
}

function markArtistTransferReceived(transferId) {
  const s = getState(), book = getBook();
  const t = s.artistTransfers.find(x => x.id === transferId);
  if (!t) return;
  // Now credit the revenue
  s.revenue += t.total;
  if (!s.chStats[t.chan]) s.chStats[t.chan] = { txns: 0, units: 0, revenue: 0 };
  s.chStats[t.chan].revenue += t.total;
  // Mark history entry as resolved
  const h = s.hist.find(x => x.num === t.num && x.artistPending);
  if (h) { h.artistPending = false; h.notes = (h.notes ? h.notes + ' · ' : '') + 'Transfer received'; }
  // Remove from pending queue
  s.artistTransfers = s.artistTransfers.filter(x => x.id !== transferId);
  renderHist(); updateDash(); renderArtistTransfers(); saveState(activeBook);
  const nativeCurT = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  let cadEquivT = '';
  if (nativeCurT === 'CAD') cadEquivT = t.total;
  else if (t.payment && t.payment.currency === 'CAD' && t.payment.amount) cadEquivT = t.payment.amount;
  syncToSheets({
    type: 'order', book: book.title, date: today(), num: t.num, chan: t.chan, qty: t.qty, price: t.price, total: t.total, stockAfter: s.stock, notes: (t.notes || '') + ' [ARTIST TRANSFER RECEIVED]',
    sheetsId: t.sheetsId || (h && h.sheetsId) || '',
    currency: nativeCurT,
    paymentCurrency: normalizeCurrencyCode(t.payment?.currency || nativeCurT, 'CAD'),
    paymentAmount: t.payment?.amount ?? t.total,
    paymentRate: t.payment?.rate ?? '',
    convertedTotal: cadEquivT
  });
  showToast(`✓ Transfer received — ${fmt(t.total, book.currency)} added to revenue`);
}

// Settle a held transfer where the artist KEEPS their share and only forwards
// the publisher's cut (the common real-world case). Unlike "mark received" — which
// assumes the artist forwards the full gross — this credits the sale to revenue,
// records the artist's share as already-paid (they kept the cash), and leaves only
// the publisher cut as the amount the artist still owes you.
async function settleArtistTransferKeepShare(transferId) {
  const s = getState(), book = getBook();
  const t = s.artistTransfers.find(x => x.id === transferId);
  if (!t) return;

  // The held sale already counts toward earnings, so its marginal share is the
  // drop in lifetime earnings if it were removed (this respects tier placement).
  const h = s.hist.find(x => x.num === t.num && x.artistPending);
  const full = calculateArtistEarnings(activeBook);
  const without = calcArtistEarnings(book, { ...s, hist: s.hist.filter(x => x !== h) });
  const share = (full && without)
    ? Math.max(0, +(full.totalArtistEarned - without.totalArtistEarned).toFixed(2))
    : +(t.total / 2).toFixed(2);
  const publisherCut = +(t.total - share).toFixed(2);

  if (!(await confirmDialog(
    `Settle ${escapeHtml(t.num)} — artist keeps their ${fmt(share, book.currency)} share?\n\n` +
    `The full ${fmt(t.total, book.currency)} sale is booked to revenue. The artist's ` +
    `${fmt(share, book.currency)} share is recorded as paid (they kept the cash), leaving ` +
    `${fmt(publisherCut, book.currency)} — your cut — for them to forward.`,
    { okLabel: 'Settle' }
  ))) return;

  // Credit the sale to revenue and resolve the pending history entry.
  s.revenue += t.total;
  if (!s.chStats[t.chan]) s.chStats[t.chan] = { txns: 0, units: 0, revenue: 0 };
  s.chStats[t.chan].revenue += t.total;
  if (h) { h.artistPending = false; h.notes = (h.notes ? h.notes + ' · ' : '') + 'Artist kept their share'; }

  // Record the artist's share as a payout — they already hold that cash.
  if (!s.artistPayouts) s.artistPayouts = [];
  if (share > 0) {
    s.artistPayouts.push({
      id: Date.now(),
      date: today(),
      amount: share,
      method: 'Kept from direct sale',
      notes: `${t.num} — artist retained their share`,
      cur: bookCurrencyCode(book)
    });
  }

  s.artistTransfers = s.artistTransfers.filter(x => x.id !== transferId);
  renderHist(); updateDash(); renderArtistTransfers(); await saveState(activeBook);
  const nativeCurS = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  let cadEquivS = '';
  if (nativeCurS === 'CAD') cadEquivS = t.total;
  else if (t.payment && t.payment.currency === 'CAD' && t.payment.amount) cadEquivS = t.payment.amount;
  syncToSheets({
    type: 'order', book: book.title, date: today(), num: t.num, chan: t.chan, qty: t.qty, price: t.price, total: t.total, stockAfter: s.stock, notes: (t.notes || '') + ' [ARTIST KEPT SHARE]',
    sheetsId: t.sheetsId || (h && h.sheetsId) || '',
    currency: nativeCurS,
    paymentCurrency: normalizeCurrencyCode(t.payment?.currency || nativeCurS, 'CAD'),
    paymentAmount: t.payment?.amount ?? t.total,
    paymentRate: t.payment?.rate ?? '',
    convertedTotal: cadEquivS
  });
  showToast(`✓ Settled — artist keeps ${fmt(share, book.currency)}; ${fmt(publisherCut, book.currency)} still to forward`);
}

// Settle a held transfer where the artist keeps the FULL gross — the publisher
// forgives their cut entirely. The full sale is booked to revenue and the full
// gross is recorded as a payout to the artist (they owe nothing further).
async function settleArtistTransferKeepAll(transferId) {
  const s = getState(), book = getBook();
  const t = s.artistTransfers.find(x => x.id === transferId);
  if (!t) return;

  if (!(await confirmDialog(
    `Settle ${escapeHtml(t.num)} — artist keeps everything?\n\n` +
    `The full ${fmt(t.total, book.currency)} sale is booked to revenue and recorded as a ` +
    `payout to the artist. Your publisher cut is forgiven — the artist owes nothing further.`,
    { okLabel: 'Settle — forgive publisher cut' }
  ))) return;

  const h = s.hist.find(x => x.num === t.num && x.artistPending);

  // Credit the full gross to revenue and resolve the pending history entry.
  s.revenue += t.total;
  if (!s.chStats[t.chan]) s.chStats[t.chan] = { txns: 0, units: 0, revenue: 0 };
  s.chStats[t.chan].revenue += t.total;
  if (h) { h.artistPending = false; h.notes = (h.notes ? h.notes + ' · ' : '') + 'Artist kept full amount (publisher cut forgiven)'; }

  // Record the full gross as a payout — artist held all of it.
  if (!s.artistPayouts) s.artistPayouts = [];
  s.artistPayouts.push({
    id: Date.now(),
    date: today(),
    amount: t.total,
    method: 'Kept from direct sale (full)',
    notes: `${t.num} — artist retained full gross; publisher cut forgiven`,
    cur: bookCurrencyCode(book)
  });

  s.artistTransfers = s.artistTransfers.filter(x => x.id !== transferId);
  renderHist(); updateDash(); renderArtistTransfers(); await saveState(activeBook);
  const nativeCurA = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  let cadEquivA = '';
  if (nativeCurA === 'CAD') cadEquivA = t.total;
  else if (t.payment && t.payment.currency === 'CAD' && t.payment.amount) cadEquivA = t.payment.amount;
  syncToSheets({
    type: 'order', book: book.title, date: today(), num: t.num, chan: t.chan, qty: t.qty, price: t.price, total: t.total, stockAfter: s.stock, notes: (t.notes || '') + ' [ARTIST KEPT ALL — PUBLISHER CUT FORGIVEN]',
    sheetsId: t.sheetsId || (h && h.sheetsId) || '',
    currency: nativeCurA,
    paymentCurrency: normalizeCurrencyCode(t.payment?.currency || nativeCurA, 'CAD'),
    paymentAmount: t.payment?.amount ?? t.total,
    paymentRate: t.payment?.rate ?? '',
    convertedTotal: cadEquivA
  });
  showToast(`✓ Settled — artist keeps full ${fmt(t.total, book.currency)}; publisher cut forgiven`);
}

function renderArtistTransfers() {
  const s = getState(), book = getBook(), cur = book.currency;
  let transfers = [...(s.artistTransfers || [])].map(t => ({ ...t, status: 'approved' }));
  const payLink = book.paymentLink || '';

  // Merge in pending author submissions for BOTH author and publisher views
  const pbSales = window.authorSubmissions[activeBook]?.sales || {};
  Object.keys(pbSales).forEach(k => {
    const raw = (typeof pbSales[k].data === 'string') ? JSON.parse(pbSales[k].data) : pbSales[k].data;
    if (isDirectToArtistSale(raw)) {
      transfers.push({
        ...raw,
        total: (raw.qty || 0) * (raw.price || 0),
        status: 'pending' // Flagged as pending approval
      });
    }
  });

  // ── AUTHOR BANNER
  const banner = $('author-payment-banner');
  if (banner) {
    if (isAuthor() && transfers.length > 0) {
      const totalOwed = transfers.reduce((a, t) => a + t.total, 0);
      banner.style.display = '';
      $('apb-amount').textContent = fmt(totalOwed, cur);
      $('apb-detail').textContent = `${transfers.length} transfer${transfers.length > 1 ? 's' : ''} from sales collected on your end (incl. pending)`;
      const btn = $('apb-pay-btn');
      if (payLink) {
        const fullLink = payLink.startsWith('http') ? payLink : 'https://' + payLink;
        btn.href = fullLink;
        btn.textContent = 'Send payment →';
        $('apb-link-hint').textContent = 'Opens payment link in a new tab';
      } else {
        btn.href = '#';
        btn.onclick = e => { e.preventDefault(); };
        btn.textContent = 'Contact publisher';
        $('apb-link-hint').textContent = 'Payment link not set — contact your publisher';
      }
      $('apb-transfers').innerHTML = transfers.map(t => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap; opacity: ${t.status === 'pending' ? '.6' : '1'}">
          <div style="font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,.35);">
            ${escapeHtml(t.num)} · ${fmtD(t.date)} · ${t.qty}× ${t.status === 'pending' ? ' (Pending Approval)' : ''}
          </div>
          <div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--gold2);font-weight:500;">${fmt(t.total, cur)}</div>
        </div>`).join('');
    } else {
      banner.style.display = 'none';
    }
  }

  // ── PUBLISHER PANEL
  const sect = $('artist-transfers-sect'), list = $('artist-transfers-list');
  if (!sect) return;
  if (!transfers.length) { sect.style.display = 'none'; return; }
  sect.style.display = '';
  const fullPayLink = payLink.startsWith('http') ? payLink : payLink ? 'https://' + payLink : '';
  const payHtml = fullPayLink
    ? `<a href="${fullPayLink}" target="_blank" class="btn sm" style="text-decoration:none;background:var(--green-bg);color:var(--green);border-color:rgba(42,99,72,.2);">↗ Payment link</a>`
    : `<span style="font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;">No payment link set</span>`;

  list.innerHTML = transfers.map(t => `
    <div style="background:white;border:1px solid var(--border);border-left:3px solid var(--amber);border-radius:var(--r2);padding:1rem 1.25rem;margin-bottom:10px;box-shadow:var(--shadow);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;opacity: ${t.status === 'pending' ? '.6' : '1'};">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span class="pill amber">⏳ Awaiting transfer</span>
          <span style="font-family:'DM Mono',monospace;font-size:13px;font-weight:600;">${escapeHtml(t.num)}</span>
          ${t.status === 'pending' ? `<span class="pill gray" style="font-size:10px;">Pending Approval</span>` : ''}
        </div>
        <div style="font-size:12px;color:var(--text3);">${fmtD(t.date)} · ${t.chan} · ${t.qty}× · <strong style="color:var(--amber);">${fmt(t.total, cur)} held</strong></div>
        <div style="font-size:11px;color:var(--text4);margin-top:3px;">${escapeHtml(t.notes) || '—'}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        ${payHtml}
        ${t.status === 'pending'
      ? `<button class="btn sm outline" disabled>Approve sale first</button>`
      : `<button class="btn sm outline" onclick="settleArtistTransferKeepShare(${t.id})" title="Artist keeps their share; only your cut is forwarded">Artist keeps share</button>
             <button class="btn sm outline" onclick="settleArtistTransferKeepAll(${t.id})" title="Artist keeps everything — publisher forgives their cut">Artist keeps all</button>
             <button class="btn gold" onclick="markArtistTransferReceived(${t.id})" title="Artist forwarded the full amount to you">✓ Mark transfer received</button>`}
      </div>
    </div>`).join('');
}

function markExpenseReceived(id) {
  const s = getState(), book = getBook(), cur = book.currency;
  const e = s.expenses.find(x => x.id === id);
  if (!e) return;
  e.received = true;
  e.receivedDate = today();
  saveState(activeBook);
  renderPendingExpenses(); renderExpenses(); updateDash();
  showToast(`✓ Expense marked as received — ${fmt(e.amount, cur)}`);
}

function renderPendingExpenses() {
  const s = getState(), book = getBook(), cur = book.currency;
  const pending = [];
  for (const e of (s.expenses || [])) {
    if (!e.received && !isGratuityExpense(e)) {
      pending.push(e);
    }
  }
  const sect = $('d-pending-expenses-sect'), list = $('d-pending-expenses-list');
  if (!sect) return;
  if (!pending.length) { sect.style.display = 'none'; return; }
  sect.style.display = '';
  const artistLink = (s.artistPaymentLink || '').trim();
  const fullLink = artistLink ? (artistLink.startsWith('http') ? artistLink : 'https://' + artistLink) : '';
  const payHtml = fullLink
    ? `<a href="${fullLink}" target="_blank" class="btn sm" style="text-decoration:none;background:var(--green-bg);color:var(--green);border-color:rgba(42,99,72,.2);">↗ Payment link</a>`
    : `<span style="font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;">No payment link set</span>`;
  list.innerHTML = pending.map(e => `
    <div style="background:white;border:1px solid var(--border);border-left:3px solid var(--amber);border-radius:var(--r2);padding:1rem 1.25rem;margin-bottom:10px;box-shadow:var(--shadow);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span class="pill amber">⏳ Awaiting payment</span>
          <span style="font-family:'DM Mono',monospace;font-size:13px;font-weight:600;">${fmt(e.amount, cur)}</span>
        </div>
        <div style="font-size:12px;color:var(--text3);">${fmtD(e.date)} · <span style="background:var(--cream3);padding:1px 7px;border-radius:100px;font-size:10px;">${escapeHtml(e.cat)}</span> · <strong style="color:var(--text2);">${escapeHtml(e.desc)}</strong></div>
        <div style="font-size:11px;color:var(--text4);margin-top:3px;">${escapeHtml(e.ref) || ''}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        ${payHtml}
        <button class="btn gold" onclick="markExpenseReceived(${e.id})">✓ Mark received</button>
      </div>
    </div>`).join('');
}


window.toggleGratuityExpense = function () {
  const cb = $('g-expense-cb');
  const fields = $('g-expense-fields');
  if (cb.checked) {
    fields.style.display = 'grid';
    const book = getBook();
    const unitCost = (book.productionCost || 0) / (book.maxPrint || 1);
    $('g-exp-val').value = unitCost.toFixed(2);
    window.updateGratuityExpenseHint();
  } else {
    fields.style.display = 'none';
  }
}

window.updateGratuityExpenseHint = function () {
  const qty = parseInt($('g-qty').value) || 1;
  const val = parseFloat($('g-exp-val').value) || 0;
  const book = getBook();
  $('g-exp-total').textContent = fmt(qty * val, book.currency);
}

window.updateGratuitySourceHint = function () {
  const book = getBook(); if (!book) return;
  const s = getState(); if (!s) return;
  const hist = s.hist || [];
  // ⚡ Bolt Optimization: Calculate gratuity balances in a single pass to eliminate intermediate arrays and multiple loop overhead
  let usedPub = 0, usedAuth = 0;
  for (const h of hist) {
    if (h.gratuity && !h.voided) {
      if (h.gratSource === 'publisher') usedPub += h.qty || 0;
      else if (h.gratSource === 'author') usedAuth += h.qty || 0;
    }
  }
  const pubAlloc = book.pubGratuity || 0, authAlloc = book.authorGratuity || 0;
  const pubLeft = pubAlloc - usedPub, authLeft = authAlloc - usedAuth;
  const sel = $('g-source');
  if (sel) {
    const opts = sel.options;
    if (opts[0]) opts[0].textContent = `Publisher's pile (${pubLeft} of ${pubAlloc} left)`;
    if (opts[1]) opts[1].textContent = `Author's pile (${authLeft} of ${authAlloc} left)`;
  }
  const hint = $('g-source-remaining');
  if (hint) {
    const warnPub = pubLeft < 0, warnAuth = authLeft < 0;
    const warnStyle = ' style="color:var(--red)"';
    hint.innerHTML = `<span class="pile-chip"><span class="dot pub"></span>Publisher <strong${warnPub ? warnStyle : ''}>${pubLeft} of ${pubAlloc}</strong></span><span class="pile-chip"><span class="dot auth"></span>Author <strong${warnAuth ? warnStyle : ''}>${authLeft} of ${authAlloc}</strong></span>`;
  }
};

async function submitGratuity(ev) {
  return withButtonLoading(ev, 'Saving…', async () => {
    const book = getBook(), qty = parseInt($('g-qty').value) || 1, ref = $('g-ref').value.trim(), notes = $('g-notes').value.trim(), date = $('g-date').value || today();
    const gratSource = ($('g-source') && $('g-source').value) || 'publisher';
    const expenseIt = $('g-expense-cb') && $('g-expense-cb').checked;
    let expVal = 0;
    if (expenseIt) expVal = parseFloat($('g-exp-val').value) || 0;

    const s = getState();
    if (qty > s.stock) { showToast('⚠ Not enough stock on hand', 'warn'); return; }
    const num = 'GRAT-' + Date.now().toString().slice(-6);
    // Reduce stock only — no revenue, no sold count
    s.stock = Math.max(0, s.stock - qty);
    if (!s.chStats['Gratuity']) s.chStats['Gratuity'] = { txns: 0, units: 0, revenue: 0 };
    s.chStats['Gratuity'].txns++; s.chStats['Gratuity'].units += qty;
    const sheetsId = makeEventId();
    s.hist.unshift({ num, chan: 'Gratuity', qty, price: 0, after: s.stock, notes: (ref ? (ref + (notes ? ' · ' + notes : '')) : notes) || '', date, gratuity: true, gratSource, sheetsId });

    if (expenseIt && expVal > 0) {
      if (!s.expenses) s.expenses = [];
      const totalExp = qty * expVal;

      const currency = getBookCurrencyCode(book);
      const cadRate = currency !== 'CAD' ? (_fxRateCache[`${currency}_CAD`] || null) : 1;
      const baseAmount = cadRate ? (totalExp * cadRate) : totalExp;

      s.expenses.unshift({
        id: Date.now(),
        desc: `Gratuity: ${ref || notes || 'Gifted copy'}`,
        cat: 'Marketing & Advertising',
        amount: totalExp,
        currency: currency,
        origAmount: totalExp,
        origCurrency: currency,
        baseAmount: baseAmount,
        date: date,
        ref: num,
        received: false,
        gratuity: true
      });
    }

    recomputeAfters(s, book);
    renderHist();
    if (expenseIt) renderExpenses();
    updateDash(); saveState(activeBook);
    syncToSheets({ type: 'order', book: book.title, date, num, chan: 'Gratuity', qty, price: 0, total: 0, stockAfter: s.stock, notes: (ref ? ref + ' · ' : '') + notes + (notes || ref ? ' · ' : '') + gratSource + ' pile', sheetsId, currency: getBookCurrencyCode(book) });
    addLog('log-gratuity', `${num}: ${qty} gifted → ${s.stock} remaining`, 'ok');
    if (s.stock <= book.threshold) addLog('log-gratuity', '⚠ Below threshold!', 'warn');
    $('g-ref').value = ''; $('g-qty').value = '1'; $('g-notes').value = ''; $('g-date').value = today();
    if ($('g-expense-cb')) {
      $('g-expense-cb').checked = false;
      window.toggleGratuityExpense();
    }
    if (typeof window.updateGratuitySourceHint === 'function') window.updateGratuitySourceHint();
    showToast('✓ Gratuity logged' + (expenseIt && expVal > 0 ? ' and expensed' : ''));
  });
}

window.backfillGratuityExpenses = function () {
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
        cat: 'Marketing & Advertising',
        amount: amount,
        currency: currency,
        origAmount: amount,
        origCurrency: currency,
        baseAmount: baseAmount,
        date: h.date,
        ref: h.num,
        received: false,
        gratuity: true
      });
      added++;
    }
  });

  if (added > 0 || patched > 0) {
    // sort expenses to keep newest first
    s.expenses.sort((a, b) => b.id - a.id);
    renderExpenses();
    updateDash();
    saveState(activeBook);
    if (typeof renderTaxCenter === 'function') renderTaxCenter();
    showToast(`✓ Backfilled ${added} and fixed ${patched} past gratuity expenses`);
  } else {
    showToast('All past gratuities are already accounted for properly');
  }
}


function storeById(id) { return getState().stores.find(s => s.id === id); }

function addStore() {
  if (!validateFields([
    { id: 'ns-name', test: v => v.trim().length > 0, msg: 'Store name is required' },
    { id: 'ns-rate', test: v => { if (v.trim() === '') return true; const n = parseFloat(v); return !isNaN(n) && n >= 0 && n <= 100; }, msg: 'Commission must be between 0 and 100' },
  ])) return;
  const name = $('ns-name').value.trim();
  getState().stores.push({ id: Date.now(), name, contact: $('ns-contact').value.trim(), email: $('ns-email').value.trim(), phone: $('ns-phone').value.trim(), address: $('ns-address').value.trim(), city: $('ns-city').value.trim(), region: $('ns-region').value.trim(), postal: $('ns-postal').value.trim(), country: $('ns-country').value.trim(), website: $('ns-website').value.trim(), terms: $('ns-terms').value.trim(), rate: parseFloat($('ns-rate').value) || 40, notes: $('ns-notes').value.trim(), sent: 0, sold: 0, returned: 0, outstanding: 0, amountOwed: 0 });
  closeM('add-store');['ns-name', 'ns-contact', 'ns-email', 'ns-phone', 'ns-address', 'ns-city', 'ns-region', 'ns-postal', 'ns-country', 'ns-website', 'ns-terms', 'ns-notes'].forEach(id => $(id).value = ''); $('ns-rate').value = '40'; renderStores(); updateDash(); saveState(activeBook); showToast('✓ Store added');
}
function renderStores() {
  const s = getState(), el = $('stores-list'), book = getBook(), cur = book.currency;
  if (!s.stores.length) { el.innerHTML = '<div class="empty-state"><div class="e-icon">🏪</div>No stores yet. Add your first consignment account.<div style="margin-top:12px;"><button class="btn gold" onclick="openM(\'add-store\')">+ Add store</button></div></div>'; return; }
  el.innerHTML = s.stores.map(st => {
    const sp = st.outstanding === 0 && st.sent > 0 ? '<span class="pill gray">Settled</span>' : st.amountOwed > 0 ? '<span class="pill amber">Payment due</span>' : '<span class="pill green">Active</span>';

    // ── #3: Double-entry ledger balance check ───────────────────────────────
    const ledger = s.ledger || [];
    // ⚡ Bolt Optimization: Calculate double-entry ledger balances in a single pass to eliminate intermediate arrays and multiple loop overhead
    let ledgerSent = 0, ledgerSold = 0, ledgerReturned = 0;
    for (const e of ledger) {
      if (e.storeId === st.id && !e.voided) {
        if (e.type === 'Shipment') ledgerSent += e.qty || 0;
        else if (e.type === 'Sale') ledgerSold += e.qty || 0;
        else if (e.type === 'Return') ledgerReturned += e.qty || 0;
      }
    }
    const calculatedOutstanding = ledgerSent - ledgerSold - ledgerReturned;
    const isUnbalanced = (ledgerSent > 0 || st.sent > 0) && (
      st.sent !== ledgerSent ||
      st.sold !== ledgerSold ||
      st.outstanding !== calculatedOutstanding
    );
    const unbalancedBadge = isUnbalanced
      ? `<span title="Ledger mismatch: cached outstanding=${st.outstanding}, calculated=${calculatedOutstanding}" style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#fff;background:#c0392b;border-radius:6px;padding:3px 8px;margin-left:8px;cursor:help;">⚠ Unbalanced</span>`
      : '';
    const outstandingCell = `<div class="sk-v ${st.outstanding > 0 ? 'warn' : ''}" style="display:flex;align-items:center;gap:4px;">${st.outstanding}${unbalancedBadge}</div>`;

    return `<div class="store-card"><div class="store-head"><div><div class="store-name">${escapeHtml(st.name)}</div><div class="store-meta">${[st.city, st.contact, st.email].filter(Boolean).map(escapeHtml).join(' · ')} · ${st.rate}% commission</div></div>${sp}</div><div class="store-kpis"><div class="sk"><div class="sk-l">Sent</div><div class="sk-v">${st.sent}</div></div><div class="sk"><div class="sk-l">Sold</div><div class="sk-v">${st.sold}</div></div><div class="sk"><div class="sk-l">Outstanding</div>${outstandingCell}</div><div class="sk"><div class="sk-l">Owed</div><div class="sk-v ${st.amountOwed > 0 ? 'warn' : ''}">${st.amountOwed > 0 ? fmt(st.amountOwed, cur) : '—'}</div></div></div><div class="store-actions"><button class="btn sm gold" onclick="openSend(${escapeHtml(JSON.stringify(st.id))})">Send books</button><button class="btn sm ink" onclick="openSale(${escapeHtml(JSON.stringify(st.id))})" ${!st.outstanding ? 'disabled' : ''}>Record sale</button><button class="btn sm" onclick="openRet(${escapeHtml(JSON.stringify(st.id))})" ${!st.outstanding ? 'disabled' : ''}>Return</button><button class="btn sm" onclick="openEditStore(${escapeHtml(JSON.stringify(st.id))})">Edit</button><button class="btn sm danger-btn" onclick="removeStore(${escapeHtml(JSON.stringify(st.id))})">Remove</button></div></div>`;
  }).join('');
}
async function removeStore(id) {
  if (!(await confirmDialog('Remove this store?', { okLabel: 'Remove', danger: true }))) return;
  getState().stores = getState().stores.filter(s => s.id !== id);
  renderStores(); updateDash(); saveState(activeBook);
}
function openEditStore(id) { activeId = id; const st = storeById(id); if (!st) return; $('es-name').value = st.name; $('es-contact').value = st.contact || ''; $('es-email').value = st.email || ''; $('es-phone').value = st.phone || ''; $('es-address').value = st.address || ''; $('es-city').value = st.city || ''; $('es-region').value = st.region || ''; $('es-postal').value = st.postal || ''; $('es-country').value = st.country || ''; $('es-website').value = st.website || ''; $('es-terms').value = st.terms || ''; $('es-rate').value = st.rate; $('es-notes').value = st.notes || ''; openM('edit-store'); }
function confirmEditStore() {
  const st = storeById(activeId); if (!st) return;
  if (!validateFields([
    { id: 'es-name', test: v => v.trim().length > 0, msg: 'Store name is required' },
    { id: 'es-rate', test: v => { if (v.trim() === '') return true; const n = parseFloat(v); return !isNaN(n) && n >= 0 && n <= 100; }, msg: 'Commission must be between 0 and 100' },
  ])) return;
  const name = $('es-name').value.trim();
  st.name = name; st.contact = $('es-contact').value.trim(); st.email = $('es-email').value.trim(); st.phone = $('es-phone').value.trim(); st.address = $('es-address').value.trim(); st.city = $('es-city').value.trim(); st.region = $('es-region').value.trim(); st.postal = $('es-postal').value.trim(); st.country = $('es-country').value.trim(); st.website = $('es-website').value.trim(); st.terms = $('es-terms').value.trim(); st.rate = parseFloat($('es-rate').value) || st.rate; st.notes = $('es-notes').value.trim();
  closeM('edit-store'); renderStores(); updateDash(); saveState(activeBook); showToast('✓ Store updated');
}
function openSend(id) { activeId = id; const st = storeById(id); $('send-sname').textContent = st.name; $('send-rate').value = st.rate; openM('send-books'); }
function confirmSend() {
  const s = getState(), book = getBook(), st = storeById(activeId);
  if (!validateFields([
    { id: 'send-qty', test: v => (parseInt(v) || 0) > 0, msg: 'Enter a quantity greater than 0' },
    { id: 'send-qty', test: v => (parseInt(v) || 0) <= s.stock, msg: `Only ${s.stock} in stock` },
    { id: 'send-rate', test: v => { const n = parseFloat(v); return !isNaN(n) && n >= 0 && n <= 100; }, msg: 'Commission must be between 0 and 100' },
  ])) return;
  const qty = parseInt($('send-qty').value) || 0, date = $('send-date').value, rate = parseFloat($('send-rate').value) || st.rate, notes = $('send-notes').value.trim();
  s.stock -= qty; st.sent += qty; st.outstanding += qty;
  const sheetsId = makeEventId();
  s.ledger.push({ id: Date.now(), storeId: st.id, storeName: st.name, type: 'Shipment', date, qty, rate, amountDue: 0, paid: 'n/a', notes, status: 'sent', sheetsId });
  closeM('send-books'); renderStores(); renderLedger(); updateDash(); saveState(activeBook);
  syncToSheets({ type: 'consignment', book: book.title, date, store: st.name, event: 'Shipment', qty, rate, amountDue: 0, notes, status: 'sent', sheetsId, currency: getBookCurrencyCode(book) });
  showToast(`✓ ${qty} books sent to ${st.name}`);
}

// ── BULK SEND (ship to several stores in one pass) ──────────────────────
function openBulkSend() {
  const s = getState();
  if (!s.stores.length) { showToast('Add a store first', 'warn'); return; }
  $('bulk-send-list').innerHTML = s.stores.map(st => `<label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
    <input type="checkbox" class="bulk-send-check" data-sid="${st.id}" onchange="bulkCheckChanged('${st.id}')" style="width:auto;margin:0;">
    <span style="flex:1;min-width:0;"><span style="font-weight:600;">${escapeHtml(st.name)}</span>${st.city ? `<span style="color:var(--text3);font-size:12px;"> · ${escapeHtml(st.city)}</span>` : ''}<br><span style="color:var(--text3);font-size:11px;">${st.rate}% commission · ${st.outstanding} outstanding</span></span>
    <input type="number" class="bulk-send-qty" data-sid="${st.id}" min="0" value="0" style="width:64px;" oninput="bulkQtyChanged('${st.id}')">
  </label>`).join('');
  $('bulk-qty').value = '10';
  $('bulk-date').value = today();
  $('bulk-rate').value = '';
  $('bulk-notes').value = '';
  $('bulk-send-stock').textContent = s.stock;
  updateBulkSendSummary();
  openM('bulk-send');
}
function bulkRowEls(sid) {
  return {
    cb: document.querySelector(`#bulk-send-list .bulk-send-check[data-sid="${sid}"]`),
    qty: document.querySelector(`#bulk-send-list .bulk-send-qty[data-sid="${sid}"]`),
  };
}
function bulkApplyQty() {
  const q = parseInt($('bulk-qty').value) || 0;
  getState().stores.forEach(st => {
    const { cb, qty } = bulkRowEls(st.id);
    if (cb) cb.checked = q > 0;
    if (qty) qty.value = q;
  });
  updateBulkSendSummary();
}
function bulkQtyChanged(sid) {
  const { cb, qty } = bulkRowEls(sid);
  const q = qty ? parseInt(qty.value) || 0 : 0;
  if (cb) cb.checked = q > 0;
  updateBulkSendSummary();
}
function bulkCheckChanged(sid) {
  const { cb, qty } = bulkRowEls(sid);
  if (cb && qty) {
    if (cb.checked && (parseInt(qty.value) || 0) <= 0) qty.value = parseInt($('bulk-qty').value) || 1;
    else if (!cb.checked) qty.value = 0;
  }
  updateBulkSendSummary();
}
function updateBulkSendSummary() {
  let total = 0, count = 0;
  getState().stores.forEach(st => {
    const { cb, qty } = bulkRowEls(st.id);
    const q = qty ? parseInt(qty.value) || 0 : 0;
    if (cb && cb.checked && q > 0) { total += q; count++; }
  });
  const stock = getState().stock;
  $('bulk-send-total').textContent = total;
  $('bulk-send-count').textContent = count;
  const totEl = $('bulk-send-total');
  if (totEl) totEl.style.color = total > stock ? '#c0392b' : '';
}
function confirmBulkSend() {
  const s = getState(), book = getBook();
  const rateRaw = $('bulk-rate').value.trim();
  const overrideRate = rateRaw === '' ? null : parseFloat(rateRaw);
  if (overrideRate !== null && (isNaN(overrideRate) || overrideRate < 0 || overrideRate > 100)) { showToast('Commission override must be between 0 and 100', 'err'); return; }
  const date = $('bulk-date').value || today();
  const notes = $('bulk-notes').value.trim();
  const picks = [];
  s.stores.forEach(st => {
    const { cb, qty } = bulkRowEls(st.id);
    const q = qty ? parseInt(qty.value) || 0 : 0;
    if (cb && cb.checked && q > 0) picks.push({ st, qty: q });
  });
  if (!picks.length) { showToast('Select at least one store and a quantity', 'warn'); return; }
  const totalQty = picks.reduce((a, p) => a + p.qty, 0);
  if (totalQty > s.stock) { showToast(`Only ${s.stock} in stock — you selected ${totalQty}`, 'err'); return; }
  picks.forEach((p, i) => {
    const st = p.st, qty = p.qty, rate = overrideRate !== null ? overrideRate : st.rate;
    s.stock -= qty; st.sent += qty; st.outstanding += qty;
    const sheetsId = makeEventId();
    s.ledger.push({ id: Date.now() + i, storeId: st.id, storeName: st.name, type: 'Shipment', date, qty, rate, amountDue: 0, paid: 'n/a', notes, status: 'sent', sheetsId });
    syncToSheets({ type: 'consignment', book: book.title, date, store: st.name, event: 'Shipment', qty, rate, amountDue: 0, notes, status: 'sent', sheetsId, currency: getBookCurrencyCode(book) });
  });
  closeM('bulk-send'); renderStores(); renderLedger(); updateDash(); saveState(activeBook);
  showToast(`✓ Sent ${totalQty} book${totalQty > 1 ? 's' : ''} to ${picks.length} store${picks.length > 1 ? 's' : ''}`);
}
function openSale(id) {
  activeId = id; const book = getBook(); $('sale-sym').textContent = book.currency; $('sale-price').value = book.listPrice.toFixed(2); $('sale-sname').textContent = storeById(id).name;
  // The "draft an invoice after saving" shortcut only makes sense where the
  // Invoices panel is available (publisher, single-book view).
  const invRow = $('sale-invoice-row');
  if (invRow) invRow.style.display = invoicesVisibleHere() ? '' : 'none';
  if ($('sale-makeinvoice')) $('sale-makeinvoice').checked = false;
  openM('record-sale');
}
function confirmSale() {
  const s = getState(), book = getBook(), cur = book.currency, st = storeById(activeId);
  if (!validateFields([
    { id: 'sale-qty', test: v => (parseInt(v) || 0) > 0, msg: 'Enter a quantity greater than 0' },
    { id: 'sale-qty', test: v => (parseInt(v) || 0) <= st.outstanding, msg: `Only ${st.outstanding} outstanding` },
    { id: 'sale-price', test: v => (parseFloat(v) || 0) > 0, msg: 'Enter a price greater than 0' },
  ])) return;
  const qty = parseInt($('sale-qty').value) || 0, date = $('sale-date').value, price = parseFloat($('sale-price').value) || book.listPrice, paid = $('sale-paid').value, notes = $('sale-notes').value.trim();
  // Capture before closeM clears modal state: open a prefilled invoice afterward?
  const makeInvoice = invoicesVisibleHere() && $('sale-makeinvoice') && $('sale-makeinvoice').checked;
  const invoiceStoreId = st.id;
  const gross = qty * price, pub = gross * (1 - st.rate / 100);
  st.sold += qty; st.outstanding -= qty; st.amountOwed += paid === 'pending' ? pub : 0;
  s.sold += qty; s.revenue += pub;
  if (!s.chStats['Consignment']) s.chStats['Consignment'] = { txns: 0, units: 0, revenue: 0 };
  s.chStats['Consignment'].txns++; s.chStats['Consignment'].units += qty; s.chStats['Consignment'].revenue += pub;
  const num = 'CON-' + st.name.replace(/\s+/g, '').slice(0, 5).toUpperCase() + '-' + Date.now().toString().slice(-4);
  // Share one sheetsId between the hist mirror and the ledger entry so they
  // map to the SAME row in Sheets — editing or voiding either updates the
  // single underlying row instead of producing duplicates.
  const sheetsId = makeEventId();
  s.hist.unshift({ num, chan: 'Consignment', qty, price: pub / qty, after: s.stock, notes: st.name, date, sheetsId, consignmentLink: true, cur: bookCurrencyCode(book) });
  s.ledger.push({ id: Date.now(), storeId: st.id, storeName: st.name, type: 'Sale', date, qty, rate: st.rate, amountDue: pub, paid, notes, status: paid, sheetsId, cur: bookCurrencyCode(book) });
  recomputeAfters(s, book);
  closeM('record-sale'); renderStores(); renderLedger(); renderHist(); updateDash(); saveState(activeBook);
  syncToSheets({ type: 'consignment', book: book.title, date, store: st.name, event: 'Sale', qty, rate: st.rate, amountDue: pub, notes, status: paid, sheetsId, currency: getBookCurrencyCode(book) });
  showToast(`✓ Sale recorded — ${fmt(pub, cur)} due to you`);
  // Hand straight off to the invoice editor, prefilled from this store's
  // unpaid sales (which now includes the one just recorded).
  if (makeInvoice) setTimeout(() => openCreateInvoice(invoiceStoreId), 160);
}
function openRet(id) { activeId = id; $('ret-sname').textContent = storeById(id).name; openM('return'); }
function confirmReturn() {
  const s = getState(), book = getBook(), st = storeById(activeId);
  if (!validateFields([
    { id: 'ret-qty', test: v => (parseInt(v) || 0) > 0, msg: 'Enter a quantity greater than 0' },
    { id: 'ret-qty', test: v => (parseInt(v) || 0) <= st.outstanding, msg: `Only ${st.outstanding} outstanding` },
  ])) return;
  const qty = parseInt($('ret-qty').value) || 0, date = $('ret-date').value, cond = $('ret-cond').value, notes = $('ret-notes').value.trim();
  st.returned += qty; st.outstanding -= qty; const good = cond.startsWith('Good'); if (good) s.stock += qty;
  const sheetsId = makeEventId();
  s.ledger.push({ id: Date.now(), storeId: st.id, storeName: st.name, type: 'Return', date, qty, rate: st.rate, amountDue: 0, paid: 'n/a', notes: (notes ? notes + ' · ' : '') + cond, status: good ? 'restocked' : 'written off', sheetsId });
  closeM('return'); renderStores(); renderLedger(); updateDash(); saveState(activeBook);
  syncToSheets({ type: 'consignment', book: book.title, date, store: st.name, event: 'Return', qty, rate: st.rate, amountDue: 0, notes: cond, status: good ? 'restocked' : 'written off', sheetsId, currency: getBookCurrencyCode(book) });
  showToast(good ? `✓ ${qty} books returned to stock` : `✓ ${qty} books written off`);
}
// ── Invoice ↔ Ledger ↔ History consistency helpers ───────────────────────
// Single source of truth for keeping the three views cross-referenced. All
// operate on an in-book state `s = getState()`, so multi-book is automatic.
// invoiceId/paidState/ledgerDivergedAt stay LOCAL-ONLY. invoiceNum is the one
// exception: it is mirrored to the Google Sheet's "Invoice" column on every
// consignment row sync (see consignmentSyncPayload) so the sheet tracks renames.
// histMirrorForLedger / stampLedgerInvoiceLink / reconcileConsignmentInvoiceLinks
// / consignmentSyncPayload are pure and live in ./lib/consignment.js (tested
// there); they're imported at the top of this module.

// Canonical "mark this sale paid": guards pending/non-voided, reduces the store's
// owed, flips ledger + hist mirror state. Returns true if it actually changed.
function settleLedgerSalePaid(s, e) {
  if (!e || e.status !== 'pending' || e.voided) return false;
  const st = (s.stores || []).find(x => x.id === e.storeId);
  if (st) st.amountOwed = Math.max(0, (st.amountOwed || 0) - (e.amountDue || 0));
  e.status = 'paid'; e.paid = 'paid';
  const h = histMirrorForLedger(s, e);
  if (h) h.paidState = 'paid';
  return true;
}

// Decision #1: when the last unpaid linked sale of an invoice becomes paid via
// the ledger, auto-flip the invoice to PAID. Only flips draft/sent invoices; skips
// cancelled/already-paid and invoices with zero resolvable (non-voided) sales.
function maybeAutoPayInvoiceForLedger(s, e) {
  if (!e || !e.invoiceId) return;
  const inv = (s.invoices || []).find(i => i.id === e.invoiceId);
  if (!inv || (inv.status !== 'draft' && inv.status !== 'sent')) return;
  // Resolve the invoice's linked, non-voided ledger sales.
  const linked = (inv.items || [])
    .map(it => it._ledgerId ? (s.ledger || []).find(x => x.id === it._ledgerId) : null)
    .filter(x => x && !x.voided);
  if (!linked.length) return;                         // nothing resolvable → skip
  if (linked.some(x => x.status !== 'paid')) return;  // not all paid yet → wait
  inv.status = 'paid'; inv.paidAt = Date.now(); inv.paidMethod = 'Ledger';
}

// A small clickable badge linking a ledger/history row back to its invoice; '' when
// unlinked. Reused by the ledger and history renderers. viewInvoice is global.
function invoiceBadgeHTML(invoiceId, invoiceNum) {
  if (!invoiceId || !invoiceNum) return '';
  return `<button class="pill gray" style="font-size:10px;cursor:pointer;margin-left:6px;" onclick="viewInvoice('${invoiceId}')">🧾 ${escapeHtml(invoiceNum)}</button>`;
}

function markPaid(lid) {
  const s = getState(), book = getBook(), e = s.ledger.find(x => x.id === lid); if (!e) return;
  // Canonical settle (reduces owed, flips ledger + hist mirror); then auto-flip
  // the invoice to paid if this was its last unpaid linked sale (decision #1).
  settleLedgerSalePaid(s, e);
  maybeAutoPayInvoiceForLedger(s, e);
  if (sheetsUrl && e.sheetsId) {
    try { syncToSheets(consignmentSyncPayload(book, e)); } catch (err) { console.error(err); }
  }
  renderLedger(); renderStores(); renderInvoices(); renderHist(); updateDash(); saveState(activeBook);
  showToast(`✓ Payment of ${fmt(e.amountDue, book.currency)} marked as received`);
}

async function markHistoryConsignmentPaid(num) {
  const s = getState();
  const book = getBook();
  const h = s.hist.find(x => x.num === num);
  if (!h) return;
  let e = null;
  if (h.sheetsId) {
    e = s.ledger.find(x => x.type === 'Sale' && x.sheetsId === h.sheetsId);
  }
  if (!e) {
    e = s.ledger.find(x =>
      x.type === 'Sale' &&
      x.storeName === h.notes &&
      x.date === h.date &&
      (x.qty || 0) === (h.qty || 0) &&
      Math.abs((x.amountDue || 0) - (h.price * h.qty)) < 0.01
    );
  }
  if (!e) {
    showToast('Could not find corresponding consignment entry in ledger', 'err');
    return;
  }
  if (!(await confirmDialog(`Mark consignment sale "${num}" (${fmt(e.amountDue, book.currency)}) as paid?`, { title: 'Mark Consignment Paid', okLabel: 'Mark paid' }))) return;
  markPaid(e.id);
}
function renderLedger() {
  const s = getState(), book = getBook(), cur = book.currency, b = $('ledger-body');
  const ledgerBookCode = bookCurrencyCode(book);
  // Same rule as the History table: an amount renders in the currency its row
  // was recorded in, so a pre-change entry can't masquerade as the new one.
  const ledgerCur = e => (e.cur && normalizeCurrencyCode(e.cur, ledgerBookCode) !== ledgerBookCode) ? getSym(e.cur) : cur;
  if (!s.ledger.length) { b.innerHTML = '<tr><td colspan="8"><div class="empty-state" style="padding:1rem;">No entries.</div></td></tr>'; return; }
  const pill = e => {
    if (e.voided) return '<span class="void-badge">Void</span>';
    if (e.type === 'Shipment') return '<span class="pill blue">Sent</span>';
    if (e.status === 'paid') return '<span class="pill green">Paid</span>';
    if (e.status === 'pending') return '<span class="pill amber">Pending</span>';
    if (e.status === 'restocked') return '<span class="pill green">Restocked</span>';
    if (e.status === 'written off') return '<span class="pill red">Written off</span>';
    return `<span class="pill gray">${e.status}</span>`;
  };
  // Map ledger indices so edit buttons can reference them correctly (ledger is displayed reversed)
  const indexed = s.ledger.map((e, i) => ({ e, i }));
  b.innerHTML = [...indexed].reverse().map(({ e, i }) => {
    const voided = e.voided ? ' voided' : '';
    const editBtn = `<button class="edit-btn" onclick="openEditLedger(${i})" title="Edit entry" aria-label="Edit entry">✎</button>`;
    // Cross-link Sale rows back to the invoice that bills them (absent id → '').
    const invBadge = e.type === 'Sale' ? invoiceBadgeHTML(e.invoiceId, e.invoiceNum) : '';
    return `<tr class="${voided}"><td style="font-size:12px;color:var(--text3);">${fmtD(e.date)}</td><td style="font-weight:600;">${escapeHtml(e.storeName)}${editBtn}</td><td>${escapeHtml(e.type)}</td><td class="r">${e.qty}</td><td class="r">${e.type === 'Sale' ? e.rate + '%' : '—'}</td><td class="r" style="font-weight:600;">${e.amountDue > 0 ? fmt(e.amountDue, ledgerCur(e)) : '—'}</td><td style="font-size:12px;color:var(--text3);">${escapeHtml(e.notes) || '—'}</td><td>${pill(e)}${e.status === 'pending' && !e.voided ? ` <button class="btn sm" style="margin-left:6px;" onclick="markPaid(${e.id})">Mark paid</button>` : ''}${invBadge}</td></tr>`;
  }).join('');
}

// Export the current book's consignment ledger (shipments, sales, returns) as a
// CSV for accounting — independent of the full Google Sheets sync so it works
// offline and without a connected sheet.
function exportConsignmentLedgerCSV() {
  const s = getState(), book = getBook(), rows = s.ledger || [];
  if (!rows.length) { showToast('No ledger entries to export', 'warn'); return; }
  // Refresh each Sale's invoice number from its live invoice before exporting so
  // accountants reconciling the CSV see which invoice billed each sale.
  reconcileConsignmentInvoiceLinks(s);
  const curCode = getBookCurrencyCode(book);
  const header = ['Date', 'Store', 'Type', 'Qty', 'Commission %', 'Due to you', 'Currency', 'Status', 'Voided', 'Invoice', 'Notes'];
  // Chronological order (the on-screen table shows newest first; a CSV reads
  // better oldest→newest for a running statement).
  const sorted = [...rows].sort((a, b) => { const da = a.date || '', db = b.date || ''; return da < db ? -1 : da > db ? 1 : 0; });
  const out = [header];
  for (const e of sorted) {
    out.push([
      e.date || '',
      e.storeName || '',
      e.type || '',
      e.qty ?? '',
      e.type === 'Sale' ? (e.rate ?? '') : '',
      e.amountDue ? Number(e.amountDue).toFixed(2) : '',
      curCode,
      e.voided ? 'VOID' : (e.status || ''),
      e.voided ? 'YES' : '',
      e.invoiceNum || '',
      e.notes || ''
    ]);
  }
  const slug = String(book.id || book.title || 'book').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  downloadCsv(toCsv(out), `consignment-ledger-${slug}-${today()}.csv`);
  showToast('✓ Consignment ledger exported');
}

// ═══════════════════════════════════════════════════════════════════════
//  INVOICES (publisher-only, lives inside Consignment tab)
// ═══════════════════════════════════════════════════════════════════════
const INVOICE_SETTINGS_KEY = 'lm-invoice-settings';
function getInvoiceSettings() {
  try { return JSON.parse(localStorage.getItem(INVOICE_SETTINGS_KEY) || '{}'); }
  catch (e) { return {}; }
}
function saveInvoiceSettingsObj(o) { localStorage.setItem(INVOICE_SETTINGS_KEY, JSON.stringify(o || {})); }

function openInvoiceTemplateSettings() {
  const s = getInvoiceSettings();
  $('ivs-name').value = s.name || 'Lyricalmyrical Books';
  $('ivs-email').value = s.email || '';
  $('ivs-addr').value = s.addr || '';
  $('ivs-vat').value = s.vat || '';
  $('ivs-web').value = s.web || '';
  $('ivs-terms').value = s.terms || 'Net 30. Payment via Stripe, PayPal, or bank transfer.';
  $('ivs-footer').value = s.footer || 'Thank you for stocking our books.';
  $('ivs-bank').value = s.bank || '';
  if ($('ivs-stripe-key')) $('ivs-stripe-key').value = s.stripeKey || '';
  if ($('ivs-stripe-auto')) $('ivs-stripe-auto').checked = s.stripeAuto !== false; // default ON
  if ($('ivs-stripe-test')) $('ivs-stripe-test').checked = !!s.stripeTest;
  openM('invoice-settings');
}
function saveInvoiceSettings() {
  saveInvoiceSettingsObj({
    name: $('ivs-name').value.trim(),
    email: $('ivs-email').value.trim(),
    addr: $('ivs-addr').value.trim(),
    vat: $('ivs-vat').value.trim(),
    web: $('ivs-web').value.trim(),
    terms: $('ivs-terms').value.trim(),
    footer: $('ivs-footer').value.trim(),
    bank: $('ivs-bank').value.trim(),
    stripeKey: $('ivs-stripe-key') ? $('ivs-stripe-key').value.trim() : '',
    stripeAuto: $('ivs-stripe-auto') ? !!$('ivs-stripe-auto').checked : true,
    stripeTest: $('ivs-stripe-test') ? !!$('ivs-stripe-test').checked : false,
  });
  closeM('invoice-settings');
  showToast('✓ Invoice settings saved');
}

// ── STRIPE DYNAMIC PAYMENT LINK (exact-amount Checkout per invoice) ─────
const _STRIPE_ZERO_DECIMAL_INV = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);

async function createStripePaymentLinkForInvoice(invoice) {
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
  priceParams.set('metadata[book_id]', book.id || '');

  const priceRes = await fetch('https://api.stripe.com/v1/prices', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: priceParams.toString(),
  });
  if (!priceRes.ok) {
    const err = await priceRes.json().catch(() => ({}));
    throw new Error('Stripe price: ' + (err.error?.message || ('HTTP ' + priceRes.status)));
  }
  const price = await priceRes.json();

  // 2. Create the Payment Link
  const linkParams = new URLSearchParams();
  linkParams.set('line_items[0][price]', price.id);
  linkParams.set('line_items[0][quantity]', '1');
  linkParams.set('metadata[invoice_num]', invoice.num || '');
  linkParams.set('metadata[store_id]', String(invoice.storeId || ''));
  linkParams.set('metadata[store_name]', invoice.storeName || '');
  linkParams.set('metadata[book_id]', book.id || '');
  linkParams.set('payment_intent_data[description]', description.slice(0, 350));
  linkParams.set('payment_intent_data[metadata][invoice_num]', invoice.num || '');
  linkParams.set('payment_intent_data[metadata][store_name]', invoice.storeName || '');
  linkParams.set('payment_intent_data[statement_descriptor_suffix]', (invoice.num || 'Invoice').replace(/[^A-Za-z0-9\- ]/g, '').slice(0, 22));
  linkParams.set('allow_promotion_codes', 'false');
  linkParams.set('billing_address_collection', 'auto');

  const linkRes = await fetch('https://api.stripe.com/v1/payment_links', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: linkParams.toString(),
  });
  if (!linkRes.ok) {
    const err = await linkRes.json().catch(() => ({}));
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

async function deactivateStripePaymentLink(paymentLinkId) {
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
  } catch (e) { /* best effort */ }
}

function invoicesVisibleHere() {
  // Publisher only, single-book view only (invoice numbering is per-book)
  return !!window.IS_PUBLISHER && !isAuthor() && activeBook && activeBook !== 'all';
}

function renderInvoices() {
  const section = $('invoices-section');
  if (!section) return;
  if (!invoicesVisibleHere()) { section.style.display = 'none'; return; }
  section.style.display = '';

  const s = getState(), book = getBook(), cur = book.currency, list = $('invoices-list'), summary = $('inv-summary');
  // ⚡ Bolt Optimization: Use string comparison instead of localeCompare for sorting ISO "YYYY-MM-DD" dates
  const invs = (s.invoices || []).slice().sort((a, b) => { const dA = a.date || ''; const dB = b.date || ''; return dA > dB ? -1 : (dA < dB ? 1 : ((b.createdAt || 0) - (a.createdAt || 0))); });

  // Mark overdue automatically (visual only, not persisted)
  const todayStr = today();
  for (const inv of invs) {
    if (inv.status === 'sent' && inv.dueDate && inv.dueDate < todayStr) inv._overdue = true;
  }

  // Summary line
  // ⚡ Bolt Optimization: Calculate outstanding, paid, and drafts in a single pass instead of iterating over the `invs` array three times.
  let outstanding = 0, paid = 0, drafts = 0;
  for (const i of invs) {
    if (i.status === 'sent') outstanding += (i.total || 0);
    else if (i.status === 'paid') paid += (i.total || 0);
    else if (i.status === 'draft') drafts++;
  }
  summary.textContent = `${invs.length} total · ${fmt(outstanding, cur)} outstanding · ${fmt(paid, cur)} collected${drafts ? ` · ${drafts} draft${drafts > 1 ? 's' : ''}` : ''}`;

  if (!invs.length) {
    list.innerHTML = '<div class="empty-state"><div class="e-icon">📄</div>No invoices yet. Click <strong>+ New invoice</strong> to bill a consignment store.<div style="margin-top:12px;"><button class="btn gold" onclick="openCreateInvoice()">+ New invoice</button></div></div>';
    return;
  }

  list.innerHTML = invs.map(inv => {
    const statusLabel = inv._overdue ? 'OVERDUE' : (inv.status || 'draft').toUpperCase();
    const statusCls = inv._overdue ? 'overdue' : (inv.status || 'draft');
    const due = inv.dueDate ? fmtD(inv.dueDate) : '—';
    const stripeChip = isDynamicStripeLink(inv)
      ? `<span title="Dynamic Stripe Checkout · exact amount" style="display:inline-block;margin-left:6px;background:#0e0c0a;color:#f0c060;font-size:8px;font-weight:700;letter-spacing:.16em;padding:2px 6px;border-radius:99px;">💳 STRIPE</span>`
      : '';
    return `<div class="invoice-card">
      <div class="inv-c-num">${escapeHtml(inv.num)}${stripeChip}</div>
      <div class="inv-c-store">${escapeHtml(inv.storeName) || '—'}<div class="inv-c-store-meta">${[inv.storeEmail, inv.storeCity].filter(Boolean).map(escapeHtml).join(' · ') || '—'}</div></div>
      <div class="inv-c-cell">Issued<strong>${fmtD(inv.date)}</strong></div>
      <div class="inv-c-cell">Due<strong>${due}</strong></div>
      <div class="inv-c-cell amt">Total<strong>${fmt(inv.total || 0, cur)}</strong></div>
      <div class="inv-c-actions" style="flex-direction:column;align-items:stretch;gap:6px;">
        <span class="inv-status ${statusCls}" style="display:inline-block;font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;padding:4px 10px;border-radius:99px;text-align:center;
          background:${statusCls === 'paid' ? '#e0f5ea' : statusCls === 'sent' ? '#ebf2ff' : statusCls === 'overdue' ? '#fde6e0' : statusCls === 'cancelled' ? '#eee' : '#e9e6e0'};
          color:${statusCls === 'paid' ? '#1d7a4a' : statusCls === 'sent' ? '#1d4cb3' : statusCls === 'overdue' ? '#a13a1b' : statusCls === 'cancelled' ? '#5a544c' : '#6b665e'};">${statusLabel}</span>
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

function openCreateInvoice(storeId, editingId) {
  const s = getState(), book = getBook();
  // Populate store dropdown
  const sel = $('inv-store');
  sel.innerHTML = '<option value="">— Select store —</option>' + (s.stores || []).map(st => `<option value="${st.id}">${escapeHtml(st.name)}${st.city ? ' · ' + escapeHtml(st.city) : ''}</option>`).join('');

  // set currency dropdown — default to book currency
  const bookCurCode = getBookCurrencyCode(book);
  if ($('inv-currency')) $('inv-currency').value = bookCurCode;
  $('inv-discount-sym').textContent = getSym(bookCurCode);

  if (editingId) {
    const inv = (s.invoices || []).find(i => i.id === editingId);
    if (!inv) { showToast('Invoice not found', 'err'); return; }
    invoiceCtx = { editingId, items: JSON.parse(JSON.stringify(inv.items || [])) };
    $('inv-edit-title').textContent = `Edit ${inv.num}`;
    sel.value = inv.storeId || '';
    $('inv-num').value = inv.num || '';
    $('inv-date').value = inv.date || today();
    $('inv-due').value = inv.dueDate || '';
    const distType = inv.discountType || 'flat';
    $('inv-discount-type').value = distType;
    if (distType === 'percent') {
      $('inv-discount-percent').value = inv.discountRate || 0;
      $('inv-discount').value = 0;
      $('inv-discount-flat-wrap').style.display = 'none';
      $('inv-discount-percent-wrap').style.display = 'flex';
      $('inv-discount-label-text').textContent = 'Discount (percent, optional)';
    } else {
      $('inv-discount').value = inv.discount || 0;
      $('inv-discount-percent').value = 0;
      $('inv-discount-flat-wrap').style.display = 'flex';
      $('inv-discount-percent-wrap').style.display = 'none';
      $('inv-discount-label-text').textContent = 'Discount (flat, optional)';
    }
    $('inv-tax').value = inv.taxRate || 0;
    $('inv-paylink').value = inv.paymentLink || '';
    $('inv-notes').value = inv.notes || '';
    $('inv-terms').value = inv.terms || '';
    $('inv-delete-btn').style.display = '';
    // restore invoice's own currency
    const invCurCode = normalizeCurrencyCode(inv.currency || bookCurCode, bookCurCode);
    if ($('inv-currency')) $('inv-currency').value = invCurCode;
    $('inv-discount-sym').textContent = getSym(invCurCode);
  } else {
    invoiceCtx = { editingId: null, items: [] };
    $('inv-edit-title').textContent = 'New invoice';
    sel.value = storeId ? String(storeId) : '';
    $('inv-num').value = nextInvoiceNumber();
    $('inv-date').value = today();
    // default due date = 30 days from today
    const d = new Date(); d.setDate(d.getDate() + 30);
    $('inv-due').value = d.toISOString().split('T')[0];
    $('inv-discount-type').value = 'flat';
    $('inv-discount').value = 0;
    $('inv-discount-percent').value = 0;
    $('inv-discount-flat-wrap').style.display = 'flex';
    $('inv-discount-percent-wrap').style.display = 'none';
    $('inv-discount-label-text').textContent = 'Discount (flat, optional)';
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

function nextInvoiceNumber() {
  const s = getState(), book = getBook();
  const year = new Date().getFullYear();
  const prefix = (book.id || 'BOOK').slice(0, 6).toUpperCase();
  // ⚡ Bolt Optimization: Loop Fusion
  // Combined .filter() and .reduce() into a single pass to eliminate intermediate array allocations
  let maxSeq = s.invoiceSeq || 0;
  for (const i of (s.invoices || [])) {
    const numStr = i.num || '';
    if (numStr.includes(`-${year}-`)) {
      const mt = /-(\d+)$/.exec(numStr);
      if (mt) {
        maxSeq = Math.max(maxSeq, parseInt(mt[1], 10));
      }
    }
  }
  return `INV-${prefix}-${year}-${String(maxSeq + 1).padStart(3, '0')}`;
}

function onInvoiceStoreChange() {
  // No automatic refill — user might be editing. Just keep selection.
  // ── #9: Autocomplete billing details preview ────────────────────────────
  const storeId = Number($('inv-store').value);
  const preview = $('inv-store-preview');
  if (!preview) return;
  if (!storeId) { preview.style.display = 'none'; preview.innerHTML = ''; return; }
  const st = (getState().stores || []).find(s => s.id === storeId);
  if (!st) { preview.style.display = 'none'; return; }

  // Auto-populate Terms if empty
  const termsEl = $('inv-terms');
  if (termsEl && !termsEl.value.trim() && st.terms) {
    termsEl.value = st.terms;
  }

  // Build preview lines
  const lines = [
    st.contact ? `<strong>Contact:</strong> ${escapeHtml(st.contact)}` : '',
    st.email ? `<strong>Email:</strong> ${escapeHtml(st.email)}` : '',
    st.phone ? `<strong>Phone:</strong> ${escapeHtml(st.phone)}` : '',
    st.address ? `<strong>Address:</strong> ${escapeHtml(st.address)}` : '',
    [st.city, st.region, st.postal].filter(Boolean).length
      ? `<strong>City:</strong> ${escapeHtml([st.city, st.region, st.postal].filter(Boolean).join(', '))}` : '',
    st.country ? `<strong>Country:</strong> ${escapeHtml(st.country)}` : '',
    typeof st.rate === 'number' ? `<strong>Commission rate:</strong> ${st.rate}%` : '',
    st.terms ? `<strong>Default terms:</strong> ${escapeHtml(st.terms)}` : '',
  ].filter(Boolean);

  if (lines.length) {
    preview.innerHTML = lines.join('<br>');
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
}

function getInvoiceCurrency() {
  const sel = $('inv-currency');
  if (sel && sel.value) return sel.value;
  return getBookCurrencyCode(getBook());
}

function onInvoiceCurrencyChange() {
  const code = getInvoiceCurrency();
  $('inv-discount-sym').textContent = getSym(code);
  renderInvoiceItems();
  recalcInvoiceTotals();
}

function addInvoiceItem(description = '', qty = 1, unitPrice = 0) {
  invoiceCtx.items.push({ description, qty, unitPrice });
  renderInvoiceItems();
  recalcInvoiceTotals();
}

function removeInvoiceItem(idx) {
  invoiceCtx.items.splice(idx, 1);
  renderInvoiceItems();
  recalcInvoiceTotals();
}

function updateInvoiceItem(idx, field, value) {
  const it = invoiceCtx.items[idx]; if (!it) return;
  if (field === 'description') it.description = value;
  else it[field] = parseFloat(value) || 0;
  // Re-render only the amount cell for performance
  const amtEl = document.querySelector(`#inv-items-body tr[data-i="${idx}"] .inv-item-amt`);
  if (amtEl) amtEl.textContent = fmt((it.qty || 0) * (it.unitPrice || 0), getSym(getInvoiceCurrency()));
  recalcInvoiceTotals();
}

function renderInvoiceItems() {
  const body = $('inv-items-body'), cur = getSym(getInvoiceCurrency());
  if (!invoiceCtx.items.length) {
    body.innerHTML = `<tr><td colspan="5" style="font-size:12px;color:var(--text3);padding:14px;text-align:center;">No line items. Click <strong>+ Add line</strong>.</td></tr>`;
    return;
  }
  body.innerHTML = invoiceCtx.items.map((it, i) => `<tr class="inv-item-row" data-i="${i}">
    <td><input type="text" value="${escapeHTML(it.description || '')}" placeholder="e.g. ${getBook().title} — consignment sale, Sept 2026" oninput="updateInvoiceItem(${i},'description',this.value)"></td>
    <td><input type="number" min="0" step="1" value="${it.qty || 0}" oninput="updateInvoiceItem(${i},'qty',this.value)"></td>
    <td><input type="number" min="0" step="0.01" value="${(it.unitPrice || 0).toFixed(2)}" oninput="updateInvoiceItem(${i},'unitPrice',this.value)"></td>
    <td class="r"><span class="inv-item-amt">${fmt((it.qty || 0) * (it.unitPrice || 0), cur)}</span></td>
    <td><button type="button" class="inv-item-remove" onclick="removeInvoiceItem(${i})" title="Remove line" aria-label="Remove line">×</button></td>
  </tr>`).join('');
}

export function escapeHTML(s) { return escapeHtml(s); }

function onDiscountTypeChange() {
  const type = $('inv-discount-type').value;
  if (type === 'percent') {
    $('inv-discount-flat-wrap').style.display = 'none';
    $('inv-discount-percent-wrap').style.display = 'flex';
    $('inv-discount-label-text').textContent = 'Discount (percent, optional)';
    // Convert current flat value to percent of subtotal (best effort)
    const subtotal = invoiceCtx.items.reduce((a, it) => a + (parseFloat(it.qty) || 0) * (parseFloat(it.unitPrice) || 0), 0);
    const flatVal = parseFloat($('inv-discount').value) || 0;
    if (subtotal > 0 && flatVal > 0) {
      $('inv-discount-percent').value = parseFloat(((flatVal / subtotal) * 100).toFixed(2));
    } else {
      $('inv-discount-percent').value = 0;
    }
  } else {
    $('inv-discount-flat-wrap').style.display = 'flex';
    $('inv-discount-percent-wrap').style.display = 'none';
    $('inv-discount-label-text').textContent = 'Discount (flat, optional)';
    // Convert current percent value to flat amount (best effort)
    const subtotal = invoiceCtx.items.reduce((a, it) => a + (parseFloat(it.qty) || 0) * (parseFloat(it.unitPrice) || 0), 0);
    const percentVal = parseFloat($('inv-discount-percent').value) || 0;
    if (subtotal > 0 && percentVal > 0) {
      $('inv-discount').value = parseFloat(((subtotal * percentVal) / 100).toFixed(2));
    } else {
      $('inv-discount').value = 0;
    }
  }
  recalcInvoiceTotals();
}

function recalcInvoiceTotals() {
  const cur = getSym(getInvoiceCurrency());
  const subtotal = invoiceCtx.items.reduce((a, it) => a + (parseFloat(it.qty) || 0) * (parseFloat(it.unitPrice) || 0), 0);
  
  const type = $('inv-discount-type') ? $('inv-discount-type').value : 'flat';
  let discount = 0;
  let discountRate = 0;
  if (type === 'percent') {
    discountRate = parseFloat($('inv-discount-percent').value) || 0;
    discount = parseFloat(((subtotal * discountRate) / 100).toFixed(2));
  } else {
    discount = parseFloat($('inv-discount').value) || 0;
  }
  
  const taxRate = parseFloat($('inv-tax').value) || 0;
  const taxable = Math.max(0, subtotal - discount);
  const tax = parseFloat((taxable * (taxRate / 100)).toFixed(2));
  const total = parseFloat((taxable + tax).toFixed(2));
  
  $('inv-sub-val').textContent = fmt(subtotal, cur);
  $('inv-disc-val').textContent = discount ? '−' + fmt(discount, cur) : fmt(0, cur);
  $('inv-tax-val').textContent = fmt(tax, cur);
  $('inv-total-val').textContent = fmt(total, cur);
  
  return { subtotal, discount, discountType: type, discountRate, taxRate, tax, total };
}

function prefillFromPendingSales(forceStoreId) {
  const s = getState(), book = getBook();
  const storeId = forceStoreId ? Number(forceStoreId) : Number($('inv-store').value);
  if (!storeId) { showToast('Pick a store first', 'warn'); return; }
  $('inv-store').value = String(storeId);
  const store = (s.stores || []).find(st => st.id === storeId);
  if (!store) return;
  // pull all unpaid, un-voided Sale ledger entries for that store
  const pending = (s.ledger || []).filter(e => e.storeId === storeId && e.type === 'Sale' && !e.voided && e.status !== 'paid');
  if (!pending.length) {
    showToast('No unpaid consignment sales for this store', 'warn');
    if (!invoiceCtx.items.length) addInvoiceItem();
    return;
  }
  // group by month
  invoiceCtx.items = pending.map(e => ({
    description: `${book.title} — consignment sale${e.date ? ' · ' + fmtD(e.date) : ''} (qty ${e.qty} @ ${(100 - e.rate).toFixed(0)}% net of ${book.currency}${book.listPrice} retail)`,
    qty: e.qty,
    unitPrice: e.qty ? (e.amountDue / e.qty) : 0,
    _ledgerId: e.id,
  }));
  renderInvoiceItems();
  recalcInvoiceTotals();
  showToast(`✓ Imported ${pending.length} pending sale${pending.length > 1 ? 's' : ''}`);
}

function saveInvoice(status) {
  const s = getState(), book = getBook();
  const storeId = Number($('inv-store').value);
  if (!storeId) { showToast('Choose a store to bill', 'err'); return; }
  if (!invoiceCtx.items.length) { showToast('Add at least one line item', 'err'); return; }
  const store = (s.stores || []).find(st => st.id === storeId);
  if (!store) { showToast('Store not found', 'err'); return; }

  const totals = recalcInvoiceTotals();
  if (totals.total <= 0) { showToast('Invoice total must be greater than zero', 'err'); return; }

  const num = ($('inv-num').value || '').trim() || nextInvoiceNumber();
  const date = $('inv-date').value || today();
  const dueDate = $('inv-due').value || '';
  // Use the currency selected in the editor (ISO code → symbol for storage, consistent with book.currency pattern)
  const invoiceCurCode = getInvoiceCurrency();
  const invoiceCurSym = getSym(invoiceCurCode); // e.g. "US$", "€"

  const payload = {
    id: invoiceCtx.editingId || ('inv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)),
    num, storeId, storeName: store.name, storeEmail: store.email || '', storeCity: store.city || '', storeContact: store.contact || '', storePhone: store.phone || '', storeAddress: store.address || '', storeRegion: store.region || '', storePostal: store.postal || '', storeCountry: store.country || '',
    date, dueDate,
    items: invoiceCtx.items.map(it => ({ description: it.description || '', qty: parseFloat(it.qty) || 0, unitPrice: parseFloat(it.unitPrice) || 0, _ledgerId: it._ledgerId || null })),
    subtotal: totals.subtotal,
    discount: totals.discount,
    discountType: totals.discountType || 'flat',
    discountRate: totals.discountRate || 0,
    taxRate: totals.taxRate,
    tax: totals.tax,
    total: totals.total,
    currency: invoiceCurSym,  // stored as symbol (€, CA$, US$…) consistent with book.currency
    currencyCode: invoiceCurCode, // ISO code stored alongside for Stripe
    paymentLink: $('inv-paylink').value.trim() || '',
    notes: $('inv-notes').value.trim(),
    terms: $('inv-terms').value.trim(),
    status,
    createdAt: invoiceCtx.editingId ? (s.invoices.find(i => i.id === invoiceCtx.editingId)?.createdAt || Date.now()) : Date.now(),
    updatedAt: Date.now(),
  };

  let oldStripeLinkId = null;
  // Capture the ledger ids this invoice billed BEFORE we overwrite it, so we can
  // clear back-links that were dropped from the line items during an edit.
  let oldLedgerIds = [];
  if (invoiceCtx.editingId) {
    const idx = s.invoices.findIndex(i => i.id === invoiceCtx.editingId);
    if (idx >= 0) {
      // preserve paid metadata if existing
      const old = s.invoices[idx];
      oldLedgerIds = (old.items || []).map(it => it._ledgerId).filter(Boolean);
      payload.paidAt = old.paidAt || null;
      payload.paidMethod = old.paidMethod || null;
      // preserve Stripe link only if amount/currency unchanged
      const amountChanged = (Number(old.total || 0).toFixed(2) !== Number(payload.total || 0).toFixed(2))
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
    if (mt) s.invoiceSeq = Math.max(s.invoiceSeq || 0, parseInt(mt[1], 10));
  }

  // ── Stamp ledger ↔ invoice back-links (covers create AND edit re-pointing).
  // Clear links for ledger ids that were dropped from this invoice on edit…
  const newLedgerIds = (payload.items || []).map(it => it._ledgerId).filter(Boolean);
  for (const oldId of oldLedgerIds) {
    if (!newLedgerIds.includes(oldId)) stampLedgerInvoiceLink(s, oldId, null);
  }
  // …then point each current line item's ledger sale at this invoice. Decision #3:
  // if a sale is already on a DIFFERENT live invoice, warn but proceed (last writer
  // wins — the ledger tracks the most-recent invoice link).
  for (const id of newLedgerIds) {
    const le = (s.ledger || []).find(x => x.id === id);
    if (le && le.invoiceId && le.invoiceId !== payload.id) {
      const other = (s.invoices || []).find(i => i.id === le.invoiceId);
      if (other && other.status !== 'cancelled')
        showToast(`⚠ A sale was already on invoice ${other.num} — re-billing on ${payload.num}`, 'warn', 4000);
    }
    stampLedgerInvoiceLink(s, id, payload);
  }

  // Push the now-current invoice number onto every consignment row this save
  // touched (newly linked, re-numbered, or just-unlinked) so the Google Sheet's
  // Invoice column tracks the change. The mirror is canonicalised in the ledger,
  // so one upsert per affected ledger Sale keeps the sheet honest.
  if (sheetsUrl) {
    const affected = new Set([...oldLedgerIds, ...newLedgerIds]);
    for (const id of affected) {
      const le = (s.ledger || []).find(x => x.id === id);
      if (le && le.sheetsId && !le.voided) syncToSheets(consignmentSyncPayload(book, le));
    }
  }

  saveState(activeBook);
  closeM('invoice-edit');
  renderInvoices();
  renderLedger();
  renderHist();
  showToast(status === 'draft' ? '✓ Draft saved' : '✓ Invoice saved');

  // Stripe Payment Link: auto-create on finalize (or regenerate after edit)
  const settings = getInvoiceSettings();
  const shouldAutoStripe = status !== 'draft' && settings.stripeAuto !== false && !!settings.stripeKey && !payload.stripe;
  if (oldStripeLinkId) deactivateStripePaymentLink(oldStripeLinkId);

  if (shouldAutoStripe) {
    showToast('Creating Stripe Payment Link…', 'ok', 1800);
    createStripePaymentLinkForInvoice(payload).then(stripe => {
      const s2 = getState();
      const inv = (s2.invoices || []).find(i => i.id === payload.id);
      if (!inv) return;
      inv.stripe = stripe;
      inv.paymentLink = stripe.url; // also set as the primary payment link so QR/etc. use it
      saveState(activeBook);
      renderInvoices();
      setTimeout(() => viewInvoice(payload.id), 60);
      showToast(`✓ Stripe link ready — ${fmt(payload.total, payload.currency)} owed`);
    }).catch(err => {
      console.error('Stripe link creation failed:', err);
      showToast('Stripe link failed: ' + err.message, 'err', 5000);
      setTimeout(() => viewInvoice(payload.id), 60);
    });
  } else {
    setTimeout(() => viewInvoice(payload.id), 80);
  }
}

async function regenerateStripeLinkFromView() {
  if (!currentViewInvoiceId) return;
  const s = getState();
  const inv = (s.invoices || []).find(i => i.id === currentViewInvoiceId);
  if (!inv) return;
  const settings = getInvoiceSettings();
  if (!settings.stripeKey) {
    if (await confirmDialog('No Stripe key configured yet. Open Invoice Settings to add one?', { okLabel: 'Open settings' })) {
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
  } catch (e) {
    console.error(e);
    showToast('Stripe: ' + e.message, 'err', 5500);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💳 Stripe link'; }
  }
}

async function deleteInvoice() {
  if (!invoiceCtx || !invoiceCtx.editingId) return;
  const s = getState();
  const inv = (s.invoices || []).find(i => i.id === invoiceCtx.editingId);
  if (!inv) return;
  if (!(await confirmDialog(`Delete invoice ${inv.num}? This cannot be undone.`, { okLabel: 'Delete invoice', danger: true }))) return;
  // Clear the back-links on every ledger sale this invoice billed, so the ledger
  // and history no longer point at a deleted invoice.
  for (const it of (inv.items || [])) {
    if (it._ledgerId) stampLedgerInvoiceLink(s, it._ledgerId, null);
  }
  s.invoices = s.invoices.filter(i => i.id !== invoiceCtx.editingId);
  saveState(activeBook);
  closeM('invoice-edit');
  renderInvoices();
  renderLedger();
  renderHist();
  showToast('✓ Invoice deleted');
}

// ── invoice view (printable) ────────────────────────────────────────────
let currentViewInvoiceId = null;

function viewInvoice(id) {
  const s = getState();
  const inv = (s.invoices || []).find(i => i.id === id);
  if (!inv) { showToast('Invoice not found', 'err'); return; }
  currentViewInvoiceId = id;
  $('invoice-print-area').innerHTML = renderInvoicePaperHTML(inv);
  // Paid invoices show a non-clickable "✓ Paid" badge; unpaid ones keep the
  // clickable gold "✓ Mark paid" action. (Same element is reused across
  // invoices, so set the full state both ways.)
  const mp = $('inv-mark-paid-btn');
  if (mp) {
    const paid = inv.status === 'paid';
    mp.style.display = '';
    mp.disabled = paid;
    mp.textContent = paid ? '✓ Paid' : '✓ Mark paid';
    if (paid) {
      mp.classList.remove('gold');
      mp.style.background = '#e0f5ea';
      mp.style.color = '#1d7a4a';
      mp.style.cursor = 'default';
      mp.style.opacity = '1';
    } else {
      mp.classList.add('gold');
      mp.style.background = '';
      mp.style.color = '';
      mp.style.cursor = '';
      mp.style.opacity = '';
    }
  }
  openM('invoice-view');
  // Render QR if QRCode library is available
  setTimeout(() => {
    const qrEl = document.querySelector('#invoice-print-area .inv-qr');
    const url = effectivePaymentLink(inv);
    if (qrEl && url && typeof QRCode !== 'undefined') {
      qrEl.innerHTML = '';
      new QRCode(qrEl, { text: url, width: 104, height: 104, colorDark: '#0e0c0a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    }
  }, 30);
}

function effectivePaymentLink(inv) {
  const book = BOOKS[activeBook] || getBook();
  const acceptedMethods = getAcceptedPaymentMethodsForBook(book.id);

  if (inv.stripe && inv.stripe.url && acceptedMethods.includes('stripe')) return inv.stripe.url;

  let url = '';
  if (inv.paymentLink) {
    const isStripe = /buy\.stripe\.com/i.test(inv.paymentLink);
    const isPaypal = /paypal/i.test(inv.paymentLink);
    const isInterac = /^[^\s@]+@[^\s@]+$/.test(inv.paymentLink);
    if ((isStripe && acceptedMethods.includes('stripe')) ||
      (isPaypal && acceptedMethods.includes('paypal')) ||
      (isInterac && acceptedMethods.includes('interac'))) {
      url = inv.paymentLink;
    }
  }

  if (!url) {
    if (acceptedMethods.includes('stripe') && book.stripeLink) {
      url = book.stripeLink;
    } else if (acceptedMethods.includes('paypal') && book.paymentLink && /paypal/i.test(book.paymentLink)) {
      url = book.paymentLink;
    } else if (acceptedMethods.includes('interac') && book.paymentLink && /^[^\s@]+@[^\s@]+$/.test(book.paymentLink)) {
      url = book.paymentLink;
    }
  }

  if (!url) return '';

  try {
    if (/buy\.stripe\.com/i.test(url)) {
      const u = new URL(url);
      if (!u.searchParams.has('client_reference_id')) u.searchParams.set('client_reference_id', inv.num);
      if (inv.storeEmail && !u.searchParams.has('prefilled_email')) u.searchParams.set('prefilled_email', inv.storeEmail);
      url = u.toString();
    }
  } catch (e) { }
  return url;
}

function isDynamicStripeLink(inv) { return !!(inv && inv.stripe && inv.stripe.url); }

function renderInvoicePaperHTML(inv) {
  const settings = getInvoiceSettings();
  const book = BOOKS[activeBook] || getBook();
  const cur = inv.currency || book.currency;
  const payUrl = effectivePaymentLink(inv);
  const todayStr = today();
  const overdue = inv.status === 'sent' && inv.dueDate && inv.dueDate < todayStr;
  const statusLabel = overdue ? 'OVERDUE' : (inv.status || 'draft').toUpperCase();
  const statusCls = overdue ? 'overdue' : (inv.status || 'draft');

  const accent = book.accent || '#c8913a';
  const itemsHtml = (inv.items || []).map(it => `<tr>
    <td>${escapeHTML(it.description || '—')}</td>
    <td class="r">${(it.qty || 0)}</td>
    <td class="r">${fmt(it.unitPrice || 0, cur)}</td>
    <td class="r"><strong>${fmt((it.qty || 0) * (it.unitPrice || 0), cur)}</strong></td>
  </tr>`).join('');

  const acceptedMethods = getAcceptedPaymentMethodsForBook(book.id);
  const payMethodsLabel = [
    acceptedMethods.includes('stripe') && payUrl && /buy\.stripe\.com/i.test(payUrl) ? 'Stripe' : null,
    acceptedMethods.includes('paypal') && payUrl && /paypal/i.test(payUrl) ? 'PayPal' : null,
    acceptedMethods.includes('interac') && payUrl && /^[^\s@]+@[^\s@]+$/.test(payUrl) ? 'Interac e-Transfer' : null,
    settings.bank ? 'Bank transfer' : null,
  ].filter(Boolean).join(' · ') || 'See payment instructions below';

  const settlesLine = '';
  const divergedNote = inv.ledgerDivergedAt
    ? `<div class="inv-meta-sub" style="margin-top:6px;color:#a13a1b;font-weight:600;">⚠ ledger changed since invoiced — reopen to re-import amounts</div>`
    : '';

  const dyn = isDynamicStripeLink(inv);
  const testBadge = (dyn && inv.stripe.livemode === false) ? `<span style="display:inline-block;margin-left:8px;background:#fde6e0;color:#a13a1b;font-size:9px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;padding:3px 8px;border-radius:99px;">Test mode</span>` : '';
  const dynBadge = dyn ? `<div style="display:inline-flex;align-items:center;gap:6px;background:#0e0c0a;color:#f0c060;font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;padding:5px 12px;border-radius:99px;margin-bottom:10px;">✓ Stripe checkout · exact amount${testBadge ? ' ' : ''}${testBadge}</div>` : '';
  const payCopy = dyn
    ? `Click below to pay <strong>${fmt(inv.total || 0, cur)}</strong> via Stripe Checkout.`
    : `Click below to pay <strong>${fmt(inv.total || 0, cur)}</strong> securely, or scan the QR with your phone.`;

  const payFallback = payUrl ? `
    <p class="inv-pay-fallback">Pay online: <a href="${payUrl}" target="_blank" rel="noopener">${escapeHTML(payUrl)}</a></p>` : '';

  const payBlock = payUrl ? `
    <section class="inv-pay" style="--book-accent:${accent};">
      <div class="inv-pay-info">
        ${dynBadge}
        <h3>Pay this invoice</h3>
        <p>${payCopy}</p>
        <a class="pay-btn" href="${payUrl}" target="_blank" rel="noopener">Pay ${fmt(inv.total || 0, cur)} →</a>
        <div class="pay-methods">${payMethodsLabel}</div>
      </div>
      <div class="inv-qr"></div>
    </section>
    ${payFallback}` : '';

  const bankBlock = settings.bank ? `
    <div class="inv-notes-block">
      <h4>Bank transfer details</h4>
      <div>${escapeHTML(settings.bank)}</div>
    </div>` : '';

  return `<div style="--book-accent:${accent};">
    <header class="inv-head">
      <div class="inv-brand">
        <h1>${escapeHTML(settings.name || 'Lyricalmyrical Books')}</h1>
        <div class="inv-addr">${escapeHTML(settings.addr || '')}${settings.email ? '\n' + escapeHTML(settings.email) : ''}${settings.web ? '\n' + escapeHTML(settings.web) : ''}${settings.vat ? '\nVAT/Tax ID: ' + escapeHTML(settings.vat) : ''}</div>
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
        <strong>${escapeHTML(inv.storeName || '—')}</strong>
        <div class="inv-meta-sub">${[inv.storeContact, inv.storeEmail, inv.storePhone, inv.storeAddress, [inv.storeCity, inv.storeRegion, inv.storePostal].filter(Boolean).join(', '), inv.storeCountry].filter(Boolean).map(escapeHTML).join('\n')}</div>
      </div>
      <div>
        <label>Issue date</label>
        <strong>${fmtD(inv.date)}</strong>
        ${inv.dueDate ? `<div class="inv-meta-sub">Due ${fmtD(inv.dueDate)}</div>` : ''}
      </div>
      <div>
        <label>Amount due</label>
        <strong style="color:${statusCls === 'paid' ? '#1d7a4a' : '#0e0c0a'};font-size:18px;">${fmt(inv.total || 0, cur)}</strong>
        <div class="inv-meta-sub">${(inv.items || []).reduce((a, i) => a + (i.qty || 0), 0)} item${(inv.items || []).reduce((a, i) => a + (i.qty || 0), 0) === 1 ? '' : 's'}</div>
        ${settlesLine}
        ${divergedNote}
      </div>
    </section>

    <table class="inv-items">
      <thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div class="inv-totals">
      <div class="tr"><span>Subtotal</span><span class="val">${fmt(inv.subtotal || 0, cur)}</span></div>
      ${(inv.discount || 0) > 0 ? `<div class="tr"><span>Discount${inv.discountType === 'percent' && inv.discountRate ? ` (${inv.discountRate}%)` : ''}</span><span class="val">−${fmt(inv.discount, cur)}</span></div>` : ''}
      ${(inv.taxRate || 0) > 0 ? `<div class="tr"><span>Tax (${inv.taxRate}%)</span><span class="val">${fmt(inv.tax || 0, cur)}</span></div>` : ''}
      <div class="grand"><div class="tr" style="padding:0;color:inherit;"><span>Total due</span><span class="val">${fmt(inv.total || 0, cur)}</span></div></div>
    </div>

    ${payBlock}

    <div class="inv-notes">
      ${inv.notes ? `<div class="inv-notes-block"><h4>Notes</h4><div>${escapeHTML(inv.notes)}</div></div>` : ''}
      ${inv.terms ? `<div class="inv-notes-block"><h4>Terms</h4><div>${escapeHTML(inv.terms)}</div></div>` : ''}
      ${bankBlock}
    </div>

    <div class="inv-foot">${escapeHTML(settings.footer || 'Thank you for stocking our books.')}</div>
  </div>`;
}

function editInvoiceFromView() {
  if (!currentViewInvoiceId) return;
  closeM('invoice-view');
  setTimeout(() => openCreateInvoice(null, currentViewInvoiceId), 60);
}

async function markInvoicePaidFromView() {
  if (!currentViewInvoiceId) return;
  const s = getState(), book = getBook();
  const inv = (s.invoices || []).find(i => i.id === currentViewInvoiceId);
  if (!inv) return;
  if (!(await confirmDialog(`Mark ${inv.num} as PAID? This will also mark any linked pending consignment sales as paid.`, { okLabel: 'Mark paid' }))) return;
  inv.status = 'paid';
  inv.paidAt = Date.now();
  inv.paidMethod = isDynamicStripeLink(inv) ? 'Stripe Checkout'
    : (inv.paymentLink && /buy\.stripe\.com/i.test(inv.paymentLink)) ? 'Stripe'
      : (inv.paymentLink && /paypal/i.test(inv.paymentLink)) ? 'PayPal'
        : (book.stripeLink ? 'Stripe' : 'Other');
  // best-effort: deactivate the Stripe Payment Link so it can't be paid twice
  if (inv.stripe?.paymentLinkId) deactivateStripePaymentLink(inv.stripe.paymentLinkId);
  // settle any linked pending ledger entries via the canonical helper, so the
  // ledger row, store owed, and hist mirror paidState all flip together.
  for (const it of (inv.items || [])) {
    if (it._ledgerId) {
      const e = s.ledger.find(x => x.id === it._ledgerId);
      if (e) settleLedgerSalePaid(s, e);
    }
  }
  saveState(activeBook);
  renderInvoices();
  renderStores();
  renderLedger();
  renderHist();
  updateDash();
  viewInvoice(currentViewInvoiceId);
  showToast(`✓ ${inv.num} marked paid`);
}

function printInvoice() {
  if (!currentViewInvoiceId) return;
  const inv = getState().invoices.find(i => i.id === currentViewInvoiceId);
  if (!inv) return;
  // Print the self-contained invoice document (its own clean stylesheet — no app
  // chrome, scripts, or print-isolation CSS) via a hidden, off-screen iframe.
  // An iframe can't be blocked like a popup and prints only its own document, so
  // "Save as PDF" renders the invoice instead of a blank page. buildStandalone-
  // InvoiceHTML captures the live QR. Falls back to a popup, then window.print().
  const html = buildStandaloneInvoiceHTML(inv);
  let iframe;
  try {
    iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    // Real page-sized dimensions but parked off-screen: some engines print a
    // blank page from a 0×0 or visibility:hidden frame, so size it and hide it
    // by position instead.
    iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1123px;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    const triggerPrint = () => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
      catch (e) { printInvoiceViaPopup(html); }
      finally { setTimeout(() => { try { iframe.remove(); } catch (e) { } }, 1500); }
    };
    // Wait for the doc (and its embedded QR/image + fonts) to settle, otherwise
    // the QR/styles may be missing in the PDF.
    if (iframe.contentWindow.document.readyState === 'complete') {
      setTimeout(triggerPrint, 250);
    } else {
      iframe.addEventListener('load', () => setTimeout(triggerPrint, 250), { once: true });
    }
  } catch (e) {
    if (iframe) { try { iframe.remove(); } catch (_) { } }
    printInvoiceViaPopup(html);
  }
}

// Last-resort print path: open the standalone invoice doc in a new tab and print
// it. Used when the hidden-iframe route is unavailable (e.g. sandboxed frames).
function printInvoiceViaPopup(html) {
  const w = window.open('', '_blank');
  if (!w) {
    // Popup blocked too — fall back to printing the page (the @media print CSS
    // in index.html isolates #m-invoice-view) and nudge toward Download instead.
    showToast('Allow popups to print, or use “Download” and print the saved file.', 'warn');
    window.print();
    return;
  }
  w.document.open(); w.document.write(html); w.document.close();
  const go = () => { try { w.focus(); w.print(); } catch (e) { } };
  if (w.document.readyState === 'complete') setTimeout(go, 250);
  else w.addEventListener('load', () => setTimeout(go, 250), { once: true });
}

function copyInvoicePayLink() {
  if (!currentViewInvoiceId) return;
  const inv = getState().invoices.find(i => i.id === currentViewInvoiceId);
  if (!inv) return;
  const url = effectivePaymentLink(inv);
  if (!url) { showToast('No payment link set for this book or invoice', 'warn'); return; }
  navigator.clipboard.writeText(url).then(
    () => showToast('✓ Payment link copied'),
    () => showToast('Could not copy — your browser blocked it', 'err')
  );
}

function invoiceEmailPlainText(inv) {
  const settings = getInvoiceSettings();
  const cur = inv.currency || getBook().currency;
  const payUrl = effectivePaymentLink(inv);
  return [
    `Hi ${inv.storeContact || inv.storeName || 'there'},`,
    ``,
    `Your invoice ${inv.num} for ${fmt(inv.total || 0, cur)} is below. Issued ${fmtD(inv.date)}${inv.dueDate ? ', due ' + fmtD(inv.dueDate) : ''}.`,
    payUrl ? `` : null,
    payUrl ? `Pay securely online${isDynamicStripeLink(inv) ? ' (exact amount via Stripe)' : ''}: ${payUrl}` : null,
    inv.notes ? `` : null,
    inv.notes ? `Notes: ${inv.notes}` : null,
    ``,
    `Thank you,`,
    settings.name || 'Lyricalmyrical Books',
  ].filter(v => v !== null).join('\n');
}

// Gmail compose URLs only support plain-text bodies. To make invoice emails look
// like the invoice itself, copy a rich, inline-styled email (greeting + invoice
// card + pay button) to the clipboard, then open Gmail with just recipient and
// subject filled so the user can paste the formatted invoice into the message.
function buildInvoiceEmailHTML(inv) {
  const settings = getInvoiceSettings();
  const cur = inv.currency || getBook().currency;
  const payUrl = effectivePaymentLink(inv);
  const accent = (BOOKS[activeBook] || getBook()).accent || '#c8913a';
  const contact = escapeHTML(inv.storeContact || inv.storeName || 'there');
  const items = (inv.items || []).map(it => `
    <tr>
      <td style="padding:12px 10px;border-bottom:1px solid #f1eadc;color:#1a1814;">${escapeHTML(it.description || '—')}</td>
      <td align="right" style="padding:12px 10px;border-bottom:1px solid #f1eadc;color:#1a1814;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${it.qty || 0}</td>
      <td align="right" style="padding:12px 10px;border-bottom:1px solid #f1eadc;color:#1a1814;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${fmt(it.unitPrice || 0, cur)}</td>
      <td align="right" style="padding:12px 10px;border-bottom:1px solid #f1eadc;color:#1a1814;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;">${fmt((it.qty || 0) * (it.unitPrice || 0), cur)}</td>
    </tr>`).join('');
  const billedTo = [inv.storeContact, inv.storeEmail, inv.storePhone, inv.storeAddress, [inv.storeCity, inv.storeRegion, inv.storePostal].filter(Boolean).join(', '), inv.storeCountry]
    .filter(Boolean).map(escapeHTML).join('<br>');
  const notes = [
    inv.notes ? `<div style="margin-top:16px;"><div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#9b9184;font-weight:700;margin-bottom:4px;">Notes</div><div style="white-space:pre-wrap;">${escapeHTML(inv.notes)}</div></div>` : '',
    inv.terms ? `<div style="margin-top:16px;"><div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#9b9184;font-weight:700;margin-bottom:4px;">Terms</div><div style="white-space:pre-wrap;">${escapeHTML(inv.terms)}</div></div>` : '',
  ].join('');
  return `
<div style="margin:0;padding:0;background:#f7f2e9;color:#1a1814;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:760px;margin:0 auto;padding:24px 14px;">
    <p style="font-size:16px;line-height:1.55;margin:0 0 16px;">Hi ${contact},</p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 22px;">Here is invoice <strong>${escapeHTML(inv.num)}</strong> for <strong>${fmt(inv.total || 0, cur)}</strong>. It is also ready to print or save as a PDF from the invoice screen.</p>
    <div style="background:#ffffff;border:1px solid #eadfca;border-radius:12px;overflow:hidden;box-shadow:0 8px 28px rgba(14,12,10,.10);">
      <div style="height:7px;background:${escapeHTML(accent)};"></div>
      <div style="padding:30px 34px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:26px;">
          <tr>
            <td style="vertical-align:top;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;color:#0e0c0a;line-height:1.1;">${escapeHTML(settings.name || 'Lyricalmyrical Books')}</div>
              <div style="font-size:12px;line-height:1.55;color:#756e64;margin-top:10px;white-space:pre-wrap;">${escapeHTML(settings.addr || '')}${settings.email ? '<br>' + escapeHTML(settings.email) : ''}${settings.web ? '<br>' + escapeHTML(settings.web) : ''}</div>
            </td>
            <td align="right" style="vertical-align:top;white-space:nowrap;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${escapeHTML(accent)};letter-spacing:.16em;text-transform:uppercase;font-weight:700;">Invoice</div>
              <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;font-weight:700;margin-top:8px;">${escapeHTML(inv.num)}</div>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #eadfca;border-bottom:1px solid #eadfca;margin-bottom:22px;">
          <tr>
            <td style="padding:16px 12px 16px 0;vertical-align:top;width:45%;"><div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#9b9184;font-weight:700;margin-bottom:6px;">Billed to</div><div style="font-weight:700;">${escapeHTML(inv.storeName || '—')}</div><div style="font-size:12px;line-height:1.5;color:#756e64;margin-top:4px;">${billedTo}</div></td>
            <td style="padding:16px 12px;vertical-align:top;"><div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#9b9184;font-weight:700;margin-bottom:6px;">Issue date</div><div style="font-weight:700;">${fmtD(inv.date)}</div>${inv.dueDate ? `<div style="font-size:12px;color:#756e64;margin-top:4px;">Due ${fmtD(inv.dueDate)}</div>` : ''}</td>
            <td align="right" style="padding:16px 0 16px 12px;vertical-align:top;"><div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#9b9184;font-weight:700;margin-bottom:6px;">Amount due</div><div style="font-size:22px;font-weight:800;color:#0e0c0a;">${fmt(inv.total || 0, cur)}</div></td>
          </tr>
        </table>
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:18px;">
          <thead><tr><th align="left" style="padding:0 10px 9px;border-bottom:1px solid #eadfca;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#9b9184;">Description</th><th align="right" style="padding:0 10px 9px;border-bottom:1px solid #eadfca;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#9b9184;">Qty</th><th align="right" style="padding:0 10px 9px;border-bottom:1px solid #eadfca;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#9b9184;">Unit price</th><th align="right" style="padding:0 10px 9px;border-bottom:1px solid #eadfca;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#9b9184;">Amount</th></tr></thead>
          <tbody>${items}</tbody>
        </table>
        <table role="presentation" align="right" width="300" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:22px;">
          <tr><td style="padding:6px 12px;color:#4a443c;">Subtotal</td><td align="right" style="padding:6px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${fmt(inv.subtotal || 0, cur)}</td></tr>
          ${(inv.discount || 0) > 0 ? `<tr><td style="padding:6px 12px;color:#4a443c;">Discount${inv.discountType === 'percent' && inv.discountRate ? ` (${inv.discountRate}%)` : ''}</td><td align="right" style="padding:6px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">−${fmt(inv.discount, cur)}</td></tr>` : ''}
          ${(inv.taxRate || 0) > 0 ? `<tr><td style="padding:6px 12px;color:#4a443c;">Tax (${inv.taxRate}%)</td><td align="right" style="padding:6px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${fmt(inv.tax || 0, cur)}</td></tr>` : ''}
          <tr><td style="padding:14px 12px;background:#0e0c0a;color:#f7f2e9;border-radius:6px 0 0 6px;font-weight:800;">Total due</td><td align="right" style="padding:14px 12px;background:#0e0c0a;color:#f0c060;border-radius:0 6px 6px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:800;">${fmt(inv.total || 0, cur)}</td></tr>
        </table>
        <div style="clear:both;"></div>
        ${payUrl ? `<div style="background:#faf6ec;border:1px solid #eadfca;border-radius:10px;padding:18px 20px;margin:16px 0 20px;"><div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;margin-bottom:6px;">Pay this invoice</div><div style="font-size:13px;line-height:1.5;color:#675f55;margin-bottom:14px;">Pay <strong>${fmt(inv.total || 0, cur)}</strong> securely online${isDynamicStripeLink(inv) ? ' via Stripe Checkout' : ''}.</div><a href="${payUrl}" style="display:inline-block;background:#0e0c0a;color:#f0c060;text-decoration:none;border-radius:999px;padding:11px 22px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Pay ${fmt(inv.total || 0, cur)} →</a><div style="font-size:11px;line-height:1.4;color:#8c8378;margin-top:10px;word-break:break-all;">${escapeHTML(payUrl)}</div></div>` : ''}
        ${notes}
        <div style="text-align:center;font-size:12px;color:#9b9184;margin-top:24px;font-style:italic;">${escapeHTML(settings.footer || 'Thank you for stocking our books.')}</div>
      </div>
    </div>
    <p style="font-size:15px;line-height:1.55;margin:22px 0 0;">Thank you,<br>${escapeHTML(settings.name || 'Lyricalmyrical Books')}</p>
  </div>
</div>`;
}

async function copyInvoiceEmailToClipboard(inv) {
  const html = buildInvoiceEmailHTML(inv);
  const text = invoiceEmailPlainText(inv);
  if (navigator.clipboard && window.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })
    ]);
    return true;
  }
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return false; }
  throw new Error('Clipboard unavailable');
}

async function emailInvoice() {
  if (!currentViewInvoiceId) return;
  const inv = getState().invoices.find(i => i.id === currentViewInvoiceId);
  if (!inv) return;
  const settings = getInvoiceSettings();
  const subject = `Invoice ${inv.num} — ${settings.name || 'Lyricalmyrical Books'}`;
  const to = inv.storeEmail || '';
  let richCopied = false;
  try {
    richCopied = await copyInvoiceEmailToClipboard(inv);
  } catch (e) {
    showToast('Could not copy the formatted invoice email. Your browser may have blocked clipboard access.', 'warn');
  }
  // Still download the one-page invoice file as a backup attachment / PDF source,
  // but the email body itself is now the formatted invoice copied above.
  downloadInvoiceHTML({ silent: true });
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}`;
  const w = window.open(gmailUrl, '_blank');
  const msg = richCopied
    ? '✓ Formatted invoice email copied. Paste into Gmail compose, then attach the downloaded invoice if you want.'
    : '✓ Plain invoice text copied. Paste into Gmail compose, then attach the downloaded invoice if you want.';
  if (w) {
    try { w.opener = null; } catch (e) { }
    showToast(msg);
  } else {
    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(invoiceEmailPlainText(inv))}`;
    window.location.href = mailtoUrl;
    showToast('Popup blocked — opened your mail app with the plain invoice text instead.');
  }
}
// Pulls just the .invoice-paper visual styles from the live page so the
// standalone invoice document stays pixel-identical to the on-screen preview
// without duplicating ~60 lines of CSS in JS. We deliberately grab only the
// invoice-scoped rules — NOT the whole <head> — because copying document.head
// dragged in the app's print-isolation rule (`body > *:not(#m-invoice-view)
// {display:none}`), which has no #m-invoice-view to match in this standalone doc
// and so blanked the entire page in the PDF. Cross-origin sheets (Google Fonts)
// throw on .cssRules access and are skipped — their fonts come via the <link>.
function collectInvoicePaperCss() {
  const out = [];
  for (const sheet of Array.from(document.styleSheets || [])) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      // Plain style rules scoped to the invoice paper; @media/@font-face blocks
      // (no selectorText) are skipped — we supply our own clean print rules.
      if (rule.selectorText && rule.selectorText.includes('.invoice-paper')) {
        out.push(rule.cssText);
      }
    }
  }
  return out.join('\n');
}

// Returns the invoice paper's inner HTML with the live QR (drawn to a <canvas>
// at view time) inlined as a PNG <img>, so it survives outside the live preview
// (standalone file, print window, or rasterized PDF).
function invoicePaperBodyWithQR(inv) {
  let bodyInner = renderInvoicePaperHTML(inv);
  const liveQr = document.querySelector('#invoice-print-area .inv-qr canvas');
  if (liveQr) {
    try {
      bodyInner = bodyInner.replace(
        '<div class="inv-qr"></div>',
        `<div class="inv-qr"><img src="${liveQr.toDataURL('image/png')}" width="104" height="104" alt="Scan to pay" style="display:block;"></div>`
      );
    } catch (e) { }
  }
  return bodyInner;
}

// Builds a fully self-contained invoice document with the Stripe pay link embedded
// (clickable button + scannable QR + plain-text URL) that survives PDF export and
// email-client styling — so the link is never dropped when the invoice is sent.
function buildStandaloneInvoiceHTML(inv) {
  const bodyInner = invoicePaperBodyWithQR(inv);

  // Only the font stylesheets/preconnects are carried over from the page; the
  // rest of the document is our own clean, print-safe CSS.
  const fontLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"]'))
    .filter(l => /fonts\.(googleapis|gstatic)\.com/.test(l.href || ''))
    .map(l => l.outerHTML).join('\n');

  const css = `
    *{box-sizing:border-box;}
    html,body{margin:0;padding:0;}
    body{background:#f0ece4;padding:40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;}
    .invoice-paper{background:#fff;}
    ${collectInvoicePaperCss()}
    .invoice-paper .inv-pay{display:flex !important;}
    @page{margin:0.4in !important;}
    @media print{
      html,body{background:#fff !important;margin:0 !important;padding:0 !important;}
      body{padding:0 !important;}
      .invoice-paper{
        box-shadow:none !important;
        border-radius:0 !important;
        max-width:none !important;
        padding: 20px 30px !important;
        margin: 0 !important;
      }
      .invoice-paper::before{display:none !important;}
      .invoice-paper .inv-head{margin-bottom: 16px !important;}
      .invoice-paper .inv-meta-grid{margin-bottom: 16px !important; padding: 10px 0 !important; gap: 12px !important;}
      .invoice-paper .inv-items{margin-bottom: 12px !important;}
      .invoice-paper .inv-items th{padding-bottom: 6px !important;}
      .invoice-paper .inv-items td{padding: 8px 12px !important;}
      .invoice-paper .inv-totals{margin-bottom: 16px !important;}
      .invoice-paper .inv-totals .tr{padding: 4px 12px !important;}
      .invoice-paper .inv-totals .grand{margin-top: 4px !important; padding: 10px 12px !important;}
      .invoice-paper .inv-pay{margin-bottom: 16px !important; padding: 12px 16px !important; gap: 12px !important; display:flex !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;}
      .invoice-paper .inv-pay .pay-btn{display:inline-block !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;}
      .invoice-paper .inv-pay .inv-qr{padding: 6px !important;}
      .invoice-paper .inv-pay .inv-qr img,
      .invoice-paper .inv-pay .inv-qr canvas { width: 80px !important; height: 80px !important; }
      .invoice-paper .inv-pay-fallback{margin: -8px 2px 12px !important;}
      .invoice-paper .inv-notes{padding-top: 10px !important;}
      .invoice-paper .inv-notes .inv-notes-block{margin-bottom: 8px !important;}
      .invoice-paper .inv-foot{margin-top: 12px !important;}
    }
  `;

  const head = `<meta charset="utf-8"><title>Invoice ${escapeHTML(inv.num || '')}</title>${fontLinks}<style>${css}</style>`;
  const body = `<body><div class="invoice-paper">${bodyInner}</div></body>`;
  return `<!doctype html><html><head>${head}</head>${body}</html>`;
}

function downloadInvoiceHTML(opts) {
  if (!currentViewInvoiceId) return;
  const inv = getState().invoices.find(i => i.id === currentViewInvoiceId);
  if (!inv) return;
  const html = buildStandaloneInvoiceHTML(inv);
  downloadText(html, `${inv.num}.html`, 'text/html');
  if (!(opts && opts.silent)) {
    showToast(effectivePaymentLink(inv)
      ? '✓ Invoice downloaded with the Stripe pay link embedded — attach it or print to PDF.'
      : '✓ Invoice downloaded (open & print to PDF).');
  }
}

// Lazily inject an external script once and resolve when it's ready. The libs
// live on cdnjs (cached by the service worker — see vite.config.js), so after
// the first online load this works offline too. Failures reject so callers can
// fall back gracefully.
const _externalScripts = {};
function loadExternalScript(src) {
  if (_externalScripts[src]) return _externalScripts[src];
  _externalScripts[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { delete _externalScripts[src]; reject(new Error('Failed to load ' + src)); };
    document.head.appendChild(s);
  });
  return _externalScripts[src];
}

// jsPDF + html2canvas are ~0.5 MB combined, so they're only fetched the first
// time the user actually exports a PDF (not on every page load).
async function ensurePdfLibs() {
  if (!(window.jspdf && window.jspdf.jsPDF)) {
    await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  }
  if (!window.html2canvas) {
    await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  }
}

// pdf.js, lazily, for the one job nothing else can do: rasterising a PDF
// receipt so it can be *seen* in a printed report. Same CDN-on-demand pattern
// as ensurePdfLibs — it is never fetched on load, and offline it simply
// rejects, which callers treat as "list this receipt instead of showing it".
const PDFJS_VERSION = '3.11.174';
export async function ensurePdfJs() {
  if (!window.pdfjsLib) {
    await loadExternalScript(`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`);
  }
  if (!window.pdfjsLib) throw new Error('pdf.js unavailable');
  try {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  } catch (e) { /* worker src is best-effort; pdf.js falls back to the main thread */ }
  return window.pdfjsLib;
}

// One-click, true PDF download — no browser print dialog. The invoice is
// rendered into an off-screen node inside THIS document so the app's already
// loaded fonts apply (correct typography even offline), rasterized with
// html2canvas, then placed into an A4 jsPDF and saved as <invoice>.pdf. Falls
// back to the print/Save-as-PDF flow if the libraries can't be loaded.
async function downloadInvoicePDF() {
  if (!currentViewInvoiceId) return;
  const inv = getState().invoices.find(i => i.id === currentViewInvoiceId);
  if (!inv) return;
  const btn = $('inv-pdf-btn');
  const prevLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '… Building PDF'; }

  let holder;
  try {
    await ensurePdfLibs();

    holder = document.createElement('div');
    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:780px;background:#fff;';
    holder.innerHTML = `<div class="invoice-paper" style="box-shadow:none;border-radius:0;max-width:none;">${invoicePaperBodyWithQR(inv)}</div>`;
    document.body.appendChild(holder);
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { }

    const canvas = await window.html2canvas(holder.firstElementChild, {
      scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const margin = 24;
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW - margin * 2;
    const imgH = canvas.height * (imgW / canvas.width);
    const imgData = canvas.toDataURL('image/png');
    const contentH = pageH - margin * 2;

    if (imgH <= contentH) {
      pdf.addImage(imgData, 'PNG', margin, margin, imgW, imgH);
    } else {
      // Taller than one page: place the full image and shift it up per page so
      // each page shows the next slice (content outside the page is clipped).
      let heightLeft = imgH, position = margin;
      pdf.addImage(imgData, 'PNG', margin, position, imgW, imgH);
      heightLeft -= contentH;
      while (heightLeft > 0) {
        position = margin - (imgH - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgW, imgH);
        heightLeft -= contentH;
      }
    }

    pdf.save(`${inv.num || 'invoice'}.pdf`);
    showToast('✓ PDF downloaded');
  } catch (e) {
    console.error('PDF export failed:', e);
    showToast('Could not build the PDF — opening the print dialog instead.', 'warn');
    printInvoice();
  } finally {
    if (holder) { try { holder.remove(); } catch (e) { } }
    if (btn) { btn.disabled = false; btn.textContent = prevLabel; }
  }
}

// ── EDIT & VOID SYSTEM ─────────────────────────────────────────────────────
let editCtx = null; // { kind:'hist'|'ledger', idx, snapshot }

// Locate the payout recorded when a direct-to-artist sale was settled as
// "artist keeps all" (publisher cut forgiven). Returns the index in
// s.artistPayouts, or -1 if none matches this order number.
function findKeptAllPayout(s, num) {
  if (!s.artistPayouts || !num) return -1;
  return s.artistPayouts.findIndex(p =>
    !p.voided &&
    p.method === 'Kept from direct sale (full)' &&
    typeof p.notes === 'string' &&
    p.notes.includes(num)
  );
}

// Reverse an "artist keeps all" settlement after the fact: the artist had kept
// the full gross (publisher cut forgiven), but later forwarded the entire amount.
// This removes the kept-all payout so the publisher holds the cash and the artist
// is owed their normal share — matching the "transfer received" outcome. Revenue
// was already booked at settlement time, so it is left untouched.
async function convertKeptAllToReceived() {
  if (!editCtx || editCtx.kind !== 'hist') return;
  const s = getState(), book = getBook();
  const h = s.hist[editCtx.idx];
  if (!h) return;
  const pIdx = findKeptAllPayout(s, h.num);
  if (pIdx === -1) { showToast('No "kept all" payout found for this entry'); return; }
  const payout = s.artistPayouts[pIdx];

  if (!(await confirmDialog(
    `Record ${escapeHtml(h.num)} as fully forwarded?\n\n` +
    `This sale was settled as "artist keeps all" — the artist kept ${fmt(payout.amount, book.currency)} ` +
    `and your cut was forgiven. Recording the full transfer removes that ` +
    `${fmt(payout.amount, book.currency)} payout: the publisher now holds all the cash and the artist ` +
    `is owed their normal share again.`,
    { okLabel: 'Record full transfer' }
  ))) return;

  // Remove the kept-all payout — the artist no longer keeps the cash.
  s.artistPayouts.splice(pIdx, 1);
  // Refresh the note to reflect the forwarded transfer.
  h.notes = (h.notes || '').replace(/\s*·?\s*Artist kept full amount \(publisher cut forgiven\)/, '').trim();
  h.notes = (h.notes ? h.notes + ' · ' : '') + 'Full transfer received';
  h.edited = true;

  closeM('edit-entry');
  renderHist(); updateDash(); renderArtistTransfers(); await saveState(activeBook);

  if (sheetsUrl && !h.consignmentLink) {
    const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
    const totalNative = h.qty * h.price;
    const cadEquiv = cadEquivalentForSale({ nativeCurrency: nativeCur, totalNative, payment: h.payment });
    syncToSheets({
      type: 'order', book: book.title, date: h.date, num: h.num, chan: h.chan,
      qty: h.qty, price: h.price, total: totalNative, stockAfter: h.after,
      notes: (h.notes || '') + ' [FULL TRANSFER RECEIVED AFTER KEEP-ALL]',
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
  showToast(`✓ Full transfer recorded — ${fmt(payout.amount, book.currency)} payout reversed`);
}

function openEditHist(idx) {
  const s = getState(), book = getBook(), h = s.hist[idx];
  if (!h) return;
  editCtx = { kind: 'hist', idx, snapshot: JSON.parse(JSON.stringify(h)) };
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
  // Direct-to-artist "kept all" entries can be reconciled later if the artist
  // ends up forwarding the full amount after their cut was forgiven.
  const settleZone = $('edit-settle-zone');
  if (settleZone) {
    const pIdx = findKeptAllPayout(s, h.num);
    if (h.directToArtist && !h.artistPending && pIdx !== -1) {
      const amt = s.artistPayouts[pIdx].amount;
      settleZone.style.display = '';
      $('edit-settle-body').innerHTML =
        `This sale was settled as <strong>artist keeps all</strong> — the artist kept ${fmt(amt, book.currency)} and your cut was forgiven. ` +
        `If they later forwarded the full amount, record it to reverse that payout so the publisher holds the cash and the artist is owed their normal share.`;
    } else {
      settleZone.style.display = 'none';
    }
  }
  const _voidZone = $('edit-void-zone');
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
  editCtx = { kind: 'ledger', idx, snapshot: JSON.parse(JSON.stringify(e)) };
  $('edit-modal-title').textContent = 'Edit consignment entry';
  $('edit-modal-type-badge').textContent = e.storeName + ' · ' + e.type;
  $('edit-order-fields').style.display = 'none';
  $('edit-ledger-fields').style.display = '';
  const settleZoneL = $('edit-settle-zone');
  if (settleZoneL) settleZoneL.style.display = 'none';
  $('edit-l-date').value = e.date;
  $('edit-l-qty').value = e.qty;
  $('edit-l-rate').value = e.rate;
  $('edit-l-notes').value = e.notes || '';
  // Sale price is editable directly for Sale rows (other types carry no price).
  // Back-derive the current per-unit price from amountDue so the field shows
  // what was actually charged, then let the user correct a mistaken price.
  const priceRow = $('edit-l-price-row');
  if (e.type === 'Sale') {
    const derivedPrice = (e.amountDue > 0 && e.qty) ? (e.amountDue / (e.qty * (1 - e.rate / 100))) : book.listPrice;
    $('edit-l-price').value = (derivedPrice || 0).toFixed(2);
    if ($('edit-l-price-sym')) $('edit-l-price-sym').textContent = book.currency;
    if (priceRow) priceRow.style.display = '';
  } else if (priceRow) {
    priceRow.style.display = 'none';
  }
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
      if (!s.chStats[newChan]) s.chStats[newChan] = { txns: 0, units: 0, revenue: 0 };
      s.chStats[newChan].txns++;
      s.chStats[newChan].units += newQty;
      s.chStats[newChan].revenue += newQty * newPrice;
    }

    // Update the record
    h.num = newNum; h.chan = newChan; h.qty = newQty; h.price = newPrice;
    h.date = newDate; h.notes = newNotes;
    h.edited = true;

    // Sync edit to sheets. Skip consignment-mirrored hist entries: the matching
    // ledger row is the canonical record and would just overwrite this write.
    if (sheetsUrl && !h.consignmentLink) {
      if (h.voided) {
        // A voided entry has no row in the sheet — remove any match, don't re-add.
        syncHistoryVoidDeletion(h, true);
      } else {
        const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
        const totalNative = h.qty * h.price;
        const cadEquiv = cadEquivalentForSale({ nativeCurrency: nativeCur, totalNative, payment: h.payment });
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
          status: 'OK'
        });
      }
    }

  } else {
    // Ledger entry edit (date, qty, rate, notes). Quantity changes are
    // reconciled against on-hand stock and the store's counters so the
    // ledger, the store card, and inventory never drift apart.
    const e = s.ledger[editCtx.idx];
    e.date = $('edit-l-date').value || e.date;
    e.notes = $('edit-l-notes').value.trim();
    // qty and rate — update display only, reverse/reapply amountDue if sale
    const newQty = parseInt($('edit-l-qty').value) || e.qty;
    const newRate = parseFloat($('edit-l-rate').value) || e.rate;
    if (e.type === 'Shipment' && !e.voided) {
      // A shipment removed e.qty from on-hand. Re-shipping more (or fewer)
      // books must move on-hand the same way the original Send did — without
      // this, editing a shipment's quantity left inventory stuck at the old
      // number while the store card showed the new "sent"/"outstanding".
      const delta = newQty - e.qty;
      s.stock = Math.max(0, s.stock - delta);
      const st = s.stores.find(x => x.id === e.storeId);
      if (st) { st.sent = Math.max(0, st.sent + delta); st.outstanding = Math.max(0, st.outstanding + delta); }
    } else if (e.type === 'Return' && !e.voided) {
      // Good returns come back into on-hand; written-off returns don't.
      const delta = newQty - e.qty;
      const st = s.stores.find(x => x.id === e.storeId);
      if (st) { st.returned = Math.max(0, st.returned + delta); st.outstanding = Math.max(0, st.outstanding - delta); }
      if (e.status === 'restocked') s.stock = Math.max(0, s.stock + delta);
    }
    if (e.type === 'Sale' && !e.voided) {
      // Find the store and adjust owed
      const st = getState().stores.find(st => st.id === e.storeId);
      if (st) {
        const oldDue = e.amountDue;
        // Prefer the price the user typed in the edit modal; otherwise estimate
        // it from the old amountDue so quantity/rate-only edits behave as before.
        const derivedPrice = oldDue > 0 ? (oldDue / (e.qty * (1 - e.rate / 100))) : book.listPrice;
        const typedPrice = parseFloat($('edit-l-price') ? $('edit-l-price').value : '');
        const salePrice = (!isNaN(typedPrice) && typedPrice > 0) ? typedPrice : derivedPrice;
        const newDue = newQty * salePrice * (1 - newRate / 100);
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
      // Decision #2: editing a billed sale must NOT rewrite the invoice. Keep the
      // link, flag the invoice as diverged (its view shows a "ledger changed since
      // invoiced" note), and tell the user which invoice this sale sits on.
      if (e.invoiceId) {
        const inv = (s.invoices || []).find(i => i.id === e.invoiceId);
        if (inv) inv.ledgerDivergedAt = Date.now();
        showToast(`This sale is on invoice ${e.invoiceNum || ''} — reopen it to re-import the new amount.`, 'warn', 4500);
      }
    }
    e.qty = newQty;
    e.rate = newRate;
    e.edited = true;

    // Sync ledger edit to sheets. A voided entry is removed; otherwise upsert.
    if (sheetsUrl && e.sheetsId) {
      if (e.voided) {
        syncLedgerVoid(e, true);
      } else {
        syncToSheets(consignmentSyncPayload(book, e));
      }
    }
  }

  recomputeAfters(s, book);
  closeM('edit-entry');
  renderAll(); updateDash(); saveState(activeBook);
  if ($('tab-taxcenter') && $('tab-taxcenter').classList.contains('active')) {
    renderTaxCenter();
  }
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
    syncToSheets(consignmentSyncPayload(getBook(), e));
  }
}


// Keep the "Consignment" line in Sales by channel honest by deriving it from
// the consignment ledger — the canonical record of each sale — instead of
// trusting the running chStats counter. That counter can drift out of sync
// with the per-store tallies (older entries, partial updates, a sale recorded
// before this channel was tracked), which is exactly how a store can show
// "Sold 6" while the channel still reads 0. Rebuilding from the ledger makes
// the figure self-healing on every load and after any void/unvoid.
function reconcileConsignmentChannel(s) {
  if (!s || !Array.isArray(s.hist)) return;

  let txns = 0, units = 0, revenue = 0;
  for (const h of s.hist) {
    if (h.consignmentLink && !h.voided) {
      txns++;
      units += (h.qty || 0);
      revenue += (h.qty || 0) * (h.price || 0);
    }
  }

  if (txns > 0) {
    s.chStats = s.chStats || {};
    s.chStats['Consignment'] = { txns, units, revenue };
  } else if (s.chStats && s.chStats['Consignment']) {
    // No live consignment sales on record — drop a stale all-zero line so it
    // doesn't linger as a confusing "Consignment  0  0  $0.00" row. A non-zero
    // legacy figure is left alone.
    const c = s.chStats['Consignment'];
    if (!(c.txns || c.units || c.revenue)) delete s.chStats['Consignment'];
  }
}

function reconcileStores(s) {
  if (!s || !Array.isArray(s.stores) || !Array.isArray(s.ledger)) return;
  // The ledger is the source of truth for consignment movement. Each store's
  // running counters (sent/sold/returned/outstanding) are nudged per action,
  // so they can drift out of sync after an offline merge, an interrupted save,
  // or a void/unvoid that touched one counter but not another. The classic
  // symptom is a phantom "outstanding" that doesn't match sent − sold − returned
  // (e.g. 6 sent, 6 sold, but 1 outstanding). Rebuild the unit counters from the
  // non-voided ledger so they always reconcile. amountOwed is left untouched —
  // payments are settled separately, not purely from these ledger rows.
  const tally = new Map(); // storeId -> {sent, sold, returned}
  for (const e of s.ledger) {
    if (e.voided || e.storeId == null) continue;
    let t = tally.get(e.storeId);
    if (!t) { t = { sent: 0, sold: 0, returned: 0 }; tally.set(e.storeId, t); }
    const qty = e.qty || 0;
    if (e.type === 'Shipment') t.sent += qty;
    else if (e.type === 'Sale') t.sold += qty;
    else if (e.type === 'Return') t.returned += qty;
  }
  for (const st of s.stores) {
    const t = tally.get(st.id);
    // Skip stores with no ledger history (e.g. legacy data) so we never wipe
    // counters we can't rebuild from events.
    if (!t) continue;
    st.sent = t.sent;
    st.sold = t.sold;
    st.returned = t.returned;
    st.outstanding = Math.max(0, t.sent - t.sold - t.returned);
  }
}

function recomputeAfters(s, book) {
  const bk = book || (typeof getBook === 'function' ? getBook() : null);
  deduplicateDirectConsignmentSales(s);
  recalculateBookStatsFromHistory(s);
  if (bk && Number.isFinite(bk.maxPrint)) {
    s.stock = deriveOnHand(s, bk);
  }
  reconcileConsignmentChannel(s);
  reconcileStores(s);
  // Stock After mirrors the History view: a single running balance over the
  // full timeline (direct sales + consignment movements) from the print run
  // down to the records-true on-hand. Computing it here too keeps each entry's
  // stored `after` — the value synced to the Google Sheet — agreeing with the
  // app instead of anchoring to a header count that may have drifted.
  const timeline = buildOrderTimeline(s, bk);
  for (const r of timeline) {
    if (r.type === 'hist') r.h.after = r._after;
  }
}

// User-triggered repair for on-hand drift (e.g. a consignment that didn't
// reduce inventory, or an offline-merge hiccup). Shows the before/after and
// the assumption before touching anything, since maxPrint is the baseline.
async function recalcOnHand() {
  const s = getState(), book = getBook();
  const current = s.stock || 0;
  const derived = deriveOnHand(s, book);
  if (derived === current) { showToast('✓ On-hand already matches your records'); return; }
  const diff = derived - current;
  const ok = await confirmDialog(
    `Recalculate on-hand for "${book.title}" from your records? ` +
    `It will change from ${current} to ${derived} (${diff > 0 ? '+' : ''}${diff}). ` +
    `On-hand = ${book.maxPrint} printed − direct sales − books out on consignment + restocked returns, ` +
    `so confirm ${book.maxPrint} is the total you've ever printed.`,
    { title: 'Recalculate on-hand', okLabel: 'Apply' }
  );
  if (!ok) return;
  s.stock = derived;
  recomputeAfters(s, book);
  renderAll(); updateDash(); saveState(activeBook);
  showToast(`✓ On-hand recalculated: ${current} → ${derived}`);
}

function syncHistoryVoidDeletion(h, isVoided) {
  if (!h || !sheetsUrl) return;
  // Consignment-mirrored hist entries are handled via the ledger row.
  if (h.consignmentLink) return;
  if (isVoided) {
    // Hard delete by stable sheetsId so the backend removes the exact row.
    // Without an id we can't safely target one (an empty id risks matching
    // unrelated legacy rows), so skip — a later rebuild clears it.
    if (!h.sheetsId) return;
    syncToSheets({
      action: 'delete',
      type: 'order',
      book: getBook().title,
      sheetsId: h.sheetsId
    });
    if ((Number(h.shippingPaid || 0) || 0) > 0) {
      syncToSheets({
        action: 'delete',
        type: 'shipping',
        book: getBook().title,
        sheetsId: h.sheetsId + '-shipping'
      });
    }
    return;
  }
  // Unvoid: re-sync the full entry (upsert will replace the row)
  const book = getBook();
  const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  const totalNative = h.qty * h.price;
  const cadEquiv = cadEquivalentForSale({ nativeCurrency: nativeCur, totalNative, payment: h.payment });
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
  if ((Number(h.shippingPaid || 0) || 0) > 0) {
    syncToSheets(shippingPurchaseRowPayload(book, nativeCur, h));
  }
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
      if (!h.gratuity) {
        s.sold = Math.max(0, s.sold - h.qty);
        s.revenue = Math.max(0, s.revenue - h.qty * h.price);
      }
      if (s.chStats[h.chan]) {
        s.chStats[h.chan].txns = Math.max(0, s.chStats[h.chan].txns - 1);
        s.chStats[h.chan].units = Math.max(0, s.chStats[h.chan].units - h.qty);
        s.chStats[h.chan].revenue = Math.max(0, s.chStats[h.chan].revenue - h.qty * h.price);
        if (s.chStats[h.chan].txns <= 0) delete s.chStats[h.chan];
      }
      h.voided = true;
      recomputeAfters(s, book);
      syncHistoryVoidDeletion(h, true);
      showToast('Entry voided — stock & revenue reversed (Sheets row delete queued)', 'warn');
    } else {
      // UNVOID: re-apply effects
      s.stock = Math.max(0, s.stock - h.qty);
      if (!h.gratuity) {
        s.sold += h.qty;
        s.revenue += h.qty * h.price;
      }
      if (!s.chStats[h.chan]) s.chStats[h.chan] = { txns: 0, units: 0, revenue: 0 };
      s.chStats[h.chan].txns++;
      s.chStats[h.chan].units += h.qty;
      s.chStats[h.chan].revenue += h.qty * h.price;
      h.voided = false;
      recomputeAfters(s, book);
      syncHistoryVoidDeletion(h, false);
      showToast('Entry unvoided — effects restored (Sheets row restore queued)');
    }
  } else {
    const e = s.ledger[editCtx.idx];
    if (!e) return;
    const st = s.stores.find(st => st.id === e.storeId);
    if (!e.voided) {
      // VOID consignment entry
      if (e.type === 'Shipment' && st) { st.sent = Math.max(0, st.sent - e.qty); st.outstanding = Math.max(0, st.outstanding - e.qty); s.stock += e.qty; }
      if (e.type === 'Sale' && st) { st.sold = Math.max(0, st.sold - e.qty); st.outstanding += e.qty; s.sold = Math.max(0, s.sold - e.qty); s.revenue = Math.max(0, s.revenue - e.amountDue); if (e.paid === 'pending') st.amountOwed = Math.max(0, st.amountOwed - e.amountDue); if (s.chStats['Consignment']) { s.chStats['Consignment'].txns = Math.max(0, s.chStats['Consignment'].txns - 1); s.chStats['Consignment'].units = Math.max(0, s.chStats['Consignment'].units - e.qty); s.chStats['Consignment'].revenue = Math.max(0, s.chStats['Consignment'].revenue - e.amountDue); } }
      if (e.type === 'Return' && st) { st.returned = Math.max(0, st.returned - e.qty); st.outstanding += e.qty; if (e.status === 'restocked') s.stock = Math.max(0, s.stock - e.qty); }
      e.voided = true;
      // Decision #4: keep invoiceId/invoiceNum across the void (so unvoid restores
      // the link) and never auto-un-pay the invoice. maybeAutoPayInvoiceForLedger
      // already excludes voided sales from its "all paid?" check.
      if (e.type === 'Sale' && e.invoiceNum) showToast(`Sale was on invoice ${e.invoiceNum}`, 'warn', 4000);
      syncLedgerVoid(e, true);
      showToast('Consignment entry voided — effects reversed (Sheets row delete queued)', 'warn');
    } else {
      // UNVOID consignment entry
      if (e.type === 'Shipment' && st) { st.sent += e.qty; st.outstanding += e.qty; s.stock = Math.max(0, s.stock - e.qty); }
      if (e.type === 'Sale' && st) { st.sold += e.qty; st.outstanding = Math.max(0, st.outstanding - e.qty); s.sold += e.qty; s.revenue += e.amountDue; if (e.paid === 'pending') st.amountOwed += e.amountDue; if (!s.chStats['Consignment']) s.chStats['Consignment'] = { txns: 0, units: 0, revenue: 0 }; s.chStats['Consignment'].txns++; s.chStats['Consignment'].units += e.qty; s.chStats['Consignment'].revenue += e.amountDue; }
      if (e.type === 'Return' && st) { st.returned += e.qty; st.outstanding = Math.max(0, st.outstanding - e.qty); if (e.status === 'restocked') s.stock += e.qty; }
      e.voided = false;
      syncLedgerVoid(e, false);
      showToast('Consignment entry unvoided — effects restored (Sheets row restore queued)');
    }
  }

  closeM('edit-entry');
  renderAll(); updateDash(); saveState(activeBook);
}

// ── RESET
async function resetBookData() {
  const book = getBook();
  if (!(await confirmDialog(`Reset ALL data for "${book.title}"? Orders, history and consignment will be cleared. Your Google Sheet backup is untouched.`, { okLabel: 'Continue', danger: true }))) return;
  if (!(await confirmDialog('Last chance — this cannot be undone. Reset now?', { okLabel: 'Reset everything', danger: true }))) return;
  states[activeBook] = defaultState(book); lastSavedHashes[activeBook] = '';
  renderAll(); saveState(activeBook); showToast('✓ Book data reset. Sheet backup untouched.', 'warn', 4000);
}

let _sheetsRestoreData = null;

function parseAndValidateDate(rawDate) {
  if (!rawDate) return today();
  if (rawDate instanceof Date) {
    return !isNaN(rawDate.getTime()) ? rawDate.toISOString().split('T')[0] : today();
  }
  let dStr = String(rawDate).trim();
  if (!dStr) return today();

  if (dStr.includes('T')) {
    dStr = dStr.split('T')[0];
  }

  const d = new Date(dStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return today();
}

async function restoreBookDataFromSheets() {
  if (!sheetsUrl) {
    showToast('Connect Google Sheets first in the Sheets tab.', 'warn');
    return;
  }
  const book = getBook();

  const syncBtn = $('d-restore-sheets-btn');
  let originalBtnHtml = '';
  if (syncBtn) {
    originalBtnHtml = syncBtn.innerHTML;
    syncBtn.disabled = true;
    syncBtn.innerHTML = '<span class="spinner"></span>Syncing…';
  }

  showToast('Fetching data from Google Sheets...', 'ok', 10000);
  try {
    const url = sheetsUrl + (sheetsUrl.includes('?') ? '&' : '?') + 'action=getBookData&book=' + encodeURIComponent(book.title);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json().catch(() => null);
    if (!data) {
      throw new Error('Invalid JSON response from Google Sheets');
    }
    if (data.service && !data.rows) {
      if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = originalBtnHtml; }
      await confirmDialog(
        'Outdated Google Apps Script detected. To restore data from Google Sheets, you must redeploy your Apps Script.\n\n' +
        '1. Go to the Sheets tab.\n' +
        '2. Copy the latest code.\n' +
        '3. Create a NEW deployment in Google Sheets.\n' +
        '4. Paste the new Web App URL under the Sheets tab and try again.',
        { title: 'Update Apps Script Required', okLabel: 'OK' }
      );
      return;
    }
    if (data.error) {
      throw new Error(data.error);
    }

    const rows = data.rows || [];
    if (!rows.length) {
      showToast('No records found in Google Sheet for this book', 'warn');
      if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = originalBtnHtml; }
      return;
    }

    // Save parsed data globally for the confirm call
    _sheetsRestoreData = { book, rows };

    // Detect duplicate event IDs inside the spreadsheet rows
    const seenIds = new Set();
    const duplicateIds = new Set();
    rows.forEach(r => {
      const id = r._eventId || r['Event/Num'];
      if (id && id !== '—') {
        if (seenIds.has(id)) {
          duplicateIds.add(id);
        } else {
          seenIds.add(id);
        }
      }
    });

    // Update Modal Elements for Sheets Restore Preview
    const modalTitle = $('import-modal-title');
    if (modalTitle) modalTitle.textContent = `Restore "${book.title}" from Google Sheets`;

    const summary = $('import-summary');
    if (summary) {
      let summaryText = `Found <strong>${rows.length} records</strong> (sales and consignment events) in sheet — review below then confirm.`;
      if (duplicateIds.size > 0) {
        summaryText += `<br><span style="color:var(--amber);font-weight:600;">⚠ Note: ${duplicateIds.size} duplicate event/order IDs detected in the spreadsheet (marked below). Only the last entry for each ID will be imported.</span>`;
      }
      summary.innerHTML = summaryText;
    }

    const warnBox = $('import-warning-box');
    if (warnBox) {
      warnBox.style.background = 'var(--red-bg)';
      warnBox.style.borderLeftColor = 'var(--red)';
      warnBox.style.color = 'var(--red)';
      warnBox.innerHTML = `⚠ Warning: Confirming this restore will <strong>OVERWRITE</strong> your entire local database state (sales, history, consignment ledger) for this book with the backup from Google Sheets.`;
    }

    const confirmBtn = $('import-confirm-btn');
    if (confirmBtn) {
      confirmBtn.setAttribute('onclick', 'confirmRestoreBookDataFromSheets()');
      confirmBtn.innerHTML = `Restore database (${rows.length} rows)`;
    }

    // Build preview table rows
    $('import-preview-body').innerHTML = rows.map(r => {
      const type = r.Type || 'order';
      const eventNum = r['Event/Num'] || '—';
      const date = parseAndValidateDate(r.Date);
      const chan = r['Store/Chan'] || '—';
      const qty = parseInt(r.Qty) || 0;
      const price = parseFloat(r['Price/Rate']) || 0;
      const total = parseFloat(r['Total/Amount']) || 0;
      const notes = r.Notes || '—';
      const status = r.Status || 'OK';

      const isDuplicate = duplicateIds.has(r._eventId || r['Event/Num']);

      let badge = type === 'order'
        ? '<span class="pill green" style="font-size:10px;">Direct</span>'
        : `<span class="pill ${status === 'pending' ? 'amber' : 'blue'}" style="font-size:10px;">Consign: ${r['Event/Num']}</span>`;

      if (isDuplicate) {
        badge += ' <span class="pill red" style="font-size:10px;margin-left:4px;" title="Duplicate record found in the sheet. Only the last occurrence will be kept.">⚠️ Duplicate</span>';
      }

      return `
        <tr style="${isDuplicate ? 'background:rgba(255,107,107,0.05);' : ''}">
          <td class="mono">${escapeHtml(eventNum)}</td>
          <td style="font-size:12px;color:var(--text3);">${fmtD(date)}</td>
          <td>${escapeHtml(chan)}</td>
          <td class="r">${qty}</td>
          <td class="r">${book.currency}${price.toFixed(2)}</td>
          <td class="r" style="font-weight:600;">${book.currency}${total.toFixed(2)}</td>
          <td style="font-size:11px;color:var(--text3);">${escapeHtml(notes)}</td>
          <td>${badge}</td>
        </tr>`;
    }).join('');

    openM('import');
  } catch (err) {
    console.error('Sheets restore failed:', err);
    showToast('Restore failed: ' + err.message, 'err');
  } finally {
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.innerHTML = originalBtnHtml;
    }
  }
}

async function confirmRestoreBookDataFromSheets() {
  if (!_sheetsRestoreData || !_sheetsRestoreData.rows) return;
  const { book, rows } = _sheetsRestoreData;
  const s = getState();

  showToast('Restoring database...', 'ok', 10000);
  try {
    // Keep existing stores metadata (contact info, etc.) but reset counters
    const existingStores = [...(s.stores || [])];
    existingStores.forEach(st => {
      st.sent = 0;
      st.sold = 0;
      st.returned = 0;
      st.outstanding = 0;
      st.amountOwed = 0;
    });

    const newHist = [];
    const newLedger = [];
    const newStores = [...existingStores];
    const newDoneIds = [];

    // Helper to find or create a store by name
    function getOrCreateStore(storeName, rowRate) {
      let st = newStores.find(x => x.name.toLowerCase() === storeName.toLowerCase());
      if (!st) {
        st = {
          id: Date.now() + Math.floor(Math.random() * 1000000),
          name: storeName,
          contact: '', email: '', phone: '', address: '', city: '', region: '', postal: '', country: '', website: '', terms: '',
          rate: parseFloat(rowRate) || 40,
          notes: '',
          sent: 0,
          sold: 0,
          returned: 0,
          outstanding: 0,
          amountOwed: 0
        };
        newStores.push(st);
      }
      return st;
    }

    // De-duplicate sheet rows: process in reverse and keep only the last write for each event ID
    const deduplicatedRows = [];
    const seenIds = new Set();
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const id = row._eventId || row['Event/Num'];
      if (id && id !== '—') {
        if (seenIds.has(id)) {
          continue; // skip older occurrence
        }
        seenIds.add(id);
      }
      deduplicatedRows.unshift(row);
    }

    // Process sheet rows (they are in chronological order)
    deduplicatedRows.forEach((row, index) => {
      const sheetsId = row._eventId || '';
      const date = parseAndValidateDate(row.Date);
      const type = row.Type;
      const qty = parseInt(row.Qty) || 0;
      const notes = row.Notes || '';
      const status = row.Status || 'OK';
      const invoiceNum = row.Invoice || '';

      if (sheetsId) {
        newDoneIds.push(sheetsId);
      }

      if (type === 'order') {
        const num = row['Event/Num'] || 'IMP-' + Date.now();
        const chan = row['Store/Chan'] || 'Website';
        const price = parseFloat(row['Price/Rate']) || 0;

        let payment = null;
        const nativeCur = getBookCurrencyCode(book);
        const rowCur = normalizeCurrencyCode(row.Currency || nativeCur, 'CAD');
        if (rowCur !== nativeCur) {
          const totalAmount = parseFloat(row['Total/Amount']) || (qty * price);
          const cadEquiv = parseFloat(row['CAD Equivalent']) || totalAmount;
          payment = {
            currency: rowCur,
            amount: totalAmount,
            rate: totalAmount > 0 ? (cadEquiv / totalAmount) : null,
            convertedTotal: cadEquiv
          };
        } else {
          payment = {
            currency: nativeCur,
            amount: qty * price,
            rate: null,
            convertedTotal: qty * price
          };
        }

        newHist.unshift({
          num,
          chan,
          qty,
          price,
          after: 0,
          notes,
          date,
          payment,
          enteredBy: 'Publisher',
          sheetsId
        });
      } else if (type === 'consignment') {
        const event = row['Event/Num']; // 'Shipment', 'Sale', 'Return'
        const storeName = row['Store/Chan'];
        const rate = parseFloat(row['Price/Rate']) || 0;
        const amountDue = parseFloat(row['Total/Amount']) || 0;
        const st = getOrCreateStore(storeName, rate);

        const ledgerId = Date.now() + index;

        newLedger.push({
          id: ledgerId,
          storeId: st.id,
          storeName: st.name,
          type: event,
          date,
          qty,
          rate,
          amountDue,
          paid: (event === 'Sale') ? (status === 'pending' ? 'pending' : 'paid') : 'n/a',
          notes,
          status,
          sheetsId,
          invoiceNum
        });

        if (event === 'Sale') {
          newHist.unshift({
            num: 'CS-' + ledgerId,
            chan: 'Consignment',
            qty,
            price: qty > 0 ? (amountDue / qty) : 0,
            after: 0,
            notes: st.name,
            date,
            sheetsId,
            consignmentLink: true,
            invoiceNum
          });
        }
      }
    });

    // Link ledger entries to existing invoices if matching invoice number is found
    newLedger.forEach(e => {
      if (e.type === 'Sale' && e.invoiceNum) {
        const inv = (s.invoices || []).find(i => String(i.num).toLowerCase() === String(e.invoiceNum).toLowerCase());
        if (inv) {
          e.invoiceId = inv.id;
        }
      }
    });

    s.hist = newHist;
    s.ledger = newLedger;
    s.stores = newStores;
    s.doneIds = newDoneIds;

    // Recalculate book units sold and revenue
    s.sold = 0;
    s.revenue = 0;
    s.chStats = {};

    newHist.forEach(h => {
      if (h.voided) return;

      const chan = h.chan || 'Manual';
      if (!s.chStats[chan]) s.chStats[chan] = { txns: 0, units: 0, revenue: 0 };
      s.chStats[chan].txns++;
      s.chStats[chan].units += (h.qty || 0);
      s.chStats[chan].revenue += (h.qty || 0) * (h.price || 0);

      if (h.gratuity) return;
      s.sold += (h.qty || 0);
      s.revenue += (h.qty || 0) * (h.price || 0);
    });

    // Recalculate store amountOwed
    newStores.forEach(st => {
      st.amountOwed = 0;
    });
    newLedger.forEach(e => {
      if (e.voided || e.type !== 'Sale' || !e.storeId) return;
      const st = newStores.find(x => x.id === e.storeId);
      if (st && e.status === 'pending') {
        st.amountOwed += (e.amountDue || 0);
      }
    });

    s.stock = deriveOnHand(s, book);
    recomputeAfters(s, book);
    reconcileConsignmentInvoiceLinks(s);

    await saveState(activeBook);
    renderAll();
    updateDash();
    closeM('import');

    showToast(`✓ Restored ${newHist.filter(h => !h.consignmentLink).length} sales and ${newLedger.length} consignment events from Google Sheets!`);
    _sheetsRestoreData = null;
  } catch (err) {
    console.error('Sheets restore confirmation failed:', err);
    showToast('Restore failed: ' + err.message, 'err');
  }
}
window.confirmRestoreBookDataFromSheets = confirmRestoreBookDataFromSheets;

// ── MODAL HELPERS
// Snapshot of a modal's field values, taken when it opens — used by the
// backdrop/Esc close guard to detect unsaved edits.
let _modalSnapshots = {};
function _modalFieldSig(id) {
  const el = $('m-' + id); if (!el) return '';
  return Array.from(el.querySelectorAll('input,select,textarea'))
    .map(f => (f.type === 'checkbox' || f.type === 'radio') ? (f.checked ? '1' : '0') : (f.value || ''))
    .join('');
}
function _prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
let _modalReturnFocus = null;
export function openM(id) {
  const el = $('m-' + id); if (!el) return;
  el.classList.remove('closing');
  clearFieldErrors(el);
  el.style.display = 'flex';
  const d = id === 'send-books' ? 'send-date' : id === 'record-sale' ? 'sale-date' : 'ret-date';
  if ($(d)) $(d).value = today();
  // Snapshot AFTER open* helpers and date defaults have populated fields, so a
  // later mismatch means the *user* changed something.
  _modalSnapshots[id] = _modalFieldSig(id);
  // Move keyboard focus into the dialog and remember where to send it back, so
  // keyboard/screen-reader users aren't stranded on the (now-inert) page behind.
  _modalReturnFocus = document.activeElement;
  const focusable = el.querySelector('input:not([type=hidden]),select,textarea,button,[tabindex]:not([tabindex="-1"])');
  if (focusable) setTimeout(() => { try { focusable.focus(); } catch { } }, 0);
}
export function closeM(id) {
  const el = $('m-' + id); if (!el) return;
  el.dispatchEvent(new Event('modal-close'));
  delete _modalSnapshots[id];
  // Restore focus to whatever opened the modal (if it's still around).
  if (_modalReturnFocus && el.contains(document.activeElement)) {
    try { _modalReturnFocus.focus(); } catch { }
  }
  _modalReturnFocus = null;
  if (el.classList.contains('closing')) return;
  if (_prefersReducedMotion()) { el.style.display = 'none'; clearFieldErrors(el); return; }
  el.classList.add('closing');
  let t;
  const done = () => {
    el.style.display = 'none';
    el.classList.remove('closing');
    clearFieldErrors(el);
    el.removeEventListener('animationend', done);
    clearTimeout(t);
  };
  t = setTimeout(done, 240); // fallback if animationend doesn't fire
  el.addEventListener('animationend', done);
}
// Close a modal, but if the user has unsaved edits, confirm first. Used by the
// backdrop-click and Esc handlers so a stray tap can't silently lose data.
async function attemptCloseModal(id) {
  if (_modalSnapshots[id] !== undefined && _modalFieldSig(id) !== _modalSnapshots[id]) {
    if (!(await confirmDialog('Discard your unsaved changes?',
      { okLabel: 'Discard', cancelLabel: 'Keep editing', danger: true }))) return;
  }
  closeM(id);
}

// ── INLINE FORM VALIDATION ──────────────────────────────────────────────
function fieldError(id, msg) {
  const el = $(id); if (!el) return;
  const fg = el.closest('.form-group') || el.parentElement;
  if (fg) {
    fg.classList.add('invalid');
    let e = fg.querySelector('.field-error');
    if (!e) { e = document.createElement('div'); e.className = 'field-error'; fg.appendChild(e); }
    e.textContent = msg;
  }
  el.setAttribute('aria-invalid', 'true');
}
function clearFieldError(el) {
  const fg = el && el.closest && el.closest('.form-group');
  if (fg) {
    fg.classList.remove('invalid');
    const e = fg.querySelector('.field-error'); if (e) e.remove();
  }
  if (el && el.removeAttribute) el.removeAttribute('aria-invalid');
}
function clearFieldErrors(scope) {
  const root = scope || document;
  root.querySelectorAll('.form-group.invalid').forEach(fg => {
    fg.classList.remove('invalid');
    const e = fg.querySelector('.field-error'); if (e) e.remove();
  });
  root.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
}
// rules: [{ id, test:(value, el)=>bool, msg }]. Multiple rules may target the
// same field; the first failing rule wins and later ones for it are skipped.
// Returns true when every field passes.
function validateFields(rules) {
  let firstBad = null; const failed = new Set();
  rules.forEach(r => {
    const el = $(r.id); if (!el || failed.has(r.id)) return;
    if (r.test(el.value, el)) { clearFieldError(el); }
    else { fieldError(r.id, r.msg); failed.add(r.id); if (!firstBad) firstBad = el; }
  });
  if (firstBad && firstBad.focus) firstBad.focus();
  return failed.size === 0;
}

// ── BUTTON LOADING STATE ────────────────────────────────────────────────
// Disables the clicked button and shows a spinner while an async op runs, so
// users can't double-submit. Pass the click event; safe to call with none.
async function withButtonLoading(ev, busyLabel, fn) {
  const btn = ev && (ev.currentTarget ||
    (ev.target && ev.target.closest && ev.target.closest('button')));
  let original;
  if (btn) { original = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>${busyLabel}`; }
  try { return await fn(); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = original; } }
}
window.withButtonLoading = withButtonLoading;
export function addLog(lid, msg, type = '') { const el = $(lid); el.style.display = 'block'; const s = document.createElement('span'); s.className = 'log-line ' + type; s.textContent = new Date().toLocaleTimeString() + ' · ' + msg; el.appendChild(s); el.scrollTop = el.scrollHeight; }

// ── GOOGLE SHEETS
function updateSheetsBadge() {
  [$('sheets-badge'), $('sheets-badge2')].forEach(b => {
    if (!b) return;
    b.textContent = sheetsUrl ? '📊 Sheets: live' : '📊 Sheets: not set up';
    b.className = sheetsUrl ? 'sheets-badge' : 'sheets-badge off';
  });
  const openLink = $('sheets-open-link'); if (openLink) { if (sheetsSpreadsheetUrl) { openLink.href = sheetsSpreadsheetUrl; openLink.style.display = ''; } else openLink.style.display = 'none'; }
  const cardLink = $('open-sheet-link'); if (cardLink) { if (sheetsSpreadsheetUrl) { cardLink.href = sheetsSpreadsheetUrl; cardLink.style.display = ''; } else cardLink.style.display = 'none'; }
  // Sidebar footer "Open Google Sheet" (publisher app-shell) — mirror sheets-open-link.
  const sideLink = $('side-sheets-open'); if (sideLink) { if (sheetsSpreadsheetUrl) { sideLink.href = sheetsSpreadsheetUrl; sideLink.style.display = ''; } else sideLink.style.display = 'none'; }
}
function normalizeAppsScriptUrl(rawUrl) {
  const cleaned = (rawUrl || '').trim();
  if (!cleaned) return '';
  try {
    const u = new URL(cleaned);
    if (!/script\.google\.com$/i.test(u.hostname)) return '';
    // Support URLs with /u/index/ segments (multi-account login)
    const m = u.pathname.match(/\/macros\/(?:u\/\d+\/)?s\/([^/]+)\/(exec|dev)/i);
    if (!m) return '';
    const deploymentId = m[1];
    const type = m[2];

    u.pathname = `/macros/s/${deploymentId}/${type}`;
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch (_) {
    return '';
  }
}
async function probeSheetsConnection(url) {
  // 1. Try a GET handshake first (Most reliable for initial verification)
  try {
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json().catch(() => null);
      // Match any deployed version (…-v2, -v4, …) so a server bump doesn't
      // silently fail the fast GET handshake and fall back to a POST that
      // writes a throwaway "Connection Probe" row.
      if (json && typeof json.service === 'string' && json.service.indexOf('lyrical-sheets-webhook') === 0) {
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

async function connectSheets() {
  const rawUrl = $('sheets-url-input').value.trim(), spreadUrl = ($('sheets-spreadsheet-input').value || '').trim();
  const normalizedUrl = normalizeAppsScriptUrl(rawUrl);
  if (!normalizedUrl) { showToast('Paste a deployed Web App URL (…/macros/s/<id>/exec)', 'warn'); return; }
  if (rawUrl.includes('/dev')) showToast('Using /exec endpoint for public sync (recommended).', 'warn', 3000);
  try {
    const info = await probeSheetsConnection(normalizedUrl);
    showToast(`✓ Connection verified: ${info.sheetName || 'Active'}`);
  } catch (e) {
    // If the error is 'Failed to fetch', it's likely a CORS issue.
    // Since we have a no-cors fallback for actual data delivery,
    // let's show a helpful warning but still allow the connection.
    if ((e && e.message && e.message.includes('fetch')) || !navigator.onLine) {
      showToast('⚠ Connection unverified (CORS). Link saved anyway — try a test row.', 'warn', 5000);
    } else {
      showToast(`Connection error: ${e.message || 'Unknown'}`, 'err', 4000);
      return;
    }
  }
  sheetsUrl = normalizedUrl;
  localStorage.setItem('lm-sheets-url', normalizedUrl);
  localStorage.setItem('lm-last-sheets-url', normalizedUrl);
  // Share the endpoint so artist sessions on other devices can send the
  // approval-needed email when they submit a payment/expense.
  notifyUrl = normalizedUrl; localStorage.setItem('lm-notify-url', normalizedUrl);
  await window._fbSaveSettings('notifyEndpoint', { url: normalizedUrl });
  if (spreadUrl) {
    sheetsSpreadsheetUrl = spreadUrl;
    localStorage.setItem('lm-sheets-spreadsheet-url', spreadUrl);
    localStorage.setItem('lm-last-spreadsheet-url', spreadUrl);
  } else {
    sheetsSpreadsheetUrl = '';
    localStorage.removeItem('lm-sheets-spreadsheet-url');
  }
  showSheetsConnected();
  showToast('✓ Google Sheets connected and verified!');
}
async function disconnectSheets() {
  if (!(await confirmDialog('Disconnect Google Sheets?', { okLabel: 'Disconnect', danger: true }))) return;

  // Only preserve the Google Sheets spreadsheet URL, clear the Web App URL
  const setupUrlInput = $('sheets-url-input');
  if (setupUrlInput) setupUrlInput.value = '';
  const setupSpreadsheetInput = $('sheets-spreadsheet-input');
  if (setupSpreadsheetInput) setupSpreadsheetInput.value = sheetsSpreadsheetUrl;

  sheetsUrl = ''; sheetsSpreadsheetUrl = ''; notifyUrl = '';
  localStorage.removeItem('lm-sheets-url');
  localStorage.removeItem('lm-sheets-spreadsheet-url');
  localStorage.removeItem('lm-sheets-secret');
  localStorage.removeItem('lm-notify-url');
  await window._fbSaveSettings('notifyEndpoint', { url: '' });
  $('sheets-setup-card').style.display = '';
  $('sheets-connected-card').style.display = 'none';
  const warningEl = $('sheets-version-warning');
  if (warningEl) warningEl.style.display = 'none';
  updateSheetsBadge();
  showToast('Sheets disconnected', 'warn');
}
function showSheetsConnected() {
  $('sheets-setup-card').style.display = 'none';
  $('sheets-connected-card').style.display = '';
  $('sheets-url-display').textContent = sheetsUrl;
  updateSheetsBadge();
  checkSheetsVersion();
}

async function checkSheetsVersion() {
  const warningEl = $('sheets-version-warning');
  const versionEl = $('sheets-deployed-version');
  const expectedEl = $('sheets-expected-version');
  if (expectedEl) expectedEl.textContent = EXPECTED_SCRIPT_VERSION;
  const isTest = isTestBookId(activeBook);
  if (isTest) {
    if (warningEl) warningEl.style.display = 'none';
    if (versionEl) versionEl.textContent = EXPECTED_SCRIPT_VERSION;
    return;
  }
  if (!warningEl || !sheetsUrl) return;

  try {
    const res = await fetch(sheetsUrl);
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.service && data.service.indexOf('lyrical-sheets-webhook') === 0) {
        const deployedVer = data.scriptVersion || 'unknown';
        if (deployedVer !== EXPECTED_SCRIPT_VERSION) {
          if (versionEl) versionEl.textContent = deployedVer;
          warningEl.style.display = 'block';
        } else {
          warningEl.style.display = 'none';
        }
      }
    }
  } catch (e) {
    console.warn('Failed to verify sheets script version:', e);
  }
}

// ── GOOGLE SHEETS SANDBOX SIMULATOR (TEST PROFILE) ──
let activeSimTab = 'Overview';

async function simulatePostToSheets(body) {
  // Simulate network latency (800ms)
  await new Promise(resolve => setTimeout(resolve, 800));

  const payload = body;
  const action = (payload.action || (payload.payload && payload.payload.action) || 'add').toString().toLowerCase();

  let mockData = {};
  try {
    mockData = JSON.parse(localStorage.getItem('lm-mock-sheet-data')) || {};
  } catch (e) {
    mockData = {};
  }

  if (!mockData['Overview']) mockData['Overview'] = [];
  if (!mockData['test1']) mockData['test1'] = [];

  const headers = [
    '_eventId', 'Date', 'Book', 'Type', 'Event/Num', 'Store/Chan',
    'Qty', 'Currency', 'Price/Rate', 'Total/Amount', 'CAD Equivalent',
    'Status', 'Notes', 'Invoice'
  ];

  if (action === 'reset' || action === 'rebuild') {
    Object.keys(mockData).forEach(k => {
      mockData[k] = [];
    });
    localStorage.setItem('lm-mock-sheet-data', JSON.stringify(mockData));
    if (typeof renderMockSpreadsheet === 'function') renderMockSpreadsheet();
    return { ok: true, reset: true, replaced: 0, removed: 0 };
  }

  let rows = [];
  if (action === 'batch') {
    rows = (payload.payload && payload.payload.rows) || payload.rows || [];
  } else if (action === 'notifypublisher') {
    return { ok: true, notified: true };
  } else if (action === 'emailauthor') {
    return { ok: true, emailed: true, via: 'mock-provider' };
  } else {
    rows = [payload.payload || payload];
  }

  let added = 0, deleted = 0, voided = 0, replaced = 0;

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i] || {};
    const rowAction = String(item.action || action || 'add').toLowerCase();
    const stableId = item.sheetsId || item.id || '';

    // Deletions / Voids
    if (rowAction === 'void' || rowAction === 'delete' || /VOID|CANCEL/i.test(String(item.status || ''))) {
      if (stableId) {
        Object.keys(mockData).forEach(tab => {
          const origLen = mockData[tab].length;
          mockData[tab] = mockData[tab].filter(r => r[0] !== stableId);
          deleted += (origLen - mockData[tab].length);
        });
        if (rowAction === 'void' || /VOID|CANCEL/i.test(String(item.status || ''))) {
          voided++;
        }
      }
      continue;
    }

    // Upsert: delete existing first
    if (stableId) {
      Object.keys(mockData).forEach(tab => {
        const origLen = mockData[tab].length;
        mockData[tab] = mockData[tab].filter(r => r[0] !== stableId);
        if (origLen > mockData[tab].length) replaced++;
      });
    }

    const currency = item.currency || item.paymentCurrency || 'EUR';
    const total = item.amountDue ?? item.total ?? 0;

    let cad = '';
    if (currency === 'CAD') {
      cad = total;
    } else if (item.convertedTotal !== undefined && item.convertedTotal !== '' && item.convertedTotal !== null) {
      cad = item.convertedTotal;
    } else if (item.paymentRate && total !== '') {
      cad = Math.round(total * parseFloat(item.paymentRate) * 100) / 100;
    } else {
      cad = Math.round(total * 1.5 * 100) / 100; // Mock exchange rate
    }

    const row = new Array(headers.length).fill('');
    row[0] = stableId;
    row[1] = item.date ?? '';
    row[2] = item.book ?? '';
    row[3] = item.type ?? '';
    row[4] = item.event ?? item.num ?? '';
    row[5] = item.store ?? item.chan ?? '';
    row[6] = item.qty ?? '';
    row[7] = currency;
    row[8] = item.rate ?? item.price ?? '';
    row[9] = total;
    row[10] = cad;
    row[11] = item.status ?? 'OK';
    row[12] = item.notes ?? '';
    row[13] = item.invoiceNum ?? '';

    const rawName = item.book ? String(item.book).trim() : 'Overview';
    let sheetName = rawName.replace(/[:*?/\[\]\\]/g, '').substring(0, 95);
    if (!sheetName) sheetName = 'Overview';

    if (!mockData[sheetName]) mockData[sheetName] = [];
    mockData[sheetName].push(row);

    if (sheetName !== 'Overview') {
      if (!mockData['Overview']) mockData['Overview'] = [];
      mockData['Overview'].push(row);
    }

    added++;
  }

  localStorage.setItem('lm-mock-sheet-data', JSON.stringify(mockData));
  if (typeof renderMockSpreadsheet === 'function') renderMockSpreadsheet();

  return { ok: true, count: rows.length, added, deleted, voided, replaced };
}

function renderMockSpreadsheet() {
  const headers = [
    'Date', 'Book', 'Type', 'Event/Num', 'Store/Chan',
    'Qty', 'Currency', 'Price/Rate', 'Total/Amount', 'CAD Equivalent',
    'Status', 'Notes', 'Invoice'
  ];

  const headerRow = $('sim-sheet-headers');
  const rowsBody = $('sim-sheet-rows');
  const tabsContainer = $('sim-sheet-tabs');
  const countEl = $('sim-sheet-row-count');

  if (!headerRow || !rowsBody || !tabsContainer) return;

  // Render headers
  let headersHtml = `<th style="background:#22222e; color:rgba(255,255,255,0.3); font-weight:normal; text-align:center; padding:6px; border:1px solid rgba(255,255,255,0.08); width:30px; user-select:none;"></th>`;
  headers.forEach(h => {
    headersHtml += `<th style="padding:6px 10px; border:1px solid rgba(255,255,255,0.08); background:#22222e; color:rgba(255,255,255,0.7); font-weight:600; text-transform:uppercase; font-size:10px; letter-spacing:0.02em;">${h}</th>`;
  });
  headerRow.innerHTML = headersHtml;

  let mockData = {};
  try {
    mockData = JSON.parse(localStorage.getItem('lm-mock-sheet-data')) || {};
  } catch (e) {
    mockData = {};
  }

  if (!mockData['Overview']) mockData['Overview'] = [];
  if (!mockData['test1']) mockData['test1'] = [];

  if (!mockData[activeSimTab]) activeSimTab = 'Overview';

  // Render tabs
  const tabs = Object.keys(mockData);
  let tabsHtml = '';
  tabs.forEach(tab => {
    const isActive = tab === activeSimTab;
    const activeClass = isActive ? 'active' : '';
    tabsHtml += `
      <div onclick="selectSimSheetTab('${escapeHtml(tab)}')" class="mock-sheets-tab ${activeClass}">
        📁 ${escapeHtml(tab)}
      </div>`;
  });
  tabsContainer.innerHTML = tabsHtml;

  // Render rows
  const rows = mockData[activeSimTab] || [];
  if (countEl) countEl.textContent = `${rows.length} row${rows.length === 1 ? '' : 's'} synced`;

  if (rows.length === 0) {
    rowsBody.innerHTML = `
      <tr>
        <td colspan="${headers.length + 1}" style="text-align:center; padding:48px 24px; color:rgba(255,255,255,0.3); font-style:italic;">
          Spreadsheet tab is empty. Perform a transaction or click "Sync all data" above.
        </td>
      </tr>`;
    return;
  }

  let rowsHtml = '';
  rows.forEach((r, idx) => {
    const isEven = idx % 2 === 0;
    const rowBg = isEven ? '#15151b' : '#1a1a24';

    let cellsHtml = `<td style="background:#1d1d26; color:rgba(255,255,255,0.3); border:1px solid rgba(255,255,255,0.08); text-align:center; user-select:none; font-family:sans-serif; font-size:10px;">${idx + 1}</td>`;

    for (let c = 1; c < r.length; c++) {
      let val = r[c] ?? '';
      let style = `padding:6px 10px; border:1px solid rgba(255,255,255,0.05);`;

      if (c === 6 || c === 8 || c === 9 || c === 10) {
        style += ` text-align:right;`;
        if (typeof val === 'number') {
          val = val.toFixed(2);
        }
      }

      if (c === 11) {
        if (/VOID|CANCEL/i.test(String(val))) {
          style += ` color:#ef4444; font-weight:bold;`;
        } else if (/OK/i.test(String(val))) {
          style += ` color:#10b981;`;
        }
      }

      if (c === 2) {
        style += ` color:var(--gold3); font-weight:600;`;
      }

      if (c === 3) {
        if (val === 'Shipment') style += ` color:#3b82f6;`;
        else if (val === 'Sale' || val === 'Order') style += ` color:#10b981;`;
        else if (val === 'Return') style += ` color:#f59e0b;`;
      }

      cellsHtml += `<td style="${style}">${escapeHtml(String(val))}</td>`;
    }

    rowsHtml += `<tr style="background:${rowBg}; border-bottom:1px solid rgba(255,255,255,0.03); transition:background 0.15s;">${cellsHtml}</tr>`;
  });
  rowsBody.innerHTML = rowsHtml;
}

function selectSimSheetTab(tab) {
  activeSimTab = tab;
  renderMockSpreadsheet();
}

function clearSimulatedSheet() {
  if (confirm("Are you sure you want to clear the simulated spreadsheet? This will not affect your local app database.")) {
    localStorage.removeItem('lm-mock-sheet-data');
    activeSimTab = 'Overview';
    renderMockSpreadsheet();
    showToast("Simulated sheet cleared!");
  }
}

function updateSheetsTabUI() {
  const isTest = isTestBookId(activeBook);
  const simCard = $('sheets-simulated-card');
  const setupCard = $('sheets-setup-card');
  const connectedCard = $('sheets-connected-card');

  if (isTest) {
    if (simCard) simCard.style.display = 'block';
    if (setupCard) setupCard.style.display = 'none';
    if (connectedCard) connectedCard.style.display = 'none';
    renderMockSpreadsheet();
  } else {
    if (simCard) simCard.style.display = 'none';
    if (sheetsUrl) {
      if (setupCard) setupCard.style.display = 'none';
      if (connectedCard) connectedCard.style.display = 'block';
      const urlDisplay = $('sheets-url-display');
      if (urlDisplay) urlDisplay.textContent = sheetsUrl;
      const openBtn = $('open-sheet-link');
      if (openBtn) {
        if (sheetsSpreadsheetUrl) {
          openBtn.href = sheetsSpreadsheetUrl;
          openBtn.style.display = 'inline-flex';
        } else {
          openBtn.style.display = 'none';
        }
      }
    } else {
      if (setupCard) setupCard.style.display = 'block';
      if (connectedCard) connectedCard.style.display = 'none';
    }
  }
}

window.selectSimSheetTab = selectSimSheetTab;
window.clearSimulatedSheet = clearSimulatedSheet;
window.renderMockSpreadsheet = renderMockSpreadsheet;
window.updateSheetsTabUI = updateSheetsTabUI;

function testSheets() {
  if (!sheetsUrl) return;
  const btn = document.querySelector('[onclick="testSheets()"]');
  if (btn) { btn.textContent = 'Testing…'; btn.disabled = true; }
  // Use POST so verification works even when Apps Script has no doGet().
  syncToSheets({
    type: 'order',
    book: 'Test',
    date: today(),
    num: 'TEST-' + Date.now().toString().slice(-4),
    chan: 'Test',
    qty: 0,
    price: 0,
    total: 0,
    stockAfter: 0,
    notes: 'Connection test — check your sheet for this row'
  });
  showToast('✓ Test row sent — check your Google Sheet');
  checkSheetsVersion();
  setTimeout(() => { if (btn) { btn.textContent = 'Test connection'; btn.disabled = false; } }, 500);
}
// Sheets delivery engine (rebuilt): durable queue + retry + deterministic event IDs
const SHEETS_QUEUE_KEY = 'lm-sheets-write-queue-v2';
const SHEETS_LOG_KEY = 'lm-sheets-log-v2';
const MAX_SHEETS_RETRIES = 6;
const RETRY_BASE_MS = 1200;
let _sheetsQueue = JSON.parse(localStorage.getItem(SHEETS_QUEUE_KEY) || '[]');
let _sheetsWriting = false;
let sheetsLog = JSON.parse(localStorage.getItem(SHEETS_LOG_KEY) || '[]');

function persistSheetsQueue() { localStorage.setItem(SHEETS_QUEUE_KEY, JSON.stringify(_sheetsQueue)); }
function persistSheetsLog() { localStorage.setItem(SHEETS_LOG_KEY, JSON.stringify(sheetsLog)); }
function makeEventId() { return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }

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
  await Promise.all(Array.from(touched).map(bookId => saveState(bookId)));
  return { hist, ledger, transfers, books: touched.size };
}
window.backfillSheetsIds = backfillSheetsIds;

async function backfillAndResync() {
  if (!sheetsUrl) { showToast('Connect Google Sheets first', 'warn'); return; }
  if (!(await confirmDialog(
    'This repairs the Google Sheet in one pass:\n' +
    '1. Stamps a stable ID on every record missing one\n' +
    '2. Clears the sheet, then re-adds a clean copy of every live record\n\n' +
    'Result: duplicate rows disappear, CAD equivalents refill, and voided\n' +
    'entries drop off. Your app data is untouched. Continue?',
    { title: 'Repair legacy rows', okLabel: 'Continue' }
  ))) return;
  const counts = await backfillSheetsIds();
  showToast(`Stamped IDs on ${counts.hist + counts.ledger + counts.transfers} record(s) across ${counts.books} book(s)`);
  if (typeof pushAllToSheets === 'function') pushAllToSheets({ rebuild: true, skipConfirm: true });
}
window.backfillAndResync = backfillAndResync;
function retryDelayMs(attempt) { return Math.min(60000, RETRY_BASE_MS * Math.pow(2, Math.max(0, attempt - 1))); }

async function postToSheets(body, urlOverride) {
  const isTest = isTestBookId(activeBook);
  if (isTest) {
    return simulatePostToSheets(body);
  }
  const url = urlOverride || sheetsUrl;
  const payload = JSON.stringify(body);

  try {
    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: payload
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => null);
    if (data && data.ok) return data;
    if (data && data.error) throw new Error(data.error);
    return { ok: true };
  } catch (e) {
    // Fallback to no-cors for strict environments.
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: payload
    });
    return 'unknown';
  }
}

async function notifyPublisherSubmission(kind, data, summary) {
  // Prefer the local Sheet URL (publisher device); fall back to the shared
  // endpoint loaded from cloud settings (artist devices that never set up the
  // Sheet) so the approval email fires no matter who submitted.
  const url = sheetsUrl || notifyUrl;
  if (!url) return;
  try {
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
    }, url);
  } catch (e) {
    // Don't fail silently: a misconfigured/stale endpoint means the publisher
    // never learns a submission is waiting. Surface it so it can be fixed.
    console.warn('notifyPublisher failed', e);
    showToast('⚠ Submitted, but could not alert the publisher by email', 'warn', 4000);
  }
}

// Publisher-only: fire a harmless notifyPublisher probe so the whole approval-
// email chain (Web App reachable + MailApp authorised + correct deployment) can
// be confirmed end-to-end without staging a real submission.
async function sendTestNotification() {
  const url = sheetsUrl || notifyUrl;
  if (!url) { showToast('Connect your Google Sheet first', 'warn'); return; }
  const btn = $('test-notify-btn');
  const prev = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    const res = await postToSheets({
      version: 2,
      action: 'notifyPublisher',
      eventId: 'notify-test-' + Date.now(),
      payload: {
        action: 'notifyPublisher',
        kind: 'Test Notification',
        bookId: activeBook || '',
        bookTitle: 'Test — please ignore',
        authorEmail: '',
        submittedAt: new Date().toISOString(),
        summary: 'This is a test of the approval-notification email. If it reached your inbox, alerts are working.',
        data: { test: true }
      }
    }, url);
    if (res && res.ok && res.notified) {
      showToast('✓ Test email sent to lyricalmyricalbooks@gmail.com');
    } else {
      // no-cors fallback (res === 'unknown') can't read the response — the POST
      // went out but we can't confirm the send. Tell the user to check.
      showToast('Sent — check lyricalmyricalbooks@gmail.com to confirm', 'warn', 4500);
    }
  } catch (e) {
    showToast('⚠ Test failed: ' + (e.message || 'could not reach the notifier'), 'err', 5000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prev; }
  }
}
window.sendTestNotification = sendTestNotification;

// Publisher-only: email the book's artist a payment request via the connected
// Apps Script Web App (free Gmail send — no API key in the client). Triggered
// by the "Email artist for payment" button on the per-book dashboard.
async function emailArtistForPayment() {
  if (isAuthor()) { showToast('Publisher only', 'warn'); return; }
  if (!activeBook || activeBook === 'all') { showToast('Open a book first', 'warn'); return; }
  if (!sheetsUrl) { showToast('Connect your Google Sheet first to send email', 'warn'); return; }
  const book = getBook();
  const to = (book.authorEmail || '').trim();
  if (!to) { showToast('No artist email on file for this book', 'warn'); return; }
  if (!confirm(`Send a payment-request email to ${to}?`)) return;
  const title = book.title || activeBook;
  const subject = `Payment request — ${title}`;
  const body = [
    'Hi,',
    '',
    `This is a friendly reminder regarding outstanding payments for "${title}".`,
    'When you have a moment, please log in to the inventory app and submit or forward any payments due so the ledger stays up to date.',
    '',
    'Thank you,',
    'Lyricalmyrical Books'
  ].join('\n');
  const btn = $('d-email-artist-btn');
  const prev = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    await postToSheets({
      version: 2,
      action: 'emailAuthor',
      eventId: 'emailauthor-' + Date.now(),
      payload: { action: 'emailAuthor', to, bookId: activeBook, bookTitle: title, subject, body }
    });
    showToast('✓ Payment request sent to ' + to);
  } catch (e) {
    console.warn('emailAuthor failed', e);
    showToast('⚠ Could not send email', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prev; }
  }
}
window.emailArtistForPayment = emailArtistForPayment;

async function _processQueue() {
  if (_sheetsWriting || !_sheetsQueue.length || !sheetsUrl || !navigator.onLine) return;
  _sheetsWriting = true;
  const item = _sheetsQueue[0];
  try {
    const resp = await postToSheets({
      version: 2,
      eventId: item.id,
      action: item.payload && item.payload.action,
      sentAt: new Date().toISOString(),
      payload: item.payload
    });
    const replaced = resp && typeof resp.replaced === 'number' ? resp.replaced : 0;
    const removed = resp && typeof resp.removed === 'number' ? resp.removed : 0;
    const count = item.count || 1;
    let suffix = '';
    if (item.payload && (item.payload.action === 'delete' || item.payload.action === 'void')) {
      suffix = removed ? ` · removed ${removed}` : ' · row not found';
    } else if (replaced > 0) {
      suffix = ` · replaced ${replaced}`;
    }
    addSheetsLog(item.book, item.type, item.summary + suffix, 'ok');
    _sheetsQueue.shift();
    persistSheetsQueue();
    updateBulkProgress(count);
  } catch (e) {
    item.attempts = (item.attempts || 0) + 1;
    item.lastError = (e && e.message) || 'network error';
    item.nextTryAt = Date.now() + retryDelayMs(item.attempts);
    persistSheetsQueue();
    if (item.attempts >= MAX_SHEETS_RETRIES) {
      addSheetsLog(item.book, item.type, item.summary + ' [max retries reached]', 'err');
      _sheetsQueue.shift();
      persistSheetsQueue();
      updateBulkProgress(item.count || 1);
    } else {
      addSheetsLog(item.book, item.type, item.summary + ` [retry ${item.attempts}/${MAX_SHEETS_RETRIES}]`, 'retry');
    }
  }
  _sheetsWriting = false;
  const next = _sheetsQueue[0];
  if (next) {
    const wait = Math.max(250, (next.nextTryAt || 0) - Date.now());
    setTimeout(_processQueue, wait);
  }
}

function sheetPayloadWithBookAccent(payload) {
  if (!payload || payload.bookColor || !payload.book) return payload;
  const book = Object.values(BOOKS || {}).find(b => b && b.title === payload.book);
  return book && book.accent ? { ...payload, bookColor: book.accent } : payload;
}

export function syncToSheets(payload) {
  if (!sheetsUrl || !payload) return;
  const bookIdent = payload.book || payload.bookId || payload.id;
  if ((bookIdent && isTestBookId(bookIdent)) || (payload.bookObj && isTestBook(payload.bookObj))) {
    return;
  }
  payload = sheetPayloadWithBookAccent(payload);
  const action = payload.action;
  const typeLabel = action === 'reset' ? 'Rebuild'
    : payload.type === 'order' ? 'Order' : 'Consignment';
  const summary = action === 'reset' ? 'Clear sheet for rebuild'
    : action === 'delete' ? `${payload.type === 'order' ? (payload.num || 'order') : (payload.store || 'consignment')} · remove row`
      : payload.type === 'order' ? `${payload.num} · ${payload.chan} · ${payload.qty}×`
        : `${payload.store} · ${payload.event} · ${payload.qty}×`;
  // Use the record's own sheetsId as the queue id so the backend can match
  // and replace the row; fall back to a fresh id for first-time writes.
  const queueId = payload.sheetsId || makeEventId();
  _sheetsQueue.push({
    id: queueId,
    payload,
    summary,
    book: payload.book,
    type: typeLabel,
    attempts: 0,
    nextTryAt: Date.now()
  });
  persistSheetsQueue();
  addSheetsLog(payload.book, typeLabel, summary, 'queued');
  _processQueue();
}

function syncBatchToSheets(rows, label = 'Bulk sync') {
  if (!sheetsUrl || !Array.isArray(rows) || !rows.length) return;
  const filteredRows = rows.filter(row => {
    if (!row) return false;
    const bId = row.book || row.bookId || row.id;
    if (bId && isTestBookId(bId)) return false;
    if (row.bookObj && isTestBook(row.bookObj)) return false;
    return true;
  });
  if (!filteredRows.length) return;
  const rowsWithAccents = filteredRows.map(row => sheetPayloadWithBookAccent(row));
  _sheetsQueue.push({
    id: 'batch-' + makeEventId(),
    payload: { action: 'batch', rows: rowsWithAccents },
    summary: `${label} · ${rows.length} records`,
    book: 'All books',
    type: 'Batch',
    count: rows.length,
    attempts: 0,
    nextTryAt: Date.now()
  });
  persistSheetsQueue();
  addSheetsLog('All books', 'Batch', `${label} · ${rows.length} records`, 'queued');
  _processQueue();
}


let _isBulkSync = false;
let _bulkTotal = 0;
let _bulkDone = 0;
const SHEETS_BULK_BATCH_SIZE = 200;

// Cache the backend's advertised capabilities for this session so the rebuild
// flow can tell whether the deployed Apps Script understands the 'reset'
// action. An out-of-date backend would otherwise mistake the control message
// for a blank data row, so we only send it when support is confirmed.
let _sheetsCaps = null;
async function fetchSheetsCapabilities() {
  const isTest = isTestBookId(activeBook);
  if (isTest) {
    return { reset: true, batchSync: true };
  }
  if (_sheetsCaps) return _sheetsCaps;
  if (!sheetsUrl) return {};
  try {
    const res = await fetch(sheetsUrl);
    if (res.ok) {
      const data = await res.json().catch(() => null);
      // Only cache a backend that actually advertises capabilities. An older
      // deployment returns none — leave the cache empty so a retry after the
      // user redeploys can detect the new support without a page reload.
      if (data && data.capabilities) { _sheetsCaps = data.capabilities; return _sheetsCaps; }
    }
  } catch (_) { /* offline / CORS — treat as no advertised capabilities */ }
  return {};
}

// Build the Sheets payload for one in-app order (history) entry. Voided entries
// are never turned into rows — they are removed from the sheet instead.
function orderRowPayload(book, nativeCur, h) {
  const totalNative = h.qty * h.price;
  const cadEquiv = cadEquivalentForSale({ nativeCurrency: nativeCur, totalNative, payment: h.payment });
  return {
    type: 'order', book: book.title, date: h.date, num: h.num, chan: h.chan,
    qty: h.qty, price: h.price, total: totalNative, stockAfter: h.after,
    notes: h.notes || '',
    sheetsId: h.sheetsId || '',
    currency: nativeCur,
    paymentCurrency: normalizeCurrencyCode(h.payment?.currency || nativeCur, 'CAD'),
    paymentAmount: h.payment?.amount ?? totalNative,
    paymentRate: h.payment?.rate ?? '',
    convertedTotal: cadEquiv,
    status: 'OK'
  };
}


// Push every live record to Sheets.
//   • rebuild:true  → clear the managed sheets first (removes duplicates, stale
//     VOID rows and blank-CAD legacy rows), then re-add a clean copy. Requires a
//     backend that advertises the 'reset' capability; falls back to in-place.
//   • rebuild:false → in-place upsert by stable id; voided entries are deleted.
async function pushAllToSheets(opts = {}) {
  const { rebuild = false, skipConfirm = false } = opts;
  if (!sheetsUrl) { showToast('Connect Google Sheets first', 'warn'); return; }
  if (!skipConfirm) {
    const msg = rebuild
      ? 'Rebuild the Google Sheet from the app: this clears the current rows, then re-adds every live record so duplicates disappear, CAD equivalents refill, and voided entries drop off. Continue?'
      : 'This will enqueue all live records for all books, then deliver them with retry. Voided entries are removed from the sheet. Continue?';
    if (!(await confirmDialog(msg, { okLabel: 'Continue' }))) return;
  }

  const btn = $('push-all-btn');
  const bar = $('sync-progress-bar');
  const fill = $('sync-progress-fill');
  const stats = $('sync-stats');

  _isBulkSync = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Queueing...'; }
  if (bar) bar.style.display = 'block';
  if (stats) stats.style.display = 'block';
  if (fill) fill.style.width = '0%';

  // A true rebuild needs the backend to clear managed sheets first. Only ask for
  // that when the deployed script advertises support.
  const caps = await fetchSheetsCapabilities();
  const canBatch = !!caps.batchSync;
  let willReset = false;
  if (rebuild) {
    willReset = !!caps.reset;
    if (!willReset) {
      showToast('Redeploy your Apps Script to enable a full rebuild — resyncing in place for now', 'warn', 5000);
    }
  }

  const control = [];
  if (willReset) control.push({ action: 'reset', type: 'control', book: 'Overview' });

  const toSync = [];
  const deletions = [];
  Object.keys(BOOKS).forEach(bid => {
    const book = BOOKS[bid];
    if (isTestBook(book) || isTestBookId(bid)) return;
    const s = states[bid] || defaultState(BOOKS[bid]);
    const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
    (s.hist || []).forEach(h => {
      if (h.consignmentLink) return; // ledger is the canonical row
      if (h.voided) {
        // A reset empties the sheet, so only the in-place path needs an explicit
        // delete to clear a previously-synced row.
        if (!willReset && h.sheetsId) {
          deletions.push({ action: 'delete', type: 'order', book: book.title, sheetsId: h.sheetsId });
          if ((Number(h.shippingPaid || 0) || 0) > 0) deletions.push({ action: 'delete', type: 'shipping', book: book.title, sheetsId: h.sheetsId + '-shipping' });
        }
        return;
      }
      toSync.push(orderRowPayload(book, nativeCur, h));
      if ((Number(h.shippingPaid || 0) || 0) > 0) toSync.push(shippingPurchaseRowPayload(book, nativeCur, h));
    });
    (s.ledger || []).forEach(e => {
      const ledgerCur = normalizeCurrencyCode(book.currency, 'CAD');
      if (e.voided) {
        if (!willReset && e.sheetsId) deletions.push({ action: 'delete', type: 'consignment', book: book.title, sheetsId: e.sheetsId });
        return;
      }
      const totalNative = e.amountDue || 0;
      const cadEquiv = cadEquivalentForSale({ nativeCurrency: ledgerCur, totalNative });
      toSync.push({
        type: 'consignment', book: book.title, date: e.date, store: e.storeName,
        event: e.type, qty: e.qty, rate: e.rate, amountDue: totalNative,
        notes: e.notes || '', status: e.status || 'OK',
        invoiceNum: e.invoiceNum || '',
        sheetsId: e.sheetsId || '',
        currency: ledgerCur,
        convertedTotal: cadEquiv
      });
    });
  });

  const queue = control.concat(deletions, toSync);
  _bulkTotal = queue.length;
  _bulkDone = 0;

  if (_bulkTotal === 0) {
    showToast('No records found to sync', 'warn');
    _isBulkSync = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Sync all data'; }
    if (bar) bar.style.display = 'none';
    if (stats) stats.style.display = 'none';
    return;
  }

  if (stats) stats.textContent = `Queueing ${_bulkTotal} records...`;
  if (canBatch) {
    for (const row of control) syncToSheets(row);
    const dataRows = deletions.concat(toSync);
    for (let i = 0; i < dataRows.length; i += SHEETS_BULK_BATCH_SIZE) {
      syncBatchToSheets(dataRows.slice(i, i + SHEETS_BULK_BATCH_SIZE), rebuild ? 'Rebuild batch' : 'Sync batch');
    }
  } else {
    for (const row of queue) syncToSheets(row);
  }
  if (btn) btn.textContent = canBatch ? 'Syncing batches...' : 'Syncing...';
}

function updateBulkProgress(done = 1) {
  if (!_isBulkSync) return;
  _bulkDone += done;
  const pct = Math.min(100, (_bulkDone / _bulkTotal) * 100);
  const fill = $('sync-progress-fill');
  const stats = $('sync-stats');
  const btn = $('push-all-btn');

  if (fill) fill.style.width = pct + '%';
  if (stats) stats.textContent = `Syncing: ${_bulkDone} / ${_bulkTotal} (${Math.round(pct)}%)`;

  if (_bulkDone >= _bulkTotal) {
    _isBulkSync = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Sync all data'; }
    if (stats) stats.textContent = `✓ Queue processed: ${_bulkTotal} records.`;
    showToast(`✓ Sheets queue processed: ${_bulkTotal} records.`);
    setTimeout(() => {
      if (!_isBulkSync) {
        if ($('sync-progress-bar')) $('sync-progress-bar').style.display = 'none';
        if ($('sync-stats')) $('sync-stats').style.display = 'none';
      }
    }, 4000);
  }
}

function addSheetsLog(book, type, summary, status) {
  sheetsLog.unshift({ time: new Date().toLocaleTimeString(), book, type, summary, status });
  if (sheetsLog.length > 120) sheetsLog.pop();
  persistSheetsLog();
  renderSheetsLog();
}
let _syncLogPage = 0;
function renderSheetsLog() {
  const b = $('sheets-log-body');
  if (!b) return;
  if (!sheetsLog.length) {
    b.innerHTML = '<tr><td colspan="5" class="sheets-empty">No sync events yet.</td></tr>';
    return;
  }
  const PAGE_SIZE = 15;
  const totalPages = Math.ceil(sheetsLog.length / PAGE_SIZE);
  if (_syncLogPage >= totalPages) _syncLogPage = Math.max(0, totalPages - 1);
  const pageItems = sheetsLog.slice(_syncLogPage * PAGE_SIZE, (_syncLogPage + 1) * PAGE_SIZE);

  const labelFor = (st) => st === 'ok' ? 'Written' : st === 'unknown' ? 'Sent (unverified)' : st === 'queued' ? 'Queued' : st === 'retry' ? 'Retrying' : 'Failed';
  const classFor = (st) => st === 'ok' || st === 'unknown' ? 'ok' : st === 'queued' || st === 'retry' ? 'syncing' : 'err';
  const iconFor = (st) => st === 'ok' ? '✓' : st === 'unknown' ? '~' : st === 'queued' ? '…' : st === 'retry' ? '↻' : '⚠';

  let html = pageItems.map(l => `<tr>
      <td class="sheets-time">${l.time}</td>
      <td class="sheets-book">${l.book}</td>
      <td><span class="sheets-type">${l.type}</span></td>
      <td class="sheets-summary">${l.summary}</td>
      <td>
        <span class="log-status ${classFor(l.status)}"></span>
        <span class="sheets-status ${classFor(l.status)}">${iconFor(l.status)} ${labelFor(l.status)}</span>
      </td>
    </tr>`).join('');

  if (totalPages > 1) {
    html += `<tr><td colspan="5" class="sheets-pager">
      <button class="btn sm" onclick="_syncLogPage=Math.max(0,_syncLogPage-1);renderSheetsLog()" ${_syncLogPage === 0 ? 'disabled' : ''}>← Prev</button>
      <span class="sheets-page-label">Page ${_syncLogPage + 1} of ${totalPages}</span>
      <button class="btn sm" onclick="_syncLogPage=Math.min(${totalPages - 1},_syncLogPage+1);renderSheetsLog()" ${_syncLogPage === totalPages - 1 ? 'disabled' : ''}>Next →</button>
    </td></tr>`;
  }
  b.innerHTML = html;
}
// The Apps Script source (~50 KB) is no longer embedded in index.html — it is
// fetched on demand the first time the "Connect your Google Sheet" tab opens,
// keeping that weight off every page load. Assigned via textContent so the raw
// source needs no HTML-escaping. _gasCodeLoaded guards against re-fetching.
let _gasCodeLoaded = false;
async function loadGasCode() {
  if (_gasCodeLoaded) return;
  const el = $('gas-code'); if (!el) return;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}gas-code.txt?v=${encodeURIComponent(EXPECTED_SCRIPT_VERSION)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    el.textContent = await res.text();
    _gasCodeLoaded = true;
  } catch (e) {
    el.textContent = 'Could not load the backend code. Check your connection and reopen this tab.';
    console.warn('[gas-code] load failed', e);
  }
}
function copyGasCode() {
  const text = $('gas-code').textContent;
  if (!_gasCodeLoaded || !text) { showToast('Code still loading — try again in a moment', 'warn'); return; }
  navigator.clipboard.writeText(text).then(() => showToast('✓ Code copied!'));
}
async function verifyUrl() {
  if (!sheetsUrl) return;
  const btn = $('verify-url-btn');
  if (btn) { btn.textContent = 'Verifying...'; btn.disabled = true; }

  try {
    // Try a GET request first to see if the endpoint is alive
    const res = await fetch(sheetsUrl);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.service === 'string' && data.service.indexOf('lyrical-sheets-webhook') === 0) {
        showToast(`✓ Connection verified: ${data.sheetName || 'Active'}`);
        addSheetsLog('System', 'Verify', 'Handshake successful', 'ok');

        // Version Check
        const deployedVer = data.scriptVersion || 'unknown';
        const warningEl = $('sheets-version-warning');
        const versionEl = $('sheets-deployed-version');
        if (warningEl) {
          if (deployedVer !== EXPECTED_SCRIPT_VERSION) {
            if (versionEl) versionEl.textContent = deployedVer;
            warningEl.style.display = 'block';
          } else {
            warningEl.style.display = 'none';
          }
        }
      } else {
        showToast('⚠ Unexpected response from URL', 'warn');
      }
    } else {
      // If GET fails but URL looks right, it might be a POST-only deployment or CORS
      showToast('Queuing test row (GET unverified)', 'warn');
    }
  } catch (e) {
    showToast('Queuing test row (Network check failed)', 'warn');
  }

  syncToSheets({
    type: 'order', book: 'Test', date: today(), num: 'VERIFY-' + Date.now().toString().slice(-4),
    chan: 'Verify URL', qty: 0, price: 0, total: 0, stockAfter: 0, notes: 'Verify URL button test'
  });

  setTimeout(() => { if (btn) { btn.textContent = '↗ Verify URL'; btn.disabled = false; } }, 1000);
}
window.addEventListener('online', () => _processQueue());
setTimeout(() => _processQueue(), 300);

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

export async function loadReceiptFolderHandle() {
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

async function findFileHandleInDir(dirHandle, targetFilename) {
  if (!dirHandle || !targetFilename) return null;
  try {
    // Top-level direct file check
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name === targetFilename) {
        return entry;
      }
    }
    // Deep search in 1st & 2nd level subdirectories
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'directory') {
        try {
          for await (const subEntry of entry.values()) {
            if (subEntry.kind === 'file' && subEntry.name === targetFilename) {
              return subEntry;
            }
            if (subEntry.kind === 'directory') {
              try {
                for await (const deepEntry of subEntry.values()) {
                  if (deepEntry.kind === 'file' && deepEntry.name === targetFilename) {
                    return deepEntry;
                  }
                }
              } catch (_) {}
            }
          }
        } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('Receipt file deep lookup error', e);
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

export async function saveReceiptToLocalFile(file, subfolderName = '') {
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
    await handleFolderError(e, 'Error Saving Receipt', 'Receipt file save failed. The folder may have been moved or disconnected.');
    return null;
  }
}

// Build the ledger's receipt cell from an expense/ledger item. Supports the
// new receiptFiles array (body + each attachment, each independently viewable)
// and falls back to the single legacy receipt string. Local files open via
// viewLocalReceipt; remote URLs open in a new tab.
export function _localReceiptCell(item) {
  const files = (Array.isArray(item.receiptFiles) && item.receiptFiles.length)
    ? item.receiptFiles
    : (item.receipt ? [item.receipt] : []);
  if (!files.length) {
    if (item.sourceType === 'businessExpense' || item.sourceType === 'bookExpense') {
      return `<button class="btn sm outline" type="button" onclick="attachReceiptToExpenseRow('${item.sourceType || ''}', '${item.sourceId || ''}', '${item.itemId || ''}')" style="font-size:10px;padding:1px 6px;color:var(--gold);" title="Attach receipt file">📎 Attach</button>`;
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
    const label = multi ? `Receipt ${idx + 1}` : 'Receipt';
    return `<a href="${r}" target="_blank" style="color:var(--gold3);">${label}</a>`;
  }).join(' · ');
}

// Find one receipt file inside the connected folder and hand back the File.
// Three strategies, in order: the `receipts/` subfolder, the folder root, then
// a deep search by basename — which is what makes a receipt survive the user
// reorganising or renaming subfolders. Extracted so the printable trip report
// can read the same files viewLocalReceipt opens; throws when nothing matches,
// so callers decide whether that is fatal or just an omitted thumbnail.
export async function resolveLocalReceiptFile(dirHandle, path) {
  let fileHandle = null;
  const baseFilename = path.split('/').pop();

  try {
    const receiptsDir = await dirHandle.getDirectoryHandle('receipts', { create: false });
    if (path.includes('/')) {
      const [subfolder, filename] = path.split('/');
      const subDir = await receiptsDir.getDirectoryHandle(subfolder, { create: false });
      fileHandle = await subDir.getFileHandle(filename);
    } else {
      fileHandle = await receiptsDir.getFileHandle(path);
    }
  } catch (_) {
    try {
      if (path.includes('/')) {
        const [subfolder, filename] = path.split('/');
        const subDir = await dirHandle.getDirectoryHandle(subfolder, { create: false });
        fileHandle = await subDir.getFileHandle(filename);
      } else {
        fileHandle = await dirHandle.getFileHandle(path);
      }
    } catch (_) {}
  }

  if (!fileHandle) {
    fileHandle = await findFileHandleInDir(dirHandle, baseFilename);
  }

  if (!fileHandle) {
    throw new Error(`File "${baseFilename}" not found in connected folder.`);
  }

  return fileHandle.getFile();
}

async function viewLocalReceipt(path) {
  let dirHandle = await loadReceiptFolderHandle();
  if (!dirHandle) {
    const reconnect = await confirmDialog(
      'Receipt folder not connected. Would you like to connect it now?',
      { title: 'Folder Not Connected', okLabel: 'Choose Folder', cancelLabel: 'Cancel' }
    );
    if (reconnect) {
      const handle = await setupReceiptFolder();
      if (!handle) return;
      dirHandle = handle;
    } else {
      return;
    }
  }
  try {
    const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && await dirHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') return;

    const file = await resolveLocalReceiptFile(dirHandle, path);
    const url = URL.createObjectURL(file);
    window.open(url, '_blank');
  } catch (e) {
    const reconnected = await handleFolderError(e, 'Error Opening Receipt', 'Could not open local file. The folder may have been moved or disconnected.');
    if (reconnected) {
      // Auto-retry immediately with newly reconnected folder!
      viewLocalReceipt(path);
    }
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
    // ⚡ Bolt Optimization: Parallelize Asynchronous I/O
    // Replaced sequential for...of loop with Promise.all to download tax center receipts concurrently.
    await Promise.all(TAX_CENTER.businessExpenses.map(async (exp) => {
      if (exp.receipt && exp.receipt.startsWith('http')) {
        const localPath = await downloadAndLocalizeReceipt(exp.receipt, 'Business');
        if (localPath) {
          exp.receipt = localPath;
          totalSynced++;
        }
      }
    }));
    if (totalSynced > 0) saveTaxCenter();
  }

  // 2. Sync Per-Book Expenses
  const bookIds = Object.keys(BOOKS);
  const states = await Promise.all(bookIds.map(bid => window._fbLoad(bid)));

  const savePromises = [];

  // ⚡ Bolt Optimization: Parallelize Asynchronous I/O
  // Replaced sequential loops with Promise.all to download per-book receipts concurrently.
  await Promise.all(bookIds.map(async (bid, i) => {
    const book = BOOKS[bid];
    const state = states[i];
    if (!state || !state.expenses) return;

    let bookSynced = 0;
    await Promise.all(state.expenses.map(async (exp) => {
      if (exp.receipt && exp.receipt.startsWith('http')) {
        const localPath = await downloadAndLocalizeReceipt(exp.receipt, book.title || bid);
        if (localPath) {
          exp.receipt = localPath;
          bookSynced++;
          totalSynced++;
        }
      }
    }));
    if (bookSynced > 0) {
      savePromises.push(window._fbSave(bid, JSON.stringify(state)));
    }
  }));

  await Promise.all(savePromises);

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

async function exportToJSON(ev) {
  return withButtonLoading(ev, 'Saving…', async () => {
    const data = buildBackupPayload();
    const filename = backupFileName();
    const savedToFolder = await writeBackupToChosenFolder(data, filename);

    if (!savedToFolder) {
      downloadText(JSON.stringify(data, null, 2), filename, 'application/json');
    }

    localStorage.setItem('lm-last-backup-ts', Date.now().toString());
    updateLastBackupDisplay();
    if ($('backup-reminder')) $('backup-reminder').style.display = 'none';
    showToast(savedToFolder ? '✓ JSON backup saved to your selected folder' : '✓ JSON backup downloaded');
  });
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
  el.textContent = `Last backup: ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function checkDailyBackup() {
  const ts = localStorage.getItem('lm-last-backup-ts');
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  if (!ts || (now - parseInt(ts)) > ONE_DAY) {
    if ($('backup-reminder')) $('backup-reminder').style.display = 'flex';
  } else {
    if ($('backup-reminder')) $('backup-reminder').style.display = 'none';
  }
}

function buildBackupPayload() {
  // Every field added here MUST be restored in applyBackupData(). A snapshot is
  // only "full" if it carries every piece of durable business data the app
  // persists — not just the catalog and per-book states. v2.6 added POS-only
  // books, the mailing/unsubscribe lists, invoice settings, and integration
  // config. (Receipt image blobs live in Firebase Storage, referenced by URL
  // inside states/TAX_CENTER — they cannot be inlined into a JSON snapshot.)
  return {
    version: '2.6',
    timestamp: new Date().toISOString(),
    BOOKS: BOOKS,
    posExtra: posExtraBooks,                          // POS-only books + their sold/revenue tally (not in BOOKS)
    states: states,
    TAX_CENTER: TAX_CENTER,
    productionCosts: JSON.parse(localStorage.getItem('lm-production-costs') || '{}'),
    paymentLinks: JSON.parse(localStorage.getItem('lm-payment-links') || '{}'),
    mailingList: MAILING_LIST,                         // curated subscriber list
    customerSuppress: Array.from(_customerSuppress),   // unsubscribe / opt-out emails (compliance)
    invoiceSettings: getInvoiceSettings(),             // invoice template, bank details, Stripe key
    integrations: {                                    // Sheets / notify endpoint (localStorage-only config)
      notifyUrl: localStorage.getItem('lm-notify-url') || '',
      sheetsUrl: localStorage.getItem('lm-sheets-url') || '',
      sheetsSpreadsheetUrl: localStorage.getItem('lm-sheets-spreadsheet-url') || '',
      sheetsSecret: localStorage.getItem('lm-sheets-secret') || ''
    }
  };
}

async function saveSystemBackups() {
  // Persist only the lean manifest — never inline snapshots (that's what blew
  // Firestore's 1 MiB doc limit). Each snapshot lives in its own backups doc.
  const manifest = systemBackups.map(b => {
    const { snapshot: _snapshot, ...meta } = b;
    return meta;
  });
  await window._fbSaveSettings(SYSTEM_BACKUP_KEY, manifest);
}

async function loadSystemBackups() {
  try {
    const stored = await window._fbLoadSettings(SYSTEM_BACKUP_KEY);
    systemBackups = Array.isArray(stored) ? stored : [];
  } catch (e) {
    systemBackups = [];
  }

  // One-time migration: older manifests inlined the full snapshot in every
  // entry (the 1 MiB-doc bug). Move any inlined snapshot into its own backups
  // doc, capture its book count, then drop it so the next save writes a lean
  // index. Only rewrite the manifest once EVERY snapshot is safely in its own
  // doc — otherwise (e.g. backup rules not yet deployed) we'd lose the ones
  // that failed to migrate.
  const inlined = systemBackups.filter(b => b && b.id && b.snapshot);
  if (inlined.length) {
    let allMigrated = true;
    for (const b of inlined) {
      try {
        await window._fbSaveBackupSnapshot(b.id, b.snapshot);
        if (b.bookCount == null) b.bookCount = Object.keys(b.snapshot.BOOKS || {}).length;
        delete b.snapshot;
      } catch (e) {
        console.error('Backup migration failed for', b.id, e);
        allMigrated = false;
      }
    }
    if (allMigrated) {
      try { await saveSystemBackups(); } catch (e) { console.error('Backup manifest migration save failed', e); }
    }
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
  if (_sysBackupPage >= totalPages) _sysBackupPage = Math.max(0, totalPages - 1);
  const pageItems = sorted.slice(_sysBackupPage * PAGE_SIZE, (_sysBackupPage + 1) * PAGE_SIZE);

  let html = pageItems.map(b => `
    <tr>
      <td>${new Date(b.createdAt).toLocaleString()}</td>
      <td>${b.type === 'manual' ? 'Manual' : 'Auto daily'}</td>
      <td class="r">${b.bookCount ?? Object.keys(b.snapshot?.BOOKS || {}).length}</td>
      <td class="r" style="white-space:nowrap;">
        <button class="btn sm" onclick="restoreBookFromBackup('${b.id}')" title="Restore just one book from this snapshot — leaves your other books untouched">Restore 1 book</button>
        <button class="btn sm" onclick="restoreSystemBackup('${b.id}')" title="Restore the ENTIRE database from this snapshot — overwrites everything">Restore all</button>
      </td>
    </tr>
  `).join('');

  if (totalPages > 1) {
    html += `<tr><td colspan="4" style="text-align:center;padding:1rem;background:rgba(0,0,0,.15);">
      <button class="btn sm" onclick="gotoSysBackupPage(-1)" ${_sysBackupPage === 0 ? 'disabled' : ''}>← Prev</button>
      <span style="margin:0 15px;font-size:12px;color:var(--text2);font-family:'DM Mono',monospace;">Page ${_sysBackupPage + 1} of ${totalPages}</span>
      <button class="btn sm" onclick="gotoSysBackupPage(1)" ${_sysBackupPage === totalPages - 1 ? 'disabled' : ''}>Next →</button>
    </td></tr>`;
  }
  body.innerHTML = html;

  const latest = sorted[0];
  if (status) status.textContent = `Latest system backup: ${new Date(latest.createdAt).toLocaleString()}`;
}

// Pagination handler. Inline onclick runs in global scope, so it can't see the
// module-scoped _sysBackupPage / renderSystemBackups — this exported shim does.
function gotoSysBackupPage(delta) {
  _sysBackupPage = Math.max(0, _sysBackupPage + delta);
  renderSystemBackups(); // re-clamps the upper bound against totalPages
}

async function createSystemBackup(type = 'auto') {
  const dayKey = localDayKey();
  // Dedup against each existing backup's LOCAL creation day, so a backup made
  // in the evening (past UTC midnight) doesn't create a second row for the same
  // calendar day. Derive from createdAt so legacy UTC-keyed entries dedup too.
  if (type === 'auto' && systemBackups.some(b => b.createdAt && localDayFromTs(b.createdAt) === dayKey)) return false;

  const id = `sb-${Date.now()}`;
  const snapshot = buildBackupPayload();

  // Write the heavy snapshot to its own doc FIRST; only record it in the
  // manifest if that succeeds, so the index never points at a missing backup.
  try {
    await window._fbSaveBackupSnapshot(id, snapshot);
  } catch (e) {
    console.error('System backup snapshot write failed', e);
    showToast('⚠ Backup failed to save — your data was NOT backed up', 'err', 5000);
    return false;
  }

  const entry = {
    id,
    dayKey,
    type,
    createdAt: Date.now(),
    bookCount: Object.keys(snapshot.BOOKS || {}).length
  };
  systemBackups.unshift(entry);

  // Prune snapshots beyond the limit — delete their docs too so they don't orphan.
  if (systemBackups.length > SYSTEM_BACKUP_LIMIT) {
    const dropped = systemBackups.slice(SYSTEM_BACKUP_LIMIT);
    systemBackups = systemBackups.slice(0, SYSTEM_BACKUP_LIMIT);
    await Promise.all(dropped.filter(d => d.id).map(d => window._fbDeleteBackupSnapshot(d.id)));
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

// The app is a PWA/POS that's often left open for days, so triggering the daily
// backup only once on load means days with no fresh load get skipped. Re-check
// when the tab regains focus and on a timer (throttled so we don't hammer
// Firestore), so a backup lands on every day the app is actually used.
let _lastDailyBackupCheck = 0;
const DAILY_BACKUP_CHECK_MS = 30 * 60 * 1000; // 30 min between checks
async function maybeRunDailyBackup(force = false) {
  if (!isPublisherSession() || isAuthor()) return;
  const now = Date.now();
  if (!force && now - _lastDailyBackupCheck < DAILY_BACKUP_CHECK_MS) return;
  _lastDailyBackupCheck = now;
  await ensureDailySystemBackup();
}

let _dailyBackupWatcherStarted = false;
function startDailyBackupWatcher() {
  if (_dailyBackupWatcherStarted) return;
  _dailyBackupWatcherStarted = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') maybeRunDailyBackup();
  });
  window.addEventListener('focus', () => maybeRunDailyBackup());
  setInterval(() => maybeRunDailyBackup(), DAILY_BACKUP_CHECK_MS);
}

async function createSystemBackupNow() {
  await loadSystemBackups();
  await createSystemBackup('manual');
  showToast('✓ System backup created');
}

async function applyBackupData(data) {
  // 0. POS-only books — restore BEFORE the catalog save below, because
  //    saveCatalogWithDeletions() serializes posExtraBooks into the catalog doc
  //    under _posExtra. Guarded: restoring an older (pre-2.6) snapshot that
  //    never carried POS books leaves the current ones untouched rather than
  //    silently wiping real sales data.
  if (data.posExtra && typeof data.posExtra === 'object') {
    posExtraBooks = data.posExtra;
  }

  // 1. Restore Catalog
  BOOKS = data.BOOKS;
  BOOK_LIST = Object.values(BOOKS);
  // Rebuild the default-deletion tombstones from the restored catalog so
  // defaults missing from the backup don't reappear after the next load.
  deletedDefaultIds = Object.keys(DEFAULT_BOOKS).filter(id => !BOOKS[id]);
  await saveCatalogWithDeletions();

  // 2. Restore individual book states
  // ⚡ Bolt Optimization: Parallelize Asynchronous I/O
  // Replaced sequential `for...in` loop with `Promise.all` to save book states concurrently.
  await Promise.all(Object.keys(data.states).map(bid => window._fbSave(bid, JSON.stringify(data.states[bid]))));

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

  // 5. Customer/marketing data (v2.6+). Each is guarded so older snapshots
  //    restore cleanly. Reuse the feature's own persist helpers so both the
  //    Firestore doc and the localStorage mirror are written in their expected
  //    shapes. The caller reloads right after, re-hydrating in-memory state.
  if (data.mailingList && typeof data.mailingList === 'object') {
    MAILING_LIST = {
      subs: (data.mailingList.subs && typeof data.mailingList.subs === 'object') ? data.mailingList.subs : {},
      autoAdd: !!data.mailingList.autoAdd
    };
    await _persistMailingList();
  }
  // Accept both the v2.6 array shape and the {emails:[...]} settings shape.
  const supp = Array.isArray(data.customerSuppress)
    ? data.customerSuppress
    : (data.customerSuppress && Array.isArray(data.customerSuppress.emails) ? data.customerSuppress.emails : null);
  if (supp) {
    _customerSuppress = new Set(supp.map(_custEmailKey));
    await _persistCustomerSuppression();
  }

  // 6. Invoice template + integration config (v2.6+).
  if (data.invoiceSettings && typeof data.invoiceSettings === 'object') {
    saveInvoiceSettingsObj(data.invoiceSettings);
  }
  if (data.integrations && typeof data.integrations === 'object') {
    const ig = data.integrations;
    const setOrClear = (key, val) => { if (val) localStorage.setItem(key, val); else localStorage.removeItem(key); };
    setOrClear('lm-notify-url', ig.notifyUrl);
    setOrClear('lm-sheets-url', ig.sheetsUrl);
    setOrClear('lm-sheets-spreadsheet-url', ig.sheetsSpreadsheetUrl);
    setOrClear('lm-sheets-secret', ig.sheetsSecret);
    if (ig.sheetsSpreadsheetUrl) localStorage.setItem('lm-last-spreadsheet-url', ig.sheetsSpreadsheetUrl);
    if (ig.sheetsUrl) localStorage.setItem('lm-last-sheets-url', ig.sheetsUrl);
    await window._fbSaveSettings('notifyEndpoint', { url: ig.notifyUrl || '' });
  }
}

async function restoreSystemBackup(id) {
  const backup = systemBackups.find(b => b.id === id);
  if (!backup) return;
  if (!(await confirmDialog('Restore this system backup? This will OVERWRITE your current database and reload the app. A safety backup of the current state is saved first, so you can undo it.', { title: 'Restore backup', okLabel: 'Restore', danger: true }))) return;
  try {
    // New backups keep the snapshot in its own doc; older ones inlined it.
    const snapshot = backup.snapshot || await window._fbLoadBackupSnapshot(id);
    if (!snapshot) {
      showToast('Backup data could not be found', 'err');
      return;
    }
    // Safety net — snapshot the CURRENT state before overwriting everything.
    let safetyOk = false;
    try { safetyOk = await createSystemBackup('manual'); }
    catch (e) { console.error('Pre-restore safety backup failed', e); }
    await applyBackupData(snapshot);
    showToast(`✓ System backup restored${safetyOk ? ' (safety backup saved)' : ''}! Reloading...`);
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    console.error('System restore failed', e);
    showToast('Error restoring system backup', 'err');
  }
}

// ── SELECTIVE (single-book) restore from a system backup ───────────────────
// restoreSystemBackup() above OVERWRITES the ENTIRE database. When only one
// book's data was lost, that's far too blunt — it would clobber every other
// book too. This flow restores JUST the chosen book (its catalog entry plus
// inventory, history and consignment ledger, and its production-cost / payment
// -link settings) and leaves every other book and all global settings exactly
// as they are right now.
let _bookRestoreCtx = null;

// Compact stats for a book state — used by both the picker and the
// before/after diff in the restore confirmation.
function _restoreBookStats(st) {
  st = st || {};
  return {
    sales: (st.hist || []).filter(h => !h.voided).length,
    ledger: (st.ledger || []).length,
    stock: st.stock,
    hasData: !!((st.hist && st.hist.length) || (st.ledger && st.ledger.length) || (st.sold > 0))
  };
}

function _restoreStatLine(s) {
  return `${s.sales} sale${s.sales === 1 ? '' : 's'} · ${s.ledger} consignment record${s.ledger === 1 ? '' : 's'} · stock ${s.stock ?? '—'}`;
}

async function restoreBookFromBackup(id) {
  const backup = systemBackups.find(b => b.id === id);
  if (!backup) return;
  let snapshot;
  try {
    // New backups keep the snapshot in its own doc; older ones inlined it.
    snapshot = backup.snapshot || await window._fbLoadBackupSnapshot(id);
  } catch (e) {
    console.error('Backup snapshot load failed', e);
  }
  if (!snapshot || !snapshot.BOOKS) {
    showToast('Backup data could not be found', 'err');
    return;
  }
  _bookRestoreCtx = { id, snapshot };
  const sub = $('restore-book-subtitle');
  if (sub) sub.innerHTML = `From snapshot taken <strong>${new Date(backup.createdAt).toLocaleString()}</strong>`;
  renderBookRestorePicker();
  openM('restore-book');
}

function renderBookRestorePicker() {
  const host = $('restore-book-list');
  if (!host || !_bookRestoreCtx) return;
  const { snapshot } = _bookRestoreCtx;
  const ids = Object.keys(snapshot.BOOKS);
  if (!ids.length) {
    host.innerHTML = '<div class="empty-state">This snapshot has no books.</div>';
    return;
  }

  // Rank for sorting: a book missing from the live catalog is the likely
  // recovery target → top. Then books that actually carry data. Empty /
  // no-activity books sink to the bottom and are greyed out, so the one you
  // lost stands out at a glance.
  const meta = {};
  ids.forEach(bid => {
    const s = _restoreBookStats(snapshot.states?.[bid]);
    const missing = !BOOKS[bid];
    meta[bid] = { s, missing, rank: missing ? 0 : (s.hasData ? 1 : 2) };
  });
  const sorted = [...ids].sort((a, b) => meta[a].rank - meta[b].rank || meta[b].s.sales - meta[a].s.sales);

  host.innerHTML = sorted.map(bid => {
    const book = snapshot.BOOKS[bid] || {};
    const { s, missing, rank } = meta[bid];
    const empty = rank === 2;
    const badge = missing
      ? '<span class="pill green" style="font-size:10px;">Missing · will be re-added</span>'
      : '<span class="pill amber" style="font-size:10px;">In catalog · will be overwritten</span>';
    const stat = empty
      ? '<span style="color:var(--text3);">No recorded activity in this snapshot</span>'
      : `<strong style="color:var(--cream);">${escapeHtml(_restoreStatLine(s))}</strong>`;
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r2);background:rgba(255,255,255,.03);${empty ? 'opacity:.5;' : ''}">
        <div style="width:8px;height:8px;border-radius:50%;background:${book.accent || 'var(--gold3)'};flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:13px;color:var(--cream);">${escapeHtml(book.title || bid)}</div>
          <div style="font-size:12px;margin-top:2px;">${stat}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px;">${escapeHtml(book.author || '—')} · ${badge}</div>
        </div>
        <button class="btn gold sm" onclick="applyBookRestore('${bid}')">Restore</button>
      </div>`;
  }).join('');
}

async function applyBookRestore(bid) {
  if (!_bookRestoreCtx) return;
  const { snapshot } = _bookRestoreCtx;
  const book = snapshot.BOOKS?.[bid];
  if (!book) { showToast('That book is not in this backup', 'err'); return; }

  const title = book.title || bid;
  const exists = !!BOOKS[bid];

  // Before/after diff so you can't silently restore from a too-new snapshot
  // that's already missing the data you're trying to get back.
  const backupStats = _restoreBookStats(snapshot.states?.[bid]);
  const currentLine = exists
    ? _restoreStatLine(_restoreBookStats(states[bid]))
    : 'not in catalog — this book was deleted';
  if (!(await confirmDialog(
    `Restore only "${title}"?\n\n` +
    `This backup brings back:\n  • ${_restoreStatLine(backupStats)}\n\n` +
    `Currently in the app:\n  • ${currentLine}\n\n` +
    `This ${exists ? 'OVERWRITES' : 're-adds'} this one book's catalog entry, inventory, history and consignment ledger from the backup. A safety backup of the current state is saved first, so you can undo it.\n\n` +
    `Every other book and all your settings stay exactly as they are now.`,
    { title: 'Restore one book', okLabel: exists ? 'Overwrite this book' : 'Re-add this book', danger: true }
  ))) return;

  try {
    // 0. Safety net — snapshot the CURRENT state before we overwrite anything,
    //    so a wrong pick (or restoring from a too-new backup) is never fatal.
    let safetyOk = false;
    try { safetyOk = await createSystemBackup('manual'); }
    catch (e) { console.error('Pre-restore safety backup failed', e); }

    // 1. Catalog entry — restore just this book, leaving the rest of BOOKS as-is.
    BOOKS[bid] = JSON.parse(JSON.stringify(book));
    BOOK_LIST = Object.values(BOOKS);
    // If this id was a tombstoned default, un-delete it so the restore sticks
    // (otherwise loadCatalog would filter the default back out next reload).
    deletedDefaultIds = deletedDefaultIds.filter(x => x !== bid);
    await saveCatalogWithDeletions();

    // 2. Per-book state (inventory, history, ledger, …).
    const st = snapshot.states?.[bid] || defaultState(book);
    states[bid] = JSON.parse(JSON.stringify(st));
    await window._fbSave(bid, JSON.stringify(states[bid]));

    // 3. This book's entries in the global per-book settings maps, so its
    //    production cost / payment link come back too — other books untouched.
    if (snapshot.productionCosts && bid in snapshot.productionCosts) {
      const pc = JSON.parse(localStorage.getItem('lm-production-costs') || '{}');
      pc[bid] = snapshot.productionCosts[bid];
      localStorage.setItem('lm-production-costs', JSON.stringify(pc));
      await window._fbSaveSettings('productionCosts', pc);
    }
    if (snapshot.paymentLinks && bid in snapshot.paymentLinks) {
      const pl = JSON.parse(localStorage.getItem('lm-payment-links') || '{}');
      pl[bid] = snapshot.paymentLinks[bid];
      localStorage.setItem('lm-payment-links', JSON.stringify(pl));
      await window._fbSaveSettings('paymentLinks', pl);
    }

    closeM('restore-book');
    showToast(`✓ "${title}" restored${safetyOk ? ' (safety backup saved)' : ''}! Reloading…`);
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    console.error('Single-book restore failed', e);
    showToast('Error restoring book', 'err');
  }
}

// Single-book restore from a LOCAL backup file (the JSON snapshots the user
// downloads to their computer). Same format as system backups, so it reuses
// the same picker + applyBookRestore — just sources the snapshot from a file.
async function handleBookRestoreImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = ''; // let the same file be re-picked later

  const info = $('import-one-info');
  if (info) info.textContent = `Reading ${file.name}…`;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (!data.BOOKS || typeof data.BOOKS !== 'object' || !Object.keys(data.BOOKS).length) {
        throw new Error('Invalid backup format: no books found');
      }
      _bookRestoreCtx = { id: null, snapshot: data, source: 'file' };
      const sub = $('restore-book-subtitle');
      if (sub) {
        const when = data.timestamp ? new Date(data.timestamp).toLocaleString() : 'unknown date';
        sub.innerHTML = `From file <strong>${escapeHtml(file.name)}</strong> · saved ${escapeHtml(when)}`;
      }
      if (info) info.textContent = `Loaded ${Object.keys(data.BOOKS).length} book(s) from ${file.name}`;
      renderBookRestorePicker();
      openM('restore-book');
    } catch (err) {
      console.error('Single-book file import failed', err);
      showToast('Error: Invalid backup file', 'err');
      if (info) info.textContent = 'Import failed (invalid file)';
    }
  };
  reader.readAsText(file);
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

      if (!(await confirmDialog('Are you sure? This will OVERWRITE your entire existing database and reload the app.', { title: 'Restore from file', okLabel: 'Overwrite & restore', danger: true }))) {
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

  downloadCsv(toCsv(rows), `lyrical-records-export-${today()}.csv`);
  showToast('✓ CSV Export downloaded');
}

// ── PAYMENT LINKS
function _renderProductionCostFields() {
  const container = $('production-cost-fields');
  if (!container) return;
  container.innerHTML = BOOK_LIST.map(book => `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;min-width:220px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${book.accent};flex-shrink:0;"></div>
        <span style="font-size:13px;font-weight:600;color:var(--text);">${escapeHtml(book.title)}</span>
        <span style="font-size:11px;color:var(--text3);">${book.currency}</span>
      </div>
      <div class="form-group" style="flex:1;margin:0;">
        <div class="price-wrap">
          <span class="sym">${book.currency}</span>
          <input type="number" id="pc-${book.id}" value="${book.productionCost || ''}" placeholder="0.00" step="0.01" min="0">
        </div>
      </div>
    </div>`).join('');
}

async function saveProductionCosts() {
  await syncCatalog();
  const stored = {};
  BOOK_LIST.forEach(book => {
    const inp = $('pc-' + book.id);
    if (inp) {
      const previousCost = book.productionCost || 0;
      const val = parseFloat(inp.value) || 0;
      book.productionCost = val;
      stored[book.id] = val;

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
  await window._fbSaveSettings('productionCosts', stored);
  localStorage.setItem('lm-production-costs', JSON.stringify(stored));
  // Persist synced profitTiers so the threshold survives a page reload
  await saveCatalogWithDeletions();
  showToast('✓ Break-even targets saved');
  if (activeBook && activeBook !== 'all') updateDash();
  else updateAllOverview();
}

async function loadProductionCosts() {
  try {
    // Try Firebase first
    const stored = await window._fbLoadSettings('productionCosts');
    if (stored) { BOOK_LIST.forEach(b => { if (stored[b.id] != null) b.productionCost = stored[b.id]; }); return; }
  } catch (_) { }
  // Fallback to localStorage
  try {
    const stored = JSON.parse(localStorage.getItem('lm-production-costs') || '{}');
    BOOK_LIST.forEach(b => { if (stored[b.id] != null) b.productionCost = stored[b.id]; });
  } catch (_) { }
}

function _renderPaymentLinkFields() {
  const container = $('payment-link-fields');
  if (!container) return;
  container.innerHTML = BOOK_LIST.map(book => `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;min-width:200px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${book.accent};flex-shrink:0;"></div>
        <span style="font-size:13px;font-weight:600;color:var(--text);">${escapeHtml(book.title)}</span>
      </div>
      <div class="form-group" style="flex:1;margin:0;">
        <input type="text" id="pl-${book.id}" value="${book.paymentLink || ''}" placeholder="https://paypal.me/… or email@interac.ca">
      </div>
    </div>`).join('');
}

async function savePaymentLinks() {
  await syncCatalog();
  BOOK_LIST.forEach(book => {
    const inp = $('pl-' + book.id);
    if (inp) book.paymentLink = inp.value.trim();
  });
  const stored = {};
  BOOK_LIST.forEach(b => stored[b.id] = b.paymentLink || '');
  // Save to Firebase (syncs across all devices) + localStorage as fallback
  await window._fbSaveSettings('paymentLinks', stored);
  localStorage.setItem('lm-payment-links', JSON.stringify(stored));
  showToast('✓ Payment links saved');
  if (activeBook && activeBook !== 'all') renderArtistTransfers();
}

async function loadPaymentLinks() {
  try {
    // Try Firebase first
    const stored = await window._fbLoadSettings('paymentLinks');
    if (stored) { BOOK_LIST.forEach(b => { if (stored[b.id]) b.paymentLink = stored[b.id]; }); return; }
  } catch (_) { }
}

async function loadWebsitePaymentMethods() {
  try {
    const stored = await window._fbLoadSettings('websitePaymentMethods');
    if (stored && Array.isArray(stored)) {
      WEBSITE_PAYMENT_METHODS = stored;
    } else {
      WEBSITE_PAYMENT_METHODS = ['stripe', 'paypal', 'interac', 'cash_card'];
    }
  } catch (e) {
    console.warn('Failed to load website payment methods', e);
  }
}

async function saveWebsitePaymentMethods() {
  if (isAuthor()) return;
  try {
    await window._fbSaveSettings('websitePaymentMethods', WEBSITE_PAYMENT_METHODS);
  } catch (e) {
    console.error('Failed to save website payment methods', e);
  }
}

function getAcceptedPaymentMethodsForBook(bookId) {
  const book = BOOKS[bookId];
  if (!book) return WEBSITE_PAYMENT_METHODS;
  if (book.useGlobalMethods ?? true) {
    return WEBSITE_PAYMENT_METHODS;
  }
  return book.acceptedMethods || ['stripe', 'paypal', 'interac', 'cash_card'];
}

function getEffectiveBookPaymentLink(book) {
  if (!book) return '';
  const acceptedMethods = getAcceptedPaymentMethodsForBook(book.id);

  let url = '';
  if (acceptedMethods.includes('stripe') && book.stripeLink) {
    url = book.stripeLink;
  } else if (acceptedMethods.includes('paypal') && book.paymentLink && /paypal/i.test(book.paymentLink)) {
    url = book.paymentLink;
  } else if (acceptedMethods.includes('interac') && book.paymentLink && /^[^\s@]+@[^\s@]+$/.test(book.paymentLink)) {
    url = book.paymentLink;
  }

  return url || book.stripeLink || book.paymentLink || '';
}

function renderPaymentConfig() {
  // Global Website list
  const globalList = $('pm-global-list');
  if (globalList) {
    const methods = [
      { id: 'stripe', title: 'Stripe Checkout', desc: 'Accept credit card payments via Stripe links.' },
      { id: 'paypal', title: 'PayPal', desc: 'Accept PayPal payments.' },
      { id: 'interac', title: 'Interac e-Transfer', desc: 'Accept email bank transfers.' },
      { id: 'cash_card', title: 'Cash/Card (local)', desc: 'Accept physical cash/cards for manual checkouts.' }
    ];

    globalList.innerHTML = methods.map(m => {
      const checked = WEBSITE_PAYMENT_METHODS.includes(m.id) ? 'checked' : '';
      return `
        <label class="pm-toggle-row">
          <div class="pm-toggle-label">
            <span class="pm-toggle-title">${m.title}</span>
            <span class="pm-toggle-desc">${m.desc}</span>
          </div>
          <span class="pm-switch">
            <input type="checkbox" class="pm-global-checkbox" value="${m.id}" ${checked} onchange="window.updateGlobalPaymentMethod('${m.id}', this.checked)">
            <span class="pm-track"></span>
          </span>
        </label>
      `;
    }).join('');
  }

  // Populate book selector dropdown
  const bookSelect = $('pm-book-select');
  if (bookSelect) {
    const currentVal = bookSelect.value || pmSelectedBookId || (BOOK_LIST[0]?.id || '');
    bookSelect.innerHTML = BOOK_LIST.map(b => `<option value="${b.id}">${escapeHtml(b.title)}</option>`).join('');
    bookSelect.value = currentVal;
    pmSelectedBookId = currentVal;
  }

  renderBookPaymentConfig();
}

window.updateGlobalPaymentMethod = function (id, checked) {
  if (checked) {
    if (!WEBSITE_PAYMENT_METHODS.includes(id)) WEBSITE_PAYMENT_METHODS.push(id);
  } else {
    WEBSITE_PAYMENT_METHODS = WEBSITE_PAYMENT_METHODS.filter(m => m !== id);
  }
  // Sync the UI if any books are using global settings
  renderBookPaymentConfig();
};

function renderBookPaymentConfig() {
  const bookId = $('pm-book-select')?.value;
  if (!bookId) return;
  pmSelectedBookId = bookId;
  const book = BOOKS[bookId];
  if (!book) return;

  const useGlobal = book.useGlobalMethods ?? true;
  const globalCb = $('pm-book-use-global');
  if (globalCb) globalCb.checked = useGlobal;

  const bookList = $('pm-book-list');
  if (bookList) {
    const methods = [
      { id: 'stripe', title: 'Stripe Checkout', desc: 'Accept credit card payments via Stripe links.' },
      { id: 'paypal', title: 'PayPal', desc: 'Accept PayPal payments.' },
      { id: 'interac', title: 'Interac e-Transfer', desc: 'Accept email bank transfers.' },
      { id: 'cash_card', title: 'Cash/Card (local)', desc: 'Accept physical cash/cards for manual checkouts.' }
    ];

    const activeMethods = useGlobal ? WEBSITE_PAYMENT_METHODS : (book.acceptedMethods || ['stripe', 'paypal', 'interac', 'cash_card']);

    bookList.innerHTML = methods.map(m => {
      const checked = activeMethods.includes(m.id) ? 'checked' : '';
      const disabled = useGlobal ? 'disabled' : '';
      return `
        <label class="pm-toggle-row ${useGlobal ? 'disabled' : ''}">
          <div class="pm-toggle-label">
            <span class="pm-toggle-title">${m.title}</span>
            <span class="pm-toggle-desc">${m.desc}</span>
          </div>
          <span class="pm-switch">
            <input type="checkbox" class="pm-book-checkbox" value="${m.id}" ${checked} ${disabled}>
            <span class="pm-track"></span>
          </span>
        </label>
      `;
    }).join('');
  }
}

window.toggleBookUseGlobal = function () {
  const bookId = pmSelectedBookId;
  if (!bookId || !BOOKS[bookId]) return;
  const useGlobal = $('pm-book-use-global').checked;
  BOOKS[bookId].useGlobalMethods = useGlobal;
  renderBookPaymentConfig();
};

window.savePaymentConfig = async function () {
  if (isAuthor()) return;

  const bookId = pmSelectedBookId;
  if (bookId && BOOKS[bookId]) {
    const book = BOOKS[bookId];
    book.useGlobalMethods = $('pm-book-use-global').checked;
    if (!book.useGlobalMethods) {
      const bookCheckboxes = document.querySelectorAll('.pm-book-checkbox');
      const selected = [];
      bookCheckboxes.forEach(cb => {
        if (cb.checked) selected.push(cb.value);
      });
      book.acceptedMethods = selected;
    }
  }

  // Save global website settings
  const globalCheckboxes = document.querySelectorAll('.pm-global-checkbox');
  const globalSelected = [];
  globalCheckboxes.forEach(cb => {
    if (cb.checked) globalSelected.push(cb.value);
  });
  WEBSITE_PAYMENT_METHODS = globalSelected;

  await saveWebsitePaymentMethods();
  await saveCatalogWithDeletions();

  showToast('✓ Payment methods saved successfully');
  renderPaymentConfig();
};

window.renderBookPaymentConfig = renderBookPaymentConfig;

// ── PROFIT SHARING LOGIC
let psActiveBookId = null;
let psSimGross = null;   // "what-if" gross revenue for the live earnings preview
let activeSettingsSubTab = 'catalog';

function switchSettingsSubTab(subTabName) {
  activeSettingsSubTab = subTabName;
  const subTabs = ['profit', 'catalog', 'sync'];
  subTabs.forEach(tab => {
    const btn = document.getElementById('btn-subtab-' + tab);
    const sec = document.getElementById('settings-sec-' + tab);
    if (btn && sec) {
      if (tab === subTabName) {
        btn.classList.add('active');
        sec.style.display = 'block';
      } else {
        btn.classList.remove('active');
        sec.style.display = 'none';
      }
    }
  });
  if (subTabName === 'sync' && typeof updateSheetsTabUI === 'function') {
    updateSheetsTabUI();
  }
}
window.switchSettingsSubTab = switchSettingsSubTab;

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
      <label for="ps-book-selector">Book</label>
      <select id="ps-book-selector">
        <option value="">Select a book…</option>
        ${BOOK_LIST.map(b => `<option value="${escapeHtml(b.id)}" ${b.id === currentVal ? 'selected' : ''}>${escapeHtml(b.title)}</option>`).join('')}
      </select>
    `;
    const sel = $('ps-book-selector');
    if (sel) {
      sel.addEventListener('change', () => {
        psActiveBookId = sel.value || null;
        psSimGross = null;   // reset the preview when switching books
        renderProfitTierList();
      });
    }
  }

  renderProfitTierList();
}

// Walk an arbitrary gross-revenue figure through the configured tiers and return
// the artist/publisher split + per-tier breakdown. Mirrors calcArtistEarnings'
// tier walk (using the same shared tierEffectiveCap) but for a single what-if
// number rather than the real sales history.
function psSimulateSplit(tiers, productionCost, gross) {
  const capOf = (t) => tierEffectiveCap(t, productionCost);
  const sorted = [...tiers].sort((a, b) => {
    const ca = capOf(a), cb = capOf(b);
    return (ca == null ? Infinity : ca) - (cb == null ? Infinity : cb);
  });
  const rows = sorted.map(t => ({ tier: t, revenue: 0, artist: 0 }));
  let cumulative = 0, remaining = Math.max(0, gross), totalArtist = 0;
  let guard = 0;
  while (remaining > 0.001 && guard++ < 1000) {
    const found = sorted.findIndex(t => { const c = capOf(t); return c != null && cumulative < c; });
    const i = found === -1 ? sorted.length - 1 : found;
    const c = capOf(sorted[i]);
    const isLast = i === sorted.length - 1 || c == null;
    const capacity = isLast ? remaining : Math.min(remaining, c - cumulative);
    if (capacity <= 0) break;
    const pct = parseFloat(sorted[i].artistPct) || 0;
    const earned = capacity * (pct / 100);
    rows[i].revenue += capacity;
    rows[i].artist += earned;
    totalArtist += earned;
    cumulative += capacity;
    remaining -= capacity;
  }
  return { sorted, rows, totalArtist, publisher: Math.max(0, gross) - totalArtist, gross: Math.max(0, gross) };
}

function renderProfitTierList() {
  const list = $('profit-tier-list');
  const actions = $('ps-actions');
  const summary = $('ps-summary');
  if (!list) return;

  list.innerHTML = '';
  if (summary) summary.innerHTML = '';

  // No book selected — friendly prompt + how it works
  if (!psActiveBookId || !BOOKS[psActiveBookId]) {
    if (actions) actions.style.display = 'none';
    list.innerHTML = `
      <div class="empty-state" style="padding:2.5rem 1rem;">
        <div class="e-icon">📊</div>
        <div style="font-weight:600;color:var(--text2);margin-bottom:.35rem;">Choose a book to manage its profit tiers</div>
        <div style="font-size:12px;max-width:460px;margin:0 auto;line-height:1.6;">Pick a title from the dropdown above, then set the share an artist earns at each stage of recovering production costs.</div>
      </div>`;
    return;
  }

  const book = BOOKS[psActiveBookId];
  if (!book.profitTiers) book.profitTiers = [];
  const tiers = book.profitTiers;
  const cur = book.currency || '€';
  const productionCost = book.productionCost || 0;

  if (actions) actions.style.display = 'flex';

  // No tiers yet — offer a one-click recommended template
  if (tiers.length === 0) {
    const pcText = productionCost > 0 ? fmt(productionCost, cur) : 'your production cost';
    list.innerHTML = `
      <div style="text-align:center;padding:2rem 1.25rem;border:1px dashed var(--gold-line);border-radius:var(--r2);background:var(--cream2);">
        <div style="font-size:30px;opacity:.55;margin-bottom:.5rem;">🎚️</div>
        <div style="font-weight:600;color:var(--text2);margin-bottom:.4rem;">No tiers defined yet</div>
        <div style="font-size:12px;color:var(--text3);max-width:480px;margin:0 auto 1.1rem;line-height:1.6;">
          Start with the recommended two-stage model: a lower share until <b>${pcText}</b> is recovered, then a higher share once you break even. You can fine-tune every number afterward.
        </div>
        <button class="btn gold" id="ps-quickstart-btn">✨ Use recommended template</button>
        <div style="font-size:11px;color:var(--text3);margin-top:.85rem;">…or build it up one stage at a time with <b>+ Add Tier</b> below.</div>
      </div>`;
    const qs = $('ps-quickstart-btn');
    if (qs) qs.addEventListener('click', psApplyTemplate);
    return;
  }

  // ── Context strip: production cost + where the book stands today
  let liveStats = null;
  try { liveStats = calculateArtistEarnings(psActiveBookId); } catch (_) { liveStats = null; }
  const ctx = document.createElement('div');
  ctx.className = 'settings-metric-grid';
  const ctxItem = (label, val, accent) => `
    <div class="settings-metric-card">
      <div class="settings-metric-label">${label}</div>
      <div class="settings-metric-value ${accent || ''}">${val}</div>
    </div>`;
  let ctxHtml = ctxItem('Production cost', productionCost > 0 ? fmt(productionCost, cur) : 'Not set', productionCost > 0 ? '' : 'gold');
  if (liveStats) {
    ctxHtml += ctxItem('Revenue to date', fmt(liveStats.cumulativeRevenue, cur), 'gold');
    ctxHtml += ctxItem('Artist earned', fmt(liveStats.totalArtistEarned, cur), '');
  }
  ctx.innerHTML = ctxHtml;
  list.appendChild(ctx);

  // ── Tier cards. Keep references so live edits update derived UI without a
  // full re-render (which would steal focus from the input being typed in).
  const rowRefreshers = [];
  const capOf = (t) => tierEffectiveCap(t, productionCost);

  tiers.forEach((t, i) => {
    const isLast = i === tiers.length - 1;
    const row = document.createElement('div');
    row.className = 'tier-card';

    // Top line: stage badge + covered revenue range + remove button
    const top = document.createElement('div');
    top.className = 'tier-card-header';

    const badge = document.createElement('span');
    badge.className = 'tier-badge';
    badge.textContent = String(i + 1);

    const range = document.createElement('div');
    range.className = 'tier-range';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'tier-remove-btn';
    removeBtn.innerHTML = '✕';
    removeBtn.title = 'Remove this tier';
    removeBtn.setAttribute('aria-label', 'Remove tier');
    removeBtn.addEventListener('click', () => {
      book.profitTiers.splice(i, 1);
      renderProfitTierList();
    });
    top.appendChild(badge);
    top.appendChild(range);
    top.appendChild(removeBtn);
    row.appendChild(top);

    // Input grid: Label · Threshold · Artist %
    const grid = document.createElement('div');
    grid.className = 'settings-form-grid';

    const makeField = (labelText, type, val, placeholder, onChange) => {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';
      wrap.style.margin = '0';
      const lbl = document.createElement('label');
      lbl.textContent = labelText;
      const inp = document.createElement('input');
      inp.type = type;
      inp.value = val;
      if (placeholder) inp.placeholder = placeholder;
      inp.style.width = '100%';
      let last = inp.value;
      const handle = () => { if (inp.value === last) return; last = inp.value; onChange(inp.value); psUpdateDerived(); };
      inp.addEventListener('input', handle);
      inp.addEventListener('change', handle);
      wrap.appendChild(lbl);
      wrap.appendChild(inp);
      return wrap;
    };

    grid.appendChild(makeField('Stage label', 'text', t.label, 'e.g. Pre break-even', v => { t.label = v; }));

    // Threshold: editable except the final tier (always uncapped)
    const threshWrap = document.createElement('div');
    threshWrap.className = 'form-group';
    threshWrap.style.margin = '0';
    const threshLbl = document.createElement('label');
    threshLbl.textContent = `Up to (${cur} gross)`;
    threshWrap.appendChild(threshLbl);
    if (isLast) {
      const pill = document.createElement('div');
      pill.style.cssText = 'height:44px;display:flex;align-items:center;gap:6px;font-family:\'DM Mono\',monospace;font-size:12px;font-weight:600;color:var(--gold);';
      pill.innerHTML = '<span style="font-size:16px;">∞</span> No ceiling';
      threshWrap.appendChild(pill);
    } else {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.value = t.revenueUpTo || '';
      inp.placeholder = 'e.g. production cost';
      inp.style.width = '100%';
      let last = inp.value;
      const handle = () => { if (inp.value === last) return; last = inp.value; t.revenueUpTo = parseFloat(inp.value) || 0; psUpdateDerived(); };
      inp.addEventListener('input', handle);
      inp.addEventListener('change', handle);
      threshWrap.appendChild(inp);
    }
    grid.appendChild(threshWrap);

    grid.appendChild(makeField('Artist %', 'number', t.artistPct, '', v => { t.artistPct = parseFloat(v) || 0; }));
    row.appendChild(grid);

    // Split bar: artist vs publisher share for this tier
    const split = document.createElement('div');
    split.style.cssText = 'margin-top:12px;';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;height:7px;border-radius:100px;overflow:hidden;background:var(--cream4);';
    const artistFill = document.createElement('div');
    artistFill.style.cssText = 'height:100%;background:var(--gold);transition:width .15s;';
    bar.appendChild(artistFill);
    const cap = document.createElement('div');
    cap.style.cssText = 'display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:5px;';
    split.appendChild(bar);
    split.appendChild(cap);
    row.appendChild(split);

    list.appendChild(row);

    // Per-row refresher: recompute range text + split bar from current values
    rowRefreshers.push(() => {
      const pct = Math.max(0, Math.min(100, parseFloat(t.artistPct) || 0));
      artistFill.style.width = pct + '%';
      cap.innerHTML = `<span style="color:var(--gold);font-weight:600;">Artist ${pct}%</span><span>Publisher ${Math.round((100 - pct) * 10) / 10}%</span>`;
      const prevCap = i > 0 ? capOf(tiers[i - 1]) : 0;
      const from = i === 0 ? fmt(0, cur) : (prevCap != null ? fmt(prevCap, cur) : '—');
      const thisCap = capOf(t);
      const to = thisCap != null ? fmt(thisCap, cur) : '∞';
      range.textContent = `${from}  →  ${to}`;
    });
  });

  // ── Legend
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:11.5px;color:var(--text3);margin-top:4px;line-height:1.6;';
  hint.innerHTML = '“Up to” is the cumulative gross revenue at which the <b>next</b> stage begins. A stage labelled “break-even” automatically caps at the book’s production cost. The final stage has no ceiling.';
  list.appendChild(hint);

  // ── Validation + live preview live in #ps-summary so they redraw on every edit
  psUpdateDerived = function () {
    rowRefreshers.forEach(fn => fn());
    psRenderSummary(book, cur, productionCost);
  };
  psUpdateDerived();
}

// Re-assigned inside renderProfitTierList so input handlers can refresh derived
// UI (range text, split bars, validation, preview) without rebuilding inputs.
let psUpdateDerived = () => { };

// Recommended starter: lower share until break-even, higher share after.
function psApplyTemplate() {
  if (!psActiveBookId || !BOOKS[psActiveBookId]) return;
  const book = BOOKS[psActiveBookId];
  const pc = book.productionCost || 0;
  book.profitTiers = [
    { label: 'Pre Break-even', revenueUpTo: pc || 1000, artistPct: 15 },
    { label: 'Post Break-even', revenueUpTo: null, artistPct: 35 },
  ];
  psSimGross = null;
  renderProfitTierList();
  showToast('Template applied — adjust the numbers, then Save');
}

// Validation warnings + a what-if earnings simulator, rendered into #ps-summary.
function psRenderSummary(book, cur, productionCost) {
  const summary = $('ps-summary');
  if (!summary) return;
  const tiers = book.profitTiers || [];
  const capOf = (t) => tierEffectiveCap(t, productionCost);

  // ── Validation
  const warnings = [];
  if (productionCost <= 0 && tiers.some(t => (t.label || '').toLowerCase().includes('break'))) {
    warnings.push('A “break-even” stage caps at the production cost, but this book’s production cost is 0. Set it in <b>Book Catalog → Edit</b> so the cap works.');
  }
  if (tiers.some(t => { const p = parseFloat(t.artistPct); return isNaN(p) || p < 0 || p > 100; })) {
    warnings.push('Every artist % should be between 0 and 100.');
  }
  // Effective caps should rise across stages (sorted view)
  const sortedCaps = tiers.map(capOf).filter(c => c != null);
  for (let i = 1; i < sortedCaps.length; i++) {
    if (sortedCaps[i] <= sortedCaps[i - 1]) { warnings.push('Stage thresholds should increase — each “Up to” must be larger than the one before.'); break; }
  }
  // Percentages are meant to climb as costs are recovered
  const sortedByCap = [...tiers].sort((a, b) => { const ca = capOf(a), cb = capOf(b); return (ca == null ? Infinity : ca) - (cb == null ? Infinity : cb); });
  for (let i = 1; i < sortedByCap.length; i++) {
    if ((parseFloat(sortedByCap[i].artistPct) || 0) < (parseFloat(sortedByCap[i - 1].artistPct) || 0)) {
      warnings.push('Usually the artist’s % rises after break-even — a later stage currently pays a lower % than an earlier one. Intentional? Otherwise bump it up.');
      break;
    }
  }

  const validationHtml = warnings.length
    ? `<div class="alert-card">
         <span style="font-size:18px;line-height:1;margin-top:2px;">⚠️</span>
         <div>
           <b style="font-weight:700;">Check these settings:</b>
           <ul>${warnings.map(w => `<li>${w}</li>`).join('')}</ul>
         </div>
       </div>`
    : `<div class="alert-card success">
         <span style="font-size:18px;line-height:1;">✓</span>
         <div>Tiers look consistent.</div>
       </div>`;

  // ── What-if simulator
  let defaultGross = productionCost > 0 ? Math.round(productionCost * 2) : 1000;
  try { const st = calculateArtistEarnings(psActiveBookId); if (st && st.cumulativeRevenue > 0) defaultGross = Math.round(st.cumulativeRevenue); } catch (_) { }
  const gross = psSimGross == null ? defaultGross : psSimGross;
  const sim = psSimulateSplit(tiers, productionCost, gross);
  const artistPct = sim.gross > 0 ? (sim.totalArtist / sim.gross) * 100 : 0;

  const tierRowsHtml = sim.sorted.map((t, i) => {
    const r = sim.rows[i];
    if (r.revenue <= 0.001) return '';
    const c = capOf(t);
    const label = escapeHtml(t.label || `Stage ${i + 1}`);
    const cTxt = c != null ? `up to ${fmt(c, cur)}` : 'no ceiling';
    return `<div class="preview-table-row">
        <span>${label} <span style="color:var(--text3); font-size:10px;">· ${cTxt} · ${parseFloat(t.artistPct) || 0}%</span></span>
        <span style="font-family:'DM Mono',monospace;color:rgba(255,255,255,0.6);" title="Revenue falling in this stage">${fmt(r.revenue, cur)}</span>
        <span style="font-family:'DM Mono',monospace;color:var(--gold3);" title="Artist earns from this stage">${fmt(r.artist, cur)}</span>
      </div>`;
  }).join('');

  summary.innerHTML = `
    ${validationHtml}
    <div class="preview-container">
      <div class="preview-title-row">
        <div class="settings-metric-label" style="color:rgba(255,255,255,.5);">Earnings split simulator</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;color:rgba(255,255,255,.55);">If gross revenue is</span>
          <input id="ps-sim-input" type="number" value="${gross}" style="width:120px;padding:6px 10px;font-size:13px;font-family:'DM Mono',monospace;border:1px solid rgba(255,255,255,.14);border-radius:var(--r);background:rgba(255,255,255,.06);color:var(--cream);outline:none;">
          <span style="font-size:11px;color:rgba(255,255,255,.55);">${escapeHtml(cur)}</span>
        </div>
      </div>
      <div class="preview-bar">
        <div class="preview-bar-fill" style="width:${Math.max(0, Math.min(100, artistPct))}%;"></div>
      </div>
      <div class="preview-summary-values">
        <span style="color:var(--gold3);font-family:'DM Mono',monospace;">Artist ${fmt(sim.totalArtist, cur)} <span style="opacity:.65;">(${artistPct.toFixed(1)}%)</span></span>
        <span style="color:rgba(255,255,255,.7);font-family:'DM Mono',monospace;">Publisher ${fmt(sim.publisher, cur)}</span>
      </div>
      <div class="preview-table">
        <div class="preview-table-header">
          <span>Stage</span><span>Revenue</span><span>Artist</span>
        </div>
        <div style="color:rgba(247,242,233,.85);">${tierRowsHtml || '<div style="font-size:11px;color:rgba(255,255,255,.4);padding:6px 0;">Enter a revenue figure to preview the split.</div>'}</div>
      </div>
    </div>`;

  const simInput = $('ps-sim-input');
  if (simInput) {
    simInput.addEventListener('change', () => {
      const v = parseFloat(simInput.value);
      psSimGross = isNaN(v) ? 0 : v;
      psRenderSummary(book, cur, productionCost);
    });
  }
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

  const editedTiers = BOOKS[psActiveBookId] ? BOOKS[psActiveBookId].profitTiers : null;

  try {
    await syncCatalog();
    if (BOOKS[psActiveBookId] && editedTiers) {
      BOOKS[psActiveBookId].profitTiers = editedTiers;
    }
    await saveCatalogWithDeletions();
    showToast('✓ Profit tiers saved');
    if (activeBook === psActiveBookId) updateDash();
  } catch (e) {
    showToast('⚠ Error saving tiers', 'err');
  } finally {
    if (ind) setTimeout(() => ind.classList.remove('show'), 1500);
  }
}

// Thin wrapper over the pure calcArtistEarnings (src/lib/earnings.js) that
// resolves the book/state from app globals. The money math itself is unit-tested
// in tests/earnings.test.js.
function calculateArtistEarnings(bookId) {
  const book = BOOKS[bookId];
  if (!book) return null;
  const s = states[bookId] || defaultState(book);
  return calcArtistEarnings(book, s);
}

// ── FINANCIAL CENTER LOGIC
export function calculateFinancials(year) {
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

  const yearStr = String(year);

  // Helper for consistent amount extraction
  const getAmt = (e) => e.baseAmount || e.amountCAD || e.amount || 0;

  // 1. Process Book-specific data
  BOOK_LIST.forEach(book => {
    if (isTestBook(book) || isTestBookId(book.id)) return;
    const s = states[book.id] || defaultState(book);
    const unitCost = (book.productionCost || 0) / (book.maxPrint || 1);

    let bookRev = 0;
    let bookUnits = 0;

    (s.hist || []).forEach(h => {
      const inYear = h.date && h.date.startsWith(yearStr);
      if (!h.voided && !h.gratuity && inYear) {
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
      const inYear = e.date && e.date.startsWith(yearStr);
      if (!e.voided && inYear) {
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
    const inYear = e.date && e.date.startsWith(yearStr);
    if (!e.voided && inYear) {
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
  const tiers = [...(book.profitTiers || [])].sort((a, b) => (a.revenueUpTo || Infinity) - (b.revenueUpTo || Infinity));
  if (tiers.length === 0) return 0;

  const yearStr = String(year);

  let yearArtistEarned = 0;
  let cumulativeRevenue = 0;

  // Walk history chronologically so cumulative revenue tracks correctly across all time.
  // Deliberately INCLUDE artistPending (direct-to-artist) sales: calculateFinancials
  // already counts their gross in revenue, so their artist share must be counted too,
  // otherwise profit would be overstated on funds the artist is holding.

  // ⚡ Bolt Optimization: Use backward loop to avoid multiple array allocations from [...].reverse().filter()
  if (s.hist && s.hist.length > 0) {
    for (let i = s.hist.length - 1; i >= 0; i--) {
      const h = s.hist[i];
      if (h.voided || h.gratuity || !(h.qty > 0) || !(h.price > 0)) continue;

      const inYear = h.date && h.date.startsWith(yearStr);
      let revRemaining = h.qty * h.price;
      while (revRemaining > 0.001) {
        const tier = tiers.find(t => t.revenueUpTo !== null && cumulativeRevenue < t.revenueUpTo) || tiers[tiers.length - 1];
        const isLastTier = tier === tiers[tiers.length - 1] || tier.revenueUpTo === null;
        const capacity = isLastTier ? revRemaining : Math.min(revRemaining, tier.revenueUpTo - cumulativeRevenue);
        if (inYear) yearArtistEarned += capacity * (tier.artistPct / 100);
        cumulativeRevenue += capacity;
        revRemaining -= capacity;
      }
    }
  }

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

  const totalExpCount = Object.values(fin.expCats).reduce((a, c) => a + c.count, 0);
  let subText = `${totalExpCount} expense${totalExpCount !== 1 ? 's' : ''} logged`;
  if (fin.missingReceiptsCount > 0) {
    subText += ` · <span style="color:var(--red);font-weight:600;">${fin.missingReceiptsCount} missing receipt${fin.missingReceiptsCount !== 1 ? 's' : ''}</span>`;
  }
  $('fin-exp-sub').innerHTML = subText;
  $('fin-profit').textContent = fmt(fin.profit, cur);

  const expBody = $('fin-exp-body');
  if (expBody) {
    const sortedCats = Object.entries(fin.expCats).sort((a, b) => b[1].total - a[1].total);
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
        <td style="font-weight:600;">${escapeHtml(bs.title)}</td>
        <td class="r">${bs.units}</td>
        <td class="r">${fmt(bs.revenue, cur)}</td>
        <td class="r">${fmt(bs.unitCost, cur)}</td>
        <td class="r">${fmt(bs.cogs, cur)}</td>
        <td class="r" style="font-weight:700; color:${bs.net > 0 ? 'var(--green)' : 'var(--text)'};">${fmt(bs.net, cur)}</td>
      </tr>
    `).join('') || '<tr><td colspan="6"><div class="empty-state">No data available.</div></td></tr>';
  }
}


// ── GOOGLE AUTHENTICATION
window.tryGoogleLogin = async function () {
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
  $('pw-gate').style.display = 'none';
  $('pw-app').style.display = '';
  if (role === 'author' || IS_AUTHOR_MODE) {
    document.getElementById('main-app').classList.add('author-mode');
    const allOv = $('tab-all-overview');
    if (allOv) { allOv.style.display = 'none'; allOv.classList.remove('active'); }
    $('tab-bar').style.display = '';
    const wm = $('author-watermark'); if (wm) { wm.textContent = BOOKS[bookId || ACTIVE_BOOK_FORCED]?.title + ' · Author view'; wm.style.display = ''; }
    const sheetsBtn = $('sheets-tab-btn'); if (sheetsBtn) sheetsBtn.style.display = 'none';
    const websiteTabBtn = $('website-tab-btn'); if (websiteTabBtn) websiteTabBtn.style.display = 'none';
    const backupsBtn = $('backups-tab-btn'); if (backupsBtn) backupsBtn.style.display = 'none';
    const websitePanel = $('tab-website');
    if (websitePanel) {
      websitePanel.style.display = 'none';
      websitePanel.classList.remove('active');
    }
    const openLink = $('sheets-open-link'); if (openLink) openLink.style.display = 'none !important';
    const style = document.createElement('style');
    style.textContent = '#sheets-open-link{display:none!important;}#side-sheets-open{display:none!important;}#open-sheet-link{display:none!important;}#d-breakeven-kpi{display:none!important;}#d-breakeven-block{display:none!important;}#d-reimburse-sect{display:none!important;}#d-expenses-sect{display:none!important;}#d-expenses-kpi{display:none!important;}#d-reimburse-kpi{display:none!important;}#danger-zone-sect{display:none!important;}#danger-zone-block{display:none!important;}#import-btn{display:none!important;}#tab-all-overview{display:none!important;}#backups-tab-btn{display:none!important;}#exp-ai-btn{display:none!important;}';
    document.head.appendChild(style);
  } else {
    // Publisher — show import button and financials tab
    const importBtn = $('import-btn'); if (importBtn) importBtn.style.display = '';
    const finBtn = $('financials-tab-btn'); if (finBtn) finBtn.style.display = '';
    const websiteTabBtn = $('website-tab-btn'); if (websiteTabBtn) websiteTabBtn.style.display = '';
    const backupsBtn = $('backups-tab-btn'); if (backupsBtn) backupsBtn.style.display = '';
  }
  updateRoleToggleButton();
  syncRoleUI();
  boot(bookId || ACTIVE_BOOK_FORCED);
}

async function boot(forcedBook) {
  buildBookSwitcher();
  await loadPaymentLinks();
  await loadProductionCosts();
  await loadWebsitePaymentMethods();
  await loadCustomerSuppression();
  await loadMailingList();
  await loadCampaigns();
  await loadOpenCalls();
  renderCatalogList();
  renderProfitSettings();

  const setupSpreadsheetInput = $('sheets-spreadsheet-input');
  if (setupSpreadsheetInput) {
    setupSpreadsheetInput.value = sheetsSpreadsheetUrl || localStorage.getItem('lm-last-spreadsheet-url') || '';
  }

  if (sheetsUrl) showSheetsConnected();
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
      $('tab-all-overview').style.display = 'none';
      $('tab-all-overview').classList.remove('active');
      $('tab-bar').style.display = '';
      $('tab-dashboard').style.display = 'block';
      $('tab-dashboard').classList.add('active');
      loadBook(forcedBook).then(() => {
        setSyncState('ok', '<b>Firestore</b> · connected');
        updateSubheader(new Date().toLocaleTimeString());
        renderAll(); updateHeader(); updateRoleToggleButton(); syncRoleUI();
        // Fire-and-forget: a stall with no signal must still finish booting,
        // so this isn't awaited and its own failures are swallowed silently.
        window.posConfigureRates({ silent: true });
      });
    } else {
      // Publisher
      activeBook = 'all';
      loadAllBooks().then(() => {
        maybeRunDailyBackup(true); startDailyBackupWatcher();
        window.posConfigureRates({ silent: true });
      });
      updateRoleToggleButton();
      syncRoleUI();
    }
  };

  initFn();
}

// ── TAX CENTER LOGIC
export const TC_CATEGORIES = [
  'Software & Subscriptions', 'Marketing & Advertising', 'Printing & Production',
  'Editorial & Proofreading', 'Illustration & Photography', 'Rights & Permissions',
  'ISBN, Barcodes & Cataloging', 'Shipping & Postage', 'Warehousing & Fulfillment',
  'Packaging Materials', 'Office Supplies', 'Home Office', 'Travel & Meals', 'Professional Services',
  'Books, Research & Reference', 'Events & Exhibitions', 'Artist Royalties', 'Other'
];

export function changeExpenseCategory(itemId, newCat) {
  const exp = (TAX_CENTER.businessExpenses || []).find(e => String(e.id) === String(itemId));
  if (!exp) return;
  if (exp.cat === newCat) return;
  exp.cat = newCat;
  saveTaxCenter();
  renderTaxCenter();
  showToast(`✓ Moved to ${newCat}`);
}


// Persist the ledger view (year + search + type) so a tax session survives a
// reload or PWA relaunch. Restored once, lazily, on the first Tax Center render.


// Debounced free-text search over the Master Ledger (description / ref / category / type).

// Sales-only / Expenses-only toggle for the Master Ledger.

// Year dropdown change — reset to page 1 (the inline handler used to set a stray
// global instead of the module's _tcLedgerPage) and persist the choice.
// Canonical year-filter handler. Both the Cash Flow Summary select (#tc-year)
// and the Master Ledger select (#tc-year-ledger) call this so they stay in sync
// and drive the same render. renderTaxCenter() reads #tc-year, so push the new
// value there too in case the change came from the ledger control.

// Retained for backward-compatibility (older inline handlers / persisted code
// paths may still call it). Delegates to the canonical handler using the
// current #tc-year value.

// Clear the Master Ledger search + type filter in one click. The year is left
// alone — it has its own visible dropdown and scopes the summary cards too.

// Apply the active search + type filter to the full (year-filtered) ledger array.



















if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tc-trip-picker-wrapper')) {
      ['tc-exp-trip', 'tc-edit-trip-input', 'edit-exp-trip'].forEach(tcCloseTripDropdown);
    }
  });
}

function exportTripCSV(tripName) {
  const detail = window._tcTripDetail;
  if (!detail || !detail.byName || !detail.byName[tripName]) {
    showToast('⚠ Trip details not found', 'warn');
    return;
  }

  const { baseCurrency, byName } = detail;
  const { items } = byName[tripName];

  const rows = [
    ['Date', 'Description', 'Tax Category', 'Reference', 'Original Currency', 'Original Amount', `Base Amount (${baseCurrency})`, 'Receipt URL'],
    ...items.map(item => [
      item.date || '',
      item.desc || '',
      item.cat || '',
      item.ref || '',
      item.origCurrency || 'CAD',
      Number(item.origAmount || 0).toFixed(2),
      Number(item.baseAmount || 0).toFixed(2),
      item.receipt || '',
    ]),
  ];

  const safeFilename = `trip_expenses_${tripName.replace(/[^a-zA-Z0-9_\-]/g, '_')}.csv`;
  downloadCsv(toCsv(rows), safeFilename);
  showToast(`✓ Exported ${items.length} expenses to ${safeFilename}`);
}

async function setTripBudgetPrompt(tripName) {
  if (!tripName) return;
  if (!TAX_CENTER.tripBudgets) TAX_CENTER.tripBudgets = {};
  const currentBudget = TAX_CENTER.tripBudgets[tripName] || '';
  const input = window.prompt(`Set Target Budget (CAD) for trip "${tripName}":\n(Leave blank to clear budget limit)`, currentBudget);
  if (input === null) return;

  const val = parseFloat(input.trim());
  if (!isNaN(val) && val > 0) {
    TAX_CENTER.tripBudgets[tripName] = val;
    showToast(`✓ Budget set to ${fmt(val, TAX_CENTER.settings?.baseCurrency || 'CAD')} for ${tripName}`);
  } else {
    delete TAX_CENTER.tripBudgets[tripName];
    showToast(`✓ Budget cleared for ${tripName}`);
  }

  await saveTaxCenter();
  renderTaxCenter();
  if (_tcOpenTripName === tripName) {
    showTripDetail(tripName);
  }
}





// Escape a value for safe interpolation into an SVG/HTML attribute or text node.

// Build a delta chip ("▲ 12% vs 2024" / "new" / "—") for a headline stat.
// `goodWhenUp` flips colour semantics for expenses (a rise is bad / red).

// Render the redesigned Cash Flow Summary card. Pulls headline figures from the
// totals renderTaxCenter already computed, derives period-over-period deltas and
// secondary KPIs via the pure cashflow helpers, and draws an inline-SVG mini
// chart. No external libraries; everything is a string built here.







// Build a responsive inline-SVG paired-bar chart (green income / red expenses)
// from the ledger. Months for a single year, years for "All Time". Returns ''
// when there is nothing to plot so the chart hides gracefully.

export async function removeLedgerEntry(type, bid, id) {
  if (!(await confirmDialog('Are you sure you want to permanently delete this entry from the ledger?', { okLabel: 'Delete entry', danger: true }))) return;

  if (type === 'businessExpense') {
    TAX_CENTER.businessExpenses = (TAX_CENTER.businessExpenses || []).filter(e => String(e.id) !== String(id));
    saveTaxCenter();
  } else if (type === 'bookExpense') {
    const s = states[bid];
    if (s && s.expenses) {
      s.expenses = s.expenses.filter(e => String(e.id) !== String(id));
      saveState(bid);
    }
  } else if (type === 'artistPayout') {
    const s = states[bid];
    if (s && s.artistTransfers) {
      s.artistTransfers = s.artistTransfers.filter(t => String(t.id || t.num) !== String(id));
      saveState(bid);
    }
  } else if (type === 'sale') {
    const s = states[bid];
    if (s && s.hist) {
      s.hist = s.hist.filter(h => String(h.id || h.num) !== String(id));
      saveState(bid);
    }
  }

  renderTaxCenter();
  showToast('✓ Entry removed from ledger');
}

export let _tcEditTripId = null;
export let _tcOpenTripName = null;

export function openEditTrip(itemId) {
  const exp = (TAX_CENTER.businessExpenses || []).find(e => String(e.id) === String(itemId));
  if (!exp) return;
  _tcEditTripId = itemId;
  $('tc-edit-trip-context').textContent = `${exp.desc || 'Expense'} · ${exp.date || ''}`;
  $('tc-edit-trip-input').value = exp.trip || '';
  openM('tc-edit-trip');
  setTimeout(() => $('tc-edit-trip-input').focus(), 50);
}

function saveTripAssignment() {
  if (_tcEditTripId === null) return;
  const newTrip = ($('tc-edit-trip-input').value || '').trim();
  const exp = (TAX_CENTER.businessExpenses || []).find(e => String(e.id) === String(_tcEditTripId));
  if (!exp) return;
  exp.trip = newTrip;
  saveTaxCenter();
  closeM('tc-edit-trip');
  _tcEditTripId = null;
  renderTaxCenter();
  showToast(newTrip ? `✓ Assigned to ${newTrip}` : '✓ Removed from trip');
}

let _editingExpense = null;

function renderEditExpenseReceipts() {
  const container = $('edit-exp-receipts-preview');
  if (!container || !_editingExpense) return;
  if (!_editingExpense.files.length) {
    container.innerHTML = '<span style="color:var(--text3);font-size:11px;">No receipts attached</span>';
    return;
  }

  container.innerHTML = _editingExpense.files.map((r, idx) => {
    let name = 'Receipt';
    let viewLink = '';
    if (typeof r === 'string' && r.startsWith('local://')) {
      const fn = r.replace('local://', '');
      const base = fn.split('/').pop();
      name = base;
      viewLink = `<a href="#" onclick="event.preventDefault(); viewLocalReceipt('${fn.replace(/'/g, "\\'")}')" style="color:var(--gold3);text-decoration:underline;">${escapeHtml(base)}</a>`;
    } else {
      name = String(r).split('/').pop() || 'Remote Receipt';
      viewLink = `<a href="${r}" target="_blank" style="color:var(--gold3);text-decoration:underline;">${escapeHtml(name)}</a>`;
    }
    return `<div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);margin-bottom:4px;">
      <span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;" title="${escapeHtml(name)}">📄 ${viewLink}</span>
      <div style="display:flex;gap:4px;">
        <button class="btn tx" type="button" onclick="relinkEditExpenseReceipt(${idx})" style="padding:2px 6px;font-size:10px;color:var(--gold);" title="Change or edit this receipt link">✏️ Relink</button>
        <button class="btn tx" type="button" onclick="removeEditExpenseReceipt(${idx})" style="padding:2px 6px;font-size:10px;color:var(--red);" title="Remove receipt attachment">Remove</button>
      </div>
    </div>`;
  }).join('');
}

async function relinkEditExpenseReceipt(idx) {
  if (!_editingExpense) return;
  const currentPath = _editingExpense.files[idx] || '';
  const currentFilename = typeof currentPath === 'string' ? currentPath.replace('local://', '') : '';

  const newPath = await promptDialog(
    `Enter the correct relative filename or path in your connected receipts folder:\n(e.g., "Business/2026-06-03_receipt.jpg" or "receipt_123.pdf")`,
    currentFilename,
    { title: 'Relink Receipt File', okLabel: 'Update Link', cancelLabel: 'Cancel' }
  );

  if (newPath !== null && newPath.trim()) {
    const cleanPath = newPath.trim().replace(/^local:\/\//, '');
    _editingExpense.files[idx] = `local://${cleanPath}`;
    renderEditExpenseReceipts();
    showToast('✓ Receipt link updated — click Save changes to apply', 'ok');
  }
}

function removeEditExpenseReceipt(idx) {
  if (!_editingExpense) return;
  _editingExpense.files.splice(idx, 1);
  renderEditExpenseReceipts();
}

export function openEditSale(bid, itemId) {
  switchBook(bid);
  const s = states[bid];
  if (!s || !Array.isArray(s.hist)) return;
  const idx = s.hist.findIndex(h => String(h.id || h.num) === String(itemId));
  if (idx !== -1) {
    const h = s.hist[idx];
    if (h.consignmentLink) {
      const lIdx = s.ledger.findIndex(e => e.sheetsId === h.sheetsId || (e.date === h.date && e.storeName === h.notes && e.qty === h.qty));
      if (lIdx !== -1) {
        openEditLedger(lIdx);
        return;
      }
    }
    openEditHist(idx);
  } else {
    showToast('⚠ Sale record not found', 'err');
  }
}



export function openEditExpense(type, bid, id) {
  let exp = null;
  if (type === 'businessExpense') {
    exp = (TAX_CENTER.businessExpenses || []).find(e => String(e.id) === String(id));
  } else if (type === 'bookExpense') {
    const s = states[bid];
    if (s && s.expenses) {
      exp = s.expenses.find(e => String(e.id) === String(id));
    }
  }
  if (!exp) {
    showToast('⚠ Expense entry not found', 'err');
    return;
  }

  // Populate dynamic category dropdown
  const catSelect = $('edit-exp-cat');
  if (catSelect) {
    catSelect.innerHTML = TC_CATEGORIES.map(c => `<option value="${c.replace(/"/g, '&quot;')}">${c}</option>`).join('');
    if (exp.cat && !TC_CATEGORIES.includes(exp.cat)) {
      catSelect.innerHTML += `<option value="${exp.cat.replace(/"/g, '&quot;')}">${exp.cat}</option>`;
    }
    catSelect.value = exp.cat || 'Other';
  }

  _editingExpense = {
    type,
    bid,
    id,
    files: Array.isArray(exp.receiptFiles) ? [...exp.receiptFiles] : (exp.receipt ? [exp.receipt] : [])
  };

  $('edit-exp-desc').value = exp.desc || '';
  $('edit-exp-cur').value = exp.origCurrency || exp.currency || 'CAD';
  $('edit-exp-amount').value = exp.origAmount != null ? exp.origAmount : (exp.amount || 0);
  $('edit-exp-date').value = exp.date || today();
  $('edit-exp-trip').value = exp.trip || '';
  $('edit-exp-file').value = '';
  if ($('edit-exp-file-preview')) $('edit-exp-file-preview').textContent = '';

  renderEditExpenseReceipts();
  openM('edit-expense');
}

async function saveExpenseEdit() {
  if (!_editingExpense) return;
  const { type, bid, id } = _editingExpense;

  const desc = ($('edit-exp-desc').value || '').trim();
  const cat = $('edit-exp-cat').value;
  const currency = $('edit-exp-cur').value || 'CAD';
  const amount = parseFloat($('edit-exp-amount').value) || 0;
  const date = $('edit-exp-date').value || today();
  const trip = ($('edit-exp-trip').value || '').trim();

  if (!desc) { showToast('⚠ Please enter a description', 'warn'); $('edit-exp-desc').focus(); return; }
  if (!amount) { showToast('⚠ Please enter an amount', 'warn'); $('edit-exp-amount').focus(); return; }

  const submitBtn = $('m-edit-expense').querySelector('.modal-footer .gold');
  const oldText = submitBtn.textContent;
  submitBtn.textContent = 'Saving...'; submitBtn.disabled = true;

  try {
    const fileInput = $('edit-exp-file');
    let newReceiptUrl = '';
    if (fileInput && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      if (_pendingWebcamReceipt && _pendingWebcamReceipt.name === file.name && _pendingWebcamReceipt.size === file.size) {
        newReceiptUrl = _pendingWebcamReceipt.url;
      } else {
        const subfolder = type === 'bookExpense' && BOOKS[bid] ? BOOKS[bid].title : 'General';
        const localUrl = await saveReceiptToLocalFile(file, subfolder.replace(/[^a-zA-Z0-9.\-_]/g, '_'));
        if (localUrl) newReceiptUrl = localUrl;
      }
    }

    if (newReceiptUrl) {
      _editingExpense.files.push(newReceiptUrl);
    }

    // Recalculate converted CAD total
    const fxRate = _fxRateCache[`${currency}_CAD`] || 1;
    const baseAmount = amount * fxRate;

    // Find and update item
    let exp = null;
    if (type === 'businessExpense') {
      exp = (TAX_CENTER.businessExpenses || []).find(e => String(e.id) === String(id));
      if (exp) {
        exp.desc = desc;
        exp.cat = cat;
        exp.currency = currency;
        exp.origCurrency = currency;
        exp.amount = amount;
        exp.origAmount = amount;
        exp.fxRate = fxRate;
        exp.baseAmount = baseAmount;
        exp.date = date;
        exp.trip = trip;
        exp.receiptFiles = [..._editingExpense.files];
        exp.receipt = _editingExpense.files[0] || '';
        await saveTaxCenter();
      }
    } else if (type === 'bookExpense') {
      const s = states[bid];
      if (s && s.expenses) {
        exp = s.expenses.find(e => String(e.id) === String(id));
        if (exp) {
          exp.desc = desc;
          exp.cat = cat;
          exp.currency = currency;
          exp.origCurrency = currency;
          exp.amount = amount;
          exp.origAmount = amount;
          exp.baseAmount = baseAmount;
          exp.date = date;
          exp.receiptFiles = [..._editingExpense.files];
          exp.receipt = _editingExpense.files[0] || '';
          await saveState(bid);
        }
      }
    }

    // If active modals (trip detail, category detail) are open, re-render them too
    const tripModal = $('m-tc-trip-detail');
    const catModal = $('m-tc-cat-detail');
    if (tripModal && tripModal.style.display !== 'none' && _tcOpenTripName) {
      await loadTaxCenter();
      renderTaxCenter();
      showTripDetail(_tcOpenTripName);
    } else if (catModal && catModal.style.display !== 'none') {
      const activeCatName = $('tc-cat-detail-title').textContent;
      if (activeCatName) {
        await loadTaxCenter();
        renderTaxCenter();
        showCategoryDetail(activeCatName);
      }
    } else {
      renderTaxCenter();
    }

    closeM('edit-expense');
    showToast('✓ Expense updated successfully');
  } catch (e) {
    console.error('Error saving expense edit', e);
    showToast('⚠ Error saving changes', 'err');
  } finally {
    submitBtn.textContent = oldText; submitBtn.disabled = false;
    _editingExpense = null;
    _pendingWebcamReceipt = null;
  }
}

export function showTripDetail(tripName) {
  const detail = window._tcTripDetail;
  if (!detail || !detail.byName[tripName]) return;
  const { baseCurrency } = detail;
  const { items, total, count, categories } = detail.byName[tripName];
  _tcOpenTripName = tripName;

  // ⚡ Bolt Optimization: Use string comparison instead of parsing to Date for sorting "YYYY-MM-DD" formatted dates
  const sorted = items.slice().sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    return dateA > dateB ? 1 : dateA < dateB ? -1 : 0;
  });

  const catPills = Object.entries(categories || {}).map(([cat, amt]) => {
    return `<span style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);padding:2px 8px;border-radius:10px;font-size:11px;color:var(--text2);">${escapeHtml(cat)}: <b>-${fmt(amt, baseCurrency)}</b></span>`;
  }).join(' ');

  const rows = sorted.map(item => {
    const refCell = _localReceiptCell(item);
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
        <td style="display:flex;gap:4px;align-items:center;justify-content:flex-end;">
          <button class="btn" style="font-size:10px;padding:3px 8px;" onclick="openEditTrip('${item.id}')" title="Move to a different trip">Move</button>
          <button class="btn-icon" aria-label="Edit entry" onclick="openEditExpense('businessExpense', '', '${item.id}')" title="Edit entry">✏️</button>
          <button class="btn-icon" aria-label="Delete entry" onclick="removeLedgerEntry('businessExpense', '', '${item.id}')" title="Delete entry">🗑️</button>
        </td>
      </tr>`;
  }).join('');

  const rec = _tcFindTripRecord(tripName);
  const recBits = [];
  if (rec?.destination) recBits.push(`📍 ${escapeHtml(rec.destination)}`);
  if (rec?.startDate || rec?.endDate) recBits.push(`🗓 ${escapeHtml([rec.startDate, rec.endDate].filter(Boolean).join(' → '))}`);
  if (rec?.purpose) recBits.push(`🎯 ${escapeHtml(rec.purpose)}`);

  $('tc-trip-detail-title').textContent = `✈ ${tripName}`;
  $('tc-trip-detail-summary').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div>${count} expense${count === 1 ? '' : 's'} &bull; <span style="color:var(--red-light);font-weight:bold;">Trip total: -${fmt(total, baseCurrency)}</span></div>
      ${recBits.length ? `<div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:var(--text3);">${recBits.join('<span>·</span>')}</div>` : ''}
      ${rec?.notes ? `<div style="font-size:12px;color:var(--text3);font-style:italic;">${escapeHtml(rec.notes)}</div>` : ''}
      ${catPills ? `<div style="display:flex;flex-wrap:wrap;gap:6px;">${catPills}</div>` : ''}
    </div>
  `;
  $('tc-trip-detail-body').innerHTML = rows
    || `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:26px 12px;font-size:12px;">
          <div style="margin-bottom:10px;">No expenses assigned to this trip yet.</div>
          <button class="btn gold" onclick="logExpenseForTrip()">➕ Log the first expense</button>
        </td></tr>`;
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
  // A declared trip can have zero expenses, so the record — not the expense
  // count — decides whether the rename actually happened.
  const rec = _tcFindTripRecord(_tcOpenTripName);
  if (rec) rec.name = next;
  if (TAX_CENTER.tripBudgets?.[_tcOpenTripName] != null) {
    TAX_CENTER.tripBudgets[next] = TAX_CENTER.tripBudgets[_tcOpenTripName];
    delete TAX_CENTER.tripBudgets[_tcOpenTripName];
  }
  if (changed === 0 && !rec) return;
  saveTaxCenter();
  closeM('tc-trip-detail');
  _tcOpenTripName = null;
  renderTaxCenter();
  showToast(`✓ Renamed trip (${changed} expense${changed === 1 ? '' : 's'})`);
}

export function showCategoryDetail(catName) {
  const detail = window._tcCategoryDetail;
  if (!detail || !detail.byName[catName]) return;
  const { baseCurrency } = detail;
  const { items, total, count } = detail.byName[catName];

  // ⚡ Bolt Optimization: Use string comparison instead of parsing to Date for sorting "YYYY-MM-DD" formatted dates
  const sorted = items.slice().sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    return dateA > dateB ? -1 : dateA < dateB ? 1 : 0;
  });

  const rows = sorted.map(item => {
    // Receipt links AND the reference number together — a ref must never
    // hide the saved receipt files.
    let displayRef = item.ref != null ? String(item.ref) : '';
    let legacyReceipt = '';
    if (displayRef && displayRef.includes('local://')) {
      const match = displayRef.match(/href="([^"]+)"/);
      if (match) legacyReceipt = match[1];
      displayRef = '';
    }
    const links = _localReceiptCell(item) || (legacyReceipt ? _localReceiptCell({ receipt: legacyReceipt }) : '');
    const refCell = [
      links,
      displayRef ? `<span style="font-size:11px;color:var(--text3);">${displayRef}</span>` : '',
      item.invoiceNum ? `<span style="font-size:11px;color:var(--gold);">🧾 ${escapeHtml(item.invoiceNum)}</span>` : ''
    ].filter(Boolean).join('<br>');
    const origSym = getSym(item.origCurrency || 'CAD');
    const origDisplay = `${origSym}${Number(item.origAmount || 0).toFixed(2)}`;
    const moveCell = item.sourceType === 'businessExpense'
      ? `<select onchange="changeExpenseCategory('${item.itemId}', this.value)" style="font-size:11px;padding:2px 4px;border:1px solid rgba(255,255,255,.15);border-radius:4px;max-width:170px;" title="Move to another category">
          ${TC_CATEGORIES.map(c => `<option value="${c.replace(/"/g, '&quot;')}"${c === item.cat ? ' selected' : ''}>${c}</option>`).join('')}
        </select>`
      : '<span style="font-size:11px;color:var(--text3);">—</span>';
    const showEdit = (item.sourceType === 'businessExpense' || item.sourceType === 'bookExpense');
    const editBtn = showEdit ? `<button class="btn-icon" aria-label="Edit entry" onclick="openEditExpense('${item.sourceType}', '${item.sourceId || ''}', '${item.itemId}')" title="Edit entry" style="margin-right:4px;">✏️</button>` : '';
    const deleteBtn = item.itemId ? `<button class="btn-icon" aria-label="Delete entry" onclick="removeLedgerEntry('${item.sourceType}', '${item.sourceId || ''}', '${item.itemId}')" title="Delete entry">🗑️</button>` : '';
    return `
      <tr style="color:var(--red);">
        <td style="font-size:12px;">${item.date || '—'}</td>
        <td><span class="tag amber">${item.type}</span></td>
        <td style="font-size:12px;">${item.desc || ''}</td>
        <td style="font-size:12px;">${refCell}</td>
        <td class="r" style="font-size:12px;">${origDisplay}</td>
        <td class="r" style="font-weight:600;">- ${fmt(item.baseAmount, baseCurrency)}</td>
        <td>${moveCell}</td>
        <td class="r">${editBtn}${deleteBtn}</td>
      </tr>`;
  }).join('');

  $('tc-cat-detail-title').textContent = catName;
  $('tc-cat-detail-summary').innerHTML = `${count} transaction${count === 1 ? '' : 's'} · <span style="color:var(--red);font-weight:bold;">Total: - ${fmt(total, baseCurrency)}</span>`;
  $('tc-cat-detail-body').innerHTML = rows;
  openM('tc-cat-detail');
}


// Tax Center receipt scan. `keyId` lets a first-time user scan with the key
// still sitting unsaved in the Config box.
async function scanReceiptWithAI() {
  return _runReceiptScan({
    fileId: 'tc-exp-file', btnId: 'tc-ai-scan-btn', keyId: 'tc-api-key',
    descId: 'tc-exp-desc', dateId: 'tc-exp-date', amountId: 'tc-exp-amount',
    curId: 'tc-exp-cur', catId: 'tc-exp-cat'
  });
}



// Shippo label URLs can expire, so try to save a permanent copy to the local
// receipts folder. Best-effort: returns a local:// path on success, otherwise
// null so the caller keeps the original URL. May fail on CORS or no folder.











async function submitTaxExpense() {
  const desc = ($('tc-exp-desc').value || '').trim();
  const cat = $('tc-exp-cat').value;
  const currency = $('tc-exp-cur').value || 'CAD';
  const amount = parseFloat($('tc-exp-amount').value) || 0;
  const date = $('tc-exp-date').value || today();

  if (!desc) { showToast('⚠ Please enter a description', 'warn'); $('tc-exp-desc').focus(); return; }
  if (!amount) { showToast('⚠ Please enter an amount', 'warn'); $('tc-exp-amount').focus(); return; }

  const fileInput = $('tc-exp-file');
  let receiptUrl = '';
  if (fileInput && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    // Webcam captures are written to the local folder immediately on
    // "Use Photo", so reuse that path instead of writing the same bytes
    // a second time (which would create a duplicate file).
    if (_pendingWebcamReceipt && _pendingWebcamReceipt.name === file.name && _pendingWebcamReceipt.size === file.size) {
      receiptUrl = _pendingWebcamReceipt.url;
    } else {
      const submitBtn = $('tc-submit-exp-btn');
      const oldText = submitBtn.textContent;
      submitBtn.textContent = 'Saving locally...'; submitBtn.disabled = true;
      try {
        // For Tax Centre, use a "General" subfolder or the project name if applicable
        const localUrl = await saveReceiptToLocalFile(file, 'General');
        if (localUrl) receiptUrl = localUrl;
      } catch (e) {
        console.error(e);
        showToast('⚠ Error saving receipt', 'err');
        submitBtn.textContent = oldText; submitBtn.disabled = false;
        return;
      }
      submitBtn.textContent = oldText; submitBtn.disabled = false;
    }
  }

  // Multi-currency calculation
  const fxRate = _fxRateCache[`${currency}_CAD`] || 1;
  const baseAmount = amount * fxRate;

  if (!TAX_CENTER.businessExpenses) TAX_CENTER.businessExpenses = [];
  const trip = ($('tc-exp-trip')?.value || '').trim();
  TAX_CENTER.businessExpenses.unshift({ id: Date.now(), desc, cat, currency, amount, fxRate, baseAmount, date, ref: '', receipt: receiptUrl, trip });

  // If this submit came from "Confirm & log" on a pending note, that note's
  // job is done — clear it so the reminder doesn't fire again for an expense
  // that is now actually in the ledger.
  const clearedPending = _tcClearConfirmedPending();

  saveTaxCenter();
  renderTaxCenter();
  showToast(clearedPending
    ? `✓ Logged — pending note cleared${trip ? ` · ${trip}` : ''}`
    : (trip ? `✓ Logged to trip: ${trip}` : '✓ Business Expense logged'));
  $('tc-exp-desc').value = ''; $('tc-exp-amount').value = ''; $('tc-exp-date').value = today();
  if ($('tc-exp-trip')) $('tc-exp-trip').value = '';
  if (fileInput) fileInput.value = '';
  const filePreview = $('tc-exp-file-preview');
  if (filePreview) filePreview.textContent = '';
  _pendingWebcamReceipt = null;
}

// addRecurring() used to live here, reading a five-field inline form. Both the
// add and the edit path now go through the shared editor sheet in
// src/features/taxcentre.js (openRecurringEditor / saveRecurringEditor), which
// is where the cadence, end-date and pause fields it never had are validated.



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
  if (descInput) {
    descInput.addEventListener('input', (e) => {
      const val = e.target.value.toLowerCase();
      const catSelect = document.getElementById('tc-exp-cat');
      if (!catSelect) return;
      for (const keyword in TAX_CATEGORIES) {
        if (val.includes(keyword)) {
          catSelect.value = TAX_CATEGORIES[keyword];
          break;
        }
      }
    });
  }
});


// ── Integrations & API Configuration: collapsible sections, state remembered per browser ──
const INTEGRATION_SECTION_KEYS = ['gemini', 'shippo', 'stripe'];

function applyIntegrationSectionState(key, collapsed) {
  const body = document.getElementById(`tc-integration-body-${key}`);
  const chevron = document.getElementById(`tc-integration-chevron-${key}`);
  if (!body || !chevron) return;
  body.style.display = collapsed ? 'none' : (body.dataset.openDisplay || 'flex');
  chevron.textContent = collapsed ? '▸' : '▾';
  const head = chevron.closest('.oc-collapse-head');
  if (head) head.setAttribute('aria-expanded', String(!collapsed));
}

function toggleIntegrationSection(key) {
  const collapsed = localStorage.getItem(`lm-integrations-collapsed-${key}`) === '1';
  const next = !collapsed;
  localStorage.setItem(`lm-integrations-collapsed-${key}`, next ? '1' : '0');
  applyIntegrationSectionState(key, next);
}

document.addEventListener('DOMContentLoaded', () => {
  INTEGRATION_SECTION_KEYS.forEach((key) => {
    const body = document.getElementById(`tc-integration-body-${key}`);
    if (!body) return;
    body.dataset.openDisplay = body.style.display || 'flex';
    if (localStorage.getItem(`lm-integrations-collapsed-${key}`) === '1') {
      applyIntegrationSectionState(key, true);
    }
  });
});

document.addEventListener('DOMContentLoaded', () => {
  const numericIds = ['nb-max', 'nb-price', 'nb-thresh', 'nb-prod', 'm-qty', 'm-price', 'sale-qty', 'sale-price', 'sent-qty', 'exp-amt', 'tc-exp-amt'];
  numericIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('inputmode', 'decimal');
  });
});

// ── MODAL UX: backdrop-click + Esc to close, clear validation on input ──
document.addEventListener('DOMContentLoaded', () => {
  // Click the dimmed backdrop (not a child) to close the modal.
  document.addEventListener('click', (e) => {
    const ov = e.target;
    if (!ov || !ov.classList || !ov.classList.contains('overlay')) return;
    if (ov.hasAttribute('data-no-backdrop-close')) return;
    if (!ov.id.startsWith('m-')) return;
    attemptCloseModal(ov.id.slice(2));
  });

  // Esc closes the topmost open modal.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = Array.from(document.querySelectorAll('.overlay')).filter(o =>
      o.style.display !== 'none' &&
      !o.classList.contains('closing') && o.id.startsWith('m-') &&
      !o.hasAttribute('data-no-backdrop-close'));
    if (!open.length) return;
    attemptCloseModal(open[open.length - 1].id.slice(2));
  });

  // Clear a field's error state as soon as the user edits it.
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('.form-group.invalid')) clearFieldError(t);
    // If the input is inside #m-add-book overlay, update the unsaved changes indicator.
    if (t && t.closest && t.closest('#m-add-book')) {
      updateUnsavedIndicator();
    }
  });

  // Listen for changes (like select dropdowns or color input) inside #m-add-book
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('#m-add-book')) {
      updateUnsavedIndicator();
    }
  });
});

// ── EVENT POS ──
let posCart = {};
// Per-book custom unit price (in the book's native currency), keyed by book id.
// Set via the "Adjust price" control on a cart line. Lets the seller discount
// or hand-price a title at the table. Cleared when the item is removed or the
// sale completes.
let posPriceOverrides = {};
let _posPriceEditId = null;
let posPendingSale = null;
const POS_FX_STORAGE_KEY = 'lm_pos_exchange_rates_v1';
const POS_FX_FETCHED_AT_KEY = 'lm_pos_fx_fetched_at';
// How many CAD one unit of each currency is worth. These are only the offline
// seed values used until the seller taps "↻ FX Rates" — a stall with no signal
// still totals a cart instead of showing "—" next to every price.
const POS_DEFAULT_CAD_RATES = { CAD: 1, EUR: 1.47, USD: 1.36, GBP: 1.73, MXN: 0.075 };
let posExchangeRates = loadPosExchangeRates();

// ── POS-ONLY BOOK RESOLUTION ──
// The POS, sales tracker and QR sheet all draw from catalog books PLUS the
// POS-only extras. These helpers keep that merge in one place so the three
// surfaces stay consistent. Authors only ever see their single active book, so
// POS-only extras (a publisher tool) are excluded for them.
function posBooksMap() {
  if (isAuthor() && activeBook !== 'all') {
    return BOOKS[activeBook] ? { [activeBook]: BOOKS[activeBook] } : {};
  }
  return { ...BOOKS, ...posExtraBooks };
}
function posResolveBook(id) {
  return BOOKS[id] || posExtraBooks[id] || null;
}
function isPosOnlyBook(id) {
  return !!posExtraBooks[id] && !BOOKS[id];
}

// Default to the native currency of the first available book, falling back to EUR
function _getPosDefaultCurrency() {
  const firstBook = Object.values(posBooksMap())[0];
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

// Currencies offered as the POS transaction currency, and the set
// posConfigureRates() fetches live rates for. Book currencies come first so a
// title's own currency is always selectable; the fixed tail covers the
// currencies taken at the table regardless of what the books are priced in
// (MXN for Mexican fairs).
function getPOSCurrencies() {
  const fromBooks = Object.values(posBooksMap()).map((b) => currencyToCode(b.currency));
  const unique = Array.from(new Set([...fromBooks, 'EUR', 'CAD', 'USD', 'MXN']));
  return unique.filter(Boolean);
}

function buildPOSCartRows() {
  const items = [];
  for (const [bookId, qty] of Object.entries(posCart)) {
    if (!qty) continue;
    const book = posResolveBook(bookId);
    if (!book) continue;
    const sourceCode = currencyToCode(book.currency);
    const listUnit = book.listPrice || 0;
    const hasOverride = Object.prototype.hasOwnProperty.call(posPriceOverrides, bookId);
    const unit = hasOverride ? posPriceOverrides[bookId] : listUnit;
    const convertedUnit = convertCurrency(unit, sourceCode, posTransactionCurrency);
    items.push({
      book,
      qty,
      sourceCode,
      sourceUnit: unit,
      listUnit,
      overridden: hasOverride && unit !== listUnit,
      sourceLine: unit * qty,
      convertedUnit,
      convertedLine: convertedUnit === null ? null : convertedUnit * qty
    });
  }
  return items;
}

// ── #2: POS keyboard search state ─────────────────────────────────────
let posSearchQuery = '';
window.posSearchFilter = function (val) {
  posSearchQuery = (val || '').toLowerCase().trim();
  renderPOS();
};

// ── #2: POS keyboard shortcuts ─────────────────────────────────────────
// /         → focus POS search input
// Escape    → clear and blur POS search
// Ctrl+Enter → trigger checkout
document.addEventListener('keydown', function (e) {
  // Only apply shortcuts when on the POS tab
  const posPanel = $('tab-pos');
  if (!posPanel || posPanel.style.display === 'none') return;
  // Don't intercept when focused inside a modal or form input
  const tag = (document.activeElement || {}).tagName || '';
  const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  const inModal = document.activeElement && document.activeElement.closest('.modal, .overlay');

  const searchEl = $('pos-search-input');

  // / → focus search (only when not already in an input)
  if (e.key === '/' && !inInput && !inModal) {
    e.preventDefault();
    if (searchEl) { searchEl.focus(); searchEl.select(); }
    return;
  }

  // Escape → clear search (only when search box is focused or has a query)
  if (e.key === 'Escape' && !inModal) {
    if (searchEl && (document.activeElement === searchEl || posSearchQuery)) {
      e.preventDefault();
      searchEl.value = '';
      posSearchQuery = '';
      searchEl.blur();
      renderPOS();
    }
    return;
  }

  // Ctrl+Enter / Cmd+Enter → checkout
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !inModal) {
    e.preventDefault();
    if (typeof window.posCheckout === 'function') window.posCheckout();
    return;
  }
});

function renderPOS() {
  const grid = $('pos-grid');
  if (!grid) return;

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

  const booksToRender = posBooksMap();
  const allowPosOnly = !(isAuthor() && activeBook !== 'all');
  // ── #2: Filter books by search query ───────────────────────────────────
  const booksArr = Object.values(booksToRender).filter(b =>
    !posSearchQuery ||
    (b.title || '').toLowerCase().includes(posSearchQuery) ||
    (b.author || '').toLowerCase().includes(posSearchQuery)
  );
  if (!booksArr.length && posSearchQuery) {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--text3);font-size:13px;">No books match <strong style="color:var(--cream);">&ldquo;${escapeHtml(posSearchQuery)}&rdquo;</strong>.<br><span style="font-size:11px;">Press <kbd style="background:rgba(255,255,255,.1);padding:2px 6px;border-radius:4px;">Esc</kbd> to clear.</span></div>`;
  } else {
    grid.innerHTML = booksArr.map((book) => {
      const qty = posCart[book.id] || 0;
      const sourceCode = currencyToCode(book.currency);
      const converted = convertCurrency(book.listPrice || 0, sourceCode, posTransactionCurrency);
      const convertedLabel = converted === null
        ? `No FX rate → ${posFormat(book.listPrice || 0, sourceCode)}`
        : `${posFormat(converted, posTransactionCurrency)} (${sourceCode})`;
      const posOnly = isPosOnlyBook(book.id);
      const idAttr = escapeHtml(book.id);
      const badge = posOnly
        ? `<span style="display:inline-block;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);background:var(--gold-bg);border:1px solid var(--gold-line);border-radius:6px;padding:2px 6px;margin-bottom:6px;">POS-only</span>`
        : '';
      const soldNote = (posOnly && book.sold)
        ? `<div style="font-size:11px;color:var(--green);margin-top:3px;">${book.sold} sold${book.revenue ? ' · ' + posFormat(book.revenue, sourceCode) : ''}</div>`
        : '';
      const editControls = posOnly
        ? `<div style="display:flex;gap:6px;margin-top:8px;">
           <button class="btn sm" style="flex:1;font-size:11px;" onclick="openPosBookModal('${idAttr}')" aria-label="Edit or view QR">✎ Edit / QR</button>
           <button class="btn sm danger-btn" style="font-size:11px;" onclick="removePosBook('${idAttr}')" title="Remove POS-only book" aria-label="Remove POS-only book">✕</button>
         </div>`
        : '';
      const isActiveClass = qty > 0 ? ' is-active' : '';
      return `
      <div class="card pos-card${isActiveClass}" style="display:flex; flex-direction:column; justify-content:space-between; padding:1.2rem;${posOnly ? 'border:1.5px solid var(--gold-line);' : ''}">
        <div>
          ${badge}
          <div class="pos-card-title">${escapeHtml(book.title)}</div>
          <div class="pos-card-sub">${posFormat(book.listPrice || 0, sourceCode)} &bull; ${convertedLabel}</div>
          ${soldNote}
        </div>
        <div>
          <div class="pos-qty-wrapper">
            <button class="pos-qty-btn" aria-label="Decrease quantity" onclick="posUpdateQty('${idAttr}', -1)">-</button>
            <span class="pos-qty-val"${qty > 0 ? ' style="color:var(--gold-text,#8a5815);"' : ''}>${qty}</span>
            <button class="pos-qty-btn" aria-label="Increase quantity" onclick="posUpdateQty('${idAttr}', 1)">+</button>
          </div>
          ${editControls}
        </div>
      </div>
    `;
    }).join('') + (allowPosOnly && !posSearchQuery ? `
      <button type="button" class="card pos-card" onclick="openPosBookModal()" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:1.1rem;border:1.5px dashed var(--gold-line);background:transparent;cursor:pointer;color:var(--gold-text,#8a5815);min-height:140px;">
        <div style="font-size:28px;line-height:1;">＋</div>
        <div style="font-size:13px;font-weight:700;color:#0e0c0a;">Add POS-only book</div>
        <div style="font-size:11px;color:#4a4540;text-align:center;">Guest / consignment titles. Stays out of your catalog & ledger.</div>
      </button>
    ` : '');
  } // end search-filter else


  if (cartItemsEl) {
    cartItemsEl.innerHTML = cartRows.length ? cartRows.map((row) => {
      const unitLabel = row.overridden
        ? `<span style="text-decoration:line-through;color:#8a8078;">${posFormat(row.listUnit, row.sourceCode)}</span> <span style="color:var(--gold-text,#8a5815);font-weight:700;">${posFormat(row.sourceUnit, row.sourceCode)}</span> <span style="font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--gold-text,#8a5815);">Adj</span>`
        : posFormat(row.sourceUnit, row.sourceCode);
      return `
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px 0;border-bottom:1px solid rgba(14,12,10,.08);">
        <div>
          <div style="font-size:13px;color:#0e0c0a;font-weight:700;">${escapeHtml(row.book.title)}</div>
          <div style="font-size:11px;color:#4a4540;font-weight:500;">${row.qty} × ${unitLabel}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:13px;color:#0e0c0a;font-weight:700;">${row.convertedLine === null ? posFormat(row.sourceLine, row.sourceCode) : posFormat(row.convertedLine, posTransactionCurrency)}</div>
          <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:3px;">
            <button class="btn sm" style="padding:2px 7px;font-size:11px;" onclick="openPosPriceModal('${row.book.id}')">Adjust</button>
            <button class="btn sm" style="padding:2px 7px;font-size:11px;" onclick="posGenerateLineQR('${row.book.id}')" title="Payment QR for this line">QR</button>
            <button class="btn sm" style="padding:2px 7px;font-size:11px;color:#a63a2b;" onclick="posRemoveItem('${row.book.id}')">Remove</button>
          </div>
        </div>
      </div>
    `;
    }).join('') : '<div style="font-size:12px;color:#8a8078;padding:10px 0;text-align:center;">Cart is empty.</div>';
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

window.posUpdateQty = function (bookId, delta) {
  posCart[bookId] = Math.max(0, (posCart[bookId] || 0) + delta);
  if (posCart[bookId] === 0) delete posCart[bookId];
  renderPOS();
};

window.posRemoveItem = function (bookId) {
  delete posCart[bookId];
  delete posPriceOverrides[bookId];
  renderPOS();
};

// ── PER-LINE PRICE / DISCOUNT OVERRIDE ──
// Opens a compact editor for one cart line so the seller can hand-price a book
// or apply a quick discount. Prices are edited in the book's native currency
// (what flows into revenue/ledger); the cart converts to the txn currency.
window.openPosPriceModal = function (bookId) {
  const book = posResolveBook(bookId);
  if (!book) return;
  _posPriceEditId = bookId;
  const code = currencyToCode(book.currency);
  const list = book.listPrice || 0;
  const current = Object.prototype.hasOwnProperty.call(posPriceOverrides, bookId)
    ? posPriceOverrides[bookId]
    : list;
  $('pp-title').textContent = book.title;
  $('pp-list').textContent = posFormat(list, code);
  $('pp-cur-sym').textContent = codeToSymbol(code);
  const input = $('pp-price');
  input.value = (current || 0).toFixed(2);
  $('pp-reset-btn').style.display = (current !== list) ? '' : 'none';
  window.posPricePreview();
  openM('pos-price');
  // Select the field so a one-handed edit is immediate.
  setTimeout(() => { input.focus(); input.select(); }, 60);
};

// Quick discount buttons: set the field to a percentage off the list price.
window.posPriceQuick = function (pct) {
  const book = posResolveBook(_posPriceEditId);
  if (!book) return;
  const list = book.listPrice || 0;
  const val = Math.max(0, list * (1 - (pct / 100)));
  $('pp-price').value = val.toFixed(2);
  window.posPricePreview();
};

window.posPricePreview = function () {
  const book = posResolveBook(_posPriceEditId);
  if (!book) return;
  const list = book.listPrice || 0;
  const code = currencyToCode(book.currency);
  let val = parseFloat($('pp-price').value);
  const note = $('pp-preview');
  if (!(val >= 0) || isNaN(val)) { note.textContent = ''; return; }
  if (list > 0 && val < list) {
    const off = Math.round((1 - val / list) * 100);
    note.innerHTML = `New price <strong>${posFormat(val, code)}</strong> · <span style="color:var(--gold);">${off}% off</span>`;
  } else if (list > 0 && val > list) {
    note.innerHTML = `New price <strong>${posFormat(val, code)}</strong> · markup`;
  } else {
    note.innerHTML = `New price <strong>${posFormat(val, code)}</strong>`;
  }
};

window.savePosPrice = function () {
  const book = posResolveBook(_posPriceEditId);
  if (!book) return;
  const val = parseFloat($('pp-price').value);
  if (!(val >= 0) || isNaN(val)) { showToast('Enter a valid price (0 or more)', 'warn'); return; }
  const list = book.listPrice || 0;
  // Make sure the line is actually in the cart (Adjust implies selling one).
  if (!posCart[_posPriceEditId]) posCart[_posPriceEditId] = 1;
  if (val === list) delete posPriceOverrides[_posPriceEditId];
  else posPriceOverrides[_posPriceEditId] = Math.round(val * 100) / 100;
  closeM('pos-price');
  _posPriceEditId = null;
  renderPOS();
  showToast('✓ Price updated');
};

window.posResetPrice = function () {
  if (_posPriceEditId) delete posPriceOverrides[_posPriceEditId];
  closeM('pos-price');
  _posPriceEditId = null;
  renderPOS();
  showToast('Reset to list price');
};

// ── PAYMENT QR FOR THE EXACT (DISCOUNTED) AMOUNT ──
// Mint a Stripe Payment Link for what the customer actually owes — either the
// whole sale or a single adjusted line — and show a scannable QR. Needs the
// network and a saved Stripe restricted key (same one the catalog QR uses).
let _posQRLink = '';

function _showPosQR(url, amountLabel, sub) {
  _posQRLink = url || '';
  $('pos-qr-amount').textContent = amountLabel || '';
  $('pos-qr-sub').textContent = sub || '';
  $('pos-qr-link').value = url || '';
  const wrap = $('pos-qr-canvas');
  wrap.innerHTML = '';
  if (url && typeof QRCode !== 'undefined') {
    new QRCode(wrap, { text: url, width: 220, height: 220, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.H });
  } else {
    wrap.innerHTML = '<div style="color:#aaa;font-size:12px;">QR library not ready.</div>';
  }
  openM('pos-qr');
}

window.copyPosQRLink = function () {
  if (!_posQRLink) { showToast('No link yet', 'warn'); return; }
  navigator.clipboard.writeText(_posQRLink).then(() => showToast('Payment link copied')).catch(() => {
    const ta = document.createElement('textarea'); ta.value = _posQRLink; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast('Payment link copied');
  });
};

window.downloadPosQR = function () {
  const canvas = document.querySelector('#pos-qr-canvas canvas');
  if (!canvas) { showToast('QR not ready', 'warn'); return; }
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `pos-payment-qr.png`;
  a.click();
  showToast('Downloading QR Code image');
};

// QR for the whole cart at the exact total (discounts included), in the
// transaction currency the customer is paying.
window.posGenerateSaleQR = async function () {
  const rows = buildPOSCartRows();
  if (!rows.length) { showToast('Cart is empty', 'warn'); return; }
  if (rows.some((r) => r.convertedLine === null)) {
    showToast('Set FX rates first — some lines have no rate for ' + posTransactionCurrency, 'warn', 5000);
    return;
  }

  // ⚡ Bolt Optimization: Loop Fusion
  // Calculate total and units in a single pass instead of multiple .reduce() calls
  let total = 0, units = 0;
  for (const r of rows) {
    total += r.convertedLine || 0;
    units += r.qty || 0;
  }

  const desc = rows.length === 1
    ? `${rows[0].book.title}${rows[0].qty > 1 ? ` ×${rows[0].qty}` : ''}`
    : `Book fair sale — ${units} item${units === 1 ? '' : 's'}`;
  const btn = $('pos-sale-qr-btn');
  const restore = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Creating…'; }
  try {
    const url = await createStripePaymentLinkForAmount({
      amountMajor: total,
      currencyCode: posTransactionCurrency,
      description: desc,
      metadata: { source: 'pos_sale', sku: rows.length === 1 ? rows[0].book.id : 'pos-multi' },
    });
    _showPosQR(url, posFormat(total, posTransactionCurrency), desc);
    showToast('✓ Payment QR ready');
  } catch (e) {
    showToast('Stripe: ' + (e.message || e), 'err', 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = restore; }
  }
};

// QR for a single cart line at its adjusted price, in the transaction currency.
window.posGenerateLineQR = async function (bookId) {
  const row = buildPOSCartRows().find((r) => r.book.id === bookId);
  if (!row) { showToast('Item not in cart', 'warn'); return; }
  if (row.convertedLine === null) {
    showToast('Set FX rates first — no rate for ' + posTransactionCurrency, 'warn', 5000);
    return;
  }
  const desc = `${row.book.title}${row.qty > 1 ? ` ×${row.qty}` : ''}`;
  try {
    const url = await createStripePaymentLinkForAmount({
      amountMajor: row.convertedLine,
      currencyCode: posTransactionCurrency,
      description: desc,
      metadata: { source: 'pos_line', book_id: row.book.id, sku: row.book.id },
    });
    _showPosQR(url, posFormat(row.convertedLine, posTransactionCurrency), desc);
    showToast('✓ Payment QR ready');
  } catch (e) {
    showToast('Stripe: ' + (e.message || e), 'err', 6000);
  }
};

window.posSetCurrency = function (code) {
  posTransactionCurrency = code || posTransactionCurrency;
  renderPOS();
};

// Fetch live rates for all POS currencies (CAD-pivot) and populate both
// posExchangeRates and _fxRateCache so Tax Center conversions stay correct.
// `silent` is set for the automatic fetch on app load (boot(), below) so a
// closed stall with no signal doesn't get a toast on every open — manual
// clicks on the "↻ FX Rates" button (no args, so silent defaults false) keep
// their existing success/warning feedback.
window.posConfigureRates = async function ({ silent = false } = {}) {
  const currencies = getPOSCurrencies().filter(c => c !== 'CAD');
  const btn = document.querySelector('[onclick="posConfigureRates()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Fetching…'; }

  let fetched = 0, failed = [];
  // ⚡ Bolt Optimization: Parallelize Asynchronous I/O
  // Replaced sequential `for...of` loops with `Promise.all` to fetch FX rates concurrently.
  await Promise.all(currencies.map(async (code) => {
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
    await Promise.all(currencies.map(async (other) => {
      if (other === code) return;
      const crossResult = await fetchLiveRate(code, other);
      if (crossResult.rate) _fxRateCache[`${code}_${other}`] = crossResult.rate;
    }));
  }));
  posExchangeRates.CAD = 1;
  _fxRateCache['CAD_CAD'] = 1;
  savePosExchangeRates();
  localStorage.setItem(POS_FX_FETCHED_AT_KEY, new Date().toISOString());

  renderPOS();
  renderPOSFxStatus();

  if (btn) { btn.disabled = false; btn.textContent = 'FX Rates'; }
  if (silent) return;
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
    const label = mins < 2 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
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
function _posItemToManualPayload(book, qty, paymentMethod, basePrice, txnCurCode, convertedUnitInTxnCur, nativePerTxnRate, priceNote) {
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
  const notes = priceNote ? `${paymentMethod} · ${priceNote}` : paymentMethod;
  return { num, chan, qty, price: basePrice, notes, payment };
}

window.posCheckout = function () {
  const method = $('pos-payment-method').value;
  const rows = buildPOSCartRows();

  if (rows.length === 0) {
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
    const adj = row.overridden
      ? ` <span style="font-size:11px;color:var(--gold);">(was ${posFormat(row.listUnit, row.sourceCode)} ea)</span>`
      : '';
    return `<tr><td>${escapeHtml(row.book.title)}${adj}</td><td class="r">${row.qty}</td><td class="r">${lineDisplay}</td></tr>`;
  }).join('');
  $('pos-confirm-payment').textContent = method;
  $('pos-confirm-timestamp').textContent = localeTs;
  $('pos-confirm-total').textContent = totalCharged;
  openM('pos-sale-confirm');
};

window.posConfirmSale = async function () {
  if (!posPendingSale) return;
  await syncCatalog();
  const previousBook = activeBook;
  let posExtraTouched = false;

  for (const row of posPendingSale.rows) {
    const book = row.book;
    const qty = row.qty;

    // basePrice = native-currency unit price (what flows into revenue, ledger, and Sheets)
    const basePrice = row.sourceUnit;

    // POS-only books never touch the catalog ledger. Keep an isolated tally on
    // the book itself so the seller sees a running "sold" count at the table,
    // then persist it with the catalog doc. Skip the recordOrder path entirely.
    if (isPosOnlyBook(book.id) && posExtraBooks[book.id]) {
      const pb = posExtraBooks[book.id];
      pb.sold = (pb.sold || 0) + qty;
      pb.revenue = (pb.revenue || 0) + qty * basePrice;
      pb.lastSold = today();
      posExtraTouched = true;
      continue;
    }

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
        const txnToCAD = posExchangeRates[txnCurCode] || 1;
        const nativeToCAD = posExchangeRates[nativeCurCode] || 1;
        nativePerTxnRate = txnToCAD / nativeToCAD;
        // Cache it for paymentSummary to use
        _fxRateCache[cacheKey] = nativePerTxnRate;
      }
    }

    // Temporarily set activeBook so recordOrder's getState()/getBook() resolve correctly
    activeBook = book.id;

    // Record a price adjustment (custom price / discount) in the ledger note.
    const priceNote = row.overridden
      ? `Price ${posFormat(row.listUnit, row.sourceCode)}→${posFormat(row.sourceUnit, row.sourceCode)}`
      : null;

    const { num, chan, notes, payment } = _posItemToManualPayload(
      book, qty, posPendingSale.method,
      basePrice, txnCurCode, convertedUnitInTxnCur, nativePerTxnRate, priceNote
    );

    // recordOrder is the single shared sale-writing function used by manual entry.
    // basePrice (native currency) drives revenue so it's always in the book's own currency.
    recordOrder(num, chan, qty, basePrice, notes, payment);
  }

  activeBook = previousBook;

  if (posExtraTouched) { try { await saveCatalogWithDeletions(); } catch (e) { console.warn('POS-only tally save failed', e); } }

  closeM('pos-sale-confirm');
  posPendingSale = null;
  posCart = {};
  posPriceOverrides = {};
  renderPOS();
  if (typeof window.renderAllOverview === 'function') window.renderAllOverview();
  updateHeader();
  showToast('✓ Sale complete', 'ok');
};

window.posPrintReceipt = function () {
  if (!posPendingSale) return;
  const rowsHtml = posPendingSale.rows.map((row) => {
    const line = row.convertedLine === null ? posFormat(row.sourceLine, row.sourceCode) : posFormat(row.convertedLine, posPendingSale.currency);
    return `<tr><td>${escapeHtml(row.book.title)}</td><td>${row.qty}</td><td style="text-align:right;">${line}</td></tr>`;
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
// Copies of each catalog title the seller is packing for this fair, keyed by
// book id. Kept separate from the catalog record itself (never written to
// BOOKS) since "bringing" is a per-trip decision, not a stock fact.
let salesTrackerQtyBrought = {};

// Best-effort "on hand" hint shown next to the packing-quantity field, so the
// seller has a ceiling in view without the field silently capping their entry.
// Never throws: a POS-only extra book carries none of deriveOnHand's expected
// fields, and a missing hint is fine where a broken modal is not.
function _stOnHandHint(book) {
  try {
    const n = deriveOnHand(book, book);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function _stUpdatePackTotal() {
  const el = document.getElementById('st-pack-total');
  if (!el) return;
  let total = 0;
  document.querySelectorAll('.st-book-qty').forEach((input) => {
    const n = parseInt(input.value, 10);
    if (Number.isFinite(n) && n > 0) total += n;
  });
  el.textContent = total > 0
    ? `📦 ${total} book${total === 1 ? '' : 's'} packed for this fair`
    : 'Enter how many copies of each title you\'re bringing.';
}

window.salesTrackerQtyInput = function (el) {
  const qty = parseInt(el.value, 10);
  const clean = Number.isFinite(qty) && qty > 0 ? qty : 0;
  if (el.dataset.bookId) {
    if (clean > 0) salesTrackerQtyBrought[el.dataset.bookId] = clean;
    else delete salesTrackerQtyBrought[el.dataset.bookId];
  } else if (el.dataset.customIdx != null) {
    const cb = salesTrackerCustomBooks[parseInt(el.dataset.customIdx, 10)];
    if (cb) cb.qty = clean;
  }
  _stUpdatePackTotal();
};

function renderSalesTrackerBookList() {
  const list = document.getElementById('st-books-list');
  if (!list) return;
  // posBooksMap() includes POS-only extras (publisher) or just the active book (author).
  const inventoryEntries = Object.values(posBooksMap());

  const qtyRow = (labelText, inputAttrs, value) => `
    <div style="display:flex;align-items:center;gap:8px;padding-left:26px;margin-top:2px;margin-bottom:2px;">
      <span style="font-size:11px;color:#555;font-weight:500;">${labelText}:</span>
      <input type="number" inputmode="numeric" min="0" step="1" class="st-book-qty" ${inputAttrs} value="${value || ''}" placeholder="0" style="width:64px;padding:3px 6px;font-size:11px;border:1px solid #ccc;border-radius:4px;background:#fff;color:#111;" oninput="salesTrackerQtyInput(this)">
    </div>
  `;

  const inventoryHtml = inventoryEntries.map((book) => {
    const onHand = _stOnHandHint(book);
    const label = `Copies bringing${onHand != null ? ` (${onHand} on hand)` : ''}`;
    return `
    <label style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer;background:rgba(0,0,0,.03);">
      <input type="checkbox" class="st-book-check" data-kind="inv" value="${book.id}" checked style="width:16px;height:16px;cursor:pointer;">
      <span style="flex:1;font-size:13px;color:#111;font-weight:600;">${escapeHtml(book.title)}</span>
      <span style="font-size:11px;color:#555;">${escapeHtml(book.author || '')}</span>
    </label>
    ${qtyRow(label, `data-book-id="${book.id}"`, salesTrackerQtyBrought[book.id])}
  `;
  }).join('');

  const customHtml = salesTrackerCustomBooks.map((book, idx) => `
    <label style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer;background:rgba(212,175,55,.12);border:1px dashed rgba(212,175,55,.5);">
      <input type="checkbox" class="st-book-check" data-kind="custom" value="${idx}" checked style="width:16px;height:16px;cursor:pointer;">
      <span style="flex:1;font-size:13px;color:#111;font-weight:600;">${escapeHtml(book.title)}</span>
      <span style="font-size:11px;color:#555;">${escapeHtml(book.author || '')}</span>
      <button type="button" onclick="salesTrackerRemoveCustom(${idx})" style="background:none;border:none;color:#a00;cursor:pointer;font-size:14px;padding:0 4px;" title="Remove" aria-label="Remove">✕</button>
    </label>
    ${qtyRow('Copies bringing', `data-custom-idx="${idx}"`, book.qty)}
  `).join('');

  if (!inventoryEntries.length && !salesTrackerCustomBooks.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text3);">No books available. Add a custom book below.</div>';
  } else {
    list.innerHTML = inventoryHtml + customHtml;
  }
  _stUpdatePackTotal();
}

// ── SALES TRACKER FAIR PRESETS ──
// Same idea as the QR sheet's fair presets: the whole tracker setup — layout,
// currency, which titles, and how many copies of each are packed — saved
// under a fair's name so a recurring event doesn't get rebuilt from scratch.
// localStorage, not Firestore: a per-device packing list that has to work
// with no signal.
let salesTrackerFairPresets = [];
let stActivePresetId = '';

function _stPresetStore() {
  try { return window.localStorage; } catch { return null; }
}

function _stReadPresetForm(name) {
  const qtyBrought = {};
  document.querySelectorAll('.st-book-qty[data-book-id]').forEach((el) => {
    const qty = parseInt(el.value, 10);
    if (el.dataset.bookId && Number.isFinite(qty) && qty > 0) qtyBrought[el.dataset.bookId] = qty;
  });

  const checkedCustomIdx = new Set(
    Array.from(document.querySelectorAll('.st-book-check[data-kind="custom"]'))
      .filter((el) => el.checked)
      .map((el) => parseInt(el.value, 10))
  );
  const customBooks = salesTrackerCustomBooks.filter((_, idx) => checkedCustomIdx.has(idx));

  return {
    name,
    cols: document.getElementById('st-cols')?.value,
    currencyCode: document.getElementById('st-currency')?.value || 'EUR',
    includeNotes: !!document.getElementById('st-notes')?.checked,
    bookIds: Array.from(document.querySelectorAll('.st-book-check[data-kind="inv"]'))
      .filter((el) => el.checked)
      .map((el) => el.value),
    qtyBrought,
    customBooks,
    savedAt: new Date().toISOString(),
  };
}

function _stApplyPresetToForm(preset) {
  if (!preset) return { missing: [] };

  const colsEl = document.getElementById('st-cols');
  if (colsEl) colsEl.value = String(preset.cols);

  const curEl = document.getElementById('st-currency');
  if (curEl) {
    curEl.value = Array.from(curEl.options).some((o) => o.value === preset.currencyCode) ? preset.currencyCode : 'EUR';
  }

  const notesEl = document.getElementById('st-notes');
  if (notesEl) notesEl.checked = !!preset.includeNotes;

  // Custom titles aren't in the catalog, so restoring a preset recreates them
  // wholesale rather than trying to look them up by id.
  salesTrackerCustomBooks = preset.customBooks.map((b) => ({ ...b }));
  salesTrackerQtyBrought = { ...preset.qtyBrought };

  renderSalesTrackerBookList();

  const wantedBooks = new Set(preset.bookIds);
  document.querySelectorAll('.st-book-check[data-kind="inv"]').forEach((el) => {
    el.checked = wantedBooks.has(el.value);
  });
  // Every custom title just restored from the preset is exactly what should print.
  document.querySelectorAll('.st-book-check[data-kind="custom"]').forEach((el) => { el.checked = true; });

  _stUpdatePackTotal();

  return { missing: stPresetMissingBooks(preset, Object.keys(posBooksMap())) };
}

function renderStPresetPicker() {
  const select = document.getElementById('st-preset-select');
  if (!select) return;
  if (!findStPreset(salesTrackerFairPresets, stActivePresetId)) stActivePresetId = '';

  const options = salesTrackerFairPresets
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
    .join('');
  select.innerHTML = `<option value="">${salesTrackerFairPresets.length ? 'Choose a saved fair…' : 'No saved fairs yet'}</option>${options}`;
  select.value = stActivePresetId;

  const deleteBtn = document.getElementById('st-preset-delete');
  if (deleteBtn) deleteBtn.disabled = !stActivePresetId;

  const note = document.getElementById('st-preset-note');
  if (note) {
    const active = findStPreset(salesTrackerFairPresets, stActivePresetId);
    note.textContent = active
      ? stPresetSummary(active)
      : 'Set the packing list up once, save it under the fair\'s name, and recall it next time.';
  }
}

window.stPresetSelected = function (id) {
  const preset = findStPreset(salesTrackerFairPresets, id);
  stActivePresetId = preset ? preset.id : '';
  if (!preset) { renderStPresetPicker(); return; }

  const { missing } = _stApplyPresetToForm(preset);
  renderStPresetPicker();
  if (missing.length) {
    showToast(`Loaded "${preset.name}" — ${missing.length} saved title${missing.length === 1 ? '' : 's'} no longer in the catalog`, 'warn', 6000);
  } else {
    showToast(`✓ Loaded fair preset "${preset.name}"`, 'ok');
  }
};

window.stSaveFairPreset = async function () {
  const active = findStPreset(salesTrackerFairPresets, stActivePresetId);
  const name = (await promptDialog(
    'Name this fair setup so you can recall the whole packing list next time.',
    active?.name || '',
    { title: 'Save fair preset', okLabel: 'Save', placeholder: 'e.g. Mexico City Book Fair' }
  ) || '').trim();
  if (!name) return;

  if (!stPresetId(name)) {
    showToast('Give the preset a name with at least one letter or number', 'warn');
    return;
  }

  const clash = findStPreset(salesTrackerFairPresets, stPresetId(name));
  if (clash && !(await confirmDialog(`"${clash.name}" already exists. Replace it with the current setup?`, { okLabel: 'Replace' }))) {
    return;
  }

  const snapshot = _stReadPresetForm(name);
  if (!snapshot.bookIds.length && !snapshot.customBooks.length && !(await confirmDialog('No books are selected. Save this preset anyway?', { okLabel: 'Save' }))) {
    return;
  }

  salesTrackerFairPresets = saveStPresets(_stPresetStore(), upsertStPreset(salesTrackerFairPresets, snapshot));
  stActivePresetId = stPresetId(name);
  renderStPresetPicker();
  showToast(`✓ Saved fair preset "${name}"`, 'ok');
};

window.stDeleteFairPreset = async function () {
  const preset = findStPreset(salesTrackerFairPresets, stActivePresetId);
  if (!preset) return;
  if (!(await confirmDialog(`Delete the fair preset "${preset.name}"?`, { danger: true, okLabel: 'Delete' }))) return;

  salesTrackerFairPresets = saveStPresets(_stPresetStore(), removeStPreset(salesTrackerFairPresets, preset.id));
  stActivePresetId = '';
  renderStPresetPicker();
  showToast(`Deleted "${preset.name}"`, 'ok');
};

window.openSalesTrackerModal = function () {
  const dateInput = document.getElementById('st-date');
  if (dateInput && !dateInput.value) dateInput.value = today();
  salesTrackerFairPresets = loadStPresets(_stPresetStore());
  renderSalesTrackerBookList();
  renderStPresetPicker();
  openM('sales-tracker');
};

window.salesTrackerSelectAll = function (checked) {
  document.querySelectorAll('.st-book-check').forEach((el) => { el.checked = !!checked; });
};

window.salesTrackerAddCustom = function () {
  const titleEl = document.getElementById('st-custom-title');
  const authorEl = document.getElementById('st-custom-author');
  const qtyEl = document.getElementById('st-custom-qty');
  const title = (titleEl.value || '').trim();
  const author = (authorEl.value || '').trim();
  const qty = parseInt(qtyEl?.value, 10);
  if (!title) {
    showToast('Enter a book title', 'warn');
    titleEl.focus();
    return;
  }
  salesTrackerCustomBooks.push({ title, author, qty: Number.isFinite(qty) && qty > 0 ? qty : 0 });
  titleEl.value = '';
  authorEl.value = '';
  if (qtyEl) qtyEl.value = '';
  renderSalesTrackerBookList();
  titleEl.focus();
};

window.salesTrackerRemoveCustom = function (idx) {
  salesTrackerCustomBooks.splice(idx, 1);
  renderSalesTrackerBookList();
};

// escapeHtml is imported from ./lib/html.js

window.printSalesTracker = function () {
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

  const selectedBooks = selected.map((sel) => {
    if (sel.kind === 'custom') {
      const cb = salesTrackerCustomBooks[parseInt(sel.value, 10)];
      if (!cb) return null;
      return { title: cb.title, author: cb.author || '', qty: Number(cb.qty) || 0 };
    }
    const book = posResolveBook(sel.value);
    if (!book) return null;
    return { title: book.title, author: book.author || '', qty: Number(salesTrackerQtyBrought[sel.value]) || 0 };
  }).filter(Boolean);

  const totalPacked = selectedBooks.reduce((sum, b) => sum + b.qty, 0);

  const bookRows = selectedBooks.map(({ title, author, qty }) => {
    const packedNote = qty > 0 ? `<div class="title-packed">Packed: ${qty}</div>` : '';
    const tallyCells = Array.from({ length: cols }, () => '<td class="tally"></td>').join('');
    if (includeNotes) {
      const priceCells = Array.from({ length: cols }, () => '<td class="price-paid"></td>').join('');
      return `
        <tr>
          <td class="title" rowspan="2">
            <div class="title-name">${escapeHtml(title)}</div>
            ${author ? `<div class="title-meta">${escapeHtml(author)}</div>` : ''}
            ${packedNote}
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
          ${packedNote}
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
      td.title .title-packed { font-size: 8.5pt; font-weight: 700; color: #8a5815; margin-top: 2px; }
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
        ${totalPacked > 0 ? `<div class="meta-row"><span class="label">Packed:</span><span class="value">${totalPacked} book${totalPacked === 1 ? '' : 's'}</span></div>` : ''}
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

// The price columns a QR card can print, paired with their checkbox ids. One
// list drives the sheet, the preset snapshot and the preset restore, so adding
// a currency here is the only edit needed to offer it everywhere.
const QRP_PRICE_CHECKBOXES = QR_PRESET_PRICE_CURRENCIES.map((code) => ({
  code,
  id: `qrp-show-${code.toLowerCase()}`,
}));

function _qrpSelectedPriceCurrencies() {
  return QRP_PRICE_CHECKBOXES
    .filter(({ id }) => !!document.getElementById(id)?.checked)
    .map(({ code }) => code);
}

function renderQRPrintBookList() {
  const list = document.getElementById('qrp-books-list');
  if (!list) return;
  // posBooksMap() includes POS-only extras (publisher) or just the active book (author).
  const entries = Object.values(posBooksMap());
  if (!entries.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text3);">No books available.</div>';
    return;
  }
  const baseCur = document.getElementById('qrp-base-cur')?.value || 'auto';

  list.innerHTML = entries.map((book) => {
    const url = book.stripeLink || book.paymentLink || '';
    const hasUrl = !!url;
    const nativeCode = currencyToCode(book.currency);
    const targetCode = baseCur === 'auto' ? nativeCode : baseCur;
    const defaultPrice = baseCur === 'auto'
      ? (book.listPrice || 0)
      : convertCurrency(book.listPrice || 0, nativeCode, targetCode);
    const existingOverride = book.priceOverrides?.[targetCode] || '';

    return `
      <div style="display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:6px;background:rgba(0,0,0,.03);margin-bottom:4px;">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;${hasUrl ? '' : 'opacity:.75;'}">
          <input type="checkbox" class="qrp-book-check" value="${book.id}" ${hasUrl ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
          <span style="flex:1;font-size:13px;color:#111;font-weight:600;">${escapeHtml(book.title)}</span>
          <span style="font-size:11px;color:#555;">${escapeHtml(book.author || '')}</span>
        </label>
        <div style="display:flex;align-items:center;gap:8px;padding-left:26px;margin-top:2px;">
          <span style="font-size:11px;color:#555;font-weight:500;">Manual price override (${escapeHtml(targetCode)}):</span>
          <input type="number" step="0.01" min="0" class="qrp-override-input" id="qrp-override-${book.id}" data-book-id="${book.id}" value="${existingOverride}" placeholder="e.g. ${defaultPrice.toFixed(2)}" style="width:110px;padding:3px 6px;font-size:11px;border:1px solid #ccc;border-radius:4px;background:#fff;color:#111;">
        </div>
      </div>
    `;
  }).join('');
}

window.openQRPrintModal = function () {
  qrFairPresets = loadQrPresets(_qrPresetStore());
  renderQRPrintBookList();
  renderQrPresetPicker();
  openM('qr-print');
};

window.qrPrintSelectAll = function (checked) {
  document.querySelectorAll('.qrp-book-check').forEach((el) => {
    if (!el.disabled) el.checked = !!checked;
  });
};

// ── QR FAIR PRESETS ──
// A whole sheet setup — layout, base currency, price columns, selected titles
// and their door prices — saved under a fair's name. Stored in localStorage
// rather than Firestore because it's a per-device stall setup, and because the
// modal has to work with no signal at the table.
let qrFairPresets = [];
let qrActivePresetId = '';

function _qrPresetStore() {
  try { return window.localStorage; } catch { return null; }
}

// Snapshot the modal exactly as it stands, including any override the seller
// typed but hasn't printed yet.
function _qrReadPresetForm(name) {
  const overrides = {};
  document.querySelectorAll('.qrp-override-input').forEach((el) => {
    const amount = parseFloat(el.value);
    if (el.dataset.bookId && Number.isFinite(amount) && amount > 0) {
      overrides[el.dataset.bookId] = amount;
    }
  });
  return {
    name,
    cols: document.getElementById('qrp-cols')?.value,
    baseCur: document.getElementById('qrp-base-cur')?.value || 'auto',
    currencies: _qrpSelectedPriceCurrencies(),
    fitOnePage: !!document.getElementById('qrp-fit-one-page')?.checked,
    bookIds: Array.from(document.querySelectorAll('.qrp-book-check'))
      .filter((el) => el.checked)
      .map((el) => el.value),
    overrides,
    savedAt: new Date().toISOString(),
  };
}

function _qrApplyPresetToForm(preset) {
  if (!preset) return { missing: [] };

  const colsEl = document.getElementById('qrp-cols');
  if (colsEl) colsEl.value = String(preset.cols);

  // A preset saved with a base currency the select no longer offers would
  // silently keep the previous selection, so fall back to per-book native
  // rather than print prices in a currency nobody chose.
  const baseEl = document.getElementById('qrp-base-cur');
  if (baseEl) {
    const wantedBase = preset.baseCur || 'auto';
    baseEl.value = Array.from(baseEl.options).some((o) => o.value === wantedBase) ? wantedBase : 'auto';
  }

  QRP_PRICE_CHECKBOXES.forEach(({ code, id }) => {
    const el = document.getElementById(id);
    if (el) el.checked = preset.currencies.includes(code);
  });

  const fitEl = document.getElementById('qrp-fit-one-page');
  if (fitEl) fitEl.checked = !!preset.fitOnePage;

  // Rebuild the list against the current base currency first, then impose the
  // preset's selection on top — the fresh render defaults every book with a
  // payment link to checked, which is not what the preset asked for.
  renderQRPrintBookList();

  const wantedBooks = new Set(preset.bookIds);
  document.querySelectorAll('.qrp-book-check').forEach((el) => {
    el.checked = wantedBooks.has(el.value);
  });
  document.querySelectorAll('.qrp-override-input').forEach((el) => {
    const amount = preset.overrides[el.dataset.bookId];
    el.value = Number.isFinite(amount) && amount > 0 ? String(amount) : '';
  });

  return { missing: qrPresetMissingBooks(preset, Object.keys(posBooksMap())) };
}

function renderQrPresetPicker() {
  const select = document.getElementById('qrp-preset-select');
  if (!select) return;
  if (!findQrPreset(qrFairPresets, qrActivePresetId)) qrActivePresetId = '';

  const options = qrFairPresets
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
    .join('');
  select.innerHTML = `<option value="">${qrFairPresets.length ? 'Choose a saved fair…' : 'No saved fairs yet'}</option>${options}`;
  select.value = qrActivePresetId;

  const deleteBtn = document.getElementById('qrp-preset-delete');
  if (deleteBtn) deleteBtn.disabled = !qrActivePresetId;

  const note = document.getElementById('qrp-preset-note');
  if (note) {
    const active = findQrPreset(qrFairPresets, qrActivePresetId);
    note.textContent = active
      ? qrPresetSummary(active)
      : 'Set the sheet up once, save it under the fair\'s name, and recall it next time.';
  }
}

window.qrPresetSelected = function (id) {
  const preset = findQrPreset(qrFairPresets, id);
  qrActivePresetId = preset ? preset.id : '';
  if (!preset) { renderQrPresetPicker(); return; }

  const { missing } = _qrApplyPresetToForm(preset);
  renderQrPresetPicker();
  if (missing.length) {
    showToast(`Loaded "${preset.name}" — ${missing.length} saved book${missing.length === 1 ? '' : 's'} no longer in the catalog`, 'warn', 6000);
  } else {
    showToast(`✓ Loaded fair preset "${preset.name}"`, 'ok');
  }
};

window.qrSaveFairPreset = async function () {
  const active = findQrPreset(qrFairPresets, qrActivePresetId);
  const name = (await promptDialog(
    'Name this fair setup so you can recall the whole sheet next time.',
    active?.name || '',
    { title: 'Save fair preset', okLabel: 'Save', placeholder: 'e.g. Mexico City Book Fair' }
  ) || '').trim();
  if (!name) return;

  if (!qrPresetId(name)) {
    showToast('Give the preset a name with at least one letter or number', 'warn');
    return;
  }

  // Same name = same preset: overwriting is the intent, but it's destructive
  // enough (someone else's door prices) to confirm first.
  const clash = findQrPreset(qrFairPresets, qrPresetId(name));
  if (clash && !(await confirmDialog(`"${clash.name}" already exists. Replace it with the current setup?`, { okLabel: 'Replace' }))) {
    return;
  }

  const snapshot = _qrReadPresetForm(name);
  if (!snapshot.bookIds.length && !(await confirmDialog('No books are selected. Save this preset anyway?', { okLabel: 'Save' }))) {
    return;
  }

  qrFairPresets = saveQrPresets(_qrPresetStore(), upsertQrPreset(qrFairPresets, snapshot));
  qrActivePresetId = qrPresetId(name);
  renderQrPresetPicker();
  showToast(`✓ Saved fair preset "${name}"`, 'ok');
};

window.qrDeleteFairPreset = async function () {
  const preset = findQrPreset(qrFairPresets, qrActivePresetId);
  if (!preset) return;
  if (!(await confirmDialog(`Delete the fair preset "${preset.name}"?`, { danger: true, okLabel: 'Delete' }))) return;

  qrFairPresets = saveQrPresets(_qrPresetStore(), removeQrPreset(qrFairPresets, preset.id));
  qrActivePresetId = '';
  renderQrPresetPicker();
  showToast(`Deleted "${preset.name}"`, 'ok');
};

window.printPaymentQRCodes = async function () {
  const cols = Math.max(1, Math.min(6, parseInt(document.getElementById('qrp-cols').value, 10) || 3));
  const baseCur = document.getElementById('qrp-base-cur').value || 'auto';

  const selectedIds = Array.from(document.querySelectorAll('.qrp-book-check'))
    .filter((el) => el.checked)
    .map((el) => el.value);

  if (!selectedIds.length) {
    showToast('Select at least one book for the payment QR sheet', 'warn');
    return;
  }

  const currenciesShown = _qrpSelectedPriceCurrencies();

  showToast('⌛ Preparing payment QR code sheet…');

  const booksData = await Promise.all(selectedIds.map(async (id) => {
    const book = posResolveBook(id);
    const nativeCode = currencyToCode(book.currency);
    const listedCode = baseCur === 'auto' ? nativeCode : baseCur;

    const overrideInput = document.getElementById(`qrp-override-${id}`);
    const overrideVal = overrideInput ? parseFloat(overrideInput.value) : NaN;
    const hasOverride = !isNaN(overrideVal) && overrideVal > 0;

    const listedAmount = hasOverride
      ? overrideVal
      : (baseCur === 'auto' ? (book.listPrice || 0) : convertCurrency(book.listPrice || 0, nativeCode, listedCode));

    if (!book.priceOverrides) book.priceOverrides = {};
    if (hasOverride) {
      book.priceOverrides[listedCode] = overrideVal;
    }

    let url = book.stripeLink || book.paymentLink || '';

    // If override is set and Stripe key is configured, create live Stripe Payment Link
    const stripeKey = getReconStripeKey();
    if (hasOverride && stripeKey) {
      try {
        url = await createStripePaymentLinkForAmount({
          amountMajor: listedAmount,
          currencyCode: listedCode,
          description: `${book.title} (${listedCode} ${listedAmount.toFixed(2)})`,
          metadata: { book_id: book.id, sku: book.id, override: 'true' }
        });
      } catch (err) {
        console.warn('Stripe link creation failed for override:', err);
      }
    } else if (hasOverride && url && !url.includes('amount=')) {
      const joiner = url.includes('?') ? '&' : '?';
      url = `${url}${joiner}amount=${listedAmount.toFixed(2)}&currency=${listedCode}`;
    }

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
        const rounded = amount.toFixed(2);
        display = `${approx ? '~' : ''}${symbol}${rounded}`;
      }
      return { currency: code, amount: display, base: code === listedCode };
    });

    return { id: book.id, title: book.title, author: book.author || '', url, prices };
  }));

  const fitOnePage = !!document.getElementById('qrp-fit-one-page')?.checked;
  const count = booksData.length;

  let effectiveCols = cols;
  if (fitOnePage && count > 8 && cols < 4) {
    effectiveCols = 4;
  }

  let headerPadding = '40px 32px 24px';
  let cardPadding = '24px 18px 20px';
  let qrFrameSize = '140px';
  let qrRenderSize = 120;
  let titleFontSize = '1.05rem';
  let priceTdPadding = '4px 0';

  if (fitOnePage || count > 6) {
    if (count <= 6) {
      headerPadding = '16px 20px 10px';
      cardPadding = '14px 12px 10px';
      qrFrameSize = '112px';
      qrRenderSize = 94;
      titleFontSize = '0.95rem';
      priceTdPadding = '2px 0';
    } else if (count <= 9) {
      headerPadding = '12px 18px 8px';
      cardPadding = '10px 8px 8px';
      qrFrameSize = '94px';
      qrRenderSize = 78;
      titleFontSize = '0.88rem';
      priceTdPadding = '2px 0';
    } else {
      headerPadding = '8px 14px 4px';
      cardPadding = '8px 6px 6px';
      qrFrameSize = '80px';
      qrRenderSize = 64;
      titleFontSize = '0.8rem';
      priceTdPadding = '1px 0';
    }
  }

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

  .header { text-align: center; padding: ${headerPadding}; border-bottom: 1px solid var(--rule); }
  .header::before { content: ''; display: block; width: 32px; height: 1px; background: var(--accent); margin: 0 auto 10px; }
  .brand { font-family: 'Cormorant Garamond', serif; font-size: ${fitOnePage ? '1.8rem' : '2.2rem'}; font-weight: 300; letter-spacing: 0.12em; line-height: 1; }
  .brand em { font-style: italic; }
  .tagline { margin-top: 6px; font-size: 0.6rem; letter-spacing: 0.24em; text-transform: uppercase; color: var(--accent); }
  .date-line { margin-top: 4px; font-size: 0.55rem; letter-spacing: 0.16em; text-transform: uppercase; color: #aaa; }

  .grid { display: flex; flex-wrap: wrap; justify-content: center; }

  .card {
    width: calc(100% / ${effectiveCols});
    padding: ${cardPadding}; border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule);
    display: flex; flex-direction: column; align-items: center; position: relative;
    page-break-inside: avoid; break-inside: avoid;
  }
  .card:nth-child(${effectiveCols}n) { border-right: none; }
  .card::before, .card::after { content: ''; position: absolute; width: 6px; height: 6px; border-color: var(--accent); border-style: solid; opacity: 0.35; }
  .card::before { top: 6px; left: 6px; border-width: 1px 0 0 1px; }
  .card::after  { bottom: 6px; right: 6px; border-width: 0 1px 1px 0; }

  .card-num { font-size: 0.5rem; letter-spacing: 0.2em; color: var(--accent); text-transform: uppercase; margin-bottom: 8px; font-weight: 400; }

  .qr-frame { width: ${qrFrameSize}; height: ${qrFrameSize}; padding: 6px; background: #fff; border: 1px solid var(--rule); display: flex; align-items: center; justify-content: center; margin-bottom: 10px; flex-shrink: 0; }

  .card-title { font-family: 'Cormorant Garamond', serif; font-size: ${titleFontSize}; font-style: italic; font-weight: 400; text-align: center; line-height: 1.25; margin-bottom: 8px; }

  .prices { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .prices thead tr { border-bottom: 1px solid var(--rule); }
  .prices thead th { font-size: 0.5rem; font-weight: 400; letter-spacing: 0.18em; text-transform: uppercase; color: #aaa; padding: 0 0 3px; text-align: left; }
  .prices thead th:last-child { text-align: right; }
  .prices tbody tr { border-bottom: 1px solid #f0ebe3; }
  .prices tbody tr:last-child { border-bottom: none; }
  .prices tbody td { font-size: 0.65rem; padding: ${priceTdPadding}; color: var(--ink); letter-spacing: 0.04em; }
  .prices tbody td:first-child { color: var(--accent); font-size: 0.58rem; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 400; }
  .prices tbody td:last-child { text-align: right; font-family: 'Cormorant Garamond', serif; font-size: 0.8rem; }
  .prices .base-price td:first-child { color: var(--ink); }

  .card-url { font-size: 0.48rem; color: #c0b8ae; word-break: break-all; text-align: center; margin-top: 4px; line-height: 1.4; }

  .footer { border-top: 1px solid var(--rule); padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; }
  .footer-brand { font-family: 'Cormorant Garamond', serif; font-size: 0.78rem; font-style: italic; color: #aaa; letter-spacing: 0.08em; }
  .footer-note { font-size: 0.55rem; letter-spacing: 0.12em; text-transform: uppercase; color: #bbb; }

  .print-bar { position: fixed; bottom: 22px; right: 22px; z-index: 100; }
  .print-btn { background: var(--ink); color: var(--paper); border: none; font-family: 'Jost', sans-serif; font-size: 0.68rem; font-weight: 300; letter-spacing: 0.16em; text-transform: uppercase; padding: 12px 26px; cursor: pointer; transition: background 0.2s; }
  .print-btn:hover { background: var(--accent); }

  @media print {
    @page { size: portrait; margin: ${fitOnePage ? '0.1in' : '0.25in'}; }
    html, body {
      background: white !important;
      ${fitOnePage ? 'height: 100vh; max-height: 100vh; overflow: hidden !important;' : ''}
    }
    .print-bar { display: none !important; }
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
    const url = el.getAttribute('data-url');
    if (!url) return;
    new QRCode(el, { text: url, width: ${qrRenderSize}, height: ${qrRenderSize}, colorDark: "#1c1814", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
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

// ─────────────────────────────────────────────────────────────────────────
// POS-ONLY BOOKS — add / edit / remove + instant Stripe link & QR
// These books live entirely in posExtraBooks (persisted in the catalog doc
// under _posExtra). They surface only at the POS, the printable sales tracker,
// and the printable QR sheet — never in the catalog, inventory, ledger, or
// financials. Each can mint a Stripe Payment Link (and matching QR) on the spot.
// ─────────────────────────────────────────────────────────────────────────
let _posBookQR = null;

// Build a collision-free, URL-safe id, prefixed so it can never shadow a
// catalog book in posResolveBook (which checks BOOKS first).
function _posSlugId(title) {
  let base = 'pos-' + ((title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'book');
  let id = base, n = 2;
  while (BOOKS[id] || (posExtraBooks[id] && id !== editingPosBookId)) { id = base + '-' + (n++); }
  return id;
}

window.openPosBookModal = function (id) {
  editingPosBookId = id || null;
  const book = id ? posExtraBooks[id] : null;
  $('pb-modal-title').textContent = book ? `Edit POS-only book · ${book.title}` : 'Add POS-only book';
  $('pb-save-btn').textContent = book ? 'Save changes' : 'Add to POS';
  $('pb-title').value = book?.title || '';
  $('pb-author').value = book?.author || '';
  $('pb-price').value = book?.listPrice ?? 40;
  $('pb-cur').value = book?.currency || '€';
  $('pb-accent').value = book?.accent || '#c8913a';
  $('pb-paylink').value = book?.stripeLink || book?.paymentLink || '';
  const removeBtn = $('pb-remove-btn');
  if (removeBtn) removeBtn.style.display = book ? '' : 'none';
  renderPosBookModalQR();
  updateModalAccentPreview($('pb-accent'));
  openM('pos-book');
};

window.closePosBookModal = function () { closeM('pos-book'); editingPosBookId = null; };

function renderPosBookModalQR() {
  const wrap = $('pb-qr-canvas');
  if (!wrap) return;
  const url = ($('pb-paylink')?.value || '').trim();
  const note = $('pb-qr-note');
  wrap.innerHTML = '';
  _posBookQR = null;
  if (!url) {
    wrap.innerHTML = '<div style="color:#aaa;font-size:11px;text-align:center;padding:1rem;">Add or generate a payment link to preview its QR.</div>';
    if (note) note.textContent = '';
    return;
  }
  if (typeof QRCode !== 'undefined') {
    _posBookQR = new QRCode(wrap, { text: url, width: 180, height: 180, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.H });
    if (note) note.textContent = 'Customers scan this to pay via Stripe.';
  } else {
    wrap.innerHTML = '<div style="color:#aaa;font-size:11px;">QR library not ready.</div>';
  }
}
window.renderPosBookModalQR = renderPosBookModalQR;

window.generatePosBookStripeLink = async function () {
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
};

window.copyPosBookLink = function () {
  const url = ($('pb-paylink')?.value || '').trim();
  if (!url) { showToast('No link to copy', 'warn'); return; }
  navigator.clipboard.writeText(url).then(() => showToast('Link copied')).catch(() => {
    const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast('Link copied');
  });
};

window.downloadPosBookQR = function () {
  const canvas = document.querySelector('#pb-qr-canvas canvas');
  if (!canvas) { showToast('Generate or add a link first', 'warn'); return; }
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `${editingPosBookId || _posSlugId($('pb-title')?.value || 'book')}-payment-qr.png`;
  a.click();
  showToast('Downloading QR Code image');
};

window.savePosBook = async function () {
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
};

window.removeCurrentPosBook = function () { if (editingPosBookId) window.removePosBook(editingPosBookId); };

window.removePosBook = async function (id) {
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
};

function calculateInventoryValuationData() {
  const items = [];
  const totals = {
    totalTitles: 0,
    totalPrintRun: 0,
    totalStockOnHand: 0,
    totalStockConsigned: 0,
    totalUnsoldUnits: 0,
    totalSoldUnits: 0,
    totalOnHandCostCAD: 0,
    totalConsignedCostCAD: 0,
    totalAssetValueCostCAD: 0,
    totalOnHandRetailCAD: 0,
    totalConsignedRetailCAD: 0,
    totalAssetValueRetailCAD: 0,
    totalPotentialGrossProfitCAD: 0,
    weightedAvgMarginPct: 0
  };

  let totalMarginSum = 0;
  let marginCount = 0;

  BOOK_LIST.forEach(book => {
    if (typeof isTestBook === 'function' && isTestBook(book)) return;

    const s = states[book.id] || (typeof defaultState === 'function' ? defaultState(book) : { stock: 0, stores: [], hist: [] });

    const stockOnHand = Math.max(0, parseInt(s.stock, 10) || 0);

    // Read real-time consignment balances from s.stores (outstanding copies)
    const storesList = Array.isArray(s.stores) ? s.stores : [];
    const storeBreakdown = storesList
      .map(st => ({
        storeName: st.name || st.storeName || st.store || 'Partner Store',
        onHand: Math.max(0, parseInt(st.outstanding || (st.qty != null && st.sold != null ? st.qty - st.sold : 0), 10))
      }))
      .filter(x => x.onHand > 0);

    const stockConsigned = storeBreakdown.reduce((sum, st) => sum + st.onHand, 0);

    const totalUnsold = stockOnHand + stockConsigned;

    const totalSold = (s.hist || []).reduce((acc, h) => acc + (parseInt(h.qty, 10) || 0), 0)
      + storesList.reduce((acc, l) => acc + (parseInt(l.sold, 10) || 0), 0);

    const printRun = parseInt(book.maxPrint || book.totalPrinted || 0, 10) || (totalUnsold + totalSold);
    const compsDamaged = Math.max(0, printRun - totalUnsold - totalSold);

    const cur = typeof getBookCurrencyCode === 'function' ? getBookCurrencyCode(book) : (book.currency || 'CAD');
    const isCAD = cur === 'CAD';
    const fxRate = isCAD ? 1 : (_fxRateCache[`${cur}_CAD`] || 1);

    const listPrice = parseFloat(book.listPrice || 0);
    const rawCost = parseFloat(book.productionCost || 0);

    // Derive unit print/production cost. If book.productionCost is total print run cost, divide by printRun.
    const unitCost = (rawCost > 0 && printRun > 1 && rawCost > (listPrice * 2))
      ? (rawCost / printRun)
      : rawCost;

    const unitMargin = Math.max(0, listPrice - unitCost);
    const unitMarginPct = listPrice > 0 ? (unitMargin / listPrice) * 100 : 0;

    if (listPrice > 0) {
      totalMarginSum += unitMarginPct * totalUnsold;
      marginCount += totalUnsold;
    }

    const onHandCostNative = stockOnHand * unitCost;
    const consignedCostNative = stockConsigned * unitCost;
    const totalCostNative = totalUnsold * unitCost;

    const onHandRetailNative = stockOnHand * listPrice;
    const consignedRetailNative = stockConsigned * listPrice;
    const totalRetailNative = totalUnsold * listPrice;

    const onHandCostCAD = onHandCostNative * fxRate;
    const consignedCostCAD = consignedCostNative * fxRate;
    const totalCostCAD = totalCostNative * fxRate;

    const onHandRetailCAD = onHandRetailNative * fxRate;
    const consignedRetailCAD = consignedRetailNative * fxRate;
    const totalRetailCAD = totalRetailNative * fxRate;

    const potentialGrossProfitCAD = totalRetailCAD - totalCostCAD;

    items.push({
      id: book.id,
      title: book.title || 'Untitled',
      isbn: book.isbn || '—',
      format: book.format || 'Paperback',
      printRun,
      stockOnHand,
      stockConsigned,
      totalUnsold,
      totalSold,
      compsDamaged,
      currency: cur,
      fxRate,
      listPrice,
      unitCost,
      unitMargin,
      unitMarginPct,
      onHandCostNative,
      consignedCostNative,
      totalCostNative,
      onHandRetailNative,
      consignedRetailNative,
      totalRetailNative,
      onHandCostCAD,
      consignedCostCAD,
      totalCostCAD,
      onHandRetailCAD,
      consignedRetailCAD,
      totalRetailCAD,
      potentialGrossProfitCAD,
      storeBreakdown
    });

    totals.totalTitles++;
    totals.totalPrintRun += printRun;
    totals.totalStockOnHand += stockOnHand;
    totals.totalStockConsigned += stockConsigned;
    totals.totalUnsoldUnits += totalUnsold;
    totals.totalSoldUnits += totalSold;
    totals.totalOnHandCostCAD += onHandCostCAD;
    totals.totalConsignedCostCAD += consignedCostCAD;
    totals.totalAssetValueCostCAD += totalCostCAD;
    totals.totalOnHandRetailCAD += onHandRetailCAD;
    totals.totalConsignedRetailCAD += consignedRetailCAD;
    totals.totalAssetValueRetailCAD += totalRetailCAD;
    totals.totalPotentialGrossProfitCAD += potentialGrossProfitCAD;
  });

  totals.weightedAvgMarginPct = marginCount > 0 ? (totalMarginSum / marginCount) : 0;

  return { items, totals };
}

function downloadInventoryValuationCSV() {
  const { items, totals } = calculateInventoryValuationData();
  const esc = csvCell;

  let csv = 'Lyricalmyrical Book Inventory Valuation Report\n';
  csv += 'Generated on: ' + today() + '\n';
  csv += `Active Titles: ${totals.totalTitles} | Total Unsold Units: ${totals.totalUnsoldUnits} (${totals.totalStockOnHand} Warehouse / ${totals.totalStockConsigned} Consigned)\n`;
  csv += `Total Balance Sheet Inventory Asset Cost: CAD $${totals.totalAssetValueCostCAD.toFixed(2)} | Total Retail Value: CAD $${totals.totalAssetValueRetailCAD.toFixed(2)}\n\n`;

  csv += 'Book ID,Title,ISBN,Binding / Format,Print Run,Stock On-Hand (Warehouse),Stock Consigned (Stores),Total Unsold Inventory,Lifetime Sold Units,Currency,Unit Print Cost (Native),Unit Retail Price (Native),Unit Margin (Native),Unit Margin %,FX Rate (CAD),On-Hand Asset Value Cost (CAD),Consigned Asset Value Cost (CAD),TOTAL ASSET VALUE COST (CAD),TOTAL RETAIL VALUE (CAD),POTENTIAL GROSS PROFIT (CAD)\n';

  items.forEach(item => {
    csv += `${esc(item.id)},${esc(item.title)},${esc(item.isbn)},${esc(item.format)},${item.printRun},${item.stockOnHand},${item.stockConsigned},${item.totalUnsold},${item.totalSold},${esc(item.currency)},${item.unitCost.toFixed(2)},${item.listPrice.toFixed(2)},${item.unitMargin.toFixed(2)},${item.unitMarginPct.toFixed(1)}%,${item.fxRate.toFixed(4)},${item.onHandCostCAD.toFixed(2)},${item.consignedCostCAD.toFixed(2)},${item.totalCostCAD.toFixed(2)},${item.totalRetailCAD.toFixed(2)},${item.potentialGrossProfitCAD.toFixed(2)}\n`;
  });

  csv += `TOTALS,"Total Active Titles: ${totals.totalTitles}",,,${totals.totalPrintRun},${totals.totalStockOnHand},${totals.totalStockConsigned},${totals.totalUnsoldUnits},${totals.totalSoldUnits},CAD,,,,,,${totals.totalOnHandCostCAD.toFixed(2)},${totals.totalConsignedCostCAD.toFixed(2)},${totals.totalAssetValueCostCAD.toFixed(2)},${totals.totalAssetValueRetailCAD.toFixed(2)},${totals.totalPotentialGrossProfitCAD.toFixed(2)}\n`;

  downloadCsv(csv, `Lyrical_Inventory_Valuation_${today()}.csv`);
  showToast('✓ Comprehensive Inventory Valuation CSV exported');
}

function openInventoryValuationModal() {
  const data = calculateInventoryValuationData();
  const { items, totals } = data;

  const costEl = $('iv-stat-cost-cad');
  const retailEl = $('iv-stat-retail-cad');
  const unitsEl = $('iv-stat-unsold-units');
  const subUnitsEl = $('iv-stat-unsold-sub');
  const marginEl = $('iv-stat-margin-pct');
  const subMarginEl = $('iv-stat-margin-sub');
  const tbody = $('iv-modal-table-body');
  const tfoot = $('iv-modal-table-foot');

  if (costEl) costEl.textContent = `$${totals.totalAssetValueCostCAD.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD`;
  if (retailEl) retailEl.textContent = `$${totals.totalAssetValueRetailCAD.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD`;
  if (unitsEl) unitsEl.textContent = `${totals.totalUnsoldUnits.toLocaleString()} units`;
  if (subUnitsEl) subUnitsEl.textContent = `${totals.totalStockOnHand.toLocaleString()} Warehouse · ${totals.totalStockConsigned.toLocaleString()} Consigned`;
  if (marginEl) marginEl.textContent = `${totals.weightedAvgMarginPct.toFixed(1)}%`;
  if (subMarginEl) subMarginEl.textContent = `$${totals.totalPotentialGrossProfitCAD.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD Total Profit`;

  if (tbody) {
    tbody.innerHTML = items.map(item => {
      const storesTooltip = item.storeBreakdown.length
        ? ` title="${item.storeBreakdown.map(s => `${s.storeName}: ${s.onHand}`).join(' | ')}"`
        : '';
      const storePill = item.stockConsigned > 0
        ? `<span class="tag amber" style="font-size:10px; cursor:help;"${storesTooltip}>${item.stockConsigned} in ${item.storeBreakdown.length} store${item.storeBreakdown.length === 1 ? '' : 's'}</span>`
        : '<span style="color:var(--text3);">0</span>';

      const curSym = typeof getSym === 'function' ? getSym(item.currency) : '$';

      return `
        <tr>
          <td>
            <div style="font-weight:600; color:var(--text1);">${escapeHtml(item.title)}</div>
            <div style="font-size:10px; color:var(--text3);">${escapeHtml(item.isbn)} · ${escapeHtml(item.format)}</div>
          </td>
          <td class="r" style="font-weight:600;">${item.stockOnHand}</td>
          <td class="r">${storePill}</td>
          <td class="r" style="font-weight:700; color:var(--gold);">${item.totalUnsold}</td>
          <td class="r" style="font-family:'DM Mono',monospace;">${curSym}${item.unitCost.toFixed(2)}</td>
          <td class="r" style="font-family:'DM Mono',monospace;">${curSym}${item.listPrice.toFixed(2)}</td>
          <td class="r" style="font-family:'DM Mono',monospace; font-weight:600; color:var(--gold);">$${item.totalCostCAD.toFixed(2)}</td>
          <td class="r" style="font-family:'DM Mono',monospace; font-weight:600; color:var(--green);">$${item.totalRetailCAD.toFixed(2)}</td>
        </tr>
      `;
    }).join('');
  }

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td>TOTALS (${totals.totalTitles} Titles)</td>
        <td class="r">${totals.totalStockOnHand}</td>
        <td class="r">${totals.totalStockConsigned}</td>
        <td class="r" style="color:var(--gold);">${totals.totalUnsoldUnits}</td>
        <td class="r" colspan="2" style="font-size:11px; color:var(--text3);">Weighted Margin: ${totals.weightedAvgMarginPct.toFixed(1)}%</td>
        <td class="r" style="color:var(--gold); font-size:13px;">$${totals.totalAssetValueCostCAD.toFixed(2)} CAD</td>
        <td class="r" style="color:var(--green); font-size:13px;">$${totals.totalAssetValueRetailCAD.toFixed(2)} CAD</td>
      </tr>
    `;
  }

  openM('inventory-valuation-modal');
}

function printInventoryValuationReport() {
  const { items, totals } = calculateInventoryValuationData();
  const printWin = window.open('', '_blank');
  if (!printWin) {
    showToast('⚠ Popup blocked. Allow popups to print report.', 'err');
    return;
  }

  const rows = items.map(item => {
    const curSym = typeof getSym === 'function' ? getSym(item.currency) : '$';
    return `
    <tr>
      <td><strong>${escapeHtml(item.title)}</strong><br><small>${escapeHtml(item.isbn)} | ${escapeHtml(item.format)}</small></td>
      <td style="text-align:right;">${item.stockOnHand}</td>
      <td style="text-align:right;">${item.stockConsigned}</td>
      <td style="text-align:right;font-weight:bold;">${item.totalUnsold}</td>
      <td style="text-align:right;">${curSym}${item.unitCost.toFixed(2)}</td>
      <td style="text-align:right;">${curSym}${item.listPrice.toFixed(2)}</td>
      <td style="text-align:right;font-weight:bold;">$${item.totalCostCAD.toFixed(2)} CAD</td>
      <td style="text-align:right;font-weight:bold;color:#15803d;">$${item.totalRetailCAD.toFixed(2)} CAD</td>
    </tr>
  `;
  }).join('');

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Lyricalmyrical Books - Inventory Valuation Report</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #111; line-height: 1.5; }
        h1 { margin: 0 0 4px 0; font-size: 24px; }
        .meta { color: #555; font-size: 13px; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
        .card { border: 1px solid #ddd; padding: 12px; border-radius: 6px; background: #fafafa; }
        .card-label { font-size: 10px; text-transform: uppercase; color: #666; font-weight: bold; }
        .card-val { font-size: 18px; font-weight: bold; margin-top: 4px; color: #111; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
        th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
        th { background: #f8fafc; font-size: 11px; text-transform: uppercase; }
        tfoot tr td { background: #f1f5f9; font-weight: bold; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>Lyricalmyrical Books — Inventory Valuation Report</h1>
      <div class="meta">Generated: ${today()} | Publisher Balance Sheet & Stock Audit</div>
      <div class="summary">
        <div class="card"><div class="card-label">Asset Cost Basis (CAD)</div><div class="card-val">$${totals.totalAssetValueCostCAD.toFixed(2)}</div></div>
        <div class="card"><div class="card-label">Retail MSRP Value (CAD)</div><div class="card-val">$${totals.totalAssetValueRetailCAD.toFixed(2)}</div></div>
        <div class="card"><div class="card-label">Total Unsold Stock</div><div class="card-val">${totals.totalUnsoldUnits} units</div></div>
        <div class="card"><div class="card-label">Weighted Profit Margin</div><div class="card-val">${totals.weightedAvgMarginPct.toFixed(1)}%</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Title &amp; ISBN</th>
            <th style="text-align:right;">Warehouse</th>
            <th style="text-align:right;">Consigned</th>
            <th style="text-align:right;">Total Unsold</th>
            <th style="text-align:right;">Unit Cost</th>
            <th style="text-align:right;">MSRP</th>
            <th style="text-align:right;">Cost Basis (CAD)</th>
            <th style="text-align:right;">Retail Value (CAD)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td>TOTALS (${totals.totalTitles} Titles)</td>
            <td style="text-align:right;">${totals.totalStockOnHand}</td>
            <td style="text-align:right;">${totals.totalStockConsigned}</td>
            <td style="text-align:right;">${totals.totalUnsoldUnits}</td>
            <td colspan="2" style="text-align:right;">Weighted Margin: ${totals.weightedAvgMarginPct.toFixed(1)}%</td>
            <td style="text-align:right;">$${totals.totalAssetValueCostCAD.toFixed(2)} CAD</td>
            <td style="text-align:right;">$${totals.totalAssetValueRetailCAD.toFixed(2)} CAD</td>
          </tr>
        </tfoot>
      </table>
    </body>
    </html>
  `);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => printWin.print(), 300);
}

// ── TAX SEASON EXPORT ──
window.downloadFullTaxSeasonExport = function () {
  const yearSelect = document.getElementById('tc-year');
  const year = yearSelect ? yearSelect.value : 'all';
  const isAllTime = (year === 'all');

  let csv = 'Lyricalmyrical Tax Season Export\n';
  csv += 'Generated on: ' + today() + '\n';
  csv += 'Tax Year: ' + (isAllTime ? 'All Time' : year) + '\n\n';

  const esc = csvCell;
  const getAmt = (e) => (parseFloat(e.baseAmount || e.amountCAD || e.amount || 0));

  // Track books exported with no saved CAD rate (fell back to 1.0 — a silently
  // wrong tax figure). Keyed by book id so a book is listed at most once.
  const rateWarnings = new Map();
  const flagRateIfMissing = (book, cur, rawRate, hasAmount) => {
    if (hasAmount && cur && cur !== 'CAD' && !rawRate) rateWarnings.set(book.id, { title: book.title, cur });
  };

  // Section 1: Revenue by Book
  csv += '--- REVENUE BY BOOK ---\n';
  csv += 'Book Title,Gross Revenue,Net Revenue (after COGS & Royalty),Total Units Sold\n';

  BOOK_LIST.forEach(book => {
    if (isTestBook(book) || isTestBookId(book.id)) return;
    const s = states[book.id] || defaultState(book);
    // Sales + royalty are recorded in the book's native currency; convert to the
    // export's base (CAD) so they're comparable with the CAD expense figures.
    const cur = getBookCurrencyCode(book);
    const rawRate = _fxRateCache[`${cur}_CAD`];
    const hRate = rawRate || 1;

    // ⚡ Bolt Optimization: Loop Fusion - Compute sold and revenue in a single pass without intermediate array allocation
    let sold = 0;
    let revenue = 0;
    for (let i = 0; i < s.hist.length; i++) {
      const h = s.hist[i];
      if (h.voided || h.gratuity) continue;
      if (!isAllTime && (!h.date || !h.date.startsWith(year))) continue;
      sold += (h.qty || 0);
      revenue += ((h.qty || 0) * (h.price || 0));
    }

    // ⚡ Bolt Optimization: Loop Fusion - Compute expTotal in a single pass without intermediate array allocation
    let expTotal = 0;
    const expenses = s.expenses || [];
    for (let i = 0; i < expenses.length; i++) {
      const e = expenses[i];
      if (e.voided) continue;
      if (!isAllTime && (!e.date || !e.date.startsWith(year))) continue;
      expTotal += getAmt(e);
    }

    // Royalty
    let shares = 0;
    if (isAllTime) {
      const earn = (typeof calculateArtistEarnings === 'function') ? calculateArtistEarnings(book.id) : null;
      shares = (earn && typeof earn === 'object') ? (earn.totalArtistEarned || 0) : (earn || 0);
    } else {
      shares = (typeof filterArtistEarningsByYear === 'function') ? filterArtistEarningsByYear(book.id, parseInt(year)) : 0;
    }

    // expTotal is already CAD (uses each expense's stored baseAmount); convert
    // the native-currency revenue + royalty before subtracting so net is all-CAD.
    const revenueCAD = revenue * hRate;
    const sharesCAD = shares * hRate;
    const net = revenueCAD - expTotal - sharesCAD;
    flagRateIfMissing(book, cur, rawRate, revenue > 0 || shares > 0);
    csv += `${esc(book.title)},${revenueCAD.toFixed(2)},${net.toFixed(2)},${sold}\n`;
  });

  // Section 2: All Expenses & Payouts
  csv += '\n--- ALL EXPENSES & PAYOUTS ---\n';
  csv += 'Date,Book/Entity,Category,Description,Amount (CAD),Receipt Link\n';

  // 2a. Book-level expenses & payouts
  BOOK_LIST.forEach(book => {
    if (isTestBook(book) || isTestBookId(book.id)) return;
    const s = states[book.id] || defaultState(book);
    const cur = getBookCurrencyCode(book);
    const rawRate = _fxRateCache[`${cur}_CAD`];
    const hRate = rawRate || 1;

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
      // Use .total for payouts as per state structure; payout totals are in the
      // book's native currency — convert to CAD to match the column header.
      const payoutRaw = parseFloat(t.total || t.amount || 0);
      flagRateIfMissing(book, cur, rawRate, payoutRaw > 0);
      const payoutCAD = payoutRaw * hRate;
      csv += `${t.date},${esc(book.title)},"Artist Payout","Transfer to Artist",${payoutCAD.toFixed(2)},""\n`;
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

  // Section 3: FX rate warnings — surface any book exported at 1.0 because no
  // CAD rate was saved, so a wrong tax figure can't slip through unnoticed.
  if (rateWarnings.size) {
    csv += '\n--- ⚠ FX RATE WARNINGS ---\n';
    csv += `${esc('No saved CAD exchange rate for these books — their amounts above were exported UNCONVERTED (rate 1.0) and are NOT correct. Refresh FX rates (POS cart → ↻ FX Rates), then re-export.')}\n`;
    csv += 'Book Title,Currency,Rate Used\n';
    rateWarnings.forEach(w => { csv += `${esc(w.title)},${esc(w.cur)},1.00\n`; });
  }

  downloadCsv('﻿' + csv, `Lyrical_Tax_Season_${isAllTime ? 'AllTime' : year}_Export.csv`);

  if (rateWarnings.size) {
    const names = Array.from(rateWarnings.values()).map(w => `${w.title} (${w.cur})`).join(', ');
    showToast(`⚠ Exported, but ${rateWarnings.size} book${rateWarnings.size === 1 ? '' : 's'} had no CAD rate — shown unconverted: ${names}. Refresh FX rates and re-export.`, 'warn', 7000);
  }
};

// ── STRIPE FEES BY YEAR
const _STRIPE_ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
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

async function fetchStripeTransactions(key, onProgress) {
  const allTxns = [];
  let count = 0;
  let starting_after = null;

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
      allTxns.push({
        id: tx.id, created: tx.created, year, currency: cur, type,
        amount: tx.amount, fee: tx.fee, net: tx.net,
        source: tx.source, description: tx.description || ''
      });
      count++;
    }
    if (onProgress) onProgress(count);
    if (!json.has_more || !json.data.length) break;
    starting_after = json.data[json.data.length - 1].id;
  }
  return allTxns;
}

function aggregateStripeTransactions(allTxns) {
  const data = {};
  const byYearCurAll = {};

  for (const tx of allTxns) {
    const year = tx.year;
    const cur = tx.currency;
    const type = tx.type;

    const y = data[year] = data[year] || {};
    const c = y[cur] = y[cur] || {};
    const t = c[type] = c[type] || { gross: 0, fee: 0, net: 0, count: 0 };
    t.gross += tx.amount || 0;
    t.fee += tx.fee || 0;
    t.net += tx.net || 0;
    t.count += 1;

    const ya = byYearCurAll[year] = byYearCurAll[year] || {};
    const ca = ya[cur] = ya[cur] || { gross: 0, fee: 0, net: 0, count: 0 };
    ca.gross += tx.amount || 0;
    ca.fee += tx.fee || 0;
    ca.net += tx.net || 0;
    ca.count += 1;
  }

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
        if (t === 'stripe_fee') stripeBillingMinor += Math.abs(data[yr][cur][t].gross);
      }
      if (salesFeeMinor > 0 || stripeBillingMinor > 0 || salesGrossMinor > 0) {
        ledgerData.push({ year: Number(yr), cur, salesFeeMinor, salesCount, totalFeeMinor, salesGrossMinor, stripeBillingMinor });
      }
    }
  }

  return { data, byYearCurAll, ledgerData };
}

function renderStripeFeesCards(data, byYearCurAll) {
  const years = Object.keys(data).sort((a, b) => Number(b) - Number(a));
  const cards = [];
  const SALES_TYPES = new Set(['charge', 'payment']);

  for (const year of years) {
    const curs = Object.keys(data[year]).sort();
    for (const cur of curs) {
      const types = data[year][cur];
      const salesAgg = { gross: 0, fee: 0, net: 0, count: 0 };
      for (const t of Object.keys(types)) {
        if (SALES_TYPES.has(t)) {
          salesAgg.gross += types[t].gross;
          salesAgg.fee += types[t].fee;
          salesAgg.net += types[t].net;
          salesAgg.count += types[t].count;
        }
      }

      let headline;
      if (salesAgg.count > 0) {
        const gross = _stripeMinorToMajor(salesAgg.gross, cur);
        const fee = _stripeMinorToMajor(salesAgg.fee, cur);
        const net = _stripeMinorToMajor(salesAgg.net, cur);
        const pct = salesAgg.gross ? (salesAgg.fee / salesAgg.gross) * 100 : 0;
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

      const otherTypes = Object.keys(types).filter(t => !SALES_TYPES.has(t)).sort();
      const detailRows = [];
      if (salesAgg.count > 0) {
        const gross = _stripeMinorToMajor(salesAgg.gross, cur);
        const fee = _stripeMinorToMajor(salesAgg.fee, cur);
        const net = _stripeMinorToMajor(salesAgg.net, cur);
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
        const fee = _stripeMinorToMajor(r.fee, cur);
        const net = _stripeMinorToMajor(r.net, cur);
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
      const tfee = _stripeMinorToMajor(tot.fee, cur);
      const tnet = _stripeMinorToMajor(tot.net, cur);
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
            <button type="button" class="btn tag" onclick="(function(el){const d=document.getElementById('${detailId}');const open=d.style.display!=='none';d.style.display=open?'none':'';el.innerHTML=(open?'▸':'▾')+' '+el.dataset.label;})(this)" data-label="Show all balance activity (${detailRows.length} line ${detailRows.length === 1 ? 'item' : 'items'})" style="background:transparent;border:1px dashed var(--gold-line);">▸ Show all balance activity (${detailRows.length} line ${detailRows.length === 1 ? 'item' : 'items'})</button>
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

  return { cardsHtml: cards.join(''), years };
}

async function fetchStripeFeesByYear() {
  const keyEl = document.getElementById('stripe-fees-key');
  const statusEl = document.getElementById('stripe-fees-status');
  const btn = document.getElementById('stripe-fees-btn');
  const wrap = document.getElementById('stripe-fees-results-wrap');
  const key = (keyEl.value || '').trim();
  if (!key) { statusEl.textContent = 'Please paste a Stripe restricted key.'; return; }
  if (!/^(rk|sk)_/.test(key)) { statusEl.innerHTML = '<span style="color:var(--red);">That doesn\'t look like a Stripe secret/restricted key (expected rk_… or sk_…).</span>'; return; }

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

  try {
    const allTxns = await fetchStripeTransactions(key, (count) => {
      statusEl.textContent = `Fetched ${count} transactions…`;
    });

    window._stripeFeesAudit = allTxns;

    const { data, byYearCurAll, ledgerData } = aggregateStripeTransactions(allTxns);
    window._stripeFeesLedgerData = ledgerData;

    const { cardsHtml, years } = renderStripeFeesCards(data, byYearCurAll);

    wrap.innerHTML = cardsHtml
      ? cardsHtml
      : '<div class="card" style="text-align:center;color:var(--text3);padding:2rem;">No balance transactions found.</div>';
    wrap.style.display = '';

    statusEl.innerHTML = `<span style="color:var(--green);">✓ Done — ${allTxns.length} balance transactions across ${years.length} year(s). Key saved for next time.</span>
      <br><span style="font-size:11px;color:var(--text3);">Verify against your Stripe Dashboard: <a href="https://dashboard.stripe.com/balance" target="_blank" rel="noopener" style="color:var(--gold);">Balance</a> · <a href="https://dashboard.stripe.com/reports/balance" target="_blank" rel="noopener" style="color:var(--gold);">Balance reports</a> (set the date range to a calendar year). Click "Download audit CSV" below for the raw per-transaction data.</span>`;

    document.getElementById('stripe-fees-download-btn').style.display = '';
    document.getElementById('stripe-fees-clear-btn').style.display = '';

    const hasLedgerData = ledgerData.length > 0;
    const insertBtn = document.getElementById('stripe-fees-insert-btn');
    if (insertBtn) insertBtn.style.display = hasLedgerData ? '' : 'none';
    const reconcileBtn = document.getElementById('stripe-fees-reconcile-btn');
    if (reconcileBtn) reconcileBtn.style.display = hasLedgerData ? '' : 'none';

    const yearSel = document.getElementById('stripe-fees-year');
    if (yearSel) {
      const ledgerYears = [...new Set(ledgerData.map(r => r.year))].sort((a, b) => b - a);
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
  const fxRates = await Promise.all(rows.map(r => rateFor(r.cur.toUpperCase(), r.year)));
  let i = 0;
  for (const r of rows) {
    const cur = r.cur.toUpperCase();
    const entryDate = r.year < currentYear ? `${r.year}-12-31` : today();
    const fxRate = fxRates[i++];

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
  // ⚡ Bolt Optimization: Use string comparison instead of localeCompare for sorting ref strings
  const lines = planned.sort((a, b) => a.ref > b.ref ? 1 : (a.ref < b.ref ? -1 : 0))
    .map(p => `  • ${p.year} ${p.cat === 'Software & Subscriptions' ? 'billing' : 'sales fees'}: ${p.amount.toFixed(2)} ${p.currency} → ${p.baseAmount.toFixed(2)} CAD`).join('\n');

  const scope = yearFilter != null ? `${yearFilter}` : 'all years';
  const accept = await confirmDialog(
    `Insert Stripe fees (${scope}) into your master ledger?\n\n` +
    `${newCount} new${updateCount ? `, ${updateCount} updated (refreshed in place)` : ''}\n` +
    `Total: ${totalCad.toFixed(2)} CAD\n\n${lines}\n\n` +
    `Nothing is written until you confirm.`,
    { title: 'Insert Stripe fees', okLabel: 'Insert fees' }
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
  for (const book of BOOK_LIST) {
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
  const header = ['id', 'created_iso', 'year', 'currency', 'type', 'amount_major', 'fee_major', 'net_major', 'source', 'description'];
  const esc = v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
  downloadCsv(lines.join('\n'), `stripe-balance-transactions-${new Date().toISOString().slice(0, 10)}.csv`);
}

// ════════════════════════════════════════════════════════════════════════
// STRIPE PAYMENT RECONCILIATION (per-payment worklist)
// ─────────────────────────────────────────────────────────────────────────
// The "Stripe fees by year" tools above answer "how much did Stripe take" and
// give a dollar-level yearly tie-out. This section answers the operational
// question the publisher actually lives with: "which individual Stripe
// payments have NOT yet made it into my inventory?" It pulls each charge,
// auto-matches the ones it can (invoices by INV-… number, Big Cartel orders by
// order number, and our own SKU-tagged payment links by metadata.book_id), and
// leaves the rest as a short worklist where she picks the book and logs the sale.
// ════════════════════════════════════════════════════════════════════════

const RECON_MEMORY_KEY = 'lm-stripe-reconcile';
export function getReconMemory() {
  try {
    const m = JSON.parse(localStorage.getItem(RECON_MEMORY_KEY) || '{}');
    m.recorded = m.recorded || {};   // chargeId -> { bookId, num, at }
    m.dismissed = m.dismissed || {};  // chargeId -> reason/true
    return m;
  } catch (_) { return { recorded: {}, dismissed: {} }; }
}
export function saveReconMemory(m) { localStorage.setItem(RECON_MEMORY_KEY, JSON.stringify(m || {})); }

// Resolve a usable Stripe key: prefer the Tax Center key (where the fees tool
// stores it), then the Invoice Settings key, then whatever is in the field.
function getReconStripeKey() {
  const field = document.getElementById('recon-key');
  return (TAX_CENTER?.settings?.stripeKey
    || getInvoiceSettings().stripeKey
    || (field && field.value)
    || '').trim();
}

// Persist a freshly-entered key back to the same place the fees tool reads it,
// so the user only ever pastes it once anywhere in the app.
async function _reconPersistKey(key) {
  try {
    if (!TAX_CENTER.settings) TAX_CENTER.settings = {};
    if (TAX_CENTER.settings.stripeKey !== key) {
      TAX_CENTER.settings.stripeKey = key;
      if (typeof saveTaxCenter === 'function') await saveTaxCenter();
    }
  } catch (e) { console.warn('Stripe key persist failed:', e); }
}

// Pull recent charges and normalize them. We expand the PaymentIntent so we can
// read link metadata (book_id/sku) and the richer description that payment
// links attach to the intent rather than the charge.
async function fetchStripePaymentsForReconcile(maxPages = 3) {
  const key = getReconStripeKey();
  if (!key) throw new Error('No Stripe key — paste a restricted/secret key first.');
  if (!/^(rk|sk)_/.test(key)) throw new Error("That doesn't look like a Stripe key (expected rk_… or sk_…).");
  await _reconPersistKey(key);

  const out = [];
  let starting_after = null;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ limit: '100' });
    params.append('expand[]', 'data.payment_intent');
    if (starting_after) params.set('starting_after', starting_after);
    const resp = await fetch(`https://api.stripe.com/v1/charges?${params.toString()}`, {
      headers: { 'Authorization': 'Bearer ' + key },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${resp.status}`);
    }
    const json = await resp.json();
    for (const ch of (json.data || [])) {
      // Only successful, captured money movements are interesting here.
      if (ch.status !== 'succeeded' || ch.paid === false) continue;
      const pi = (ch.payment_intent && typeof ch.payment_intent === 'object') ? ch.payment_intent : null;
      const metadata = Object.assign({}, pi?.metadata || {}, ch.metadata || {});
      const cur = (ch.currency || '').toUpperCase();
      out.push({
        id: ch.id,
        piId: pi?.id || (typeof ch.payment_intent === 'string' ? ch.payment_intent : ''),
        amount: _stripeMinorToMajor(ch.amount, cur),
        currency: cur,
        created: (ch.created || 0) * 1000,
        date: new Date((ch.created || 0) * 1000).toISOString().slice(0, 10),
        description: (ch.description || pi?.description || '').trim(),
        email: ch.billing_details?.email || ch.receipt_email || '',
        customer: ch.billing_details?.name || '',
        refunded: !!ch.refunded || (ch.amount_refunded > 0),
        disputed: !!ch.disputed,
        metadata,
      });
    }
    if (!json.has_more || !json.data.length) break;
    starting_after = json.data[json.data.length - 1].id;
  }
  return out;
}

// Build the set of "stripe-<chargeId>" sheetsIds already present in history so a
// payment we previously logged is recognized even on a fresh device / new memory.
function _reconRecordedChargeIds() {
  const ids = new Set();
  Object.values(states).forEach(s => (s.hist || []).forEach(h => {
    if (typeof h.sheetsId === 'string' && h.sheetsId.startsWith('stripe-')) {
      ids.add(h.sheetsId.slice('stripe-'.length));
    }
  }));
  return ids;
}

// Find an invoice (across every book) by its INV-… number.
function _reconFindInvoice(num) {
  for (const bookId of Object.keys(states)) {
    const inv = (states[bookId].invoices || []).find(i => i.num === num);
    if (inv) return { bookId, inv };
  }
  return null;
}

// Soft heuristic: did the publisher likely already log this payment by hand?
// Matches a non-void history entry with the same paid amount+currency within a
// few days. Used only to keep already-handled payments out of the urgent list.
function _reconLikelyAlreadyLogged(p) {
  const target = Math.round(p.amount * 100);
  for (const s of Object.values(states)) {
    for (const h of (s.hist || [])) {
      if (h.voided || h.gratuity) continue;
      const pay = h.payment;
      if (!pay || !pay.amount || normalizeCurrencyCode(pay.currency || '', '') !== p.currency) continue;
      if (Math.round(pay.amount * 100) !== target) continue;
      const dDays = Math.abs((new Date(h.date).getTime() - p.created) / 86400000);
      if (dDays <= 3) return true;
    }
  }
  return false;
}

// Classify a payment into one of the matchable channels.
export function classifyStripePayment(p) {
  const mem = getReconMemory();
  const recordedIds = _reconRecordedChargeIds();

  if (mem.dismissed[p.id]) return { kind: 'dismissed' };
  if (mem.recorded[p.id] || recordedIds.has(p.id)) return { kind: 'recorded', bookId: mem.recorded[p.id]?.bookId };

  // Our own SKU-tagged links (book payment links / invoices) carry book_id.
  const metaBookId = p.metadata?.book_id && BOOKS[p.metadata.book_id] ? p.metadata.book_id : null;

  // Invoice payment (INV-2026-222 …)
  const invMatch = /\b(INV-\d{4}-\d+)\b/i.exec(p.description) || (p.metadata?.invoice_num ? [null, p.metadata.invoice_num] : null);
  if (invMatch) {
    const found = _reconFindInvoice(invMatch[1]);
    return { kind: 'invoice', ref: invMatch[1], bookId: found?.bookId || metaBookId, inv: found?.inv || null };
  }

  // Big Cartel order (Payment for Big Cartel order #ABCD-123456 …)
  const bcMatch = /Big Cartel order\s*#?\s*([A-Za-z0-9-]+)/i.exec(p.description);
  if (bcMatch) {
    const orderNum = '#' + bcMatch[1].replace(/^#/, '');
    const applied = getAllAppliedIds();
    const isApplied = applied.has(orderNum) || applied.has(bcMatch[1]);
    const scanned = (typeof orders !== 'undefined' ? orders : []).find(o => o.orderNum === orderNum || o.orderNum === bcMatch[1]);
    return { kind: 'bigcartel', ref: orderNum, applied: isApplied, scanned: scanned || null, bookId: scanned?.bookId || metaBookId };
  }

  // A direct charge we can identify by metadata still needs a confirm-click.
  if (metaBookId) return { kind: 'direct', bookId: metaBookId };

  if (_reconLikelyAlreadyLogged(p)) return { kind: 'likely' };

  return { kind: 'direct', bookId: null };
}

// Apply a sale to a SPECIFIC book (the reconcile worklist records against the
// book the user picks, not necessarily the active one). Mirrors recordOrder's
// state mutations + Sheets sync, keyed by a deterministic stripe sheetsId.
function _reconApplySaleToBook(bookId, qty, price, payment, chargeId, notes, extra = {}) {
  const st = states[bookId], bk = BOOKS[bookId];
  if (!st || !bk) throw new Error('Unknown book');
  st.stock = Math.max(0, st.stock - qty);
  st.sold += qty;
  st.revenue += qty * price;
  const chan = 'Website';
  if (!st.chStats[chan]) st.chStats[chan] = { txns: 0, units: 0, revenue: 0 };
  st.chStats[chan].txns++; st.chStats[chan].units += qty; st.chStats[chan].revenue += qty * price;
  const sheetsId = 'stripe-' + chargeId;
  const entry = {
    num: extra.num || '', chan, qty, price, after: st.stock,
    notes: notes || 'Stripe', date: extra.date || today(),
    payment, enteredBy: 'Publisher', sheetsId,
    shipEmail: extra.email || '',
  };
  st.hist.unshift(entry);
  const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(bk), 'CAD');
  syncToSheets({
    type: 'order', book: bk.title, date: entry.date, num: entry.num, chan, qty, price,
    total: qty * price, stockAfter: st.stock, notes: entry.notes, sheetsId, currency: nativeCur,
    paymentCurrency: normalizeCurrencyCode(payment?.currency || nativeCur, 'CAD'),
    paymentAmount: payment?.amount ?? (qty * price),
  });
  saveState(bookId);
}

async function reconcileSync() {
  const btn = document.getElementById('recon-sync-btn');
  const statusEl = document.getElementById('recon-status');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Syncing…'; }
  if (statusEl) statusEl.textContent = 'Fetching payments from Stripe…';
  try {
    const payments = await fetchStripePaymentsForReconcile();
    window._reconPayments = payments;
    const mem = getReconMemory();
    mem.lastSync = new Date().toISOString();
    saveReconMemory(mem);
    _reconSession = { logged: 0, dismissed: 0 };
    const krow = document.getElementById('recon-keyrow'); if (krow) delete krow.dataset.editing;
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--green);">✓ Pulled ${payments.length} payment${payments.length === 1 ? '' : 's'} from Stripe.</span>`;
    renderReconcile();
  } catch (e) {
    const msg = String(e.message || e);
    let hint = '';
    if (/permission|rak_charge_read|rak_payment_intent_read/i.test(msg)) {
      hint = `<br><span style="font-size:11px;line-height:1.6;display:inline-block;margin-top:4px;">
        Your restricted key is missing a read scope. In
        <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener" style="color:var(--gold);">Stripe → API keys</a>,
        edit the key (or create a new one) and grant <strong>Read</strong> on
        <strong>Charges</strong> and <strong>PaymentIntents</strong> (keep <strong>Balance transactions</strong> for the fees tool).
        A full <code>sk_live_…</code> secret key also works. Then paste it above and sync again.</span>`;
    } else if (/Failed to fetch|NetworkError|CORS/i.test(msg)) {
      hint = '<br><span style="font-size:11px;">Your browser may be blocking the direct Stripe call (CORS). Try again, or use a restricted key.</span>';
    }
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--red);">Error: ${msg}</span>${hint}`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↻ Sync from Stripe'; }
  }
}

// Worklist view state — kept on the module (not rebuilt each render) so the
// search box keeps focus and the active chip/sort stay put while you work down
// a long list. Session counters reset on every fresh sync.
let _reconFilter = { q: '', cur: 'all', type: 'all', sort: 'date-desc', group: false };
export let _reconSession = { logged: 0, dismissed: 0 };

function _reconBookOptions(selectedId, includeBlank) {
  // includeBlank seeds a "— Choose book —" first option so an unmatched payment
  // can't be logged against the first book by a stray click. Selected when no
  // SKU match is known, which also leaves the Record button disabled.
  const blank = includeBlank ? `<option value=""${selectedId ? '' : ' selected'}>— Choose book —</option>` : '';
  return blank + BOOK_LIST.map(b =>
    `<option value="${escapeHtml(b.id)}"${b.id === selectedId ? ' selected' : ''}>${escapeHtml(b.title)} · ${b.currency}${b.listPrice}</option>`
  ).join('');
}

// Collapse the key field to a tidy "saved" chip once a key exists anywhere; the
// publisher only ever pastes it once (Tax Centre / Invoices / here all share it).
function reconRenderKeyRow(forceEdit) {
  const row = document.getElementById('recon-keyrow');
  if (!row) return;
  const saved = (TAX_CENTER?.settings?.stripeKey || getInvoiceSettings().stripeKey || '').trim();
  if (saved && !forceEdit && !row.dataset.editing) {
    row.innerHTML = `<span style="font-size:12px;color:var(--text2);">🔒 Stripe key saved <span style="font-family:'DM Mono',monospace;color:var(--text3);">••••${escapeHtml(saved.slice(-4))}</span></span>
      <button class="btn tag sm" onclick="reconEditKey()">Change</button>`;
  } else {
    row.innerHTML = `<input type="password" id="recon-key" placeholder="rk_live_… or sk_live_… (reused from Tax Centre / Invoices if already saved)" style="flex:1;" autocomplete="off" value="${escapeHtml(saved)}">`;
  }
}
function reconEditKey() {
  const row = document.getElementById('recon-keyrow');
  if (row) row.dataset.editing = '1';
  reconRenderKeyRow(true);
  document.getElementById('recon-key')?.focus();
}

// ── Filter / sort plumbing
function reconOnFilter() {
  _reconFilter.q = (document.getElementById('recon-search')?.value || '').trim().toLowerCase();
  _reconFilter.type = document.getElementById('recon-type')?.value || 'all';
  _reconFilter.sort = document.getElementById('recon-sort')?.value || 'date-desc';
  _reconFilter.group = !!document.getElementById('recon-group')?.checked;
  renderReconcile();
}
function reconSetCurrency(cur) { _reconFilter.cur = cur; renderReconcile(); }
function reconClearFilters() {
  _reconFilter.q = ''; _reconFilter.cur = 'all'; _reconFilter.type = 'all';
  const s = document.getElementById('recon-search'); if (s) s.value = '';
  const t = document.getElementById('recon-type'); if (t) t.value = 'all';
  renderReconcile();
}
// "Pickable" = needs a book picked & logged (vs. open-invoice / apply-order).
function _reconIsPickable(c) {
  return !(c.kind === 'invoice') && !(c.kind === 'bigcartel' && c.scanned);
}
function _reconMatchesFilter(p, c) {
  if (_reconFilter.cur !== 'all' && p.currency !== _reconFilter.cur) return false;
  if (_reconFilter.type !== 'all') {
    const t = c.kind === 'invoice' ? 'invoice' : c.kind === 'bigcartel' ? 'bigcartel' : 'direct';
    if (t !== _reconFilter.type) return false;
  }
  if (_reconFilter.q) {
    const hay = [p.customer, p.email, p.description, p.currency, String(p.amount),
    _stripeFmtMoney(p.amount, p.currency), c.ref || ''].join(' ').toLowerCase();
    if (!hay.includes(_reconFilter.q)) return false;
  }
  return true;
}
const _RECON_SORTERS = {
  'date-desc': (a, b) => b.p.created - a.p.created,
  'date-asc': (a, b) => a.p.created - b.p.created,
  'amt-desc': (a, b) => b.p.amount - a.p.amount,
  'amt-asc': (a, b) => a.p.amount - b.p.amount,
};

// ── Card fragments shared by single + grouped rendering
function _reconAmountBadge(p) {
  return `<span style="font-family:'DM Mono',monospace;font-weight:600;font-size:16px;">${_stripeFmtMoney(p.amount, p.currency)}</span>`;
}
function _reconMeta(p) {
  const who = [p.customer, p.email].filter(Boolean).join(' · ') || '—';
  const desc = p.description ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;">${escapeHtml(p.description)}</div>` : '';
  return `<div style="font-size:12px;color:var(--text2);margin-top:3px;">${escapeHtml(p.date)} · ${escapeHtml(who)}</div>${desc}`;
}

// One needs-review card.
function _reconNeedCard(p, c) {
  const idSafe = p.id.replace(/[^A-Za-z0-9_]/g, '');
  const disputed = p.disputed ? ` <span class="pill" style="font-size:10px;background:#fbe9e7;color:#b3261e;">⚠ Disputed</span>` : '';

  // Invoice not yet marked paid → send her to the proper invoice flow.
  if (c.kind === 'invoice') {
    const goBtn = c.bookId
      ? `<button class="btn gold sm" onclick="reconcileOpenInvoice('${idSafe}')">Open invoice ${escapeHtml(c.ref)} →</button>`
      : `<span style="font-size:11px;color:var(--amber);">Invoice ${escapeHtml(c.ref)} not found in this app</span>`;
    return `<div class="card" style="margin-bottom:10px;padding:12px 14px;">
      <div class="row-between" style="align-items:flex-start;">
        <div><div>${_reconAmountBadge(p)} <span class="pill" style="font-size:10px;background:#e8eef9;color:#27508f;">Invoice</span>${disputed}</div>${_reconMeta(p)}</div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">${goBtn}
          <button class="btn tag sm" onclick="reconcileDismiss('${idSafe}')" title="Not an inventory sale">Dismiss</button></div>
      </div></div>`;
  }

  // Big Cartel order that was scanned but not yet applied → one-click apply.
  if (c.kind === 'bigcartel' && c.scanned) {
    return `<div class="card" style="margin-bottom:10px;padding:12px 14px;">
      <div class="row-between" style="align-items:flex-start;">
        <div><div>${_reconAmountBadge(p)} <span class="pill" style="font-size:10px;background:#eaf7ee;color:#1f7a3d;">Big Cartel ${escapeHtml(c.ref)}</span>${disputed}</div>${_reconMeta(p)}</div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
          <button class="btn gold sm" onclick="reconcileApplyBigCartel('${idSafe}')">Apply order</button>
          <button class="btn tag sm" onclick="reconcileDismiss('${idSafe}')">Dismiss</button></div>
      </div></div>`;
  }

  // Direct sale (bare pi_…) or Big Cartel order we never scanned → pick a book.
  const kindPill = c.kind === 'bigcartel'
    ? `<span class="pill" style="font-size:10px;background:#eaf7ee;color:#1f7a3d;">Big Cartel ${escapeHtml(c.ref)}</span>`
    : `<span class="pill gold" style="font-size:10px;">Direct sale</span>`;
  const suggest = c.bookId ? `<span style="font-size:10px;color:var(--green);margin-left:6px;">SKU match → ${escapeHtml(BOOKS[c.bookId].title)}</span>` : '';
  const recDisabled = c.bookId ? '' : ' disabled';
  return `<div class="card" style="margin-bottom:10px;padding:12px 14px;">
    <div class="row-between" style="align-items:flex-start;">
      <div><div>${_reconAmountBadge(p)} ${kindPill}${suggest}${disputed}</div>${_reconMeta(p)}</div>
    </div>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:10px;">
      <div class="form-group" style="margin:0;flex:1;min-width:160px;">
        <label style="font-size:10px;">Book</label>
        <select id="recon-book-${idSafe}" onchange="document.getElementById('recon-rec-${idSafe}').disabled=!this.value">${_reconBookOptions(c.bookId, !c.bookId)}</select>
      </div>
      <div class="form-group" style="margin:0;width:70px;">
        <label style="font-size:10px;">Qty</label>
        <input type="number" id="recon-qty-${idSafe}" value="1" min="1" style="width:100%;">
      </div>
      <button class="btn gold sm" id="recon-rec-${idSafe}" style="height:38px;"${recDisabled} onclick="reconcileRecordSale('${idSafe}')">Record sale</button>
      <button class="btn tag sm" style="height:38px;" onclick="reconcileDismiss('${idSafe}')" title="Not an inventory sale (donation, test charge, etc.)">Dismiss</button>
    </div></div>`;
}

// A grouped card standing in for N identical pickable payments.
function _reconGroupCard(items, gi) {
  const p = items[0].p, c = items[0].c, n = items.length;
  const kindPill = c.kind === 'bigcartel'
    ? `<span class="pill" style="font-size:10px;background:#eaf7ee;color:#1f7a3d;">Big Cartel</span>`
    : `<span class="pill gold" style="font-size:10px;">Direct sale</span>`;
  const suggest = c.bookId ? `<span style="font-size:10px;color:var(--green);margin-left:6px;">SKU match → ${escapeHtml(BOOKS[c.bookId].title)}</span>` : '';
  const total = _stripeFmtMoney(items.reduce((s, it) => s + it.p.amount, 0), p.currency);
  const desc = p.description ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;">${escapeHtml(p.description)}</div>` : '';
  const recDisabled = c.bookId ? '' : ' disabled';
  return `<div class="card" style="margin-bottom:10px;padding:12px 14px;">
    <div class="row-between" style="align-items:flex-start;">
      <div><div>${_reconAmountBadge(p)} <span style="font-size:12px;color:var(--text2);font-weight:600;">× ${n}</span> ${kindPill}${suggest}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:3px;">${n} identical payments · ${escapeHtml(total)} total</div>${desc}</div>
    </div>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:10px;">
      <div class="form-group" style="margin:0;flex:1;min-width:160px;">
        <label style="font-size:10px;">Book (applies to all ${n})</label>
        <select id="recon-gbook-${gi}" onchange="document.getElementById('recon-grec-${gi}').disabled=!this.value">${_reconBookOptions(c.bookId, !c.bookId)}</select>
      </div>
      <div class="form-group" style="margin:0;width:80px;">
        <label style="font-size:10px;">Qty each</label>
        <input type="number" id="recon-gqty-${gi}" value="1" min="1" style="width:100%;">
      </div>
      <button class="btn gold sm" id="recon-grec-${gi}" style="height:38px;"${recDisabled} onclick="reconRecordGroup(${gi})">Record all ${n}</button>
      <button class="btn tag sm" style="height:38px;" onclick="reconDismissGroup(${gi})">Dismiss all ${n}</button>
    </div></div>`;
}

export function renderReconcile() {
  const needsEl = document.getElementById('recon-needs');
  const matchedEl = document.getElementById('recon-matched');
  const summaryEl = document.getElementById('recon-summary');
  const toolbarEl = document.getElementById('recon-toolbar');
  if (!needsEl) return;

  reconRenderKeyRow();
  renderPaymentConfig();

  const mem = getReconMemory();
  const lastSyncEl = document.getElementById('recon-last-sync');
  if (lastSyncEl) lastSyncEl.textContent = mem.lastSync ? `Last synced ${new Date(mem.lastSync).toLocaleString()}` : 'Not synced yet';

  const payments = window._reconPayments || [];
  if (!payments.length) {
    needsEl.innerHTML = '<div class="empty-state"><div class="e-icon">💳</div>Press <strong>Sync from Stripe</strong> to pull your payments and see which ones still need logging.</div>';
    matchedEl.innerHTML = '';
    if (summaryEl) summaryEl.innerHTML = '';
    if (toolbarEl) toolbarEl.style.display = 'none';
    return;
  }

  const needs = [];
  const matched = [];
  for (const p of payments) {
    const c = classifyStripePayment(p);
    if (c.kind === 'dismissed') { matched.push({ p, c, label: 'Dismissed', tone: 'gray', note: 'Marked "not inventory".' }); continue; }
    if (c.kind === 'recorded') { matched.push({ p, c, label: 'Logged', tone: 'green', note: c.bookId && BOOKS[c.bookId] ? `Recorded against ${BOOKS[c.bookId].title}.` : 'Recorded in inventory.' }); continue; }
    if (c.kind === 'likely') { matched.push({ p, c, label: 'Likely logged', tone: 'gray', note: 'Matches a sale you already recorded (same amount & date).' }); continue; }
    if (p.refunded) { matched.push({ p, c, label: 'Refunded', tone: 'gray', note: 'Refunded in Stripe — no stock to deduct.' }); continue; }
    if (c.kind === 'invoice' && c.inv && c.inv.status === 'paid') { matched.push({ p, c, label: 'Invoice paid', tone: 'green', note: `${c.ref} already marked paid.` }); continue; }
    if (c.kind === 'bigcartel' && c.applied) { matched.push({ p, c, label: 'Big Cartel', tone: 'green', note: `Order ${c.ref} already applied to stock.` }); continue; }
    needs.push({ p, c });
  }

  // Currency filter chips (built from everything still needing review).
  const chipsEl = document.getElementById('recon-cur-chips');
  if (chipsEl) {
    const curCounts = {};
    needs.forEach(({ p }) => { curCounts[p.currency] = (curCounts[p.currency] || 0) + 1; });
    const curs = Object.keys(curCounts).sort();
    const chip = (val, label) => `<button class="recon-chip${_reconFilter.cur === val ? ' active' : ''}" onclick="reconSetCurrency('${val}')">${label}</button>`;
    let chips = chip('all', `All · ${needs.length}`);
    curs.forEach(cur => { chips += chip(cur, `${cur} · ${curCounts[cur]}`); });
    chipsEl.innerHTML = curs.length > 1 ? chips : '';   // one currency → no need for chips
  }
  if (toolbarEl) toolbarEl.style.display = needs.length ? 'flex' : 'none';

  // Apply search / currency / type filters, then sort.
  const shown = needs.filter(({ p, c }) => _reconMatchesFilter(p, c));
  shown.sort(_RECON_SORTERS[_reconFilter.sort] || _RECON_SORTERS['date-desc']);
  window._reconShownIds = shown.map(({ p }) => p.id);

  // Summary + reconciled-progress bar.
  if (summaryEl) {
    const reviewMoney = {};
    needs.forEach(({ p }) => { reviewMoney[p.currency] = (reviewMoney[p.currency] || 0) + p.amount; });
    const moneyStr = Object.entries(reviewMoney).map(([cur, amt]) => _stripeFmtMoney(amt, cur)).join(' · ') || '—';
    const filtering = shown.length !== needs.length;
    const sess = (_reconSession.logged || _reconSession.dismissed)
      ? ` · <span style="color:var(--green);">${_reconSession.logged} logged · ${_reconSession.dismissed} dismissed this session</span>` : '';
    const pct = payments.length ? Math.round((matched.length / payments.length) * 100) : 0;
    summaryEl.innerHTML = `<strong style="color:var(--gold);">${needs.length}</strong> need review (${moneyStr})${filtering ? ` · <span style="color:var(--text3);">showing ${shown.length}</span>` : ''} · <strong>${matched.length}</strong> reconciled · ${payments.length} total${sess}
      <div class="recon-progress" title="${pct}% of payments reconciled"><i style="width:${pct}%;"></i></div>`;
  }

  // ── Needs review worklist
  if (!needs.length) {
    needsEl.innerHTML = '<div class="empty-state"><div class="e-icon">✅</div>Every Stripe payment is accounted for. Nothing to review.</div>';
  } else if (!shown.length) {
    needsEl.innerHTML = `<div class="empty-state"><div class="e-icon">🔍</div>No payments match your filters. <button class="btn tag sm" onclick="reconClearFilters()">Clear filters</button></div>`;
  } else if (_reconFilter.group) {
    // Collapse identical "pickable" payments into one row; everything else stays individual.
    const groups = new Map();
    const singles = [];
    window._reconGroupMap = {};
    shown.forEach(it => {
      if (!_reconIsPickable(it.c)) { singles.push(it); return; }
      const sig = [it.p.currency, it.p.amount, (it.p.description || '').trim(), it.c.kind, it.c.ref || '', it.c.bookId || ''].join('|');
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig).push(it);
    });
    let html = '', gi = 0;
    [...groups.values()].sort((a, b) => b.length - a.length).forEach(items => {
      if (items.length === 1) { html += _reconNeedCard(items[0].p, items[0].c); return; }
      window._reconGroupMap[gi] = items.map(it => it.p.id);
      html += _reconGroupCard(items, gi);
      gi++;
    });
    singles.forEach(it => { html += _reconNeedCard(it.p, it.c); });
    needsEl.innerHTML = html;
  } else {
    needsEl.innerHTML = shown.map(({ p, c }) => _reconNeedCard(p, c)).join('');
  }

  // ── Reconciled (collapsed detail)
  if (!matched.length) { matchedEl.innerHTML = ''; return; }
  const rows = matched.map(({ p, label, tone, note }) => `<tr>
    <td style="white-space:nowrap;">${escapeHtml(p.date)}</td>
    <td class="r" style="font-family:'DM Mono',monospace;white-space:nowrap;">${_stripeFmtMoney(p.amount, p.currency)}</td>
    <td>${escapeHtml([p.customer, p.email].filter(Boolean).join(' · ') || p.description || '—')}</td>
    <td><span class="pill ${tone}" style="font-size:10px;">${label}</span> <span style="font-size:11px;color:var(--text3);">${escapeHtml(note)}</span></td>
    <td class="r">${getReconMemory().recorded[p.id] || getReconMemory().dismissed[p.id] ? `<button class="btn tag sm" onclick="reconcileUndo('${p.id.replace(/[^A-Za-z0-9_]/g, '')}')">Undo</button>` : ''}</td>
  </tr>`).join('');
  matchedEl.innerHTML = `
    <button type="button" class="btn tag" style="background:transparent;border:1px dashed var(--gold-line);margin-top:16px;" onclick="(function(el){const d=document.getElementById('recon-matched-tbl');const open=d.style.display!=='none';d.style.display=open?'none':'';el.textContent=(open?'▸':'▾')+' Reconciled payments (${matched.length})';})(this)">▸ Reconciled payments (${matched.length})</button>
    <div id="recon-matched-tbl" style="display:none;margin-top:10px;">
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th class="r">Amount</th><th>Customer</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
}

export function _reconFindPayment(idSafe) {
  return (window._reconPayments || []).find(p => p.id.replace(/[^A-Za-z0-9_]/g, '') === idSafe);
}

// Shared price/payment derivation so the single + bulk record paths stay in lockstep.
function _reconApplyPaymentToBook(p, bookId, qty) {
  const bk = BOOKS[bookId];
  if (!bk) throw new Error('Unknown book');
  const bookCur = normalizeCurrencyCode(getBookCurrencyCode(bk), 'CAD');
  // When the paid currency matches the book currency, the per-unit price is the
  // real paid amount; otherwise keep the book's list price and attach the paid
  // cash as a payment record so FX is preserved (same shape as recordOrder).
  const price = (p.currency === bookCur) ? Math.round((p.amount / qty) * 100) / 100 : (bk.listPrice || 0);
  const payment = { currency: p.currency, amount: p.amount, ref: p.id };
  _reconApplySaleToBook(bookId, qty, price, payment, p.id, 'Stripe direct', { date: p.date, email: p.email });
}

function reconcileRecordSale(idSafe) {
  const p = _reconFindPayment(idSafe);
  if (!p) return;
  const bookId = document.getElementById('recon-book-' + idSafe)?.value;
  const qty = Math.max(1, parseInt(document.getElementById('recon-qty-' + idSafe)?.value, 10) || 1);
  if (!bookId || !BOOKS[bookId]) { showToast('Pick a book first', 'warn'); return; }
  try {
    _reconApplyPaymentToBook(p, bookId, qty);
  } catch (e) { showToast('Could not record: ' + (e.message || e), 'err'); return; }
  const mem = getReconMemory();
  mem.recorded[p.id] = { bookId, num: '', at: Date.now() };
  saveReconMemory(mem);
  _reconSession.logged++;
  if (bookId === activeBook) updateDash();
  showToast(`✓ Logged ${qty}× ${BOOKS[bookId].title} → stock ${states[bookId].stock}`);
  renderReconcile();
}


function reconcileOpenInvoice(idSafe) {
  const p = _reconFindPayment(idSafe);
  if (!p) return;
  const c = classifyStripePayment(p);
  if (!c.bookId) { showToast('Invoice not found in this app', 'warn'); return; }
  if (typeof switchBook === 'function') switchBook(c.bookId);
  switchTab('consignment');
  setTimeout(() => { try { if (c.inv) viewInvoice(c.inv.id); } catch (_) { } }, 60);
}

function reconcileDismiss(idSafe) {
  const p = _reconFindPayment(idSafe);
  if (!p) return;
  const mem = getReconMemory();
  mem.dismissed[p.id] = true;
  saveReconMemory(mem);
  _reconSession.dismissed++;
  renderReconcile();
}

// Bulk: record every payment in a "Group identical" row against one book.
function reconRecordGroup(gi) {
  const ids = (window._reconGroupMap || {})[gi];
  if (!ids || !ids.length) return;
  const bookId = document.getElementById('recon-gbook-' + gi)?.value;
  const qty = Math.max(1, parseInt(document.getElementById('recon-gqty-' + gi)?.value, 10) || 1);
  if (!bookId || !BOOKS[bookId]) { showToast('Pick a book first', 'warn'); return; }
  const mem = getReconMemory();
  let n = 0;
  ids.forEach(id => {
    const p = (window._reconPayments || []).find(x => x.id === id);
    if (!p || mem.recorded[id] || mem.dismissed[id]) return;
    try {
      _reconApplyPaymentToBook(p, bookId, qty);
      mem.recorded[id] = { bookId, num: '', at: Date.now() };
      _reconSession.logged++; n++;
    } catch (e) { /* skip the bad one, keep going */ }
  });
  saveReconMemory(mem);
  if (bookId === activeBook) updateDash();
  if (n) showToast(`✓ Logged ${n}× sale${n === 1 ? '' : 's'} → ${BOOKS[bookId].title}`);
  renderReconcile();
}

// Bulk: dismiss every payment in a "Group identical" row.
function reconDismissGroup(gi) {
  const ids = (window._reconGroupMap || {})[gi];
  if (!ids || !ids.length) return;
  const mem = getReconMemory();
  ids.forEach(id => { if (!mem.dismissed[id] && !mem.recorded[id]) { mem.dismissed[id] = true; _reconSession.dismissed++; } });
  saveReconMemory(mem);
  renderReconcile();
}

// Bulk: dismiss everything currently visible (after filters). Guard-railed.
function reconDismissAllShown() {
  const ids = window._reconShownIds || [];
  if (!ids.length) return;
  if (!confirm(`Dismiss all ${ids.length} shown payment${ids.length === 1 ? '' : 's'} as "not inventory"? You can undo any of them from Reconciled below.`)) return;
  const mem = getReconMemory();
  let n = 0;
  ids.forEach(id => { if (!mem.dismissed[id] && !mem.recorded[id]) { mem.dismissed[id] = true; _reconSession.dismissed++; n++; } });
  saveReconMemory(mem);
  showToast(`Dismissed ${n} payment${n === 1 ? '' : 's'}`);
  renderReconcile();
}

function reconcileUndo(idSafe) {
  const p = _reconFindPayment(idSafe);
  if (!p) return;
  const mem = getReconMemory();
  delete mem.dismissed[p.id];
  // Note: undoing a *recorded* sale only clears the reconcile flag; it does not
  // reverse the stock change (use the History tab's edit/void for that).
  const wasRecorded = !!mem.recorded[p.id];
  delete mem.recorded[p.id];
  saveReconMemory(mem);
  if (wasRecorded) showToast('Reconcile flag cleared. Stock was not changed — edit/void in History if needed.', 'warn', 5000);
  renderReconcile();
}

// ─────────────────────────────────────────────────────────────────────────
// BOOK PAYMENT LINK WITH SKU METADATA
// Generate a Stripe Payment Link for a book at its list price, tagged with
// book_id/sku/isbn metadata so future direct sales self-identify in the
// reconcile worklist above (no manual book-picking needed next time).
// ─────────────────────────────────────────────────────────────────────────
async function createStripePaymentLinkForBook(book) {
  const key = getReconStripeKey();
  if (!key) throw new Error('Stripe key not set — add one in Invoice Settings, the Tax Centre, or the Payments tab.');
  if (!/^(rk|sk)_/.test(key)) throw new Error("That doesn't look like a Stripe restricted/secret key (expected rk_… or sk_…).");

  const curCode = (getBookCurrencyCode(book) || 'CAD').toLowerCase();
  const isZeroDec = _STRIPE_ZERO_DECIMAL.has(curCode.toUpperCase());
  const major = Number(book.listPrice || 0);
  const amount = isZeroDec ? Math.round(major) : Math.round(major * 100);
  if (amount < 50 && !isZeroDec) throw new Error('List price too small for Stripe (minimum 0.50).');

  const priceParams = new URLSearchParams();
  priceParams.set('unit_amount', String(amount));
  priceParams.set('currency', curCode);
  priceParams.set('product_data[name]', (book.title || 'Book').slice(0, 250));
  priceParams.set('metadata[book_id]', book.id || '');
  priceParams.set('metadata[sku]', book.id || '');
  priceParams.set('metadata[isbn]', book.isbn && book.isbn !== '—' ? book.isbn : '');
  const priceRes = await fetch('https://api.stripe.com/v1/prices', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: priceParams.toString(),
  });
  if (!priceRes.ok) {
    const err = await priceRes.json().catch(() => ({}));
    const msg = err.error?.message || ('HTTP ' + priceRes.status);
    // The Prices endpoint needs the "Prices" (a.k.a. Plans) write scope. A key
    // missing it is the most common failure here, so point at the exact fix.
    const hint = /permission|rak_/i.test(msg)
      ? ' — your restricted key needs Write on Prices, Products and Payment Links.'
      : '';
    throw new Error('Stripe price: ' + msg + hint);
  }
  const price = await priceRes.json();

  const linkParams = new URLSearchParams();
  linkParams.set('line_items[0][price]', price.id);
  linkParams.set('line_items[0][quantity]', '1');
  linkParams.set('line_items[0][adjustable_quantity][enabled]', 'true');
  linkParams.set('metadata[book_id]', book.id || '');
  linkParams.set('metadata[sku]', book.id || '');
  linkParams.set('payment_intent_data[description]', (book.title || 'Book').slice(0, 350));
  linkParams.set('payment_intent_data[metadata][book_id]', book.id || '');
  linkParams.set('payment_intent_data[metadata][sku]', book.id || '');
  linkParams.set('billing_address_collection', 'auto');
  const linkRes = await fetch('https://api.stripe.com/v1/payment_links', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: linkParams.toString(),
  });
  if (!linkRes.ok) {
    const err = await linkRes.json().catch(() => ({}));
    throw new Error('Stripe payment link: ' + (err.error?.message || ('HTTP ' + linkRes.status)));
  }
  const link = await linkRes.json();
  return link.url;
}

// Mint a Stripe Payment Link for an arbitrary amount + currency. Used by the
// POS to collect the exact (possibly discounted) amount a customer owes —
// either for the whole sale or for a single adjusted line. Mirrors
// createStripePaymentLinkForBook but takes a free-form amount/description.
async function createStripePaymentLinkForAmount({ amountMajor, currencyCode, description, metadata }) {
  const key = getReconStripeKey();
  if (!key) throw new Error('Stripe key not set — add one in Invoice Settings, the Tax Centre, or the Payments tab.');
  if (!/^(rk|sk)_/.test(key)) throw new Error("That doesn't look like a Stripe restricted/secret key (expected rk_… or sk_…).");

  const curCode = (currencyCode || 'CAD').toUpperCase();
  const isZeroDec = _STRIPE_ZERO_DECIMAL.has(curCode);
  const major = Number(amountMajor || 0);
  if (!(major > 0)) throw new Error('Nothing to charge — the amount is zero.');
  const amount = isZeroDec ? Math.round(major) : Math.round(major * 100);
  if (amount < 50 && !isZeroDec) throw new Error('Amount too small for Stripe (minimum 0.50).');

  const meta = metadata || {};
  const priceParams = new URLSearchParams();
  priceParams.set('unit_amount', String(amount));
  priceParams.set('currency', curCode.toLowerCase());
  priceParams.set('product_data[name]', (description || 'Book fair sale').slice(0, 250));
  Object.entries(meta).forEach(([k, v]) => priceParams.set(`metadata[${k}]`, v == null ? '' : String(v)));
  const priceRes = await fetch('https://api.stripe.com/v1/prices', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: priceParams.toString(),
  });
  if (!priceRes.ok) {
    const err = await priceRes.json().catch(() => ({}));
    const msg = err.error?.message || ('HTTP ' + priceRes.status);
    const hint = /permission|rak_/i.test(msg)
      ? ' — your restricted key needs Write on Prices, Products and Payment Links.'
      : '';
    throw new Error('Stripe price: ' + msg + hint);
  }
  const price = await priceRes.json();

  const linkParams = new URLSearchParams();
  linkParams.set('line_items[0][price]', price.id);
  linkParams.set('line_items[0][quantity]', '1');
  linkParams.set('payment_intent_data[description]', (description || 'Book fair sale').slice(0, 350));
  Object.entries(meta).forEach(([k, v]) => {
    linkParams.set(`metadata[${k}]`, v == null ? '' : String(v));
    linkParams.set(`payment_intent_data[metadata][${k}]`, v == null ? '' : String(v));
  });
  linkParams.set('billing_address_collection', 'auto');
  const linkRes = await fetch('https://api.stripe.com/v1/payment_links', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: linkParams.toString(),
  });
  if (!linkRes.ok) {
    const err = await linkRes.json().catch(() => ({}));
    throw new Error('Stripe payment link: ' + (err.error?.message || ('HTTP ' + linkRes.status)));
  }
  const link = await linkRes.json();
  return link.url;
}

// Wired to the "Generate SKU link" button in the book edit modal. Fills the
// Stripe link field with a freshly-created, metadata-tagged link (the user
// still saves the book to persist it).
async function generateBookStripeLink() {
  const btn = document.getElementById('nb-gen-stripe-btn');
  const field = document.getElementById('nb-paylink');
  const title = (document.getElementById('nb-title')?.value || '').trim();
  const idRaw = (document.getElementById('nb-id')?.value || '').trim();
  const id = idRaw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const listPrice = parseFloat(document.getElementById('nb-price')?.value) || 0;
  const currency = document.getElementById('nb-cur')?.value || '€';
  const isbn = (document.getElementById('nb-isbn')?.value || '').trim();
  if (!id || !title) { showToast('Set a book ID and title first', 'warn'); return; }
  if (!(listPrice > 0)) { showToast('Set a list price first', 'warn'); return; }
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Creating…'; }
  try {
    const url = await createStripePaymentLinkForBook({ id, title, listPrice, currency, isbn });
    if (field) field.value = url;
    showToast('✓ SKU-tagged Stripe link created — Save the book to keep it');
  } catch (e) {
    showToast('Stripe: ' + (e.message || e), 'err', 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Generate SKU link'; }
  }
}

// Global exposure for HTML handlers (cleaned up)
// ── CUSTOMERS / MAILING LIST ────────────────────────────────────────────────
// Aggregates every buyer we can identify into one de-duplicated contact list
// keyed by email. Local order history + scanned-but-unapplied website orders
// work fully offline; a one-tap Stripe pull enriches the list with card buyers
// who may never have been reconciled by hand. Spend is best-effort (kept per
// currency, never mixed) — the Tax Centre remains the source of truth for money.
const CUSTOMER_STRIPE_KEY = 'lm-customer-stripe';
const CUSTOMER_SUPPRESS_KEY = 'lm-customer-suppress';
let _customerFilter = '';
let _customerBookFilter = '';      // bookId to segment by; '' = all books
let _customerSuppress = new Set(); // lowercased emails opted out of mailing
let _customerStripeDepth = 5;      // Stripe pull depth, in pages of 100
let _customerStripeMaybeMore = false;

// Opt-out (suppression) list — Firestore-backed so an unsubscribe on one device
// is honoured everywhere, with a localStorage fallback so it still works offline.
export function _isCustomerSuppressed(email) { return _customerSuppress.has(_custEmailKey(email)); }
async function loadCustomerSuppression() {
  try {
    const stored = await window._fbLoadSettings('customerSuppress');
    if (stored && Array.isArray(stored.emails)) { _customerSuppress = new Set(stored.emails.map(_custEmailKey)); return; }
  } catch (_) { }
  try {
    const local = JSON.parse(localStorage.getItem(CUSTOMER_SUPPRESS_KEY) || '[]');
    if (Array.isArray(local)) _customerSuppress = new Set(local.map(_custEmailKey));
  } catch (_) { }
}
async function _persistCustomerSuppression() {
  const emails = Array.from(_customerSuppress);
  await window._fbSaveSettings('customerSuppress', { emails });
  try { localStorage.setItem(CUSTOMER_SUPPRESS_KEY, JSON.stringify(emails)); } catch (_) { }
}
export async function toggleCustomerSuppress(encEmail) {
  const key = _custEmailKey(decodeURIComponent(encEmail));
  if (!key) return;
  if (_customerSuppress.has(key)) _customerSuppress.delete(key); else _customerSuppress.add(key);
  renderCustomers(); renderOpenCall();
  await _persistCustomerSuppression();
}
function setCustomerBookFilter(v) { _customerBookFilter = v || ''; renderCustomers(); }

// ── Curated mailing list ─────────────────────────────────────────────────────
// A persistent, editable subscriber list (Firestore-backed) layered on top of
// the auto-discovered buyers: add anyone by hand, bulk-add the buyers we found,
// or flip on auto-add so new buyers join by themselves. Copy / Export / Email
// here always act on this curated list, minus anyone who has unsubscribed.
const MAILING_LIST_KEY = 'lm-mailing-list';
let MAILING_LIST = { subs: {}, autoAdd: false };

function mailingSubsArray() {
  // ⚡ Bolt Optimization: Use string comparison instead of localeCompare for sorting ISO "YYYY-MM-DD" dates
  return Object.values(MAILING_LIST.subs || {}).sort((a, b) => {
    const dA = a.added || '';
    const dB = b.added || '';
    return dA > dB ? -1 : (dA < dB ? 1 : 0);
  });
}
export function mailingListHas(email) { return !!MAILING_LIST.subs[_custEmailKey(email)]; }

async function loadMailingList() {
  let data = null;
  data = await window._fbLoadSettings('mailingList');
  if (!data) { try { data = JSON.parse(localStorage.getItem(MAILING_LIST_KEY) || 'null'); } catch (_) { } }
  if (data && typeof data === 'object') {
    MAILING_LIST = { subs: (data.subs && typeof data.subs === 'object') ? data.subs : {}, autoAdd: !!data.autoAdd };
  }
}
async function _persistMailingList() {
  await window._fbSaveSettings('mailingList', MAILING_LIST);
  try { localStorage.setItem(MAILING_LIST_KEY, JSON.stringify(MAILING_LIST)); } catch (_) { }
}

// Upsert one subscriber. Returns true only when a brand-new entry is created.
function _mailingUpsert(email, name, source) {
  const key = _custEmailKey(email);
  if (!key) return false;
  const existing = MAILING_LIST.subs[key];
  if (existing) {
    if (name && name.length > (existing.name || '').length) existing.name = name;
    return false;
  }
  MAILING_LIST.subs[key] = { email: String(email).trim(), name: String(name || '').trim(), source: source || 'Manual', added: today() };
  return true;
}

async function addManualSubscriber() {
  const nameEl = $('ml-add-name'), emailEl = $('ml-add-email');
  const email = (emailEl?.value || '').trim();
  const name = (nameEl?.value || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showToast('Enter a valid email address', 'warn'); return; }
  if (_isCustomerSuppressed(email)) { showToast('That address has unsubscribed — re-subscribe it first', 'warn'); return; }
  const isNew = _mailingUpsert(email, name, 'Manual');
  if (emailEl) emailEl.value = '';
  if (nameEl) nameEl.value = '';
  await _persistMailingList();
  renderMailingList(); renderCustomers(); renderOpenCall();
  showToast(isNew ? '✓ Added to mailing list' : 'Already on the list — name updated');
}

export async function addBuyerToMailingList(encEmail) {
  const email = decodeURIComponent(encEmail);
  if (_isCustomerSuppressed(email)) { showToast('That buyer has unsubscribed', 'warn'); return; }
  const rec = buildCustomerList().find(r => _custEmailKey(r.email) === _custEmailKey(email));
  const isNew = _mailingUpsert(email, rec?.name || '', 'Buyer');
  if (isNew) await _persistMailingList();
  renderMailingList(); renderCustomers(); renderOpenCall();
  showToast(isNew ? '✓ Added to mailing list' : 'Already on your list');
}

async function removeFromMailingList(encEmail) {
  const key = _custEmailKey(decodeURIComponent(encEmail));
  if (!MAILING_LIST.subs[key]) return;
  delete MAILING_LIST.subs[key];
  await _persistMailingList();
  renderMailingList(); renderCustomers(); renderOpenCall();
}

// Merge every non-suppressed discovered buyer into the list. Returns count added.
function _mailingMergeBuyers(list) {
  let added = 0;
  (list || buildCustomerList()).forEach(r => {
    if (_isCustomerSuppressed(r.email)) return;
    if (_mailingUpsert(r.email, r.name, 'Buyer')) added++;
  });
  return added;
}

async function addAllBuyersToMailingList() {
  const added = _mailingMergeBuyers();
  if (added) await _persistMailingList();
  renderMailingList(); renderCustomers(); renderOpenCall();
  showToast(added ? `✓ Added ${added} buyer${added === 1 ? '' : 's'} to your mailing list` : 'All buyers are already on your list');
}

async function toggleMailingAutoAdd(cb) {
  MAILING_LIST.autoAdd = !!(cb && cb.checked);
  let added = 0;
  if (MAILING_LIST.autoAdd) added = _mailingMergeBuyers();
  await _persistMailingList();
  renderMailingList(); renderCustomers(); renderOpenCall();
  showToast(MAILING_LIST.autoAdd
    ? `Auto-add on — new buyers join automatically${added ? ` (added ${added} now)` : ''}`
    : 'Auto-add off');
}

// When auto-add is on, fold any newly discovered buyers in (persist only if changed).
function _mailingAutoSync(list) {
  if (!MAILING_LIST.autoAdd) return;
  if (_mailingMergeBuyers(list) > 0) _persistMailingList();
}

function renderMailingList() {
  const body = $('ml-body');
  if (!body) return;
  const cb = $('ml-autoadd');
  if (cb) cb.checked = !!MAILING_LIST.autoAdd;
  const subs = mailingSubsArray();
  const unsub = subs.filter(s => _isCustomerSuppressed(s.email)).length;
  const countEl = $('ml-count');
  if (countEl) countEl.textContent = `${subs.length} subscriber${subs.length === 1 ? '' : 's'}` + (unsub ? ` · ${unsub} unsubscribed (excluded from sends)` : '');
  body.innerHTML = subs.length
    ? subs.map(s => {
      const sup = _isCustomerSuppressed(s.email);
      const emailCell = sup
        ? `<span style="text-decoration:line-through;color:var(--text4);">${escapeHtml(s.email)}</span> <span class="pill gray" style="font-size:10px;">unsubscribed</span>`
        : `<a href="mailto:${escapeHtml(s.email)}" style="color:var(--gold2);">${escapeHtml(s.email)}</a>`;
      return `<tr${sup ? ' style="opacity:.55;"' : ''}>
          <td>${escapeHtml(s.name) || '<span style="color:var(--text4);">—</span>'}</td>
          <td>${emailCell}</td>
          <td style="font-size:12px;color:var(--text3);">${s.added ? fmtD(s.added) : '—'}</td>
          <td><span class="pill gray" style="font-size:10px;">${escapeHtml(s.source || 'Manual')}</span></td>
          <td><button class="btn sm" onclick="removeFromMailingList('${encodeURIComponent(s.email)}')" title="Remove from mailing list">Remove</button></td>
        </tr>`;
    }).join('')
    : `<tr><td colspan="5"><div class="empty-state" style="padding:1.25rem;">Your mailing list is empty. Add someone by hand above, or click <strong>Add all buyers</strong> to pull in everyone we found below.</div></td></tr>`;
}

// Email / copy helpers shared by the derived segment and the curated list.
function _uniqueMailable(records) {
  return Array.from(new Set(records.filter(r => !_isCustomerSuppressed(r.email)).map(r => r.email)));
}
// Open Gmail's web compose with the addresses pre-filled as BCC. Chunks past a
// safe URL length so a big list opens what it can and copies the rest.
function _openGmailBcc(emails, label) {
  if (!emails.length) { showToast(`No mailable addresses${label ? ' (' + label + ')' : ''}`, 'warn'); return; }
  const BUDGET = 1600;
  const chunks = []; let cur = [];
  emails.forEach(e => {
    if (cur.length && encodeURIComponent([...cur, e].join(',')).length > BUDGET) { chunks.push(cur); cur = []; }
    cur.push(e);
  });
  if (cur.length) chunks.push(cur);
  window.open('https://mail.google.com/mail/?view=cm&fs=1&bcc=' + encodeURIComponent(chunks[0].join(',')), '_blank', 'noopener');
  if (chunks.length > 1) {
    _custFallbackCopy(emails.join(', '));
    showToast(`Opened Gmail with ${chunks[0].length} of ${emails.length}. Full list copied — send in batches (Gmail caps recipients per email).`, 'warn');
  } else {
    showToast(`Opened Gmail · ${emails.length} recipient${emails.length === 1 ? '' : 's'} in BCC`);
  }
}
function emailCustomerSegment() { _openGmailBcc(_uniqueMailable(_custApplyFilter(buildCustomerList())), 'current segment'); }
function emailMailingList() { _openGmailBcc(_uniqueMailable(mailingSubsArray()), 'mailing list'); }
function copyMailingListEmails() {
  const emails = _uniqueMailable(mailingSubsArray());
  if (!emails.length) { showToast('No mailable emails on your list', 'warn'); return; }
  const done = () => showToast(`✓ Copied ${emails.length} email${emails.length === 1 ? '' : 's'}`);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(emails.join(', ')).then(done).catch(() => { _custFallbackCopy(emails.join(', ')); done(); });
  else { _custFallbackCopy(emails.join(', ')); done(); }
}
function exportMailingListCSV() {
  const subs = mailingSubsArray().filter(s => !_isCustomerSuppressed(s.email));
  if (!subs.length) { showToast('No mailable subscribers to export', 'warn'); return; }
  const rows = [['Name', 'Email', 'Source', 'Added']];
  subs.forEach(s => rows.push([s.name || '', s.email, s.source || '', s.added || '']));
  downloadCsv(toCsv(rows), `lyrical-mailing-list-${today()}.csv`);
  showToast(`✓ Exported ${subs.length} subscriber${subs.length === 1 ? '' : 's'}`);
}

function _loadCustomerStripeCache() {
  try { return JSON.parse(localStorage.getItem(CUSTOMER_STRIPE_KEY) || '[]'); }
  catch (_) { return []; }
}
function _saveCustomerStripeCache(rows) {
  try { localStorage.setItem(CUSTOMER_STRIPE_KEY, JSON.stringify(rows || [])); } catch (_) { }
}

// Stable dedup key for a buyer — lowercased, trimmed email.
function _custEmailKey(email) { return String(email || '').trim().toLowerCase(); }

function _custUpsert(map, email, name) {
  const key = _custEmailKey(email);
  if (!key) return null;
  let rec = map.get(key);
  if (!rec) {
    rec = {
      email: String(email).trim(), name: '', orders: 0, units: 0,
      books: new Set(), bookIds: new Set(), channels: new Set(), sources: new Set(),
      spend: {}, first: '', last: ''
    };
    map.set(key, rec);
  }
  const nm = String(name || '').trim();
  if (nm && nm.length > rec.name.length) rec.name = nm; // keep the fullest name seen
  return rec;
}
function _custAddSpend(rec, cur, amt) {
  const c = normalizeCurrencyCode(cur || '', '') || String(cur || '').toUpperCase();
  const n = Number(amt);
  if (!c || !isFinite(n) || n === 0) return;
  rec.spend[c] = (rec.spend[c] || 0) + n;
}
function _custTouchDate(rec, date) {
  const d = String(date || '').slice(0, 10);
  if (!d) return;
  if (!rec.first || d < rec.first) rec.first = d;
  if (!rec.last || d > rec.last) rec.last = d;
}

// Build the de-duplicated buyer list from every available source.
function buildCustomerList() {
  const map = new Map();
  let noEmail = 0;

  // 1) Order history across every book (authoritative, works offline).
  Object.keys(states).forEach(bid => {
    const bk = BOOKS[bid];
    const bookCur = bk ? normalizeCurrencyCode(getBookCurrencyCode(bk), 'CAD') : 'CAD';
    const bookTitle = bk?.title || bid;
    (states[bid].hist || []).forEach(h => {
      if (h.voided || h.gratuity || h.chan === 'Gratuity') return;
      const email = h.shipEmail || h.email || '';
      if (!_custEmailKey(email)) { noEmail++; return; }
      const rec = _custUpsert(map, email, h.shipName || h.customer || '');
      rec.orders++;
      rec.units += Number(h.qty) || 0;
      rec.books.add(bookTitle);
      rec.bookIds.add(bid);
      if (h.chan) rec.channels.add(h.chan);
      const isStripe = typeof h.sheetsId === 'string' && h.sheetsId.startsWith('stripe-');
      rec.sources.add(isStripe ? 'Stripe' : (h.chan === 'Website' ? 'Website' : (h.chan || 'Order')));
      const payCur = h.payment?.currency ? normalizeCurrencyCode(h.payment.currency, bookCur) : bookCur;
      const payAmt = h.payment?.amount != null ? h.payment.amount : (Number(h.qty) || 0) * (Number(h.price) || 0);
      _custAddSpend(rec, payCur, payAmt);
      _custTouchDate(rec, h.date);
    });
  });

  // 2) Scanned website orders not yet applied — still real buyers. Skip any
  //    whose order number is already in history to avoid double-counting.
  const applied = (typeof getAllAppliedIds === 'function') ? getAllAppliedIds() : new Set();
  (typeof orders !== 'undefined' ? orders : []).forEach(o => {
    if (!_custEmailKey(o.email)) return;
    if (applied.has(o.orderNum) || applied.has(o.id)) return;
    const rec = _custUpsert(map, o.email, o.customer || o.shipName || '');
    rec.orders++;
    rec.units += Number(o.qty) || 0;
    const bk = o.bookId && BOOKS[o.bookId] ? BOOKS[o.bookId] : null;
    if (bk) {
      rec.books.add(bk.title);
      rec.bookIds.add(o.bookId);
      _custAddSpend(rec, normalizeCurrencyCode(getBookCurrencyCode(bk), 'CAD'), (Number(o.qty) || 0) * (Number(o.price) || bk.listPrice || 0));
    }
    rec.channels.add('Website');
    rec.sources.add('Website');
    _custTouchDate(rec, o.date);
  });

  // 3) Stripe pull cache — discover/enrich card buyers. Only add counts + spend
  //    for buyers we don't already know locally, so payments already reconciled
  //    into history aren't double-counted.
  _loadCustomerStripeCache().forEach(p => {
    if (p.refunded || !_custEmailKey(p.email)) return;
    const existed = map.has(_custEmailKey(p.email));
    const rec = _custUpsert(map, p.email, p.customer || '');
    rec.sources.add('Stripe');
    _custTouchDate(rec, p.date);
    if (!existed) {
      rec.orders++;
      _custAddSpend(rec, p.currency, p.amount);
    }
  });

  const list = Array.from(map.values());
  // ⚡ Bolt Optimization: Use string comparison instead of localeCompare for sorting ISO "YYYY-MM-DD" dates
  list.sort((a, b) => {
    const dA = a.last || '';
    const dB = b.last || '';
    return dA > dB ? -1 : (dA < dB ? 1 : 0);
  }); // most recent first
  list._noEmail = noEmail;
  return list;
}

function _custSpendStr(spend) {
  return Object.keys(spend).sort().map(c => {
    const sym = (typeof codeToSymbol === 'function' ? codeToSymbol(c) : '') || (c + ' ');
    return `${sym}${spend[c].toFixed(2)}`;
  }).join(' · ');
}

function _custApplyFilter(list) {
  let out = list;
  if (_customerBookFilter) out = out.filter(r => r.bookIds.has(_customerBookFilter));
  if (_customerChannelFilter) {
    out = out.filter(r => {
      if (_customerChannelFilter === 'Stripe') return r.sources.has('Stripe');
      return r.channels.has(_customerChannelFilter);
    });
  }
  if (_customerSpendFilter) {
    const min = Number(_customerSpendFilter);
    out = out.filter(r => {
      let sum = 0;
      Object.keys(r.spend || {}).forEach(c => {
        const amt = r.spend[c] || 0;
        if (c === 'USD') sum += amt * 1.35;
        else if (c === 'EUR') sum += amt * 1.48;
        else if (c === 'GBP') sum += amt * 1.75;
        else sum += amt;
      });
      return sum >= min;
    });
  }
  if (_customerOrdersFilter === 'repeat') {
    out = out.filter(r => r.orders >= 2);
  } else if (_customerOrdersFilter === 'single') {
    out = out.filter(r => r.orders === 1);
  }
  const q = _customerFilter.trim().toLowerCase();
  if (q) out = out.filter(r => (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q));
  return out;
}

// The mailing-safe slice: what's on screen, minus anyone who has opted out.
function _custMailable(all) {
  return _custApplyFilter(all).filter(r => !_isCustomerSuppressed(r.email));
}

function _custSyncBookFilterOptions() {
  const sel = $('cust-book-filter');
  if (!sel) return;
  const want = '<option value="">All books</option>' +
    BOOK_LIST.map(b => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.title)}</option>`).join('');
  if (sel.dataset.sig !== want) { sel.innerHTML = want; sel.dataset.sig = want; }
  sel.value = _customerBookFilter;
}

// ── Advanced Customer Filters state and setters
let _customerChannelFilter = '';
let _customerSpendFilter = '';
let _customerOrdersFilter = '';

function setCustomerChannelFilter(v) { _customerChannelFilter = v || ''; renderCustomers(); }
function setCustomerSpendFilter(v) { _customerSpendFilter = v || ''; renderCustomers(); }
function setCustomerOrdersFilter(v) { _customerOrdersFilter = v || ''; renderCustomers(); }

// ── Email Typo Correction
let _lastMailingCorrection = '';

function checkMailingEmailTypo(val) {
  const suggestEl = $('ml-add-email-correction');
  if (!suggestEl) return;
  const correction = suggestEmailTypo(val);
  if (correction) {
    _lastMailingCorrection = correction;
    suggestEl.style.display = 'inline-block';
    suggestEl.className = 'email-suggest-correction';
    suggestEl.innerHTML = `Did you mean <strong style="text-decoration:underline;">${escapeHtml(correction)}</strong>?`;
  } else {
    _lastMailingCorrection = '';
    suggestEl.style.display = 'none';
  }
}

export function suggestEmailTypo(email) {
  const m = email.trim().toLowerCase().match(/^([^@]+)@([^@]+)$/);
  if (!m) return null;
  const user = m[1];
  const domain = m[2];
  const common = {
    'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com',
    'yahoo.co': 'yahoo.com', 'yahoo.cm': 'yahoo.com',
    'hotmail.co': 'hotmail.com', 'hotmail.cm': 'hotmail.com',
    'outlook.co': 'outlook.com', 'outlook.cm': 'outlook.com'
  };
  if (common[domain]) return user + '@' + common[domain];
  return null;
}

function applyMailingEmailCorrection() {
  const emailEl = $('ml-add-email');
  if (emailEl && _lastMailingCorrection) {
    emailEl.value = _lastMailingCorrection;
    _lastMailingCorrection = '';
    const suggestEl = $('ml-add-email-correction');
    if (suggestEl) suggestEl.style.display = 'none';
    showToast('Email corrected!');
  }
}




// ── In-App Email Campaigns (Newsletters)
const CAMPAIGNS_KEY = 'lm-campaigns';
let CAMPAIGNS = [];
let activeCustomersSubTab = 'audience';

async function loadCampaigns() {
  let data = null;
  data = await window._fbLoadSettings('campaigns');
  if (!data) { try { data = JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) || '[]'); } catch (_) { } }
  if (Array.isArray(data)) {
    CAMPAIGNS = data;
  } else {
    CAMPAIGNS = [];
  }
}

async function _persistCampaigns() {
  await window._fbSaveSettings('campaigns', CAMPAIGNS);
  try { localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(CAMPAIGNS)); } catch (_) { }
}

// ── Decoupled Open Call Portal




// Project Actions




export function parseMarkdownToHtml(text) {
  let html = escapeHtml(text);

  // Restore safe HTML tags that might have been escaped
  // 1. Restore <mark style="..."> and </mark>
  html = html.replace(/&lt;mark style=&quot;(.*?)&quot;&gt;/gi, '<mark style="$1">');
  html = html.replace(/&lt;mark&gt;/gi, '<mark>');
  html = html.replace(/&lt;\/mark&gt;/gi, '</mark>');

  // 2. Restore <span style="..."> and </span>
  html = html.replace(/&lt;span style=&quot;(.*?)&quot;&gt;/gi, '<span style="$1">');
  html = html.replace(/&lt;span&gt;/gi, '<span>');
  html = html.replace(/&lt;\/span&gt;/gi, '</span>');

  // 3. Restore other basic tags if they typed them
  html = html.replace(/&lt;strong&gt;/gi, '<strong>').replace(/&lt;\/strong&gt;/gi, '</strong>');
  html = html.replace(/&lt;em&gt;/gi, '<em>').replace(/&lt;\/em&gt;/gi, '</em>');
  html = html.replace(/&lt;br&gt;/gi, '<br>');

  // bold **text** or __text__
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  // italic *text* or _text_
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  // links [label](url)
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color:var(--gold2);text-decoration:underline;">$1</a>');
  // line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

export function insertFormattingTag(tag) {
  const editor = $('oc-tmpl-body');
  if (!editor) return;

  editor.focus();

  const selection = window.getSelection();
  let range;
  if (selection.rangeCount > 0) {
    range = selection.getRangeAt(0);
  } else {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }

  const selectedText = selection.toString();

  if (tag === 'bold') {
    document.execCommand('bold', false, null);
  } else if (tag === 'italic') {
    document.execCommand('italic', false, null);
  } else if (tag === 'underline') {
    document.execCommand('underline', false, null);
  } else if (tag === 'link') {
    const url = prompt('Enter URL:', 'https://');
    if (!url) return;
    document.execCommand('createLink', false, url);
  } else if (tag === 'clear') {
    document.execCommand('removeFormat', false, null);
  } else if (tag === 'highlight') {
    const mark = document.createElement('mark');
    mark.style.backgroundColor = '#fef08a';
    mark.style.color = '#000000';
    mark.style.padding = '2px 4px';
    mark.style.borderRadius = '4px';
    mark.textContent = selectedText || 'highlighted text';
    range.deleteContents();
    range.insertNode(mark);
    range.setStartAfter(mark);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } else if (tag === 'color') {
    const span = document.createElement('span');
    span.style.color = '#c5a880';
    span.textContent = selectedText || 'colored text';
    range.deleteContents();
    range.insertNode(span);
    range.setStartAfter(span);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    const badge = document.createElement('span');
    badge.className = 'oc-token-badge';
    badge.setAttribute('contenteditable', 'false');
    badge.setAttribute('data-token', tag);
    badge.textContent = `{{${tag}}}`;

    range.deleteContents();
    range.insertNode(badge);
    range.setStartAfter(badge);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  ocUpdateTmplPreview();
}

export function serializeEditorHtml(html) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const badges = tempDiv.querySelectorAll('.oc-token-badge');
  badges.forEach(badge => {
    const token = badge.getAttribute('data-token');
    badge.replaceWith(`{{${token}}}`);
  });
  return tempDiv.innerHTML;
}

export function deserializeHtmlToEditor(html) {
  let res = html;
  const tokens = ['name', 'photo', 'creditName', 'project', 'date'];
  tokens.forEach(t => {
    const regex = new RegExp(`\\{\\{${t}\\}\\}`, 'g');
    res = res.replace(regex, `<span class="oc-token-badge" contenteditable="false" data-token="${t}">{{${t}}}</span>`);
  });
  return res;
}




// Apply a parsed file import: preview what's about to happen (count, dupes,
// first few names) → confirm → add. Routes through the same parser and
// newContributor() the paste path uses, so file uploads get identical
// behavior: all 5 columns honored, stage flags initialized, photos split.







// Preset Compose Actions






// ── Open Call: import submissions from Gmail (intake) ─────────────────────
// Finds the artists' original "here are my photos" emails and turns each into a
// contributor — name, email, photo filenames, and the submission thread id, so
// every later stage email replies into that same thread.


















export function switchCustomersSubTab(subTabName) {
  activeCustomersSubTab = subTabName;
  const subTabs = ['audience', 'mailing', 'campaign'];
  subTabs.forEach(tab => {
    const btn = document.getElementById('btn-custtab-' + tab);
    const sec = document.getElementById('cust-sec-' + tab);
    if (btn && sec) {
      if (tab === subTabName) {
        btn.classList.add('active');
        sec.style.display = 'block';
      } else {
        btn.classList.remove('active');
        sec.style.display = 'none';
      }
    }
  });

  if (subTabName === 'audience') {
    renderCustomersAudience();
  } else if (subTabName === 'mailing') {
    renderMailingList();
  } else if (subTabName === 'campaign') {
    renderCampaigns();
  }
}

function renderCustomers() {
  switchCustomersSubTab(activeCustomersSubTab);
}

function renderCustomersAudience() {
  const body = $('cust-body');
  if (!body) return;
  _custSyncBookFilterOptions();

  const chanSel = $('cust-channel-filter');
  if (chanSel) chanSel.value = _customerChannelFilter;
  const spendSel = $('cust-spend-filter');
  if (spendSel) spendSel.value = _customerSpendFilter;
  const ordersSel = $('cust-orders-filter');
  if (ordersSel) ordersSel.value = _customerOrdersFilter;

  const all = buildCustomerList();
  renderCustomersStat(all);
  _mailingAutoSync(all);
  const list = _custApplyFilter(all);
  const suppressedShown = list.filter(r => _isCustomerSuppressed(r.email)).length;

  const summary = $('cust-summary');
  if (summary) {
    const srcSet = new Set();
    all.forEach(r => r.sources.forEach(s => srcSet.add(s)));
    const srcStr = Array.from(srcSet).sort().join(', ') || '—';
    const filtered = _customerFilter.trim() || _customerBookFilter || _customerChannelFilter || _customerSpendFilter || _customerOrdersFilter;
    summary.textContent = `${all.length} customer${all.length === 1 ? '' : 's'} with email`
      + (filtered ? ` · ${list.length} shown` : '')
      + (suppressedShown ? ` · ${suppressedShown} unsubscribed (excluded from export)` : '')
      + (all._noEmail ? ` · ${all._noEmail} order${all._noEmail === 1 ? '' : 's'} had no email` : '')
      + ` · from ${srcStr}`;
  }

  body.innerHTML = list.length
    ? list.map(r => {
      const sup = _isCustomerSuppressed(r.email);
      const emailCell = sup
        ? `<span style="text-decoration:line-through;color:var(--text4);">${escapeHtml(r.email)}</span> <span class="pill gray" style="font-size:10px;">unsubscribed</span>`
        : `<a href="mailto:${escapeHtml(r.email)}" style="color:var(--gold2);">${escapeHtml(r.email)}</a>`;
      const onList = mailingListHas(r.email);
      const listBtn = sup
        ? ''
        : (onList
          ? `<button class="btn sm" disabled title="Already on your mailing list" style="opacity:.55;">✓ On list</button>`
          : `<button class="btn sm gold" onclick="addBuyerToMailingList('${encodeURIComponent(r.email)}')" title="Add to your mailing list">＋ List</button>`);
      const supBtn = `<button class="btn sm" onclick="toggleCustomerSuppress('${encodeURIComponent(r.email)}')" title="${sup ? 'Allow emailing this buyer again' : 'Exclude from Copy emails & CSV export'}">${sup ? 'Re-subscribe' : 'Unsubscribe'}</button>`;
      return `<tr${sup ? ' style="opacity:.55;"' : ''}>
        <td>${escapeHtml(r.name) || '<span style="color:var(--text4);">—</span>'}</td>
        <td>${emailCell}</td>
        <td class="r">${r.orders}</td>
        <td class="r">${r.units || '—'}</td>
        <td style="font-size:12px;color:var(--text3);">${escapeHtml(Array.from(r.books).join(', ')) || '—'}</td>
        <td style="font-size:12px;color:var(--text3);">${_custSpendStr(r.spend) || '—'}</td>
        <td style="font-size:12px;color:var(--text3);">${r.last ? fmtD(r.last) : '—'}</td>
        <td>${Array.from(r.sources).map(s => `<span class="pill gray" style="font-size:10px;">${escapeHtml(s)}</span>`).join(' ')}</td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap;">${listBtn}${supBtn}</div></td>
      </tr>`;
    }).join('')
    : `<tr><td colspan="9"><div class="empty-state" style="padding:1.5rem;">${(_customerFilter.trim() || _customerBookFilter || _customerChannelFilter || _customerSpendFilter || _customerOrdersFilter) ? 'No customers match this filter.' : 'No customers found yet. Apply some website orders, log in-person sales with an email, or pull buyers from Stripe.'}</div></td></tr>`;
}

export function openCampaignWizard(presets = null) {
  if (presets) {
    $('c-draft-id').value = presets.draftId || '';
    $('c-subject').value = presets.subject || '';
    if (presets.email) {
      const segmentSel = $('c-segment');
      if (segmentSel) {
        const prevTemp = segmentSel.querySelector('option[data-temp="true"]');
        if (prevTemp) prevTemp.remove();

        const tempOpt = document.createElement('option');
        tempOpt.value = 'single-target:' + presets.email;
        tempOpt.textContent = `Single Recipient (${presets.email})`;
        tempOpt.setAttribute('data-temp', 'true');
        segmentSel.appendChild(tempOpt);
        segmentSel.value = tempOpt.value;
      }
    } else {
      $('c-segment').value = presets.segment || 'all-curated';
    }
    $('c-replyto').value = presets.replyTo || 'lyricalmyricalbooks@gmail.com';
    $('c-body').value = presets.body || '';
    $('campaign-wizard-title').textContent = presets.title || 'Create New Email Campaign';
  } else {
    $('c-draft-id').value = '';
    $('c-subject').value = '';
    const segmentSel = $('c-segment');
    if (segmentSel) {
      const prevTemp = segmentSel.querySelector('option[data-temp="true"]');
      if (prevTemp) prevTemp.remove();
      segmentSel.value = 'all-curated';
    }
    $('c-replyto').value = 'lyricalmyricalbooks@gmail.com';
    $('c-body').value = '';
    $('campaign-wizard-title').textContent = 'Create New Email Campaign';
  }
  $('campaign-wizard-card').style.display = 'block';
  updateCampaignPreview();
  updateCampaignModeStatus();
  window.scrollTo({ top: $('campaign-wizard-card').offsetTop - 20, behavior: 'smooth' });
}

function closeCampaignWizard() {
  $('campaign-wizard-card').style.display = 'none';
}

function updateCampaignModeStatus() {
  const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const forceMock = $('c-force-mock')?.checked;
  const dot = $('c-mode-indicator-dot');
  const text = $('c-mode-indicator-text');
  const row = document.querySelector('.campaign-mode-row');

  if (!dot || !text) return;

  if (forceMock) {
    dot.style.backgroundColor = 'var(--amber)';
    text.innerHTML = 'Simulation Mode: Emails will be simulated and logged locally';
    if (row) {
      row.style.background = 'var(--amber-bg)';
      row.style.borderColor = 'rgba(122,85,0,0.2)';
    }
  } else if (isDev && !sheetsUrl) {
    dot.style.backgroundColor = 'var(--amber)';
    text.innerHTML = 'Mock Mode: No Google Sheet connected. Emails will be logged locally';
    if (row) {
      row.style.background = 'var(--amber-bg)';
      row.style.borderColor = 'rgba(122,85,0,0.2)';
    }
  } else if (!sheetsUrl) {
    dot.style.backgroundColor = 'var(--red)';
    text.innerHTML = 'Warning: No Google Sheet connected. Sending will fail';
    if (row) {
      row.style.background = 'var(--red-bg)';
      row.style.borderColor = 'rgba(149,32,32,0.2)';
    }
  } else {
    dot.style.backgroundColor = 'var(--green)';
    text.innerHTML = `Live Mode: Emails will send via connected Google Sheet (${new URL(sheetsUrl).hostname})`;
    if (row) {
      row.style.background = 'var(--green-bg)';
      row.style.borderColor = 'rgba(42,99,72,0.2)';
    }
  }
}

function onForceMockChange() {
  updateCampaignModeStatus();
}

function insertTemplateTag(tag) {
  const textarea = $('c-body');
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  textarea.value = text.substring(0, start) + tag + text.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + tag.length;
  updateCampaignPreview();
}

function updateCampaignPreview() {
  const subject = $('c-subject').value || '(No Subject)';
  const bodyVal = $('c-body').value || '';
  const previewPane = $('c-preview-pane');
  if (!previewPane) return;

  const formattedBody = bodyVal
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
    .replace(/\{\{name\}\}/g, '<strong>John Doe</strong>')
    .replace(/\{\{email\}\}/g, '<strong>john.doe@example.com</strong>');

  previewPane.innerHTML = `
    <div style="font-family: 'Outfit', 'Plus Jakarta Sans', 'Inter', sans-serif; background: #faf9f6; padding: 20px; border-radius: 8px;">
      <div style="background: white; border: 1px solid var(--border); border-radius: 8px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
        <div style="font-size: 13px; color: #888; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 16px;">
          <strong>Subject:</strong> ${escapeHtml(subject)}
        </div>
        <div style="font-size: 15px; color: #333; line-height: 1.6; min-height: 150px; white-space: pre-line;">
          ${formattedBody}
        </div>
        <div style="font-size: 11px; color: #999; border-top: 1px dashed #eee; margin-top: 24px; padding-top: 12px; line-height: 1.4;">
          You are receiving this email because you are a valued customer of Lyricalmyrical Books.<br>
          <a href="#" style="color: var(--gold2); text-decoration: underline;">Unsubscribe</a> from this list.
        </div>
      </div>
    </div>
  `;
}

function onCampaignSegmentChange() {
  // Option to trigger recount of matching subscribers
}

function getSegmentRecipients(segmentName) {
  const allDiscovered = buildCustomerList();
  const curated = mailingSubsArray().filter(s => !_isCustomerSuppressed(s.email));

  if (segmentName.startsWith('single-target:')) {
    const email = segmentName.split(':')[1];
    const existing = curated.find(s => s.email === email) || allDiscovered.find(c => c.email === email);
    return [{ name: existing?.name || '', email: email }];
  }

  if (segmentName === 'all-curated') {
    return curated;
  }
  if (segmentName === 'repeat') {
    return allDiscovered.filter(r => r.orders >= 2 && !_isCustomerSuppressed(r.email));
  }
  if (segmentName === 'high-spend') {
    return allDiscovered.filter(r => {
      let sum = 0;
      Object.keys(r.spend || {}).forEach(c => {
        const amt = r.spend[c] || 0;
        if (c === 'USD') sum += amt * 1.35;
        else if (c === 'EUR') sum += amt * 1.48;
        else if (c === 'GBP') sum += amt * 1.75;
        else sum += amt;
      });
      return sum >= 50 && !_isCustomerSuppressed(r.email);
    });
  }
  if (segmentName === 'all-discovered') {
    return allDiscovered.filter(r => !_isCustomerSuppressed(r.email));
  }
  return [];
}

async function saveCampaignDraft() {
  const subject = $('c-subject').value.trim();
  const body = $('c-body').value.trim();
  const segment = $('c-segment').value;
  const replyTo = $('c-replyto').value.trim();
  const id = $('c-draft-id').value || 'c-' + Date.now();

  if (!subject) { showToast('Subject line is required to save draft', 'warn'); return; }

  const idx = CAMPAIGNS.findIndex(c => c.id === id);
  const camp = {
    id,
    subject,
    body,
    segment,
    replyTo,
    status: 'draft',
    createdAt: today(),
    stats: null
  };

  if (idx >= 0) {
    CAMPAIGNS[idx] = camp;
  } else {
    CAMPAIGNS.unshift(camp);
  }

  await _persistCampaigns();
  renderCampaigns();
  closeCampaignWizard();
  showToast('✓ Campaign draft saved');
}

async function editCampaignDraft(id) {
  const camp = CAMPAIGNS.find(c => c.id === id);
  if (!camp) return;

  $('c-draft-id').value = camp.id;
  $('c-subject').value = camp.subject;
  $('c-segment').value = camp.segment;
  $('c-replyto').value = camp.replyTo || 'lyricalmyricalbooks@gmail.com';
  $('c-body').value = camp.body;

  $('campaign-wizard-title').textContent = 'Edit Campaign Draft';
  $('campaign-wizard-card').style.display = 'block';
  updateCampaignPreview();
  window.scrollTo({ top: $('campaign-wizard-card').offsetTop - 20, behavior: 'smooth' });
}

async function deleteCampaign(id) {
  const ok = await confirmDialog('Are you sure you want to delete this campaign?', { danger: true });
  if (!ok) return;

  CAMPAIGNS = CAMPAIGNS.filter(c => c.id !== id);
  await _persistCampaigns();
  renderCampaigns();
  showToast('Campaign deleted');
}

export async function sendSingleEmailViaBackend(to, subject, body, replyTo, htmlBody = null, threadId = null, captureThread = false) {
  const useResend = localStorage.getItem('lm-oc-use-resend') === 'true';
  const resendKey = localStorage.getItem('lm-resend-api-key') || '';
  const resendFrom = localStorage.getItem('lm-resend-from') || '';

  // Configured "send as" identity (a verified Gmail alias + display name) for
  // valid SPF/DKIM on a custom domain. Applied server-side only when the alias
  // is actually verified, so an empty/stale value is harmless.
  const fromAlias = localStorage.getItem('lm-oc-fromalias') || '';
  const fromName = localStorage.getItem('lm-oc-fromname') || '';

  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  // Replying into — or capturing — a Gmail thread only works through the Apps
  // Script Gmail webhook; a transactional provider (Resend) can't touch the
  // owner's Gmail threads. So when threading is involved, never route via Resend.
  const needsGmailThread = !!threadId || captureThread;
  const canUseLocalBackend = isLocal && (useResend || !sheetsUrl);
  const baseUrl = canUseLocalBackend ? 'http://localhost:8787' : '';

  let finalHtmlBody = htmlBody;
  let finalPlainBody = body;

  if (body.includes('<') && !htmlBody) {
    finalHtmlBody = body;
    finalPlainBody = body.replace(/<[^>]*>/g, '');
  } else if (!finalHtmlBody) {
    finalHtmlBody = parseMarkdownToHtml(body);
  }

  if (useResend && resendKey && resendFrom && !isLocal) {
    console.warn('Browser-stored Resend keys can only be used with the local backend. Falling back to the connected Google Apps Script sender.');
  }

  if (useResend && resendKey && resendFrom && isLocal && !needsGmailThread) {
    const res = await fetch(baseUrl + '/api/campaign/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (localStorage.getItem('lm-auth-token') || ''),
        'X-Resend-Api-Key': resendKey,
        'X-Resend-From': resendFrom
      },
      body: JSON.stringify({ to, subject, body: finalPlainBody, htmlBody: finalHtmlBody, replyTo, simulated: false, threadId })
    });
    if (!res.ok) {
      const errText = await res.text();
      let errMsg = 'Send failed';
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error || errMsg;
      } catch (_) {
        errMsg = errText || errMsg;
      }
      throw new Error(errMsg);
    }
    return await res.json();
  }

  const forceMock = $('c-force-mock')?.checked;
  if (forceMock || (canUseLocalBackend && !sheetsUrl)) {
    const res = await fetch(baseUrl + '/api/campaign/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (localStorage.getItem('lm-auth-token') || '')
      },
      body: JSON.stringify({ to, subject, body: finalPlainBody, htmlBody: finalHtmlBody, replyTo, simulated: true, threadId, captureThread })
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } else {
    if (!sheetsUrl) throw new Error('Google Sheets/Webhook not connected. Please connect your sheet first.');
    const payload = {
      version: 2,
      action: 'sendcampaignemail',
      payload: { to, subject, body: finalPlainBody, htmlBody: finalHtmlBody, replyTo, threadId, captureThread, fromAlias, fromName }
    };
    const res = await fetch(sheetsUrl, {
      method: 'POST',
      mode: 'cors',
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Sheets connection failed');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }
}

async function sendTestEmailCampaign() {
  const subject = $('c-subject').value.trim();
  const body = $('c-body').value.trim();
  const replyTo = $('c-replyto').value.trim();
  const testEmail = $('c-test-email').value.trim();

  if (!subject) { showToast('Subject line is required', 'warn'); return; }
  if (!testEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testEmail)) { showToast('Enter a valid test email address', 'warn'); return; }

  showToast('Sending test email...');
  try {
    const personalizedBody = body
      .replace(/\{\{name\}\}/g, 'Test Recipient')
      .replace(/\{\{email\}\}/g, testEmail);

    await sendSingleEmailViaBackend(testEmail, '[TEST] ' + subject, personalizedBody, replyTo);
    showToast('✓ Test email sent successfully!');
  } catch (e) {
    showToast('Send failed: ' + e.message, 'err');
  }
}

let _campaignSendingActive = false;
let _campaignSendingIndex = 0;
let _campaignSendingRecipients = [];
let _campaignSuccessCount = 0;
let _campaignFailCount = 0;

function cancelCampaignSending() {
  _campaignSendingActive = false;
  $('c-send-log-console').innerHTML += '<div style="color:var(--red);">[CANCELLED] Sending process aborted by user.</div>';
  $('c-send-cancel-btn').disabled = true;
}

async function sendCampaignLaunch() {
  const subject = $('c-subject').value.trim();
  const body = $('c-body').value.trim();
  const segment = $('c-segment').value;
  const replyTo = $('c-replyto').value.trim();
  const draftId = $('c-draft-id').value;

  if (!subject) { showToast('Subject line is required', 'warn'); return; }

  const recs = getSegmentRecipients(segment);
  if (!recs.length) { showToast('Selected segment has no recipients', 'warn'); return; }

  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const invalidRecs = recs.filter(r => !r.email || !emailRegex.test(r.email.trim()));

  if (invalidRecs.length > 0) {
    const invalidList = invalidRecs.map(r => `${r.name || 'Unnamed'} (${r.email || 'no email'})`).join(', ');
    const proceed = await confirmDialog(
      `Warning: ${invalidRecs.length} recipient(s) have invalid email addresses and will fail:\n\n${invalidList.substring(0, 300)}${invalidList.length > 300 ? '...' : ''}\n\nDo you want to proceed anyway?`,
      { danger: true }
    );
    if (!proceed) return;
  }

  const ok = await confirmDialog(`Are you sure you want to send this campaign to ${recs.length} recipient(s)?`);
  if (!ok) return;

  $('c-send-overlay').classList.add('active');
  $('c-send-progress-fill').style.width = '0%';
  $('c-send-progress-text').textContent = `Sending 0 of ${recs.length} emails...`;
  $('c-send-log-console').innerHTML = `<div>[START] Launching campaign to ${recs.length} recipients.</div>`;
  $('c-send-cancel-btn').disabled = false;

  _campaignSendingActive = true;
  _campaignSendingIndex = 0;
  _campaignSendingRecipients = recs;
  _campaignSuccessCount = 0;
  _campaignFailCount = 0;

  closeCampaignWizard();

  setTimeout(() => sendNextCampaignEmail(subject, body, replyTo, draftId), 100);
}

async function sendNextCampaignEmail(subject, body, replyTo, draftId) {
  if (!_campaignSendingActive) {
    finishCampaignSend(subject, body, replyTo, draftId, true);
    return;
  }

  if (_campaignSendingIndex >= _campaignSendingRecipients.length) {
    finishCampaignSend(subject, body, replyTo, draftId, false);
    return;
  }

  const rec = _campaignSendingRecipients[_campaignSendingIndex];
  const to = rec.email;
  const name = rec.name || 'Customer';

  $('c-send-progress-text').textContent = `Sending ${_campaignSendingIndex + 1} of ${_campaignSendingRecipients.length} emails...`;
  const pct = Math.round((_campaignSendingIndex / _campaignSendingRecipients.length) * 100);
  $('c-send-progress-fill').style.width = pct + '%';

  try {
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!to || !emailRegex.test(to.trim())) {
      throw new Error('Invalid email address format');
    }
    const personalizedBody = body
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{email\}\}/g, to);

    await sendSingleEmailViaBackend(to, subject, personalizedBody, replyTo);
    _campaignSuccessCount++;
    $('c-send-log-console').innerHTML += `<div style="color:#a9ffaf;">✓ Sent to ${escapeHtml(to)} (${escapeHtml(name)})</div>`;
  } catch (e) {
    _campaignFailCount++;
    $('c-send-log-console').innerHTML += `<div style="color:#f87171;" class="campaign-log-fail" data-index="${_campaignSendingIndex}">✕ Failed for ${escapeHtml(to)}: ${escapeHtml(e.message)} <button class="btn sm" onclick="retryCampaignEmail(${_campaignSendingIndex})" style="padding:2px 6px;font-size:10px;margin-left:8px;line-height:1.2;height:auto;width:auto;display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:white;cursor:pointer;">Retry</button></div>`;
  }

  const consoleEl = $('c-send-log-console');
  if (consoleEl) consoleEl.scrollTop = consoleEl.scrollHeight;

  _campaignSendingIndex++;
  setTimeout(() => sendNextCampaignEmail(subject, body, replyTo, draftId), 150);
}

async function finishCampaignSend(subject, body, replyTo, draftId, wasAborted) {
  _campaignSendingActive = false;
  $('c-send-progress-fill').style.width = '100%';
  $('c-send-progress-text').textContent = wasAborted ? 'Sending Aborted' : 'Campaign Completed!';

  $('c-send-log-console').innerHTML += `
    <div style="font-weight:bold;margin-top:8px;" id="c-send-finished-summary">[FINISHED] Success: ${_campaignSuccessCount} · Failed: ${_campaignFailCount}</div>
  `;

  const btn = $('c-send-cancel-btn');
  btn.textContent = '✕ Close Window';
  btn.disabled = false;
  btn.onclick = () => {
    $('c-send-overlay').classList.remove('active');
    btn.onclick = cancelCampaignSending;
    btn.textContent = '✕ Abort Send';
  };

  CAMPAIGNS = CAMPAIGNS.filter(c => c.id !== draftId);

  const sentCampaign = {
    id: 'c-sent-' + Date.now(),
    subject,
    body,
    segment: $('c-segment').value,
    replyTo,
    status: 'sent',
    createdAt: today(),
    sentAt: today() + ' ' + new Date().toTimeString().slice(0, 5),
    stats: {
      total: _campaignSendingRecipients.length,
      success: _campaignSuccessCount,
      failed: _campaignFailCount
    }
  };

  CAMPAIGNS.unshift(sentCampaign);
  await _persistCampaigns();
  renderCampaigns();
  showToast(wasAborted ? 'Campaign send aborted' : '✓ Campaign sent successfully!');
}

async function retryCampaignEmail(idx) {
  const rec = _campaignSendingRecipients[idx];
  if (!rec) return;

  const to = rec.email;
  const name = rec.name || 'Customer';
  const subject = $('c-subject').value.trim();
  const body = $('c-body').value.trim();
  const replyTo = $('c-replyto').value.trim();

  const consoleEl = $('c-send-log-console');
  if (!consoleEl) return;
  const failLines = consoleEl.querySelectorAll('.campaign-log-fail');
  let targetLine = null;
  for (const line of failLines) {
    if (parseInt(line.getAttribute('data-index')) === idx) {
      targetLine = line;
      break;
    }
  }

  if (targetLine) {
    targetLine.style.color = 'var(--text3)';
    targetLine.innerHTML = `⏳ Retrying for ${escapeHtml(to)}...`;
  }

  try {
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!to || !emailRegex.test(to.trim())) {
      throw new Error('Invalid email address format');
    }
    const personalizedBody = body
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{email\}\}/g, to);

    await sendSingleEmailViaBackend(to, subject, personalizedBody, replyTo);

    _campaignSuccessCount++;
    _campaignFailCount--;

    if (targetLine) {
      targetLine.style.color = '#a9ffaf';
      targetLine.className = '';
      targetLine.innerHTML = `✓ Sent to ${escapeHtml(to)} (${escapeHtml(name)}) (Retried)`;
    }

    updateCampaignSendFinishedSummary();
  } catch (e) {
    if (targetLine) {
      targetLine.style.color = '#f87171';
      targetLine.innerHTML = `✕ Failed for ${escapeHtml(to)}: ${escapeHtml(e.message)} <button class="btn sm" onclick="retryCampaignEmail(${idx})" style="padding:2px 6px;font-size:10px;margin-left:8px;line-height:1.2;height:auto;width:auto;display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:white;cursor:pointer;">Retry</button>`;
    }
  }
}

function updateCampaignSendFinishedSummary() {
  const summaryEl = $('c-send-finished-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `[FINISHED] Success: ${_campaignSuccessCount} · Failed: ${_campaignFailCount}`;
  }
}

async function renderCampaigns() {
  const draftsList = $('campaign-drafts-list');
  const sentList = $('campaign-sent-list');
  if (!draftsList || !sentList) return;

  const drafts = CAMPAIGNS.filter(c => c.status === 'draft');
  const sent = CAMPAIGNS.filter(c => c.status === 'sent');

  draftsList.innerHTML = drafts.length
    ? drafts.map(c => `
      <div class="campaign-row">
        <div class="campaign-info">
          <div class="campaign-title-row">
            <span class="campaign-subject">${escapeHtml(c.subject)}</span>
            <span class="pill amber" style="font-size:9px;">Draft</span>
          </div>
          <div class="campaign-meta-info">Created: ${fmtD(c.createdAt)} · Target: ${escapeHtml(c.segment)}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn sm" onclick="editCampaignDraft('${c.id}')">Edit</button>
          <button class="btn sm" onclick="deleteCampaign('${c.id}')">Delete</button>
        </div>
      </div>
    `).join('')
    : '<div class="empty-state" style="padding:1rem;">No saved drafts. Click "Create Campaign" to compose one.</div>';

  sentList.innerHTML = sent.length
    ? sent.map(c => `
      <div class="campaign-row">
        <div class="campaign-info">
          <div class="campaign-title-row">
            <span class="campaign-subject">${escapeHtml(c.subject)}</span>
            <span class="pill green" style="font-size:9px;">Sent</span>
          </div>
          <div class="campaign-meta-info">Sent: ${c.sentAt || fmtD(c.createdAt)} · Segment: ${escapeHtml(c.segment)}</div>
        </div>
        <div class="campaign-kpis">
          <div class="campaign-kpi-item">
            <span>Sent</span>
            <strong>${c.stats ? c.stats.success : 0}</strong>
          </div>
          ${c.stats && c.stats.failed ? `
          <div class="campaign-kpi-item">
            <span style="color:var(--red);">Failed</span>
            <strong style="color:var(--red);">${c.stats.failed}</strong>
          </div>` : ''}
          <button class="btn sm" onclick="deleteCampaign('${c.id}')" title="Delete from history" style="margin-left:8px;">✕</button>
        </div>
      </div>
    `).join('')
    : '<div class="empty-state" style="padding:1rem;">No sent campaigns yet.</div>';
}

function filterCustomers(v) { _customerFilter = v || ''; renderCustomers(); }

async function customerPullStripe() {
  const btn = $('cust-stripe-btn');
  const status = $('cust-stripe-status');
  const key = (typeof getReconStripeKey === 'function') ? getReconStripeKey() : '';
  if (!key) {
    if (status) status.innerHTML = '<span style="color:var(--amber);">No Stripe key saved yet — add one in the Payments or Tax Centre tab, then pull again.</span>';
    showToast('Add your Stripe key in Payments first', 'warn');
    return;
  }
  const moreBtn = $('cust-stripe-more-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Pulling…'; }
  if (moreBtn) moreBtn.disabled = true;
  if (status) status.textContent = `Fetching buyers from Stripe (up to ${_customerStripeDepth * 100} most recent payments)…`;
  try {
    const payments = await fetchStripePaymentsForReconcile(_customerStripeDepth);
    const slim = payments.filter(p => _custEmailKey(p.email)).map(p => ({
      email: p.email, customer: p.customer || '', amount: p.amount,
      currency: p.currency, date: p.date, refunded: !!p.refunded,
    }));
    _saveCustomerStripeCache(slim);
    // If we filled the page budget, older payments probably remain.
    _customerStripeMaybeMore = payments.length >= _customerStripeDepth * 100 && _customerStripeDepth < 50;
    const uniq = new Set(slim.map(p => _custEmailKey(p.email))).size;
    if (status) status.innerHTML = `<span style="color:var(--green);">✓ Pulled ${uniq} buyer${uniq === 1 ? '' : 's'} with an email from ${payments.length} Stripe payment${payments.length === 1 ? '' : 's'}.</span>`
      + (_customerStripeMaybeMore ? ' <span style="color:var(--text3);">Older buyers may remain — use “Load older”.</span>' : '');
    renderCustomers();
  } catch (e) {
    const msg = String(e.message || e);
    if (status) status.innerHTML = `<span style="color:var(--red);">Error: ${escapeHtml(msg)}</span>`;
    showToast('Stripe pull failed: ' + msg, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↻ Pull buyers from Stripe'; }
    if (moreBtn) { moreBtn.disabled = false; moreBtn.style.display = _customerStripeMaybeMore ? '' : 'none'; }
  }
}

// Reach further back through Stripe history, 5 pages (~500 payments) at a time.
async function customerPullDeeper() {
  _customerStripeDepth = Math.min(50, _customerStripeDepth + 5);
  await customerPullStripe();
}

function copyCustomerEmails() {
  const emails = Array.from(new Set(_custMailable(buildCustomerList()).map(r => r.email)));
  if (!emails.length) { showToast('No mailable emails here (unsubscribed are excluded)', 'warn'); return; }
  const text = emails.join(', ');
  const done = () => showToast(`✓ Copied ${emails.length} email${emails.length === 1 ? '' : 's'}`);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => { _custFallbackCopy(text); done(); });
  } else { _custFallbackCopy(text); done(); }
}
function _custFallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (_) { }
  ta.remove();
}

function exportCustomersCSV() {
  // Export exactly what's filtered on screen, minus anyone who unsubscribed —
  // so a re-import into a newsletter tool can't re-add opted-out buyers.
  const list = _custMailable(buildCustomerList());
  if (!list.length) { showToast('Nothing to export in this view (unsubscribed are excluded)', 'warn'); return; }
  const rows = [['Name', 'Email', 'Orders', 'Units', 'Books', 'Channels', 'First Order', 'Last Order', 'Spend', 'Sources']];
  list.forEach(r => rows.push([
    r.name, r.email, r.orders, r.units || '',
    Array.from(r.books).join('; '), Array.from(r.channels).join('; '),
    r.first || '', r.last || '', _custSpendStr(r.spend), Array.from(r.sources).join('; '),
  ]));
  downloadCsv(toCsv(rows), `lyrical-customers-${today()}.csv`);
  showToast(`✓ Exported ${list.length} customer${list.length === 1 ? '' : 's'}`);
}

Object.assign(window, {
  confirmDialog, promptDialog, notify,
  renderCustomers, filterCustomers, customerPullStripe, copyCustomerEmails, exportCustomersCSV,
  toggleCustomerSuppress, setCustomerBookFilter, customerPullDeeper,
  addManualSubscriber, addBuyerToMailingList, removeFromMailingList, addAllBuyersToMailingList,
  toggleMailingAutoAdd, emailCustomerSegment, emailMailingList, copyMailingListEmails, exportMailingListCSV,
  setCustomerChannelFilter, setCustomerSpendFilter, setCustomerOrdersFilter, checkMailingEmailTypo, applyMailingEmailCorrection,
  switchCustomersSubTab, openCampaignWizard, closeCampaignWizard, insertTemplateTag, updateCampaignPreview,
  onCampaignSegmentChange, saveCampaignDraft, editCampaignDraft, deleteCampaign, sendTestEmailCampaign, sendCampaignLaunch, cancelCampaignSending, onForceMockChange, updateCampaignModeStatus, retryCampaignEmail,
  fetchStripeFeesByYear, downloadStripeFeesAuditCSV, clearStoredStripeKey, insertStripeFeesIntoLedger, reconcileStripeAgainstSales,
  reconcileSync, renderReconcile, reconcileRecordSale, reconcileApplyBigCartel, reconcileOpenInvoice, reconcileDismiss, reconcileUndo,
  reconOnFilter, reconSetCurrency, reconClearFilters, reconEditKey, reconRecordGroup, reconDismissGroup, reconDismissAllShown,
  generateBookStripeLink,
  logout, switchTab, toggleBookDropdown, toggleHeaderMenu, closeHeaderMenus, toggleSideAccount, switchBook, forceSync, recalcOnHand, dismissStockDrift,
  showMoreHist, showAllHist,
  restateBookCurrency, onCurrencyModeChange, onCurrencyRateModeChange, refreshCurrencyPreview,
  renderOpenCall, ocAdd, ocToggle, ocDelete, ocCopyEmails, ocToggleImport, ocRunImport, checkOcEmailTypo, applyOcEmailCorrection,
  ocCreateProject, ocRenameProject, ocDeleteProject, ocSwitchProject, ocComposeStageEmail, ocSearch, ocFilterByStage, ocScanReplies, ocScanRepliesSingle, ocToggleInlineThread, ocSaveTemplates, exportOpenCallCSV, ocSetSort, ocSetTmplTab, ocUpdateTmplPreview, openOcBulkModal, closeOcBulkModal, onOcBulkStageChange, sendOcBulkEmails, ocBulkSelectAll, ocBulkUpdateCount, sendOcBulkTestEmail, cancelOcBulkSend, ocToggleResend, ocSaveResendConfig, ocSaveSenderConfig, ocLoadSenderAliases, insertFormattingTag, triggerOcCsvUpload, handleOcCsvUpload, handleOcCsvDragOver, handleOcCsvDragLeave, handleOcCsvDrop, handleOcPhotoKeydown, addOcPhotoChip, removeOcPhotoChip, ocAddPhotoToContributor, ocRemovePhotoFromContributor,
  openOcBulkRemoveModal, closeOcBulkRemoveModal, ocBulkRemoveSelectAll, ocBulkRemoveUpdateCount, ocBulkRemoveFilter, executeOcBulkRemove,
  openOcEditModal, saveOcContributor, downloadOcAttachment, ocUpdateBulkPreview, ocClearUndeliverable,
  ocToggleColorPalette, ocApplyColor,
  openOcEmailPreviewModal, closeOcEmailPreviewModal, ocPreviewModalSend, ocPreviewModalEditInWizard,
  openOcImportGmailModal, closeOcImportGmailModal, ocImportGmailSearch, ocImportGmailSelectAll, ocImportGmailConfirm,
  ocApproveProposal, ocDismissProposal, ocApproveAllProposals, ocOutboxRemove, ocOutboxSendAll, ocSetServerSchedule,
  ocToggleSection, ocTogglePhotoPick,
  toggleCurrentBookView,
  fetchOrders, applyOne, applyAll, cancelOrder, restoreOrder, unapplyOne, onManualCurrencyChange, calcFx, calcManualFxRate, submitManual,
  onExpenseCurrencyChange, calcExpenseFx,

  submitGratuity, openM, closeM, addStore, openEditStore, confirmEditStore, openSend, confirmSend, openSale, confirmSale,
  exportConsignmentLedgerCSV, openBulkSend, bulkApplyQty, bulkQtyChanged, bulkCheckChanged, updateBulkSendSummary, confirmBulkSend,
  openRet, confirmReturn, openEditHist, openEditLedger, saveEntryEdit, convertKeptAllToReceived, voidEntry,
  restoreBookDataFromSheets, resetBookData, connectSheets, disconnectSheets, testSheets, verifyUrl, checkSheetsVersion,
  pushAllToSheets, backfillAndResync, copyGasCode, saveProductionCosts, savePaymentLinks,
  handleImportFile, confirmImport, openLabelModal, printShippingLabel, toggleShipped, backfillShipping,
  saveArtistPaymentLink, markArtistTransferReceived, settleArtistTransferKeepShare, settleArtistTransferKeepAll, markExpenseReceived,
  submitExpense, voidExpense, toggleExpenseReimburseSelect, requestBulkReimbursement, markPaid, markHistoryConsignmentPaid, removeStore, addProfitTier, removeProfitTier,
  saveProfitTiers, renderProfitSettings, updateProfitTierField, renderProfitTierList,
  renderFinancials, downloadTaxReport, createSystemBackupNow, restoreSystemBackup, restoreBookFromBackup, applyBookRestore, gotoSysBackupPage, handleBackupImportFile, handleBookRestoreImportFile,
  chooseBackupFolder, exportToJSON, exportAllToCSV,
  submitTaxExpense, importShippoShippingFromApi, removeRecurring, downloadTaxLedgerCSV, renderTaxCenter,
  openRecurringEditor, saveRecurringEditor, updateRecurringPreview, toggleRecurringPause,
  tcSetRecurringFilter, tcShowRecurringCharges,
  removeLedgerEntry, setupReceiptFolder, authorizeReceiptFolder, viewLocalReceipt, setTcLedgerPage,
  batchScanAndRelinkReceipts, attachReceiptToExpenseRow, tcExpenseRowDragOver, tcExpenseRowDragLeave, tcExpenseRowDrop,
  tcLedgerSearchInput, tcLedgerTypeFilter, tcLedgerYearChange, tcYearChange, tcClearLedgerFilters,
  openReceiptCameraModal, closeReceiptCameraModal, captureReceiptPhoto, retakeReceiptPhoto, useReceiptPhoto,
  saveTaxCenterSettings, scanReceiptWithAI, scanProjectReceiptWithAI,
  openEmailReceiptImportModal, closeEmailReceiptImportModal, extractReceiptsFromEmailText, importEmailReceiptDrafts, toggleAllEmailDrafts,
  switchEmailImportTab, searchGmailEmails, applyGmailPresetQuery, toggleEmailPreview, toggleEmailRowSelection, toggleAllGmailSelections,
  showCategoryDetail, changeExpenseCategory, tcSelectCashFlowBucket, tcSetCashFlowDetailType, tcClearCashFlowBucket,
  showTripDetail, openEditTrip, saveTripAssignment, renameTripPrompt,
  openEditExpense, relinkEditExpenseReceipt, removeEditExpenseReceipt, saveExpenseEdit, openEditSale, openEditArtistPayout,
  // Invoices
  renderInvoices, openCreateInvoice, viewInvoice,
  addInvoiceItem, removeInvoiceItem, updateInvoiceItem,
  onInvoiceStoreChange, prefillFromPendingSales, recalcInvoiceTotals,
  saveInvoice, deleteInvoice, editInvoiceFromView, markInvoicePaidFromView,
  printInvoice, copyInvoicePayLink, emailInvoice, downloadInvoiceHTML, downloadInvoicePDF,
  openInvoiceTemplateSettings, saveInvoiceSettings,
  regenerateStripeLinkFromView, onInvoiceCurrencyChange,
});

// ── APP UPDATE NOTIFICATION FOR PUBLISHER ──
function checkAppUpdate() {
  if (!window.IS_PUBLISHER || isAuthor()) return;

  const lastSeen = localStorage.getItem('lm-last-seen-version');
  const currentVersion = typeof __GIT_COMMIT_DATE__ !== 'undefined' ? __GIT_COMMIT_DATE__ : 'Unknown';

  if (!lastSeen) {
    // First load: initialize version, don't show updated indicators
    localStorage.setItem('lm-last-seen-version', currentVersion);
    return;
  }

  if (lastSeen !== currentVersion) {
    // App was updated! Show badge and toast.
    const badge = $('pub-update-badge');
    if (badge) {
      badge.hidden = false;
      badge.classList.add('is-visible');
    }
    const stamp = $('pub-updated');
    if (stamp) stamp.classList.add('has-unseen-update');
    showToast(`✨ App successfully updated to ${currentVersion}!`, 'ok', 6000);
  }
}

function dismissAppUpdate(event) {
  if (event) event.stopPropagation();
  const currentVersion = typeof __GIT_COMMIT_DATE__ !== 'undefined' ? __GIT_COMMIT_DATE__ : 'Unknown';
  localStorage.setItem('lm-last-seen-version', currentVersion);

  const badge = $('pub-update-badge');
  if (badge) {
    badge.classList.remove('is-visible');
    window.setTimeout(() => { badge.hidden = true; }, 260);
  }
  const stamp = $('pub-updated');
  if (stamp) stamp.classList.remove('has-unseen-update');
  showToast('✓ Update notification dismissed');
}
window.dismissAppUpdate = dismissAppUpdate;

async function fetchRecentChanges() {
  try {
    const res = await fetch('https://api.github.com/repos/lyricalmyricalbooks/lyrical-inventory/commits?per_page=5');
    if (!res.ok) throw new Error('GitHub API request failed');
    const commits = await res.json();
    return commits.map(c => ({
      message: c.commit.message,
      date: c.commit.author.date,
      sha: c.sha.substring(0, 7),
      fullSha: c.sha
    }));
  } catch (e) {
    console.error('Failed to fetch changes from GitHub', e);
    return null;
  }
}

async function showWhatsNew(event) {
  console.log('[showWhatsNew] Invoked. IS_PUBLISHER:', window.IS_PUBLISHER, 'isAuthor():', isAuthor());
  if (!window.IS_PUBLISHER || isAuthor()) {
    showToast(`⚠️ Role verification failed (Publisher: ${!!window.IS_PUBLISHER}, Author: ${isAuthor()})`, 'warn');
    return;
  }
  if (event) event.stopPropagation();
  try {
    openM('whats-new');
  } catch (err) {
    showToast(`❌ Failed to open Whats New: ${err.message}`, 'err');
    console.error('Failed to open Whats New modal:', err);
  }

  const container = $('whats-new-list');
  if (!container) return;

  container.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:20px 0;">Loading recent changes...</div>';

  // Update last seen version when they click/view the updates
  const currentVersion = typeof __GIT_COMMIT_DATE__ !== 'undefined' ? __GIT_COMMIT_DATE__ : 'Unknown';
  localStorage.setItem('lm-last-seen-version', currentVersion);

  const badge = $('pub-update-badge');
  if (badge) {
    badge.classList.remove('is-visible');
    window.setTimeout(() => { badge.hidden = true; }, 260);
  }
  const stamp = $('pub-updated');
  if (stamp) stamp.classList.remove('has-unseen-update');

  try {
    const changes = await fetchRecentChanges();
    if (!changes || !changes.length) {
      container.innerHTML = `
        <div style="font-size:12px;color:var(--text2);line-height:1.6;padding:10px 0;">
          Could not load live changes from GitHub. Below is the static version history:
          <ul style="margin:12px 0 0 20px;padding:0;display:flex;flex-direction:column;gap:8px;">
            <li><strong>v3.1.0</strong>: Added 3D book cover overview badges and ambient dynamic color shadows.</li>
            <li><strong>v3.0.0</strong>: Premium editorial color theme, dynamic contrast safety validations, Sage/Terracotta financial indicators, and SVG gradients.</li>
            <li><strong>v2.8.0</strong>: Real-time modal accent color picker previews.</li>
            <li><strong>v2.5.0</strong>: Google Sheets Apps Script webhook sync integration.</li>
          </ul>
        </div>`;
      return;
    }

    container.innerHTML = changes.map(c => {
      const dateStr = new Date(c.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      const cleanMsg = escapeHtml(c.message);
      return `
        <div class="commit-item" onclick="window.open('https://github.com/lyricalmyricalbooks/lyrical-inventory/commit/${c.fullSha}', '_blank')" title="Click to view commit details on GitHub">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--gold-text);font-weight:600;">sha: ${c.sha} ↗</span>
            <span style="font-size:10px;color:var(--text3);">${dateStr}</span>
          </div>
          <div style="font-size:12.5px;color:var(--text);white-space:pre-wrap;line-height:1.45;font-family:'Syne',sans-serif;font-weight:500;">${cleanMsg}</div>
        </div>`;
    }).join('');
  } catch (err) {
    showToast(`❌ Error displaying changes: ${err.message}`, 'err');
    console.error('Error in showWhatsNew mapping:', err);
  }
}
window.showWhatsNew = showWhatsNew;

// ── STARTUP ROUTING
async function initStartup() {
  // Master Publisher Email
  const publisherEmail = 'lyricalmyrical@gmail.com';

  window._fbOnAuthStateChanged(async user => {
    const dismissSplash = () => {
      const splash = document.getElementById('splash-screen');
      if (splash) {
        splash.style.opacity = '0';
        setTimeout(() => splash.style.display = 'none', 400);
      }
    };
    try {
      if (!user) {
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
          console.log('[Dev Bypass] Localhost/dev environment detected, bypassing login gate as publisher.');
          window.IS_PUBLISHER = true;
          IS_AUTHOR_MODE = false;
          try {
            await loadCatalog();
          } catch (e) {
            BOOKS = { ...DEFAULT_BOOKS };
            BOOK_LIST = Object.values(BOOKS);
          }
          loadAuthorViewOverrides();
          showApp('publisher', null);
          checkAppUpdate();
          dismissSplash();
          return;
        }
        // Not logged in
        setupGate(null);
        const err = document.getElementById('pw-err');
        if (err) err.textContent = '';
        dismissSplash();
        return;
      }

      // Load shared Firestore mode flags FIRST — before any data reads.
      // This ensures all devices agree on which database to use.
      await window._fbLoadModeFlags();

      // Pull the shared notification endpoint so artist sessions — which never ran
      // the Sheet setup locally — still have a URL to POST the approval-needed
      // email to when they submit. Publisher writes it; everyone can read it.
      try {
        const ep = await window._fbLoadSettings('notifyEndpoint');
        if (ep && ep.url) { notifyUrl = ep.url; localStorage.setItem('lm-notify-url', ep.url); }
      } catch (_) { }

      try {
        const ac = await window._fbLoadSettings('analyticsConfig');
        if (ac && ac.url) {
          localStorage.setItem('lm-analytics-url', ac.url);
        }
      } catch (_) { }

      // NOW that we have a valid token, we pull the protected catalog.
      await loadCatalog();
      loadAuthorViewOverrides();

      // Check access
      const uEmail = user.email.toLowerCase().trim();
      if (uEmail === publisherEmail || uEmail === 'lyricalmyricalbooks@gmail.com') {
        window.IS_PUBLISHER = true;
        IS_AUTHOR_MODE = false;
        // Seed/refresh the rules-readable ownership map now we're authenticated as
        // publisher, so authors' per-book writes resolve under the tightened rules
        // even if the catalog isn't edited this session.
        if (typeof window._fbSaveBookOwners === 'function') window._fbSaveBookOwners(ownersFromBooks());
        showApp('publisher', null);
        checkAppUpdate();
        dismissSplash();
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
        dismissSplash();
        return;
      }

      // No match
      window._fbSignOut();
      setupGate(`Your Google account (${user.email}) is not authorized for any books.`);
      const err = document.getElementById('pw-err');
      if (err) err.textContent = '';
      dismissSplash();
    } catch (e) {
      console.error('Error during initStartup auth state change:', e);
      dismissSplash();
    }
  });
}

function setupGate(errMsg) {
  $('pw-gate').style.display = '';
  $('pw-app').style.display = 'none';
  document.querySelector('#gate-sub').textContent = 'inventory app';
  document.querySelector('#pw-gate .wm').textContent = 'Lyricalmyrical Books';
  const desc = document.getElementById('gate-desc');
  if (desc) {
    desc.style.display = errMsg ? 'block' : 'none';
    desc.innerHTML = errMsg ? `<span style="color:var(--red);font-weight:600;">${escapeHtml(errMsg)}</span>` : '';
  }
}

// ── WEB ANALYTICS ───────────────────────────────────────────────────────
function parseUmamiShareUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/share\/([a-zA-Z0-9\-_]+)/);
    if (!match) return null;
    return {
      origin: parsed.origin,
      shareId: match[1]
    };
  } catch (_) {
    return null;
  }
}

function formatUmamiDuration(seconds) {
  const sec = Math.max(0, Math.round(Number(seconds) || 0));
  if (sec === 0) return '0s';
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (mins < 60) {
    return remSec > 0 ? `${mins}m ${remSec}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

function calculateUmamiTimeframe(hours = 24) {
  const endAt = Date.now();
  const durationMs = hours * 60 * 60 * 1000;
  const startAt = endAt - durationMs;
  const prevEndAt = startAt;
  const prevStartAt = startAt - durationMs;
  return { startAt, endAt, prevStartAt, prevEndAt };
}

function computeMetricChange(currentVal, prevVal) {
  const cur = Number(currentVal) || 0;
  const prev = Number(prevVal) || 0;
  if (prev === 0) {
    if (cur === 0) return { percent: 0, formatted: '0%', isIncrease: false };
    return { percent: 100, formatted: '↑ 100%', isIncrease: true };
  }
  const diff = cur - prev;
  const percent = Math.round((diff / prev) * 100);
  if (percent === 0) return { percent: 0, formatted: '0%', isIncrease: false };
  const isIncrease = percent > 0;
  const formatted = `${isIncrease ? '↑' : '↓'} ${Math.abs(percent)}%`;
  return { percent, formatted, isIncrease };
}

async function fetchUmamiApiStats(shareUrl) {
  const parsed = parseUmamiShareUrl(shareUrl);
  if (!parsed) return null;

  const { origin, shareId } = parsed;
  const timeframe = calculateUmamiTimeframe(24);

  const shareRes = await fetch(`${origin}/api/share/${shareId}`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!shareRes.ok) throw new Error(`Share API returned HTTP ${shareRes.status}`);
  const shareData = await shareRes.json();
  
  const websiteId = shareData.websiteId || shareData.id || shareData.website?.id;
  const token = shareData.token || shareId;
  if (!websiteId) throw new Error('Could not resolve websiteId from Umami share API');

  const headers = {
    'Accept': 'application/json',
    'x-umami-share-token': token
  };

  const [curRes, prevRes] = await Promise.all([
    fetch(`${origin}/api/websites/${websiteId}/stats?startAt=${timeframe.startAt}&endAt=${timeframe.endAt}`, { headers }),
    fetch(`${origin}/api/websites/${websiteId}/stats?startAt=${timeframe.prevStartAt}&endAt=${timeframe.prevEndAt}`, { headers })
  ]);

  if (!curRes.ok) throw new Error(`Stats API returned HTTP ${curRes.status}`);
  const curStats = await curRes.json();
  const prevStats = prevRes.ok ? await prevRes.json() : {};

  const getVal = (obj, key) => (obj && obj[key] && typeof obj[key].value === 'number') ? obj[key].value : (typeof obj[key] === 'number' ? obj[key] : 0);

  const visitors = getVal(curStats, 'visitors');
  const prevVisitors = getVal(prevStats, 'visitors');

  const visits = getVal(curStats, 'visits');
  const prevVisits = getVal(prevStats, 'visits');

  const views = getVal(curStats, 'pageviews');
  const prevViews = getVal(prevStats, 'pageviews');

  const bounces = getVal(curStats, 'bounces');
  const prevBounces = getVal(prevStats, 'bounces');

  const totalTime = getVal(curStats, 'totaltime');
  const prevTotalTime = getVal(prevStats, 'totaltime');

  const bounceRate = visits > 0 ? Math.round((bounces / visits) * 100) : 0;
  const prevBounceRate = prevVisits > 0 ? Math.round((prevBounces / prevVisits) * 100) : 0;

  const avgDuration = visits > 0 ? Math.round(totalTime / visits) : 0;
  const prevAvgDuration = prevVisits > 0 ? Math.round(prevTotalTime / prevVisits) : 0;

  return {
    visitors: { value: visitors, change: computeMetricChange(visitors, prevVisitors) },
    visits: { value: visits, change: computeMetricChange(visits, prevVisits) },
    views: { value: views, change: computeMetricChange(views, prevViews) },
    bounceRate: { value: `${bounceRate}%`, change: computeMetricChange(bounceRate, prevBounceRate), rawRate: bounceRate, prevRate: prevBounceRate },
    avgDuration: { value: formatUmamiDuration(avgDuration), change: computeMetricChange(avgDuration, prevAvgDuration), rawSeconds: avgDuration }
  };
}

async function renderUmamiStats(shareUrl) {
  const kpiBar = $('webanalytics-kpi-bar');
  const statusLabel = $('webanalytics-api-status');
  if (!kpiBar) return;

  const parsed = parseUmamiShareUrl(shareUrl);
  if (!parsed) {
    kpiBar.style.display = 'none';
    return;
  }

  kpiBar.style.display = 'block';
  if (statusLabel) statusLabel.textContent = 'Fetching live stats...';

  try {
    const stats = await fetchUmamiApiStats(shareUrl);
    if (!stats) {
      kpiBar.style.display = 'none';
      return;
    }

    const setCard = (valId, changeId, metricObj, isBounce = false) => {
      const valEl = $(valId);
      const changeEl = $(changeId);
      if (valEl) valEl.textContent = metricObj.value;
      if (changeEl && metricObj.change) {
        changeEl.textContent = metricObj.change.formatted;
        let isGood = isBounce ? !metricObj.change.isIncrease : metricObj.change.isIncrease;
        if (metricObj.change.percent === 0) {
          changeEl.className = 'analytics-kpi-change neutral';
        } else {
          changeEl.className = `analytics-kpi-change ${isGood ? 'up' : 'down'}`;
        }
      }
    };

    setCard('umami-kpi-visitors', 'umami-change-visitors', stats.visitors);
    setCard('umami-kpi-visits', 'umami-change-visits', stats.visits);
    setCard('umami-kpi-views', 'umami-change-views', stats.views);
    setCard('umami-kpi-bounces', 'umami-change-bounces', stats.bounceRate, true);
    setCard('umami-kpi-duration', 'umami-change-duration', stats.avgDuration);

    if (statusLabel) {
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      statusLabel.textContent = `Updated ${nowStr}`;
    }
  } catch (err) {
    console.warn('Umami API fetch failed (falling back to iframe-only):', err.message);
    if (statusLabel) statusLabel.textContent = 'API stats unavailable';
  }
}

window.refreshUmamiStats = function () {
  const url = localStorage.getItem('lm-analytics-url') || '';
  if (url) renderUmamiStats(url);
};

function renderWebAnalytics() {
  const url = localStorage.getItem('lm-analytics-url') || '';
  const statusBadge = $('webanalytics-status-badge');
  const connectedView = $('webanalytics-connected-view');
  const setupView = $('webanalytics-setup-view');
  const iframe = $('webanalytics-iframe');
  const domainLabel = $('webanalytics-domain-label');
  const urlInput = $('webanalytics-url-input');
  const externalLink = $('webanalytics-external-link');

  if (url) {
    // Show Connected View
    if (statusBadge) {
      statusBadge.textContent = 'Connected';
      statusBadge.className = 'sheets-badge';
      statusBadge.style.background = '#e0f5ea';
      statusBadge.style.color = '#1d7a4a';
    }
    if (setupView) setupView.style.display = 'none';
    if (connectedView) connectedView.style.display = 'block';

    // Extract domain from URL for aesthetics
    try {
      const parsed = new URL(url);
      if (domainLabel) domainLabel.textContent = parsed.hostname;
    } catch (_) {
      if (domainLabel) domainLabel.textContent = 'External Dashboard';
    }

    if (iframe && iframe.src !== url) {
      iframe.src = url;
    }
    if (externalLink) {
      externalLink.href = url;
    }

    renderUmamiStats(url);
  } else {
    // Show Setup View
    if (statusBadge) {
      statusBadge.textContent = 'Not Connected';
      statusBadge.className = 'sheets-badge off';
      statusBadge.style.background = '';
      statusBadge.style.color = '';
    }
    if (connectedView) connectedView.style.display = 'none';
    if (setupView) setupView.style.display = 'block';
    if (iframe) iframe.src = '';
    if (urlInput) urlInput.value = '';
    if (externalLink) externalLink.href = '#';

    const kpiBar = $('webanalytics-kpi-bar');
    if (kpiBar) kpiBar.style.display = 'none';
  }
}

window.toggleAnalyticsHeight = function () {
  const iframe = $('webanalytics-iframe');
  const btn = $('webanalytics-height-btn');
  if (!iframe || !btn) return;

  if (iframe.style.height === '1200px') {
    iframe.style.height = '700px';
    btn.textContent = '↕ Expand';
  } else {
    iframe.style.height = '1200px';
    btn.textContent = '↕ Collapse';
  }
};

window.saveAnalyticsUrl = async function () {
  const urlInput = $('webanalytics-url-input');
  if (!urlInput) return;
  const url = urlInput.value.trim();
  if (!url) {
    showToast('Please enter a valid URL', 'warn');
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    showToast('URL must start with http:// or https://', 'warn');
    return;
  }

  showToast('Connecting...');
  try {
    localStorage.setItem('lm-analytics-url', url);
    if (typeof window._fbSaveSettings === 'function') {
      await window._fbSaveSettings('analyticsConfig', { url });
    }
    showToast('✓ Web Analytics connected');
    renderWebAnalytics();
  } catch (e) {
    console.error('Failed to save Web Analytics settings', e);
    showToast('Failed to save settings to cloud', 'err');
  }
};

window.disconnectAnalytics = async function () {
  try {
    localStorage.removeItem('lm-analytics-url');
    if (typeof window._fbSaveSettings === 'function') {
      await window._fbSaveSettings('analyticsConfig', { url: '' });
    }
    showToast('✓ Web Analytics disconnected');
    renderWebAnalytics();
  } catch (e) {
    console.error('Failed to clear Web Analytics settings', e);
    showToast('Failed to disconnect in cloud', 'err');
  }
};

// Global IS_PUBLISHER override for UI hooks
window.IS_PUBLISHER = false;
window.isPublisherSession = () => window.IS_PUBLISHER;
window.isAuthor = () => IS_AUTHOR_MODE || (window.IS_PUBLISHER && activeBook && activeBook !== 'all' && AUTHOR_VIEW_BY_BOOK[activeBook]);

function updateModalAccentPreview(inputEl) {
  if (!inputEl) return;
  const color = inputEl.value;
  const colorBg = hexToRgba(color, 0.1);
  const modal = inputEl.closest('.modal');
  if (modal) {
    modal.style.setProperty('--local-accent', color);
    modal.style.setProperty('--local-accent-bg', colorBg);
    modal.style.setProperty('--local-accent-text', getContrastSafeText(color));
    modal.style.setProperty('--local-accent-contrast', getContrastColor(color));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const nbAccent = document.getElementById('nb-accent');
  if (nbAccent) {
    nbAccent.addEventListener('input', () => updateModalAccentPreview(nbAccent));
  }
  const pbAccent = document.getElementById('pb-accent');
  if (pbAccent) {
    pbAccent.addEventListener('input', () => updateModalAccentPreview(pbAccent));
  }
});

// --- SHIPPO SHIPPING CALCULATOR AND QUANTITY SCALING ---

const SHIPPO_COUNTRY_CODES = {
  canada: 'CA', ca: 'CA', can: 'CA',
  'united states': 'US', 'united states of america': 'US', usa: 'US', us: 'US',
  'united kingdom': 'GB', uk: 'GB', gb: 'GB', 'great britain': 'GB', england: 'GB',
  italy: 'IT', it: 'IT', italia: 'IT',
  germany: 'DE', de: 'DE', deutschland: 'DE',
  france: 'FR', fr: 'FR',
  australia: 'AU', au: 'AU',
  austria: 'AT', at: 'AT',
  belgium: 'BE', be: 'BE',
  brazil: 'BR', br: 'BR',
  china: 'CN', cn: 'CN',
  'czech republic': 'CZ', cz: 'CZ',
  denmark: 'DK', dk: 'DK',
  finland: 'FI', fi: 'FI',
  greece: 'GR', gr: 'GR',
  hungary: 'HU', hu: 'HU',
  iceland: 'IS', is: 'IS',
  india: 'IN', in: 'IN',
  ireland: 'IE', ie: 'IE',
  israel: 'IL', il: 'IL',
  japan: 'JP', jp: 'JP',
  mexico: 'MX', mx: 'MX',
  netherlands: 'NL', holland: 'NL', nl: 'NL',
  'new zealand': 'NZ', nz: 'NZ',
  norway: 'NO', no: 'NO',
  poland: 'PL', pl: 'PL',
  portugal: 'PT', pt: 'PT',
  singapore: 'SG', sg: 'SG',
  'south africa': 'ZA', za: 'ZA',
  'south korea': 'KR', kr: 'KR',
  spain: 'ES', es: 'ES', españa: 'ES',
  sweden: 'SE', se: 'SE',
  switzerland: 'CH', ch: 'CH', suisse: 'CH',
  turkey: 'TR', tr: 'TR',
  ukraine: 'UA', ua: 'UA'
};

export function normalizeCountryCode(code) {
  if (!code) return 'US';
  if (typeof code === 'object' && code !== null) {
    code = code.code || code.id || code.iso2 || code.country_code || code.name || 'US';
  }
  const raw = String(code).trim();
  if (!raw) return 'US';

  const normalized = SHIPPO_COUNTRY_CODES[raw.toLowerCase()];
  if (normalized) return normalized;
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();

  const select = typeof document !== 'undefined' ? document.getElementById('st-country') : null;
  if (select && select.options) {
    const rawLower = raw.toLowerCase();
    for (const opt of select.options) {
      if (opt.value && (opt.value.toLowerCase() === rawLower || opt.textContent.toLowerCase() === rawLower)) {
        return opt.value;
      }
    }
  }

  return 'US';
}


export function getAllStores() {
  const stores = [];
  const seenIds = new Set();
  Object.values(states).forEach(s => {
    if (s && Array.isArray(s.stores)) {
      s.stores.forEach(st => {
        if (!seenIds.has(st.id)) {
          seenIds.add(st.id);
          stores.push(st);
        }
      });
    }
  });
  return stores;
}












document.addEventListener('click', (e) => {
  const menu = $('custom-ship-dest-menu');
  const trigger = $('custom-ship-dest-trigger');
  if (menu && menu.style.display !== 'none' && !menu.contains(e.target) && !trigger?.contains(e.target)) {
    setShippoDestMenuOpenState(false);
  }
});








































/**
 * Confirms a suggested Shippo expense match for a given order number.
 * Calls persistManualShippingLink which already exists in shipping-reconciliation.js.
 */

/**
 * Opens a modal to manually search and link a Shippo expense to an order number.
 */

/** Filters the manual link modal rows by recipient name search. */

/** Performs the manual Shippo link and closes the modal. */

/** Closes and removes the manual link modal from the DOM. */

/** Unlinks a Shippo expense from any order. */





































// Vite serves this file as an ES module, so top-level function declarations are
// module-scoped instead of becoming window properties. The HTML markup and many
// rendered templates intentionally use compact inline handlers; keep those
// legacy entry points available so every visible button can invoke its action.
function exposeLegacyInlineHandlers() {
  Object.assign(window, {
    revealUpdatingScreen, hideUpdatePrompt, bindUpdatePromptInteractions, isTestBook, isTestBookId,
    ownersFromBooks, saveCatalogWithDeletions, loadCatalog, syncCatalog, switchBookModalTab,
    resetBookForm, openAddBookModal, openEditBookModal, closeAddBookModal, isValidPaymentLink,
    updateUnsavedIndicator, saveBookFromModal, renderCatalogList, deleteBook, openPaymentQRModal,
    updateSingleBookPaymentQR, generateSingleBookStripeQR,
    copyPaymentLink, downloadPaymentQR, renderAllQRCodes, renderAuthorQRPage,
    loadAuthorViewOverrides, saveAuthorViewOverrides, isPublisherSession, isAuthor,
    animateCountValue, triggerCardAnimations, queueSync, updatePendingIndicator, processSyncQueue,
    defaultState, getState, getBook, showToast, confirmDialog, promptDialog, notify, setSyncState, saveState,
    loadBook, toggleFirestoreMode, loadTaxCenter, saveTaxCenter, processRecurringExpenses,
    refreshDailyRates, loadAllBooks, forceSync, buildBookSwitcher, toggleBookDropdown,
    closeBookDropdown, toggleHeaderMenu, closeHeaderMenus, closeSideAccount, toggleSideAccount,
    updateRoleToggleButton, updateSubheader, placeKpiStrip, bindKpiResize, syncRoleUI,
    toggleCurrentBookView, updateProfileTabs, selectProfileTab, seedMockTestData, switchBook,
    switchTab, updateHeader, updateAllOverview, renderCustomersStat, channelColor,
    renderChannelAnalytics, renderGlobalPendingAlert, updateContextBanners,
    updatePublisherActionBanner, renderBookPendingAlert, heldGrossOf, recognizedRevenueOf,
    dismissStockDrift, updateDash, getProfitTiersHtml, getRevenueProgressHtml, getOwedCardDetails,
    getArtistHeldHtml, getPayoutHistoryHtml, renderProfitSharingBreakdown, toggleArtistPayoutForm,
    recordArtistPayout, deleteArtistPayout, renderAll, renderCurrent, scheduleRender, ocList,
    ocBlockedForAuthor_, ocEnsureQueues_, ocQueueNextStep_, ocStamp_, ocUiOpen_, ocToggleSection,
    ocTogglePhotoPick, ocSetSort, ocSetTmplTab, ocUpdateTmplPreview, ocThreadForStage,
    openOcBulkModal, ocBulkModalEscHandler, closeOcBulkModal, renderOcBulkModalContent,
    ocBulkSelectAll, ocBulkUpdateCount, sendOcBulkTestEmail, onOcBulkStageChange, sendOcBulkEmails,
    cancelOcBulkSend, ocInitials, openOcBulkRemoveModal, closeOcBulkRemoveModal,
    renderOcBulkRemoveModalContent, ocBulkRemoveSelectAll, ocBulkRemoveUpdateCount,
    ocBulkRemoveFilter, executeOcBulkRemove, renderOpenCall, ocToggleResend, ocSaveResendConfig,
    ocSaveSenderConfig, ocFetchMailSenderInfo, _ocScheduleCache, _ocScheduleCacheSet,
    _ocScheduleRequest, ocSnapshotContributors_, ocPushSnapshot_, ocScheduleSnapshotPush_,
    ocSetServerSchedule, ocRefreshScheduleStatus_, ocLoadSenderAliases, handleOcPhotoKeydown,
    addOcPhotoChip, removeOcPhotoChip, renderOcPhotoChips, ocAddPhotoToContributor,
    ocRemovePhotoFromContributor, ocAdd, ocToggleImport, ocRunImport, ocToggle, ocDelete,
    ocReadProposalCreditEdit_, ocFlashCard_, ocApproveProposal, ocDismissProposal,
    ocApproveAllProposals, ocOutboxRemove, ocOutboxSendAll, ocCopyEmails, ocSearch,
    ocFilterByStage, recordOrder, showMoreHist, showAllHist, renderConsignHistRow, renderHist,
    getScanMemory, saveScanMemory, getAllAppliedIds, renderOrders, applyOne, reapplyOne, applyAll, fetchOrders, cancelOrder, restoreOrder, unapplyOne,
    backfillShipping, fetchLiveRate, fetchHistoricalRate, onManualCurrencyChange, calcFx,
    calcManualFxRate, onExpenseCurrencyChange, calcExpenseFx, _toggleShippingPanel, openLabelModal,
    updateShippedStatusUI, toggleShipped, printShippingLabel, saveArtistPaymentLink,
    isGratuityExpense, renderArtistReimburseBanner, updateExpenseForm, submitExpense, voidExpense,
    scanProjectReceiptWithAI, inferReceiptCategory, normalizeReceiptDate, parseEmlOrText,
    readReceiptFiles, openEmailReceiptImportModal, closeEmailReceiptImportModal,
    startEmailInboxWatcher, updateEmailInboxBadge, _inboxItemToDraft, loadGmailInboxDrafts,
    localizeInboxReceiptFiles, switchEmailImportTab, renderGmailChips, applyGmailPresetQuery,
    searchGmailEmails, renderGmailEmailsList, toggleEmailRowSelection, toggleAllGmailSelections,
    toggleEmailPreview, _emailBodyToReceiptFile, _selectedFileParts, renderEmailPreviewContent,
    _setEmailAttExcluded, _callGeminiForReceipts, extractReceiptsFromEmailText, _findDuplicateExpense,
    _runReceiptScan, _prepareReceiptUpload, _receiptMimeFor, _fileToBase64,
    _applyScanCurrency, _applyScanCategory, _buildReceiptScanPrompt, RECEIPT_SCAN_SCHEMA,
    _isLikelyDuplicateExpense, _expenseHasReceipt, renderEmailReceiptDrafts, toggleAllEmailDrafts,
    deselectDuplicateEmailDrafts, applyBulkCategoryToEmailDrafts, cancelEmailReceiptExtraction,
    retryFailedEmailExtractions,
    _saveDraftReceiptFiles, importEmailReceiptDrafts, renderExpenses, handleImportFile,
    confirmImport, updateManualForm, phint, submitManual, recordOrderPendingTransfer,
    markArtistTransferReceived, settleArtistTransferKeepShare, settleArtistTransferKeepAll,
    renderArtistTransfers, markExpenseReceived, renderPendingExpenses, submitGratuity, storeById,
    addStore, renderStores, removeStore, openEditStore, confirmEditStore, openSend, confirmSend,
    openBulkSend, bulkRowEls, bulkApplyQty, bulkQtyChanged, bulkCheckChanged,
    updateBulkSendSummary, confirmBulkSend, openSale, confirmSale, openRet, confirmReturn,
    settleLedgerSalePaid, maybeAutoPayInvoiceForLedger, invoiceBadgeHTML, markPaid,
    markHistoryConsignmentPaid, renderLedger, exportConsignmentLedgerCSV, getInvoiceSettings,
    saveInvoiceSettingsObj, openInvoiceTemplateSettings, saveInvoiceSettings,
    createStripePaymentLinkForInvoice, deactivateStripePaymentLink, invoicesVisibleHere,
    renderInvoices, openCreateInvoice, nextInvoiceNumber, onInvoiceStoreChange, getInvoiceCurrency,
    onInvoiceCurrencyChange, addInvoiceItem, removeInvoiceItem, updateInvoiceItem,
    renderInvoiceItems, escapeHTML, recalcInvoiceTotals, prefillFromPendingSales, saveInvoice,
    onDiscountTypeChange,
    regenerateStripeLinkFromView, deleteInvoice, viewInvoice, effectivePaymentLink,
    isDynamicStripeLink, renderInvoicePaperHTML, editInvoiceFromView, markInvoicePaidFromView,
    printInvoice, printInvoiceViaPopup, copyInvoicePayLink, invoiceEmailPlainText,
    buildInvoiceEmailHTML, copyInvoiceEmailToClipboard, emailInvoice, collectInvoicePaperCss,
    invoicePaperBodyWithQR, buildStandaloneInvoiceHTML, downloadInvoiceHTML, loadExternalScript,
    ensurePdfLibs, downloadInvoicePDF, findKeptAllPayout, convertKeptAllToReceived, openEditHist,
    openEditLedger, saveEntryEdit, syncLedgerVoid, reconcileConsignmentChannel, reconcileStores,
    recomputeAfters, recalcOnHand, syncHistoryVoidDeletion, voidEntry, resetBookData,
    parseAndValidateDate, restoreBookDataFromSheets, confirmRestoreBookDataFromSheets,
    _modalFieldSig, _prefersReducedMotion, openM, closeM, attemptCloseModal, fieldError,
    clearFieldError, clearFieldErrors, validateFields, withButtonLoading, addLog,
    updateSheetsBadge, normalizeAppsScriptUrl, probeSheetsConnection, connectSheets,
    disconnectSheets, showSheetsConnected, checkSheetsVersion, simulatePostToSheets,
    renderMockSpreadsheet, selectSimSheetTab, clearSimulatedSheet, updateSheetsTabUI, testSheets,
    persistSheetsQueue, persistSheetsLog, makeEventId, backfillSheetsIds, backfillAndResync,
    retryDelayMs, postToSheets, notifyPublisherSubmission, sendTestNotification,
    emailArtistForPayment, _processQueue, sheetPayloadWithBookAccent, syncToSheets,
    syncBatchToSheets, fetchSheetsCapabilities, orderRowPayload, shippingPurchaseRowPayload,
    pushAllToSheets, updateBulkProgress, addSheetsLog, renderSheetsLog, loadGasCode, copyGasCode,
    verifyUrl, backupFileName, openBackupHandleDb, saveBackupFolderHandle, loadBackupFolderHandle,
    updateBackupFolderDisplay, writeBackupToChosenFolder, chooseBackupFolder, openReceiptHandleDb,
    saveReceiptFolderHandle, loadReceiptFolderHandle, setupReceiptFolder, _setReceiptCamStatus,
    openReceiptCameraModal, _stopReceiptCamStream, closeReceiptCameraModal, captureReceiptPhoto,
    retakeReceiptPhoto, useReceiptPhoto, authorizeReceiptFolder, saveReceiptToLocalFile,
    _localReceiptCell, viewLocalReceipt, initializeBackupFolderDisplay, syncAllReceipts,
    downloadAndLocalizeReceipt, exportToJSON, maybeAutoDownloadDailyBackup,
    updateLastBackupDisplay, checkDailyBackup, buildBackupPayload, saveSystemBackups,
    loadSystemBackups, renderSystemBackups, gotoSysBackupPage, createSystemBackup,
    ensureDailySystemBackup, maybeRunDailyBackup, startDailyBackupWatcher, createSystemBackupNow,
    applyBackupData, restoreSystemBackup, _restoreBookStats, _restoreStatLine,
    restoreBookFromBackup, renderBookRestorePicker, applyBookRestore, handleBookRestoreImportFile,
    handleBackupImportFile, exportAllToCSV, _renderProductionCostFields, saveProductionCosts,
    loadProductionCosts, _renderPaymentLinkFields, savePaymentLinks, loadPaymentLinks,
    loadWebsitePaymentMethods, saveWebsitePaymentMethods, getAcceptedPaymentMethodsForBook,
    getEffectiveBookPaymentLink, renderPaymentConfig, renderBookPaymentConfig,
    switchSettingsSubTab, renderProfitSettings, psSimulateSplit, renderProfitTierList,
    psApplyTemplate, psRenderSummary, addProfitTier, removeProfitTier, updateProfitTierField,
    saveProfitTiers, calculateArtistEarnings, calculateFinancials, filterArtistEarningsByYear,
    renderFinancials, downloadTaxReport, logout, showApp, boot, changeExpenseCategory,
    _tcSaveLedgerPrefs, _tcRestoreLedgerPrefs, setTcLedgerPage, tcLedgerSearchInput,
    tcLedgerTypeFilter, tcYearChange, tcLedgerYearChange, tcClearLedgerFilters,
    _tcApplyLedgerFilter, renderTaxCenter, _tcSvgEsc, _tcDeltaChip, _tcRenderCashFlowSummary,
    _tcCashFlowBucketRows, _tcRenderSelectedCashFlowBucket, tcSelectCashFlowBucket,
    tcSetCashFlowDetailType, tcClearCashFlowBucket, _tcBuildCashFlowChart, removeLedgerEntry,
    tcSetTripsView, _tcGetTripsSummaryAll, tcRenderQuickTripChips, tcUpdateTripSelectedPreview,
    tcClearSelectedTrip, tcOpenTripDropdown, tcCloseTripDropdown, tcToggleTripDropdown,
    tcFilterTripDropdown, tcSelectTripOption, exportTripCSV, setTripBudgetPrompt,
    _tcTripRecords, _tcFindTripRecord, openNewTrip, openEditTripDetails,
    tcNewTripValidate, saveNewTrip, deleteTripRecord, logExpenseForTrip,
    exportTripPDF, _tcTripReportReceipts, _tcIsPdfName, _tcBlobToDataUrl,
    openPendingExpense, tcPendingValidate, tcPendingRemindIn, savePendingExpense,
    deletePendingExpense, snoozePendingExpense, confirmPendingExpense, _tcPendingList,
    _tcPdfToImages, _tcResolveReceiptImages, resolveLocalReceiptFile, ensurePdfJs,
    openEditTrip, saveTripAssignment, renderEditExpenseReceipts, relinkEditExpenseReceipt, removeEditExpenseReceipt,
    batchScanAndRelinkReceipts, attachReceiptToExpenseRow, tcExpenseRowDragOver, tcExpenseRowDragLeave, tcExpenseRowDrop,
    openEditSale, openEditArtistPayout, openEditExpense, saveExpenseEdit, showTripDetail,
    renameTripPrompt, showCategoryDetail, saveTaxCenterSettings, scanReceiptWithAI,
    getShippoTxCost, saveShippoLabelLocally, fetchShippoTransactionsPageAPI,
    fetchShippoObject, fetchShippoContext, getShippingReconciliationOrders,
    processShippoTxToExpense, renderShippingReconciliationWorklist, linkShippingExpense,
    closeShippingReconciliation, openShippingReconciliation, clearShippingReconciliationList,
    importShippoShippingFromApi, submitTaxExpense,
    openRecurringEditor, saveRecurringEditor, updateRecurringPreview, toggleRecurringPause,
    tcSetRecurringFilter, tcShowRecurringCharges,
    removeRecurring, downloadTaxLedgerCSV, posBooksMap, posResolveBook, isPosOnlyBook,
    _getPosDefaultCurrency, loadPosExchangeRates, savePosExchangeRates, currencyToCode,
    codeToSymbol, posFormat, convertCurrency, getPOSCurrencies, buildPOSCartRows, renderPOS,
    _showPosQR, renderPOSFxStatus, _posItemToManualPayload, renderSalesTrackerBookList,
    _stOnHandHint, _stUpdatePackTotal, _stReadPresetForm, _stApplyPresetToForm, renderStPresetPicker,
    renderQRPrintBookList, _qrpSelectedPriceCurrencies, _qrReadPresetForm,
    _qrApplyPresetToForm, renderQrPresetPicker, _posSlugId, renderPosBookModalQR, _stripeMinorToMajor,
    _stripeFriendlyType, _stripeFmtMoney, fetchStripeTransactions, aggregateStripeTransactions,
    renderStripeFeesCards, fetchStripeFeesByYear, insertStripeFeesIntoLedger,
    reconcileStripeAgainstSales, clearStoredStripeKey, downloadStripeFeesAuditCSV, getReconMemory,
    saveReconMemory, getReconStripeKey, _reconPersistKey, fetchStripePaymentsForReconcile,
    _reconRecordedChargeIds, _reconFindInvoice, _reconLikelyAlreadyLogged, classifyStripePayment,
    _reconApplySaleToBook, reconcileSync, _reconBookOptions, reconRenderKeyRow, reconEditKey,
    reconOnFilter, reconSetCurrency, reconClearFilters, _reconIsPickable, _reconMatchesFilter,
    _reconAmountBadge, _reconMeta, _reconNeedCard, _reconGroupCard, renderReconcile,
    _reconFindPayment, _reconApplyPaymentToBook, reconcileRecordSale, reconcileApplyBigCartel,
    reconcileOpenInvoice, reconcileDismiss, reconRecordGroup, reconDismissGroup,
    reconDismissAllShown, reconcileUndo, createStripePaymentLinkForBook,
    createStripePaymentLinkForAmount, generateBookStripeLink, _isCustomerSuppressed,
    loadCustomerSuppression, _persistCustomerSuppression, toggleCustomerSuppress,
    setCustomerBookFilter, mailingSubsArray, mailingListHas, loadMailingList, _persistMailingList,
    _mailingUpsert, addManualSubscriber, addBuyerToMailingList, removeFromMailingList,
    _mailingMergeBuyers, addAllBuyersToMailingList, toggleMailingAutoAdd, _mailingAutoSync,
    renderMailingList, _uniqueMailable, _openGmailBcc, emailCustomerSegment, emailMailingList,
    copyMailingListEmails, exportMailingListCSV, _loadCustomerStripeCache,
    _saveCustomerStripeCache, _custEmailKey, _custUpsert, _custAddSpend, _custTouchDate,
    buildCustomerList, _custSpendStr, _custApplyFilter, _custMailable, _custSyncBookFilterOptions,
    setCustomerChannelFilter, setCustomerSpendFilter, setCustomerOrdersFilter,
    checkMailingEmailTypo, suggestEmailTypo, applyMailingEmailCorrection, checkOcEmailTypo,
    applyOcEmailCorrection, loadCampaigns, _persistCampaigns, loadOpenCalls, _persistOpenCalls,
    migrateLegacyOpenCalls, ocCreateProject, ocRenameProject, ocDeleteProject, ocSwitchProject,
    parseMarkdownToHtml, insertFormattingTag, serializeEditorHtml, deserializeHtmlToEditor,
    ocToggleColorPalette, ocApplyColor, updateOpenCallBadges, ocApplyParsedImport_,
    handleOcCsvFile, triggerOcCsvUpload, handleOcCsvUpload, handleOcCsvDragOver,
    handleOcCsvDragLeave, handleOcCsvDrop, ocComposeStageEmail, openOcEmailPreviewModal,
    closeOcEmailPreviewModal, ocPreviewModalSend, ocPreviewModalEditInWizard, ocScanReplies,
    openOcImportGmailModal, closeOcImportGmailModal, renderOcImportGmailModal, ocImportGmailSearch,
    ocImportGmailSelectAll, ocImportGmailConfirm, ocScanRepliesSingle, ocToggleInlineThread,
    openOcEditModal, closeOcEditModal, renderOcEditModalContent, ocClearUndeliverable,
    saveOcContributor, downloadOcAttachment, ocUpdateBulkPreview, ocSaveTemplates,
    exportOpenCallCSV, switchCustomersSubTab, renderCustomers, renderCustomersAudience,
    openCampaignWizard, closeCampaignWizard, updateCampaignModeStatus, onForceMockChange,
    insertTemplateTag, updateCampaignPreview, onCampaignSegmentChange, getSegmentRecipients,
    saveCampaignDraft, editCampaignDraft, deleteCampaign, sendSingleEmailViaBackend,
    sendTestEmailCampaign, cancelCampaignSending, sendCampaignLaunch, sendNextCampaignEmail,
    finishCampaignSend, retryCampaignEmail, updateCampaignSendFinishedSummary, renderCampaigns,
    filterCustomers, customerPullStripe, customerPullDeeper, copyCustomerEmails, _custFallbackCopy,
    exportCustomersCSV, checkAppUpdate, dismissAppUpdate, fetchRecentChanges, showWhatsNew,
    initStartup, setupGate, renderWebAnalytics, updateModalAccentPreview, normalizeCountryCode,
    getAllStores, getBookPresetSpecs, initShippingTab, getRecentShippingOrders, saveShippoApiKey,
    editShippoApiKey, onShippoPreFillDestChange, prefillShippingFromBigCartelOrder, onShippoBookPresetChange, isCanadaPostRate,
    moneyAmount, roundShippingCharge, buildShippingChargePrediction,
    renderShippingChargePrediction, collectShippoMessages, renderShippoDiagnostics,
    calculateShippoRates, updateShippoBaseSpecsFromInputs, onShippoQuantityChange,
    renderShippoIncotermHint, onShippoIncotermChange, onShippoDestCountryChange,
    updateShippoCustomsTotalHint,
    buyShippoLabel, verifyDestinationAddress, applyVerifiedAddressCorrections,
    dismissAddressVerification, verifyLedgerOrderAddress, batchVerifyLedgerAddresses,
    applyLedgerAddressCorrections, downloadInventoryValuationCSV, openInventoryValuationModal, printInventoryValuationReport,
    renderShippingAnalysisHub, changeShipAnalysisPage, onShipAnalysisBookFilterChange, setShipAnalysisMarginFilter,
    onShipAnalysisSearch, onInlinePostageChange,
    confirmSuggestedShippoLink, openManualShippoLinkModal, filterManualShippoLinkRows,
    editPostageCost, unlinkManualPostage, dismissShippingAnalysisOrder, restoreShippingAnalysisOrder,
    toggleAllShipAnalysisOrders, updateShipAnalysisBatchActionUI, batchDismissShippingAnalysisOrders,
    syncBigCartelShippingPaid, triggerBigCartelShippingSync,
    toggleShipAnalysisCarrierFilter, toggleShipAnalysisRegionFilter, toggleShipAnalysisWeightFilter, clearAllShipAnalysisFilters, downloadFilteredShippingLedgerCSV,
    updateManualShippingRates, applySmartShippingRates, onShipRecoWeightSelectChange, onShipRecoCustomWeightChange, onShipRecoModeChange, onShipInsightsToggle,
    getShipRecoPercentile, setShipRecoPercentile, onShipRecoPercentileChange, updateShippingSimulation,
    toggleIntegrationSection
  });
}

exposeLegacyInlineHandlers();

// Bind to window to allow HTML onclick access
// ═══════════════════════════════════════════════════════════════════════
//  BIG CARTEL INTEGRATION (Publisher-only)
// ═══════════════════════════════════════════════════════════════════════


















// Single source of truth for the JSON:API sidecar resources (customers, shipping
// addresses, items) so every consumer resolves relationships against the same list.





window.testBigCartelConnection = testBigCartelConnection;
window.saveBigCartelSettings = saveBigCartelSettings;
window.switchBigCartelSubTab = switchBigCartelSubTab;
window.loadBigCartelData = loadBigCartelData;
window.renderBigCartelTab = renderBigCartelTab;
window.prefillShippingFromBigCartelOrder = prefillShippingFromBigCartelOrder;
window.copyBigCartelOrderAddress = copyBigCartelOrderAddress;
window.openBigCartelAddressPreview = openBigCartelAddressPreview;

window.extractBigCartelAddress = extractBigCartelAddress;
window.getFallbackShippingPhone = getFallbackShippingPhone;
window.initShippingTab = initShippingTab;
window.saveShippoApiKey = saveShippoApiKey;
window.editShippoApiKey = editShippoApiKey;
window.onShippoPreFillDestChange = onShippoPreFillDestChange;
window.renderCustomShippoDestPicker = renderCustomShippoDestPicker;
window.setShippoDestMenuOpenState = setShippoDestMenuOpenState;
window.toggleShippoDestDropdown = toggleShippoDestDropdown;
window.setShippoDestCategoryFilter = setShippoDestCategoryFilter;
window.filterShippoDestMenu = filterShippoDestMenu;
window.selectShippoDestCustomItem = selectShippoDestCustomItem;
window.clearShippoDestSelection = clearShippoDestSelection;
window.onShippoBookPresetChange = onShippoBookPresetChange;
window.calculateShippoRates = calculateShippoRates;
window.updateShippoBaseSpecsFromInputs = updateShippoBaseSpecsFromInputs;
window.onShippoQuantityChange = onShippoQuantityChange;
window.renderShippoIncotermHint = renderShippoIncotermHint;
window.onShippoIncotermChange = onShippoIncotermChange;
window.onShippoDestCountryChange = onShippoDestCountryChange;
window.updateShippoCustomsTotalHint = updateShippoCustomsTotalHint;
window.buyShippoLabel = buyShippoLabel;
window.verifyDestinationAddress = verifyDestinationAddress;
window.applyVerifiedAddressCorrections = applyVerifiedAddressCorrections;
window.dismissAddressVerification = dismissAddressVerification;
window.verifyLedgerOrderAddress = verifyLedgerOrderAddress;
window.batchVerifyLedgerAddresses = batchVerifyLedgerAddresses;
window.applyLedgerAddressCorrections = applyLedgerAddressCorrections;
window.downloadInventoryValuationCSV = downloadInventoryValuationCSV;
window.renderShippingAnalysisHub = renderShippingAnalysisHub;
window.changeShipAnalysisPage = changeShipAnalysisPage;
window.onShipAnalysisBookFilterChange = onShipAnalysisBookFilterChange;
window.setShipAnalysisMarginFilter = setShipAnalysisMarginFilter;
window.onShipAnalysisSearch = onShipAnalysisSearch;
window.onInlinePostageChange = onInlinePostageChange;
window.confirmSuggestedShippoLink = confirmSuggestedShippoLink;
window.openManualShippoLinkModal = openManualShippoLinkModal;
window.filterManualShippoLinkRows = filterManualShippoLinkRows;
window.doManualShippoLink = doManualShippoLink;
window.closeManualShippoLinkModal = closeManualShippoLinkModal;
window.unlinkShippoExpense = unlinkShippoExpense;
window.editPostageCost = editPostageCost;
window.unlinkManualPostage = unlinkManualPostage;
window.dismissShippingAnalysisOrder = dismissShippingAnalysisOrder;
window.restoreShippingAnalysisOrder = restoreShippingAnalysisOrder;
window.toggleAllShipAnalysisOrders = toggleAllShipAnalysisOrders;
window.updateShipAnalysisBatchActionUI = updateShipAnalysisBatchActionUI;
window.batchDismissShippingAnalysisOrders = batchDismissShippingAnalysisOrders;
window.syncBigCartelShippingPaid = syncBigCartelShippingPaid;
window.triggerBigCartelShippingSync = triggerBigCartelShippingSync;
window.toggleShipAnalysisCarrierFilter = toggleShipAnalysisCarrierFilter;
window.toggleShipAnalysisRegionFilter = toggleShipAnalysisRegionFilter;
window.toggleShipAnalysisWeightFilter = toggleShipAnalysisWeightFilter;
window.clearAllShipAnalysisFilters = clearAllShipAnalysisFilters;
window.downloadFilteredShippingLedgerCSV = downloadFilteredShippingLedgerCSV;
window.onShipRecoWeightSelectChange = onShipRecoWeightSelectChange;
window.onShipRecoCustomWeightChange = onShipRecoCustomWeightChange;
window.onShipRecoModeChange = onShipRecoModeChange;
window.onShipInsightsToggle = onShipInsightsToggle;
window.getShipRecoPercentile = getShipRecoPercentile;
window.setShipRecoPercentile = setShipRecoPercentile;
window.onShipRecoPercentileChange = onShipRecoPercentileChange;
window.updateShippingSimulation = updateShippingSimulation;

// `items` alone never returns the recipient phone — it lives on the customer /
// shipping_address resources, which only arrive when they are explicitly included.



// Pulls one order straight from Big Cartel with its contact resources attached.
// Used to recover a recipient phone the cached list payload never carried.

// Write a recovered phone back into memory, the destination picker, and the
// localStorage cache so the next prefill of this order is instant and offline-safe.

// Fills a blank recipient phone from Big Cartel after the form has been prefilled.



if (window._fbReady) { initStartup(); }
else { document.addEventListener('firebase-ready', initStartup); }
