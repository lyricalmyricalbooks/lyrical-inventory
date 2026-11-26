import { test, expect } from 'vitest';
import { readDate } from '../../src/lib/postage-intake.js';
test('local date kept', () => { expect(readDate('Nov 5, 2026')).toBe('2026-11-05'); });
