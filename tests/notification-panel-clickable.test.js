// The notifications window once sat inside the pop-up corner, which lets clicks
// pass through it — so every button in the window did nothing. No dialog may
// live inside that region.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const doc = new DOMParser().parseFromString(fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8'), 'text/html');

describe('dialogs are clickable', () => {
  it('keeps the notifications window outside the click-through alert region', () => {
    const panel = doc.getElementById('m-notifications');
    expect(panel).toBeTruthy();
    expect(panel.closest('#app-alert-region')).toBeNull();
  });

  it('keeps every dialog out of that region', () => {
    const region = doc.getElementById('app-alert-region');
    expect(region.querySelectorAll('.overlay').length).toBe(0);
  });
});
