import { describe, expect, it } from "vitest";
// ?raw source guards (repo convention — terminalSlotGuard.test.ts). The runtime
// listen/emit behavior is verify-self/human-covered (driven live via the MCP bridge:
// roster divergence + status-dot flip + never-disagree all PASS 2026-06-26); these
// pin the WIRING so a future edit that severs the main↔PiP fan-out fails CI rather
// than silently blanking/freezing the panel.
import appSource from "../../App.tsx?raw";
import pipSource from "../Pip.tsx?raw";
import fanoutSource from "../usePipFanout.ts?raw";
import filmstripSource from "../../components/workspace/Filmstrip.tsx?raw";
import tickerSource from "../../components/workspace/useMirrorTicker.ts?raw";
import rightPanelHostSource from "../../components/workspace/RightPanelHost.tsx?raw";

// M5 WP3 Phase 2 codify — the main↔PiP fan-out is an integration boundary (App.tsx
// is an existing surface). The pure roster derivation is covered by pipFrame.test.ts;
// this guards the two ends of the wire.

describe("M5 WP3 Phase 2 — App fans the roster out to the PiP", () => {
  it("App.tsx calls usePipFanout", () => {
    expect(appSource).toContain("usePipFanout");
  });

  it("usePipFanout emits pip-frame to the pip window AND replies to the pip-ready handshake", () => {
    // emitTo the PiP label on roster change + a pip-ready listener that re-emits.
    expect(fanoutSource).toContain("emitTo");
    expect(fanoutSource).toContain("PIP_FRAME_EVENT");
    expect(fanoutSource).toContain("PIP_READY_EVENT");
    expect(fanoutSource).toContain("PIP_WINDOW_LABEL");
  });
});

describe("M5 WP3 Phase 2 — the PiP subscribes to both channels + handshakes", () => {
  it("Pip.tsx listens for workspace-status (status) AND pip-frame (roster)", () => {
    // Status arrives via the backend all-webview broadcast; roster via the main
    // webview's emitTo. Losing either listen silently breaks the surface.
    expect(pipSource).toContain("WORKSPACE_STATUS_EVENT");
    expect(pipSource).toContain("PIP_FRAME_EVENT");
  });

  it("Pip.tsx fires pip-ready on mount (initial-state handshake)", () => {
    expect(pipSource).toContain("PIP_READY_EVENT");
    expect(pipSource).toContain('emitTo("main"');
  });

  it("Pip.tsx reuses the shared status indicator (never-disagree palette)", () => {
    // Reusing WorkspaceStatusIndicator + stateFor is what keeps PiP and filmstrip
    // on one palette — a hand-rolled dot here would risk drift.
    expect(pipSource).toContain("WorkspaceStatusIndicator");
    expect(pipSource).toContain("stateFor");
  });
});

describe("M5 WP3 Phase 3 — live mirror: shared serialize + display-only", () => {
  it("Pip.tsx subscribes to pip-mirror and writes it into .pip-tile-mirror", () => {
    expect(pipSource).toContain("PIP_MIRROR_EVENT");
    expect(pipSource).toContain("pip-tile-mirror");
  });

  it("the PiP tile is display-only — NOT a button, no onClick/promote handler", () => {
    // The vision anti-goal "Not PiP click-to-focus in v1". A regression that made the
    // tile a <button> or added onClick would break display-only.
    expect(pipSource).not.toMatch(/<button[^>]*className="pip-tile/);
    expect(pipSource).not.toMatch(/className="pip-tile"[^>]*onClick/);
  });

  it("ONE serialize loop: only useMirrorTicker calls serializeTerminal; Filmstrip reads the shared frame", () => {
    // The WBS "no second serialize loop" mandate. The ticker serializes; the filmstrip
    // reads readMirrorFrame. Guard via the IMPORT (robust vs. comment mentions): the
    // ticker imports serializeTerminal, the filmstrip imports readMirrorFrame and does
    // NOT import serializeTerminal. A regression re-adding the filmstrip's own serialize
    // would have to re-import it → caught here.
    expect(tickerSource).toMatch(
      /import\s*\{[^}]*serializeTerminal[^}]*\}\s*from\s*"\.\/terminalMirror"/,
    );
    expect(filmstripSource).toMatch(
      /import\s*\{[^}]*readMirrorFrame[^}]*\}\s*from\s*"\.\/mirrorFrame"/,
    );
    expect(filmstripSource).not.toMatch(/import\s*\{[^}]*serializeTerminal/);
  });

  it("the mirror cost is gated on PiP-shown (pip-visibility) in the ticker", () => {
    expect(tickerSource).toContain("pip-visibility");
    expect(tickerSource).toContain("pipShown");
  });
});

// M5 WP4 codify — the layout wiring + per-layout render contract. The pure layout core
// (enum/cycle/needsMirror/nextLayout/coerce) is covered by pipLayout.test.ts and the
// serialize-set decision by mirrorFrameSharing.test.ts; THESE guard the WIRING that
// connects them to the runtime surfaces, in the same ?raw-source-guard style as above.
// (The live render of each layout + the vertical-mirror geometry fix are verify-self/
// human-covered via the MCP bridge — and CSS can't be ?raw-asserted under Vitest anyway,
// see SURFACE-2026-06-26-PRETTIER-DRIFT-AND-BRITTLE-RAW-REGEX-TEST.)
describe("M5 WP4 — layout is backend-owned + the PiP renders by it", () => {
  it("Pip.tsx subscribes to pip-layout (the backend-owned active layout)", () => {
    // Losing this listen freezes the PiP on the default layout — the switcher would
    // appear dead. Guard the subscription + the coerce (honest fall-back on a bad value).
    expect(pipSource).toContain("PIP_LAYOUT_EVENT");
    expect(pipSource).toContain("coercePipLayout");
  });

  it("the root carries the layout class + data-layout so CSS selects the layout", () => {
    // The 4 layouts are CSS-selected off `.pip-layout-<x>` / [data-layout]; a regression
    // that dropped these would render every layout identically.
    expect(pipSource).toContain("pip-layout-${layout}");
    expect(pipSource).toContain("data-layout={layout}");
  });

  it("only the mirror layouts register a .pip-tile-mirror node (compact/minimal pay no serialize cost)", () => {
    // The render contract: compact + minimal must NOT register a mirror ref, else the
    // ticker's pipNeedsMirror gate is defeated (it would serialize for a layout with no
    // mirror to paint). The mirror-node `ref={` that populates mirrorRefs lives ONLY in
    // the mirror-layout branch; the minimal/compact branches return before it. Guard that
    // the mirror node + its ref registration are present exactly in the mirror path.
    expect(pipSource).toContain("mirrorRefs.current.set(tile.id, el)");
    // The compact + minimal branches are early-returns that render NO .pip-tile-mirror —
    // assert each branch's distinguishing class is present (so the 3-way split survives).
    expect(pipSource).toContain("pip-tile-compact");
    expect(pipSource).toContain("pip-tile-minimal");
    expect(pipSource).toContain("pip-tile-mirror-layout");
  });

  it("the ticker is layout-aware: pipNeedsMirror folds layoutNeedsMirror + pip-layout", () => {
    // The cost gate's WP4 extension: the PiP serialize/emit fire only for a shown mirror
    // layout. A regression dropping the layout check would re-introduce serialize cost for
    // a visible compact/minimal PiP. Guard the listen + the predicate use.
    expect(tickerSource).toContain("PIP_LAYOUT_EVENT");
    expect(tickerSource).toContain("layoutNeedsMirror");
    expect(tickerSource).toContain("pipNeedsMirror");
  });
});

// M5 WP4 Phase 2 codify — the switcher + persistence wiring. The persist/read-back
// round-trip itself is covered by the Rust store tests (config_store::settings) + the
// layout enum tests (pip::layout); the live cycle/persist/read-back was bridge-verified.
// THESE ?raw guards pin the frontend wiring that connects the switcher to those commands
// (a regression here would silently break the switcher without failing a unit test).
describe("M5 WP4 Phase 2 — the on-panel switcher + persisted-layout wiring", () => {
  it("the switcher cycles via the backend command (nextLayout → pip_set_layout)", () => {
    // The switcher does NOT set layout optimistically — it calls pip_set_layout and lets
    // the pip-layout broadcast drive the state (backend = source of truth). Guard both.
    expect(pipSource).toContain("nextLayout");
    expect(pipSource).toContain('invoke("pip_set_layout"');
  });

  it("the PiP seeds its layout on mount from the persisted value (pip_get_layout)", () => {
    // A freshly-shown panel must open in the last-chosen layout, not the default — the
    // read-back-on-mount path (operator-verified live + the Rust store round-trip test).
    expect(pipSource).toContain('invoke<string>("pip_get_layout")');
  });

  it("the switcher lives in its OWN ROW with a per-layout icon (operator UX, P2.5)", () => {
    // The switcher was reworked out of an absolute corner overlay (overlapped the status
    // dot, hard to spot) into its own row with a LayoutIcon depicting the current layout.
    // Guard the row + the icon component so a regression to the old overlay is caught.
    expect(pipSource).toContain("pip-switch-row");
    expect(pipSource).toContain("LayoutIcon");
    expect(pipSource).toContain('data-testid="pip-layout-switch"');
  });
});

// M5 WP4 Phase 3 codify — the content-driven resize wiring. The pure size math is fully
// covered by pipPanelSize.test.ts (grows-with-count per layout + cap/wrap on both axes);
// the backend `pip_resize` is a thin AppKit set_content_size wrapper that needs a live
// panel (driven live via the MCP bridge: size reacts to layout AND count, no focus steal —
// PASS 2026-06-26). THIS guards the FRONTEND wire that connects the math to the command:
// a regression severing the invoke, or dropping the roster-count dependency, would silently
// freeze the panel size without failing any unit test.
describe("M5 WP4 Phase 3 — the content-driven panel resize wiring", () => {
  it("Pip.tsx computes the size via computePanelSize and applies it via pip_resize", () => {
    // The PiP owns the roster + screen, so the size math runs HERE; the backend command
    // just applies it. Losing either end breaks the resize.
    expect(pipSource).toContain("computePanelSize");
    expect(pipSource).toContain('invoke("pip_resize"');
  });

  it("the resize reacts to BOTH the layout AND the workspace count (effect deps)", () => {
    // The whole operator model is "size = f(layout, N)" — the effect must re-run when
    // either changes. A regression dropping tileCount from the deps (the rejected static
    // model) would stop the panel reacting to opening/closing workspaces. Guard the
    // roster-size read + the effect dependency list.
    expect(pipSource).toContain("frame.tiles.length");
    expect(pipSource).toMatch(/\}, \[layout, tileCount\]\)/);
  });

  it("the size is computed against the live screen (current-display aware)", () => {
    // computePanelSize caps at ~90% of the screen edge then wraps; reading
    // window.screen.avail* keeps the cap on whatever display the panel is on.
    expect(pipSource).toContain("window.screen.availWidth");
    expect(pipSource).toContain("window.screen.availHeight");
  });
});

// M5 WP4 Phase 4 codify — the minimal-layout attention-weighting wiring. The pure
// ordering/predicate logic is fully covered by pipLayout.test.ts (orderForAttention
// awaiting-first/stable/no-mutate + isAwaitingInput contract); the live POP + reorder +
// no-false-POP were bridge-verified (windowId:'pip', mixed status, PASS 2026-06-26) and the
// operator approved the visual feel. THESE ?raw guards pin the wire that connects the pure
// helpers to the minimal-layout render — a regression here (applying the ordering to ALL
// layouts, dropping the awaiting POP class, or severing the helper) would silently break
// the "is anyone waiting on me?" glance without failing a unit test.
describe("M5 WP4 Phase 4 — minimal-layout attention weighting wiring", () => {
  it("orderForAttention is applied to the MINIMAL layout only (other layouts keep persisted order)", () => {
    // The reorder is scoped to minimal — the mirror/compact layouts must keep the filmstrip
    // order. Guard the call AND that it's gated on the minimal layout (not applied globally).
    expect(pipSource).toContain("orderForAttention");
    expect(pipSource).toMatch(/layout === "minimal"\s*\?\s*orderForAttention/);
  });

  it("an awaiting-input minimal tile gets the POP class (emphasis, not a new color)", () => {
    // .pip-tile-awaiting is the EMPHASIS hook (CSS glows the dot — no size scale; operator
    // dropped the scale in P4.2, blink + glow only); the COLOR stays
    // the shared status-dot-awaiting palette via WorkspaceStatusIndicator (never-disagree).
    // A regression dropping the class defeats the "needs me reads loud" cue.
    expect(pipSource).toContain("isAwaitingInput");
    expect(pipSource).toContain("pip-tile-awaiting");
  });

  it("the minimal dot keeps its project tooltip (a bare dot stays resolvable, P4.3)", () => {
    // No name is rendered in minimal — the title is the only way to resolve a dot to its
    // project on hover. Guard it stays on the minimal tile.
    expect(pipSource).toMatch(
      /pip-tile-minimal[\s\S]*?title=\{tile\.display_name\}/,
    );
  });
});

// M5 WP4 Phase 5 codify — the cross-layout never-disagree INVARIANT. Phase 5's job (P5.1)
// is to confirm the M3 status palette + "the PiP never disagrees with the filmstrip on a
// workspace's state" hold in EVERY layout. That was driven live across all 4 layouts via the
// bridge (PASS 2026-06-26). The STRUCTURAL reason it holds: every layout branch derives its
// dot from ONE `stateFor`-computed state rendered through the SHARED WorkspaceStatusIndicator
// — no layout hand-rolls a dot. THIS guard pins that structure so a future layout edit can't
// silently introduce a divergent dot (the regression the live check would catch only by
// chance). The single-occurrence reuse guard above is necessary but not sufficient — this
// adds the "no layout branch escapes the shared indicator" coverage.
describe("M5 WP4 Phase 5 — cross-layout never-disagree invariant (structural)", () => {
  it("the dot state is derived from stateFor ONCE per tile (single source)", () => {
    // One `state = stateFor(...)` per PipTile — every layout branch reads the SAME value,
    // so the PiP can never show a different state than the shared map for a workspace.
    const matches = pipSource.match(/stateFor\(statusMap, tile\.id\)/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("every dot in the PiP is the shared WorkspaceStatusIndicator (no hand-rolled status-dot)", () => {
    // Each layout branch's dot must be the shared `<WorkspaceStatusIndicator state={state}
    // snippet={snippet} />` — the ONE palette source shared with the filmstrip (the snippet
    // prop is the debt-paydown WP2 tooltip wiring). A raw `<div className="status-dot...">`
    // in any branch would be a divergence channel; assert there is none in Pip.tsx, and that
    // the indicator is used for all three rendering branches (minimal/compact/mirror).
    expect(pipSource).not.toMatch(/className=["'`][^"'`]*status-dot/);
    const indicatorUses =
      pipSource.match(
        /<WorkspaceStatusIndicator state=\{state\} snippet=\{snippet\}\s*\/>/g,
      ) ?? [];
    expect(indicatorUses.length).toBe(3); // minimal + compact + mirror branches
  });
});

// M5 WP4 Phase 5 codify — the operator-surfaced fixes (drag + mirror-while-hidden + icon).
// All three were bridge-verified live (pip_move moves the panel both axes; mirror node
// 0→10003 chars while main hidden; toggle renders the SVG) and operator-approved at
// verify-human. The drag/mirror mechanisms themselves are live-panel / interval behavior
// not reachable by a unit test (pip_move is an AppKit setFrameOrigin: call like pip_resize;
// the gate lives in the imperative tick, not the pure computeMirrorSet). THESE ?raw guards
// pin the WIRING so a regression that re-breaks the drag, re-freezes the PiP mirror, or
// reverts the icon fails CI rather than silently regressing.
describe("M5 WP4 Phase 5 — panel drag wiring (pip_move)", () => {
  it("the root's mousedown drives the panel via the backend pip_move", () => {
    // data-tauri-drag-region / startDragging / setPosition are all inert on the swizzled
    // borderless NonactivatingPanel; pip_move (AppKit setFrameOrigin:) is the ONLY path
    // that moves it. Guard the handler wire + the command invoke.
    expect(pipSource).toContain("onMouseDown={startPanelDrag}");
    expect(pipSource).toContain('invoke("pip_move"');
  });

  it("the drag tracks pointer deltas on window mousemove (survives a fast cursor)", () => {
    // Listening on window (not the small panel) keeps the drag alive when the cursor
    // outruns the panel; the per-move delta is what pip_move applies.
    expect(pipSource).toContain('window.addEventListener("mousemove"');
    expect(pipSource).toContain("screenX");
  });
});

describe("M5 WP4 Phase 5 — PiP mirror keeps updating while the main window is backgrounded", () => {
  it("the serialize tick skips ONLY when hidden AND the PiP needs no mirror", () => {
    // The bug: `if (document.hidden) return` froze the PiP mirror (the out-of-focus surface)
    // whenever the main window lost focus. The fix gates on `&& !pipNeedsMirror` so a
    // mirror-needing PiP keeps ticking while Claudesk is backgrounded. Guard the exact gate
    // — a regression back to the bare `document.hidden` early-return re-freezes the PiP.
    expect(tickerSource).toContain(
      "if (document.hidden && !pipNeedsMirror) return",
    );
    expect(tickerSource).not.toMatch(/if \(document\.hidden\) return/);
  });
});

describe("M5 WP4 Phase 5 — PiP toggle button icon", () => {
  it("the right-panel toggle renders the PipIcon, not the 'PiP' text", () => {
    // Operator polish: the bare "PiP" text was replaced with the standard PiP SVG glyph,
    // matching the sibling icon buttons. Guard the import + use, and that no stray text
    // label was left in the toggle button.
    expect(rightPanelHostSource).toContain("import { PipIcon }");
    expect(rightPanelHostSource).toContain("<PipIcon />");
  });
});
