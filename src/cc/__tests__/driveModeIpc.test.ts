import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DRIVE_MODES,
  PROJECT_DRIVE_MODE_EVENT,
  type DriveMode,
} from "../driveModeIpc";

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

  it("the broadcast event name matches Rust's, and the payload carries the PATH", () => {
    // M13.5 WP4 P3.1. Two separately-declared literals (TS const + Rust const) that must agree,
    // same cross-language exposure as the mode vocabulary above: a silent mismatch means the
    // event fires and NOBODY listens — the surfaces then disagree with no error anywhere.
    const commands = readFileSync(
      join(process.cwd(), "src-tauri", "src", "config_store", "commands.rs"),
      "utf8",
    );
    expect(commands).toContain(
      `PROJECT_DRIVE_MODE_EVENT: &str = "${PROJECT_DRIVE_MODE_EVENT}"`,
    );

    // ⚠️ The PAYLOAD SHAPE is the half that actually prevents a bug. The permission mode is
    // app-global and broadcasts a bare enum; this value is PER-PROJECT, so a bare mode would
    // tell every open workspace to adopt one project's change. Pin that the Rust payload struct
    // carries `path` — if someone "simplifies" it to match the permission mode's precedent, the
    // cross-project corruption becomes reachable and nothing else would catch it.
    expect(
      commands,
      "the broadcast payload must carry the project path — a bare mode would apply one " +
        "project's change to every open workspace (see driveModeIpc.ts's header)",
    ).toMatch(/struct ProjectDriveModeChanged \{[^}]*pub path: String/s);
  });

  it("the PICKER never reads the drive mode per row — it seeds from the list_projects wire", () => {
    // ⚠️ NARROWED at M13.5 WP4 P2.1 (was "ships no getter", asserting the symbol's absence from
    // `driveModeIpc.ts` entirely). Triage record: the WIP's `## Test Triage`.
    //
    // The property being protected is UNCHANGED and is stated by the original comment: *"A
    // per-row getter would recreate the N+1 that M11.5's repair (B) removed: one whole-file read
    // + parse + sort per row, re-fired for all N whenever the filter box clears."* That is a
    // statement about the PICKER. P2.1 added `getProjectDefaultDriveMode` for the WORKSPACE
    // surface — a handful of open workspaces, one gated + visible-only read each, and the
    // workspace model carries no project record to seed from.
    //
    // ⚠️ Asserting the picker's OWN source is strictly stronger than the old symbol-absence
    // form, which would have passed if someone added the per-row call to `ProjectModelCell.tsx`
    // while importing the getter from anywhere else. The old guard watched the wrong file.
    for (const file of ["ProjectModelCell.tsx", "ProjectPicker.tsx"]) {
      const src = readFileSync(
        join(process.cwd(), "src", "components", "picker", file),
        "utf8",
      );
      // Strip comments — a header explaining why the read must not happen would otherwise
      // satisfy a bare identifier search ([[raw-guard-identifier-satisfied-by-own-comments]]).
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(
        code,
        `${file} reads the drive mode per row. The picker must seed from the ` +
          `list_projects wire — a per-row read re-fires for all N whenever the filter clears ` +
          `(SURFACE-2026-07-31-QUALITY-WP1-PER-ROW-IPC-REFETCHES-DATA-ALREADY-ON-THE-WIRE).`,
      ).not.toContain("getProjectDefaultDriveMode");
      expect(code).not.toContain("project_get_default_drive_mode");
    }
  });
});

// Type-level check: the union and the runtime list cannot diverge silently.
// (Compile-time only — no runtime assertion, so it costs nothing at test time.)
const _exhaustive: readonly DriveMode[] = DRIVE_MODES;
void _exhaustive;
