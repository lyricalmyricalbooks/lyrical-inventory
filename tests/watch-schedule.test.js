// The one scheduler every unattended check now runs through. These gates encode
// a promise about what the app does with someone's battery, mobile data and API
// quota while they are not looking, so they are tested directly rather than
// only through the three watches that use them.
import { describe, expect, it, vi } from 'vitest';
import {
  browserWatchState,
  dueForCheck,
  effectiveInterval,
  startWatch,
} from '../src/lib/watch-schedule.js';
import { dueForRefresh } from '../src/lib/order-watch.js';
import { dueForShippoCheck } from '../src/lib/shippo-watch.js';

describe('whether a check is worth making', () => {
  const base = {
    lastCheckedAt: 0, now: 60_000, intervalMs: 30_000,
    online: true, configured: true, visible: true, busy: false,
  };

  it('asks once the last answer has gone stale', () => {
    expect(dueForCheck(base)).toBe(true);
  });

  it('leaves a fresh answer alone', () => {
    expect(dueForCheck({ ...base, lastCheckedAt: 45_000 })).toBe(false);
    // Exactly on the boundary counts as due, not as fresh.
    expect(dueForCheck({ ...base, lastCheckedAt: 30_000 })).toBe(true);
  });

  it('does not spend mobile data while nobody is looking', () => {
    expect(dueForCheck({ ...base, visible: false })).toBe(false);
  });

  it('does not try while offline, unconfigured, or already running', () => {
    expect(dueForCheck({ ...base, online: false })).toBe(false);
    expect(dueForCheck({ ...base, configured: false })).toBe(false);
    expect(dueForCheck({ ...base, busy: true })).toBe(false);
  });

  it('never fires without an interval', () => {
    expect(dueForCheck({ ...base, intervalMs: 0 })).toBe(false);
    expect(dueForCheck({ ...base, intervalMs: -1 })).toBe(false);
    expect(dueForCheck()).toBe(false);
  });

  it('treats a missing last-checked stamp as never checked', () => {
    expect(dueForCheck({ ...base, lastCheckedAt: null })).toBe(true);
    expect(dueForCheck({ ...base, lastCheckedAt: 'nonsense' })).toBe(true);
  });
});

describe('the two watch names are one implementation', () => {
  it('the storefront and Shippo gates are the shared one', () => {
    // They were byte-identical copies. Keeping both names is fine — each reads
    // correctly at its own call site — but there must only be one behaviour,
    // or a change to what the app promises lands in one of them and not both.
    expect(dueForRefresh).toBe(dueForCheck);
    expect(dueForShippoCheck).toBe(dueForCheck);
  });
});

describe('slowing a check that keeps failing', () => {
  it('takes whichever wait is longer', () => {
    expect(effectiveInterval(5000, 0)).toBe(5000);
    expect(effectiveInterval(5000, 40_000)).toBe(40_000);
  });

  it('a backoff can only ever slow a watch, never speed it up', () => {
    expect(effectiveInterval(5000, 100)).toBe(5000);
  });

  it('survives junk', () => {
    expect(effectiveInterval(null, null)).toBe(0);
    expect(effectiveInterval(5000, 'nonsense')).toBe(5000);
    expect(effectiveInterval(-100, -100)).toBe(0);
  });
});

describe('the three moments worth re-checking', () => {
  function fakeEnv({ visibility = 'visible' } = {}) {
    const listeners = {};
    const win = {
      setInterval: vi.fn(() => 42),
      clearInterval: vi.fn(),
      addEventListener: vi.fn((name, fn) => { listeners[name] = fn; }),
      removeEventListener: vi.fn(),
    };
    const doc = {
      visibilityState: visibility,
      addEventListener: vi.fn((name, fn) => { listeners[name] = fn; }),
      removeEventListener: vi.fn(),
    };
    return { win, doc, listeners };
  }

  it('arms a timer, a return-to-app listener and a reconnect listener', () => {
    const { win, doc } = fakeEnv();
    const poll = vi.fn();
    startWatch(poll, { intervalMs: 1000, win, doc });

    expect(win.setInterval).toHaveBeenCalledWith(poll, 1000);
    expect(doc.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(win.addEventListener).toHaveBeenCalledWith('online', poll);
  });

  it('checks straight away, so an app opening on a stale answer does not sit on it', () => {
    const { win, doc } = fakeEnv();
    const poll = vi.fn();
    startWatch(poll, { intervalMs: 1000, win, doc });
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('can be told not to check immediately', () => {
    const { win, doc } = fakeEnv();
    const poll = vi.fn();
    startWatch(poll, { intervalMs: 1000, win, doc, immediate: false });
    expect(poll).not.toHaveBeenCalled();
  });

  it('checks when the app is returned to, and not when it is left', () => {
    const { win, doc, listeners } = fakeEnv();
    const poll = vi.fn();
    startWatch(poll, { intervalMs: 1000, win, doc, immediate: false });

    doc.visibilityState = 'hidden';
    listeners.visibilitychange();
    expect(poll).not.toHaveBeenCalled();

    doc.visibilityState = 'visible';
    listeners.visibilitychange();
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('hands back a way to stop everything it armed', () => {
    const { win, doc } = fakeEnv();
    const stop = startWatch(vi.fn(), { intervalMs: 1000, win, doc });
    stop();
    expect(win.clearInterval).toHaveBeenCalledWith(42);
    expect(doc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(win.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
  });

  it('arms nothing at all without a window, a poll or an interval', () => {
    const { win, doc } = fakeEnv();
    expect(startWatch(null, { intervalMs: 1000, win, doc })).toBeInstanceOf(Function);
    expect(startWatch(vi.fn(), { intervalMs: 0, win, doc })).toBeInstanceOf(Function);
    expect(startWatch(vi.fn(), { intervalMs: 1000, win: null, doc })).toBeInstanceOf(Function);
    expect(win.setInterval).not.toHaveBeenCalled();
  });
});

describe('reading the browser for the gates', () => {
  it('reports what it was given', () => {
    expect(browserWatchState({
      win: {}, doc: { visibilityState: 'hidden' }, nav: { onLine: false },
    })).toMatchObject({ online: false, visible: false, hasWindow: true });
  });

  it('assumes the best where the browser says nothing', () => {
    // Missing navigator or document is a test harness or an old engine, not a
    // statement that the app is offline.
    expect(browserWatchState({ win: {}, doc: null, nav: null }))
      .toMatchObject({ online: true, visible: true });
  });

  it('treats any visibility other than hidden as visible', () => {
    expect(browserWatchState({ win: {}, doc: { visibilityState: 'prerender' }, nav: {} }).visible).toBe(true);
  });
});
