## 2024-06-29 - Parallel Shippo Transactions Fetch

**Learning:** I noticed that inside a loop the application was awaiting an asynchronous transaction that hit a networking endpoint. This caused an N+1 problem resulting in unnecessary, sequentially processed promises. By keeping optimistic sets (`fetchedIds`, `importedIds`, `existingRefs`) updated temporarily inside the initial loop, we could successfully parallelize network requests with `Promise.all` and then iterate over the results resolving cleanly or reverting the optimistic insertions.
**Action:** Implemented a split loop process in `src/main.js` which gathers validated array of rows, awaits a mapping of `Promise.all` resolving the expenses, and processes the outcome sequentially.
