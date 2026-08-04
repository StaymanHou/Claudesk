import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// M12 WP2 Phase 3 — REGRESSION GUARD for the hard-kill script's process-targeting rule.
//
// ## Why this test exists, and why it is here rather than in `tooling/`
// `tooling/unclean-flag/hard-kill-check.sh` is the only script in this repo that sends
// `SIGKILL`. Its one safety-critical property is that it must target the DEV app and never
// the operator's PRODUCTION install — both are named `claudesk`, and on 2026-07-13 a blanket
// name/port kill during a verify-self run killed the operator's live app
// (`[[verify-self-dev-vs-prod-process-name-collision]]`).
//
// The near-miss repeated during this very phase: the marker initially used an ABSOLUTE path,
// matched nothing (cargo runs the dev binary as a RELATIVE path), and the obvious "fix" for a
// marker that matches nothing is `pkill -f claudesk` — which would have killed the production
// app that was, in fact, running at the time.
//
// `tooling/` has a `.nodetest.mjs` convention, but those files are deliberately isolated from
// vitest's glob and are invoked by hand. A safety guard that nothing runs is close to no
// guard, so this lives in the vitest suite instead — the property under test is pure string
// matching over real command lines, which needs no shell.
//
// ## ⚠️ What this proves and what it does not
// It proves the MARKER discriminates dev from prod, and that the script retains its refusal
// paths. It does NOT execute the script or prove `kill` behavior — that is verified live
// (Phase 3 build log) and carried to the operator
// (`SURFACE-2026-08-03-M12-WP2-HARD-KILL-VERIFY-HUMAN-DEFERRED`).

const script = readFileSync(
  join(process.cwd(), "tooling", "unclean-flag", "hard-kill-check.sh"),
  "utf8",
);

/** The marker the script greps for, read from the script itself so the test cannot drift
 *  from the thing it is guarding. */
function markerFromScript(): string {
  const m = script.match(/^DEV_BINARY_MARKER="([^"]+)"/m);
  expect(
    m,
    "DEV_BINARY_MARKER not found — if it was renamed, this guard is vacuous and must be updated, not deleted",
  ).toBeTruthy();
  return m![1];
}

// Real command lines, captured from `ps` on 2026-08-03 while both apps ran concurrently.
const DEV_COMMAND = "target/debug/claudesk";
const PROD_COMMAND = "/Applications/Claudesk.app/Contents/MacOS/claudesk";

describe("hard-kill script targets the DEV app and never production", () => {
  it("the marker matches the real dev command line", () => {
    expect(DEV_COMMAND).toContain(markerFromScript());
  });

  it("⚠️ the marker does NOT match the real production command line", () => {
    // THE load-bearing assertion. If this ever fails, the script can target the operator's
    // installed app — the exact 2026-07-13 incident, with SIGKILL instead of a port kill.
    expect(
      PROD_COMMAND.includes(markerFromScript()),
      `marker "${markerFromScript()}" matches the PRODUCTION command line "${PROD_COMMAND}" — the script could kill the operator's installed app`,
    ).toBe(false);
  });

  it("the marker keeps the `debug/` discriminator", () => {
    // `debug/` is the ONLY substring distinguishing the two binaries: prod ships a release
    // build under /Applications, dev runs from cargo's debug profile. A marker of merely
    // "claudesk" or "target/claudesk" would match both.
    expect(markerFromScript()).toContain("debug/");
  });

  it("a bare-name marker would be unsafe — proving the test is not vacuous", () => {
    // Demonstrates the assertion above has teeth: the naive marker DOES match prod, so the
    // passing test is a real discrimination, not an artifact of both strings being unequal.
    expect(PROD_COMMAND).toContain("claudesk");
    expect(DEV_COMMAND).toContain("claudesk");
  });

  it("the script refuses on ambiguity rather than guessing a target", () => {
    // More than one match must REFUSE — never "pick the first". Both the refusal and its
    // non-zero return are asserted; a refusal that still returned 0 would fall through to
    // the kill.
    expect(script).toMatch(/count.*-ne 1/);
    expect(script).toContain("Cannot attribute a kill unambiguously");
    expect(script).toMatch(/return 2/);
  });

  it("the script re-validates the resolved pid's command before killing", () => {
    // Belt-and-braces: even after `dev_pid` resolves, the --kill branch re-checks the pid's
    // actual command against the marker. Two independent checks, so a bug in either one
    // alone cannot reach `kill -9`.
    const killBranch = script.slice(script.indexOf('"--kill"'));
    expect(killBranch).toMatch(/case "\$\(ps -p "\$pid" -o command=\)"/);
    expect(killBranch).toContain("does not run from");
    // …and the kill must come AFTER that validation, not before it.
    expect(killBranch.indexOf("kill -9")).toBeGreaterThan(
      killBranch.indexOf("does not run from"),
    );
  });

  it("the script never uses a blanket kill primitive", () => {
    // pkill/killall by name is the 2026-07-13 incident. Nothing in this file may reach for
    // one, including in a comment-stripped sense — a copy-paste of such a line is exactly
    // how the guard would be defeated.
    const code = script
      .replace(/^\s*#.*$/gm, "")
      .replace(/<<'STEPS'[\s\S]*?STEPS/g, "");
    expect(code).not.toMatch(/\bpkill\b/);
    expect(code).not.toMatch(/\bkillall\b/);
  });

  it("meta: the guard is not vacuous — the script actually loaded", () => {
    expect(script.length).toBeGreaterThan(1000);
    expect(script).toContain("DEV_BINARY_MARKER");
  });
});
