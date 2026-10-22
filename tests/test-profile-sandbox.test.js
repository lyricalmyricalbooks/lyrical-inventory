import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  TEST_PROFILE_FLAG, isTestProfileActive, createNamespacedStorage, clearTestStorage,
  blockedHost, installNetworkGuard, installSandboxBackend, createSandboxBackend,
  SAMPLE_BOOK_ID, friendlyServiceName,
} from '../src/lib/test-profile.js';

function memoryStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    _map: m,
  };
}

describe('Test Profile flag', () => {
  it('is on only when the session flag says so', () => {
    expect(isTestProfileActive(memoryStorage())).toBe(false);
    expect(isTestProfileActive(memoryStorage({ [TEST_PROFILE_FLAG]: '1' }))).toBe(true);
    expect(isTestProfileActive(null)).toBe(false);
  });
});

describe('namespaced device storage', () => {
  it('never shows the test copy the real saved addresses or offline queue', () => {
    const real = memoryStorage({ 'lm-sheets-url': 'https://script.google.com/real', 'lm-sync-queue': '[{"real":1}]' });
    const test = createNamespacedStorage(real);
    expect(test.getItem('lm-sheets-url')).toBeNull();
    expect(test.getItem('lm-sync-queue')).toBeNull();
  });

  it('never overwrites a real key', () => {
    const real = memoryStorage({ 'lm-payment-links': 'REAL' });
    const test = createNamespacedStorage(real);
    test.setItem('lm-payment-links', 'SAMPLE');
    test.removeItem('lm-payment-links');
    test.setItem('lm-other', 'x');
    test.clear();
    expect(real.getItem('lm-payment-links')).toBe('REAL');
  });

  it('reads the night-mode preference through, but keeps its own change', () => {
    const real = memoryStorage({ 'lm-theme': 'dark' });
    const test = createNamespacedStorage(real);
    expect(test.getItem('lm-theme')).toBe('dark');
    test.setItem('lm-theme', 'light');
    expect(real.getItem('lm-theme')).toBe('dark');
    expect(test.getItem('lm-theme')).toBe('light');
  });

  it('lists only its own keys', () => {
    const real = memoryStorage({ real: '1' });
    const test = createNamespacedStorage(real);
    test.setItem('a', '1');
    expect(Object.keys(test)).toEqual(['a']);
    expect(test.length).toBe(1);
  });

  it('reset wipes the test copy and nothing else', () => {
    const real = memoryStorage({ real: '1' });
    createNamespacedStorage(real).setItem('a', '1');
    clearTestStorage(real);
    expect([...real._map.keys()]).toEqual(['real']);
  });
});

describe('network guard', () => {
  const origin = 'https://app.example';
  it('lets the app, sign-in and fonts through', () => {
    expect(blockedHost('/src/main.js', origin)).toBe('');
    expect(blockedHost('https://identitytoolkit.googleapis.com/v1/x', origin)).toBe('');
    expect(blockedHost('https://fonts.gstatic.com/x.woff2', origin)).toBe('');
    expect(blockedHost('data:,hi', origin)).toBe('');
  });

  it.each([
    'https://api.stripe.com/v1/payment_links',
    'https://api.goshippo.com/transactions',
    'https://api.canadapost-postescanada.ca/rs/x',
    'https://script.google.com/macros/s/abc/exec',
    'https://firestore.googleapis.com/google.firestore.v1.Firestore/Write',
    'https://lyricalmyrical-37c46-default-rtdb.firebaseio.com/.json',
    'https://api.bigcartel.com/v1/accounts',
    'https://generativelanguage.googleapis.com/v1/models',
  ])('blocks %s', (url) => {
    expect(blockedHost(url, origin)).not.toBe('');
  });

  it('fails a blocked fetch like a dropped connection, without calling out', async () => {
    const real = vi.fn(async () => 'sent');
    const target = { fetch: real, location: { origin } };
    const onBlocked = vi.fn();
    installNetworkGuard(target, onBlocked);
    await expect(target.fetch('https://api.stripe.com/v1/charges', { method: 'POST' })).rejects.toBeInstanceOf(TypeError);
    expect(real).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledWith('api.stripe.com');
    await expect(target.fetch('/version.json')).resolves.toBe('sent');
  });

  it('names services in plain words', () => {
    expect(friendlyServiceName('script.google.com')).toBe('your Google Sheet and emails');
    expect(friendlyServiceName('api.stripe.com')).toBe('Stripe');
  });
});

describe('sandbox cloud', () => {
  it('replaces every cloud function, including ones it has never heard of', async () => {
    const realSave = vi.fn();
    const realNew = vi.fn();
    const signIn = () => 'real sign-in';
    const target = {
      _fbSave: realSave, _fbSomethingAddedLater: realNew, _fbWatchSomethingNew: vi.fn(),
      _fbSignInWithGoogle: signIn, _fbAuth: { real: true },
    };
    installSandboxBackend(target, memoryStorage());
    await target._fbSave('b', '{}');
    await target._fbSomethingAddedLater('x');
    expect(realSave).not.toHaveBeenCalled();
    expect(realNew).not.toHaveBeenCalled();
    expect(typeof target._fbWatchSomethingNew(() => {})).toBe('function');
    expect(target._fbSignInWithGoogle).toBe(signIn);
    expect(target._fbAuth).toEqual({ real: true });
  });

  it('starts from the sample catalogue and keeps what is saved on the device', async () => {
    const store = createNamespacedStorage(memoryStorage());
    const b = createSandboxBackend(store);
    const catalog = await b._fbLoadCatalog();
    expect(Object.keys(catalog)).toEqual([SAMPLE_BOOK_ID]);
    expect(catalog[SAMPLE_BOOK_ID].isTest).toBeUndefined();
    expect(await b._fbLoad(SAMPLE_BOOK_ID)).toBeNull();
    expect(await b._fbSave(SAMPLE_BOOK_ID, '{"stock":3}')).toEqual({ ok: true, merged: false });
    expect(await b._fbLoad(SAMPLE_BOOK_ID)).toBe('{"stock":3}');
    expect(await b._fbSaveSettings('taxCenter', { a: 1 })).toBe(true);
    expect(await b._fbLoadSettings('taxCenter')).toEqual({ a: 1 });
    expect(await b._fbLoadSettings('notifyEndpoint')).toBeNull();
  });
});

describe('wiring', () => {
  const root = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const firebase = fs.readFileSync(path.join(root, 'src/firebase.js'), 'utf8');

  it('isolates before anything else in the app runs', () => {
    const firstImport = main.split('\n').find(l => l.startsWith('import '));
    expect(firstImport).toContain('./test-profile-boot.js');
  });

  it('swaps the cloud functions after they are all defined', () => {
    const install = firebase.indexOf('installSandboxBackend(window');
    const lastDef = firebase.lastIndexOf('window._fb');
    expect(install).toBeGreaterThan(0);
    expect(firebase.indexOf('window._fbReady = true')).toBeGreaterThan(install);
    // Nothing defined after the swap would escape it.
    expect(lastDef).toBeLessThan(firebase.indexOf('window._fbReady = true') + 1);
  });

  it('keeps sample backups out of the real backup folder', () => {
    expect(main).toMatch(/TEST_PROFILE_ACTIVE \? false : await writeBackupToChosenFolder/);
  });
});
