import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  actionForIntent,
  rowAffordances,
  type OpenIntent,
} from "../announceRow";
import {
  cellsAreFlatSiblings,
  isSiblingOfOpenButton,
  modelCellPosition,
  PICKER_ROW_CELLS,
} from "../pickerRowOrder";
import type { AnnounceMap } from "../../../state/predictAction";

// M12 WP3 Phase 3 — the picker row's announcement, the ⏵ second door, and the gate.

const P = "/Users/x/proj";
const RESTORE: AnnounceMap = { [P]: "restore" };
const CONTINUE: AnnounceMap = { [P]: "continue" };
const EMPTY: AnnounceMap = {};

describe("rowAffordances — one conditional governs the label AND the button", () => {
  it("announces the literal command and shows the door for the restore arm", () => {
    const a = rowAffordances(P, RESTORE, true);
    expect(a.announcement).toBe("/session-restore");
    expect(a.showNoFireDoor).toBe(true);
    expect(a.action).toEqual({ kind: "inject", command: "/session-restore" });
  });

  it("announces 'continue' and shows the door for the argv arm", () => {
    const a = rowAffordances(P, CONTINUE, true);
    expect(a.announcement).toBe("continue");
    expect(a.showNoFireDoor).toBe(true);
    expect(a.action).toEqual({ kind: "argv", flag: "--continue" });
  });

  it("shows NEITHER when the project has no prediction", () => {
    // The load-bearing pairing: with no action both doors are identical, so a second
    // button would be a control that provably does nothing.
    const a = rowAffordances(P, EMPTY, true);
    expect(a.announcement).toBeNull();
    expect(a.showNoFireDoor).toBe(false);
    expect(a.action).toBeNull();
  });

  it("the label and the button are never independently present", () => {
    // Asserted across EVERY input rather than case-by-case, because the defect this
    // guards is "someone adds a second `action !== null` check and the two drift".
    for (const map of [
      RESTORE,
      CONTINUE,
      EMPTY,
      { other: "restore" } as AnnounceMap,
    ]) {
      for (const enabled of [true, false]) {
        const a = rowAffordances(P, map, enabled);
        expect(
          (a.announcement !== null) === a.showNoFireDoor,
          `label and door disagreed for ${JSON.stringify(map)} enabled=${enabled}`,
        ).toBe(true);
      }
    }
  });

  it("a project absent from the map announces nothing (absent key = no prediction)", () => {
    expect(
      rowAffordances(P, { "/other/path": "restore" }, true).action,
    ).toBeNull();
  });
});

describe("the gate — PER ARM, not per feature (operator decision 2026-08-05)", () => {
  it("gate OFF keeps the continue arm and drops the restore arm", () => {
    // ⚠️ THE PHASE 3.5 CONTRACT, and both halves live in ONE test on purpose.
    //
    // Split across two tests, a regression that re-gates EVERYTHING fails only the first
    // and one that un-gates everything only the second — each reading as "one test is
    // wrong" rather than "the split is gone". Together, the pair states the *asymmetry*,
    // which is the actual property. Mirrors the Rust twin
    // (`gate_off_keeps_the_continue_arm_and_drops_the_restore_arm`).
    const cont = rowAffordances(P, CONTINUE, false);
    expect(cont.action).toEqual({ kind: "argv", flag: "--continue" });
    expect(cont.announcement).toBe("continue");
    expect(cont.showNoFireDoor).toBe(true);

    const rest = rowAffordances(P, RESTORE, false);
    expect(rest.action).toBeNull();
    expect(rest.announcement).toBeNull();
    expect(rest.showNoFireDoor).toBe(false);
  });

  it("gate ON leaves both arms available (regression guard on the ON path)", () => {
    // The change is to the OFF path; this pins that it did not disturb the ON path, which
    // is where every pre-3.5 verification lives.
    expect(rowAffordances(P, CONTINUE, true).action).not.toBeNull();
    expect(rowAffordances(P, RESTORE, true).action).not.toBeNull();
  });

  it("a gated-out arm collapses COMPLETELY, never half-rendered", () => {
    // The seam contract still holds arm-wise: a gated surface must not EXIST when off —
    // not rendered-then-hidden, not present-but-disabled, not a no-op handler. All three
    // fields collapse together so the component renders no element at all.
    const a = rowAffordances(P, RESTORE, false);
    expect([a.announcement, a.showNoFireDoor, a.action]).toEqual([
      null,
      false,
      null,
    ]);
  });

  it("the gate wins over a stale map — for the GATED arm", () => {
    // ⚠️ Name corrected at Phase 3.5. This test PASSED unchanged through the decoupling,
    // because its fixture is `RESTORE` — the arm that is still gated. Its old name ("the
    // gate wins even when the map somehow carries a prediction") claimed a whole-feature
    // scope that is no longer true, and a green test with an overstated name is how a
    // future reader concludes the gate still collapses everything.
    //
    // What it genuinely checks is belt-and-braces with the server-side gate: the frontend
    // does not depend on the backend having already filtered, so a stale map cannot
    // resurrect a gated surface.
    expect(rowAffordances(P, RESTORE, false).action).toBeNull();
  });
});

describe("actionForIntent — the two doors", () => {
  const action = rowAffordances(P, RESTORE, true).action;

  it("the fire door fires the re-derived action", () => {
    expect(actionForIntent(action, "fire")).toEqual({
      kind: "inject",
      command: "/session-restore",
    });
  });

  it("the no-fire door fires NOTHING, whatever the action was", () => {
    expect(actionForIntent(action, "no-fire")).toBeNull();
    expect(
      actionForIntent({ kind: "argv", flag: "--continue" }, "no-fire"),
    ).toBeNull();
  });

  it("both intents are reachable and distinguishable", () => {
    // WP2's lesson: a member with no caller is invisible to an exhaustiveness test. Assert
    // each intent produces a DIFFERENT outcome, so neither is vestigial.
    const intents: OpenIntent[] = ["fire", "no-fire"];
    const results = intents.map((i) => actionForIntent(action, i));
    expect(results[0]).not.toEqual(results[1]);
  });
});

describe("the row structure (⏵ nests INSIDE the open button — operator spec 2026-08-04)", () => {
  // ⚠️ REVISED after the operator saw the rendered UI. The first build put the
  // announcement and the ⏵ in their own SIBLING cells, reading pickerRowOrder.ts's nesting
  // rule as "nothing may sit inside the open box." Three problems, all visible only in a
  // screenshot: the sibling cells SHRANK the open button (so paths truncated on announcing
  // rows and the rows no longer lined up), the ⏵ floated unstyled in dead space, and it
  // contradicted the operator's earlier instruction that the title box auto-fires with a
  // small in-box button for the no-fire case.
  //
  // The rule, read precisely, forbids a nested `<button>` — a button-in-button cannot
  // disambiguate the click. Inert content and a `<span role="button">` with
  // stopPropagation are fine; `TileActionButton.tsx` uses exactly that for the same
  // problem in the filmstrip, and its header cites this very rule.

  it("the declared cell order is back to the M11.5 three", () => {
    expect([...PICKER_ROW_CELLS]).toEqual(["open", "model", "remove"]);
  });

  it("the declared row is a flat sequence with exactly one open cell", () => {
    expect(cellsAreFlatSiblings()).toBe(true);
  });

  it("the model cell still sits after open and before remove", () => {
    const pos = modelCellPosition();
    expect(pos.index).toBe(1);
    expect(pos.afterOpen).toBe(true);
    expect(pos.beforeRemove).toBe(true);
  });

  it("isSiblingOfOpenButton is documented as tautological, and still agrees", () => {
    expect(isSiblingOfOpenButton("model")).toBe(true);
    expect(isSiblingOfOpenButton("open")).toBe(false);
  });
});

describe("the component's structure (source guards — STRUCTURE only, never runtime)", () => {
  // ⚠️ These are `?raw`-class guards and this repo has been bitten three times by them.
  // Mitigations applied: comments are stripped before matching, assertions are on
  // single identifiers or call shapes rather than formatted multi-line expressions, and a
  // non-vacuity check runs first. They pin STRUCTURE; the runtime proof is the operator's
  // click at verify-human plus the live MCP-bridge run at verify-self.
  const src = readFileSync(
    fileURLToPath(new URL("../ProjectPicker.tsx", import.meta.url)),
    "utf8",
  );
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("the source is readable (non-vacuity guard)", () => {
    expect(code.length).toBeGreaterThan(2000);
    expect(code).toContain("PICKER_ROW_CELLS.map");
  });

  it("the no-fire control is a span role=button, never a nested <button>", () => {
    // ⚠️ THE STRUCTURAL RULE. A `<button>` inside the open `<button>` is invalid HTML whose
    // failure mode is SILENT: the inner control's clicks surface on the outer handler, so it
    // looks like it does the wrong thing rather than like it is broken.
    expect(code).toContain('role="button"');
    expect(code).toContain("picker-recent-nofire");
    // The open cell must contain exactly ONE <button> tag — the open button itself.
    const openCase = code.slice(
      code.indexOf('case "open"'),
      code.indexOf('case "model"'),
    );
    expect((openCase.match(/<button/g) ?? []).length).toBe(1);
  });

  it("the nested control stops propagation on BOTH pointerdown and click", () => {
    // Without either, the outer open-and-fire handler runs too — the exact silent defect.
    const openCase = code.slice(
      code.indexOf('case "open"'),
      code.indexOf('case "model"'),
    );
    expect(openCase).toContain("onPointerDown");
    expect(
      (openCase.match(/stopPropagation\(\)/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("the nested control has a keyboard mirror (a span has no implicit activation)", () => {
    const openCase = code.slice(
      code.indexOf('case "open"'),
      code.indexOf('case "model"'),
    );
    expect(openCase).toContain("onKeyDown");
    expect(openCase).toContain('e.key === "Enter"');
  });

  it("the ⏵ gutter is rendered UNCONDITIONALLY — the P3.9 fix", () => {
    // ⚠️ THE DEFECT THIS PINS, measured live at verify-human 2026-08-05. The gutter used
    // to be `{showNoFireDoor && <span class="picker-recent-nofire" …/>}` placed directly as
    // a sibling of `.picker-recent-text`, which is `flex: 1 1 auto` — so a row with NO
    // prediction ABSORBED the missing control's width. Result: 369px of text stack without
    // a badge vs 331px with one, so a 37-char name truncated mid-word while a LONGER
    // 35-char name on the adjacent row rendered in full. Rows disagreed about how much
    // project name you get, for a reason the reader cannot see.
    //
    // The property: the gutter element appears OUTSIDE any conditional. Asserted by
    // locating the gutter and the conditional and comparing positions, because "contains
    // the class name" would pass on the broken version too — the broken version also
    // contained it, just inside the `&&`.
    const openCase = code.slice(
      code.indexOf('case "open"'),
      code.indexOf('case "model"'),
    );
    const gutter = openCase.indexOf('className="picker-recent-gutter"');
    const conditional = openCase.indexOf("{showNoFireDoor &&");
    expect(gutter).toBeGreaterThan(-1);
    expect(conditional).toBeGreaterThan(-1);
    // The gutter must open BEFORE the conditional — i.e. the conditional is nested inside
    // it, governing only the control. If a refactor hoists the conditional back out, this
    // ordering inverts and the test fails.
    expect(gutter).toBeLessThan(conditional);
  });

  // ⚠️ THREE SEPARATE PROPERTIES, THREE SEPARATE TESTS — deliberately not one.
  // The first draft asserted the fixed basis AND `pointer-events` in a single test, and
  // mutation testing showed BOTH mutants tripping that one test. That is the
  // redundant-controls masking pattern this repo has now paid for twice (M11's
  // `rehype-raw`/`rehype-sanitize` measurement; Phase 1's veto masking the marker
  // regression): when two independent properties share one assertion, either can regress
  // unnoticed while the other holds the test up, and the green tells you nothing about
  // which. Each mutant must be attributable to its own test
  // (`[[guard-predicate-completeness-vs-mutation-landing]]`).
  //
  // ⚠️ CSS is read with node:fs, NOT `?raw` — Vite's CSS plugin intercepts `?raw` on a
  // .css file and returns processed output rather than source text
  // (`[[vitest-raw-import-css-returns-processed-not-text]]`).
  const css = readFileSync(
    fileURLToPath(new URL("../../../App.css", import.meta.url)),
    "utf8",
  );
  const gutterBlock = (): string => {
    const start = css.indexOf(".picker-recent-gutter {");
    expect(start).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("}", start));
  };

  it("the gutter's width is a FIXED basis, never flexible", () => {
    // If this becomes `auto` or gains flex-grow, the collapse-when-empty behavior returns
    // and the P3.9 defect comes back silently — the stack re-absorbs the gutter's width.
    expect(gutterBlock()).toMatch(/flex:\s*0\s+0\s+1\.9em/);
  });

  it("an EMPTY gutter does not swallow clicks meant for the open button", () => {
    // Reserving the box trades one defect for a worse one if the empty box becomes a dead
    // click zone on every non-announcing row. `pointer-events: none` on the gutter is the
    // mechanism; the child rule re-enables it for the ⏵ itself, without which the control
    // would be unclickable — presenting as "the control does nothing", the same silent
    // class as the nesting defect.
    expect(gutterBlock()).toContain("pointer-events: none");
    expect(css).toContain(".picker-recent-gutter > *");
  });

  it("an empty gutter stays out of the accessibility tree", () => {
    // A reserved spacing box is not content; announcing it would add a meaningless node to
    // every non-announcing row.
    const openCase = code.slice(
      code.indexOf('case "open"'),
      code.indexOf('case "model"'),
    );
    expect(openCase).toContain("aria-hidden={!showNoFireDoor}");
  });

  it("the gutter's reserved width matches the control's own width", () => {
    // A gutter narrower than the control overflows it; wider leaves dead margin on every
    // row. Both are stated as 1.9em; this asserts they stay equal rather than trusting a
    // comment. Read from CSS source, not `?raw` (see above).
    const widthIn = (selector: string): string | null => {
      const start = css.indexOf(`${selector} {`);
      if (start === -1) return null;
      const block = css.slice(start, css.indexOf("}", start));
      return /width:\s*([0-9.]+em)/.exec(block)?.[1] ?? null;
    };
    const control = widthIn(".picker-recent-nofire");
    expect(control).toBe("1.9em");
    expect(gutterBlock()).toContain(control as string);
  });

  it("the click path RE-DERIVES via rowAffordances rather than reading the label", () => {
    // WP1 Verdict (b)'s load-bearing rule. Asserted as a CALL shape (`rowAffordances(`)
    // rather than a bare identifier, because a bare identifier is satisfied by the
    // module's own import line or a comment mentioning it.
    expect(code).toContain("rowAffordances(");
    expect(code).toContain("actionForIntent(");
  });

  it("onOpen forwards the LIVE intent, not a hardcoded door (P4.6)", () => {
    // ⚠️ MUTATION-DERIVED, and it caught a hole in this suite. `onOpen(projectPath,
    // actionForIntent(action, intent), "fire")` — the ⏵ door authorizing the argv arm again,
    // i.e. the shipped defect restored one layer up from `XtermPane` — passed `tsc` AND all
    // 1887 tests. The boundary guard in `pickerOnOpenArity.test.ts` watches the spawn `invoke`
    // and cannot see this call site at all, which is the same "guarded one of two call sites"
    // shape M12 keeps paying for.
    //
    // So: the third argument must be the `intent` VARIABLE. A literal fails.
    expect(code).toMatch(
      /onOpen\(\s*projectPath,\s*actionForIntent\(action,\s*intent\),\s*intent,?\s*\)/,
    );
    expect(code).not.toMatch(
      /onOpen\(\s*projectPath,\s*actionForIntent\([^)]*\),\s*"(fire|no-fire)"/,
    );
  });

  it("the gate is read through the HOOK, never via an ad-hoc invoke or the raw getter", () => {
    // ⚠️ The two forbidden identifiers are ASSEMBLED at runtime rather than written as
    // literals. The OFF-invariant guard's bypass scan is a plain substring match over
    // source files and cannot distinguish a real call from a negative assertion about one —
    // so spelling them here would make THIS FILE an offender and fail that guard. The trap
    // is documented in `SURFACE-2026-08-03-OFF-INVARIANT-GUARD-MISSES-NON-REGISTRY-SURFACES`
    // ("a fourth arm should not deepen that trap"); this is the same hazard from the other
    // side, and the fix is to not hand the scanner a false positive.
    const rawCommand = ["workflow", "get", "features", "enabled"].join("_");
    const rawGetter = `get${"WorkflowFeaturesEnabled"}`;

    expect(code).toContain("useWorkflowFeaturesEnabled()");
    expect(code).not.toContain(`invoke("${rawCommand}"`);
    expect(code).not.toContain(`${rawGetter}(`);
  });

  it("the per-arm split has ONE home, and the component does not re-decide it", () => {
    // ⚠️ P3.5.5 — the per-surface guard, updated for the per-arm gate.
    //
    // THE RULE THIS ENCODES: `armAvailable` (in `announceRow.ts`) is the single place that
    // decides which arms survive an OFF gate. The component must NOT contain its own
    // gate-vs-arm conditional, because two homes drift — and the drift is invisible, since
    // both would still render *something*.
    //
    // The component's only legitimate gate use is passing the hook's value INTO
    // `rowAffordances`. So: the hook appears, `rowAffordances(` appears, and no expression
    // pairing the gate value with an arm/kind discriminator appears here.
    const squeezed = code.replace(/\s+/g, "");
    expect(squeezed.length).toBeGreaterThan(2000); // non-vacuity
    expect(squeezed).toContain("rowAffordances(");
    // A component-side arm test would have to name a kind to branch on. None may appear.
    for (const kindLiteral of ['"argv"', '"inject"']) {
      expect(
        squeezed,
        `ProjectPicker must not branch on an action kind (${kindLiteral}) — the per-arm ` +
          "gate decision belongs to armAvailable() in announceRow.ts, which is where it is " +
          "mutation-proven. Two homes for this rule drift silently.",
      ).not.toContain(kindLiteral);
    }
  });

  it("⚠️ the CONTINUE arm is INTENTIONALLY ungated — read this before 'fixing' it", () => {
    // This test exists to be READ, and it is deliberately placed in the gate section.
    //
    // WP5 owns the OFF-invariant guard's fourth arm, which will scan non-registry surfaces
    // (a picker cell, a spawn-time action) — exactly where this feature lives. When it
    // lands, an ungated workflow-adjacent surface is PRECISELY the shape it is built to
    // flag, and the honest response is a **documented per-arm exemption**, never a narrowed
    // predicate that stops looking. The applicability reason is stated at `armAvailable`
    // and mirrored in `src-tauri/src/announce/mod.rs`.
    //
    // The short version, so it survives without the prose: the unclean-exit flag is written
    // by Claudesk's own workspace lifecycle into Claudesk's own `session-state.json`, and
    // `--continue` is a stock Claude Code CLI flag. Nothing in that arm reads
    // `~/.claude/skills/` or `workflow-system/`. It applies to every Claude Code user, so
    // gating it was a mis-application of the design prior (which keys on APPLICABILITY, not
    // audience size). Precedent: `hook_install` is likewise universal and runs with the
    // gate OFF.
    const off = rowAffordances(P, CONTINUE, false);
    expect(
      off.action,
      "if this assertion is failing, the CONTINUE arm has been re-gated — that is a " +
        "product regression (operator decision 2026-08-05), not a guard fix",
    ).toEqual({ kind: "argv", flag: "--continue" });
  });

  it("the announce call is made ONCE, not per row", () => {
    // The N+1 this surface already shipped once (M11.5 WP1's model cell). One occurrence
    // of the invoke, and it must not appear inside the row map.
    //
    // ⚠️ MATCHED ON A WHITESPACE-FLATTENED HAYSTACK, and that is not incidental. The
    // original pattern was `/invoke<[^>]*>\("picker_announce_actions"\)/` against raw
    // source, which requires the whole call to sit on ONE line. Adding the gutter fix
    // (2026-08-05) pushed the file past Prettier's width, Prettier wrapped the call across
    // four lines, and this guard silently matched ZERO while the call was completely
    // correct — a FALSE FAILURE this time, but the same mechanism yields a false PASS when
    // the assertion is a `not.toContain`. It is the exact hazard CLAUDE.md names ("assert
    // single identifiers — never formatted multi-line expressions") and the second time
    // this repo has paid it. Flattening makes the guard independent of where Prettier wraps
    // (`[[raw-guard-jsx-prose-needs-flattened-haystack]]`).
    // Whitespace collapsed to nothing at all, so the pattern cannot depend on WHERE
    // Prettier chose to break. Matching `invoke<...>("picker_announce_actions"` this way
    // is agnostic to every reflow, including future ones.
    const squeezed = code.replace(/\s+/g, "");
    // Non-vacuity: squeezing an empty string yields an empty string, which would pass a
    // count-of-zero assertion trivially if the loader ever returned nothing.
    expect(squeezed.length).toBeGreaterThan(2000);
    const calls =
      squeezed.match(/invoke<[^>]*>\("picker_announce_actions"/g) ?? [];
    expect(calls.length).toBe(1);
    // The row map starts at PICKER_ROW_CELLS.map — the call must precede it.
    const callAt = code.indexOf("picker_announce_actions");
    const mapAt = code.indexOf("PICKER_ROW_CELLS.map");
    expect(callAt).toBeGreaterThan(-1);
    expect(mapAt).toBeGreaterThan(-1);
    expect(callAt).toBeLessThan(mapAt);
  });

  it("Open Folder… passes an explicit null rather than relying on map absence", () => {
    // ⚠️ TRIAGED, NOT REWRITTEN AWAY, at P4.6. The old assertion was the exact literal
    // `onOpen(picked, null)`, which P4.6 had to change — and the change is the point rather than
    // churn: `null` suppresses only the INJECT arm. This path can reach a project whose unclean
    // flag is set (re-picking a folder already in recents), and the ARGV arm is resolved in the
    // backend from that flag, so `null` alone would have let "Open Folder…" resume. The test's
    // intent ("this door never auto-fires") is unchanged; what it takes to satisfy it grew.
    expect(code).toMatch(/onOpen\(picked,\s*null,\s*"no-fire"\)/);
  });

  it("BOTH auto-resume arms are suppressed on the Open Folder… path (P4.6)", () => {
    // Stated as two separate expectations so a future edit that drops one is attributable.
    // The pairing is the property: one argument per arm, and neither is redundant.
    const call = /onOpen\(picked,([^)]*)\)/.exec(code);
    expect(call).not.toBeNull();
    const args = call![1];
    expect(args).toContain("null"); // inject arm
    expect(args).toContain("no-fire"); // argv arm
  });
});
