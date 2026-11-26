// A time limit for one piece of network work that would otherwise be allowed
// to hang for ever. `run` gets its own AbortSignal, cancelled by the caller's
// signal or by the limit, whichever comes first. Running past the limit
// rejects with a plain Error carrying `timedOut: true`, never an AbortError,
// so callers that treat AbortError as "the person pressed Stop" still can.
//
// The race matters: work that ignores its signal still cannot hold the caller
// past the limit.

/**
 * @template T
 * @param {number} ms
 * @param {AbortSignal | undefined} signal
 * @param {string} message Shown when the limit is reached.
 * @param {(signal: AbortSignal) => Promise<T>} run
 * @returns {Promise<T>}
 */
export function withTimeLimit(ms, signal, message, run) {
  if (signal?.aborted) return Promise.reject(new DOMException('Stopped', 'AbortError'));
  const child = new AbortController();
  const forward = () => child.abort();
  signal?.addEventListener('abort', forward, { once: true });
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => {
      child.abort();
      reject(Object.assign(new Error(message), { timedOut: true }));
    }, ms);
  });
  let started;
  try { started = Promise.resolve(run(child.signal)); } catch (error) { started = Promise.reject(error); }
  const work = started.catch(error => {
    // An abort caused by the limit is reported as the limit, not as a Stop.
    if (child.signal.aborted && !signal?.aborted) throw Object.assign(new Error(message), { timedOut: true });
    throw error;
  });
  return Promise.race([work, limit]).finally(() => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forward);
  });
}
