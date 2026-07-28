import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withViewTransition, prefersReducedMotion, setTransitionName } from '../src/lib/motion.js';

/** Installs a matchMedia stub reporting the given reduced-motion preference. */
function setReducedMotion(reduce) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduce });
}

afterEach(() => {
  delete document.startViewTransition;
  delete window.matchMedia;
  vi.restoreAllMocks();
});

describe('prefersReducedMotion', () => {
  it('reflects the media query, and is false when matchMedia is unavailable', () => {
    setReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    setReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
    delete window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('withViewTransition', () => {
  it('runs the update directly when the API is unsupported', () => {
    setReducedMotion(false);
    const update = vi.fn();
    withViewTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('runs the update directly when reduced motion is requested, without starting a transition', () => {
    setReducedMotion(true);
    const start = vi.fn();
    document.startViewTransition = start;

    const update = vi.fn();
    withViewTransition(update);

    expect(update).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it('delegates to startViewTransition when supported and motion is allowed', () => {
    setReducedMotion(false);
    const start = vi.fn((fn) => { fn(); return { finished: Promise.resolve() }; });
    document.startViewTransition = start;

    const update = vi.fn();
    withViewTransition(update);

    expect(start).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('still applies the update when startViewTransition throws', () => {
    setReducedMotion(false);
    document.startViewTransition = vi.fn(() => { throw new Error('transition already active'); });

    const update = vi.fn();
    expect(() => withViewTransition(update)).not.toThrow();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for a non-function argument', () => {
    setReducedMotion(false);
    expect(() => withViewTransition(undefined)).not.toThrow();
  });
});

describe('setTransitionName', () => {
  it('sets and clears viewTransitionName, tolerating null elements', () => {
    const el = document.createElement('div');
    setTransitionName(el, 'row-1');
    expect(el.style.viewTransitionName).toBe('row-1');
    setTransitionName(el, null);
    expect(el.style.viewTransitionName).toBe('');
    expect(() => setTransitionName(null, 'x')).not.toThrow();
  });
});

describe('wiring policy (PR #128 shipped View Transitions, PR #129 reverted them)', () => {
  const mainJs = readFileSync(join(import.meta.dirname, '..', 'src', 'main.js'), 'utf8');
  // Comments deliberately mention the helper by name to explain why it is not
  // used, so they must be stripped before asserting on real call sites.
  const code = mainJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('main.js does not import the motion helper', () => {
    expect(code).not.toMatch(/from\s+['"]\.\/lib\/motion\.js['"]/);
  });

  it('main.js does not call withViewTransition — the helper stays opt-in', () => {
    expect(code).not.toMatch(/withViewTransition\s*\(/);
  });
});
