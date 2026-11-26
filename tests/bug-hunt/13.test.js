import { test, expect } from 'vitest';
import { personNameParts } from '../../src/lib/postage-matching.js';
test('curly apostrophe', () => { expect(personNameParts('Sean O’Brien')).toEqual(personNameParts("Sean O'Brien")); });
