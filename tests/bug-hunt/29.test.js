import { it, expect } from 'vitest';
const M = await import(process.env.MOD || '../../src/lib/carriers/canadapost-throttle.js');
it('cooldown noted during a queued sleep is not wiped', async () => {
  M.resetAllCanadaPostThrottles();
  let t = 1000; const slept = [];
  const opts = { now: () => t, sleep: async (ms) => {
    slept.push(ms);
    if (slept.length === 1) M.noteCanadaPostThrottled('rating', { now: () => t }); // another call's 429 arrives
    t += ms;
  } };
  await M.scheduleCanadaPostCall('rating', () => 'a', opts);   // no sleep
  await M.scheduleCanadaPostCall('rating', () => 'b', opts);   // sleeps 250, throttle noted meanwhile
  await M.scheduleCanadaPostCall('rating', () => 'c', opts);
  expect(slept.slice(1).some(ms => ms >= 59_000)).toBe(true);
});
