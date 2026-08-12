// Bounded source slicing for `?raw` guards.
//
// ⚠️ Fixed-width windows (`src.slice(at, at + 90)`) are a false-positive generator in BOTH
// directions, and this repo has been bitten each way:
//   - too wide → the window spills onto the NEXT syntactic unit, so a negative assertion
//     ("this branch must not call resolveInvite") fires on a neighbour that legitimately does.
//     Measured at `at + 120` in `workflowInviteCopy.test.ts`.
//   - too narrow, or one Prettier reflow later → the window silently stops covering the thing
//     it exists to check, and the guard reports green.
// A non-greedy `\{[^}]*\}` match has the same problem from the other end: it stops at the FIRST
// closing brace, truncating any block containing a nested object or arrow body
// (`SURFACE-2026-08-03-QUALITY-WP1-RAW-GUARD-INTERFACE-SLICE-TRUNCATES`).
//
// Bound to the syntactic unit instead. See `docs/lessons/source-text-guards.md` §4.

/**
 * The brace-matched block starting at or after `from`, including its delimiters.
 *
 * Counts depth rather than matching to the first `}`, so nested objects, arrow bodies, and JSX
 * expression containers are contained rather than truncating the slice. Returns the remainder
 * of the source if no balanced block is found, which fails loudly at the caller's assertion
 * instead of silently returning an empty — an empty haystack makes every `not.toContain` pass.
 */
export function braceBlockAt(src: string, from: number): string {
  const open = src.indexOf("{", from);
  if (open === -1) return src.slice(from);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  return src.slice(from);
}
