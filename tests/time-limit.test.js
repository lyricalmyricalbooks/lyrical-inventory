import { describe, it, expect, vi } from 'vitest';
import { withTimeLimit } from '../src/lib/time-limit.js';

describe('withTimeLimit', () => {
  it('passes a result through', async () => {
    await expect(withTimeLimit(1000, undefined, 'slow', async () => 5)).resolves.toBe(5);
  });
  it('gives up on work that never answers, even work that ignores its signal', async () => {
    vi.useFakeTimers();
    const pending = withTimeLimit(1000, undefined, 'too slow', () => new Promise(() => {}));
    const check = expect(pending).rejects.toMatchObject({ message: 'too slow', timedOut: true });
    await vi.advanceTimersByTimeAsync(1001);
    await check;
    vi.useRealTimers();
  });
  it('cancels the work it limits, and reports the limit rather than a Stop', async () => {
    vi.useFakeTimers();
    let seen;
    const pending = withTimeLimit(500, undefined, 'too slow', signal => new Promise((_, reject) => {
      seen = signal; signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
    }));
    const check = expect(pending).rejects.toMatchObject({ timedOut: true });
    await vi.advanceTimersByTimeAsync(501);
    await check;
    expect(seen.aborted).toBe(true);
    vi.useRealTimers();
  });
  it('a Stop from the caller stays a Stop', async () => {
    const stop = new AbortController();
    const pending = withTimeLimit(10000, stop.signal, 'too slow', signal => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
    }));
    stop.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
