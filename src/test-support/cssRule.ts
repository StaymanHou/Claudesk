// Shared CSS-rule matcher for source guards that assert "this class has a rule".
//
// ⚠️ Extracted at the 2026-08-12 paydown sweep from `docsPanelStyles.test.ts`, which had
// already been burned once. The naive form — `css.includes("." + cls)` — is a SUBSTRING test,
// so a shorter class name is satisfied by any longer one that starts with it. That is not a
// hypothetical: fixing the first occurrence immediately surfaced a real defect, and a sweep of
// `App.css` found **17 prefix-shadowing pairs among 24 `picker-*` classes alone** — including
// `.picker-recent-model`, whose rule could be deleted outright while its guard stayed green
// because `.picker-recent-model-input` still matched.
// (`SURFACE-2026-08-02-CSS-CLASS-GUARDS-MAY-USE-SUBSTRING-NOT-BOUNDARY-MATCH`.)
//
// Kept in `src/test-support/` rather than beside one test so the next guard that needs it
// imports the fixed version instead of re-deriving the broken one.

/**
 * Whether `css` defines a rule for `cls`, matching on a CLASS-NAME BOUNDARY.
 *
 * A class name may be followed only by a non-name character (`{`, `,`, `:`, `.`, ` `, a
 * combinator, a newline) — never by `-`, a letter, or a digit, which would make it a
 * different, longer class.
 */
export function hasRule(css: string, cls: string): boolean {
  const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\.${escaped}(?![\\w-])`).test(css);
}

/**
 * Whether `css` defines a **BASE** rule for `cls` — the class followed only by optional
 * whitespace and `{`. No pseudo-class, no descendant, no attribute qualifier.
 *
 * ⚠️ **Use this, not {@link hasRule}, whenever the question is "is this element styled?"**
 * `hasRule`'s boundary deliberately admits `:` (a class legitimately *has* a rule when only
 * `.cls:hover` exists), which makes it the wrong question for an emitted-class audit. That
 * distinction was MEASURED, not reasoned: deleting the entire `.workspace-skill-btn { … }`
 * block — padding, border, font, cursor — left `skillButtons.test.ts` green at 21/21, because
 * `.workspace-skill-btn:hover` still existed. The base declaration, everything that makes the
 * button look like a button, was gone while the guard reported styled.
 * (`SURFACE-2026-08-14-CSS-CLASS-GUARDS-SATISFIED-BY-A-PSEUDO-CLASS-MODIFIER`.)
 *
 * ⚠️ **`hasRule` is NOT at fault and must not be "fixed" to exclude `:`** — the two answer
 * different questions and both are needed. Ask `hasBaseRule` for "is it styled", `hasRule` for
 * "is it mentioned at all" (e.g. proving a retired class's rule is GONE, where a surviving
 * `:hover` is just as dead as a surviving base rule).
 *
 * Exported at the 2026-08-18 paydown sweep (WP5). It had been written inline in
 * `skillButtons.test.ts` and never shared, so the other three `hasRule` call sites kept asking
 * the weaker question — the same "extracted so the next guard imports the fixed version instead
 * of re-deriving the broken one" reason `hasRule` itself lives here.
 */
export function hasBaseRule(css: string, cls: string): boolean {
  // ⚠️ Escaped, unlike the original inline copy, which interpolated `cls` raw. Every current
  // caller passes a plain class name, so this fixes no live defect — but an unescaped `.` or
  // `-`-adjacent metacharacter in a future class name would silently widen the match.
  const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // ⚠️ `[{,]`, not `{` — a base rule is equally a base rule when the class is one member of a
  // COMMA GROUP (`.docs-panel-empty,\n.docs-panel-error { … }`). The `{`-only form was written
  // first and immediately produced a FALSE POSITIVE on exactly that shape, which matters more
  // than a missed detection: a guard that flags correct code is how guards get deleted by the
  // next person who hits it. Still excludes `:` and descendants, which is the whole point.
  return new RegExp(`\\.${escaped}\\s*[{,]`).test(css);
}
