## 2023-10-24 - Avoid Filter/Includes for Array Partitioning
**Learning:** Partitioning an array into two subsets using `array.filter()` and a subsequent `array.filter(item => !firstSubset.includes(item))` degrades to $O(N^2)$ time complexity. This causes severe bottlenecks in hot paths processing larger lists.
**Action:** Replace partitioned filtering with a single imperative loop (`for...of`) that evaluates the condition once and distributes elements into the two arrays. This achieves $O(N)$ time and eliminates intermediate allocations.
