## 2024-06-15 - Optimizing ISO Date Sorting
**Learning:** `String.prototype.localeCompare()` is significantly slower than standard lexicographical string comparison operators (`<`, `>`). For standardized strings like ISO dates (`YYYY-MM-DD`), basic string comparison is safe, completely accurate, and heavily avoids localization overhead during sorting.
**Action:** When sorting standard formatted date strings in arrays, always use `a > b ? 1 : -1` logic rather than `a.localeCompare(b)`.
