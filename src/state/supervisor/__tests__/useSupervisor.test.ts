// M15 WP4 Phase 4 — the supervisor host's contract.
//
// ⚠️ **WHAT IS BEING TESTED HERE IS THE WIRING, NOT THE DECISION.** The verdict, the parser and
// the fan-out each have their own suites; the failure this file exists to catch is the standing
// local shape — *a mechanism correct in itself behind a caller that does not honor it*, which
// has bitten this repo four times with one shipped CRITICAL.
//
// ⚠️ `useSupervisor` itself is a React hook and is not unit-driven here (the same posture every
// other listener seam in this repo takes). What IS driven is `readWipFor` — the one piece of
// host logic with a branch — plus the module-source guards below, which pin the wiring
// decisions that a type checker cannot see.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const SRC = resolve(__dirname, "../useSupervisor.ts");
const source = readFileSync(SRC, "utf8");

describe("readWipFor", () => {
  beforeEach(() => invokeMock.mockReset());
  afterEach(() => invokeMock.mockReset());

  it("calls the `wip_read` command with the project path and parses the text", async () => {
    invokeMock.mockResolvedValue({
      path: "/p/wip/f.md",
      text: "**Workflow:** feature\n- [x] Phase 1: a\n- [ ] Phase 2: b",
    });
    const { readWipFor } = await import("../useSupervisor");
    const parsed = await readWipFor("/p");

    expect(invokeMock).toHaveBeenCalledWith("wip_read", { projectPath: "/p" });
    expect(parsed?.workflow).toBe("feature");
    expect(parsed?.phases).toHaveLength(2);
  });

  it("returns null for an empty read rather than throwing", async () => {
    // A project with no WIP file is the ORDINARY case — most of the 20+ projects this app opens
    // do not use the workflow system at all.
    invokeMock.mockResolvedValue({ path: null, text: "" });
    const { readWipFor } = await import("../useSupervisor");
    expect(await readWipFor("/p")).toBeNull();
  });

  it("returns null when the command answers with nothing at all", async () => {
    invokeMock.mockResolvedValue(undefined);
    const { readWipFor } = await import("../useSupervisor");
    expect(await readWipFor("/p")).toBeNull();
  });
});

// ⚠️ SOURCE GUARDS. Each pins a wiring decision that is invisible to `tsc` and that a plausible
// "cleanup" would silently undo. They are deliberately narrow — a guard that merely asserts an
// identifier appears can be satisfied by the module's own comments, so each asserts a CALL or
// ARGUMENT SHAPE, and the flattened haystack strips comments first.
describe("⚠️ wiring guards (source-level)", () => {
  /** The module's code with comments stripped — see the note above. */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("⚠️ forwards the label to injectCommand as the 4th argument", () => {
    // ⚠️ `injectCommand`'s 4th parameter defaults to `"auto-resume"`. A wiring site that drops
    // the label makes every supervisor failure read as an M12 auto-resume failure — pointing
    // the ONE available diagnostic at the wrong subsystem. `FanOutDeps.inject` requires a
    // `label` parameter, but TypeScript accepts a stub that ACCEPTS AND IGNORES it, so the type
    // does not prove it is forwarded.
    expect(code).toMatch(
      /injectCommand\(\s*pty,\s*command,\s*undefined,\s*label\s*\)/,
    );
  });

  it("⚠️ does NOT set `model` on the adjudicator deps", () => {
    // ⚠️ R-6 condition 1: `assertPinnedModel` CHECKS any supplied model rather than honoring it,
    // so a wiring site that plumbs one through from config gets a loud failure. Leaving it unset
    // keeps `ADJUDICATOR_MODEL` the single source of truth. A future edit that "helpfully" adds
    // `model: settings.model` here would break every adjudication — loudly, by design, but this
    // guard names the reason.
    expect(code).not.toMatch(/\bmodel:\s*(?!\}|,)/);
  });

  it("⚠️ forwards model+prompt+timeoutMs to the Rust adjudicate command", () => {
    // The Rust command takes all three (`model`, `prompt`, `timeout_ms`); Tauri converts
    // camelCase → snake_case. Dropping any one is a runtime arg-mismatch `tsc` cannot see.
    expect(code).toMatch(/invoke<string>\(\s*"supervisor_adjudicate"/);
    expect(code).toMatch(/timeoutMs,?/);
  });

  it("⚠️ uses fireOne, NOT fanOut — the host is per-workspace", () => {
    // ⚠️ `fanOut` sweeps N workspaces and reads like the natural choice, but `recycleSession`
    // needs per-workspace React refs an app-level host cannot reach. Wiring `fanOut` here would
    // COMPILE and leave the recycle branch unable to act.
    expect(code).toMatch(/\bfireOne\(/);
    expect(code).not.toMatch(/\bfanOut\(/);
  });

  it("⚠️ holds the FireLedger in a ref so it survives across turns", () => {
    // ⚠️ A ledger recreated per turn remembers nothing, so `already-fired-for-this-turn` never
    // fires and every turn the supervisor sees twice is double-injected. `injectCommand` has no
    // undo.
    expect(code).toMatch(/ledgerRef/);
    expect(code).toMatch(/ledger:\s*ledgerRef\.current/);
  });

  it("⚠️ supplies readWip — without it the recycle branch is dead", () => {
    // `FanOutDeps.readWip` is OPTIONAL by design (its absence preserves WP3's chain-only
    // behavior), which means forgetting it here silently disables the entire WP4 feature while
    // every test still passes.
    expect(code).toMatch(/readWip:\s*async/);
  });

  it("⚠️ checks the gate INSIDE the callback, not only via `enabled`", () => {
    // The gate can flip while a turn is in flight, and the fire is the irreversible half.
    expect(code).toMatch(/if\s*\(!host\.enabled\)\s*return;/);
  });

  it("⚠️ refuses a project with no stored drive mode", () => {
    // R-1: supervision is opt-in. Firing into a project whose `default_drive_mode` is unset
    // would enforce a policy the operator never selected.
    expect(code).toMatch(/storedMode === null/);
  });

  it("⚠️ logs a SUCCESSFUL fire, not only failures", () => {
    // ⚠️ `outcome.fired === true` used to be discarded entirely, so a supervisor that injected
    // a slash command into an unwatched workspace left NO trace — `injectCommand` logs only on
    // IPC rejection. The rarer recycle branch had the announcement the common fire lacked.
    // ⚠️ Asserted as a READ of `outcome.fired` guarding a warn, not as the bare identifier: the
    // identifier alone is satisfied by a discarded destructure.
    expect(code).toMatch(/if\s*\(outcome\.fired\)/);
    expect(code).toMatch(/warn\(\s*`supervisor: fired/);
  });

  it("meta: the source guard is reading real code, not an empty string", () => {
    // ⚠️ Without this, every `not.toMatch` above passes vacuously if the read ever breaks.
    expect(code.length).toBeGreaterThan(1000);
    expect(code).toContain("useSupervisor");
  });
});
