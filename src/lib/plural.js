// The one-or-many word picker shared by the app's count sentences
// ("1 order needs you" / "3 orders need you").

/**
 * `one` when `n` is exactly 1, otherwise `many`. Only the word: callers put the
 * number in themselves, so a phrase like "the last copy" can drop it entirely.
 */
export function plural(n, one, many) {
  return n === 1 ? one : many;
}
