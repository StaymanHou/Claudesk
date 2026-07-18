import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// Source-text guards for the App.tsx updater wiring (the repo ?raw convention; the live
// banner/flow DOM behavior is verify-self-covered via the MCP bridge, not re-asserted
// here — the project has no jsdom/testing-library, so component DOM is driven live).
import appTsx from "../../App.tsx?raw";
import useUpdaterSrc from "../useUpdater.ts?raw";
import bannerSrc from "../UpdateNotifyBanner.tsx?raw";
// App.css is read via fs (Vite's CSS plugin intercepts `?raw` on .css and doesn't return
// the plain file text, so we read the source file directly for the layout-invariant guard).
const appCss = readFileSync(
  fileURLToPath(new URL("../../App.css", import.meta.url)),
  "utf8",
);

describe("App.tsx updater wiring (M10 WP4 Phase 4)", () => {
  it("mounts the useUpdater hook + the UpdateNotifyBanner", () => {
    expect(appTsx).toContain("useUpdater");
    expect(appTsx).toContain("UpdateNotifyBanner");
  });

  it("wires the confirm dialog via updateConfirmSpec and the WP1 fallback via quarantineFallbackSpec", () => {
    expect(appTsx).toContain("updateConfirmSpec");
    expect(appTsx).toContain("quarantineFallbackSpec");
  });

  it("no longer imports or mounts the deleted throwaway UpdaterTrigger", () => {
    // The comment mentions the name historically; assert there is no import/JSX usage.
    expect(appTsx).not.toContain('from "./updater/UpdaterTrigger"');
    expect(appTsx).not.toContain("<UpdaterTrigger");
  });

  it("routes the confirm choice to confirmUpdate / cancelUpdate", () => {
    expect(appTsx).toContain("updater.confirmUpdate()");
    expect(appTsx).toContain("updater.cancelUpdate()");
  });

  // P4.verify-human.1 layout-invariant guard (F12 fix): the banner must be an IN-FLOW
  // leading row ABOVE the scene wrapper, NOT an absolute overlay — otherwise it covers
  // the filmstrip's top strip and a slow-network late-load can steal a tile click.
  it("renders the banner BEFORE the app-shell-scene wrapper (in-flow leading row)", () => {
    const bannerIdx = appTsx.indexOf("<UpdateNotifyBanner");
    const sceneIdx = appTsx.indexOf('data-testid="app-shell-scene"');
    expect(bannerIdx).toBeGreaterThan(-1);
    expect(sceneIdx).toBeGreaterThan(-1);
    expect(bannerIdx).toBeLessThan(sceneIdx); // banner precedes the scene → pushed above
  });

  it(".update-banner is NOT position:absolute (in-flow, reserves its row)", () => {
    // Scope to the .update-banner rule block and assert it does not re-introduce the
    // absolute overlay that caused the filmstrip-occlusion hazard.
    const start = appCss.indexOf(".update-banner {");
    expect(start).toBeGreaterThan(-1);
    const block = appCss.slice(start, appCss.indexOf("}", start));
    expect(block).not.toContain("position: absolute");
    expect(block).toContain("flex: 0 0 auto"); // the in-flow row declaration
  });
});

// WP6 P1.1 — the error surface (SURFACE-2026-07-17-QUALITY-WP4-ERROR-STATE-UNCONSUMED):
// useUpdater produced phase==="error" + errorMessage that App.tsx consumed NOWHERE, so a
// failed apply silently reverted the banner. The UpdaterStatusRow now consumes both.
describe("App.tsx error-surface wiring (WP6 P1.1)", () => {
  it("mounts UpdaterStatusRow and feeds it the error phase + message", () => {
    expect(appTsx).toContain("UpdaterStatusRow");
    expect(appTsx).toContain('updater.phase === "error"');
    expect(appTsx).toContain("updater.errorMessage");
    expect(appTsx).toContain("updater.dismissError");
  });

  it("feeds the manual-check status note + dismiss to the status row (WP6 P1.4)", () => {
    expect(appTsx).toContain("updater.statusNote");
    expect(appTsx).toContain("updater.dismissStatusNote");
  });

  it("renders the status row BEFORE the app-shell-scene (in-flow, misclick-safe like the banner)", () => {
    const rowIdx = appTsx.indexOf("<UpdaterStatusRow");
    const sceneIdx = appTsx.indexOf('data-testid="app-shell-scene"');
    expect(rowIdx).toBeGreaterThan(-1);
    expect(rowIdx).toBeLessThan(sceneIdx);
  });

  it(".update-banner-error variant exists in the CSS", () => {
    expect(appCss).toContain(".update-banner-error");
  });
});

// WP6 P1.3 — the single-post-install-surface invariant
// (SURFACE-2026-07-17-QUALITY-WP4-FALLBACK-VS-ERROR-RACE): when QUARANTINE_FALLBACK_ACTIVE
// the quarantine dialog is the SOLE surface — confirmUpdate must NOT also set phase="error"
// on that path (it returns early). Guarded structurally on the hook source.
describe("useUpdater fallback-vs-error reconciliation (WP6 P1.3)", () => {
  it("returns early on the QUARANTINE_FALLBACK_ACTIVE branch (no double post-install surface)", () => {
    // Isolate the confirmUpdate fallback branch and assert the early-return precedes any
    // setPhase("error") that follows it in the same try block.
    const branchIdx = useUpdaterSrc.indexOf("if (QUARANTINE_FALLBACK_ACTIVE)");
    expect(branchIdx).toBeGreaterThan(-1);
    const afterBranch = useUpdaterSrc.slice(branchIdx);
    // The fallback branch sets the dialog path then returns BEFORE the error-phase set.
    const returnIdx = afterBranch.indexOf("return;");
    const errorPhaseIdx = afterBranch.indexOf('setPhase("error")');
    expect(returnIdx).toBeGreaterThan(-1);
    expect(errorPhaseIdx).toBeGreaterThan(-1);
    expect(returnIdx).toBeLessThan(errorPhaseIdx); // return happens first → no double surface
  });

  it("the menu-check path routes its outcome to a status note (WP6 P1.4, no longer discarded)", () => {
    expect(useUpdaterSrc).toContain("statusNoteForOutcome");
    expect(useUpdaterSrc).toContain("statusNoteForCheckError");
  });
});

// M10 WP6 Phase B1 (decision reversal) — one self-update path for every install. The
// banner exposes exactly ONE action set — Update… / Skip this version / Dismiss — with NO
// install-source branch and NO brew copy-to-clipboard affordance (removed with the gate).
// Source-text guards (no jsdom for components; live behavior is bridge-verified).
describe("UpdateNotifyBanner — single self-update action set, no brew branch (WP6 Phase B1)", () => {
  it("exposes the Update…/Skip/Dismiss action set", () => {
    expect(bannerSrc).toContain('data-testid="update-banner-update"');
    expect(bannerSrc).toContain('data-testid="update-banner-skip"');
    expect(bannerSrc).toContain('data-testid="update-banner-dismiss"');
  });

  it("carries NO brew copy-to-clipboard branch (install-source gate removed)", () => {
    // The gate revert must leave zero brew artifacts in the banner: no isBrew prop, no
    // copy button, no clipboard helper import, no BREW_UPGRADE_CMD.
    expect(bannerSrc).not.toContain("isBrew");
    expect(bannerSrc).not.toContain("copyToClipboard");
    expect(bannerSrc).not.toContain("BREW_UPGRADE_CMD");
    expect(bannerSrc).not.toContain("update-banner-brew-copy");
    expect(bannerSrc).not.toContain("Copied!");
  });

  it("the App.tsx banner call site passes no isBrew / install_source prop", () => {
    // The gate is gone frontend-wide — App must not read install_source off the banner.
    expect(appTsx).not.toContain("isBrew");
    expect(appTsx).not.toContain("install_source");
  });
});
