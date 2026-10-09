import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { isGasUrl, withGasToken, installGasAuth } from '../src/lib/gas-auth.js';

const URL_GAS = 'https://script.google.com/macros/s/ABC/exec';

describe('gas-auth fetch wrapper', () => {
  it('recognises Apps Script hosts only', () => {
    expect(isGasUrl(URL_GAS)).toBe(true);
    expect(isGasUrl('https://evil.example/?u=script.google.com')).toBe(false);
    expect(isGasUrl('http://script.google.com/macros/s/x/exec')).toBe(false);
  });

  it('adds idToken to GET actions but not the bare health check', () => {
    expect(withGasToken(URL_GAS + '?action=getBookData&book=X', undefined, 'T')[0]).toBe(URL_GAS + '?action=getBookData&book=X&idToken=T');
    expect(withGasToken(URL_GAS, undefined, 'T')[0]).toBe(URL_GAS);
  });

  it('adds a top-level idToken to POST bodies and keeps an existing one', () => {
    const body = JSON.stringify({ version: 2, action: 'batch', payload: { rows: [] } });
    const [, init] = withGasToken(URL_GAS, { method: 'POST', body }, 'T');
    expect(JSON.parse(init.body)).toMatchObject({ idToken: 'T', version: 2, action: 'batch' });
    const own = JSON.stringify({ version: 2, action: 'extractReceipt', idToken: 'MINE' });
    expect(JSON.parse(withGasToken(URL_GAS, { method: 'POST', body: own }, 'T')[1].body).idToken).toBe('MINE');
  });

  it('leaves other hosts and token-less calls alone', () => {
    expect(withGasToken('https://example.com/x?action=a', undefined, 'T')[0]).toBe('https://example.com/x?action=a');
    expect(withGasToken(URL_GAS + '?action=a', undefined, '')[0]).toBe(URL_GAS + '?action=a');
  });

  it('installGasAuth wraps fetch once and still sends when no token is available', async () => {
    const calls = [];
    const target = { fetch: vi.fn(async (u, i) => { calls.push([u, i]); return {}; }) };
    installGasAuth(async () => { throw new Error('offline'); }, target);
    installGasAuth(async () => 'T', target);
    await target.fetch(URL_GAS + '?action=getBookData');
    expect(calls[0][0]).toBe(URL_GAS + '?action=getBookData');
  });
});

describe('Code.gs caller authentication', () => {
  const gs = fs.readFileSync('apps-script/Code.gs', 'utf8');
  it('gates doGet actions and doPost on a verified publisher token', () => {
    expect(gs).toMatch(/function doGet\(e\) \{[\s\S]*?requirePublisher_\(e\.parameter\.idToken\)/);
    expect(gs).toMatch(/action === 'notifypublisher'\s*\? verifyFirebaseCaller_\(payload\.idToken\)\s*: requirePublisher_\(payload\.idToken\)/);
    expect(gs).toContain("const PUBLISHER_EMAIL = 'lyricalmyricalbooks@gmail.com'");
    expect(gs).toContain('users[0].emailVerified !== true');
  });
  it('keeps the public copy byte-identical', () => {
    expect(fs.readFileSync('public/gas-code.txt', 'utf8')).toBe(gs);
  });
});
