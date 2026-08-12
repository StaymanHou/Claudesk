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
