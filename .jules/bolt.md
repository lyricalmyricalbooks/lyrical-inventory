## 2024-07-23 - Avoid Chained Array Iteration on Large Collections
**Learning:** In frontend functions operating on state collections (like calculating aggregate values over `s.ledger` or `s.hist`), chaining `Array.prototype.filter().reduce()` allocates intermediate filtered arrays and iterates the collection multiple times. In a framework-less vanilla DOM architecture like this one where rendering cycles might be triggered often, this creates unnecessary overhead and GC pressure.
**Action:** Collapse these into single imperative `for...of` passes, maintaining accumulator variables, to iterate only once and avoid array allocations.

## 2025-02-12 - Date String Sorting Optimization
**Learning:** `String.prototype.localeCompare()` is significantly slower than standard string comparison operators (`<`, `>`). Since the application stores dates as ISO-like 'YYYY-MM-DD' strings, we can safely replace `localeCompare()` with `<` and `>` when sorting arrays by date. This avoids locale-aware comparison overhead while maintaining correct chronological ordering.
**Action:** Always prefer standard string inequality operators (`<`, `>`) when sorting standard ISO-like date strings. Reserve `localeCompare()` for sorting names or other strings where locale-specific sorting rules (like accents or capitalization) are actually required.

## 2025-02-23 - Replace reduce with for loops
**Learning:** In hot loops, replacing array methods like reduce with imperative for loops avoids intermediate allocations and reduces Garbage Collection (GC) overhead.
**Action:** Use direct imperative iteration for scalar accumulation in frequently updated computations to improve speed.

## 2025-02-24 - Replace chained array combinations in rendering filters
**Learning:** In functions that filter collections on UI state changes (like `_tcApplyLedgerFilter`), chained methods like `.filter().some()` create multiple intermediate arrays and add significant GC overhead (O(N) allocations) on every re-render.
**Action:** Collapse complex chained filtering logic into a single imperative loop using early `continue` statements to prevent intermediate array allocations and improve UI responsiveness.
