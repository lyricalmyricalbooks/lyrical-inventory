// Screens loaded on demand (src/lib/lazy-feature.js). Open Call is the first:
// it is a separate file in the build, reached through window stubs until it
// arrives, and must never be pulled back into the first download by a static
// import.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lazyFeature } from '../src/lib/lazy-feature.js';
import { OPEN_CALL_EXPORTS } from '../src/lib/opencall-handlers.js';
import { loadApp } from './helpers/load-app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('lazyFeature', () => {
  const fakeModule = () => ({ greet: vi.fn(name => `hi ${name}`), other: vi.fn() });

  it('loads the module once, on the first call, and swaps the stubs for the real functions', async () => {
    const mod = fakeModule();
    const load = vi.fn(async () => mod);
    const target = {};
    const feature = lazyFeature(load, ['greet', 'other'], { target });
    Object.assign(target, feature.stubs);

    expect(load).not.toHaveBeenCalled();
    expect(feature.module()).toBeNull();

    await expect(target.greet('Ana')).resolves.toBe('hi Ana');
    expect(load).toHaveBeenCalledTimes(1);
    expect(target.greet).toBe(mod.greet);
    expect(target.other).toBe(mod.other);
    expect(feature.module()).toBe(mod);

    await feature.get();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('still lets a caller that awaits get() see the failure', async () => {
    const feature = lazyFeature(async () => { throw new Error('offline'); }, [], { target: {} });
    await expect(feature.get()).rejects.toThrow('offline');
  });

  it('runs a call in the same tick once the module is there', async () => {
    const mod = fakeModule();
    const feature = lazyFeature(async () => mod, ['greet'], { target: {} });
    expect(feature.call('greet', 'Bo')).toBeInstanceOf(Promise);
    await feature.get();
    expect(feature.call('greet', 'Bo')).toBe('hi Bo');
  });

  it('tries again after a failed load, such as being offline before the file was saved', async () => {
    const mod = fakeModule();
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce(mod);
    const onError = vi.fn();
    const feature = lazyFeature(load, ['greet'], { target: {}, onError });

    // The tap resolves quietly; the person is told through onError.
    await expect(feature.call('greet', 'Cy')).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toMatch('Failed to fetch');
    expect(feature.module()).toBeNull();
    await expect(feature.call('greet', 'Cy')).resolves.toBe('hi Cy');
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('Open Call loads on demand', () => {
  const ocSrc = read('src/features/opencall.js');
  const exported = ocSrc.slice(ocSrc.lastIndexOf('\nexport {'))
    .replace(/^[\s\S]*?\{/, '').replace(/\}[\s\S]*$/, '')
    .split(',').map(s => s.trim()).filter(Boolean);

  it('has a window stub for every function the module exports, and nothing else', () => {
    expect([...OPEN_CALL_EXPORTS].sort()).toEqual([...exported].sort());
  });

  it('is not imported statically from anywhere in src', () => {
    // A single `import … from './features/opencall.js'` would fold it back
    // into the first download. lib/opencall.js (the pure rules) is a different
    // module and fine to import.
    const target = path.join(root, 'src/features/opencall.js');
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(file); continue; }
        if (!file.endsWith('.js') || file === target) continue;
        for (const m of fs.readFileSync(file, 'utf8').matchAll(/\bfrom\s*'(\.[^']*)'/g)) {
          if (path.resolve(path.dirname(file), m[1]) === target) offenders.push(path.relative(root, file));
        }
      }
    };
    walk(path.join(root, 'src'));
    expect(offenders).toEqual([]);
  });

  describe('in the running app', () => {
    let app;
    beforeAll(async () => {
      app = await loadApp({});
    }, 30000);

    it('paints its tab from the first click, and swaps in the real handlers', async () => {
      // Whatever window.renderOpenCall is right now — the stub, or the real
      // function if start-up already fetched the screen — one call paints it.
      await app.window.renderOpenCall();
      expect(app.window.document.getElementById('opencall-body').innerHTML.trim()).not.toBe('');

      const mod = app.main.openCallScreen.module();
      expect(mod).not.toBeNull();
      expect(app.window.ocAdd).toBe(mod.ocAdd);
      expect(app.window.renderOpenCall).toBe(mod.renderOpenCall);
    });
  });
});
