## 2024-06-29 - Parallel Shippo Transactions Fetch

**Learning:** I noticed that inside a loop the application was awaiting an asynchronous transaction that hit a networking endpoint. This caused an N+1 problem resulting in unnecessary, sequentially processed promises. By keeping optimistic sets (`fetchedIds`, `importedIds`, `existingRefs`) updated temporarily inside the initial loop, we could successfully parallelize network requests with `Promise.all` and then iterate over the results resolving cleanly or reverting the optimistic insertions.
**Action:** Implemented a split loop process in `src/main.js` which gathers validated array of rows, awaits a mapping of `Promise.all` resolving the expenses, and processes the outcome sequentially.
## 2024-07-19 - Fast Date String Sorting
**Learning:** `.localeCompare()` is notoriously slow in JavaScript because it invokes the Internationalization API (Intl). For standard ISO 8601 date strings or ASCII timestamps where locale-specific rules are irrelevant, it acts as a massive and unnecessary bottleneck during sorts.
**Action:** Always use standard lexicographical comparison operators (`>` and `<`) when sorting dates stored as strings (`YYYY-MM-DD` or ISO). This yields the exact same chronological sorting but executes significantly faster.
