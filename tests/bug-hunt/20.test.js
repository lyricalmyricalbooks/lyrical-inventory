import { test, expect } from 'vitest';
const mod = await import(process.env.FIXED ? '../../src/lib/carriers/canadapost.js' : '../../src/lib/carriers/canadapost.js');
test('live GB shipment without postcode gets no fake US zip', () => {
  const j = mod.buildNonContractShipmentJson({ serviceCode:'INT.XP', allowPlaceholders:false, destination:{countryCode:'GB', name:'A', address1:'1 St', city:'London'} });
  expect(JSON.stringify(j)).not.toContain('90210');
});
