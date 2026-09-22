// @vitest-environment jsdom
//
// F-a WP1 — guards the ONE property whose breakage would be SILENT and would
// invalidate the probe's finding: the two arms must differ **only** by line wrapping.
//
// ⚠️ Why this narrow test, on THROWAWAY code that P3.4 deletes. Almost everything
// else in this harness fails LOUDLY — a broken render, an unrouted mode, a dead
// transcript are all visible the moment the page is opened, and verify-self already
// confirmed each. The arm-divergence property is different: if a future edit makes
// the arms identical (or makes them differ in some SECOND way), the probe still
// renders, still records, still looks right — and Phase 3 produces a confident
// result that means nothing. "Dictation is broken in CM6" and "wrapping breaks
// dictation" become indistinguishable, which is the exact ambiguity the wrap-OFF
// arm exists to resolve.
//
// So this is not coverage-for-its-own-sake on disposable code; it is the guard on
// the instrument's validity, and it is live only until P3.4 deletes the probe.

import { describe, it, expect, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import DictationProbe from "../DictationProbe";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<DictationProbe />);
  });
  return host;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
});

describe("DictationProbe arms", () => {
  it("mounts all three arms: wrap-ON, wrap-OFF, and the textarea control", () => {
    const el = render();
    const arms = el.querySelectorAll("[data-probe-arm]");
    expect(arms.length).toBe(3);
    const ids = Array.from(arms).map((a) => a.getAttribute("data-probe-arm"));
    expect(ids).toEqual(["cm6-wrap-on", "cm6-wrap-off", "textarea-control"]);
  });

  it("gives every arm its own transcript readout", () => {
    const el = render();
    // A shared readout would silently merge the arms' event streams, making a
    // per-arm comparison impossible while still looking populated.
    for (const id of ["cm6-wrap-on", "cm6-wrap-off", "textarea-control"]) {
      const pre = el.querySelectorAll(`[data-probe-transcript="${id}"]`);
      expect(pre.length).toBe(1);
    }
  });

  it("⚠️ the control arm is a REAL <textarea>, not another contenteditable", () => {
    const el = render();
    // The control's whole value is being a DIFFERENT input mechanism. If it were
    // silently swapped for a contenteditable it would share CM6's failure mode and
    // "the control also broke" would stop discriminating anything — a silent loss
    // of the probe's attribution power.
    const control = el.querySelector('[data-probe-arm="textarea-control"]');
    expect(control).not.toBeNull();
    expect(control!.tagName).toBe("TEXTAREA");
  });

  it("⚠️ the arms DIFFER in wrapping — the property Phase 3's finding rests on", () => {
    const el = render();
    // CM6 sets `white-space` from the lineWrapping extension: `break-spaces` when
    // wrapping is on, `pre` when it is off. Read the CLASS-driven computed style
    // rather than asserting on our own source text, so the check survives a
    // refactor of how the extension is passed in.
    const on = el.querySelector(
      '[data-probe-arm="cm6-wrap-on"] .cm-content',
    ) as HTMLElement | null;
    const off = el.querySelector(
      '[data-probe-arm="cm6-wrap-off"] .cm-content',
    ) as HTMLElement | null;

    expect(on).not.toBeNull();
    expect(off).not.toBeNull();

    const wsOn = getComputedStyle(on!).whiteSpace;
    const wsOff = getComputedStyle(off!).whiteSpace;

    // The assertion that matters is INEQUALITY: if a future edit makes both arms
    // wrap (or neither), the comparison arm stops being a comparison and the probe
    // silently measures nothing.
    expect(wsOn).not.toBe(wsOff);
    expect(wsOn).toBe("break-spaces");
  });

  it("both CM6 arms are editable — a read-only arm would record no input at all", () => {
    const el = render();
    for (const id of ["cm6-wrap-on", "cm6-wrap-off"]) {
      const content = el.querySelector(
        `[data-probe-arm="${id}"] .cm-content`,
      ) as HTMLElement | null;
      expect(content).not.toBeNull();
      expect(content!.getAttribute("contenteditable")).toBe("true");
    }
  });

  it("the exported report names every arm and carries each arm's final text", () => {
    const el = render();
    const report = el.querySelector("[data-probe-report]");
    expect(report).not.toBeNull();
    const text = report!.textContent ?? "";
    // The report is what the operator pastes back, so it must be self-describing:
    // an unlabelled dump would need annotation, and an events-only dump could not
    // answer success criterion (c), "did the utterance survive intact?".
    for (const label of [
      "CM6 — wrap ON (the shipping candidate)",
      "CM6 — wrap OFF (comparison arm)",
      "Plain <textarea> — CONTROL (known-good baseline)",
    ]) {
      expect(text).toContain(label);
    }
    expect(text).toContain("--- final text ---");
  });
});
