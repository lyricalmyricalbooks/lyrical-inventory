import { it, expect } from 'vitest';
const mod = await import(process.env.FIXED ? '../../src/lib/carriers/canadapost-shipment-diagnosis.js' : '../../src/lib/carriers/canadapost-shipment-diagnosis.js');
it('bad postal code format is owner-fixable', () => {
  const d = mod.diagnoseShipmentRejection({ status: 400, body: JSON.stringify({ messages: [{ code: '9', description: 'Invalid format for destination postal code' }] }) });
  expect(d.kind).toBe('fixable');
});
