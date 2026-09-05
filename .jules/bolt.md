## 2024-07-23 - Avoid Chained Array Iteration on Large Collections
**Learning:** In frontend functions operating on state collections (like calculating aggregate values over `s.ledger` or `s.hist`), chaining `Array.prototype.filter().reduce()` allocates intermediate filtered arrays and iterates the collection multiple times. In a framework-less vanilla DOM architecture like this one where rendering cycles might be triggered often, this creates unnecessary overhead and GC pressure.
**Action:** Collapse these into single imperative `for...of` passes, maintaining accumulator variables, to iterate only once and avoid array allocations.

## 2025-02-12 - Date String Sorting Optimization
**Learning:** `String.prototype.localeCompare()` is significantly slower than standard string comparison operators (`<`, `>`). Since the application stores dates as ISO-like 'YYYY-MM-DD' strings, we can safely replace `localeCompare()` with `<` and `>` when sorting arrays by date. This avoids locale-aware comparison overhead while maintaining correct chronological ordering.
**Action:** Always prefer standard string inequality operators (`<`, `>`) when sorting standard ISO-like date strings. Reserve `localeCompare()` for sorting names or other strings where locale-specific sorting rules (like accents or capitalization) are actually required.

## 2025-02-23 - Replace reduce with for loops
**Learning:** In hot loops, replacing array methods like reduce with imperative for loops avoids intermediate allocations and reduces Garbage Collection (GC) overhead.
**Action:** Use direct imperative iteration for scalar accumulation in frequently updated computations to improve speed.

## 2025-02-24 - Function Re-allocation in Sort Callbacks
**Learning:** Defining helper arrow functions directly inside loop callbacks like `Array.prototype.sort()` causes the function to be needlessly re-created in memory on every comparison ($O(N \log N)$ times). While modern JS engines try to optimize this, it's safer and structurally cleaner to declare loop-invariant closures outside the hot loop.
**Action:** Always hoist helper function definitions out of high-frequency loop or sorting callbacks to prevent unnecessary memory reallocation and overhead.

## 2025-02-24 - Replace chained array combinations in rendering filters
**Learning:** In functions that filter collections on UI state changes (like `_tcApplyLedgerFilter`), chained methods like `.filter().some()` create multiple intermediate arrays and add significant GC overhead (O(N) allocations) on every re-render.
**Action:** Collapse complex chained filtering logic into a single imperative loop using early `continue` statements to prevent intermediate array allocations and improve UI responsiveness.
## 2025-02-28 - Loop Fusion in POS Cart Evaluation
**Learning:** In the POS cart evaluation (`posGenerateSaleQR` and `posCheckout`), chaining `.some()` to check for missing FX rates and `.reduce()` to calculate the total sum creates multiple O(N) array traversals. Fusing these checks into a single imperative loop eliminates redundant iterations and improves performance for larger cart sizes.
**Action:** When evaluating an array for a condition and simultaneously accumulating a sum, combine them into a single imperative loop instead of chaining array methods.
## 2025-03-01 - Avoid nested O(N*M) lookups in template generation
**Learning:** Generating dropdown options using `.filter(order => !matches.some(m => m.orderNumber === normalizeShippingOrderNumber(order.num)))` creates an O(N*M) bottleneck, where M is the small set of matches but `normalizeShippingOrderNumber` is unnecessarily called N*M times.
**Action:** Replace nested array lookups involving expensive normalization calls with O(1) Set lookups initialized beforehand, and use a single imperative loop to build output strings.
## 2025-03-02 - O(N) max finding instead of O(N log N) sorting
**Learning:** Using chained array methods like \`slice().sort((a,b) => ...)[0]\` to find a minimum or maximum element introduces an unnecessary $O(N \log N)$ time complexity and an extra array allocation.
**Action:** Replace these operations with a single imperative $O(N)$ loop to find the minimum or maximum element. It avoids allocations and is substantially faster.

## 2026-09-05 - Per-expense recompute of per-file data in receipt matching
**Learning:** `receipt-match.js`'s `bestMatch()` maps every expense through `scoreMatch(fileInfo, exp)`, but `scoreMatch` derived `fileDate`/`money` from `fileInfo.name` fresh on every call — work that only depends on the file, not the expense being scored. `amountFromName` also compiles a new `RegExp` per call, so this was recompiling the same regex against the same filename once per expense (O(files × expenses) regex compiles instead of O(files)). A synthetic benchmark (80 files × 400 expenses) went from ~168ms/run to ~120ms/run (~29% faster) after hoisting.
**Action:** When a batch scoring/matching function loops a per-item scorer over a candidate list, check whether the scorer recomputes anything derived only from the fixed item (not the candidate) — hoist that into the caller and pass it in, rather than letting it get recomputed once per candidate.
