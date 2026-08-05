import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { actionFromAnnounced, type AnnouncedAction } from "../predictAction";

// M12 WP3 Phase 2 verify-codify — the FE↔BE wire vocabulary must agree.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE GAP THIS CLOSES, AND THE MEASUREMENT THAT FOUND IT
//
// `picker_announce_actions` returns action strings the frontend switches on. Those strings
// are declared TWICE:
//
//   Rust:  ACTION_CONTINUE = "continue"  /  ACTION_RESTORE = "restore"
//          (src-tauri/src/announce/mod.rs)
//   TS:    type AnnouncedAction = "continue" | "restore"
//          (src/state/predictAction.ts)
//
// Before this file, **nothing failed if one side changed and the other did not** — the two
// were linked only by a doc comment. Measured at verify-codify by mutating each side:
//
//   • Rust value → "cont", TS untouched:  Rust suite FAILS (it pins its own literal),
//                                          **TS suite PASSES 23/23** ← THE GAP
//   • TS type → "cont", Rust untouched:   tsc errors + 1 test fails ← already covered,
//                                          because a test passes the literal "continue"
//
// So the gap is **one-directional**: a Rust-side value change slips past the frontend. That
// asymmetry is worth stating precisely, because the intuitive framing ("the vocabulary is
// duplicated, so guard both sides") over-describes what was actually broken — and an
// over-broad guard invites deletion when someone notices half of it is redundant.
//
// The runtime symptom of the unguarded direction is quiet and confusing: `actionFromAnnounced`
// hits its `default` arm for every project, so **every row reads as "no prediction"** and no
// announcement ever appears. Nothing errors. It presents as "the feature silently does
// nothing" — which is the hardest shape to diagnose from a bug report.
//
// ⚠️ WHY A SOURCE READ RATHER THAN A GENERATED TYPE. The robust fix is codegen (ts-rs,
// specta) so one definition produces both. That is a real dependency and an architectural
// decision, not a drive-by at verify-codify — and this repo has exactly one such
// cross-language pair today. So: read the Rust constants and assert agreement. This is a
// TRIPWIRE, and it is honest about being one; `SURFACE-` it if a second pair appears.
//
// The `?raw`-guard hazards this repo has paid for are handled below: the extraction is by
// REGEX on a `const` declaration (not positional slicing), comments are irrelevant because
// the pattern requires the `= "value";` form, and an empty/failed read fails LOUDLY rather
// than vacuously passing.

const RUST_SOURCE = fileURLToPath(
  new URL("../../../src-tauri/src/announce/mod.rs", import.meta.url),
);

/** Extract `pub const <NAME>: &str = "<value>";` from the Rust module. */
function rustConst(name: string, src: string): string {
  const m = new RegExp(
    `pub const ${name}\\s*:\\s*&str\\s*=\\s*"([^"]*)"\\s*;`,
  ).exec(src);
  if (m === null) {
    throw new Error(
      `could not find 'pub const ${name}: &str = "…";' in announce/mod.rs — ` +
        `the constant was renamed, removed, or reshaped. Update this guard deliberately ` +
        `rather than deleting it: it is the only thing keeping the wire vocabulary in sync.`,
    );
  }
  return m[1];
}

describe("the announce wire vocabulary agrees across the FE↔BE boundary", () => {
  const src = readFileSync(RUST_SOURCE, "utf8");

  it("the Rust source is actually readable (non-vacuity guard)", () => {
    // ⚠️ Without this, a failed/empty read would make every assertion below trivially
    // pass — the exact vacuous-guard failure mode this repo has hit before. Assert the
    // haystack is real BEFORE trusting anything extracted from it.
    expect(src.length).toBeGreaterThan(500);
    expect(src).toContain("pub const ACTION_CONTINUE");
    expect(src).toContain("pub const ACTION_RESTORE");
  });

  it("ACTION_CONTINUE matches the TS vocabulary", () => {
    // ⚠️ THE MUTATION TARGET, and the direction that was genuinely unguarded. Changing
    // the Rust value alone previously left the TS suite green at 23/23 while the frontend
    // silently expected a string the backend no longer sent.
    const rust = rustConst("ACTION_CONTINUE", src);
    const ts: AnnouncedAction = "continue";
    expect(rust).toBe(ts);
  });

  it("ACTION_RESTORE matches the TS vocabulary", () => {
    const rust = rustConst("ACTION_RESTORE", src);
    const ts: AnnouncedAction = "restore";
    expect(rust).toBe(ts);
  });

  it("every Rust action value maps to a real action, not the default arm", () => {
    // The consequence test, and the one that states the actual failure mode rather than a
    // string comparison: whatever the backend can send must resolve to a typed action. If
    // a value drifts, `actionFromAnnounced` falls through to `default → null` and every
    // row silently reads as "no prediction".
    for (const name of ["ACTION_CONTINUE", "ACTION_RESTORE"]) {
      const value = rustConst(name, src);
      const action = actionFromAnnounced(value as AnnouncedAction);
      expect(
        action,
        `${name} = "${value}" must not fall through to the default arm`,
      ).not.toBeNull();
    }
  });

  it("the two Rust values are distinct", () => {
    // A copy-paste making both constants the same string would collapse the two arms into
    // one and pass every equality check above that happened to match.
    expect(rustConst("ACTION_CONTINUE", src)).not.toBe(
      rustConst("ACTION_RESTORE", src),
    );
  });

  it("neither value is a slash command or a raw CLI flag", () => {
    // Mirrors the Rust-side assertion so the intent is visible from both sides. The wire
    // vocabulary is deliberately neither: `"continue"` rather than `--continue` (the flag
    // is an implementation detail of the argv arm) and never `/resume` (which names the
    // picker-opening command this design exists to avoid).
    for (const name of ["ACTION_CONTINUE", "ACTION_RESTORE"]) {
      const value = rustConst(name, src);
      expect(value.startsWith("/"), `${name} must not be a slash command`).toBe(
        false,
      );
      expect(value.startsWith("-"), `${name} must not be a raw CLI flag`).toBe(
        false,
      );
    }
  });

  it("the extractor fails LOUDLY on a missing constant", () => {
    // Meta-test: proves the `throw` above is reachable, so a renamed constant surfaces as
    // an explicit failure rather than as `undefined === undefined` passing quietly.
    expect(() => rustConst("ACTION_NONEXISTENT", src)).toThrow(
      /could not find/,
    );
  });
});
