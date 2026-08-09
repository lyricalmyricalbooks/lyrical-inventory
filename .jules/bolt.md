## 2024-07-23 - Avoid Chained Array Iteration on Large Collections
**Learning:** In frontend functions operating on state collections (like calculating aggregate values over `s.ledger` or `s.hist`), chaining `Array.prototype.filter().reduce()` allocates intermediate filtered arrays and iterates the collection multiple times. In a framework-less vanilla DOM architecture like this one where rendering cycles might be triggered often, this creates unnecessary overhead and GC pressure.
**Action:** Collapse these into single imperative `for...of` passes, maintaining accumulator variables, to iterate only once and avoid array allocations.

## 2024-05-18 - Avoid Intermediate Array Allocations and Callback Creation in Hot Paths
**Learning:** In a vanilla DOM architecture, chained array methods like `.filter().length` and frequent `.reduce()` calls allocate temporary intermediate structures and create new callback function objects on every iteration. This increases Garbage Collection (GC) pressure, which is detrimental to performance in hot loops or frequently called rendering paths.
**Action:** Replace `.filter().length` with explicit imperative loops (e.g., `for...of`) that increment a scalar counter. Replace `.reduce()` inside rendering loops with explicit `for` loops to accumulate values directly, eliminating both intermediate array allocations and the overhead of callback creation.
