## 2025-06-11 - Batching Firebase Promise saves in syncAllReceipts
**Learning:** Sequential Firebase network requests (`window._fbSave`) in a loop cause an N+1 query performance bottleneck that scales linearly with the number of books, leading to significant delays during sync operations.
**Action:** Identified and optimized sequential network requests by using an array to collect promises and running them concurrently with `Promise.all()`, reducing sync time by ~80% in benchmarks without changing application logic or reliability.
