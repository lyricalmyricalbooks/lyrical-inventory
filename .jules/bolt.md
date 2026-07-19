## 2024-05-15 - Optimizing _reconLikelyAlreadyLogged
 **Learning:** When creating a memoization/cache invalidation stamp for a deeply nested object like `states`, using `.map().join(',')` to generate a string signature creates unnecessary arrays and string allocations that trigger GC pressure if called in a hot loop (like classifying every stripe payment).
 **Action:** Switched to maintaining a simple numeric sum of history lengths via a `for...of` loop. This avoids intermediate allocations while providing the same cache invalidation guarantees.
