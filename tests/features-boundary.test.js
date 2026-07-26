import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const featureDir = path.join(root, 'src/features');
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

      it('keeps its dependency on main.js small enough to see at a glance', () => {
        const m = src.match(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/main\.js'/);
        expect(m).not.toBeNull();
        const names = m[1].split(',').map(s => s.trim()).filter(Boolean);
        // Not a style rule: this number is the actual seam between the feature
        // and the rest of the app. If it climbs, the extraction is being undone.
        expect(names.length).toBeLessThanOrEqual(30);
      });
    });
  });
});

describe('Open Call moved out of main.js', () => {
  const ocSrc = fs.readFileSync(path.join(featureDir, 'opencall.js'), 'utf8');
  const exportBlock = ocSrc.match(/export\s*\{([\s\S]*)\}\s*;?\s*$/);
  const exported = exportBlock
    ? exportBlock[1].split(',').map(s => s.trim()).filter(Boolean)
    : [];

  it('exports the whole cluster', () => {
    expect(exported.length).toBeGreaterThan(100);
  });

  it('no longer declares those functions in main.js', () => {
    // Two copies would both satisfy no-undef while the app called whichever one
    // main.js declared last.
    const duplicated = exported.filter(n =>
      new RegExp(`^(?:export\\s+)?(?:async\\s+)?function ${n}\\b`, 'm').test(mainJs));
    expect(duplicated).toEqual([]);
  });

  it('imports every one of them back into main.js', () => {
    // exposeLegacyInlineHandlers lists these as shorthand properties, so a name
    // that isn't imported would be a build error — but it would also be a
    // silently dead button if the exposure block were ever loosened.
    const m = mainJs.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/features\/opencall\.js'/);
    expect(m).not.toBeNull();
    const imported = new Set(m[1].split(',').map(s => s.trim()).filter(Boolean));
    expect(exported.filter(n => !imported.has(n))).toEqual([]);
  });
});
