import { describe, expect, it } from "vitest";
// Vite ?raw import: bundles RightPanelHost's source text at test time — the repo
// convention for structural guards with NO node:fs / @types/node dependency (same trick
// as terminalSlotGuard.test.ts / pipFanoutWiring.test.ts). Pairs with terminalList.test.ts
// (the pure model) + the live MCP-bridge verify-self (the runtime proof): this file pins
// the WIRING-LAYER invariants that the pure model can't see and that a refactor of
// RightPanelHost could silently break.
import hostSource from "../RightPanelHost.tsx?raw";
import terminalPaneSource from "../TerminalPane.tsx?raw";

// M6 WP11 — multiple-right-panel-terminals wiring guard.
//
// verify-self (2026-06-28, MCP bridge) confirmed all six runtime outcomes live: the
// sub-tab row, ＋ open, switch-with-scrollback, ✕ close + shell reap, disallow-last,
// cap-8. This structural guard codifies the wiring those outcomes depend on so a later
// refactor that drops a piece fails in CI rather than at the next manual test.

describe("RightPanelHost wires the WP11 terminal list (not a single hardcoded pane)", () => {
  it("uses the pure terminalList model ops (open/close/switch), not ad-hoc state", () => {
    // The reducer ops are the unit-tested source of truth; the host must route through
    // them (so the cap-8 + disallow-last + reactivate-sibling guards apply).
    expect(hostSource).toContain("openTerminal");
    expect(hostSource).toContain("closeTerminal");
    expect(hostSource).toContain("switchTerminal");
    expect(hostSource).toContain("initialTerminalList");
  });

  it("renders the always-present sub-tab row with the ＋ add control", () => {
    expect(hostSource).toContain('data-testid="term-tab-row"');
    expect(hostSource).toContain('data-testid="term-tab-add"');
  });

  it("maps each entry to a tab + a mounted pane (the list, not one pane)", () => {
    // The tab + pane are rendered per-entry via .map over terminals.entries.
    expect(hostSource).toContain("terminals.entries.map");
    // The pane testid is data-driven per entry id (a template literal), and the tab id too.
    expect(hostSource).toContain("`term-tab-${t.id}`");
  });

  it("KEEPS every terminal pane mounted — display-gated on the active id (not unmounted)", () => {
    // The keep-mounted invariant (scrollback survives switching): the non-active panes
    // are display:none, NOT removed. A regression to "render only the active pane" would
    // drop this substring (the per-pane display gate keyed on activeId).
    expect(hostSource).toContain('terminals.activeId ? "flex" : "none"');
  });

  it("DISALLOWS closing the last terminal — the ✕ is gated on !isLastTerminal", () => {
    // No ✕ on the sole tab: the close button renders only when not the last terminal.
    expect(hostSource).toContain("!isLastTerminal(terminals)");
    expect(hostSource).toContain("term-tab-close-");
  });

  it("disables the ＋ at the cap via canOpenTerminal", () => {
    expect(hostSource).toContain("canOpenTerminal(terminals)");
    expect(hostSource).toContain("disabled={!canOpenTerminal(terminals)}");
  });
});

describe("RightPanelHost wires the WP11 Phase-2 chords (⌘T + scoped ⌘W)", () => {
  it("handles the ⌘T new-terminal chord (newTerminalChord)", () => {
    expect(hostSource).toContain("newTerminalChord(e)");
  });

  it("routes scoped ⌘W via shouldCloseTerminalOnChord + deriveRightSurface", () => {
    expect(hostSource).toContain("shouldCloseTerminalOnChord");
    expect(hostSource).toContain(
      'deriveRightSurface(document.activeElement) === "terminal"',
    );
  });

  it("ORDERS the scoped-⌘W terminal branch BEFORE the editor close-tab branch", () => {
    // The load-bearing invariant: when a terminal is focused, ⌘W must route to the
    // terminal-close + swallow BEFORE the editor's isCloseTabChord branch runs, so the two
    // never both fire. A refactor that reordered them would silently re-introduce a
    // double-close. Assert the source position of the terminal branch precedes the editor's.
    const terminalBranch = hostSource.indexOf("shouldCloseTerminalOnChord");
    const editorCloseBranch = hostSource.indexOf(
      "editorSplitRef.current?.closeActiveTab()",
    );
    expect(terminalBranch).toBeGreaterThan(-1);
    expect(editorCloseBranch).toBeGreaterThan(-1);
    expect(terminalBranch).toBeLessThan(editorCloseBranch);
  });

  it("swallows the routed ⌘W (stopPropagation) so the editor handler never also fires", () => {
    // The terminal-close branch must stopPropagation (not just preventDefault) — the
    // editor ⌘W handler is on the SAME capture-phase listener path; stopPropagation +
    // the early return are what keep it from double-firing.
    expect(hostSource).toContain("e.stopPropagation()");
  });
});

describe("RightPanelHost Phase-3 zoom coupling — the ref binds to the ACTIVE terminal", () => {
  it("forwards terminalPaneRef ONLY to the active terminal's pane (zoom-follows-focused)", () => {
    // The load-bearing Phase-3 invariant: the WP10 zoom router (Workspace) drives a single
    // termPaneRef; that ref must bind to whichever terminal is ACTIVE so zoom lands on the
    // FOCUSED one (the focused terminal is always the active one — the rest are
    // display:none/unfocusable). A refactor that bound the ref to a fixed/first terminal,
    // or to all of them, would break zoom-follows-focused. Pin the conditional binding.
    // Match the tokens tolerant of prettier's line-wrapping (it splits the `ref={…}`
    // attribute across lines) — an exact-string `toContain` broke on a format pass
    // (SURFACE PRETTIER-DRIFT-AND-BRITTLE-RAW-REGEX-TEST).
    expect(hostSource).toMatch(
      /ref=\{[\s\S]*?t\.id === terminals\.activeId\s*\?\s*terminalPaneRef\s*:\s*undefined[\s\S]*?\}/,
    );
  });
});

describe("TerminalPane takes an explicit per-terminal sessionId (dropped the hardcoded -term)", () => {
  it("forwards a sessionId prop as the XtermPane session key — not a derived `${workspaceId}-term`", () => {
    // The WP11 change: the session id is passed IN (from the terminalList model), so each
    // of N terminals is its own PTY. A regression to the old single hardcoded id would
    // re-introduce the `-term` literal as the workspaceId.
    expect(terminalPaneSource).toContain("sessionId");
    expect(terminalPaneSource).toContain("workspaceId={sessionId}");
    // And it carries data-session-id for the Phase-3 focus-scoped zoom routing.
    expect(terminalPaneSource).toContain("dataSessionId={sessionId}");
    // (We deliberately do NOT assert the absence of the `${workspaceId}-term` string:
    // the header comment still references the old id it replaced. The positive
    // `workspaceId={sessionId}` above is the real invariant — the code passes the
    // explicit per-terminal id, not a derived one.)
  });
});
