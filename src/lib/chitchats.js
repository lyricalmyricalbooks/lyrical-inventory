import {
  resolveListShipmentsEndpoint,
  resolveShipmentEndpoint,
  resolveCreateBatchEndpoint
} from './chitchats-endpoints.js';
import { getSavedSheetsUrl } from './sheets-url.js';

/**
 * Execute a proxy call to the Chit Chats API via Apps Script.
 */
export async function executeChitChatsProxy({ endpoint, method = 'GET', payload = null, token = '' }) {
  if (!endpoint || !token) throw new Error('Missing endpoint or API token for Chit Chats');

  const sheetsUrl = getSavedSheetsUrl();
  if (!sheetsUrl) throw new Error('No Google Sheets URL configured for proxy routing');

  const proxyPayload = {
    action: 'proxychitchats',
    payload: {
      endpoint,
      method,
      apiKey: token,
      jsonPayload: payload
    }
  };

  const response = await fetch(sheetsUrl, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proxyPayload)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const result = await response.json();
  if (result.error) {
    throw new Error(`Proxy error: ${result.error}`);
  }
  
  if (!result.ok) {
    throw new Error(`Chit Chats API Error [${result.status}]: ${result.text || JSON.stringify(result.data)}`);
  }
  return result.data;
}

/**
 * Verify Chit Chats connection by fetching 1 shipment.
 */
export async function verifyChitChatsConnection({ clientId, token }) {
  if (!clientId || !token) {
    return { ok: false, error: 'Missing Client ID or Token' };
  }
  try {
    const endpoint = resolveListShipmentsEndpoint(clientId) + '?limit=1';
    await executeChitChatsProxy({ endpoint, token, method: 'GET' });
    return { ok: true, error: '' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Get rates via Chit Chats API.
 */
export async function getChitChatsRates(scenario) {
  // ChitChats requires creating a shipment or using their rate endpoint if available.
  // We'll stub this for now, but a full integration would create a test shipment here
  // or use the specific rating endpoint if one exists.
  return [];
}

/**
 * Buy a label for a shipment.
 */
export async function buyChitChatsLabel(scenario) {
  throw new Error('Not implemented');
}

/**
 * Fetch the label artifact for a Chit Chats shipment.
 */
export async function fetchChitChatsLabelArtifact(shipmentId) {
  throw new Error('Not implemented');
}
