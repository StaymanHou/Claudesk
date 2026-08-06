import { describe, it, expect } from "vitest";
import {
  MODEL_ALIAS_HINTS,
  MODEL_UNSET_LABEL,
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

  // ── The row label must stay DERIVED from the placeholder ──────────────────
  //
  // `MODEL_UNSET_LABEL` exists only to be a shorter form of `MODEL_UNSET_PLACEHOLDER`,
  // and its whole value is the DERIVATION: the two were independent hardcoded strings
  // until code review caught them drifting (see the constant's doc comment). Nothing
  // tested that — measured at M12 WP4a Phase 3 verify-codify: the constant had **zero**
  // test references, and replacing it with a hardcoded `"Inherit"` passed all 1924 tests.
  //
  // ⚠️ That exact drift is not hypothetical. WP4a's own decision mockup drew this cell as
  // `inherit` — a word that appears NOWHERE in the UI — and the wrong label survived into
  // a published artifact used to make a product decision. The real label is `"Default"`.
  //
  // Load-bearing for M12 WP4c, which adds a SECOND label to this cell (drive mode) under
  // Verdict (h) "label only when unset". That doubles the drift surface, so the derivation
  // rule needs a guard before the second label lands — not after.
  it("derives the row label from the placeholder rather than hardcoding it", () => {
    // The relationship, asserted as a relationship — not as two literals that could
    // both be edited to agree on something wrong.
    expect(MODEL_UNSET_PLACEHOLDER.startsWith(MODEL_UNSET_LABEL)).toBe(true);
    expect(MODEL_UNSET_LABEL.length).toBeLessThan(
      MODEL_UNSET_PLACEHOLDER.length,
    );
    // The label is the placeholder's leading phrase, with the parenthetical dropped.
    expect(MODEL_UNSET_LABEL).toBe(MODEL_UNSET_PLACEHOLDER.split(" (")[0]);
    // It must remain a bare phrase — no parenthetical survived the split.
    expect(MODEL_UNSET_LABEL).not.toContain("(");
  });

  it("renders the unset row label as the product's actual word", () => {
    // Pinned as a literal ON PURPOSE, in addition to the derivation test above. The
    // derivation alone cannot catch a rename of BOTH constants together, and this string
    // is what the operator reads in the picker — a silent change to it is a UI change.
    expect(MODEL_UNSET_LABEL).toBe("Default");
    // And the value-vs-unset branch actually uses it: a set value renders as itself.
    expect(displayModelValue("opus")).toBe("opus");
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
