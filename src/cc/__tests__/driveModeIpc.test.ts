import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DRIVE_MODES, type DriveMode } from "../driveModeIpc";

// M12 WP4c Phase 2 — guards for the drive-mode wire vocabulary.
//
// ## Why a CROSS-LANGUAGE assertion earns its keep here
// `DriveMode` exists twice: as a Rust enum with `#[serde(rename_all = "kebab-case")]`-style
// literals, and as the TS union in `driveModeIpc.ts`. The frontend sends one of those
// strings; Rust parses it back into the enum.
//
// ⚠️ **The failure mode is not "this row is wrong" — it is "the picker cannot render."**
// `default_drive_mode` is a typed field, so an unparseable value makes `read_projects`
// return `Err`, which takes the WHOLE project list down (pinned Rust-side by
// `an_unknown_drive_mode_string_fails_the_whole_project_list`). And the two obvious guesses
// are both wrong: the Rust variants are named `FullAutopilot` and `StepByStep`, while the
// wire strings are `fsd` and `stepping`. A well-meaning "cleanup" renaming the TS union to
// `full-autopilot` would typecheck, lint, pass every existing test, and blank the picker on
// the next write.
//
// That asymmetry — cheap to get wrong, catastrophic and non-local when wrong — is what
// justifies reaching across the language boundary rather than trusting two independent
// lists to stay in sync by review.
//
// ## ⚠️ What this test can and cannot prove
// It reads the Rust SOURCE as text, so it proves the two vocabularies agree **as written**.
// It does NOT execute serde, so it cannot catch a serde attribute that changes the actual
// serialization without changing these literals. The authoritative proof of the Rust half
// is `drive_mode_serializes_to_these_literal_strings` (which round-trips through real
// serde); this test guards only the FRONTEND's copy against drifting from it.
//
// Read via `node:fs` rather than a `?raw` import — the convention this repo settled on for
// reading source-as-data (`[[vitest-raw-import-css-returns-processed-not-text]]` is about
// `.css` specifically, but `node:fs` is the honest tool for any file outside the Vite graph,
// and `src-tauri/` certainly is).

function rustConfigStoreSource(): string {
  return readFileSync(
    join(process.cwd(), "src-tauri", "src", "config_store", "mod.rs"),
    "utf8",
  );
}

describe("drive-mode wire vocabulary — the TS union must match Rust's", () => {
  it("exports every mode exactly once, in supervision order", () => {
    // Order is meaningful: it is the order the picker's <select> offers, most supervision
    // to least. Asserted as an exact VALUE rather than a set, so a reorder is a deliberate
    // edit here rather than a silent UI change.
    expect([...DRIVE_MODES]).toEqual([
      "stepping",
      "orchestrated",
      "autopilot",
      "fsd",
    ]);
    expect(new Set(DRIVE_MODES).size).toBe(DRIVE_MODES.length);
  });

  it("uses the literal strings Rust's DriveMode serializes to", () => {
    // The Rust side pins these same four literals in its own serde round-trip test; this
    // asserts the frontend's copy has not drifted from the Rust source of truth.
    const rust = rustConfigStoreSource();

    for (const mode of DRIVE_MODES) {
      expect(
        rust.includes(`"${mode}"`),
        `The TS union carries the drive mode "${mode}", but that literal does not appear ` +
          `in src-tauri/src/config_store/mod.rs. The wire strings are load-bearing: an ` +
          `unrecognized value fails serde on read and takes the ENTIRE project list with ` +
          `it (the picker cannot render). Check DriveMode's serde attributes and the ` +
          `Rust-side test drive_mode_serializes_to_these_literal_strings.`,
      ).toBe(true);
    }
  });

  it("does NOT use the variant names, which are the tempting wrong answer", () => {
    // The two spellings a reader would guess from the Rust variant identifiers. Neither is
    // valid on the wire; both would typecheck if someone "tidied" the union.
    const wrongGuesses = ["full-autopilot", "step-by-step", "fullAutopilot"];
    for (const wrong of wrongGuesses) {
      expect(
        (DRIVE_MODES as readonly string[]).includes(wrong),
        `"${wrong}" is a Rust VARIANT-name spelling, not a wire string. The wire values ` +
          `are "fsd" and "stepping".`,
      ).toBe(false);
    }
  });

  it("keeps the Rust command signature typed, not stringly", () => {
    // The typed boundary is the actual defense — it rejects a bad mode at the IPC edge
    // rather than letting it reach disk, where it would poison every subsequent read. If
    // this ever becomes `Option<String>` for symmetry with the model override, the
    // whole-list failure mode above becomes reachable from the frontend.
    const commands = readFileSync(
      join(process.cwd(), "src-tauri", "src", "config_store", "commands.rs"),
      "utf8",
    );
    expect(commands).toMatch(
      /pub fn project_set_default_drive_mode\([^)]*mode:\s*Option<DriveMode>/s,
    );
  });

  it("ships no getter — the cell seeds from the list_projects wire instead", () => {
    // Guards the DELIBERATE absence documented in driveModeIpc.ts's header. A per-row
    // getter would recreate the N+1 that M11.5's repair (B) removed: one whole-file read +
    // parse + sort per row, re-fired for all N whenever the filter box clears.
    const src = readFileSync(
      join(process.cwd(), "src", "cc", "driveModeIpc.ts"),
      "utf8",
    );
    // Strip comments first — the header discusses the getter by name at length, so a bare
    // identifier search would be satisfied by the prose explaining why it must not exist
    // ([[raw-guard-identifier-satisfied-by-own-comments]]).
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(
      /export\s+(async\s+)?function\s+getProjectDefaultDriveMode/,
    );
    expect(code).not.toContain("project_get_default_drive_mode");
  });
});

// Type-level check: the union and the runtime list cannot diverge silently.
// (Compile-time only — no runtime assertion, so it costs nothing at test time.)
const _exhaustive: readonly DriveMode[] = DRIVE_MODES;
void _exhaustive;
