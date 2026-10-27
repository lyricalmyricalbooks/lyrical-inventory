// Must stay the first import: isolates the Test Profile before anything else runs.
import { TEST_PROFILE_ACTIVE } from './test-profile-boot.js';
// Design system foundation (tokens + interaction baseline) loads first so that
// unlayered legacy rules in style.css keep winning on any conflict.
import './styles/system.css';
import './style.css';
// Dark theme loads LAST: it re-points the primitives every rule above resolves
// against, and its component corrections have to out-specify style.css.
import './styles/theme-dark.css';
import './styles/phone.css';
// The Riso phone redesign sits on top of the phone layer above.
import './styles/phone-riso.css';
import { phoneBooksHtml } from './lib/phone-books.js';
import { foldFooterActions, initPhoneLayouts } from './lib/phone-layout.js';
import { createPhonePageMemory, initPhoneWorkspace, observeSidebarBadges } from './lib/phone-workspace.js';
const phonePages = createPhonePageMemory(window);
initPhoneWorkspace(document.getElementById('pw-app'));
// Body, not #pw-app: the pop-up windows are siblings of the app shell.
initPhoneLayouts(document.body);
import './firebase.js';
import { applyReceiptAddition, isReceiptAddition, receiptAdditionApplied } from './lib/expense-receipts.js';
import { TEST_PROFILE_FLAG, SAMPLE_BOOK_ID, clearTestStorage, isSampleDataSeeded, markSampleDataSeeded } from './lib/test-profile.js';
import { installGasAuth } from './lib/gas-auth.js';
installGasAuth(() => (typeof window._fbGetIdToken === 'function' ? window._fbGetIdToken() : ''));
import { registerSW } from 'virtual:pwa-register';
import { calcArtistEarnings, tierEffectiveCap } from './lib/earnings.js';
import { planArtistSettlement, applyArtistSettlement, planSettlementForPayment, expensesInSettleUp, pricedExpensesTag, pricedExpensesFromTag } from './lib/artist-settlement.js';
import { restoreRecords } from './lib/storage-mode.js';
import { createStripePriceAndLink } from './lib/stripe-payment-link.js';
import { createStripeRateResolver, stripeOrderNumber } from './lib/stripe-sale-defaults.js';
import { calculateBreakEven, breakEvenTierMove, applyBreakEvenTierMove, readProductionCostInput } from './lib/breakeven.js';
import { escapeHtml, safeHttpUrl } from './lib/html.js';
import { planSheetsConnectionSync } from './lib/sheets-url.js';
import { legacyCopy } from './lib/clipboard.js';
import { needsSettleUp, settleByHandMenu } from './lib/settle-up-view.js';
import { normalizeLetterhead, renderLetterhead } from './lib/letterhead.js';
import { bookSizeMessage, bookSizeReport } from './lib/book-size.js';
import { keepPreviewEdits } from './lib/tax-center-preview.js';
import { importDateIssues, latestImport, newImportId, parseImportDate } from './lib/import-batch.js';
import { ensureXlsx, loadExternalScript } from './lib/external-scripts.js';
import { buildActivityFeed } from './lib/activity-feed.js';
import { buildAttentionSignals, SIGNAL_GROUPS, GROUP_LABELS, GROUP_ICONS, isUrgent } from './lib/attention-signals.js';
import {
  RECEIPT_SCAN_SCHEMA,
  _applyScanCategory,
  _applyScanCurrency,
  _buildReceiptScanPrompt,
  _callGeminiForReceipts,
  _emailBodyToReceiptFile,
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
  applyDirectGmailPresetQuery,
  addReceiptsFromModal,
  addReceiptsToExpense,
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
  calcExpenseFx,
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
  importEmailReceiptDrafts,
  importDirectGmailEmails,
  inferReceiptCategory,
  listCachedReceiptMeta,
  listFilesRecursive,
  loadGmailInboxDrafts,
  loadReceiptFolderHandle,
  localizeInboxReceiptFiles,
  makeReceiptPreview,
  normalizeReceiptDate,
  onExpenseCurrencyChange,
  openBatchExpenseModal,
  openBlobInTab,
  openCloudReceiptsModal,
  openEmailReceiptImportModal,
  openExpenseReceipts,
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
  removeReceiptFromExpense,
  renderBatchExpenseModal,
  renderBatchExpenseRows,
  renderEmailPreviewContent,
  renderEmailReceiptDrafts,
  renderExpenses,
  renderGmailChips,
  renderGmailEmailsList,
  renderDirectGmailChips,
  renderDirectGmailEmailsList,
  renderOrganizerTable,
  renderReceiptCacheStatus,
  renderReceiptFolderAlert,
  closeReceiptFolderAlert,
  renderReceiptProblemPanel,
  requestBulkReimbursement,
  applyBatchScanFix,
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
  searchDirectGmailEmails,
  searchGmailEmails,
  setBatchExpenseDest,
  setupReceiptFolder,
  startEmailInboxWatcher,
  submitBatchExpenses,
  submitExpense,
  summarizeReceiptProblems,
  switchEmailImportTab,
  handleEmailImportPrimaryAction,
  toggleAllBatchExpenses,
  toggleAllEmailDrafts,
  toggleAllGmailSelections,
  toggleAllDirectGmailSelections,
  toggleDirectEmailPreview,
  toggleDirectGmailSelection,
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
  dismissEmailReceiptDraft,
  openReceiptSweepReviewFromAlert,
  fileReadyReceiptsFromAlert,
  startReceiptEmailSweep,
  sweepReceiptEmails,
} from './features/receipts.js';
import {
  appendCurrencyLog,
  applyCurrencyChange,
  bookCurrencyCode,
  collectNativeAmounts,
  describePlan,
  detectCurrencyMismatch,
  planCurrencyChange,
  stampNativeCurrency,
} from './lib/currency-migration.js';
import {
  _modalFieldSig,
  _prefersReducedMotion,
  attemptCloseModal,
  clearFieldError,
  clearFieldErrors,
  closeM,
  configureModals,
  confirmDialog,
  fieldError,
  openM,
  promptDialog,
  refreshUnsavedMarkers,
  rebaselineModal,
  modalFieldsChanged,
  topOpenModalId,
  validateFields,
} from './lib/modal.js';
import { installBackClose } from './lib/back-close.js';
import { salesForDay, unsentSalesForDay } from './lib/today-summary.js';
import { dismissAppAlert, markAppAlertReviewed, pushAppAlert } from './lib/app-alert.js';
import {
  initDeviceNotify,
  notifyDevice,
  renderDeviceNotifySwitches,
  setAppIconBadge,
  setDeviceNotifyOpener,
  toggleDeviceNotify,
} from './lib/device-notify.js';
import { booksInDescription, saleCodes, splitSalePlan } from './lib/sale-codes.js';
import { describeMarketDay, latestMarketDay, summariseMarketDay } from './lib/market-day.js';
import { checkMarketCards, describeMarketCards } from './lib/market-card-check.js';
import { unshippedOrders } from './lib/order-followups.js';
import {
  clearNotificationLog,
  logNotification,
  markInformationalNotificationsRead,
  markNotificationKindRead,
  newlyUrgent,
  dropFalseStockNotifications,
  notificationDayLabel,
  notificationSource,
  readSeenUrgent,
  writeSeenUrgent,
  readNotificationLog,
  removeNotification,
  pruneResolvedNotifications,
  unreadNotificationCount,
} from './lib/notification-log.js';
import {
  describeCardSales,
  describeRefunds,
  refundsToRaise,
  stripeSalePlan,
  paidUnitPrice,
  wholeCopies,
} from './lib/stripe-sale-autorecord.js';
import {
  integrationBackoffMs,
  noteIntegrationFailure,
  noteIntegrationSuccess,
  renderIntegrationBadges,
} from './lib/integration-watch.js';
import {
  browserWatchState,
  dueForCheck,
  effectiveInterval,
  startWatch,
} from './lib/watch-schedule.js';
import { expensesWithSettlements, isGratuityExpense } from './lib/receipt-storage.js';
import {
  SYNC_CONFLICTS_KEY, recordConflicts, listConflicts, dismissConflict, locateConflictTarget,
  applyConflictRestore, describeRecord, renderConflictListHtml, describeConflictCount,
} from './lib/sync-conflicts.js';
import {
  PAYMENT_TYPE_DIRECT_TO_ARTIST,
  buildPaymentMeta,
  cadEquivalentForSale,
  fmt,
  fmtWhole,
  fmtD,
  getBookCurrencyCode,
  getContrastSafeText,
  getPaperSafeText,
  getAccentFillPair,
  getSym,
  hexToRgba,
  isDirectToArtistSale,
  transferAmount,
  transferQtyLabel,
  lightenColor,
  normalizeCurrencyCode,
  paymentSummary,
  roundCents,
  putCurrencyFirst,
  setSelectCurrency,
  PICKER_CURRENCIES,
} from './lib/money.js';
import { sumMoney } from './lib/cents.js';
import { localDay, localDayPlus } from './lib/calendar-day.js';
import {
  buildPartPaymentNote,
  describeInvoicePaymentReversal,
  describeInvoicePaymentSweep,
  invoicePaymentRef,
  isZeroDecimalCurrency,
  judgeInvoicePayment,
  minorToMajor,
  partPaymentAlreadyNoted,
  verdictNeedsAttention,
  verdictSettles,
} from './lib/invoice-payments.js';
import {
  THEME_LABELS,
  THEME_PREFERENCES,
  applyThemeToDocument,
  nextThemePreference,
  normalizeThemePreference,
  oppositeThemePreference,
  readThemePreference,
  writeThemePreference,
} from './lib/theme.js';
import { initStickyOffset } from './lib/sticky-header.js';
import { SYNC_TONES, describeSyncStatus } from './lib/sync-status.js';
import { STARTUP_HISTORY_KEY, recordStartup, describeStartup } from './lib/startup-timing.js';
import { DEVICE_COPY_KEY, describeCopyAge } from './lib/device-copy.js';
import {
  getLocalStorage, loadSyncQueue, persistSyncQueue, queueKeyFor, getSyncTabId, markTabAlive, markTabGone,
  readOrphanQueues, releaseOrphanKeys, pickNextSyncItem, SYNC_TAB_HEARTBEAT_MS, isOrphanQueueKey,
} from './lib/sync-queue-store.js';
import { createSyncOverflowStore } from './lib/sync-queue-overflow.js';
import { partHashesOf } from './lib/merge-state.js';
import { loadFxHistory, saveFxHistory, datesNeedingRates, fillDatedRates, datedRateKey } from './lib/sale-fx.js';
import { consignmentSaleAmounts, expectedConsignmentPayment, consignmentPaymentRecord, consignmentFxSummary, splitConsignmentPayment, storeSaleCurrency } from './lib/consignment-fx.js';
import { DATED_RATE_SOURCES, frankfurterUrl } from './lib/fx-sources.js';
import {
  _tcApplyLedgerFilter,
  _tcBlobToDataUrl,
  _tcBuildCashFlowChart,
  _tcCashFlowBucketRows,
  _tcClearConfirmedPending,
  _tcDeltaChip,
  _tcFindTripRecord,
  _tcGetTripsSummaryAll,
  _tcIsPdfName,
  _tcPdfToImages,
  _tcPendingList,
  _tcRenderCashFlowSummary,
  _tcRenderReceiptGallery,
  _tcRenderSelectedCashFlowBucket,
  _tcResolveReceiptImages,
  _tcRestoreLedgerPrefs,
  _tcSaveLedgerPrefs,
  _tcTripRecords,
  _tcTripReportReceipts,
  confirmPendingExpense,
  deletePendingExpense,
  deleteTripRecord,
  dismissReceiptNotice,
  downloadTaxLedgerCSV,
  downloadTaxReport,
  executeFullTaxSeasonExport,
  exportTripPDF,
  logExpenseForTrip,
  openEditArtistPayout,
  openEditTripDetails,
  openNewTrip,
  openPendingExpense,
  openReceiptLightbox,
  addRecurringRateChange,
  openRecurringEditor,
  openTaxSeasonPreflightModal,
  processRecurringExpenses,
  removeRecurring,
  removeRecurringRateChange,
  renderTaxCenter,
  resetDismissedReceiptNotices,
  saveNewTrip,
  savePendingExpense,
  saveRecurringEditor,
  saveTaxCenter,
  saveTaxCenterSettings,
  testOpenRouterConnectionFromSettings,
  testZonosConnectionHandler,
  testChitChatsConnectionHandler,
  testCanadaPostConnectionHandler,
  diagnoseCanadaPostHandler,
  renderCanadaPostKeySets,
  setTcGalleryPage,
  setTcLedgerPage,
  snoozePendingExpense,
  switchTaxCenterSubTab,
  tcClearCashFlowBucket,
  tcClearLedgerFilters,
  tcClearSelectedTrip,
  tcCloseTripDropdown,
  tcExpFileChosen,
  tcExpFileClear,
  tcExpFileDragLeave,
  tcExpFileDragOver,
  tcExpFileDrop,
  tcExpenseRowDragLeave,
  tcExpenseRowDragOver,
  tcExpenseRowDrop,
  tcFilterLedgerByReceiptStorage,
  tcFilterTripDropdown,
  tcGalleryFilterChange,
  tcGallerySearchInput,
  tcJumpToFixPreflightIssues,
  tcLedgerSearchInput,
  tcLedgerTypeFilter,
  tcLedgerYearChange,
  tcLightboxNav,
  tcLightboxReset,
  tcLightboxRotate,
  tcLightboxZoom,
  tcNewTripValidate,
  tcOpenTripDropdown,
  tcPendingRemindIn,
  tcPendingValidate,
  tcRenderQuickTripChips,
  tcSelectCashFlowBucket,
  tcSelectTripOption,
  tcSetCashFlowDetailType,
  tcSetRecurringFilter,
  tcSetTripsView,
  tcSetVaultView,
  tcShowRecurringCharges,
  tcCloseSubscriptionDoublesNote,
  tcKeepRecurringDay,
  tcMoveRecurringDay,
  tcReviewSubscriptionDoubles,
  tcSubNavKeydown,
  tcToggleTripDropdown,
  tcUpdateTripSelectedPreview,
  tcYearChange,
  toggleRecurringPause,
  updateRecurringPreview,
  dismissDeductionGap,
  renderDeductionGaps,
  restoreDeductionGaps,
  snoozeDeductionGap,
} from './features/taxcentre.js';
import {
  reconcileApplyBigCartel,
  autoCheckBigCartelLedgerGaps,
  startBigCartelOrderWatch,
  refreshBigCartelOrdersIfDue,
  dismissNewOrderAlert,
  recordNewOrderFromAlert,
  toggleBigCartelAutoRecord,
  toggleBigCartelOrderNotify,
  shipNewOrderFromAlert,
  reviewNewOrdersFromAlert,
  checkBigCartelLedgerGaps,
  extractBigCartelAddress,
  renderBigCartelLedgerGaps,
  renderBigCartelTab,
  restoreBigCartelGaps,
  dismissAllBigCartelGaps,
  testBigCartelConnection,
  saveBigCartelSettings,
  loadBigCartelData,
  prefillShippingFromBigCartelOrder,
  switchBigCartelSubTab,
  syncBigCartelShippingPaid,
  toggleBigCartelGapPanel,
  triggerBigCartelShippingSync,
  bigCartelOrdersToReview,
  bigCartelActions,
} from './features/bigcartel.js';
import {
  acceptIntelDisclosure,
  toggleIntelPrivacyDetails,
  clearIntelThread,
  intelActions,
  intelComposerKey,
  renderIntel,
  sendIntelMessage,
  stopIntelTurn,
} from './features/intel.js';
import {
  getShippingReconciliationOrders,
  renderOrderShippingSummary,
  backfillShipping,
  _toggleShippingPanel,
  openLabelModal,
  renderLabelCountryHint,
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
  clearShippingReconciliationList,
  linkShippingExpense,
  renderPostageMatchWorklist,
  onPostageRecipientInput,
  linkPostageExpense,
  autoMatchPostageReceipts,
  dismissPostageExpense,
  scanPostageReceipt,
  scanAllPostageReceipts,
  promptLedgerTracking,
  openRecoverWebsiteOrder,
  onRecoverWebsiteOrderBookChange,
  saveRecoverWebsiteOrder,
  processShippoTxToExpense,
  importShippoShippingFromApi,
  openShippoLabel,
  getBookPresetSpecs,
  initShippingTab,
  openSaveBookPresetModal,
  confirmSaveBookPreset,
  renderSaveBookPresetPreview,
  getFallbackShippingPhone,
  renderCustomShippoDestPicker,
  setShippoDestMenuOpenState,
  toggleShippoDestDropdown,
  setShippoDestCategoryFilter,
  filterShippoDestMenu,
  selectShippoDestCustomItem,
  shipNextOrder,
  closePurchasedLabelPanel,
  closeLiveReadinessChecklist,
  shipQueuedOrder,
  hideQueuedOrder,
  unhideQueuedOrder,
  closeShipQueueCard,
  toggleShipQueueHidden,
  clearShippoDestSelection,
  getRecentShippingOrders,
  saveShippoApiKey,
  editShippoApiKey,
  onShippoPreFillDestChange,
  onShippoBookPresetChange,
  onShippoAutoQuoteToggle,
  linkConfidentShippingMatchesNow,
  openShippingReconciliationFromAlert,
  openPostageAmountEditor,
  discardImportedPostageExpense,
  startShippoLabelWatch,
  startCanadaPostSweep,
  sweepCanadaPostShipments,
  startShippingEmailSweep,
  startDeliveryWatch,
  startOrderFollowups,
  openShippingFromUnshippedAlert,
  openShippingPricesFromAlert,
  openShippingFromDeliveryAlert,
  sweepShippingEmails,
  refreshShippoLabelsIfDue,
  applyOrderPrefill,
  isCanadaPostRate,
  moneyAmount,
  roundShippingCharge,
  buildShippingChargePrediction,
  renderShippingChargePrediction,
  renderShippoIncotermHint,
  onShippoIncotermChange,
  onShippoDestCountryChange,
  updateShippoCustomsTotalHint,
  collectShippoMessages,
  renderShippoDiagnostics,
  buyShippoLabel,
  openBatchShipping,
  checkBatchOrders,
  buyBatchLabels,
  toggleBatchRow,
  openBatchRowInForm,
  requestLabelRefund,
  markLabelRefundArrived,
  printBatchLabels,
  calculateShippoRates,
  calculateZonosDutiesHandler,
  renderZonosDutyCard,
  onZonosDeclarationIdInput,
  pasteZonosDeclarationId,
  checkCanadaPostAccountAndPinHandler,
  verifyShippedTrackingPinsHandler,
  showArchivedCanadaPostLabels,
  reprintArchivedCanadaPostLabel,
  openZonosPrepayAppHandler,
  calculateCanadaPostRatesHandler, calculateChitChatsRatesHandler,
  importChitChatsShippingHandler,
  renderCanadaPostRatesCard,
  buyCanadaPostLabelHandler,
  openCanadaPostPurchasedLabel,
  showCanadaPostLabelModal,
  retryFetchCanadaPostLabelArtifact,
  closeCanadaPostLabelModal,
  printCanadaPostLabelModal,
  downloadCanadaPostLabelModal,
  copyCanadaPostPin,
  voidCanadaPostLabelAction,
  checkLiveShippingReadinessHandler,
  renderLiveReadinessChecklist,
  renderZonosAccountKeyHint,
  editPostageCost,
  unlinkManualPostage,
  dismissShippingAnalysisOrder,
  markShippingOrderLocalPickup,
  unmarkShippingOrderLocalPickup,
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
  onInlineShippingPaidChange,
  unlinkManualShippingPaid,
  confirmSuggestedShippoLink,
  openManualShippoLinkModal,
  filterManualShippoLinkRows,
  doManualShippoLink,
  closeManualShippoLinkModal,
  unlinkShippoExpense,
  findShippoReceipts,
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
  verifyDestinationAddress,
  applyVerifiedAddressCorrections,
  dismissAddressVerification,
  verifyLedgerOrderAddress,
  batchVerifyLedgerAddresses,
  applyLedgerAddressCorrections,
  ordersWithLabels,
} from './features/shipping.js';
import {
  BOOKS, BOOK_LIST, states, activeBook, setBooks, refreshBookList, setActiveBook,
  defaultState, getState, getBook, withActiveBook,
  announceBookChanged, announceBookSaved, onBookEvent,
} from './core/store.js';
import { lazyFeature } from './lib/lazy-feature.js';
import { registerActions } from './lib/actions.js';
import { OPEN_CALL_EXPORTS } from './lib/opencall-handlers.js';
import { parseMarkdownToHtml } from './lib/markdown.js';

// Open Call is a publisher-only screen and a sixth of the app's code, so it is
// its own file, fetched after the first paint rather than inside the first
// download. Inline handlers reach it through window stubs until it arrives
// (registered with the other handlers below); main.js and customers.js call it
// through openCallScreen.call / .get.
// Still re-exported for the screens that take them from main.js; new code
// imports them from ./core/store.js directly.
export { BOOKS, BOOK_LIST, states, activeBook, defaultState, getState, getBook, withActiveBook };

// Buttons that name an action (data-action) instead of carrying inline code;
// see lib/actions.js. Screens move onto this one at a time.
registerActions({
  ...intelActions, ...bigCartelActions,
  // The Settle up ledger's per-receipt button. Ids come back as strings from
  // the data attribute, so the expense is found by its string form.
  'settleUp.markExpenseReceived': el => {
    const e = (getState().expenses || []).find(x => String(x.id) === el.dataset.id);
    if (e) markExpenseReceived(e.id);
  },
  // The money card's own buttons.
  'moneyCard.askPayLink': () => askAuthorForPayLink(),
  'moneyCard.setUpPayLink': () => goToPayLinkSetup(),
  'moneyCard.requestPayout': el => requestArtistPayout(el.dataset.book),
  // On a phone the records under a ledger line start folded.
  'settleUp.toggleItems': el => {
    const list = document.getElementById(el.getAttribute('aria-controls'));
    if (!list) return;
    const open = list.hidden;
    list.hidden = !open;
    el.setAttribute('aria-expanded', String(open));
    el.firstChild.textContent = open ? el.firstChild.textContent.replace(/^Show/, 'Hide') : el.firstChild.textContent.replace(/^Hide/, 'Show');
  },
});

export const openCallScreen = lazyFeature(() => import('./features/opencall.js'), OPEN_CALL_EXPORTS, {
  onError: (e) => {
    console.warn('Open Call failed to load', e);
    showToast('⚠ Open Call couldn’t load. Check your connection and try again, or reload the app.', 'err', 7000);
  },
});
import {
  MAILING_LIST,
  _customerSuppress,
  _setMailingList,
  _setCustomerSuppress,
  _isCustomerSuppressed,
  loadCustomerSuppression,
  _persistCustomerSuppression,
  toggleCustomerSuppress,
  setCustomerBookFilter,
  mailingSubsArray,
  mailingListHas,
  loadMailingList,
  _persistMailingList,
  _mailingUpsert,
  addManualSubscriber,
  addBuyerToMailingList,
  removeFromMailingList,
  _mailingMergeBuyers,
  addAllBuyersToMailingList,
  toggleMailingAutoAdd,
  _mailingAutoSync,
  renderMailingList,
  focusMailingListAdd,
  _uniqueMailable,
  _openGmailBcc,
  emailCustomerSegment,
  emailMailingList,
  copyMailingListEmails,
  exportMailingListCsv,
  exportMailingListCSV,
  _loadCustomerStripeCache,
  _saveCustomerStripeCache,
  _custEmailKey,
  _custUpsert,
  _custAddSpend,
  _custTouchDate,
  buildCustomerList,
  _custSpendStr,
  _custApplyFilter,
  _custMailable,
  _custSyncBookFilterOptions,
  setCustomerChannelFilter,
  setCustomerSpendFilter,
  setCustomerOrdersFilter,
  _custFilterState,
  _custActiveFilters,
  clearCustomerFilter,
  clearCustomerFilters,
  _renderCustFilterBar,
  checkMailingEmailTypo,
  suggestEmailTypo,
  applyMailingEmailCorrection,
  loadCampaigns,
  _persistCampaigns,
  switchCustomersSubTab,
  renderCustomers,
  renderCustomersAudience,
  _custEmptyHtml,
  openCampaignWizard,
  closeCampaignWizard,
  updateCampaignModeStatus,
  onForceMockChange,
  insertTemplateTag,
  updateCampaignPreview,
  onCampaignSegmentChange,
  getSegmentRecipients,
  saveCampaignDraft,
  editCampaignDraft,
  deleteCampaign,
  sendSingleEmailViaBackend,
  sendTestEmailCampaign,
  cancelCampaignSending,
  sendCampaignLaunch,
  sendNextCampaignEmail,
  finishCampaignSend,
  retryCampaignEmail,
  updateCampaignSendFinishedSummary,
  renderCampaigns,
  filterCustomers,
  toggleCustFold,
  customerPullStripe,
  customerPullDeeper,
  copyCustomerEmails,
  exportCustomersCSV,
} from './features/customers.js';
import {
  activePOSSubTab,
  renderSalesTrackerBookList,
  _stOnHandHint,
  _stUpdatePackTotal,
  _stReadPresetForm,
  _stApplyPresetToForm,
  renderQRPrintBookList,
  _qrpSelectedPriceCurrencies,
  _qrReadPresetForm,
  _qrApplyPresetToForm,
  renderFairKitBookList,
  renderFairKitPresetPicker,
  fairKitPresets,
  findFairKitPreset,
  fairKitPresetSummary,
  fairKitMode,
  _fkBookPrintsQR,
  _fkSelectionCounts,
  _fkPackedTotal,
  _fkUpdateSummary,
  _fkOpenQrPrintWindow,
  switchPOSSubTab,
  fairKitSearchFilter,
  salesTrackerQtyInput,
  openFairKitModal,
  fairKitSelectAll,
  fkFocusFirstGap,
  salesTrackerAddCustom,
  salesTrackerRemoveCustom,
  fkPresetSelected,
  fkSaveFairPreset,
  fkDeleteFairPreset,
  fairKitSelectionChanged,
  fairKitModeChanged,
  printSalesTracker,
  printPaymentQRCodes,
  printFairKit,
} from './features/fair-kit.js';
import {
  setInventoryAdjustmentMode,
  openInventoryWriteOffModal,
  onWriteOffBookChange,
  recalcWriteOffValue,
  submitInventoryWriteOff,
  downloadInventoryValuationCSV,
  openInventoryValuationModal,
  printInventoryValuationReport,
} from './features/inventory-valuation.js';
import {
  _posSlugId,
  renderPosBookModalQR,
  openPosBookModal,
  closePosBookModal,
  generatePosBookStripeLink,
  copyPosBookLink,
  downloadPosBookQR,
  savePosBook,
  removeCurrentPosBook,
  removePosBook,
} from './features/pos-books.js';
import {
  _stripeMinorToMajor,
  _stripeFriendlyType,
  _stripeFmtMoney,
  fetchStripeTransactions,
  aggregateStripeTransactions,
  renderStripeFeesCards,
  fetchStripeFeesByYear,
  insertStripeFeesIntoLedger,
  sweepStripeFees,
  startStripeFeeWatch,
  reconcileStripeAgainstSales,
  clearStoredStripeKey,
  downloadStripeFeesAuditCSV,
} from './features/stripe-fees.js';
import {
  posBooksMap,
  posResolveBook,
  currencyToCode,
  convertCurrency,
  renderPOS,
  _getPosDefaultCurrency,
  _posItemToManualPayload,
  _showPosQR,
  buildPOSCartRows,
  codeToSymbol,
  fairSetAwake,
  fairTotalsText,
  getPOSCurrencies,
  isPosOnlyBook,
  loadPosExchangeRates,
  posFormat,
  renderPOSFxStatus,
  savePosExchangeRates,
  initPos,
  posSearchFilter,
  fairOpenCharge,
  fairShowQR,
  fairOpenToday,
  fairVoidSale,
  fairSetName,
  fairTileNoneLeft,
  fairOpenSummary,
  fairShareSummary,
  fairCharge,
  fairUndoLastSale,
  posPickPayment,
  posMobileView,
  posUpdateQty,
  posRemoveItem,
  openPosPriceModal,
  posPriceQuick,
  posPricePreview,
  savePosPrice,
  posResetPrice,
  copyPosQRLink,
  downloadPosQR,
  posGenerateSaleQR,
  posGenerateLineQR,
  posSetCurrency,
  fairSetCurrency,
  posConfigureRates,
  posCheckout,
  posConfirmSale,
  posPrintReceipt,
  posSyncPaymentSeg,
} from './features/pos.js';
import {
  changeExpenseCategory,
  exportTripCSV,
  openEditExpense,
  openEditSale,
  openEditTrip,
  relinkEditExpenseReceipt,
  removeEditExpenseReceipt,
  removeLedgerEntry,
  renameTripPrompt,
  renderEditExpenseReceipts,
  saveExpenseEdit,
  saveTripAssignment,
  scanReceiptWithAI,
  setTripBudgetPrompt,
  showCategoryDetail,
  showTripDetail,
  submitTaxExpense,
  initTaxEntries,
  snapReceipt,
  snapReceiptChosen,
  downloadFullTaxSeasonExport,
} from './features/tax-entries.js';
import {
  addInvoiceBookLine,
  addInvoiceItem,
  applyDiscountPreset,
  applyInvoiceDueTerm,
  applyInvoicePaid,
  buildInvoiceEmailHTML,
  buildInvoicePdfAttachment,
  buildStandaloneInvoiceHTML,
  collectInvoicePaperCss,
  copyInvoiceEmailToClipboard,
  copyInvoicePayLink,
  createStripePaymentLinkForInvoice,
  currentViewInvoiceId,
  deactivateStripePaymentLink,
  deleteInvoice,
  downloadInvoiceHTML,
  downloadInvoicePDF,
  duplicateInvoiceFromView,
  editInvoiceFromView,
  effectivePaymentLink,
  emailInvoice,
  ensurePdfJs,
  ensurePdfLibs,
  focusLastInvoiceLine,
  getInvoiceCurrency,
  getInvoiceSettings,
  invoiceEmailPlainText,
  invoiceHome,
  invoiceOwnerBook,
  invoicePaperBodyWithQR,
  invoicesVisibleHere,
  isDynamicStripeLink,
  markInvoicePaidFromView,
  nextInvoiceNumber,
  onDiscountInput,
  onDiscountTypeChange,
  onInvoiceCurrencyChange,
  onInvoiceDueDateChange,
  onInvoiceIssueDateChange,
  onInvoiceLineKey,
  onInvoiceStoreChange,
  openCreateInvoice,
  openInvoiceTemplateSettings,
  prefillFromPendingSales,
  printInvoice,
  printInvoiceViaPopup,
  recalcInvoiceTotals,
  regenerateStripeLinkFromView,
  removeInvoiceItem,
  renderInvoiceItems,
  renderInvoicePaperHTML,
  renderInvoices,
  saveInvoice,
  saveInvoiceSettings,
  saveInvoiceSettingsObj,
  setInvoiceBillToMode,
  updateInvoiceItem,
  viewInvoice,
} from './features/invoices.js';
import {
  undoRecordedArtistSettlement,
  editArtistPayout,
  shareArtistSettlement,
  toggleArtistPayoutForm,
  fillArtistPayoutFull,
  previewArtistPayout,
  onArtistPayoutNetChange,
  onArtistPayoutCurrencyChange,
  saveArtistPayout,
  requestArtistPayout,
  deleteArtistPayout,
  toggleArtistSettlementForm,
  copyArtistSettlement,
  recordArtistSettlement,
  _revMemo,
  dismissStockDrift,
  getArtistHeldHtml,
  getOwedCardDetails,
  getPayoutHistoryHtml,
  getProfitTiersHtml,
  getRevenueProgressHtml,
  heldGrossOf,
  recognizedRevenueOf,
  renderBookPendingAlert,
  renderProfitSharingBreakdown,
  settlePayoutRequests,
  syncArtistSettlementSales,
  updateDash,
} from './features/dashboard.js';
import {
  addSaleToState,
  recordOrder,
  recordOrderPendingTransfer,
  syncHistoryVoidDeletion,
  unvoidHistEntry,
  voidHistEntry,
  writeOrderToLedger,
} from './features/sales-ledger.js';
import {
  openReviewInbox,
  renderReviewInbox,
  reviewInboxIsOpen,
  reviewQueueSnapshot,
} from './features/review-inbox.js';
import {
  noteBookAddedFromWebsite,
  scheduleWebsiteFeedPublish,
  startWebsiteLink,
  websiteLinkActive,
  websiteLinkTodo,
} from './features/website-link.js';
import { STRIPE_CHARGE_PI_KEY, isWebsiteFulfilled, promisedPreorders, rememberChargeIntents } from './lib/website-link.js';
import { startAppSearch } from './features/app-search.js';
import { appSwitchBooksReady, openWebsiteDetailDiffs, openWebsiteShopBooks, refreshAppSwitch, startAppSwitch } from './features/app-switch.js';
import { WEBSITE_TAB_NAME, openOnWebsiteHtml, websiteOrderUrl } from './lib/app-switch.js';
import { reviewTaskStillOpen } from './lib/review-queue.js';
import {
  clearSimulatedSheet,
  renderMockSpreadsheet,
  selectSimSheetTab,
  simulatePostToSheets,
  updateSheetsTabUI,
} from './features/sheets-simulator.js';
import {
  _processQueue,
  _sheetsQueue,
  addSheetsLog,
  backfillAndResync,
  backfillSheetsIds,
  copyGasCode,
  emailArtistForPayment,
  fetchSheetsCapabilities,
  loadGasCode,
  makeEventId,
  notifyPublisherSubmission,
  orderRowPayload,
  persistSheetsLog,
  persistSheetsQueue,
  postToSheets,
  pushAllToSheets,
  renderSheetsLog,
  retryDelayMs,
  queueSheetsRename,
  scheduleMoneyOutSheetSync,
  scheduleMoneyOutSheetSyncAll,
  sendTestNotification,
  sheetPayloadWithBookAccent,
  syncBatchToSheets,
  syncToSheets,
  testSheets,
  updateBulkProgress,
  verifyUrl,
} from './features/sheets-bridge.js';
import { sheetTabKey } from './lib/sheet-sync.js';
import { IN_PERSON_CHANNELS } from './lib/channel-mix.js';
import { csvToObjects, toCsv } from './lib/csv.js';
import { plainChanges, kindLabel, parseBuildDate, relativeWhen, dayHeading } from './lib/whats-new.js';
import { downloadText, downloadCsv } from './lib/download.js';
import { OC_STAGES } from './lib/opencall.js';
import { deriveOnHand, buildOrderTimeline, inventoryBreakdown, deduplicateDirectConsignmentSales, recalculateBookStatsFromHistory, orderStockPreview, orderStockPreviewCopy, deriveStockBreakdown, transferAuthorStock, isVoidStale } from './lib/inventory.js';
import { fairSyncPill } from './lib/fair-mode.js';
import { histMirrorForLedger, reconcileConsignmentMirrors, syncHistMirrorFromLedger, ledgerSaleIndexForHistMirror, consignmentSyncPayload, collectUniqueConsignmentStores, consignmentLedgerTotals, storeBalanceSlug, storeBalanceComparison } from './lib/consignment.js';
import { reminderSettings, reminderBlockReason, invoiceReminderState, dueForReminder, dueForReminderTomorrow, buildReminderEmail, canSendNow, daysLate, describeReminderSweep, describeReminderNotice, sampleReminderInvoice } from './lib/payment-reminders.js';
import { LEDGER_TYPE_FILTERS, emptyLedgerFilter, ledgerFilterIsActive, ledgerStoreOptions, filterLedgerEntries, ledgerTypeCounts, describeLedgerFilter, ledgerTotalsScope } from './lib/consignment-ledger-filter.js';
import { filterHistoryRows, historySearchIsActive, describeHistorySearch } from './lib/order-history-search.js';
import { resolveCountryCode } from './lib/countries.js';
import { PUBLISHER_ONLY_TABS, AUTHOR_ONLY_TABS, helpTabOpenFor, helpQueryWords, helpMatches } from './lib/help-guide.js';
import { readStoredList } from './lib/stored-list.js';
import { STORE_REVERSAL_PENDING_KEY } from './lib/store-reversals.js';


// Tells the boot watchdog in index.html that the bundle and every import it
// needs loaded, so it stands down instead of reporting a failed start.
window.__lmAppLoaded = true;

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
export function reportClientError(kind, message, extra = {}) {
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

// How long the "Updating…" screen may wait for the new version to take over
// before the page reloads anyway. updateSW(true) only reloads when the waiting
// worker announces it is in control; if that never comes (another tab already
// activated it, the browser paused the worker, the waiting worker went
// redundant) the screen used to stay up forever.
const UPDATE_RELOAD_FAILSAFE_MS = 3000;

export function applyPwaUpdate(updateSW, { reload = () => window.location.reload(), failsafeMs = UPDATE_RELOAD_FAILSAFE_MS } = {}) {
  hideUpdatePrompt();
  revealUpdatingScreen();
  let done = false;
  const reloadOnce = () => {
    if (done) return;
    done = true;
    reload();
  };
  // Reload the moment the new worker takes control, not after a fixed delay.
  navigator.serviceWorker?.addEventListener?.('controllerchange', reloadOnce, { once: true });
  setTimeout(reloadOnce, failsafeMs);
  try {
    Promise.resolve(updateSW(true)).catch(reloadOnce);
  } catch (_) {
    reloadOnce();
  }
}

const _updateSW = registerSW({
  onNeedRefresh() {
    updateSWFunc = () => applyPwaUpdate(_updateSW);

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
// BOOKS / BOOK_LIST live in ./core/store.js (setBooks keeps them in step).
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
export let posExtraBooks = {};

export function isTestBook(b) {
  if (!b) return false;
  const idLower = String(b.id || '').toLowerCase().trim();
  const titleLower = String(b.title || '').toLowerCase().trim();
  // Preserve the original TEST PAGE sandbox aliases without hiding real
  // books such as "Greatest Hits" or "Contest" through substring matches.
  const testNames = ['test', 'test1', 'testpage', 'test-page', 'test page'];
  return b.isTest === true || testNames.includes(idLower) || testNames.includes(titleLower);
}

export function isTestBookId(bid) {
  if (!bid) return false;
  const str = String(bid).toLowerCase().trim();
  if (isTestBook({ id: str })) return true;
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
  refreshBookList();
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

let catalogLoadFailed = false;
// Open until the server's catalogue is in (loadCatalog); see showStartupPreview.
let _startupPreviewOpen = true;
let _startupPreviewShown = false;

export function saveCatalogWithDeletions() {
  // The last catalog read failed, so BOOKS may be the built-in defaults rather
  // than the real catalog. Writing it would overwrite the real one.
  if (catalogLoadFailed) {
    showToast('⚠ Not saving — the book catalog never loaded. Reload first.', 'err', 6000);
    return Promise.resolve();
  }
  // Still the device's copy from startup: the server's may hold changes this
  // one lacks, and saving now would overwrite them.
  if (_startupPreviewShown && _startupPreviewOpen) {
    showToast('Still loading the latest catalogue — try again in a moment', 'warn', 4000);
    return Promise.resolve(false);
  }
  // Keep the rules-readable ownership map in step with the catalog so the
  // tightened security rules can verify author→book ownership. Publisher-only —
  // authors can't write settings (rules reject), so skip to avoid noisy errors.
  if (window.IS_PUBLISHER && typeof window._fbSaveBookOwners === 'function') {
    window._fbSaveBookOwners(ownersFromBooks());
  }
  return Promise.resolve(window._fbSaveCatalog({ ...BOOKS, _deletedDefaults: deletedDefaultIds, _posExtra: posExtraBooks }))
    .then(saved => {
      // A reprint changes a book's print run, and so the stock the website follows.
      if (saved) scheduleWebsiteFeedPublish('all');
      return saved;
    });
}
const DEFAULT_BOOKS = {
  altrove: { id: 'altrove', title: 'Un Fantastico Altrove', author: 'Silvia Clo Di Gregorio', isbn: '—', maxPrint: 120, listPrice: 40, currency: '€', threshold: 15, productionCost: 0, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#c8913a', accentBg: 'rgba(200,145,58,.1)', urlParam: 'altrove', authorPassword: 'silvia2025' },
  hound: { id: 'hound', title: 'The Hound', author: '', isbn: '—', maxPrint: 300, listPrice: 65, currency: 'CA$', threshold: 30, productionCost: 15000, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#3a7cc8', accentBg: 'rgba(58,124,200,.1)', urlParam: 'hound', authorPassword: 'hound2025' },
  archaeology: { id: 'archaeology', title: 'Archaeology of Presence', author: 'Ilaria di Benedetto', isbn: '—', maxPrint: 80, listPrice: 40, currency: '€', threshold: 10, productionCost: 0, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#7a5c3a', accentBg: 'rgba(122,92,58,.1)', urlParam: 'archaeology', authorPassword: 'ilaria2025' },
  sistema: { id: 'sistema', title: 'Sistema_non_autorizzato', author: 'Maria Luna Tucci', isbn: '—', maxPrint: 60, listPrice: 40, currency: '€', threshold: 8, productionCost: 0, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#2a7a5c', accentBg: 'rgba(42,122,92,.1)', urlParam: 'sistema', authorPassword: 'marialuna2025' },
  collective: { id: 'collective', title: 'Collective Photobook', author: 'Lyricalmyrical Books', isbn: '—', maxPrint: 100, listPrice: 40, currency: '€', threshold: 10, productionCost: 0, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#c8913a', accentBg: 'rgba(200,145,58,.1)', urlParam: 'collective', authorPassword: 'collective2025' }
};

// `early` is a catalog read startup began before the mode flags arrived, from
// the store they then confirmed (initStartup); otherwise this reads it now.
async function loadCatalog(early = null) {
  try {
    const stored = await (early || window._fbLoadCatalog()); // handles FS → RTDB fallback internally
    catalogLoadFailed = false;
    // The server's catalog is in: the on-device preview (showStartupPreview)
    // must not paint over it from here on.
    _startupPreviewOpen = false;
    if (stored) {
      if (applyStoredCatalog(stored)) await saveCatalogWithDeletions();
    } else {
      setBooks({ ...DEFAULT_BOOKS });
      normalizeTestBookAccents();
      deletedDefaultIds = [];
      posExtraBooks = {};
      await saveCatalogWithDeletions();
    }
  } catch (e) {
    console.error('Critical error loading catalog', e);
    _startupPreviewOpen = false;
    // A failed read is not an empty catalog: never save from here. Keep any
    // catalog already in memory; only fall back to the defaults on a cold start.
    catalogLoadFailed = true;
    if (!BOOKS || !Object.keys(BOOKS).length) {
      setBooks({ ...DEFAULT_BOOKS });
      normalizeTestBookAccents();
      deletedDefaultIds = [];
      posExtraBooks = {};
    }
    showToast('⚠ Could not load the book catalog — showing what is saved on this device. Reload once you are back online.', 'err', 7000);
  }
}

// Install a stored catalog as BOOKS. Returns true when built-in titles had to
// be added to it (the caller saves that back). Writes nothing itself, so the
// startup preview can use it on the device's cached copy.
function applyStoredCatalog(stored) {
  deletedDefaultIds = Array.isArray(stored._deletedDefaults) ? stored._deletedDefaults.slice() : [];
  posExtraBooks = (stored._posExtra && typeof stored._posExtra === 'object') ? { ...stored._posExtra } : {};
  const storedBooks = { ...stored };
  delete storedBooks._deletedDefaults;
  delete storedBooks._posExtra;
  const filteredDefaults = {};
  // The Test Profile holds sample books only; the built-in titles are real ones.
  if (!TEST_PROFILE_ACTIVE) Object.keys(DEFAULT_BOOKS).forEach(id => {
    if (!deletedDefaultIds.includes(id)) filteredDefaults[id] = DEFAULT_BOOKS[id];
  });
  setBooks({ ...filteredDefaults, ...storedBooks });
  normalizeTestBookAccents();
  return Object.keys(BOOKS).length > Object.keys(storedBooks).length;
}

export async function syncCatalog() {
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

const BOOK_MODAL_SUBTITLES = {
  general: 'Step 1 of 3: Core Identity & Contributor Access',
  sales: 'Step 2 of 3: Retail Pricing, Currency & Shipping Specs',
  costs: 'Step 3 of 3: Production Cost, Breakeven & Gratuity'
};

const BOOK_PARCEL_PRESETS = {
  trade: { length: 22, width: 15, height: 2, dimUnit: 'cm', weight: 0.45, weightUnit: 'kg' },
  monograph: { length: 30, width: 24, height: 3, dimUnit: 'cm', weight: 1.10, weightUnit: 'kg' },
  zine: { length: 21, width: 14, height: 0.5, dimUnit: 'cm', weight: 0.12, weightUnit: 'kg' },
  boxset: { length: 32, width: 26, height: 8, dimUnit: 'cm', weight: 2.50, weightUnit: 'kg' }
};

function selectBookAccentPreset(color) {
  const accentInput = $('nb-accent');
  if (accentInput) {
    accentInput.value = color;
    onCustomAccentInput(color);
  }
}

function onCustomAccentInput(color) {
  const hexDisplay = $('nb-accent-hex');
  if (hexDisplay) hexDisplay.textContent = color;

  // Match on the stored hex (data-accent), not the swatch's CSS colour: the
  // swatches are painted with ink tokens, so their inline colour never equals a hex.
  const wanted = String(color || '').toLowerCase();
  let matchedName = '';
  const swatches = document.querySelectorAll('#nb-accent-swatches .accent-swatch-btn');
  swatches.forEach(btn => {
    const isSelected = (btn.dataset.accent || '').toLowerCase() === wanted;
    btn.classList.toggle('active', isSelected);
    btn.setAttribute('aria-pressed', String(isSelected));
    if (isSelected) matchedName = btn.dataset.name || '';
  });
  const nameEl = $('nb-accent-name');
  if (nameEl) nameEl.textContent = matchedName || 'Custom colour';

  const accentInput = $('nb-accent');
  if (accentInput) updateModalAccentPreview(accentInput);
}

function onBookTitleInput(val) {
  if (!editingBookId) {
    const idInput = $('nb-id');
    if (idInput && (!idInput.dataset.manual || !idInput.value.trim())) {
      const slug = (val || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      idInput.value = slug;
    }
  }
}

function applyBookParcelPreset(presetKey) {
  const p = BOOK_PARCEL_PRESETS[presetKey];
  if (!p) return;
  if ($('nb-ship-length')) $('nb-ship-length').value = p.length;
  if ($('nb-ship-width')) $('nb-ship-width').value = p.width;
  if ($('nb-ship-height')) $('nb-ship-height').value = p.height;
  if ($('nb-ship-dim-unit')) $('nb-ship-dim-unit').value = p.dimUnit;
  if ($('nb-ship-weight')) $('nb-ship-weight').value = p.weight;
  if ($('nb-ship-weight-unit')) $('nb-ship-weight-unit').value = p.weightUnit;
  showToast(`✓ Applied parcel preset: ${presetKey.toUpperCase()}`);
}

function updateBookModalFinancials() {
  const listPrice = parseFloat($('nb-price')?.value) || 0;
  const printRun = parseInt($('nb-max')?.value) || 0;
  const prodCost = parseFloat($('nb-prod')?.value) || 0;
  const curSymbol = $('nb-cur')?.value || '€';

  const grossPotential = listPrice * printRun;
  const unitCost = printRun > 0 ? (prodCost / printRun) : 0;
  const unitMargin = listPrice - unitCost;
  const marginPercent = listPrice > 0 ? Math.round((unitMargin / listPrice) * 100) : 0;
  const breakevenCopies = listPrice > 0 ? Math.ceil(prodCost / listPrice) : 0;

  const grossEl = $('bm-metric-gross');
  const unitCostEl = $('bm-metric-unitcost');
  const marginEl = $('bm-metric-margin');
  const breakevenEl = $('bm-metric-breakeven');

  if (grossEl) grossEl.textContent = `${curSymbol}${grossPotential.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (unitCostEl) unitCostEl.textContent = `${curSymbol}${unitCost.toFixed(2)}`;
  if (marginEl) marginEl.textContent = `${curSymbol}${unitMargin.toFixed(2)} (${marginPercent}%)`;
  if (breakevenEl) breakevenEl.textContent = `${breakevenCopies} ${breakevenCopies === 1 ? 'copy' : 'copies'}`;
}

function switchBookModalTab(tabName) {
  const tabs = ['general', 'sales', 'costs'];
  const updateDom = () => {
    tabs.forEach(t => {
      const btn = $('book-modal-tab-' + t);
      const panel = $('book-panel-' + t);
      if (btn && panel) {
        if (t === tabName) {
          btn.classList.add('active');
          btn.setAttribute('aria-selected', 'true');
          panel.style.display = '';
        } else {
          btn.classList.remove('active');
          btn.setAttribute('aria-selected', 'false');
          panel.style.display = 'none';
        }
      }
    });

    if ($('book-modal-subtitle')) {
      $('book-modal-subtitle').textContent = BOOK_MODAL_SUBTITLES[tabName] || 'Book Settings';
    }

    const prevBtn = $('book-modal-prev-btn');
    const nextBtn = $('book-modal-next-btn');

    if (tabName === 'general') {
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) {
        nextBtn.style.display = '';
        nextBtn.textContent = 'Next: Sales & Shipping →';
      }
    } else if (tabName === 'sales') {
      if (prevBtn) prevBtn.style.display = '';
      if (nextBtn) {
        nextBtn.style.display = '';
        nextBtn.textContent = 'Next: Costs & Payouts →';
      }
    } else if (tabName === 'costs') {
      if (prevBtn) prevBtn.style.display = '';
      if (nextBtn) nextBtn.style.display = 'none';
    }

    updateBookModalFinancials();
  };

  if (typeof document !== 'undefined' && document.startViewTransition) {
    document.startViewTransition(updateDom);
  } else {
    updateDom();
  }
}

function stepBookModal(delta) {
  const tabs = ['general', 'sales', 'costs'];
  let currentIdx = 0;
  tabs.forEach((t, i) => {
    if ($('book-modal-tab-' + t)?.classList.contains('active')) currentIdx = i;
  });
  const targetIdx = Math.max(0, Math.min(tabs.length - 1, currentIdx + delta));
  switchBookModalTab(tabs[targetIdx]);
}

function resetBookForm() {
  editingBookId = null;
  // A website book offered here is linked only when its form is saved; a
  // closed or cancelled form forgets it.
  _bookFromWebsiteKey = '';
  if ($('book-modal-badge')) $('book-modal-badge').textContent = '✨ New Release';
  $('add-book-modal-title').textContent = 'Add new book';
  $('add-book-save-btn').textContent = 'Save Book';
  $('nb-id').disabled = false;
  $('nb-id').value = '';
  if ($('nb-id')) $('nb-id').dataset.manual = '';
  $('nb-title').value = '';
  $('nb-author').value = '';
  $('nb-isbn').value = '';
  $('nb-max').value = '100';
  $('nb-price').value = '40';
  $('nb-cur').value = '€';
  $('nb-thresh').value = '10';
  $('nb-accent').value = '#E8402A';
  onCustomAccentInput('#E8402A');
  $('nb-pw').value = '';
  $('nb-prod').value = '0';
  if ($('nb-pub-grat')) $('nb-pub-grat').value = '0';
  if ($('nb-author-grat')) $('nb-author-grat').value = '0';
  if ($('nb-author-stock')) $('nb-author-stock').value = '0';
  $('nb-paylink').value = '';
  if ($('nb-payment-link')) $('nb-payment-link').value = 'https://paypal.me/lyricalmyricalbooks';
  $('nb-ship-length').value = '';
  $('nb-ship-width').value = '';
  $('nb-ship-height').value = '';
  $('nb-ship-dim-unit').value = 'cm';
  $('nb-ship-weight').value = '';
  $('nb-ship-weight-unit').value = 'kg';
  $('nb-ship-hs').value = '490199';
  switchBookModalTab('general');
  updateBookModalFinancials();
}

function openAddBookModal() {
  resetBookForm();
  updateModalAccentPreview($('nb-accent'));
  openM('add-book');
}

// The website edition ("<bookId>|<variantId>") the open Add new book form was
// filled from, so its save can ask the website to link the two. Empty otherwise.
let _bookFromWebsiteKey = '';

/**
 * "Add to the app" on a book the website sells that isn't here yet: the usual
 * Add new book form, filled with its name, author, ISBN and price in CA$. The
 * print run is left empty for the owner, who checks everything and saves as
 * usual — nothing is added until they do.
 */
export function openAddBookFromWebsite(prefill, key) {
  if (!isPublisherSession() || isAuthor()) return;
  resetBookForm();
  const p = prefill || {};
  if ($('book-modal-badge')) $('book-modal-badge').textContent = '🛍 From your website';
  $('nb-title').value = p.title || '';
  onBookTitleInput($('nb-title').value);
  $('nb-author').value = p.author || '';
  $('nb-isbn').value = p.isbn || '';
  if (p.price !== '' && p.price != null) $('nb-price').value = String(p.price);
  setSelectCurrency($('nb-cur'), p.currency || 'CA$');
  // The print run is the owner's to fill in: the form won't save without it.
  $('nb-max').value = '';
  _bookFromWebsiteKey = String(key || '');
  updateModalAccentPreview($('nb-accent'));
  updateBookModalFinancials();
  openM('add-book');
}

function openEditBookModal(id) {
  const book = BOOKS[id];
  if (!book) return;
  editingBookId = id;
  if ($('book-modal-badge')) $('book-modal-badge').textContent = '📖 Project Settings';
  $('add-book-modal-title').textContent = `Edit book · ${book.title}`;
  $('add-book-save-btn').textContent = 'Save Changes';
  $('nb-id').disabled = true;
  $('nb-id').value = book.id || '';
  if ($('nb-id')) $('nb-id').dataset.manual = 'true';
  $('nb-title').value = book.title || '';
  $('nb-author').value = book.author || '';
  $('nb-isbn').value = book.isbn || '—';
  $('nb-max').value = book.maxPrint ?? 100;
  $('nb-price').value = book.listPrice ?? 40;
  setSelectCurrency($('nb-cur'), book.currency || '€');
  $('nb-thresh').value = book.threshold ?? 10;
  $('nb-accent').value = book.accent || '#E8402A';
  onCustomAccentInput(book.accent || '#E8402A');
  $('nb-pw').value = book.authorEmail || '';
  $('nb-prod').value = book.productionCost ?? 0;
  if ($('nb-pub-grat')) $('nb-pub-grat').value = book.pubGratuity ?? 0;
  if ($('nb-author-grat')) $('nb-author-grat').value = book.authorGratuity ?? 0;
  if ($('nb-author-stock')) $('nb-author-stock').value = (states[id] && Number.isFinite(states[id].authorStock)) ? states[id].authorStock : 0;
  $('nb-paylink').value = book.stripeLink || '';
  if ($('nb-payment-link')) $('nb-payment-link').value = book.paymentLink || 'https://paypal.me/lyricalmyricalbooks';
  $('nb-ship-length').value = book.shipLength ?? '';
  $('nb-ship-width').value = book.shipWidth ?? '';
  $('nb-ship-height').value = book.shipHeight ?? '';
  $('nb-ship-dim-unit').value = book.shipDimUnit || 'cm';
  $('nb-ship-weight').value = book.shipWeight ?? '';
  $('nb-ship-weight-unit').value = book.shipWeightUnit || 'kg';
  $('nb-ship-hs').value = book.shipHsCode || '490199';
  switchBookModalTab('general');
  updateModalAccentPreview($('nb-accent'));
  updateBookModalFinancials();
  openM('add-book');
}

// Cancel used to drop a half-written book on the floor — the footer flagged the
// unsaved changes and then discarded them anyway. Route it through the same
// guard Esc and the backdrop already use, and only reset the form once the
// dialog has actually closed.
async function closeAddBookModal() {
  if (await attemptCloseModal('add-book')) resetBookForm();
}

// ── PRODUCTION COST CALCULATOR (TAX CENTRE AGGREGATOR) ──────────────────────
let _tccSelectedExpenseIds = new Set();
let _tccActiveFilter = 'production';
let _tccTargetBookId = null;
let _tccTargetCurrency = 'CAD';

function getNormalizedCurCode(cur) {
  if (!cur) return 'CAD';
  if (cur === '€' || cur === 'EUR') return 'EUR';
  if (cur === '$' || cur === 'CAD') return 'CAD';
  if (cur === 'USD' || cur === 'US$') return 'USD';
  if (cur === 'GBP' || cur === '£') return 'GBP';
  if (cur === 'MXN') return 'MXN';
  return cur;
}

function getCurSymbolForCode(code) {
  if (code === 'EUR') return '€';
  if (code === 'USD') return '$';
  if (code === 'CAD') return '$';
  if (code === 'GBP') return '£';
  if (code === 'MXN') return '$';
  return code ? code + ' ' : '$';
}

function getAllTaxCentreExpensesForCalc() {
  const list = [];
  // 1. Business expenses from TAX_CENTER
  (TAX_CENTER?.businessExpenses || []).forEach(e => {
    const rawCur = e.currency || 'CAD';
    const curCode = getNormalizedCurCode(rawCur);
    list.push({
      id: String(e.id || e.ref || Math.random()),
      rawId: e.id,
      date: e.date || '',
      desc: e.desc || e.description || e.vendor || 'Expense',
      vendor: e.vendor || '',
      category: e.cat || e.category || 'General',
      amount: Number(e.amount) || 0,
      currency: curCode,
      bookId: e.bookId || e.book || '',
      source: 'businessExpense'
    });
  });

  // 2. Book-specific expenses from states
  Object.entries(states || {}).forEach(([bId, s]) => {
    if (s && Array.isArray(s.expenses)) {
      const bCur = BOOKS[bId]?.currency || 'CAD';
      const curCode = getNormalizedCurCode(bCur);
      s.expenses.forEach(e => {
        const expCur = getNormalizedCurCode(e.currency || curCode);
        list.push({
          id: `book_${bId}_${e.id}`,
          rawId: e.id,
          date: e.date || '',
          desc: e.desc || e.description || 'Production Expense',
          vendor: e.vendor || '',
          category: e.cat || e.category || 'Production',
          amount: Number(e.amount) || 0,
          currency: expCur,
          bookId: bId,
          source: 'bookExpense'
        });
      });
    }
  });

  return list;
}

function convertExpenseToTargetCurrency(amt, fromCur, toCur) {
  if (!amt || isNaN(amt)) return 0;
  fromCur = getNormalizedCurCode(fromCur);
  toCur = getNormalizedCurCode(toCur);
  if (fromCur === toCur) return amt;

  // Direct pair: fromCur_toCur
  const pairKey = `${fromCur}_${toCur}`;
  if (_fxRateCache && _fxRateCache[pairKey]) {
    return amt * _fxRateCache[pairKey];
  }

  // Inverse pair: toCur_fromCur
  const invPairKey = `${toCur}_${fromCur}`;
  if (_fxRateCache && _fxRateCache[invPairKey] && _fxRateCache[invPairKey] > 0) {
    return amt / _fxRateCache[invPairKey];
  }

  // Cross rate via CAD
  const fromToCad = fromCur === 'CAD' ? 1 : (_fxRateCache?.[`${fromCur}_CAD`] || 1);
  const toToCad = toCur === 'CAD' ? 1 : (_fxRateCache?.[`${toCur}_CAD`] || 1);

  if (toToCad > 0) {
    return (amt * fromToCad) / toToCad;
  }

  return amt;
}

function isProductionCategory(cat) {
  if (!cat) return false;
  const lower = cat.toLowerCase();
  return lower.includes('print') || lower.includes('manufactur') || lower.includes('product') ||
         lower.includes('suppl') || lower.includes('proof') || lower.includes('bind') ||
         lower.includes('paper') || lower.includes('press') || lower.includes('cost of goods');
}

function openProductionCostCalculator() {
  _tccTargetBookId = editingBookId || $('nb-id')?.value || null;
  const rawCur = $('nb-cur')?.value || (editingBookId && BOOKS[editingBookId]?.currency) || '€';
  _tccTargetCurrency = getNormalizedCurCode(rawCur);

  const bookTitle = (_tccTargetBookId && BOOKS[_tccTargetBookId]?.title) || $('nb-title')?.value || 'Book';
  if ($('tcc-modal-title')) {
    $('tcc-modal-title').textContent = `Sum Production Costs · ${bookTitle}`;
  }

  _tccSelectedExpenseIds = new Set();
  _tccActiveFilter = 'production';

  const allExpenses = getAllTaxCentreExpensesForCalc();
  const lowerTitle = bookTitle.toLowerCase();
  const lowerId = (_tccTargetBookId || '').toLowerCase();

  allExpenses.forEach(exp => {
    const isDirectBook = lowerId && exp.bookId && exp.bookId.toLowerCase() === lowerId;
    const isTitleMatch = lowerTitle.length > 2 && (exp.desc.toLowerCase().includes(lowerTitle) || (exp.vendor && exp.vendor.toLowerCase().includes(lowerTitle)));
    const isProdCat = isProductionCategory(exp.category);

    // Only production spend is pre-ticked: shipping, travel and marketing on
    // the same book would otherwise inflate the unit cost.
    if (isProdCat && (isDirectBook || isTitleMatch)) {
      _tccSelectedExpenseIds.add(exp.id);
    }
  });

  if ($('tcc-search')) $('tcc-search').value = '';
  setProdCostCalcFilter('production', false);
  renderProdCostCalcList();
  openM('tc-prod-cost-calc');
}

function closeProductionCostCalculator() {
  closeM('tc-prod-cost-calc');
}

function setProdCostCalcFilter(mode, shouldRender = true) {
  _tccActiveFilter = mode;
  ['production', 'this-book', 'all'].forEach(f => {
    const btn = $('tcc-filter-' + (f === 'this-book' ? 'book' : (f === 'production' ? 'prod' : 'all')));
    if (btn) {
      if (f === mode) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });
  if (shouldRender) renderProdCostCalcList();
}

function toggleProdCostCalcExpense(id) {
  if (_tccSelectedExpenseIds.has(id)) {
    _tccSelectedExpenseIds.delete(id);
  } else {
    _tccSelectedExpenseIds.add(id);
  }
  renderProdCostCalcList();
}

function toggleAllFilteredProdCost(select) {
  const visible = getFilteredProdCostExpenses();
  visible.forEach(exp => {
    if (select) _tccSelectedExpenseIds.add(exp.id);
    else _tccSelectedExpenseIds.delete(exp.id);
  });
  renderProdCostCalcList();
}

function getFilteredProdCostExpenses() {
  const all = getAllTaxCentreExpensesForCalc();
  const search = ($('tcc-search')?.value || '').trim().toLowerCase();
  const targetId = (_tccTargetBookId || '').toLowerCase();

  return all.filter(exp => {
    if (_tccActiveFilter === 'production') {
      const isProd = isProductionCategory(exp.category) ||
                     exp.desc.toLowerCase().includes('print') ||
                     exp.desc.toLowerCase().includes('proof') ||
                     exp.desc.toLowerCase().includes('press');
      if (!isProd && (!targetId || exp.bookId.toLowerCase() !== targetId)) return false;
    } else if (_tccActiveFilter === 'this-book') {
      if (!targetId || exp.bookId.toLowerCase() !== targetId) return false;
    }

    if (search) {
      const matchesDesc = exp.desc.toLowerCase().includes(search);
      const matchesVendor = (exp.vendor || '').toLowerCase().includes(search);
      const matchesCat = (exp.category || '').toLowerCase().includes(search);
      const matchesDate = (exp.date || '').toLowerCase().includes(search);
      const matchesBook = (exp.bookId || '').toLowerCase().includes(search);
      if (!matchesDesc && !matchesVendor && !matchesCat && !matchesDate && !matchesBook) return false;
    }

    return true;
  });
}

function renderProdCostCalcList() {
  const listEl = $('tcc-expense-list');
  if (!listEl) return;

  const all = getAllTaxCentreExpensesForCalc();
  const visible = getFilteredProdCostExpenses();

  let totalConvertedSum = 0;
  let selectedCount = 0;

  all.forEach(exp => {
    if (_tccSelectedExpenseIds.has(exp.id)) {
      selectedCount++;
      const converted = convertExpenseToTargetCurrency(exp.amount, exp.currency, _tccTargetCurrency);
      totalConvertedSum += converted;
    }
  });

  const curSymbol = getCurSymbolForCode(_tccTargetCurrency);
  const formattedTotal = `${curSymbol}${totalConvertedSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${_tccTargetCurrency}`;

  if ($('tcc-selected-count')) {
    $('tcc-selected-count').textContent = `${selectedCount} ${selectedCount === 1 ? 'expense' : 'expenses'} selected`;
  }
  if ($('tcc-selected-total')) {
    $('tcc-selected-total').textContent = formattedTotal;
  }
  if ($('tcc-apply-btn')) {
    $('tcc-apply-btn').textContent = `✓ Apply ${curSymbol}${totalConvertedSum.toFixed(2)} to Production Cost`;
    $('tcc-apply-btn').disabled = (selectedCount === 0);
  }

  if (!visible.length) {
    listEl.innerHTML = `
      <div class="tcc-empty-state">
        <div style="font-size:var(--text-2xl);">🔍</div>
        <div style="font-weight:600;color:var(--text);">No matching expenses found</div>
        <div style="font-size:var(--text-xs);color:var(--text3);">Try adjusting your search terms or switching to "All Expenses"</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = visible.map(exp => {
    const isSelected = _tccSelectedExpenseIds.has(exp.id);
    const converted = convertExpenseToTargetCurrency(exp.amount, exp.currency, _tccTargetCurrency);
    const isDifferentCur = exp.currency !== _tccTargetCurrency;
    const origSymbol = getCurSymbolForCode(exp.currency);

    const origDisplay = isDifferentCur
      ? `<span class="tcc-amount-orig">Orig: ${escapeHtml(origSymbol)}${exp.amount.toFixed(2)} ${escapeHtml(exp.currency)}</span>`
      : '';

    const bookBadge = exp.bookId
      ? `<span class="tcc-badge-book">📖 ${escapeHtml(BOOKS[exp.bookId]?.title || exp.bookId)}</span>`
      : '';

    return `
      <div class="tcc-expense-row ${isSelected ? 'selected' : ''}" onclick="toggleProdCostCalcExpense('${escapeHtml(exp.id)}')">
        <input type="checkbox" class="tcc-row-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleProdCostCalcExpense('${escapeHtml(exp.id)}')" aria-label="Select ${escapeHtml(exp.desc)}">
        <div class="tcc-row-meta">
          <div class="tcc-row-badges">
            <span class="tcc-badge-cat">${escapeHtml(exp.category || 'General')}</span>
            ${bookBadge}
            <span style="font-size:var(--text-3xs);color:var(--text3);font-family:var(--font-mono);">${escapeHtml(exp.date || '—')}</span>
          </div>
          <div class="tcc-row-desc">${escapeHtml(exp.desc)}</div>
          ${exp.vendor ? `<div class="tcc-row-sub">Vendor: ${escapeHtml(exp.vendor)}</div>` : ''}
        </div>
        <div class="tcc-row-amount">
          <div class="tcc-amount-main">${escapeHtml(curSymbol)}${converted.toFixed(2)}</div>
          ${origDisplay}
        </div>
      </div>
    `;
  }).join('');
}

function applyCalculatedProdCost() {
  const all = getAllTaxCentreExpensesForCalc();
  let totalConvertedSum = 0;
  let count = 0;

  all.forEach(exp => {
    if (_tccSelectedExpenseIds.has(exp.id)) {
      count++;
      const converted = convertExpenseToTargetCurrency(exp.amount, exp.currency, _tccTargetCurrency);
      totalConvertedSum += converted;
    }
  });

  const rounded = Math.round(totalConvertedSum * 100) / 100;
  const prodInput = $('nb-prod');
  if (prodInput) {
    prodInput.value = rounded.toFixed(2);
    updateBookModalFinancials();
  }

  const curSymbol = getCurSymbolForCode(_tccTargetCurrency);
  showToast(`✓ Applied ${curSymbol}${rounded.toFixed(2)} (${count} ${count === 1 ? 'expense' : 'expenses'}) as Initial Production Cost`, 'ok');
  closeProductionCostCalculator();
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

// Kept as the Add Book form's named entry point, but the logic now lives in
// lib/modal.js so every dialog raises the same flag from the same code.
function updateUnsavedIndicator() {
  refreshUnsavedMarkers();
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
    // A missed date is left unset so _ccRateFor falls back to the rate in the
    // box, which the owner may have retyped.
    if (r && r.rate) out[d] = r.rate;
  }
  return out;
}

function _ccRateFor(date) {
  if (!_ccCtx) return 0;
  if (_ccCtx.rateMode === 'flat') return _ccCtx.flatRate || 0;
  const byDate = _ccCtx.rates || {};
  // Undated records and any date the FX API couldn't serve fall back to the
  // rate in the box (prefilled with the live rate, but the owner may retype
  // it), so a weekend sale or an offline lookup never silently drops an amount
  // out of the conversion.
  return (date && byDate[date]) || _ccCtx.flatRate || byDate[''] || 0;
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
    { id: 'nb-payment-link', test: val => isValidPaymentLink(val.trim()), msg: 'Must be a valid URL or email address' },
    // A blank or nonsense price/print run used to be saved silently as 40 / 100.
    // A price of 0 is allowed (a free or giveaway title); a print run must be at
    // least 1 because unit cost and break-even divide by it.
    { id: 'nb-price', test: val => val.trim() !== '' && Number.isFinite(Number(val)) && Number(val) >= 0, msg: 'Enter a list price (0 for a free title)' },
    { id: 'nb-max', test: val => /^\s*\d+\s*$/.test(val) && parseInt(val, 10) >= 1, msg: 'Print run must be a whole number of at least 1' }
  ]);

  if (!isValid) {
    const badPanel = ['nb-price', 'nb-max']
      .map(fid => $(fid)?.closest('.form-group'))
      .find(g => g && g.classList.contains('invalid'));
    if (badPanel && !$('nb-payment-link').closest('.form-group').classList.contains('invalid')
      && !$('nb-id').closest('.form-group').classList.contains('invalid')
      && !$('nb-title').closest('.form-group').classList.contains('invalid')) {
      const panelId = (badPanel.closest('[id^="book-panel-"]') || {}).id || '';
      const tab = panelId.replace('book-panel-', '');
      if (['general', 'sales', 'costs'].includes(tab)) switchBookModalTab(tab);
    } else if ($('nb-payment-link').closest('.form-group').classList.contains('invalid')) {
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
  if (catalogLoadFailed) {
    showToast('⚠ Could not reach the catalog, so nothing was saved. Check your connection and try again.', 'err', 5000);
    return;
  }

  // An id that already belongs to a different book must never be overwritten
  // (adding "The Hound" twice, or renaming one book onto another's id).
  if (BOOKS[id] && editingBookId !== id) {
    showToast(`⚠ A book with the id "${id}" already exists — choose a different Book ID.`, 'err', 5000);
    switchBookModalTab('general');
    return;
  }

  // Two books with one title share one tab on the Google Sheet, so their sales
  // and expenses mix there (the sheet tells books apart by title alone).
  const titleKey = sheetTabKey($('nb-title').value);
  const titleTwin = Object.values(BOOKS).find(b => b && b.id !== editingBookId && b.id !== id && !isTestBook(b) && sheetTabKey(b.title) === titleKey);
  if (titleTwin) {
    fieldError('nb-title', `“${titleTwin.title}” already has this title. Add something to tell them apart, such as the edition — your Google Sheet keeps one tab per title.`);
    switchBookModalTab('general');
    $('nb-title').focus();
    return;
  }

  const currentBook = BOOKS[editingBookId] || BOOKS[id] || {};
  const previousTitle = editingBookId ? String(currentBook.title || '').trim() : '';
  const thresholdInput = parseInt($('nb-thresh').value, 10);
  const book = {
    // Start from the stored book so fields this form doesn't list survive an edit.
    ...currentBook,
    id,
    title: $('nb-title').value.trim(),
    author: $('nb-author').value.trim(),
    isbn: $('nb-isbn').value.trim() || '—',
    maxPrint: parseInt($('nb-max').value, 10),
    listPrice: parseFloat($('nb-price').value),
    currency: $('nb-cur').value || '€',
    threshold: Number.isFinite(thresholdInput) && thresholdInput >= 0 ? thresholdInput : 10,
    productionCost: parseFloat($('nb-prod').value) || 0,
    pubGratuity: parseInt($('nb-pub-grat')?.value) || 0,
    authorGratuity: parseInt($('nb-author-grat')?.value) || 0,
    paymentLink: $('nb-payment-link') ? $('nb-payment-link').value.trim() || 'https://paypal.me/lyricalmyricalbooks' : currentBook.paymentLink || 'https://paypal.me/lyricalmyricalbooks',
    stripeLink: $('nb-paylink').value.trim(),
    accent: $('nb-accent').value,
    accentBg: hexToRgba($('nb-accent').value, 0.1),
    urlParam: currentBook.urlParam || id,
    authorEmail: ($('nb-pw').value || '').toLowerCase().trim(),
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

  // A cost that had a value and is now saved blank would quietly mark the
  // book as already broken even, so give the owner a way back first.
  const previousCost = currentBook.productionCost || 0;
  const costInput = readProductionCostInput($('nb-prod').value, previousCost);
  if (costInput.suspicious && !(await confirmProductionCostsCleared([book.title]))) {
    switchBookModalTab('costs');
    return;
  }

  // Asked here, after the currency dialog, so cancelling that leaves the
  // tier untouched, and applied after the currency conversion below so the
  // target lands on the cost exactly as typed.
  const tierMove = previousCost !== book.productionCost
    ? breakEvenTierMove(book.profitTiers, previousCost, book.productionCost)
    : null;
  const moveTier = tierMove ? await confirmBreakEvenTierMoves([{ book, move: tierMove }]) : false;

  if (editingBookId && editingBookId !== id) {
    delete BOOKS[editingBookId];
    if (states[editingBookId]) {
      states[id] = states[editingBookId];
      delete states[editingBookId];
    }
  }
  BOOKS[id] = book;
  refreshBookList();
  if (!states[id]) states[id] = defaultState(book);

  const inputAuthorStock = parseInt($('nb-author-stock')?.value, 10);
  if (Number.isFinite(inputAuthorStock) && inputAuthorStock >= 0) {
    states[id].authorStock = inputAuthorStock;
    await saveState(id);
  }

  if (currencyResult) {
    applyCurrencyResult(currencyResult, book, states[id]);
    // Rollups (revenue, chStats) are re-derived from the now-converted prices,
    // so the headline figures agree with the individual rows.
    recomputeAfters(states[id], book);
    await saveState(id);
  }
  if (moveTier) applyBreakEvenTierMove(book.profitTiers, tierMove);
  // Re-adding a previously-deleted default removes it from the tombstone list.
  if (DEFAULT_BOOKS[id]) {
    const i = deletedDefaultIds.indexOf(id);
    if (i !== -1) deletedDefaultIds.splice(i, 1);
  }

  // Compile and sync productionCosts & paymentLinks to Firebase/localStorage for backward compatibility
  await persistProductionCosts();
  const payLinks = {};
  BOOK_LIST.forEach(b => { payLinks[b.id] = b.paymentLink || ''; });
  await window._fbSaveSettings('paymentLinks', payLinks);
  localStorage.setItem('lm-payment-links', JSON.stringify(payLinks));

  await saveCatalogWithDeletions();
  // The book's rows on the Google Sheet follow the new title.
  if (previousTitle && previousTitle !== book.title && !isTestBook(book)) queueSheetsRename(previousTitle, book.title, book.accent);

  if ($('add-book-unsaved-indicator')) $('add-book-unsaved-indicator').classList.remove('show');

  // A new book filled in from the website: ask the website to link its edition
  // to this book (read before the form closes, which forgets it).
  const fromWebsiteKey = !editingBookId ? _bookFromWebsiteKey : '';
  _bookFromWebsiteKey = '';

  showToast(editingBookId ? '✓ Book updated' : '✓ Book added to catalog');
  closeAddBookModal();
  if (fromWebsiteKey) noteBookAddedFromWebsite(fromWebsiteKey, id);
  buildBookSwitcher();
  renderCatalogList();
  renderProfitSettings();
  // Refresh the dropdown header (label/dot/accent) if the active book was edited.
  if (activeBook && activeBook !== 'all' && BOOKS[activeBook]) {
    const ab = BOOKS[activeBook];
    const lbl = $('book-dropdown-label'); if (lbl) lbl.textContent = ab.title;
    const dt = $('book-dropdown-dot'); if (dt) dt.style.background = ab.accent;
    applyBookAccentTokens(activeBook);
  }
  renderCurrent();

  // Asked last, once the book modal is out of the way, so the two dialogs
  // don't stack.
  if (currencyResult) await offerSheetsResyncAfterRestate(currencyResult.to);
}

/**
 * "Use the website's" on Website orders › Details that differ from the website:
 * change ONE field of one book (title, author, ISBN or list price) through the
 * same catalogue save the Edit book form uses — the latest catalogue is read
 * first, the cloud write is queued while offline, and a new title moves the
 * book's rows on the Google Sheet with it.
 *
 * `stillDiffers(book)` is asked after the latest catalogue is in, so a value
 * another device changed meanwhile is never overwritten.
 * Returns { ok: true } or { ok: false, reason, twin? }.
 */
export async function applyBookDetailFromWebsite(bookId, patch, stillDiffers = () => true) {
  if (!window.IS_PUBLISHER || !patch || !Object.keys(patch).length) return { ok: false, reason: 'missing' };
  await syncCatalog();
  if (catalogLoadFailed) return { ok: false, reason: 'catalog' };
  const current = BOOKS[bookId];
  if (!current) return { ok: false, reason: 'missing' };
  if (!stillDiffers(current)) return { ok: false, reason: 'changed' };
  if (patch.title) {
    // Two books with one title share one tab on the Google Sheet (see saveBookFromModal).
    const titleKey = sheetTabKey(patch.title);
    const twin = Object.values(BOOKS).find(b => b && b.id !== bookId && !isTestBook(b) && sheetTabKey(b.title) === titleKey);
    if (twin) return { ok: false, reason: 'twin', twin: twin.title };
  }
  const previousTitle = String(current.title || '').trim();
  BOOKS[bookId] = { ...current, ...patch };
  refreshBookList();
  // As the Edit book form does: a failed cloud write says so itself (toast) and
  // the change stays on this device.
  await saveCatalogWithDeletions();
  const book = BOOKS[bookId];
  if (patch.title && previousTitle && previousTitle !== book.title && !isTestBook(book)) queueSheetsRename(previousTitle, book.title, book.accent);
  buildBookSwitcher();
  renderCatalogList();
  renderProfitSettings();
  if (activeBook === bookId) {
    const lbl = $('book-dropdown-label'); if (lbl) lbl.textContent = book.title;
  }
  renderCurrent();
  return { ok: true };
}

// One title's row in Settings → Catalogue. Live and test books share it, so
// the two lists can't drift apart.
function catalogCardHtml(b) {
  return `
      <div class="catalog-card">
         <div style="display:flex;align-items:center;gap:14px;">
           <div class="catalog-dot" style="background:${b.accent}"></div>
           <div class="catalog-info">
             <h4>${escapeHtml(b.title)}</h4>
             <p><span class="tnum" style="font-family:var(--font-mono);font-size:var(--text-sm);">${escapeHtml(b.id)}</span> · <strong class="tnum" style="font-family:var(--font-mono);">${b.currency}${b.listPrice}</strong></p>
           </div>
         </div>
         <div class="catalog-actions">
           <button class="btn sm" onclick="openEditBookModal('${escapeHtml(b.id)}')">Edit</button>
           <button class="btn sm danger-btn" onclick="deleteBook('${escapeHtml(b.id)}')">Remove</button>
         </div>
      </div>`;
}

function renderCatalogList() {
  const container = $('catalog-list');
  if (!container) return;

  const testContainer = $('test-catalog-list');

  // Find test books (e.g. title or id contains "test")
  const testBooks = BOOK_LIST.filter(isTestBook);
  const regularBooks = BOOK_LIST.filter(b => !isTestBook(b));

  if (regularBooks.length === 0) {
    container.innerHTML = `
      <div class="empty-state sys-empty" style="padding:var(--space-6); text-align:center;">
        <div class="e-icon" aria-hidden="true">📚</div>
        <strong style="color:var(--content-primary); font-size:var(--text-base);">No Books in Production Catalogue</strong>
        <p style="color:var(--content-secondary); font-size:var(--text-xs); max-width:440px; margin:var(--space-2) auto var(--space-4); line-height:var(--leading-snug);">Add your titles to establish inventory tracking, sales reporting, and consignment settlement ledgers.</p>
        <button class="btn gold lg" onclick="openAddBookModal()">+ Add your first book</button>
      </div>`;
  } else {
    container.innerHTML = regularBooks.map(catalogCardHtml).join('');
  }

  if (testContainer) {
    if (testBooks.length === 0) {
      testContainer.innerHTML = `
        <div class="empty-state" style="padding:var(--space-4);text-align:center;">
          <div class="e-icon" aria-hidden="true">🧪</div>
          <strong style="color:var(--content-primary);font-size:var(--text-sm);">No Test Books Found</strong>
          <p style="color:var(--content-secondary);font-size:var(--text-xs);margin-top:2px;">Books created for sandbox and testing environments appear here, isolated from your live production catalogue.</p>
          <p style="color:var(--content-muted);font-size:var(--text-xs);margin:var(--space-2) 0 var(--space-3);">To keep a book here, give it the title or ID “test”.</p>
          <button type="button" class="btn sm" onclick="openAddBookModal()">+ Add a test book</button>
        </div>`;
    } else {
      testContainer.innerHTML = testBooks.map(catalogCardHtml).join('');
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
  refreshBookList();
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
window.openProductionCostCalculator = openProductionCostCalculator;
window.closeProductionCostCalculator = closeProductionCostCalculator;
window.renderProdCostCalcList = renderProdCostCalcList;
window.toggleProdCostCalcExpense = toggleProdCostCalcExpense;
window.setProdCostCalcFilter = setProdCostCalcFilter;
window.toggleAllFilteredProdCost = toggleAllFilteredProdCost;
window.applyCalculatedProdCost = applyCalculatedProdCost;

// ── PAYMENT QR GENERATOR (publisher only)

// Redraw the payment modal's QR for `url`, replacing whatever it showed before.
function drawPaymentQR(url) {
  const canvasContainer = $('payment-qr-canvas');
  if (!canvasContainer) return;
  canvasContainer.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    new QRCode(canvasContainer, {
      text: url,
      width: 230,
      height: 230,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }
}

function openPaymentQRModal() {
  if (!activeBook || activeBook === 'all' || isAuthor()) return;
  const book = BOOKS[activeBook];

  const titleEl = $('qr-book-title');
  if (titleEl) titleEl.textContent = book.title;

  const curSelect = $('pqr-currency');
  if (curSelect) {
    putCurrencyFirst(curSelect, currencyToCode(book.currency));
    setSelectCurrency(curSelect, currencyToCode(book.currency) || 'CAD');
  }

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

  drawPaymentQR(url);
}

async function generateSingleBookStripeQR() {
  if (!activeBook || activeBook === 'all') return;
  const book = BOOKS[activeBook];
  const curCode = $('pqr-currency')?.value || 'CAD';
  const overrideVal = parseFloat($('pqr-override-price')?.value);
  // With no typed price, charge the list price converted into the chosen
  // currency, never the bare number (40 EUR is not 40 USD).
  const hasOverride = !isNaN(overrideVal) && overrideVal > 0;
  const converted = hasOverride ? null : convertCurrency(book.listPrice || 0, currencyToCode(book.currency) || 'CAD', curCode);
  if (!hasOverride && converted === null) {
    showToast(`No exchange rate for ${curCode} yet. Type the price in ${curCode} and try again.`, 'warn', 6000);
    return;
  }
  const targetPrice = hasOverride ? overrideVal : Math.round(converted * 100) / 100;

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

    drawPaymentQR(url);
    showToast(`✓ Stripe QR generated for ${curCode} ${targetPrice.toFixed(2)}`);
  } catch (e) {
    showToast('Stripe: ' + (e.message || e), 'err', 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = restoreText; }
  }
}

function copyPaymentLink() {
  const url = $('qr-payment-link')?.value;
  if (!url) { showToast('No payment link to copy yet', 'warn'); return; }
  copyTextWithFallback(url).then(() => showToast('Payment link copied'));
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
//
// One card per book: title leads (Playfair on --ink2), price is the second
// focal point (mono, gold), author recedes, the QR sits in a white plate that
// is the card's obvious centre, and Download leads Copy in the action row.
// Every wrapper here maps to a `.qr-*` class in style.css — no inline styles,
// so the token lint has nothing to complain about and the theme flip carries
// the whole card through --on-inverse tiers.
function renderAllQRCodes() {
  const grid = $('qr-all-grid');
  if (!grid) return;
  grid.innerHTML = '';

  BOOK_LIST.forEach(book => {
    const url = getEffectiveBookPaymentLink(book);
    const card = document.createElement('article');
    card.className = 'qr-card' + (url ? '' : ' is-empty');
    card.style.setProperty('--qr-accent', book.accent);

    // Header — accent dot + title stack. Author and price are separated so the
    // price can wear a heavier mono treatment while the author stays muted.
    const priceLabel = `${book.currency ?? ''}${book.listPrice ?? '—'}`;
    const author = escapeHtml(book.author) || '—';
    const header = document.createElement('header');
    header.className = 'qr-card-head';
    // Status pill: phone-only (CSS hides it on desktop). Says at a glance
    // whether this book already has a link to show.
    header.innerHTML = `
      <span class="qr-card-accent" aria-hidden="true"></span>
      <div class="qr-card-heading">
        <div class="qr-card-title">${escapeHtml(book.title)}</div>
        <div class="qr-card-meta">
          <span class="qr-card-author">${author}</span>
          <span class="qr-card-price" aria-label="List price">${escapeHtml(priceLabel)}</span>
        </div>
        <span class="qr-card-status pill ${url ? 'green' : 'amber'}">${url ? '✓ Link set' : '! No link yet'}</span>
      </div>`;
    card.appendChild(header);

    if (!url) {
      // No link yet: there is no code to show, so the card offers the one
      // useful step instead — open this book's editor where the link is set.
      const empty = document.createElement('div');
      empty.className = 'qr-card-empty';
      empty.innerHTML = `
        <p class="qr-card-empty-note">Add this book's Stripe payment link and its QR code appears here.</p>
        <button type="button" class="btn gold qr-card-setlink">Set payment link</button>`;
      empty.querySelector('.qr-card-setlink').addEventListener('click', () => window.openEditBookModal(book.id));
      card.appendChild(empty);
      grid.appendChild(card);
      return;
    }

    // QR plate — kept as a bright white square regardless of theme; a QR
    // scanned by a phone camera needs the light background whatever the app
    // paints around it.
    const qrWrap = document.createElement('div');
    qrWrap.className = 'qr-frame';
    const qrEl = document.createElement('div');
    qrEl.id = `qr-all-${book.id}`;
    qrEl.className = 'qr-frame-target';
    qrWrap.appendChild(qrEl);
    card.appendChild(qrWrap);

    if (typeof QRCode !== 'undefined') {
      new QRCode(qrEl, { text: url, width: 168, height: 168, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.H });
    } else {
      qrEl.innerHTML = '<div class="qr-frame-message">QR library not ready</div>';
    }

    // Actions column — url line above, buttons below. Download leads (gold),
    // Copy is the secondary (ink), so the primary action reads first in an
    // event line-up.
    const linkRow = document.createElement('div');
    linkRow.className = 'qr-card-footer';
    // The link goes to the handler as a value, never spliced into an inline
    // onclick string, so a quote or backslash in it can't break out.
    linkRow.innerHTML = `
      <div class="qr-card-link" title="${escapeHtml(url)}">${escapeHtml(url)}</div>
      <div class="qr-card-actions">
        <button type="button" class="btn ink sm" data-qr-action="copy">Copy link</button>
        <button type="button" class="btn gold sm" data-qr-action="download">Download</button>
      </div>`;
    linkRow.querySelector('[data-qr-action="copy"]').addEventListener('click', () => window.copyBookQR(book.id, url));
    linkRow.querySelector('[data-qr-action="download"]').addEventListener('click', () => window.downloadBookQR(book.id));
    card.appendChild(linkRow);
    grid.appendChild(card);
  });
}

window.renderAllQRCodes = renderAllQRCodes;

// Copy text to the clipboard, falling back to a hidden textarea and the legacy
// copy command when the async clipboard write is refused. Resolves once
// either path has run; the copy-link buttons toast on that.
export function copyTextWithFallback(text) {
  return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
}

window.copyBookQR = function (bookId, url) {
  if (!url) { showToast('No link set for this book', 'warn'); return; }
  copyTextWithFallback(url).then(() => showToast('Link copied'));
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

  // Set accent colour (the whole family, so --book-accent-text can't go stale
  // against --book-accent on the author's QR page).
  applyBookAccentTokens(activeBook);

  // Clear previous QR and re-render
  const canvas = $('author-qr-canvas');
  if (!canvas) return;
  canvas.innerHTML = '';

  if (url && typeof QRCode !== 'undefined') {
    new QRCode(canvas, {
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
  // The same link the QR above encodes.
  const url = getEffectiveBookPaymentLink(book);
  if (!url) { showToast('No link configured for this book', 'warn'); return; }
  copyTextWithFallback(url).then(() => showToast('Link copied'));
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
//  Decided at sign-in from the account's email: the publisher sees every
//  book; an author whose email is on a book is locked to that book.
// ═══════════════════════════════════════════════════════
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

export function isPublisherSession() {
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
export function animateCountValue(id, target, _duration, _formatFunc) {
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

// LOCAL calendar day, not the UTC one (which is tomorrow on a Canadian evening).
export const today = () => localDay();

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
window.authorSubmissions = {}; // Tracks pending expenses/sales by Authors
export let orders = [], activeId = null;
let fbReady = false, lastSavedHashes = {}, lastSaveTimes = {};
// Loaded through a guard: an unreadable stored queue (or storage that throws on
// access) used to throw right here, at module load, and the app never started.
// Anything unreadable is copied aside to 'lm-sync-queue-corrupt' first.
//
// Each open tab keeps its own queue under its own key (see sync-queue-store.js):
// two tabs sharing one key erased each other's offline sales. A reload of the
// same tab keeps its id, so it picks its own queue straight back up.
const SYNC_TAB_ID = getSyncTabId((() => { try { return window.sessionStorage; } catch (_) { return null; } })(), getLocalStorage());
const SYNC_QUEUE_STORAGE_KEY = queueKeyFor(SYNC_TAB_ID);
const _syncQueueLoad = loadSyncQueue(getLocalStorage(), SYNC_QUEUE_STORAGE_KEY);

// The queue kept in IndexedDB when localStorage is full (sync-queue-overflow.js).
// The Test Profile gets its own, as it gets its own localStorage.
const _syncOverflow = createSyncOverflowStore(
  typeof indexedDB === 'undefined' ? undefined : indexedDB,
  TEST_PROFILE_ACTIVE ? 'lm-sync-overflow-test' : 'lm-sync-overflow',
);
/** Where this tab's queue lives in IndexedDB: 'none', 'pending' (a write is on
 *  its way) or 'stored' (localStorage was full, so it is kept there instead). */
let _syncOverflowState = 'none';
/** Whether this tab has ever written to (or read its own) IndexedDB record. */
let _syncOverflowUsed = false;
let _syncSaveSeq = 0;
/** Resolves true once the latest save of the queue has landed somewhere. */
let _syncOverflowWrite = Promise.resolve(true);
// Every IndexedDB step runs after the one before it, so a clear made after a
// write can't land before it, and a later write always has the last word.
let _syncOverflowChain = Promise.resolve();
function overflowStep(fn) {
  const step = _syncOverflowChain.then(fn, fn);
  _syncOverflowChain = step.catch(() => {});
  return step;
}

export let syncQueue = _syncQueueLoad.queue;
markTabAlive(getLocalStorage(), SYNC_TAB_ID);
/** The queue item being uploaded right now, if any. queueSync never replaces it. */
let _syncInFlightItem = null;
let systemBackups = [];
const SYSTEM_BACKUP_KEY = 'systemBackups';
const SYSTEM_BACKUP_LIMIT = 30;
const BACKUP_FOLDER_DB = 'lm-backup-folder-db';
const BACKUP_FOLDER_STORE = 'handles';
const BACKUP_FOLDER_KEY = 'preferred-folder';

let _syncRetryTimer = null;
let _syncRetryAttempt = 0;
let _syncFlushing = false;

// ── Persistent sync chip ───────────────────────────────────────────────────
// The queue below has always been reliable; what it lacked was a face. The
// account-menu dot and the one-shot toast are both easy to miss, so a phone
// that drops signal at a market has read "Live" until the next save was
// attempted. These three pieces of state feed the always-visible chip
// (#sync-chip) via describeSyncStatus() — see src/lib/sync-status.js.
const LAST_CLOUD_SYNC_KEY = 'lm-last-cloud-sync';
/** True once a queue drain has thrown and is backing off; cleared on success. */
export let _syncRetrying = false;
/** Epoch ms of the last confirmed cloud write, persisted so a reload while
 *  offline still knows how stale the cloud copy is. */
let _lastCloudSyncAt = (() => {
  try {
    const raw = Number(localStorage.getItem(LAST_CLOUD_SYNC_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch (_) { return null; }   // private mode / blocked storage
})();
let _syncChipTimer = null;
/** True while the latest queue could not be written to device storage (full or
 *  blocked), i.e. some queued change exists only in this open tab. Drives the
 *  one-per-streak warning toast and the chip's "keep the app open" wording;
 *  cleared by the next successful write or by the queue draining. */
export let _syncQueueHeldInMemory = false;

if (_syncQueueLoad.discarded) {
  console.warn('Offline sync queue was unreadable and was set aside', _syncQueueLoad);
  // Deferred so the toast host exists and the rest of the module has loaded.
  setTimeout(() => {
    showToast(
      _syncQueueLoad.queue.length
        ? '⚠ Some changes waiting on this device to upload couldn\'t be read. The rest will still upload — check your latest sales reached the cloud.'
        : '⚠ Changes waiting on this device to upload couldn\'t be read. Check your latest sales reached the cloud.',
      'err',
      9000,
    );
  }, 0);
}

/**
 * Mirror the in-memory queue to device storage. Never throws — a full or
 * blocked storage must not stop the upload from being attempted (the change is
 * still in memory and processSyncQueue can deliver it). Instead the publisher is
 * told, once per failure streak, to keep the app open until it uploads.
 * Same precedent as persistSheetsQueue().
 * @returns {boolean} whether the write landed
 */
function saveSyncQueueToDevice() {
  const seq = ++_syncSaveSeq;
  const res = persistSyncQueue(getLocalStorage(), syncQueue, SYNC_QUEUE_STORAGE_KEY);
  if (res.ok || !syncQueue.length) {
    // Landed, or there is nothing left that could be lost.
    _syncQueueHeldInMemory = false;
    _syncOverflowState = 'none';
    // Clear any IndexedDB copy, after any write to it still on its way, so a
    // restart can't replay changes that have since uploaded.
    if (_syncOverflowUsed) overflowStep(() => _syncOverflow.remove(SYNC_QUEUE_STORAGE_KEY));
    _syncOverflowWrite = Promise.resolve(res.ok);
    return res.ok;
  }
  console.warn(`Could not store the offline sync queue (${res.reason}), keeping it in the device's larger storage`, res.error);
  // localStorage is full (or refused): keep the queue in IndexedDB, which has
  // far more room. Only if that fails too is the change at risk. Marked
  // pending straight away, so nothing mistakes the missing localStorage copy
  // for another tab having taken the queue over.
  _syncOverflowUsed = true;
  _syncOverflowState = 'pending';
  const snapshot = JSON.parse(JSON.stringify(syncQueue));
  _syncOverflowWrite = overflowStep(() => _syncOverflow.put(SYNC_QUEUE_STORAGE_KEY, snapshot)).then(ok => {
    // A later save has already decided where the queue lives, and its own
    // step runs after this one.
    if (seq !== _syncSaveSeq) return ok;
    if (ok) {
      _syncOverflowState = 'stored';
      _syncQueueHeldInMemory = false;
      // Drop the older, smaller copy so a restart doesn't replay it. Removing
      // can't hit the quota.
      try { getLocalStorage()?.removeItem(SYNC_QUEUE_STORAGE_KEY); } catch (_) { /* left; qids dedupe it */ }
      renderSyncChip();
      return true;
    }
    _syncOverflowState = 'none';
    if (!_syncQueueHeldInMemory) {
      _syncQueueHeldInMemory = true;
      renderSyncChip();
      showToast(
        res.reason === 'quota'
          ? '⚠ This device is out of storage, so your change couldn\'t be saved on it. Keep the app open until it uploads, or it could be lost.'
          : '⚠ This device wouldn\'t let the app save your change. Keep the app open until it uploads, or it could be lost.',
        'err',
        9000,
      );
    }
    return false;
  });
  return false;
}

/**
 * The IndexedDB version of syncQueueTakenByAnotherTab: while this tab's queue
 * lives there, a tab that took it over (this one looked closed: frozen in the
 * background, or its heartbeat couldn't be written on a full device) removed
 * the record. Uploading the in-memory copy then would send it a second time.
 */
async function syncOverflowTakenByAnotherTab() {
  if (_syncOverflowState !== 'stored' || !syncQueue.some(item => !item.adopted)) return false;
  const records = await overflowStep(() => _syncOverflow.readAll());
  return _syncOverflowState === 'stored' && !records.some(r => r.key === SYNC_QUEUE_STORAGE_KEY);
}

// Changes kept in IndexedDB by this tab before a reload, or by a tab that is
// gone, are taken back into this tab's queue: stored here first, and only then
// removed from where they were. Marked `adopted` so a new edit on this screen,
// which never showed them, can't supersede them.
let _ownOverflowRead = false;
export async function adoptOverflowSyncChanges() {
  // This tab's own record is read back once, at startup (it is what a reload
  // left behind). After that this tab writes and clears it itself, and a read
  // racing that clear must not bring back changes that already uploaded.
  const readOwn = !_ownOverflowRead;
  _ownOverflowRead = true;
  const records = await overflowStep(() => _syncOverflow.readAll());
  if (readOwn && records.some(r => r.key === SYNC_QUEUE_STORAGE_KEY)) _syncOverflowUsed = true;
  if (!records.length) return;
  const storage = getLocalStorage();
  const now = Date.now();
  const take = records.filter(r => r.key === SYNC_QUEUE_STORAGE_KEY
    ? readOwn
    : isOrphanQueueKey(storage, r.key, SYNC_TAB_ID, now));
  if (!take.length) return;
  const have = new Set(syncQueue.map(item => item.qid).filter(Boolean));
  const fresh = [];
  take.forEach(r => r.queue.forEach((item, i) => {
    if (!item || typeof item.bookId !== 'string' || !item.state || typeof item.state !== 'object') return;
    const qid = item.qid || `${r.key}#${item.ts || 0}#${i}`;
    if (have.has(qid)) return;
    have.add(qid);
    fresh.push({ ...item, qid, adopted: true });
  }));
  syncQueue.push(...fresh);
  saveSyncQueueToDevice();
  const stored = await _syncOverflowWrite;
  if (!stored) {
    syncQueue = syncQueue.filter(item => !fresh.includes(item));
    return;
  }
  // Stored under this tab's key now (in localStorage, or as this tab's own
  // overflow record): the old records can go.
  await Promise.all(take.filter(r => r.key !== SYNC_QUEUE_STORAGE_KEY || _syncOverflowState === 'none')
    .map(r => overflowStep(() => _syncOverflow.remove(r.key))));
  if (fresh.length) {
    console.info(`[sync] took back ${fresh.length} change(s) kept in the device's larger storage`);
    updatePendingIndicator();
    processSyncQueue();
  }
}

// Ask the browser not to clear this site's storage when the device runs low,
// once, the first time a change waits to upload. Installed apps are usually
// granted this without a prompt.
let _persistStorageAsked = false;
function askToKeepDeviceStorage() {
  if (_persistStorageAsked) return;
  _persistStorageAsked = true;
  try {
    const st = typeof navigator !== 'undefined' ? navigator.storage : null;
    if (!st || typeof st.persist !== 'function') return;
    Promise.resolve(typeof st.persisted === 'function' ? st.persisted() : false)
      .then(already => (already ? true : st.persist()))
      .catch(() => { /* not granted; storage behaves as before */ });
  } catch (_) { /* unsupported */ }
}

/** Stamp a confirmed cloud write. Storage failures are never worth throwing on. */
function markCloudSynced(at = Date.now()) {
  _lastCloudSyncAt = at;
  try { localStorage.setItem(LAST_CLOUD_SYNC_KEY, String(at)); } catch (_) { /* non-fatal */ }
}

/**
 * Paint the persistent offline / not-yet-uploaded chip. Idempotent and cheap —
 * safe to call from every sync transition. The wording and the decision to show
 * anything at all live in the pure describeSyncStatus(); this only writes DOM.
 */
function renderSyncChip() {
  const host = document.getElementById('sync-chip');
  if (!host) return;
  const view = describeSyncStatus({
    online: typeof navigator === 'undefined' || navigator.onLine !== false,
    pending: syncQueue.length,
    retrying: _syncRetrying,
    lastSyncedAt: _lastCloudSyncAt,
    heldInMemory: _syncQueueHeldInMemory,
  });

  renderFairSyncPill();
  // Today's "waiting to upload" line follows the queue as it fills and drains.
  if (document.getElementById('tab-today')?.classList.contains('active')) renderTodayLedger();
  host.hidden = !view.visible;
  host.classList.toggle('is-offline', view.tone === 'offline');
  host.classList.toggle('is-pending', view.tone === 'pending');
  host.classList.toggle('is-failed', view.tone === 'failed');

  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('sync-chip-ico', view.icon ?? '');
  set('sync-chip-title', view.title ?? '');
  set('sync-chip-detail', view.detail ?? '');
  set('sync-chip-meta', view.meta ?? '');
  host.setAttribute('aria-label', view.srText ?? '');

  const action = document.getElementById('sync-chip-action');
  if (action) {
    action.hidden = !view.action;
    if (view.action) {
      action.textContent = view.action.label;
      action.title = view.action.title;
    }
  }

  // "Last upload 14 min ago" goes stale on its own, so keep a slow tick running
  // only while the chip is actually on screen.
  clearInterval(_syncChipTimer);
  _syncChipTimer = null;
  if (view.visible && view.meta) _syncChipTimer = setInterval(renderSyncChip, 60_000);
}

/**
 * Drop the backoff and drain the queue immediately. Wired to the chip's
 * "Try again now" button — the moment a publisher knows the connection is back
 * is usually well before the next scheduled retry.
 */
function retrySyncNow() {
  clearTimeout(_syncRetryTimer);
  _syncRetryTimer = null;
  _syncRetryAttempt = 0;
  syncQueue.forEach(item => { delete item.retryAt; });
  processSyncQueue();
}

// ── Other tabs' leftover changes ───────────────────────────────────────────
// A tab closed (or frozen) before its offline changes uploaded leaves them under
// its own key. Any live tab adopts them: stored under this tab's key first, and
// only then removed from the old one, so a failed write leaves them where they
// were. Web Locks (where the browser has them) stop two tabs adopting the same
// change at once and uploading it twice.
export async function adoptOrphanedSyncChanges() {
  const storage = getLocalStorage();
  if (!storage) return;
  const adopt = () => {
    const { items, keys } = readOrphanQueues(storage, SYNC_TAB_ID);
    if (!keys.length) return;
    const have = new Set(syncQueue.map(item => item.qid).filter(Boolean));
    const fresh = items.filter(item => !have.has(item.qid));
    syncQueue.push(...fresh);
    const res = persistSyncQueue(storage, syncQueue, SYNC_QUEUE_STORAGE_KEY);
    if (!res.ok) {
      // Couldn't store them here: leave them under the old key for a later pass.
      syncQueue = syncQueue.filter(item => !fresh.includes(item));
      return;
    }
    releaseOrphanKeys(storage, keys);
    if (fresh.length) {
      console.info(`[sync] adopted ${fresh.length} change(s) left by another tab`);
      updatePendingIndicator();
      processSyncQueue();
    }
  };
  try {
    if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
      await navigator.locks.request('lm-sync-adopt', adopt);
    } else {
      adopt();
    }
  } catch (e) {
    console.warn('[sync] could not adopt another tab\'s changes', e);
  }
}

/**
 * True when another tab has adopted this tab's queue (this tab was frozen long
 * enough to look closed, e.g. restored from the back-forward cache). Its key is
 * gone though the last write here landed, so uploading the in-memory copy would
 * send those changes a second time.
 */
function syncQueueTakenByAnotherTab() {
  if (!syncQueue.some(item => !item.adopted) || _syncQueueHeldInMemory || _syncOverflowState !== 'none') return false;
  const storage = getLocalStorage();
  if (!storage) return false;
  try { return storage.getItem(SYNC_QUEUE_STORAGE_KEY) === null; } catch (_) { return false; }
}

setInterval(() => {
  markTabAlive(getLocalStorage(), SYNC_TAB_ID);
  adoptOrphanedSyncChanges();
  adoptOverflowSyncChanges();
}, SYNC_TAB_HEARTBEAT_MS);
window.addEventListener('pagehide', () => markTabGone(getLocalStorage(), SYNC_TAB_ID));
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  markTabAlive(getLocalStorage(), SYNC_TAB_ID);
  processSyncQueue();
});
setTimeout(adoptOrphanedSyncChanges, 0);
setTimeout(adoptOverflowSyncChanges, 0);

// Persist a not-yet-saved book state so an optimistic UI change is never
// lost. Only the LATEST snapshot per book is kept — a newer edit supersedes
// an older queued one, so rapid edits don't grow the queue unbounded.
function queueSync(bookId, state, baseOverride) {
  // Keep the merge base of the change this one supersedes: the newer snapshot
  // was still made on top of it, not on whatever the cloud holds now. Without
  // it the flush can't tell another device's edits from our own starting point.
  //
  // Never supersede the change that is uploading right now (removing the wrong
  // item when it landed dropped this edit), nor one adopted from another tab
  // (this tab's screen never showed it, so this snapshot doesn't contain it).
  const replaceable = item => item.bookId === bookId && !item.adopted && item !== _syncInFlightItem;
  const prior = syncQueue.find(replaceable);
  const uploading = !prior && _syncInFlightItem && _syncInFlightItem.bookId === bookId && !_syncInFlightItem.adopted
    ? _syncInFlightItem : null;
  const base = (prior && prior.base)
    || (uploading && uploading.base)
    || baseOverride
    || (typeof window._fbBaseFor === 'function' ? window._fbBaseFor(bookId) : undefined);
  // Made on top of the uploading snapshot: once that lands, this merges against
  // it (processSyncQueue swaps the base in). Until then it waits behind it.
  const after = (prior && prior.after) || (uploading && uploading.qid) || undefined;
  syncQueue = syncQueue.filter(item => !replaceable(item));
  // A copy, not the live object: later edits mutate states[bookId] in place,
  // and the queued snapshot has to stay the one this base describes.
  syncQueue.push({
    bookId, state: JSON.parse(JSON.stringify(state)), ts: Date.now(), base,
    qid: `${SYNC_TAB_ID}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    ...(after ? { after } : {}),
  });
  // Must not throw: the upload below is attempted whether or not the device
  // copy landed, so a full storage can't strand the change with no retry.
  saveSyncQueueToDevice();
  askToKeepDeviceStorage();
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
  renderSyncChip();
}

async function processSyncQueue() {
  if (_syncFlushing) return;
  if (!navigator.onLine || !fbReady || !syncQueue.length) return;
  let takenFromOverflow = false;
  if (_syncOverflowState === 'stored') {
    _syncFlushing = true;
    try { takenFromOverflow = await syncOverflowTakenByAnotherTab(); } finally { _syncFlushing = false; }
    if (takenFromOverflow) _syncOverflowState = 'none';
  }
  if (takenFromOverflow || syncQueueTakenByAnotherTab()) {
    // Another tab took these over and uploads them; sending them too would
    // record them twice. Keep only what was adopted here.
    syncQueue = syncQueue.filter(item => item.adopted);
    saveSyncQueueToDevice();
    updatePendingIndicator();
    if (!syncQueue.length) return;
  }
  const item = pickNextSyncItem(syncQueue);
  if (!item) {
    // Everything left is backing off after a failure (or waiting behind a
    // change that is); wake for the soonest retry.
    const now = Date.now();
    const waits = syncQueue.map(i => i.retryAt).filter(t => t && t > now);
    if (waits.length) {
      clearTimeout(_syncRetryTimer);
      _syncRetryTimer = setTimeout(processSyncQueue, Math.min(...waits) - now);
    }
    return;
  }
  _syncFlushing = true;
  _syncInFlightItem = item;
  try {
    // An item saved by an older build has no base: an empty one makes the merge a
    // union, which may keep a row another device deleted but never drops one.
    const res = await window._fbSave(item.bookId, JSON.stringify(item.state), { base: item.base || {} });
    // The server copy couldn't be read, so nothing was written and the queued
    // change is still pending. Treat it exactly like a failed write: keep it
    // queued and let the backoff retry rather than dropping it.
    if (res && res.ok === false) throw new Error(res.reason || 'save-unverified');

    // Remove exactly this item. syncQueue.shift() removed whatever was at the
    // head by then, which an edit queued during the upload could have changed.
    _syncInFlightItem = null;
    const at = syncQueue.indexOf(item);
    if (at !== -1) syncQueue.splice(at, 1);
    // An edit queued while this was uploading was made on top of this snapshot,
    // so this snapshot (not the base this one carried) is its merge base.
    if (item.qid) {
      syncQueue.forEach(next => {
        if (next.after === item.qid) { next.base = partHashesOf(item.state); delete next.after; }
      });
    }
    const newerPending = syncQueue.some(other => other.bookId === item.bookId);

    // This is the path that matters after a stretch offline: whatever the other
    // device wrote while we were away is now merged in, so adopt the reconciled
    // state instead of leaving the screen on our pre-merge copy — unless a newer
    // change to this book is still queued: the screen already shows it, and its
    // own upload merges and adopts the result.
    if (res && res.merged && res.state) {
      if (!newerPending) adoptMergedState(item.bookId, res);
      else reportMergeOutcome(item.bookId, res.conflicts);
      lastSaveTimes[item.bookId] = Date.now();
    } else {
      // Mark this exact snapshot as saved so saveState won't re-send it.
      const json = JSON.stringify(item.state);
      if (states[item.bookId] && JSON.stringify(states[item.bookId]) === json) {
        lastSavedHashes[item.bookId] = json;
        lastSaveTimes[item.bookId] = Date.now();
      }
    }
    // Cannot throw. This item IS uploaded; a storage error here used to land in
    // the catch below, report a false "Save failed" and stall the queue.
    saveSyncQueueToDevice();
    // Still backing off on another book's change? Keep the retry state (and the
    // chip saying so) until that one lands too.
    if (!syncQueue.some(other => other.retryAt && other.retryAt > Date.now())) {
      _syncRetryAttempt = 0;
      _syncRetrying = false;
    }
    _syncFlushing = false;
    markCloudSynced();
    announceBookSaved(item.bookId);
    if (syncQueue.length) {
      updatePendingIndicator();
      processSyncQueue();
    } else {
      setSyncState('ok', '<b>Firestore</b> · connected · live sync on');
      showToast('✅ All changes synced');
      renderSyncChip();
    }
  } catch (e) {
    console.error('Queue sync failed', e);
    _syncFlushing = false;
    _syncInFlightItem = null;
    // Schedule an automatic retry with exponential backoff (capped at 30s)
    // so a transient failure reconciles itself without user action.
    _syncRetryAttempt++;
    _syncRetrying = true;
    const delay = Math.min(30000, 2000 * Math.pow(2, _syncRetryAttempt - 1));
    // This change backs off on its own, so one book the cloud keeps refusing
    // (a permission error, an oversized record) can't hold up every other book.
    item.retryAt = Date.now() + delay;
    setSyncState('error', `<b>Firestore</b> · ${syncQueue.length} pending · retrying…`);
    if (_syncRetryAttempt === 1) {
      // Don't claim "saved locally" when the device just refused to store it.
      showToast(
        _syncQueueHeldInMemory
          ? '⚠ Save failed — keep the app open; your change will retry but isn\'t stored on this device'
          : '⚠ Save failed — your change is saved locally and will retry',
        'err',
        _syncQueueHeldInMemory ? 8000 : 4000,
      );
    }
    renderSyncChip();
    clearTimeout(_syncRetryTimer);
    _syncRetryTimer = setTimeout(processSyncQueue, delay);
    // Other books' changes needn't wait out this one's backoff.
    if (pickNextSyncItem(syncQueue)) setTimeout(processSyncQueue, 0);
  }
}

// Connection changes are reflected the INSTANT they happen, not at the next
// save attempt. Before this, walking out of Wi-Fi range at a market changed
// nothing on screen — the status still read "Live" until something was sold.
window.addEventListener('online', () => {
  // A restored connection means the backoff clock is stale: drain now.
  _syncRetryAttempt = 0;
  syncQueue.forEach(item => { delete item.retryAt; });
  clearTimeout(_syncRetryTimer);
  _syncRetryTimer = null;
  if (!syncQueue.length) setSyncState('ok', '<b>Firestore</b> · connected · live sync on');
  renderSyncChip();
  processSyncQueue();
});
window.addEventListener('offline', () => {
  // setSyncState detects "offline" in the message and shows the amber dot; the
  // chip carries the part that explains what happens to the work in the queue.
  setSyncState('ok', '<b>Firestore</b> · offline · changes save on this device');
  renderSyncChip();
});

export let sheetsUrl = localStorage.getItem('lm-sheets-url') || '';
export let sheetsSpreadsheetUrl = localStorage.getItem('lm-sheets-spreadsheet-url') || '';
// Apps Script Web App endpoint used ONLY to fire the "needs approval"
// notification email. The publisher connects the Sheet on their own device, but
// the approval-needed email has to be sent from the ARTIST's browser at submit
// time — and that device never ran the Sheet setup. So we mirror the endpoint
// into shared cloud settings (settings/notifyEndpoint) on connect and load it
// here on every device, giving artist sessions a URL to POST the email to.
export let notifyUrl = localStorage.getItem('lm-notify-url') || '';
// The Apps Script `scriptVersion` the client expects. Bump this (and the value
// in apps-script/Code.gs) whenever Code.gs gains behaviour that needs a fresh
// deploy — the connection card flags any older deployed version as outdated.
export const EXPECTED_SCRIPT_VERSION = 'v57';
// What the connected spreadsheet last told us it was running. Null until a
// version check has actually answered — an unknown version is not a mismatch,
// so the To-do list stays quiet rather than inventing a problem.
let _sheetsDeployedVersion = null;
if (sheetsUrl) {
  const normalizedSavedUrl = normalizeAppsScriptUrl(sheetsUrl);
  if (normalizedSavedUrl && normalizedSavedUrl !== sheetsUrl) {
    sheetsUrl = normalizedSavedUrl;
    localStorage.setItem('lm-sheets-url', normalizedSavedUrl);
  }
}


// ── TOAST
// A problem stays up long enough to read: an error that vanished in under
// three seconds was often gone before anyone looked down at it. Problems can
// also be pressed away, so a long one never sits over a button.
const TOAST_MIN_MS = { warn: 5000, err: 7000 };

export function showToast(msg, type = 'ok', dur = 2800) {
  const t = $('toast'); t.textContent = msg;
  t.className = 'toast show' + (type === 'warn' ? ' warn' : type === 'err' ? ' err' : '');
  if (!t._bound) {
    t._bound = true;
    t.addEventListener('click', () => { clearTimeout(t._t); t.classList.remove('show'); });
  }
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), Math.max(dur, TOAST_MIN_MS[type] || 0));
}
// Expose so modules loaded before main.js completes (firebase.js) can call back.
window.showToast = showToast;

// ── APPEARANCE (light / dark) ─────────────────────────────────────────────
// Preference logic lives in src/lib/theme.js; this is the wiring: render the
// segmented control wherever it appears, keep it in sync, and re-resolve when
// the OS flips while the app is open.
let themePreference = readThemePreference();
// The theme actually RENDERED. Distinct from themePreference: under 'system'
// it is whatever the OS says, and the header toggle has to flip relative to
// what's on screen, not relative to the stored preference.
let resolvedTheme = 'light';

const THEME_OPTION_ICONS = { system: '◐', light: '☀', dark: '☾' };
const THEME_SUB_COPY = {
  system: 'Following your device',
  light: 'Always light',
  dark: 'Always dark',
};

/**
 * (Re)renders every [data-theme-seg] radiogroup on the page. There are two —
 * the header account panel and the publisher sidebar — and both must reflect
 * the same state, so this always paints all of them rather than the one that
 * was clicked.
 */
function renderThemeControls() {
  const groups = document.querySelectorAll('[data-theme-seg]');
  groups.forEach((group) => {
    const index = THEME_PREFERENCES.indexOf(themePreference);
    group.style.setProperty('--tseg-index', String(Math.max(0, index)));
    // Rebuild only on first paint; afterwards just update state, so a click
    // never destroys the element the user is still interacting with.
    if (!group.children.length) {
      group.innerHTML = THEME_PREFERENCES.map((pref) => `
        <button type="button" class="theme-seg-opt" role="radio"
                data-theme-opt="${pref}" onclick="setThemePreference('${pref}')"
                title="${THEME_SUB_COPY[pref]}">
          <span class="tso-ico" aria-hidden="true">${THEME_OPTION_ICONS[pref]}</span
          ><span class="tso-txt">${THEME_LABELS[pref]}</span>
        </button>`).join('');
    }
    group.querySelectorAll('[data-theme-opt]').forEach((btn) => {
      const on = btn.dataset.themeOpt === themePreference;
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      // Roving tabindex: one stop for the whole group, arrows move within it.
      btn.tabIndex = on ? 0 : -1;
    });
  });
  document.querySelectorAll('#theme-sub-header, #theme-sub-side').forEach((el) => {
    el.textContent = THEME_SUB_COPY[themePreference];
  });

  // The one-tap toggle advertises its DESTINATION, not the current state — a
  // moon means "go dark", which is what a user reaching for it wants to know.
  const toggle = document.getElementById('theme-toggle-btn');
  if (toggle) {
    const goingDark = resolvedTheme !== 'dark';
    const label = goingDark ? 'Switch to dark mode' : 'Switch to light mode';
    const icon = toggle.querySelector('.ttb-ico');
    if (icon) icon.textContent = goingDark ? '☾' : '☀';
    toggle.title = label;
    toggle.setAttribute('aria-label', label);
    // aria-pressed reports the STATE (dark is on), which is the opposite of
    // what the icon shows — screen readers announce state, sighted users read
    // the destination.
    toggle.setAttribute('aria-pressed', resolvedTheme === 'dark' ? 'true' : 'false');
  }
  // The phone side menu names the mode it switches TO, like the toggle's icon.
  const drawerTheme = document.getElementById('more-sheet-theme');
  if (drawerTheme) {
    drawerTheme.textContent = resolvedTheme === 'dark' ? 'Day mode' : 'Night mode';
    drawerTheme.setAttribute('aria-pressed', resolvedTheme === 'dark' ? 'true' : 'false');
  }
}

/**
 * Sets the appearance preference, persists it, and repaints the controls.
 * Exposed on window for the inline handlers above.
 */
export function setThemePreference(preference, { announce = true } = {}) {
  const next = normalizeThemePreference(preference);
  const changed = next !== themePreference;
  themePreference = next;
  const resolved = applyThemeToDocument(next);
  resolvedTheme = resolved;
  const stored = writeThemePreference(next);
  // --book-accent-text was derived for the OLD surface; re-derive it.
  // Skipped before a book is active — switchBook() will set it correctly.
  if (activeBook) applyBookAccentTokens(activeBook);
  renderThemeControls();
  if (announce && changed) {
    showToast(stored
      ? `Appearance: ${THEME_LABELS[next]}`
      : `Appearance: ${THEME_LABELS[next]} — couldn't save the preference`,
    stored ? 'ok' : 'warn');
  }
  return resolved;
}

/** Auto → Light → Dark → Auto. Bound to the header control's keyboard path. */
export function cycleThemePreference() {
  return setThemePreference(nextThemePreference(themePreference));
}

/** The header button: flip to the opposite of what is on screen. */
export function toggleTheme() {
  return setThemePreference(oppositeThemePreference(resolvedTheme));
}

/**
 * Boot: apply the stored preference, then keep following the OS for as long as
 * the preference is 'system'. matchMedia fires while the app is open, which is
 * the case that matters — a phone crossing into its scheduled night mode
 * mid-event should not leave the operator on a white screen.
 */
function initTheme() {
  resolvedTheme = applyThemeToDocument(themePreference);
  renderThemeControls();
  try {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener?.('change', (e) => {
      if (themePreference !== 'system') return;
      resolvedTheme = applyThemeToDocument('system', { prefersDark: e.matches });
      if (activeBook) applyBookAccentTokens(activeBook);
      // Repaint so the toggle's icon follows the OS flip too.
      renderThemeControls();
    });
  } catch (_) { /* matchMedia unavailable — the stored preference still applies */ }

  // Arrow-key navigation inside the segmented control, per the radiogroup role.
  document.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const opt = e.target?.closest?.('[data-theme-opt]');
    if (!opt) return;
    e.preventDefault();
    const step = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
    const i = THEME_PREFERENCES.indexOf(themePreference);
    const next = THEME_PREFERENCES[(i + step + THEME_PREFERENCES.length) % THEME_PREFERENCES.length];
    setThemePreference(next);
    opt.closest('[data-theme-seg]')?.querySelector(`[data-theme-opt="${next}"]`)?.focus();
  });
}

// main.js is a deferred module, so the document is fully parsed by the time
// this runs — the controls' host markup exists and needs no DOMContentLoaded.
initTheme();

// Publish the app header's height as --sticky-top so the ledger tables marked
// .sys-sticky-head can pin their column labels just below it. Same reasoning as
// initTheme() above for running here rather than on DOMContentLoaded.
initStickyOffset();

// Paint the sync chip on boot. This is the case a reload used to lose entirely:
// open the app already offline, or with writes still queued from last session,
// and nothing on screen said so until the next save was attempted.
renderSyncChip();

/**
 * Writes the --book-accent-* custom properties for a book (or the all-books
 * gold default).
 *
 * One function for all three call sites — switchBook, the post-edit refresh and
 * the author-mode boot — because the DERIVED members (-light/-text/-contrast)
 * were only ever written by switchBook. Editing a book's accent left a stale
 * --book-accent-text behind, and an author session never got one at all.
 *
 * --book-accent-text is baked into a custom property rather than computed in
 * CSS, so it cannot follow the cascade: setThemePreference() calls this again on
 * every theme change, or a publisher who switches to dark keeps the colour that
 * was chosen to read on cream.
 *
 * --book-accent-text-on-ink is a second, theme-independent derivation for the
 * handful of spots (the dashboard's .stock-block pill and stock-alert) that
 * are an --ink panel in BOTH themes. --book-accent-text assumes the "typical"
 * surface for whichever theme is active — cream in light mode, near-black in
 * dark mode — so in dark mode it already happens to read fine on ink, but in
 * light mode a book with a mid/dark cover accent (most of them) computes a
 * colour tuned for cream and is close to unreadable on that permanently-dark
 * card. This one always runs the ink-safe half of getContrastSafeText(),
 * regardless of theme, so it stays correct without needing to know which
 * elements are asking for it.
 */
function applyBookAccentTokens(bookId) {
  const root = document.documentElement;
  const book = bookId && bookId !== 'all' ? BOOKS[bookId] : null;
  if (!book) {
    root.style.setProperty('--book-accent', 'var(--gold2)');
    root.style.setProperty('--book-accent-bg', 'var(--gold-bg)');
    root.style.setProperty('--book-accent-light', 'var(--gold3)');
    root.style.setProperty('--book-accent-text', 'var(--gold-text)');
    root.style.setProperty('--book-accent-text-on-ink', 'var(--gold3)');
    root.style.setProperty('--book-accent-contrast', 'var(--ink)');
    root.style.setProperty('--book-accent-fill', 'var(--gold2)');
    return;
  }
  root.style.setProperty('--book-accent', book.accent);
  root.style.setProperty('--book-accent-bg', book.accentBg);
  root.style.setProperty('--book-accent-light', lightenColor(book.accent, 0.25));
  // Light mode's accent-as-text measures the real WCAG ratio against the
  // darkest light surface it lands on.
  // getContrastSafeText(hex, false) only darkened covers brighter than 50%, so
  // a mid-tone cover passed straight through: The Hound's blue read at
  // 3.3-3.8:1 on its own pills and the "stock is healthy" note.
  root.style.setProperty('--book-accent-text', resolvedTheme === 'dark'
    ? getContrastSafeText(book.accent, true)
    : getPaperSafeText(book.accent));
  root.style.setProperty('--book-accent-text-on-ink', getContrastSafeText(book.accent, true));
  // The accent as a SOLID FILL, and the label that reads on it. Paired so
  // neither is chosen without measuring against the other — see
  // getAccentFillPair() for why a mid-tone cover needs its fill nudged.
  const pair = getAccentFillPair(book.accent);
  root.style.setProperty('--book-accent-fill', pair.fill);
  root.style.setProperty('--book-accent-contrast', pair.label);
}

// The two backends report a rules rejection differently: Firestore sets
// code:'permission-denied' and a message of "Missing or insufficient
// permissions", while the Realtime Database puts PERMISSION_DENIED in the
// message text. The submission handlers only checked the RTDB spelling, so a
// Firestore book's rejection fell through to the generic failure message.
export function isPermissionDenied(err) {
  if (!err) return false;
  if (err.code === 'permission-denied' || err.code === 'PERMISSION_DENIED') return true;
  return typeof err.message === 'string' && err.message.includes('PERMISSION_DENIED');
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
  // Phone top bar and side menu carry the same word and square.
  const phoneDot = $('phone-sync-dot'), drawerSync = $('more-sheet-sync');
  if (phoneDot) phoneDot.className = dotCls;
  if (drawerSync) drawerSync.textContent = word;
  // The chip reads the same three facts this function is reacting to, so keep
  // the two in lockstep rather than letting a caller update one and not the
  // other. It is a no-op whenever there is nothing outstanding to say.
  renderSyncChip();
}

// ── FIREBASE (per-book)
// One save per book at a time. Two overlapping saves both took the merge base
// from before either landed, so the second saw the first's new sales as another
// device's additions and the merge kept them twice. A save asked for while one
// is in flight now waits and runs once, afterwards, with whatever the book holds
// by then; callers awaiting it resolve when that later save is done.
const _saveRuns = new Map();
const _saveAgain = new Set();

export async function saveState(bookId) {
  // Whatever changed the book, it is being saved: everything that follows a
  // change (the Google Sheet's expense rows, the header counts) hears it here.
  // See wireBookEvents.
  announceBookChanged(bookId);
  if (_saveRuns.has(bookId)) {
    _saveAgain.add(bookId);
    return _saveRuns.get(bookId);
  }
  const run = (async () => {
    let base;
    do {
      _saveAgain.delete(bookId);
      base = await saveStateNow(bookId, base);
    } while (_saveAgain.has(bookId) || base);
  })();
  _saveRuns.set(bookId, run);
  try {
    await run;
  } finally {
    _saveRuns.delete(bookId);
  }
}

/** True while a save of this book is running (the live listener stands aside). */
function saveInFlight(bookId) {
  return _saveRuns.has(bookId);
}

/**
 * True when this device holds the book as the cloud has it: nothing waiting to
 * upload and no save running. While a change is waiting, the live listener
 * ignores other devices' updates to the book, so this device's copy may be
 * missing their newest records — the Google Sheet tidy-up leaves such a book
 * alone rather than remove rows for records it simply hasn't seen yet.
 */
export function bookInSyncWithCloud(bookId) {
  return !syncQueue.some(item => item.bookId === bookId) && !saveInFlight(bookId);
}

// `rebase` is the merge base for a save that follows a merged one: the snapshot
// that save sent. Returns such a base when this save merged but the book was
// edited while it ran, so the follow-up save merges those edits in rather than
// writing over what the other device added.
async function saveStateNow(bookId, rebase) {
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
  const size = checkBookSize(bookId, state, json);
  setSyncState('syncing', '<b>Firestore</b> · saving…');
  try {
    // A change for this book is already waiting in the queue: this edit was
    // made on top of it, so it must go out after it and merge against the
    // same base, not race it with a direct write.
    if (!fbReady || !navigator.onLine || syncQueue.some(item => item.bookId === bookId)) {
      queueSync(bookId, state, rebase);
      setSyncState('ok', '<b>Firestore</b> · changes queued (offline)');
      return;
    }
    const res = await window._fbSave(bookId, json, rebase ? { base: rebase } : undefined);
    // Couldn't read the server copy, so _fbSave declined to overwrite it rather
    // than risk erasing a change made on another device. Queue and retry.
    if (res && res.ok === false) {
      queueSync(bookId, JSON.parse(json), rebase);
      setSyncState('error', '<b>Firestore</b> · could not verify cloud copy · retrying…');
      return;
    }
    // Edited while the save was in flight? Then the screen holds more than was
    // sent, and the follow-up save (saveState runs one) must carry it.
    const editedSince = states[bookId] !== state || JSON.stringify(states[bookId]) !== json;
    // Another device had written since we last synced and _fbSave merged the
    // two. Adopt the reconciled state locally so the screen matches the cloud
    // instead of the version we tried to push.
    if (res && res.merged && res.state) {
      if (editedSince) {
        // Adopting would wipe the new edit off the screen. Leave it, mark the
        // book dirty against what the cloud now holds, and have the follow-up
        // merge it with the snapshot just sent as base.
        lastSavedHashes[bookId] = JSON.stringify(res.state);
        reportMergeOutcome(bookId, res.conflicts);
        _saveAgain.add(bookId);
        lastSaveTimes[bookId] = Date.now();
        markCloudSynced();
        announceBookSaved(bookId);
        return partHashesOf(JSON.parse(json));
      }
      adoptMergedState(bookId, res);
    } else {
      lastSavedHashes[bookId] = json;
    }
    lastSaveTimes[bookId] = Date.now();
    // A confirmed cloud write — this is what "Last upload …" on the sync chip
    // measures from, so the next offline stretch can say how stale the cloud is.
    markCloudSynced();
    // The cloud now holds this book as saved: the stock number the website
    // follows is published from that saved copy (see features/website-link.js).
    announceBookSaved(bookId);
    setSyncState('ok', '<b>Firestore</b> · saved · live sync on');
    const ind = $('save-ind'); if (ind) { ind.classList.add('show'); setTimeout(() => ind.classList.remove('show'), 2000); }
  } catch (e) {
    console.error(`Firebase Save Error [${bookId}]:`, e);
    // The optimistic UI already shows this change, but the cloud write
    // failed. Queue it (with backoff retry) so the change is never lost
    // and reconciles automatically instead of silently diverging.
    queueSync(bookId, states[bookId] || state, rebase);
    // Too big for one cloud record: say that, not a generic retry, since
    // retrying alone won't get it through.
    if (size.level === 'over') setSyncState('error', '<b>Firestore</b> · book too big to save · kept on this device');
  }
  return undefined;
}

// Warn once per session per book when its fullest cloud record passes 70% of
// the size cap, and again if it goes over. A save past the cap is refused
// whole (see lib/book-size.js), so this is the only notice the owner gets
// before a book stops saving.
const _bookSizeWarned = new Map();
function checkBookSize(bookId, state, json) {
  const firestore = typeof window._useFirestoreForBook === 'function' ? !!window._useFirestoreForBook(bookId) : true;
  const report = bookSizeReport(state, { firestore, json });
  if (report.level === 'ok' || _bookSizeWarned.get(bookId) === report.level) return report;
  _bookSizeWarned.set(bookId, report.level);
  const title = (BOOKS[bookId] && BOOKS[bookId].title) || bookId;
  showToast(bookSizeMessage(report, title), report.level === 'over' ? 'err' : 'warn', 9000);
  reportClientError('book-size', `${report.part} ${report.bytes}/${report.limit} bytes (${report.level})`, { source: bookId });
  return report;
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
  reportMergeOutcome(bookId, res.conflicts);
}

// A merge is normal and needs no alarm; a conflict means the same record was
// edited in two places and one version was dropped, which the user should hear
// about rather than discover in the ledger later — and, since the dropped
// version used to vanish with the toast, it is now kept on this device (see
// src/lib/sync-conflicts.js) and can be compared and brought back from the
// "Edits made on two devices" card on the Backups tab.
function reportMergeOutcome(bookId, conflicts) {
  const all = Array.isArray(conflicts) ? conflicts : [];
  if (all.length) console.warn('[sync] merge conflicts — this device\'s version was kept:', all);
  let added = [];
  let unsaved = 0;
  try {
    const book = BOOKS[bookId];
    ({ added, unsaved = 0 } = recordConflicts(syncConflictStorage(), {
      bookId,
      bookTitle: (book && book.title) || bookId,
      cur: book ? getBookCurrencyCode(book) : '',
      conflicts: all,
    }));
  } catch (e) {
    // Recording is a safety net; it must never turn a successful save into an error.
    console.warn('[sync] could not record merge conflicts', e);
  }
  refreshSyncConflictUi();
  // Only conflicts a person can act on are counted. Two devices disagreeing
  // about a running balance the app has already recomputed is not news.
  const n = added.length;
  if (unsaved) {
    showToast(
      `⚠ ${n + unsaved} record${n + unsaved === 1 ? ' was' : 's were'} changed on two devices at once — this device's version was kept. This device is out of storage, so ${unsaved === 1 ? 'the other version' : `${unsaved} of the other versions`} couldn't be kept for review.`,
      'warn', 10000
    );
    return;
  }
  if (!n) {
    showToast('↩ Merged in changes from another device', 'ok', 4000);
    return;
  }
  const where = isPublisherSession() ? ' Compare them under Backups → Needs review.' : '';
  showToast(
    `⚠ ${n} record${n === 1 ? ' was' : 's were'} changed on two devices at once — this device's version was kept.${where}`,
    'warn', 9000
  );
}

// ── EDITS MADE ON TWO DEVICES — REVIEW ───────────────────────────────────────
// The review screen for the conflicts recorded above. Publisher-only: it lives
// on the Backups tab (which authors can't open), and restoring rewrites a
// book's ledger, which author sessions never do.

function syncConflictStorage() {
  try { return window.localStorage; } catch { return null; }
}

// Paints the Backups card, the sidebar badge and (if open) the review list
// from what is stored. Cheap — a localStorage read and a few text writes.
function refreshSyncConflictUi() {
  try {
    const n = listConflicts(syncConflictStorage()).length;
    const card = $('sync-review-card');
    if (card) card.classList.toggle('has-items', n > 0);
    const kicker = $('sync-review-kicker');
    if (kicker) kicker.textContent = n ? 'Needs review' : 'All clear';
    const status = $('sync-review-status');
    if (status) status.textContent = describeConflictCount(n);
    const open = $('sync-review-open');
    if (open) open.hidden = n === 0;

    const nav = document.querySelector('#pub-sidebar .snav[title="Backups"]');
    if (nav) {
      let badge = nav.querySelector('.sync-review-badge');
      if (!badge && n) {
        badge = document.createElement('span');
        badge.className = 'sync-review-badge pill red';
        nav.appendChild(badge);
      }
      if (badge) {
        badge.hidden = n === 0;
        badge.textContent = String(n);
        badge.setAttribute('aria-label', `${n} record${n === 1 ? '' : 's'} changed on two devices need${n === 1 ? 's' : ''} review`);
      }
    }
    const ov = $('m-sync-conflicts');
    if (ov && ov.style.display === 'flex') renderSyncConflictList();
  } catch (e) {
    console.warn('[sync] could not paint the review card', e);
  }
}

function renderSyncConflictList() {
  const body = $('sync-conflicts-body');
  if (!body) return;
  const entries = listConflicts(syncConflictStorage());
  body.innerHTML = renderConflictListHtml(entries);
  const count = $('sync-conflicts-count');
  if (count) count.textContent = entries.length ? `${entries.length} to review` : '';
}

function openSyncConflicts() {
  renderSyncConflictList();
  openM('sync-conflicts');
}

// The live region is permanent markup in the dialog, so it survives the list
// being rebuilt and still gets announced.
function announceSyncConflict(msg) {
  const live = $('sync-conflicts-live');
  if (live) live.textContent = msg;
}

// After a card goes away, put keyboard focus on the next one's first button
// (or the dialog's Close button) instead of dropping it on <body>.
function afterSyncConflictAction(index) {
  refreshSyncConflictUi();
  const items = document.querySelectorAll('#sync-conflicts-body .sc-item');
  const next = items[Math.min(index, items.length - 1)];
  const target = (next && next.querySelector('button')) || $('sync-conflicts-close');
  if (target) { try { target.focus(); } catch { /* focus is best-effort */ } }
}

function syncConflictIndex(id) {
  return listConflicts(syncConflictStorage()).findIndex(e => e.id === id);
}

function keepSyncConflict(id) {
  const entries = listConflicts(syncConflictStorage());
  const index = entries.findIndex(e => e.id === id);
  if (index === -1) { afterSyncConflictAction(0); return; }
  dismissConflict(syncConflictStorage(), id);
  announceSyncConflict(`Kept this device's version: ${describeRecord(entries[index])}.`);
  afterSyncConflictAction(index);
}

async function restoreSyncConflict(id) {
  if (!isPublisherSession()) { showToast('Only the publisher can change these records.', 'err'); return; }
  const entry = listConflicts(syncConflictStorage()).find(e => e.id === id);
  if (!entry) { afterSyncConflictAction(0); return; }
  const summary = describeRecord(entry);
  const book = BOOKS[entry.bookId];
  if (!book) {
    showToast(`“${entry.bookTitle || 'That book'}” is no longer in your catalogue, so this can't be put back. Choose “Keep this device's version” to clear it.`, 'warn', 7000);
    return;
  }
  const loaded = () => { const s = states[entry.bookId]; return s && !s._loadFailed ? s : null; };
  if (!loaded()) {
    showToast(`${book.title} hasn't loaded on this device yet. Open it — or reload once you're back online — then try again.`, 'warn', 7000);
    return;
  }

  let target = locateConflictTarget(loaded(), entry);
  if (target.status === 'restored') {
    dismissConflict(syncConflictStorage(), id);
    announceSyncConflict(`Already using the other device's version: ${summary}.`);
    afterSyncConflictAction(Math.max(0, syncConflictIndex(id)));
    return;
  }
  if (target.status === 'changed' || target.status === 'missing') {
    const ok = await confirmDialog(
      target.status === 'missing'
        ? `“${summary}” has been deleted on this device since the two versions clashed. Using the other device's version will add it back to ${book.title}.`
        : `“${summary}” has been edited again on this device since the two versions clashed. Using the other device's version will replace those newer edits as well.`,
      { title: 'This record has changed since', okLabel: "Use the other device's version", cancelLabel: 'Leave it as it is', danger: true }
    );
    if (!ok) return;
    // The dialog was open for a while; look again rather than trust the old answer.
    if (!loaded()) { showToast(`${book.title} is reloading — try again in a moment.`, 'warn', 5000); return; }
    target = locateConflictTarget(loaded(), entry);
  }

  const index = Math.max(0, syncConflictIndex(id));
  const s = loaded();
  applyConflictRestore(s, entry, target);
  // loadBook copies this one setting onto the book object; keep them agreeing.
  if (target.loc.kind === 'value' && target.loc.field === 'artistPaymentLink') book.artistPaymentLink = s.artistPaymentLink;
  // Same recompute the merge path runs, so stock, revenue, store counts and
  // every running balance reflect the restored record before it is saved.
  recomputeAfters(s, book);
  _appliedIdsCache = null;
  dismissConflict(syncConflictStorage(), id);
  if (activeBook === entry.bookId || activeBook === 'all') renderCurrent();
  saveState(entry.bookId).catch(e => console.error('[sync] save after restore failed', e));

  announceSyncConflict(`Now using the other device's version: ${summary}.`);
  const list = target.loc.kind === 'row' ? target.loc.list : '';
  // Expenses reach the sheet by themselves on the next save; sales and
  // consignment rows are only rewritten by Sync all data.
  const sheetNote = sheetsUrl && ['hist', 'ledger'].includes(list)
    ? ' Your Google Sheet isn’t updated automatically — use “Sync all data” on the Sheets tab.'
    : '';
  showToast(`✓ Restored the other device's version.${sheetNote}`, 'ok', sheetNote ? 7000 : 3500);
  afterSyncConflictAction(index);
}

// Another tab on this device recorded or cleared one — keep this tab's badge honest.
window.addEventListener('storage', (e) => { if (e.key === SYNC_CONFLICTS_KEY) refreshSyncConflictUi(); });
Object.assign(window, { openSyncConflicts, keepSyncConflict, restoreSyncConflict, refreshSyncConflictUi });
// First paint, so a conflict recorded in an earlier session is flagged on load.
refreshSyncConflictUi();

export async function loadBook(bookId) {
  setSyncState('syncing', '<b>Firestore</b> · loading…');
  try {
    if (!fbReady) throw new Error('not ready');
    // A book added after the move to the new storage still lives in the old one,
    // out of the website link's reach: move it over before reading it.
    let lateRecords = [];
    if (window.IS_PUBLISHER && typeof window._fbAdoptBook === 'function') {
      try {
        const moved = await window._fbAdoptBook(bookId);
        if (moved && Array.isArray(moved.late)) lateRecords = moved.late;
        // Moved, and the copy was checked record by record against the old one.
        if (moved && moved.decision === 'adopted' && moved.state) {
          const title = (BOOKS[bookId] && BOOKS[bookId].title) || bookId;
          const sales = (moved.state.hist || []).filter(h => h && !h.voided).length;
          const onHand = deriveOnHand(moved.state, BOOKS[bookId]);
          showToast(`✓ ${title} moved to the new storage — ${sales} sale${sales === 1 ? '' : 's'} and ${onHand} on hand, checked against the old copy`, 'ok', 7000);
        }
      } catch (e) { console.warn('Could not move book to the new storage', bookId, e); }
    }
    const json = await window._fbLoad(bookId);
    const book = BOOKS[bookId];
    if (json) {
      const loaded = JSON.parse(json);
      states[bookId] = { ...defaultState(book), ...loaded };
    } else {
      states[bookId] = defaultState(book);
    }
    // A change made here that hasn't uploaded yet (say, a sale recorded offline
    // before a reload) isn't in the cloud copy. Show it: the next edit is built
    // on the screen and supersedes the queued change, so a screen without it
    // made that edit silently drop it. lastSavedHashes stays on the cloud copy
    // below, so the book still reads as having something to send.
    const pending = [...syncQueue].reverse().find(item => item.bookId === bookId && !item.adopted);
    if (pending) states[bookId] = { ...defaultState(book), ...JSON.parse(JSON.stringify(pending.state)) };
    if (!states[bookId].doneIds) states[bookId].doneIds = [];
    if (!states[bookId].artistTransfers) states[bookId].artistTransfers = [];
    if (!states[bookId].artistPayouts) states[bookId].artistPayouts = [];
    if (!states[bookId].expenses) states[bookId].expenses = [];
    // Sync artist payment link to book object so publisher can read it in reimbursements
    if (states[bookId].artistPaymentLink) BOOKS[bookId].artistPaymentLink = states[bookId].artistPaymentLink;
    recomputeAfters(states[bookId], BOOKS[bookId]);
    lastSavedHashes[bookId] = pending && json ? json : JSON.stringify(states[bookId]);
    // Sales another device saved to the old storage while this book was moving:
    // add them through the normal save, which only adds to the cloud copy.
    if (lateRecords.length && restoreRecords(states[bookId], lateRecords)) {
      recomputeAfters(states[bookId], BOOKS[bookId]);
      saveState(bookId).catch(e => console.warn('Could not save records found during the move', bookId, e));
    }
    // Watch for live updates
    window._fbWatchSubmissions(bookId, data => {
      window.authorSubmissions[bookId] = data || {};
      if (activeBook === bookId || activeBook === 'all') scheduleRender();
      else { try { updatePublisherActionBanner(); } catch (_) { } }
    });

    window._fbWatch(bookId, json2 => {
      noteDeviceCopyFresh();
      if (json2 === lastSavedHashes[bookId]) return;
      // This book has an unsent change. Replacing the screen with the cloud
      // copy would hide it until the flush; the flush merges the two and
      // adopts the result instead. Same while a save is in flight: the snapshot
      // may be that save's own echo, older than an edit made since, and the
      // save already reads and merges the server copy.
      if (syncQueue.some(item => item.bookId === bookId) || saveInFlight(bookId)) return;
      const loaded = JSON.parse(json2);
      states[bookId] = { ...defaultState(book), ...loaded };
      if (!states[bookId].doneIds) states[bookId].doneIds = [];
      if (!states[bookId].artistTransfers) states[bookId].artistTransfers = [];
      if (!states[bookId].artistPayouts) states[bookId].artistPayouts = [];
      recomputeAfters(states[bookId], BOOKS[bookId]);
      lastSavedHashes[bookId] = json2;
      // Another device saved this book. Its expense rows reach the sheet even if
      // that device has no sheet connected, and the website's stock follows the
      // cloud copy (wireBookEvents, startWebsiteLink).
      announceBookChanged(bookId, 'remote');
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
    const priorState = states[bookId];
    // A copy shown from the device while starting up was never loaded: a
    // failed first load says so, the same as with nothing on screen.
    if (priorState && !priorState._loadFailed && !priorState._preview) {
      // A reload that failed leaves the book already on screen untouched; the
      // real data is still there, so don't swap it for an empty ledger.
      setSyncState('error', '<b>Firestore</b> · reload failed');
      showToast(`⚠ Could not refresh ${(BOOKS[bookId] && BOOKS[bookId].title) || bookId} — still showing the last copy loaded.`, 'err', 5000);
      return;
    }
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
    const anyOtherFSBook = Object.keys(BOOKS).some(id => id !== activeBook && window._useFirestoreForBook(id));

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
// The device's Tax Centre as first shown at startup (JSON), kept so what was
// added while it showed can be told apart from what the cloud copy changed.
let _taxCenterPreviewBase = null;
export let _fxRateCache = { 'CAD_CAD': 1 };
// Rates for a given date never change once published, so the ones already
// fetched are kept on the device and a past sale keeps its value offline.
Object.assign(_fxRateCache, loadFxHistory(getLocalStorage()));
const _fxHistoricalDates = {};
const _fxHistoricalSources = {};

// `ratesInBackground` (startup only): the first open of each day downloads
// that day's exchange rates from an outside service. Waited for, it held the
// whole dashboard back for as long as that service took — the "sometimes slow"
// start. In the background, the screen shows with the rates saved yesterday,
// then today's rates and any recurring charges due follow, in the same order
// as before, and the screen redraws once they're in.
export async function loadTaxCenter({ ratesInBackground = false } = {}) {
  if (isAuthor()) return;
  try {
    const json = await window._fbLoadSettings('taxCenter'); // handles FS → RTDB fallback internally
    let keptPreviewEdits = false;
    if (json) {
      let loaded = { businessExpenses: [], recurring: [], settings: { baseCurrency: 'CAD', geminiKey: '' }, ...json };
      // Edits made while the device's copy was showing (their save was refused)
      // are merged into the cloud copy rather than replaced by it.
      if (TAX_CENTER._preview) {
        const res = keepPreviewEdits(_taxCenterPreviewBase, loaded, TAX_CENTER);
        loaded = res.value;
        keptPreviewEdits = res.kept;
        if (res.conflicts.length) console.warn('[TaxCenter] changed on two devices while loading, this device\'s version kept', res.conflicts);
      }
      _taxCenterPreviewBase = null;
      TAX_CENTER = loaded;
      if (TAX_CENTER.settings?.claudeKey && !TAX_CENTER.settings?.geminiKey) {
        TAX_CENTER.settings.geminiKey = TAX_CENTER.settings.claudeKey;
      }
    }
    if (keptPreviewEdits) saveTaxCenter();
    if (TAX_CENTER.settings?.rates) Object.assign(_fxRateCache, TAX_CENTER.settings.rates);
    if (ratesInBackground) {
      const syncedBefore = TAX_CENTER.settings?.lastRateSync;
      // Already fetched today: nothing is pending, so nothing to say.
      setRatesUpdating(!(syncedBefore === today() && TAX_CENTER.settings?.rates));
      refreshDailyRates()
        .then(() => {
          processRecurringExpenses();
          if (TAX_CENTER.settings?.lastRateSync !== syncedBefore) renderCurrent();
        })
        .catch(e => console.warn('Failed to refresh daily rates', e))
        .finally(() => setRatesUpdating(false));
      return;
    }
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
    // A stalled connection gives up after 15 s instead of hanging on forever;
    // yesterday's saved rates stay in use until the next try.
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined;
    const res = await fetch(`https://open.er-api.com/v6/latest/CAD`, { signal });
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

// `settingsLoaded` is boot's read of the shared settings, running alongside the
// books; the open-call migration and the render wait for it.
async function loadAllBooks({ settingsLoaded } = {}) {
  setSyncState('syncing', '<b>Firestore</b> · loading all books.');
  // The Tax Centre is read alongside the books (it needs nothing from them),
  // and the day's exchange-rate download finishes after the first render
  // instead of before it — see loadTaxCenter.
  await Promise.all([
    Promise.all(Object.keys(BOOKS).map(id => loadBook(id))),
    loadTaxCenter({ ratesInBackground: true }),
    settingsLoaded,
  ]);
  // Open-call contributors older builds kept on the book itself move to their
  // own project, from the books just loaded (no extra reads).
  if (isPublisherSession()) await openCallScreen.get().then(m => m.migrateLegacyOpenCalls(states, saveState)).catch(e => console.warn('Open call migration failed', e));
  // Catch the sheet up on expenses and artist payments — the first time after
  // this update that is every one of them; afterwards only what changed.
  scheduleMoneyOutSheetSyncAll();
  _attentionReady = true;
  startEmailInboxWatcher();
  // Orders from the shop's website, once every book is here to match them against.
  startWebsiteLink();
  // A link from the website to one of its orders can open now.
  appSwitchBooksReady();
  setSyncState('ok', '<b>Firestore</b> · connected · live sync on');
  updateSubheader(new Date().toLocaleTimeString());
  renderCurrent();
  noteStartupFinished();
  noteDeviceCopyFresh();
}

// When this device last held the latest copy of everything: a full load, or
// a live update since. The startup preview says how old its copy is from this
// (lib/device-copy.js). Written at most once a minute.
let _deviceCopyNotedAt = 0;
function noteDeviceCopyFresh() {
  const now = Date.now();
  if (now - _deviceCopyNotedAt < 60 * 1000) return;
  _deviceCopyNotedAt = now;
  try { getLocalStorage()?.setItem(DEVICE_COPY_KEY, String(now)); } catch (_) { /* storage unavailable */ }
}

// True while the startup preview's copy is still what's on screen.
export function startupPreviewActive() {
  return _startupPreviewShown && !_startupNoted;
}

// How long this start took to reach real figures, kept per device (see
// lib/startup-timing.js) and shown in the account menu. Once per page load:
// a later Refresh sync is not a start.
let _startupNoted = false;
function noteStartupFinished() {
  if (_startupNoted) return;
  _startupNoted = true;
  let history = [];
  try {
    const ms = typeof performance !== 'undefined' && performance.now ? performance.now() : NaN;
    const ls = getLocalStorage();
    try { history = JSON.parse(ls?.getItem(STARTUP_HISTORY_KEY) || '[]'); } catch (_) { history = []; }
    history = recordStartup(history, ms, Date.now());
    ls?.setItem(STARTUP_HISTORY_KEY, JSON.stringify(history));
  } catch (_) { /* storage unavailable: show this start only */ }
  const line = $('acct-startup');
  if (line) {
    const text = describeStartup(history);
    line.textContent = text;
    line.hidden = !text;
  }
}

// "Updating today's exchange rates…" beside the Tax Centre's "Values in CAD",
// while the day's rates are still downloading after the screen has shown.
function setRatesUpdating(on) {
  const note = $('tc-rates-note');
  if (note) note.hidden = !on;
}

async function forceSync() {
  // Still starting up: the first load is already on its way.
  if (!fbReady) { showToast('Still loading — the latest copy is on its way'); return; }
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

function bookSwitcherItems() {
  return [{ id: 'all', title: 'All books', accent: 'rgba(255,255,255,.25)' }]
    .concat(BOOK_LIST.filter(b => !isTestBook(b)).map(b => ({ id: b.id, title: b.title, accent: b.accent })));
}

// The phone's book picker: a row of outlined chips (the side menu and Today
// both use it), each a plain button with the book's colour square. The
// header dropdown above stays the desktop control; both call switchBook().
function renderBookChips(container, { onPick } = {}) {
  if (!container) return;
  const active = activeBook || 'all';
  container.replaceChildren(...bookSwitcherItems().map((it) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'book-chip' + (it.id === active ? ' is-on' : '');
    chip.setAttribute('aria-pressed', String(it.id === active));
    if (it.id !== 'all') {
      const sw = document.createElement('span');
      sw.className = 'book-chip-sw';
      sw.setAttribute('aria-hidden', 'true');
      sw.style.background = it.accent;
      chip.appendChild(sw);
    }
    chip.append(it.title);
    chip.addEventListener('click', () => { switchBook(it.id); onPick?.(); });
    return chip;
  }));
}

function buildBookSwitcher() {
  const menu = $('book-dropdown-menu');
  if (!menu) return;
  menu.innerHTML = '';

  const items = bookSwitcherItems();

  items.forEach((it) => {
    const isActive = (activeBook || 'all') === it.id;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'book-dd-item' + (isActive ? ' active' : '');
    item.dataset.id = it.id;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(isActive));
    item.onclick = (e) => { e.stopPropagation(); switchBook(it.id); closeBookDropdown(); };
    item.innerHTML = `<span class="book-dd-dot" style="background:${it.accent};"></span>${escapeHtml(it.title)}`;
    menu.appendChild(item);
  });
}

function toggleBookDropdown() {
  const wrap = $('book-dropdown');
  if (!wrap) return;
  if (wrap.classList.contains('open')) {
    closeBookDropdown();
  } else {
    // Rebuild so highlight reflects current activeBook
    buildBookSwitcher();
    wrap.classList.add('open');
    $('book-dropdown-btn')?.setAttribute('aria-expanded', 'true');
    // Defer outside-click listener so it doesn't fire on the click that opened the menu
    setTimeout(() => {
      if (_bookDropdownOutsideHandler) {
        document.removeEventListener('click', _bookDropdownOutsideHandler, true);
      }
      _bookDropdownOutsideHandler = (e) => {
        if (!wrap.contains(e.target)) closeBookDropdown();
      };
      document.addEventListener('click', _bookDropdownOutsideHandler, true);
    }, 0);
  }
}
function closeBookDropdown() {
  const wrap = $('book-dropdown');
  if (wrap) wrap.classList.remove('open');
  $('book-dropdown-btn')?.setAttribute('aria-expanded', 'false');
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
      const title = book && book.title ? book.title : 'Your book';
      auth.innerHTML = `<span class="tab-author-dot" aria-hidden="true"></span><span class="tab-author-title">${escapeHtml(title)}</span><span class="tab-author-tag">Author view</span>`;
      auth.title = `${title} · Author view`;
      auth.classList.add('on');
    } else {
      auth.classList.remove('on');
      auth.textContent = '';
    }
  }

  const isPub = window.IS_PUBLISHER && !isAuthor();

  renderUpdatedStamps(isPub);
}

// "Updated 3 hours ago" rather than a raw build timestamp: the owner wants to
// know whether the app is fresh, not the second it was built. The exact time
// stays in the tooltip.
function renderUpdatedStamps(isPub = window.IS_PUBLISHER && !isAuthor()) {
  const built = parseBuildDate(typeof __GIT_COMMIT_DATE__ === 'string' ? __GIT_COMMIT_DATE__ : '');
  const when = built ? relativeWhen(built) : '';
  const exact = built ? built.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';

  const upd = $('tab-updated');
  if (upd) {
    // Authors don't need to know when the app was last deployed — only the
    // publisher sees the stamp (it opens What's new).
    upd.textContent = when && isPub ? `Updated ${when}` : '';
    upd.hidden = !isPub;
    upd.classList.toggle('is-clickable', !!isPub);
    upd.title = isPub ? `Last updated ${exact} — click to see what changed` : (exact ? `Last updated ${exact}` : '');
    upd.onclick = isPub ? (e) => showWhatsNew(e) : null;
  }

  // Publisher app-shell hides the tab bar, so the sidebar carries the card.
  const whenEl = $('pub-updated-when');
  if (whenEl) whenEl.textContent = when ? `Updated ${when}` : 'Up to date';
  const pubUpd = $('pub-updated');
  if (pubUpd) pubUpd.title = exact ? `Last updated ${exact}` : '';
}
setInterval(() => renderUpdatedStamps(), 5 * 60 * 1000);

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
  // The Website · Inventory switcher follows the same rule (publisher, own view).
  try { refreshAppSwitch(); } catch (e) { console.warn('[app switch] refresh failed', e); }
  updateSubheader();
  placeKpiStrip();
  bindKpiResize();

  // Publisher-only chrome: hidden in author view, shown (with its normal
  // display value) in publisher view.
  const PUBLISHER_ONLY_IDS = [
    'todo-sidebar-btn', 'website-tab-btn', 'd-qr-btn', 'webanalytics-tab-btn',
    'sidebar-webanalytics-btn', 'shipping-tab-btn', 'bigcartel-tab-btn', 'sidebar-bigcartel-btn',
  ];
  for (const id of PUBLISHER_ONLY_IDS) {
    const el = $(id);
    if (el) el.style.display = authorNow ? 'none' : '';
  }
  // myqr tab is AUTHOR-only
  const myqrTabBtn = $('myqr-tab-btn');
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
  renderInvoices();

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
  // Inside the Test Profile every book is a sample book: the tab stays lit.
  if (TEST_PROFILE_ACTIVE) type = 'test';

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

  // The Test Profile is a separate copy of the app (lib/test-profile.js), so
  // moving between it and the real books is a reload, never a book switch:
  // real and sample data are never in memory together.
  if (type === 'test' && !TEST_PROFILE_ACTIVE) { enterTestProfile(); return; }
  if (type !== 'test' && TEST_PROFILE_ACTIVE) { leaveTestProfile(); return; }
  if (TEST_PROFILE_ACTIVE) return;

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

// ── THE TEST PROFILE: enter, leave, reset ──
// See lib/test-profile.js. Each is a reload, so the page that comes back is
// wholly one side or the other.
function enterTestProfile() {
  try { sessionStorage.setItem(TEST_PROFILE_FLAG, '1'); } catch (_) {
    showToast('⚠ This browser blocked the Test Profile (private mode?)', 'err');
    return;
  }
  location.reload();
}
function leaveTestProfile() {
  try { sessionStorage.removeItem(TEST_PROFILE_FLAG); } catch (_) { /* reload decides */ }
  location.reload();
}
async function resetTestProfile() {
  if (!TEST_PROFILE_ACTIVE) return;
  if (!(await confirmDialog(
    'Throw away everything done in the Test Profile and start again from the sample books?\n\nYour real books are not affected.',
    { title: 'Reset sample data', okLabel: 'Reset' }
  ))) return;
  clearTestStorage(window.__realLocalStorage || localStorage);
  location.reload();
}
window.enterTestProfile = enterTestProfile;
window.leaveTestProfile = leaveTestProfile;
window.resetTestProfile = resetTestProfile;

// First visit to the Test Profile (or the first after a reset): fill the
// sample book with a realistic history, then open it.
async function prepareTestProfile() {
  if (!TEST_PROFILE_ACTIVE) return;
  showTestProfileBanner();
  if (BOOKS[SAMPLE_BOOK_ID] && !isSampleDataSeeded(localStorage)) {
    await applySampleTestData(SAMPLE_BOOK_ID);
    markSampleDataSeeded(localStorage);
  }
  if (BOOKS[SAMPLE_BOOK_ID] && activeBook === 'all') switchBook(SAMPLE_BOOK_ID);
}

function showTestProfileBanner() {
  const banner = $('test-profile-banner');
  if (banner) banner.hidden = false;
}

// Rich, realistic sample history for one book: two consignment stores, sales
// on several channels, artist expenses (one owed, one repaid), an artist
// transfer due and a deliberate stock drift. Only ever run inside the Test
// Profile, whose saves never leave this device.
async function applySampleTestData(testBookId) {
  const book = BOOKS[testBookId];
  if (!TEST_PROFILE_ACTIVE || !book) return;

  // Build mock state
  const testState = defaultState(book);
  testState.stock = 15; // Set starting stock on hand in database (we'll intentionally drift this from derived count of 8)

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
    },
    {
      // A copy the artist sold and kept the cash for: the held sale behind
      // the artist transfer below, which Settle up nets against their earnings.
      num: 'TEST-4',
      chan: 'In Person',
      qty: 1,
      price: 17,
      after: 8,
      notes: 'Direct sale collected by author',
      date: '2026-07-06',
      sheetsId: 'evt_hist_4',
      artistPending: true,
      directToArtist: true
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
      id: 4001,
      num: 'TEST-4',
      chan: 'In Person',
      qty: 1,
      price: 17,
      total: 17,
      date: '2026-07-06',
      notes: 'Direct sale collected by author'
    }
  ];

  states[testBookId] = testState;

  // Recompute statistics
  recomputeAfters(states[testBookId], book);

  // Intentionally set stock to 15 (instead of derived 8) to showcase stock drift banner!
  states[testBookId].stock = 15;

  await saveState(testBookId);
}

export function switchBook(bookId) {
  // Author sessions are locked to a single book; never switch them.
  if (isAuthor() && bookId !== activeBook) return;
  // If a non-'all' bookId no longer exists (e.g. just deleted), fall back to 'all'.
  if (bookId !== 'all' && !BOOKS[bookId]) bookId = 'all';
  closeBookDropdown();
  setActiveBook(bookId);
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
    // Put the book's own currency first in the price pickers.
    putCurrencyFirst($('m-price-cur'), getBookCurrencyCode(book));
    putCurrencyFirst($('exp-cur'), getBookCurrencyCode(book));
  }
  // Highlight active item in menu (buildBookSwitcher() also rebuilds this fresh
  // on next open, but keep it in sync in case the menu is still in the DOM).
  document.querySelectorAll('.book-dd-item').forEach(el => {
    const isActive = el.dataset.id === bookId;
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-selected', String(isActive));
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
    applyBookAccentTokens('all');
    applyBodyTint('all');
    updateAllOverview();
    updateHeader();
  } else {
    $('tab-bar').style.display = '';
    // Set CSS accent (reads BOOKS[bookId] itself, and re-derives the text
    // colour from the current theme).
    applyBookAccentTokens(bookId);
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
  updateSheetsTabUI();

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
  myqr: 'My QR Code', webanalytics: 'Web Analytics', shipping: 'Shipping',
  bigcartel: 'Big Cartel', todo: 'To-do', intel: 'Intelligence', today: 'Today', help: 'Help'
};
// ── Today (phone home) ──────────────────────────────────────────────
// Fills in the date and the waiting-orders count. The count is read from the
// Website orders panel's own "Ready to apply" figure so the two never disagree;
// the To-do card's count is a .todo-nav-badge, kept current by updateTodoBadge.
// "Sold today · all books" on the phone home. Same rule as the Dashboard
// (see lib/today-summary.js), so it agrees with History for the day.
function renderTodaySoFar() {
  const sum = $('today-sold-sum');
  if (!sum) return;
  const books = Object.keys(BOOKS).map((id) => ({ id, currency: getBookCurrencyCode(BOOKS[id]), hist: states[id]?.hist }));
  const day = salesForDay(books, today());
  // Three figures on the slip (sales, books, money taken), zeros included, so
  // the day's numbers fill in where you expect them. The sentence is kept as
  // the accessible name, which is what a screen reader reads out.
  const said = day.sales
    ? `${day.sales} ${day.sales === 1 ? 'sale' : 'sales'} · ${day.units} ${day.units === 1 ? 'book' : 'books'} · ${fairTotalsText(day.totals)}`
    : 'No sales yet today';
  const figs = [[day.sales, day.sales === 1 ? 'sale' : 'sales'], [day.units, day.units === 1 ? 'book' : 'books'], [day.sales ? fairTotalsText(day.totals) : '—', 'taken']];
  sum.innerHTML = figs.map(([v, label]) => `<span class="today-sold-fig"><b>${escapeHtml(String(v))}</b><span>${label}</span></span>`).join('');
  sum.setAttribute('aria-label', said);
  renderFairSyncPill();
}

// The books with a change still waiting to upload, each with its ledger as the
// cloud last confirmed it (lastSavedHashes). Parsed once per saved copy.
const _savedHistCache = new Map();
function todayUnsentBooks(books) {
  const waiting = new Set(syncQueue.map((item) => item.bookId));
  return books.filter((b) => waiting.has(b.id)).map((b) => {
    const json = lastSavedHashes[b.id];
    if (!json) return { ...b, savedHist: [] };
    let hit = _savedHistCache.get(b.id);
    if (!hit || hit.json !== json) {
      let hist = [];
      try { hist = JSON.parse(json).hist || []; } catch (_) { /* unreadable: treat every row as unsent */ }
      hit = { json, hist };
      _savedHistCache.set(b.id, hit);
    }
    return { ...b, savedHist: hit.hist };
  });
}

// The phone Today's ledger: four figures across every book, each a way in to
// the screen that explains it. Money is summed per currency, never across.
function renderTodayLedger() {
  const el = $('today-ledger');
  if (!el) return;
  const books = Object.keys(BOOKS).map((id) => ({ id, currency: getBookCurrencyCode(BOOKS[id]), hist: states[id]?.hist }));
  const day = salesForDay(books, today());
  let stock = 0, storesOwing = 0;
  const owedByCur = new Map();
  for (const [bid, s] of Object.entries(states)) {
    if (isTestBook(BOOKS[bid])) continue;
    stock += s.stock || 0;
    const cur = BOOKS[bid]?.currency || '';
    let owed = 0;
    for (let i = 0; i < (s.stores || []).length; i++) {
      const due = s.stores[i].amountOwed || 0;
      if (due > 0) { owed += due; storesOwing += 1; }
    }
    if (owed > 0) owedByCur.set(cur, (owedByCur.get(cur) || 0) + owed);
  }
  const titles = Object.values(BOOKS).filter((b) => !isTestBook(b)).length;
  const owed = [...owedByCur].map(([c, v]) => fmtWhole(v, c)).join(' + ');
  const unsent = unsentSalesForDay(todayUnsentBooks(books), today()).sales;
  const soldSub = unsent
    ? `${unsent} ${unsent === 1 ? 'sale' : 'sales'} waiting to upload`
    : day.sales ? `${day.sales} ${day.sales === 1 ? 'sale' : 'sales'}` : 'No sales yet';
  const figs = [
    { label: 'Sold today', value: String(day.units), sub: soldSub, tab: 'history', tone: unsent ? 'waiting' : '' },
    { label: 'Taken', value: day.sales ? fairTotalsText(day.totals) : '—', sub: 'Cash and card', tab: 'history' },
    { label: 'On hand', value: String(stock), sub: `Across ${titles} ${titles === 1 ? 'title' : 'titles'}`, tab: 'dashboard' },
    { label: 'Stores owe', value: owed || '—', sub: storesOwing ? `From ${storesOwing} ${storesOwing === 1 ? 'store' : 'stores'}` : 'Nothing owed', tab: 'consignment', tone: owed ? 'owed' : '' },
  ];
  el.innerHTML = figs.map((f) => `<button type="button" class="ledger-fig${f.tone ? ` is-${f.tone}` : ''}" onclick="switchTab('${f.tab}')">
    <span class="ledger-label">${f.label}</span><span class="ledger-value tnum">${escapeHtml(f.value)}</span><span class="ledger-sub">${escapeHtml(f.sub)}</span></button>`).join('');
}

export function renderTodayHub() {
  renderTodaySoFar();
  renderTodayLedger();
  renderBookChips($('today-books'));
  const date = $('today-date');
  if (date) date.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  if (activeBook !== 'all') renderOrders();
  const raw = activeBook === 'all' ? '' : document.querySelector('#web-orders-status .web-stat-value')?.textContent?.trim() ?? '';
  const waiting = Number.parseInt(raw, 10);
  const count = $('today-orders-count');
  const sub = $('today-orders-sub');
  const has = Number.isFinite(waiting) && waiting > 0;
  if (count) { count.hidden = !has; count.textContent = has ? (waiting > 99 ? '99+' : String(waiting)) : ''; }
  if (sub) sub.textContent = has ? `${waiting} ready to apply` : activeBook === 'all' ? 'Choose a book to review' : 'Review website orders';
}

// ── Phone "More" sheet ───────────────────────────────────────────────
// The phone bottom nav holds three everyday destinations; everything else
// lives in this sheet. Its contents are cloned from the sidebar each time
// it opens so grouping, visibility and live badges never drift apart.
const MNAV_TABS = ['today', 'pos', 'manual'];

function syncMoreNavState(name) {
  const more = document.getElementById('mnav-more');
  if (!more) return;
  const destination = name;
  more.classList.toggle('active', !MNAV_TABS.includes(destination));
  document.querySelectorAll('#mnav .mnav-btn').forEach(button => {
    const selected = button === more ? more.classList.contains('active') : button.getAttribute('onclick')?.includes(`'${destination}'`);
    button.classList.toggle('active', !!selected);
    if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  refreshMoreDot();
}

// The dot on More means "a tool in here has something for you". It follows the
// sidebar's own badges, so screen readers hear it in the button's name too.
function refreshMoreDot() {
  const dot = document.getElementById('mnav-more-dot');
  if (!dot) return;
  const hasBadge = [...document.querySelectorAll('#pub-sidebar .nav-badge, #pub-sidebar .health-badge, #pub-sidebar .bc-gap-badge')]
    .some((b) => !b.hidden && b.style.display !== 'none' && b.closest('.snav') && !MNAV_TABS.some((t) => b.closest('.snav').getAttribute('onclick')?.includes(`'${t}'`)));
  dot.hidden = !hasBadge;
  const more = document.getElementById('mnav-more');
  if (hasBadge) more?.setAttribute('aria-label', 'More, something needs your attention');
  else more?.removeAttribute('aria-label');
  const phoneDot = document.getElementById('phone-menu-dot');
  if (phoneDot) phoneDot.hidden = !hasBadge;
  document.getElementById('phone-menu-btn')?.setAttribute('aria-label', hasBadge ? 'Open menu, something needs your attention' : 'Open menu');
}


export function openMoreSheet() {
  const sheet = document.getElementById('more-sheet');
  const body = document.getElementById('more-sheet-body');
  const sidebar = document.getElementById('pub-sidebar');
  if (!sheet || !body || !sidebar) return;
  body.replaceChildren();
  renderBookChips(document.getElementById('more-sheet-books'), { onPick: closeMoreSheet });
  const first = document.createElement('div');
  first.className = 'o3-grouplabel';
  first.textContent = 'Inventory';
  body.appendChild(first);
  // The phone side menu replaces the bottom bar's Home button, so Today leads it.
  const home = document.createElement('button');
  home.type = 'button';
  home.className = 'snav more-sheet-home';
  home.setAttribute('onclick', "switchTab('today')");
  home.innerHTML = '<span class="snav-ic" data-ink="TD" aria-hidden="true">▦</span><span class="snav-label">Today</span>';
  body.appendChild(home);
  sidebar.querySelectorAll(':scope > .pub-nav, :scope > .o3-grouplabel').forEach((node) => {
    const copy = node.cloneNode(true);
    copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    body.appendChild(copy);
  });
  // Hide the destinations already on the bottom bar. A phone's side menu keeps
  // them all, since its bar holds only the two pinned actions.
  const phone = window.matchMedia?.('(max-width: 768px)').matches;
  body.querySelectorAll('.snav').forEach((b) => {
    if (b.classList.contains('more-sheet-home')) b.hidden = !phone;
    else if (!phone && MNAV_TABS.some((t) => b.getAttribute('onclick')?.includes(`'${t}'`))) b.hidden = true;
    const current = document.querySelector('.tab-panel.active')?.id?.replace(/^tab-/, '');
    if (current && b.getAttribute('onclick')?.includes(`'${current}'`)) b.setAttribute('aria-current', 'page');
  });
  if (typeof sheet.showModal === 'function') sheet.showModal(); else sheet.setAttribute('open', '');
  document.getElementById('mnav-more')?.setAttribute('aria-expanded', 'true');
  document.getElementById('phone-menu-btn')?.setAttribute('aria-expanded', 'true');
}

export function closeMoreSheet() {
  const sheet = document.getElementById('more-sheet');
  if (!sheet) return;
  if (typeof sheet.close === 'function' && sheet.open) sheet.close(); else sheet.removeAttribute('open');
  document.getElementById('mnav-more')?.setAttribute('aria-expanded', 'false');
  document.getElementById('phone-menu-btn')?.setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', (e) => {
  const sheet = document.getElementById('more-sheet');
  if (!sheet?.open) return;
  // Tapping the dimmed backdrop (the dialog element itself) or any tool closes it.
  if (e.target === sheet || e.target.closest?.('#more-sheet-body .snav')) closeMoreSheet();
});

document.getElementById('more-sheet')?.addEventListener('close', () => {
  document.getElementById('mnav-more')?.setAttribute('aria-expanded', 'false');
  document.getElementById('phone-menu-btn')?.setAttribute('aria-expanded', 'false');
});

Object.assign(window, { openMoreSheet, closeMoreSheet });
// Badges light up when a sync or a background check finishes, not only when
// the owner changes screens, so the More dot follows them as they change.
observeSidebarBadges(document.getElementById('pub-sidebar'), refreshMoreDot);

// ── Phone tap buttons for short dropdowns ──────────────────────────────
// A <select data-phone-seg> gets a row of big buttons beside it that a phone
// shows instead of the dropdown. The select stays the single source of truth
// (every save reads it); the buttons only set it and fire its change event.
function buildPhoneSeg(select) {
  let seg = select.nextElementSibling;
  if (!seg || !seg.classList.contains('phone-seg')) {
    seg = document.createElement('div');
    seg.className = 'phone-seg';
    seg.setAttribute('role', 'radiogroup');
    const label = select.id && document.querySelector(`label[for="${select.id}"]`);
    if (label) seg.setAttribute('aria-label', label.textContent.replace(/\s+/g, ' ').trim());
    select.after(seg);
    select.closest('.form-group')?.classList.add('has-phone-seg');
  }
  seg.replaceChildren(...[...select.options].filter((o) => o.value !== '' && !o.disabled).map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'phone-seg-opt';
    b.setAttribute('role', 'radio');
    b.dataset.value = o.value;
    b.textContent = o.textContent.trim();
    b.addEventListener('click', () => {
      select.value = o.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncPhoneSegs();
    });
    return b;
  }));
  syncPhoneSegs();
}

function syncPhoneSegs() {
  document.querySelectorAll('select[data-phone-seg]').forEach((select) => {
    const seg = select.nextElementSibling;
    if (!seg?.classList.contains('phone-seg')) return;
    seg.querySelectorAll('.phone-seg-opt').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.value === select.value));
    });
  });
}

// Rebuilt whenever Add sale opens (switchTab), so options code added since —
// the book's payment types and channels — always show as buttons.
function refreshPhoneSegs() {
  document.querySelectorAll('select[data-phone-seg]').forEach((select) => {
    buildPhoneSeg(select);
    if (select.dataset.phoneSegBound) return;
    select.dataset.phoneSegBound = '1';
    select.addEventListener('change', syncPhoneSegs);
  });
}
refreshPhoneSegs();

// Add sale on a phone: show the sale form or the gift-copy form, not both.
window.setManualMode = function (mode) {
  const gift = mode === 'gift';
  document.getElementById('tab-manual')?.classList.toggle('is-gift', gift);
  document.getElementById('man-mode-sale')?.setAttribute('aria-selected', String(!gift));
  document.getElementById('man-mode-gift')?.setAttribute('aria-selected', String(gift));
};
window.syncPhoneSegs = syncPhoneSegs;


// ── Phone fold-open sections ───────────────────────────────────────────
// Long dashboard sections marked data-phone-fold start folded on a phone:
// only their heading shows, with a Show/Hide button. On wider screens the
// button is hidden by CSS and nothing is folded.
function initPhoneFolds() {
  document.querySelectorAll('[data-phone-fold]').forEach((section, i) => {
    const head = section.querySelector('.sec-head');
    if (!head || head.querySelector('.phone-fold-btn')) return;
    if (!section.id) section.id = `phone-fold-${i}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'phone-fold-btn';
    btn.setAttribute('aria-controls', section.id);
    const sync = () => {
      const folded = section.classList.contains('is-phone-folded');
      btn.setAttribute('aria-expanded', String(!folded));
      btn.textContent = folded ? 'Show' : 'Hide';
    };
    btn.addEventListener('click', () => { section.classList.toggle('is-phone-folded'); sync(); });
    section.classList.add('is-phone-folded');
    head.appendChild(btn);
    sync();
  });
}
initPhoneFolds();


export function switchTab(name) {
  // publisher-only tabs redirect authors to dashboard
  if (isAuthor() && PUBLISHER_ONLY_TABS.has(name)) name = 'dashboard';
  // publisher redirected away from author-only myqr tab
  if (!isAuthor() && AUTHOR_ONLY_TABS.has(name)) name = 'dashboard';

  const phoneScope = `${isAuthor() ? 'author' : 'publisher'}:${activeBook}:`;
  const previousPanel = document.querySelector('.tab-panel.active');
  phonePages.leave(previousPanel ? previousPanel.dataset.phoneViewKey || phoneScope + previousPanel.id : null);

  // Dashboard in All books is the combined inventory overview, not a book panel.
  if (name === 'dashboard' && activeBook === 'all') {
    switchBook('all');
    const overviewKey = phoneScope + 'tab-all-overview';
    if ($('tab-all-overview')) $('tab-all-overview').dataset.phoneViewKey = overviewKey;
    phonePages.enter(overviewKey);
    return;
  }

  const needsBook = activeBook === 'all' && BOOK_SCOPED_TABS.has(name);

  // Selecting a destination closes any open header category menu (and the
  // sidebar footer account menu, if open).
  closeHeaderMenus();
  closeSideAccount();

  document.querySelectorAll('.tab-btn, .header-action-btn, .header-menu-item, .snav, .mnav-btn').forEach((b) => {
    // We match by checking onclick text to be safe if order ever changes
    if (b.getAttribute('onclick')?.includes(`'${name}'`)) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  syncMoreNavState(name);

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

  const panel = $(needsBook ? 'tab-select-book' : 'tab-' + name);
  if (panel) { panel.style.display = 'block'; panel.classList.add('active'); }
  // Return to this page's own position after its content is rendered.
  const phoneViewKey = phoneScope + (panel?.id || name);
  if (panel) panel.dataset.phoneViewKey = phoneViewKey;
  phonePages.enter(phoneViewKey);

  if (needsBook) {
    showBookChoice(name);
    return;
  }

  if (name === 'dashboard') { updateDash(); renderArtistReimburseBanner(); renderPendingExpenses(); }
  if (name === 'today') renderTodayHub();
  if (name === 'manual') refreshPhoneSegs();
  if (name === 'history') renderHist();
  // Website orders was the one panel that rendered nothing on arrival, so the
  // queue and its counts showed whatever the last visit left behind — orders
  // applied since then still sat there as "new".
  if (name === 'website') renderOrders();
  if (name === 'manual') updateManualForm();
  if (name === 'consignment') { renderStores(); renderLedger(); renderInvoices(); }
  // renderArtistReimburseBanner writes into this panel too, and used to arrive
  // via renderAll()'s unconditional sweep. Now that the sweep is tab-aware,
  // entering the tab has to render it.
  if (name === 'expenses') { renderExpenses(); renderArtistReimburseBanner(); updateExpenseForm(); }
  if (name === 'opencall') openCallScreen.call('renderOpenCall');
  if (name === 'reconcile') renderReconcile();
  if (name === 'customers') renderCustomers();
  if (name === 'taxcenter') { renderTaxCenter(); refreshTaxCentreRates(); }
  if (name === 'sheets') { loadGasCode(); renderSheetsLog(); renderProfitSettings(); switchSettingsSubTab(activeSettingsSubTab); updateSheetsTabUI(); }
  if (name === 'qrcodes') renderAllQRCodes();
  if (name === 'myqr') renderAuthorQRPage();
  if (name === 'pos') { renderPOS(); renderPOSFxStatus(); switchPOSSubTab(activePOSSubTab); }
  fairSetAwake(name === 'pos');
  if (name === 'webanalytics') renderWebAnalytics();
  if (name === 'shipping') { initShippingTab(); }
  if (name === 'bigcartel') { renderBigCartelTab(); }
  if (name === 'todo') renderTodoTab();
  if (name === 'intel') renderIntel();
  if (name === 'backups') refreshSyncConflictUi();
  if (name === 'help') initHelpAudience();
}

// Help tab: two guides (artist / publisher) on one page, plus a word search.
// A section or a single question can belong to one guide (data-audience) or both.
const helpAudienceOf = (el) => el.dataset.audience || 'both';
const helpInAudience = (el, aud) => { const a = helpAudienceOf(el); return a === 'both' || a === aud; };

function helpPage() { return document.querySelector('#tab-help .help-page'); }

// Only a signed-in publisher (not in Author view) may see the publisher guide.
const canSeePublisherHelp = () => !!window.IS_PUBLISHER && !isAuthor();

// What a question is searched on: its title and answer, not its "Open …" button,
// so typing "open" doesn't match every answer that has one.
const helpQuestionText = (q) => [...q.querySelectorAll('summary, .help-a > :not(.help-go-row)')].map((n) => n.textContent).join(' ');

export function setHelpAudience(aud) {
  const page = helpPage();
  if (!page || (aud !== 'artist' && aud !== 'publisher')) return;
  if (aud === 'publisher' && !canSeePublisherHelp()) aud = 'artist';
  page.dataset.audience = aud;
  page.querySelectorAll('.help-aud-btn').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.aud === aud)));
  filterHelp($('help-search')?.value || '');
}

// "Open Manual entry →" in an answer goes straight there; a topic button
// scrolls to its section and puts focus on its first question.
function onHelpClick(e) {
  const go = e.target.closest('[data-go]');
  if (go) { switchTab(go.dataset.go); return; }
  const jump = e.target.closest('[data-jump]');
  const sec = jump && $(jump.dataset.jump);
  if (!sec) return;
  sec.scrollIntoView({ behavior: _prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  sec.querySelector('.help-q:not([hidden]) summary')?.focus({ preventScroll: true });
}

// Runs every time Help opens: artists get only their guide (no switch at all);
// a publisher starts on the publisher guide the first time.
function initHelpAudience() {
  const page = helpPage();
  if (!page) return;
  const pub = canSeePublisherHelp();
  const sw = page.querySelector('.help-aud');
  if (sw) sw.hidden = !pub;
  // A "take me there" button only shows when this viewer can open that tab
  // (the publisher reading the artist guide has no My QR Code tab, for one).
  page.querySelectorAll('[data-go]').forEach((btn) => {
    btn.closest('.help-go-row').hidden = !helpTabOpenFor(btn.dataset.go, { author: isAuthor() });
  });
  if (!page.dataset.audienceChosen) {
    page.dataset.audienceChosen = '1';
    // Opening one question by hand keeps the Open all / Close all label honest.
    page.addEventListener('toggle', syncHelpToggleLabel, true);
    page.addEventListener('click', onHelpClick);
    setHelpAudience(pub ? 'publisher' : 'artist');
  } else if (!pub && page.dataset.audience !== 'artist') {
    setHelpAudience('artist');
  }
}

export function filterHelp(text) {
  const page = helpPage();
  if (!page) return;
  const pub = canSeePublisherHelp();
  const aud = pub ? (page.dataset.audience || 'artist') : 'artist';
  const otherAud = aud === 'artist' ? 'publisher' : 'artist';
  const words = helpQueryWords(text);
  let shown = 0;
  let otherHits = 0;
  page.querySelectorAll('.help-sec').forEach((sec) => {
    let secShown = 0;
    sec.querySelectorAll('.help-q').forEach((q) => {
      const match = helpMatches(helpQuestionText(q), words);
      if (!helpInAudience(sec, aud) || !helpInAudience(q, aud)) {
        if (pub && words.length && match && helpInAudience(sec, otherAud) && helpInAudience(q, otherAud)) otherHits++;
        q.hidden = true;
        q.open = false;
        return;
      }
      q.hidden = !match;
      // Clearing the search folds back the questions it opened.
      q.open = words.length ? match : false;
      if (match) secShown++;
    });
    sec.hidden = secShown === 0;
    shown += secShown;
  });
  page.querySelectorAll('.help-foot').forEach((f) => { f.hidden = !helpInAudience(f, aud); });
  const empty = $('help-empty');
  if (empty) empty.hidden = shown > 0;
  const other = $('help-other-aud');
  if (other) {
    other.hidden = shown > 0 || otherHits === 0;
    other.dataset.aud = otherAud;
    other.textContent = `See ${otherHits} answer${otherHits === 1 ? '' : 's'} in the ${otherAud} guide`;
  }
  const count = $('help-count');
  if (count) count.textContent = words.length ? (shown ? `${shown} answer${shown === 1 ? '' : 's'} found` : '') : `${shown} questions`;
  renderHelpTopics(page, words.length > 0);
  syncHelpToggleLabel();
}

// A row of topic buttons under the search, one per section in this guide.
// Hidden while searching (the results are already short) and on a short guide.
function renderHelpTopics(page, searching) {
  const nav = $('help-topics');
  if (!nav) return;
  const secs = [...page.querySelectorAll('.help-sec[id]:not([hidden])')];
  nav.hidden = searching || secs.length < 3;
  if (nav.hidden) return;
  nav.innerHTML = secs.map((sec) => `<button type="button" class="help-tool-btn" data-jump="${escapeHtml(sec.id)}">${escapeHtml(sec.querySelector('.help-sec-title')?.textContent || '')}</button>`).join('');
}

function visibleHelpQuestions() {
  return [...document.querySelectorAll('#tab-help .help-sec:not([hidden]) .help-q:not([hidden])')];
}

function syncHelpToggleLabel() {
  const btn = $('help-toggle-all');
  if (!btn) return;
  const qs = visibleHelpQuestions();
  btn.hidden = qs.length < 2;
  btn.textContent = qs.length && qs.every((q) => q.open) ? 'Close all' : 'Open all';
}

export function toggleAllHelp() {
  const qs = visibleHelpQuestions();
  const open = !qs.every((q) => q.open);
  qs.forEach((q) => { q.open = open; });
  syncHelpToggleLabel();
}

const BOOK_SCOPED_TABS = new Set(['website', 'manual', 'consignment', 'history', 'expenses', 'opencall']);

function showBookChoice(tabName) {
  const heading = $('select-book-heading');
  if (heading) heading.textContent = SHELL_TAB_LABELS[tabName] || 'Choose a book';
  const descriptions = {
    website: 'Choose a book to review its website orders.',
    manual: 'Which book are you recording a sale for?',
    consignment: 'Choose a book to manage its stores and consignment stock.',
    history: 'Choose a book to explore its order history.',
    expenses: 'Choose a book to review or add project expenses.',
    opencall: 'Choose a book to manage its contributors.',
  };
  const description = $('select-book-description');
  if (description) description.textContent = descriptions[tabName] || 'Choose the title you want to work with.';
  const actions = $('select-book-actions');
  if (!actions) return;
  actions.replaceChildren();
  const books = BOOK_LIST.filter(book => !isTestBook(book));
  const count = $('select-book-count');
  if (count) count.textContent = `${books.length} ${books.length === 1 ? 'title' : 'titles'}`;
  books.forEach((book, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'book-choice-card';
    if (book.accent) button.style.setProperty('--choice-accent', book.accent);
    button.innerHTML = `<span class="book-choice-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
      <span class="book-choice-details"><span class="book-choice-title">${escapeHtml(book.title)}</span>
      <span class="book-choice-author">${escapeHtml(book.author || 'View this title')}</span></span>
      <span class="book-choice-arrow" aria-hidden="true">↗</span>`;
    button.setAttribute('aria-label', `${book.title} — ${SHELL_TAB_LABELS[tabName]}`);
    button.addEventListener('click', () => {
      switchBook(book.id);
      switchTab(tabName);
    });
    actions.appendChild(button);
  });
  if (!books.length) actions.textContent = 'Your catalogue is empty. Add a book in Sheets settings to get started.';
}

export function updateHeader() {
  if (activeBook === 'all') {
    // Sum all books in a single pass (was three separate reduce iterations).
    let totalStock = 0, totalCon = 0;
    const revByCur = new Map(); // revenue is only summed within one currency
    Object.entries(states).forEach(([bid, s]) => {
      totalStock += (s.stock || 0);
      const curSym = (BOOKS[bid] && BOOKS[bid].currency) || '';
      revByCur.set(curSym, (revByCur.get(curSym) || 0) + recognizedRevenueOf(s));
      // ⚡ Bolt Optimization: Use for-loop instead of reduce to avoid function allocation
      let storesCon = 0;
      for (let i = 0; i < s.stores.length; i++) {
        storesCon += s.stores[i].outstanding || 0;
      }
      totalCon += storesCon;
    });
    animateCountValue('h-stock', totalStock);
    animateCountValue('h-revenue', [...revByCur].map(([c, v]) => fmtWhole(v, c)).join(' + ') || '0');
    animateCountValue('h-consigned', totalCon);
  } else {
    const s = getState(), book = getBook();
    const cur = book.currency;
    animateCountValue('h-stock', s.stock);
    animateCountValue('h-revenue', fmtWhole(recognizedRevenueOf(s), cur));
    // ⚡ Bolt Optimization: Use for-loop instead of reduce to avoid function allocation
    let storesCon = 0;
    for (let i = 0; i < s.stores.length; i++) {
      storesCon += s.stores[i].outstanding || 0;
    }
    animateCountValue('h-consigned', storesCon);
  }
}

// One progress bar on a book strip — the stock bar and the break-even bar are
// the same component with a different tone and label.
//
// Two things it fixes over the markup it replaces. The trough was an inline
// dark wash, which on a dark card meant no visible trough at all: the fill just
// stopped, with nothing showing how far it still had to go. And the bar carried
// no semantics beyond a `title` on its wrapper, so the headline figure on the
// app's first screen was invisible to a screen reader.
//
// Callers pass the already-computed percentage — no aggregation happens here.
function bookProgressBarHtml({ pct, tone = '', label = '', valueText = '' }) {
  const raw = Number(pct);
  // A book with maxPrint 0, or stock recorded above the print run, would
  // otherwise push the fill past the trough or render `width:NaN%`.
  const safe = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0;
  const toneClass = tone ? ` ${tone}` : '';
  return `<div class="bar-track" role="progressbar" aria-valuenow="${safe.toFixed(0)}" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeHtml(label)}" aria-valuetext="${escapeHtml(valueText)}">
            <div class="bar-fill${toneClass}" style="width:${safe}%;"></div>
          </div>`;
}

// The all-books overview is the app's landing screen and it is visible from
// first paint, but updateAllOverview() only runs once loadAllBooks() has pulled
// every book back from Firestore. Until then the publisher looked at three
// section headings over nothing — indistinguishable, on a slow connection or a
// cold PWA start, from an app that had lost their catalogue.
//
// Placeholder strips instead, built on the real .book-strip so the padding, the
// rail width and the row height are the genuine ones and nothing jumps when the
// data arrives. Per AGENTS.md this is a shimmer skeleton matching the real
// content's dimensions, never a spinner.
function catalogueSkeletonHtml(rows = 3) {
  const kpi = `<div class="bsk"><div class="skeleton-line sk-kpi-val"></div><div class="skeleton-line sk-kpi-label"></div></div>`;
  const bar = `<div class="skeleton-line sk-bar-label"></div><div class="skeleton-line sk-bar"></div>`;
  const strip = `<div class="book-strip is-skeleton" aria-hidden="true">
      <div class="book-cover-3d"></div>
      <div class="book-strip-info">
        <div class="skeleton-line sk-title"></div>
        <div class="skeleton-line sk-meta"></div>
        ${bar}${bar}
      </div>
      <div class="book-strip-kpis">${kpi.repeat(4)}</div>
      <div class="book-strip-actions"><div class="skeleton-line sk-action"></div></div>
    </div>`;
  const count = Number.isFinite(Number(rows)) ? Math.min(6, Math.max(1, Math.trunc(Number(rows)))) : 3;
  // aria-hidden on the strips and one live region carrying the actual status —
  // a screen reader should hear "loading", not four columns of empty boxes.
  return `<div class="sr-only" role="status" aria-live="polite">Loading your books\u2026</div>${strip.repeat(count)}`;
}

// Loaded, and there genuinely are no books. Distinct from the skeleton above:
// one says "wait", this one says "there is nothing here and here is what to do".
function catalogueEmptyHtml() {
  return `<div class="empty-state sys-empty">
      <div class="e-icon" aria-hidden="true">\ud83d\udcda</div>
      <strong>No books in your catalogue yet</strong>
      <span>Every title you add gets its own stock count, sales history and consignment ledger, and they all roll up onto this screen.</span>
      <div class="sys-empty-actions">
        <button class="btn gold lg" onclick="switchTab('sheets')">\u2699 Open settings to add a book</button>
      </div>
    </div>`;
}

// Painted immediately at boot so the landing screen is never blank. Safe to call
// before Firestore has answered, and a no-op once real strips are in place.
function showCatalogueSkeleton() {
  const list = $('all-books-list');
  if (!list || list.dataset.loaded === '1') return;
  list.innerHTML = catalogueSkeletonHtml();
}

// ── ALL BOOKS OVERVIEW
function updateAllOverview() {
  const allBooksVisible = BOOK_LIST.filter(b => !isTestBook(b));
  renderAllBooksStrips(allBooksVisible);
  renderCombinedChannelAnalytics(allBooksVisible);
  renderCombinedConsignmentSummary(allBooksVisible);
  renderOverviewRail();
}

// The phone's All Books: one row per title (lib/phone-books.js). The chip
// choice lasts for the visit; the desktop strips below are untouched.
let phoneBooksFilter = 'all';
function renderPhoneBooks(allBooksVisible) {
  const el = $('all-books-phone');
  if (!el) return;
  el.innerHTML = phoneBooksHtml(allBooksVisible.map((book) => {
    const s = states[book.id] || defaultState(book);
    let atStores = 0;
    for (let i = 0; i < s.stores.length; i++) atStores += s.stores[i].outstanding || 0;
    const cost = book.productionCost || 0;
    const brokeEven = cost > 0 && calculateBreakEven({ cost, recognizedRev: recognizedRevenueOf(s), listPrice: book.listPrice, sold: s.sold, stock: s.stock, currency: book.currency }).broken;
    return {
      id: book.id, title: book.title, author: book.author, accent: book.accent,
      priceText: book.listPrice ? fmtWhole(book.listPrice, book.currency) : '',
      printed: book.maxPrint, onHand: s.stock || 0, threshold: book.threshold || 0, brokeEven, atStores,
    };
  }), phoneBooksFilter);
}
export function setPhoneBooksFilter(key) {
  phoneBooksFilter = key;
  renderPhoneBooks(BOOK_LIST.filter(b => !isTestBook(b)));
}
window.setPhoneBooksFilter = setPhoneBooksFilter;

// Book strips on the combined "All Books" overview.
function renderAllBooksStrips(allBooksVisible) {
  renderPhoneBooks(allBooksVisible);
  const list = $('all-books-list');
  // Stamped so showCatalogueSkeleton() can never paint over real content if a
  // later boot step calls it again.
  list.dataset.loaded = '1';
  if (!allBooksVisible.length) {
    list.innerHTML = catalogueEmptyHtml();
  } else {
    list.innerHTML = allBooksVisible.map(book => {
    const s = states[book.id] || defaultState(book);
    const owed = sumMoney(s.stores, st => st.amountOwed);
    const pct = Math.max(0, s.stock / (book.maxPrint || 1) * 100);
    const stockClass = s.stock <= book.threshold ? 'danger' : s.stock <= book.threshold * 2 ? 'warn' : 'gold';
    const cost = book.productionCost || 0;
    const recognizedRev = recognizedRevenueOf(s);
    const beInfo = cost > 0 ? calculateBreakEven({
      cost,
      recognizedRev,
      listPrice: book.listPrice,
      sold: s.sold,
      stock: s.stock,
      currency: book.currency
    }) : null;
    const broken = beInfo ? beInfo.broken : false;
    const bePct = beInfo ? beInfo.pctBe : null;

    const beTooltip = beInfo ? (broken
      ? 'Production costs fully recovered!'
      : `${fmt(recognizedRev, book.currency)} of ${fmt(cost, book.currency)} recovered (${bePct.toFixed(0)}%) · ${fmt(beInfo.remaining, book.currency)} remaining${beInfo.hasListPrice ? ` (~${beInfo.unitsNeededAtList} units at ${fmt(beInfo.listPrice, book.currency)} list)` : ''}`) : '';

    const beBar = (!isAuthor() && bePct !== null) ? `
      <div class="book-progress-wrapper" title="${escapeHtml(beTooltip)}">
        <div class="book-progress-header">
          <span>Break-even</span>
          <span class="progress-pct" style="color:${broken ? 'var(--green)' : 'var(--text3)'}; font-weight:700;">
            ${broken ? '✓ Broken even' : bePct.toFixed(0) + '%'}
          </span>
        </div>
        ${bookProgressBarHtml({
      pct: bePct,
      tone: broken ? 'done' : '',
      label: `Break-even for ${book.title}`,
      valueText: broken
        ? 'Broken even — production costs fully recovered'
        : `${bePct.toFixed(0)}% of production costs recovered`,
    })}
      </div>` : '';

    // Amounts can arrive as text from a Sheet; sumMoney reads them as numbers.
    const expTotal = sumMoney(s.expenses || [], e => e.amount);

    // Every one of these reaches innerHTML. book.id, book.currency and
    // book.accent are stored verbatim from the Add-book form's inputs
    // ($('nb-id'), $('nb-cur'), $('nb-accent')), so they are DOM text on a
    // round trip through Firestore — CodeQL flags the path as
    // js/xss-through-dom, and it is right to. The numeric fields go through
    // parseInt/parseFloat upstream and cannot carry markup, but escaping them
    // costs nothing and stops this template needing a per-field audit again.
    const accent = escapeHtml(book.accent);
    const idAttr = escapeHtml(book.id);
    const promised = promisedPreorders(s.hist);
    const accentPair = getAccentFillPair(book.accent);
    return `<div class="book-strip" style="--accent-color: ${accent}; --accent-color-bg: ${escapeHtml(book.accentBg)}; --accent-color-light: ${escapeHtml(lightenColor(book.accent, 0.25))}; --accent-text: ${escapeHtml(getPaperSafeText(book.accent))}; --accent-fill: ${escapeHtml(accentPair.fill)}; --accent-contrast: ${escapeHtml(accentPair.label)};">
      <div class="book-cover-3d" aria-hidden="true">
        <div class="book-cover-spine"></div>
        <div class="book-cover-front">
          <div class="book-cover-deco"></div>
        </div>
      </div>
      <div class="book-strip-info">
        <div class="book-strip-title">${escapeHtml(book.title)}</div>
        <div class="book-strip-meta">
          <span><span class="lead-emoji" aria-hidden="true">✍ </span>${escapeHtml(book.author) || '—'}</span>
          <span> <span class="lead-emoji" aria-hidden="true">🏷 </span>${escapeHtml(book.currency)}${escapeHtml(book.listPrice)}</span>
          <span> <span class="lead-emoji" aria-hidden="true">🖨 </span>${escapeHtml(book.maxPrint)} printed</span>
          ${!isAuthor() && s.authorStock > 0 ? `<span> <span class="lead-emoji" aria-hidden="true">👤 </span>${escapeHtml(s.authorStock)} with author</span>` : ''}
          ${promised.copies > 0 ? `<span title="Pre-ordered on your website and not sent yet. These copies are already taken off on hand."> <span class="lead-emoji" aria-hidden="true">📌 </span>${escapeHtml(promised.copies)} pre-ordered, not sent</span>` : ''}
        </div>
        <div class="book-progress-wrapper" title="${escapeHtml(s.stock)} units on hand of ${escapeHtml(book.maxPrint)} total printed (${pct.toFixed(0)}%)">
          <div class="book-progress-header">
            <span>Stock on hand</span>
            <span class="progress-pct">${escapeHtml(s.stock)} / ${escapeHtml(book.maxPrint)} (${pct.toFixed(0)}%)</span>
          </div>
          ${bookProgressBarHtml({
      pct,
      // Same tone the on-hand figure already uses, so a book running low reads
      // as low from the bar too. 'gold' is the healthy default and needs no
      // override on the fill.
      tone: stockClass === 'gold' ? '' : stockClass,
      label: `Stock on hand for ${book.title}`,
      valueText: `${s.stock} of ${book.maxPrint} copies on hand`,
    })}
        </div>
        ${beBar}
      </div>
      <div class="book-strip-kpis">
        <div class="bsk">
          <div class="bsk-val ${stockClass}">${escapeHtml(s.stock)}</div>
          <div class="bsk-label">On hand</div>
        </div>
        <div class="bsk">
          <div class="bsk-val">${escapeHtml(s.sold)}</div>
          <div class="bsk-label">Sold</div>
        </div>
        <div class="bsk">
          <div class="bsk-val">${owed > 0 ? fmtWhole(owed, book.currency) : '—'}</div>
          <div class="bsk-label">Owed</div>
        </div>
        <div class="bsk">
          <div class="bsk-val ${expTotal > 0 ? 'warn' : ''}">${expTotal > 0 ? fmtWhole(expTotal, book.currency) : '—'}</div>
          <div class="bsk-label">Expenses</div>
        </div>
      </div>
      <div class="book-strip-actions">
        <button class="btn sm gold manage-btn" onclick="switchBook('${idAttr}')">
          <span>Manage</span>
          <svg class="manage-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </button>
      </div>
    </div>`;
    }).join('');
  }
}

// Combined channel analytics on the "All Books" overview — collects structured
// data grouped by currency so the view can render visually (stacked bars +
// per-currency toggle) instead of one dense, hard-to-scan table.
function renderCombinedChannelAnalytics(allBooksVisible) {
  const byCur = {}; // currency -> { books:[...], channelTotals:{chan:{txns,units,revenue,books:Set}} }
  allBooksVisible.forEach(book => {
    const s = states[book.id] || defaultState(book);
    const entries = Object.entries(s.chStats || {});
    if (!entries.length) return;
    // Direct-to-artist sales bump a channel's txns/units but not its revenue until
    // forwarded; fold the held gross back in per channel so the channel revenue is
    // recognized consistently with the headline figures.
    const heldByChan = {};
    (s.artistTransfers || []).forEach(t => { heldByChan[t.chan] = (heldByChan[t.chan] || 0) + (transferAmount(t) || 0); });
    const revOf = (chan, cs) => (cs.revenue || 0) + (heldByChan[chan] || 0);

    // ⚡ Bolt Optimization: Imperative loop instead of .reduce() avoids array allocations in rendering functions
    let bookRev = 0;
    for (let i = 0; i < entries.length; i++) {
      bookRev += revOf(entries[i][0], entries[i][1]);
    }
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
}

// Combined consignment table + summary stats on the "All Books" overview —
// data grouped per book so the view can render either a flat active-first
// list or collapsible per-book groups (renderConsignmentTable).
function renderCombinedConsignmentSummary(allBooksVisible) {
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
      return { store: st.name, sent, sold, returned: st.returned || 0, outstanding: st.outstanding || 0, isActive, pct: sent ? Math.round((sold / sent) * 100) : 0 };
    });
    // ⚡ Bolt: Imperative loops instead of .reduce() avoid array allocations in rendering functions
  const totals = { sent: 0, sold: 0, returned: 0, outstanding: 0, active: 0 };
    for (const r of rows) {
      totals.sent += r.sent;
      totals.sold += r.sold;
      totals.returned += r.returned;
      totals.outstanding += r.outstanding;
      if (r.isActive) totals.active += 1;
    }
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
      <div class="consignment-stat-card focus" tabindex="0" role="region" aria-label="Outstanding stock">
        <div class="con-stat-glow" aria-hidden="true"></div>
        <div class="consignment-stat-icon-wrap">
          <span class="consignment-stat-icon" aria-hidden="true">📦</span>
        </div>
        <div class="con-stat-content">
          <span class="con-stat-label">Outstanding stock</span>
          <strong class="con-stat-val tnum">${conTotals.outstanding}</strong>
          <em class="con-stat-sub"><span class="con-stat-bullet ${conTotals.outstanding ? 'amber' : 'gray'}" aria-hidden="true">●</span> copies still on shelves</em>
        </div>
      </div>
      <div class="consignment-stat-card" tabindex="0" role="region" aria-label="Active retail accounts">
        <div class="con-stat-glow" aria-hidden="true"></div>
        <div class="consignment-stat-icon-wrap">
          <span class="consignment-stat-icon" aria-hidden="true">🏬</span>
        </div>
        <div class="con-stat-content">
          <span class="con-stat-label">Active accounts</span>
          <strong class="con-stat-val tnum">${conTotals.active}</strong>
          <em class="con-stat-sub">${conTotals.settled} settled · ${conTotals.accounts} partners</em>
        </div>
      </div>
      <div class="consignment-stat-card" tabindex="0" role="region" aria-label="Sell-through rate">
        <div class="con-stat-glow" aria-hidden="true"></div>
        <div class="consignment-stat-icon-wrap">
          <span class="consignment-stat-icon" aria-hidden="true">📈</span>
        </div>
        <div class="con-stat-content">
          <span class="con-stat-label">Sell-through</span>
          <strong class="con-stat-val tnum">${sellThrough}%</strong>
          <div class="con-stat-bar-track" aria-hidden="true" title="${conTotals.sold} of ${conTotals.sent} sold">
            <div class="con-stat-bar-fill" style="width:${Math.min(100, Math.max(0, sellThrough))}%;"></div>
          </div>
          <em class="con-stat-sub">${conTotals.sold} of ${conTotals.sent} sold</em>
        </div>
      </div>
    `;
  }
  const statusChip = $('all-con-status-chip');
  if (statusChip) {
    statusChip.className = `pill ${conTotals.active ? 'amber' : (conTotals.accounts ? 'green' : 'gray')}`;
    statusChip.textContent = conTotals.accounts
      ? (conTotals.active ? `● ${conTotals.accounts} account${conTotals.accounts === 1 ? '' : 's'}` : `✓ ${conTotals.accounts} settled`)
      : 'No accounts';
  }

  const countAll = $('con-filter-count-all');
  if (countAll) countAll.textContent = conTotals.accounts;
  const countActive = $('con-filter-count-active');
  if (countActive) countActive.textContent = conTotals.active;
  const countSettled = $('con-filter-count-settled');
  if (countSettled) countSettled.textContent = conTotals.settled;

  const groupToggle = $('all-con-group-toggle');
  if (groupToggle) {
    groupToggle.classList.toggle('is-on', !!window._allConGrouped);
    groupToggle.setAttribute('aria-pressed', window._allConGrouped ? 'true' : 'false');
  }
  const expandToggle = $('all-con-expand-toggle');
  if (expandToggle) {
    expandToggle.style.display = window._allConGrouped ? 'inline-flex' : 'none';
  }
  renderConsignmentTable();
}

// Filter & Search state for Combined Consignment Summary
function setConStatusFilter(status) {
  window._allConStatusFilter = status;
  ['all', 'active', 'settled'].forEach(key => {
    const btn = $('con-filter-' + key);
    if (btn) {
      const isAct = (status === key);
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
    }
  });
  renderConsignmentTable();
}

function onConSearchInput(query) {
  window._allConSearchQuery = (query || '').trim().toLowerCase();
  const clearBtn = $('all-con-search-clear');
  if (clearBtn) clearBtn.style.display = window._allConSearchQuery ? 'inline-flex' : 'none';
  renderConsignmentTable();
}

function clearConSearch() {
  window._allConSearchQuery = '';
  const input = $('all-con-search-input');
  if (input) { input.value = ''; input.focus(); }
  const clearBtn = $('all-con-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  renderConsignmentTable();
}

function clearConSearchAndFilter() {
  clearConSearch();
  setConStatusFilter('all');
}

function toggleAllConGroups() {
  const conBooks = window._allConBooks || [];
  if (!conBooks.length) return;
  const collapsed = window._allConCollapsed || (window._allConCollapsed = new Set());
  if (collapsed.size >= conBooks.length) {
    collapsed.clear();
  } else {
    conBooks.forEach(b => collapsed.add(b.id));
  }
  renderConsignmentTable();
}

// Renders #all-con-body from window._allConBooks, honoring the flat/grouped
// toggle (window._allConGrouped), active filters, and per-book collapse state
// (window._allConCollapsed) without recomputing the underlying totals.
function conAccountRowHtml(bookId, bookTitle, r, nested, bookAccent) {
  const jump = `switchBook('${bookId}'); setTimeout(()=>switchTab('consignment'), 50);`;
  const titleCell = nested
    ? `<td class="con-nested-spacer" aria-hidden="true"></td>`
    : `<td><span class="con-row-book-title" role="button" tabindex="0" title="View ${escapeHtml(bookTitle)} consignment" onclick="${jump}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${jump}}"><span class="con-group-dot" style="background:${bookAccent || 'var(--gold2)'};" aria-hidden="true"></span><strong class="con-book-title-text">${escapeHtml(bookTitle)}</strong></span></td>`;

  const storeCell = nested
    ? `<td class="con-nested-store-cell"><div class="con-tree-guide" aria-hidden="true"></div><span class="store-name-cell store-jump-link" role="button" tabindex="0" title="Manage ${escapeHtml(r.store)} in ${escapeHtml(bookTitle)}" onclick="${jump}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${jump}}">${escapeHtml(r.store)}</span></td>`
    : `<td><span class="store-name-cell store-jump-link" role="button" tabindex="0" title="Manage ${escapeHtml(r.store)} in ${escapeHtml(bookTitle)}" onclick="${jump}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${jump}}">${escapeHtml(r.store)}</span></td>`;

  const outstandingDisplay = r.outstanding > 0
    ? `<span class="con-outstanding-badge tnum">${r.outstanding}</span>`
    : `<span class="con-zero-muted tnum">0</span>`;

  return `<tr class="${r.isActive ? 'is-active' : 'is-settled'}${nested ? ' con-nested-row' : ''}">`
    + titleCell
    + storeCell
    + `<td class="r col-sent tnum">${r.sent}</td>`
    + `<td class="r tnum">${r.sold}</td>`
    + `<td class="r tnum">${r.returned ?? 0}</td>`
    + `<td class="r outstanding-cell tnum">${outstandingDisplay}</td>`
    + `<td class="col-sellthrough"><div class="con-sellthrough-wrap"><div class="con-row-progress con-row-progress-link" role="button" tabindex="0" title="${r.pct}% sold-through (${r.sold} of ${r.sent}) — view ${escapeHtml(bookTitle)} consignment" onclick="${jump}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${jump}}"><div class="con-row-progress-bar" style="width:${r.pct}%;"></div></div><span class="con-row-pct tnum">${r.pct}%</span></div></td>`
    + `<td>${r.isActive ? '<span class="pill amber">● Active</span>' : '<span class="pill gray">✓ Settled</span>'}</td>`
    + `</tr>`;
}

function renderConsignmentTable() {
  const body = $('all-con-body');
  if (!body) return;
  const conBooks = window._allConBooks || [];
  if (!conBooks.length) {
    body.innerHTML = '<tr><td colspan="8"><div class="empty-state con-empty-state"><div class="e-icon">🏪</div><p class="con-empty-msg">No consignment accounts found across the catalogue.</p></div></td></tr>';
    return;
  }

  const query = window._allConSearchQuery || '';
  const filter = window._allConStatusFilter || 'all';

  const rowMatches = (r, bTitle) => {
    if (filter === 'active' && !r.isActive) return false;
    if (filter === 'settled' && r.isActive) return false;
    if (query) {
      const matchStore = r.store.toLowerCase().includes(query);
      const matchBook = bTitle.toLowerCase().includes(query);
      if (!matchStore && !matchBook) return false;
    }
    return true;
  };

  const expandToggle = $('all-con-expand-toggle');
  if (expandToggle) {
    expandToggle.style.display = window._allConGrouped ? 'inline-flex' : 'none';
  }

  if (!window._allConGrouped) {
    const flat = [];
    conBooks.forEach(b => {
      b.rows.forEach(r => {
        if (rowMatches(r, b.title)) {
          flat.push({ r, bookId: b.id, bookTitle: b.title, bookAccent: b.accent });
        }
      });
    });
    if (!flat.length) {
      body.innerHTML = '<tr><td colspan="8"><div class="empty-state con-empty-state"><div class="e-icon">🔍</div><p class="con-empty-msg">No consignment accounts matching filters.</p><button type="button" class="btn sm ink" onclick="clearConSearchAndFilter()">Reset filters</button></div></td></tr>';
      return;
    }
    flat.sort((a, b) => (b.r.isActive - a.r.isActive));
    body.innerHTML = flat.map(({ r, bookId, bookTitle, bookAccent }) => conAccountRowHtml(bookId, bookTitle, r, false, bookAccent)).join('');
    return;
  }

  const collapsed = window._allConCollapsed || (window._allConCollapsed = new Set());
  const matchingBooks = [];
  conBooks.forEach(b => {
    const filteredRows = b.rows.filter(r => rowMatches(r, b.title));
    if (filteredRows.length > 0) {
      const totals = { sent: 0, sold: 0, returned: 0, outstanding: 0, active: 0 };
      for (const r of filteredRows) {
        totals.sent += r.sent;
        totals.sold += r.sold;
        totals.returned += r.returned;
        totals.outstanding += r.outstanding;
        if (r.isActive) totals.active += 1;
      }
      matchingBooks.push({ ...b, rows: filteredRows, totals });
    }
  });

  if (!matchingBooks.length) {
    body.innerHTML = '<tr><td colspan="8"><div class="empty-state con-empty-state"><div class="e-icon">🔍</div><p class="con-empty-msg">No consignment accounts matching filters.</p><button type="button" class="btn sm ink" onclick="clearConSearchAndFilter()">Reset filters</button></div></td></tr>';
    return;
  }

  if (expandToggle) {
    const allCollapsed = matchingBooks.every(b => collapsed.has(b.id));
    const iconSpan = $('all-con-expand-icon');
    const textSpan = $('all-con-expand-text');
    if (iconSpan) iconSpan.textContent = allCollapsed ? '⊞' : '⊟';
    if (textSpan) textSpan.textContent = allCollapsed ? 'Expand all' : 'Collapse all';
    expandToggle.setAttribute('title', allCollapsed ? 'Expand all book groups' : 'Collapse all book groups');
  }

  const sortedBooks = [...matchingBooks].sort((a, b) => (b.totals.active > 0) - (a.totals.active > 0));
  body.innerHTML = sortedBooks.map(b => {
    const isCollapsed = collapsed.has(b.id);
    const pct = b.totals.sent ? Math.round((b.totals.sold / b.totals.sent) * 100) : 0;
    const statusLabel = b.totals.active ? `${b.totals.active} active` : 'All settled';
    const outstandingDisplay = b.totals.outstanding > 0
      ? `<span class="con-outstanding-badge tnum">${b.totals.outstanding}</span>`
      : `<span class="con-zero-muted tnum">0</span>`;

    const headerRow = `<tr class="con-group-row ${b.totals.active ? 'is-active' : 'is-settled'}" onclick="toggleConGroup('${b.id}')" role="button" tabindex="0" aria-expanded="${!isCollapsed}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleConGroup('${b.id}');}">`
      + `<td colspan="2" class="con-group-lead-cell">`
      + `<div class="con-group-lead-wrap">`
      + `<span class="con-group-chevron${isCollapsed ? '' : ' open'}" aria-hidden="true">▸</span>`
      + `<span class="con-group-dot" style="background:${b.accent};" aria-hidden="true"></span>`
      + `<strong class="con-group-title">${escapeHtml(b.title)}</strong>`
      + `<button type="button" class="con-group-jump-btn" title="Open ${escapeHtml(b.title)} consignment ledger" onclick="event.stopPropagation();switchBook('${b.id}');setTimeout(()=>switchTab('consignment'),50);" aria-label="Open ${escapeHtml(b.title)} consignment">Manage →</button>`
      + `</div>`
      + `</td>`
      + `<td class="r col-sent tnum">${b.totals.sent}</td>`
      + `<td class="r tnum">${b.totals.sold}</td>`
      + `<td class="r tnum">${b.totals.returned}</td>`
      + `<td class="r outstanding-cell tnum">${outstandingDisplay}</td>`
      + `<td class="col-sellthrough"><div class="con-sellthrough-wrap"><div class="con-row-progress" title="${pct}% sold-through (${b.totals.sold} of ${b.totals.sent})"><div class="con-row-progress-bar" style="width:${pct}%;"></div></div><span class="con-row-pct tnum">${pct}%</span></div></td>`
      + `<td><span class="pill ${b.totals.active ? 'amber' : 'gray'}">${b.totals.active ? '● ' : '✓ '}${statusLabel}</span></td>`
      + `</tr>`;

    if (isCollapsed) return headerRow;
    const sortedRows = [...b.rows].sort((a, c) => (c.isActive - a.isActive));
    return headerRow + sortedRows.map(r => conAccountRowHtml(b.id, b.title, r, true, b.accent)).join('');
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
  const expandBtn = $('all-con-expand-toggle');
  if (expandBtn) {
    expandBtn.style.display = window._allConGrouped ? 'inline-flex' : 'none';
  }
  renderConsignmentTable();
}
window.toggleConGroup = toggleConGroup;
window.toggleConGrouping = toggleConGrouping;
window.toggleAllConGroups = toggleAllConGroups;
window.setConStatusFilter = setConStatusFilter;
window.onConSearchInput = onConSearchInput;
window.clearConSearch = clearConSearch;
window.clearConSearchAndFilter = clearConSearchAndFilter;
window.renderConsignmentTable = renderConsignmentTable;

// Polished audience snapshot for the Customers tab.
export function renderCustomersStat(allCustomers) {
  const host = $('customer-audience-summary');
  if (!host) return;
  const buyers = allCustomers || buildCustomerList();
  // Use imperative counting to eliminate multiple array allocations and reduce GC pressure
  let repeat = 0;
  let unsubscribed = 0;
  for (const r of buyers) {
    if (r.orders >= 2) repeat++;
    if (_isCustomerSuppressed(r.email)) unsubscribed++;
  }

  let onList = 0;
  for (const s of mailingSubsArray()) {
    if (!_isCustomerSuppressed(s.email)) onList++;
  }
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
/* Channel identity colours for the sales-by-channel rows.
 *
 * These are deliberately NOT the Riso brand fills. A brand fill is chosen to
 * look right behind ink; a categorical series colour has to stay TELLABLE
 * APART, including for colour-blind readers, and the two goals conflict. Flare
 * red sits within ΔE 2-3 of every other warm hue under protan/deutan, and the
 * brand yellow reads at 1.4:1 on newsprint. Six riso fills measured as two
 * near-identical blues and an invisible yellow.
 *
 * So this is a colour-vision-safe set (Okabe-Ito), validated rather than
 * eyeballed, in a FIXED order — a channel keeps its colour when a filter
 * changes how many channels are showing.
 *   light: every check passes.
 *   dark:  chroma, colour-blind separation (ΔE 9.6), normal-vision separation
 *          (ΔE 16.4) and contrast (all >= 3:1) pass; three swatches sit a little
 *          above the ideal lightness band, which costs no legibility. Re-stepping
 *          them into that band forced two channels back under the
 *          tell-apart threshold, which is the worse trade.
 *
 * Colour is reinforcement here, never the only cue: each row carries the channel
 * name as text, an aria-label, and its own track, and the bars never touch.
 */
const CHANNEL_COLORS = {
  'in person': '#D55E00', 'consignment': '#CC79A7', 'website': '#0072B2',
  'direct': '#009E73', '': '#009E73', 'book fair': '#E69F00', 'gratuity': '#56B4E9',
};
/* A channel outside the set above folds into one neutral "other" rather than
 * being given a generated hue. Hashing a name into a colour looks like identity
 * and is not: two unknown channels could collide, and the same channel could
 * land next to a named one it is indistinguishable from. The row is labelled by
 * name either way, so nothing is lost. */
const CHAN_OTHER = '#6B655B';
export function channelColor(chan) {
  const k = (chan || '').toLowerCase().trim();
  return CHANNEL_COLORS[k] != null ? CHANNEL_COLORS[k] : CHAN_OTHER;
}
export const chanLabel = (chan) => (chan && chan.trim()) ? chan : 'Direct';

function selectAllChCurrency(c) {
  window._allChCur = c;
  renderChannelAnalytics();
}

function setChChannelFilter(chan) {
  const k = (chan || '').toLowerCase().trim();
  window._allChFilter = (window._allChFilter === k) ? null : k;
  renderChannelAnalytics();
}

function clearChChannelFilter() {
  window._allChFilter = null;
  renderChannelAnalytics();
}

function setChBookSort(sortKey) {
  window._allChSort = sortKey;
  renderChannelAnalytics();
}

function setChBookSearch(query) {
  window._allChSearch = query || '';
  renderChannelAnalytics();
}

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
    toggle = `<div class="ch-cur-toggle" role="tablist" aria-label="Currency selection">` + curKeys.map(c => {
      const tot = sumMoney(byCur[c].books || [], b => b.total);
      const isAct = c === cur;
      return `<button type="button" role="tab" aria-selected="${isAct}" class="ch-cur-btn${isAct ? ' active' : ''}" onclick="selectAllChCurrency(${escapeHtml(JSON.stringify(c))})">
        <span class="ch-cur-code">${escapeHtml(c)}</span>
        <span class="ch-cur-amt">${fmt(tot, c)}</span>
      </button>`;
    }).join('') + `</div>`;
  }

  // Channel performance. The bar width IS the share of combined revenue, so the
  // bar and the percentage beside it are the same number. The previous version
  // scaled every bar against the LEADER while labelling it with share of TOTAL,
  // which put two different scales in one row: the top channel's bar always ran
  // full width whatever its actual share.
  const chans = Object.entries(cd.channelTotals).map(([chan, t]) => ({ chan, ...t })).sort((a, b) => b.revenue - a.revenue);
  // ⚡ Bolt Optimization: Combine multiple channel aggregate passes into a single loop instead of 4 separate reduces
  let grandRev = 0, grandTxn = 0, grandU = 0;
  for (let i = 0; i < chans.length; i++) {
    const x = chans[i];
    grandRev += x.revenue || 0;
    grandTxn += x.txns || 0;
    grandU += x.units || 0;
  }
  const top = chans[0];
  const activeChans = chans.filter(x => (x.revenue || 0) > 0).length;
  const avgOrder = grandTxn ? grandRev / grandTxn : 0;
  const avgUnit = grandU ? grandRev / grandU : 0;
  const topShare = top && grandRev > 0 ? top.revenue / grandRev * 100 : 0;
  const curCode = escapeHtml(cur);

  const chartRows = chans.map((x) => {
    const share = grandRev > 0 ? x.revenue / grandRev * 100 : 0;
    const col = channelColor(x.chan);
    const name = escapeHtml(chanLabel(x.chan));
    const volume = `${x.txns} txn · ${x.units} u`;
    return `<div class="ch-row">
      <div class="ch-row-name"><span class="ch-dot" style="background:${escapeHtml(col)}"></span><span>${name}</span></div>
      <div class="ch-row-track" role="img" aria-label="${name} generated ${share.toFixed(0)}% of ${curCode} revenue"><div class="ch-row-fill" style="width:${share.toFixed(2)}%;background:${escapeHtml(col)};"></div></div>
      <div class="ch-row-pct mono-num">${share.toFixed(0)}%</div>
      <div class="ch-row-rev mono-num">${fmt(x.revenue, cur)}</div>
      <div class="ch-row-vol mono-num">${escapeHtml(volume)}</div>
    </div>`;
  }).join('');

  const chart = `<div class="ch-panel">
    <div class="ch-summary">
      <div>
        <div class="ch-summary-label">Combined revenue</div>
        <div class="ch-summary-total mono-num">${fmt(grandRev, cur)}</div>
      </div>
      <div class="ch-summary-stats">
        <div class="ch-stat"><span>Transactions</span><strong class="mono-num">${grandTxn}</strong></div>
        <div class="ch-stat"><span>Units</span><strong class="mono-num">${grandU}</strong></div>
        <div class="ch-stat"><span>Per transaction</span><strong class="mono-num">${fmt(avgOrder, cur)}</strong></div>
        <div class="ch-stat"><span>Per unit</span><strong class="mono-num">${fmt(avgUnit, cur)}</strong></div>
      </div>
    </div>
    <div class="ch-insight">
      <span class="ch-insight-lead">${top ? `${escapeHtml(chanLabel(top.chan))} leads at ${topShare.toFixed(0)}%` : 'No leading channel yet'}</span>
      <span class="ch-insight-sub">of combined revenue, across ${activeChans} active ${activeChans === 1 ? 'channel' : 'channels'}</span>
    </div>
    <div class="ch-table">
      <div class="ch-row ch-row-head">
        <div>Channel</div>
        <div>Share of revenue</div>
        <div class="ch-row-pct">%</div>
        <div class="ch-row-rev">Revenue</div>
        <div class="ch-row-vol">Volume</div>
      </div>
      ${chartRows}
      <div class="ch-row ch-row-total">
        <div class="ch-row-name">All channels</div>
        <div></div>
        <div class="ch-row-pct mono-num">100%</div>
        <div class="ch-row-rev mono-num">${fmt(grandRev, cur)}</div>
        <div class="ch-row-vol mono-num">${grandTxn} txn · ${grandU} u</div>
      </div>
    </div>
  </div>`;

  // Per-book cards — one stacked channel-mix bar per book + colour-keyed legend
  const cards = cd.books.map(b => {
    const segs = b.channels.filter(c => c.rev > 0).map(c =>
      `<div class="ch-seg" style="width:${b.total > 0 ? c.rev / b.total * 100 : 0}%;background:${escapeHtml(channelColor(c.chan))}" title="${escapeHtml(chanLabel(c.chan))}: ${fmt(c.rev, b.cur)}"></div>`
    ).join('') || `<div class="ch-seg" style="width:100%;background:var(--cream3)"></div>`;
    const legend = b.channels.map(c => {
      const isTop = c.chan === b.bestChan;
      // Rows with real transactions drill into that book + channel's order history.
      const clickable = c.txns > 0;
      const jsChan = (c.chan || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      // A clickable row that is not a <button> needs role/tabindex/keydown, or
      // the :focus-visible ring styled for it can never be reached — see the
      // pre-flight list in .agents/UX_PATTERNS.md and .con-row-progress-link.
      const jump = escapeHtml(`drillToChannel('${b.id}','${jsChan}')`);
      const tap = clickable
        ? ` class="ch-leg-row ch-leg-tap" role="button" tabindex="0" title="View ${escapeHtml(chanLabel(c.chan))} orders" onclick="${jump}" onkeydown="if(event.key===&#39;Enter&#39;||event.key===&#39; &#39;){event.preventDefault();${jump}}"`
        : ` class="ch-leg-row"`;
      return `<div${tap}>
        <span class="ch-dot" style="background:${escapeHtml(channelColor(c.chan))}"></span>
        <span class="ch-leg-name">${escapeHtml(chanLabel(c.chan))}${isTop ? ' <span class="pill gold ch-top">TOP</span>' : ''}</span>
        <span class="ch-leg-pct mono-num">${c.share.toFixed(0)}%</span>
        <span class="ch-leg-val mono-num">${fmt(c.rev, b.cur)}</span>
        <span class="ch-leg-meta mono-num">${c.txns} txn · ${c.units} u${clickable ? ' <span class="ch-leg-go">›</span>' : ''}</span>
      </div>`;
    }).join('');
    return `<div class="ch-book-card">
      <div class="ch-book-head"><span class="ch-book-title">${escapeHtml(b.title)}</span><span class="ch-book-total mono-num">${fmt(b.total, b.cur)}</span></div>
      <div class="ch-stack">${segs}</div>
      <div class="ch-legend">${legend}</div>
    </div>`;
  }).join('');

  host.innerHTML = toggle + chart + `<div class="ch-book-grid">${cards}</div>`;
}

// ── NOTIFICATIONS, ACTIVITY & THE TO-DO LIST ───────────────────────────────
//
// Three surfaces, two derived sources, zero stored state.
//
// `buildAttentionSignals()` answers "what needs doing?" and feeds BOTH the
// notifications rail on the landing page and the To-do tab — deliberately one
// engine, because two scans would drift and start contradicting each other on
// the same screen. `buildActivityFeed()` answers the different question of what
// has already happened.
//
// The engine itself still writes nothing: a signal lives exactly as long as
// the thing it describes is true, so restocking a book is what clears its
// low-stock warning. The one thing layered on top is dismissal — "not
// relevant to me", never "done" — kept out of the engine and out of Firestore
// in a small local map (see getDismissedTodoSignals below), the same
// device-only home the receipt vault's own dismissed-notice list already uses
// for this same kind of decision. It never claims the underlying thing is
// fixed, and it works offline because there is nothing to sync.
//
// This replaced the old inline "Pending Author Submissions" banner that used to
// sit at the top of this page. Its two conditions (author submissions, open-call
// contributors) are now producers inside the signal engine, so the screen has
// one place that says what needs attention instead of two that could disagree.

/** How many notifications the rail shows before deferring to the To-do tab. */
const RAIL_NOTIFICATION_LIMIT = 5;
/** How many past events the rail's activity panel shows. */
const RAIL_ACTIVITY_LIMIT = 12;

/** The books the publisher actually publishes — test books report nothing. */
function attentionBooks() {
  return BOOK_LIST.filter(b => !isTestBook(b));
}

/**
 * Everything the pure signal engine cannot work out for itself: the live
 * connections, the sync queue, and the author-submission inbox.
 */
export function attentionInput() {
  const submissions = Object.keys(window.authorSubmissions || {}).map(bookId => {
    const subs = window.authorSubmissions[bookId] || {};
    return {
      bookId,
      bookTitle: BOOKS[bookId]?.title || bookId,
      sales: Object.keys(subs.sales || {}).length,
      expenses: Object.keys(subs.expenses || {}).length,
    };
  });

  const openCall = Object.keys(states || {}).map(bookId => {
    const list = states[bookId]?.openCall;
    if (!Array.isArray(list) || !list.length) return null;
    let waiting = 0;
    for (const c of list) {
      if (OC_STAGES.some(st => !c[st.key])) waiting++;
    }
    return waiting > 0 ? { bookId, bookTitle: BOOKS[bookId]?.title || bookId, waiting } : null;
  }).filter(Boolean);

  return {
    books: attentionBooks(),
    states,
    sheets: {
      connected: !!sheetsUrl,
      deployedVersion: _sheetsDeployedVersion,
      expectedVersion: EXPECTED_SCRIPT_VERSION,
    },
    sync: {
      online: typeof navigator === 'undefined' || navigator.onLine !== false,
      pending: syncQueue.length,
      failed: false,
    },
    submissions,
    openCall,
    taxCenter: TAX_CENTER,
    tripsSummary: (() => { try { return _tcGetTripsSummaryAll() || {}; } catch (_) { return {}; } })(),
    automation: automationTodoInput(),
    today: today(),
  };
}

/**
 * What the automations have set aside for the publisher, as plain counts for
 * the signal engine. Each part is guarded on its own: one feature failing to
 * answer must not empty the whole to-do list.
 */
function automationTodoInput() {
  const safe = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };
  const recorded = safe(() => _reconRecordedChargeIds(), new Set());
  const mem = safe(() => getReconMemory(), { recorded: {}, dismissed: {} });
  const cardPaymentsToMatch = safe(() => readRaisedStripeSales()
    .filter(id => !recorded.has(id) && !mem.recorded?.[id] && !mem.dismissed?.[id]).length, 0);
  const stillCounted = (item) => {
    const row = findStripeSaleRow(item.bookId, item.sheetsId);
    return !!row && !row.voided;
  };
  const refundsToReverse = safe(() => readPendingRefundReversals().filter(stillCounted).length, 0);
  const storeReversals = safe(() => readStoredList(STORE_REVERSAL_PENDING_KEY).filter(item => item.full && stillCounted(item)).length, 0);
  // Only the orders that would otherwise be flagged are checked for labels.
  const labelledOrderNums = safe(() => {
    const rows = [];
    Object.entries(states).forEach(([bookId, st]) => (st?.hist || []).forEach(entry => rows.push({ bookId, entry })));
    return ordersWithLabels(unshippedOrders(rows).map(o => o.num));
  }, []);
  // The same list the review inbox shows, so a count here and the inbox itself
  // can never disagree about what is waiting.
  const review = safe(() => reviewQueueSnapshot().summary, { receipts: 0, labels: 0, ready: 0 });
  return {
    websiteOrdersToReview: safe(() => bigCartelOrdersToReview(), 0),
    labelledOrderNums,
    cardPaymentsToMatch,
    refundsToReverse,
    storeReversals,
    receiptsWaiting: review.receipts,
    receiptsReady: safe(() => reviewQueueSnapshot().items.filter(i => i.kind === 'receipt' && i.state === 'ready').length, 0),
    labelsToMatch: review.labels,
    syncConflicts: safe(() => listConflicts(syncConflictStorage()).length, 0),
    websiteLink: safe(() => websiteLinkTodo(), null),
  };
}

// ── Dismissing a to-do item ─────────────────────────────────────────────────
//
// Some signals genuinely never apply to a given shop — a chapbook that will
// never carry an ISBN, a title only ever sold in person that has no need of a
// QR payment link. Forcing those to sit at the top of the list forever is how
// a to-do list teaches people to stop reading it. Dismissal says "not this
// one", stored by the signal's own id so it survives a rescan; it says nothing
// about whether the underlying thing changed, so it is never confused with the
// engine's own self-clearing behaviour above.
const TODO_DISMISSED_KEY = 'lm-dismissed-todo-signals';
const SIDEBAR_ALERTS_HIDDEN_KEY = 'lm-sidebar-alerts-hidden';
let _sidebarAlertsHidden = false;

/**
 * Lets the publisher quiet the red menu badges without pretending the work is
 * fixed. This is deliberately a display preference: the To-do items and
 * integration details remain available inside their tabs, and the same button
 * can restore the badges at any time.
 */
function renderSidebarAlertPreference() {
  const sidebar = $('pub-sidebar');
  const button = $('sidebar-alert-toggle');
  const label = $('sidebar-alert-toggle-label');
  if (sidebar) sidebar.classList.toggle('nav-alerts-hidden', _sidebarAlertsHidden);
  if (button) {
    button.setAttribute('aria-checked', String(_sidebarAlertsHidden));
    button.title = _sidebarAlertsHidden
      ? 'Show the red notification badges in this menu'
      : 'Hide the red notification badges in this menu';
  }
  if (label) label.textContent = _sidebarAlertsHidden ? 'Show menu alerts' : 'Hide menu alerts';
}

function toggleSidebarAlerts() {
  const wasHidden = _sidebarAlertsHidden;
  _sidebarAlertsHidden = !wasHidden;
  try {
    localStorage.setItem(SIDEBAR_ALERTS_HIDDEN_KEY, String(_sidebarAlertsHidden));
  } catch (_) { /* the in-memory preference still works for this session */ }
  renderSidebarAlertPreference();
  refreshAppSwitch();
  showToast(wasHidden ? 'Navigation alerts are visible again' : 'Navigation alerts hidden', 'ok', 2600);
}

try { _sidebarAlertsHidden = localStorage.getItem(SIDEBAR_ALERTS_HIDDEN_KEY) === 'true'; } catch (_) { /* storage may be blocked */ }
renderSidebarAlertPreference();

function getDismissedTodoSignals() {
  try {
    return JSON.parse(localStorage.getItem(TODO_DISMISSED_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function dismissTodoSignal(id) {
  if (!id) return;
  try {
    const map = getDismissedTodoSignals();
    map[id] = true;
    localStorage.setItem(TODO_DISMISSED_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Could not dismiss that', e);
  }
  renderTodoTab();
  renderOverviewRail();
  showToast('Dismissed — restore it anytime from the bottom of the list', 'ok', 3200);
}

function restoreDismissedTodoSignals() {
  try {
    localStorage.removeItem(TODO_DISMISSED_KEY);
  } catch (e) {
    console.error('Could not restore dismissed items', e);
  }
  renderTodoTab();
  renderOverviewRail();
  showToast('✓ Dismissed items are back', 'ok', 3000);
}

/**
 * What buildAttentionSignals() sees minus what the publisher has already said
 * is not relevant to them. The rail and the To-do tab both read this rather
 * than the raw engine output, for the same reason they share one engine in
 * the first place: two different-looking counts on the same screen teach
 * people to trust neither.
 */
function visibleAttentionResult() {
  const raw = buildAttentionSignals(attentionInput());
  const dismissed = getDismissedTodoSignals();

  // ⚡ Bolt Optimization: Optimize hiddenCount check
  let hiddenCount = 0;
  for (const s of raw.signals) {
    if (dismissed[s.id]) hiddenCount++;
  }

  if (!hiddenCount) return { ...raw, hiddenCount: 0 };

  // ⚡ Bolt Optimization: Loop fusion - Combine .filter() and grouping into a single pass
  let urgent = 0;
  const signals = [];
  const byGroup = {};
  for (const group of SIGNAL_GROUPS) byGroup[group] = [];

  for (const s of raw.signals) {
    if (!dismissed[s.id]) {
      signals.push(s);
      if (byGroup[s.group]) byGroup[s.group].push(s);
      if (isUrgent(s)) urgent++;
    }
  }

  return {
    signals,
    byGroup,
    total: signals.length,
    urgent,
    hiddenCount,
  };
}

/**
 * The attributes that make a "fix this" button work.
 *
 * The destination travels as DATA and is acted on by the delegated handler
 * below — it never lands in an onclick. escapeHtml() stops a value breaking out
 * of an attribute, but the browser decodes those entities before the JS engine
 * reads the code, so a book id containing a quote in an onclick would break out
 * of the JS string and run. Book ids are free text from the Add-book form.
 */
/**
 * A fix that opens the website (its own to-do items, website orders not sent
 * yet) is a real link: the app switch (features/app-switch.js) handles the
 * click so the website's tab is reused, and long-press / middle-click work.
 * Only website addresses reach here (lib/website-todo.js isWebsiteHref).
 */
function fixControlHtml(fix, cls, { arrow = true, quick = false } = {}) {
  if (!fix) return '';
  if (fix.kind === 'website' && fix.href) {
    return `<a class="${cls}${quick ? ' is-quick' : ''}" href="${escapeHtml(fix.href)}" target="${WEBSITE_TAB_NAME}" data-open-website="todo">${escapeHtml(fix.label)} <span aria-hidden="true">↗</span></a>`;
  }
  return `<button type="button" class="${cls}${quick ? ' is-quick' : ''}" ${fixAttrs(fix)}>${escapeHtml(fix.label)}${arrow && !quick ? ' →' : ''}</button>`;
}

function fixAttrs(fix) {
  return `data-fix="${escapeHtml(fix.kind || '')}"`
    + (fix.bookId ? ` data-fix-book="${escapeHtml(fix.bookId)}"` : '')
    + (fix.tab ? ` data-fix-tab="${escapeHtml(fix.tab)}"` : '')
    + (fix.num ? ` data-fix-num="${escapeHtml(fix.num)}"` : '')
    + (fix.section ? ` data-fix-section="${escapeHtml(fix.section)}"` : '');
}

/**
 * The one-tap extras on a signal: a quick action that does the thing right
 * here (file these receipts, reverse these sales), and — for a signal about
 * several orders — a line per order with its own button. Same data-only
 * buttons as the fix, so nothing typed can become code.
 */
function signalExtrasHtml(sig, btnClass) {
  const quick = sig.quick ? fixControlHtml(sig.quick, btnClass, { quick: true }) : '';
  const items = (sig.items || []).length
    ? `<ul class="signal-items">${sig.items.map(item => `<li>
          <span>${escapeHtml(item.label)}</span>
          ${item.quick ? `<button type="button" class="${btnClass} is-quick" ${fixAttrs(item.quick)}>${escapeHtml(item.quick.label)}</button>` : ''}
        </li>`).join('')}</ul>`
    : '';
  return { quick, items };
}

/**
 * Every fix button on both surfaces, handled once. Delegated rather than bound
 * per render, because both panels are rebuilt wholesale on each repaint and
 * per-node listeners would accumulate.
 */
document.addEventListener('click', (event) => {
  const dismissBtn = event.target.closest?.('[data-dismiss-signal]');
  if (dismissBtn) { dismissTodoSignal(dismissBtn.dataset.dismissSignal); return; }

  const todoBtn = event.target.closest?.('[data-open-todo]');
  const btn = todoBtn || event.target.closest?.('[data-fix]');
  if (!btn) return;
  // From the notifications window: count the message as seen and get the
  // window out of the way of where the button leads.
  if (btn.closest('#m-notifications')) {
    if (btn.dataset.notifKind) reviewNotification(btn.dataset.notifKind);
    closeM('notifications');
  } else if (btn.dataset.notifKind) {
    reviewNotification(btn.dataset.notifKind);
  }
  if (todoBtn) { openTodoItem(todoBtn.dataset.openTodo); return; }
  const { fix, fixBook = '', fixTab = '', fixNum = '', fixSection = '' } = btn.dataset;
  if (fix === 'retry-sync') { retrySyncNow(); return; }
  if (fix === 'tab' && fixTab) { switchTab(fixTab); return; }
  if (fix === 'book' && fixBook) {
    // switchBook first: switchTab alone cannot leave the all-books screen.
    switchBook(fixBook);
    if (fixTab) setTimeout(() => {
      switchTab(fixTab);
      // Land on the part of the tab the item is about, not its first section.
      if (fixTab === 'consignment' && fixSection) {
        setConSection(fixSection);
        $(`${fixSection}-section`)?.scrollIntoView({ block: 'start', behavior: _prefersReducedMotion() ? 'auto' : 'smooth' });
      }
    }, 50);
    return;
  }
  if (fix === 'edit-book' && fixBook) { openEditBookField(fixBook, fixTab); return; }
  if (fix === 'taxcenter') {
    switchTab('taxcenter');
    if (fixTab) setTimeout(() => switchTaxCenterSubTab(fixTab), 50);
    return;
  }
  // Named actions from the automations. A fixed list, so nothing a publisher
  // types can ever choose what runs.
  if (fix === 'action') runTodoAction(fixTab, { bookId: fixBook, num: fixNum });
});

export function refreshAttentionSurfaces() {
  renderTodoTab();
  renderOverviewRail();
}
// The website link's waiting orders and storage check feed the To-do list.
if (typeof window !== 'undefined') window.addEventListener('website-link-todo', () => { try { refreshAttentionSurfaces(); } catch (_) { /* next render picks it up */ } });

/** Tick one order off as sent, from the to-do list or the landing page. */
function markOrderSentFromTodo(bookId, num) {
  const row = (states[bookId]?.hist || []).find(h => h && h.num === num && h.chan === 'Website' && !h.voided);
  if (!row) { showToast('That order is no longer in your ledger', 'warn'); return; }
  if (row.shipped) { showToast(`${num} is already marked as sent`); refreshAttentionSurfaces(); return; }
  row.shipped = true;
  row.shippedDate = today();
  saveState(bookId);
  refreshAttentionSurfaces();
  renderHist();
  pushAppAlert({
    id: 'order-marked-sent',
    icon: '📦',
    title: `${num} marked as sent`,
    detail: `${row.shipName || 'The customer'}’s order won’t be flagged as waiting any more.`,
    actionLabel: 'Undo',
    // JSON keeps the order number a safe string in the code; the alert card
    // escapes the whole action for the page attribute.
    action: `undoMarkOrderSent(${JSON.stringify(bookId)}, ${JSON.stringify(num)})`,
    log: false,
  });
}

function undoMarkOrderSent(bookId, num) {
  dismissAppAlert('order-marked-sent');
  const row = (states[bookId]?.hist || []).find(h => h && h.num === num && h.chan === 'Website');
  if (!row || !row.shipped) return;
  delete row.shipped;
  delete row.shippedDate;
  saveState(bookId);
  refreshAttentionSurfaces();
  renderHist();
  showToast(`${num} is back on the waiting list`);
}
window.undoMarkOrderSent = undoMarkOrderSent;

// A printed-QR register sale whose payment the owner has now seen in Stripe.
// One checkout can span several books, so every row with that number clears.
function confirmPrintedQrArrived(num) {
  if (!num) return;
  let cleared = 0;
  for (const [bookId, s] of Object.entries(states)) {
    let touched = false;
    for (const h of (s?.hist || [])) {
      if (h.num === num && !h.qrConfirmed && String(h.notes || '').startsWith('Stripe QR (printed code')) {
        h.qrConfirmed = true;
        touched = true;
        cleared++;
      }
    }
    if (touched) saveState(bookId);
  }
  refreshAttentionSurfaces();
  showToast(cleared ? '✓ Marked as paid' : 'Already marked as paid', 'ok');
}

function runTodoAction(name, { bookId = '', num = '' } = {}) {
  if (name === 'mark-shipped') { markOrderSentFromTodo(bookId, num); return; }
  // Receipts and labels the app found are reviewed one at a time in the review
  // inbox; `num` says which kind to open it on.
  if (name === 'review-inbox') { openReviewInbox({ filter: num === 'receipt' || num === 'label' ? num : 'all' }); return; }
  if (name === 'file-ready-receipts' || name === 'receipt-inbox') { openReviewInbox({ filter: 'receipt' }); return; }
  if (name === 'qr-arrived') { confirmPrintedQrArrived(num); return; }
  if (name === 'sync-conflicts') { openSyncConflicts(); return; }
  if (name === 'shipping-worklist') { openReviewInbox({ filter: 'label' }); return; }
  // The website's books that aren't in this app yet, on the Website orders card.
  if (name === 'website-shop-books') { openWebsiteShopBooks(); return; }
  if (name === 'website-detail-diffs') { openWebsiteDetailDiffs(); return; }
  if (name === 'reverse-sales') {
    const refunds = readPendingRefundReversals();
    const all = [...refunds, ...readStoredList(STORE_REVERSAL_PENDING_KEY).filter(item => item.full)];
    if (!all.length) { showToast('Nothing left to reverse', 'ok'); return; }
    const copies = all.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    confirmDialog(
      `Reverse ${all.length} refunded sale${all.length === 1 ? '' : 's'}?\n\nThis puts ${copies} cop${copies === 1 ? 'y' : 'ies'} back in stock and takes the sale${all.length === 1 ? '' : 's'} out of your earnings. You can undo it straight afterwards.`,
      { title: 'Reverse refunded sales', okLabel: 'Reverse them' },
    ).then(ok => {
      if (!ok) return;
      writePendingRefundReversals([]);
      try { localStorage.setItem(STORE_REVERSAL_PENDING_KEY, '[]'); } catch (_) { /* storage blocked */ }
      dismissAppAlert('stripe-refunds');
      dismissAppAlert('store-reversals');
      reverseSalesWithUndo(all, 'Refunded');
      renderTodoTab();
      renderOverviewRail();
    });
  }
}

/** One notification card. Tone follows the house amber/red/blue convention. */
function notificationHtml(sig) {
  const tone = sig.status === 'blocked' ? 'red' : sig.status === 'warn' ? 'amber' : 'blue';
  // Every item leads somewhere: its own fix when it has one, otherwise its row
  // in the to-do list, picked out, rather than the top of a long list.
  const action = sig.fix ? fixControlHtml(sig.fix, 'notif-action') : openTodoItemButton(sig.id);
  const extras = signalExtrasHtml(sig, 'notif-action');
  return `<div class="notif-item tone-${tone}" data-signal="${escapeHtml(sig.id || '')}">
      <span class="notif-ico" aria-hidden="true">${escapeHtml(sig.icon || '')}</span>
      <div class="notif-body">
        <div class="notif-source">From To-do list</div>
        <div class="notif-title">${escapeHtml(sig.label || '')}</div>
        <div class="notif-detail">${escapeHtml(sig.detail || '')}</div>
        ${extras.items}
        ${action || extras.quick ? `<div class="notif-meta">${extras.quick}${action}</div>` : ''}
      </div>
    </div>`;
}

/** The book-settings fields a to-do item can open straight onto. A fixed list: ids arrive as page data. */
const EDIT_BOOK_FIELDS = { cost: 'nb-prod', isbn: 'nb-isbn', paylink: 'nb-payment-link' };

/** Open a book's settings with the missing field in view and ready to type in. */
function openEditBookField(bookId, field) {
  if (!BOOKS[bookId]) return;
  openEditBookModal(bookId);
  const input = $(EDIT_BOOK_FIELDS[field] || '');
  if (!input) return;
  setTimeout(() => {
    input.scrollIntoView({ block: 'center', behavior: _prefersReducedMotion() ? 'auto' : 'smooth' });
    try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
    if (typeof input.select === 'function' && (input.value === '—' || input.value === '0')) input.select();
  }, 80);
}

/** A link straight to one item's row in the To-do tab. Data only: ids can hold text a publisher typed. */
function openTodoItemButton(signalId, cls = 'notif-action') {
  return `<button type="button" class="${cls}" data-open-todo="${escapeHtml(signalId || '')}">See it in your to-do list →</button>`;
}

/**
 * Open the To-do tab on one item: scrolled into view and picked out for a
 * moment, so a link from a notification lands on the thing it was about
 * instead of the top of the list. Falls back to the list when the item has
 * since been dealt with.
 */
function openTodoItem(signalId) {
  switchTab('todo');
  setTimeout(() => {
    const row = [...document.querySelectorAll('#todo-groups .todo-row[data-signal]')]
      .find(el => el.dataset.signal === signalId);
    if (!row) { showToast('That one is already dealt with — here is the rest of your to-do list'); return; }
    row.scrollIntoView({ block: 'center', behavior: _prefersReducedMotion() ? 'auto' : 'smooth' });
    row.classList.add('is-spotlit');
    setTimeout(() => row.classList.remove('is-spotlit'), 2400);
  }, 60);
}

/** The landing page's card for everything waiting in the review inbox. */
function reviewCardHtml(review) {
  const tone = review.needsYou ? 'amber' : 'blue';
  return `<div class="notif-item tone-${tone} notif-review">
      <span class="notif-ico" aria-hidden="true">📥</span>
      <div class="notif-body">
        <div class="notif-source">Review inbox</div>
        <div class="notif-title">${escapeHtml(review.headline)}</div>
        <div class="notif-detail">${escapeHtml(review.detail)} Nothing goes into your books until you press a button.</div>
        <div class="notif-meta"><button type="button" class="btn gold sm" onclick="openReviewInbox()">Start reviewing →</button></div>
      </div>
    </div>`;
}

/** One line of history. The amount keeps its own currency — never a total. */
function activityHtml(ev) {
  const toneClass = ev.tone === 'pos' ? ' is-pos' : ev.tone === 'neg' ? ' is-neg' : '';
  const autoChip = ev.auto ? '<span class="activity-auto" title="Done by the app on its own">Automatic</span>' : '';
  const amount = ev.amount
    ? `<span class="activity-amt${toneClass} mono-num">${escapeHtml(ev.amount)}</span>`
    : '';
  const when = ev.timestamp ? webScanRelativeTime(ev.timestamp) : fmtD(ev.date);
  return `<div class="activity-item">
      <span class="activity-dot" aria-hidden="true">${escapeHtml(ev.icon || '')}</span>
      <div class="activity-body">
        <div class="activity-text">${autoChip}${escapeHtml(ev.text || '')}</div>
        <div class="activity-side">${amount}<span class="activity-time mono-num">${escapeHtml(when)}</span></div>
      </div>
    </div>`;
}

/**
 * The count on every nav badge. Urgent only: a badge that counted the whole
 * to-do list would sit permanently at some large number and stop meaning
 * anything, which is the failure mode of every notification badge ever built.
 */
/**
 * Anything newly urgent on the to-do list goes into the notification history
 * too, once, so that list is a complete record of what needed attention —
 * not only of the things some check happened to raise a pop-up for.
 */
// Set once every book's records have arrived. Until then the to-do list is
// judging half-loaded books, and what it finds is not news.
let _attentionReady = false;

function logNewlyUrgentSignals(result) {
  if (!result || isAuthor() || !_attentionReady) return;
  let changed = dropFalseStockNotifications(result.signals.map(sig => sig.id)) > 0;
  // Work that has been dealt with clears its own message away.
  const review = reviewQueueSnapshot().summary;
  if (pruneResolvedNotifications({ signalIds: new Set(result.signals.map(sig => sig.id)), review })) changed = true;
  if (changed) {
    renderNotificationBell();
    renderRailLatestNotifications();
    if ($('m-notifications')?.style.display === 'flex') renderNotificationsPanel();
  }
  const { fresh, remember } = newlyUrgent(result.signals, readSeenUrgent());
  writeSeenUrgent(remember);
  if (!fresh.length) return;
  fresh.slice(0, 5).forEach(sig => logNotification({
    id: `todo:${sig.id}`,
    icon: sig.icon || '⚠',
    title: sig.label,
    detail: sig.detail,
    tone: sig.status === 'blocked' ? 'failed' : 'pending',
    actionLabel: 'Open to-do',
    action: "switchTab('todo')",
  }));
  renderNotificationBell();
  renderRailLatestNotifications();
}

function updateTodoBadge(result) {
  logNewlyUrgentSignals(result);
  const count = result ? result.urgent : 0;
  document.querySelectorAll('.todo-nav-badge').forEach(el => {
    el.textContent = count > 99 ? '99+' : String(count);
    el.hidden = count === 0;
  });
}

// Which slice of "What's been happening" the rail shows: everything, or only
// what the app did on its own this week. Remembered on this device.
const ACTIVITY_FILTER_KEY = 'lm-activity-filter';
let _activityFilter = (() => { try { return localStorage.getItem(ACTIVITY_FILTER_KEY) === 'auto' ? 'auto' : 'all'; } catch (_) { return 'all'; } })();

function setActivityFilter(value) {
  _activityFilter = value === 'auto' ? 'auto' : 'all';
  try { localStorage.setItem(ACTIVITY_FILTER_KEY, _activityFilter); } catch (_) { /* storage blocked */ }
  renderOverviewRail();
}
window.setActivityFilter = setActivityFilter;

/** The landing page's right-hand rail: what needs doing, and what just happened. */
function renderOverviewRail() {
  if (isAuthor()) return;
  const result = visibleAttentionResult();
  updateTodoBadge(result);
  renderReviewInboxButton();
  renderNotificationBell();
  renderRailLatestNotifications();

  const notifHost = $('all-notifications');
  if (notifHost) {
    const urgent = result.signals.filter(isUrgent);
    const shown = urgent.slice(0, RAIL_NOTIFICATION_LIMIT);
    // Receipts and labels the app found are tasks too. They used to sit below
    // this card, so a screen could say "Nothing needs you" directly above a
    // receipt waiting to be filed. Now they are counted here, and led with.
    const review = reviewQueueSnapshot().summary;
    const attentionCount = urgent.length + (review.total ? 1 : 0);
    notifHost.innerHTML = (review.total ? reviewCardHtml(review) : '') + shown.map(notificationHtml).join('');
    if (!review.total && !shown.length) notifHost.innerHTML = `<div class="empty-state rail-empty">
           <div class="e-icon" aria-hidden="true">✓</div>
           <strong>Nothing needs you right now</strong>
           <span>Stock, money owed and your connections all look healthy.</span>
         </div>`;

    const countEl = $('all-notif-count');
    if (countEl) {
      countEl.textContent = String(attentionCount);
      countEl.hidden = attentionCount === 0;
    }
    const moreEl = $('all-notif-more');
    if (moreEl) {
      // Say what kind of "more" it is: more that need you, or only the
      // calmer items. "1 more" under a count of 1 read as a contradiction.
      const rest = result.total - shown.length;
      const urgentLeft = urgent.length - shown.length;
      moreEl.hidden = rest <= 0;
      moreEl.textContent = urgentLeft > 0
        ? `${urgentLeft} more ${urgentLeft === 1 ? 'needs' : 'need'} you · see all ${result.total} in your to-do list →`
        : `${rest} less urgent ${rest === 1 ? 'item' : 'items'} in your to-do list →`;
    }
    // Permanent live region — only its TEXT changes, so screen readers keep it.
    const statusEl = $('all-notif-status');
    if (statusEl) {
      statusEl.textContent = attentionCount
        ? `${attentionCount} ${attentionCount === 1 ? 'thing needs' : 'things need'} your attention.`
        : 'Nothing needs your attention.';
    }
  }

  const activityHost = $('all-activity');
  if (activityHost) {
    const autoOnly = _activityFilter === 'auto';
    document.querySelectorAll('[data-activity-filter]').forEach(btn => {
      const on = btn.dataset.activityFilter === _activityFilter;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    // "Done for you": everything the app did on its own in the last week — the
    // quick weekly glance at what happened without anyone pressing a button.
    const weekAgo = Date.now() - 7 * 86400000;
    const feed = autoOnly
      ? buildActivityFeed(attentionBooks(), states, { limit: 0, businessExpenses: TAX_CENTER.businessExpenses })
        .filter(ev => ev.auto && ev.sortKey >= weekAgo).slice(0, 30)
      : buildActivityFeed(attentionBooks(), states, { limit: RAIL_ACTIVITY_LIMIT, businessExpenses: TAX_CENTER.businessExpenses });
    activityHost.innerHTML = feed.length
      ? feed.map(activityHtml).join('')
      : autoOnly
        ? `<div class="empty-state rail-empty">
             <div class="e-icon" aria-hidden="true">⚡</div>
             <strong>Nothing done automatically this week</strong>
             <span>Orders the app records and parcels it sees delivered will show up here.</span>
           </div>`
        : `<div class="empty-state rail-empty">
           <div class="e-icon" aria-hidden="true">🕘</div>
           <strong>Nothing has happened yet</strong>
           <span>Sales, shipments and expenses will show up here as you record them.</span>
         </div>`;
  }
}

/** Keep the global Review inbox shortcut honest about the work waiting inside. */
function renderReviewInboxButton() {
  const btn = $('review-inbox-header-btn');
  const badge = $('review-inbox-header-badge');
  if (!btn || !badge) return;
  const total = reviewQueueSnapshot().summary.total;
  badge.textContent = total > 99 ? '99+' : String(total);
  badge.hidden = total === 0;
  const label = total
    ? `Review inbox — ${total} item${total === 1 ? '' : 's'} waiting`
    : 'Review inbox — nothing waiting';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  // The phone side menu's copy of the same shortcut.
  const drawerBadge = $('more-sheet-review-badge');
  if (drawerBadge) { drawerBadge.textContent = badge.textContent; drawerBadge.hidden = badge.hidden; }
}

// ── Notification history ───────────────────────────────────────────────────
//
// Every pop-up is also written to a short history (lib/notification-log.js),
// so news the publisher missed — or dismissed — can be read again. The bell in
// the sidebar counts what is unread; the panel lists it all; the rail shows
// the latest few beside the to-do items.

const RAIL_LATEST_LIMIT = 3;

/**
 * What a logged message about receipts or labels should offer now.
 *
 * A message is a record of a moment ago; the work behind it may be finished, or
 * have grown. So its button is rebuilt from what is waiting right now: a
 * finished task says so instead of offering a button that leads nowhere, and an
 * open one always says how many are left and opens the review inbox.
 */
function reviewTaskForNotification(item, review) {
  const open = reviewTaskStillOpen(item.kind, review);
  if (open === null) return null;
  if (!open) return { done: true };
  const isReceipt = item.kind === 'receipt-sweep' || item.kind === 'todo:orders-receipts';
  const n = isReceipt ? review.receipts : review.labels;
  const noun = isReceipt ? 'receipt' : 'label';
  return { done: false, label: `Review ${n} ${noun}${n === 1 ? '' : 's'}`, action: `openReviewInbox({filter:'${noun}'})` };
}

/**
 * What a logged to-do message should offer now: the item's own fix while it is
 * still open (the same button the to-do list shows), a link to its row when it
 * has no fix, or "done" once it is gone — never a generic "Open to-do".
 */
function todoActionForNotification(item, signals) {
  if (!signals || !String(item.kind || '').startsWith('todo:')) return null;
  const sig = signals.get(item.kind.slice(5));
  if (!sig) return { done: true };
  const kindAttr = ` data-notif-kind="${escapeHtml(item.kind)}"`;
  const html = sig.fix ? fixControlHtml(sig.fix, 'notif-action') : openTodoItemButton(sig.id);
  // Both builders open with `<a class=` or `<button type="button" class=`; tag
  // the opening element so the click also marks this message as seen.
  return { done: false, html: html.replace(/^<(a|button)\b/, `<$1${kindAttr}`) };
}

/** The open to-do items by id, for messages that point at one. */
function openSignalsById(result = visibleAttentionResult()) {
  return new Map(result.signals.map(sig => [sig.id, sig]));
}

function notificationLogItemHtml(item, review = { receipts: 0, labels: 0 }, signals = null) {
  const tone = item.tone === 'pending' || item.tone === 'warn' ? 'amber' : item.tone === 'failed' ? 'red' : 'blue';
  const when = webScanRelativeTime(new Date(item.at).toISOString()) || new Date(item.at).toLocaleString();
  let task = reviewTaskForNotification(item, review);
  // The action is written by the app itself (an alert's own handler), never by
  // anything a publisher typed; it closes the panel before it runs.
  let action = item.action && item.actionLabel
    ? `<button type="button" class="notif-action" onclick="reviewNotification('${escapeHtml(item.kind)}');closeM('notifications');${escapeHtml(item.action)}">${escapeHtml(item.actionLabel)} →</button>`
    : '';
  if (task) {
    action = task.done
      ? '<span class="notif-done"><span aria-hidden="true">✓</span> All reviewed. Nothing left to do here.</span>'
      : `<button type="button" class="notif-action" onclick="reviewNotification('${escapeHtml(item.kind)}');closeM('notifications');${escapeHtml(task.action)}">${escapeHtml(task.label)} →</button>`;
  } else {
    const todo = todoActionForNotification(item, signals);
    if (todo) {
      action = todo.done
        ? '<span class="notif-done"><span aria-hidden="true">✓</span> Done. Nothing left to do here.</span>'
        : todo.html;
      if (todo.done) task = { done: true };
    }
  }
  return `<div class="notif-item tone-${task?.done ? 'blue' : tone}${item.read || task?.done ? '' : ' is-unread'}${task?.done ? ' is-done' : ''}">
      <span class="notif-ico" aria-hidden="true">${escapeHtml(item.icon || '🔔')}</span>
      <button type="button" class="notif-clear" data-uid="${escapeHtml(item.uid)}" onclick="dismissNotification(this.dataset.uid)" title="Clear this notification" aria-label="Clear: ${escapeHtml(item.title)}">✕</button>
      <div class="notif-body">
        <div class="notif-source">From ${escapeHtml(notificationSource(item))}</div>
        <div class="notif-title">${item.read ? '' : '<span class="notif-new-dot" aria-label="New"></span>'}${escapeHtml(item.title)}</div>
        ${item.detail ? `<div class="notif-detail">${escapeHtml(item.detail)}</div>` : ''}
        <div class="notif-meta"><span class="notif-when">${escapeHtml(when)}</span>${action}</div>
      </div>
    </div>`;
}

function renderNotificationBell() {
  const unread = unreadNotificationCount();
  // The same count on the installed app's icon, where the device shows one.
  setAppIconBadge(unread);
  document.querySelectorAll('.notif-unread-badge').forEach(el => {
    el.textContent = unread > 99 ? '99+' : String(unread);
    el.hidden = unread === 0;
  });
  const btn = $('notif-header-btn');
  if (btn) {
    const label = unread ? `Notifications — ${unread} new` : 'Notifications';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }
}

function renderRailLatestNotifications() {
  const wrap = $('all-notif-latest-wrap');
  const host = $('all-notif-latest');
  if (!wrap || !host) return;
  const result = visibleAttentionResult();
  const signals = openSignalsById(result);
  // A to-do item already listed under "Needs you now" is not repeated here:
  // the same words twice in one card read as two different problems.
  const shownAbove = new Set(result.signals.filter(isUrgent).slice(0, RAIL_NOTIFICATION_LIMIT).map(sig => `todo:${sig.id}`));
  const latest = readNotificationLog().filter(item => !shownAbove.has(item.kind)).slice(0, RAIL_LATEST_LIMIT);
  wrap.hidden = !latest.length;
  const review = reviewQueueSnapshot().summary;
  host.innerHTML = latest.map(item => notificationLogItemHtml(item, review, signals)).join('');
}

function renderNotificationsPanel() {
  const host = $('notif-log-list');
  if (!host) return;
  const list = readNotificationLog();
  const review = reviewQueueSnapshot().summary;
  if (!list.length) {
    host.innerHTML = `<div class="empty-state rail-empty">
        <div class="e-icon" aria-hidden="true">🔔</div>
        <strong>No notifications yet</strong>
        <span>When the app records an order, follows a parcel, files a receipt or needs you for something, it will be listed here.</span>
      </div>`;
    return;
  }
  const signals = openSignalsById();
  let lastDay = '';
  host.innerHTML = list.map(item => {
    const day = notificationDayLabel(item.at);
    const head = day !== lastDay ? `<div class="notif-log-day">${escapeHtml(day)}</div>` : '';
    lastDay = day;
    return head + notificationLogItemHtml(item, review, signals);
  }).join('');
}

function openNotificationsPanel() {
  renderNotificationsPanel();
  renderDeviceNotifySwitches();
  openM('notifications');
  // Tasks stay unread until the publisher opens their review destination.
  markInformationalNotificationsRead();
  renderNotificationBell();
  renderRailLatestNotifications();
}

function reviewNotification(kind) {
  markNotificationKindRead(kind);
  renderNotificationBell();
  renderRailLatestNotifications();
}

window.reviewNotification = reviewNotification;

/** The ✕ on one message: clear just that one. */
function dismissNotification(uid) {
  if (!removeNotification(uid)) return;
  renderNotificationBell();
  renderRailLatestNotifications();
  renderNotificationsPanel();
}
window.dismissNotification = dismissNotification;

async function clearNotificationHistory() {
  const ok = await confirmDialog('Clear the notification history on this device?\n\nNothing in your books changes — this only empties this list.', { title: 'Clear history', okLabel: 'Clear it' });
  if (!ok) return;
  clearNotificationLog();
  renderNotificationsPanel();
  renderNotificationBell();
  renderRailLatestNotifications();
}

window.openNotificationsPanel = openNotificationsPanel;
/** Resolves once every book's records have arrived (or after a while regardless). */
function whenBooksLoaded(limitMs = 20000) {
  if (_attentionReady) return Promise.resolve(true);
  return new Promise(resolve => {
    const started = Date.now();
    const tick = setInterval(() => {
      if (_attentionReady || Date.now() - started > limitMs) { clearInterval(tick); resolve(_attentionReady); }
    }, 250);
  });
}

/**
 * Go where a pressed phone/desktop notification points: the invoice that was
 * paid, the book an author paid for, the labels that filed themselves, or the
 * screen the news is about. It may have just reopened the app from closed, so
 * it waits for the books to load before looking anything up. With nowhere in
 * particular to go, it shows the list of what was said.
 */
async function openNotificationTarget(target) {
  await whenBooksLoaded();
  if (isAuthor()) return;
  if (!target) { openNotificationsPanel(); return; }
  if (target.to === 'invoice') { openInvoiceFromAlert(target.id); return; }
  if (target.to === 'labels') { openShippingReconciliationFromAlert(null, target.source); return; }
  if (target.to === 'book' && Object.prototype.hasOwnProperty.call(BOOKS, target.book)) switchBook(target.book);
  switchTab(target.tab);
}
setDeviceNotifyOpener(openNotificationTarget);
initDeviceNotify();
window.openReviewInbox = openReviewInbox;
window.clearNotificationHistory = clearNotificationHistory;
window.onNotificationLogged = () => {
  renderNotificationBell();
  renderRailLatestNotifications();
  if ($('m-notifications')?.style.display === 'flex') renderNotificationsPanel();
  // New finds can arrive while the inbox is open; keep its list honest.
  if (reviewInboxIsOpen()) renderReviewInbox();
};

/** One row of the To-do tab. */
function todoRowHtml(sig) {
  const tone = sig.status === 'blocked' ? 'red' : sig.status === 'warn' ? 'amber' : 'gray';
  const action = sig.fix ? fixControlHtml(sig.fix, 'btn sm ghost todo-fix') : '';
  // The signal's id can embed a book id, which is free text a publisher typed
  // into the Add-book form and may contain a quote — exactly why fixAttrs
  // above carries its destination as data rather than a JS-string argument.
  // The same reasoning applies here: escapeHtml() only protects the ATTRIBUTE,
  // so the id travels as a data-attribute for the delegated handler to read,
  // never spliced into an onclick string.
  const extras = signalExtrasHtml(sig, 'btn sm todo-fix');
  return `<div class="todo-row tone-${tone}" data-signal="${escapeHtml(sig.id || '')}">
      <span class="todo-ico" aria-hidden="true">${escapeHtml(sig.icon || '')}</span>
      <div class="todo-copy">
        <div class="todo-label">${escapeHtml(sig.label || '')}</div>
        <div class="todo-detail">${escapeHtml(sig.detail || '')}</div>
        ${extras.items}
      </div>
      <div class="todo-row-actions">
        ${extras.quick}
        ${action}
        <button type="button" class="todo-dismiss" data-dismiss-signal="${escapeHtml(sig.id || '')}" title="Not relevant — dismiss" aria-label="Dismiss: ${escapeHtml(sig.label || 'this item')}">✕</button>
      </div>
    </div>`;
}

/** The To-do tab: every signal, grouped, with the urgent ones first in each group. */
function renderTodoTab() {
  if (isAuthor()) return;
  const host = $('todo-groups');
  if (!host) return;

  const result = visibleAttentionResult();
  updateTodoBadge(result);

  const chip = $('todo-total-chip');
  if (chip) chip.textContent = result.total === 0 ? 'All clear' : `${result.total} to do`;
  const statusEl = $('todo-status');
  if (statusEl) {
    statusEl.textContent = result.total === 0
      ? 'Your to-do list is empty.'
      : `${result.total} ${result.total === 1 ? 'item' : 'items'} on your to-do list, ${result.urgent} needing attention soon.`;
  }

  const hiddenNote = result.hiddenCount
    ? `<p class="todo-hidden">${result.hiddenCount} ${result.hiddenCount === 1 ? 'item is' : 'items are'} dismissed.
         <button type="button" class="btn ghost sm" onclick="restoreDismissedTodoSignals()">Show them again</button></p>`
    : '';

  if (!result.total) {
    host.innerHTML = `<div class="empty-state sys-empty">
        <div class="e-icon" aria-hidden="true">✅</div>
        <strong>You're all caught up</strong>
        <span>Every book has its details filled in, nobody owes you money, and your connections are working. Anything new will appear here on its own.</span>
      </div>${hiddenNote}`;
    return;
  }

  host.innerHTML = SIGNAL_GROUPS.map(group => {
    const items = result.byGroup[group] || [];
    if (!items.length) return '';
    return `<section class="overview-section todo-group">
        <div class="sec-head is-muted is-inline">
          <div class="sec-head-titles">
            <div class="sec-kicker"><span class="sec-kicker-dot"></span><span class="lead-emoji" aria-hidden="true">${escapeHtml(GROUP_ICONS[group] || '')} </span>${escapeHtml(GROUP_LABELS[group] || group)}</div>
          </div>
          <div class="sec-head-badges"><span class="pill gray">${items.length}</span></div>
        </div>
        <div class="todo-list">${items.map(todoRowHtml).join('')}</div>
      </section>`;
  }).join('') + hiddenNote;
}

// ── BOOK CONTEXT BANNERS
export function updateContextBanners() {
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
  // The phone shows this one line instead of the title and sub, which wrap to
  // four lines at phone width and push the screen's own content down.
  const shortEl = document.getElementById('pab-short');
  // It names the book (or how many) so an approval is never mistaken for another book's.
  const where = booksWithPending.length === 1 ? (BOOKS[booksWithPending[0].bookId]?.title || '') : `${booksWithPending.length} books`;
  if (shortEl) shortEl.innerHTML = `<b>${escapeHtml(`${parts.join(' · ')}${artistPaymentCount > 0 && parts.length === 1 ? '' : ' to approve'}`)}</b>${where ? `<span class="pab-where">${escapeHtml(where)}</span>` : ''}`;

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

// ── DASHBOARD (per book) ──
// The per-book dashboard and the author money card on it live in
// features/dashboard.js; its inline handlers are on window from here on.
Object.assign(window, {
  shareArtistSettlement,
  toggleArtistPayoutForm,
  fillArtistPayoutFull,
  previewArtistPayout,
  onArtistPayoutNetChange,
  onArtistPayoutCurrencyChange,
  saveArtistPayout,
  editArtistPayout,
  requestArtistPayout,
  deleteArtistPayout,
  toggleArtistSettlementForm,
  copyArtistSettlement,
  recordArtistSettlement,
  undoRecordedArtistSettlement,
});

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
  // The scan strip counts are per-book and go stale the moment an order is
  // applied, so the queue has to repaint on a state change like every other
  // visible tab. Cheap: this only fires while Website orders is on screen.
  website: () => { renderOrders(); },
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
  if (visibleTabName() === 'today') renderTodaySoFar();
  if (activeBook === 'all') {
    // The To-do tab is reached from the all-books screen, so it sits inside this
    // branch rather than in TAB_RENDERERS below — which never runs while
    // activeBook is 'all'. Without this it would go stale the moment a sale or a
    // restock changed the very thing it is reporting on.
    if (visibleTabName() === 'todo') renderTodoTab();
    else updateAllOverview();
    updateHeader();
    return;
  }
  // Only the visible tab. This used to rebuild all eight panels on every state
  // change, so recording a sale at a market walked the full history and the
  // full consignment ledger to repaint panels nobody was looking at — on the
  // POS tab, which is not in this map at all, every one of those eight was
  // pure waste. switchTab() already renders a tab when you arrive at it, so
  // the hidden ones lose nothing by being left alone.
  const render = TAB_RENDERERS[visibleTabName()];
  if (render) render();
  scheduleTodoBadgeRefresh();
}

// The sidebar To-do badge and notification bell are otherwise only repainted
// from the all-books screen, so a sale inside a book (or a synced change) left
// them stale. One trailing refresh after the burst of renders, off the sale's
// critical path.
let _todoBadgeTimer = null;
function scheduleTodoBadgeRefresh() {
  if (isAuthor() || _todoBadgeTimer) return;
  _todoBadgeTimer = setTimeout(() => {
    _todoBadgeTimer = null;
    try { updateTodoBadge(visibleAttentionResult()); } catch (e) { console.warn('[todo badge] refresh failed', e); }
  }, 400);
}

function renderCurrent() {
  if (activeBook === 'all') { updateAllOverview(); updateHeader(); }
  else renderAll();
  try { updatePublisherActionBanner(); } catch (_) { }
  // A sale the website shipped (or a new one) changes the switcher's count.
  try { refreshAppSwitch(); } catch (_) { /* next render picks it up */ }

  // Firestore DB status indicator update
  const fsBtn = document.getElementById('fs-toggle-btn');
  if (fsBtn && activeBook && activeBook !== 'all') {
    const isFS = window._useFirestoreForBook(activeBook);
    if (isFS) {
      fsBtn.innerHTML = '✓ Using Firestore<br><span style="font-size:var(--text-2xs);font-weight:normal">Click to fallback to old Database</span>';
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
// What follows a change to a book, in one place. Actions announce the change
// once (saveState, the live listener — see core/store.js); they no longer each
// have to remember the sheet sync and the header.
//
// The header counts, the To-do badge, the publisher banner and the app
// switcher's count sit outside every tab, so they repaint on any change to the
// book on screen. The tab itself is left to its own render: repainting it
// under someone typing into one of its forms would wipe what they typed.
let _chromeScheduled = false;
function scheduleChromeRefresh() {
  if (_chromeScheduled) return;
  _chromeScheduled = true;
  const run = () => {
    _chromeScheduled = false;
    try { updateHeader(); } catch (e) { console.warn('[header] refresh failed', e); }
    try { updatePublisherActionBanner(); } catch (_) { /* next render picks it up */ }
    try { refreshAppSwitch(); } catch (_) { /* next render picks it up */ }
    scheduleTodoBadgeRefresh();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 16);
}

function wireBookEvents() {
  onBookEvent('book-changed', ({ bookId }) => {
    // Expenses and artist payments reach the Google Sheet whichever device
    // changed them; the sheet gets the difference.
    scheduleMoneyOutSheetSync(bookId);
    if (activeBook === bookId || activeBook === 'all') scheduleChromeRefresh();
  });
}
wireBookEvents();

let _renderScheduled = false;
export function scheduleRender() {
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

// recordOrder and writeOrderToLedger, the single way a sale enters a book's
// history, live in features/sales-ledger.js.

// Order History pagination — render in pages so books with hundreds of orders
// stay snappy. The window resets when the book or active filter changes.
const HIST_PAGE = 50;
let _histLimit = HIST_PAGE;
let _histPageSig = null;
function showMoreHist() { _histLimit += HIST_PAGE; renderHist(); }
function showAllHist() { _histLimit = Infinity; renderHist(); }

// A voided row's clock keeps ticking even if nothing else changes, so unlike
// every other part of this table nothing forces a repaint when one quietly
// crosses the hide threshold. Kept ticking only while History is the tab on
// screen and only while a voided row is still waiting to age out.
let _histVoidSweepTimer = null;

// ── Order History search ───────────────────────────────────────────────────
// A book at its third print run has hundreds of rows here, paged fifty at a
// time, and no way to reach one of them except "Show all" and the browser's
// find bar. The search narrows which rows are painted; the timeline itself,
// and the running Stock After it stamps on each row, are untouched.
// The pure matching and copy live in src/lib/order-history-search.js.
/** Rows below this and the search costs more attention than it saves. */
const HIST_SEARCH_MIN = 8;
let _histSearch = '';
/** Which book `_histSearch` belongs to, so it can't leak across a book switch. */
let _histSearchBook = null;
let _histSearchTimer = null;

/**
 * Debounced at the same 200ms as the tax ledger's search: History repaints a
 * fifty-row table plus its reconciliation strip, which is more work than is
 * worth doing between two keystrokes.
 */
function histSearchInput(v) {
  _histSearch = v || '';
  _histSearchBook = activeBook;
  clearTimeout(_histSearchTimer);
  _histSearchTimer = setTimeout(() => { renderHist(); }, 200);
}

/**
 * Open one book's History already searched for `query` (an order number), the
 * landing spot for a link from the website to one of its orders.
 */
export function showHistoryOrder(bookId, query) {
  if (!BOOKS[bookId]) return;
  if (activeBook !== bookId) switchBook(bookId);
  clearTimeout(_histSearchTimer);
  _histSearchTimer = null;
  _histSearch = String(query || '');
  _histSearchBook = bookId;
  histChanFilter = null;
  const input = $('hist-search');
  if (input) input.value = _histSearch;
  switchTab('history');
}

/** Clear and hand focus back, so the next search starts where the last ended. */
function clearHistSearch() {
  clearTimeout(_histSearchTimer);
  _histSearchTimer = null;
  _histSearch = '';
  const input = $('hist-search');
  if (input) input.value = '';
  renderHist();
  if (input && typeof input.focus === 'function') input.focus({ preventScroll: true });
}

/**
 * Paint the search bar's variable parts. The input and the status node are
 * permanent markup — only their contents move — so typing never loses the
 * caret and the live region survives each render.
 */
function renderHistSearchBar({ visible, described, query }) {
  const bar = $('hist-search-bar');
  if (!bar) return;
  bar.hidden = !visible;
  if (!visible) return;

  const input = $('hist-search');
  // Only write the field when it disagrees, so a render triggered while the
  // publisher is mid-word can't reset what they have typed.
  if (input && input.value !== query) input.value = query;

  const clear = $('hist-search-clear');
  if (clear) clear.hidden = !described.active;

  const status = $('hist-search-status');
  if (status) {
    status.innerHTML = `<strong class="mono-num">${escapeHtml(described.headline)}</strong> <span class="ledger-filter-detail">${escapeHtml(described.detail)}</span>`;
  }
}

// The table has rows, but not for what was typed. Says what is doing the hiding
// and offers the way back, rather than reading like a book with no history.
function histNoSearchMatchHtml(described) {
  return `<div class="empty-state sys-empty">
      <div class="e-icon" aria-hidden="true">🔍</div>
      <strong>No orders match your search</strong>
      <span>${escapeHtml(described.detail)}</span>
      <div class="sys-empty-actions">
        <button class="btn gold lg" onclick="clearHistSearch()">✕ Clear search</button>
      </div>
    </div>`;
}

Object.assign(window, { histSearchInput, clearHistSearch });

// Read-only Order-History row for a consignment movement (shipment out / return
// back). These live in the ledger, but showing them inline — with the same
// running Stock After as every sale — makes it visible that consigned copies
// left on-hand: they're sitting at the store, not lost.
function renderConsignHistRow(e, after) {
  const store = escapeHtml(e.storeName || 'store');
  const restocked = e.type === 'Return' && e.status === 'restocked';
  let badge, qtyCell, label;
  if (e.type === 'Shipment') {
    badge = `<span class="ch-badge ch-store" style="font-size:var(--text-2xs);"><span class="ch-icon">📦</span> Consignment</span> → ${store}`;
    qtyCell = `-${e.qty}`;            // left your on-hand for the store
    label = 'SENT';
  } else if (restocked) {
    badge = `<span class="ch-badge ch-pos" style="font-size:var(--text-2xs);"><span class="ch-icon">↩</span> Consignment return</span> ← ${store}`;
    qtyCell = `+${e.qty}`;            // came back into on-hand
    label = 'RETURN';
  } else {
    badge = `<span class="chip-status amber" style="font-size:var(--text-2xs);">↩ Return · written off</span> ← ${store}`;
    qtyCell = '0';                    // off the store's books, not back on your shelf
    label = 'RETURN';
  }
  const voided = e.voided ? ' voided' : '';
  const voidPill = e.voided ? '<span class="void-badge">Void</span>' : '';
  const manageBtn = `<button class="edit-btn" onclick="switchTab('consignment')" title="Manage in the Consignment tab" aria-label="Manage in Consignment">→</button>`;
  return `<tr class="hist-row ${voided}"><td class="mono mono-num" style="color:var(--text3);">${label}</td><td>${badge}</td><td class="r mono-num">${e.voided ? '' : qtyCell}</td><td class="r mono-num"><span style="color:var(--text4);font-size:var(--text-xs);/* faint-ok: em-dash placeholder */">—</span></td><td class="r mono-num"><span style="color:var(--text4);font-size:var(--text-xs);/* faint-ok: em-dash placeholder */">—</span></td><td class="r mono-num">${after}</td><td style="font-size:var(--text-sm);color:var(--text3);">${escapeHtml(e.notes) || '—'}</td><td style="font-size:var(--text-sm);color:var(--text3);"><span class="chip-status gray">Consignment</span></td><td style="font-size:var(--text-sm);color:var(--text3);">${fmtD(e.date)} ${voidPill}</td><td>${manageBtn}</td></tr>`;
}

// Order History is a whole tab, not a nested list, so an empty one gets the
// rich treatment from UX_PATTERNS.md § Empty states — icon, conversational
// context and a real way forward — instead of the dead one-liner it used to
// show. Two genuinely different dead ends land here and they need different
// exits: a book with nothing recorded wants a way to record something, while a
// channel filter that matched nothing wants the filter cleared, because the
// orders it is looking for already exist one click away.
function histEmptyStateHtml(chanFilter, totalCount) {
  if (chanFilter !== null && chanFilter !== undefined) {
    const label = escapeHtml(chanLabel(chanFilter));
    const others = Number.isFinite(totalCount) ? totalCount : 0;
    // Naming the number is the whole point: it tells the publisher the book is
    // not empty, only this slice of it is, which is the difference between
    // "nothing sold" and "nothing sold HERE".
    const copy = others > 0
      ? `This book has <strong class="mono-num">${others}</strong> order${others === 1 ? '' : 's'} on record — none of them came through ${label}.`
      : `Nothing has been recorded through ${label} for this book yet.`;
    return `<div class="empty-state sys-empty">
      <div class="e-icon" aria-hidden="true">🔍</div>
      <strong>No ${label} orders for this book</strong>
      <span>${copy}</span>
      <div class="sys-empty-actions">
        <button class="btn gold lg" onclick="clearHistChanFilter()">✕ Show all orders</button>
      </div>
    </div>`;
  }
  // Import is publisher-only everywhere else in the app (#import-btn is hidden
  // for authors), so offering it here would dead-end an author on a control
  // they cannot see.
  const importBtn = window.IS_PUBLISHER
    ? `<button class="btn lg" onclick="document.getElementById('import-file-input').click()">⬆ Import from spreadsheet</button>`
    : '';
  return `<div class="empty-state sys-empty">
    <div class="e-icon" aria-hidden="true">📖</div>
    <strong>No orders recorded for this book yet</strong>
    <span>Every copy that moves lands here — sold in person, ordered from the website, or shipped out to a consignment store — each with the stock count it left behind, so any book can be traced back to the order that moved it.</span>
    <div class="sys-empty-actions">
      <button class="btn gold lg" onclick="switchTab('manual')">✎ Record a sale</button>
      <button class="btn lg" onclick="switchTab('pos')">💳 Open checkout</button>
      ${importBtn}
    </div>
  </div>`;
}

// No currency parameter on purpose: customer-paid shipping is natively CAD
// and must never be FX-converted, so this formats as CAD unconditionally.

// Highlights the active channel filter above the table, with a one-click way
// back to the unfiltered view. Self-contained like renderHistSearchBar above.
function renderHistFilterBar(chanFilter, matchCount) {
  const filterBar = $('hist-filter-bar');
  if (!filterBar) return;
  if (chanFilter !== null) {
    filterBar.style.display = '';
    filterBar.innerHTML = `<div class="hist-filter-chip"><span class="ch-dot" style="background:${channelColor(chanFilter)}"></span>Showing <strong>${escapeHtml(chanLabel(chanFilter))}</strong> orders · ${matchCount} found<button onclick="clearHistChanFilter()" title="Clear filter" aria-label="Clear filter">✕ Clear</button></div>`;
  } else {
    filterBar.style.display = 'none';
    filterBar.innerHTML = '';
  }
}

// Printed / on-hand / distributed KPI strip above the table. Reads off
// `inScope`, not the searched set: the three figures describe the whole print
// run, so a search that matches nothing must not make the book's
// reconciliation strip vanish as though the stock went with it.
function renderHistReconciliationPanel(s, book, chanFilter, inScope, bookCode) {
  const recon = $('hist-recon');
  if (!recon) return;
  // Read off `inScope`, not the searched set: the three figures describe the
  // whole print run, so a search that matches nothing must not make the
  // book's reconciliation strip vanish as though the stock went with it.
  if (chanFilter === null && inScope.length) {
    const bd = inventoryBreakdown(s, book);
    const printedCount = bd.printed || 0;
    const onHandCount = bd.onHand || 0;
    const distributedCount = printedCount - onHandCount;
    const sellThroughPct = printedCount > 0 ? ((distributedCount / printedCount) * 100).toFixed(1) : '0.0';

    const warn = bd.unaccounted
      ? `<div style="font-size:var(--text-xs); font-weight:700; color:var(--red); margin-top:6px;">⚠️ ${Math.abs(bd.unaccounted)} unaccounted copies in reconciliation</div>`
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
          <div class="hist-kpi-icon" aria-hidden="true">🖨️</div>
          <div class="hist-kpi-content">
            <div class="hist-kpi-label">Total Printed</div>
            <div class="hist-kpi-val">${printedCount}</div>
            <div class="hist-kpi-sub">Print Run Edition</div>
          </div>
        </div>
        <div class="hist-kpi-card highlight-gold is-lead">
          <div class="hist-kpi-icon" aria-hidden="true">📚</div>
          <div class="hist-kpi-content">
            <div class="hist-kpi-label">Stock On Hand</div>
            <div class="hist-kpi-val">${onHandCount}</div>
            <div class="hist-kpi-sub"><span class="mono-num">${printedCount > 0 ? ((onHandCount / printedCount) * 100).toFixed(0) : 0}%</span> available</div>
          </div>
        </div>
        <div class="hist-kpi-card highlight-green">
          <div class="hist-kpi-icon" aria-hidden="true">🚚</div>
          <div class="hist-kpi-content">
            <div class="hist-kpi-label">Distributed & Sold</div>
            <div class="hist-kpi-val">${distributedCount}</div>
            <div class="hist-kpi-sub"><span class="mono-num">${sellThroughPct}%</span> sell-through rate</div>
          </div>
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

// Keeps a slow tick running only while a voided row is still waiting to age
// out of view AND History is the tab actually on screen — same trick as the
// sync chip's "last synced N min ago" (renderSyncChip, above). Nothing else
// in the app re-renders History on wall-clock time alone, so without this a
// stale row would only disappear whenever some unrelated action happened to
// repaint the tab next.
function scheduleHistVoidSweep(fullTimeline) {
  clearInterval(_histVoidSweepTimer);
  _histVoidSweepTimer = null;
  const hasPendingVoidSweep = fullTimeline.some(r => {
    const entry = r.type === 'consign' ? r.e : r.h;
    return entry?.voided && entry.voidedAt && !isVoidStale(entry);
  });
  if (!hasPendingVoidSweep) return;
  _histVoidSweepTimer = setInterval(() => {
    if (visibleTabName() !== 'history') {
      clearInterval(_histVoidSweepTimer);
      _histVoidSweepTimer = null;
      return;
    }
    renderHist();
  }, 60_000);
}

// One row of the Order History table: a pending artist submission awaiting
// publisher approval, or a settled sale/void. Split out of renderHist() so
// that function reads as "gather rows, then render them" instead of burying
// this row-by-row branching (pending vs. gratuity vs. foreign-currency vs.
// shipped-website-order) inside the .map() call.
function renderHistRowHtml(row, { cur, bookCode, book, formatChannelBadge }) {
  if (row.type === 'consign') return renderConsignHistRow(row.e, row._after ?? row.after ?? '—');
  const h = row.h, i = row.i;
  if (h.pendingAuth) {
    const actionCell = window.IS_PUBLISHER
      ? `<div class="approval-actions"><button class="appr-btn approve" onclick="approveSubmission('sales', '${h._subKey}')" aria-label="Approve submission"><span class="ico">✓</span>Approve</button><button class="appr-btn reject" onclick="rejectSubmission('sales', '${h._subKey}')" title="Reject submission" aria-label="Reject submission">✕</button></div>`
      : `<span class="chip-status amber">Awaiting Publisher</span>`;
    return `<tr class="hist-row is-awaiting"><td class="mono mono-num">${escapeHtml(h.num)}</td><td>${formatChannelBadge(h.chan)} <span class="chip-status amber">Submitted</span></td><td class="r mono-num">-${h.qty}</td><td class="r mono-num">${fmt(h.price, cur)}</td><td class="r mono-num money-cell">${fmt(h.qty * h.price, cur)}</td><td class="r mono-num">?</td><td style="font-size:var(--text-sm);color:var(--text3);">${escapeHtml(h.notes) || '—'}</td><td style="font-size:var(--text-sm);color:var(--text3);"><span class="chip-status gray">Artist</span></td><td style="font-size:var(--text-sm);color:var(--text3);">${fmtD(h.date)}</td><td>${actionCell}</td></tr>`;
  }
  const voided = h.voided ? ' voided' : '';
  const voidPill = h.voided ? '<span class="void-badge">Void</span>' : '';
  const editBtn = `<button class="edit-btn" onclick="openEditHist(${i})" title="Edit entry" aria-label="Edit entry">✎</button>`;
  const isGrat = h.gratuity || h.chan === 'Gratuity';
  const isPending = h.artistPending;

  const chanCell = isGrat ? `<span class="ch-badge">🎁 Gratuity</span>` : isPending ? `${formatChannelBadge(h.chan)} <span class="chip-status amber">⏳ pending</span>` : formatChannelBadge(h.chan);
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
  const priceCell = isGrat ? '<span style="color:var(--text3);font-size:var(--text-xs);">gifted</span>' : fmt(h.price, rowCur) + foreignPill;
  const totalCell = isGrat ? '—' : isPending ? `<span style="color:var(--amber);">${fmt(h.qty * h.price, rowCur)}</span>` : fmt(h.qty * h.price, rowCur);
  const rowStyle = isGrat ? ' style="font-style:italic;"' : isPending ? ' style="background:var(--amber-bg);"' : '';
  const isWebsite = (h.chan === 'Website' || h.chan === 'Big Cartel') && !isGrat && !h.voided;
  const labelBtn = isWebsite
    ? (h.shipped
      ? `<button class="btn-hist-action shipped" onclick="openLabelModal(${i})" title="Shipped${h.shippedDate ? ' on ' + fmtD(h.shippedDate) : ''}">✓ Shipped</button>`
      : isWebsiteFulfilled(h)
        ? `<button class="btn-hist-action ship" onclick="openLabelModal(${i})" title="Packed on your website. Open this only if you are sending this one from here.">🌐 On website</button>`
        : `<button class="btn-hist-action ship" onclick="openLabelModal(${i})" title="Print shipping label">📦 Ship</button>`)
    : '';

  const paymentInfo = paymentSummary(h.payment, book, h);
  const shippingInfo = isWebsite ? renderOrderShippingSummary(h) : '';
  const notesText = escapeHtml(h.notes) || '—';
  // The publisher can open a website sale's order on the website itself.
  const websiteLink = h.webOrderId && window.IS_PUBLISHER && !isAuthor() ? openOnWebsiteHtml(h.webOrderId) : '';
  const notesCell = [
    notesText,
    paymentInfo ? `<span style="font-size:var(--text-xs);color:var(--text3);">${escapeHtml(paymentInfo)}</span>` : '',
    shippingInfo,
    websiteLink,
  ].filter(Boolean).join('<br>');
  const enteredBy = h.enteredBy || (h.artistPending ? 'Artist' : 'Publisher');
  const enteredByPill = `<span class="chip-status gray">${escapeHtml(enteredBy)}</span>`;
  const stockAfterVal = row._after ?? row.after ?? '—';
  return `<tr class="hist-row ${voided}"${rowStyle}><td class="mono mono-num">${escapeHtml(h.num)}${editBtn}</td><td>${chanCell}</td><td class="r mono-num">${h.voided ? '' : '-'}${h.qty}</td><td class="r mono-num">${priceCell}</td><td class="r mono-num money-cell">${totalCell}</td><td class="r mono-num">${stockAfterVal}</td><td style="font-size:var(--text-sm);color:var(--text3);">${notesCell || '—'}</td><td style="font-size:var(--text-sm);color:var(--text3);">${enteredByPill}</td><td style="font-size:var(--text-sm);color:var(--text3);">${fmtD(h.date)} ${voidPill}</td><td>${labelBtn}</td></tr>`;
}

export function renderHist() {
  const s = getState(), book = getBook(), cur = book.currency;
  const bookCode = bookCurrencyCode(book);
  reconcileConsignmentMirrors(s);

  const pbSales = window.authorSubmissions[activeBook]?.sales || {};
  const pendingSales = Object.keys(pbSales).map(k => {
    const raw = JSON.parse(pbSales[k].data);
    return { ...raw, _subKey: k, pendingAuth: true, after: '?' };
  });

  if (histChanFilter && histChanFilter.bookId !== activeBook) histChanFilter = null;
  const chanFilter = histChanFilter ? histChanFilter.chan : null;

  // A search belongs to the book it was typed on. Carrying it across a book
  // switch would open the next book on a table that looks empty for no visible
  // reason.
  if (_histSearchBook !== activeBook) { _histSearch = ''; _histSearchBook = activeBook; }
  const searchQuery = _histSearch;
  const searchOn = historySearchIsActive(searchQuery);

  const fullTimeline = buildOrderTimeline(s, book);
  // A voided row drops out of the default view once it's stale, so old voids
  // don't pile up here forever — but a search is a deliberate lookup (an order
  // number, or even the word "void" itself), so it still runs over every row,
  // stale or not.
  const timeline = searchOn
    ? fullTimeline
    : fullTimeline.filter(r => !isVoidStale(r.type === 'consign' ? r.e : r.h));

  const rows = chanFilter !== null
    ? timeline.filter(r => r.type === 'hist' && (r.h.chan || '') === chanFilter)
    : timeline;
  let pend = pendingSales.map(h => ({ type: 'pending', h }));
  if (chanFilter !== null) pend = pend.filter(r => (r.h.chan || '') === chanFilter);
  const matchCount = rows.length + pend.length;
  const inScope = [...pend, ...rows];

  // The search runs over rows the channel filter has already narrowed, so the
  // two compose and the status line's count is honest about which slice it is
  // counting. Row descriptors are passed through untouched, so every row keeps
  // the index openEditHist() is keyed on.
  const combined = searchOn ? filterHistoryRows(inScope, searchQuery) : inScope;

  const describedSearch = describeHistorySearch(searchQuery, {
    shown: combined.length,
    total: inScope.length,
    scope: chanFilter !== null ? chanLabel(chanFilter) : '',
  });
  // Below the threshold the table is faster to read than to filter — but a
  // search that is already on always keeps its box, or clearing it would be
  // impossible.
  renderHistSearchBar({
    visible: searchOn || inScope.length >= HIST_SEARCH_MIN,
    described: describedSearch,
    query: searchQuery,
  });

  renderHistFilterBar(chanFilter, matchCount);
  renderImportNotice(s);
  renderHistReconciliationPanel(s, book, chanFilter, inScope, bookCode);

  const formatChannelBadge = (chanName) => {
    if (!chanName) return '<span class="ch-badge">—</span>';
    const c = String(chanName).trim();
    if (c === 'Website' || c === 'Big Cartel') return `<span class="ch-badge ch-bc"><span class="ch-icon">🌐</span> Website</span>`;
    if (IN_PERSON_CHANNELS.includes(c)) return `<span class="ch-badge ch-pos"><span class="ch-icon">💳</span> In Person</span>`;
    if (c === 'Consignment' || c === 'Store') return `<span class="ch-badge ch-store"><span class="ch-icon">🏬</span> Store</span>`;
    if (c === 'Direct') return `<span class="ch-badge ch-direct"><span class="ch-icon">🤝</span> Direct</span>`;
    return `<span class="ch-badge">${escapeHtml(c)}</span>`;
  };

  // The query is part of the signature so a new search opens at the first page
  // rather than inheriting "showing 200 of 200" from the last one.
  const pageSig = `${activeBook}|${chanFilter ?? ''}|${searchQuery}`;
  if (_histPageSig !== pageSig) { _histLimit = HIST_PAGE; _histPageSig = pageSig; }
  const shownRows = combined.slice(0, _histLimit);
  const moreCount = combined.length - shownRows.length;
  const moreRow = moreCount > 0
    ? `<tr class="hist-more-row"><td colspan="10" style="text-align:center;padding:.9rem;"><button class="btn sm" onclick="showMoreHist()">Show ${Math.min(HIST_PAGE, moreCount)} more</button> <button class="btn sm" onclick="showAllHist()">Show all ${combined.length}</button> <span style="color:var(--text3);font-size:var(--text-sm);margin-left:8px;">showing ${shownRows.length} of ${combined.length}</span></td></tr>`
    : '';

  $('hist-body').innerHTML = combined.length
    ? shownRows.map((row) => renderHistRowHtml(row, { cur, bookCode, book, formatChannelBadge })).join('') + moreRow
    : searchOn
      ? `<tr class="hist-empty-row"><td colspan="10">${histNoSearchMatchHtml(describedSearch)}</td></tr>`
      // Counted off the unfiltered timeline, not the stale-void-hidden one — a
      // book whose only orders are old voids still has orders on record, so it
      // must not be told this is a brand-new, never-sold book.
      : `<tr class="hist-empty-row"><td colspan="10">${histEmptyStateHtml(chanFilter, fullTimeline.length + pendingSales.length)}</td></tr>`;

  scheduleHistVoidSweep(fullTimeline);
}

// ── WEBSITE ORDERS — persistent scan memory
const SCAN_MEMORY_KEY = 'lm-scan-memory';
export function getScanMemory() {
  try { return JSON.parse(localStorage.getItem(SCAN_MEMORY_KEY) || '{}'); } catch (e) { return {}; }
}
export function saveScanMemory(mem) {
  localStorage.setItem(SCAN_MEMORY_KEY, JSON.stringify(mem));
}

/* ── WEBSITE ORDERS — the scan status strip ────────────────────────────────
   The three tiles above the queue used to read "Source: Gmail / Channel: Big
   Cartel / Action: Inventory update" — true on every render for every book,
   and therefore worth nothing after the first read. They now carry the only
   three facts this screen is ever asked for: how many orders are waiting to be
   applied, how many are already accounted for, and how stale the last Gmail
   read is. All three are read off the same values renderOrders() already
   computes — nothing new is derived, and no aggregation is touched. */

/**
 * "Never" / "Just now" / "12 min ago" / "3 hours ago" / "6 Aug" for the
 * last-scan tile. `now` is a parameter so the boundaries stay testable.
 */
// toLocaleDateString with options builds a fresh Intl.DateTimeFormat per call
// (~200x slower than reusing one), and this runs once per activity-feed line
// and notification older than a week, so build it once.
const _WEB_SCAN_DAY_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

function webScanRelativeTime(iso, now = Date.now()) {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'Never';
  const mins = Math.floor((now - then) / 60000);
  // A clock that has drifted backwards should read as fresh, not as a negative
  // age — the scan genuinely did just happen.
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return _WEB_SCAN_DAY_FMT.format(new Date(then));
}

/** One tile. `tone` drives the accent: 'ready' = gold, '' = neutral. */
function webScanStatTile(label, value, sub, tone = '') {
  return `<div class="web-stat web-stat-live${tone ? ` is-${tone}` : ''}">
    <span class="web-stat-label">${escapeHtml(label)}</span>
    <strong class="web-stat-value">${escapeHtml(String(value ?? '—'))}</strong>
    <span class="web-stat-sub">${escapeHtml(sub ?? '')}</span>
  </div>`;
}

/**
 * The strip's markup for a given state. Built on `.web-stat` itself so the
 * placeholder tiles occupy the same box as the real ones and the page does not
 * jump when a scan lands.
 */
function webScanStatusHtml({ newCount = 0, appliedCount = 0, lastScan = null, scanning = false, now = Date.now() } = {}) {
  if (scanning) {
    const tile = `<div class="web-stat web-stat-live is-scanning" aria-hidden="true">
      <div class="skeleton-line sk-web-label"></div>
      <div class="skeleton-line sk-web-value"></div>
      <div class="skeleton-line sk-web-sub"></div>
    </div>`;
    // The tiles are decorative while they shimmer; the status is what a screen
    // reader should hear. .sr-only is absolutely positioned, so it claims no
    // grid track of its own.
    return `${tile}${tile}${tile}<span class="sr-only" role="status">Scanning Gmail for new orders…</span>`;
  }

  const n = Number(newCount) || 0;
  const applied = Number(appliedCount) || 0;
  const readyTile = webScanStatTile(
    'Ready to apply',
    n,
    n === 0 ? 'Nothing waiting on you' : `New order${n === 1 ? '' : 's'} not yet in stock`,
    n > 0 ? 'ready' : '',
  );
  const appliedTile = webScanStatTile(
    'Already applied',
    applied,
    applied === 0 ? 'None recorded from this scan' : 'Counted in stock, hidden below',
  );
  const scanTile = webScanStatTile(
    'Last Gmail scan',
    webScanRelativeTime(lastScan, now),
    lastScan ? new Date(lastScan).toLocaleString() : 'Press Scan Gmail to check',
  );
  return `${readyTile}${appliedTile}${scanTile}`;
}

/** Placeholder order cards, built on `.order-card` so the queue keeps its height. */
function webOrdersSkeletonHtml(rows = 3) {
  const card = `<div class="order-card is-skeleton" aria-hidden="true">
    <div class="order-row order-card-top">
      <div class="order-identity">
        <div class="skeleton-line sk-ord-num"></div>
        <div class="skeleton-line sk-ord-meta"></div>
      </div>
      <div class="skeleton-line sk-ord-pill"></div>
    </div>
    <div class="order-row order-card-bottom">
      <div class="skeleton-line sk-ord-summary"></div>
      <div class="skeleton-line sk-ord-actions"></div>
    </div>
  </div>`;
  return `<div class="sr-only" role="status">Scanning Gmail for new orders…</div>`
    + card.repeat(Math.max(1, rows));
}

// True only while fetchOrders() is in flight. renderOrders() bails out on it so
// an unrelated re-render (the show-applied checkbox, a Firestore echo) cannot
// replace the skeletons with a stale queue mid-scan.
let _webScanning = false;

/**
 * Swap the whole Website-orders screen into its scanning state. Clearing the
 * flag only unlocks the screen — the caller then renders the real result, so
 * the skeletons are never on-screen a frame longer than the fetch.
 */
function setWebScanning(on) {
  _webScanning = !!on;
  if (!on) return;
  const strip = $('web-orders-status');
  if (strip) strip.innerHTML = webScanStatusHtml({ scanning: true });
  const list = $('orders-list');
  if (list) list.innerHTML = webOrdersSkeletonHtml(3);
}

// Build a cross-book set of all order IDs already applied across any session.
// Cached until explicitly invalidated — rebuilt at most once per render cycle.
let _appliedIdsCache = null;
export function getAllAppliedIds() {
  if (_appliedIdsCache) return _appliedIdsCache;
  const ids = new Set();
  Object.values(states).forEach(s => {
    (s.doneIds || []).forEach(id => ids.add(id));
    (s.hist || []).forEach(h => { if (h.num) ids.add(h.num); });
  });
  _appliedIdsCache = ids;
  return ids;
}
// Forget the cached set after a sale, a dismissal or a restore changes it.
// Feature modules call this; they can't reassign the cache themselves.
export function invalidateAppliedIds() { _appliedIdsCache = null; }

export function renderOrders() {
  // A scan is mid-flight and the skeletons are on screen. Repainting the real
  // queue now would show the pre-scan state as though it were the result.
  if (_webScanning) return;
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

  // Counts for the status strip. Read off `rel` rather than `visible` so the
  // "Show applied/hidden" checkbox changes what the queue lists without
  // changing what the tiles report — the strip is about this book's scan, not
  // about the current filter.
  let readyCount = 0, appliedCount = 0;
  for (const o of rel) {
    if (isApplied(o)) appliedCount++;
    else if (!isCancelled(o)) readyCount++;
  }
  const strip = $('web-orders-status');
  if (strip) {
    strip.innerHTML = webScanStatusHtml({
      newCount: readyCount,
      appliedCount,
      lastScan: mem.lastScan || null,
    });
  }

  if (!visible.length) {
    const msg = hiddenCount > 0
      ? `<div class="empty-state web-empty success"><div class="e-icon">✅</div><strong>Everything is up to date</strong><span>All ${hiddenCount} found order(s) are already applied or hidden. Scan again to check for newer receipts.</span></div>`
      : `<div class="empty-state web-empty"><div class="e-icon">📬</div><strong>No orders found for this book</strong><span>Make sure Google Sheets is connected, then press Scan Gmail at the top of this screen.</span></div>`;
    list.innerHTML = msg;
    $('apply-all-btn').disabled = true;
    setApplyAllHint(hiddenCount > 0 ? 'Nothing new to apply. Scan Gmail again for newer receipts.' : 'Scan Gmail first to find new orders.');
    return;
  }

  const expanded = new Set([...list.querySelectorAll('.phone-order-details[open]')].map(el => el.dataset.order));
  list.innerHTML = visible.map(o => {
    const done = isApplied(o);
    const cancelled = isCancelled(o);
    const addrParts = [o.shipAddr1, o.shipCity, o.shipProvince, o.shipCountry].filter(Boolean);
    const addrLine = addrParts.length
      ? `<div style="font-size:var(--text-xs);color:var(--text3);margin-top:4px;">📦 ${addrParts.map(escapeHtml).join(', ')}</div>`
      : '';
    const listPrice = BOOKS[o.bookId]?.listPrice || book.listPrice;
    const listCur = BOOKS[o.bookId]?.currency || cur;
    const priceMismatch = !done && !cancelled && o.price && Math.abs(o.price - listPrice) > 0.5;
    const priceWarn = priceMismatch
      ? `<span style="font-size:var(--text-2xs);color:var(--amber);margin-left:6px;">⚠ paid ${listCur}${o.price} (list ${listCur}${listPrice})</span>`
      : '';
    const shippingBadge = renderOrderShippingSummary(o);
    const bookLabel = o.bookId && BOOKS[o.bookId]
      ? `<span style="font-size:var(--text-2xs);background:${BOOKS[o.bookId].accent}22;color:${BOOKS[o.bookId].accent};border-radius:var(--r-pill);padding:2px 8px;margin-right:6px;">${escapeHtml(BOOKS[o.bookId].title)}</span>`
      : '';
    const viewEmailBtn = o.id
      ? `<a href="https://mail.google.com/mail/u/0/#all/${o.id}" target="_blank" class="btn sm" style="font-size:var(--text-2xs);opacity:.7;">📧 View</a>`
      : '';

    let cardClass = 'order-card';
    if (done) cardClass += ' done';
    else if (cancelled) cardClass += ' cancelled';

    const statusPill = done
      ? '<span class="pill gray">Applied</span>'
      : cancelled
        ? '<span class="pill red" style="background:var(--red-bg);color:var(--red);border:var(--stroke-hair) solid var(--red-bg);">Cancelled</span>'
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
          <div class="order-meta">${escapeHtml(o.customer) || '—'} · ${escapeHtml(o.date)}</div>
          <details class="phone-order-details" data-order="${escapeHtml(o.id)}" ${expanded.has(String(o.id)) ? 'open' : ''}>
            <summary>Customer &amp; delivery details</summary>
            <div class="phone-order-contact">${escapeHtml(o.email) || 'No email on this receipt'}${addrLine}</div>
          </details>
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

  const canApply = visible.some(o => !isApplied(o) && !isCancelled(o));
  $('apply-all-btn').disabled = !canApply;
  setApplyAllHint(canApply ? '' : 'Nothing new to apply. Scan Gmail again for newer receipts.');
}

// The reason line under Apply all: shown only while the button is greyed out.
function setApplyAllHint(text) {
  const hint = $('apply-all-hint');
  if (!hint) return;
  hint.textContent = text || '';
  hint.hidden = !text;
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
  if (h.webOrderId) { showToast(WEBSITE_SALE_LOCKED, 'warn', 5000); return; }

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

  syncHistoryVoidDeletion(h, true, book);
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
  const newPrice = Number(o.price) || Number(history.price) || Number(book.listPrice) || 0;
  const newQty = Number(history.qty) || Number(o.qty) || 1;
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
  // Revenue follows the corrected price, worked out from the history as every
  // load does, rather than nudged by the difference.
  recomputeAfters(state, book);
  saveState(targetBook);
  syncToSheets({ type: 'order', book: book.title, date: history.date, num: history.num, chan: 'Website', qty: history.qty, price: history.price, total: history.qty * history.price, stockAfter: history.after, notes: 'Big Cartel', sheetsId: history.sheetsId, currency: getBookCurrencyCode(book) });
  if (history.shippingPaid > 0) syncToSheets(shippingPurchaseRowPayload(book, getBookCurrencyCode(book), history));
  renderOrders();
  updateDash();
  showToast(`✓ ${o.orderNum} updated with receipt totals`, 'ok');
}

// Shared by applyOne() and commitRecoveredWebsiteOrder(): both record the
// order number as seen in scan memory and un-cancel it if it was previously
// marked cancelled. Does not call saveScanMemory() — the caller does that
// once it's finished mutating mem.
function recordOrderNumApplied(mem, orderNum, { touchLastScan = false } = {}) {
  if (!mem.appliedNums) mem.appliedNums = [];
  if (!mem.appliedNums.includes(orderNum)) mem.appliedNums.push(orderNum);
  if (mem.cancelledNums) {
    mem.cancelledNums = mem.cancelledNums.filter(num => num !== orderNum);
  }
  if (touchLastScan) mem.lastScan = new Date().toISOString();
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
  if (!targetState.doneIds) targetState.doneIds = [];
  targetState.doneIds.push(id);
  const extra = {
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
  // The shared sale step moves stock, revenue and the Website totals and
  // writes the row. Deterministic id derived from the Big Cartel order number
  // so the same import on a different device produces the same id (no
  // duplicate rows).
  const entry = addSaleToState(targetState, targetBk, {
    num: o.orderNum, chan: 'Website', qty: o.qty, price, notes: 'Big Cartel',
    date: (o.date && o.date !== '—') ? o.date : today(),
    sheetsId: 'bc-' + String(o.orderNum).replace(/^#/, '').replace(/[^A-Za-z0-9-]/g, ''),
    extra, stamp: false,
  });
  // An older order lands in date order, so its Stock After is its own.
  recomputeAfters(targetState, targetBk);
  // Save scan memory — record this order num as seen
  const mem = getScanMemory();
  recordOrderNumApplied(mem, o.orderNum, { touchLastScan: true });
  saveScanMemory(mem);
  syncToSheets({ type: 'order', book: targetBk.title, date: entry.date, num: o.orderNum, chan: 'Website', qty: o.qty, price, total: o.qty * price, stockAfter: entry.after, notes: entry.notes, sheetsId: entry.sheetsId, currency: getBookCurrencyCode(targetBk) });
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

/**
 * Write a website order that the Gmail scan never captured straight into a
 * book's ledger.
 *
 * This is applyOne()'s ledger half, reached from the shipping reconciliation
 * worklist instead of the orders queue: same stock decrement, same channel
 * stats, same Sheets rows, same scan-memory bookkeeping, so a recovered order
 * is indistinguishable downstream from a scanned one. The entry itself is
 * built by lib/manual-website-order.js — the caller passes it in finished.
 *
 * Returns the stored entry, or throws when the book is unknown.
 */
export function commitRecoveredWebsiteOrder(bookId, form, buildEntry) {
  const targetState = states[bookId];
  const targetBook = BOOKS[bookId];
  if (!targetState || !targetBook) throw new Error('Cannot find that book');

  const qty = Math.max(1, Math.floor(Number(form.qty) || 1));
  const price = Number(form.price) || 0;

  // The builder fills in the shipping details; the shared sale step moves
  // stock, revenue and the Website totals and writes the row, in date order.
  const { num, notes, date, sheetsId, chan: _chan, qty: _qty, price: _price, after: _after, ...extra } =
    buildEntry({ stockAfter: Math.max(0, targetState.stock - qty) });
  const entry = addSaleToState(targetState, targetBook, { num, chan: 'Website', qty, price, notes, date, sheetsId, extra, stamp: false });
  recomputeAfters(targetState, targetBook);

  // Record the number as seen so a later Gmail scan that finally turns up the
  // original confirmation email doesn't offer it as a new order to apply.
  const mem = getScanMemory();
  recordOrderNumApplied(mem, entry.num);
  saveScanMemory(mem);

  syncToSheets({
    type: 'order', book: targetBook.title, date: entry.date, num: entry.num, chan: 'Website',
    qty, price, total: qty * price, stockAfter: entry.after, notes: entry.notes,
    sheetsId: entry.sheetsId, currency: getBookCurrencyCode(targetBook),
  });
  if (entry.shippingPaid > 0) {
    syncToSheets(shippingPurchaseRowPayload(targetBook, getBookCurrencyCode(targetBook), entry));
  }

  addLog('log-web', `✓ ${entry.num} (${targetBook.title}) recovered from postage: -${qty} → ${targetState.stock} remaining`, 'ok');
  if (targetState.stock <= targetBook.threshold) addLog('log-web', `⚠ ${targetBook.title} below threshold!`, 'warn');
  saveState(bookId);
  return entry;
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

// Loosely matches book id/title/author/urlParam tokens inside free-form Gmail
// text - tolerant of accents and punctuation. Unrelated to (and not a
// duplicate of) shipping-reconciliation.js's own, stricter normalizeText()
// used there for exact order/address comparison.
function normalizeGmailScanText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Deliberately falls back to the raw trimmed value (not '') when no
// #XXX-XXX pattern is found - unlike lib/shipping-reconciliation.js's
// normalizeShippingOrderNumber(), which returns '' on a miss. Do not
// consolidate the two: a scanned order needs to keep whatever identifier
// Gmail gave it so it still shows up in the queue, instead of being
// silently dropped by the orderNum filter below.
function normalizeGmailOrderNum(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hit = raw.match(/#?[a-z0-9]+-[a-z0-9-]+/i);
  if (hit) {
    const v = hit[0].toUpperCase();
    return v.startsWith('#') ? v : `#${v}`;
  }
  return raw;
}

function inferBookIdFromGmailText(value) {
  const txt = normalizeGmailScanText(value);
  if (!txt) return null;
  for (const b of BOOK_LIST) {
    const tokens = [b.id, b.title, b.urlParam, b.author, ...(b.title || '').split(/\s+/)]
      .filter(Boolean)
      .map(v => normalizeGmailScanText(v))
      .filter(v => v.length >= 4);
    if (tokens.some(t => t && txt.includes(t))) return b.id;
  }
  return null;
}

// Retries the Apps Script Gmail scan up to maxRetries times, reporting each
// retry via onStatus. Isolated from fetchOrders() so the request/backoff
// mechanics can be reasoned about (and eventually tested) independently of
// order parsing and dashboard state.
async function scanGmailWithRetries(sheetsUrl, daysBack, onStatus, maxRetries = 3) {
  let attempt = 0;
  let lastError;

  while (attempt < maxRetries) {
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
      return { parsed: data };
    } catch (e) {
      lastError = e;
      console.warn(`Scan attempt ${attempt} failed:`, e);
      if (attempt < maxRetries) {
        onStatus(`Retrying… (${attempt}/${maxRetries})`);
        await new Promise(res => setTimeout(res, 1200 * attempt));
      }
    }
  }
  return { lastError };
}

// Maps one raw Gmail-scanned order into the shape the queue/ledger expect:
// resolves which book it belongs to, coerces numeric/date fields, and fills
// in defaults for anything the email parse left out.
function normalizeGmailOrder(o, book) {
  const orderNum = normalizeGmailOrderNum(o.orderNum || o.number || o.order || o.orderNumber);
  const stableId = String(o.id || orderNum).trim();
  // Use the fetched email body to identify the correct book
  const textBlob = [o.body, o.notes, o.itemTitle, o.title].filter(Boolean).join(' ');

  let resolvedBookId = inferBookIdFromGmailText(textBlob) || inferBookIdFromGmailText(o.orderNum);
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
      normalizedDate = localDay(rawDate); // bare dates pass through; timestamps -> local day
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
}

async function fetchOrders() {
  const book = getBook();
  const btn = $('scan-btn');
  const log = 'log-web';

  if (!sheetsUrl) {
    showToast('Connect Google Sheets first to scan Gmail', 'warn');
    return;
  }
  // The empty state carries its own "Scan Gmail" button, so a second scan can
  // be started from the queue while the first is still retrying. One at a time.
  if (_webScanning) return;

  const setStatus = (msg) => { btn.innerHTML = `<span class="spinner"></span>${msg}`; btn.disabled = true; };

  // Read scan memory for smarter queries
  const mem = getScanMemory();
  const lastScanDate = mem.lastScan ? new Date(mem.lastScan) : null;
  const appliedNums = new Set(mem.appliedNums || []);
  const daysBack = parseInt(localStorage.getItem('lm-scan-days') || '30');
  const sinceDate = new Date(Date.now() - daysBack * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // A Gmail scan is three retries deep at worst, so it can run for the better
  // part of a minute. Until now the queue kept showing its pre-scan content for
  // all of it, which reads as "nothing happened".
  setWebScanning(true);
  setStatus('Connecting to Google Apps Script…');
  const { parsed, lastError } = await scanGmailWithRetries(sheetsUrl, daysBack, setStatus);

  if (!parsed) {
    addLog(log, `❌ Apps Script Scan failed: ${lastError?.message || 'Unknown error'}. Check URL or re-authorize Apps Script.`, 'err');
    orders = [];
    setWebScanning(false);
    renderOrders();
    btn.textContent = 'Scan Gmail'; btn.disabled = false;
    return;
  }

  setStatus('Parsing results…');

  // Normalise and enrich
  orders = (parsed.orders || []).map(o => normalizeGmailOrder(o, book)).filter(o => o.orderNum);

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
    // ⚡ Bolt Optimization: Use for...of instead of reduce to avoid function allocation
    const byBook = {};
    for (const o of orders) {
      byBook[o.bookId] = (byBook[o.bookId] || 0) + 1;
    }
    const summary = Object.entries(byBook).map(([id, n]) => `${BOOKS[id]?.title || id} ×${n}`).join(', ');
    addLog(log, `✓ Found ${orders.length} order(s): ${summary}`, 'ok');
    if (already > 0) addLog(log, `↩ ${already} already recorded (skipped)`, 'warn');
    if (fresh.length > 0) addLog(log, `→ ${fresh.length} new order(s) ready`, 'ok');
  }
  if (lastScanDate) addLog(log, `🕐 Previous scan: ${lastScanDate.toLocaleString()}`, 'ok');

  setWebScanning(false);
  renderOrders();
  btn.textContent = 'Scan Gmail'; btn.disabled = false;
}

// Re-scan Gmail and fill in missing shipping fields on already-applied
// orders (across all books). Useful when an earlier email parse failed
// or when the address arrived in a follow-up email.

// ── MANUAL
// Session-level cache so we don't re-fetch the same currency pair twice (Uses global _fxRateCache)

// A rate lookup on a weak connection could hang a screen indefinitely, and a
// boot with no signal sent the same failing request over and over. Each lookup
// now gives up after a few seconds, and a pair that just failed isn't asked for
// again for a minute.
const FX_FETCH_TIMEOUT_MS = 8000;
const FX_FAILURE_PAUSE_MS = 60_000;
const _fxFailedUntil = {};

async function fetchFx(url) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), FX_FETCH_TIMEOUT_MS) : null;
  try {
    return await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchLiveRate(from, to) {
  if (from === to) return { rate: 1 };
  if (from === 'OTHER' || to === 'OTHER' || !from || !to) return { error: 'manual' };

  const key = `${from}_${to}`;
  if (_fxRateCache[key]) return { rate: _fxRateCache[key] };
  if (_fxFailedUntil[key] > Date.now()) return { error: 'recently-failed', context: `${from}->${to}` };

  const result = await fetchLiveRateUncached(from, to, key);
  if (!result.rate) _fxFailedUntil[key] = Date.now() + FX_FAILURE_PAUSE_MS;
  return result;
}

async function fetchLiveRateUncached(from, to, key) {
  // Primary API: open.er-api.com (v6) — very reliable
  try {
    const res = await fetchFx(`https://open.er-api.com/v6/latest/${from}`);
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
    const res = await fetchFx(frankfurterUrl('latest', from, to));
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
// weekends/holidays; a second dated service answers when it can't. Cached per
// pair+date. `retry` is someone pressing Retry: they want another try now,
// not the minute's pause that follows a failure.
export async function fetchHistoricalRate(from, to, date, { retry = false } = {}) {
  if (from === to) return { rate: 1 };
  if (!from || !to || from === 'OTHER' || to === 'OTHER') return { error: 'manual' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return { error: 'bad-date' };
  const key = datedRateKey(from, to, date);
  if (_fxRateCache[key]) {
    return { rate: _fxRateCache[key], date: _fxHistoricalDates[key] || '', source: _fxHistoricalSources[key] || 'Frankfurter' };
  }
  if (!retry && _fxFailedUntil[key] > Date.now()) return { error: 'recently-failed', context: `${from}->${to}@${date}` };
  for (const source of DATED_RATE_SOURCES) {
    try {
      const res = await fetchFx(source.url(from, to, date));
      const found = res.ok ? source.read(await res.json(), from, to) : null;
      if (found) {
        _fxRateCache[key] = found.rate;
        _fxHistoricalDates[key] = found.date;
        _fxHistoricalSources[key] = source.name;
        delete _fxFailedUntil[key];
        saveFxHistory(getLocalStorage(), _fxRateCache);
        return { rate: found.rate, date: found.date, source: source.name };
      }
    } catch (e) { /* ask the next source */ }
  }
  _fxFailedUntil[key] = Date.now() + FX_FAILURE_PAUSE_MS;
  return { error: 'historical-unavailable', context: `${from}->${to}@${date}` };
}

// Published daily rates for a date range, as { 'YYYY-MM-DD': rate }. One
// request covers every sale of a currency, instead of one per sale date.
async function fetchHistoricalRateSeries(from, to, start, end) {
  const res = await fetchFx(frankfurterUrl(`${start}..${end}`, from, to));
  if (!res.ok) throw new Error(`FX series ${res.status}`);
  const json = await res.json();
  const out = {};
  for (const [day, rates] of Object.entries(json?.rates || {})) {
    const rate = Number(rates && rates[to]);
    if (rate > 0) out[day] = rate;
  }
  return out;
}

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

let _saleFxWarming = null;
let _saleFxRetryAt = 0;

/**
 * Fetch the published rate for the date of every foreign-currency sale and
 * payout that doesn't have one yet, so the Tax Centre and cash-flow figures
 * value each at its own date's rate. One date-range request per currency, kept
 * on the device afterwards. Resolves true when anything new arrived.
 */
export function warmSaleFxHistory() {
  if (_saleFxWarming) return _saleFxWarming;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(false);
  if (Date.now() < _saleFxRetryAt) return Promise.resolve(false);
  _saleFxWarming = (async () => {
    const wanted = datesNeedingRates(BOOKS, states, _fxRateCache, {
      currencyOf: getBookCurrencyCode,
      skip: (id, book) => isTestBookId(id) || isTestBook(book),
    });
    let filled = 0;
    for (const [cur, dates] of wanted) {
      try {
        // A week's lead so a sale on a weekend or holiday finds the rate before it.
        const series = await fetchHistoricalRateSeries(cur, 'CAD', addDays(dates[0], -7), dates[dates.length - 1]);
        filled += fillDatedRates(_fxRateCache, cur, 'CAD', series, dates);
      } catch (e) {
        console.warn(`[fx] could not fetch ${cur} rates by date`, e);
        _saleFxRetryAt = Date.now() + 10 * 60_000;
      }
    }
    if (filled) saveFxHistory(getLocalStorage(), _fxRateCache);
    return filled > 0;
  })().finally(() => { _saleFxWarming = null; });
  return _saleFxWarming;
}

/**
 * The rate to convert an expense into `target` (CAD unless the books say
 * otherwise): the rate published for its date, else today's, else 0 when none
 * can be found — never a silent 1:1. A caller getting 0 records the expense with
 * `fxMissing` so the Tax Centre says so and fills it in once online.
 */
export async function resolveExpenseRate(currency, date, target = 'CAD') {
  const cur = String(currency || target).toUpperCase();
  const to = String(target || 'CAD').toUpperCase();
  if (cur === to) return 1;
  try {
    const h = await fetchHistoricalRate(cur, to, date);
    if (h && h.rate) return h.rate;
  } catch (_) { /* try today's */ }
  try {
    const l = await fetchLiveRate(cur, to);
    if (l && l.rate) return l.rate;
  } catch (_) { /* fall through */ }
  return _fxRateCache[`${cur}_${to}`] || 0;
}

// Exchange rates the Tax Centre's figures are waiting on: each foreign sale's
// own date's rate, and a CAD value for expenses logged offline or booked 1:1.
// Both need a connection, so this runs in the background whenever the Tax
// Centre is opened and redraws it once if anything changed. Throttled, so a
// stretch offline doesn't retry on every visit.
let _tcRatesCheckedAt = 0;
function refreshTaxCentreRates() {
  if (isAuthor() || Date.now() - _tcRatesCheckedAt < 5 * 60_000) return;
  _tcRatesCheckedAt = Date.now();
  Promise.all([warmSaleFxHistory(), healExpenseRates()])
    .then(([warmed, healed]) => {
      if (healed) {
        showToast(`✓ Filled in the CAD value of ${healed} foreign-currency expense${healed === 1 ? '' : 's'} at the rate for ${healed === 1 ? 'its' : 'each'} date`, 'ok', 6000);
      }
      if ((warmed || healed) && $('tab-taxcenter')?.classList.contains('active')) renderTaxCenter();
    })
    .catch(e => console.warn('[tax centre] could not refresh exchange rates', e));
}

/**
 * Fill in the CAD value of Tax Centre expenses saved without one (`fxMissing`,
 * logged offline), and correct foreign-currency ones an older build booked at
 * 1:1 because no rate was cached (their CAD value equals the foreign amount).
 * Uses each expense's own date's rate. Business expenses, plus gifted-copy
 * book expenses (which never carry an fxRate); other book expenses are left
 * alone because their `fxRate` can mean "to the book's currency" rather than
 * "to CAD". Returns how many were updated.
 */
export async function healExpenseRates() {
  if (isAuthor()) return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  const needsRate = (e) => {
    const cur = String(e.currency || 'CAD').toUpperCase();
    if (cur === 'CAD' || e.amountUnknown || !(Number(e.amount) > 0)) return false;
    if (e.fxMissing === true || e.baseAmount == null) return true;
    return Number(e.fxRate) === 1 && Math.abs(Number(e.baseAmount) - Number(e.amount)) < 0.005;
  };
  let fixed = 0;
  for (const e of (TAX_CENTER.businessExpenses || [])) {
    if (!needsRate(e)) continue;
    const rate = await resolveExpenseRate(e.currency, e.date || today());
    if (!rate || rate === 1) continue;
    e.fxRate = rate;
    e.baseAmount = roundCents((Number(e.amount) || 0) * rate);
    e.fxMissing = false;
    fixed++;
  }
  if (fixed) await window._fbSaveSettings('taxCenter', TAX_CENTER);
  // Gifted-copy expenses on a foreign-currency book: amount is in the book's
  // currency and no fxRate is stored, so "booked 1:1" shows as a CAD value
  // equal to the amount. Older builds did that whenever no rate was cached.
  const needsGiftRate = (e) => {
    if (!e || e.gratuity !== true || e.voided) return false;
    const cur = String(e.currency || 'CAD').toUpperCase();
    if (cur === 'CAD' || !(Number(e.amount) > 0) || e.fxRate != null) return false;
    if (e.fxMissing === true || e.baseAmount == null) return true;
    return Math.abs(Number(e.baseAmount) - Number(e.amount)) < 0.005;
  };
  for (const [bookId, st] of Object.entries(states || {})) {
    if (isTestBookId(bookId)) continue;
    let bookFixed = 0;
    for (const e of (st && st.expenses) || []) {
      if (!needsGiftRate(e)) continue;
      const rate = await resolveExpenseRate(e.currency, e.date || today());
      if (!rate || rate === 1) continue;
      e.baseAmount = roundCents((Number(e.amount) || 0) * rate);
      e.fxMissing = false;
      bookFixed++;
    }
    if (bookFixed) { fixed += bookFixed; saveState(bookId); }
  }
  return fixed;
}

let _manualFxRate = null;

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
  // Author banner: expenses the publisher still has to pay back. Once the
  // publisher marks one as paid ("Mark received" on their side) it drops off,
  // and the banner disappears when nothing is left to reimburse.
  const banner = $('artist-reimburse-banner');
  if (!banner) return;
  if (!isAuthor()) { banner.style.display = 'none'; return; }
  const owed = [];
  let total = 0;
  for (const e of expensesWithSettlements(s)) {
    if (!e.received && !isGratuityExpense(e)) {
      owed.push(e);
      total += (Number(e.amount) || 0);
    }
  }
  if (!owed.length) { banner.style.display = 'none'; return; }
  // In a Settle up these come off the one net payment instead of being paid
  // to the link on their own.
  const settle = expensesInSettleUp(book, s);
  const inSettle = owed.filter(e => settle.ids.has(String(e.id))).length;
  // Every one of them is a line on the money card, which says the rest.
  if (inSettle === owed.length && book.profitTiers?.length) { banner.style.display = 'none'; return; }
  banner.style.display = '';
  $('arb-amount').textContent = fmt(total, cur);
  $('arb-detail').textContent = `${owed.length} expense${owed.length !== 1 ? 's' : ''} your publisher will pay you back for`;
  const linkNote = s.artistPaymentLink ? 'Your publisher pays this to your saved payment link' : 'Add your payment link below so your publisher can pay you';
  const settleNote = n => settle.publisherPays
    ? `${n === 1 ? 'is' : 'are'} counted in Settle up, where your publisher pays you one net amount`
    : `come${n === 1 ? 's' : ''} off what you send your publisher in Settle up`;
  $('arb-hint').textContent = !inSettle ? linkNote
    : inSettle === owed.length ? `${owed.length === 1 ? 'This' : 'These'} ${settleNote(owed.length)}`
      : `${inSettle} of these ${settleNote(inSettle)} · ${s.artistPaymentLink ? 'the rest go to your saved payment link' : 'add your payment link below for the rest'}`;
  $('arb-items').innerHTML = owed.map(e => `
    <div class="mbi-row">
      <div class="mbi-desc">${escapeHtml(e.desc)} · ${fmtD(e.date)} · <span class="metric-banner-cat">${escapeHtml(e.cat)}</span></div>
      <div class="mbi-amt">${fmt(e.amount, cur)}</div>
    </div>`).join('');
}



// ── SPREADSHEET IMPORT
let _importRows = [];
// The rows as read from the file (date still as written), the file's name, and
// how a date like 03/04 is read — the preview re-reads the dates when the owner
// says their file is day-first.
let _importParsed = [];
let _importFileName = '';
let _importDateOrder = 'mdy';

// The confirm button has nothing to import until a file has been read. The
// hint says what to do instead. The Sheets restore path reuses this pop-up and
// calls this with true, because its own confirm is never empty.
function setImportReady(ready) {
  const btn = $('import-confirm-btn');
  if (btn) btn.disabled = !ready;
  const hint = $('import-empty-hint');
  if (hint) hint.hidden = ready;
}

// A spreadsheet cell as a number. Excel cells usually arrive as numbers
// already; CSV cells are always text, so drop the currency symbols and
// thousands separators a formatted export carries ("$1,250.00") rather than
// letting parseFloat() read that as NaN and import the sale at 0.
function importAmount(value) {
  if (typeof value === 'number') return value;
  return parseFloat(String(value).replace(/[^\d.-]/g, ''));
}

async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = ''; // reset so same file can be re-selected
  // A .csv is plain text we can read ourselves; only Excel files need SheetJS,
  // which is fetched on first use — so a CSV import still works offline.
  const isCsv = /\.csv$/i.test(file.name || '');
  let xlsx = null;
  if (!isCsv) {
    try {
      xlsx = await ensureXlsx();
    } catch {
      showToast('Excel import could not load. Check your connection, or save the file as .csv and try again.', 'err');
      return;
    }
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const book = getBook();
      let rows, sheetName;
      if (isCsv) {
        rows = csvToObjects(e.target.result);
        sheetName = file.name;
      } else {
        const data = new Uint8Array(e.target.result);
        const wb = xlsx.read(data, { type: 'array', cellDates: true });

        const SHORT = { 'Un Fantastico Altrove': 'Altrove', 'The Hound': 'Hound', 'Archaeology of Presence': 'Archaeology', 'Sistema_non_autorizzato': 'Sistema', 'As if Nobody is Watching': 'Nobody', 'Collective Photobook': 'Collective' };
        const shortName = SHORT[book.title] || book.title;
        // Try short name first, then full name, then first sheet
        sheetName = wb.SheetNames.find(n => n === shortName + ' — Orders')
          || wb.SheetNames.find(n => n === book.title + ' — Orders')
          || wb.SheetNames.find(n => n.toLowerCase().includes(shortName.toLowerCase()))
          || wb.SheetNames.find(n => n.toLowerCase().includes(book.title.toLowerCase().slice(0, 6)))
          || wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        rows = xlsx.utils.sheet_to_json(ws, { defval: '' });
      }

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
        const qty = importAmount(row[k('qty')] || row[k('quantity')] || 1) || 1;
        const price = importAmount(row[k('unit')] || row[k('price')] || 0) || 0;
        const notes = row[k('note')] || '';
        return { num: String(num || ''), rawDate: date, chan: String(chan), qty: Math.abs(Math.round(qty)), price, notes: String(notes) };
      };

      const excelSerial = xlsx ? (n) => {
        const d = xlsx.SSF.parse_date_code(n);
        return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null;
      } : null;
      _importParsed = rows.map(colMap).filter(r => r.qty > 0).map(r => ({ ...r, excelSerial }));
      _importFileName = String(file.name || sheetName || '');
      _importDateOrder = 'mdy';
      readImportDates();

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
        // The Sheets restore preview rewrites this button's label (dropping the
        // count inside it); put the import label back before filling it in.
        confirmBtn.innerHTML = 'Import <span id="import-count">0</span> orders';
      }

      _importSource = `${isCsv ? 'file' : 'sheet'} <em>"${escapeHtml(sheetName)}"</em>`;
      renderImportPreview();
      openM('import');
    } catch (err) {
      showToast('Could not read file: ' + err.message, 'err');
    }
  };
  if (isCsv) reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}

let _importSource = '';

// Turns the rows as read into rows to import: each date read (and flagged when
// it needed a guess), then blank order numbers given their stable id.
function readImportDates() {
  const todayStr = today();
  _importRows = _importParsed.map(({ rawDate, excelSerial, ...r }) => {
    const { date, issue } = parseImportDate(rawDate, { order: _importDateOrder, todayStr, excelSerial });
    // The blank-number id below must not depend on the day/month choice, or
    // the same file imported twice with different choices adds its rows twice.
    // Month-first is how these were always read, so older imports still match.
    const idDate = issue === 'ambiguous' ? parseImportDate(rawDate, { order: 'mdy', todayStr, excelSerial }).date : date;
    return { ...r, num: r.num, date, idDate, dateIssue: issue, dateWritten: rawDate instanceof Date ? '' : String(rawDate ?? '').trim() };
  });
  // Blank order numbers get a deterministic id (same row content => same id), so
  // re-importing the same file is caught by the duplicate check. Identical rows within
  // one file are told apart by an occurrence counter.
  const seenBlank = {};
  _importRows.forEach(r => {
    if (r.num) return;
    const key = `${r.idDate}|${r.chan}|${r.qty}|${r.price}|${r.notes}`;
    seenBlank[key] = (seenBlank[key] || 0) + 1;
    r.num = `IMP-${r.idDate}-${r.chan}-${r.qty}-${r.price}-${seenBlank[key]}`.replace(/\s+/g, '');
  });
}

function setImportDateOrder(order) {
  _importDateOrder = order === 'dmy' ? 'dmy' : 'mdy';
  readImportDates();
  renderImportPreview();
}

const IMPORT_DATE_NOTE = {
  ambiguous: 'Could be day-first or month-first. Read as chosen above.',
  unreadable: 'This date couldn’t be read, so it will go in as today. Fix it in the file and import again.',
  missing: 'No date in the file, so it will go in as today.',
  shortYear: 'The year has only two digits, so check the date was read the right way round.',
};

function renderImportPreview() {
  const book = getBook();
  const issues = importDateIssues(_importRows);
  const notes = [];
  if (issues.ambiguous) {
    notes.push(`<label class="import-date-order">${issues.ambiguous} date${issues.ambiguous === 1 ? '' : 's'} like 03/04 could be read two ways. In this file the
      <select data-on-change="import.dateOrder" aria-label="How dates like 03/04 are written in this file">
        <option value="mdy"${_importDateOrder === 'mdy' ? ' selected' : ''}>month comes first (March 4)</option>
        <option value="dmy"${_importDateOrder === 'dmy' ? ' selected' : ''}>day comes first (3 April)</option>
      </select></label>`);
  }
  if (issues.shortYear) notes.push(`<strong>${issues.shortYear} date${issues.shortYear === 1 ? '' : 's'}</strong> ${issues.shortYear === 1 ? 'has' : 'have'} a two-digit year (like 26-10-01). Check ${issues.shortYear === 1 ? 'it was' : 'they were'} read the right way round below.`);
  const asToday = issues.unreadable + issues.missing;
  if (asToday) notes.push(`<strong>${asToday} date${asToday === 1 ? '' : 's'}</strong> couldn’t be read and will go in as today (marked <em>Check date</em> below). Fix ${asToday === 1 ? 'it' : 'them'} in the file and import again if that’s wrong.`);
  $('import-summary').innerHTML = `Found <strong>${_importRows.length} orders</strong> in ${_importSource} — review below then confirm.`
    + (notes.length ? `<div class="stock-alert warn import-date-notes">${notes.map(n => `<p>${n}</p>`).join('')}</div>` : '');
  $('import-count').textContent = _importRows.length;
  setImportReady(_importRows.length > 0);
  $('import-preview-body').innerHTML = _importRows.map(r => `
        <tr>
          <td class="mono">${escapeHtml(r.num)}</td>
          <td style="font-size:var(--text-sm);color:var(--text3);">${fmtD(r.date)}${r.dateIssue && r.dateWritten ? `<div class="import-date-written">written “${escapeHtml(r.dateWritten)}”</div>` : ''}</td>
          <td>${escapeHtml(r.chan)}</td>
          <td class="r">${r.qty}</td>
          <td class="r">${book.currency}${r.price.toFixed(2)}</td>
          <td class="r" style="font-weight:600;">${book.currency}${(r.qty * r.price).toFixed(2)}</td>
          <td style="font-size:var(--text-xs);color:var(--text3);">${escapeHtml(r.notes) || '—'}</td>
          <td>${r.dateIssue
            ? `<span class="pill amber" style="font-size:var(--text-2xs);" title="${escapeHtml(IMPORT_DATE_NOTE[r.dateIssue])}">Check date</span>`
            : '<span class="pill blue" style="font-size:var(--text-2xs);">New</span>'}</td>
        </tr>`).join('');
}

function confirmImport() {
  if (!_importRows.length) return;
  const s = getState(), book = getBook();
  // Every row of this import carries its id, so the whole import can be undone
  // in one step from History (undoImport).
  const importExtra = { importId: newImportId(), importedAt: new Date().toISOString(), importName: _importFileName };
  // A voided row doesn't count: after "Undo this import", the corrected file
  // has to be able to come back in.
  const existingNums = new Set(s.hist.filter(h => !h.voided).map(h => h.num));
  let imported = 0, skipped = 0;
  const added = [];

  // Add in reverse so newest ends up at top after unshift
  [..._importRows].reverse().forEach(r => {
    if (existingNums.has(r.num)) { skipped++; return; } // skip duplicates
    existingNums.add(r.num); // also catches repeats inside the same file
    // The shared sale step gives each row an id of its own, so the sheet row
    // can be updated or removed later. These used to arrive with none and were
    // never sent: they only reached the sheet through Sync all data, which
    // appended them again on every press.
    added.push(addSaleToState(s, book, { num: r.num, chan: r.chan, qty: r.qty, price: r.price, notes: r.notes, date: r.date, stamp: false, extra: importExtra }));
    imported++;
  });

  recomputeAfters(s, book);
  saveState(activeBook);
  if (added.length) {
    const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
    syncBatchToSheets(added.map(h => orderRowPayload(book, nativeCur, h)), `${book.title} · imported orders`);
  }
  renderHist();
  updateDash();
  closeM('import');
  _importRows = [];
  setImportReady(false);
  const msg = skipped > 0
    ? `✓ Imported ${imported} orders (${skipped} duplicates skipped)`
    : `✓ Imported ${imported} orders`;
  showToast(imported ? `${msg}. You can undo the whole import from the top of History.` : msg, 'ok', 5000);
}

// Undo a whole spreadsheet import: every row it added is voided, the same way
// voiding one sale is (stock and revenue reversed, the Google Sheet row
// removed), so it can still be brought back row by row. Rows already paid out
// in an author settlement are left alone and counted.
function undoImport(importId) {
  const s = getState(), book = getBook();
  const rows = (s.hist || []).filter(h => h.importId === importId && !h.voided);
  if (!rows.length) return;
  // As voiding one sale by hand: a sale paid out in an author settlement, or
  // matched to a website order, stays.
  const isLocked = h => h.artistSettlementId || h.webOrderId;
  const locked = rows.filter(isLocked);
  const undoable = rows.filter(h => !isLocked(h));
  if (!undoable.length) { showToast('Every row of this import is in an author settlement or matched to a website order, so it stays.', 'warn', 5000); return; }
  const name = rows[0].importName ? ` from “${rows[0].importName}”` : '';
  if (!confirm(`Undo this import${name}? ${undoable.length} order${undoable.length === 1 ? '' : 's'} will be voided, and their stock and revenue reversed.`)) return;
  undoable.forEach(h => {
    voidHistEntry(s, book, h, { recompute: false });
    h.voidedReason = 'Import undone';
  });
  recomputeAfters(s, book);
  saveState(activeBook);
  renderHist();
  updateDash();
  showToast(`Import undone: ${undoable.length} order${undoable.length === 1 ? '' : 's'} voided${locked.length ? `. ${locked.length} in an author settlement or matched to a website order ${locked.length === 1 ? 'was' : 'were'} kept` : ''}.`, locked.length ? 'warn' : 'ok', 5000);
}

// Hidden for this visit only; comes back the next time the app opens.
let _importNoticeClosed = '';
function closeImportNotice(importId) { _importNoticeClosed = importId; renderHist(); }
registerActions({
  'import.dateOrder': (el) => setImportDateOrder(el.value),
  'import.undo': (el) => undoImport(el.dataset.import),
  'import.closeNotice': (el) => closeImportNotice(el.dataset.import),
});

const IMPORT_NOTICE_DAYS = 14;
function renderImportNotice(s) {
  const host = $('hist-import-notice');
  if (!host) return;
  const last = isAuthor() ? null : latestImport(s.hist);
  const fresh = last && last.at && (Date.now() - Date.parse(last.at)) < IMPORT_NOTICE_DAYS * 864e5;
  if (!fresh || _importNoticeClosed === last.id) { host.hidden = true; host.innerHTML = ''; return; }
  host.hidden = false;
  host.innerHTML = `<div class="stock-alert ok hist-import-notice">
      <span>Imported ${last.count} order${last.count === 1 ? '' : 's'}${last.name ? ` from “${escapeHtml(last.name)}”` : ''} on ${fmtD(last.at.slice(0, 10))}.</span>
      <button type="button" class="btn sm" data-action="import.undo" data-import="${escapeHtml(last.id)}">Undo this import</button>
      <button class="card-x" type="button" data-action="import.closeNotice" data-import="${escapeHtml(last.id)}" aria-label="Close this notice" title="Close until you next open the app">✕</button>
    </div>`;
}

function updateManualForm() {
  const book = getBook();
  if (!book) return;
  // Pre-fill price with the book's actual list price
  const priceEl = $('m-price');
  if (priceEl && priceEl.dataset.phoneBook !== activeBook) {
    priceEl.value = book.listPrice.toFixed(2);
    priceEl.dataset.phoneBook = activeBook;
  }
  // Update book context bar
  const ctxTitle = $('bc-title-man');
  if (ctxTitle) ctxTitle.textContent = book.title;

  const gExpWrap = $('g-expense-wrap');
  if (gExpWrap) gExpWrap.style.display = isAuthor() ? 'none' : 'flex';

  phint();
  if (typeof window.updateGratuitySourceHint === 'function') window.updateGratuitySourceHint();
}

// Keeps the live order-preview strip under the Manual entry form in step with
// what's typed: the order's total, what it leaves on hand, and a status pill
// when that lands low or short. The total no longer needs restating in the
// hint line — it has its own labelled figure — so the hint carries only the
// things worth reading: a discount, and the stock consequence.
function phint() {
  const book = getBook(), h = $('m-hint');
  if (!book || !h) return;
  const p = parseFloat($('m-price').value) || 0, q = parseInt($('m-qty').value) || 1;
  let t = p * q;
  const notes = [];

  if (_manualFxRate) {
    calcFx(); // Update the inline converted value
    t = (p * _manualFxRate) * q;
  } else if (p > 0 && p < book.listPrice) {
    notes.push(`Discounted from ${book.currency}${book.listPrice}`);
  }

  const totalEl = $('m-prev-total');
  if (totalEl) totalEl.textContent = t > 0 ? fmt(t, book.currency) : '—';

  // Stock impact. Read-only: the ledger still owns stock, this only reports
  // what the order in the form would do to it.
  const s = getState();
  const preview = orderStockPreview(s ? s.stock : 0, q, book.threshold);
  const copy = orderStockPreviewCopy(preview, book.threshold);
  const beforeEl = $('m-prev-before'), afterEl = $('m-prev-after'), pillEl = $('m-prev-pill');
  if (beforeEl) beforeEl.textContent = preview.before;
  if (afterEl) afterEl.textContent = preview.displayAfter;
  if (pillEl) {
    pillEl.className = `pill ${copy.pill}`;
    pillEl.textContent = preview.level === 'idle' ? '—' : `${copy.glyph} ${preview.label}`.trim();
  }
  if (copy.note) notes.push(copy.note);

  // Amber only for the discount case — the strip itself tints for the stock
  // states, so doubling that up on the hint just adds noise.
  h.className = 'hint-text' + (notes.length && !copy.note ? ' amber' : '');
  h.textContent = notes.join(' · ');
}
// Resolves the price/fx-note/payment-meta for a manual sale in one place.
// Returns null when the price is in a foreign currency but no exchange rate
// has been entered yet — the caller treats that as a validation failure.
function resolveManualSalePricing(book, qty, rawPrice, cur) {
  const native = getBookCurrencyCode(book);
  const isForeignCurrency = cur !== 'BOOK' && cur !== native;
  if (!isForeignCurrency) {
    return { price: rawPrice, fxNote: '', payment: buildPaymentMeta({ book, qty, unitPrice: rawPrice }) };
  }
  if (!_manualFxRate) return null;
  const price = rawPrice * _manualFxRate;
  const fxNote = `Paid ${cur} ${rawPrice.toFixed(2)} @ ${_manualFxRate.toFixed(4)}`;
  const payment = buildPaymentMeta({ book, qty, unitPrice: price, fxEnabled: true, fxCur: cur, fxAmt: rawPrice, fxRate: _manualFxRate });
  return { price, fxNote, payment };
}

// Author queue route for submitManual(): submits the sale for publisher
// approval instead of recording it directly.
async function submitManualAuthorRoute(entryPayload, directToArtist, book, num, qty, price, paymentType) {
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
}

// Publisher direct route for submitManual(): records the sale straight into
// the ledger (or the artist-transfer queue) instead of going through approval.
function submitManualPublisherRoute(directToArtist, num, chan, qty, price, book, fullNotes, fxNote, payment) {
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

async function submitManual(ev) {
  return withButtonLoading(ev, 'Saving…', async () => {
    const book = getBook(), qty = parseInt($('m-qty').value) || 1;
    const typedPrice = parseFloat($('m-price').value);
    const rawPrice = Number.isFinite(typedPrice) ? typedPrice : book.listPrice;
    if (qty < 1 || rawPrice < 0) {
      showToast('⚠ Quantity must be at least 1 and price cannot be negative', 'warn');
      return;
    }
    const num = $('m-num').value.trim() || 'MAN-' + Date.now(), chan = $('m-chan').value, notes = $('m-notes').value.trim();
    const paymentType = $('m-payment-type').value;
    if (!paymentType) {
      // The error goes under the field, where a phone shows tap buttons in place
      // of the (hidden) dropdown — reddening the dropdown alone showed nothing there.
      const select = $('m-payment-type');
      fieldError('m-payment-type', 'Pick who got the money');
      const target = select.offsetParent ? select : select.nextElementSibling?.querySelector?.('.phone-seg-opt');
      (target || select).focus();
      showToast('⚠ Please select a payment type', 'warn');
      return;
    }

    const cur = $('m-price-cur').value;
    const pricing = resolveManualSalePricing(book, qty, rawPrice, cur);
    if (!pricing) {
      showToast('⚠ Enter an exchange rate to convert this currency', 'warn');
      if ($('m-manual-rate')) $('m-manual-rate').focus();
      return;
    }
    const { price, fxNote, payment } = pricing;

    const fullNotes = [notes, fxNote, paymentType].filter(Boolean).join(' · ');

    // Create standard entry payload. `directToArtist` is the structured flag used
    // for detection (isDirectToArtistSale); paymentType is kept for display/back-compat.
    const directToArtist = paymentType === PAYMENT_TYPE_DIRECT_TO_ARTIST;
    const entryPayload = { num, chan, qty, price, notes: fullNotes, payment, paymentType, directToArtist, date: today(), id: Date.now() };

    if (isAuthor()) {
      await submitManualAuthorRoute(entryPayload, directToArtist, book, num, qty, price, paymentType);
    } else {
      submitManualPublisherRoute(directToArtist, num, chan, qty, price, book, fullNotes, fxNote, payment);
    }

    $('m-num').value = ''; $('m-qty').value = '1';
    $('m-price').value = book.listPrice.toFixed(2);
    $('m-notes').value = ''; $('m-payment-type').value = ''; $('m-hint').textContent = ''; syncPhoneSegs();
    $('m-price-cur').value = 'BOOK';
    onManualCurrencyChange(); // reset fx logic
  });
}

// Guard against double-taps: a second click on Approve/Reject while the first
// is still awaiting the Firestore delete would record the same sale/expense
// twice (inventory off, revenue double-counted). Keys are `${type}:${subKey}`.
const _submissionsInFlight = new Set();
// Submissions already written to the ledger whose queue entry could not be removed;
// refuse to approve them a second time this session.
const _approvedSubmissionKeys = new Set();

// The ledger row an approved submission became carries its queue key, so
// "already approved" survives a reload even when clearing the queue entry failed.
const submissionRef = (type, subKey) => `${type}:${subKey}`;
export function isSubmissionApproved(s, type, subKey) {
  const ref = submissionRef(type, subKey);
  const rows = type === 'expenses' ? (s.expenses || []) : (s.hist || []);
  return rows.some(r => r && r.fromSubmission === ref) || (type === 'expenses' && receiptAdditionApplied(rows, ref));
}

window.approveSubmission = async function (type, subKey) {
  const queue = window.authorSubmissions[activeBook]?.[type] || {};
  if (!queue[subKey]) return;
  const flightKey = `${activeBook}:${type}:${subKey}`;
  if (_submissionsInFlight.has(flightKey)) return;
  // Normally the ledger row itself proves a prior approval (handled below, which also
  // retries clearing the queue entry); this is only the fallback for a row we can't see.
  if (_approvedSubmissionKeys.has(flightKey) && !isSubmissionApproved(getState(), type, subKey)) { showToast('⚠ Already added to the ledger - it just could not be cleared from the queue. Reload and reject it.', 'warn'); return; }
  _submissionsInFlight.add(flightKey);
  try {
    const raw = JSON.parse(queue[subKey].data);
    const s = getState();

    if (isSubmissionApproved(s, type, subKey)) {
      // Recorded on an earlier approval whose queue entry could not be removed.
      // Never record it again; just try to clear the leftover entry.
      _approvedSubmissionKeys.add(flightKey);
      const cleared = await window._fbDeleteSubmission(activeBook, type, subKey) !== false;
      showToast(cleared
        ? '\u2713 Already in the ledger - removed the leftover from the pending list'
        : '\u26a0 Already in the ledger, but it could not be cleared from the pending list. Do not approve it again.', cleared ? 'ok' : 'warn');
      updateDash();
      return;
    }

    if (type === 'expenses' && isReceiptAddition(raw)) {
      // An artist's forgotten receipt: it joins the expense it names rather
      // than becoming an expense of its own.
      const done = applyReceiptAddition(s.expenses, raw, submissionRef(type, subKey));
      if (!done.ok) {
        showToast(done.reason === 'missing'
          ? '⚠ The expense these receipts belong to is no longer in the ledger. Reject the request instead.'
          : '⚠ This request has no receipts in it. Reject it instead.', 'warn', 6000);
        return;
      }
      saveState(activeBook);
      if (await window._fbDeleteSubmission(activeBook, type, subKey) === false) {
        _approvedSubmissionKeys.add(flightKey);
        showToast('⚠ Receipts added, but the request could not be cleared from the pending list. Do not approve it again.', 'warn');
      } else showToast(`✓ ${done.added} receipt${done.added === 1 ? '' : 's'} added to "${done.expense.desc}"`);
      updateDash();
      renderExpenses();
    } else if (type === 'expenses') {
      if (!s.expenses) s.expenses = [];

      raw.fromSubmission = submissionRef(type, subKey);
      s.expenses.unshift(raw);
      saveState(activeBook);
      if (await window._fbDeleteSubmission(activeBook, type, subKey) === false) {
        _approvedSubmissionKeys.add(flightKey);
        showToast('⚠ Expense added, but it could not be cleared from the pending list. Do not approve it again.', 'warn');
      } else showToast('✓ Expense approved and added to ledger');
      updateDash();
      switchTab('dashboard');
      setTimeout(() => {
        const expBanner = $('d-expenses-sect');
        if (expBanner) expBanner.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else if (type === 'sales') {
      let pendingTransfer = false;
      if (isDirectToArtistSale(raw)) {
        recordOrderPendingTransfer(raw.num, raw.chan, raw.qty, raw.price, raw.notes, raw.payment, raw.date, submissionRef(type, subKey));
        pendingTransfer = true;
        const newest = getState().artistTransfers.at(-1);
        if (newest) {
          const bookId = activeBook;
          mintArtistTransferPayLink(bookId, newest.id, { quiet: true }).then(() => mintArtistTransferBundleLink(bookId));
        }
      } else {
        recordOrder(raw.num, raw.chan, raw.qty, raw.price, raw.notes, raw.payment, { date: raw.date, enteredBy: 'Artist', extra: { fromSubmission: submissionRef(type, subKey) } });
      }
      if (await window._fbDeleteSubmission(activeBook, type, subKey) === false) {
        _approvedSubmissionKeys.add(flightKey);
        showToast('⚠ Sale added, but it could not be cleared from the pending list. Do not approve it again.', 'warn');
      } else showToast('✓ Sale approved and added to ledger');
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

// recordOrderPendingTransfer (a direct-to-artist sale) lives in features/sales-ledger.js.

// Version 2 links send the author back to the app after paying (see
// createStripePaymentLinkForAmount). Older links can't confirm a payment, so
// they're treated as missing and re-made.
const TRANSFER_LINK_VERSION = 2;
function transferPaidReturnUrl(ids) {
  return `${location.origin}${location.pathname}?transfer_paid=${encodeURIComponent(ids.join('.'))}`;
}

// Publisher-side only: make a Stripe link for exactly what the author owes on
// one transfer and keep its URL on the record, so the author's "Send" button
// opens Stripe with the amount already filled in. The Stripe key never leaves
// the publisher's device — authors only ever see the finished link.
async function mintArtistTransferPayLink(bookId, transferId, { quiet = false } = {}) {
  if (!isPublisherSession() || !getReconStripeKey()) return null;
  const book = BOOKS[bookId];
  const s = states[bookId];
  const t = s && (s.artistTransfers || []).find(x => x.id === transferId);
  if (!book || !t) return null;
  const amt = transferAmount(t);
  if (!(amt > 0)) return null;
  if (t.payUrl && Number(t.payAmount) === amt && t.payLinkV === TRANSFER_LINK_VERSION) return t.payUrl;
  try {
    const url = await createStripePaymentLinkForAmount({
      amountMajor: amt,
      currencyCode: bookCurrencyCode(book),
      description: `${book.title} — author transfer for sale ${t.num || ''}`.trim(),
      metadata: { kind: 'artist_transfer', transfer_id: t.id, transfer_book: bookId, transfer_num: t.num || '' },
      afterPaidUrl: transferPaidReturnUrl([t.id]),
    });
    t.payUrl = url;
    t.payAmount = amt;
    t.payLinkV = TRANSFER_LINK_VERSION;
    saveState(bookId);
    if (bookId === activeBook) renderArtistTransfers();
    if (!quiet) showToast(`✓ Stripe link ready — the author's Send button now fills in ${fmt(amt, book.currency)}`);
    return url;
  } catch (e) {
    if (!quiet) showToast(`Couldn't make the Stripe link: ${e.message}`, 'err', 5000);
    return null;
  }
}
window.mintArtistTransferPayLink = async (transferId) => {
  await mintArtistTransferPayLink(activeBook, transferId);
  mintArtistTransferBundleLink(activeBook);
};

// Approved transfers the author can pay right now.
function payableTransfers(s) {
  return (s?.artistTransfers || []).filter(t => transferAmount(t) > 0);
}

// The "Pay all" link, if it still covers exactly what's due now.
function transferBundleFor(s) {
  const b = s?.transferBundle;
  const due = payableTransfers(s);
  if (!b || !b.url || due.length < 2) return null;
  const ids = due.map(t => String(t.id)).sort().join(',');
  const amt = roundCents(due.reduce((a, t) => a + transferAmount(t), 0));
  return b.key === ids && Number(b.amount) === amt && b.v === TRANSFER_LINK_VERSION ? { url: b.url, amount: amt, count: due.length } : null;
}

// Publisher-side: one Stripe link for everything an author owes right now, so
// they can pay several sales in one go. Re-made whenever the set changes.
async function mintArtistTransferBundleLink(bookId) {
  if (!isPublisherSession() || !getReconStripeKey()) return null;
  const s = states[bookId], book = BOOKS[bookId];
  if (!s || !book) return null;
  const due = payableTransfers(s);
  if (due.length < 2) return null;
  if (transferBundleFor(s)) return s.transferBundle.url;
  const key = due.map(t => String(t.id)).sort().join(',');
  if (key.length > 480) return null; // Stripe metadata values cap at 500 characters
  const amount = roundCents(due.reduce((a, t) => a + transferAmount(t), 0));
  try {
    const url = await createStripePaymentLinkForAmount({
      amountMajor: amount,
      currencyCode: bookCurrencyCode(book),
      description: `${book.title} — author transfer for ${due.length} sales`,
      metadata: { kind: 'artist_transfer', transfer_ids: key, transfer_book: bookId },
      afterPaidUrl: transferPaidReturnUrl(due.map(t => t.id)),
    });
    s.transferBundle = { key, ids: due.map(t => t.id), amount, url, v: TRANSFER_LINK_VERSION };
    saveState(bookId);
    if (bookId === activeBook) renderArtistTransfers();
    return url;
  } catch (e) {
    console.warn('Pay-all link failed', e);
    return null;
  }
}

// ── One payment for both sides ───────────────────────────────────────────────
// When the author holds sales money AND is owed earnings, they don't send the
// full sale amounts: they keep their share, the earnings owed come off, and
// one net figure changes hands — the same figure as the publisher's Settle up
// panel. This is that figure, and whether it is the author's to pay.
function authorSettlementDue(bookId) {
  const book = BOOKS[bookId], s = states[bookId];
  const plan = book && s ? planArtistSettlement(book, s) : null;
  if (!plan || !needsSettleUp(plan.balance)) return null;
  return { plan, balance: plan.balance, payable: plan.hasWork && plan.balance.direction === 'to-publisher' && plan.balance.amount > 0 };
}
const settlementPaidKey = amount => `settle-${Math.round(roundCents(amount) * 100)}`;

// The settlement's Stripe link, if it still asks for exactly what is due now.
export function settlementLinkFor(s, due) {
  const l = s?.settlementLink;
  return due?.payable && l && l.url && Number(l.amount) === due.balance.amount && l.v === TRANSFER_LINK_VERSION ? l : null;
}

// What the author's money card offers for a net payment that is theirs to
// make: the exact-amount link, and whether they have just paid it.
export function settlementPayState(s, due) {
  return { link: settlementLinkFor(s, due), paid: !!due?.payable && unrecordedSettlementPayment(s) };
}

// Publisher-side: one Stripe link for the net settlement. Re-made whenever the
// amount changes. Paying it records the settlement automatically (see
// settleArtistSettlementFromStripe), but only if the amount still matches.
async function mintArtistSettlementLink(bookId) {
  if (!isPublisherSession() || !getReconStripeKey()) return null;
  const s = states[bookId], book = BOOKS[bookId];
  const due = authorSettlementDue(bookId);
  if (!s || !book || !due?.payable) return null;
  const existing = settlementLinkFor(s, due);
  if (existing) return existing.url;
  const amount = due.balance.amount;
  const key = settlementPaidKey(amount);
  try {
    const url = await createStripePaymentLinkForAmount({
      amountMajor: amount,
      currencyCode: bookCurrencyCode(book),
      description: `${book.title} — author settlement (both sides offset)`,
      // The expenses this amount paid back, so a payment that arrives after
      // another one was logged doesn't count that one as paid too.
      metadata: { kind: 'artist_transfer', settlement: '1', settlement_amount: String(amount), settlement_expenses: pricedExpensesTag(due.plan), transfer_book: bookId },
      afterPaidUrl: transferPaidReturnUrl([key]),
    });
    s.settlementLink = { url, amount, key, v: TRANSFER_LINK_VERSION };
    saveState(bookId);
    if (bookId === activeBook) { renderArtistTransfers(); renderProfitSharingBreakdown(bookId); }
    return url;
  } catch (e) {
    console.warn('Settlement link failed', e);
    return null;
  }
}

// An author paid the settlement link. Records the same settlement the Settle up
// panel would — only when the money is exactly what is due now, in the book's
// currency. If the balances moved after the link was made (a new sale, a
// payout), nothing is guessed: the publisher is asked to record it by hand.
function settleArtistSettlementFromStripe(payment, bookId) {
  const s = states[bookId], book = BOOKS[bookId];
  if (!s || !book) return null;
  // Already recorded from this charge on this or another device.
  if ((s.artistPayouts || []).some(p => p.settlement && p.chargeId === payment.id)) return null;
  const bookCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  if (String(payment.currency || '').toUpperCase() !== bookCur) return { bookId, settled: 0, problem: 'currency' };
  const paid = roundCents(Number(payment.amount) || 0);
  const asked = roundCents(Number(payment.metadata?.settlement_amount) || 0);
  if (asked > 0 && paid + 0.005 < asked) return { bookId, settled: 0, problem: 'short' };
  // Exactly what is due now records as-is. What an older link asked, after new
  // sales raised the earnings owed, still clears the author's side in full and
  // offsets fewer earnings — the rest stays owed to them (see
  // planSettlementForPayment). Anything else is left for a person.
  const due = authorSettlementDue(bookId);
  const plan = due ? planSettlementForPayment(due.plan, paid, { pricedExpenseIds: pricedExpensesFromTag(payment.metadata?.settlement_expenses) }) : null;
  if (!plan) return { bookId, settled: 0, problem: 'changed' };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(payment.date || '') ? payment.date : today();
  const outcome = applyArtistSettlement(book, s, plan, { date, method: 'Stripe', notes: `Paid by the author through Stripe (${payment.id})` });
  if (!outcome.ok) return { bookId, settled: 0, problem: 'changed' };
  outcome.record.chargeId = payment.id;
  delete s.settlementLink;
  settlePayoutRequests(bookId);
  s.transferReceipts = [{ at: Date.now(), amount: paid, count: plan.heldSales.length, chargeId: payment.id },
    ...(Array.isArray(s.transferReceipts) ? s.transferReceipts : [])].slice(0, 10);
  saveState(bookId);
  syncArtistSettlementSales(bookId, outcome.record);
  if (bookId === activeBook) { renderHist(); updateDash(); renderArtistTransfers(); renderProfitSharingBreakdown(bookId); }
  return {
    bookId, settled: Math.max(1, plan.heldSales.length), total: paid, extra: 0, currency: book.currency,
    settlement: true, carried: plan.balance.royaltiesCarried || 0,
  };
}

function markArtistTransferReceived(transferId, bookId = activeBook, { chargeId = '', quiet = false } = {}) {
  const s = states[bookId], book = BOOKS[bookId];
  if (!s || !book) return false;
  const t = (s.artistTransfers || []).find(x => x.id === transferId);
  if (!t) return false;
  if (transferAmount(t) == null) {
    if (!quiet) showToast('This sale has no amount saved, so it can’t be settled yet. Check the order and re-enter it.', 'err', 5000);
    return false;
  }
  t.total = transferAmount(t);
  // Mark history entry as resolved; the revenue it now counts for is worked
  // out from the history below, the same way every load does.
  const h = s.hist.find(x => x.num === t.num && x.artistPending);
  if (h) { h.artistPending = false; h.notes = (h.notes ? h.notes + ' · ' : '') + (chargeId ? `Transfer received via Stripe (${chargeId})` : 'Transfer received'); }
  recomputeAfters(s, book);
  // Remove from pending queue
  s.artistTransfers = s.artistTransfers.filter(x => x.id !== transferId);
  saveState(bookId);
  if (bookId === activeBook) { renderHist(); updateDash(); renderArtistTransfers(); }
  const nativeCurT = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  const cadEquivT = cadEquivalentForSale({ nativeCurrency: nativeCurT, totalNative: t.total, payment: t.payment });
  // The sheet row is the sale, so it keeps the sale's date. It used to move to
  // the day the transfer arrived — shifting the sale into another month on the
  // sheet until the next Sync all data moved it back. (Same in the two
  // "artist kept" settlements below.)
  syncToSheets({
    type: 'order', book: book.title, date: (h && h.date) || t.date || today(), num: t.num, chan: t.chan, qty: t.qty, price: t.price, total: t.total, stockAfter: s.stock, notes: (t.notes || '') + ' [ARTIST TRANSFER RECEIVED]',
    sheetsId: t.sheetsId || (h && h.sheetsId) || '',
    currency: nativeCurT,
    paymentCurrency: normalizeCurrencyCode(t.payment?.currency || nativeCurT, 'CAD'),
    paymentAmount: t.payment?.amount ?? t.total,
    paymentRate: t.payment?.rate ?? '',
    convertedTotal: cadEquivT
  });
  if (!quiet) showToast(`✓ Transfer received — ${fmt(t.total, book.currency)} added to revenue`);
  return true;
}

// Tell the publisher an author's Stripe payment just settled their sales: a
// card that stays until dismissed, plus a device notification when she has
// switched those on (the same "notify me when paid" switch as invoices).
function notifyAuthorPaid(r, payment) {
  const book = BOOKS[r.bookId];
  const who = book.author || 'An author';
  const title = `${who} paid you ${fmt(r.total, r.currency)}`;
  const detail = (r.settlement
    ? `${book.title}: both sides settled automatically — they kept their share, the earnings you owed came off, and the sales they held are now in your revenue.` +
      (r.carried > 0 ? ` New sales since their link was made earned them ${fmt(r.carried, r.currency)} more — that is still owed to them; record it as a payout when you pay it.` : '')
    : `${book.title}: ${r.settled} ${r.settled === 1 ? 'sale' : 'sales'} marked received automatically and added to revenue.`) +
    (r.extra ? ` They paid ${fmt(r.extra, r.currency)} more than was due — check whether to refund it.` : '');
  pushAppAlert({
    id: `author-paid-${payment.id}`,
    icon: '💸',
    title,
    detail,
    tone: 'green',
    actionLabel: 'Open book',
    action: `switchBook(${JSON.stringify(r.bookId)}); switchTab('dashboard')`,
  });
  notifyDevice({
    kind: 'payments',
    title,
    body: detail,
    tag: `lm-author-paid-${payment.id}`,
    open: { to: 'book', book: r.bookId, tab: 'dashboard' },
  });
}

// An author paid through one of the app's own transfer links (single sale or
// "Pay all"). Settles exactly the transfers the link named — never more — and
// only when the money covers them in the book's currency. Returns a short
// report for the sweep, or null when there was nothing (left) to settle.
export function settleArtistTransfersFromStripe(payment) {
  const meta = payment.metadata || {};
  const bookId = meta.transfer_book;
  if (meta.settlement) return settleArtistSettlementFromStripe(payment, bookId);
  const s = states[bookId], book = BOOKS[bookId];
  if (!s || !book) return null;
  const ids = String(meta.transfer_ids || meta.transfer_id || '').split(',').map(x => x.trim()).filter(Boolean);

  // ⚡ Bolt Optimization: Use Set for O(1) lookups and single imperative loop to replace .filter().reduce()
  const idSet = new Set(ids);
  const open = [];
  let dueRaw = 0;
  const transfers = s.artistTransfers || [];
  for (let i = 0; i < transfers.length; i++) {
    const t = transfers[i];
    if (idSet.has(String(t.id))) {
      const amt = transferAmount(t);
      if (amt > 0) {
        open.push(t);
        dueRaw += amt;
      }
    }
  }

  if (!open.length) return null;
  const due = roundCents(dueRaw);
  const bookCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  if (String(payment.currency || '').toUpperCase() !== bookCur) return { bookId, settled: 0, problem: 'currency' };
  if (Number(payment.amount) + 0.005 < due) return { bookId, settled: 0, problem: 'short' };
  let settled = 0;
  for (const t of open) if (markArtistTransferReceived(t.id, bookId, { chargeId: payment.id, quiet: true })) settled++;
  if (s.transferBundle && s.transferBundle.ids.some(id => ids.includes(String(id)))) delete s.transferBundle;
  // A short, synced receipt list so the author's screen can say "your
  // publisher received it" once the sales drop off their list.
  if (settled) {
    s.transferReceipts = [{ at: Date.now(), amount: due, count: settled, chargeId: payment.id },
      ...(Array.isArray(s.transferReceipts) ? s.transferReceipts : [])].slice(0, 10);
  }
  saveState(bookId);
  // Money for sales that were already settled (e.g. paid twice) is worth a look.
  const extra = roundCents(Number(payment.amount) - due);
  return { bookId, settled, total: due, extra: extra > 0.009 ? extra : 0, currency: book.currency };
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
  if (transferAmount(t) == null) {
    showToast('This sale has no amount saved, so it can’t be settled yet. Check the order and re-enter it.', 'err', 5000);
    return;
  }
  t.total = transferAmount(t);

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

  // Resolve the pending history entry; it counts as revenue from now on
  // (worked out from the history, as every load does).
  if (h) { h.artistPending = false; h.notes = (h.notes ? h.notes + ' · ' : '') + 'Artist kept their share'; }
  recomputeAfters(s, book);

  // Record the artist's share as a payout — they already hold that cash.
  if (!s.artistPayouts) s.artistPayouts = [];
  if (share > 0) {
    s.artistPayouts.push({
      id: makeEventId(),
      date: today(),
      amount: roundCents(share),
      method: 'Kept from direct sale',
      notes: `${t.num} — artist retained their share`,
      cur: bookCurrencyCode(book),
      // Names the sale this was derived from, so editing it warns first.
      sourceNum: t.num
    });
  }

  s.artistTransfers = s.artistTransfers.filter(x => x.id !== transferId);
  renderHist(); updateDash(); renderArtistTransfers(); await saveState(activeBook);
  const nativeCurS = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  const cadEquivS = cadEquivalentForSale({ nativeCurrency: nativeCurS, totalNative: t.total, payment: t.payment });
  syncToSheets({
    type: 'order', book: book.title, date: (h && h.date) || t.date || today(), num: t.num, chan: t.chan, qty: t.qty, price: t.price, total: t.total, stockAfter: s.stock, notes: (t.notes || '') + ' [ARTIST KEPT SHARE]',
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
  if (transferAmount(t) == null) {
    showToast('This sale has no amount saved, so it can’t be settled yet. Check the order and re-enter it.', 'err', 5000);
    return;
  }
  t.total = transferAmount(t);

  if (!(await confirmDialog(
    `Settle ${escapeHtml(t.num)} — artist keeps everything?\n\n` +
    `The full ${fmt(t.total, book.currency)} sale is booked to revenue and recorded as a ` +
    `payout to the artist. Your publisher cut is forgiven — the artist owes nothing further.`,
    { okLabel: 'Settle — forgive publisher cut' }
  ))) return;

  const h = s.hist.find(x => x.num === t.num && x.artistPending);

  // Resolve the pending history entry; it counts as revenue from now on
  // (worked out from the history, as every load does).
  if (h) { h.artistPending = false; h.notes = (h.notes ? h.notes + ' · ' : '') + 'Artist kept full amount (publisher cut forgiven)'; }
  recomputeAfters(s, book);

  // Record the full gross as a payout — artist held all of it.
  if (!s.artistPayouts) s.artistPayouts = [];
  s.artistPayouts.push({
    id: makeEventId(),
    date: today(),
    amount: roundCents(t.total),
    method: 'Kept from direct sale (full)',
    notes: `${t.num} — artist retained full gross; publisher cut forgiven`,
    cur: bookCurrencyCode(book),
    // Names the sale this was derived from, so editing it warns first.
    sourceNum: t.num
  });

  s.artistTransfers = s.artistTransfers.filter(x => x.id !== transferId);
  renderHist(); updateDash(); renderArtistTransfers(); await saveState(activeBook);
  const nativeCurA = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  const cadEquivA = cadEquivalentForSale({ nativeCurrency: nativeCurA, totalNative: t.total, payment: t.payment });
  syncToSheets({
    type: 'order', book: book.title, date: (h && h.date) || t.date || today(), num: t.num, chan: t.chan, qty: t.qty, price: t.price, total: t.total, stockAfter: s.stock, notes: (t.notes || '') + ' [ARTIST KEPT ALL — PUBLISHER CUT FORGIVEN]',
    sheetsId: t.sheetsId || (h && h.sheetsId) || '',
    currency: nativeCurA,
    paymentCurrency: normalizeCurrencyCode(t.payment?.currency || nativeCurA, 'CAD'),
    paymentAmount: t.payment?.amount ?? t.total,
    paymentRate: t.payment?.rate ?? '',
    convertedTotal: cadEquivA
  });
  showToast(`✓ Settled — artist keeps full ${fmt(t.total, book.currency)}; publisher cut forgiven`);
}

// Per-device memory of "Stripe confirmed this payment" (Stripe's redirect back
// after a successful payment) so an author who has paid isn't shown the same
// Pay button again while the publisher's app catches up. Expires after 3 days.
// v2: only Stripe's post-payment redirect writes here (v1 counted a mere tap).
const PAID_TAP_KEY = 'lm-author-paid-v2';
try { localStorage.removeItem('lm-author-paid-taps'); } catch (_) { /* private mode */ }
const PAID_TAP_TTL = 3 * 86400000;
function readPaidTaps() {
  try { return JSON.parse(localStorage.getItem(PAID_TAP_KEY) || '{}') || {}; } catch (_) { return {}; }
}
function recentlyPaidTransfer(id) {
  const at = readPaidTaps()[String(id)];
  return !!at && Date.now() - at < PAID_TAP_TTL;
}
function notePaidTransfer(id, alsoIds = []) {
  const taps = readPaidTaps();
  const now = Date.now();
  [id, ...alsoIds].forEach(x => { taps[String(x)] = now; });
  for (const k of Object.keys(taps)) if (now - taps[k] > PAID_TAP_TTL) delete taps[k];
  try { localStorage.setItem(PAID_TAP_KEY, JSON.stringify(taps)); } catch (_) { /* private mode */ }
  setTimeout(() => { try { renderArtistTransfers(); } catch (_) { /* app still loading */ } }, 400);
}

// Stripe redirects here after a successful payment (?transfer_paid=id.id).
// Remember those sales as paid on this device and tidy the address bar.
function consumeTransferPaidReturn() {
  let params;
  try { params = new URLSearchParams(location.search); } catch (_) { return; }
  const raw = params.get('transfer_paid');
  if (!raw) return;
  const ids = raw.split('.').map(x => x.trim()).filter(Boolean);
  if (ids.length) {
    notePaidTransfer(ids[0], ids.slice(1));
    setTimeout(() => showThanksPopup({ stamp: 'Paid', title: 'Payment sent!', body: 'Stripe has your payment. Your publisher’s app will mark it received shortly — nothing more to do.' }), 1200);
  }
  params.delete('transfer_paid');
  const q = params.toString();
  try { history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`); } catch (_) { /* old browser */ }
}
consumeTransferPaidReturn();
// The Website · Inventory switcher, and links from the website to one of its
// orders (#website-order=<id>). It drops a leftover ?mode=admin (nothing reads
// it) and leaves every other part of the address as it is.
startAppSwitch();
// One search box (top-bar 🔍, Ctrl/⌘ K, "/"): this app's books and the website's.
startAppSearch();
// The return lands in the tab Stripe opened; refresh any other open tab too.
window.addEventListener('storage', e => { if (e.key === PAID_TAP_KEY) { try { renderArtistTransfers(); } catch (_) { /* still loading */ } } });

const _transferLinkInFlight = new Set();
let _lastTransferSweepKick = 0;
// Keep the author's one net pay link in step with what they owe. Returns
// true when the book is in settle-up mode (money running both ways), whether
// or not a link had to be made, so callers skip the per-sale links.
function ensureSettlementLink(bookId) {
  const s = states[bookId];
  const settle = s && authorSettlementDue(bookId);
  if (!settle) return false;
  if (navigator.onLine && settle.payable && !settlementLinkFor(s, settle) && !_transferLinkInFlight.has(`${bookId}:settle`)) {
    _transferLinkInFlight.add(`${bookId}:settle`);
    // Cleared only on success, so a bad Stripe key doesn't retry every render.
    mintArtistSettlementLink(bookId).then(url => { if (url) _transferLinkInFlight.delete(`${bookId}:settle`); });
  }
  return true;
}

function ensureTransferLinks(bookId) {
  const s = states[bookId];
  if (!s || !navigator.onLine) return;
  // Money running both ways is paid as one net amount, so per-sale links
  // (which ask for each sale in full) would quote the wrong figure.
  if (ensureSettlementLink(bookId)) return;
  const missing = payableTransfers(s).filter(t => !transferPayUrl(t) && !_transferLinkInFlight.has(`${bookId}:${t.id}`));
  const needBundle = payableTransfers(s).length >= 2 && !transferBundleFor(s) && !_transferLinkInFlight.has(`${bookId}:bundle`);
  if (!missing.length && !needBundle) return;
  missing.forEach(t => _transferLinkInFlight.add(`${bookId}:${t.id}`));
  if (needBundle) _transferLinkInFlight.add(`${bookId}:bundle`);
  (async () => {
    // A minted link is cleared from the in-flight set so a later change to the
    // amount or the "Pay all" set can re-mint it; failures stay flagged for this
    // session so a bad key doesn't loop.
    for (const t of missing) {
      if (await mintArtistTransferPayLink(bookId, t.id, { quiet: true })) _transferLinkInFlight.delete(`${bookId}:${t.id}`);
    }
    if (needBundle && await mintArtistTransferBundleLink(bookId)) _transferLinkInFlight.delete(`${bookId}:bundle`);
  })();
}

// Most recent "publisher received your payment" within the last 14 days.
function latestTransferReceipt(s) {
  const r = Array.isArray(s?.transferReceipts) ? s.transferReceipts[0] : null;
  return r && Date.now() - Number(r.at) < 14 * 86400000 ? r : null;
}
// Pop a one-time thank-you on the author's device the first time it sees a receipt.
const RECEIPT_SEEN_KEY = 'lm-author-receipts-seen';
function announceTransferReceipt(r, cur) {
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(RECEIPT_SEEN_KEY) || '[]'); } catch (_) { seen = []; }
  if (!Array.isArray(seen) || seen.includes(r.chargeId)) return;
  seen = [r.chargeId, ...seen].slice(0, 30);
  try { localStorage.setItem(RECEIPT_SEEN_KEY, JSON.stringify(seen)); } catch (_) { /* private mode */ }
  showThanksPopup({
    stamp: 'Received',
    title: 'Thank you!',
    body: `Your publisher received your ${fmt(r.amount, cur)} payment${r.count ? ` for ${r.count} ${r.count === 1 ? 'sale' : 'sales'}` : ''}. Nothing more to send.`,
  });
}

// Riso thank-you card: a stamped paper slip over the page. One at a time;
// Esc, the button or a click outside closes it, and focus returns to where it was.
function showThanksPopup({ stamp = 'Paid', title = 'Thank you!', body = '' } = {}) {
  document.getElementById('thanks-riso')?.remove();
  const back = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'overlay thanks-overlay';
  wrap.id = 'thanks-riso';
  wrap.innerHTML = `<div class="thanks-riso" role="dialog" aria-modal="true" aria-labelledby="thanks-riso-title" aria-describedby="thanks-riso-body">
      <div class="thanks-stamp" aria-hidden="true"><span>${escapeHtml(stamp)}</span><span>${escapeHtml(stamp)}</span></div>
      <h2 class="thanks-title" id="thanks-riso-title">${escapeHtml(title)}</h2>
      <p class="thanks-body" id="thanks-riso-body">${escapeHtml(body)}</p>
      <button type="button" class="btn gold lg thanks-close">Lovely, close</button>
    </div>`;
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    try { back?.focus?.(); } catch (_) { /* element gone */ }
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  wrap.querySelector('.thanks-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  wrap.querySelector('.thanks-close').focus();
}

// Publisher → author: "please add the link I should pay you back through".
// Opens an email with plain steps and a link that drops the author straight
// onto the payment-link box; falls back to copying the message.
function askAuthorForPayLink() {
  const book = getBook();
  const url = `${location.origin}${location.pathname}?setup=paylink`;
  const first = (book.author || '').split(' ')[0] || 'there';
  const subject = `Add your payment link — ${book.title}`;
  const body = `Hi ${first},\n\nI'd like to pay you back for your expenses on ${book.title}, but I don't have a payment link for you yet.\n\nIt takes a minute:\n1. Open this link and sign in: ${url}\n2. Paste your PayPal.me link or Interac email into the "Your payment link" box.\n3. Press Save.\n\nThat's it — I'll send the money there.\n\nThanks!`;
  const to = (book.authorEmail || '').trim();
  if (to) {
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return;
  }
  const done = () => showToast('No author email saved for this book — message copied, paste it to them', 'warn', 5000);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(`${subject}\n\n${body}`).then(done).catch(() => showToast('Add the author’s email in the book settings to send this', 'warn', 5000));
  else showToast('Add the author’s email in the book settings to send this', 'warn', 5000);
}
window.askAuthorForPayLink = askAuthorForPayLink;

// Author arrived from that email (?setup=paylink): open Expenses and put the
// cursor in the payment-link box, then tidy the address bar.
function openPayLinkSetupIfAsked() {
  let params;
  try { params = new URLSearchParams(location.search); } catch (_) { return; }
  if (params.get('setup') !== 'paylink') return;
  params.delete('setup');
  const q = params.toString();
  try { history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`); } catch (_) { /* old browser */ }
  setTimeout(goToPayLinkSetup, 600);
}

// Author: jump to the "Your payment link" box and put the cursor in it.
function goToPayLinkSetup() {
  try { switchTab('expenses'); } catch (_) { return; }
  const card = $('artist-payment-link-card');
  const input = $('artist-pay-link-input');
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  input?.focus();
  showToast('Paste your PayPal.me link or Interac email here, then press Save', 'ok', 5000);
}
window.goToPayLinkSetup = goToPayLinkSetup;

// The Stripe link minted for this transfer, if it still matches the amount.
function transferPayUrl(t) {
  const amt = transferAmount(t);
  return t && t.payUrl && amt != null && Number(t.payAmount) === amt && t.payLinkV === TRANSFER_LINK_VERSION ? t.payUrl : '';
}

// Approve an author's direct-to-artist sale straight from its transfer card.
// Confirms first: approving writes the sale into the ledger and stock.
async function approvePendingTransferSale(subKey) {
  const sub = window.authorSubmissions[activeBook]?.sales?.[subKey];
  if (!sub) { showToast('This sale was already handled', 'warn'); return; }
  let raw = {};
  try { raw = typeof sub.data === 'string' ? JSON.parse(sub.data) : (sub.data || {}); } catch (_) { /* shown generically */ }
  const book = getBook();
  const amt = (Number(raw.qty) || 0) * (Number(raw.price) || 0);
  const ok = await confirmDialog(
    `Approve this sale?\n\n${Number(raw.qty) || '?'} × ${book.title}${amt ? ` · ${fmt(amt, book.currency)}` : ''}${raw.date ? ` · ${fmtD(raw.date)}` : ''}\n\n` +
    'It will be added to your sales and stock, and the author will be asked to send you the money.',
    { okLabel: 'Approve sale' },
  );
  if (!ok) return;
  await window.approveSubmission('sales', subKey);
}
window.approvePendingTransferSale = approvePendingTransferSale;

// The author paid a settle-up link on this device and the publisher's app
// hasn't recorded it yet. Matched on any settle-up payment, not on this amount:
// a new sale changes the amount, and a fresh Pay button then would invite them
// to pay twice. A settlement or receipt written after the payment absorbs it.
function unrecordedSettlementPayment(s) {
  let tapAt = 0;
  for (const [k, at] of Object.entries(readPaidTaps())) {
    if (k.startsWith('settle-') && Date.now() - at < PAID_TAP_TTL) tapAt = Math.max(tapAt, at);
  }
  if (!tapAt) return false;
  let absorbedAt = Number(s?.transferReceipts?.[0]?.at) || 0;
  for (const p of s?.artistPayouts || []) {
    if (p.settlement && !p.voided) absorbedAt = Math.max(absorbedAt, Number(p.recordedAt) || 0);
  }
  return tapAt > absorbedAt;
}

// The author's banner when money runs both ways. One headline — the same net
// figure as the publisher's Settle up panel — one Stripe button for exactly
// that, and the sales listed underneath as what it covers.
function renderAuthorSettlementBanner(banner, s, settle, transfers, cur) {
  const b = settle.balance;
  const money = n => fmt(n, cur);
  const link = settlementLinkFor(s, settle);
  const paid = settle.payable && unrecordedSettlementPayment(s);
  banner.style.display = '';
  banner.classList.add('apb-riso');
  banner.querySelector('.metric-banner-label').textContent = 'Money to send to your publisher';
  const amountEl = $('apb-amount');
  amountEl.textContent = settle.payable ? money(b.amount) : 'Nothing to send';
  amountEl.classList.toggle('is-quiet', !settle.payable);

  let detail;
  if (settle.plan.error) {
    detail = 'Your publisher is checking an earlier payment. Nothing to send until they have.';
  } else if (settle.payable) {
    const parts = [];
    if (b.heldGross > 0) parts.push(`You collected ${money(b.heldGross)} and keep your ${money(b.heldShare)} share`);
    if (b.otherDebt > 0) parts.push(`${parts.length ? 'plus' : 'You owe'} ${money(b.otherDebt)} for other things`);
    if (b.overpaid > 0) parts.push(`plus ${money(b.overpaid)} you were paid ahead of your earnings`);
    if (b.royaltiesOwed > 0) parts.push(`the ${money(b.royaltiesOwed)} your publisher owes you comes off`);
    if (b.expensesOwed > 0) parts.push(`${b.royaltiesOwed > 0 ? 'and so does' : 'the'} ${money(b.expensesOwed)} in expenses they owe you back${b.royaltiesOwed > 0 ? '' : ' comes off'}`);
    detail = `${parts.join(', ')} — so you send ${money(b.amount)}. One payment settles both sides.`;
    detail = detail.charAt(0).toUpperCase() + detail.slice(1);
    if (paid) detail = '✓ Paid — thank you! It clears once your publisher\'s app records it.';
    else if (!link) detail += ' Your payment link is on its way — your publisher\'s app is preparing it.';
  } else if (b.direction === 'to-artist') {
    detail = b.expensesOwed > 0
      ? `Your publisher owes you ${money(b.amount)}: ${b.royaltiesOwed > 0 ? 'your earnings and ' : ''}the ${money(b.expensesOwed)} in expenses they owe you back, less the ${money(roundCents(b.publisherHeld + b.otherDebt))} you collected for them. Nothing to send — they'll pay you the difference.`
      : `Your publisher owes you ${money(b.amount)} once the ${money(roundCents(b.publisherHeld + b.otherDebt))} you collected for them comes off. Nothing to send — they'll pay you the difference.`;
  } else {
    detail = `What you collected for your publisher and the ${b.expensesOwed > 0 ? 'earnings and expenses' : 'earnings'} they owe you cancel out. Nothing to send.`;
  }
  const waiting = transfers.filter(t => t.status === 'pending');
  if (waiting.length) detail += ` ${waiting.length} more ${waiting.length === 1 ? 'sale' : 'sales'} waiting for your publisher to check — nothing to do yet.`;
  $('apb-detail').textContent = detail;

  const actions = banner.querySelector('.metric-banner-actions');
  const showPay = settle.payable && link && !paid;
  if (actions) actions.style.display = showPay ? '' : 'none';
  if (showPay) {
    const btn = $('apb-pay-btn');
    btn.href = link.url;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.textContent = `Pay ${money(b.amount)} →`;
    btn.onclick = null;
    $('apb-link-hint').textContent = 'One payment for both sides · amount filled in';
  }

  const list = $('apb-transfers');
  list.style.display = transfers.length ? '' : 'none';
  const order = t => (t.status === 'pending' ? 2 : transferAmount(t) == null ? 1 : 0);
  list.innerHTML = [...transfers].sort((x, y) => order(x) - order(y)).map(t => {
    const amt = transferAmount(t);
    const copies = Number(t.qty) > 0 ? `${Number(t.qty)} ${Number(t.qty) === 1 ? 'copy' : 'copies'}` : 'A sale';
    const what = `${copies}${Number(t.qty) > 0 ? ' sold' : ''}${t.date ? ` on ${fmtD(t.date)}` : ''}${amt ? ` · ${money(amt)} collected` : ''}`;
    let action, state = '';
    if (t.status === 'pending') {
      state = ' is-pending';
      action = '<span class="apb-status">Waiting for your publisher</span>';
    } else if (amt == null) {
      action = '<span class="apb-status is-warn">Tell your publisher the price</span>';
    } else {
      action = `<span class="apb-status">${settle.payable ? 'Included in the payment above' : 'Settled when your publisher pays you'}</span>`;
    }
    const stamp = Number(t.qty) > 0 ? `${Number(t.qty)}×` : '?';
    return `<div class="mbi-row apb-row${state}">
      <div class="apb-stamp" aria-hidden="true">${stamp}</div>
      <div class="apb-what">${escapeHtml(what)}</div>
      ${action}
    </div>`;
  }).join('');
}

export function renderArtistTransfers() {
  const s = getState(), book = getBook(), cur = book.currency;
  let transfers = [...(s.artistTransfers || [])].map(t => ({ ...t, status: 'approved' }));

  // Merge in pending author submissions for BOTH author and publisher views
  const pbSales = window.authorSubmissions[activeBook]?.sales || {};
  Object.keys(pbSales).forEach(k => {
    const raw = (typeof pbSales[k].data === 'string') ? JSON.parse(pbSales[k].data) : pbSales[k].data;
    if (isDirectToArtistSale(raw)) {
      transfers.push({
        ...raw,
        total: (raw.qty || 0) * (raw.price || 0),
        status: 'pending', // Flagged as pending approval
        _subKey: k,
      });
    }
  });

  // ── AUTHOR BANNER
  // The author's single place to pay: one headline ("to send now"), then one
  // row per sale with its own action. The lower publisher panel is hidden for
  // authors so there is never a second, competing pay button.
  const banner = $('author-payment-banner');
  if (banner) {
    const receipt = isAuthor() ? latestTransferReceipt(s) : null;
    if (receipt) announceTransferReceipt(receipt, cur);
    // Money running both ways: the author sends one net figure, not each sale.
    const settle = isAuthor() ? authorSettlementDue(activeBook) : null;
    if (isAuthor() && transfers.length === 0 && receipt) {
      // Nothing left to pay and the publisher recently received a payment:
      // close the loop with a thank-you instead of just vanishing.
      banner.style.display = '';
      banner.classList.add('apb-riso');
      banner.querySelector('.metric-banner-label').textContent = 'Money to send to your publisher';
      $('apb-amount').textContent = 'All paid — thank you!';
      $('apb-amount').classList.add('is-quiet');
      $('apb-detail').textContent = `Your publisher received ${fmt(receipt.amount, cur)} on ${fmtD(new Date(receipt.at).toISOString().slice(0, 10))}. Nothing more to send.`;
      const actions = banner.querySelector('.metric-banner-actions');
      if (actions) actions.style.display = 'none';
      $('apb-transfers').innerHTML = '';
      $('apb-transfers').style.display = 'none';
    } else if (isAuthor() && settle && book.profitTiers?.length && !transfers.some(t => t.status === 'pending' || transferAmount(t) == null)) {
      // The money card at the top of the dashboard says it all, Pay button
      // included; this banner only returns for a sale still waiting on the
      // publisher's check or on a price.
      banner.style.display = 'none';
    } else if (isAuthor() && settle) {
      renderAuthorSettlementBanner(banner, s, settle, transfers, cur);
    } else if (isAuthor() && transfers.length > 0) {
      $('apb-transfers').style.display = '';
      let dueNow = 0, dueCount = 0, waitingTotal = 0, waitingCount = 0, missing = 0;
      for (const t of transfers) {
        const amt = transferAmount(t);
        if (t.status === 'pending') { waitingCount++; waitingTotal += amt || 0; }
        else if (amt == null) missing++;
        else if (amt > 0 && !recentlyPaidTransfer(t.id)) { dueNow += amt; dueCount++; }
      }
      banner.style.display = '';
      banner.classList.add('apb-riso');
      banner.querySelector('.metric-banner-label').textContent = 'Money to send to your publisher';
      $('apb-amount').textContent = dueCount ? fmt(dueNow, cur) : 'Nothing to pay yet';
      $('apb-amount').classList.toggle('is-quiet', !dueCount);
      const bits = [];
      if (dueCount) bits.push(dueCount === 1 ? 'Tap Pay on the sale below. Stripe opens with the amount filled in.' : `Tap Pay on each of the ${dueCount} sales below. Stripe opens with the amount filled in.`);
      if (waitingCount) bits.push(`${waitingCount} more ${waitingCount === 1 ? 'sale' : 'sales'} (${fmt(waitingTotal, cur)}) waiting for your publisher to check — nothing to do yet.`);
      if (missing) bits.push(`${missing} ${missing === 1 ? 'sale needs' : 'sales need'} a price from you — tell your publisher what the buyer paid.`);
      $('apb-detail').textContent = bits.join(' ');
      // The banner-level button is only "Pay all" — shown when one Stripe link
      // covers every sale due now. Otherwise each sale row carries its own action.
      const actions = banner.querySelector('.metric-banner-actions');
      const bundle = transferBundleFor(s);
      // Any sale in the bundle already paid on its own (or the bundle itself)
      // means "Pay all" would charge part of it twice — so it goes away.
      const bundlePaid = bundle && payableTransfers(s).some(t => recentlyPaidTransfer(t.id));
      if (actions) actions.style.display = bundle && !bundlePaid ? '' : 'none';
      if (bundle && !bundlePaid) {
        const btn = $('apb-pay-btn');
        btn.href = bundle.url;
        btn.target = '_blank';
        btn.rel = 'noopener';
        btn.textContent = `Pay all ${fmt(bundle.amount, cur)} →`;
        btn.onclick = null;
        $('apb-link-hint').textContent = `One payment for all ${bundle.count} sales · amount filled in`;
        $('apb-detail').textContent = `Tap Pay all to send everything in one go, or pay each sale on its own below.` +
          (waitingCount ? ` ${waitingCount} more ${waitingCount === 1 ? 'sale' : 'sales'} waiting for your publisher to check — nothing to do yet.` : '');
      }

      const order = t => (t.status === 'pending' ? 2 : transferAmount(t) == null ? 1 : 0);
      $('apb-transfers').innerHTML = [...transfers].sort((x, y) => order(x) - order(y)).map(t => {
        const amt = transferAmount(t);
        const copies = Number(t.qty) > 0 ? `${Number(t.qty)} ${Number(t.qty) === 1 ? 'copy' : 'copies'}` : 'A sale';
        const what = `${copies}${Number(t.qty) > 0 ? ' sold' : ''}${t.date ? ` on ${fmtD(t.date)}` : ''}`;
        let action, state = '';
        if (t.status === 'pending') {
          state = ' is-pending';
          action = `<span class="apb-status">Waiting for your publisher${amt ? ` · ${escapeHtml(fmt(amt, cur))}` : ''}</span>`;
        } else if (amt == null) {
          action = `<span class="apb-status is-warn">Tell your publisher the price</span>`;
        } else if (recentlyPaidTransfer(t.id)) {
          // Stripe confirmed this payment by sending them back to the app.
          action = `<span class="apb-status is-done">✓ Paid — thank you! It clears from this list once your publisher's app records it</span>`;
        } else {
          // Stripe only: the exact-amount link the publisher's app made. Never
          // the book's general link (which may be PayPal and asks them to type).
          const url = transferPayUrl(t);
          action = url
            ? `<a class="btn gold apb-pay" href="${escapeHtml(url)}" target="_blank" rel="noopener">Pay ${escapeHtml(fmt(amt, cur))} →</a>`
            : `<span class="apb-status">Payment link on its way — your publisher's app is preparing it. Check back soon.</span>`;
        }
        const stamp = Number(t.qty) > 0 ? `${Number(t.qty)}×` : '?';
        return `<div class="mbi-row apb-row${state}">
          <div class="apb-stamp" aria-hidden="true">${stamp}</div>
          <div class="apb-what">${escapeHtml(what)}</div>
          ${action}
        </div>`;
      }).join('');
    } else {
      banner.style.display = 'none';
    }
  }

  // Authors pay from the banner above; the panel below is the publisher's desk.
  if (isAuthor()) {
    const sectA = $('artist-transfers-sect');
    if (sectA) sectA.style.display = 'none';
    return;
  }

  // Publisher with Stripe connected: make any missing/outdated author links in
  // the background, so authors always get a Stripe button with the amount set.
  if (!isAuthor() && isPublisherSession() && getReconStripeKey()) {
    ensureTransferLinks(activeBook);
    // Payments may be waiting in Stripe: check now rather than at the next
    // 5-minute tick (throttled so re-renders don't hammer Stripe).
    if ((s.artistTransfers || []).some(t => t.payUrl) && Date.now() - _lastTransferSweepKick > 60000) {
      _lastTransferSweepKick = Date.now();
      sweepStripeInvoicePayments({ force: true }).catch(() => { /* surfaced by the sweep's own health handling */ });
    }
  }

  // ── PUBLISHER PANEL
  const sect = $('artist-transfers-sect'), list = $('artist-transfers-list');
  if (!sect) return;
  // Both sides owe money: the author pays one net figure from Settle up, so a
  // full-price Stripe link per sale would ask for the wrong amount.
  const due = authorSettlementDue(activeBook);
  const netMode = !!due;
  // On a profit-sharing book the Settle up ledger lists these sales with their
  // own Settle by hand button, so they aren't listed a second time here. Sales
  // still waiting for approval aren't in the ledger and stay.
  if (due && book.profitTiers?.length) {
    const inLedger = new Set((due.plan.transfers || []).map(t => String(t.id)));
    transfers = transfers.filter(t => t.status === 'pending' || !inLedger.has(String(t.id)));
  }
  if (!transfers.length) { sect.style.display = 'none'; return; }
  sect.style.display = '';
  list.innerHTML = transfers.map(t => `
    <div class="pending-card${t.status === 'pending' ? ' is-pending' : ''}">
      <div>
        <div class="pending-card-head">
          <span class="pill amber">⏳ Awaiting transfer</span>
          <span class="pending-card-num">${escapeHtml(t.num)}</span>
          ${t.status === 'pending' ? `<span class="pill gray" style="font-size:var(--text-2xs);">Pending Approval</span>` : ''}
        </div>
        <div class="pending-card-meta">${[fmtD(t.date), escapeHtml(t.chan || ''), transferQtyLabel(t)].filter(Boolean).join(' · ')} · <strong class="pending-card-highlight">${transferAmount(t) == null ? 'Amount missing — check this sale' : `${fmt(transferAmount(t), cur)} held`}</strong></div>
        <div class="pending-card-note">${escapeHtml(t.notes) || '—'}</div>
      </div>
      <div class="pending-card-actions">
        ${t.status === 'pending'
      ? (t._subKey
        ? `<button class="btn gold" onclick="approvePendingTransferSale(${escapeHtml(JSON.stringify(t._subKey))})" title="Add this sale to your records. Once approved, the author can pay you for it.">✓ Approve sale</button>`
        : `<button class="btn sm outline" disabled>Approve sale first</button>`)
      : `${netMode
          ? '<span class="pill gray" title="The author pays one net amount for everything — see Settle up">In Settle up</span>'
          : transferPayUrl(t)
          ? `<span class="pill green" title="The author's Send button opens Stripe with this amount filled in">Stripe link ready</span>`
          : (getReconStripeKey() && transferAmount(t) > 0 ? `<button class="btn sm outline" onclick="mintArtistTransferPayLink(${t.id})" title="Make a Stripe link for exactly this amount, so the author doesn't have to type it">Make Stripe link</button>` : '')}
             ${settleByHandMenu(t, cur)}`}
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

export function renderPendingExpenses() {
  const s = getState(), book = getBook(), cur = book.currency;
  const pending = [];
  for (const e of expensesWithSettlements(s)) {
    if (!e.received && !isGratuityExpense(e)) {
      pending.push(e);
    }
  }
  const sect = $('d-pending-expenses-sect'), list = $('d-pending-expenses-list');
  if (!sect) return;
  // In the Settle up, one net payment covers these.
  const settle = expensesInSettleUp(book, s);
  // On a profit-sharing book the money card lists these receipts with their
  // own Mark received button, and carries the payment-link ask, so they
  // aren't listed twice.
  if (book.profitTiers?.length) {
    for (let i = pending.length - 1; i >= 0; i--) if (settle.ids.has(String(pending[i].id))) pending.splice(i, 1);
  }
  if (!pending.length) { sect.style.display = 'none'; return; }
  sect.style.display = '';
  const settleHtml = `<span class="pill gray" title="Counted in Settle up — one payment covers both sides">In Settle up</span>`;
  const fullLink = safeHttpUrl(s.artistPaymentLink);
  const payHtml = fullLink
    ? `<a href="${escapeHtml(fullLink)}" target="_blank" rel="noopener" class="btn sm" style="text-decoration:none;background:var(--green-bg);color:var(--green);border-color:rgba(42,99,72,.2);">↗ Payment link</a>`
    : isAuthor()
      ? `<button type="button" class="btn sm gold" onclick="goToPayLinkSetup()" title="Add the link your publisher pays you back through">Set up your payment link →</button>`
      : `<button type="button" class="btn sm outline" onclick="askAuthorForPayLink()" title="Send the author simple steps to add the link you'll pay them back through">✉ Ask author to add payment link</button>`;
  list.innerHTML = pending.map(e => `
    <div class="pending-card">
      <div>
        <div class="pending-card-head">
          <span class="pill amber">⏳ Awaiting payment</span>
          <span class="pending-card-num">${fmt(e.amount, cur)}</span>
        </div>
        <div class="pending-card-meta"><span class="pending-card-when">${fmtD(e.date)}</span><span class="pending-card-sep" aria-hidden="true"> · </span><span class="pile-chip">${escapeHtml(e.cat)}</span><span class="pending-card-sep" aria-hidden="true"> · </span><strong class="pending-card-desc">${escapeHtml(e.desc)}</strong></div>
        <div class="pending-card-note">${escapeHtml(e.ref) || ''}</div>
      </div>
      <div class="pending-card-actions">
        ${settle.ids.has(String(e.id)) ? settleHtml + (settle.publisherPays ? payHtml : '') : payHtml}
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
      // The rate for the gift's own date; with none to hand (offline) the CAD
      // value is left empty and flagged for healExpenseRates — never 1:1.
      const cadRate = await resolveExpenseRate(currency, date);
      const baseAmount = cadRate ? roundCents(totalExp * cadRate) : null;

      s.expenses.unshift({
        id: Date.now(),
        desc: `Gratuity: ${ref || notes || 'Gifted copy'}`,
        cat: 'Marketing & Advertising',
        amount: totalExp,
        currency: currency,
        origAmount: totalExp,
        origCurrency: currency,
        baseAmount: baseAmount,
        ...(cadRate ? {} : { fxMissing: true }),
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

window.backfillGratuityExpenses = async function () {
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

  const currency = getBookCurrencyCode(book);
  for (const h of gratuities) {
    const existing = s.expenses.find(e => e.ref === h.num || (e.date === h.date && e.desc.includes(h.notes || 'Gifted')));
    if (existing && existing.currency) continue;
    const amount = h.qty * unitCost;
    // Each gift's own date's rate; none to hand leaves the CAD value empty and
    // flagged for healExpenseRates rather than booking it 1:1.
    const cadRate = await resolveExpenseRate(currency, h.date || today());
    const baseAmount = cadRate ? roundCents(amount * cadRate) : null;
    const fxFlag = cadRate ? {} : { fxMissing: true };

    if (existing) {
      existing.currency = currency;
      existing.origAmount = amount;
      existing.origCurrency = currency;
      existing.baseAmount = baseAmount;
      Object.assign(existing, fxFlag);
      patched++;
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
        ...fxFlag,
        date: h.date,
        ref: h.num,
        received: false,
        gratuity: true
      });
      added++;
    }
  }

  if (added > 0 || patched > 0) {
    // sort expenses to keep newest first
    s.expenses.sort((a, b) => b.id - a.id);
    renderExpenses();
    updateDash();
    saveState(activeBook);
    renderTaxCenter();
    showToast(`✓ Backfilled ${added} and fixed ${patched} past gratuity expenses`);
  } else {
    showToast('All past gratuities are already accounted for properly');
  }
}

function storeById(id) { return getState().stores.find(s => s.id === id); }

export function getConsignmentStoresAcrossBooks() {
  return collectUniqueConsignmentStores(states, BOOK_LIST);
}

const STORE_QUICK_CHIP_LIMIT = 6;

export function populateAddStoreDirectory() {
  const wrap = $('add-store-preset-wrap');
  if (!wrap) return;
  const allStores = getConsignmentStoresAcrossBooks();
  if (!allStores || !allStores.length) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';

  const pill = $('add-store-count-pill');
  if (pill) {
    pill.textContent = `${allStores.length} store${allStores.length === 1 ? '' : 's'} across catalogue`;
  }

  const currentStores = (getState().stores || []).map(s => (s.name || '').trim().toLowerCase());

  const select = $('ns-existing-store-select');
  if (select) {
    select.innerHTML = `<option value="">— Choose a store to auto-fill —</option>` +
      allStores.map(st => {
        const inThisBook = currentStores.includes(st.name.toLowerCase());
        const loc = [st.city, st.country].filter(Boolean).join(', ');
        const meta = [loc, `${st.rate}% cut`, `in ${st.books.length} book${st.books.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
        const badge = inThisBook ? ' · [already in this book]' : '';
        return `<option value="${escapeHtml(st.name)}">${escapeHtml(st.name)}${meta ? ` (${escapeHtml(meta)})` : ''}${badge}</option>`;
      }).join('');
    select.value = '';
  }

  const chipsList = $('add-store-quick-chips');
  if (chipsList) {
    // Only the first few stores get a quick-select row; the dropdown above
    // lists every store, and the note below says how many are left out.
    const shown = allStores.slice(0, STORE_QUICK_CHIP_LIMIT);
    const hiddenCount = allStores.length - shown.length;
    chipsList.innerHTML = shown.map(st => {
      const inThisBook = currentStores.includes(st.name.toLowerCase());
      const loc = st.city || st.country || '';
      return `<button type="button" class="store-quick-chip" data-store-name="${escapeHtml(st.name)}" onclick="handleSelectExistingStore(${escapeHtml(JSON.stringify(st.name))})" title="${escapeHtml(st.name)}${loc ? ` · ${escapeHtml(loc)}` : ''}">
        <span class="chip-dot" aria-hidden="true"></span>
        <span class="chip-copy">
          <span class="chip-name">${escapeHtml(st.name)}</span>
          ${loc ? `<span class="chip-meta">${escapeHtml(loc)}</span>` : ''}
          ${inThisBook ? `<span class="chip-status gray sm">In book</span>` : ''}
        </span>
      </button>`;
    }).join('') + (hiddenCount > 0
      ? `<div class="add-store-more" role="note">+ ${hiddenCount} more. Pick them from the list above.</div>`
      : '');
  }

  const banner = $('add-store-selected-banner');
  if (banner) banner.style.display = 'none';
  const warn = $('add-store-warning-banner');
  if (warn) warn.style.display = 'none';
}

export function handleSelectExistingStore(storeName) {
  if (!storeName || !storeName.trim()) {
    clearAddStoreForm();
    return;
  }
  const cleanName = storeName.trim();
  const allStores = getConsignmentStoresAcrossBooks();
  const st = allStores.find(s => s.name.toLowerCase() === cleanName.toLowerCase());
  if (!st) return;

  if ($('ns-name')) $('ns-name').value = st.name;
  if ($('ns-contact')) $('ns-contact').value = st.contact || '';
  if ($('ns-email')) $('ns-email').value = st.email || '';
  if ($('ns-phone')) $('ns-phone').value = st.phone || '';
  if ($('ns-address')) $('ns-address').value = st.address || '';
  if ($('ns-city')) $('ns-city').value = st.city || '';
  if ($('ns-region')) $('ns-region').value = st.region || '';
  if ($('ns-postal')) $('ns-postal').value = st.postal || '';
  if ($('ns-country')) $('ns-country').value = st.country || '';
  if ($('ns-website')) $('ns-website').value = st.website || '';
  if ($('ns-rate')) $('ns-rate').value = st.rate != null ? st.rate : '40';
  if ($('ns-terms')) $('ns-terms').value = st.terms || '';
  if ($('ns-notes')) $('ns-notes').value = st.notes || '';

  const modal = $('m-add-store');
  if (modal) clearFieldErrors(modal);

  const select = $('ns-existing-store-select');
  if (select && select.value !== st.name) {
    select.value = st.name;
  }

  const chips = document.querySelectorAll('#add-store-quick-chips .store-quick-chip');
  chips.forEach(chip => {
    chip.classList.toggle('is-selected', chip.getAttribute('data-store-name') === st.name);
  });

  ['ns-name', 'ns-contact', 'ns-email', 'ns-phone', 'ns-address', 'ns-city', 'ns-region', 'ns-postal', 'ns-country', 'ns-website', 'ns-rate', 'ns-terms', 'ns-notes'].forEach(id => {
    const el = $(id);
    if (el) {
      el.classList.remove('input-autofilled');
      void el.offsetWidth;
      el.classList.add('input-autofilled');
    }
  });

  const banner = $('add-store-selected-banner');
  const bannerText = $('add-store-banner-text');
  if (banner && bannerText) {
    const bookListStr = st.books && st.books.length ? st.books.map(b => escapeHtml(b)).join(', ') : 'other catalogue titles';
    bannerText.innerHTML = `Auto-filled details from <strong>${escapeHtml(st.name)}</strong> · Stocked in <em>${bookListStr}</em>`;
    banner.style.display = 'flex';
  }

  const warn = $('add-store-warning-banner');
  if (warn) {
    const currentStore = (getState().stores || []).find(s => (s.name || '').trim().toLowerCase() === st.name.toLowerCase());
    if (currentStore) {
      warn.innerHTML = `ℹ️ <strong>${escapeHtml(st.name)}</strong> is already in this book's accounts (${currentStore.outstanding} copies outstanding). Saving will add an additional store record.`;
      warn.style.display = 'block';
    } else {
      warn.style.display = 'none';
    }
  }
}

export function clearAddStoreForm() {
  ['ns-name', 'ns-contact', 'ns-email', 'ns-phone', 'ns-address', 'ns-city', 'ns-region', 'ns-postal', 'ns-country', 'ns-website', 'ns-terms', 'ns-notes'].forEach(id => {
    if ($(id)) $(id).value = '';
  });
  if ($('ns-rate')) $('ns-rate').value = '40';
  const select = $('ns-existing-store-select');
  if (select) select.value = '';
  const chips = document.querySelectorAll('#add-store-quick-chips .store-quick-chip');
  chips.forEach(chip => chip.classList.remove('is-selected'));
  const banner = $('add-store-selected-banner');
  if (banner) banner.style.display = 'none';
  const warn = $('add-store-warning-banner');
  if (warn) warn.style.display = 'none';
  const modal = $('m-add-store');
  if (modal) clearFieldErrors(modal);
}

function addStore() {
  if (!validateFields([
    { id: 'ns-name', test: v => v.trim().length > 0, msg: 'Store name is required' },
    { id: 'ns-rate', test: v => { if (v.trim() === '') return true; const n = parseFloat(v); return !isNaN(n) && n >= 0 && n <= 100; }, msg: 'Commission must be between 0 and 100' },
  ])) return;
  const name = $('ns-name').value.trim();
  getState().stores.push({ id: Date.now(), name, contact: $('ns-contact').value.trim(), email: $('ns-email').value.trim(), phone: $('ns-phone').value.trim(), address: $('ns-address').value.trim(), city: $('ns-city').value.trim(), region: $('ns-region').value.trim(), postal: $('ns-postal').value.trim(), country: $('ns-country').value.trim(), website: $('ns-website').value.trim(), terms: $('ns-terms').value.trim(), rate: (() => { const r = parseFloat($('ns-rate').value); return Number.isFinite(r) ? r : 40; })(), notes: $('ns-notes').value.trim(), sent: 0, sold: 0, returned: 0, outstanding: 0, amountOwed: 0 });
  closeM('add-store');
  clearAddStoreForm();
  renderStores(); updateDash(); saveState(activeBook); showToast('✓ Store added');
}
function renderStores() {
  const s = getState(), el = $('stores-list'), book = getBook(), cur = book.currency;
  setConTabCount('stores', s.stores.length);
  if (!s.stores.length) {
    el.innerHTML = `<div class="empty-state sys-empty">
      <div class="empty-icon" aria-hidden="true">🏪</div>
      <h3>No consignment stores yet</h3>
      <p>Track partner bookstores, commission splits, stock shipments, and payment reconciliation all in one ledger.</p>
      <div class="empty-actions">
        <button class="btn gold" onclick="openM('add-store')">+ Add consignment store</button>
      </div>
    </div>`;
    return;
  }
  // ⚡ Bolt Optimization: tally the ledger ONCE per render, grouped by store,
  // instead of re-walking every ledger row for each store card (was
  // stores × ledger rows; now ledger rows + stores).
  const ledgerTally = new Map();
  for (const e of s.ledger || []) {
    let t = ledgerTally.get(e.storeId);
    if (!t) { t = { sent: 0, sold: 0, returned: 0, rows: 0 }; ledgerTally.set(e.storeId, t); }
    // Counted including voided rows: the "Ledger" button below exists to show
    // this store's paper trail, and a void is part of that trail even though
    // it moved nothing.
    t.rows += 1;
    if (e.voided) continue;
    if (e.type === 'Shipment') t.sent += e.qty || 0;
    else if (e.type === 'Sale') t.sold += e.qty || 0;
    else if (e.type === 'Return') t.returned += e.qty || 0;
  }
  el.innerHTML = s.stores.map(st => {
    const sp = st.outstanding === 0 && st.sent > 0 ? '<span class="pill gray">Settled</span>' : st.amountOwed > 0 ? '<span class="pill amber">Payment due</span>' : '<span class="pill green">Active</span>';

    // ── #3: Double-entry ledger balance check ───────────────────────────────
    const tally = ledgerTally.get(st.id);
    const ledgerSent = tally?.sent ?? 0, ledgerSold = tally?.sold ?? 0, ledgerReturned = tally?.returned ?? 0;
    const ledgerRows = tally?.rows ?? 0;
    const calculatedOutstanding = ledgerSent - ledgerSold - ledgerReturned;
    const isUnbalanced = (ledgerSent > 0 || st.sent > 0) && (
      st.sent !== ledgerSent ||
      st.sold !== ledgerSold ||
      st.outstanding !== calculatedOutstanding
    );
    // The mismatch used to be a red chip whose only explanation lived in a
    // `title` tooltip — unreachable on the tablet this screen is actually used
    // on. It is now a real button opening a native popover (top layer, Esc and
    // click-away for free) that names WHICH figure disagrees and by how much.
    const balancePopId = `store-balance-pop-${storeBalanceSlug(st.id)}`;
    const balanceRows = storeBalanceComparison(st, {
      sent: ledgerSent, sold: ledgerSold, returned: ledgerReturned, outstanding: calculatedOutstanding,
    });
    const rowOff = key => (isUnbalanced && balanceRows.find(r => r.key === key)?.off ? ' is-off' : '');
    const unbalancedBadge = isUnbalanced
      ? `<button type="button" class="pill red store-balance-flag" popovertarget="${balancePopId}" title="These figures disagree with the ledger — open for the details" aria-label="These figures disagree with the ledger — open for the details">⚠ Doesn't match</button>`
      : '';
    const unbalancedPopover = isUnbalanced
      ? `<div id="${balancePopId}" class="store-balance-pop" popover aria-labelledby="${balancePopId}-title">
        <div class="store-balance-pop-head">
          <span class="store-balance-pop-eyebrow">${escapeHtml(st.name)}</span>
          <button type="button" class="store-balance-pop-close" popovertarget="${balancePopId}" popovertargetaction="hide" aria-label="Close">✕</button>
        </div>
        <div class="store-balance-pop-title" id="${balancePopId}-title">These figures don't match the ledger</div>
        <p class="store-balance-pop-copy">The card shows the running totals saved against this store. The ledger column re-counts every shipment, sale and return you have actually recorded for them. Where the two differ, the ledger is the one to trust.</p>
        <table class="tbl store-balance-tbl"><thead><tr><th>Figure</th><th class="r">On the card</th><th class="r">In the ledger</th></tr></thead><tbody>${
  balanceRows.map(r => `<tr class="store-balance-row${r.off ? ' is-off' : ''}"><td>${r.label}</td><td class="r">${r.card ?? '—'}</td><td class="r">${r.ledger ?? '—'}</td></tr>`).join('')
}</tbody></table>
        <p class="store-balance-pop-foot">A gap almost always means a shipment, sale or return happened but never got written down. Add the missing entry in the consignment ledger below and the two columns line up again.</p>
      </div>`
      : '';
    // Marking the individual figure that disagrees means the card answers
    // "which number is wrong?" at a glance, before the popover is opened.
    const outstandingCell = `<div class="sk-v ${st.outstanding > 0 ? 'warn' : ''}${rowOff('outstanding')}">${st.outstanding ?? 0}</div>`;
    const sentCell = `<div class="sk-v${rowOff('sent')}">${st.sent ?? 0}</div>`;
    const soldCell = `<div class="sk-v${rowOff('sold')}">${st.sold ?? 0}</div>`;

    return `<div class="store-card" data-owes="${st.amountOwed > 0 ? 1 : 0}" data-holds="${st.outstanding > 0 ? 1 : 0}">${storePhoneRowHtml(st, cur, isUnbalanced)}<div class="store-head"><div><div class="store-name">${escapeHtml(st.name)}</div><div class="store-meta">${[[st.city, 'city'], [st.contact, 'contact'], [st.email, 'email']].filter(([v]) => v).map(([v, k]) => `<span class="store-meta-${k}">${escapeHtml(v)}</span>`).join('')}<span class="store-meta-rate">${st.rate}% commission</span></div></div><div class="store-head-flags">${sp}${unbalancedBadge}</div></div><div class="store-kpis"><div class="sk"><div class="sk-l">Sent</div>${sentCell}</div><div class="sk"><div class="sk-l">Sold</div>${soldCell}</div><div class="sk"><div class="sk-l">On shelf</div>${outstandingCell}</div><div class="sk"><div class="sk-l">Owed</div><div class="sk-v ${st.amountOwed > 0 ? 'warn' : ''}">${st.amountOwed > 0 ? fmt(st.amountOwed, cur) : '—'}</div></div></div><div class="store-actions"><button class="btn sm gold" onclick="openSend(${escapeHtml(JSON.stringify(st.id))})">Send books</button><button class="btn sm ink" onclick="openSale(${escapeHtml(JSON.stringify(st.id))})" ${!st.outstanding ? 'disabled' : ''}>Record sale</button><button class="btn sm" onclick="openRet(${escapeHtml(JSON.stringify(st.id))})" ${!st.outstanding ? 'disabled' : ''}>Return</button><button class="btn sm" onclick="showStoreLedger(${escapeHtml(JSON.stringify(st.id))})" ${ledgerRows ? '' : 'disabled'} title="${ledgerRows ? `Show this store's ${ledgerRows} ledger entr${ledgerRows === 1 ? 'y' : 'ies'} below` : 'Nothing in the ledger for this store yet'}">📒 Ledger</button><button class="btn sm" onclick="openEditStore(${escapeHtml(JSON.stringify(st.id))})">Edit</button><button class="btn sm danger-btn" onclick="removeStore(${escapeHtml(JSON.stringify(st.id))})">Remove</button></div>${unbalancedPopover}</div>`;
  }).join('');
  // Phone: Return, Ledger, Edit and Remove fold behind "More actions". A fresh
  // innerHTML means fresh buttons, so every card is folded again here.
  el.querySelectorAll('.store-actions').forEach(foldFooterActions);
  renderStoresPhoneHead(s.stores, cur);
}

// ── Phone Stores: a work queue ─────────────────────────────────────────
// Each store card leads with one summary row (initials, city, copies on the
// shelf, what it owes and one status word). On a phone the rest of the card
// stays folded until that row is tapped; wider screens never show the row.
function storeInitials(name) {
  const words = String(name || '').replace(/^the\s+/i, '').split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || '') + (words[1]?.[0] || words[0]?.[1] || '')).toUpperCase() || '··';
}
function storePhoneStatus(st, unbalanced) {
  if (unbalanced) return { text: "⚠ Doesn't match", tone: 'red' };
  if (st.amountOwed > 0) return { text: '! Payment due', tone: 'amber' };
  if (st.outstanding === 0 && st.sent > 0) return { text: '✓ Settled', tone: 'plain' };
  if (st.outstanding > 0) return { text: '● On shelf', tone: 'green' };
  return { text: '○ No books yet', tone: 'plain' };
}
function storePhoneRowHtml(st, cur, unbalanced) {
  const status = storePhoneStatus(st, unbalanced);
  const meta = [st.city, `${st.outstanding ?? 0} on shelf`].filter(Boolean).map(escapeHtml).join(' · ');
  return `<button type="button" class="store-row" aria-expanded="false" onclick="toggleStoreRow(this)">
    <span class="store-row-tag is-${status.tone}" aria-hidden="true">${escapeHtml(storeInitials(st.name))}</span>
    <span class="store-row-txt"><span class="store-row-name">${escapeHtml(st.name)}</span><span class="store-row-meta">${meta}</span></span>
    <span class="store-row-end"><span class="store-row-owed tnum">${st.amountOwed > 0 ? escapeHtml(fmt(st.amountOwed, cur)) : '—'}</span><span class="phone-pill is-${status.tone}">${escapeHtml(status.text)}</span></span>
  </button>`;
}
export function toggleStoreRow(button) {
  const card = button.closest('.store-card');
  const open = card.classList.toggle('is-open');
  button.setAttribute('aria-expanded', String(open));
}

let storesPhoneFilter = 'all';
function renderStoresPhoneHead(stores, cur) {
  const head = $('stores-phone-head');
  const list = $('stores-list');
  if (!head || !list) return;
  let owed = 0, shelf = 0, owing = 0, holding = 0;
  for (const st of stores) {
    owed += st.amountOwed || 0; shelf += st.outstanding || 0;
    if (st.amountOwed > 0) owing += 1;
    if (st.outstanding > 0) holding += 1;
  }
  const chip = (key, label, n) => `<button type="button" class="book-chip${storesPhoneFilter === key ? ' is-on' : ''}" aria-pressed="${storesPhoneFilter === key}" onclick="setStoresPhoneFilter('${key}')">${label} <span class="tnum">${n}</span></button>`;
  head.innerHTML = stores.length ? `<div class="phone-ledger is-three">
      <div class="ledger-fig${owed > 0 ? ' is-owed' : ''}"><span class="ledger-label">Owed</span><span class="ledger-value tnum">${owed > 0 ? escapeHtml(fmtWhole(owed, cur)) : '—'}</span></div>
      <div class="ledger-fig"><span class="ledger-label">On shelves</span><span class="ledger-value tnum">${shelf}</span></div>
      <div class="ledger-fig"><span class="ledger-label">Stores</span><span class="ledger-value tnum">${stores.length}</span></div>
    </div>
    <div class="phone-chips" role="group" aria-label="Show stores">${chip('owe', 'Owe you', owing)}${chip('holds', 'Holding books', holding)}${chip('all', 'All', stores.length)}</div>` : '';
  list.dataset.phoneFilter = storesPhoneFilter;
}
export function setStoresPhoneFilter(key) {
  storesPhoneFilter = ['owe', 'holds'].includes(key) ? key : 'all';
  const s = getState();
  renderStoresPhoneHead(s.stores, getBook().currency);
}
Object.assign(window, { toggleStoreRow, setStoresPhoneFilter });
async function removeStore(id) {
  if (!(await confirmDialog('Remove this store?', { okLabel: 'Remove', danger: true }))) return;
  getState().stores = getState().stores.filter(s => s.id !== id);
  renderStores(); updateDash(); saveState(activeBook);
}
function openEditStore(id) { activeId = id; const st = storeById(id); if (!st) return; $('es-name').value = st.name; $('es-contact').value = st.contact || ''; $('es-email').value = st.email || ''; $('es-phone').value = st.phone || ''; $('es-address').value = st.address || ''; $('es-city').value = st.city || ''; $('es-region').value = st.region || ''; $('es-postal').value = st.postal || ''; $('es-country').value = st.country || ''; $('es-website').value = st.website || ''; $('es-terms').value = st.terms || ''; $('es-rate').value = st.rate; $('es-notes').value = st.notes || ''; { const bookCode = getBookCurrencyCode(getBook()); fillConsignCurrencySelect($('es-currency'), bookCode, storeSaleCurrency(st, bookCode, [bookCode, ...PICKER_CURRENCIES])); } openM('edit-store'); }
function confirmEditStore() {
  const st = storeById(activeId); if (!st) return;
  if (!validateFields([
    { id: 'es-name', test: v => v.trim().length > 0, msg: 'Store name is required' },
    { id: 'es-rate', test: v => { if (v.trim() === '') return true; const n = parseFloat(v); return !isNaN(n) && n >= 0 && n <= 100; }, msg: 'Commission must be between 0 and 100' },
  ])) return;
  const name = $('es-name').value.trim();
  st.name = name; st.contact = $('es-contact').value.trim(); st.email = $('es-email').value.trim(); st.phone = $('es-phone').value.trim(); st.address = $('es-address').value.trim(); st.city = $('es-city').value.trim(); st.region = $('es-region').value.trim(); st.postal = $('es-postal').value.trim(); st.country = $('es-country').value.trim(); st.website = $('es-website').value.trim(); st.terms = $('es-terms').value.trim(); { const r = parseFloat($('es-rate').value); if (Number.isFinite(r)) st.rate = r; } st.notes = $('es-notes').value.trim();
  { const bookCode = getBookCurrencyCode(getBook()), code = $('es-currency') ? $('es-currency').value : ''; if (code && code !== bookCode) st.currency = code; else delete st.currency; }
  closeM('edit-store'); renderStores(); updateDash(); saveState(activeBook); showToast('✓ Store updated');
}
function openSend(id) { activeId = id; const st = storeById(id); $('send-sname').textContent = st.name; $('send-rate').value = st.rate; openM('send-books'); updateSendPreview(); }
// One line above the buttons saying what the send will move, so a wrong count
// or the wrong store is caught before it reaches the stock figures.
function updateSendPreview() {
  const el = $('send-preview'); if (!el) return;
  const s = getState(), st = storeById(activeId), qty = parseInt($('send-qty').value) || 0;
  if (!st || qty <= 0) { el.textContent = ''; return; }
  el.textContent = qty > s.stock
    ? `Only ${s.stock} in stock`
    : `Stock on hand ${s.stock} → ${s.stock - qty} · ${st.name}'s shelf ${st.outstanding} → ${st.outstanding + qty}`;
}
function confirmSend() {
  const s = getState(), book = getBook(), st = storeById(activeId);
  if (!validateFields([
    { id: 'send-qty', test: v => (parseInt(v) || 0) > 0, msg: 'Enter a quantity greater than 0' },
    { id: 'send-qty', test: v => (parseInt(v) || 0) <= s.stock, msg: `Only ${s.stock} in stock` },
    { id: 'send-rate', test: v => { const n = parseFloat(v); return !isNaN(n) && n >= 0 && n <= 100; }, msg: 'Commission must be between 0 and 100' },
  ])) return;
  const qty = parseInt($('send-qty').value) || 0, date = $('send-date').value, rate = Number.isFinite(parseFloat($('send-rate').value)) ? parseFloat($('send-rate').value) : st.rate, notes = $('send-notes').value.trim();
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
  $('bulk-send-list').innerHTML = s.stores.map(st => `<label class="bulk-send-row">
    <input type="checkbox" class="bulk-send-check" data-sid="${st.id}" onchange="bulkCheckChanged('${st.id}')">
    <span class="bulk-send-info"><span class="bulk-send-name">${escapeHtml(st.name)}</span>${st.city ? `<span class="bulk-send-city"> · ${escapeHtml(st.city)}</span>` : ''}<br><span class="bulk-send-meta">${st.rate}% commission · <span class="mono-num">${st.outstanding}</span> outstanding</span></span>
    <input type="number" class="bulk-send-qty" data-sid="${st.id}" min="0" value="0" inputmode="numeric" oninput="bulkQtyChanged('${st.id}')">
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
  if (totEl) totEl.style.color = total > stock ? 'var(--status-critical)' : '';
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
// ── Consignment in another currency ─────────────────────────────────────
// A shop abroad sells at its own price and may pay in its own money. The ledger
// still keeps one book-currency figure per sale (every total adds those up);
// the foreign side rides along on the row. See lib/consignment-fx.js.
function fillConsignCurrencySelect(sel, bookCode, selected) {
  if (!sel) return;
  const codes = [bookCode, ...PICKER_CURRENCIES.filter(c => c !== bookCode)];
  sel.innerHTML = codes.map(c => `<option value="${c}">${c} ${escapeHtml(getSym(c))}${c === bookCode ? ' · book' : ''}</option>`).join('');
  setSelectCurrency(sel, selected || bookCode);
}

// The rate for `date` (falling back to today's) as "1 from = rate to", or 0.
async function lookupConsignRate(from, to, date) {
  if (from === to) return 1;
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date || '') && date <= today()) {
      const dated = await fetchHistoricalRate(from, to, date);
      if (dated && dated.rate) return dated.rate;
    }
    const live = await fetchLiveRate(from, to);
    return (live && live.rate) || 0;
  } catch (e) { return 0; }
}

// Shows the rate row for a foreign currency and fills it from the lookup.
// `token` guards against a slow answer for an earlier choice landing late.
const _consignFxToken = { sale: 0, cp: 0 };
async function refreshConsignRate(prefix, cur, bookCode, date, onDone) {
  const row = $(`${prefix}-fx-row`), input = $(`${prefix}-fx-rate`), note = $(`${prefix}-fx-note`);
  const modalId = prefix === 'sale' ? 'record-sale' : 'consign-payment';
  const token = ++_consignFxToken[prefix === 'sale' ? 'sale' : 'cp'];
  if (!row || !input) return;
  if (cur === bookCode) { row.hidden = true; input.value = ''; input.dataset.cur = ''; onDone(); return; }
  row.hidden = false;
  $(`${prefix}-fx-from`).textContent = `1 ${cur} =`;
  $(`${prefix}-fx-to`).textContent = bookCode;
  // A rate belongs to one currency: switching currency drops the old one.
  if (input.dataset.cur !== cur) { input.value = ''; input.dataset.cur = cur; }
  if (note) { note.textContent = 'Looking up the exchange rate…'; note.classList.remove('warn'); }
  // A rate typed before the lookup answers is the user's: keep it.
  const typedBefore = input.value;
  onDone();
  const rate = await lookupConsignRate(cur, bookCode, date);
  if (token !== _consignFxToken[prefix === 'sale' ? 'sale' : 'cp']) return;
  if (rate) {
    const wasClean = !modalFieldsChanged(modalId);
    if (input.value === typedBefore) input.value = Number(rate).toFixed(4);
    rebaselineModal(modalId, wasClean);
    refreshUnsavedMarkers();
    if (note) note.textContent = prefix === 'sale'
      ? 'Looked up for the sale date. Change it if your bank used a different rate.'
      : 'Looked up for the date received. Change it to match your bank statement.';
  } else if (note) {
    note.textContent = 'Couldn’t look up a rate (offline?). Type the rate from your bank statement.';
    note.classList.add('warn');
    if (!input.value) input.focus();
  }
  onDone();
}

// The shop's last price in its own currency, from its latest sale recorded in
// that currency — a Rome shop's €20 is the useful default, not the book's
// CA$40 relabelled as euros. 0 when it has none.
function lastStoreSalePrice(s, storeId, code) {
  for (let i = (s.ledger || []).length - 1; i >= 0; i--) {
    const e = s.ledger[i];
    if (e.type === 'Sale' && !e.voided && e.storeId === storeId && e.sale && e.sale.currency === code && Number(e.sale.unitPrice) > 0) return Number(e.sale.unitPrice);
  }
  return 0;
}
function openSale(id) {
  activeId = id; const s = getState(), book = getBook(), bookCode = getBookCurrencyCode(book), st = storeById(id);
  // Each store remembers the currency it sells in (set the last time a sale
  // was recorded for it, or on Edit store), so a shop abroad opens in euros.
  const saleCode = storeSaleCurrency(st, bookCode, [bookCode, ...PICKER_CURRENCIES]);
  fillConsignCurrencySelect($('sale-cur'), bookCode, saleCode);
  $('sale-fx-row').hidden = true; $('sale-fx-rate').value = ''; $('sale-fx-rate').dataset.cur = '';
  const lastPrice = saleCode === bookCode ? book.listPrice : lastStoreSalePrice(s, id, saleCode);
  $('sale-price').value = lastPrice ? Number(lastPrice).toFixed(2) : '';
  $('sale-sname').textContent = st.name;
  // The "draft an invoice after saving" shortcut only makes sense where the
  // Invoices panel is available (publisher, single-book view).
  const invRow = $('sale-invoice-row');
  if (invRow) invRow.style.display = invoicesVisibleHere() ? '' : 'none';
  if ($('sale-makeinvoice')) $('sale-makeinvoice').checked = false;
  openM('record-sale');
  if (saleCode !== bookCode) onConsignSaleCurrencyChange();
  else updateConsignSalePreview();
}
function onConsignSaleCurrencyChange() {
  const bookCode = getBookCurrencyCode(getBook());
  refreshConsignRate('sale', $('sale-cur').value, bookCode, $('sale-date').value, updateConsignSalePreview);
}
function consignSaleFormAmounts() {
  const book = getBook(), st = storeById(activeId);
  if (!st) return null;
  return consignmentSaleAmounts({
    qty: parseInt($('sale-qty').value) || 0,
    unitPrice: parseFloat($('sale-price').value) || 0,
    commission: st.rate,
    saleCur: $('sale-cur').value,
    bookCur: getBookCurrencyCode(book),
    fxRate: parseFloat($('sale-fx-rate').value),
  });
}
function updateConsignSalePreview() {
  const el = $('sale-preview'); if (!el) return;
  const st = storeById(activeId), bookCode = getBookCurrencyCode(getBook());
  const a = consignSaleFormAmounts();
  if (!st || !a) { el.textContent = $('sale-cur').value !== bookCode ? 'Add an exchange rate to see what this is worth in ' + bookCode + '.' : ''; return; }
  if (!a.gross) { el.textContent = ''; return; }
  const qty = parseInt($('sale-qty').value) || 0;
  const shelf = qty > 0 && qty <= st.outstanding ? `Shelf ${st.outstanding} → ${st.outstanding - qty} · ` : '';
  el.textContent = shelf + (a.sale
    ? `Store keeps ${st.rate}% · you’re owed ${fmt(a.sale.due, a.sale.currency)} ≈ ${fmt(a.due, bookCode)}`
    : `Store keeps ${st.rate}% · you’re owed ${fmt(a.due, bookCode)}`);
}
function confirmSale() {
  const s = getState(), book = getBook(), cur = book.currency, st = storeById(activeId);
  const bookCode = getBookCurrencyCode(book), saleCur = $('sale-cur').value || bookCode;
  if (!validateFields([
    { id: 'sale-qty', test: v => (parseInt(v) || 0) > 0, msg: 'Enter a quantity greater than 0' },
    { id: 'sale-qty', test: v => (parseInt(v) || 0) <= st.outstanding, msg: `Only ${st.outstanding} outstanding` },
    { id: 'sale-price', test: v => (parseFloat(v) || 0) > 0, msg: 'Enter a price greater than 0' },
    ...(saleCur !== bookCode ? [{ id: 'sale-fx-rate', test: v => (parseFloat(v) || 0) > 0, msg: `Enter how many ${bookCode} one ${saleCur} is worth` }] : []),
  ])) return;
  const qty = parseInt($('sale-qty').value) || 0, date = $('sale-date').value, paid = $('sale-paid').value, notes = $('sale-notes').value.trim();
  const amounts = consignSaleFormAmounts();
  if (!amounts) return;
  // Capture before closeM clears modal state: open a prefilled invoice afterward?
  const makeInvoice = invoicesVisibleHere() && $('sale-makeinvoice') && $('sale-makeinvoice').checked;
  const invoiceStoreId = st.id;
  const pub = amounts.due;
  // Not the shared sale step (addSaleToState): these copies left stock when
  // they were shipped to the store, so a store sale moves revenue and the
  // store's counts but never the stock on hand.
  st.sold += qty; st.outstanding -= qty; st.amountOwed = roundCents((st.amountOwed || 0) + (paid === 'pending' ? pub : 0));
  s.sold += qty; s.revenue += pub;
  if (!s.chStats['Consignment']) s.chStats['Consignment'] = { txns: 0, units: 0, revenue: 0 };
  s.chStats['Consignment'].txns++; s.chStats['Consignment'].units += qty; s.chStats['Consignment'].revenue += pub;
  const num = 'CON-' + st.name.replace(/\s+/g, '').slice(0, 5).toUpperCase() + '-' + Date.now().toString().slice(-4);
  // Share one sheetsId between the hist mirror and the ledger entry so they
  // map to the SAME row in Sheets — editing or voiding either updates the
  // single underlying row instead of producing duplicates.
  const sheetsId = makeEventId();
  const entry = { id: Date.now(), storeId: st.id, storeName: st.name, type: 'Sale', date, qty, rate: st.rate, amountDue: pub, paid, notes, status: paid, sheetsId, cur: bookCurrencyCode(book) };
  // Remember the store's currency for its next sale (cleared back to the
  // book's when a sale is recorded in the book's own currency).
  if (saleCur !== bookCode) st.currency = saleCur; else delete st.currency;
  if (amounts.sale) entry.sale = amounts.sale;
  // Marked paid on the spot: the money came in the currency the shop sold in.
  if (paid === 'paid') {
    const exp = expectedConsignmentPayment(entry, bookCode);
    const rec = consignmentPaymentRecord({ amountDue: pub, bookCur: bookCode, payCur: exp.currency, payAmount: exp.amount, fxRate: amounts.sale ? amounts.sale.rate : 1, date });
    if (rec && rec.currency !== bookCode) entry.payment = rec;
  }
  const histRow = { num, chan: 'Consignment', qty, price: pub / qty, after: s.stock, notes: st.name, date, sheetsId, consignmentLink: true, cur: bookCurrencyCode(book) };
  s.hist.unshift(histRow);
  s.ledger.push(entry);
  recomputeAfters(s, book);
  closeM('record-sale'); renderStores(); renderLedger(); renderHist(); updateDash(); saveState(activeBook);
  syncToSheets({ type: 'consignment', book: book.title, date, store: st.name, event: 'Sale', qty, rate: st.rate, amountDue: pub, notes, status: paid, sheetsId, currency: getBookCurrencyCode(book) });
  showToast(amounts.sale
    ? `✓ Sale recorded — ${fmt(amounts.sale.due, amounts.sale.currency)} (≈ ${fmt(pub, cur)}) due to you`
    : `✓ Sale recorded — ${fmt(pub, cur)} due to you`);
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
// histMirrorForLedger / stampLedgerInvoiceLink / reconcileConsignmentMirrors /
// syncHistMirrorFromLedger / ledgerSaleIndexForHistMirror / consignmentSyncPayload
// are pure and live in ./lib/consignment.js (tested there); they're imported at
// the top of this module.

// Canonical "mark this sale paid": guards pending/non-voided, reduces the store's
// owed, flips ledger + hist mirror state. Returns true if it actually changed.
// Looks ledger rows up by id in one pass, so walking an invoice's lines costs
// one scan of the ledger instead of one scan per line. Keeps the first row for
// a repeated id, exactly like the `.find` it replaces.
export function ledgerById(s) {
  const map = new Map();
  for (const x of (s.ledger || [])) if (x && !map.has(x.id)) map.set(x.id, x);
  return map;
}

export function settleLedgerSalePaid(s, e) {
  if (!e || e.status !== 'pending' || e.voided) return false;
  const st = (s.stores || []).find(x => x.id === e.storeId);
  if (st) st.amountOwed = roundCents(Math.max(0, (st.amountOwed || 0) - (e.amountDue || 0)));
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
  // ⚡ Bolt Optimization: Loop fusion - Combine map, filter, and some into a single loop
  // to avoid intermediate array allocations and multiple passes over the ledger.
  let hasLinked = false;
  let allPaid = true;
  const ledger = ledgerById(s);
  for (const it of (inv.items || [])) {
    if (it._ledgerId) {
      const e = ledger.get(it._ledgerId);
      if (e && !e.voided) {
        hasLinked = true;
        if (e.status !== 'paid') {
          allPaid = false;
          break; // Early exit once an unpaid linked sale is found
        }
      }
    }
  }

  if (!hasLinked || !allPaid) return;
  inv.status = 'paid'; inv.paidAt = Date.now(); inv.paidMethod = 'Ledger';
}

// A small clickable badge linking a ledger/history row back to its invoice; '' when
// unlinked. Reused by the ledger and history renderers. viewInvoice is global.
function invoiceBadgeHTML(invoiceId, invoiceNum) {
  if (!invoiceId || !invoiceNum) return '';
  return `<button class="pill gray" style="font-size:var(--text-2xs);cursor:pointer;margin-left:6px;" onclick="viewInvoice('${invoiceId}')">🧾 ${escapeHtml(invoiceNum)}</button>`;
}

// "Mark paid" asks what actually arrived: a shop abroad may pay in its own
// currency (or the bank may convert it), so the amount, currency and rate are
// recorded on the row and the store's owed balance clears either way.
// One form, two callers: a single ledger sale ("Mark paid" on the row) or a
// whole invoice ("✓ Mark paid" in the invoice view), whose payment is shared
// across the sales it bills.
//   { kind: 'sale', lid }            — a ledger Sale row in the current book
//   { kind: 'invoice', id, bookId }  — an invoice and the book that holds it
let _cpCtx = null;

// Everything the form needs about what is being paid, resolved fresh each
// time so a sync landing while the form is open can't leave it stale.
function consignPaymentTarget() {
  if (!_cpCtx) return null;
  if (_cpCtx.kind === 'sale') {
    const s = getState(), book = getBook(), e = s.ledger.find(x => x.id === _cpCtx.lid);
    if (!e) return null;
    const bookCode = getBookCurrencyCode(book);
    return { s, book, bookCode, rows: [e], baseDue: e.amountDue, expected: expectedConsignmentPayment(e, bookCode), name: e.storeName || '' };
  }
  const { inv, bookId, s } = invoiceHome(_cpCtx.id);
  if (!inv) return null;
  const book = BOOKS[bookId] || getBook(), bookCode = getBookCurrencyCode(book);
  const invCode = normalizeCurrencyCode(inv.currencyCode || getBookCurrencyCode({ currency: inv.currency || book.currency }), bookCode);

  // ⚡ Bolt Optimization: Loop fusion - Combine map, filter, and reduce into a single loop
  // to avoid intermediate array allocations and multiple passes over the items.
  const rows = [];
  let sumAmountDue = 0;
  const ledger = ledgerById(s);
  for (const it of (inv.items || [])) {
    if (it._ledgerId) {
      const e = ledger.get(it._ledgerId);
      if (e && e.status === 'pending' && !e.voided) {
        rows.push(e);
        sumAmountDue += (Number(e.amountDue) || 0);
      }
    }
  }

  // What the ledger expects in the book's currency: the linked sales it will
  // clear, or — with none linked — the invoice total when it's already in
  // the book's currency. Otherwise there's nothing to measure a shortfall by.
  const baseDue = rows.length ? roundCents(sumAmountDue)
    : (invCode === bookCode ? Number(inv.total) || 0 : null);
  return { s, book, bookId, bookCode, inv, rows, baseDue, expected: { currency: invCode, amount: roundCents(Number(inv.total) || 0) }, name: inv.num || '' };
}

export function openConsignPayment(ctx) {
  _cpCtx = ctx;
  const t = consignPaymentTarget();
  if (!t) { _cpCtx = null; return; }
  const { bookCode, expected } = t;
  $('cp-sname').textContent = t.name;
  if (ctx.kind === 'invoice') {
    const n = t.rows.length;
    $('cp-expected').textContent = `Invoice total: ${fmt(expected.amount, expected.currency)}.` +
      (n ? ` Marks its ${n} linked sale${n === 1 ? '' : 's'} paid (${fmt(t.baseDue, bookCode)} in the ledger).` : '');
  } else {
    $('cp-expected').textContent = expected.currency !== bookCode
      ? `Owed for this sale: ${fmt(expected.amount, expected.currency)} (recorded as ${fmt(t.baseDue, bookCode)}).`
      : `Owed for this sale: ${fmt(t.baseDue, bookCode)}.`;
  }
  fillConsignCurrencySelect($('cp-cur'), bookCode, expected.currency);
  $('cp-amount').value = expected.amount.toFixed(2);
  $('cp-date').value = today();
  $('cp-fx-row').hidden = true; $('cp-fx-rate').value = ''; $('cp-fx-rate').dataset.cur = '';
  openM('consign-payment');
  onConsignPaymentCurrencyChange();
}

// "Mark paid" asks what actually arrived: a shop abroad may pay in its own
// currency (or the bank may convert it), so the amount, currency and rate are
// recorded on the row and the store's owed balance clears either way.
function markPaid(lid) {
  const e = getState().ledger.find(x => x.id === lid);
  if (!e || e.status !== 'pending' || e.voided) return;
  openConsignPayment({ kind: 'sale', lid });
}
function onConsignPaymentCurrencyChange() {
  const t = consignPaymentTarget(); if (!t) return;
  refreshConsignRate('cp', $('cp-cur').value, t.bookCode, $('cp-date').value, updateConsignPaymentPreview);
}
function consignPaymentFormRecord(t = consignPaymentTarget()) {
  if (!t) return null;
  return consignmentPaymentRecord({
    amountDue: t.baseDue == null ? 0 : t.baseDue,
    bookCur: t.bookCode,
    payCur: $('cp-cur').value,
    payAmount: parseFloat($('cp-amount').value) || 0,
    fxRate: parseFloat($('cp-fx-rate').value),
    date: $('cp-date').value,
  });
}
// With nothing to measure against (a foreign invoice with no linked sales),
// a payment can't be "short" — record it as exactly what arrived.
function withoutDifferenceIfUnmeasured(rec, t) {
  if (rec && t && t.baseDue == null) rec.difference = 0;
  return rec;
}
// "Harbour Lights owes $40.00 → $0.00": what marking these sales paid takes off
// the store's Owed figure. Only when they all belong to one store.
function consignPaymentOwedLine(t) {
  const drop = new Map();
  for (const e of t.rows) if (e.status === 'pending' && !e.voided) drop.set(e.storeId, (drop.get(e.storeId) || 0) + (Number(e.amountDue) || 0));
  if (drop.size !== 1) return '';
  const [[id, amount]] = drop;
  const st = (t.s.stores || []).find(x => x.id === id);
  if (!st) return '';
  const before = roundCents(st.amountOwed || 0);
  return `${st.name} owes ${fmt(before, t.bookCode)} → ${fmt(roundCents(Math.max(0, before - amount)), t.bookCode)}.`;
}
function updateConsignPaymentPreview() {
  const el = $('cp-preview'); if (!el) return;
  const t = consignPaymentTarget(); if (!t) return;
  const owed = consignPaymentOwedLine(t);
  const show = (text, warn = false) => { el.textContent = [owed, text].filter(Boolean).join(' '); el.classList.toggle('warn', warn); };
  const bookCode = t.bookCode;
  const rec = withoutDifferenceIfUnmeasured(consignPaymentFormRecord(t), t);
  if (!rec) { show($('cp-cur').value !== bookCode ? `Add an exchange rate to see what this is worth in ${bookCode}.` : ''); return; }
  if (!rec.amount) { show(''); return; }
  const worth = rec.currency !== bookCode ? `Worth ${fmt(rec.convertedTotal, bookCode)}. ` : '';
  // Paid in the invoice's own currency: compare with the invoice total
  // directly, so a partial payment shows in the number the shop was billed.
  if (t.inv && rec.currency === t.expected.currency) {
    const gap = roundCents(rec.amount - t.expected.amount);
    if (gap < 0) { show(`${worth}That’s ${fmt(-gap, rec.currency)} less than the invoice total. It still counts as paid in full.`, true); return; }
    if (gap > 0) { show(`${worth}That’s ${fmt(gap, rec.currency)} more than the invoice total.`); return; }
    show(`${worth}Matches the invoice total.`); return;
  }
  if (t.baseDue == null || Math.abs(rec.difference) < 0.01) { show(`${worth}${t.baseDue == null ? '' : 'Matches what’s owed.'}`.trim()); return; }
  show(rec.difference < 0
    ? `${worth}That’s ${fmt(-rec.difference, bookCode)} less than recorded — usually the exchange rate or a bank fee. It still counts as paid.`
    : `${worth}That’s ${fmt(rec.difference, bookCode)} more than recorded.`, rec.difference < 0);
}
function confirmConsignPayment() {
  const t = consignPaymentTarget();
  if (!t) { closeM('consign-payment'); return; }
  const { s, bookCode } = t, payCur = $('cp-cur').value || bookCode;
  if (!validateFields([
    { id: 'cp-amount', test: v => (parseFloat(v) || 0) > 0, msg: 'Enter the amount you received' },
    ...(payCur !== bookCode ? [{ id: 'cp-fx-rate', test: v => (parseFloat(v) || 0) > 0, msg: `Enter how many ${bookCode} one ${payCur} is worth` }] : []),
  ])) return;
  const rec = withoutDifferenceIfUnmeasured(consignPaymentFormRecord(t), t);
  if (!rec) return;
  // Only stamp a payment that tells you something the row doesn't already:
  // another currency, or a different amount than was owed.
  const worthStamping = r => r.currency !== bookCode || Math.abs(r.difference) >= 0.01;
  if (t.inv) {
    // Share it across the linked sales BEFORE settling (settling is what
    // takes them off the pending list), then settle through the one writer.
    const parts = splitConsignmentPayment(rec, t.rows);
    t.rows.forEach((e, i) => { if (worthStamping(parts[i])) e.payment = parts[i]; });
    if (rec.currency !== bookCode || Math.abs(rec.amount - t.expected.amount) >= 0.01 || rec.currency !== t.expected.currency) t.inv.payment = rec;
    applyInvoicePaid(t.inv, t.bookId, s);
    for (const e of t.rows) if (sheetsUrl && e.sheetsId) {
      try { syncToSheets(consignmentSyncPayload(t.book, e)); } catch (err) { console.error(err); }
    }
    const after = _cpCtx && _cpCtx.after;
    closeM('consign-payment');
    renderInvoices(); renderStores(); renderLedger(); renderHist(); updateDash();
    // Opened from the invoice view → refresh it; from elsewhere → let that
    // screen repaint itself instead of popping the invoice open.
    if (after) after(); else viewInvoice(t.inv.id);
    showToast(rec.currency !== bookCode
      ? `✓ ${t.inv.num} paid — ${fmt(rec.amount, rec.currency)} (≈ ${fmt(rec.convertedTotal, bookCode)})`
      : `✓ ${t.inv.num} marked paid`);
    return;
  }
  const e = t.rows[0];
  // Canonical settle (reduces owed, flips ledger + hist mirror); then auto-flip
  // the invoice to paid if this was its last unpaid linked sale (decision #1).
  if (!settleLedgerSalePaid(s, e)) { closeM('consign-payment'); return; }
  if (worthStamping(rec)) e.payment = rec;
  maybeAutoPayInvoiceForLedger(s, e);
  if (sheetsUrl && e.sheetsId) {
    try { syncToSheets(consignmentSyncPayload(t.book, e)); } catch (err) { console.error(err); }
  }
  closeM('consign-payment');
  renderLedger(); renderStores(); renderInvoices(); renderHist(); updateDash(); saveState(activeBook);
  showToast(rec.currency !== bookCode
    ? `✓ ${fmt(rec.amount, rec.currency)} received (≈ ${fmt(rec.convertedTotal, bookCode)}) — sale marked paid`
    : `✓ Payment of ${fmt(rec.amount, bookCode)} marked as received`);
}

async function markHistoryConsignmentPaid(num) {
  const s = getState();
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
  // markPaid opens the payment form, which is its own confirmation.
  markPaid(e.id);
}
// The ledger sits directly under the Stores and Invoices panels, both of which
// already offer an icon, a sentence and a way forward when empty — this one
// said "No entries." and stopped, which read as unfinished next to them. The
// two routes into the ledger are shipping stock out and recording what sold,
// so those are the exits offered.
function consignmentLedgerEmptyHtml() {
  return `<div class="empty-state sys-empty">
      <div class="e-icon" aria-hidden="true">📒</div>
      <strong>Nothing in the consignment ledger yet</strong>
      <span>Every shipment you send a store, every copy they sell and every book that comes back is recorded here, with what each sale still owes you.</span>
      <div class="sys-empty-actions">
        <button class="btn gold lg" onclick="openM('add-store')">+ Add a store</button>
        <button class="btn lg" onclick="openBulkSend()">📦 Send books out</button>
      </div>
    </div>`;
}

// The total the table never had. One row per currency the ledger was recorded
// in — deliberately not one combined figure, because adding CA$ to € would
// produce a number that is wrong in both.
function consignmentLedgerFootHtml(totals, scope = '') {
  if (!totals || !totals.length) return '';
  // When the table has been narrowed to one store, the totals underneath are
  // that store's — saying so inline is the difference between "the shops owe me
  // €84" and "this shop owes me €84", which are very different sentences to act
  // on.
  const scopeTag = scope ? ` <span class="ledger-total-scope">${escapeHtml(scope)}</span>` : '';
  return totals.map((t) => {
    const owed = t.outstanding ?? 0;
    const settled = t.paid ?? 0;
    const sym = getSym(t.code);
    const unpaid = t.outstandingCount ?? 0;
    const settledNote = settled > 0
      ? `${sym}${settled.toFixed(2)} settled`
      : 'nothing settled yet';
    // All-clear is worth stating outright: it is the answer to "is anyone
    // behind on paying me?", and a bare 0.00 does not read as reassurance.
    const label = owed > 0
      ? `Still owed to you${scopeTag}<span class="ledger-total-sub">${unpaid} unpaid sale${unpaid === 1 ? '' : 's'} · ${escapeHtml(settledNote)}</span>`
      : `All settled${scopeTag}<span class="ledger-total-sub">no unpaid sales · ${escapeHtml(settledNote)}</span>`;
    const valueClass = owed > 0 ? 'ledger-total-val is-owed' : 'ledger-total-val is-clear';
    const codeTag = totals.length > 1
      ? ` <span class="chip-status gray">${escapeHtml(t.code)}</span>`
      : '';
    return `<tr class="ledger-total-row">
        <td colspan="5" class="ledger-total-label">${label}</td>
        <td class="r mono-num ${valueClass}">${sym}${owed.toFixed(2)}</td>
        <td colspan="2">${owed > 0 ? '<span class="pill amber">● Outstanding</span>' : '<span class="pill green">✓ Clear</span>'}${codeTag}</td>
      </tr>`;
  }).join('');
}

// ── CONSIGNMENT LEDGER FILTER ───────────────────────────────────────────
// Which slice of the ledger is on screen. Carries the book it was set on for
// the same reason `histChanFilter` does: switching books must not leave a
// filter pointing at a store that belongs to a different title, which would
// render an empty table with no obvious cause.
let conLedgerFilter = { ...emptyLedgerFilter(), bookId: null };

function activeConLedgerFilter() {
  if (conLedgerFilter.bookId !== activeBook) conLedgerFilter = { ...emptyLedgerFilter(), bookId: activeBook };
  return conLedgerFilter;
}

function setConLedgerFilter(patch) {
  conLedgerFilter = { ...activeConLedgerFilter(), ...patch, bookId: activeBook };
  renderLedger();
}

function setConLedgerStore(storeId) {
  setConLedgerFilter({ storeId: storeId ? String(storeId) : null });
}

// Type chips and the unpaid chip are toggles, not a radio set: pressing the one
// that is already on clears it, which is what the ✕ the pressed state grows is
// promising.
function toggleConLedgerType(type) {
  const cur = activeConLedgerFilter();
  setConLedgerFilter({ type: cur.type === type ? null : type });
}

function toggleConLedgerUnpaid() {
  setConLedgerFilter({ unpaidOnly: !activeConLedgerFilter().unpaidOnly });
}

function clearConLedgerFilter() {
  conLedgerFilter = { ...emptyLedgerFilter(), bookId: activeBook };
  renderLedger();
}

// Jump from a store card straight to that store's rows. This is the whole point
// of the filter: the card says a shop owes you money, and this is the one click
// that shows which sales that is.
function showStoreLedger(storeId) {
  setConLedgerFilter({ storeId: storeId ? String(storeId) : null, type: null, unpaidOnly: false });
  // On a phone the ledger is its own section and its filter starts folded, so
  // open both before scrolling, or the jump lands on a hidden control.
  setConSection('ledger');
  setConLedgerFilterOpen(true);
  const wrap = $('con-ledger-filter');
  if (wrap && typeof wrap.scrollIntoView === 'function') {
    wrap.scrollIntoView({ behavior: _prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }
  const sel = $('con-ledger-store');
  if (sel && typeof sel.focus === 'function') sel.focus({ preventScroll: true });
}

/**
 * The controls above the ledger. Rebuilt on every ledger render so the store
 * picker and the chip counts can never describe a ledger that has since changed
 * underneath them.
 */
// ── Consignment sections on a phone ─────────────────────────────────────
// Stores, Invoices and Ledger take turns on a phone (the tab row is in
// index.html). Above 768px the CSS shows all three and this state is unused.
// The choice is remembered for the session, so a reload comes back to it. An
// Invoices choice falls back to Stores while the bills are not shown (non-
// publisher, or no single title open), and comes back once they are.
const CON_SECTIONS = ['stores', 'invoices', 'ledger'];
const CON_SECTION_KEY = 'lm-con-section';
function readConSectionChoice() {
  try {
    const v = sessionStorage.getItem(CON_SECTION_KEY);
    return CON_SECTIONS.includes(v) ? v : 'stores';
  } catch (_) {
    return 'stores';
  }
}
let conSectionChoice = readConSectionChoice();
export function applyConSection() {
  const panel = $('tab-consignment');
  if (!panel) return;
  const invoicesSec = $('invoices-section');
  const invoicesShown = !!invoicesSec && invoicesSec.style.display !== 'none';
  const invoicesTab = $('con-tab-invoices');
  if (invoicesTab) invoicesTab.hidden = !invoicesShown;
  const active = conSectionChoice === 'invoices' && !invoicesShown ? 'stores' : conSectionChoice;
  panel.dataset.conActive = active;
  panel.querySelectorAll('[role="tab"][data-con-tab]').forEach((tab) => {
    const on = tab.dataset.conTab === active;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  });
}
function setConSection(name) {
  conSectionChoice = CON_SECTIONS.includes(name) ? name : 'stores';
  try { sessionStorage.setItem(CON_SECTION_KEY, conSectionChoice); } catch (_) { /* blocked: the choice lasts this visit */ }
  applyConSection();
}
// Arrow keys move between the tabs, as a tablist does; the focused tab opens.
function onConSectionTabKey(e) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const tabs = [...e.currentTarget.querySelectorAll('[role="tab"]')].filter((t) => !t.hidden);
  const at = tabs.indexOf(e.target);
  if (at < 0) return;
  const to = e.key === 'Home' ? 0
    : e.key === 'End' ? tabs.length - 1
      : (at + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
  e.preventDefault();
  tabs[to].focus();
  setConSection(tabs[to].dataset.conTab);
}
// The count on each tab is the length the screen has just rendered, so it
// cannot disagree with the list under it. Empty when there is nothing to say.
export function setConTabCount(name, n) {
  const el = document.querySelector(`[data-con-count="${name}"]`);
  if (el) el.textContent = Number.isFinite(n) && n > 0 ? String(n) : '';
}
// Phone: the ledger's filter controls start folded. The status line stays
// outside the fold so its live region keeps announcing.
function setConLedgerFilterOpen(open) {
  const bar = $('con-ledger-filter');
  if (!bar) return;
  bar.classList.toggle('is-open', !!open);
  $('con-ledger-filter-toggle')?.setAttribute('aria-expanded', String(!!open));
}
function toggleConLedgerFilter() {
  setConLedgerFilterOpen(!$('con-ledger-filter')?.classList.contains('is-open'));
}
Object.assign(window, { setConSection, toggleConLedgerFilter });
applyConSection();
$('con-section-tabs')?.addEventListener('keydown', onConSectionTabKey);

function renderLedgerFilterBar(entries, filter, stores, described) {
  const bar = $('con-ledger-filter');
  const controls = $('con-ledger-controls');
  const status = $('con-ledger-status');
  if (!bar || !controls || !status) return;
  // Nothing to narrow: one store and a handful of rows is faster to read than
  // to filter, and an inert control bar over an empty table reads as broken.
  // A filter that is already on always keeps the bar — hiding the only way to
  // clear it would strand the owner on a table they can't widen again.
  if (!described.active && (!entries.length || (stores.length < 2 && entries.length < 8))) {
    controls.innerHTML = '';
    status.innerHTML = '';
    bar.hidden = true;
    return;
  }
  bar.hidden = false;

  // Phone: the controls fold behind a button that says how many filters are on.
  const activeFilters = (filter.storeId ? 1 : 0) + (filter.type ? 1 : 0) + (filter.unpaidOnly ? 1 : 0);
  const toggle = $('con-ledger-filter-toggle');
  if (toggle) toggle.textContent = activeFilters ? `Filter · ${activeFilters} active` : 'Filter';

  const counts = ledgerTypeCounts(entries, { ...filter, type: null });
  const storeOpts = stores.map((st) => {
    const selected = filter.storeId && String(st.id) === String(filter.storeId) ? ' selected' : '';
    return `<option value="${escapeHtml(String(st.id))}"${selected}>${escapeHtml(st.name)} (${st.count})</option>`;
  }).join('');

  const typeChips = LEDGER_TYPE_FILTERS.map((t) => {
    const on = filter.type === t.key;
    const n = counts[t.key] ?? 0;
    // A type with no rows left under the current store is disabled rather than
    // hidden, so the row of chips keeps the same shape as you move between
    // stores instead of shuffling under the cursor.
    const dead = n === 0 && !on;
    return `<button type="button" class="ledger-toggle-btn${on ? ' is-on' : ''}" aria-pressed="${on ? 'true' : 'false'}"${dead ? ' disabled' : ''} onclick="toggleConLedgerType('${escapeHtml(t.key)}')" title="${on ? 'Showing only these — click to show every kind of entry again' : `Show only what was ${escapeHtml(t.label.toLowerCase())}`}"><span class="con-group-toggle-icon" aria-hidden="true">${t.glyph}</span>${escapeHtml(t.label)} <span class="ledger-chip-count mono-num">${n}</span></button>`;
  }).join('');

  const unpaidOn = !!filter.unpaidOnly;
  const unpaidCount = counts.unpaid ?? 0;
  const unpaidChip = (unpaidCount > 0 || unpaidOn)
    ? `<button type="button" class="ledger-toggle-btn is-alert${unpaidOn ? ' is-on' : ''}" aria-pressed="${unpaidOn ? 'true' : 'false'}" onclick="toggleConLedgerUnpaid()" title="${unpaidOn ? 'Showing only sales that have not been paid for — click to show every entry again' : 'Show only the sales a store still owes you for'}"><span class="con-group-toggle-icon" aria-hidden="true">⚠</span>Still unpaid <span class="ledger-chip-count mono-num">${unpaidCount}</span></button>`
    : '';

  const clearBtn = described.active
    ? `<button type="button" class="btn sm" onclick="clearConLedgerFilter()">✕ Show everything</button>`
    : '';

  const chipParts = described.parts.length
    ? ` <span class="ledger-filter-scope">${described.parts.map((p) => escapeHtml(p)).join(' · ')}</span>`
    : '';

  controls.innerHTML = `<label class="ledger-filter-field">
        <span class="ledger-filter-label">Store</span>
        <select id="con-ledger-store" class="ledger-filter-select" onchange="setConLedgerStore(this.value)">
          <option value=""${filter.storeId ? '' : ' selected'}>All stores (${entries.length})</option>
          ${storeOpts}
        </select>
      </label>
      <div class="ledger-filter-chips">${typeChips}${unpaidChip}${clearBtn}</div>`;
  status.innerHTML = `<strong class="mono-num">${escapeHtml(described.headline)}</strong>${chipParts} <span class="ledger-filter-detail">${escapeHtml(described.detail)}</span>`;
}

// The ledger has rows, but not for what was asked. Says which filter is doing
// the hiding and offers the way back, rather than reading like a book with no
// consignment history at all.
function consignmentLedgerNoMatchHtml(described) {
  return `<div class="empty-state sys-empty">
      <div class="e-icon" aria-hidden="true">🔍</div>
      <strong>No entries match this filter</strong>
      <span>${escapeHtml(described.detail)}</span>
      <div class="sys-empty-actions">
        <button class="btn gold lg" onclick="clearConLedgerFilter()">✕ Show everything</button>
      </div>
    </div>`;
}

Object.assign(window, {
  setConLedgerStore,
  toggleConLedgerType,
  toggleConLedgerUnpaid,
  clearConLedgerFilter,
  showStoreLedger,
});

// Notes cell for a ledger row, with the shop's own currency and what was
// actually received underneath when either differs from the book's.
function consignNotesCell(e) {
  const fx = consignmentFxSummary(e, bookCurrencyCode(getBook()));
  const notes = escapeHtml(e.notes || '');
  if (!fx) return notes || '—';
  return `${notes ? notes + '<br>' : ''}<span class="mono-num" style="font-size:var(--text-xs);">${escapeHtml(fx)}</span>`;
}
export function renderLedger() {
  const s = getState(), book = getBook(), cur = book.currency, b = $('ledger-body');
  const ledgerBookCode = bookCurrencyCode(book);
  // Same rule as the History table: an amount renders in the currency its row
  // was recorded in, so a pre-change entry can't masquerade as the new one.
  const ledgerCur = e => (e.cur && normalizeCurrencyCode(e.cur, ledgerBookCode) !== ledgerBookCode) ? getSym(e.cur) : cur;
  const foot = $('ledger-foot');
  setConTabCount('ledger', s.ledger.length);
  if (!s.ledger.length) {
    const bar = $('con-ledger-filter');
    if (bar) { bar.innerHTML = ''; bar.hidden = true; }
    b.innerHTML = `<tr class="ledger-empty-row"><td colspan="8">${consignmentLedgerEmptyHtml()}</td></tr>`;
    if (foot) foot.innerHTML = '';
    return;
  }

  // The filter narrows which rows are painted and which rows the totals are
  // taken over. It never re-orders, re-tallies or mutates the ledger — the loop
  // below still walks `s.ledger` itself, so every row keeps the index
  // `openEditLedger()` needs.
  const filter = activeConLedgerFilter();
  const stores = ledgerStoreOptions(s.ledger);
  const matched = filterLedgerEntries(s.ledger, filter);
  const visible = ledgerFilterIsActive(filter) ? new Set(matched) : null;
  const storeName = filter.storeId
    ? (stores.find((st) => String(st.id) === String(filter.storeId))?.name ?? '')
    : '';
  const described = describeLedgerFilter(filter, { shown: matched.length, total: s.ledger.length, storeName });
  renderLedgerFilterBar(s.ledger, filter, stores, described);

  if (!matched.length) {
    b.innerHTML = `<tr class="ledger-empty-row"><td colspan="8">${consignmentLedgerNoMatchHtml(described)}</td></tr>`;
    if (foot) foot.innerHTML = '';
    return;
  }

  const pill = e => {
    if (e.voided) return '<span class="void-badge">Void</span>';
    if (e.type === 'Shipment') return '<span class="pill blue">Sent</span>';
    if (e.status === 'paid') return '<span class="pill green">Paid</span>';
    if (e.status === 'pending') return '<span class="pill amber">Pending</span>';
    if (e.status === 'restocked') return '<span class="pill green">Restocked</span>';
    if (e.status === 'written off') return '<span class="pill red">Written off</span>';
    return `<span class="pill gray">${e.status}</span>`;
  };
  // ⚡ Bolt Optimization: Use backward loop to avoid multiple array allocations from .map().reverse().map()
  let html = '';
  for (let i = s.ledger.length - 1; i >= 0; i--) {
    const e = s.ledger[i];
    if (visible && !visible.has(e)) continue;
    const voided = e.voided ? ' voided' : '';
    const editBtn = `<button class="edit-btn" onclick="openEditLedger(${i})" title="Edit entry" aria-label="Edit entry">✎</button>`;
    // Cross-link Sale rows back to the invoice that bills them (absent id → '').
    const invBadge = e.type === 'Sale' ? invoiceBadgeHTML(e.invoiceId, e.invoiceNum) : '';
    html += `<tr class="${voided}"><td class="mono-num" style="font-size:var(--text-sm);color:var(--text3);">${fmtD(e.date)}</td><td style="font-weight:600;">${escapeHtml(e.storeName)}${editBtn}</td><td>${escapeHtml(e.type)}</td><td class="r">${e.qty}</td><td class="r">${e.type === 'Sale' ? e.rate + '%' : '—'}</td><td class="r" style="font-weight:600;">${e.amountDue > 0 ? fmt(e.amountDue, ledgerCur(e)) : '—'}</td><td style="font-size:var(--text-sm);color:var(--text3);">${consignNotesCell(e)}</td><td>${pill(e)}${e.status === 'pending' && !e.voided ? ` <button class="btn sm" style="margin-left:6px;" onclick="markPaid(${e.id})">Mark paid</button>` : ''}${invBadge}</td></tr>`;
  }
  b.innerHTML = html;
  if (foot) foot.innerHTML = consignmentLedgerFootHtml(consignmentLedgerTotals(matched, ledgerBookCode), ledgerTotalsScope(filter, storeName));
}

// Export the current book's consignment ledger (shipments, sales, returns) as a
// CSV for accounting — independent of the full Google Sheets sync so it works
// offline and without a connected sheet.
function exportConsignmentLedgerCSV() {
  const s = getState(), book = getBook(), rows = s.ledger || [];
  if (!rows.length) { showToast('No ledger entries to export', 'warn'); return; }
  // Refresh each Sale's invoice number from its live invoice before exporting so
  // accountants reconciling the CSV see which invoice billed each sale.
  reconcileConsignmentMirrors(s);
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
      normalizeCurrencyCode(e.cur, curCode),
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

// ── INVOICES ── live in features/invoices.js (publisher-only, inside the Consignment tab).

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

export function openEditHist(idx) {
  const s = getState(), book = getBook(), h = s.hist[idx];
  if (!h) return;
  if (h.artistSettlementId) { showToast('Undo the author settlement before changing this sale.', 'warn'); return; }
  // A consignment sale shown here is a mirror of its ledger row, and the ledger
  // row is the record that reaches the Google Sheet and gets re-derived on every
  // recompute. Editing the mirror directly would be overwritten, so send the
  // publisher to the editor that actually owns the numbers — the same redirect
  // the Tax Center's edit button already performs.
  if (h.consignmentLink) {
    const lIdx = ledgerSaleIndexForHistMirror(s, h);
    if (lIdx !== -1) { openEditLedger(lIdx); return; }
  }
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
  if (h.voided) {
    $('edit-void-btn').textContent = 'Unvoid this entry';
    $('edit-void-body').textContent = 'This entry is currently voided. Unvoiding will re-apply its stock and revenue effects.';
  } else {
    $('edit-void-btn').textContent = 'Void this entry';
    $('edit-void-body').textContent = 'Voiding reverses all stock and revenue effects. The entry stays visible as struck-through for your records.';
  }
  setEditWebsiteLock(!!h.webOrderId, h.webOrderId);
  openM('edit-entry');
}

// What the owner is told when they try to void or delete a website sale.
export const WEBSITE_SALE_LOCKED = 'This sale follows your website — refund it there and it updates here by itself.';

// A sale that came from the website: its copies, channel, order number and
// void follow the website, which refunds and restocks it there. Changing them
// here would put this ledger out of step with the order it mirrors.
function setEditWebsiteLock(locked, webOrderId = '') {
  ['edit-qty', 'edit-chan', 'edit-num'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.disabled = locked;
    if (locked) el.setAttribute('aria-describedby', 'edit-web-note');
    else el.removeAttribute('aria-describedby');
  });
  const note = $('edit-web-note');
  if (note) note.hidden = !locked;
  // "Open on the website ↗": the publisher's way to the order this sale follows.
  const open = $('edit-web-open');
  if (open) {
    const show = locked && !!webOrderId && window.IS_PUBLISHER && !isAuthor();
    open.hidden = !show;
    open.href = show ? websiteOrderUrl(webOrderId) : websiteOrderUrl('');
    open.target = WEBSITE_TAB_NAME;
    if (show) open.dataset.openWebsite = String(webOrderId);
    else delete open.dataset.openWebsite;
  }
  const voidZone = $('edit-void-zone');
  if (voidZone) voidZone.style.display = locked ? 'none' : '';
}

export function openEditLedger(idx) {
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
  setEditWebsiteLock(false);
  openM('edit-entry');
}

function saveHistEntryEdit(s, book) {
  const old = editCtx.snapshot;
  const h = s.hist[editCtx.idx];
  // A website sale's copies, channel and order number follow the website (the
  // dialog shows them read-only); only price, date and notes are the owner's.
  const fromWebsite = !!h.webOrderId;
  const newQty = fromWebsite ? old.qty : (parseInt($('edit-qty').value) || old.qty);
  const newPrice = parseFloat($('edit-price').value) || old.price;
  const newChan = fromWebsite ? old.chan : $('edit-chan').value;
  const newNum = fromWebsite ? old.num : ($('edit-num').value.trim() || old.num);
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
      syncHistRowToSheets(h, book, { shipping: false });
    }
  }
}

/**
 * Upsert one sale's Google Sheet row (and, with `shipping`, the row for the
 * shipping its customer paid), keyed by the row's own sheetsId. Shared by the
 * edit dialog, un-voiding, and website orders the website changed later.
 * `order: false` sends only the shipping row. Consignment mirrors are skipped:
 * their ledger row is the record that reaches the sheet.
 */
export function syncHistRowToSheets(h, book, { order = true, shipping = true } = {}) {
  if (!h || !book || !sheetsUrl || h.consignmentLink) return;
  const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  if (order) {
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
  }
  if (shipping && (Number(h.shippingPaid || 0) || 0) > 0) {
    syncToSheets(shippingPurchaseRowPayload(book, nativeCur, h));
  }
}

// Ledger entry edit (date, qty, rate, notes). Quantity changes are
// reconciled against on-hand stock and the store's counters so the
// ledger, the store card, and inventory never drift apart.
function saveLedgerEntryEdit(s, book) {
  const e = s.ledger[editCtx.idx];
  // Resolve the History mirror FIRST: for a legacy pair whose sheetsIds were
  // split, the only join left is the row's shape (store + date + qty + due),
  // and the edit below is about to change exactly those fields.
  const mirror = histMirrorForLedger(s, e);
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
      // The field is pre-filled with the 2-decimal rounding of derivedPrice. If it still
      // shows that, the user didn't touch the price: keep the exact derived one so a
      // notes/date/qty-only edit doesn't drift the amount by a cent.
      const priceUntouched = !isNaN(typedPrice) && typedPrice === Number((derivedPrice || 0).toFixed(2));
      const salePrice = (!isNaN(typedPrice) && typedPrice > 0 && !priceUntouched) ? typedPrice : derivedPrice;
      const newDue = roundCents(newQty * salePrice * (1 - newRate / 100));
      if (e.paid === 'pending' && st) {
        st.amountOwed = roundCents(Math.max(0, st.amountOwed - oldDue + newDue));
      }
      s.revenue = Math.max(0, s.revenue - oldDue + newDue);
      if (s.chStats['Consignment']) {
        s.chStats['Consignment'].revenue = Math.max(0, s.chStats['Consignment'].revenue - oldDue + newDue);
        s.chStats['Consignment'].units += (newQty - e.qty);
      }
      st.sold += (newQty - e.qty);
      e.amountDue = newDue;
      // A sale recorded in the shop's own currency keeps that side in step,
      // at the rate the row already carries (derived, so it survives a book
      // currency change).
      if (e.sale && Number(e.sale.due) > 0 && oldDue > 0 && newDue !== oldDue) {
        const fx = oldDue / e.sale.due;
        e.sale.unitPrice = roundCents(salePrice / fx);
        e.sale.gross = roundCents(newQty * e.sale.unitPrice);
        e.sale.due = roundCents(e.sale.gross * (1 - newRate / 100));
      }
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

  // Carry the corrected figures onto the History mirror. That mirror — not
  // the ledger row — is what the Tax Center ledger, its Excel export and the
  // tax report CSV read, so skipping this leaves the sale showing its old
  // amount everywhere outside the Consignment tab.
  syncHistMirrorFromLedger(s, e, mirror);

  // Sync ledger edit to sheets. A voided entry is removed; otherwise upsert.
  if (sheetsUrl && e.sheetsId) {
    if (e.voided) {
      syncLedgerVoid(e, true);
    } else {
      syncToSheets(consignmentSyncPayload(book, e));
    }
  } else if (sheetsUrl) {
    // No stable id means there's no row we can safely target: writing one
    // would append a duplicate instead of replacing the original. Say so,
    // rather than letting the sheet keep the old amount with no warning.
    showToast('Saved here, but this older entry has no link to your Google Sheet — run "Repair legacy rows" on the Sheets tab to update it there.', 'warn', 6000);
  }
}

function saveEntryEdit() {
  if (!editCtx) return;
  const s = getState(), book = getBook();
  if (editCtx.kind === 'hist' && s.hist[editCtx.idx]?.artistSettlementId) { showToast('Undo the author settlement before changing this sale.', 'warn'); return; }
  if (editCtx.kind === 'hist') {
    saveHistEntryEdit(s, book);
  } else {
    saveLedgerEntryEdit(s, book);
  }

  recomputeAfters(s, book);
  closeM('edit-entry');
  renderAll(); updateDash(); saveState(activeBook);
  if ($('tab-taxcenter') && $('tab-taxcenter').classList.contains('active')) {
    renderTaxCenter();
  }
  showToast('✓ Entry updated');
}

function syncLedgerVoid(e, isVoided, book = getBook()) {
  if (!e || !sheetsUrl || !e.sheetsId) return;
  if (isVoided) {
    syncToSheets({
      action: 'delete',
      type: 'consignment',
      book: book.title,
      sheetsId: e.sheetsId
    });
  } else {
    syncToSheets(consignmentSyncPayload(book, e));
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

export function recomputeAfters(s, book) {
  const bk = book || getBook();
  deduplicateDirectConsignmentSales(s);
  // Re-derive consignment mirrors from their canonical ledger rows BEFORE the
  // stats are rebuilt below — recalculateBookStatsFromHistory reads s.hist, so
  // a mirror still carrying a sale's pre-edit amount would book that stale
  // figure as revenue (and the Tax Center would report it) even though the
  // ledger, the store card and the Google Sheet all show the corrected one.
  reconcileConsignmentMirrors(s);
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

// ── STOCK TRANSFER (Publisher to/from Author) ───────────────────────────────
let _stDirection = 'to_author';

function setStockTransferDirection(dir) {
  _stDirection = dir === 'from_author' ? 'from_author' : 'to_author';
  const toBtn = $('st-dir-to-author');
  const fromBtn = $('st-dir-from-author');
  if (toBtn) toBtn.classList.toggle('is-on', _stDirection === 'to_author');
  if (fromBtn) fromBtn.classList.toggle('is-on', _stDirection === 'from_author');
  updateStockTransferPreview();
}

function openStockTransferModal() {
  if (!activeBook || activeBook === 'all' || isAuthor()) return;
  const book = BOOKS[activeBook];
  const s = states[activeBook];
  if (!book || !s) return;

  const breakdown = deriveStockBreakdown(s, book);
  if ($('st-modal-title')) $('st-modal-title').textContent = `Transfer stock · ${book.title}`;
  if ($('st-cur-publisher')) $('st-cur-publisher').textContent = breakdown.publisherOnHand;
  if ($('st-cur-author')) $('st-cur-author').textContent = breakdown.authorHeld;

  _stDirection = 'to_author';
  const toBtn = $('st-dir-to-author');
  const fromBtn = $('st-dir-from-author');
  if (toBtn) toBtn.classList.add('is-on');
  if (fromBtn) fromBtn.classList.remove('is-on');

  if ($('st-qty')) $('st-qty').value = 1;
  if ($('st-note')) $('st-note').value = '';
  updateStockTransferPreview();
  openM('stock-transfer');
}

function stepStockTransfer(delta) {
  const input = $('st-qty');
  if (!input) return;
  const cur = parseInt(input.value, 10) || 0;
  const next = Math.max(1, cur + delta);
  input.value = next;
  updateStockTransferPreview();
}

function onStockTransferQtyChange() {
  updateStockTransferPreview();
}

function updateStockTransferPreview() {
  if (!activeBook || activeBook === 'all') return;
  const book = BOOKS[activeBook];
  const s = states[activeBook];
  if (!book || !s) return;

  const breakdown = deriveStockBreakdown(s, book);
  const qtyInput = $('st-qty');
  const previewEl = $('st-preview');
  const limitLabel = $('st-qty-limit-label');
  const submitBtn = $('st-submit-btn');

  const maxAllowed = _stDirection === 'to_author' ? breakdown.publisherOnHand : breakdown.authorHeld;
  const qty = parseInt(qtyInput?.value, 10) || 0;

  if (limitLabel) {
    limitLabel.textContent = `(max ${maxAllowed} available)`;
  }

  if (qty <= 0) {
    if (previewEl) previewEl.textContent = 'Please enter a quantity of at least 1 unit.';
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  if (qty > maxAllowed) {
    if (previewEl) {
      previewEl.innerHTML = `<span style="color:var(--red, #ef4444);">Cannot transfer ${qty} copies — only ${maxAllowed} copies currently ${_stDirection === 'to_author' ? 'at publisher warehouse' : 'held by author'}.</span>`;
    }
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  if (submitBtn) submitBtn.disabled = false;

  const afterPub = _stDirection === 'to_author' ? breakdown.publisherOnHand - qty : breakdown.publisherOnHand + qty;
  const afterAuth = _stDirection === 'to_author' ? breakdown.authorHeld + qty : breakdown.authorHeld - qty;

  if (previewEl) {
    previewEl.innerHTML = `<strong>Result:</strong> Publisher will have <strong>${afterPub}</strong> copies · Author will have <strong>${afterAuth}</strong> copies (${_stDirection === 'to_author' ? 'Handing off ' : 'Returning '}${qty} copies).`;
  }
}

async function submitStockTransfer() {
  if (!activeBook || activeBook === 'all' || isAuthor()) return;
  const book = BOOKS[activeBook];
  const s = states[activeBook];
  if (!book || !s) return;

  const qtyInput = $('st-qty');
  const qty = parseInt(qtyInput?.value, 10) || 0;
  const note = ($('st-note')?.value || '').trim();

  const breakdown = deriveStockBreakdown(s, book);
  const maxAllowed = _stDirection === 'to_author' ? breakdown.publisherOnHand : breakdown.authorHeld;

  if (qty <= 0 || qty > maxAllowed) {
    showToast(`Invalid transfer quantity (max ${maxAllowed})`, 'warn');
    return;
  }

  const delta = _stDirection === 'to_author' ? qty : -qty;
  transferAuthorStock(s, book, delta, note);

  await saveState(activeBook);
  closeM('stock-transfer');
  updateDash();
  updateAllOverview();
  showToast(`✓ Transferred ${qty} ${qty === 1 ? 'copy' : 'copies'} ${_stDirection === 'to_author' ? 'to author' : 'back to publisher'}`);
}

// voidHistEntry / unvoidHistEntry and the Sheets sync for a void live in
// features/sales-ledger.js.

function voidEntry() {
  if (!editCtx) return;
  const s = getState(), book = getBook();

  if (editCtx.kind === 'hist') {
    const h = s.hist[editCtx.idx];
    if (!h) return;
    if (h.artistSettlementId) { showToast('Undo the author settlement before voiding this sale.', 'warn'); return; }
    if (h.webOrderId) { showToast(WEBSITE_SALE_LOCKED, 'warn', 5000); return; }
    if (!h.voided) {
      voidHistEntry(s, book, h);
      showToast('Entry voided — stock & revenue reversed (Sheets row delete queued)', 'warn');
    } else {
      unvoidHistEntry(s, book, h);
      showToast('Entry unvoided — effects restored (Sheets row restore queued)');
    }
  } else {
    const e = s.ledger[editCtx.idx];
    if (!e) return;
    const st = s.stores.find(st => st.id === e.storeId);
    // Captured before the flip so the mirror can follow it either way — a
    // voided sale that stayed live in the mirror kept counting as income in
    // the Tax Center and as revenue in the Consignment channel total.
    const mirror = histMirrorForLedger(s, e);
    if (!e.voided) {
      // VOID consignment entry
      if (e.type === 'Shipment' && st) { st.sent = Math.max(0, st.sent - e.qty); st.outstanding = Math.max(0, st.outstanding - e.qty); s.stock += e.qty; }
      if (e.type === 'Sale' && st) { st.sold = Math.max(0, st.sold - e.qty); st.outstanding += e.qty; s.sold = Math.max(0, s.sold - e.qty); s.revenue = Math.max(0, s.revenue - e.amountDue); if (e.paid === 'pending') st.amountOwed = roundCents(Math.max(0, st.amountOwed - e.amountDue)); if (s.chStats['Consignment']) { s.chStats['Consignment'].txns = Math.max(0, s.chStats['Consignment'].txns - 1); s.chStats['Consignment'].units = Math.max(0, s.chStats['Consignment'].units - e.qty); s.chStats['Consignment'].revenue = Math.max(0, s.chStats['Consignment'].revenue - e.amountDue); } }
      if (e.type === 'Return' && st) { st.returned = Math.max(0, st.returned - e.qty); st.outstanding += e.qty; if (e.status === 'restocked') s.stock = Math.max(0, s.stock - e.qty); }
      e.voided = true;
      e.voidedAt = Date.now();
      // Decision #4: keep invoiceId/invoiceNum across the void (so unvoid restores
      // the link) and never auto-un-pay the invoice. maybeAutoPayInvoiceForLedger
      // already excludes voided sales from its "all paid?" check.
      if (e.type === 'Sale' && e.invoiceNum) showToast(`Sale was on invoice ${e.invoiceNum}`, 'warn', 4000);
      syncLedgerVoid(e, true);
      showToast('Consignment entry voided — effects reversed (Sheets row delete queued)', 'warn');
    } else {
      // UNVOID consignment entry
      if (e.type === 'Shipment' && st) { st.sent += e.qty; st.outstanding += e.qty; s.stock = Math.max(0, s.stock - e.qty); }
      if (e.type === 'Sale' && st) { st.sold += e.qty; st.outstanding = Math.max(0, st.outstanding - e.qty); s.sold += e.qty; s.revenue += e.amountDue; if (e.paid === 'pending') st.amountOwed = roundCents(st.amountOwed + e.amountDue); if (!s.chStats['Consignment']) s.chStats['Consignment'] = { txns: 0, units: 0, revenue: 0 }; s.chStats['Consignment'].txns++; s.chStats['Consignment'].units += e.qty; s.chStats['Consignment'].revenue += e.amountDue; }
      if (e.type === 'Return' && st) { st.returned += e.qty; st.outstanding = Math.max(0, st.outstanding - e.qty); if (e.status === 'restocked') s.stock += e.qty; }
      e.voided = false;
      delete e.voidedAt;
      syncLedgerVoid(e, false);
      showToast('Consignment entry unvoided — effects restored (Sheets row restore queued)');
    }
    syncHistMirrorFromLedger(s, e, mirror);
    // The mirror's void state just moved, so re-derive the figures that are
    // rebuilt from history (revenue, channel totals, stock-after). The hist
    // branch above already does this inside each arm.
    recomputeAfters(s, book);
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
// Row types a restore from the sheet rebuilds; 'shipping' rows are the postage
// paid on an order and are folded back into it.
const SHEET_RESTORE_TYPES = new Set(['order', 'consignment', 'shipping']);

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

    // A restore rebuilds sales and consignment, with the postage customers paid
    // on their orders. Expense and artist-payment rows also live on the book's
    // tab now; they are not part of what this rebuilds (the book's expenses and
    // payouts stay as they are), so they are left out of the count and preview.
    const rows = (data.rows || []).filter(r => SHEET_RESTORE_TYPES.has(String(r.Type || '').trim().toLowerCase()));
    const postageRows = rows.filter(r => String(r.Type).trim().toLowerCase() === 'shipping');
    const recordRows = rows.filter(r => String(r.Type).trim().toLowerCase() !== 'shipping');
    if (!recordRows.length) {
      showToast('No records found in Google Sheet for this book', 'warn');
      if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = originalBtnHtml; }
      return;
    }

    // Save parsed data globally for the confirm call
    _sheetsRestoreData = { book, rows };

    // Detect duplicate event IDs inside the spreadsheet rows
    const seenIds = new Set();
    const duplicateIds = new Set();
    recordRows.forEach(r => {
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
      const postageNote = postageRows.length ? `, plus the postage customers paid on ${postageRows.length} order${postageRows.length === 1 ? '' : 's'}` : '';
      let summaryText = `Found <strong>${recordRows.length} records</strong> (sales and consignment events${postageNote}) in sheet — review below then confirm.`;
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
      confirmBtn.innerHTML = `Restore database (${recordRows.length} rows)`;
    }
    setImportReady(true);

    // Build preview table rows
    $('import-preview-body').innerHTML = recordRows.map(r => {
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
        ? '<span class="pill green" style="font-size:var(--text-2xs);">Direct</span>'
        : `<span class="pill ${status === 'pending' ? 'amber' : 'blue'}" style="font-size:var(--text-2xs);">Consign: ${r['Event/Num']}</span>`;

      if (isDuplicate) {
        badge += ' <span class="pill red" style="font-size:var(--text-2xs);margin-left:4px;" title="Duplicate record found in the sheet. Only the last occurrence will be kept.">⚠️ Duplicate</span>';
      }

      return `
        <tr style="${isDuplicate ? 'background:rgba(255,107,107,0.05);' : ''}">
          <td class="mono">${escapeHtml(eventNum)}</td>
          <td style="font-size:var(--text-sm);color:var(--text3);">${fmtD(date)}</td>
          <td>${escapeHtml(chan)}</td>
          <td class="r">${qty}</td>
          <td class="r">${book.currency}${price.toFixed(2)}</td>
          <td class="r" style="font-weight:600;">${book.currency}${total.toFixed(2)}</td>
          <td style="font-size:var(--text-xs);color:var(--text3);">${escapeHtml(notes)}</td>
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

    const postageRows = [];

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

      if (type === 'shipping') {
        // The postage a customer paid belongs on its order, not as a sale of
        // its own. Matched up once every order has been rebuilt, below. It used
        // to be dropped, so a restored website order lost its shipping and the
        // next rebuild of the sheet deleted the postage row.
        postageRows.push(row);
      } else if (type === 'order') {
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
      } else if (type === 'consignment' && row['Event/Num'] === 'Inventory Disposal') {
        // Copies written off never sat at a store: restoring one used to create
        // a store with no name to hang it on.
        newLedger.push({
          id: Date.now() + index,
          type: 'Inventory Disposal',
          date,
          qty,
          reason: '',
          notes,
          status: status || 'written off',
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

    // Postage rows carry their order's id with "-shipping" on the end (or, for
    // an order that had no id, its order number).
    // Index the direct orders once rather than rescanning the whole restored
    // history for every postage row (two passes each), which grew with
    // orders × postage rows. First match wins, as Array#find did; the loop only
    // sets shippingPaid, so the keys never change under it.
    const ordersBySheetsId = new Map();
    const ordersByNum = new Map();
    for (const h of newHist) {
      if (h.consignmentLink) continue;
      if (!ordersBySheetsId.has(h.sheetsId)) ordersBySheetsId.set(h.sheetsId, h);
      if (!ordersByNum.has(h.num)) ordersByNum.set(h.num, h);
    }
    postageRows.forEach(row => {
      const paid = roundCents(parseFloat(row['Total/Amount']) || 0);
      if (!(paid > 0)) return;
      const orderId = String(row._eventId || '').replace(/-shipping$/, '');
      const order = (orderId && ordersBySheetsId.get(orderId))
        || (row['Event/Num'] && ordersByNum.get(row['Event/Num']));
      if (order) order.shippingPaid = paid;
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

    // Recalculate book units sold and revenue from the imported history
    recalculateBookStatsFromHistory(s);

    // Recalculate store amountOwed
    newStores.forEach(st => {
      st.amountOwed = 0;
    });
    newLedger.forEach(e => {
      if (e.voided || e.type !== 'Sale' || !e.storeId) return;
      const st = newStores.find(x => x.id === e.storeId);
      if (st && e.status === 'pending') {
        st.amountOwed = roundCents(st.amountOwed + (e.amountDue || 0));
      }
    });

    s.stock = deriveOnHand(s, book);
    recomputeAfters(s, book);
    reconcileConsignmentMirrors(s);

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
  // Only a real web address becomes a link; anything else hides the button.
  const sheetUrl = safeHttpUrl(sheetsSpreadsheetUrl);
  const openLink = $('sheets-open-link'); if (openLink) { if (sheetUrl) { openLink.href = sheetUrl; openLink.style.display = ''; } else openLink.style.display = 'none'; }
  const cardLink = $('open-sheet-link'); if (cardLink) { if (sheetUrl) { cardLink.href = sheetUrl; cardLink.style.display = ''; } else cardLink.style.display = 'none'; }
  // Sidebar footer "Open Google Sheet" (publisher app-shell) — mirror sheets-open-link.
  const sideLink = $('side-sheets-open'); if (sideLink) { if (sheetUrl) { sideLink.href = sheetUrl; sideLink.style.display = ''; } else sideLink.style.display = 'none'; }
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
  // Publisher-only copy of the whole connection, so the publisher's other
  // devices (a phone) pick it up at sign-in instead of re-pasting both links.
  await window._fbSaveSettings('sheetsConnection', { url: normalizedUrl, spreadsheetUrl: spreadUrl || '' });
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
  await window._fbSaveSettings('sheetsConnection', { url: '', spreadsheetUrl: '' });
  $('sheets-setup-card').style.display = '';
  $('sheets-connected-card').style.display = 'none';
  const warningEl = $('sheets-version-warning');
  if (warningEl) warningEl.style.display = 'none';
  updateSheetsBadge();
  showToast('Sheets disconnected', 'warn');
}
// The Sheets connection lives in each device's own storage, so a publisher who
// set it up on the computer used to face pasting two long links on the phone.
// At publisher sign-in this squares the device with the cloud copy.
async function syncSheetsConnectionWithCloud() {
  try {
    const plan = planSheetsConnectionSync({
      localUrl: localStorage.getItem('lm-sheets-url') || '',
      localSpreadsheetUrl: localStorage.getItem('lm-sheets-spreadsheet-url') || '',
      conn: await window._fbLoadSettings('sheetsConnection'),
      notifyUrl,
      normalize: normalizeAppsScriptUrl,
    });
    if (plan.action === 'backfill') {
      await window._fbSaveSettings('sheetsConnection', { url: plan.url, spreadsheetUrl: plan.spreadsheetUrl });
      return;
    }
    if (plan.action !== 'adopt') return;
    const cloudUrl = plan.url;
    const spreadUrl = safeHttpUrl(plan.spreadsheetUrl);
    localStorage.setItem('lm-sheets-url', cloudUrl);
    localStorage.setItem('lm-last-sheets-url', cloudUrl);
    if (spreadUrl) {
      localStorage.setItem('lm-sheets-spreadsheet-url', spreadUrl);
      localStorage.setItem('lm-last-spreadsheet-url', spreadUrl);
    }
    if (window._realSheetsUrlSaved) {
      // The test book is open and holds the mock link; switching back restores these.
      window._realSheetsUrl = cloudUrl;
      window._realSheetsSpreadsheetUrl = spreadUrl;
    } else {
      sheetsUrl = cloudUrl;
      sheetsSpreadsheetUrl = spreadUrl;
      showSheetsConnected();
    }
    showToast('✓ Google Sheet connected — copied from your other device');
  } catch (e) {
    console.warn('Sheets connection sync skipped', e);
  }
}
function showSheetsConnected() {
  $('sheets-setup-card').style.display = 'none';
  $('sheets-connected-card').style.display = '';
  $('sheets-url-display').textContent = sheetsUrl;
  updateSheetsBadge();
  checkSheetsVersion();
}

export async function checkSheetsVersion() {
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
        // Remembered so the To-do list and the notifications rail can report an
        // out-of-date spreadsheet without re-fetching it on every render.
        _sheetsDeployedVersion = deployedVer;
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

window.addEventListener('online', () => { _processQueue(); scheduleMoneyOutSheetSyncAll(); });
// A tab that comes back to a queue left over from last session has to drain it.
// A single attempt 300ms after load was not enough: the sheet URL can still be
// arriving from cloud settings at that point, and `_processQueue` quietly does
// nothing when it has nowhere to write, so the backlog sat there until the next
// sale was recorded. Keep looking for a minute, then leave it to the next write.
(function resumeSheetsQueueOnLoad() {
  let tries = 0;
  const tick = () => {
    tries++;
    if (!_sheetsQueue.length) return;
    _processQueue();
    if (tries < 12) setTimeout(tick, 5000);
  };
  setTimeout(tick, 300);
})();
// A tab restored from the background may have slept through its own retry
// timer. Re-check whenever it becomes visible again.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) _processQueue();
});

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

async function initializeBackupFolderDisplay() {
  if (!('showDirectoryPicker' in window)) {
    updateBackupFolderDisplay('Backup folder: Browser Downloads (folder picker not supported)');
    return;
  }
  try {
    const dirHandle = await loadBackupFolderHandle();
    updateBackupFolderDisplay(dirHandle ? `Backup folder: ${dirHandle.name}` : 'Backup folder: Browser Downloads (default)');

    // Bring any cloud-parked receipts down to the folder now that we're back on
    // the publisher's machine. Quiet on the way through — a startup pass that
    // finds nothing should say nothing.
    if (window.IS_PUBLISHER) {
      setTimeout(async () => {
        // Health first: it sets the banner, and both passes below need to know
        // whether the folder is answering before they touch it.
        await checkReceiptFolderHealth();
        await reclaimCloudReceipts({ interactive: false });
        // Then give anything filed before the cache existed a standby copy, a
        // batch at a time — those are the receipts a folder move would strand.
        await backfillReceiptCache({ interactive: false });
        renderReceiptFolderAlert();
        renderReceiptCacheStatus();
      }, 2000); // Wait for initial app load
    }
  } catch (e) {
    updateBackupFolderDisplay('Backup folder: Browser Downloads (default)');
  }
}
async function exportToJSON(ev) {
  return withButtonLoading(ev, 'Saving…', async () => {
    const data = buildBackupPayload();
    const filename = backupFileName();
    // The chosen backup folder is shared with the real books: sample data
    // is only ever downloaded, never put next to the real backups.
    const savedToFolder = TEST_PROFILE_ACTIVE ? false : await writeBackupToChosenFolder(data, filename);

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
  // A backup of sample data dropped in the real backup folder is a trap.
  if (TEST_PROFILE_ACTIVE) return;
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
    body.innerHTML = `
      <tr>
        <td colspan="4" style="padding:0;border:none;">
          <div class="empty-state sys-backup-empty-state" style="padding:var(--space-6) var(--space-4);text-align:center;">
            <div class="e-icon" aria-hidden="true">💾</div>
            <strong style="font-size:var(--text-base);font-weight:700;color:var(--content-primary);display:block;margin-bottom:var(--space-1);">No System Backups Yet</strong>
            <p style="font-size:var(--text-xs);color:var(--content-secondary);max-width:400px;margin:0 auto var(--space-3);line-height:var(--leading-snug);">Automatic local snapshots run once daily. You can also generate an immediate point-in-time snapshot of all books, inventory, orders, and expenses.</p>
            <div style="display:flex;justify-content:center;gap:var(--space-2);flex-wrap:wrap;">
              <button type="button" class="btn sm gold" onclick="createSystemBackup('manual')" style="min-height:var(--target-min);display:inline-flex;align-items:center;gap:6px;" title="Create immediate system snapshot">
                <span aria-hidden="true">💾</span>
                <span>Create Snapshot Now</span>
              </button>
            </div>
          </div>
        </td>
      </tr>
    `;
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
      <td class="tnum">${new Date(b.createdAt).toLocaleString()}</td>
      <td><span class="pill ${b.type === 'manual' ? 'gold' : 'gray'}">${b.type === 'manual' ? 'Manual' : 'Auto daily'}</span></td>
      <td class="r tnum" style="font-family:var(--font-mono);font-weight:600;">${b.bookCount ?? Object.keys(b.snapshot?.BOOKS || {}).length}</td>
      <td class="r" style="white-space:nowrap;">
        <button class="btn sm outline" onclick="restoreBookFromBackup('${b.id}')" style="min-height:var(--target-min);margin-right:4px;" title="Restore just one book from this snapshot — leaves your other books untouched">Restore 1 book</button>
        <button class="btn sm danger-btn" onclick="restoreSystemBackup('${b.id}')" style="min-height:var(--target-min);" title="Restore the ENTIRE database from this snapshot — overwrites everything">Restore all</button>
      </td>
    </tr>
  `).join('');

  if (totalPages > 1) {
    html += `<tr><td colspan="4" style="text-align:center;padding:1rem;background:var(--surface-sunken);">
      <button class="btn sm" onclick="gotoSysBackupPage(-1)" ${_sysBackupPage === 0 ? 'disabled' : ''}>← Prev</button>
      <span style="margin:0 15px;font-size:var(--text-sm);color:var(--text2);font-family:var(--font-mono);">Page ${_sysBackupPage + 1} of ${totalPages}</span>
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
  setBooks(data.BOOKS);
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
    _setMailingList({
      subs: (data.mailingList.subs && typeof data.mailingList.subs === 'object') ? data.mailingList.subs : {},
      autoAdd: !!data.mailingList.autoAdd,
      removed: (data.mailingList.removed && typeof data.mailingList.removed === 'object') ? data.mailingList.removed : {}
    });
    await _persistMailingList();
  }
  // Accept both the v2.6 array shape and the {emails:[...]} settings shape.
  const supp = Array.isArray(data.customerSuppress)
    ? data.customerSuppress
    : (data.customerSuppress && Array.isArray(data.customerSuppress.emails) ? data.customerSuppress.emails : null);
  if (supp) {
    _setCustomerSuppress(new Set(supp.map(_custEmailKey)));
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
      ? '<span class="pill green" style="font-size:var(--text-2xs);">Missing · will be re-added</span>'
      : '<span class="pill amber" style="font-size:var(--text-2xs);">In catalog · will be overwritten</span>';
    const stat = empty
      ? '<span style="color:var(--text3);">No recorded activity in this snapshot</span>'
      : `<strong style="color:var(--on-inverse);">${escapeHtml(_restoreStatLine(s))}</strong>`;
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:var(--stroke-hair) solid var(--border);border-radius:var(--r2);background:rgba(255,255,255,.03);${empty ? 'opacity:.5;' : ''}">
        <div style="width:8px;height:8px;border-radius:50%;background:${book.accent || 'var(--gold3)'};flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:var(--text-base);color:var(--on-inverse);">${escapeHtml(book.title || bid)}</div>
          <div style="font-size:var(--text-sm);margin-top:2px;">${stat}</div>
          <div style="font-size:var(--text-xs);color:var(--text3);margin-top:3px;">${escapeHtml(book.author || '—')} · ${badge}</div>
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
    refreshBookList();
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
      // Consignment sales are mirrored into history; the ledger row below is the one record.
      if (h.consignmentLink) return;
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
        l.voided ? 'VOID' : (l.status || 'OK'),
        l.notes || ''
      ]);
    });

    // Expenses
    expensesWithSettlements(s).forEach(e => {
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
        <div style="width:8px;height:8px;border-radius:50%;background:${escapeHtml(book.accent || '')};flex-shrink:0;"></div>
        <span style="font-size:var(--text-base);font-weight:600;color:var(--text);">${escapeHtml(book.title)}</span>
        <span style="font-size:var(--text-xs);color:var(--text3);">${book.currency}</span>
      </div>
      <div class="form-group" style="flex:1;margin:0;">
        <div class="price-wrap">
          <span class="sym">${book.currency}</span>
          <input type="number" inputmode="decimal" id="pc-${book.id}" value="${book.productionCost || ''}" placeholder="0.00" step="0.01" min="0">
        </div>
      </div>
    </div>`).join('');
}

// The per-book cost map mirrors the catalog, so both save paths write every
// book — not just the ones on screen — and the device copy never lags the cloud.
async function persistProductionCosts() {
  const stored = {};
  BOOK_LIST.forEach(b => { stored[b.id] = b.productionCost || 0; });
  await window._fbSaveSettings('productionCosts', stored);
  localStorage.setItem('lm-production-costs', JSON.stringify(stored));
}

function confirmProductionCostsCleared(titles) {
  const which = titles.length === 1 ? `"${titles[0]}"` : `${titles.length} books`;
  return confirmDialog(
    `The production cost for ${which} is now blank or zero. Saved like this, `
    + `${titles.length === 1 ? 'it' : 'they'} will show as already broken even.`,
    {
      title: 'Save a zero production cost?',
      details: titles.length > 1 ? titles.map(t => [t, 'No cost']) : [],
      okLabel: 'Save anyway',
      cancelLabel: 'Go back',
      danger: true,
    }
  );
}

// Moving a break-even target changes the progress bar the owner watches, so
// it is never done silently. Declining keeps the targets and still saves.
function confirmBreakEvenTierMoves(changes) {
  return confirmDialog(
    'Your break-even target follows the production cost. Update it to match the new cost?',
    {
      title: changes.length === 1 ? 'Update the break-even target?' : 'Update break-even targets?',
      details: changes.map(({ book, move }) => [
        book.title,
        `${fmt(move.from, book.currency)} → ${fmt(move.to, book.currency)}`,
      ]),
      okLabel: changes.length === 1 ? 'Update target' : 'Update targets',
      cancelLabel: 'Keep my target' + (changes.length === 1 ? '' : 's'),
    }
  );
}

async function saveProductionCosts() {
  await syncCatalog();
  const edits = [];
  BOOK_LIST.forEach(book => {
    const inp = $('pc-' + book.id);
    if (!inp) return;
    const previousCost = book.productionCost || 0;
    edits.push({ book, previousCost, ...readProductionCostInput(inp.value, previousCost) });
  });

  const cleared = edits.filter(e => e.suspicious);
  if (cleared.length && !(await confirmProductionCostsCleared(cleared.map(e => e.book.title)))) {
    $('pc-' + cleared[0].book.id)?.focus();
    return;
  }

  const moves = edits
    .filter(e => e.previousCost !== e.value)
    .map(e => ({ book: e.book, move: breakEvenTierMove(e.book.profitTiers, e.previousCost, e.value) }))
    .filter(c => c.move);
  const moveTiers = moves.length ? await confirmBreakEvenTierMoves(moves) : false;

  edits.forEach(e => { e.book.productionCost = e.value; });
  if (moveTiers) moves.forEach(({ book, move }) => applyBreakEvenTierMove(book.profitTiers, move));

  await persistProductionCosts();
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
        <div style="width:8px;height:8px;border-radius:50%;background:${escapeHtml(book.accent || '')};flex-shrink:0;"></div>
        <span style="font-size:var(--text-base);font-weight:600;color:var(--text);">${escapeHtml(book.title)}</span>
      </div>
      <div class="form-group" style="flex:1;margin:0;">
        <input type="text" id="pl-${book.id}" value="${escapeHtml(book.paymentLink || '')}" placeholder="https://paypal.me/… or email@interac.ca">
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

export function getAcceptedPaymentMethodsForBook(bookId) {
  const book = BOOKS[bookId];
  if (!book) return WEBSITE_PAYMENT_METHODS;
  if (book.useGlobalMethods ?? true) {
    return WEBSITE_PAYMENT_METHODS;
  }
  return book.acceptedMethods || ['stripe', 'paypal', 'interac', 'cash_card'];
}

// The book's own payment link, but only one whose method the book accepts:
// Stripe first, then a PayPal link, then an Interac e-Transfer email. Empty
// when none qualifies. Shared by the book's checkout links and by invoices
// that carry no link of their own, so the two always pick the same one.
export function acceptedBookPaymentLink(book, acceptedMethods) {
  if (acceptedMethods.includes('stripe') && book.stripeLink) return book.stripeLink;
  if (acceptedMethods.includes('paypal') && book.paymentLink && /paypal/i.test(book.paymentLink)) return book.paymentLink;
  if (acceptedMethods.includes('interac') && book.paymentLink && /^[^\s@]+@[^\s@]+$/.test(book.paymentLink)) return book.paymentLink;
  return '';
}

function getEffectiveBookPaymentLink(book) {
  if (!book) return '';
  const url = acceptedBookPaymentLink(book, getAcceptedPaymentMethodsForBook(book.id));
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
const LETTERHEAD_KEY = 'lm-letterhead';
const LETTERHEAD_FIELDS = ['name', 'address', 'email', 'website', 'phone', 'recipient', 'date', 'subject', 'signoff', 'signature', 'accent'];
let letterheadLogo = '';
let letterheadLoaded = false;

function readLetterhead() {
  try { return normalizeLetterhead(JSON.parse(localStorage.getItem(LETTERHEAD_KEY) || '{}'), getInvoiceSettings()); }
  catch (e) { return normalizeLetterhead({}, getInvoiceSettings()); }
}

function currentLetterhead() {
  const value = { logo: letterheadLogo };
  LETTERHEAD_FIELDS.forEach(field => { value[field] = $('lh-' + field)?.value || ''; });
  value.body = $('lh-body')?.innerText || '';
  value.bodyHtml = $('lh-body')?.innerHTML || '';
  return normalizeLetterhead(value);
}

function loadLetterhead() {
  if (letterheadLoaded) return;
  const saved = readLetterhead();
  LETTERHEAD_FIELDS.forEach(field => { if ($('lh-' + field)) $('lh-' + field).value = saved[field]; });
  if ($('lh-body')) $('lh-body').innerHTML = saved.bodyHtml || escapeHtml(saved.body).replace(/\r\n|\n|\r/g, '<br>');
  letterheadLogo = saved.logo;
  letterheadLoaded = true;
  previewLetterhead();
}

function previewLetterhead() {
  const host = $('letterhead-preview');
  if (host) host.innerHTML = renderLetterhead(currentLetterhead());
}

function saveLetterhead() {
  try {
    localStorage.setItem(LETTERHEAD_KEY, JSON.stringify(currentLetterhead()));
    showToast('Letterhead saved in this browser');
  } catch (e) {
    showToast('Could not save letterhead. Try a smaller logo.', 'warn');
  }
}

function loadLetterheadLogo(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 1024 * 1024) {
    showToast('Choose a PNG, JPEG, WebP or GIF under 1 MB', 'warn');
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => { letterheadLogo = String(reader.result || ''); previewLetterhead(); };
  reader.readAsDataURL(file);
}

function removeLetterheadLogo() {
  letterheadLogo = '';
  if ($('lh-logo')) $('lh-logo').value = '';
  previewLetterhead();
}

const LETTERHEAD_FORMAT_COMMANDS = new Set(['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight', 'removeFormat']);
function formatLetterhead(command) {
  if (!LETTERHEAD_FORMAT_COMMANDS.has(command)) return;
  const editor = $('lh-body');
  if (!editor) return;
  editor.focus();
  document.execCommand('styleWithCSS', false, false);
  document.execCommand(command, false, null);
  previewLetterhead();
}

function pasteLetterheadPlainText(event) {
  event.preventDefault();
  document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') || '');
  previewLetterhead();
}

function printLetterhead() {
  const doc = renderLetterhead(currentLetterhead());
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0';
  frame.setAttribute('title', 'Letterhead print view');
  frame.onload = () => {
    const win = frame.contentWindow;
    win.onafterprint = () => frame.remove();
    win.focus();
    win.print();
  };
  frame.srcdoc = `<!doctype html><html><head><title>Letterhead</title><style>
    @page{size:letter;margin:0}*{box-sizing:border-box}body{margin:0;color:#26211e;font:11pt/1.65 Georgia,serif}
    .letterhead-page{width:8.5in;min-height:11in;padding:.7in .75in .6in;display:flex;flex-direction:column;background:#fff}
    .letterhead-paper-header{display:flex;justify-content:space-between;align-items:center;gap:28px;border-bottom:1px solid var(--letter-accent);padding-bottom:22px;margin-bottom:46px}
    .letterhead-brand{display:flex;align-items:center;gap:18px;min-width:0}.letterhead-logo{max-width:76px;max-height:70px;object-fit:contain}
    .letterhead-name{font-size:21pt;line-height:1.12;letter-spacing:-.025em;font-weight:700;overflow-wrap:anywhere}.letterhead-contact{max-width:240px;text-align:right;font:8pt/1.55 Arial,sans-serif;color:#5b5651;overflow-wrap:anywhere}
    .letterhead-meta{display:flex;justify-content:space-between;gap:20px;line-height:1.5;margin-bottom:32px}.letterhead-meta>div:last-child{white-space:nowrap}
    .letterhead-subject{font:700 12pt/1.35 Arial,sans-serif;margin:0 0 25px}.letterhead-body{line-height:1.7;overflow-wrap:anywhere}
    .letterhead-body p{margin:0 0 1em}.letterhead-body ul,.letterhead-body ol{padding-left:1.5em;margin:.5em 0 1em}
    .letterhead-signoff{line-height:1.6;margin-top:28px}.letterhead-signoff:empty{display:none}.letterhead-paper-footer{margin-top:auto;border-top:1px solid #d8d3cd;padding-top:10px;text-align:center;color:#6a655f;font:8pt Arial,sans-serif}
  </style></head><body>${doc}</body></html>`;
  document.body.appendChild(frame);
}

Object.assign(window, { previewLetterhead, saveLetterhead, loadLetterheadLogo, removeLetterheadLogo, printLetterhead, formatLetterhead, pasteLetterheadPlainText });

function switchSettingsSubTab(subTabName) {
  activeSettingsSubTab = subTabName;
  const subTabs = ['profit', 'catalog', 'sync', 'letterhead'];
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
  if (subTabName === 'sync') {
    updateSheetsTabUI();
  }
  if (subTabName === 'letterhead') loadLetterhead();
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
        <div style="font-size:var(--text-sm);max-width:460px;margin:0 auto;line-height:1.6;">Pick a title from the dropdown above, then set the share an artist earns at each stage of recovering production costs.</div>
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
      <div style="text-align:center;padding:2rem 1.25rem;border:var(--stroke-hair) dashed var(--gold-line);border-radius:var(--r2);background:var(--cream2);">
        <div style="font-size:30px;opacity:.55;margin-bottom:.5rem;">🎚️</div>
        <div style="font-weight:600;color:var(--text2);margin-bottom:.4rem;">No tiers defined yet</div>
        <div style="font-size:var(--text-sm);color:var(--text3);max-width:480px;margin:0 auto 1.1rem;line-height:1.6;">
          Start with the recommended two-stage model: a lower share until <b>${pcText}</b> is recovered, then a higher share once you break even. You can fine-tune every number afterward.
        </div>
        <button class="btn gold" id="ps-quickstart-btn">✨ Use recommended template</button>
        <div style="font-size:var(--text-xs);color:var(--text3);margin-top:.85rem;">…or build it up one stage at a time with <b>+ Add Tier</b> below.</div>
      </div>`;
    const qs = $('ps-quickstart-btn');
    if (qs) qs.addEventListener('click', psApplyTemplate);
    return;
  }

  // ── Context strip: production cost + where the book stands today
  let liveStats = null;
  try { liveStats = calculateArtistEarnings(psActiveBookId); } catch (_) { liveStats = null; }
  const ctx = document.createElement('div');
  ctx.className = 'ps-stat-grid cols-auto';
  const ctxItem = (label, val, accent) => `
    <div class="ps-stat-card${accent === 'gold' ? ' tone-gold' : ''}">
      <div class="ps-stat-label">${label}</div>
      <div class="ps-stat-val">${val}</div>
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
      pill.style.cssText = 'height:44px;display:flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--gold);';
      pill.innerHTML = '<span style="font-size:16px;">∞</span> No ceiling';
      threshWrap.appendChild(pill);
    } else {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.inputMode = 'decimal';
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
    bar.style.cssText = 'display:flex;height:7px;border-radius:var(--r-pill);overflow:hidden;background:var(--cream4);';
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
         <span style="font-size:var(--text-lg);line-height:1;margin-top:2px;">⚠️</span>
         <div>
           <b style="font-weight:700;">Check these settings:</b>
           <ul>${warnings.map(w => `<li>${w}</li>`).join('')}</ul>
         </div>
       </div>`
    : `<div class="alert-card success">
         <span style="font-size:var(--text-lg);line-height:1;">✓</span>
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
        <span>${label} <span style="color:var(--text3); font-size:var(--text-2xs);">· ${cTxt} · ${parseFloat(t.artistPct) || 0}%</span></span>
        <span style="font-family:var(--font-mono);color:rgba(255,255,255,0.6);" title="Revenue falling in this stage">${fmt(r.revenue, cur)}</span>
        <span style="font-family:var(--font-mono);color:var(--gold3);" title="Artist earns from this stage">${fmt(r.artist, cur)}</span>
      </div>`;
  }).join('');

  summary.innerHTML = `
    ${validationHtml}
    <div class="preview-container">
      <div class="preview-title-row">
        <div class="settings-metric-label" style="color:rgba(255,255,255,.5);">Earnings split simulator</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:var(--text-xs);color:rgba(255,255,255,.55);">If gross revenue is</span>
          <input id="ps-sim-input" type="number" inputmode="decimal" step="0.01" value="${gross}" style="width:120px;padding:6px 10px;font-size:var(--text-base);font-family:var(--font-mono);border:var(--stroke-hair) solid rgba(255,255,255,.14);border-radius:var(--r);background:rgba(255,255,255,.06);color:var(--on-inverse);outline:none;">
          <span style="font-size:var(--text-xs);color:rgba(255,255,255,.55);">${escapeHtml(cur)}</span>
        </div>
      </div>
      <div class="preview-bar">
        <div class="preview-bar-fill" style="width:${Math.max(0, Math.min(100, artistPct))}%;"></div>
      </div>
      <div class="preview-summary-values">
        <span style="color:var(--gold3);font-family:var(--font-mono);">Artist ${fmt(sim.totalArtist, cur)} <span style="opacity:.65;">(${artistPct.toFixed(1)}%)</span></span>
        <span style="color:rgba(255,255,255,.7);font-family:var(--font-mono);">Publisher ${fmt(sim.publisher, cur)}</span>
      </div>
      <div class="preview-table">
        <div class="preview-table-header">
          <span>Stage</span><span>Revenue</span><span>Artist</span>
        </div>
        <div style="color:rgba(250,246,236,.85);">${tierRowsHtml || '<div style="font-size:var(--text-xs);color:rgba(255,255,255,.4);padding:6px 0;">Enter a revenue figure to preview the split.</div>'}</div>
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
export function calculateArtistEarnings(bookId) {
  const book = BOOKS[bookId];
  if (!book) return null;
  const s = states[bookId] || defaultState(book);
  return calcArtistEarnings(book, s);
}

// ── FINANCIAL CENTER LOGIC
/**
 * A foreign-currency expense with no CAD value yet (logged offline, or saved
 * before a rate could be found). Its raw foreign amount must never be added to
 * CAD totals as if it were dollars; it counts 0 until healExpenseRates fills in
 * its baseAmount, and the screens/exports say so.
 */
export function isExpenseAwaitingRate(e) {
  if (!e) return false;
  const cur = String(e.currency || e.origCurrency || 'CAD').toUpperCase();
  return cur !== 'CAD' && !(e.baseAmount || e.amountCAD) && (parseFloat(e.amount) || 0) > 0;
}

export function calculateFinancials(year) {
  const result = {
    revenue: 0,
    cogs: 0,
    opex: 0,
    shares: 0,
    profit: 0,
    bookStats: [],
    expCats: {},
    missingReceiptsCount: 0,
    fxWaitingCount: 0
  };

  const yearStr = String(year);

  // Helper for consistent amount extraction. A foreign expense still waiting for
  // its exchange rate counts 0 (and is tallied) rather than 1:1.
  const getAmt = (e) => {
    if (isExpenseAwaitingRate(e)) { result.fxWaitingCount++; return 0; }
    return e.baseAmount || e.amountCAD || e.amount || 0;
  };

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

export function filterArtistEarningsByYear(bookId, year) {
  const book = BOOKS[bookId];
  const s = states[bookId] || defaultState(book);
  const tiers = [...(book.profitTiers || [])].sort((a, b) => (a.revenueUpTo || Infinity) - (b.revenueUpTo || Infinity));
  if (tiers.length === 0) return 0;

  const capOf = (t) => tierEffectiveCap(t, book.productionCost);
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
      let revRemaining = roundCents(h.qty * h.price);
      while (revRemaining > 0.001) {
        // Uses the same effective cap as calcArtistEarnings: a "break-even" tier
        // caps at the book's production cost, not at its own revenueUpTo. Walking
        // the raw revenueUpTo here (as this did) skipped that cap entirely, so the
        // Tax Centre's year-end artist share could disagree with the lifetime
        // figure shown on the dashboard for the very same sales.
        const tier = tiers.find(t => capOf(t) !== null && cumulativeRevenue < capOf(t)) || tiers[tiers.length - 1];
        const tCap = capOf(tier);
        const isLastTier = tier === tiers[tiers.length - 1] || tCap === null;
        const capacity = isLastTier ? revRemaining : Math.min(revRemaining, tCap - cumulativeRevenue);
        if (inYear) yearArtistEarned = roundCents(yearArtistEarned + capacity * (tier.artistPct / 100));
        cumulativeRevenue = roundCents(cumulativeRevenue + capacity);
        revRemaining = roundCents(revRemaining - capacity);
      }
    }
  }

  return yearArtistEarned;
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
  showAppShell(role, bookId);
  boot(bookId || ACTIVE_BOOK_FORCED);
}

// The app's frame for a role, without loading anything (boot does that).
function showAppShell(role, bookId) {
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
    const style = document.getElementById('author-mode-hides') || document.createElement('style');
    style.id = 'author-mode-hides';
    style.textContent = '#sheets-open-link{display:none!important;}#side-sheets-open{display:none!important;}#open-sheet-link{display:none!important;}#d-breakeven-kpi{display:none!important;}#d-breakeven-block{display:none!important;}#d-reimburse-sect{display:none!important;}#d-expenses-sect{display:none!important;}#d-expenses-kpi{display:none!important;}#d-reimburse-kpi{display:none!important;}#danger-zone-sect{display:none!important;}#danger-zone-block{display:none!important;}#import-btn{display:none!important;}#tab-all-overview{display:none!important;}#backups-tab-btn{display:none!important;}#exp-ai-btn{display:none!important;}';
    document.head.appendChild(style);
  } else {
    // Publisher — show the import button
    const importBtn = $('import-btn'); if (importBtn) importBtn.style.display = '';
    const websiteTabBtn = $('website-tab-btn'); if (websiteTabBtn) websiteTabBtn.style.display = '';
    const backupsBtn = $('backups-tab-btn'); if (backupsBtn) backupsBtn.style.display = '';
  }
  updateRoleToggleButton();
  syncRoleUI();
}

async function boot(forcedBook) {
  buildBookSwitcher();
  const bootLoads = [loadPaymentLinks(), loadProductionCosts(), loadWebsitePaymentMethods()];
  // Publisher-only data: firestore.rules / database.rules.json deny these four
  // to every other account, and the Customers and Open Call tabs that use them
  // are closed to authors (switchTab). Keyed on the signed-in ACCOUNT, not
  // isAuthor(): the publisher previewing "Author view" must still load them, or
  // a later save from the Customers tab would write back an empty list.
  if (isPublisherSession()) {
    bootLoads.push(loadCustomerSuppression(), loadMailingList(), loadCampaigns(), openCallScreen.call('loadOpenCalls'));
  }
  // The books start loading alongside these settings rather than after them
  // (initFn, run now): nothing in a book's read needs them, and waiting cost a
  // full round trip before the first sale figure could load. What does need
  // them — the first full render, the open-call migration — waits on this.
  const settingsLoaded = Promise.all(bootLoads);
  initFn(settingsLoaded);
  await settingsLoaded;
  // loadOpenCalls() counts its nav badge as soon as it lands, which can be
  // before the suppression list has — recount now that both are in, or
  // suppressed contributors show as waiting on you until the next edit.
  if (isPublisherSession()) openCallScreen.call('updateOpenCallBadges');
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
  // No processSyncQueue() here: the books are loading by now, and a queued
  // change is sent once its book has loaded (initFn), not raced against it.

  function initFn(settingsLoaded) {
    fbReady = true;
    if (forcedBook) {
      // Author mode — load only this book
      setActiveBook(forcedBook);
      if (!BOOKS[forcedBook]) { showToast('Book not found', 'err'); return; }
      showAuthorBookFrame(forcedBook);
      Promise.all([loadBook(forcedBook), settingsLoaded]).then(() => {
        setSyncState('ok', '<b>Firestore</b> · connected');
        updateSubheader(new Date().toLocaleTimeString());
        renderAll(); updateHeader(); updateRoleToggleButton(); syncRoleUI();
        noteStartupFinished();
        noteDeviceCopyFresh();
        // Send anything queued before the app was last closed. The call before
        // initFn runs while Firestore isn't ready yet, so it can't.
        processSyncQueue();
        // Fire-and-forget: a stall with no signal must still finish booting,
        // so this isn't awaited and its own failures are swallowed silently.
        window.posConfigureRates({ silent: true });
      });
    } else {
      // Publisher. A book opened during the startup preview stays open.
      if (!_startupPreviewShown) setActiveBook('all');
      // Painted before the await so the landing screen shows the catalogue
      // arriving rather than nothing at all. Replaced by updateAllOverview()
      // the moment loadAllBooks() resolves.
      showCatalogueSkeleton();
      loadAllBooks({ settingsLoaded }).then(async () => {
        await prepareTestProfile();
        // Send anything queued before the app was last closed (see author branch).
        processSyncQueue();
        maybeRunDailyBackup(true); startDailyBackupWatcher();
        window.posConfigureRates({ silent: true });
        // Ask the storefront whether any sale is missing from the ledger. Runs
        // only once the books are loaded (the comparison needs the history it
        // is comparing against), silent by design, and served from a recent
        // cache when there is one. A website order that never reached the app
        // is invisible everywhere until something goes looking for it.
        autoCheckBigCartelLedgerGaps()
          // Then keep asking. The boot check alone leaves an app that stays
          // open all day blind to every sale after the first minute of it.
          .then(startBigCartelOrderWatch)
          .catch(() => { /* offline or not configured */ });
        // The other half of the same journey: labels bought on Shippo's own
        // site, which the app could otherwise only learn about four clicks deep
        // in the Tax Centre. Started after the books load because linking a
        // label needs the order history to link it to.
        startShippoLabelWatch();
        // And the third: labels bought on canadapost.ca, which the app can ask
        // the carrier about directly because it is the same business account.
        startCanadaPostSweep();
        // And the fourth: another courier's label, which leaves no API trace
        // but does leave a confirmation email.
        startShippingEmailSweep();
        // And after the label: follow each parcel to the door, and speak up
        // when one is waiting at a post office, stuck, or coming back.
        startDeliveryWatch();
        // Paid orders that haven't gone out, and whether shipping pays for itself.
        startOrderFollowups();
        // The morning after a market day: one summary of what sold in person.
        // With Stripe connected it waits for the first Stripe check, so the
        // reader payments it compares against are there.
        if (!getReconStripeKey()) showMarketDaySummaryIfDue();
        // Money coming in rather than going out: a consignment store paying its
        // invoice through the Stripe link. Started after the books load because
        // settling an invoice reaches into its own book's ledger.
        startStripeInvoiceWatch();
        // And the money Stripe keeps: its processing fees, filed every fortnight
        // and whenever a year has ended since the last run.
        startStripeFeeWatch();
        // And the other direction: money that hasn't come in. Started after the
        // Stripe watch so an invoice that was paid through its link is settled
        // before anybody gets chased for it.
        startPaymentReminderWatch();
        // The receipt inbox scanning itself, rather than waiting for the
        // publisher to open the modal and press Extract. Everything it finds
        // still lands in that same review table, checked or not — nothing is
        // filed until she looks at it.
        startReceiptEmailSweep();
        // A fault recorded before the last reload is still a fault. Painted
        // here so the mark is on the tab from the first render rather than
        // only after the next failed check.
        renderIntegrationBadges();
      });
      updateRoleToggleButton();
      syncRoleUI();
    }
  }
}

// An artist's own book on its dashboard tab, nothing else (boot, and the
// startup preview before boot).
function showAuthorBookFrame(bookId) {
  applyBookAccentTokens(bookId);
  $('tab-all-overview').style.display = 'none';
  $('tab-all-overview').classList.remove('active');
  $('tab-bar').style.display = '';
  $('tab-dashboard').style.display = 'block';
  $('tab-dashboard').classList.add('active');
}

// ── TAX CENTER LOGIC ──
// Entering and correcting ledger lines, receipt snap/scan, the trip and
// category drill-downs, the ledger shortcuts and the tax-season export live in
// features/tax-entries.js. Started here, where that code used to run inline,
// so its listeners come up at the same point in start-up as before.
initTaxEntries();
Object.assign(window, {
  snapReceipt,
  snapReceiptChosen,
  downloadFullTaxSeasonExport,
  downloadFullTaxSeasonExportDirect: downloadFullTaxSeasonExport,
});

// ── Integrations & API Configuration: collapsible sections, state remembered per browser ──
const INTEGRATION_SECTION_KEYS = ['gemini', 'shippo', 'stripe', 'zonos', 'canadapost'];

function applyIntegrationSectionState(key, collapsed) {
  const body = document.getElementById(`tc-integration-body-${key}`);
  const chevron = document.getElementById(`tc-integration-chevron-${key}`);
  if (!body || !chevron) return;
  // `hidden`, never an inline display value: the body is a CSS flex COLUMN and
  // restoring it with an inline `display:flex` used to relay its blocks as a
  // row, which is what sheared the Shippo panel sideways after one collapse.
  body.hidden = collapsed;
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
    applyIntegrationSectionState(key, localStorage.getItem(`lm-integrations-collapsed-${key}`) === '1');
  });
});

// ── MODAL UX: backdrop-click + Esc to close, clear validation on input ──
// The modal primitives live in src/lib/modal.js and know nothing about this
// app's dialogs. Seeding the date field is the one behaviour that does, so it
// is registered here rather than living in the leaf module.
//
// This runs for EVERY modal, not just the three named ones — any dialog that
// happens to contain a #ret-date field gets today's date. That is the
// long-standing behaviour, preserved deliberately.
// The pop-up on top: the one opened last through openM, or — for the few
// shown some other way — the last open one in the page, as Esc always did.
function topOverlayId() {
  const opened = topOpenModalId();
  if (opened) return opened;
  const open = Array.from(document.querySelectorAll('.overlay')).filter(o =>
    o.style.display !== 'none' &&
    !o.classList.contains('closing') && o.id.startsWith('m-') &&
    !o.hasAttribute('data-no-backdrop-close'));
  return open.length ? open[open.length - 1].id.slice(2) : null;
}

// On an Android phone the back gesture closes the pop-up on top (asking first
// if there is unsaved typing) instead of leaving the app. See back-close.js.
const backClose = installBackClose({ getTop: topOpenModalId, requestClose: attemptCloseModal });

configureModals({
  onStackChange: () => backClose.sync(),
  prepareOpen: (id) => {
    const d = id === 'send-books' ? 'send-date' : id === 'record-sale' ? 'sale-date' : 'ret-date';
    if ($(d)) $(d).value = today();
    if (id === 'add-store') {
      populateAddStoreDirectory();
    }
  },
});

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
    const top = topOverlayId();
    if (!top) return;
    // Handled here, so the browser doesn't also pass Esc to the back-gesture
    // watcher and close a second pop-up.
    e.preventDefault();
    attemptCloseModal(top);
  });

  // Clear a field's error state as soon as the user edits it.
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('.form-group.invalid')) clearFieldError(t);
    // Any dialog, not just Add Book: typing in an open form raises that form's
    // "unsaved changes" flag. refreshUnsavedMarkers drives the Add Book
    // indicator too, so there is no bespoke path left to keep in step.
    if (t && t.closest && t.closest('.overlay[id^="m-"]')) refreshUnsavedMarkers();
  });

  // Same for changes that don't fire `input` — select dropdowns, colour swatches,
  // checkboxes — in any open dialog.
  document.addEventListener('change', (e) => {
    const t = e.target;
    // A dropdown answered by its phone tap buttons only fires `change`, so the
    // error under it clears here (Add sale's payment type on a phone).
    if (t && t.closest && t.closest('.form-group.invalid')) clearFieldError(t);
    if (t && t.closest && t.closest('.overlay[id^="m-"]')) refreshUnsavedMarkers();
  });
});

// ── EVENT POS ──
// The register lives in features/pos.js. It is started here, where its code
// used to run inline, so its saved exchange rates and keyboard shortcuts come
// up at the same point in start-up as before, and its inline handlers are on
// window from this point on.
initPos();
Object.assign(window, {
  posSearchFilter,
  fairOpenCharge,
  fairShowQR,
  fairOpenToday,
  fairVoidSale,
  fairSetName,
  fairTileNoneLeft,
  fairOpenSummary,
  fairShareSummary,
  fairCharge,
  fairUndoLastSale,
  posPickPayment,
  posMobileView,
  posUpdateQty,
  posRemoveItem,
  openPosPriceModal,
  posPriceQuick,
  posPricePreview,
  savePosPrice,
  posResetPrice,
  copyPosQRLink,
  downloadPosQR,
  posGenerateSaleQR,
  posGenerateLineQR,
  posSetCurrency,
  fairSetCurrency,
  posConfigureRates,
  posCheckout,
  posConfirmSale,
  posPrintReceipt,
  posSyncPaymentSeg,
});

// The Tax Centre ledger shortcuts are installed by initTaxEntries() above (features/tax-entries.js).

// ── Upload status pill ───────────────────────────────────────────────────
export function renderFairSyncPill() {
  const view = fairSyncPill({
    online: typeof navigator === 'undefined' || navigator.onLine !== false,
    pending: syncQueue.length,
    retrying: _syncRetrying,
    atRisk: _syncQueueHeldInMemory,
  });
  // The register's pill and the phone home's strip say the same thing.
  for (const id of ['fm-sync', 'today-sync']) {
    const pill = $(id);
    if (!pill) continue;
    pill.textContent = view.text;
    pill.dataset.tone = view.tone;
    pill.setAttribute('aria-label', view.srText);
  }
}

// The tax-season CSV export (downloadFullTaxSeasonExport) lives in features/tax-entries.js.

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
export function getReconStripeKey() {
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
      await saveTaxCenter();
    }
  } catch (e) { console.warn('Stripe key persist failed:', e); }
}

// Pull recent charges and normalize them. We expand the PaymentIntent so we can
// read link metadata (book_id/sku) and the richer description that payment
// links attach to the intent rather than the charge.
export async function fetchStripePaymentsForReconcile(maxPages = 3, { since = 0 } = {}) {
  const key = getReconStripeKey();
  if (!key) throw new Error('No Stripe key — paste a restricted/secret key first.');
  if (!/^(rk|sk)_/.test(key)) throw new Error("That doesn't look like a Stripe key (expected rk_… or sk_…).");
  await _reconPersistKey(key);

  const out = [];
  let starting_after = null;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ limit: '100' });
    params.append('expand[]', 'data.payment_intent');
    // `since` narrows the window at Stripe's end rather than ours. The manual
    // worklist wants everything recent and passes nothing; a background poll
    // running every few minutes would otherwise drag hundreds of charges across
    // the wire to discover that nothing happened.
    if (since > 0) params.set('created[gte]', String(Math.floor(since / 1000)));
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
        date: localDay((ch.created || 0) * 1000),
        description: (ch.description || pi?.description || '').trim(),
        email: ch.billing_details?.email || ch.receipt_email || '',
        customer: ch.billing_details?.name || '',
        receiptNumber: ch.receipt_number || '',
        refunded: !!ch.refunded || (ch.amount_refunded > 0),
        fullyRefunded: !!ch.refunded,
        amountRefunded: _stripeMinorToMajor(ch.amount_refunded || 0, cur),
        disputed: !!ch.disputed,
        // Tapped or dipped on a card reader, as opposed to typed into a web page.
        cardPresent: /_present$/.test(String(ch.payment_method_details?.type || '')),
        metadata,
      });
    }
    if (!json.has_more || !json.data.length) break;
    starting_after = json.data[json.data.length - 1].id;
    if (page === maxPages - 1) out.truncated = true; // older charges in the window were not read
  }
  // Remember which PaymentIntent each charge belongs to, so a sale recorded
  // from Stripe can be recognised later as a website order (website-link.js).
  try {
    const known = JSON.parse(localStorage.getItem(STRIPE_CHARGE_PI_KEY) || '{}');
    localStorage.setItem(STRIPE_CHARGE_PI_KEY, JSON.stringify(rememberChargeIntents(known, out)));
  } catch (_) { /* storage full or blocked: only the link's matching is less sure */ }
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
// `near` widens "same amount" to within 10%: before recording on its own, a
// register row in euros holds a live-converted figure (€37.42 for a €40 copy),
// so an exact match would miss the very sale it is guarding against.
// A caller checking a whole list without recording anything in between may
// pass `logged` from _reconLoggedPayments(), so each payment doesn't re-walk
// every book's history (and re-parse every row's date).
function _reconLikelyAlreadyLogged(p, { near = false, logged = _reconLoggedPayments() } = {}) {
  const target = Math.round(p.amount * 100);
  const slack = near ? target * 0.1 : 0;
  for (const { cents, time } of logged.get(p.currency) || []) {
    if (Math.abs(cents - target) > slack) continue;
    if (Math.abs((time - p.created) / 86400000) <= 3) return true;
  }
  return false;
}

// The paid history rows _reconLikelyAlreadyLogged compares against, read in
// one pass: per currency, each row's amount in cents and its sale day's time.
function _reconLoggedPayments() {
  const byCurrency = new Map();
  for (const s of Object.values(states)) {
    for (const h of (s.hist || [])) {
      if (h.voided || h.gratuity) continue;
      const pay = h.payment;
      if (!pay || !pay.amount) continue;
      const cur = normalizeCurrencyCode(pay.currency || '', '');
      if (!byCurrency.has(cur)) byCurrency.set(cur, []);
      byCurrency.get(cur).push({ cents: Math.round(pay.amount * 100), time: new Date(h.date).getTime() });
    }
  }
  return byCurrency;
}

/** A website order with this id is already in some book's history. */
function websiteOrderInBooks(orderId) {
  const id = String(orderId || '');
  return !!id && Object.values(states).some(s => (s?.hist || []).some(h => h && h.webOrderId === id));
}

// Classify a payment into one of the matchable channels. A caller classifying
// a whole list without recording anything in between may pass the memory and
// recorded-charge set (and logged payments) it built once, so each payment
// doesn't re-read storage and re-scan every book's history.
export function classifyStripePayment(p, { mem = getReconMemory(), recordedIds = _reconRecordedChargeIds(), logged } = {}) {

  if (mem.dismissed[p.id]) return { kind: 'dismissed' };
  if (mem.recorded[p.id] || recordedIds.has(p.id)) return { kind: 'recorded', bookId: mem.recorded[p.id]?.bookId };

  // A payment taken by the shop's website. Once the website link is running
  // the website sends the order itself, with its books and copies, so the
  // payment is never recorded here by hand (or automatically) as well.
  // The "link is running" mark is per device, so a sale already brought in
  // from the website on another device counts too.
  if (p.metadata?.order_id && (websiteLinkActive() || websiteOrderInBooks(p.metadata.order_id))) {
    return { kind: 'website', ref: String(p.metadata.order_id) };
  }

  // An author forwarding cash they collected for an already-recorded sale.
  // Never a new book sale — it only settles an artistTransfers row.
  if (p.metadata?.kind === 'artist_transfer') {
    return { kind: 'artist_transfer', bookId: p.metadata.transfer_book || null, ref: p.metadata.transfer_num || '' };
  }

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

  if (_reconLikelyAlreadyLogged(p, { logged })) return { kind: 'likely' };

  return { kind: 'direct', bookId: null };
}

// Apply a sale to a SPECIFIC book (the reconcile worklist records against the
// book the user picks, not necessarily the active one), keyed by a
// deterministic stripe sheetsId. It goes through the same ledger write as a
// sale typed into the order form, so a Stripe sale and a hand-entered one are
// the same kind of row apart from where the money came from.
function _reconApplySaleToBook(bookId, qty, price, payment, chargeId, notes, extra = {}) {
  const row = { shipEmail: extra.email || '' };
  if (extra.auto) row.autoRecorded = true;
  writeOrderToLedger(bookId, {
    num: extra.num || '',
    chan: extra.chan || 'Website',
    qty, price, payment,
    notes: notes || 'Stripe',
    enteredBy: 'Publisher',
    date: extra.date || today(),
    sheetsId: 'stripe-' + chargeId,
    extra: row,
  });
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
    if (statusEl && stripeSaleAutoEnabled()) statusEl.textContent = 'Recording the sales that are ready…';
    const auto = await recordReadyStripeSales(payments);
    _reconSession.logged += auto.length;
    const autoNote = !auto.length ? ''
      : auto.length === 1
        ? ` Recorded automatically: ${auto[0].qty} × ${escapeHtml(auto[0].bookTitle)}.`
        : ` Recorded ${auto.length} sales automatically.`;
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--green);">✓ Pulled ${payments.length} payment${payments.length === 1 ? '' : 's'} from Stripe.${autoNote}</span>`;
    renderReconcile();
  } catch (e) {
    const msg = String(e.message || e);
    let hint = '';
    if (/permission|rak_charge_read|rak_payment_intent_read/i.test(msg)) {
      hint = `<br><span style="font-size:var(--text-xs);line-height:1.6;display:inline-block;margin-top:4px;">
        Your restricted key is missing a read scope. In
        <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener" style="color:var(--gold);">Stripe → API keys</a>,
        edit the key (or create a new one) and grant <strong>Read</strong> on
        <strong>Charges</strong> and <strong>PaymentIntents</strong> (keep <strong>Balance transactions</strong> for the fees tool).
        A full <code>sk_live_…</code> secret key also works. Then paste it above and sync again.</span>`;
    } else if (/Failed to fetch|NetworkError|CORS/i.test(msg)) {
      hint = '<br><span style="font-size:var(--text-xs);">Your browser may be blocking the direct Stripe call (CORS). Try again, or use a restricted key.</span>';
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

const resolveStripeRate = createStripeRateResolver({
  fetchRate: fetchHistoricalRate,
  storage: {
    getItem: key => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  },
});

// Copies a payment covers at the price the app knows in the paid currency —
// the price on its own payment link, or the book's — else 1 for her to set.
function _reconDefaultQty(p, bookId) {
  const book = bookId ? BOOKS[bookId] : null;
  if (!p || !book) return 1;
  const unit = paidUnitPrice(p, book, normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD'));
  return (unit && wholeCopies(p.amount, unit.price)) || 1;
}

// Update the existing fields rather than rebuilding the card: preserve edits,
// focus, and ignore responses for a book/currency selection that has changed.
async function reconUpdateDefaults(id, grouped = false, reset = false, retry = false) {
  const prefix = grouped ? 'recon-g' : 'recon-';
  const input = document.getElementById(`${prefix}rate-${id}`);
  const status = document.getElementById(`${prefix}fx-${id}`);
  const button = document.getElementById(`${prefix}rec-${id}`);
  const bookId = document.getElementById(`${prefix}book-${id}`)?.value;
  const p = grouped
    ? (window._reconPayments || []).find(p => p.id === window._reconGroupMap?.[id]?.[0])
    : _reconFindPayment(id);
  if (!input || !status || !button || !p) return;
  const request = String(Number(input.dataset.request || 0) + 1);
  input.dataset.request = request;
  if (reset) { input.value = ''; delete input.dataset.manual; }
  // "Choose a book to record this sale" stays visible until a book is picked.
  const hint = document.getElementById(`${prefix}hint-${id}`);
  if (hint) hint.hidden = !!(bookId && BOOKS[bookId]);
  if (!bookId || !BOOKS[bookId]) {
    button.disabled = true;
    // The "Choose a book to record this sale" hint already says what is missing.
    status.textContent = '';
    return;
  }
  // A different book has a different price, so the copy count follows it
  // unless she has typed one herself.
  const currency = normalizeCurrencyCode(document.getElementById(`${prefix}currency-${id}`)?.value, '');
  const qtyInput = document.getElementById(`${prefix}qty-${id}`);
  if (reset && qtyInput && qtyInput.dataset.manual !== '1') qtyInput.value = String(_reconDefaultQty({ ...p, currency }, bookId));
  const bookCurrency = normalizeCurrencyCode(getBookCurrencyCode(BOOKS[bookId]), 'CAD');
  const pair = `${currency}:${bookCurrency}:${p.date}`;
  if (input.dataset.pair && input.dataset.pair !== pair) {
    input.value = '';
    delete input.dataset.manual;
  }
  input.dataset.pair = pair;
  input.disabled = currency === bookCurrency;
  const manual = input.dataset.manual === '1' && Number(input.value) > 0;
  button.disabled = !manual && currency !== bookCurrency;
  status.textContent = currency === bookCurrency ? 'No conversion needed.' : 'Fetching the payment-date exchange rate…';
  const result = manual ? { rate: Number(input.value), source: 'manual' }
    : await resolveStripeRate({ ...p, currency }, bookCurrency, { retry });
  if (!input.isConnected || input.dataset.request !== request) return;
  const overridden = input.dataset.manual === '1';
  if (!overridden) input.value = result.rate ? String(result.rate) : '';
  input.dataset.source = overridden ? 'manual' : (result.source || '');
  input.dataset.rateDate = overridden ? '' : (result.date || '');
  const rate = Number(input.value);
  const amount = Number(document.getElementById(`${prefix}amount-${id}`)?.value);
  button.disabled = false; // Invalid/missing values are explained on Record.
  if (!(rate > 0) || !Number.isFinite(rate)) {
    status.textContent = `Couldn’t get the exchange rate for ${p.date}. Check your connection and retry, or type a rate in the field above. `;
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'btn tag sm';
    again.textContent = 'Retry rate';
    again.addEventListener('click', () => reconUpdateDefaults(id, grouped, false, true));
    status.appendChild(again);
    return;
  }
  const total = Number.isFinite(amount) && amount > 0 ? _stripeFmtMoney(roundCents(amount * rate), bookCurrency) : 'Enter the paid amount';
  const source = currency === bookCurrency ? 'No conversion needed'
    : overridden ? 'Your exchange rate' : `Reference rate${result.date ? ` · ${result.date}` : ` for ${p.date}`}`;
  status.textContent = `${source} · ${total}${grouped ? ' per payment' : ''}`;
}

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
function _reconSavedKey() {
  return (TAX_CENTER?.settings?.stripeKey || getInvoiceSettings().stripeKey || '').trim();
}
function reconRenderKeyRow(forceEdit) {
  const row = document.getElementById('recon-keyrow');
  if (!row) return;
  const saved = _reconSavedKey();
  if (saved && !forceEdit && !row.dataset.editing) {
    row.innerHTML = `<span class="recon-key-saved">🔒 Stripe key saved <span class="recon-key-mask">••••${escapeHtml(saved.slice(-4))}</span></span>
      <button class="btn tag sm" onclick="reconEditKey()">Change</button>`;
  } else {
    row.innerHTML = `<input type="password" id="recon-key" placeholder="rk_live_… or sk_live_… (reused from Tax Centre / Invoices if already saved)" autocomplete="off" value="${escapeHtml(saved)}">`;
  }
}

// The two settings folds open once per visit to this screen. They start open on
// a wide screen, and on a phone only while no Stripe key is saved, so first-time
// setup is never hidden. The data flag keeps the user's own toggling from being
// reset by the next render.
function _reconInitFolds(hasKey) {
  const wide = globalThis.matchMedia?.('(min-width: 769px)').matches ?? false;
  ['recon-settings', 'pm-settings'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || el.dataset.foldInit) return;
    el.dataset.foldInit = '1';
    el.open = wide || !hasKey;
  });
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
// Layout lives in CSS (.recon-fields / .recon-f-* / .recon-actions); the markup
// only says which field is which.
function _reconAmountBadge(p) {
  return `<span class="recon-amount">${_stripeFmtMoney(p.amount, p.currency)}</span>`;
}
function _reconMeta(p) {
  const who = [p.customer, p.email].filter(Boolean).join(' · ') || '—';
  const desc = p.description ? `<div class="recon-meta-desc">${escapeHtml(p.description)}</div>` : '';
  return `<div class="recon-meta">${escapeHtml(p.date)} · ${escapeHtml(who)}</div>${desc}`;
}
// The paid-amount explanation, shown once above the worklist instead of on every card.
const _RECON_PAID_NOTE_HTML = '<p class="recon-note recon-note-once">Stripe’s paid amount is preserved. A payment-date reference rate, the number of copies and an order number fill automatically; you can edit them. The reference rate may differ from Stripe’s payout conversion.</p>';

// One needs-review card.
function _reconNeedCard(p, c) {
  const idSafe = p.id.replace(/[^A-Za-z0-9_]/g, '');
  const disputed = p.disputed ? ` <span class="pill red recon-pill">⚠ Disputed</span>` : '';

  // Invoice not yet marked paid → send her to the proper invoice flow.
  if (c.kind === 'invoice') {
    const goBtn = c.bookId
      ? `<button class="btn gold sm" onclick="reconcileOpenInvoice('${idSafe}')">Open invoice ${escapeHtml(c.ref)} →</button>`
      : `<span class="recon-warn">Invoice ${escapeHtml(c.ref)} not found in this app</span>`;
    return `<div class="card recon-card">
      <div class="recon-variant">
        <div class="recon-info"><div>${_reconAmountBadge(p)} <span class="pill blue recon-pill">Invoice</span>${disputed}</div>${_reconMeta(p)}</div>
        <div class="recon-actions">${goBtn}
          <button class="btn tag sm" onclick="reconcileDismiss('${idSafe}')" title="Not an inventory sale">Dismiss</button></div>
      </div></div>`;
  }

  // Big Cartel order that was scanned but not yet applied → one-click apply.
  if (c.kind === 'bigcartel' && c.scanned) {
    return `<div class="card recon-card">
      <div class="recon-variant">
        <div class="recon-info"><div>${_reconAmountBadge(p)} <span class="pill green recon-pill">Big Cartel ${escapeHtml(c.ref)}</span>${disputed}</div>${_reconMeta(p)}</div>
        <div class="recon-actions">
          <button class="btn gold sm" onclick="reconcileApplyBigCartel('${idSafe}')">Apply order</button>
          <button class="btn tag sm" onclick="reconcileDismiss('${idSafe}')">Dismiss</button></div>
      </div></div>`;
  }

  // Direct sale (bare pi_…) or Big Cartel order we never scanned → pick a book.
  const kindPill = c.kind === 'bigcartel'
    ? `<span class="pill green recon-pill">Big Cartel ${escapeHtml(c.ref)}</span>`
    : `<span class="pill gold recon-pill">Direct sale</span>`;
  const suggest = c.bookId ? `<span class="recon-suggest">SKU match → ${escapeHtml(BOOKS[c.bookId].title)}</span>` : '';
  const recDisabled = c.bookId ? '' : ' disabled';
  return `<div class="card recon-card">
    <div class="recon-info"><div>${_reconAmountBadge(p)} ${kindPill}${suggest}${disputed}</div>${_reconMeta(p)}</div>
    <div class="recon-fields">
      <div class="form-group recon-f-book">
        <label for="recon-book-${idSafe}">Book</label>
        <select id="recon-book-${idSafe}" onchange="reconUpdateDefaults('${idSafe}', false, true)">${_reconBookOptions(c.bookId, !c.bookId)}</select>
      </div>
      <div class="form-group recon-f-qty">
        <label for="recon-qty-${idSafe}">Qty</label>
        <input type="number" inputmode="numeric" id="recon-qty-${idSafe}" value="${_reconDefaultQty(p, c.bookId)}" min="1" oninput="this.dataset.manual='1'">
      </div>
      <div class="form-group recon-f-num">
        <label for="recon-num-${idSafe}">Order #</label>
        <input type="text" id="recon-num-${idSafe}" maxlength="80" value="${escapeHtml(stripeOrderNumber(p))}" autocomplete="off">
      </div>
      <div class="form-group recon-f-amt">
        <label for="recon-amount-${idSafe}">Stripe amount paid</label>
        <input type="number" id="recon-amount-${idSafe}" value="${Number(p.amount).toFixed(2)}" min="0.01" step="0.01" inputmode="decimal" oninput="reconUpdateDefaults('${idSafe}')">
      </div>
      <div class="form-group recon-f-cur">
        <label for="recon-currency-${idSafe}">Currency</label>
        <input type="text" id="recon-currency-${idSafe}" value="${escapeHtml(p.currency)}" maxlength="3" pattern="[A-Za-z]{3}" autocapitalize="characters" autocomplete="off" onchange="reconUpdateDefaults('${idSafe}', false, true)">
      </div>
      <div class="form-group recon-f-rate">
        <label for="recon-rate-${idSafe}">Automatic exchange rate</label>
        <input type="number" id="recon-rate-${idSafe}" data-recon-default="${idSafe}" min="0.000001" step="any" inputmode="decimal" placeholder="Automatic" oninput="this.dataset.manual='1';reconUpdateDefaults('${idSafe}')" aria-describedby="recon-fx-${idSafe}">
      </div>
      <div class="recon-actions">
        <button class="btn gold sm recon-rec" id="recon-rec-${idSafe}"${recDisabled} aria-describedby="recon-hint-${idSafe}" onclick="reconcileRecordSale('${idSafe}')">Record sale</button>
        <button class="btn tag sm" onclick="reconcileDismiss('${idSafe}')" title="Not an inventory sale (donation, test charge, etc.)">Dismiss</button>
      </div>
    </div>
    <div class="recon-hint" id="recon-hint-${idSafe}"${c.bookId ? ' hidden' : ''}>Choose a book to record this sale.</div>
    <div id="recon-fx-${idSafe}" class="recon-fx" role="status" aria-live="polite">Preparing the exchange rate…</div>
  </div>`;
}

// A grouped card standing in for N identical pickable payments.
function _reconGroupCard(items, gi) {
  const p = items[0].p, c = items[0].c, n = items.length;
  const kindPill = c.kind === 'bigcartel'
    ? `<span class="pill green recon-pill">Big Cartel</span>`
    : `<span class="pill gold recon-pill">Direct sale</span>`;
  const suggest = c.bookId ? `<span class="recon-suggest">SKU match → ${escapeHtml(BOOKS[c.bookId].title)}</span>` : '';
  const total = _stripeFmtMoney(items.reduce((s, it) => s + it.p.amount, 0), p.currency);
  const desc = p.description ? `<div class="recon-meta-desc">${escapeHtml(p.description)}</div>` : '';
  const recDisabled = c.bookId ? '' : ' disabled';
  return `<div class="card recon-card recon-group">
    <div class="recon-info"><div>${_reconAmountBadge(p)} <span class="recon-count">× ${n}</span> ${kindPill}${suggest}</div>
      <div class="recon-meta">${n} identical payments · ${escapeHtml(total)} total</div>${desc}</div>
    <div class="recon-fields">
      <div class="form-group recon-f-book">
        <label for="recon-gbook-${gi}">Book (applies to all ${n})</label>
        <select id="recon-gbook-${gi}" onchange="reconUpdateDefaults('${gi}', true, true)">${_reconBookOptions(c.bookId, !c.bookId)}</select>
      </div>
      <div class="form-group recon-f-qty">
        <label for="recon-gqty-${gi}">Qty each</label>
        <input type="number" inputmode="numeric" id="recon-gqty-${gi}" value="${_reconDefaultQty(p, c.bookId)}" min="1" oninput="this.dataset.manual='1'">
      </div>
      <div class="form-group recon-f-amt">
        <label for="recon-gamount-${gi}">Stripe amount paid</label>
        <input type="number" id="recon-gamount-${gi}" value="${Number(p.amount).toFixed(2)}" min="0.01" step="0.01" inputmode="decimal" oninput="reconUpdateDefaults('${gi}', true)">
      </div>
      <div class="form-group recon-f-cur">
        <label for="recon-gcurrency-${gi}">Currency</label>
        <input type="text" id="recon-gcurrency-${gi}" value="${escapeHtml(p.currency)}" maxlength="3" pattern="[A-Za-z]{3}" autocapitalize="characters" autocomplete="off" onchange="reconUpdateDefaults('${gi}', true, true)">
      </div>
      <div class="form-group recon-f-rate">
        <label for="recon-grate-${gi}">Automatic exchange rate</label>
        <input type="number" id="recon-grate-${gi}" data-recon-default="${gi}" data-grouped="1" min="0.000001" step="any" inputmode="decimal" placeholder="Automatic" oninput="this.dataset.manual='1';reconUpdateDefaults('${gi}', true)" aria-describedby="recon-gfx-${gi}">
      </div>
      <div class="recon-actions">
        <button class="btn gold sm recon-rec" id="recon-grec-${gi}"${recDisabled} aria-describedby="recon-ghint-${gi}" onclick="reconRecordGroup(${gi})">Record all ${n}</button>
        <button class="btn tag sm" onclick="reconDismissGroup(${gi})">Dismiss all ${n}</button>
      </div>
    </div>
    <div class="recon-hint" id="recon-ghint-${gi}"${c.bookId ? ' hidden' : ''}>Choose a book to record these sales.</div>
    <div id="recon-gfx-${gi}" class="recon-fx" role="status" aria-live="polite">Preparing the exchange rate…</div>
    <div class="recon-note">${escapeHtml(p.date)} · Each payment keeps its own order number.</div>
  </div>`;
}

export function renderReconcile() {
  const needsEl = document.getElementById('recon-needs');
  const matchedEl = document.getElementById('recon-matched');
  const summaryEl = document.getElementById('recon-summary');
  const toolbarEl = document.getElementById('recon-toolbar');
  if (!needsEl) return;

  reconRenderKeyRow();
  _reconInitFolds(!!_reconSavedKey());
  renderPaymentConfig();
  renderStripePaidNotifyToggle();

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
  // Nothing is recorded while the list is drawn, so one scan serves every row.
  const classifyCtx = { mem, recordedIds: _reconRecordedChargeIds(), logged: _reconLoggedPayments() };
  for (const p of payments) {
    const c = classifyStripePayment(p, classifyCtx);
    if (c.kind === 'dismissed') { matched.push({ p, c, label: 'Dismissed', tone: 'gray', note: 'Marked "not inventory".' }); continue; }
    if (c.kind === 'recorded') { matched.push({ p, c, label: 'Logged', tone: 'green', note: c.bookId && BOOKS[c.bookId] ? `Recorded against ${BOOKS[c.bookId].title}.` : 'Recorded in inventory.' }); continue; }
    if (c.kind === 'artist_transfer') { matched.push({ p, c, label: 'Author transfer', tone: 'green', note: `An author sent you money for sale ${c.ref || ''} they collected. Mark it received on that book's dashboard — it is not a new sale.`.replace(/\s+/g, ' ') }); continue; }
    if (c.kind === 'likely') { matched.push({ p, c, label: 'Likely logged', tone: 'gray', note: 'Matches a sale you already recorded (same amount & date).' }); continue; }
    if (c.kind === 'website') { matched.push({ p, c, label: 'Website', tone: 'green', note: 'Comes in from your website — it reaches your books by itself (see “From your website” on the Orders tab), so there is nothing to record here.' }); continue; }
    if (p.refunded && p.fullyRefunded !== false) { matched.push({ p, c, label: 'Refunded', tone: 'gray', note: 'Refunded in Stripe — no stock to deduct.' }); continue; }
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
  // Blank, not 'flex': the stylesheet owns the toolbar's layout (flex on desktop, grid on a phone).
  if (toolbarEl) toolbarEl.style.display = needs.length ? '' : 'none';

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
      ? `<span class="recon-sess-txt">${_reconSession.logged} logged · ${_reconSession.dismissed} dismissed this session</span>` : '';
    const pct = payments.length ? Math.round((matched.length / payments.length) * 100) : 0;
    summaryEl.innerHTML = `<div class="kpi-grid recon-kpis">
        <div class="kpi is-lead"><div class="kpi-label">Need review</div><div class="kpi-value">${needs.length}</div><div class="kpi-sub">${moneyStr}${filtering ? ` · showing ${shown.length}` : ''}</div></div>
        <div class="kpi"><div class="kpi-label">Reconciled</div><div class="kpi-value">${matched.length}</div><div class="kpi-sub">${pct}%</div></div>
        <div class="kpi"><div class="kpi-label">Total</div><div class="kpi-value">${payments.length}</div></div>
      </div>
      ${sess ? `<div class="recon-sess">${sess}</div>` : ''}
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
      const sig = [it.p.date, it.p.currency, it.p.amount, (it.p.description || '').trim(), it.c.kind, it.c.ref || '', it.c.bookId || ''].join('|');
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
    needsEl.innerHTML = _RECON_PAID_NOTE_HTML + html;
  } else {
    needsEl.innerHTML = _RECON_PAID_NOTE_HTML + shown.map(({ p, c }) => _reconNeedCard(p, c)).join('');
  }

  needsEl.querySelectorAll('[data-recon-default]').forEach(input => {
    void reconUpdateDefaults(input.dataset.reconDefault, input.dataset.grouped === '1');
  });

  // ── Reconciled (collapsed detail)
  if (!matched.length) { matchedEl.innerHTML = ''; return; }
  const rows = matched.map(({ p, label, tone, note }) => `<tr>
    <td class="recon-nowrap">${escapeHtml(p.date)}</td>
    <td class="r money-cell recon-nowrap">${_stripeFmtMoney(p.amount, p.currency)}</td>
    <td>${escapeHtml([p.customer, p.email].filter(Boolean).join(' · ') || p.description || '—')}</td>
    <td><span class="pill ${tone} recon-pill">${label}</span> <span class="recon-status-note">${escapeHtml(note)}</span></td>
    <td class="r">${getReconMemory().recorded[p.id] || getReconMemory().dismissed[p.id] ? `<button class="btn tag sm" onclick="reconcileUndo('${p.id.replace(/[^A-Za-z0-9_]/g, '')}')">Undo</button>` : ''}</td>
  </tr>`).join('');
  matchedEl.innerHTML = `
    <button type="button" class="btn tag recon-matched-toggle" onclick="(function(el){const d=document.getElementById('recon-matched-tbl');const open=d.style.display!=='none';d.style.display=open?'none':'';el.textContent=(open?'▸':'▾')+' Reconciled payments (${matched.length})';})(this)">▸ Reconciled payments (${matched.length})</button>
    <div id="recon-matched-tbl" style="display:none;">
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th class="r">Amount</th><th>Customer</th><th>Status</th><th></th></tr></thead><tbody id="recon-matched-body">${rows}</tbody></table></div>
    </div>`;
}

export function _reconFindPayment(idSafe) {
  return (window._reconPayments || []).find(p => p.id.replace(/[^A-Za-z0-9_]/g, '') === idSafe);
}

// Shared price/payment derivation so the single + bulk record paths stay in lockstep.
function _reconApplyPaymentToBook(p, bookId, qty, { chan = '', notes = 'Stripe direct', auto = false, num = '', amount, currency, rate, rateSource = '', rateDate = '' } = {}) {
  const bk = BOOKS[bookId];
  if (!bk) throw new Error('Unknown book');
  const bookCur = normalizeCurrencyCode(getBookCurrencyCode(bk), 'CAD');
  const paidCurrency = normalizeCurrencyCode(currency || p.currency, '');
  const paidAmount = Number(amount ?? p.amount);
  if (!/^[A-Z]{3}$/.test(paidCurrency) || !(paidAmount > 0) || !Number.isFinite(paidAmount)) {
    throw new Error('Enter a valid paid amount and three-letter currency code');
  }
  const fxRate = paidCurrency === bookCur ? 1 : Number(rate);
  if (!(fxRate > 0) || !Number.isFinite(fxRate)) throw new Error(`Enter the rate from ${paidCurrency} to ${bookCur}`);
  const convertedTotal = roundCents(paidAmount * fxRate);
  // Keep the per-copy figure precise enough that a quantity greater than one
  // still adds back to the actual converted payment when the total is rounded.
  const price = convertedTotal / qty;
  const payment = {
    currency: paidCurrency,
    amount: roundCents(paidAmount),
    rate: paidCurrency === bookCur ? null : fxRate,
    convertedTotal,
    ref: p.id,
  };
  if (paidCurrency !== bookCur) {
    payment.rateSource = rateSource || 'manual';
    // A looked-up rate keeps the day it is actually from (blank when unknown);
    // only a hand-typed rate is taken as the payment date's.
    payment.rateDate = payment.rateSource === 'manual' ? (rateDate || p.date) : rateDate;
    payment.rateRequestedDate = p.date;
  }
  _reconApplySaleToBook(bookId, qty, price, payment, p.id, notes, {
    date: p.date, email: p.email, chan: chan || (p.cardPresent ? 'In Person' : 'Website'), auto, num: num || stripeOrderNumber(p),
  });
}

function _reconReadSaleInputs(idSafe, bookId, grouped = false) {
  const prefix = grouped ? 'recon-g' : 'recon-';
  const amount = Number(document.getElementById(`${prefix}amount-${idSafe}`)?.value);
  const currencyRaw = document.getElementById(`${prefix}currency-${idSafe}`)?.value || '';
  const currency = normalizeCurrencyCode(currencyRaw, '');
  const rateRaw = document.getElementById(`${prefix}rate-${idSafe}`)?.value;
  const rate = rateRaw === '' || rateRaw == null ? null : Number(rateRaw);
  const num = grouped ? '' : String(document.getElementById(`${prefix}num-${idSafe}`)?.value || '').trim();
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast('Enter the amount that was paid in Stripe', 'warn');
    return null;
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    showToast('Enter the payment currency as a three-letter code, such as EUR or CAD', 'warn');
    return null;
  }
  const bookCurrency = normalizeCurrencyCode(getBookCurrencyCode(BOOKS[bookId]), 'CAD');
  if (currency !== bookCurrency && (!(rate > 0) || !Number.isFinite(rate))) {
    showToast(`Enter how much ${bookCurrency} equals 1 ${currency}`, 'warn');
    return null;
  }
  if (rate != null && (!(rate > 0) || !Number.isFinite(rate))) {
    showToast('Enter a valid conversion rate greater than zero', 'warn');
    return null;
  }
  const rateInput = document.getElementById(`${prefix}rate-${idSafe}`);
  return { amount: roundCents(amount), currency, rate, num,
    rateSource: rateInput?.dataset.manual === '1' ? 'manual' : rateInput?.dataset.source || 'manual',
    rateDate: rateInput?.dataset.rateDate || '',
  };
}

function reconcileRecordSale(idSafe) {
  const p = _reconFindPayment(idSafe);
  if (!p) return;
  // The background sweep may have recorded this charge since the list was
  // painted, without repainting it. Recording it again would count the sale twice.
  if (_reconRecordedChargeIds().has(p.id)) {
    showToast('This payment is already in your order history', 'warn');
    renderReconcile();
    return;
  }
  const bookId = document.getElementById('recon-book-' + idSafe)?.value;
  const qty = Math.max(1, parseInt(document.getElementById('recon-qty-' + idSafe)?.value, 10) || 1);
  if (!bookId || !BOOKS[bookId]) { showToast('Pick a book first', 'warn'); return; }
  const saleInputs = _reconReadSaleInputs(idSafe, bookId);
  if (!saleInputs) return;
  saleInputs.num ||= stripeOrderNumber(p);
  try {
    _reconApplyPaymentToBook(p, bookId, qty, saleInputs);
  } catch (e) { showToast('Could not record: ' + (e.message || e), 'err'); return; }
  const mem = getReconMemory();
  mem.recorded[p.id] = { bookId, num: saleInputs.num, at: Date.now() };
  saveReconMemory(mem);
  _reconSession.logged++;
  if (bookId === activeBook) updateDash();
  showToast(`✓ Logged ${qty}× ${BOOKS[bookId].title}${saleInputs.num ? ` · ${saleInputs.num}` : ''} → stock ${states[bookId].stock}`);
  renderReconcile();
}

function reconcileOpenInvoice(idSafe) {
  const p = _reconFindPayment(idSafe);
  if (!p) return;
  const c = classifyStripePayment(p);
  if (!c.bookId) { showToast('Invoice not found in this app', 'warn'); return; }
  switchBook(c.bookId);
  switchTab('consignment');
  setTimeout(() => { try { if (c.inv) viewInvoice(c.inv.id); } catch (_) { } }, 60);
}

// ─── Consignment invoices that settle themselves ──────────────────────────
//
// Everything above is the manual worklist: the publisher opens the tab, the app
// fetches charges, matches the ones naming an INV-… number, and reconcileOpenInvoice
// walks her to the invoice so she can click "Mark paid". Every piece of that
// works. What it never did was act — so an invoice a store paid on Monday sat
// reading "sent" (and "overdue" by Friday), its linked sales stayed pending, and
// the store's balance still claimed money it had already handed over.
//
// This closes that gap and nothing wider. Only charges that name an invoice are
// considered; the other kinds the worklist handles write new sales rather than
// settling a record that already exists, which is a different risk and stays
// manual. A charge settles an invoice only when it names it AND the figures
// agree to the cent in the same currency AND the money has not been pulled back
// — lib/invoice-payments.js holds that judgement and this only carries it out.

const STRIPE_INVOICE_WATCH_INTERVAL_MS = 5 * 60 * 1000;
const STRIPE_INVOICE_COLD_START_DAYS = 30;
const STRIPE_INVOICE_LAST_KEY = 'lm-stripe-invoice-sweep-last';

let _stripeInvoiceWatchStarted = false;
let _stripeInvoiceSweeping = false;

/**
 * Reflect the saved preference (and whatever the browser's permission actually
 * is right now — she may have revoked it outside the app) on the checkbox.
 * Called on boot and whenever the Payments tab renders, so the switch never
 * shows "on" when a notification could not actually reach her.
 */
function renderStripePaidNotifyToggle() {
  renderStripeSaleAutoToggle();
  renderDeviceNotifySwitches();
}

/** The switch in the Payments tab that turns the device notification on/off. */
function toggleStripePaidNotify() {
  const cb = document.getElementById('stripe-paid-notify-cb');
  if (cb) return toggleDeviceNotify('payments', cb.checked, showToast);
}

/** The panel's "Send a test" button, so the owner can see one arrive. */
async function sendTestDeviceNotification() {
  const sent = await notifyDevice({
    title: 'Notifications are working',
    body: 'This is how news from Lyrical Inventory will look on this device.',
    tag: 'lm-test',
    force: true,
  });
  showToast(sent ? '✓ Test sent — look for it on this device' : 'Could not send one — check that notifications are allowed for this app', sent ? 'ok' : 'warn');
}

// The notifications panel's copies of the two switches, and its test button.
registerActions({
  'notify.switch': (el) => toggleDeviceNotify(el.dataset.deviceNotify, el.checked, showToast),
  'notify.test': () => sendTestDeviceNotification(),
});

/**
 * Put the same news the in-app card shows onto the device itself.
 *
 * Best-effort and silent on failure: a browser that blocks or does not support
 * `Notification` must not interrupt the sweep that pays for itself in the
 * ledger regardless of whether anyone is watching.
 */
function notifyDeviceInvoicePayment(said, firstInvoiceId) {
  if (!said) return;
  notifyDevice({
    kind: 'payments',
    title: said.title,
    body: said.detail,
    tag: 'lm-stripe-invoice-payments',
    open: firstInvoiceId ? { to: 'invoice', id: firstInvoiceId } : { to: 'tab', tab: 'consignment' },
  });
}

function readStripeInvoiceStamp() {
  try { return Number(localStorage.getItem(STRIPE_INVOICE_LAST_KEY)) || 0; } catch (_) { return 0; }
}

function writeStripeInvoiceStamp(at) {
  try { localStorage.setItem(STRIPE_INVOICE_LAST_KEY, String(at)); } catch (_) { /* private mode */ }
}

/**
 * The window to ask Stripe about, with a day of overlap.
 *
 * A charge can land between one sweep starting and finishing, and a duplicate
 * costs nothing — the charge id is stamped on the invoice, so the second sighting
 * is recognised and ignored — whereas a payment missed in the gap is silent.
 */
function stripeInvoiceSweepSince() {
  const last = readStripeInvoiceStamp();
  return last
    ? last - 86400000
    : Date.now() - STRIPE_INVOICE_COLD_START_DAYS * 86400000;
}

/**
 * Find the invoice that says this Stripe charge settled it.
 *
 * Needed because classifyStripePayment answers `recorded` for any charge this
 * device has already handled, and answers it *before* it looks for an invoice
 * number — so a charge the sweep settled last week comes back classified as
 * handled, not as an invoice payment. That is right for the settle path (it is
 * how the same charge stops being settled twice) and wrong for a refund, which
 * would otherwise be skipped before anyone checked whether the money left.
 * The stamp on the invoice is the durable record, so it is what gets searched.
 */
function _findInvoiceByCharge(chargeId) {
  const id = String(chargeId || '').trim();
  if (!id) return null;
  for (const bookId of Object.keys(states)) {
    const inv = (states[bookId].invoices || []).find(i => i && i.stripeChargeId === id);
    if (inv) return { bookId, inv };
  }
  return null;
}

/** Announce a payment that was pulled back after its invoice was settled. */
function showInvoiceReversalAlert(payment, inv) {
  const said = describeInvoicePaymentReversal({
    invoiceNum: inv?.num || '', storeName: inv?.storeName || '',
  });
  pushAppAlert({
    // Keyed per charge, so it cannot be overwritten by a later ordinary sweep
    // and reads as the different kind of news it is.
    id: invoicePaymentRef(payment.id) || 'stripe-invoice-reversal',
    icon: '↩️',
    title: said.title,
    detail: said.detail,
    tone: SYNC_TONES.FAILED,
    actionLabel: 'Open invoice',
    action: `openInvoiceFromAlert('${inv?.id || ''}')`,
  });
}

/**
 * The card for invoices that marked themselves paid.
 *
 * `totals` maps a currency code to the settled sum in minor units. A figure is
 * only shown when every invoice settled shares one currency — adding euros to
 * dollars to reach a single headline number would be inventing a rate.
 */
function showInvoicePaymentAlert({ settled, attention, first, totals }) {
  const codes = [...(totals?.keys() || [])];
  const amountLabel = codes.length === 1
    ? fmt(minorToMajor(totals.get(codes[0]), codes[0]), getSym(codes[0]))
    : '';
  const said = describeInvoicePaymentSweep({ settled, attention, amountLabel });
  if (!said) return;
  pushAppAlert({
    id: 'stripe-invoice-payments',
    icon: '💰',
    title: said.title,
    detail: said.detail,
    tone: settled ? '' : SYNC_TONES.PENDING,
    actionLabel: first ? 'Review' : '',
    action: first ? `openInvoiceFromAlert('${first}')` : '',
  });
  notifyDeviceInvoicePayment(said, first);
}

/** Take the publisher to an invoice from a notification, wherever she is. */
function openInvoiceFromAlert(invoiceId) {
  if (!invoiceId) return;
  const found = invoiceHome(invoiceId);
  if (!found?.inv) { showToast('That invoice is no longer here', 'warn'); return; }
  if (found.bookId) switchBook(found.bookId);
  switchTab('consignment');
  setTimeout(() => { try { viewInvoice(invoiceId); } catch (_) { } }, 60);
}

/**
 * Ask Stripe whether any open invoice has been paid, and settle the ones that have.
 *
 * Returns a count of what happened, so the caller can say it once rather than
 * per invoice.
 */
async function sweepStripeInvoicePayments({ force = false } = {}) {
  // Publisher only. An author cannot read the Stripe key (the tax settings doc
  // is publisher-only in the security rules) and must never trigger a global
  // financial mutation, so for them this would fail on every poll and raise a
  // health warning about a service they have no way to use.
  if (!window.IS_PUBLISHER || isAuthor()) return null;

  const configured = !!getReconStripeKey();
  const { online, visible } = browserWatchState();
  const due = force
    ? configured && online && !_stripeInvoiceSweeping
    : dueForCheck({
      lastCheckedAt: readStripeInvoiceStamp(),
      now: Date.now(),
      intervalMs: effectiveInterval(
        STRIPE_INVOICE_WATCH_INTERVAL_MS,
        integrationBackoffMs('stripe', STRIPE_INVOICE_WATCH_INTERVAL_MS),
      ),
      online, configured, visible, busy: _stripeInvoiceSweeping,
    });
  if (!due) return null;

  _stripeInvoiceSweeping = true;
  try {
    // A few pages behind a date filter: in the steady state this returns one tiny page.
    const payments = await fetchStripePaymentsForReconcile(10, { since: stripeInvoiceSweepSince() });

    let settled = 0;
    let attention = 0;
    let first = '';
    const touchedBooks = new Set();
    const totals = new Map();
    const recorded = [];
    const cardSales = [];
    const refundSignals = [];

    for (const payment of payments) {
      // Money that came back is checked first, and without asking the
      // classifier — it reports a charge this device already handled as
      // `recorded` before it ever looks for an invoice number, so a refund of a
      // charge the sweep settled would be skipped here and never mentioned.
      if (payment.refunded || payment.disputed) {
        if (payment.refunded) {
          refundSignals.push({
            chargeId: payment.id,
            amount: payment.amountRefunded,
            chargeRefundedTotal: payment.amountRefunded,
            fullyRefunded: payment.fullyRefunded,
          });
        }
        const cited = _findInvoiceByCharge(payment.id);
        // Only news if this is the charge an invoice says settled it. A refunded
        // charge that never settled anything is not this feature's business.
        if (cited?.inv) showInvoiceReversalAlert(payment, cited.inv);
        continue;
      }

      // Otherwise the existing classifier owns the matching: the INV-… number in
      // the intent description, the invoice_num metadata, and its own memory of
      // charges already handled on this device.
      if (payment.cardPresent) noteReaderPaymentForDay(payment);
      const c = classifyStripePayment(payment);

      // A payment for one book — its QR code, its payment link — becomes a sale
      // on its own. The rules for when it may are in lib/stripe-sale-autorecord.js.
      if (c.kind === 'artist_transfer') {
        const r = settleArtistTransfersFromStripe(payment);
        if (r && r.settled) {
          touchedBooks.add(r.bookId);
          notifyAuthorPaid(r, payment);
        } else if (r && r.problem && !readRaisedStripeSales().includes(payment.id)) {
          // Raised once per charge — the sweep sees the same charge every 5 minutes.
          noteRaisedStripeSale(payment.id);
          const book = BOOKS[r.bookId];
          pushAppAlert({
            id: `author-paid-problem-${payment.id}`,
            icon: '⚠️',
            title: `${book.author || 'An author'} sent a payment that doesn't match`,
            detail: r.problem === 'changed'
              ? `${book.title}: they paid ${fmt(Number(payment.amount) || 0, book.currency)} for settle-up, but the account no longer matches it — it may already have been settled by hand, or they now owe more after another sale they collected — so nothing was recorded. Check it in Stripe: refund it if it was paid twice, or settle the difference with them before recording it by hand.`
              : `${book.title}: it came in ${r.problem === 'short' ? 'for less than' : 'in a different currency from'} what they owed, so nothing was marked received. Check it in Stripe and settle it by hand.`,
            actionLabel: 'Open book',
            action: `switchBook(${JSON.stringify(r.bookId)}); switchTab('dashboard')`,
          });
        }
        continue;
      }

      if (c.kind === 'direct') {
        const outcome = await autoRecordStripeSale(payment, c);
        if (outcome) {
          cardSales.push(outcome);
          if (outcome.action === 'record') {
            touchedBooks.add(outcome.bookId);
            recorded.push({ chargeId: payment.id, bookId: outcome.bookId, num: stripeOrderNumber(payment) });
          }
        }
        continue;
      }

      if (c.kind !== 'invoice' || !c.inv || !c.bookId) continue;

      const inv = c.inv;
      const judged = judgeInvoicePayment({ payment, invoice: inv });

      if (verdictNeedsAttention(judged.verdict)) {
        // Deliberately NOT settled: a store that paid short still owes the
        // difference, and an invoice marked paid is the app saying it does not.
        // But the money did arrive, so it is written onto the invoice — both
        // because the publisher asked for it to be recorded, and because
        // without a record the next poll would rediscover it and re-raise a card
        // she had just dismissed, every five minutes, forever.
        if (partPaymentAlreadyNoted(inv, payment.id)) continue;
        if (!Array.isArray(inv.stripePartPayments)) inv.stripePartPayments = [];
        inv.stripePartPayments.push(buildPartPaymentNote({ payment, judged }));
        saveState(c.bookId);
        touchedBooks.add(c.bookId);
        attention++;
        if (!first) first = inv.id;
        continue;
      }

      if (!verdictSettles(judged.verdict)) continue;

      const s = states[c.bookId];
      if (!s) continue;
      applyInvoicePaid(inv, c.bookId, s, {
        method: 'Stripe Checkout',
        chargeId: payment.id,
        paidAt: payment.created || Date.now(),
      });
      touchedBooks.add(c.bookId);
      settled++;
      if (!first) first = inv.id;
      totals.set(judged.currency, (totals.get(judged.currency) || 0) + judged.paidMinor);
      recorded.push({ chargeId: payment.id, bookId: c.bookId, num: inv.num });
    }

    // Remembered the way the manual worklist remembers, so a charge the app
    // settled does not sit in her review list looking unhandled. Written once
    // for the sweep rather than per invoice: it is one whole blob in browser
    // storage, and re-reading and re-writing it inside the loop earns nothing.
    if (recorded.length) {
      const mem = getReconMemory();
      const at = Date.now();
      recorded.forEach(r => { mem.recorded[r.chargeId] = { bookId: r.bookId, num: r.num, at }; });
      saveReconMemory(mem);
    }

    // Only move the checkpoint when the whole window was read; otherwise the
    // charges that were cut off would fall out of the next window unseen.
    if (!payments.truncated) writeStripeInvoiceStamp(Date.now());
    noteIntegrationSuccess('stripe');
    showMarketDaySummaryIfDue();

    // Refunds of older charges, which the payment list above cannot see: it
    // is filtered by when a charge was made, and a refund can come weeks later.
    try {
      refundSignals.push(...await fetchStripeRefundsSince(stripeInvoiceSweepSince()));
    } catch (error) {
      // A restricted key without refund access still gets the recent ones above.
      console.warn('Stripe refund check skipped', error);
    }
    raiseRefundedStripeSales(refundSignals);

    // A sale recorded in the background (a card payment above, another
    // device) changes what an author owes on a book nobody has open. Re-make
    // any settle-up pay link whose amount went stale, so the author's Pay
    // button doesn't wait for the publisher to open that book.
    for (const id of Object.keys(states)) {
      if (BOOKS[id]?.profitTiers?.length) ensureSettlementLink(id);
    }

    if (cardSales.length) {
      renderHist();
      updateDash();
      if (typeof window.renderAllOverview === 'function') window.renderAllOverview();
      showCardSaleAlert(cardSales);
    }

    if (settled || attention) {
      // Repainted once for the whole sweep, not once per invoice.
      renderInvoices();
      renderStores();
      renderLedger();
      renderHist();
      updateDash();
      showInvoicePaymentAlert({ settled, attention, first, totals });
    }
    return { settled, attention, books: touchedBooks.size };
  } catch (error) {
    console.warn('Stripe invoice payment sweep failed', error);
    noteIntegrationFailure('stripe', error, { online, configured });
    return null;
  } finally {
    _stripeInvoiceSweeping = false;
  }
}

// ── Card payments that record themselves ────────────────────────────────────
//
// A customer who pays by scanning a book's QR code pays through a Stripe link
// the app made and tagged with that book. The sweep above already sees every
// such payment; this turns the unambiguous ones into sales, through the same
// write the Stripe worklist's Record button uses, and leaves the rest in that
// worklist with a reason.

const STRIPE_SALE_AUTO_KEY = 'lm-stripe-sale-auto';
const STRIPE_SALE_AUTO_SINCE_KEY = 'lm-stripe-sale-auto-since';
// Charges the sweep already raised for review, so a payment waiting on the
// publisher is mentioned once rather than on every five-minute poll.
const STRIPE_SALE_RAISED_KEY = 'lm-stripe-sale-raised';

function stripeSaleAutoEnabled() {
  try { return localStorage.getItem(STRIPE_SALE_AUTO_KEY) !== '0'; } catch (_) { return true; }
}

/**
 * When automatic recording began on this device. Set the first time it is
 * asked, so a payment from before then — one the publisher may long since have
 * entered by hand — is never recorded a second time.
 */
function stripeSaleAutoSince() {
  try {
    const stored = Number(localStorage.getItem(STRIPE_SALE_AUTO_SINCE_KEY));
    if (stored > 0) return stored;
    const now = Date.now();
    localStorage.setItem(STRIPE_SALE_AUTO_SINCE_KEY, String(now));
    return now;
  } catch (_) {
    // Storage blocked: no safe "since", so nothing is recorded automatically.
    return Number.POSITIVE_INFINITY;
  }
}

// When this version's counting rules first ran on this device (see
// autoRecordStripeSale). Set once, like the switch's own start time.
const STRIPE_SALE_RULES_SINCE_KEY = 'lm-stripe-sale-rules-v2-since';

function stripeSaleRulesSince() {
  try {
    const stored = Number(localStorage.getItem(STRIPE_SALE_RULES_SINCE_KEY));
    if (stored > 0) return stored;
    const now = Date.now();
    localStorage.setItem(STRIPE_SALE_RULES_SINCE_KEY, String(now));
    return now;
  } catch (_) {
    return Number.POSITIVE_INFINITY;
  }
}

function readRaisedStripeSales() {
  return readStoredList(STRIPE_SALE_RAISED_KEY);
}

function noteRaisedStripeSale(chargeId) {
  const list = readRaisedStripeSales();
  if (list.includes(chargeId)) return;
  list.push(chargeId);
  try { localStorage.setItem(STRIPE_SALE_RAISED_KEY, JSON.stringify(list.slice(-300))); } catch (_) { /* storage full */ }
}

/**
 * Record one Stripe payment as a sale if it is safe to, and say what happened.
 * Returns null when there is nothing worth telling the publisher about.
 */
async function autoRecordStripeSale(payment, rawClassification, { raise = true } = {}) {
  if (!stripeSaleAutoEnabled()) return null;
  // A card-reader tap carries no book tag, but the seller may have typed the
  // title into its description in the Stripe app. One title named there is
  // as good as the tag a QR-code payment carries.
  const lines = !rawClassification.bookId && payment.cardPresent
    ? booksInDescription(payment.description, BOOKS) : [];
  // Several books, or a count written in: the description has to add up to
  // the money, and each book becomes its own ledger row.
  if (lines.length > 1 || (lines.length === 1 && lines[0].stated)) {
    return recordReaderSplitSale(payment, lines);
  }
  const describedId = lines.length === 1 ? lines[0].bookId : '';
  const classification = describedId ? { ...rawClassification, bookId: describedId } : rawClassification;
  const book = classification.bookId ? BOOKS[classification.bookId] : null;
  const options = {
    classification,
    book,
    bookCurrency: book ? normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD') : '',
    likelyLogged: _reconLikelyAlreadyLogged(payment, { near: true }),
    // Payments from before this version first ran were judged by the old
    // rules, under which a euro or door-price sale never recorded — she may
    // well have typed those in by hand since. They are never recorded now.
    autoSince: Math.max(stripeSaleAutoSince(), stripeSaleRulesSince()),
  };
  let plan = stripeSalePlan(payment, options);
  let conversion = null;
  if (plan.action === 'review' && plan.reason === 'currency') {
    conversion = await resolveStripeRate(payment, options.bookCurrency);
    // A publisher may have recorded this payment while the rate was loading.
    if (!stripeSaleAutoEnabled() || _reconRecordedChargeIds().has(payment.id)) return null;
    if (classifyStripePayment(payment).kind !== 'direct') return null;
    const currentBook = BOOKS[classification.bookId];
    if (!currentBook || normalizeCurrencyCode(getBookCurrencyCode(currentBook), 'CAD') !== options.bookCurrency) return null;
    plan = stripeSalePlan(payment, { ...options, book: currentBook,
      likelyLogged: _reconLikelyAlreadyLogged(payment, { near: true }), conversionRate: conversion.rate,
    });
  }
  if (plan.action === 'skip') return null;

  if (plan.action === 'review') {
    // Sync shows these in the list itself, so it leaves the one-time alert
    // for the background check to raise.
    if (!raise) return { ...plan, chargeId: payment.id };
    if (readRaisedStripeSales().includes(payment.id)) return null;
    noteRaisedStripeSale(payment.id);
    if (payment.cardPresent) noteUnmatchedReaderPayment(payment);
    return { ...plan, chargeId: payment.id };
  }

  if (!states[plan.bookId]) return null;
  try {
    // A tap on a reader happened in person, so it is filed with the other
    // in-person sales rather than as a website order.
    _reconApplyPaymentToBook(payment, plan.bookId, plan.qty, {
      auto: true, num: stripeOrderNumber(payment), rate: conversion?.rate,
      rateSource: conversion?.source, rateDate: conversion?.date,
      ...(payment.cardPresent ? { chan: 'Book Fair', notes: 'Card reader' } : {}),
    });
  } catch (error) {
    console.error('Automatic record of a Stripe payment failed', error);
    noteRaisedStripeSale(payment.id);
    return { action: 'review', reason: 'failed', chargeId: payment.id };
  }
  return {
    ...plan,
    chargeId: payment.id,
    bookTitle: BOOKS[plan.bookId]?.title || 'a book',
    stockLeft: Number(states[plan.bookId]?.stock) || 0,
  };
}

// Pressing Sync records what the background check would record by itself —
// a payment through one of the app's own links that adds up to whole copies —
// so the list left behind is only the payments that need her. Same rules,
// same write as the background check: nothing is recorded here that it
// wouldn't record, and nothing at all when she has switched it off.
const RECON_AUTO_BUDGET_MS = 15000;

async function recordReadyStripeSales(payments, { budgetMs = RECON_AUTO_BUDGET_MS } = {}) {
  if (!window.IS_PUBLISHER || isAuthor() || !stripeSaleAutoEnabled()) return [];
  const stopAt = Date.now() + budgetMs;
  const recorded = [];
  for (const payment of payments || []) {
    // A slow rate lookup must not hold the list back; whatever is left stays in
    // it for her, and the background check tries again.
    const left = stopAt - Date.now();
    if (left <= 0) break;
    if (payment.refunded || payment.disputed) continue;
    const c = classifyStripePayment(payment);
    if (c.kind !== 'direct') continue;
    // Stop waiting once time is up; a lookup still running finishes in the
    // background and the background check picks the payment up later.
    const outcome = await Promise.race([
      autoRecordStripeSale(payment, c, { raise: false }),
      new Promise(done => setTimeout(() => done(null), left)),
    ]);
    if (outcome?.action === 'record') recorded.push({ ...outcome, num: stripeOrderNumber(payment) });
  }
  if (recorded.length) {
    const mem = getReconMemory();
    const at = Date.now();
    recorded.forEach(r => { mem.recorded[r.chargeId] = { bookId: r.bookId, num: r.num, at }; });
    saveReconMemory(mem);
    renderHist();
    updateDash();
    if (typeof window.renderAllOverview === 'function') window.renderAllOverview();
  }
  return recorded;
}

/** Refunds issued since `since`, one page, newest first. */
async function fetchStripeRefundsSince(since) {
  const key = getReconStripeKey();
  if (!key) return [];
  const params = new URLSearchParams({ limit: '100' });
  if (since > 0) params.set('created[gte]', String(Math.floor(since / 1000)));
  const resp = await fetch(`https://api.stripe.com/v1/refunds?${params.toString()}`, {
    headers: { 'Authorization': 'Bearer ' + key },
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${resp.status}`);
  }
  const json = await resp.json();
  return (json.data || []).map(r => {
    const cur = String(r.currency || '').toUpperCase();
    return {
      id: r.id,
      chargeId: typeof r.charge === 'string' ? r.charge : (r.charge?.id || ''),
      amount: _stripeMinorToMajor(r.amount || 0, cur),
      status: r.status,
    };
  }).filter(r => r.chargeId);
}

// ── A recorded card sale whose money went back ──────────────────────────────
//
// A sale recorded from a Stripe payment stayed a sale when the payment was
// refunded, so the copies stayed "sold" and the money stayed in the earnings.
// The sweep now notices and offers to reverse it — offered, not done, because
// whether the book actually came back is something only the publisher knows.

const STRIPE_REFUND_PENDING_KEY = 'lm-stripe-refund-pending';

function readPendingRefundReversals() {
  return readStoredList(STRIPE_REFUND_PENDING_KEY);
}

function writePendingRefundReversals(list) {
  try { localStorage.setItem(STRIPE_REFUND_PENDING_KEY, JSON.stringify(list || [])); } catch (_) { /* storage full */ }
}

/** Every ledger row recorded from a Stripe payment, with its charge. */
function stripeRecordedSales() {
  const sales = [];
  Object.entries(states).forEach(([bookId, st]) => {
    (st?.hist || []).forEach(h => {
      if (typeof h?.sheetsId !== 'string' || !h.sheetsId.startsWith('stripe-')) return;
      // Linked to a website order: the website sends its refunds and restocks,
      // so offering to void it here as well would reverse the sale twice.
      if (h.webOrderId) return;
      sales.push({
        bookId,
        sheetsId: h.sheetsId,
        // A split reader sale's later rows carry "-2", "-3"; they belong to the same charge.
        chargeId: h.sheetsId.slice('stripe-'.length).replace(/-\d+$/, ''),
        qty: Number(h.qty) || 0,
        bookTitle: BOOKS[bookId]?.title || 'a book',
        paidAmount: Number(h.payment?.amount) || (Number(h.qty) || 0) * (Number(h.price) || 0),
        voided: !!h.voided,
        refundNoted: h.refundNoted || '',
        refundPartial: !!h.refundPartial,
        refundedSoFar: Number(h.refundedSoFar) || 0,
      });
    });
  });
  return sales;
}

function findStripeSaleRow(bookId, sheetsId) {
  // An empty id would match every row that never had one.
  if (!sheetsId) return null;
  return (states[bookId]?.hist || []).find(h => h?.sheetsId === sheetsId) || null;
}

function raiseRefundedStripeSales(signals) {
  const found = refundsToRaise(signals, stripeRecordedSales());
  if (!found.length) return;
  const touched = new Set();
  found.forEach(item => {
    const row = findStripeSaleRow(item.bookId, item.sheetsId);
    // Marked on the row itself, so it is raised once — on this device and on
    // any other that syncs the book — rather than on every five-minute poll.
    if (row) {
      row.refundNoted = item.refundId || 'refunded';
      // A partial refund is remembered so a later one that completes it can still be raised.
      if (item.full) { delete row.refundPartial; delete row.refundedSoFar; } else { row.refundPartial = true; row.refundedSoFar = Number(item.refunded) || 0; }
      touched.add(item.bookId);
    }
  });
  touched.forEach(bookId => saveState(bookId));

  const pending = readPendingRefundReversals();
  found.filter(item => item.full).forEach(item => {
    if (!pending.some(p => p.sheetsId === item.sheetsId)) pending.push(item);
  });
  writePendingRefundReversals(pending);
  showRefundAlert([...pending, ...found.filter(item => !item.full)]);
}

function showRefundAlert(items) {
  const said = describeRefunds(items);
  if (!said.count) return;
  pushAppAlert({
    id: 'stripe-refunds',
    icon: '↩️',
    title: said.title,
    detail: said.detail,
    tone: SYNC_TONES.PENDING,
    actionLabel: 'Review refunds',
    action: "switchTab('todo')",
  });
}

/** Void every fully refunded card sale still waiting, the same way the Void button does. */
function reverseRefundedSalesFromAlert(event) {
  if (event) event.stopPropagation();
  dismissAppAlert('stripe-refunds');
  const pending = readPendingRefundReversals();
  writePendingRefundReversals([]);
  reverseSalesWithUndo(pending, 'Refunded in Stripe');
}

// The rows the last reversal voided, so its Undo knows exactly what to restore.
let _lastReversal = [];

/**
 * Void these sales the way the Void button does, then offer an Undo.
 *
 * Shared by the Stripe refund alert and the storefront one. The Undo is the
 * safety net for a mis-tap on a small screen: it restores exactly the rows
 * this reversal voided and nothing else.
 */
function reverseSalesWithUndo(items, reason) {
  let reversed = 0;
  let copies = 0;
  const touched = new Set();
  const done = [];
  (items || []).forEach(item => {
    const st = states[item.bookId];
    const book = BOOKS[item.bookId];
    const row = findStripeSaleRow(item.bookId, item.sheetsId);
    if (!st || !book || !row || row.voided) return;
    withActiveBook(item.bookId, () => voidHistEntry(st, book, row));
    row.voidedReason = reason;
    reversed++;
    copies += Number(row.qty) || 0;
    touched.add(item.bookId);
    done.push({ bookId: item.bookId, sheetsId: item.sheetsId });
  });
  touched.forEach(bookId => saveState(bookId));
  if (!reversed) { showToast('Those sales were already reversed', 'warn'); return; }
  _lastReversal = done;
  renderHist();
  updateDash();
  if (typeof window.renderAllOverview === 'function') window.renderAllOverview();
  pushAppAlert({
    id: 'sale-reversal-undo',
    icon: '↩️',
    title: `Reversed ${reversed} sale${reversed === 1 ? '' : 's'}`,
    detail: `${copies} cop${copies === 1 ? 'y is' : 'ies are'} back in stock and the sale${reversed === 1 ? ' is' : 's are'} out of your earnings. The sale${reversed === 1 ? ' stays' : 's stay'} in your history, marked as voided.`,
    actionLabel: 'Undo',
    action: 'undoLastReversalFromAlert(event)',
  });
}

function undoLastReversalFromAlert(event) {
  if (event) event.stopPropagation();
  dismissAppAlert('sale-reversal-undo');
  const rows = _lastReversal;
  _lastReversal = [];
  let restored = 0;
  const touched = new Set();
  rows.forEach(item => {
    const st = states[item.bookId];
    const book = BOOKS[item.bookId];
    const row = findStripeSaleRow(item.bookId, item.sheetsId);
    if (!st || !book || !row || !row.voided) return;
    withActiveBook(item.bookId, () => unvoidHistEntry(st, book, row));
    restored++;
    touched.add(item.bookId);
  });
  touched.forEach(bookId => saveState(bookId));
  if (!restored) { showToast('Nothing to undo', 'warn'); return; }
  renderHist();
  updateDash();
  if (typeof window.renderAllOverview === 'function') window.renderAllOverview();
  showToast(`✓ Undone — ${restored} sale${restored === 1 ? '' : 's'} restored`);
}
window.undoLastReversalFromAlert = undoLastReversalFromAlert;

// ── Website orders the store reversed ──────────────────────────────────────
// The storefront check (features/bigcartel.js) finds them and keeps the list;
// the reversal happens here because voiding a sale is the ledger's job.

function reverseStoreOrdersFromAlert(event) {
  if (event) event.stopPropagation();
  dismissAppAlert('store-reversals');
  const pending = readStoredList(STORE_REVERSAL_PENDING_KEY);
  try { localStorage.setItem(STORE_REVERSAL_PENDING_KEY, '[]'); } catch (_) { /* storage blocked */ }
  reverseSalesWithUndo(pending.filter(item => item.full), 'Refunded or cancelled on the store');
}
window.reverseStoreOrdersFromAlert = reverseStoreOrdersFromAlert;

// ── The morning after a market day ─────────────────────────────────────────

const MARKET_DAY_SHOWN_KEY = 'lm-market-day-shown';

function showMarketDaySummaryIfDue() {
  if (!window.IS_PUBLISHER || isAuthor()) return;
  const rows = [];
  Object.entries(states).forEach(([bookId, st]) => (st?.hist || []).forEach(entry => rows.push({ bookId, entry })));
  let shownFor = '';
  try { shownFor = localStorage.getItem(MARKET_DAY_SHOWN_KEY) || ''; } catch (_) { /* storage blocked */ }
  const day = latestMarketDay(rows, { today: today(), shownFor });
  if (!day) return;
  // Scanning every book's history for recorded charges is the costly part, so
  // build that set at most once here instead of once per unmatched payment.
  let recordedIds = null;
  const recordedCharges = () => (recordedIds ||= _reconRecordedChargeIds());
  const unmatched = (readUnmatchedReaderPayments()[day] || [])
    .filter(id => !recordedCharges().has(id)).length;
  const summary = summariseMarketDay(rows, day, {
    books: BOOKS,
    stockOf: (bookId) => (states[bookId] ? Number(states[bookId].stock) : null),
    unmatched,
  });
  const said = describeMarketDay(summary);
  try { localStorage.setItem(MARKET_DAY_SHOWN_KEY, day); } catch (_) { /* storage blocked */ }
  if (!said.count) return;
  // Register and reader side by side. Only when Stripe is connected: without
  // it every card sale would look like one with no payment behind it.
  let cardNote = '';
  if (getReconStripeKey()) {
    const recorded = recordedCharges();
    const reader = (readReaderPaymentsByDay()[day] || []).map(p => ({ ...p, recorded: recorded.has(p.id) }));
    cardNote = describeMarketCards(checkMarketCards(rows, day, reader));
  }
  pushAppAlert({
    id: 'market-day',
    icon: '🧾',
    title: said.title,
    detail: cardNote ? `${said.detail} ${cardNote}` : said.detail,
    tone: (said.needsYou || cardNote) ? SYNC_TONES.PENDING : '',
    actionLabel: said.needsYou ? 'Match them' : '',
    action: said.needsYou ? 'openStripeWorklistFromAlert(event)' : '',
  });
}
window.reverseRefundedSalesFromAlert = reverseRefundedSalesFromAlert;

/**
 * A card-reader payment whose description names several books, or counts.
 * Recorded only when the books' prices add up to what was paid, one ledger
 * row per book. The first row carries the charge's own id and the rest a
 * numbered one, so the worklist still recognises the payment as recorded and
 * a later refund still finds every row.
 */
function recordReaderSplitSale(payment, lines) {
  if (payment.refunded || payment.disputed) return null;
  if (!(Number(payment.created) >= stripeSaleAutoSince())) return null;
  const raise = (reason) => {
    if (readRaisedStripeSales().includes(payment.id)) return null;
    noteRaisedStripeSale(payment.id);
    noteUnmatchedReaderPayment(payment);
    return { action: 'review', reason, chargeId: payment.id };
  };
  if (_reconLikelyAlreadyLogged(payment)) return raise('maybe-rung-up');
  const plan = splitSalePlan(payment, lines, BOOKS, {
    bookCurrency: (book) => normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD'),
  });
  if (plan.action !== 'record') return raise(plan.reason);
  if (plan.lines.some(line => !states[line.bookId])) return null;

  try {
    plan.lines.forEach((line, i) => {
      _reconApplySaleToBook(line.bookId, line.qty, line.price,
        { currency: payment.currency, amount: line.qty * line.price, ref: payment.id },
        i === 0 ? payment.id : `${payment.id}-${i + 1}`,
        'Card reader',
        { date: payment.date, email: payment.email, chan: 'Book Fair', auto: true, num: stripeOrderNumber(payment) });
    });
  } catch (error) {
    console.error('Recording a split card-reader sale failed', error);
    return raise('failed');
  }
  return {
    action: 'record',
    bookId: plan.lines[0].bookId,
    qty: plan.lines.reduce((sum, line) => sum + line.qty, 0),
    books: plan.lines.length,
    bookTitle: plan.lines.map(line => BOOKS[line.bookId]?.title || 'a book').join(' and '),
    stockLeft: Number(states[plan.lines[0].bookId]?.stock) || 0,
    chargeId: payment.id,
  };
}

// Every card-reader payment, by day, so the morning-after summary can compare
// the reader with the register. Kept small: id, amount, currency.
const READER_DAY_KEY = 'lm-reader-payments-by-day';

function readReaderPaymentsByDay() {
  try {
    const raw = JSON.parse(localStorage.getItem(READER_DAY_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (_) { return {}; }
}

function noteReaderPaymentForDay(payment) {
  const day = String(payment.date || '').slice(0, 10);
  if (!day || payment.refunded) return;
  const all = readReaderPaymentsByDay();
  const list = Array.isArray(all[day]) ? all[day] : [];
  if (list.some(p => p.id === payment.id)) return;
  list.push({ id: payment.id, amount: payment.amount, currency: payment.currency });
  all[day] = list;
  Object.keys(all).sort().slice(0, -14).forEach(key => { delete all[key]; });
  try { localStorage.setItem(READER_DAY_KEY, JSON.stringify(all)); } catch (_) { /* storage full */ }
}

// Reader payments the app could not match to a book, by the day they were
// taken, so the morning-after summary can say how many are still waiting.
const READER_UNMATCHED_KEY = 'lm-reader-unmatched';

function readUnmatchedReaderPayments() {
  try {
    const raw = JSON.parse(localStorage.getItem(READER_UNMATCHED_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (_) { return {}; }
}

function noteUnmatchedReaderPayment(payment) {
  const all = readUnmatchedReaderPayments();
  const day = String(payment.date || '').slice(0, 10);
  if (!day) return;
  const ids = Array.isArray(all[day]) ? all[day] : [];
  if (!ids.includes(payment.id)) ids.push(payment.id);
  all[day] = ids;
  // Only the last couple of weeks matter to a morning-after summary.
  Object.keys(all).sort().slice(0, -14).forEach(key => { delete all[key]; });
  try { localStorage.setItem(READER_UNMATCHED_KEY, JSON.stringify(all)); } catch (_) { /* storage full */ }
}

function showCardSaleAlert(outcomes) {
  const said = describeCardSales(outcomes);
  if (!said.count) return;
  pushAppAlert({
    id: 'stripe-card-sales',
    icon: '💳',
    title: said.title,
    detail: said.detail,
    tone: said.needsYou ? SYNC_TONES.PENDING : '',
    actionLabel: said.needsYou ? 'Review' : '',
    action: said.needsYou ? 'openStripeWorklistFromAlert(event)' : '',
  });
}

function openStripeWorklistFromAlert(event) {
  if (event) event.stopPropagation();
  dismissAppAlert('stripe-card-sales');
  switchTab('reconcile');
  if (getReconStripeKey()) reconcileSync();
}
window.openStripeWorklistFromAlert = openStripeWorklistFromAlert;

function renderStripeSaleAutoToggle() {
  const cb = document.getElementById('stripe-sale-auto-cb');
  if (cb) cb.checked = stripeSaleAutoEnabled();
  // The short codes a card-reader description can use instead of a title.
  const list = document.getElementById('stripe-sale-codes');
  if (list) {
    const codes = saleCodes(BOOKS);
    const rows = Object.entries(codes)
      .map(([id, code]) => ({ code, title: BOOKS[id]?.title || id }))
      .sort((a, b) => a.title.localeCompare(b.title));
    list.innerHTML = rows.length
      ? rows.map(r => `<li><span class="sale-code">${escapeHtml(r.code)}</span><span>${escapeHtml(r.title)}</span></li>`).join('')
      : '<li class="sale-codes-empty">Add a book to your catalogue to get its code.</li>';
  }
}

function toggleStripeSaleAuto() {
  const cb = document.getElementById('stripe-sale-auto-cb');
  if (!cb) return;
  try { localStorage.setItem(STRIPE_SALE_AUTO_KEY, cb.checked ? '1' : '0'); } catch (_) { /* private mode */ }
  showToast(cb.checked
    ? '✓ Card payments for a book will be recorded as sales automatically'
    : 'Card payments will wait for you in this list');
}
window.toggleStripeSaleAuto = toggleStripeSaleAuto;

function startStripeInvoiceWatch() {
  if (_stripeInvoiceWatchStarted || typeof window === 'undefined') return;
  _stripeInvoiceWatchStarted = true;
  startWatch(() => { sweepStripeInvoicePayments(); }, { intervalMs: STRIPE_INVOICE_WATCH_INTERVAL_MS });
}

// ── CHASING A LATE INVOICE ──────────────────────────────────────────────────
//
// The counterpart to the sweep above: that one notices money arriving, this one
// notices it not arriving. When an invoice is more days past due than the
// publisher chose, the customer gets one polite email with a link to pay it.
//
// Deliberately started AFTER the Stripe sweep at boot, and it re-reads each
// invoice's status the moment before sending: chasing somebody for an invoice
// they paid an hour ago is worse than not chasing them at all.
//
// Every judgement — who qualifies, what it says, whether now is a decent hour —
// lives in lib/payment-reminders.js. This is the part that can't be unit tested
// because it touches the network and the store, so it is kept to the wiring.

const REMINDER_WATCH_INTERVAL_MS = 60 * 60 * 1000;
/** Sends per run, and per day. A mistake that mails five people is survivable. */
const REMINDER_MAX_PER_RUN = 5;
const REMINDER_MAX_PER_DAY = 20;
const REMINDER_DAY_KEY = 'lm-invoice-reminder-day';

let _reminderWatchStarted = false;
let _reminderSweeping = false;

/** How many were sent today, from this browser. Resets when the date changes. */
function reminderDayCount() {
  try {
    const raw = JSON.parse(localStorage.getItem(REMINDER_DAY_KEY) || '{}');
    return raw && raw.day === today() ? (Number(raw.count) || 0) : 0;
  } catch (_) { return 0; }
}

function bumpReminderDayCount(by = 1) {
  try {
    localStorage.setItem(REMINDER_DAY_KEY, JSON.stringify({ day: today(), count: reminderDayCount() + by }));
  } catch (_) { /* private mode — the per-invoice log is the real guard */ }
}

/**
 * Every invoice across every book that would be chased right now.
 *
 * Used both by the sweep and by the confirmation shown when the feature is
 * switched on, so the number the publisher is warned about is the number that
 * actually goes out.
 */
/**
 * Every unpaid bill that could be chased by hand, soonest-due first.
 *
 * Wider than invoicesAwaitingReminder on purpose: that one answers "who does
 * the automatic sweep owe an email to today", which is nobody at all until
 * something is past its due date. This one answers "which real bill is
 * outstanding" — what the test email needs so it reads with a live customer,
 * a live amount and a live payment link rather than a made-up one.
 */
function invoicesChaseable() {
  const out = [];
  for (const bookId of Object.keys(states || {})) {
    if (isTestBookId(bookId)) continue;
    for (const inv of ((states[bookId] || {}).invoices || [])) {
      if (!inv || inv.status !== 'sent') continue;
      if (!String(inv.storeEmail || '').trim()) continue;
      out.push({ bookId, inv });
    }
  }
  out.sort((a, b) => {
    const da = String(a.inv.dueDate || '');
    const db = String(b.inv.dueDate || '');
    return da < db ? -1 : (da > db ? 1 : 0);
  });
  return out;
}

export function invoicesAwaitingReminder(days, max = 0) {
  const out = [];
  for (const bookId of Object.keys(states || {})) {
    if (isTestBookId(bookId)) continue;
    const due = dueForReminder((states[bookId] || {}).invoices || [], { today: today(), days, max: 0 });
    for (const inv of due) out.push({ bookId, inv });
  }
  out.sort((a, b) => {
    const da = String(a.inv.dueDate || '');
    const db = String(b.inv.dueDate || '');
    return da < db ? -1 : (da > db ? 1 : 0);
  });
  return max > 0 ? out.slice(0, max) : out;
}

/** The amount owed, formatted in the invoice's own currency. */
function invoiceAmountLabel(inv) {
  const book = invoiceOwnerBook(inv);
  return fmt(inv.total || 0, inv.currency || (book && book.currency) || '');
}

/**
 * Send one reminder and write down that it happened.
 *
 * Stamped BEFORE the network call, deliberately. Two devices with the app open
 * would otherwise both find the same invoice unchased and both email it; a
 * stamp that lands first means the second one sees `already-chased`. The cost
 * of that order is a reminder recorded as `failed` when the send throws, which
 * shows on the invoice and can be retried by hand — much the better failure.
 */
async function sendInvoiceReminder(inv, bookId, { kind = 'auto' } = {}) {
  const s = states[bookId];
  if (!s || !inv) return { ok: false, error: 'missing invoice' };
  const to = String(inv.storeEmail || '').trim();
  if (!to) return { ok: false, error: 'no email address' };

  const entry = { at: Date.now(), kind, to, status: 'sending', error: '' };
  inv.reminders = Array.isArray(inv.reminders) ? inv.reminders : [];
  inv.reminders.push(entry);
  saveState(bookId);

  const settings = getInvoiceSettings();
  // Built before the email copy, so the copy can say "I've attached the
  // invoice" only when one genuinely made it — a render failure must not stop
  // the reminder going out, just stop it claiming an attachment it lacks.
  const attachment = await buildInvoicePdfAttachment(inv);
  const mail = buildReminderEmail(inv, {
    settings: reminderSettings(settings),
    payLink: effectivePaymentLink(inv) || '',
    publisher: settings.name || 'Lyricalmyrical Books',
    amountLabel: invoiceAmountLabel(inv),
    attached: !!attachment,
  });

  try {
    await sendSingleEmailViaBackend(to, mail.subject, mail.text, settings.email || '', mail.html, null, false, attachment ? [attachment] : null);
    entry.status = 'sent';
    bumpReminderDayCount(1);
    saveState(bookId);
    return { ok: true };
  } catch (error) {
    entry.status = 'failed';
    entry.error = String((error && error.message) || error || 'send failed').slice(0, 200);
    saveState(bookId);
    return { ok: false, error: entry.error };
  }
}

export async function sweepPaymentReminders() {
  if (_reminderSweeping) return null;
  const cfg = reminderSettings(getInvoiceSettings());
  if (!cfg.auto) return null;
  // The mail leaves through the connected Apps Script; without it there is
  // nothing to send with, and the publisher already gets told the sheet is
  // disconnected elsewhere.
  if (!sheetsUrl) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  if (!canSendNow(new Date())) return null;

  const remainingToday = REMINDER_MAX_PER_DAY - reminderDayCount();
  if (remainingToday <= 0) return null;

  const batch = invoicesAwaitingReminder(cfg.days, Math.min(REMINDER_MAX_PER_RUN, remainingToday));
  if (!batch.length) return null;

  _reminderSweeping = true;
  let sent = 0, failed = 0;
  try {
    for (const { bookId, inv } of batch) {
      // Re-asked immediately before sending: the Stripe sweep runs on its own
      // clock and may have settled this very invoice since the batch was built.
      if (reminderBlockReason(inv, { today: today(), days: cfg.days })) continue;
      const res = await sendInvoiceReminder(inv, bookId, { kind: 'auto' });
      if (res.ok) sent++; else failed++;
    }
  } finally {
    _reminderSweeping = false;
  }

  if (sent || failed) {
    const said = describeReminderSweep({ sent, failed });
    if (said) {
      pushAppAlert({
        id: 'invoice-reminders',
        icon: '⏰',
        title: said.title,
        detail: said.detail,
        tone: said.needsReview ? SYNC_TONES.FAILED : '',
        actionLabel: 'Open invoices',
        action: 'switchTab(\'consignment\')',
      });
    }
    renderInvoices();
  }
  return { sent, failed };
}

// ── THE DAY BEFORE ──────────────────────────────────────────────────────────
//
// The sweep above only knows about money that arrived through the payment link.
// A shop that paid by bank transfer, or handed cash over at a fair, is still
// "sent" here until it is marked paid — and would be chased for money already
// handed over. So before any of that happens, say who is about to be chased
// while there is still a day to stop it.

const REMINDER_NOTICE_KEY = 'lm-invoice-reminder-notice';

/** Has the heads-up already been given today, from this browser? */
function reminderNoticeShownToday() {
  try { return localStorage.getItem(REMINDER_NOTICE_KEY) === today(); }
  catch (_) { return false; }
}

function markReminderNoticeShown() {
  try { localStorage.setItem(REMINDER_NOTICE_KEY, today()); }
  catch (_) { /* private mode — a repeated card is the harmless failure here */ }
}

/** Everything across every book that tomorrow's sweep would chase. */
function invoicesDueTomorrow(days) {
  const out = [];
  for (const bookId of Object.keys(states || {})) {
    if (isTestBookId(bookId)) continue;
    for (const inv of dueForReminderTomorrow((states[bookId] || {}).invoices || [], { today: today(), days })) {
      out.push({ bookId, inv });
    }
  }
  out.sort((a, b) => {
    const da = String(a.inv.dueDate || '');
    const db = String(b.inv.dueDate || '');
    return da < db ? -1 : (da > db ? 1 : 0);
  });
  return out;
}

/**
 * The morning heads-up.
 *
 * Runs whatever the hour, unlike the sweep: this sends nothing, and the whole
 * point is that it is waiting before the 9am send window opens. Once per
 * calendar day, so an app left open all day doesn't repaint it hourly.
 */
function noticeUpcomingReminders() {
  const cfg = reminderSettings(getInvoiceSettings());
  // A warning about automatic chasing is noise when nothing will be sent.
  if (!cfg.auto) return null;
  if (reminderNoticeShownToday()) return null;

  const batch = invoicesDueTomorrow(cfg.days);
  if (!batch.length) return null;

  const said = describeReminderNotice({ count: batch.length });
  if (!said) return null;
  pushAppAlert({
    id: 'invoice-reminders-tomorrow',
    icon: '📋',
    title: said.title,
    detail: said.detail,
    tone: SYNC_TONES.PENDING,
    actionLabel: 'Review them',
    action: 'openReminderReview()',
  });
  markReminderNoticeShown();
  return { count: batch.length };
}

// ── THE REVIEW LIST ─────────────────────────────────────────────────────────
// Who is about to be chased, with the two ways out of it: this one already
// paid, or this one has promised a date. Both call the existing behaviour —
// there is exactly one writer of `inv.status = 'paid'` in this app and this
// list must not become the second.

function openReminderReview() {
  renderReminderReview();
  openM('reminder-review');
}

function renderReminderReview() {
  const host = $('reminder-review-body');
  if (!host) return;
  const cfg = reminderSettings(getInvoiceSettings());
  const batch = invoicesDueTomorrow(cfg.days);
  const count = $('reminder-review-count');

  if (!batch.length) {
    if (count) count.textContent = 'Nothing waiting';
    host.innerHTML = `<div class="empty-state"><div class="e-icon">✅</div>Nothing to review — everyone due a reminder is squared away.<div style="margin-top:8px;font-size:var(--text-sm);color:var(--text3);">Invoices appear here the day before the app would chase them.</div></div>`;
    return;
  }

  if (count) count.textContent = `${batch.length} invoice${batch.length === 1 ? '' : 's'} · chased tomorrow`;
  const manyBooks = new Set(batch.map(r => r.bookId)).size > 1;
  host.innerHTML = `<div class="tbl-wrap"><table class="tbl" style="font-size:var(--text-sm);">
    <thead><tr><th>Customer</th><th>Invoice</th><th class="r">Amount</th><th class="r">Late</th><th></th></tr></thead>
    <tbody>${batch.map(({ bookId, inv }) => {
    const late = daysLate(inv, today());
    const book = BOOKS[bookId];
    return `<tr>
        <td style="font-weight:600;">${escapeHtml(inv.storeName) || '—'}<div style="font-size:var(--text-xs);color:var(--text3);font-weight:400;">${escapeHtml(inv.storeEmail) || 'no email'}${manyBooks && book ? ' · ' + escapeHtml(book.title) : ''}</div></td>
        <td class="mono-num" style="font-size:var(--text-xs);">${escapeHtml(inv.num)}<div style="font-size:var(--text-xs);color:var(--text3);">due ${escapeHtml(fmtD(inv.dueDate))}</div></td>
        <td class="r mono-num" style="font-weight:600;">${escapeHtml(invoiceAmountLabel(inv))}</td>
        <td class="r"><span class="pill amber">● ${late || 0}d</span></td>
        <td style="white-space:nowrap;text-align:right;">
          <button class="btn sm gold" onclick="reminderReviewMarkPaid('${escapeHtml(inv.id)}')" title="They already paid — settle it and send nothing">✓ Paid</button>
          <button class="btn sm" style="margin-left:4px;" onclick="reminderReviewHoldOff('${escapeHtml(inv.id)}')" title="They told you when they'll pay — hold off until then">📅 Hold off</button>
        </td>
      </tr>`;
  }).join('')}</tbody>
  </table></div>`;
}

/** Settle one from the list — the same payment form the invoice view uses. */
function reminderReviewMarkPaid(id) {
  const { inv, bookId } = invoiceHome(id);
  if (!inv || inv.status === 'paid') return;
  openConsignPayment({ kind: 'invoice', id: inv.id, bookId, after: () => renderReminderReview() });
}

/** Hold off on one from the list, on a date they gave you. */
async function reminderReviewHoldOff(id) {
  const { inv, bookId } = invoiceHome(id);
  if (!inv) return;
  const suggested = inv.remindAfter || (() => {
    return localDayPlus(14);
  })();
  const picked = await promptDialog(
    `When did ${inv.storeName || 'they'} say they would pay ${inv.num}? No reminder goes out before then.`,
    suggested,
    { title: 'Promised to pay', okLabel: 'Save date', inputType: 'date' },
  );
  if (picked === null) return;
  const value = String(picked).trim();
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) { showToast('That is not a date I can read', 'warn'); return; }
  inv.remindAfter = value;
  saveState(bookId);
  renderReminderReview();
  renderInvoices();
  showToast(value ? `✓ Holding off on ${inv.num} until ${fmtD(value)}` : `✓ ${inv.num} is back in the chasing list`);
}

/**
 * Send the reminder to yourself.
 *
 * Reads the settings out of the FORM rather than out of storage, so the wording
 * can be tweaked and re-tested without saving first — the point is to read what
 * a customer would receive before any customer does.
 *
 * Writes nothing at all: no reminder logged, no daily count, no state saved. A
 * test is not a chase, and an invoice borrowed as the sample must not fall out
 * of the queue because it was previewed.
 */
async function sendTestReminderEmail() {
  if (!sheetsUrl) { showToast('Connect your Google Sheet first — that is what sends the mail', 'warn'); return; }

  const stored = getInvoiceSettings();
  const cfg = reminderSettings({
    remindAuto: true,
    remindDays: $('ivs-remind-days') ? $('ivs-remind-days').value : stored.remindDays,
    remindMsg: $('ivs-remind-msg') ? $('ivs-remind-msg').value : stored.remindMsg,
  });

  let to = ($('ivs-email') ? $('ivs-email').value : stored.email || '').trim();
  if (!to) {
    const asked = await promptDialog(
      'Where should the test go? Nobody else receives it.',
      '',
      { title: 'Send me a test reminder', okLabel: 'Send', placeholder: 'you@email.com', inputType: 'email' },
    );
    if (asked === null) return;
    to = String(asked).trim();
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { showToast('That does not look like an email address', 'warn'); return; }

  // The whole point of the test is to read what a customer will receive, so it
  // is built from a real outstanding bill wherever one exists — real store,
  // real amount, real payment link, real PDF. Preference order is how close
  // the invoice is to actually being chased: already due a reminder, chased
  // tomorrow, then any bill still waiting to be paid. The invented sample is
  // the last resort, for a fresh app with nothing outstanding on file.
  const real = invoicesAwaitingReminder(cfg.days, 1)[0]
    || invoicesDueTomorrow(cfg.days)[0]
    || invoicesChaseable()[0]
    || null;
  const inv = real ? real.inv : sampleReminderInvoice({ today: today(), days: cfg.days });
  // Works for the sample too: with no id to locate, invoiceOwnerBook falls back
  // to the book on screen, so the amount reads in the currency she works in.
  const amountLabel = invoiceAmountLabel(inv);

  const attachment = await buildInvoicePdfAttachment(inv);
  // A real invoice carries its own live link and nothing else will do — an
  // example link pasted into a real bill's email is precisely the thing this
  // test exists to catch. If it comes back empty, the test still goes out and
  // says so, because that missing link is the finding.
  const livePayLink = real ? (effectivePaymentLink(inv) || '') : 'https://buy.stripe.com/example';
  const mail = buildReminderEmail(inv, {
    settings: cfg,
    payLink: livePayLink,
    publisher: ($('ivs-name') ? $('ivs-name').value : stored.name) || 'Lyricalmyrical Books',
    amountLabel,
    attached: !!attachment,
  });

  showToast('Sending your test reminder…');
  try {
    await sendSingleEmailViaBackend(to, `[TEST] ${mail.subject}`, mail.text, stored.email || '', mail.html, null, false, attachment ? [attachment] : null);
    // Name the bill it was built from: the publisher asked for this to read
    // with live details, so say which live details arrived.
    const said = real
      ? `reads as ${inv.num} for ${inv.storeName || 'that customer'}${livePayLink ? '' : ' — but that invoice has no payment link, so the email has nothing to pay with'}`
      : 'using a sample invoice — nothing is outstanding to build it from';
    showToast(`✓ Test reminder sent to ${to} — ${said}`, livePayLink || !real ? 'ok' : 'warn', 7000);
  } catch (error) {
    showToast(`Could not send the test: ${String((error && error.message) || error)}`, 'err', 5000);
  }
}

function startPaymentReminderWatch() {
  if (_reminderWatchStarted || typeof window === 'undefined') return;
  _reminderWatchStarted = true;
  // The heads-up first: it sends nothing, runs at any hour, and its whole
  // purpose is to be waiting before the sweep's send window opens.
  startWatch(() => { noticeUpcomingReminders(); sweepPaymentReminders(); }, { intervalMs: REMINDER_WATCH_INTERVAL_MS });
}

/**
 * Chase one invoice now, whatever the automatic setting says.
 *
 * The single by-hand chase path in this app. Both the button on the open
 * invoice and the one-click button on each unpaid row come through here, so a
 * reminder sent from the list passes exactly the same guards — already paid,
 * cancelled, no email, no sheet — and is logged exactly the same way as one
 * sent from the invoice itself. Two copies of this would eventually differ,
 * and the way they would differ is an email chasing somebody who already paid.
 */
async function chaseInvoiceNow(id) {
  const { inv, bookId } = invoiceHome(id);
  if (!inv) return { ok: false, error: 'missing invoice' };
  // Belt and braces with the hidden buttons above: this is callable from the
  // console and from a stale modal, and the cost of getting it wrong is an
  // email chasing a customer who already paid.
  if (inv.status === 'paid') { showToast(`${inv.num} is already paid — nothing to chase`, 'warn'); return { ok: false, error: 'already paid' }; }
  if (inv.status === 'cancelled') { showToast(`${inv.num} was cancelled — nothing to chase`, 'warn'); return { ok: false, error: 'cancelled' }; }
  if (inv.status === 'draft') { showToast(`${inv.num} has not been sent yet — send it before chasing it`, 'warn'); return { ok: false, error: 'draft' }; }
  const to = String(inv.storeEmail || '').trim();
  if (!to) { showToast('No email address on this invoice — add one to remind them', 'warn'); return { ok: false, error: 'no email address' }; }
  if (!sheetsUrl) { showToast('Connect your Google Sheet first — that is what sends the mail', 'warn'); return { ok: false, error: 'sheet not connected' }; }

  const state = invoiceReminderState(inv);
  const already = state.count
    ? `You have already reminded them ${state.count === 1 ? 'once' : `${state.count} times`}. `
    : '';
  const late = daysLate(inv, today());
  const lateSaid = late ? `${late} day${late === 1 ? '' : 's'} past due. ` : '';
  // From the list this is one press away from a bill that isn't late yet, or
  // one somebody has already promised to pay — both are the publisher's call
  // to make, but neither should be made without being told.
  const earlySaid = (!late && inv.dueDate && inv.dueDate > today()) ? `Not due until ${fmtD(inv.dueDate)}. ` : '';
  const promisedSaid = (state.snoozedUntil && today() <= state.snoozedUntil)
    ? `They promised to pay by ${fmtD(state.snoozedUntil)}. `
    : '';
  if (!(await confirmDialog(
    `${lateSaid}${earlySaid}${promisedSaid}${already}Email ${to} a reminder about ${inv.num}, with a link to pay it?`,
    { okLabel: 'Send reminder', title: 'Remind this customer' },
  ))) return { ok: false, error: 'cancelled by user' };

  showToast('Sending reminder…');
  const res = await sendInvoiceReminder(inv, bookId, { kind: 'manual' });
  renderInvoices();
  if (res.ok) showToast(`✓ Reminder sent to ${to}`);
  else showToast(`Reminder failed: ${res.error}`, 'err', 5000);
  return res;
}

/** Chase the invoice that is open on screen. */
async function remindInvoiceFromView() {
  if (!currentViewInvoiceId) return;
  const id = currentViewInvoiceId;
  await chaseInvoiceNow(id);
  // Repaint the invoice only if it is still the one on screen — the send is
  // slow enough for the publisher to have moved on to another bill.
  if (currentViewInvoiceId === id) viewInvoice(id);
}

/**
 * Chase straight from the invoice list — one press per unpaid bill.
 *
 * The pressed button goes quiet for the duration: the send takes a couple of
 * seconds through the sheet, and without this the row looks untouched, which
 * invites a second press and a second email to the same customer.
 */
async function remindInvoiceFromList(id) {
  const btn = $(`inv-chase-${id}`);
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Sending…'; }
  try {
    await chaseInvoiceNow(id);
  } finally {
    // renderInvoices() usually replaces the row outright; this only matters
    // when the chase stopped before it (declined, or a guard said no).
    const still = $(`inv-chase-${id}`);
    if (still && still === btn) { still.disabled = false; still.textContent = label; }
  }
}

/**
 * "They said they'd pay on the 15th" — hold off until then.
 *
 * Worth its own control rather than switching the whole feature off: the
 * customer who answered you is exactly the one who should stop being chased,
 * and everybody else should carry on being chased.
 */
async function snoozeInvoiceFromView() {
  if (!currentViewInvoiceId) return;
  const { inv, bookId } = invoiceHome(currentViewInvoiceId);
  if (!inv) return;
  const suggested = inv.remindAfter || (() => {
    return localDayPlus(14);
  })();
  const picked = await promptDialog(
    `When did ${inv.storeName || 'they'} say they would pay ${inv.num}? No reminder goes out before then. Clear the date to start chasing again.`,
    suggested,
    { title: 'Promised to pay', okLabel: 'Save date', inputType: 'date' },
  );
  if (picked === null) return;
  const value = String(picked).trim();
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) { showToast('That is not a date I can read', 'warn'); return; }
  inv.remindAfter = value;
  saveState(bookId);
  renderInvoices();
  viewInvoice(currentViewInvoiceId);
  showToast(value ? `✓ Holding off on ${inv.num} until ${fmtD(value)}` : `✓ ${inv.num} is back in the chasing list`);
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
  const saleInputs = _reconReadSaleInputs(gi, bookId, true);
  if (!saleInputs) return;
  const mem = getReconMemory();
  let n = 0;
  const recordedIds = _reconRecordedChargeIds();
  ids.forEach(id => {
    const p = (window._reconPayments || []).find(x => x.id === id);
    if (!p || mem.recorded[id] || mem.dismissed[id] || recordedIds.has(id)) return;
    const num = stripeOrderNumber(p);
    try {
      _reconApplyPaymentToBook(p, bookId, qty, { ...saleInputs, num });
      mem.recorded[id] = { bookId, num, at: Date.now() };
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
export async function createStripePaymentLinkForBook(book) {
  const key = getReconStripeKey();
  if (!key) throw new Error('Stripe key not set — add one in Invoice Settings, the Tax Centre, or the Payments tab.');
  if (!/^(rk|sk)_/.test(key)) throw new Error("That doesn't look like a Stripe restricted/secret key (expected rk_… or sk_…).");

  const curCode = (getBookCurrencyCode(book) || 'CAD').toLowerCase();
  const isZeroDec = isZeroDecimalCurrency(curCode);
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

  const linkParams = new URLSearchParams();
  linkParams.set('line_items[0][quantity]', '1');
  linkParams.set('line_items[0][adjustable_quantity][enabled]', 'true');
  linkParams.set('metadata[book_id]', book.id || '');
  linkParams.set('metadata[sku]', book.id || '');
  linkParams.set('payment_intent_data[description]', (book.title || 'Book').slice(0, 350));
  linkParams.set('payment_intent_data[metadata][book_id]', book.id || '');
  linkParams.set('payment_intent_data[metadata][sku]', book.id || '');
  linkParams.set('billing_address_collection', 'auto');
  const { link } = await createStripePriceAndLink(key, priceParams, linkParams, { permissionHint: true });
  return link.url;
}

// Mint a Stripe Payment Link for an arbitrary amount + currency. Used by the
// POS to collect the exact (possibly discounted) amount a customer owes —
// either for the whole sale or for a single adjusted line. Mirrors
// createStripePaymentLinkForBook but takes a free-form amount/description.
export async function createStripePaymentLinkForAmount({ amountMajor, currencyCode, description, metadata, afterPaidUrl = '' }) {
  const key = getReconStripeKey();
  if (!key) throw new Error('Stripe key not set — add one in Invoice Settings, the Tax Centre, or the Payments tab.');
  if (!/^(rk|sk)_/.test(key)) throw new Error("That doesn't look like a Stripe restricted/secret key (expected rk_… or sk_…).");

  const curCode = (currencyCode || 'CAD').toUpperCase();
  const isZeroDec = isZeroDecimalCurrency(curCode);
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

  const linkParams = new URLSearchParams();
  linkParams.set('line_items[0][quantity]', '1');
  linkParams.set('payment_intent_data[description]', (description || 'Book fair sale').slice(0, 350));
  Object.entries(meta).forEach(([k, v]) => {
    linkParams.set(`metadata[${k}]`, v == null ? '' : String(v));
    linkParams.set(`payment_intent_data[metadata][${k}]`, v == null ? '' : String(v));
  });
  // Stripe sends the payer here only after a successful payment — the one
  // reliable "it's paid" signal a static app can get without a server.
  if (afterPaidUrl) {
    linkParams.set('after_completion[type]', 'redirect');
    linkParams.set('after_completion[redirect][url]', afterPaidUrl);
  }
  linkParams.set('billing_address_collection', 'auto');
  const { link } = await createStripePriceAndLink(key, priceParams, linkParams, { permissionHint: true });
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
Object.assign(window, openCallScreen.stubs);
Object.assign(window, {
  confirmDialog, promptDialog, notify,
  renderCustomers, filterCustomers, toggleCustFold, customerPullStripe, copyCustomerEmails, exportCustomersCSV,
  toggleCustomerSuppress, setCustomerBookFilter, customerPullDeeper,
  clearCustomerFilter, clearCustomerFilters,
  addManualSubscriber, addBuyerToMailingList, removeFromMailingList, addAllBuyersToMailingList,
  toggleMailingAutoAdd, emailCustomerSegment, emailMailingList, copyMailingListEmails, exportMailingListCSV,
  setCustomerChannelFilter, setCustomerSpendFilter, setCustomerOrdersFilter, checkMailingEmailTypo, applyMailingEmailCorrection,
  switchCustomersSubTab, openCampaignWizard, closeCampaignWizard, insertTemplateTag, updateCampaignPreview,
  onCampaignSegmentChange, saveCampaignDraft, editCampaignDraft, deleteCampaign, sendTestEmailCampaign, sendCampaignLaunch, cancelCampaignSending, onForceMockChange, updateCampaignModeStatus, retryCampaignEmail,
  fetchStripeFeesByYear, downloadStripeFeesAuditCSV, clearStoredStripeKey, insertStripeFeesIntoLedger, reconcileStripeAgainstSales,
  reconcileSync, renderReconcile, reconcileRecordSale, reconcileApplyBigCartel, reconcileOpenInvoice, reconcileDismiss, reconcileUndo,
  reconOnFilter, reconSetCurrency, reconClearFilters, reconEditKey, reconRecordGroup, reconDismissGroup, reconDismissAllShown,
  toggleStripePaidNotify,
  generateBookStripeLink,
  logout, switchTab, filterHelp, setHelpAudience, toggleAllHelp, toggleBookDropdown, toggleHeaderMenu, closeHeaderMenus, toggleSideAccount, switchBook, forceSync, recalcOnHand, dismissStockDrift,
  showMoreHist, showAllHist,
  restateBookCurrency, onCurrencyModeChange, onCurrencyRateModeChange, refreshCurrencyPreview,
  toggleCurrentBookView,
  fetchOrders, applyOne, applyAll, cancelOrder, restoreOrder, unapplyOne, onManualCurrencyChange, calcFx, calcManualFxRate, submitManual,
  onExpenseCurrencyChange, calcExpenseFx,

  submitGratuity, openM, closeM, addStore, openEditStore, confirmEditStore, openSend, confirmSend, openSale, confirmSale, onConsignSaleCurrencyChange, updateConsignSalePreview, updateSendPreview, onConsignPaymentCurrencyChange, updateConsignPaymentPreview, confirmConsignPayment,
  exportConsignmentLedgerCSV, openBulkSend, bulkApplyQty, bulkQtyChanged, bulkCheckChanged, updateBulkSendSummary, confirmBulkSend,
  openRet, confirmReturn, openEditHist, openEditLedger, saveEntryEdit, convertKeptAllToReceived, voidEntry,
  restoreBookDataFromSheets, resetBookData, connectSheets, disconnectSheets, testSheets, verifyUrl, checkSheetsVersion,
  pushAllToSheets, backfillAndResync, copyGasCode, saveProductionCosts, savePaymentLinks,
  handleImportFile, confirmImport, setImportDateOrder, undoImport, closeImportNotice, openLabelModal, renderLabelCountryHint, printShippingLabel, toggleShipped, backfillShipping,
  saveArtistPaymentLink, markArtistTransferReceived, settleArtistTransferKeepShare, settleArtistTransferKeepAll, markExpenseReceived,
  submitExpense, voidExpense, toggleExpenseReceiptFilter, toggleExpenseReimburseSelect, requestBulkReimbursement, markPaid, markHistoryConsignmentPaid, removeStore, addProfitTier, removeProfitTier,
  saveProfitTiers, renderProfitSettings, updateProfitTierField, renderProfitTierList,
  downloadTaxReport, createSystemBackupNow, restoreSystemBackup, restoreBookFromBackup, applyBookRestore, gotoSysBackupPage, handleBackupImportFile, handleBookRestoreImportFile,
  chooseBackupFolder, exportToJSON, exportAllToCSV,
  submitTaxExpense, importShippoShippingFromApi, openShippoLabel, removeRecurring, downloadTaxLedgerCSV, renderTaxCenter,
  openRecurringEditor, saveRecurringEditor, updateRecurringPreview, toggleRecurringPause,
  addRecurringRateChange, removeRecurringRateChange,
  tcSetRecurringFilter, tcShowRecurringCharges,
  tcMoveRecurringDay, tcKeepRecurringDay, tcReviewSubscriptionDoubles, tcCloseSubscriptionDoublesNote,
  removeLedgerEntry, setupReceiptFolder, authorizeReceiptFolder, viewLocalReceipt, setTcLedgerPage,
  reclaimCloudReceiptsNow, cacheAllReceiptsNow, openCloudReceiptsModal, closeCloudReceiptsModal,
  dismissReceiptNotice, resetDismissedReceiptNotices, switchTaxCenterSubTab,
  tcSubNavKeydown, tcFilterLedgerByReceiptStorage, openTaxSeasonPreflightModal, tcJumpToFixPreflightIssues, executeFullTaxSeasonExport,
  tcSetVaultView, tcGallerySearchInput, tcGalleryFilterChange, _tcRenderReceiptGallery, setTcGalleryPage,
  openReceiptLightbox, tcLightboxZoom, tcLightboxRotate, tcLightboxReset, tcLightboxNav,
  copyReceiptDiagnostic, openExportReceiptsModal, closeExportReceiptsModal, runReceiptExport,
  openReceiptOrganizer, closeReceiptOrganizer, chooseOrganizerSource, organizerReadUnclear,
  toggleOrganizerSkip, runReceiptOrganizer,
  batchScanAndRelinkReceipts, attachReceiptToExpenseRow, tcExpenseRowDragOver, tcExpenseRowDragLeave, tcExpenseRowDrop,
  tcLedgerSearchInput, tcLedgerTypeFilter, tcLedgerYearChange, tcYearChange, tcClearLedgerFilters,
  openReceiptCameraModal, closeReceiptCameraModal, captureReceiptPhoto, retakeReceiptPhoto, useReceiptPhoto,
  saveTaxCenterSettings, testOpenRouterConnectionFromSettings, scanReceiptWithAI, scanProjectReceiptWithAI,
  openBatchExpenseModal, closeBatchExpenseModal, setBatchExpenseDest, batchExpenseAddBlankRow,
  removeBatchExpenseRow, rescanBatchExpenseRow, applyBatchScanFix, toggleAllBatchExpenses, deselectDuplicateBatchExpenses,
  applyBatchExpenseBulk, scanAllBatchExpenses, submitBatchExpenses,
  openEmailReceiptImportModal, closeEmailReceiptImportModal, extractReceiptsFromEmailText, importEmailReceiptDrafts, importDirectGmailEmails, handleEmailImportPrimaryAction, toggleAllEmailDrafts,
  switchEmailImportTab, searchGmailEmails, applyGmailPresetQuery, applyDirectGmailPresetQuery, toggleEmailPreview, toggleEmailRowSelection, toggleAllGmailSelections,
  searchDirectGmailEmails, renderDirectGmailChips, renderDirectGmailEmailsList, toggleDirectEmailPreview, toggleDirectGmailSelection, toggleAllDirectGmailSelections,
  showCategoryDetail, changeExpenseCategory, tcSelectCashFlowBucket, tcSetCashFlowDetailType, tcClearCashFlowBucket,
  showTripDetail, openEditTrip, saveTripAssignment, renameTripPrompt,
  openEditExpense, relinkEditExpenseReceipt, removeEditExpenseReceipt, saveExpenseEdit, openEditSale, openEditArtistPayout,
  // Invoices
  renderInvoices, openCreateInvoice, viewInvoice,
  addInvoiceItem, removeInvoiceItem, updateInvoiceItem,
  onInvoiceStoreChange, setInvoiceBillToMode, prefillFromPendingSales, recalcInvoiceTotals,
  saveInvoice, deleteInvoice, editInvoiceFromView, markInvoicePaidFromView,
  remindInvoiceFromView, remindInvoiceFromList, snoozeInvoiceFromView,
  openReminderReview, reminderReviewMarkPaid, reminderReviewHoldOff, sendTestReminderEmail,
  printInvoice, copyInvoicePayLink, emailInvoice, downloadInvoiceHTML, downloadInvoicePDF,
  openInvoiceTemplateSettings, saveInvoiceSettings,
  regenerateStripeLinkFromView, onInvoiceCurrencyChange,
});
// Declared in features/customers.js, which keeps no import-time side effects,
// so its window registration lives here.
window.exportMailingListCsv = exportMailingListCsv;
// Declared in features/fair-kit.js, which keeps no import-time side effects,
// so the Fair kit's inline handlers are registered here.
Object.assign(window, {
  salesTrackerQtyInput,
  openFairKitModal,
  fairKitSelectAll,
  fkFocusFirstGap,
  salesTrackerAddCustom,
  salesTrackerRemoveCustom,
  fkPresetSelected,
  fkSaveFairPreset,
  fkDeleteFairPreset,
  fairKitSelectionChanged,
  fairKitModeChanged,
  printSalesTracker,
  printPaymentQRCodes,
  printFairKit,
});
// Declared in features/pos-books.js, likewise free of import-time side
// effects, so the register-only book dialog's handlers are registered here.
Object.assign(window, {
  openPosBookModal,
  closePosBookModal,
  generatePosBookStripeLink,
  copyPosBookLink,
  downloadPosBookQR,
  savePosBook,
  removeCurrentPosBook,
  removePosBook,
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
    showToast('✨ The app has been updated. Click "What\'s new" at the bottom of the side menu to see what changed.', 'ok', 6000);
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
    const res = await fetch('https://api.github.com/repos/lyricalmyricalbooks/lyrical-inventory/commits?per_page=20');
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

  container.innerHTML = '<div class="wn-state">Loading the latest changes…</div>';

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
    const commits = await fetchRecentChanges();
    const changes = commits ? plainChanges(commits) : null;
    if (!changes || !changes.length) {
      container.innerHTML = `
        <div class="wn-state">
          <strong>Couldn't load the list of changes.</strong>
          You may be offline. Your app is still up to date — try again when you're connected.
        </div>`;
      return;
    }

    let lastHeading = '';
    container.innerHTML = changes.map(c => {
      const heading = dayHeading(new Date(c.date));
      const head = heading !== lastHeading ? `<h3 class="wn-day">${escapeHtml(heading)}</h3>` : '';
      lastHeading = heading;
      const link = c.fullSha
        ? `<a class="wn-tech" href="https://github.com/lyricalmyricalbooks/lyrical-inventory/commit/${encodeURIComponent(c.fullSha)}" target="_blank" rel="noopener">Technical details ↗</a>`
        : '';
      return `${head}
        <article class="commit-item wn-item">
          <span class="pill ${({ new: 'green', fixed: 'blue', faster: 'gold' })[c.kind] || 'gray'} wn-kind">${escapeHtml(kindLabel(c.kind))}</span>
          <h4 class="wn-title">${escapeHtml(c.title)}</h4>
          ${c.detail ? `<p class="wn-detail">${escapeHtml(c.detail)}</p>` : ''}
          ${c.tryIt ? `<p class="wn-try"><strong>How to use it:</strong> ${escapeHtml(c.tryIt)}</p>` : ''}
          ${link}
        </article>`;
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
  // Must match the address the Firestore/Storage/Database rules and the Apps
  // Script trust, or the publisher UI would open for an account the backend
  // then refuses.
  const publisherEmail = 'lyricalmyricalbooks@gmail.com';

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
            setBooks({ ...DEFAULT_BOOKS });
          }
          loadAuthorViewOverrides();
          showApp('publisher', null);
          checkAppUpdate();
          dismissSplash();
          return;
        }
        // Not logged in (or just signed out by the no-access branch below, whose message must survive)
        setupGate(_pendingGateMsg);
        const err = document.getElementById('pw-err');
        if (err) err.textContent = '';
        dismissSplash();
        return;
      }

      // The shared mode flags decide which database every read below uses, so
      // all devices agree. Waiting for them before starting those reads cost a
      // whole extra round trip behind the splash screen on every start — on
      // market-stall signal, seconds. So the reads start at once, from the
      // store this device's flags named last time, and are only used if the
      // flags that arrive name the same store. If they don't (the move to
      // Firestore, once, ever), the early answers are dropped unread and read
      // again from the right store. The early reads write nothing; loadCatalog
      // still does any saving itself, after the flags are in.
      const cachedGlobal = startupCachedGlobalMode();
      // On a device that has opened the app before: show the copy this device
      // already holds while the server is asked.
      const publisherAccount = (user.email || '').toLowerCase().trim() === publisherEmail && user.emailVerified === true;
      if (cachedGlobal === true) {
        showStartupPreview(user, publisherAccount)
          .then(shown => { if (shown) dismissSplash(); })
          .catch(e => console.warn('Startup preview skipped', e));
      }
      const flagsLoaded = window._fbLoadModeFlags();
      const early = cachedGlobal === null ? null : {
        global: cachedGlobal,
        catalog: window._fbLoadCatalog({ global: cachedGlobal }),
        notify: window._fbLoadSettings('notifyEndpoint', { global: cachedGlobal }),
        analytics: window._fbLoadSettings('analyticsConfig', { global: cachedGlobal }),
      };
      // A dropped early read that fails must not surface as an unhandled rejection.
      if (early) [early.catalog, early.notify, early.analytics].forEach(p => p.catch(() => {}));
      await flagsLoaded;
      const useEarly = !!early && window._useFirestoreGlobal() === early.global;

      const loadNotifySettings = async () => {
        try {
          const ep = await (useEarly ? early.notify : window._fbLoadSettings('notifyEndpoint'));
          if (ep && ep.url) { notifyUrl = ep.url; localStorage.setItem('lm-notify-url', ep.url); }
        } catch (_) { }
      };

      const loadAnalyticsSettings = async () => {
        try {
          const ac = await (useEarly ? early.analytics : window._fbLoadSettings('analyticsConfig'));
          if (ac && ac.url) {
            localStorage.setItem('lm-analytics-url', ac.url);
          }
        } catch (_) { }
      };

      // NOW that we have a valid token, we pull the protected catalog.
      await Promise.all([loadCatalog(useEarly ? early.catalog : null), loadNotifySettings(), loadAnalyticsSettings()]);
      loadAuthorViewOverrides();

      // Check access
      _pendingGateMsg = null;
      const uEmail = user.email.toLowerCase().trim();
      if (uEmail === publisherEmail && user.emailVerified === true) {
        window.IS_PUBLISHER = true;
        IS_AUTHOR_MODE = false;
        // Seed/refresh the rules-readable ownership map now we're authenticated as
        // publisher, so authors' per-book writes resolve under the tightened rules
        // even if the catalog isn't edited this session.
        if (typeof window._fbSaveBookOwners === 'function') window._fbSaveBookOwners(ownersFromBooks());
        showApp('publisher', null);
        syncSheetsConnectionWithCloud();
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
        openPayLinkSetupIfAsked();
        dismissSplash();
        return;
      }

      // No match
      // The sign-out re-fires this listener with no user, which would wipe the message.
      _pendingGateMsg = `Your Google account (${user.email}) is not authorized for any books.`;
      window._fbSignOut();
      setupGate(_pendingGateMsg);
      const err = document.getElementById('pw-err');
      if (err) err.textContent = '';
      dismissSplash();
    } catch (e) {
      console.error('Error during initStartup auth state change:', e);
      dismissSplash();
    }
  });
}

// ── STARTUP PREVIEW
// A device that has opened the app before keeps the last copy of the catalogue,
// the books and the Tax Centre in Firestore's on-device cache. Reading that
// takes a moment, where the server can take seconds on a weak signal, so the
// screen is painted from it first, marked as updating (with how old the copy
// is), and the normal startup then replaces every figure with the server's.
//
// For the publisher (every book, and the Tax Centre) and for an artist (their
// own book, found by their email in the cached catalogue). Only when this
// device's flags put the catalogue and those books in Firestore, and only when
// the device holds a copy of every book shown — one missing would read as an
// empty ledger. It writes nothing, and the copies it shows can't be written
// back: the register waits (posPreparePendingSale), and the catalogue and Tax
// Centre refuse to save (saveCatalogWithDeletions, _fbSaveSettings) until the
// server's copies are in. Shown book copies are marked `_preview`, so a first
// load that then fails reports it rather than keeping them as if loaded.
async function showStartupPreview(user, publisherAccount) {
  const stored = await window._fbPeekCachedCatalog();
  if (!stored || typeof stored !== 'object' || !_startupPreviewOpen) return false;
  const deleted = Array.isArray(stored._deletedDefaults) ? stored._deletedDefaults : [];
  const allIds = [...new Set([
    ...Object.keys(DEFAULT_BOOKS).filter(id => !deleted.includes(id)),
    ...Object.keys(stored).filter(k => k !== '_deletedDefaults' && k !== '_posExtra'),
  ])];
  let authorBookId = null;
  if (!publisherAccount) {
    const email = (user.email || '').toLowerCase().trim();
    authorBookId = allIds.find(id => {
      const entry = stored[id] || DEFAULT_BOOKS[id];
      return !!email && ((entry && entry.authorEmail) || '').toLowerCase().trim() === email;
    }) || null;
    if (!authorBookId) return false;
  }
  const ids = publisherAccount ? allIds : [authorBookId];
  let flagged = false;
  try { flagged = ids.every(id => localStorage.getItem('fs_mode_' + id) === 'true'); } catch (_) { }
  if (!ids.length || !flagged) return false;
  const [copies, taxCenter] = await Promise.all([
    Promise.all(ids.map(id => window._fbPeekCachedBook(id))),
    publisherAccount ? window._fbPeekCachedSetting('taxCenter') : null,
  ]);
  if (copies.some(c => !c || typeof c !== 'object')) return false;
  // The server's catalogue may have arrived while the device was being read.
  if (!_startupPreviewOpen) return false;

  applyStoredCatalog(stored);
  ids.forEach((id, i) => {
    if (states[id]) return;
    const book = BOOKS[id];
    const st = { ...defaultState(book), ...copies[i] };
    ['doneIds', 'artistTransfers', 'artistPayouts', 'expenses'].forEach(k => { if (!st[k]) st[k] = []; });
    recomputeAfters(st, book);
    Object.defineProperty(st, '_preview', { value: true, enumerable: false, configurable: true });
    states[id] = st;
  });
  // The Tax Centre's own load replaces this object, and the mark with it,
  // merging in anything logged while it showed (keepPreviewEdits).
  if (taxCenter && typeof taxCenter === 'object') {
    TAX_CENTER = { businessExpenses: [], recurring: [], settings: { baseCurrency: 'CAD', geminiKey: '' }, ...taxCenter };
    if (TAX_CENTER.settings?.rates) Object.assign(_fxRateCache, TAX_CENTER.settings.rates);
    Object.defineProperty(TAX_CENTER, '_preview', { value: true, enumerable: false, configurable: true });
    _taxCenterPreviewBase = JSON.stringify(TAX_CENTER);
  }
  _startupPreviewShown = true;
  if (publisherAccount) {
    window.IS_PUBLISHER = true;
    IS_AUTHOR_MODE = false;
    setActiveBook('all');
    showAppShell('publisher', null);
  } else {
    window.IS_PUBLISHER = false;
    IS_AUTHOR_MODE = true;
    ACTIVE_BOOK_FORCED = authorBookId;
    setActiveBook(authorBookId);
    showAppShell('author', authorBookId);
    showAuthorBookFrame(authorBookId);
  }
  let age = '';
  try { age = describeCopyAge(getLocalStorage()?.getItem(DEVICE_COPY_KEY), Date.now()); } catch (_) { }
  setSyncState('syncing', `<b>Firestore</b> · showing this device's copy${age ? ' ' + age : ''} · updating…`);
  renderCurrent();
  return true;
}

// Which database this device's mode flags chose last time (_fbLoadModeFlags
// keeps a copy in localStorage): true/false, or null when it has never loaded
// them and startup has no guess to make.
function startupCachedGlobalMode() {
  try {
    const v = localStorage.getItem('fs_mode_global');
    return v === 'true' ? true : v === 'false' ? false : null;
  } catch (_) { return null; }
}

let _pendingGateMsg = null;
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

    // Only an http(s) address is loaded or linked; a pasted javascript: or
    // data: value stays out of the frame and the link.
    const safeUrl = safeHttpUrl(url);
    if (iframe && safeUrl && iframe.src !== safeUrl) {
      iframe.src = safeUrl;
    }
    if (externalLink && safeUrl) {
      externalLink.href = safeUrl;
    }

    renderUmamiStats(url);
  } else {
    // Show Setup View
    if (statusBadge) {
      statusBadge.textContent = 'Not Connected';
      statusBadge.className = 'sheets-badge off';
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

export function updateModalAccentPreview(inputEl) {
  if (!inputEl) return;
  const color = inputEl.value;
  const colorBg = hexToRgba(color, 0.1);
  const modal = inputEl.closest('.modal');
  if (modal) {
    modal.style.setProperty('--local-accent', color);
    modal.style.setProperty('--local-accent-bg', colorBg);
    modal.style.setProperty('--local-accent-text', getPaperSafeText(color));
    const pair = getAccentFillPair(color);
    modal.style.setProperty('--local-accent-fill', pair.fill);
    modal.style.setProperty('--local-accent-contrast', pair.label);
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

// ISO country resolution lives in src/lib/countries.js. This used to be a
// hand-kept table of about forty countries with a blanket 'US' fallback, which
// filed a Serbian order under the United States because Serbia was simply not
// in the list. The table is now the full ISO 3166-1 set and the fallback is
// gone from every place that classifies an order.
export function normalizeCountryCode(code) {
  const resolved = resolveCountryCode(code);
  if (resolved) return resolved;

  // Not a country this app knows. Before defaulting, honour whatever the
  // destination picker is actually offering — it is populated from the same
  // ISO table, so this only matters if that list is ever extended by hand.
  const raw = String(code ?? '').trim();
  const select = typeof document !== 'undefined' ? document.getElementById('st-country') : null;
  if (raw && select && select.options) {
    const rawLower = raw.toLowerCase();
    for (const opt of select.options) {
      if (opt.value && (opt.value.toLowerCase() === rawLower || opt.textContent.toLowerCase() === rawLower)) {
        return opt.value;
      }
    }
  }

  // Kept only so the Shipping tab's own form still has a country selected on
  // first load. Nothing that buckets an order by region may rely on it — those
  // callers use shipmentRegion, which sends an unplaceable country to
  // "International" rather than to the United States.
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
  // The Intelligence panel's buttons are rendered from template strings, so
  // every one of its handlers has to be reachable off window at click time.
  // Its names lead the list below.
  Object.assign(window, {
    acceptIntelDisclosure, toggleIntelPrivacyDetails, clearIntelThread,
    intelComposerKey, renderIntel, sendIntelMessage, stopIntelTurn,
    dismissDeductionGap, renderDeductionGaps, restoreDeductionGaps, snoozeDeductionGap,
    revealUpdatingScreen, hideUpdatePrompt, bindUpdatePromptInteractions, isTestBook, isTestBookId,
    ownersFromBooks, saveCatalogWithDeletions, loadCatalog, syncCatalog, switchBookModalTab,
    stepBookModal, updateBookModalFinancials, onBookTitleInput, selectBookAccentPreset, onCustomAccentInput, applyBookParcelPreset,
    resetBookForm, openAddBookModal, openEditBookModal, closeAddBookModal, isValidPaymentLink,
    openProductionCostCalculator, closeProductionCostCalculator, renderProdCostCalcList, toggleProdCostCalcExpense, setProdCostCalcFilter, toggleAllFilteredProdCost, applyCalculatedProdCost,
    updateUnsavedIndicator, saveBookFromModal, renderCatalogList, deleteBook, openPaymentQRModal,
    updateSingleBookPaymentQR, generateSingleBookStripeQR,
    copyPaymentLink, downloadPaymentQR, renderAllQRCodes, renderAuthorQRPage,
    loadAuthorViewOverrides, saveAuthorViewOverrides, isPublisherSession, isAuthor,
    animateCountValue, triggerCardAnimations, queueSync, updatePendingIndicator, processSyncQueue,
    renderSyncChip, retrySyncNow,
    defaultState, getState, getBook, showToast, confirmDialog, promptDialog, notify, setSyncState, saveState,
    loadBook, toggleFirestoreMode, loadTaxCenter, saveTaxCenter, processRecurringExpenses,
    refreshDailyRates, loadAllBooks, forceSync, buildBookSwitcher, toggleBookDropdown,
    closeBookDropdown, toggleHeaderMenu, closeHeaderMenus, closeSideAccount, toggleSideAccount,
    updateRoleToggleButton, updateSubheader, placeKpiStrip, bindKpiResize, syncRoleUI,
    toggleCurrentBookView, updateProfileTabs, selectProfileTab, switchBook,
    switchTab, updateHeader, updateAllOverview, renderCustomersStat, channelColor,
    renderChannelAnalytics, selectAllChCurrency, setChChannelFilter, clearChChannelFilter, setChBookSort, setChBookSearch, renderOverviewRail, renderTodoTab, updateContextBanners,
    restoreDismissedTodoSignals, toggleSidebarAlerts,
    toggleConGroup, toggleConGrouping, toggleAllConGroups, setConStatusFilter, onConSearchInput, clearConSearch, clearConSearchAndFilter, renderConsignmentTable,
    updatePublisherActionBanner, renderBookPendingAlert, heldGrossOf, recognizedRevenueOf,
    dismissStockDrift, updateDash, getProfitTiersHtml, getRevenueProgressHtml, getOwedCardDetails,
    getArtistHeldHtml, getPayoutHistoryHtml, renderProfitSharingBreakdown, toggleArtistPayoutForm,
    saveArtistPayout, editArtistPayout, deleteArtistPayout, renderAll, renderCurrent, scheduleRender,
    recordOrder, showMoreHist, showAllHist, renderConsignHistRow, renderHist,
    getScanMemory, saveScanMemory, getAllAppliedIds, renderOrders, applyOne, reapplyOne, applyAll, fetchOrders, cancelOrder, restoreOrder, unapplyOne,
    backfillShipping, fetchLiveRate, fetchHistoricalRate, onManualCurrencyChange, calcFx,
    calcManualFxRate, onExpenseCurrencyChange, calcExpenseFx, _toggleShippingPanel, openLabelModal,
    updateShippedStatusUI, toggleShipped, printShippingLabel, saveArtistPaymentLink,
    isGratuityExpense, renderArtistReimburseBanner, updateExpenseForm, submitExpense, voidExpense,
    scanProjectReceiptWithAI, inferReceiptCategory, normalizeReceiptDate, parseEmlOrText,
    readReceiptFiles, openEmailReceiptImportModal, closeEmailReceiptImportModal,
    startEmailInboxWatcher, updateEmailInboxBadge, _inboxItemToDraft, loadGmailInboxDrafts,
    localizeInboxReceiptFiles, switchEmailImportTab, renderGmailChips, applyGmailPresetQuery, applyDirectGmailPresetQuery,
    searchGmailEmails, renderGmailEmailsList, toggleEmailRowSelection, toggleAllGmailSelections,
    searchDirectGmailEmails, renderDirectGmailChips, renderDirectGmailEmailsList, toggleDirectEmailPreview, toggleDirectGmailSelection, toggleAllDirectGmailSelections,
    importDirectGmailEmails, handleEmailImportPrimaryAction,
    toggleEmailPreview, _emailBodyToReceiptFile, _selectedFileParts, renderEmailPreviewContent,
    _setEmailAttExcluded, _callGeminiForReceipts, extractReceiptsFromEmailText, _findDuplicateExpense,
    _runReceiptScan, _extractReceiptFromFile, _prepareReceiptUpload, _receiptMimeFor, _fileToBase64,
    _applyScanCurrency, _applyScanCategory, _buildReceiptScanPrompt, RECEIPT_SCAN_SCHEMA,
    openBatchExpenseModal, closeBatchExpenseModal, renderBatchExpenseModal, setBatchExpenseDest,
    batchExpenseDestinations, batchExpenseAddBlankRow, removeBatchExpenseRow, rescanBatchExpenseRow,
    // Receipt dropzone handlers. These were `window.x = function …` at column 0,
    // which runs at import time — not allowed once they move into a feature
    // module. They are plain declarations now and reach the inline on*=
    // attributes in index.html the same way every other handler here does.
    addReceiptsFromModal, addReceiptsToExpense, openExpenseReceipts, removeReceiptFromExpense, expFileChosen, expFileClear, expFileDragOver, expFileDragLeave, expFileDrop,
    tcExpFileChosen, tcExpFileClear, tcExpFileDragOver, tcExpFileDragLeave, tcExpFileDrop,
    batchExpenseFilesChosen, batchExpenseDragOver, batchExpenseDragLeave, batchExpenseDrop,
    toggleAllBatchExpenses, deselectDuplicateBatchExpenses, applyBatchExpenseBulk,
    renderBatchExpenseRows, scanAllBatchExpenses, submitBatchExpenses,
    _isLikelyDuplicateExpense, _expenseHasReceipt, renderEmailReceiptDrafts, toggleAllEmailDrafts,
    deselectDuplicateEmailDrafts, applyBulkCategoryToEmailDrafts, cancelEmailReceiptExtraction,
    retryFailedEmailExtractions,
    _saveDraftReceiptFiles, importEmailReceiptDrafts, renderExpenses, handleImportFile,
    confirmImport, updateManualForm, phint, submitManual, recordOrderPendingTransfer,
    markArtistTransferReceived, settleArtistTransferKeepShare, settleArtistTransferKeepAll,
    renderArtistTransfers, markExpenseReceived, renderPendingExpenses, submitGratuity, storeById,
    getConsignmentStoresAcrossBooks, populateAddStoreDirectory, handleSelectExistingStore, clearAddStoreForm,
    addStore, renderStores, removeStore, openEditStore, confirmEditStore, openSend, confirmSend,
    openBulkSend, bulkRowEls, bulkApplyQty, bulkQtyChanged, bulkCheckChanged,
    updateBulkSendSummary, confirmBulkSend, openSale, confirmSale, openRet, confirmReturn,
    settleLedgerSalePaid, maybeAutoPayInvoiceForLedger, invoiceBadgeHTML, markPaid,
    markHistoryConsignmentPaid, renderLedger, exportConsignmentLedgerCSV, getInvoiceSettings,
    saveInvoiceSettingsObj, openInvoiceTemplateSettings, saveInvoiceSettings,
    createStripePaymentLinkForInvoice, deactivateStripePaymentLink, invoicesVisibleHere,
    renderInvoices, openCreateInvoice, nextInvoiceNumber, onInvoiceStoreChange, getInvoiceCurrency,
    onInvoiceCurrencyChange, addInvoiceItem, removeInvoiceItem, updateInvoiceItem,
    renderInvoiceItems, escapeHtml, recalcInvoiceTotals, prefillFromPendingSales, saveInvoice,
    onDiscountTypeChange,
    onDiscountInput,
    addInvoiceBookLine,
    focusLastInvoiceLine,
    onInvoiceLineKey,
    applyDiscountPreset,
    applyInvoiceDueTerm,
    onInvoiceIssueDateChange,
    onInvoiceDueDateChange,
    duplicateInvoiceFromView,
    regenerateStripeLinkFromView, deleteInvoice, viewInvoice, effectivePaymentLink,
    isDynamicStripeLink, renderInvoicePaperHTML, editInvoiceFromView, markInvoicePaidFromView,
    printInvoice, printInvoiceViaPopup, copyInvoicePayLink, invoiceEmailPlainText,
    buildInvoiceEmailHTML, copyInvoiceEmailToClipboard, emailInvoice, collectInvoicePaperCss,
    invoicePaperBodyWithQR, buildStandaloneInvoiceHTML, downloadInvoiceHTML, loadExternalScript,
    ensurePdfLibs, downloadInvoicePDF, findKeptAllPayout, convertKeptAllToReceived, openEditHist,
    openEditLedger, saveEntryEdit, syncLedgerVoid, reconcileConsignmentChannel, reconcileStores,
    recomputeAfters, recalcOnHand, setStockTransferDirection, openStockTransferModal, stepStockTransfer, onStockTransferQtyChange, updateStockTransferPreview, submitStockTransfer, syncHistoryVoidDeletion, voidEntry, resetBookData,
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
    uploadReceiptToCloud, saveReceiptBestEffort, cloudReceiptOwners,
    openReceiptCacheDb, cacheReceiptFile, readCachedReceipt, listCachedReceiptMeta,
    evictReceiptCacheToBudget, deleteCachedReceipt, makeReceiptPreview, openBlobInTab,
    checkReceiptFolderHealth, receiptFolderReachable, backfillReceiptCache, cacheAllReceiptsNow,
    cloudReceiptQueue, receiptWaitingDays, openCloudReceiptsModal, closeCloudReceiptsModal,
    summarizeReceiptProblems, formatReceiptDiagnostic, renderReceiptProblemPanel, copyReceiptDiagnostic,
    dismissReceiptNotice, resetDismissedReceiptNotices, switchTaxCenterSubTab, switchPOSSubTab, fairKitSearchFilter,
    receiptsForExport, receiptExportYears, readReceiptBytes, exportReceiptsZip,
    openExportReceiptsModal, closeExportReceiptsModal, runReceiptExport,
    listFilesRecursive, organizerCandidateExpenses, openReceiptOrganizer, closeReceiptOrganizer,
    chooseOrganizerSource, organizerReadUnclear, renderOrganizerTable, toggleOrganizerSkip,
    runReceiptOrganizer,
    _localReceiptCell, viewLocalReceipt, initializeBackupFolderDisplay, reclaimCloudReceipts,
    reclaimOneReceipt, reclaimCloudReceiptsNow, exportToJSON, maybeAutoDownloadDailyBackup,
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
    downloadTaxReport, logout, showApp, boot, changeExpenseCategory,
    _tcSaveLedgerPrefs, _tcRestoreLedgerPrefs, setTcLedgerPage, tcLedgerSearchInput,
    tcLedgerTypeFilter, tcYearChange, tcLedgerYearChange, tcClearLedgerFilters,
    _tcApplyLedgerFilter, renderTaxCenter, _tcDeltaChip, _tcRenderCashFlowSummary,
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
    clearShippingReconciliationList,
    renderPostageMatchWorklist, onPostageRecipientInput, linkPostageExpense,
    autoMatchPostageReceipts, dismissPostageExpense, scanPostageReceipt, scanAllPostageReceipts,
    promptLedgerTracking,
    openRecoverWebsiteOrder, onRecoverWebsiteOrderBookChange, saveRecoverWebsiteOrder,
    importShippoShippingFromApi, openShippoLabel, submitTaxExpense,
    openRecurringEditor, saveRecurringEditor, updateRecurringPreview, toggleRecurringPause,
    addRecurringRateChange, removeRecurringRateChange,
    tcSetRecurringFilter, tcShowRecurringCharges,
    removeRecurring, downloadTaxLedgerCSV, posBooksMap, posResolveBook, isPosOnlyBook,
    _getPosDefaultCurrency, loadPosExchangeRates, savePosExchangeRates, currencyToCode,
    codeToSymbol, posFormat, convertCurrency, getPOSCurrencies, buildPOSCartRows, renderPOS,
    _showPosQR, renderPOSFxStatus, _posItemToManualPayload, renderSalesTrackerBookList,
    _stOnHandHint, _stUpdatePackTotal, _stReadPresetForm, _stApplyPresetToForm,
    renderQRPrintBookList, _qrpSelectedPriceCurrencies, _qrReadPresetForm,
    _qrApplyPresetToForm, renderFairKitBookList, renderFairKitPresetPicker, fairKitPresets,
    findFairKitPreset, fairKitPresetSummary, fairKitMode, _fkBookPrintsQR, _fkSelectionCounts,
    _fkPackedTotal, _fkUpdateSummary, _fkOpenQrPrintWindow,
    _posSlugId, renderPosBookModalQR, _stripeMinorToMajor,
    _stripeFriendlyType, _stripeFmtMoney, fetchStripeTransactions, aggregateStripeTransactions,
    renderStripeFeesCards, fetchStripeFeesByYear, insertStripeFeesIntoLedger,
    reconcileStripeAgainstSales, clearStoredStripeKey, downloadStripeFeesAuditCSV, getReconMemory,
    saveReconMemory, getReconStripeKey, _reconPersistKey, fetchStripePaymentsForReconcile,
    _reconRecordedChargeIds, _reconFindInvoice, _reconLikelyAlreadyLogged, _reconLoggedPayments, classifyStripePayment,
    _reconApplySaleToBook, reconcileSync, _reconBookOptions, reconRenderKeyRow, reconEditKey,
    reconOnFilter, reconSetCurrency, reconClearFilters, _reconIsPickable, _reconMatchesFilter,
    _reconAmountBadge, _reconMeta, _reconNeedCard, _reconGroupCard, renderReconcile,
    _reconFindPayment, _reconApplyPaymentToBook, reconUpdateDefaults, reconcileRecordSale, reconcileApplyBigCartel,
    reconcileOpenInvoice, reconcileDismiss, reconRecordGroup, reconDismissGroup,
    reconDismissAllShown, reconcileUndo, createStripePaymentLinkForBook,
    createStripePaymentLinkForAmount, generateBookStripeLink, _isCustomerSuppressed,
    loadCustomerSuppression, _persistCustomerSuppression, toggleCustomerSuppress,
    setCustomerBookFilter, mailingSubsArray, mailingListHas, loadMailingList, _persistMailingList,
    _mailingUpsert, addManualSubscriber, addBuyerToMailingList, removeFromMailingList,
    _mailingMergeBuyers, addAllBuyersToMailingList, toggleMailingAutoAdd, _mailingAutoSync,
    renderMailingList, focusMailingListAdd, _uniqueMailable, _openGmailBcc, emailCustomerSegment, emailMailingList,
    copyMailingListEmails, exportMailingListCSV, _loadCustomerStripeCache,
    _saveCustomerStripeCache, _custEmailKey, _custUpsert, _custAddSpend, _custTouchDate,
    buildCustomerList, _custSpendStr, _custApplyFilter, _custMailable, _custSyncBookFilterOptions,
    _custFilterState, _custActiveFilters, _custEmptyHtml, _renderCustFilterBar,
    clearCustomerFilter, clearCustomerFilters,
    setCustomerChannelFilter, setCustomerSpendFilter, setCustomerOrdersFilter,
    checkMailingEmailTypo, suggestEmailTypo, applyMailingEmailCorrection,
    loadCampaigns, _persistCampaigns,
    parseMarkdownToHtml,
    switchCustomersSubTab, renderCustomers, renderCustomersAudience,
    openCampaignWizard, closeCampaignWizard, updateCampaignModeStatus, onForceMockChange,
    insertTemplateTag, updateCampaignPreview, onCampaignSegmentChange, getSegmentRecipients,
    saveCampaignDraft, editCampaignDraft, deleteCampaign, sendSingleEmailViaBackend,
    sendTestEmailCampaign, cancelCampaignSending, sendCampaignLaunch, sendNextCampaignEmail,
    finishCampaignSend, retryCampaignEmail, updateCampaignSendFinishedSummary, renderCampaigns,
    filterCustomers, customerPullStripe, customerPullDeeper, copyCustomerEmails,
    exportCustomersCSV, checkAppUpdate, dismissAppUpdate, fetchRecentChanges, showWhatsNew,
    initStartup, setupGate, renderWebAnalytics, updateModalAccentPreview, normalizeCountryCode,
    getAllStores, getBookPresetSpecs, initShippingTab, getRecentShippingOrders, saveShippoApiKey,
    editShippoApiKey, onShippoPreFillDestChange, prefillShippingFromBigCartelOrder, onShippoBookPresetChange,
    onShippoAutoQuoteToggle, applyOrderPrefill, isCanadaPostRate,
    moneyAmount, roundShippingCharge, buildShippingChargePrediction,
    renderShippingChargePrediction, collectShippoMessages, renderShippoDiagnostics,
    calculateShippoRates, updateShippoBaseSpecsFromInputs, onShippoQuantityChange,
    renderShippoIncotermHint, onShippoIncotermChange, onShippoDestCountryChange,
    updateShippoCustomsTotalHint,
    buyShippoLabel, verifyDestinationAddress, applyVerifiedAddressCorrections,
    dismissAddressVerification, verifyLedgerOrderAddress, batchVerifyLedgerAddresses,
    applyLedgerAddressCorrections, downloadInventoryValuationCSV, openInventoryValuationModal, printInventoryValuationReport,
    setInventoryAdjustmentMode, openInventoryWriteOffModal, onWriteOffBookChange, recalcWriteOffValue, submitInventoryWriteOff,
    renderShippingAnalysisHub, changeShipAnalysisPage, onShipAnalysisBookFilterChange, setShipAnalysisMarginFilter,
    onShipAnalysisSearch, onInlinePostageChange,
    confirmSuggestedShippoLink, openManualShippoLinkModal, filterManualShippoLinkRows,
    editPostageCost, unlinkManualPostage, dismissShippingAnalysisOrder, markShippingOrderLocalPickup, unmarkShippingOrderLocalPickup, restoreShippingAnalysisOrder,
    toggleAllShipAnalysisOrders, updateShipAnalysisBatchActionUI, batchDismissShippingAnalysisOrders,
    syncBigCartelShippingPaid, triggerBigCartelShippingSync,
    toggleShipAnalysisCarrierFilter, toggleShipAnalysisRegionFilter, toggleShipAnalysisWeightFilter, clearAllShipAnalysisFilters, downloadFilteredShippingLedgerCSV,
    updateManualShippingRates, applySmartShippingRates, onShipRecoWeightSelectChange, onShipRecoCustomWeightChange, onShipRecoModeChange, onShipInsightsToggle,
    getShipRecoPercentile, setShipRecoPercentile, onShipRecoPercentileChange, updateShippingSimulation,
    toggleIntegrationSection,
    testOpenRouterConnectionFromSettings, testZonosConnectionHandler, calculateZonosDutiesHandler, renderZonosDutyCard,
    testCanadaPostConnectionHandler, diagnoseCanadaPostHandler, renderCanadaPostKeySets, calculateCanadaPostRatesHandler, calculateChitChatsRatesHandler, renderCanadaPostRatesCard, buyCanadaPostLabelHandler,
    showCanadaPostLabelModal, retryFetchCanadaPostLabelArtifact, closeCanadaPostLabelModal, printCanadaPostLabelModal, downloadCanadaPostLabelModal, copyCanadaPostPin,
    checkLiveShippingReadinessHandler, renderLiveReadinessChecklist, renderZonosAccountKeyHint,
    openSaveBookPresetModal, confirmSaveBookPreset, renderSaveBookPresetPreview,
    setThemePreference, cycleThemePreference, toggleTheme
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
window.checkBigCartelLedgerGaps = checkBigCartelLedgerGaps;
window.toggleBigCartelGapPanel = toggleBigCartelGapPanel;
window.restoreBigCartelGaps = restoreBigCartelGaps;
window.dismissAllBigCartelGaps = dismissAllBigCartelGaps;
window.renderBigCartelLedgerGaps = renderBigCartelLedgerGaps;
window.autoCheckBigCartelLedgerGaps = autoCheckBigCartelLedgerGaps;
window.dismissNewOrderAlert = dismissNewOrderAlert;
window.dismissAppAlert = dismissAppAlert;
window.markAppAlertReviewed = markAppAlertReviewed;
window.renderIntegrationBadges = renderIntegrationBadges;

/**
 * The "Check now" button on a health card: ask that service again immediately
 * rather than waiting out the backoff. Both watches already accept `force`,
 * which is what skips the interval gate.
 */
window.recheckIntegration = (id) => {
  if (id === 'bigcartel') return refreshBigCartelOrdersIfDue({ force: true });
  if (id === 'shippo') return refreshShippoLabelsIfDue({ force: true });
  if (id === 'canadapost') return sweepCanadaPostShipments({ force: true });
  if (id === 'shipping-email') return sweepShippingEmails({ force: true });
  if (id === 'stripe') return sweepStripeInvoicePayments({ force: true });
  if (id === 'stripe-fees') return sweepStripeFees({ force: true });
  if (id === 'receipt-scan') return sweepReceiptEmails({ force: true });
  return undefined;
};
window.openReceiptSweepReviewFromAlert = openReceiptSweepReviewFromAlert;
window.fileReadyReceiptsFromAlert = fileReadyReceiptsFromAlert;
window.dismissEmailReceiptDraft = dismissEmailReceiptDraft;
window.openInvoiceFromAlert = openInvoiceFromAlert;
window.sweepStripeInvoicePayments = sweepStripeInvoicePayments;
window.sweepStripeFees = sweepStripeFees;
window.sweepReceiptEmails = sweepReceiptEmails;
window.linkConfidentShippingMatchesNow = linkConfidentShippingMatchesNow;
window.openShippingReconciliationFromAlert = openShippingReconciliationFromAlert;
window.openPostageAmountEditor = openPostageAmountEditor;
window.discardImportedPostageExpense = discardImportedPostageExpense;
window.openShippingFromDeliveryAlert = openShippingFromDeliveryAlert;
window.openShippingFromUnshippedAlert = openShippingFromUnshippedAlert;
window.openShippingPricesFromAlert = openShippingPricesFromAlert;
window.shipNewOrderFromAlert = shipNewOrderFromAlert;
window.recordNewOrderFromAlert = recordNewOrderFromAlert;
window.toggleBigCartelAutoRecord = toggleBigCartelAutoRecord;
window.toggleBigCartelOrderNotify = toggleBigCartelOrderNotify;
window.reviewNewOrdersFromAlert = reviewNewOrdersFromAlert;
window.refreshBigCartelOrdersIfDue = refreshBigCartelOrdersIfDue;
window.switchBigCartelSubTab = switchBigCartelSubTab;
window.loadBigCartelData = loadBigCartelData;
window.renderBigCartelTab = renderBigCartelTab;
window.prefillShippingFromBigCartelOrder = prefillShippingFromBigCartelOrder;

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
window.shipNextOrder = shipNextOrder;
window.closePurchasedLabelPanel = closePurchasedLabelPanel;
window.closeLiveReadinessChecklist = closeLiveReadinessChecklist;
window.closeReceiptFolderAlert = closeReceiptFolderAlert;
window.shipQueuedOrder = shipQueuedOrder;
window.hideQueuedOrder = hideQueuedOrder;
window.unhideQueuedOrder = unhideQueuedOrder;
window.closeShipQueueCard = closeShipQueueCard;
window.toggleShipQueueHidden = toggleShipQueueHidden;
window.clearShippoDestSelection = clearShippoDestSelection;
window.onShippoBookPresetChange = onShippoBookPresetChange;
window.onShippoAutoQuoteToggle = onShippoAutoQuoteToggle;
window.openSaveBookPresetModal = openSaveBookPresetModal;
window.confirmSaveBookPreset = confirmSaveBookPreset;
window.renderSaveBookPresetPreview = renderSaveBookPresetPreview;
window.calculateShippoRates = calculateShippoRates;
window.updateShippoBaseSpecsFromInputs = updateShippoBaseSpecsFromInputs;
window.onShippoQuantityChange = onShippoQuantityChange;
window.renderShippoIncotermHint = renderShippoIncotermHint;
window.onShippoIncotermChange = onShippoIncotermChange;
window.onShippoDestCountryChange = onShippoDestCountryChange;
window.updateShippoCustomsTotalHint = updateShippoCustomsTotalHint;
window.calculateZonosDutiesHandler = calculateZonosDutiesHandler;
window.testZonosConnectionHandler = testZonosConnectionHandler;
window.testChitChatsConnectionHandler = testChitChatsConnectionHandler;
window.onZonosDeclarationIdInput = onZonosDeclarationIdInput;
window.pasteZonosDeclarationId = pasteZonosDeclarationId;
window.checkCanadaPostAccountAndPinHandler = checkCanadaPostAccountAndPinHandler;
window.verifyShippedTrackingPinsHandler = verifyShippedTrackingPinsHandler;
window.showArchivedCanadaPostLabels = showArchivedCanadaPostLabels;
window.reprintArchivedCanadaPostLabel = reprintArchivedCanadaPostLabel;
window.openZonosPrepayAppHandler = openZonosPrepayAppHandler;
window.calculateCanadaPostRatesHandler = calculateCanadaPostRatesHandler;
window.calculateChitChatsRatesHandler = calculateChitChatsRatesHandler;
window.importChitChatsShippingHandler = importChitChatsShippingHandler;
window.testCanadaPostConnectionHandler = testCanadaPostConnectionHandler;
window.diagnoseCanadaPostHandler = diagnoseCanadaPostHandler;
window.renderCanadaPostKeySets = renderCanadaPostKeySets;
window.renderCanadaPostRatesCard = renderCanadaPostRatesCard;
window.buyCanadaPostLabelHandler = buyCanadaPostLabelHandler;
window.openCanadaPostPurchasedLabel = openCanadaPostPurchasedLabel;
window.showCanadaPostLabelModal = showCanadaPostLabelModal;
window.retryFetchCanadaPostLabelArtifact = retryFetchCanadaPostLabelArtifact;
window.closeCanadaPostLabelModal = closeCanadaPostLabelModal;
window.printCanadaPostLabelModal = printCanadaPostLabelModal;
window.downloadCanadaPostLabelModal = downloadCanadaPostLabelModal;
window.copyCanadaPostPin = copyCanadaPostPin;
window.voidCanadaPostLabelAction = voidCanadaPostLabelAction;
window.checkLiveShippingReadinessHandler = checkLiveShippingReadinessHandler;
window.renderLiveReadinessChecklist = renderLiveReadinessChecklist;
window.renderZonosAccountKeyHint = renderZonosAccountKeyHint;
window.buyShippoLabel = buyShippoLabel;
window.openBatchShipping = openBatchShipping;
window.checkBatchOrders = checkBatchOrders;
window.buyBatchLabels = buyBatchLabels;
window.toggleBatchRow = toggleBatchRow;
window.openBatchRowInForm = openBatchRowInForm;
window.requestLabelRefund = requestLabelRefund;
window.markLabelRefundArrived = markLabelRefundArrived;
window.printBatchLabels = printBatchLabels;
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
window.onInlineShippingPaidChange = onInlineShippingPaidChange;
window.unlinkManualShippingPaid = unlinkManualShippingPaid;
window.confirmSuggestedShippoLink = confirmSuggestedShippoLink;
window.openManualShippoLinkModal = openManualShippoLinkModal;
window.filterManualShippoLinkRows = filterManualShippoLinkRows;
window.doManualShippoLink = doManualShippoLink;
window.closeManualShippoLinkModal = closeManualShippoLinkModal;
window.unlinkShippoExpense = unlinkShippoExpense;
window.findShippoReceipts = findShippoReceipts;
window.editPostageCost = editPostageCost;
window.unlinkManualPostage = unlinkManualPostage;
window.dismissShippingAnalysisOrder = dismissShippingAnalysisOrder;
window.markShippingOrderLocalPickup = markShippingOrderLocalPickup;
window.unmarkShippingOrderLocalPickup = unmarkShippingOrderLocalPickup;
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
