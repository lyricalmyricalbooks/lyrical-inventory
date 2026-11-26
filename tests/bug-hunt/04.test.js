import { test, expect } from 'vitest';
import { diagnoseShipmentRejection } from '../../src/lib/carriers/canadapost-shipment-diagnosis.js';
test('unrecognised element is field-mapping', () => {
  const r = diagnoseShipmentRejection({ status: 400, body: JSON.stringify({ messages: [{ code: '1200', description: 'Unrecognised element: parcelWeight' }] }) });
  console.log(r.category, r.description, r.kind);
  expect(r.kind).toBe('field-mapping');
});
