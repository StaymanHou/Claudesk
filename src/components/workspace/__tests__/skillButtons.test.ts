import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hasRule } from "../../../test-support/cssRule";

// ⚠️ Mock the TAURI boundary, not our own funnel. Mocking `injectCommand` would make the
// caller-proof test below assert that our test double was called — the replica trap
// (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`). By stubbing `invoke`
// we drive the REAL `fireSkillCommand` → REAL `injectCommand` → the IPC edge, so the payload
// rule and the `.catch` are exercised rather than replaced.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const { SKILL_BUTTONS, showSkillButtons, fireSkillCommand } =
  await import("../skillButtons");
const { slashCommandPayload } = await import("../autoResumeFire");

// M13 WP2 — the skill-button row's contract.
//
// ⚠️ THE RISK THIS FILE EXISTS TO CLOSE, in `CLAUDE.md`'s own words:
//   "Enumerating routes/skills as data makes the SET testable but does NOT prove each member
//    has a CALLER."
// M12 shipped a `/exit` clean-exit variant that round-tripped through two test suites while
// being called by nothing, and the exhaustiveness test's green READ AS COVERAGE. A button
// registry is that shape at larger scale, so a test asserting `SKILL_BUTTONS.length === 5`
// would be precisely the reassuring-but-empty guard that defect teaches against.
//
// So the assertions below are organised around callers, not membership:
//   1. every member reaches the ONE funnel, with ITS OWN command string (not a shared constant);
//   2. the funnel reaches the real IPC edge with the real payload helper;
//   3. the component actually renders one button per member (a source guard — no render harness
//      exists here, `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`).

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
});

describe("the set — what it is, and what is deliberately NOT asserted", () => {
  it("holds exactly the five decided commands, in a stable order", () => {
    // ⚠️ This IS a membership assertion, and it is here for one narrow reason: the members were
    // an operator decision measured from 2470 transcripts, and "no member is conditional —
    // dropping one is a scope reduction requiring its own decision". So a silent drop should
    // fail. It is NOT the coverage claim; the caller tests below are.
    expect(SKILL_BUTTONS.map((b) => b.command)).toEqual([
      "/session-start",
      "/session-restore",
      "/session-capture",
      "/util-prune-claude-md",
      "/util-backlog-paydown",
    ]);
  });

  it("every command is a slash command with no whitespace or trailing newline", () => {
    // A stray space or `\n` would be injected verbatim into the PTY. `slashCommandPayload`
    // strips a trailing CR/LF, but a LEADING space or an inner one would survive and CC would
    // read a different command (or nothing).
    for (const { command } of SKILL_BUTTONS) {
      expect(command, `${command} must start with a single slash`).toMatch(
        /^\/[a-z0-9-]+$/,
      );
    }
  });

  it("no duplicate commands, and no duplicate labels", () => {
    // Two buttons firing the same command is the "two affordances for one skill" redundancy
    // WP2 exists to remove; two buttons SHOWING the same label is indistinguishable to the eye.
    const commands = SKILL_BUTTONS.map((b) => b.command);
    const labels = SKILL_BUTTONS.map((b) => b.label);
    expect(new Set(commands).size).toBe(commands.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("every button carries a non-empty label and title", () => {
    // The title is the only place the full command name appears once labels are abbreviated,
    // so an empty one leaves a two-letter button with no way to learn what it does.
    for (const b of SKILL_BUTTONS) {
      expect(b.label.trim().length, `${b.command} label`).toBeGreaterThan(0);
      expect(b.title.trim().length, `${b.command} title`).toBeGreaterThan(0);
    }
  });

  it("every title names its own command — so the tooltip cannot drift from the wire value", () => {
    // A title saying "/session-start" on the button that fires "/session-restore" is a
    // silent mislabel no type checks catch. Cheap to pin, and it caught the copy/paste risk
    // inherent in five near-identical literals.
    for (const b of SKILL_BUTTONS) {
      expect(b.title, `${b.command}'s title must name it`).toContain(b.command);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ AN "ANTI-FORGETTING GUARD" FOR RECYCLE WAS BUILT HERE AND REMOVED (code-quality
// review, 2026-08-14, two MAJORs). Recorded because the *idea* will recur and the
// mechanism was unsound in BOTH directions — do not rebuild it.
//
// It exported `DECIDED_ROW_SIZE = 6` from production and asserted:
//   (a) `SKILL_BUTTONS.length === DECIDED_ROW_SIZE - 1` while WP3 is pending, and
//   (b) `SKILL_BUTTONS.length === DECIDED_ROW_SIZE` once any `src/**` file named the
//       `"recycle-session"` route literal — the intended "WP3 has landed" trigger.
//
// ⚠️ FALSE POSITIVE: (a) and (b) are CONTRADICTORY the moment WP3 lands, and (b) is
// unsatisfiable anyway. `SKILL_BUTTONS` holds slash commands (pinned by the
// `/^\/[a-z0-9-]+$/` assertion above), and `wbs.md` states plainly that **"Recycle is
// not a skill"** — it is an operation with a `CleanExitRoute`. So the set can never
// legitimately reach 6, and WP3 would have met three red tests whose messages demanded
// the opposite of each other. That is precisely the "deleted as a false positive"
// outcome the guard's own comment claimed to avoid.
//
// ⚠️ FALSE NEGATIVE: the trigger matched only the LITERAL string in `src/**`. A caller
// passing the route as a typed `CleanExitRoute` parameter — the idiomatic shape for the
// callable operation WP3 is specified to build — never spells the literal, and
// `wbs.md` explicitly leaves open that Recycle may clear the flag through the
// **in-process Rust** writer (`clear_and_persist`), which puts the literal in
// `src-tauri/` where an `src/**` scan cannot see it. The route already exists in Rust
// today (`session_state/mod.rs:351`). WP2's own probe only exercised the literal path,
// so it proved the one arm that worked and not the two that did not.
//
// THE OBLIGATION IS REAL; ITS HOME IS NOT A TEST. "The row is decided at six members,
// five of which are slash commands" is a WBS/WIP commitment about future work, and a
// test that tries to enforce a future scope decision encodes a membership claim the
// design has already refuted. It lives in `wbs.md` → WP3 and in this WP's WIP file.
// ═══════════════════════════════════════════════════════════════════════════════

describe("⚠️ EVERY MEMBER HAS A LIVE CALLER — the M12 dead-/exit trap", () => {
  it("each command reaches the funnel and lands on the IPC edge, with its OWN string", () => {
    // ⚠️ THE LOAD-BEARING TEST OF THIS FILE. Driving each member through the real funnel is
    // what distinguishes "the set contains 5 entries" from "5 entries can each actually fire".
    // A member whose command string were mistyped, or whose entry no caller ever passes to the
    // funnel, fails HERE rather than passing a membership count.
    for (const { command } of SKILL_BUTTONS) {
      invokeMock.mockClear();
      void fireSkillCommand("cc-42", command);
      expect(
        invokeMock,
        `${command} did not reach invoke("cc_input", …) — a set member with no live caller`,
      ).toHaveBeenCalledWith("cc_input", {
        sessionId: "cc-42",
        // ⚠️ Compared against the REAL helper's output, not a hand-built base64 literal. A
        // hardcoded expectation here would pin whatever the test author computed and would
        // agree with a broken encoder (the M10.5 WP4 mojibake shape).
        data: slashCommandPayload(command),
      });
    }
  });

  it("fires into the session id it is given, never a captured or default one", () => {
    // Two different sessions must produce two different targets. A funnel that closed over one
    // workspace's id would type a slash command into someone else's live conversation — and
    // with all workspaces permanently mounted, that is a real shape rather than a hypothetical.
    void fireSkillCommand("cc-A", "/session-start");
    void fireSkillCommand("cc-B", "/session-start");
    expect(invokeMock.mock.calls[0][1]).toMatchObject({ sessionId: "cc-A" });
    expect(invokeMock.mock.calls[1][1]).toMatchObject({ sessionId: "cc-B" });
  });

  it("the payload ends in CR, never LF — CC's TUI runs in raw mode", () => {
    // `\r` (0x0d) submits; `\n` only triggers autocomplete typeahead and the command never runs
    // (`[[cc-tui-cr-not-lf]]`, `[[raw-mode-cr-is-enter]]`). Decoded from what the funnel
    // actually sent, so this observes the real bytes rather than re-asserting the helper's unit
    // test. This is the property whose failure looks like "the button does nothing".
    void fireSkillCommand("cc-1", "/session-capture");
    const sent = invokeMock.mock.calls[0][1] as { data: string };
    const decoded = atob(sent.data);
    expect(decoded.endsWith("\r")).toBe(true);
    expect(decoded).not.toContain("\n");
    expect(decoded).toBe("/session-capture\r");
  });

  it("a rejected invoke does not throw — an unhandled rejection vanishes silently", () => {
    // The WP6 picker MAJOR. `injectCommand` owns the `.catch`; this proves the funnel inherits
    // it rather than re-introducing a bare await. Asserted as a resolved promise, because a
    // rejection here would surface in production as an unhandled promise rejection and a dead
    // click with no diagnosis.
    invokeMock.mockRejectedValue(new Error("ipc gone"));
    return expect(
      fireSkillCommand("cc-1", "/session-start"),
    ).resolves.toBeUndefined();
  });
});

describe("showSkillButtons — the row's two preconditions", () => {
  // (The four originals live in `sessionStartButton.test.ts`, retargeted from
  // `showSessionStartButton` when the row absorbed that button. These are the boundary cases.)
  it("requires BOTH the gate and a live session", () => {
    expect(showSkillButtons({ workflowEnabled: true, ccSessionId: "x" })).toBe(
      true,
    );
    expect(showSkillButtons({ workflowEnabled: false, ccSessionId: "x" })).toBe(
      false,
    );
    expect(showSkillButtons({ workflowEnabled: true, ccSessionId: null })).toBe(
      false,
    );
    expect(
      showSkillButtons({ workflowEnabled: false, ccSessionId: null }),
    ).toBe(false);
  });

  it("treats an empty-string session id as live, not as absent", () => {
    // Pins the predicate as written (`!== null`) rather than a truthiness check. Recorded
    // because "" is not a real session id — but if one ever appeared, the honest behavior is
    // for the row to render and the injection to fail visibly at the IPC edge, not for the
    // affordance to silently disappear and look like the gate is off.
    expect(showSkillButtons({ workflowEnabled: true, ccSessionId: "" })).toBe(
      true,
    );
  });
});

describe("wiring — properties no value can observe (source guards)", () => {
  // Comments stripped before matching, so this file's own prose cannot satisfy an assertion on
  // the code's behalf (`[[raw-guard-identifier-satisfied-by-own-comments]]`).
  const strip = (s: string) =>
    s
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  const ws = strip(
    readFileSync(
      fileURLToPath(new URL("../Workspace.tsx", import.meta.url)),
      "utf8",
    ),
  );
  const mod = strip(
    readFileSync(
      fileURLToPath(new URL("../skillButtons.ts", import.meta.url)),
      "utf8",
    ),
  );

  it("both sources are readable (non-vacuity guard)", () => {
    // Without this, a failed read makes every assertion below trivially pass.
    expect(ws.length).toBeGreaterThan(5000);
    expect(mod.length).toBeGreaterThan(1000);
  });

  it("the component renders one button PER MEMBER — not a hardcoded list", () => {
    // ⚠️ The set having five entries proves nothing if the JSX hardcodes four buttons. Pinning
    // the map over the real array is what ties render count to set size, so adding a member
    // cannot silently fail to appear.
    expect(ws).toMatch(/SKILL_BUTTONS\.map\(/);
  });

  it("the row is gated through the HOOK, not an ad-hoc read", () => {
    // ⚠️ The two forbidden bypass identifiers are ASSEMBLED rather than written as literals:
    // the OFF-invariant guard's bypass scan is a plain substring match over source and cannot
    // tell a real call from a negative assertion about one, so spelling them would make THIS
    // FILE an offender. Same hazard `announceRow.test.ts` documents.
    expect(ws).toContain("showSkillButtons(");
    expect(ws).toContain("useWorkflowFeaturesEnabled");
    const rawCommand = ["workflow", "get", "features", "enabled"].join("_");
    expect(mod).not.toContain(rawCommand);
    expect(ws).not.toContain(rawCommand);
  });

  it("the module composes NO payload and calls NO IPC of its own", () => {
    // One send path. The module delegates to `injectCommand`, which owns `cc_input`, the
    // `.catch`, and the `\r` rule — so a second copy of any of the three cannot appear here.
    expect(mod).toContain("injectCommand");
    expect(mod).not.toMatch(/invoke\(/);
    expect(mod).not.toMatch(/btoa\(/);
    expect(mod).not.toContain("slashCommandPayload(");
  });

  it("⚠️ does NOT reach for a filesystem existence check (WP2 task 2.1, option (i))", () => {
    // §4c: the COMMAND NAME is the only sanctioned cross-repo coupling. `workflow_substrate`
    // already refused a per-skill-name check for this reason — a path roster is exactly the
    // brittle coupling that clause forbids. Pinned so the "refinement" is a deliberate
    // reversal rather than a quiet addition.
    expect(mod).not.toContain(".claude/skills");
    expect(mod).not.toContain("skills_dir_exists");
    expect(mod).not.toContain("SKILL.md");
  });

  it("⚠️ exports no *Chord* identifier — that would trip the guard's chord arm", () => {
    // Why, in full: `skillButtons.ts`'s header. Short version — the OFF-invariant guard's chord
    // arm selects by exported identifier containing "Chord" and its terms include "skill", so
    // such an export goes red by design, not by bug.
    expect(mod).not.toMatch(
      /export\s+(const|function|type|interface)\s+\w*Chord/,
    );
  });

  it("the CSS↔component class contract holds in BOTH directions", () => {
    // ⚠️ ADDED AT VERIFY-CODIFY, and the direction matters. Every stylesheet guard in this repo
    // once read only ONE side of this contract, and M12 WP5 shipped a layout regression through
    // the unread side while 1979 tests stayed green: a class the stylesheet styles but the
    // component never emits (dead CSS silently carrying behavior), and a class the component
    // emits but the stylesheet never styles (unstyled element). Both now fail.
    //
    // ⚠️ Matched with `hasRule`, the shared boundary matcher — NOT `css.includes("." + cls)`.
    // The naive form is a substring test, so `.workspace-skill-row` would be satisfied by any
    // longer class starting with it (`SURFACE-2026-08-02-CSS-CLASS-GUARDS-MAY-USE-SUBSTRING-NOT-
    // BOUNDARY-MATCH`; a sweep found 17 prefix-shadowing pairs among the `picker-*` classes).
    //
    // ⚠️ Read via `node:fs`, not a `?raw` import: a Vitest `?raw` import of a `.css` file yields
    // Vite's PROCESSED output rather than the source text
    // (`[[vitest-raw-import-css-returns-processed-not-text]]`).
    // ⚠️ COMMENTS STRIPPED, and this is not defensive tidiness — it was MEASURED. The first
    // version of this test read App.css raw and FAILED on the dead-CSS direction, reporting a
    // live `.workspace-session-start` rule. There is no such rule: the only occurrence is inside
    // this feature's OWN CSS comment, which documents the absorbed button by name in backticks.
    // `hasRule` matched the comment, so the guard was satisfied by its own documentation — the
    // exact shape `[[raw-guard-identifier-satisfied-by-own-comments]]` names, reproduced here on
    // first run. Without stripping, this assertion would pass precisely when the rule was
    // re-added *and* mentioned in prose, and fail when the code was already correct.
    const css = readFileSync(
      fileURLToPath(new URL("../../../App.css", import.meta.url)),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(
      css.length,
      "App.css is unreadable (or was stripped to nothing) — every assertion below would pass " +
        "vacuously",
    ).toBeGreaterThan(1000);
    // Positive control on the stripping itself: a class that IS genuinely styled must still be
    // found after the strip, or an over-eager regex would silently disarm both directions.
    expect(
      hasRule(css, "workspace-header"),
      "stripping ate real CSS — `.workspace-header` is definitely styled",
    ).toBe(true);

    // Direction 1: every class the component emits must have a BASE rule.
    //
    // ⚠️ `hasRule(css, cls)` alone is NOT sufficient here, and this was MEASURED rather than
    // reasoned: deleting the entire `.workspace-skill-btn { … }` block (padding, border, font,
    // cursor) left this test GREEN at 21/21, because `.workspace-skill-btn:hover` still exists
    // and `hasRule`'s boundary legitimately admits `:`. So the guard was satisfied by a modifier
    // while the base declaration — everything that makes the button look like a button — was
    // gone. Same shape the 2026-08-12 paydown recorded, where a `.is-editing` modifier satisfied
    // a check for its base class.
    //
    // `hasRule` is right; the weak part was asking it the wrong question. A BASE rule is the
    // class followed only by optional whitespace and `{` — no pseudo-class, no descendant.
    const hasBaseRule = (cls: string) =>
      new RegExp(`\\.${cls}\\s*\\{`).test(css);
    for (const cls of ["workspace-skill-row", "workspace-skill-btn"]) {
      expect(ws, `${cls} must be emitted by Workspace.tsx`).toContain(cls);
      expect(
        hasBaseRule(cls),
        `.${cls} is emitted by the component but has no BASE rule in App.css — an unstyled ` +
          `element. (A \`:hover\` or other modifier alone does not count: it would leave the ` +
          `element's own padding/border/font undefined while looking styled to a weaker guard.)`,
      ).toBe(true);
    }

    // Direction 2: the class the row REPLACED must be gone from the stylesheet, or it is dead
    // CSS. `.workspace-session-start` styled the standalone button this row absorbed; leaving
    // its rule behind would be a styling declaration nothing can ever match.
    expect(
      hasRule(css, "workspace-session-start"),
      "`.workspace-session-start` still has a rule in App.css but nothing emits that class " +
        "any more (the skill row absorbed that button) — dead CSS",
    ).toBe(false);
    expect(
      ws,
      "Workspace.tsx must not still emit the absorbed button's class",
    ).not.toContain("workspace-session-start");
  });

  it("⚠️ does NOT wait 1500 ms — that measurement is about a COLD spawn", () => {
    // Why, in full: `fireSkillCommand`'s doc. Short version — the settle is about a cold spawn;
    // these fire into a session a human is already looking at.
    expect(mod).not.toContain("INJECT_SETTLE_MS");
    expect(mod).not.toContain("FIRE_DELAY_MS");
  });
});
