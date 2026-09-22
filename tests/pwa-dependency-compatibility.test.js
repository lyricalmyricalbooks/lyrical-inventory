import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

test('uses the asset generator major supported by vite-plugin-pwa', () => {
  expect(packageJson.devDependencies['@vite-pwa/assets-generator']).toMatch(/^\^1\./);
});
