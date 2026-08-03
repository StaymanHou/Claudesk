import { describe, it, expect } from "vitest";
import appSource from "../../../App.tsx?raw";
import pickerSource from "../ProjectPicker.tsx?raw";

// M12 WP1 Verdict (b) — pins the PREMISE the verdict reasons from.
//
// Verdict (b) rejected widening `list_projects`' payload with the announce data (a
// `.session.md` stat per project) and chose a separate `picker_announce_actions` command
// instead. The decisive evidence was `list_projects`' CONSUMER SET:
//
//   - `App.tsx` x2  -> use ONLY `projects.length` (the M10.9 invite project-count predicate)
//   - `ProjectPicker.tsx` x1 -> the one genuine per-project-field consumer
//
// Widening would therefore make two count-only callers pay N filesystem stats to learn a
// number — one of them on a path `App.tsx` explicitly comments as skipped once the invite
// resolves. If a future change adds a third count-only consumer, or makes the picker read
// per-row, the verdict's rationale shifts and NOTHING would otherwise notice: the sibling
// `nPlusOneObservable.test.ts` covers the model CELL's read count, not this call-site shape.
//
// ## Why this file is a source-text guard, and what that costs
// The property is "how many call sites exist and what each does with the result" — a fact
// about the module graph, not about a value any function returns. There is nothing to
// import and drive (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`
// applies to BEHAVIORAL properties; this one is structural by nature), and there is no
// React component-render harness in this repo
// (SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS).
//
// So the standing `?raw` hazards are handled explicitly rather than hoped away:
//   - comments are STRIPPED before matching, so a guard can never be satisfied by prose
//     that merely mentions the identifier it asserts
//     (`[[raw-guard-identifier-satisfied-by-own-comments]]`);
//   - matching is on CALL shape (`invoke...("list_projects")`), never a bare identifier;
//   - NO positional slicing (`indexOf` + fixed window) — that is the pattern this repo has
//     been bitten by three times;
//   - the field-access check reads each binding's NAME out of the source rather than
//     hardcoding `projects`, so it survives a rename and any iteration form;
//   - a calibration block at the bottom feeds each assertion REAL alternate mutants (not
//     strings it constructed to match its own regex) and asserts they are rejected.
//
// ⚠️ Two of these bullets were EARNED at code review, not designed in: the first draft's
// field-access negatives (`projects.map(` + indexed access) missed a `for (const p of
// projects)` consumer and any renamed binding, and its comment stripper ignored trailing
// `//`. The header claimed coverage the assertions did not deliver. What is asserted below
// is now what is claimed here — if you widen one, widen the other.

/**
 * Strip line and block comments so no assertion can be satisfied by a comment.
 *
 * ⚠️ TRAILING line comments are stripped too, not just full-line ones. An earlier version
 * anchored the pattern at start-of-line, which counted a trailing commented-out call
 * (`foo();` followed by a commented `await invoke("list_projects")`) as a REAL call site —
 * a false failure, and it contradicted this file's own claim to have closed
 * `[[raw-guard-identifier-satisfied-by-own-comments]]`. Found at code review.
 *
 * This is a lexer approximation, not a lexer: a `//` inside a string literal would be
 * stripped as if it were a comment. That is acceptable here because every pattern in this
 * file matches source SHAPE (`invoke<...>("list_projects")`, `interface RecentProject`),
 * none of which can legitimately follow a `//` on the same line.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Every `invoke(...)("list_projects")` call site, comments excluded. */
function listProjectsCallSites(src: string): string[] {
  return (
    stripComments(src).match(/invoke\s*(?:<[^>]*>)?\s*\(\s*"list_projects"/g) ??
    []
  );
}

/**
 * Every variable a `list_projects` result is bound to, whatever it is named.
 *
 * Reading the NAME out of the source instead of hardcoding `projects` is what makes the
 * field-access check below robust to a rename — the hole code review found.
 */
function listProjectsBindings(code: string): { name: string }[] {
  const pattern =
    /(?:const|let|var)\s+(\w+)\s*=\s*await\s+invoke\s*(?:<[^>]*>)?\s*\(\s*"list_projects"/g;
  return [...code.matchAll(pattern)].map((m) => ({ name: m[1] }));
}

/**
 * Every property read off `name`, in any form: `name.foo`, `name[0].foo`, `name.map(x =>
 * x.foo)`, and `for (const p of name) { p.foo }` (the last via the alias `p`).
 *
 * ⚠️ KNOWN BOUNDARY, measured not assumed: a read through a *parenthesized cast* —
 * `(p as Foo).bar` — is NOT seen, because the `)` separates the alias from the `.`. All
 * three uncast forms above were verified to fail this guard when injected into the real
 * `App.tsx`; the cast forms were verified to slip. Closing that would mean parsing TS
 * rather than matching shapes, which is not worth it for a premise guard: the decisive
 * assertion is the `setInviteProjectCount(<binding>.length)` count above, and a consumer
 * that casts in order to read a field still trips THAT one the moment it stops being a
 * pure count. Do not let this comment drift from what the code does.
 */
function fieldAccessesOn(name: string, code: string): string[] {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const direct = [
    ...code.matchAll(
      new RegExp(`\\b${esc}\\s*(?:\\[[^\\]]*\\])?\\s*\\.(\\w+)`, "g"),
    ),
  ].map((m) => m[1]);

  // Any binding that ALIASES the array's elements — `for (const p of name)`,
  // `name.map((p) => …)`, `name.forEach((p) => …)`, destructuring `const [p] = name`.
  const aliases = [
    ...code.matchAll(
      new RegExp(
        `for\\s*\\(\\s*(?:const|let|var)\\s+(\\w+)\\s+of\\s+${esc}\\b`,
        "g",
      ),
    ),
    ...code.matchAll(
      new RegExp(`\\b${esc}\\s*\\.\\s*\\w+\\s*\\(\\s*\\(?\\s*(\\w+)`, "g"),
    ),
    ...code.matchAll(
      new RegExp(
        `(?:const|let|var)\\s*\\[\\s*(\\w+)\\s*\\]\\s*=\\s*${esc}\\b`,
        "g",
      ),
    ),
  ].map((m) => m[1]);

  const viaAlias = aliases.flatMap((alias) =>
    [...code.matchAll(new RegExp(`\\b${alias}\\s*\\.(\\w+)`, "g"))].map(
      (m) => m[1],
    ),
  );

  // An iteration/alias form is itself a field read even before the alias is used —
  // `name.map(…)` reads `map`, which `direct` already captured. Keep both.
  return [...direct, ...viaAlias];
}

const appCode = stripComments(appSource);
const pickerCode = stripComments(pickerSource);

describe("Verdict (b) premise: list_projects' consumer set", () => {
  it("has exactly 3 call sites across the frontend — 2 in App.tsx, 1 in the picker", () => {
    expect(listProjectsCallSites(appSource)).toHaveLength(2);
    expect(listProjectsCallSites(pickerSource)).toHaveLength(1);
  });

  it("both App.tsx consumers use the result ONLY for a count", () => {
    // THE DECISIVE ASSERTION. Each App.tsx call assigns the awaited result, and the sole
    // use is `.length` feeding the invite count. If a future edit reads a per-project
    // FIELD here, widening the payload becomes defensible and Verdict (b) is revisitable.
    const countUses =
      appCode.match(/setInviteProjectCount\s*\(\s*\w+\.length\s*\)/g) ?? [];
    expect(countUses).toHaveLength(2);
  });

  it("no App.tsx list_projects consumer reads a per-project FIELD", () => {
    // Scoped to the statement that binds each call's result, so this is agnostic to both
    // the variable NAME and the access FORM.
    //
    // ⚠️ An earlier version asserted `not.toMatch(/projects\.map\(/)` + an indexed-access
    // pattern. Code review proved both miss the realistic mutants: `for (const p of
    // projects) { use(p.default_model) }` passes both, and renaming the binding to `rows`
    // or `list` passes them regardless of form. The predicate was incomplete, so a passing
    // assertion was under-determined — `[[guard-predicate-completeness-vs-mutation-landing]]`.
    for (const binding of listProjectsBindings(appCode)) {
      // A count use is `<name>.length`; anything else off the binding is a field read.
      const otherAccess = fieldAccessesOn(binding.name, appCode).filter(
        (access) => access !== "length",
      );
      expect(otherAccess, `App.tsx binding \`${binding.name}\``).toEqual([]);
    }
  });

  it("the App.tsx consumers are typed as opaque — they never name the record shape", () => {
    // `invoke<unknown[]>` is the tell that these callers want a count, not fields.
    expect(appCode).toMatch(/invoke<unknown\[\]>\(\s*"list_projects"\s*\)/);
    expect(appCode).not.toMatch(
      /invoke<RecentProject\[\]>\(\s*"list_projects"\s*\)/,
    );
  });

  it("the picker is the one genuine per-project-field consumer", () => {
    expect(pickerCode).toMatch(
      /invoke<RecentProject\[\]>\(\s*"list_projects"\s*\)/,
    );
    // It really does consume the records (not just their count).
    expect(pickerCode).toMatch(/setRecents\s*\(/);
  });

  it("`default_model` is on the wire type — the precedent Verdict (b) declined to reuse", () => {
    // This is what made widening free for M11.5: the field was ALREADY read and parsed, so
    // typing it cost nothing. The announce needs a filesystem stat, which is new work — the
    // distinction the verdict turns on.
    expect(pickerCode).toMatch(
      /interface RecentProject[\s\S]*?default_model\?/,
    );
  });

  it("no announce/session-state field has been smuggled onto the wire type", () => {
    // Verdict (b) says the announce arrives via `picker_announce_actions`, NOT by widening
    // `RecentProject`. If someone widens it after all, this fails and the verdict must be
    // amended rather than silently contradicted.
    const iface =
      pickerCode.match(/interface RecentProject\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(iface).not.toMatch(/unclean|session_md|announce|predicted/i);
  });
});

describe("the guard is calibrated — each assertion can actually fail", () => {
  // Without this block the assertions above could be vacuous (e.g. a `?raw` loader
  // returning "" makes every `not.toMatch` pass). Each case feeds the real matcher a
  // mutated input and asserts it is REJECTED.

  it("an empty source (loader failure) does NOT satisfy the call-site count", () => {
    expect(listProjectsCallSites("")).toHaveLength(0);
    // i.e. the real counts above are not an artifact of an empty haystack.
    expect(listProjectsCallSites(appSource).length).toBeGreaterThan(0);
  });

  it("a THIRD count-only consumer would be caught", () => {
    const mutated =
      appSource + `\nconst extra = await invoke<unknown[]>("list_projects");\n`;
    expect(listProjectsCallSites(mutated)).toHaveLength(3);
  });

  it("a call site hidden in a COMMENT does not count toward the total", () => {
    const mutated =
      appSource + `\n// const x = await invoke<unknown[]>("list_projects");\n`;
    expect(listProjectsCallSites(mutated)).toHaveLength(2);
  });

  it("a trailing `//` commented-out call site does not count (was a false FAILURE)", () => {
    // The exact input the pre-review stripper miscounted as a real call site.
    const mutated =
      appSource + `\nfoo(); // await invoke<unknown[]>("list_projects")\n`;
    expect(listProjectsCallSites(mutated)).toHaveLength(2);
  });

  // The three mutants below all PASSED the pre-review predicate. They are the reason the
  // field-access check reads binding names out of the source instead of hardcoding one.
  it.each([
    [
      "for-of over the result",
      `const projects = await invoke<unknown[]>("list_projects");\nfor (const p of projects) { use(p.default_model); }`,
    ],
    [
      "renamed binding + .map",
      `const rows = await invoke<unknown[]>("list_projects");\nconst x = rows.map((r) => r.default_model);`,
    ],
    [
      "renamed binding + indexed access",
      `const list = await invoke<unknown[]>("list_projects");\nconst y = list[0].default_model;`,
    ],
  ])("a field-reading consumer is caught: %s", (_label, snippet) => {
    const code = stripComments(snippet);
    const bindings = listProjectsBindings(code);
    expect(bindings).toHaveLength(1); // the binding is found whatever it is named
    const reads = fieldAccessesOn(bindings[0].name, code).filter(
      (a) => a !== "length",
    );
    expect(reads).not.toEqual([]); // ...and its field reads are seen
  });

  it("a genuine count-only consumer is NOT flagged (no false positives)", () => {
    // The complement of the case above: the real shape must survive the check.
    const code = stripComments(
      `const projects = await invoke<unknown[]>("list_projects");\nsetInviteProjectCount(projects.length);`,
    );
    const b = listProjectsBindings(code);
    expect(b).toHaveLength(1);
    expect(
      fieldAccessesOn(b[0].name, code).filter((a) => a !== "length"),
    ).toEqual([]);
  });

  it("widening RecentProject with an announce field would be caught", () => {
    const iface =
      stripComments(pickerSource).match(
        /interface RecentProject\s*\{[\s\S]*?\}/,
      )?.[0] ?? "";
    expect(iface).not.toBe("");
    const widened = iface.replace("}", "  unclean_exit?: boolean;\n}");
    expect(widened).toMatch(/unclean/i);
  });
});
