import { describe, expect, it } from "vitest";
// Vite ?raw imports bundle each file's source text at test time — the repo
// convention for structural guards (same trick as terminalSlotGuard.test.ts);
// no node:fs / jsdom needed. Pure-logic → vitest; live render/IPC → the MCP-bridge
// verify-self (already PASS for M5 WP3 Phase 1).
import viteConfig from "../../../vite.config.ts?raw";
import pipHtml from "../../../pip.html?raw";
import pipMain from "../main.tsx?raw";
import rightPanelHost from "../../components/workspace/RightPanelHost.tsx?raw";
import appTsx from "../../App.tsx?raw";
import defaultCapability from "../../../src-tauri/capabilities/default.json";

// M5 WP3 Phase 1 codify guards.
//
// Phase 1 promoted the WP1 THROWAWAY probe scaffold into the real `pip` module +
// a real Vite-entry PiP webview. The regressions worth pinning structurally
// (the live behavior is verify-self/human-covered, not re-asserted here):
//
//   1. The PiP is a SEPARATE webview, so it needs its own Vite multi-entry. Losing
//      the `pip` input silently drops pip.html from the bundle → the panel loads
//      a blank/404 page. Pin both inputs.
//   2. The probe→real rename must not regress: a future paste of stale `pip_probe`
//      / `pip-probe` / `PipProbe` naming (command, label, testid, html, class)
//      should fail CI rather than silently resurrect the THROWAWAY identifiers.
//   3. The PiP entry chain must stay intact: pip.html → src/pip/main.tsx → <Pip/>,
//      and the toggle button must invoke the renamed `pip_toggle` command.

describe("M5 WP3 — PiP Vite multi-entry is wired", () => {
  it("vite.config declares both the main and pip rollup inputs", () => {
    // The PiP webview can't share the main entry — it's a separate window with its
    // own JS heap. Both inputs must be present.
    expect(viteConfig).toContain("rollupOptions");
    expect(viteConfig).toMatch(/main:\s*"index\.html"/);
    expect(viteConfig).toMatch(/pip:\s*"pip\.html"/);
  });

  it("pip.html loads the PiP React entry", () => {
    expect(pipHtml).toContain('id="pip-root"');
    expect(pipHtml).toContain("/src/pip/main.tsx");
  });

  it("src/pip/main.tsx mounts <Pip /> into #pip-root", () => {
    expect(pipMain).toContain("pip-root");
    expect(pipMain).toContain("<Pip");
  });
});

describe("M5 WP3 — the PiP webview is granted capability coverage", () => {
  it("the default capability lists the 'pip' window (else listen/emit is denied)", () => {
    // The PiP NSPanel webview (label "pip") needs core:event to listen for
    // workspace-status + the pip-frame fan-out (Phase 2/3). Without "pip" in the
    // capability windows, every listen()/emit() in the panel is silently denied.
    expect(defaultCapability.windows).toContain("pip");
    expect(defaultCapability.windows).toContain("main");
  });
});

describe("M5 WP5 (rework) — PiP tri-state mode control wiring (replaces pip_toggle)", () => {
  // The dead-end fix (verify-human 2026-06-27): the boolean toggle + auto-summon checkbox
  // became one explicit tri-state PipMode (Off/On/Auto). The RightPanelHost icon button
  // CYCLES the mode via pip_set_mode (no more pip_toggle), keeps the pip-toggle testid,
  // and reads the current mode from the `pip-mode` broadcast for a legible label.
  it("RightPanelHost cycles mode via pip_set_mode + reflects the pip-mode broadcast", () => {
    expect(rightPanelHost).toContain('invoke("pip_set_mode"');
    expect(rightPanelHost).toContain('data-testid="pip-toggle"');
    expect(rightPanelHost).toContain('"pip-mode"'); // subscribes to the mode broadcast
    expect(rightPanelHost).not.toContain('invoke("pip_toggle")'); // the old command is gone
  });
});

describe("M5 WP5 (rework) — the View-menu mode radio wires to pip_set_mode", () => {
  // The View menu's three radio items (Off/On/Auto) map (in menuBridge) to pipMode*
  // callbacks, which App.tsx turns into invoke("pip_set_mode", {mode}). This guard pins
  // the menu path so a refactor can't silently sever it. Live-verified at verify-human.
  it("App.tsx's menu listener invokes pip_set_mode for the mode callbacks", () => {
    expect(appTsx).toContain('action.callback === "pipModeOff"');
    expect(appTsx).toContain('invoke("pip_set_mode"');
    expect(appTsx).not.toContain('invoke("pip_toggle")'); // old command gone from the menu path
  });
});

describe("M5 WP3 — no THROWAWAY pip_probe naming creeps back", () => {
  // One guard per source file the probe naming lived in. If a future change pastes
  // stale `pip_probe` / `pip-probe` / `PipProbe` identifiers back in, this fails.
  it.each([
    ["vite.config.ts", viteConfig],
    ["pip.html", pipHtml],
    ["src/pip/main.tsx", pipMain],
    ["RightPanelHost.tsx", rightPanelHost],
  ])("%s contains no probe-era pip identifiers", (_name, source) => {
    expect(source).not.toMatch(/pip[_-]probe/i);
    expect(source).not.toContain("PipProbe");
  });
});
