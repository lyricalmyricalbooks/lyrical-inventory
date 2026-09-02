import { describe, it, expect, beforeEach } from 'vitest';
import {
  CANADAPOST_MIN_CALL_SPACING_MS,
  CANADAPOST_THROTTLE_COOLDOWN_MS,
  CANADAPOST_THROTTLE_WINDOW_MS,
  CANADAPOST_PRODUCTS,
  isThrottleResponse,
  scheduleCanadaPostCall,
  noteCanadaPostThrottled,
  describeThrottleWait,
  resetCanadaPostThrottle,
  resetAllCanadaPostThrottles,
} from '../src/lib/canadapost-throttle.js';

// ─────────────────────────────────────────────────────────────────────────
// Why this file exists:
//
// Canada Post throttles on a rolling minute, and being turned away does not
// cost one call — it closes that product for the rest of the minute. In the
// middle of a mailing run that is the publisher standing at the printer.
//
// The limits are also per product, so the two mistakes worth guarding are the
// opposite of each other: one shared queue would let a burst of rate quotes
// hold up a tracking check that had spent nothing, while no queue at all would
// let a batch of labels spend the window in a single tick.
//
// These tests hold the pacing, the per-product isolation, and the full-minute
// stand-down. Every one of them drives an injected clock: a suite that really
// waited a minute per throttle case is a suite nobody runs.
// ─────────────────────────────────────────────────────────────────────────

/**
 * A clock the tests drive by hand. Sleeping records what was asked for and
 * moves the hands forward, so a minute of cooldown costs the suite nothing.
 */
function makeClock(start = 1_700_000_000_000) {
  let t = start;
  const slept = [];
  return {
    slept,
    advance(ms) { t += ms; },
    options: {
      now: () => t,
      sleep: async (ms) => { slept.push(ms); t += ms; },
    },
  };
}

beforeEach(() => {
  resetAllCanadaPostThrottles();
});

describe('the published limits this file is built on', () => {
  it('spaces calls a quarter second apart and stands down for a full minute', () => {
    expect(CANADAPOST_MIN_CALL_SPACING_MS).toBe(250);
    expect(CANADAPOST_THROTTLE_COOLDOWN_MS).toBe(60_000);
  });

  it('makes the stand-down exactly as long as the window it is waiting out', () => {
    expect(CANADAPOST_THROTTLE_COOLDOWN_MS).toBe(CANADAPOST_THROTTLE_WINDOW_MS);
  });

  it('names the three products that carry their own allowances', () => {
    expect(Object.values(CANADAPOST_PRODUCTS)).toEqual(['rating', 'shipping', 'tracking']);
  });
});

describe('pacing calls to one product', () => {
  it('lets the first call for a product go straight out', async () => {
    const clock = makeClock();
    await expect(scheduleCanadaPostCall('rating', () => 'quoted', clock.options)).resolves.toBe('quoted');
    expect(clock.slept).toEqual([]);
  });

  it('holds the next call to the same product for a quarter second', async () => {
    const clock = makeClock();
    await scheduleCanadaPostCall('rating', () => 'one', clock.options);
    await scheduleCanadaPostCall('rating', () => 'two', clock.options);
    expect(clock.slept).toEqual([250]);
  });

  it('does not make a call wait when enough time has already passed on its own', async () => {
    const clock = makeClock();
    await scheduleCanadaPostCall('rating', () => 'one', clock.options);
    clock.advance(400);
    await scheduleCanadaPostCall('rating', () => 'two', clock.options);
    expect(clock.slept).toEqual([]);
  });

  it('runs the calls for one product in the order they were asked for', async () => {
    const clock = makeClock();
    const order = [];
    await Promise.all([
      scheduleCanadaPostCall('rating', () => order.push('first'), clock.options),
      scheduleCanadaPostCall('rating', () => order.push('second'), clock.options),
      scheduleCanadaPostCall('rating', () => order.push('third'), clock.options),
    ]);
    expect(order).toEqual(['first', 'second', 'third']);
    expect(clock.slept).toEqual([250, 250]);
  });

  it('still paces correctly when handed a clock whose hands never move', async () => {
    // The spacing has to be measured from the previous call, not from one
    // frozen instant, or every wait in a queue would grow: 250, 500, 750.
    const frozen = 5_000;
    const slept = [];
    const options = { now: () => frozen, sleep: async (ms) => { slept.push(ms); } };

    await scheduleCanadaPostCall('rating', () => 'one', options);
    await scheduleCanadaPostCall('rating', () => 'two', options);
    await scheduleCanadaPostCall('rating', () => 'three', options);
    expect(slept).toEqual([250, 250]);
  });

  it('hands back whatever the call returned, waiting on a promise if it is one', async () => {
    const clock = makeClock();
    await expect(
      scheduleCanadaPostCall('rating', async () => ({ ok: true }), clock.options)
    ).resolves.toEqual({ ok: true });
  });

  it('keeps the queue moving after a failure, so one bad quote does not wedge the rest', async () => {
    const clock = makeClock();
    await expect(
      scheduleCanadaPostCall('rating', () => { throw new Error('boom'); }, clock.options)
    ).rejects.toThrow('boom');
    await expect(scheduleCanadaPostCall('rating', () => 'still going', clock.options)).resolves.toBe('still going');
  });

  it('refuses to schedule something that is not a function', async () => {
    await expect(scheduleCanadaPostCall('rating', null)).rejects.toBeInstanceOf(TypeError);
    await expect(scheduleCanadaPostCall('rating', 'go')).rejects.toBeInstanceOf(TypeError);
  });

  it('falls back to real timing rather than crashing when handed junk for a clock', async () => {
    await expect(
      scheduleCanadaPostCall('rating', () => 'ok', { now: 'nope', sleep: 'nope' })
    ).resolves.toBe('ok');
  });
});

describe('each product keeps its own queue', () => {
  it('never makes a tracking check wait behind a burst of rate quotes', async () => {
    const clock = makeClock();
    await scheduleCanadaPostCall('rating', () => 'one', clock.options);
    await scheduleCanadaPostCall('rating', () => 'two', clock.options);
    const spentSoFar = clock.slept.length;

    await scheduleCanadaPostCall('tracking', () => 'checked', clock.options);
    expect(clock.slept.length).toBe(spentSoFar);
  });

  it('gives an unfamiliar product its own queue rather than borrowing rating\'s', async () => {
    const clock = makeClock();
    await scheduleCanadaPostCall('rating', () => 'one', clock.options);
    const spentSoFar = clock.slept.length;

    await scheduleCanadaPostCall('some-new-canada-post-api', () => 'one', clock.options);
    expect(clock.slept.length).toBe(spentSoFar);
  });

  it('treats one product as one queue however the name is spaced or capitalised', async () => {
    const clock = makeClock();
    await scheduleCanadaPostCall('Rating', () => 'one', clock.options);
    await scheduleCanadaPostCall('  rating  ', () => 'two', clock.options);
    expect(clock.slept).toEqual([250]);
  });
});

describe('standing down after Canada Post turns a call away', () => {
  it('sits out a full minute on that product before calling again', async () => {
    const clock = makeClock();
    noteCanadaPostThrottled('rating', clock.options);

    await expect(scheduleCanadaPostCall('rating', () => 'quoted', clock.options)).resolves.toBe('quoted');
    expect(clock.slept).toEqual([60_000]);
  });

  it('makes the calls queued behind it wait out that minute once, not each', async () => {
    const clock = makeClock();
    noteCanadaPostThrottled('rating', clock.options);

    await Promise.all([
      scheduleCanadaPostCall('rating', () => 'one', clock.options),
      scheduleCanadaPostCall('rating', () => 'two', clock.options),
    ]);
    expect(clock.slept).toEqual([60_000, 250]);
  });

  it('leaves the other products free while one is sitting out its minute', async () => {
    const clock = makeClock();
    noteCanadaPostThrottled('shipping', clock.options);

    await scheduleCanadaPostCall('tracking', () => 'checked', clock.options);
    expect(clock.slept).toEqual([]);
  });

  it('reports how much of the minute is left, and nothing once it has passed', () => {
    const clock = makeClock();
    noteCanadaPostThrottled('rating', clock.options);
    expect(describeThrottleWait('rating', clock.options)).toBe(60_000);

    clock.advance(20_000);
    expect(describeThrottleWait('rating', clock.options)).toBe(40_000);

    clock.advance(40_000);
    expect(describeThrottleWait('rating', clock.options)).toBe(0);
  });

  it('reports nothing for a product that has never been turned away', () => {
    const clock = makeClock();
    expect(describeThrottleWait('tracking', clock.options)).toBe(0);
    expect(describeThrottleWait('', clock.options)).toBe(0);
    expect(describeThrottleWait('rating')).toBe(0);
  });

  it('measures a second rejection from when it arrived, not from the first one', () => {
    const clock = makeClock();
    noteCanadaPostThrottled('rating', clock.options);
    clock.advance(10_000);
    noteCanadaPostThrottled('rating', clock.options);

    expect(describeThrottleWait('rating', clock.options)).toBe(60_000);
  });
});

describe('recognising a throttle rejection in the answer', () => {
  it('counts the status Canada Post uses when it is turning calls away', () => {
    expect(isThrottleResponse({ status: 429 })).toBe(true);
    expect(isThrottleResponse({ status: '429' })).toBe(true);
  });

  it('counts the monitor rejection wording whatever its casing or punctuation', () => {
    expect(isThrottleResponse({ status: 200, body: 'Server Rejected by SLM Monitor' })).toBe(true);
    expect(isThrottleResponse({ status: 200, body: 'server rejected by slm monitor' })).toBe(true);
    expect(isThrottleResponse({ status: 500, body: '<error>SERVER REJECTED BY SLM MONITOR</error>' })).toBe(true);
    expect(isThrottleResponse({ status: 0, body: 'rejected by SLM_Monitor' })).toBe(true);
  });

  it('reads that wording out of an already-parsed body as well as a raw one', () => {
    expect(isThrottleResponse({
      status: 200,
      body: { messages: [{ description: 'Server Rejected by SLM Monitor' }] },
    })).toBe(true);
  });

  it('does not mistake an ordinary failure for a throttle, since a wrong guess costs a minute', () => {
    expect(isThrottleResponse({ status: 400, body: 'Postal code is invalid' })).toBe(false);
    expect(isThrottleResponse({ status: 500, body: '' })).toBe(false);
    expect(isThrottleResponse({ status: 0, body: null })).toBe(false);
    expect(isThrottleResponse({})).toBe(false);
    expect(isThrottleResponse()).toBe(false);
  });
});

describe('clearing the pacing between runs', () => {
  it('forgets one product without disturbing the others', () => {
    const clock = makeClock();
    noteCanadaPostThrottled('rating', clock.options);
    noteCanadaPostThrottled('shipping', clock.options);

    resetCanadaPostThrottle('rating');
    expect(describeThrottleWait('rating', clock.options)).toBe(0);
    expect(describeThrottleWait('shipping', clock.options)).toBe(60_000);
  });

  it('forgets everything at once', () => {
    const clock = makeClock();
    noteCanadaPostThrottled('rating', clock.options);
    noteCanadaPostThrottled('shipping', clock.options);

    resetAllCanadaPostThrottles();
    expect(describeThrottleWait('rating', clock.options)).toBe(0);
    expect(describeThrottleWait('shipping', clock.options)).toBe(0);
  });
});
