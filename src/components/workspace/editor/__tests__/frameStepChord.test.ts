import { describe, expect, it } from "vitest";
import { frameStepForChord } from "../frameStepChord";
import { isPlayPauseChord } from "../playPauseChord";

const ev = (
  key: string,
  mods: Partial<
    Record<"metaKey" | "shiftKey" | "ctrlKey" | "altKey", boolean>
  > = {},
) => ({
  key,
  metaKey: false,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  ...mods,
});

describe("frameStepForChord", () => {
  it("bare , steps back and bare . steps forward", () => {
    expect(frameStepForChord(ev(","))).toBe(-1);
    expect(frameStepForChord(ev("."))).toBe(1);
  });

  it("every modifier, INDIVIDUALLY, turns the chord off (⌘, is Settings)", () => {
    for (const mod of ["metaKey", "shiftKey", "ctrlKey", "altKey"] as const) {
      expect(frameStepForChord(ev(",", { [mod]: true })), mod).toBeNull();
      expect(frameStepForChord(ev(".", { [mod]: true })), mod).toBeNull();
    }
  });

  it("other keys are not the chord, including the shifted < and >", () => {
    for (const key of ["<", ">", " ", "ArrowLeft", "ArrowRight", "a", "/"])
      expect(frameStepForChord(ev(key))).toBeNull();
  });
});

describe("isPlayPauseChord", () => {
  it("a bare Space", () => {
    expect(isPlayPauseChord(ev(" "))).toBe(true);
  });

  it("every modifier, INDIVIDUALLY, turns it off", () => {
    for (const mod of ["metaKey", "shiftKey", "ctrlKey", "altKey"] as const)
      expect(isPlayPauseChord(ev(" ", { [mod]: true })), mod).toBe(false);
  });

  it("other keys are not the chord", () => {
    for (const key of ["Spacebar", "Enter", "k", ".", ","])
      expect(isPlayPauseChord(ev(key))).toBe(false);
  });
});
