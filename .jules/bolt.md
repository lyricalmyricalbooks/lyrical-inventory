## 2024-07-23 - Avoid Chained Array Iteration on Large Collections
**Learning:** In frontend functions operating on state collections (like calculating aggregate values over `s.ledger` or `s.hist`), chaining `Array.prototype.filter().reduce()` allocates intermediate filtered arrays and iterates the collection multiple times. In a framework-less vanilla DOM architecture like this one where rendering cycles might be triggered often, this creates unnecessary overhead and GC pressure.
**Action:** Collapse these into single imperative `for...of` passes, maintaining accumulator variables, to iterate only once and avoid array allocations.

## 2024-08-07 - Avoid localeCompare for sorting YYYY-MM-DD date strings
**Learning:** Using `localeCompare` to sort standard ASCII strings like 'YYYY-MM-DD' dates is significantly slower and computationally heavier than simple string inequality operators (`<`, `>`).
**Action:** When sorting arrays of items by a standardized string format (like dates), prefer using ternary conditionals with `<` and `>` (e.g. `a < b ? -1 : (a > b ? 1 : 0)`) rather than `String.prototype.localeCompare`.
