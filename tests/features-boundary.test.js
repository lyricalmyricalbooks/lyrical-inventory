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
  // +2 for openM/closeM: the trip create/edit modal lives in this module, and
  // these are the same shared modal primitives shipping.js/bigcartel.js use.
  // +2 for resolveLocalReceiptFile/ensurePdfJs: the printable trip report reads
  // the same local receipt files viewLocalReceipt opens, and rasterises PDF
  // ones — both primitives stay in main.js next to the folder-handle plumbing.
  'taxcentre.js': 27,
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

// Every name a module imports must actually be exported by the module it names.
//
// eslint's no-undef does not check this: the identifier *is* imported, so it is
// defined as far as the linter is concerned, and the import only fails when the
// bundler resolves it. Extracting the Tax Centre moved renderTaxCenter and
// saveTaxCenter out of main.js while shipping.js still imported them from
// there — lint stayed clean and `npm run build` failed. Tests run before the
// build in CI, so this puts the failure where it can be read.
describe('cross-module imports resolve', () => {
  const exportsOf = (src) => {
    const at = src.lastIndexOf('\nexport {');
    if (at < 0) return null;
    const block = src.slice(at).replace(/^[\s\S]*?\{/, '').replace(/\}[\s\S]*$/, '');
    return new Set(block.split(',').map(s => s.trim()).filter(Boolean));
  };

  // main.js has no trailing export block; its exports are inline.
  const mainExports = new Set([
    ...[...mainJs.matchAll(/^export (?:async )?function ([A-Za-z_$][\w$]*)/gm)].map(m => m[1]),
    ...[...mainJs.matchAll(/^export (?:const|let|var) ([A-Za-z_$][\w$]*)/gm)].map(m => m[1]),
  ]);

  const sources = Object.fromEntries(
    featureFiles.map(f => [f, fs.readFileSync(path.join(featureDir, f), 'utf8')]));

  featureFiles.forEach(file => {
    const src = sources[file];

    it(`${file}: every name it takes from main.js is exported there`, () => {
      const m = src.match(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/main\.js'/);
      const names = m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
      expect(names.filter(n => !mainExports.has(n))).toEqual([]);
    });

    it(`${file}: every name it takes from a sibling module is exported there`, () => {
      const missing = [];
      for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([\w.-]+)'/g)) {
        const sibling = m[2].endsWith('.js') ? m[2] : `${m[2]}.js`;
        const exported = sources[sibling] ? exportsOf(sources[sibling]) : null;
        if (!exported) { missing.push(`${sibling} (no export block)`); continue; }
        m[1].split(',').map(s => s.trim()).filter(Boolean)
          .forEach(n => { if (!exported.has(n)) missing.push(`${n} from ${sibling}`); });
      }
      expect(missing).toEqual([]);
    });
  });
});
