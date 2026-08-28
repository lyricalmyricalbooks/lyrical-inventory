import { describe, it, expect, beforeEach, vi } from 'vitest';

const SHEET = 'https://script.google.com/macros/s/real/exec';
const CLIENT_ID = 'd1d36298650efe474806c94f75cfb04a';
const CLIENT_SECRET = '3648447ed034f611b57de8b745423f79';

const relay = (payload, status = 200) => vi.fn(async () => ({
  ok: status < 400,
  status,
  text: async () => JSON.stringify(payload)
}));

describe('Canada Post Developer Portal token request', () => {
  beforeEach(async () => {
    const { clearCanadaPostPortalTokenCache } = await import('../src/lib/canadapost-portal.js');
    clearCanadaPostPortalTokenCache();
  });

  it('builds a client-credentials request with the secret in the body, never a URL', async () => {
    const { buildPortalTokenRequest, CANADAPOST_PORTAL_TOKEN_URL } =
      await import('../src/lib/canadapost-portal.js');
    const req = buildPortalTokenRequest({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, scope: 'merchant' });

    expect(req.url).toBe(CANADAPOST_PORTAL_TOKEN_URL);
    expect(req.url).not.toContain(CLIENT_SECRET);
    expect(req.body).toContain('grant_type=client_credentials');
    expect(req.body).toContain(`client_id=${CLIENT_ID}`);
    expect(req.body).toContain('scope=merchant');
    expect(req.method).toBe('POST');
  });

  it('strips hidden characters out of a pasted key before signing in', async () => {
    const { buildPortalTokenRequest } = await import('../src/lib/canadapost-portal.js');
    const req = buildPortalTokenRequest({ clientId: ` ${CLIENT_ID}​ `, clientSecret: CLIENT_SECRET });
    expect(req.body).toContain(`client_id=${CLIENT_ID}`);
    expect(req.basicAuth.startsWith(`${CLIENT_ID}:`)).toBe(true);
  });

  it('returns a token and reuses it while it is still valid', async () => {
    const { getCanadaPostPortalToken } = await import('../src/lib/canadapost-portal.js');
    const fetchImpl = relay({ ok: true, status: 200, access_token: 'tok-abc', expires_in: 3600, scope: 'merchant' });

    const first = await getCanadaPostPortalToken({
      clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, sheetsUrl: SHEET, fetchImpl
    });
    expect(first.accessToken).toBe('tok-abc');
    expect(first.cached).toBe(false);

    const second = await getCanadaPostPortalToken({
      clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, sheetsUrl: SHEET, fetchImpl
    });
    expect(second.cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not hand back a token that expires mid-flight', async () => {
    const { getCanadaPostPortalToken, readCachedPortalToken } =
      await import('../src/lib/canadapost-portal.js');
    const fetchImpl = relay({ access_token: 'tok-short', expires_in: 30 });

    const t0 = 1_000_000;
    await getCanadaPostPortalToken({
      clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, sheetsUrl: SHEET, fetchImpl, now: t0
    });
    // 30s of life is inside the safety margin, so it must not be reused.
    expect(readCachedPortalToken(CLIENT_ID, 'merchant', t0)).toBeNull();
  });

  it('treats a response with no expiry as short-lived rather than eternal', async () => {
    const { getCanadaPostPortalToken, readCachedPortalToken } =
      await import('../src/lib/canadapost-portal.js');
    const fetchImpl = relay({ access_token: 'tok-noexp' });
    const t0 = 2_000_000;
    await getCanadaPostPortalToken({
      clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, sheetsUrl: SHEET, fetchImpl, now: t0
    });
    expect(readCachedPortalToken(CLIENT_ID, 'merchant', t0 + 120_000)).toBeNull();
  });

  it('explains a rejected key instead of repeating "invalid_client"', async () => {
    const { describePortalTokenFailure } = await import('../src/lib/canadapost-portal.js');
    expect(describePortalTokenFailure({ status: 401, error: 'invalid_client' })).toMatch(/displayed only once|copied from the same app/i);
    expect(describePortalTokenFailure({ error: 'invalid_scope' })).toMatch(/not subscribed/i);
    expect(describePortalTokenFailure({ status: 503 })).toMatch(/their side/i);
  });

  it('says the script is out of date rather than blaming the credentials', async () => {
    const { getCanadaPostPortalToken } = await import('../src/lib/canadapost-portal.js');
    // A pre-v32 deployment does not know the action and falls through to the
    // row-sync path, answering {ok:true} with no token fields at all.
    const fetchImpl = relay({ ok: true, count: 0, added: 0 });

    await expect(getCanadaPostPortalToken({
      clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, sheetsUrl: SHEET, fetchImpl
    })).rejects.toThrow(/too old|v32/i);
  });

  it('names a relay that answers with a web page', async () => {
    const { getCanadaPostPortalToken } = await import('../src/lib/canadapost-portal.js');
    const fetchImpl = vi.fn(async () => ({
      ok: true, status: 200, text: async () => '<!doctype html><html>Sign in</html>'
    }));

    await expect(getCanadaPostPortalToken({
      clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, sheetsUrl: SHEET, fetchImpl
    })).rejects.toThrow(/web page instead of data/i);
  });

  it('refuses to sign in with no sheet to route through', async () => {
    const { getCanadaPostPortalToken } = await import('../src/lib/canadapost-portal.js');
    await expect(getCanadaPostPortalToken({
      clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, sheetsUrl: '', fetchImpl: vi.fn()
    })).rejects.toThrow(/Connect your Google Sheet/i);
  });

  it('requires both halves of the credential', async () => {
    const { getCanadaPostPortalToken } = await import('../src/lib/canadapost-portal.js');
    await expect(getCanadaPostPortalToken({
      clientId: CLIENT_ID, clientSecret: '', sheetsUrl: SHEET, fetchImpl: vi.fn()
    })).rejects.toThrow(/Key and Secret/i);
  });
});

describe('Checking Developer Portal credentials', () => {
  beforeEach(async () => {
    const { clearCanadaPostPortalTokenCache } = await import('../src/lib/canadapost-portal.js');
    clearCanadaPostPortalTokenCache();
  });

  it('reports valid credentials and the scope that worked', async () => {
    const { testCanadaPostPortalCredentials } = await import('../src/lib/canadapost-portal.js');
    const fetchImpl = relay({ access_token: 'tok', expires_in: 3600 });

    const result = await testCanadaPostPortalCredentials({
      clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, sheetsUrl: SHEET, fetchImpl
    });
    expect(result.ok).toBe(true);
    expect(result.scope).toBe('merchant');
  });

  it('tries a second scope before declaring the credentials bad', async () => {
    const { testCanadaPostPortalCredentials } = await import('../src/lib/canadapost-portal.js');
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      const payload = call === 1
        ? { ok: false, status: 400, error_code: 'invalid_scope' }
        : { access_token: 'tok', expires_in: 3600 };
      return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
    });

    const result = await testCanadaPostPortalCredentials({
      clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, sheetsUrl: SHEET, fetchImpl
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toHaveLength(2);
  });

  it('reports a genuinely rejected credential', async () => {
    const { testCanadaPostPortalCredentials } = await import('../src/lib/canadapost-portal.js');
    const fetchImpl = relay({ ok: false, status: 401, error_code: 'invalid_client' });

    const result = await testCanadaPostPortalCredentials({
      clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, sheetsUrl: SHEET, fetchImpl
    });
    expect(result.ok).toBe(false);
    expect(result.steps.join(' ')).toMatch(/displayed only once|copied from the same app/i);
  });
});
