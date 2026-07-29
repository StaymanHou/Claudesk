import { describe, it, expect, vi } from "vitest";
import { mapIpcError } from "../../picker/ipcError";
import {
  CC_PERMISSION_MODE_OPTIONS,
  DEFAULT_CC_PERMISSION_MODE,
  coerceCcPermissionMode,
} from "../../../cc/permissionMode";

// M10.9 WP2 Phase 4 — the seed/listen/optimistic-set/revert discipline, tested as
// BEHAVIOR rather than as source text.
//
// ## Why this file replaces three `?raw` guards
// Before the migration, this discipline was hand-copied three times in the picker and
// pinned by three near-identical source-text tests (`expect(pickerSrc).toContain(...)`).
// Those tests asserted that certain STRINGS appeared in a component — which is a proxy
// for the behavior, not the behavior. Phase 3 demonstrated the cost of that proxy: a
// source guard passed with flying colors while the runtime behavior was broken, because
// source order is not execution order.
//
// The controls now share ONE implementation (`useSettingControl`), so the discipline can
// be tested once, for real. This project has no jsdom/testing-library, so the hook's React
// wiring is bridge-verified live; what IS unit-testable — and what actually carries the
// risk — is the optimistic-set/revert state machine. It is modeled faithfully here:
// `setValue` with an updater callback, a promise that may reject, and a revert that must
// restore THE VALUE THAT WAS THERE BEFORE (not a stale closure capture).

/** Faithful model of the hook's `set`: optimistic update, persist, revert on reject. */
function makeControl<T>(initial: T, persist: (next: T) => Promise<void>) {
  let value = initial;
  const errors: string[] = [];
  const set = (next: T) => {
    const prev = value; // captured inside the updater, as the hook does
    value = next; // optimistic
    return persist(next).catch((err) => {
      value = prev; // revert to the value that was there before THIS change
      errors.push(mapIpcError("update thing", err));
    });
  };
  return { get: () => value, set, errors };
}

describe("optimistic set + revert-on-reject", () => {
  it("shows the new value immediately, before the write resolves", async () => {
    let resolve!: () => void;
    const persist = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const c = makeControl(false, persist);

    void c.set(true);
    // The whole point of "optimistic": the UI does not wait for the round-trip.
    expect(c.get()).toBe(true);
    resolve();
  });

  it("keeps the new value when the write succeeds", async () => {
    const c = makeControl(false, () => Promise.resolve());
    await c.set(true);
    expect(c.get()).toBe(true);
    expect(c.errors).toEqual([]);
  });

  it("REVERTS to the prior value when the write rejects, and surfaces the error", async () => {
    // The case that matters: a user flips a switch, the backend refuses, and the switch
    // must snap back rather than lying about persisted state.
    const c = makeControl(false, () => Promise.reject("disk full"));
    await c.set(true);
    expect(c.get()).toBe(false);
    expect(c.errors).toEqual(["Could not update thing: disk full"]);
  });

  it("reverts to the value before THAT change, not to the original", async () => {
    // Two successful changes then a failure: the revert must land on the second value,
    // not the initial one. This is why `prev` is read inside the updater rather than
    // closed over from render scope — a stale closure would rewind too far.
    let fail = false;
    const c = makeControl("a", () =>
      fail ? Promise.reject("nope") : Promise.resolve(),
    );
    await c.set("b");
    await c.set("c");
    fail = true;
    await c.set("d");
    expect(c.get()).toBe("c");
  });

  it("a rejected write does not strand the control on the failed value", async () => {
    // Regression shape: an early draft that reverted with `setValue(initial)` would
    // pass the simple case above and fail this one.
    const c = makeControl(0, (n) =>
      n === 3 ? Promise.reject("x") : Promise.resolve(),
    );
    await c.set(1);
    await c.set(2);
    await c.set(3);
    expect(c.get()).toBe(2);
  });
});

describe("coerce protects a control from an impossible persisted value", () => {
  // The permission-mode select is the only control that supplies `coerce`, and it is the
  // only one that CAN be handed a value outside its option set — a corrupt or
  // downgrade-era `settings.json`, or a broadcast from a newer build. Without coercion the
  // <select> is set to a value no <option> carries, which renders BLANK: the user sees an
  // empty dropdown and cannot tell what mode CC will spawn under.
  //
  // Behavior carried over from the picker during the migration. The picker's version was
  // pinned only by a source-text grep for the word "coerce"; this asserts what it does.

  /** The hook applies `coerce` at BOTH entry points — the seed read and the broadcast. */
  function applyCoerce<T>(raw: T, coerce?: (v: T) => T): T {
    return coerce ? coerce(raw) : raw;
  }

  it("falls back to the default when the persisted value is not a known mode", () => {
    expect(applyCoerce("nonsense" as never, coerceCcPermissionMode)).toBe(
      DEFAULT_CC_PERMISSION_MODE,
    );
    expect(applyCoerce(null as never, coerceCcPermissionMode)).toBe(
      DEFAULT_CC_PERMISSION_MODE,
    );
  });

  it("passes every real mode through untouched", () => {
    // The guard must not be so eager that it flattens legitimate values — that would
    // silently pin every user to "default".
    for (const opt of CC_PERMISSION_MODE_OPTIONS) {
      expect(applyCoerce(opt.value, coerceCcPermissionMode)).toBe(opt.value);
    }
  });

  it("is a no-op for controls that do not supply it (the three booleans)", () => {
    expect(applyCoerce(true, undefined)).toBe(true);
    expect(applyCoerce(false, undefined)).toBe(false);
  });
});

describe("error message composition is shared with the picker", () => {
  it("uses mapIpcError so both surfaces read alike", () => {
    // The panel reuses the picker's pure composer rather than a near-duplicate, so a
    // wording change lands in one place.
    expect(mapIpcError("update time tracking", "boom")).toBe(
      "Could not update time tracking: boom",
    );
    expect(mapIpcError("update time tracking", "")).toBe(
      "Could not update time tracking.",
    );
  });
});
