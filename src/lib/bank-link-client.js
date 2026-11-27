// Talking to the Sheet script's bank link (Plaid). The Plaid keys and each
// bank's access token stay in the script; this side only asks for a link
// token, hands back what Plaid Link returns, and pages through transactions.

import { readScriptJson } from './script-reply.js';
import { FINDER_ENDPOINT_PATTERN } from './receipt-finder-client.js';
import { applyPlaidSync } from './bank-match.js';

export async function plaidCall({ endpoint, idToken, fetchImpl = fetch, signal, ...payload }) {
  if (!FINDER_ENDPOINT_PATTERN.test(endpoint || '')) throw new Error('Connect your Google Sheet script first');
  const res = await fetchImpl(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ version: 2, action: 'plaid', idToken, payload }), signal, redirect: 'follow',
  });
  if (!res.ok) throw new Error(`The script did not answer (${res.status}).`);
  const data = await readScriptJson(res);
  if (!data.ok) throw new Error(data.error || 'The bank link failed. Try again.');
  return data;
}

/**
 * Every new page of one bank's transactions since `cursor`, applied to
 * `lines`. Returns {lines, cursor}. Stops after `maxPages` so one call stays
 * short; the cursor it returns picks up from there next time.
 */
export async function syncBank({ endpoint, idToken, item, cursor = '', lines = [], maxPages = 20, fetchImpl, signal }) {
  let next = cursor, held = lines;
  for (let page = 0; page < maxPages; page++) {
    const data = await plaidCall({ endpoint, idToken, fetchImpl, signal, op: 'sync', itemId: item.itemId, cursor: next });
    held = applyPlaidSync(held, data, item.institution);
    next = data.nextCursor || next;
    if (!data.hasMore) return { lines: held, cursor: next, done: true };
  }
  return { lines: held, cursor: next, done: false };
}

// Plaid Link must come from Plaid's own address; it is loaded only when the
// publisher presses Connect, never with the app.
const PLAID_LINK_SRC = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
let linkScript = null;
export function loadPlaidLink(doc = document) {
  if (globalThis.Plaid?.create) return Promise.resolve(globalThis.Plaid);
  if (!linkScript) {
    linkScript = new Promise((resolve, reject) => {
      const tag = doc.createElement('script');
      tag.src = PLAID_LINK_SRC;
      tag.async = true;
      tag.onload = () => (globalThis.Plaid?.create ? resolve(globalThis.Plaid) : reject(new Error('Plaid did not load')));
      tag.onerror = () => { linkScript = null; reject(new Error('Could not reach Plaid. Check your connection and try again.')); };
      doc.head.appendChild(tag);
    });
  }
  return linkScript;
}

/** Open Plaid Link; resolves {publicToken, institution} or null if closed. */
export async function openPlaidLink(linkToken) {
  const Plaid = await loadPlaidLink();
  return new Promise((resolve, reject) => {
    let handler;
    try {
      handler = Plaid.create({
        token: linkToken,
        onSuccess: (publicToken, metadata) => { resolve({ publicToken, institution: metadata?.institution?.name || '' }); handler?.destroy?.(); },
        onExit: error => { handler?.destroy?.(); if (error && error.error_message) reject(new Error(error.error_message)); else resolve(null); },
      });
      handler.open();
    } catch (error) { reject(error); }
  });
}
