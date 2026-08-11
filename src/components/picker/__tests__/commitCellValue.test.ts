import { describe, it, expect, vi } from "vitest";
import { commitCellValue } from "../commitCellValue";

// M12 WP4c Phase 4 — the single writer both cell lines go through.
//
// This is the module that makes "forgetting a paired step" impossible by construction rather
// than by vigilance at two call sites (the M11 WP4 `chooseDoc` lesson, whose recorded form is:
// *"funnel every write of a shared piece of state through ONE function, then guard that single
// writer"*). These tests drive the REAL function with spies — they do not re-implement its
// sequence, because a test that re-implements the logic shares its blind spot
// (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`).

/** A spy harness standing in for the component's state setters. */
function harness(persisted: string | null, persistImpl?: () => Promise<void>) {
  const applied: (string | null)[] = [];
  const refs: (string | null)[] = [];
  const failedFlags: boolean[] = [];
  const notified: (string | null)[] = [];
  const persist = vi.fn(persistImpl ?? (() => Promise.resolve()));
  return {
    applied,
    refs,
    failedFlags,
    notified,
    persist,
    args: (next: string | null) => ({
      next,
      persisted,
      changed: (a: string | null, b: string | null) => a !== b,
      persist,
      apply: (v: string | null) => applied.push(v),
      setRef: (v: string | null) => refs.push(v),
      setFailed: (f: boolean) => failedFlags.push(f),
      notifyCommitted: (v: string | null) => notified.push(v),
      what: "test value",
    }),
  };
}

describe("commitCellValue — the no-op guard", () => {
  it("does NOT persist when the value is unchanged", async () => {
    // Every `projects.json` write is a whole-file read-modify-write, so a redundant commit
    // re-persists the entire project list for nothing
    // (`SURFACE-2026-08-03-PROJECTS-JSON-WRITERS-ARE-WHOLE-FILE-RMW`). A blur is a very easy
    // gesture to perform accidentally, which is why this guard is not micro-optimization.
    const h = harness("opus");
    await commitCellValue(h.args("opus"));

    expect(h.persist).not.toHaveBeenCalled();
    expect(h.notified).toEqual([]);
  });

  it("re-applies the canonical value on a no-op, so a padded edit snaps back", async () => {
    const h = harness("opus");
    await commitCellValue(h.args("opus"));
    expect(h.applied).toEqual(["opus"]);
  });

  it("treats unset→unset as unchanged", async () => {
    const h = harness(null);
    await commitCellValue(h.args(null));
    expect(h.persist).not.toHaveBeenCalled();
  });
});

describe("commitCellValue — the success path", () => {
  it("applies optimistically, persists, then notifies the parent", async () => {
    const h = harness(null);
    await commitCellValue(h.args("opus"));

    expect(h.applied).toEqual(["opus"]);
    expect(h.persist).toHaveBeenCalledWith("opus");
    expect(h.notified).toEqual(["opus"]);
  });

  it("updates the ref BEFORE awaiting, so a second commit races the new value", async () => {
    // The ref is the StrictMode-safe source of truth for "what is persisted". If it were
    // updated only after the await, two quick commits would both read the ORIGINAL value and
    // the second would compute `changed` against a stale baseline.
    let refAtPersistTime: (string | null)[] = [];
    const h = harness(null, () => {
      refAtPersistTime = [...h.refs];
      return Promise.resolve();
    });
    await commitCellValue(h.args("opus"));
    expect(refAtPersistTime).toEqual(["opus"]);
  });

  it("clears the failed flag on a fresh attempt", async () => {
    const h = harness(null);
    await commitCellValue(h.args("opus"));
    expect(h.failedFlags[0]).toBe(false);
  });

  it("persists a CLEAR (null) as a real value, not a skipped write", async () => {
    // `null` means "remove the override" and must overwrite a previous value — it is not a
    // missing input to be ignored.
    const h = harness("opus");
    await commitCellValue(h.args(null));
    expect(h.persist).toHaveBeenCalledWith(null);
    expect(h.notified).toEqual([null]);
  });
});

describe("commitCellValue — the failure path", () => {
  it("reverts state AND ref, raises failed, and does NOT notify the parent", async () => {
    // Notifying on failure would make the parent's `recents` array lie — and that array is
    // the cell's seed on the next mount, so the lie would survive a filter round-trip and
    // present as a value that silently un-set itself.
    const err = new Error("ipc boom");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const h = harness("opus", () => Promise.reject(err));

    await commitCellValue(h.args("fable"));

    expect(h.applied).toEqual(["fable", "opus"]); // optimistic, then reverted
    expect(h.refs).toEqual(["fable", "opus"]);
    expect(h.failedFlags).toEqual([false, true]);
    expect(h.notified).toEqual([]); // ← the load-bearing assertion
    spy.mockRestore();
  });

  it("does not throw — the caller fires it without awaiting", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const h = harness(null, () => Promise.reject(new Error("boom")));
    await expect(commitCellValue(h.args("opus"))).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe("commitCellValue — the injected `changed` predicate", () => {
  it("honors a non-identity rule, which the model line needs", async () => {
    // The model's rule is NOT `!==`: a whitespace-only draft normalizes to `null`, so "  "
    // and null are the same persisted value. Passing the predicate keeps that rule in
    // `modelValueChanged`, where it is already tested, instead of duplicating it here.
    const h = harness(null);
    await commitCellValue({
      ...h.args("   "),
      changed: () => false, // stand-in for "normalizes to the same thing"
    });
    expect(h.persist).not.toHaveBeenCalled();
  });
});
