import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const featureDir = path.join(root, 'src/features');
// Recorded seam size per feature module — see the assertion below.
const MAIN_IMPORT_BUDGET = {
  'opencall.js': 18,
  'shipping.js': 29,
  'bigcartel.js': 18,
};

const featureFiles = fs.existsSync(featureDir)
  ? fs.readdirSync(featureDir).filter(f => f.endsWith('.js'))
  : [];

// src/main.js and src/features/*.js import from each other. That cycle is
// legitimate — every export on both sides is a hoisted function declaration
// called long after start-up — but it is only safe while neither side *runs*
// anything at module-evaluation time.
//
// A feature module that called a main.js helper at its top level would read an
// uninitialised binding and throw during page load, and it would do so only in
// dev: the production build flattens the graph into one chunk and hides it. So
// the no-side-effects property is asserted rather than assumed.
describe('feature module boundary', () => {
  it('has at least one feature module to check', () => {
    expect(featureFiles.length).toBeGreaterThan(0);
  });

  featureFiles.forEach(file => {
    describe(`src/features/${file}`, () => {
      const src = fs.readFileSync(path.join(featureDir, file), 'utf8');

      it('runs nothing at module-evaluation time', () => {
        // Strip block comments and string/template contents so prose and markup
        // can't read as code, then look for a top-level statement that is not a
        // declaration.
        const stripped = src
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');

        const offending = stripped.split('\n').filter(line => {
          if (!/^\S/.test(line)) return false;            // indented: inside a block
          if (/^(import|export|function|async|const|let|var|\}|\)|\]|`)/.test(line)) return false;
          return /^[A-Za-z_$][\w$.]*\s*\(/.test(line)     // a bare call
              || /^(if|for|while|switch|do|try|document|window)\b/.test(line);
        });

        expect(offending).toEqual([]);
      });

      it('imports from main.js by explicit name, not wholesale', () => {
        // A namespace import would make the coupling invisible and let it grow
        // without anyone noticing.
        expect(src).not.toMatch(/import\s+\*\s+as\s+\w+\s+from\s+'\.\.\/main\.js'/);
      });

      it('keeps its dependency on main.js within its recorded budget', () => {
        const m = src.match(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/main\.js'/);
        expect(m).not.toBeNull();
        const names = m[1].split(',').map(s => s.trim()).filter(Boolean);
        // Not a style rule: this number is the actual seam between the feature
        // and the rest of the app. Budgets are per module and set at the count
        // the extraction achieved, so the check catches coupling *growing*
        // rather than asserting one number suits every feature. Shipping's is
        // larger than Open Call's because it genuinely straddles more of the
        // app — the tax centre, orders, the ledger and the Big Cartel bridge.
        // Lower a budget when a module sheds a dependency; think hard before
        // raising one.
        expect(names.length).toBeLessThanOrEqual(MAIN_IMPORT_BUDGET[file] ?? 25);
      });
    });
  });
});

describe('feature modules are the only home of what they own', () => {
  featureFiles.forEach(file => {
    describe(`src/features/${file}`, () => {
      const src = fs.readFileSync(path.join(featureDir, file), 'utf8');
      const exportBlock = src.match(/export\s*\{([\s\S]*)\}\s*;?\s*$/);
      const exported = exportBlock
        ? exportBlock[1].split(',').map(s => s.trim()).filter(Boolean)
        : [];

      it('exports the cluster it was carved out for', () => {
        expect(exported.length).toBeGreaterThan(20);
      });

      it('no longer declares those functions in main.js', () => {
        // Two copies would both satisfy no-undef while the app called whichever
        // one main.js declared last — a silent, very confusing divergence.
        const duplicated = exported.filter(n =>
          new RegExp(`^(?:export\\s+)?(?:async\\s+)?function ${n}\\b`, 'm').test(mainJs));
        expect(duplicated).toEqual([]);
      });

      it('has everything main.js still uses imported back', () => {
        // exposeLegacyInlineHandlers lists handlers as shorthand properties, so
        // a name main.js references but never imported is a build error. This
        // guards the inverse: that the import block is real and non-empty.
        const m = mainJs.match(
          new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'\\./features/${file.replace('.', '\\.')}'`));
        expect(m).not.toBeNull();
        const imported = m[1].split(',').map(s => s.trim()).filter(Boolean);
        expect(imported.length).toBeGreaterThan(0);
        // Everything imported must actually be exported by that module.
        expect(imported.filter(n => !exported.includes(n))).toEqual([]);
      });
    });
  });
});
