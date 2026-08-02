import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// M11 WP3 — the `rehype-raw` prohibition, pinned at the dependency level.
//
// ── Why a test guards a dependency ──────────────────────────────────────────────
// WP1's entire security verdict rests on ONE invariant: `react-markdown` escapes raw HTML
// by default, and `rehype-raw` turns that off. The app ships with `"security": {"csp": null}`,
// so there is no second line of defense — WP1 measured 0 live vectors without the plugin
// and 10 with it (`wbs.md` → "Probe outcomes" → WP1 verdict).
//
// Nothing in the type system, the linter, or the compiler can express "this package must
// never be installed". Adding it would be a one-line change that looks innocuous in review
// and silently converts a structurally-safe renderer into a configured-safe one. This test
// is the only thing standing between that edit and a shipped regression.
//
// ⚠️ Wanting inline HTML in a doc is a reason to RE-OPEN WP1's verdict — with the
// sanitizer discipline Option A would have required — not to delete this test.
//
// The companion runtime proof lives in `docsRender.test.tsx`: the hostile fixture scores 0
// live vectors against the parsed DOM, and that assertion was mutation-proven to FAIL when
// `rehype-raw` is added. This file catches the dependency; that one catches the behavior.

const pkgPath = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "package.json",
);

interface Pkg {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const pkg: Pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Pkg;

describe("the `rehype-raw` prohibition (WP1's load-bearing invariant)", () => {
  it("is absent from BOTH dependencies and devDependencies", () => {
    // devDependencies too: a test-only install is still one import away from production,
    // and the mutation check that proved this guard bites did exactly that install.
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain("rehype-raw");
    expect(Object.keys(pkg.devDependencies ?? {})).not.toContain("rehype-raw");
  });

  it("reads a package.json that actually parsed (the guard is not vacuous)", () => {
    // Without this, a path typo or an empty read would make every assertion above pass
    // against `{}` — the emptiness failure mode that has bitten `?raw` guards in this repo
    // repeatedly. Assert the file really is the project manifest.
    expect(pkg.dependencies).toBeDefined();
    expect(Object.keys(pkg.dependencies ?? {})).toContain("react-markdown");
  });

  it("still carries the three renderer packages WP1 selected", () => {
    // The positive half: if someone removes the renderer entirely, the prohibition above
    // would pass trivially. These pin that the chosen stack is the one installed.
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps).toContain("react-markdown");
    expect(deps).toContain("remark-gfm");
    expect(deps).toContain("rehype-sanitize");
  });
});

describe("the `csp: null` posture the raw-HTML rule compensates for", () => {
  // ⚠️ Three files reason from "the app ships with no CSP" — this file's header,
  // `DocMarkdown.tsx`'s, and `arch.md`'s "Webview HTML-rendering posture" decision. Until
  // now that premise lived only in COMMENTS, so a change to it would silently invalidate
  // the reasoning without failing anything. Same class as the comment-satisfied guards
  // this WP hit repeatedly ([[raw-guard-identifier-satisfied-by-own-comments]]).
  //
  // This is NOT asserting that `csp: null` is correct — the operator has agreed a CSP
  // SHOULD be set (`SURFACE-2026-08-02-SET-A-CSP-AS-SECOND-LINE-OF-DEFENSE`). It asserts
  // that the premise is still TRUE, so that setting one is a deliberate act that trips
  // this test and forces the compensating-control comments to be revisited together.

  const tauriConf: { app?: { security?: { csp?: unknown } } } = JSON.parse(
    readFileSync(
      join(
        fileURLToPath(new URL(".", import.meta.url)),
        "..",
        "..",
        "..",
        "..",
        "src-tauri",
        "tauri.conf.json",
      ),
      "utf8",
    ),
  ) as { app?: { security?: { csp?: unknown } } };

  it("reads a tauri.conf.json that actually parsed (anti-vacuity)", () => {
    // Without this, a path typo would make the assertion below pass against `undefined`.
    expect(tauriConf.app).toBeDefined();
    expect(tauriConf.app?.security).toBeDefined();
  });

  it("still ships NO CSP — change this test WITH the comments that depend on it", () => {
    expect(
      tauriConf.app?.security?.csp,
      "tauri.conf.json's csp changed. That is welcome — but the raw-HTML rule in " +
        "arch.md and the headers of DocMarkdown.tsx / this file all reason from " +
        "'there is no CSP'. Update them in the same change, then update this test.",
    ).toBeNull();
  });
});
