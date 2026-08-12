import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  nextOpenIndicator,
  SESSION_START_COMMAND,
  showSessionStartButton,
} from "../sessionStartButton";
import { predictAction } from "../../../state/predictAction";

// M12 WP3 Phase 5 — the third arm's contract.
//
// Everything drives the REAL imported functions, never a replica
// (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`). Phase 4 paid three
// times for assertions that tested a value the test author wrote rather than one the code
// produced — an inline literal unwrap, an `expect(null).toBeNull()`, and a regex that matched a
// ternary. So where a property is behavioral it is asserted as a VALUE here, and the source
// guards at the bottom are confined to wiring, which no value can observe without a render
// harness (`SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`).

describe("showSessionStartButton — when the manual button exists", () => {
  it("exists when the gate is ON and a session is live", () => {
    expect(
      showSessionStartButton({ workflowEnabled: true, ccSessionId: "cc-1" }),
    ).toBe(true);
  });

  it("does NOT exist when the gate is OFF", () => {
    // ⚠️ The M10.9 seam contract: a gated surface must not EXIST when off — not
    // rendered-then-hidden, not disabled, not a no-op handler. `/session-start` is a
    // companion-workflow skill, so unlike the `--continue` arm it is genuinely gated.
    expect(
      showSessionStartButton({ workflowEnabled: false, ccSessionId: "cc-1" }),
    ).toBe(false);
  });

  it("does NOT exist before a session id resolves", () => {
    // Firing into a null session is a dead click (the WP6 picker MAJOR). Making this a
    // precondition rather than a guard inside the handler means the affordance is absent
    // rather than present-and-broken.
    expect(
      showSessionStartButton({ workflowEnabled: true, ccSessionId: null }),
    ).toBe(false);
  });

  it("is NOT conditioned on the workspace's auto-resume signals", () => {
    // ⚠️ Asserts a DELIBERATE non-condition, so a future reader does not "complete" the
    // decision table by hiding the button when a prediction exists. The table describes what
    // AUTO-FIRES ON OPEN; it says nothing about what the operator may choose afterwards, and
    // hiding the button exactly when there is a decision to make is backwards.
    //
    // The signature is the proof: there is no action/signal parameter to condition on.
    const withLiveSession = { workflowEnabled: true, ccSessionId: "cc-1" };
    expect(showSessionStartButton(withLiveSession)).toBe(true);
    expect(Object.keys(withLiveSession)).toEqual([
      "workflowEnabled",
      "ccSessionId",
    ]);
  });

  it("sends /session-start, and never a name that does not exist", () => {
    expect(SESSION_START_COMMAND).toBe("/session-start");
  });
});

describe("nextOpenIndicator — the unclean flag stops being write-only", () => {
  // Signals are fed through the REAL predictor rather than hand-built actions, so a change to
  // precedence or to an arm's shape reaches these assertions.
  const flagOnly = predictAction({
    uncleanFlag: true,
    sessionMdPresent: false,
  });
  const pointerOnly = predictAction({
    uncleanFlag: false,
    sessionMdPresent: true,
  });
  const neither = predictAction({
    uncleanFlag: false,
    sessionMdPresent: false,
  });

  it("reads back the continue arm — the ⏸ read-back WP2 lacked", () => {
    // This is the surface's whole reason to exist: WP2's ⏸ set the flag with no way to confirm
    // the click landed short of reading `session-state.json` by hand, which is why the operator
    // deferred WP2's hard-kill verification.
    expect(nextOpenIndicator({ workflowEnabled: true, action: flagOnly })).toBe(
      "will continue",
    );
  });

  it("⚠️ says 'continue', NOT '/resume' — Phase 1 disproved that name", () => {
    // A bare `/resume` opens an INTERACTIVE session picker rather than resuming (Phase 1,
    // Verdict 2), so the arm is the CLI flag `--continue`. The WBS and roadmap still say
    // `/resume` in places, which is precisely why this is asserted rather than trusted: the
    // wrong name must not reach the operator's screen.
    const label = nextOpenIndicator({
      workflowEnabled: true,
      action: flagOnly,
    });
    expect(label).not.toContain("/resume");
    expect(label).not.toContain("resume");
  });

  it("reads back the restore arm with its real command", () => {
    expect(
      nextOpenIndicator({ workflowEnabled: true, action: pointerOnly }),
    ).toBe("will run /session-restore");
  });

  it("shows nothing when nothing would fire", () => {
    expect(nextOpenIndicator({ workflowEnabled: true, action: neither })).toBe(
      null,
    );
  });

  it("shows nothing when the gate is OFF, for EITHER arm", () => {
    // ⚠️ Both arms, asserted together. The indicator is gated even for the continue arm —
    // which reverses Phase 3.5's per-arm split, and that is correct rather than inconsistent:
    // 3.5 ungated the picker ANNOUNCEMENT because arm 1 applies to every CC user, but this
    // surface's content is a statement about workflow state, and the button beside it is a
    // skill. A single test over both arms means a gate check that kills only one cannot pass.
    expect(
      nextOpenIndicator({ workflowEnabled: false, action: flagOnly }),
    ).toBe(null);
    expect(
      nextOpenIndicator({ workflowEnabled: false, action: pointerOnly }),
    ).toBe(null);
  });

  it("is exhaustive over the action kinds — a new arm is a compile error", () => {
    // The `switch` in `nextOpenIndicator` has no `default`, so adding a kind to
    // `AutoResumeAction` fails to type-check rather than silently rendering nothing. Asserted
    // behaviorally here (every reachable input yields a label) so the property is not only a
    // compile-time claim.
    for (const action of [flagOnly, pointerOnly]) {
      expect(
        nextOpenIndicator({ workflowEnabled: true, action }),
      ).not.toBeNull();
    }
  });
});

/**
 * The `fireSessionStart` handler's body — so assertions about the FIRE are scoped to the fire,
 * rather than passing because some other part of a 500-line component happens to contain the text.
 *
 * ⚠️ Throws rather than returning `""` when the anchors are gone. A slice that silently yields an
 * empty string makes `not.toContain(...)` pass vacuously and `toContain(...)` fail confusingly —
 * the positional-`?raw` hole this repo has hit three times. Anchored on the declaration name (not
 * a line number or an ordinal), so an unrelated edit above it cannot retarget the slice.
 */
function extractFireHandler(source: string): string {
  const start = source.indexOf("const fireSessionStart = () => {");
  if (start === -1) {
    throw new Error(
      "could not locate `const fireSessionStart = () => {` in Workspace.tsx. If the handler was " +
        "renamed or reshaped, update this extractor DELIBERATELY — it is what scopes the " +
        "injection assertions to the fire path.",
    );
  }
  const end = source.indexOf("\n  };", start);
  if (end === -1) {
    throw new Error(
      "found `fireSessionStart` but not its closing `};` in Workspace.tsx.",
    );
  }
  return source.slice(start, end);
}

describe("the fire-handler extractor fails loudly rather than scanning nothing", () => {
  it("throws when the handler is missing", () => {
    // Proves the `throw` is reachable, so a rename surfaces as an explicit failure instead of an
    // assertion that quietly matched an empty string.
    expect(() => extractFireHandler("const x = 1;")).toThrow(
      /could not locate/,
    );
  });

  it("returns only the handler, not the whole component", () => {
    // Otherwise the scoping is cosmetic and the assertions still search everything.
    const sliced = extractFireHandler(
      readFileSync(
        fileURLToPath(new URL("../Workspace.tsx", import.meta.url)),
        "utf8",
      ),
    );
    expect(sliced).toContain("cc_input");
    expect(sliced.length).toBeLessThan(1200);
  });
});

describe("wiring — the properties no value can observe (source guards)", () => {
  // ⚠️ Confined to WIRING on purpose. A source guard cannot verify runtime behavior, and this
  // repo has been bitten repeatedly by ones that tried. Comments are stripped before matching
  // so the prose above cannot satisfy an assertion on the code's behalf
  // (`[[raw-guard-identifier-satisfied-by-own-comments]]`, 3 instances here).
  const ws = readFileSync(
    fileURLToPath(new URL("../Workspace.tsx", import.meta.url)),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("Workspace.tsx is readable (non-vacuity guard)", () => {
    // Without this, a failed read makes every assertion below trivially pass.
    expect(ws.length).toBeGreaterThan(5000);
    expect(ws).toContain("workspace-header");
  });

  it("both surfaces come from the pure module, not re-decided inline", () => {
    // Asserted as CALL shapes. A bare identifier would be satisfied by the import line.
    expect(ws).toContain("showSessionStartButton(");
    expect(ws).toContain("nextOpenIndicator(");
  });

  it("the render-time derivation gates on BOTH the gate and visibility", () => {
    // ⚠️ ADDED AT VERIFY-AUTO, after probing found this derivation entirely unguarded — both
    // of its terms could be deleted with all 16 tests still green. That is a real coverage
    // hole, and the shape is M11's `rehype-raw`/`rehype-sanitize` finding repeating:
    //
    //   • The `workflowEnabled` term is REDUNDANT with `nextOpenIndicator`'s own internal gate
    //     (which IS independently proven — removing it fails "shows nothing when the gate is
    //     OFF"). So each control masks the other's absence, and a behavioral test exercising
    //     both cannot tell you which one is holding.
    //   • The `visible` term is NOT redundant — nothing else suppresses a stale label on a
    //     backgrounded workspace, since workspaces stay mounted forever (the standing
    //     invariant). Its removal was silent.
    //
    // Both terms are therefore pinned structurally here. This is a source guard and cannot
    // verify runtime behavior; what it defends is that neither term is quietly dropped.
    // The `visible` half is also carried to verify-self as a live check (promote/demote), which
    // is where the runtime property actually gets observed.
    expect(ws).toMatch(
      /const nextOpen\s*=\s*workflowEnabled\s*&&\s*visible\s*\?/,
    );
  });

  it("the gate is read through the HOOK", () => {
    // ⚠️ The two forbidden bypass identifiers are ASSEMBLED rather than written as literals:
    // the OFF-invariant guard's bypass scan is a plain substring match over source and cannot
    // tell a real call from a negative assertion about one, so spelling them would make THIS
    // FILE an offender. Same hazard `announceRow.test.ts` documents.
    expect(ws).toContain("useWorkflowFeaturesEnabled");
    const rawCommand = ["workflow", "get", "features", "enabled"].join("_");
    expect(ws).not.toContain(rawCommand);
    expect(ws).not.toContain(
      ["get", "Workflow", "Features", "Enabled"].join(""),
    );
  });

  it("the injection goes through cc_input with the shared payload helper", () => {
    // No new byte-composing primitive: `slashCommandPayload` mirrors Rust's
    // `slash_command_bytes` and is pinned byte-for-byte by `autoResumeFire.test.ts`. A
    // hand-rolled `btoa(cmd + "\r")` here would be a second source of truth AND would
    // re-introduce the M10.5 WP4 mojibake bug (btoa truncates to `& 0xff`).
    expect(ws).toContain("slashCommandPayload(");
    expect(ws).not.toMatch(/btoa\(/);
  });

  it("the button's handler injects into THIS workspace's session, with a .catch", () => {
    // ⚠️ ADDED AT VERIFY-CODIFY. verify-self proved the button executes live, but nothing pinned
    // the three things that make it correct rather than accidentally-working, and each has a
    // named precedent for going wrong:
    //   • the session id comes from the WORKSPACE record — a hardcoded or wrong-workspace id
    //     would type a slash command into someone else's live conversation;
    //   • the payload is the shared helper (asserted separately above);
    //   • the `invoke` has a `.catch` — a Tauri rejection with no handler vanishes silently
    //     (the WP6 picker MAJOR).
    const handler = extractFireHandler(ws);
    expect(handler).toContain("workspace.cc_session_id");
    expect(handler).toMatch(/invoke\(\s*"cc_input"/);
    expect(handler).toMatch(/\.catch\(/);
    // ⚠️ And NO error dispatch: an injection miss must not replace a working terminal with an
    // error overlay over a command the user can simply type (the operator-settled surfacing).
    expect(handler).not.toContain("spawn-failed");
  });

  it("the indicator fetches via the picker's batched command, with a .catch", () => {
    // Pins that this surface adds no NEW per-workspace IPC shape — it reuses
    // `picker_announce_actions`, the same one call the picker makes. A per-workspace command
    // would be the N+1 M11.5 WP1's review found in the model cell.
    expect(ws).toContain('invoke<Record<string, "continue" | "restore">>(');
    expect(ws).toContain('"picker_announce_actions"');

    // ⚠️ This assertion used to demand `predictAction({`, on the stated rule that the action
    // must derive "from the SIGNALS via the real predictor, never from the announced string."
    // That rule is right for the CLICK path and wrong here, and the guard was enforcing the
    // defect rather than the fix.
    //
    // WP1 Verdict (b) — "a label is a prediction, never an input" — guards against trusting a
    // display string in place of real signals. But `picker_announce_actions` is not a display
    // string: the BACKEND already resolved the arm from the two signals, and the wire value is
    // that resolved answer. The old code fed it back through the predictor as synthetic
    // booleans (`uncleanFlag: announced === "continue"`), i.e. re-deciding a settled question
    // using inputs invented from its own output. It agreed only because `continue` happens to
    // win the precedence — an accident a third arm would break silently.
    //
    // `actionFromAnnounced` is the purpose-built seam for exactly this mapping, and it is
    // itself tested. Pin THAT.
    // (`SURFACE-2026-08-05-QUALITY-WP3-INDICATOR-BYPASSES-THE-WIRE-SEAM`.)
    expect(ws).toContain("actionFromAnnounced(announced)");
    expect(
      ws,
      "the indicator must not rebuild synthetic signals from the announced value — that " +
        "re-derives an answer the backend already resolved, and agrees only by precedence luck",
    ).not.toMatch(/uncleanFlag:\s*announced/);
  });

  it("⚠️ does NOT wait 1500 ms — that measurement is about a COLD spawn", () => {
    // Phase 1's settle exists because a freshly-spawned CC has not started reading keystrokes.
    // This button fires into a session a human is already looking at. Importing the delay here
    // would add 1.5 s of lag to a click for no measured reason, and would misrepresent what
    // was measured — so its absence is asserted rather than left to judgment.
    expect(ws).not.toContain("INJECT_SETTLE_MS");
    expect(ws).not.toContain("FIRE_DELAY_MS");
  });
});
