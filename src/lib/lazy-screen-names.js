// The names the page reaches on screens that load on demand (see
// ./lazy-feature.js and ./opencall-handlers.js for the first one). main.js
// registers a stub under each of these until the screen's file arrives.
// tests/lazy-screens.test.js keeps each list equal to what the module offers,
// so a new handler can't be missing its stub.

// The Intelligence (assistant) panel: its inline handlers on window.
export const INTEL_WINDOW_NAMES = [
  'acceptIntelDisclosure', 'toggleIntelPrivacyDetails', 'clearIntelThread',
  'intelComposerKey', 'renderIntel', 'sendIntelMessage', 'stopIntelTurn',
];

// The Intelligence panel's named actions (data-action="intel.…").
export const INTEL_ACTION_NAMES = [
  'intel.retry', 'intel.copy', 'intel.toggle', 'intel.apply',
  'intel.dismiss', 'intel.starter', 'intel.scrollTo', 'intel.provider',
];

// Stock valuation and write-offs (Tax Centre and Inventory tools).
export const INVENTORY_VALUATION_WINDOW_NAMES = [
  'setInventoryAdjustmentMode', 'openInventoryWriteOffModal', 'onWriteOffBookChange',
  'recalcWriteOffValue', 'submitInventoryWriteOff', 'downloadInventoryValuationCSV',
  'openInventoryValuationModal', 'printInventoryValuationReport',
];
