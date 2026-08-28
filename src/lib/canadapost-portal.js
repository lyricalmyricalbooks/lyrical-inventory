/**
 * Canada Post Developer Portal — OAuth 2.0 client-credentials layer.
 *
 * Canada Post runs two developer systems (see classifyCanadaPostKeyKind in
 * canadapost.js). This module covers the newer one:
 *
 *   - Credentials are an app Key and Secret, each a 32-character hex string,
 *     issued by the Developer Portal's "App credentials" flow.
 *   - They are exchanged for a short-lived Bearer token at the portal's OAuth
 *     token endpoint, using grant_type=client_credentials.
 *   - The token is then sent as `Authorization: Bearer …` to the portal's API
 *     host, which is a different host from the legacy soa-gw gateway and does
 *     not accept these credentials under HTTP Basic.
 *
 * This file deliberately covers ONLY the token exchange. The portal's rating,
 * shipment and tracking request shapes are not implemented here: they differ
 * from the legacy rate-v4 XML this app speaks, and guessing them would produce
 * code that looks finished and fails in production. Getting a token working
 * first is independently verifiable — it proves the publisher's credentials
 * are valid and shows which scopes the account actually holds — and it is the
 * foundation every later call needs.
 */

import { getSavedSheetsUrl, sanitizeCanadaPostCredential } from './canadapost.js';

export const CANADAPOST_PORTAL_HOST = 'api.canadapost-postescanada.ca';

export const CANADAPOST_PORTAL_TOKEN_URL =
  'https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs' +
  '/cpc-api-native-oauth-provider/oauth2/token';

/** Scopes worth trying when the publisher has not named one. */
export const CANADAPOST_PORTAL_DEFAULT_SCOPES = ['merchant'];

/**
 * Tokens are short-lived and every call needs one, so a fresh exchange per
 * request would triple the latency of a rate quote. Cache per credential, and
 * treat a token as expired early so a call never sets off with one that dies
 * in flight.
 */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
const _tokenCache = new Map();

function cacheKey(clientId, scope) {
  return `${clientId}::${scope || ''}`;
}

/** Drop every cached token. Used when credentials change, and by tests. */
export function clearCanadaPostPortalTokenCache() {
  _tokenCache.clear();
}

export function readCachedPortalToken(clientId, scope, now = Date.now()) {
  const hit = _tokenCache.get(cacheKey(clientId, scope));
  if (!hit) return null;
  if (hit.expiresAt - TOKEN_EXPIRY_MARGIN_MS <= now) {
    _tokenCache.delete(cacheKey(clientId, scope));
    return null;
  }
  return hit;
}

function cachePortalToken(clientId, scope, token, expiresInSeconds, now = Date.now()) {
  const ttl = Number(expiresInSeconds);
  const entry = {
    accessToken: token,
    scope: scope || '',
    // A response with no usable expires_in is treated as very short-lived
    // rather than eternal: a stale token produces a 401 on a real shipment.
    expiresAt: now + (Number.isFinite(ttl) && ttl > 0 ? ttl * 1000 : 60_000)
  };
  _tokenCache.set(cacheKey(clientId, scope), entry);
  return entry;
}

/**
 * Build the token request. Canada Post accepts the client credentials both in
 * the Basic header and in the form body; sending both is what their own
 * examples do and costs nothing.
 */
export function buildPortalTokenRequest({ clientId, clientSecret, scope = '' }) {
  const id = sanitizeCanadaPostCredential(clientId).value;
  const secret = sanitizeCanadaPostCredential(clientSecret).value;
  const params = [
    'grant_type=client_credentials',
    `client_id=${encodeURIComponent(id)}`,
    `client_secret=${encodeURIComponent(secret)}`
  ];
  if (scope) params.push(`scope=${encodeURIComponent(scope)}`);

  return {
    url: CANADAPOST_PORTAL_TOKEN_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: params.join('&'),
    basicAuth: `${id}:${secret}`
  };
}

/**
 * Turn an OAuth error response into something a shop owner can act on.
 * The portal's own wording ("invalid_client") says nothing about which of the
 * two or three real causes applies.
 */
export function describePortalTokenFailure({ status = 0, error = '', description = '' } = {}) {
  const code = String(error || '').toLowerCase();
  const detail = String(description || '').trim();

  if (code === 'invalid_client' || status === 401) {
    return 'Canada Post did not recognise this Key and Secret. Check both were copied from the same ' +
      'app in the Developer Portal, and that the Secret is the one shown when the app was created — ' +
      'it is displayed only once, and a new one has to be generated if it was not saved.';
  }
  if (code === 'invalid_scope') {
    return 'These credentials are valid, but the app is not subscribed to the service this request needs. ' +
      'Open the app in the Canada Post Developer Portal and add the rating and shipping products to it.';
  }
  if (code === 'unauthorized_client' || status === 403) {
    return 'These credentials are valid but not permitted to request a token this way. ' +
      'Check the app in the Developer Portal is enabled and its products are approved.';
  }
  if (status >= 500) {
    return `Canada Post's sign-in service returned an error (HTTP ${status}). This is on their side; try again shortly.`;
  }
  if (detail) return `Canada Post rejected the sign-in: ${detail}`;
  if (code) return `Canada Post rejected the sign-in: ${code}`;
  return status
    ? `Canada Post's sign-in service returned HTTP ${status}.`
    : 'Canada Post\'s sign-in service could not be reached.';
}

/**
 * Ask the Google Apps Script relay to perform the token exchange.
 *
 * The browser cannot call the token endpoint directly — it is cross-origin and
 * Canada Post sends no CORS headers — and the client secret must not be put in
 * a URL, so the relay is the only route. Requires the deployed script to be
 * v32 or newer, which is where the 'cptoken' action was added.
 */
async function exchangeViaAppsScript({ clientId, clientSecret, scope, sheetsUrl, fetchImpl }) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) throw new Error('No fetch implementation available.');

  const resp = await doFetch(sheetsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      version: 2,
      action: 'cptoken',
      payload: { clientId, clientSecret, scope }
    })
  });

  let text = '';
  try {
    text = await resp.text();
  } catch (_) {
    throw new Error('Your Google Sheet connection did not return a readable response.');
  }

  let json = null;
  try {
    json = JSON.parse(String(text || '').trim());
  } catch (_) {
    throw new Error(
      'Your Google Sheet connection answered with a web page instead of data. ' +
      'Open Settings, copy the latest script, and redeploy it — the token step needs script version v32 or newer.'
    );
  }

  if (json && json.error) throw new Error(String(json.error));
  if (!json || typeof json !== 'object') {
    throw new Error('Your Google Sheet connection returned an unexpected response.');
  }

  // A script older than v32 does not know this action at all: it falls through
  // to the row-sync path and answers {ok:true} with none of a token response's
  // fields. Recognise that shape rather than reporting it as a rejected key,
  // which would send the publisher off to regenerate perfectly good credentials.
  const looksLikeTokenResponse =
    'access_token' in json || 'error_code' in json || 'error_description' in json || 'status' in json;
  if (!looksLikeTokenResponse) {
    throw new Error(
      'Your Google Sheet script is too old to sign in to the Canada Post Developer Portal. ' +
      'Open Settings, copy the latest script, and redeploy it (version v32 or newer).'
    );
  }
  return json;
}

/**
 * Obtain a Bearer token for the portal APIs, using a cached one when it is
 * still comfortably valid.
 *
 * Returns { accessToken, scope, expiresAt, cached }.
 */
export async function getCanadaPostPortalToken({
  clientId = '',
  clientSecret = '',
  scope = CANADAPOST_PORTAL_DEFAULT_SCOPES[0],
  sheetsUrl = '',
  fetchImpl = null,
  now = Date.now(),
  forceRefresh = false
} = {}) {
  const id = sanitizeCanadaPostCredential(clientId).value;
  const secret = sanitizeCanadaPostCredential(clientSecret).value;
  if (!id || !secret) {
    throw new Error('A Canada Post Developer Portal Key and Secret are both required.');
  }

  if (!forceRefresh) {
    const cached = readCachedPortalToken(id, scope, now);
    if (cached) return { ...cached, cached: true };
  }

  const relay = sheetsUrl || getSavedSheetsUrl();
  if (!relay || relay.includes('mock-test')) {
    throw new Error(
      'Connect your Google Sheet in Settings first. Canada Post does not allow the browser to sign in ' +
      'directly, so the request has to be routed through it.'
    );
  }

  const json = await exchangeViaAppsScript({
    clientId: id,
    clientSecret: secret,
    scope,
    sheetsUrl: relay,
    fetchImpl
  });

  if (json.access_token) {
    const entry = cachePortalToken(id, scope, json.access_token, json.expires_in, now);
    return { ...entry, cached: false };
  }

  throw new Error(describePortalTokenFailure({
    status: Number(json.status || 0),
    error: json.error_code || json.error || '',
    description: json.error_description || ''
  }));
}

/**
 * Check a Developer Portal Key and Secret without needing any of the portal's
 * data APIs. A token comes back or it does not, and either answer is useful.
 *
 * When no scope is given, the known scopes are tried in turn so an app
 * subscribed under a different one is not reported as broken.
 */
export async function testCanadaPostPortalCredentials({
  clientId = '',
  clientSecret = '',
  scopes = null,
  sheetsUrl = '',
  fetchImpl = null,
  now = Date.now()
} = {}) {
  const candidates = Array.isArray(scopes) && scopes.length
    ? scopes
    : [...CANADAPOST_PORTAL_DEFAULT_SCOPES, ''];

  const attempts = [];
  for (const scope of candidates) {
    try {
      const token = await getCanadaPostPortalToken({
        clientId,
        clientSecret,
        scope,
        sheetsUrl,
        fetchImpl,
        now,
        forceRefresh: true
      });
      attempts.push({ scope, ok: true, error: '' });
      return {
        ok: true,
        scope,
        expiresAt: token.expiresAt,
        headline: `Your Canada Post Developer Portal credentials are valid${scope ? ` (scope "${scope}")` : ''}.`,
        steps: [],
        attempts
      };
    } catch (err) {
      attempts.push({ scope, ok: false, error: String((err && err.message) || err) });
    }
  }

  const first = attempts[0] || { error: 'Sign-in failed.' };
  return {
    ok: false,
    scope: '',
    headline: 'Canada Post would not issue a token for these credentials.',
    steps: [first.error],
    attempts
  };
}
