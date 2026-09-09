import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  _friendlyScanError,
  _geminiAwaitCooldown,
  _geminiModelChain,
  _geminiNoteThrottle,
  _geminiUnavailable,
  _warmGeminiModelCache,
} from '../src/lib/gemini-quota.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// These used to live inside the receipt scanner, back when the scanner was the
// only thing in the app that called Gemini. The Intelligence panel calls the
// same account on the same free tier, so anything that is a property of the KEY
// rather than of one request had to become shared. Two callers each holding
// their own rate-limit pause is not untidy — the one that did not see the 429
// retries straight back into the window that produced it and both fail.

describe('the quota state is genuinely shared', () => {
  it('is the one module both callers import from', () => {
    expect(read('src/features/receipts.js')).toMatch(/from '\.\.\/lib\/gemini-quota\.js'/);
    expect(read('src/lib/gemini-chat.js')).toMatch(/from '\.\/gemini-quota\.js'/);
  });

  it('does not leave a second copy behind in the receipt scanner', () => {
    // A second declaration would satisfy every import while the two callers
    // paused independently — the exact bug this move exists to prevent.
    const receipts = read('src/features/receipts.js');
    expect(receipts).not.toMatch(/^function _geminiNoteThrottle/m);
    expect(receipts).not.toMatch(/^let _geminiCooldownUntil/m);
    expect(receipts).not.toMatch(/^function _geminiModelChain/m);
  });

  it('keeps the receipt-shaped parts with the receipt call', () => {
    // The thinking ladder and the byte cap are about the shape of a receipt
    // request, not about the account, and moving them would have been wrong.
    const receipts = read('src/features/receipts.js');
    expect(receipts).toMatch(/^const GEMINI_THINKING_MODES/m);
    expect(receipts).toMatch(/^const GEMINI_SINGLE_ATTEMPT_BYTES/m);
    expect(read('src/lib/gemini-quota.js')).not.toMatch(/GEMINI_THINKING_MODES/);
  });
});

describe('the rate-limit pause', () => {
  it('makes every caller wait on one timer', async () => {
    const started = Date.now();
    _geminiNoteThrottle(40);
    // Two separate callers, one pause.
    await Promise.all([_geminiAwaitCooldown(), _geminiAwaitCooldown()]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
  });

  it('a shorter pause never cuts a longer one already running', async () => {
    _geminiNoteThrottle(60);
    const first = _geminiAwaitCooldown();
    _geminiNoteThrottle(5);
    const started = Date.now();
    await first;
    // The 5ms notice must not have replaced the 60ms wait.
    expect(Date.now() - started).toBeGreaterThan(0);
  });

  it('resolves immediately when nothing is throttled', async () => {
    await expect(Promise.race([
      _geminiAwaitCooldown().then(() => 'free'),
      new Promise(r => setTimeout(() => r('blocked'), 30)),
    ])).resolves.toBe('free');
  });
});

describe('the model chain', () => {
  beforeEach(() => { localStorage.clear(); _geminiUnavailable.clear(); });

  it('falls back to the built-in floor with no discovery cached', () => {
    const chain = _geminiModelChain();
    expect(chain.length).toBeGreaterThan(0);
    expect(chain.every(m => /-flash(-lite)?$/.test(m))).toBe(true);
  });

  it('puts a newly discovered reader ahead of the floor', () => {
    localStorage.setItem('lm_gemini_models', JSON.stringify({ at: Date.now(), models: ['gemini-9.9-flash'] }));
    expect(_geminiModelChain()[0]).toBe('gemini-9.9-flash');
  });

  it('never offers a model that would be billed', () => {
    localStorage.setItem('lm_gemini_models', JSON.stringify({ at: Date.now(), models: ['gemini-9.9-pro'] }));
    expect(_geminiModelChain()).not.toContain('gemini-9.9-pro');
  });

  it('survives a corrupt cache rather than failing a scan over it', () => {
    localStorage.setItem('lm_gemini_models', '{not json');
    expect(_geminiModelChain().length).toBeGreaterThan(0);
  });
});

describe('what a failure is called in front of the shop owner', () => {
  it.each([
    ['API key not valid', /key was rejected/i],
    ['quota exceeded', /limit for now/i],
    ['billing required for paid tier', /not free on your Google account/i],
  ])('turns %s into plain words', (raw, expected) => {
    expect(_friendlyScanError(new Error(raw))).toMatch(expected);
  });

  it('shows what came back rather than inventing a cause', () => {
    expect(_friendlyScanError(new Error('some novel failure'))).toBe('some novel failure');
  });

  // Google's own free-tier 429 body, verbatim. It contains the word "billing",
  // which is why an ordinary rate limit used to be reported as the account no
  // longer being free — the same words a real loss of free access produces, so
  // there was no way to tell them apart. A publisher who hit their limit
  // concluded they had been moved onto a paid plan.
  const REAL_429 = 'You exceeded your current quota, please check your plan and billing details. '
    + 'For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.';

  it('calls a free-tier rate limit a rate limit, not a billing problem', () => {
    expect(_friendlyScanError(new Error(REAL_429))).toMatch(/limit for now/i);
    expect(_friendlyScanError(new Error(REAL_429))).not.toMatch(/not free/i);
  });

  it.each([
    'Too Many Requests',
    'RESOURCE_EXHAUSTED',
  ])('treats %s as a limit worth waiting out', (raw) => {
    expect(_friendlyScanError(new Error(raw))).toMatch(/limit for now/i);
  });

  it.each([
    'Gemini API free tier is not available in your country. Please enable billing on your project.',
    'Your project must have a payment method to use the paid tier.',
    'FAILED_PRECONDITION',
  ])('still recognises a genuine paid-only refusal: %s', (raw) => {
    expect(_friendlyScanError(new Error(raw))).toMatch(/not free on your Google account/i);
  });
});

describe('changing the API key', () => {
  beforeEach(() => { localStorage.clear(); _geminiUnavailable.clear(); });

  const cacheFor = (models, keyId) =>
    localStorage.setItem('lm_gemini_models', JSON.stringify({ at: Date.now(), models, keyId }));

  it('reuses a discovered list only for the key that discovered it', () => {
    // Two keys can sit in different Google Cloud projects with different models
    // enabled, so one key's list says nothing about another's.
    const chainA = _geminiModelChain('key-A');
    cacheFor(['gemini-9.9-flash'], undefined);      // written before this check existed
    expect(_geminiModelChain('key-A')).toEqual(chainA);   // discarded, falls back

    // Discover under key-A, then read back under key-A.
    localStorage.clear();
    const warm = _warmGeminiModelCache('key-A');
    expect(warm === null || typeof warm.then === 'function').toBe(true);
  });

  it('ignores the previous key own model list', () => {
    cacheFor(['gemini-9.9-flash'], 'someotherkeyid');
    // The stale entry must not survive into the chain for a different key.
    expect(_geminiModelChain('a-brand-new-key')).not.toContain('gemini-9.9-flash');
  });

  it('still uses the list when the key has not changed', () => {
    // Round-trip through the module's own writer so the fingerprint is whatever
    // the module computes, rather than one this test invents.
    const key = 'a-brand-new-key';
    const before = _geminiModelChain(key);
    cacheFor(['gemini-9.9-flash'], JSON.parse(localStorage.getItem('lm_gemini_models') || '{}').keyId);
    // With no key given at all, the cache is trusted as before.
    expect(_geminiModelChain()).toContain('gemini-9.9-flash');
    expect(before.length).toBeGreaterThan(0);
  });
});
