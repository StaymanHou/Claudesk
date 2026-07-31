import { describe, it, expect } from "vitest";
import {
  MODEL_ALIAS_HINTS,
  MODEL_UNSET_PLACEHOLDER,
  normalizeModelValue,
  displayModelValue,
  modelValueChanged,
} from "../modelOverride";

// modelOverride.ts is the pure (no React / no Tauri IPC) core of the M11.5 WP1 per-project
// model override. The blank-is-unset rule is the load-bearing part: the backend field is
// `Option<String>`, so an empty string must become `null` (key removed from disk) rather
// than a present-but-empty override that would reach CC as `--model ""`.
//
// The Rust side pins the SAME rule at two more layers (`set_default_model` on write,
// `build_cc_argv` on read — see `config_store::tests::set_default_model_normalizes_blank…`
// and `cc_session::tests::cc_argv_treats_blank_or_whitespace_model_as_unset`). The
// redundancy is deliberate; this is the TS third of that end-to-end contract.

describe("normalizeModelValue — blank means unset, not empty", () => {
  it("maps an empty string to null", () => {
    expect(normalizeModelValue("")).toBeNull();
  });

  it("maps whitespace-only input to null", () => {
    // Not `""`: an empty-string override would persist as present-but-empty and become an
    // argv token CC rejects. `null` removes the key entirely.
    for (const blank of ["   ", "\t", "\n", " \t\n "]) {
      expect(normalizeModelValue(blank)).toBeNull();
    }
  });

  it("trims surrounding whitespace from a real value", () => {
    expect(normalizeModelValue("  opus  ")).toBe("opus");
    expect(normalizeModelValue("\topus\n")).toBe("opus");
  });

  it("passes an alias through verbatim", () => {
    expect(normalizeModelValue("opus")).toBe("opus");
  });

  it("passes a full model ID through verbatim", () => {
    // The value set is OPEN (alias OR full name, per `claude --help`), so nothing here may
    // reshape, lowercase, or reject a value based on its form.
    expect(normalizeModelValue("claude-fable-5")).toBe("claude-fable-5");
  });

  it("does NOT reject an unrecognized value", () => {
    // The anti-validation property, asserted directly: a value absent from the alias hints
    // must still normalize successfully. CC adjudicates usability, not Claudesk — an
    // allowlist here would reject models released after this build shipped.
    expect(normalizeModelValue("some-future-model-9")).toBe(
      "some-future-model-9",
    );
    expect(MODEL_ALIAS_HINTS).not.toContain("some-future-model-9");
  });

  it("preserves interior whitespace rather than stripping it", () => {
    // Trim is surrounding-only. A value with an interior space is certainly invalid to CC,
    // but that is CC's call to report — silently mangling it into something else would
    // produce a confusing error naming a value the operator never typed.
    expect(normalizeModelValue("  two words  ")).toBe("two words");
  });
});

describe("MODEL_ALIAS_HINTS — hints, never a validation allowlist", () => {
  it("offers the three aliases claude --help documents", () => {
    expect(MODEL_ALIAS_HINTS).toEqual(["fable", "opus", "sonnet"]);
  });

  it("is not treated as exhaustive by the normalizer", () => {
    // Pins the contract between the two exports: adding a validator that consults
    // MODEL_ALIAS_HINTS would fail this test.
    const notAHint = "claude-opus-5";
    expect(MODEL_ALIAS_HINTS).not.toContain(notAHint);
    expect(normalizeModelValue(notAHint)).toBe(notAHint);
  });
});

describe("displayModelValue — unset shows the placeholder, not literal text", () => {
  it("renders null as an empty string so the placeholder shows through", () => {
    // If unset rendered as literal text, the operator would have to clear it before typing.
    expect(displayModelValue(null)).toBe("");
  });

  it("renders a set value as itself", () => {
    expect(displayModelValue("opus")).toBe("opus");
  });

  it("has a placeholder that names the inherit behavior", () => {
    expect(MODEL_UNSET_PLACEHOLDER).toMatch(/default/i);
  });
});

// `modelValueChanged` is what `ProjectModelCell.commit` consults to decide whether to
// issue an IPC write at all. "One write per real change, ZERO for a no-op blur" is the
// property that broke in M10.9 WP2 (`useSettingControl` called persist() inside a setState
// updater, and StrictMode's double-invoke made every toggle fire two writes — caught at
// code review, not by tests, because those tests modelled `set` with a plain closure that
// has no React semantics to double-invoke).
//
// The lesson applied here is NOT "write a React test that would have caught it" — a unit
// test still cannot see StrictMode. It is: keep the DECISION in a pure function and assert
// it as a value, so the component is thin enough to read.
describe("modelValueChanged — suppresses redundant writes", () => {
  it("is false when a blur re-commits the same value", () => {
    // Blur is an easy gesture to trigger accidentally; a no-op write would still re-persist
    // the entire project list.
    expect(modelValueChanged("opus", "opus")).toBe(false);
  });

  it("is false when whitespace-padding is the only difference", () => {
    expect(modelValueChanged("  opus  ", "opus")).toBe(false);
  });

  it("is false when an already-unset field is blurred while blank", () => {
    expect(modelValueChanged("", null)).toBe(false);
    expect(modelValueChanged("   ", null)).toBe(false);
  });

  it("is true when setting a value on a previously unset project", () => {
    expect(modelValueChanged("opus", null)).toBe(true);
  });

  it("is true when clearing a previously set value", () => {
    expect(modelValueChanged("", "opus")).toBe(true);
    expect(modelValueChanged("   ", "opus")).toBe(true);
  });

  it("is true when switching from one model to another", () => {
    expect(modelValueChanged("sonnet", "opus")).toBe(true);
  });
});
