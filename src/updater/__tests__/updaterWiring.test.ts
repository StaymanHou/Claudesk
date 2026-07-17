import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// Source-text guards for the App.tsx updater wiring (the repo ?raw convention; the live
// banner/flow DOM behavior is verify-self-covered via the MCP bridge, not re-asserted
// here — the project has no jsdom/testing-library, so component DOM is driven live).
import appTsx from "../../App.tsx?raw";
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
