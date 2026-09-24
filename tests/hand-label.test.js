import { describe, it, expect } from 'vitest';
import { addressLines, formatPostalCode, returnLines, buildHandLabelDocument } from '../src/lib/hand-label.js';

describe('hand-addressed label', () => {
  it('prints Canadian postal codes the Canada Post way', () => {
    expect(formatPostalCode('t1k5v6', 'Canada')).toBe('T1K 5V6');
    expect(formatPostalCode('90210', 'United States')).toBe('90210');
  });

  it('capitalises the address and leaves the country off a domestic parcel', () => {
    expect(addressLines({ addr1: '69 riverine Lane West', city: 'Lethbridge', province: 'Alberta', postal: 'T1K5V6', country: 'Canada' }))
      .toEqual(['69 RIVERINE LANE WEST', 'LETHBRIDGE ALBERTA  T1K 5V6']);
  });

  it('ends an international address with the country on its own line', () => {
    expect(addressLines({ addr1: 'Hauptstr. 5', city: 'Berlin', postal: '10115', country: 'Germany' }))
      .toEqual(['HAUPTSTR. 5', 'BERLIN  10115', 'GERMANY']);
  });

  it('uses the saved return address, or the fallback when it is incomplete', () => {
    const origin = { company: 'Lyricalmyrical Books', street1: '456 Montrose Ave', city: 'Toronto', state: 'ON', zip: 'm6g3h1', country: 'CA' };
    expect(returnLines(origin, ['x'])).toEqual(['Lyricalmyrical Books', '456 Montrose Ave', 'Toronto ON  M6G 3H1']);
    expect(returnLines({}, ['fallback'])).toEqual(['fallback']);
  });

  it('starts in the chosen layout, sized to match, and escapes what was typed', () => {
    const html = buildHandLabelDocument({ to: { name: '<b>April</b>' }, from: ['A'], orientation: 'landscape' });
    expect(html).toContain('<body class="landscape">');
    expect(html).toContain('size: 6in 4in');
    expect(html).toContain('&lt;b&gt;April&lt;/b&gt;');
    expect(buildHandLabelDocument({})).toContain('size: 4in 6in');
  });
});
