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
