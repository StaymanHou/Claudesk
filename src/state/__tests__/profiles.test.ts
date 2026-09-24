import { describe, expect, it } from "vitest";
import {
  missingProfileRefusal,
  resolveRowProfile,
  type Profile,
} from "../profiles";

const neo: Profile = {
  name: "neo",
  config_dir: "/u/.config/claude-neo",
  provenance: "adopted",
};

describe("resolveRowProfile — mirrors Rust profiles::resolve", () => {
  it.each([null, undefined, "", "  ", "default", " default "])(
    "%j → default",
    (ref) => {
      expect(resolveRowProfile(ref, [neo])).toEqual({ kind: "default" });
    },
  );

  it("a listed name resolves to THAT profile", () => {
    expect(resolveRowProfile("neo", [neo])).toEqual({
      kind: "listed",
      profile: neo,
    });
  });

  it("an unlisted name is MISSING, never default", () => {
    expect(resolveRowProfile("gone", [neo])).toEqual({
      kind: "missing",
      name: "gone",
    });
    expect(resolveRowProfile("neo", [])).toEqual({
      kind: "missing",
      name: "neo",
    });
  });
});

describe("missingProfileRefusal — the picker's open-time refusal (A.6)", () => {
  it("refuses a row naming an unlisted profile, naming it", () => {
    expect(missingProfileRefusal("gone", [neo])).toContain('"gone"');
  });
  it("lets default and listed rows open", () => {
    expect(missingProfileRefusal(null, [neo])).toBeNull();
    expect(missingProfileRefusal("neo", [neo])).toBeNull();
  });
});
