---
name: qa-tester
description: QA Automation & Test Harness procedure. Guides Vitest unit testing, edge-case validation, test harness construction, mock service isolation, and regression verification across all application modules.
---

# QA Automation & Test Harness Procedure (`/qa-tester`)

Use this skill when authoring unit tests, building mock services, validating edge cases, or executing regression test suites in `lyrical-inventory`.

---

## 1. Vitest Test Execution Commands

```bash
# Run all tests once
npm.cmd test

# Run tests in interactive watch mode
npm.cmd run test:watch

# Run a specific test suite
npm.cmd test -- tests/money.test.js
```

---

## 2. Test Authoring Standards (`tests/*.test.js`)

When creating a new test file:
```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { myFunction } from '../src/lib/my-module.js';

describe('myModule', () => {
  it('handles standard input correctly', () => {
    const result = myFunction({ count: 5 });
    expect(result).toBe(5);
  });

  it('defensively handles null and undefined inputs', () => {
    expect(myFunction(null)).toBe(0);
    expect(myFunction({})).toBe(0);
  });
});
```

---

## 3. Financial Invariant Test Checks

1. **`roundCents` Precision:** Verify float operations (`0.1 + 0.2`, `1.005`) round to exact 2-decimal precision.
2. **Shipping CAD Invariant:** Verify multi-currency checkouts do NOT convert customer shipping amounts.
3. **Consignment Balance:** Verify `Current Stock = Shipments - Returns - Sales`.

---

## 4. Verification Gate

Ensure that `npm.cmd test` completes with 100% pass rate before approving any PR or commit.
