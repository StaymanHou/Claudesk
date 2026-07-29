import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import appSrc from "../../../App.tsx?raw";
import panelSrc from "../SettingsPanel.tsx?raw";
import { menuActionFor, MENU_IDS } from "../../../menu/menuBridge";

/** Resolve a path under `src/`. CSS is read via node:fs, NOT `?raw` — Vite's CSS plugin
 *  intercepts `?raw` on .css files and returns processed output rather than file text
 *  (the .tsx `?raw` convention does not extend to stylesheets). */
function resolveFromSrc(rel: string): string {
  return fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
}

// M10.9 WP2 Phase 3 — wiring guards for the Settings panel shell.
//
// Source-text guards (the repo ?raw idiom — this project has no jsdom, so the live
// open/close/Esc behavior is MCP-bridge-verified in verify-self, not re-asserted here).
// What these pin is the wiring a refactor could silently sever.

describe("the Settings… menu item maps to a callback, not a synthetic chord", () => {
  it("menuActionFor returns the openSettings callback", () => {
    expect(menuActionFor(MENU_IDS.SETTINGS)).toEqual({
      kind: "callback",
      callback: "openSettings",
    });
  });

  it("is NOT a key action", () => {
    // Re-dispatching a synthetic ⌘, would run the App-level chord toggle that the menu
    // click already ran — open-then-close, the exact bug class that bit the `menu`
    // double-listener (vh.2). A callback is the correct shape for a frontend-owned
    // toggle; this pins it.
    const action = menuActionFor(MENU_IDS.SETTINGS);
    expect(action?.kind).not.toBe("key");
  });

  it("its id matches the Rust ids::SETTINGS value byte-for-byte", () => {
    // The Rust-side test (functional_ids_are_pinned_to_the_frontend_bridge) proves every
    // FUNCTIONAL_IDS entry appears in MENU_IDS. This is the value pin from the TS side.
    expect(MENU_IDS.SETTINGS).toBe("app.settings");
  });
});

describe("App.tsx mounts the panel app-level, lazily, with both entry points", () => {
  it("lazy-imports SettingsPanel (chunk loads on first open, not at boot)", () => {
    expect(appSrc).toContain(
      'lazy(() => import("./components/settings/SettingsPanel"))',
    );
  });

  it("registers the ⌘, chord on a capture-phase document listener", () => {
    expect(appSrc).toContain("isSettingsChord(e)");
    expect(appSrc).toContain(
      'document.addEventListener("keydown", onKeyDown, true)',
    );
  });

  it("routes the menu callback to the same panel state", () => {
    expect(appSrc).toContain('action.callback === "openSettings"');
    expect(appSrc).toContain("setShowSettings(true)");
  });

  it("renders inside Suspense so the lazy chunk has a fallback", () => {
    expect(appSrc).toContain("<SettingsPanel");
    expect(appSrc).toContain("onClose={() => setShowSettings(false)}");
    expect(appSrc).toContain('data-testid="settings-panel-loading"');
  });

  it("delegates the Esc-dismissal decision to the pure escDismissTarget seam", () => {
    // The BEHAVIOR (which overlay one Esc closes) is asserted for real, exhaustively, in
    // escDismiss.test.ts. This guard covers only the thing a value-test cannot see: that
    // App.tsx still routes through that seam rather than re-inlining the decision.
    //
    // The previous version of this test asserted the two branches appeared in the right
    // ORDER IN THE SOURCE — and passed while the behavior was broken, because React
    // defers state updaters and source order is not execution order. That failure is why
    // the decision now lives in a pure function: a source guard can verify STRUCTURE, and
    // must not be trusted to verify RUNTIME.
    expect(appSrc).toContain("escDismissTarget({");
    expect(appSrc).toContain("dashboard: showDashboardRef.current");
    expect(appSrc).toContain("settings: showSettingsRef.current");
    // Refs, not state, because the listener registers once with empty deps — reading
    // state there would close over a stale value.
    expect(appSrc).toContain("showSettingsRef.current = showSettings");
    expect(appSrc).toContain("showDashboardRef.current = showDashboard");
  });
});

describe("the picker offers a visible Settings entry point (discovery parity)", () => {
  // Added on operator review after the strip migration. WP1's verdict specified ⌘, + a
  // Settings… menu item, and nobody asked whether a chord plus a menu item is enough
  // DISCOVERY for the surface that had become the only home for four settings. The
  // Analytics button alone in the picker header made the asymmetry visible: two
  // app-global overlays, one with a button and one without.
  //
  // The parity is the invariant, so it is asserted as parity — not as "a button exists".
  // If a later phase adds a third global overlay to that header, this shape is the one to
  // extend.
  const pickerSrc = readFileSync(
    resolveFromSrc("components/picker/ProjectPicker.tsx"),
    "utf8",
  );

  it("renders a Settings button alongside the Analytics button", () => {
    expect(pickerSrc).toContain('data-testid="picker-open-settings"');
    expect(pickerSrc).toContain('data-testid="picker-open-dashboard"');
  });

  it("wires it to the app-level panel, not to local state", () => {
    // The picker must not own the panel — App.tsx holds the single instance.
    expect(pickerSrc).toContain("onOpenSettings");
    expect(appSrc).toContain("onOpenSettings={() => setShowSettings(true)}");
  });

  it("guards on the handler exactly like the Analytics button does", () => {
    // Both hide when unwired (the dev-seam picker may mount without handlers).
    expect(pickerSrc).toContain("{onOpenSettings && (");
    expect(pickerSrc).toContain("{onOpenDashboard && (");
  });

  it("advertises the ⌘, chord in its tooltip, as Analytics advertises ⌘⇧A", () => {
    // The button is the discovery affordance; the tooltip is how a user LEARNS the chord
    // and stops needing the button.
    expect(pickerSrc).toContain('title="Settings (⌘,)"');
    expect(pickerSrc).toContain('title="Time analytics (⌘⇧A)"');
  });

  it("does NOT re-introduce settings CONTROLS into the picker", () => {
    // The button opens the panel; it is not a walk-back of the migration. Guard the
    // distinction that made the migration worth doing — no control may return here.
    for (const testid of [
      "picker-permission-mode",
      "picker-time-tracking",
      "picker-update-notifications",
      "picker-check-updates",
      "settings-workflow-features",
    ]) {
      expect(
        pickerSrc.includes(`data-testid="${testid}"`),
        `${testid} is back in the picker — settings CONTROLS belong in SettingsPanel`,
      ).toBe(false);
    }
  });
});

describe("the panel shell renders its four labelled groups", () => {
  it("has a stable testid for live verify-self", () => {
    expect(panelSrc).toContain('data-testid="settings-panel"');
    expect(panelSrc).toContain('data-testid="settings-panel-close"');
  });

  it("declares exactly the four groups WP1's verdict specified, in order", () => {
    // Order is part of the verdict (Claude Code · Workflow features · Analytics ·
    // Updates); a reshuffle should be a deliberate edit, not an accident.
    const ids = [...panelSrc.matchAll(/^\s+id="([a-z-]+)"$/gm)].map(
      (m) => m[1],
    );
    expect(ids).toEqual([
      "claude-code",
      "workflow-features",
      "analytics",
      "updates",
    ]);
  });

  it("is a dialog with an accessible label", () => {
    expect(panelSrc).toContain('role="dialog"');
    expect(panelSrc).toContain('aria-label="Settings"');
  });

  it("ships WITHOUT a dimmed backdrop (operator decision, 2026-07-28)", () => {
    // Verified at verify-human and ACCEPTED AS-IS: the panel is aria-modal but the scene
    // behind renders at full brightness, matching the app's flat dark aesthetic. Pinned
    // because it is a decision, not an oversight — a future phase (Phase 4's migration,
    // or M14 extending this panel) might "fix" the missing scrim on the reasonable-looking
    // assumption that a modal wants one. It does not. Re-ask before changing.
    const css = readFileSync(resolveFromSrc("App.css"), "utf8");
    const panelBlock = css.slice(
      css.indexOf(".settings-panel {"),
      css.indexOf(".settings-panel-loading"),
    );
    expect(panelBlock.length).toBeGreaterThan(0);
    expect(panelBlock).not.toMatch(/backdrop-filter/);
    expect(panelSrc).not.toMatch(
      /settings-backdrop|settings-scrim|settings-overlay/,
    );
  });

  it("stacks above the dashboard so Esc order and paint order agree", () => {
    // The Esc rule (escDismiss.ts) says Settings wins because it is IN FRONT. That is only
    // true if the CSS agrees — a z-index below the dashboard's 40 would make the panel
    // render behind the surface it claims priority over, and the Esc behavior would look
    // arbitrary rather than "dismiss the front one". Verified live at 45; pinned here.
    const css = readFileSync(resolveFromSrc("App.css"), "utf8");
    const panelZ = /\.settings-panel \{[^}]*z-index:\s*(\d+)/.exec(css)?.[1];
    const dashZ = /\.global-dashboard \{[^}]*z-index:\s*(\d+)/.exec(css)?.[1];
    expect(panelZ, "settings-panel needs an explicit z-index").toBeDefined();
    expect(dashZ, "global-dashboard needs an explicit z-index").toBeDefined();
    expect(Number(panelZ)).toBeGreaterThan(Number(dashZ));
  });
});
