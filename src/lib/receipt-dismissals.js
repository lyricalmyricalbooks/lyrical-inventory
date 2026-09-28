const STORAGE_KEY = 'lm-dismissed-email-receipts-v1';

export function dismissalKey(receipt = {}) {
  if (receipt.ref) return String(receipt.ref);
  if (receipt._inboxId) return `inbox:${receipt._inboxId}`;
  if (receipt.msgId) return `receipt-email:${receipt.msgId}:${Number(receipt.rowIndex) || 0}`;
  return '';
}

function dismissedKeys(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || '[]');
    return new Set(Array.isArray(saved) ? saved.filter(key => typeof key === 'string') : []);
  } catch (_) {
    return new Set();
  }
}

export function filterDismissedReceipts(receipts = [], storage = globalThis.localStorage) {
  const dismissed = dismissedKeys(storage);
  return (receipts || []).filter(receipt => !dismissed.has(dismissalKey(receipt)));
}

export function rememberDismissedReceipt(receipt, storage = globalThis.localStorage) {
  const key = dismissalKey(receipt);
  if (!key) return false;
  const dismissed = dismissedKeys(storage);
  dismissed.add(key);
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify([...dismissed]));
    return true;
  } catch (_) {
    return false;
  }
}
