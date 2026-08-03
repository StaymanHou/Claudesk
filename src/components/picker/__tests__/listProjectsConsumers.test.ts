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
//   - a calibration block at the bottom proves each assertion can actually FAIL.

/** Strip line and block comments so no assertion can be satisfied by a comment. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Every `invoke(...)("list_projects")` call site, comments excluded. */
function listProjectsCallSites(src: string): string[] {
  return (
    stripComments(src).match(/invoke\s*(?:<[^>]*>)?\s*\(\s*"list_projects"/g) ??
    []
  );
}

const appCode = stripComments(appSource);
const pickerCode = stripComments(pickerSource);

describe("Verdict (b) premise: list_projects' consumer set", () => {
  it("has exactly 3 call sites across the frontend — 2 in App.tsx, 1 in the picker", () => {
    expect(listProjectsCallSites(appSource)).toHaveLength(2);
    expect(listProjectsCallSites(pickerSource)).toHaveLength(1);
  });

  it("both App.tsx consumers use the result ONLY for a count", () => {
    // Each App.tsx call assigns to `projects`, then the sole use is `projects.length`
    // feeding the invite count. If a future edit reads a per-project FIELD here, widening
    // the payload becomes defensible and Verdict (b) should be revisited.
    const countUses =
      appCode.match(/setInviteProjectCount\s*\(\s*projects\.length\s*\)/g) ??
      [];
    expect(countUses).toHaveLength(2);

    // ...and no App.tsx call site destructures or indexes a project record.
    expect(appCode).not.toMatch(/projects\s*\[\s*\d+\s*\]\s*\./);
    expect(appCode).not.toMatch(/projects\.map\s*\(/);
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

  it("an App.tsx consumer switching to field access would be caught", () => {
    const mutated = stripComments(
      appSource + `\nconst m = projects.map((p) => p.x);\n`,
    );
    expect(mutated).toMatch(/projects\.map\s*\(/);
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
