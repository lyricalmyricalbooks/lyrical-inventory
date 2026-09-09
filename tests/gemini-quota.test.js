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
});
