import { describe, expect, it } from "vitest";
// M9 WP6a Phase 4 — source-text guards for the CM6 lazy-load fold-in
// (SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD, RESOLVED-at-WP6a). The WIN — CM6 leaving
// the initial bundle (main 1,156kB → 426kB, 500kB warning gone) — is a build-output
// property that is NOT vitest-testable (no bundle-analysis infra by design). But it is
// silently REVERSIBLE: a future static `import { EditorPanel }` (etc.) would pull CM6 back
// into `main` with ZERO test failure otherwise. These `?raw` assertions are the cheap guard
// that a re-static-import fails a unit gate instead of only re-bloating the bundle unnoticed.
// (Repo posture: pure logic + source-wiring → vitest via ?raw; live editor behavior →
// MCP-bridge verify-self. No RTL/jsdom.)
import paneTabs from "../PaneTabs.tsx?raw";
import editorEmpty from "../EditorEmpty.tsx?raw";
import rightPanelHost from "../../RightPanelHost.tsx?raw";

describe("M9 WP6a P4 — CM6-bearing surfaces are lazy() (kept out of the initial bundle)", () => {
  it("PaneTabs lazy-loads EditorPanel + SyntheticView (NOT static imports)", () => {
    // The dynamic-import form is what makes Rollup split CM6 into an async chunk.
    expect(paneTabs).toMatch(/const EditorPanel = lazy\(/);
    expect(paneTabs).toMatch(/import\("\.\/EditorPanel"\)/);
    expect(paneTabs).toMatch(/const SyntheticView = lazy\(/);
    expect(paneTabs).toMatch(/import\("\.\/SyntheticView"\)/);
    // Regression guard: no STATIC named import of the CM6 leaves (that would re-bundle CM6).
    expect(paneTabs).not.toMatch(/import\s*\{[^}]*\bEditorPanel\b[^}]*\}\s*from\s*"\.\/EditorPanel"/);
    expect(paneTabs).not.toMatch(/import\s*\{[^}]*\bSyntheticView\b[^}]*\}\s*from\s*"\.\/SyntheticView"/);
  });

  it("RightPanelHost lazy-loads DiffPanel + ProjectSearch (NOT static imports)", () => {
    expect(rightPanelHost).toMatch(/const DiffPanel = lazy\(/);
    expect(rightPanelHost).toMatch(/import\("\.\/diff\/DiffPanel"\)/);
    expect(rightPanelHost).toMatch(/const ProjectSearch = lazy\(/);
    expect(rightPanelHost).toMatch(/import\("\.\/search\/ProjectSearch"\)/);
    expect(rightPanelHost).not.toMatch(/import\s*\{[^}]*\bDiffPanel\b[^}]*\}\s*from\s*"\.\/diff\/DiffPanel"/);
    expect(rightPanelHost).not.toMatch(/import\s*\{[^}]*\bProjectSearch\b[^}]*\}\s*from\s*"\.\/search\/ProjectSearch"/);
  });
});

describe("M9 WP6a P4 — the empty pane renders a no-CM6 placeholder (so a fresh workspace doesn't pull CM6)", () => {
  it("EditorEmpty carries NO CodeMirror import", () => {
    expect(editorEmpty).not.toMatch(/@codemirror|@uiw|from "codemirror"/);
  });

  it("PaneTabs renders <EditorEmpty /> for the empty pane (NOT the CM6 EditorPanel)", () => {
    expect(paneTabs).toContain("<EditorEmpty />");
    // The former `<EditorPanel openPath={null} .../>` empty-pane render must be gone —
    // that was the line that pulled CM6 at workspace-open.
    expect(paneTabs).not.toMatch(/<EditorPanel[^>]*openPath=\{null\}/);
  });

  it("the lazy panels sit behind Suspense (no unguarded lazy render)", () => {
    expect(paneTabs).toContain("Suspense");
    expect(rightPanelHost).toContain("Suspense");
  });
});
