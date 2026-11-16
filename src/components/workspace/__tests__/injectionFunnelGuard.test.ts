// M17 WP3 P4.4 — THE INJECTION FUNNEL GUARD.
//
// Every byte Claudesk itself sends into a CC session (skill buttons, the Prompt panel,
// auto-resume, Recycle, the supervisor) must go through `injectCommand`, which invokes the backend
// funnel `cc_inject`. For a REMOTE session that funnel waits for the pane's bracketed-paste mode
// and takes the pane out of tmux copy-mode first: a raw `cc_input` into a scrolled-up remote pane
// is SWALLOWED (reproduced live, WP3 Phase 3 verify-self). The operator's own typing is the one
// legitimate `cc_input` caller (XtermPane's `onData`), because typing while scrolled up goes to
// copy-mode by design (WP1 ruling).
//
// A SOURCE question (which files invoke which IPC), so a source guard, read through `node:fs`
// with comments stripped so prose cannot satisfy it. Each form is mutation-proven in the WIP.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../../..", import.meta.url));

function sourceFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Strip `//` and block comments (crudely, but strings with `//` in them are not at issue here). */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Files (relative to src/) whose code invokes `command`, however Prettier wraps the call. */
function invokers(command: string): string[] {
  const re = new RegExp(`invoke(?:<[^>]*>)?\\(\\s*"${command}"`);
  return sourceFiles()
    .filter((f) => re.test(code(readFileSync(f, "utf8"))))
    .map((f) => relative(SRC, f))
    .sort();
}

describe("the injection funnel (M17 WP3)", () => {
  it("walks a non-trivial set of production files (the scan is not vacuous)", () => {
    expect(sourceFiles().length).toBeGreaterThan(100);
  });

  it("only XtermPane (the operator's own typing) invokes cc_input", () => {
    expect(invokers("cc_input")).toEqual([
      "components/workspace/XtermPane.tsx",
    ]);
  });

  it("only injectCommand's module invokes cc_inject", () => {
    expect(invokers("cc_inject")).toEqual([
      "components/workspace/autoResumeFire.ts",
    ]);
  });

  it("injectCommand itself invokes cc_inject (not cc_input)", () => {
    const src = code(
      readFileSync(join(SRC, "components/workspace/autoResumeFire.ts"), "utf8"),
    );
    const start = src.indexOf("export async function injectCommand(");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("\n}\n", start));
    expect(body).toMatch(/invoke\(\s*"cc_inject"/);
    expect(body).not.toMatch(/invoke\(\s*"cc_input"/);
  });
});
