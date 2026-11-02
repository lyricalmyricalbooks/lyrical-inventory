## 2023-10-24 - Avoid Filter/Includes for Array Partitioning
**Learning:** Partitioning an array into two subsets using `array.filter()` and a subsequent `array.filter(item => !firstSubset.includes(item))` degrades to $O(N^2)$ time complexity. This causes severe bottlenecks in hot paths processing larger lists.
**Action:** Replace partitioned filtering with a single imperative loop (`for...of`) that evaluates the condition once and distributes elements into the two arrays. This achieves $O(N)$ time and eliminates intermediate allocations.

## $(date +%Y-%m-%d) - Replace array method chain with imperative loop for artist payouts
**Learning:** Declarative array methods like `.filter().map().join()` create intermediate arrays for every step of the chain. While readable, chaining them inside tight loops or UI rendering paths causes significant garbage collection (GC) pressure and performance overhead due to unnecessary memory allocation.
**Action:** In frequently executed paths, replace chained array methods with a single imperative loop (`for...of`) and a scalar accumulator (like string concatenation). This reduces multiple `O(N)` passes to a single `O(N)` pass without intermediate object allocations.

## $(date +%Y-%m-%d) - Combine chained filter and reduce arrays into a single loop
**Learning:** Using separate chained arrays (like `.reduce` to sum values and `.filter(...).length` to count matching subsets) on the exact same dataset forces multiple `O(N)` scans and unnecessary array allocations.
**Action:** Replace multiple `.filter` and `.reduce` passes that iterate over the same array with a single imperative loop.
