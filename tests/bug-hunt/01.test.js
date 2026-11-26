import { test, expect } from 'vitest';
const m = await import(process.env.COPY ? '../../src/lib/address-suggest.js' : '../../src/lib/address-suggest.js');
const c = m.cleanSuggestQuery;
test('street names kept', () => {
  expect(c('123 Steeles Ave W')).toBe('123 Steeles Avenue W');
  expect(c('45 Stephen St')).toBe('45 Stephen Street');
  expect(c('9 Unity Rd')).toBe('9 Unity Road');
  expect(c('731 Market St Apt 3')).toBe('731 Market Street');
  expect(c('731 Market St #200')).toBe('731 Market Street');
  expect(c('731 Market St Ste. 4B')).toBe('731 Market Street');
});
