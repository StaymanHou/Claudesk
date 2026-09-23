import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Runs the REAL check:link script (not a re-implementation of it) against
// fixture projects, so the gate step is proven to fail on a missing export and
// to exit 0 otherwise. The repo run itself happens in `verify:auto`.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const script = join(here, "linkCheck.mjs");

/** Run the script on a fixture. Single-entry fixtures name their one entry `index` (no
 *  vite.config → Vite's default input), so they pass `--entries index`. */
function runLinkCheck(fixture: string, ...extra: string[]) {
  const r = spawnSync(
    process.execPath,
    [script, join(here, "fixtures", fixture), ...extra],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

describe("check:link — the linker step of verify:auto", () => {
  it("fails, naming the binding, when a value import has no matching export", () => {
    const r = runLinkCheck("broken", "--entries", "index");
    expect(r.status).toBe(1);
    expect(r.out).toContain('"deletedExport" is not exported by');
  });

  it("exits 0 on a graph whose imports all bind", () => {
    const r = runLinkCheck("clean", "--entries", "index");
    expect(r.out).toContain("linked cleanly");
    expect(r.status).toBe(0);
  });

  it("does not false-alarm on a missing name used only as a type (erased, as at runtime)", () => {
    const r = runLinkCheck("type-only", "--entries", "index");
    expect(r.out).toContain("linked cleanly");
    expect(r.status).toBe(0);
  });

  it("fails when only the SECOND of two entries has a broken import (mutant B)", () => {
    // The repo's shape: main + pip. A check that built only `main` would pass this fixture.
    const r = runLinkCheck("two-entry-broken");
    expect(r.status).toBe(1);
    expect(r.out).toContain('"deletedExport" is not exported by');
    expect(r.out).toContain("pip.js");
  });

  it("fails, naming the entry, when a required entry is not built at all", () => {
    // `rollupOptions.input` narrowed to `main`: the build succeeds, but pip.html's graph is
    // never linked. The default required set (main, pip) is what catches it.
    const r = runLinkCheck("two-entry-narrowed");
    expect(r.status).toBe(1);
    expect(r.out).toContain(
      "required entry chunk(s) missing from the build: pip",
    );
  });

  it("requires main AND pip by default — the repo's two webview entries", () => {
    // A single-entry fixture run without `--entries` must fail on the default set, so the
    // default cannot quietly shrink to "whatever was built".
    const r = runLinkCheck("clean");
    expect(r.status).toBe(1);
    expect(r.out).toContain("missing from the build: main, pip");
  });

  it("is wired into verify:auto after tsc and before the vitest run", () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    );
    expect(pkg.scripts["check:link"]).toBe(
      "node tooling/link-check/linkCheck.mjs",
    );
    const steps: string[] = pkg.scripts["verify:auto"]
      .split("&&")
      .map((s: string) => s.trim());
    const tsc = steps.indexOf("./node_modules/.bin/tsc --noEmit");
    const link = steps.indexOf("pnpm check:link");
    const test = steps.indexOf("pnpm test");
    expect(tsc).toBeGreaterThanOrEqual(0);
    expect(link).toBeGreaterThan(tsc);
    expect(test).toBeGreaterThan(link);
  });
});
