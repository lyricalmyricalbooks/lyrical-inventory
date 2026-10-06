// Documented v1 resources only; never send account tokens to arbitrary URLs.
export const CHITCHATS_API_ROOT = 'https://chitchats.com/api/v1';
export const CHITCHATS_STAGING_ROOT = 'https://staging.chitchats.com/api/v1';
export function resolveListShipmentsEndpoint(clientId, isTest = false) {
  if (!/^\d+$/.test(String(clientId || '').trim())) throw new Error('Enter your numeric Chit Chats client ID.');
  return `${isTest ? CHITCHATS_STAGING_ROOT : CHITCHATS_API_ROOT}/clients/${String(clientId).trim()}/shipments`;
}
export function resolveShipmentEndpoint(clientId, shipmentId = '', isTest = false, action = '') {
  const base = resolveListShipmentsEndpoint(clientId, isTest);
  if (!shipmentId) return base;
  if (!/^[a-z0-9]+$/i.test(shipmentId) || !['', 'buy', 'refund', 'refresh'].includes(action)) throw new Error('Invalid Chit Chats shipment endpoint.');
  return `${base}/${shipmentId}${action ? `/${action}` : ''}`;
}
export function isChitChatsEndpoint(endpoint, artifact = false) {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || !['chitchats.com', 'staging.chitchats.com'].includes(url.hostname) || url.port || url.username || url.password || url.hash) return false;
    return artifact ? /^\/labels\/shipments\/[a-z0-9]+\.pdf$/i.test(url.pathname)
      : /^\/api\/v1\/clients\/\d+\/shipments(?:\/[a-z0-9]+(?:\/(?:buy|refund|refresh))?)?$/i.test(url.pathname);
  } catch (_) { return false; }
}
