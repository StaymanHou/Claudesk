import { describe, expect, it } from "vitest";
import {
  defaultConfigDir,
  deleteProfileConfirmSpec,
  initialDraft,
  nameError,
  nextStep,
  prevStep,
  statusLineText,
  stepError,
  toSpec,
  WIZARD_STEPS,
  withName,
  type WizardStep,
} from "../profileWizardModel";
import type { WizardDefaults } from "../../../state/profiles";

// F-b Phase 5 — the New-profile wizard's pure model.

const defaults: WizardDefaults = {
  config_root: "/u/.config",
  permission_mode: "acceptEdits",
  cleanup_period_days: 99999,
  theme: "dark",
  status_line: { type: "command", command: "npx -y ccstatusline@latest" },
  themes: ["auto", "dark", "light"],
};

describe("the wizard's step order (spec D.18)", () => {
  it("is name → dir → permission → retention → model → appearance → input → confirm", () => {
    expect(WIZARD_STEPS).toEqual([
      "name",
      "dir",
      "permission",
      "retention",
      "model",
      "appearance",
      "input",
      "confirm",
    ]);
  });

  it("walks forward and back one step at a time, clamped at both ends", () => {
    const walked: WizardStep[] = [WIZARD_STEPS[0]];
    while (walked[walked.length - 1] !== "confirm")
      walked.push(nextStep(walked[walked.length - 1]));
    expect(walked).toEqual([...WIZARD_STEPS]);
    expect(nextStep("confirm")).toBe("confirm");
    expect(prevStep("dir")).toBe("name");
    expect(prevStep("name")).toBe("name");
  });

  it("has no step that can be skipped: the permission step is always walked", () => {
    expect(nextStep("dir")).toBe("permission");
    expect(nextStep("permission")).toBe("retention");
  });
});

describe("the draft", () => {
  it("pre-fills from the defaults, with mouse tracking and copy-on-select OFF", () => {
    const d = initialDraft(defaults);
    expect(d.permissionMode).toBe("acceptEdits");
    expect(d.cleanupPeriodDays).toBe("99999");
    expect(d.theme).toBe("dark");
    expect(d.copyStatusLine).toBe(true);
    expect(d.mouseTracking).toBe(false);
    expect(d.copyOnSelect).toBe(false);
  });

  it("offers no status-line copy when the default profile has none", () => {
    expect(
      initialDraft({ ...defaults, status_line: null }).copyStatusLine,
    ).toBe(false);
  });

  it("the dir follows the name until the operator edits it", () => {
    let d = withName(initialDraft(defaults), "work", defaults.config_root);
    expect(d.configDir).toBe("/u/.config/claude-work");
    d = { ...d, configDir: "/elsewhere/x", dirEdited: true };
    d = withName(d, "work2", defaults.config_root);
    expect(d.configDir).toBe("/elsewhere/x");
    expect(defaultConfigDir("/u/.config/", "n")).toBe("/u/.config/claude-n");
  });

  it("maps to the backend spec by value", () => {
    const d = {
      ...withName(initialDraft(defaults), "work", defaults.config_root),
      model: "  opus ",
      cleanupPeriodDays: " 30 ",
    };
    expect(toSpec(d)).toEqual({
      name: "work",
      config_dir: "/u/.config/claude-work",
      permission_mode: "acceptEdits",
      cleanup_period_days: 30,
      model: "opus",
      theme: "dark",
      copy_status_line: true,
      mouse_tracking: false,
      copy_on_select: false,
    });
    expect(toSpec({ ...d, model: "   " }).model).toBeNull();
  });
});

describe("validation", () => {
  it("mirrors Rust validate_name (the same cases as profiles::tests::profile_name_rules)", () => {
    for (const ok of ["neo", "a", "claude-2", "x-y-z"])
      expect(nameError(ok, []), ok).toBeNull();
    for (const bad of [
      "",
      "default",
      "-neo",
      "Neo",
      "a b",
      "a/b",
      "x".repeat(41),
    ])
      expect(nameError(bad, []), bad).not.toBeNull();
  });

  it("rejects a name that collides with a listed profile (D.19)", () => {
    expect(nameError("neo", ["neo"])).toContain("already exists");
    expect(
      stepError("name", { ...initialDraft(defaults), name: "neo" }, ["neo"]),
    ).not.toBeNull();
  });

  it("the dir must be absolute and the retention a positive whole number", () => {
    const d = initialDraft(defaults);
    expect(stepError("dir", { ...d, configDir: "rel/x" }, [])).not.toBeNull();
    expect(stepError("dir", { ...d, configDir: "/abs/x" }, [])).toBeNull();
    for (const bad of ["", "0", "-1", "1.5", "abc"])
      expect(
        stepError("retention", { ...d, cleanupPeriodDays: bad }, []),
        bad,
      ).not.toBeNull();
    expect(
      stepError("retention", { ...d, cleanupPeriodDays: "99999" }, []),
    ).toBeNull();
  });
});

describe("statusLineText", () => {
  it("shows a command line's command, other shapes as JSON, and none as null", () => {
    expect(
      statusLineText({ type: "command", command: "bash ~/.claude/x.sh" }),
    ).toBe("bash ~/.claude/x.sh");
    expect(statusLineText({ type: "static", text: "hi" })).toBe(
      '{"type":"static","text":"hi"}',
    );
    expect(statusLineText(null)).toBeNull();
    expect(statusLineText(undefined)).toBeNull();
  });
});

describe("the Delete confirm (D.24)", () => {
  it("names the dir, says history and memory go with it, and Esc cancels", () => {
    const spec = deleteProfileConfirmSpec({
      name: "work",
      config_dir: "/u/.config/claude-work",
      provenance: "created",
    });
    expect(spec.message).toContain("/u/.config/claude-work");
    expect(spec.message).toContain("Trash");
    expect(spec.message).toContain("history");
    expect(spec.message).toContain("memory");
    expect(spec.escValue).toBe("cancel");
    expect(spec.buttons.map((b) => b.value)).toEqual(["cancel", "delete"]);
    // The FIRST button is the default focus (ConfirmModal), so Enter cancels a destructive act.
    expect(spec.buttons.find((b) => b.variant === "primary")).toBeUndefined();
  });
});
