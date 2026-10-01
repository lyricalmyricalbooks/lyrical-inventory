/**
 * Chit Chats API endpoint registry
 */

export const CHITCHATS_API_ROOT = 'https://chitchats.com/api/v1';

export function resolveListShipmentsEndpoint(clientId) {
  if (!clientId) return '';
  return `${CHITCHATS_API_ROOT}/clients/${encodeURIComponent(clientId)}/shipments`;
}

export function resolveShipmentEndpoint(clientId) {
  if (!clientId) return '';
  return `${CHITCHATS_API_ROOT}/clients/${encodeURIComponent(clientId)}/shipments`;
}

export function resolveCreateBatchEndpoint(clientId) {
  if (!clientId) return '';
  return `${CHITCHATS_API_ROOT}/clients/${encodeURIComponent(clientId)}/batches`;
}
