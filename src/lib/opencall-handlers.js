// Every function src/features/opencall.js exports. The Open Call screen is
// loaded on demand (see lazyFeature in ./lazy-feature.js), so until it arrives
// main.js registers a stub on window under each of these names for the page's
// inline handlers. tests/lazy-screens.test.js keeps this list equal to the
// module's export block, so a new export can't be missing a stub.
export const OPEN_CALL_EXPORTS = [
  'ocList', 'ocBlockedForAuthor_', 'ocEnsureQueues_', 'ocQueueNextStep_', 'ocStamp_',
  'ocUiOpen_', 'ocToggleSection', 'ocTogglePhotoPick', 'ocSetSort', 'ocSetTmplTab',
  'ocUpdateTmplPreview', 'ocThreadForStage', 'openOcBulkModal', 'ocBulkModalEscHandler',
  'closeOcBulkModal', 'renderOcBulkModalContent', 'ocBulkSelectAll', 'ocBulkUpdateCount',
  'sendOcBulkTestEmail', 'onOcBulkStageChange', 'sendOcBulkEmails', 'cancelOcBulkSend',
  'ocInitials', 'openOcBulkRemoveModal', 'closeOcBulkRemoveModal',
  'renderOcBulkRemoveModalContent', 'ocBulkRemoveSelectAll', 'ocBulkRemoveUpdateCount',
  'ocBulkRemoveFilter', 'executeOcBulkRemove', 'renderOpenCall', 'renderOcList', 'ocPlaceMenu',
  'ocMarkTmplDirty', 'ocSelectArtist', 'ocBackToRow', 'ocRefreshLatestEmails', 'ocReplyDraft',
  'ocSendQuickReply', 'ocToggleSelect', 'ocSelectAllVisible', 'ocClearSelection',
  'ocClearFilters', 'ocEmailSelected', 'ocRemoveSelected', 'ocToggleAddPanel', 'ocComposeNudge',
  'ocToggleResend', 'ocSaveResendConfig', 'ocSaveSenderConfig', 'ocFetchMailSenderInfo',
  '_ocScheduleCache', '_ocScheduleCacheSet', '_ocScheduleRequest', 'ocSnapshotContributors_',
  'ocPushSnapshot_', 'ocScheduleSnapshotPush_', 'ocSetServerSchedule',
  'ocRefreshScheduleStatus_', 'ocLoadSenderAliases', 'handleOcPhotoKeydown', 'addOcPhotoChip',
  'removeOcPhotoChip', 'renderOcPhotoChips', 'ocAddPhotoToContributor',
  'ocRemovePhotoFromContributor', 'ocAdd', 'ocToggleImport', 'ocRunImport', 'ocToggle',
  'ocDelete', 'ocReadProposalCreditEdit_', 'ocFlashCard_', 'ocApproveProposal',
  'ocDismissProposal', 'ocApproveAllProposals', 'ocOutboxRemove', 'ocOutboxSendAll',
  'ocCopyEmails', 'ocSearch', 'ocFilterByStage', 'checkOcEmailTypo', 'applyOcEmailCorrection',
  'loadOpenCalls', '_persistOpenCalls', 'migrateLegacyOpenCalls', 'ocCreateProject',
  'ocRenameProject', 'ocDeleteProject', 'ocSwitchProject', 'ocToggleColorPalette',
  'ocApplyColor', 'updateOpenCallBadges', 'ocApplyParsedImport_', 'handleOcCsvFile',
  'triggerOcCsvUpload', 'handleOcCsvUpload', 'handleOcCsvDragOver', 'handleOcCsvDragLeave',
  'handleOcCsvDrop', 'ocComposeStageEmail', 'openOcEmailPreviewModal',
  'closeOcEmailPreviewModal', 'ocPreviewModalSend', 'ocPreviewModalEditInWizard',
  'ocScanReplies', 'openOcImportGmailModal', 'closeOcImportGmailModal',
  'renderOcImportGmailModal', 'ocImportGmailSearch', 'ocImportGmailSelectAll',
  'ocImportGmailConfirm', 'ocScanRepliesSingle', 'ocToggleInlineThread', 'openOcEditModal',
  'closeOcEditModal', 'renderOcEditModalContent', 'ocClearUndeliverable', 'saveOcContributor',
  'downloadOcAttachment', 'ocUpdateBulkPreview', 'ocSaveTemplates', 'exportOpenCallCSV',
  'insertFormattingTag', 'serializeEditorHtml', 'deserializeHtmlToEditor',
];
