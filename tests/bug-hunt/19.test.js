import { test, expect } from 'vitest';
import { uniqueZipPath } from '../../src/lib/zip.js';
test('dot in folder', () => { const s=new Set(); uniqueZipPath('2025.q1/receipt',s); expect(uniqueZipPath('2025.q1/receipt',s)).toBe('2025.q1/receipt-2'); });
