/**
 * Strip comments from source text before matching it in a guard.
 *
 * ⚠️ LOAD-BEARING, not tidiness. A guard that matches an identifier against RAW source can be
 * satisfied by the module's OWN PROSE — which makes it vacuous exactly when the code it
 * describes has been deleted, since a good deletion usually leaves a "do not bring this back"
 * note behind (`docs/lessons/source-text-guards.md`, entries 13 and 14, and the memory
 * `[[raw-guard-identifier-satisfied-by-own-comments]]`). Both prompt-module guards that use
 * this were proven to still bite with the target prop deleted *while its explanatory comment
 * remained*, which is the case that fails without stripping.
 *
 * Extracted at code review: three inlined copies of this regex triple had accumulated in one
 * test file. Copies of it also exist in several other suites across the repo — those are
 * deliberately left alone here rather than swept, since each lives beside the guard it serves
 * and a cross-cutting refactor is not this feature's business.
 *
 * Handles the three comment forms that appear in this codebase's `.ts`/`.tsx` sources: the
 * JSX-expression form, the block form, and whole-line `//`. (Spelling those two delimiters out
 * here would terminate this very comment — `[[block-comment-terminated-by-regex-star-slash]]`;
 * read the regexes below instead.) It deliberately does NOT strip a trailing `//` comment that
 * follows code on the same line — a guard asserting a CALL SHAPE wants that line's code to
 * survive.
 */
export function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
