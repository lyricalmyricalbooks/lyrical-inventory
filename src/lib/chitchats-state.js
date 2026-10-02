// Durable per-account recovery records contain no API tokens or signed labels.
export function chitChatsStateKey({ clientId, isTest }) {
  return `lm-chitchats-v1:${isTest ? 'test' : 'live'}:${clientId}`;
}
export function readChitChatsState(account) {
  try { return JSON.parse(localStorage.getItem(chitChatsStateKey(account)) || '{}'); } catch (_) { return {}; }
}
export function saveChitChatsState(account, value) {
  // Failure must stop a purchase: charging without a durable recovery ID is unsafe.
  localStorage.setItem(chitChatsStateKey(account), JSON.stringify(value));
}
export function safeChitChatsRecord(shipment) {
  const { postage_label_pdf_url, postage_label_png_url, postage_label_zpl_url, ...record } = shipment;
  void postage_label_pdf_url; void postage_label_png_url; void postage_label_zpl_url;
  return record;
}
