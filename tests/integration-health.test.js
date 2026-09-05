import { describe, expect, it } from 'vitest';
import {
  TRANSIENT_ALARM_THRESHOLD,
  classifyIntegrationFailure,
  describeIntegrationHealth,
  describeIntegrationRecovery,
  emptyHealthState,
  healthBackoffMs,
  justRecovered,
  recordFailure,
  recordSuccess,
  shouldAnnounceFailure,
} from '../src/lib/integration-health.js';

const err = (message, status) => Object.assign(new Error(message), status === undefined ? {} : { status });

/** Fail `n` times in a row, as the watch would. */
const failTimes = (n, error) => {
  let state = emptyHealthState();
  for (let i = 0; i < n; i++) state = recordFailure(state, { at: 1000 * (i + 1), error });
  return state;
};

describe('telling a refused key from a bad connection', () => {
  it('reads a rejected credential as permanent', () => {
    expect(classifyIntegrationFailure({ status: 401 })).toMatchObject({ category: 'auth', permanent: true });
    expect(classifyIntegrationFailure({ status: 403 })).toMatchObject({ category: 'auth', permanent: true });
  });

  it('reads the browser’s own offline rejection as a network fault', () => {
    // A genuine offline failure arrives untyped, as a TypeError with no status.
    expect(classifyIntegrationFailure({ message: 'Failed to fetch' }).category).toBe('network');
    expect(classifyIntegrationFailure({ message: 'NetworkError when attempting to fetch resource.' }).category).toBe('network');
    expect(classifyIntegrationFailure({ status: 0 }).category).toBe('network');
    expect(classifyIntegrationFailure({}).category).toBe('network');
  });

  it('reads a rate limit and a server fault as their own kinds', () => {
    expect(classifyIntegrationFailure({ status: 429 }).category).toBe('throttled');
    expect(classifyIntegrationFailure({ status: 500 }).category).toBe('server');
    expect(classifyIntegrationFailure({ status: 503 }).category).toBe('server');
  });

  it('does not call anything but a refused credential permanent', () => {
    expect(classifyIntegrationFailure({ status: 429 }).permanent).toBe(false);
    expect(classifyIntegrationFailure({ status: 500 }).permanent).toBe(false);
    expect(classifyIntegrationFailure({ status: 0 }).permanent).toBe(false);
    expect(classifyIntegrationFailure({ status: 418 }).permanent).toBe(false);
  });

  it('falls back to unknown for a status it has no rule for', () => {
    expect(classifyIntegrationFailure({ status: 418, message: 'teapot' }).category).toBe('unknown');
  });
});

describe('keeping the record', () => {
  it('counts consecutive failures', () => {
    const state = failTimes(3, err('boom', 500));
    expect(state).toMatchObject({ attempts: 3, category: 'server', status: 500, lastError: 'boom' });
  });

  it('a success wipes the slate', () => {
    const state = recordSuccess(failTimes(4, err('boom', 500)), { at: 9000 });
    expect(state.attempts).toBe(0);
    expect(state.category).toBe('');
    expect(state.succeededAt).toBe(9000);
  });

  it('remembers a fault was announced, so it is not announced again', () => {
    // Without this the card would reappear on every failed check.
    let state = failTimes(1, err('nope', 401));
    state = { ...state, announced: true };
    state = recordFailure(state, { error: err('nope', 401) });
    expect(state.announced).toBe(true);
  });

  it('reports a recovery once, and only when someone was told', () => {
    const announced = recordSuccess({ ...failTimes(1, err('nope', 401)), announced: true });
    expect(justRecovered(announced)).toBe(true);
    // A fault nobody heard about needs no all-clear.
    expect(justRecovered(recordSuccess(failTimes(1, err('blip', 500))))).toBe(false);
    // Nor does the ordinary success that follows a recovery.
    expect(justRecovered(recordSuccess(announced))).toBe(false);
  });

  it('survives a missing or malformed record', () => {
    expect(recordFailure(null, { error: err('x', 500) }).attempts).toBe(1);
    expect(recordFailure(undefined, {}).attempts).toBe(1);
    expect(recordSuccess(null).attempts).toBe(0);
  });
});

describe('when a fault has earned an interruption', () => {
  it('speaks immediately about a refused key, because it will not fix itself', () => {
    expect(shouldAnnounceFailure(failTimes(1, err('bad token', 401)))).toBe(true);
  });

  it('waits three rounds for anything that might just be a bad moment', () => {
    expect(TRANSIENT_ALARM_THRESHOLD).toBe(3);
    expect(shouldAnnounceFailure(failTimes(1, err('x', 500)))).toBe(false);
    expect(shouldAnnounceFailure(failTimes(2, err('x', 500)))).toBe(false);
    expect(shouldAnnounceFailure(failTimes(3, err('x', 500)))).toBe(true);
  });

  it('says nothing when nothing has failed', () => {
    expect(shouldAnnounceFailure(emptyHealthState())).toBe(false);
    expect(shouldAnnounceFailure(null)).toBe(false);
  });
});

describe('slowing down a check that keeps failing', () => {
  it('does not slow the first retry', () => {
    expect(healthBackoffMs(0)).toBe(0);
    expect(healthBackoffMs(1)).toBe(0);
  });

  it('widens the wait as failures pile up', () => {
    const base = 1000;
    expect(healthBackoffMs(2, base)).toBe(2000);
    expect(healthBackoffMs(3, base)).toBe(4000);
    expect(healthBackoffMs(4, base)).toBe(8000);
  });

  it('never waits longer than an hour', () => {
    // A dead endpoint must still be retried often enough to notice a fix.
    expect(healthBackoffMs(99)).toBe(60 * 60 * 1000);
  });

  it('survives junk', () => {
    expect(healthBackoffMs(null)).toBe(0);
    expect(healthBackoffMs('nonsense')).toBe(0);
  });
});

describe('what the publisher is told', () => {
  const shippo = (state, extra = {}) => describeIntegrationHealth({ label: 'Shippo', state, ...extra });

  it('says nothing at all while the device is offline', () => {
    // The sync chip already owns that message; blaming Shippo for a tunnel is
    // how someone learns to ignore this corner.
    expect(shippo(failTimes(5, err('Failed to fetch')), { online: false }).visible).toBe(false);
  });

  it('says nothing about a service that was never set up', () => {
    expect(shippo(failTimes(5, err('x', 500)), { configured: false }).visible).toBe(false);
  });

  it('says nothing while everything is working', () => {
    expect(shippo(emptyHealthState()).visible).toBe(false);
  });

  it('names the sign-in problem in words the owner can act on', () => {
    const said = shippo(failTimes(1, err('Invalid token.', 401)));
    expect(said.visible).toBe(true);
    expect(said.permanent).toBe(true);
    expect(said.title).toBe('Shippo needs signing in again');
    expect(said.detail).toContain('refused the details');
    expect(said.detail).not.toContain('{label}');
    expect(said.action).toMatchObject({ label: 'Check now' });
  });

  it('is gentler about a service that is merely unreachable', () => {
    const said = shippo(failTimes(3, err('Failed to fetch')));
    expect(said.title).toBe('Shippo is not answering');
    expect(said.permanent).toBe(false);
    // Amber, not rose: attention rather than alarm.
    expect(said.tone).toBe('offline');
  });

  it('marks a refused key louder than an unreachable service', () => {
    expect(shippo(failTimes(1, err('x', 401))).tone).toBe('failed');
    expect(shippo(failTimes(3, err('x', 503))).tone).toBe('offline');
  });

  it('says when it last worked, so the gap is visible', () => {
    const state = { ...failTimes(3, err('x', 500)), succeededAt: 0 };
    expect(shippo(state).meta).toBe('');
    const withSuccess = { ...state, succeededAt: 1_000_000 };
    expect(shippo(withSuccess, { now: 1_000_000 + 3 * 60_000 }).meta).toBe('Last worked 3 min ago');
  });

  it('uses whichever service name it was given', () => {
    const said = describeIntegrationHealth({ label: 'Big Cartel', state: failTimes(1, err('x', 401)) });
    expect(said.title).toBe('Big Cartel needs signing in again');
    expect(said.detail).toContain('Big Cartel');
  });

  it('has an all-clear to match', () => {
    const said = describeIntegrationRecovery('Shippo');
    expect(said.title).toBe('Shippo is working again');
    expect(said.detail).toContain('picked up');
  });
});
