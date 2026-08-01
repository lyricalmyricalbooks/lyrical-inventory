## 2024-07-23 - Avoid Chained Array Iteration on Large Collections
**Learning:** In frontend functions operating on state collections (like calculating aggregate values over `s.ledger` or `s.hist`), chaining `Array.prototype.filter().reduce()` allocates intermediate filtered arrays and iterates the collection multiple times. In a framework-less vanilla DOM architecture like this one where rendering cycles might be triggered often, this creates unnecessary overhead and GC pressure.
**Action:** Collapse these into single imperative `for...of` passes, maintaining accumulator variables, to iterate only once and avoid array allocations.

## 2024-06-15 - Optimizing ISO Date Sorting
**Learning:** `String.prototype.localeCompare()` is significantly slower than standard lexicographical string comparison operators (`<`, `>`). For standardized strings like ISO dates (`YYYY-MM-DD`), basic string comparison is safe, completely accurate, and heavily avoids localization overhead during sorting.
**Action:** When sorting standard formatted date strings in arrays, always use `a > b ? 1 : -1` logic rather than `a.localeCompare(b)`.
