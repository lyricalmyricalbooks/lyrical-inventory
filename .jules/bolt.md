## 2024-06-06 - Use string prefix matching for "YYYY-MM-DD" date fields
**Learning:** The app architectures relies heavily on storing dates as strings in the "YYYY-MM-DD" format within fields like `h.date` and `e.date` across numerous entities (e.g. sales history, expenses). Repeatedly parsing these strings back into Date objects for loop iterations inside aggregate functions (like financial reports) creates significant performance bottlenecks since JavaScript's `new Date()` is expensive.
**Action:** When filtering iterating over large collections of items by year or month, use string prefix matching (e.g. `e.date.startsWith("2024")`) instead of parsing Date objects (e.g. `new Date(e.date) >= start`).
## 2024-06-05 - Avoid inline complex object instantiations
**Learning:** Avoid inline complex object instantiations (like large arrays or nested objects) if they are frequently used and not meant to be modified.
**Action:** Extract complex static objects to the top-level module scope when possible to save GC pressure.
## $(date +%Y-%m-%d) - Sorting date strings directly
**Learning:** Using `new Date(a.date) - new Date(b.date)` for sorting lists of dates (like the `allLedger` array) is slow and memory-intensive. `localeCompare()` or simple inequality operators (`<`, `>`) on ISO 8601 or "YYYY-MM-DD" date strings accomplish the exact same sort order without allocating thousands of throwaway Date objects during the sort iterations.
**Action:** When sorting arrays of objects by an ISO or "YYYY-MM-DD" date string, use string comparison techniques instead of `new Date()`. Always provide a fallback (like `a.date || ''`) so `undefined` properties don't throw errors.
