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

function runLinkCheck(fixture: string) {
  const r = spawnSync(
    process.execPath,
    [script, join(here, "fixtures", fixture)],
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
    const r = runLinkCheck("broken");
    expect(r.status).toBe(1);
    expect(r.out).toContain('"deletedExport" is not exported by');
  });

  it("exits 0 on a graph whose imports all bind", () => {
    const r = runLinkCheck("clean");
    expect(r.out).toContain("linked cleanly");
    expect(r.status).toBe(0);
  });

  it("does not false-alarm on a missing name used only as a type (erased, as at runtime)", () => {
    const r = runLinkCheck("type-only");
    expect(r.out).toContain("linked cleanly");
    expect(r.status).toBe(0);
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
