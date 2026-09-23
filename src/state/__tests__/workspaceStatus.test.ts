import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyStatusUpdate,
  emptyStatusMap,
  snippetFor,
  stateFor,
  statusPresentation,
  type WireWorkspaceState,
  type WorkspaceStatusUpdate,
} from "../workspaceStatus";

describe("statusPresentation", () => {
  it("maps each live state to its label + dark-palette dot class", () => {
    expect(statusPresentation("running")).toEqual({
      label: "Running",
      dotClass: "status-dot-running",
    });
    expect(statusPresentation("idle")).toEqual({
      label: "Idle",
      dotClass: "status-dot-idle",
    });
    expect(statusPresentation("awaiting_input")).toEqual({
      label: "Awaiting input",
      dotClass: "status-dot-awaiting",
    });
    expect(statusPresentation("background_work")).toEqual({
      label: "Working in background",
      dotClass: "status-dot-background",
    });
    expect(statusPresentation("unknown")).toEqual({
      label: "Unknown",
      dotClass: "status-dot-unknown",
    });
  });

  it("gives background_work its own dot class, distinct from every other state", () => {
    // ⚠️ M13.5 WP2. Without this the `default` arm would render the new state as a grey
    // "Unknown" dot — a SILENT wrong-colour, not a visible break (the arm exists so a
    // surface never crashes on an unrecognized status). So "it doesn't throw" is not
    // evidence the state is wired; the class being distinct is.
    const classes = (
      [
        "running",
        "idle",
        "awaiting_input",
        "background_work",
        "unknown",
      ] as const
    ).map((s) => statusPresentation(s).dotClass);
    expect(new Set(classes).size).toBe(classes.length);
    expect(statusPresentation("background_work").dotClass).not.toBe(
      statusPresentation("unknown").dotClass,
    );
  });

  it("has a real CSS rule for every dot class, in BOTH App.css and pip.css", () => {
    // ⚠️ Closes the styled-but-never-emitted / emitted-but-never-styled gap for the dot
    // palette specifically (the repo-wide base-class version of this is still open as
    // SURFACE-2026-08-10-NO-GUARD-COUPLES-A-CSS-CLASS-TO-ITS-EMITTING-COMPONENT).
    // Both files matter: pip.css keeps a VERBATIM COPY of the palette by design, so the
    // main app and the out-of-focus surface can silently disagree on a colour — the one
    // failure mode the "all three surfaces agree" invariant exists to prevent.
    //
    // ⚠️ Read via node:fs, NOT a `?raw` import: Vitest's `?raw` on a .css file returns
    // Vite-PROCESSED output, not source text ([[vitest-raw-import-css-returns-processed-not-text]]).
    const read = (p: string) =>
      readFileSync(join(__dirname, "..", "..", p), "utf8").replace(
        /\/\*[\s\S]*?\*\//g,
        "",
      );
    const appCss = read("App.css");
    const pipCss = read("pip/pip.css");
    // This guard reads ONE CSS shape: a flat `.cls { … background-color: <value>; … }`. It
    // cannot see a colour expressed any other way, so a failure can mean "unreadable here",
    // not "missing" — the messages below say so rather than implying the colour is gone.
    const SHAPES =
      "(this guard reads only a flat `.cls { background-color: …; }` rule — it does NOT " +
      "understand nested rules, `var(--…)` custom properties, or shorthand `background:`; " +
      "if you used one, the colour may be present but unreadable here)";

    for (const state of [
      "running",
      "idle",
      "awaiting_input",
      "background_work",
      "unknown",
    ] as const) {
      const cls = statusPresentation(state).dotClass;
      // ⚠️ Assert the COLOUR DECLARATION, not merely a rule containing the class.
      // A mutation proved the weaker form vacuous: deleting the whole colour rule from
      // pip.css left the guard GREEN, because the *animation* block
      // (`@media … { .status-dot-background { animation: … } }`) also matches
      // `.status-dot-background[^{]*\{`. So the earlier predicate passed exactly when the
      // palette had drifted — the failure it exists to catch. Requiring
      // `background-color` inside the braces is what makes it bite.
      const colourRule = new RegExp(
        `\\.${cls}\\s*\\{[^}]*background-color\\s*:[^}]*\\}`,
      );
      expect(
        appCss,
        `App.css must define a background-color for .${cls} ${SHAPES}`,
      ).toMatch(colourRule);
      expect(
        pipCss,
        `pip.css must define a background-color for .${cls} ${SHAPES}`,
      ).toMatch(colourRule);

      // ⚠️ The two files must agree on the SAME hex. pip.css keeps a verbatim copy by
      // design, so "both define a colour" is not enough — they could each define a
      // DIFFERENT one, which is exactly the silent main-vs-PiP disagreement the
      // "all surfaces agree" invariant forbids. Compare the extracted values.
      const hexOf = (css: string) =>
        css
          .match(
            new RegExp(
              `\\.${cls}\\s*\\{[^}]*background-color\\s*:\\s*([^;]+);`,
            ),
          )?.[1]
          .trim()
          .toLowerCase();
      expect(
        hexOf(pipCss),
        `pip.css and App.css must agree on .${cls} ${SHAPES}`,
      ).toBe(hexOf(appCss));
    }
  });

  it("keeps background_work OUT of the blue family (operator correction, M13.5 WP2)", () => {
    // ⚠️ THIS PINS AN OPERATOR DECISION, not a preference of mine. Teal #2aa198 shipped
    // first and was rejected on sight: "blue is for 'awaiting input' which need my
    // immediate attention. background task don't need my attention." Teal PASSED an
    // ordinary distinguishability check — it is measurably different from orange, blue and
    // grey at 9px — and still failed, because a blue-adjacent hue inherits the alarm's
    // urgency at a glance. See design-priors.md →
    // semantic-distance-not-just-visual-distance-for-status-colour.
    //
    // The guard is on the HUE FAMILY, not the exact hex: re-theming to another non-blue
    // colour stays green, while drifting back toward teal/cyan/blue fails.
    //
    // ⚠️ The predicate is RED-vs-GREEN, and getting here took one wrong attempt worth
    // recording. The obvious encoding — "blue must not be the dominant channel" — is
    // VACUOUS for this property: purple #a371f7 has b=247, MORE blue than the alarm blue
    // #539bf5 (b=245), so it fails a blue-dominance test while being exactly the colour
    // the operator asked for. Measured channels:
    //     purple #a371f7  r=163 g=113 b=247   r-g = +50
    //     blue   #539bf5  r= 83 g=155 b=245   r-g = -72
    //     teal   #2aa198  r= 42 g=161 b=152   r-g = -119
    // Blue and teal are the *green-leaning* side of that axis; purple is the red-leaning
    // side. So `r > g` is what actually separates "not the alarm family" from "the alarm
    // family", and it admits magenta/pink/warm hues while rejecting cyan/teal/azure.
    const appCss = readFileSync(join(__dirname, "..", "..", "App.css"), "utf8");
    const hex = appCss.match(
      /\.status-dot-background\s*\{[^}]*background-color\s*:\s*#([0-9a-fA-F]{6})/,
    )?.[1];
    expect(
      hex,
      "background_work must have a hex background-color (this guard reads only a flat " +
        "`.status-dot-background { background-color: #rrggbb; }` rule — not nested rules, " +
        "`var(--…)`, shorthand `background:`, or a non-6-digit colour; one of those may be " +
        "present but unreadable here)",
    ).toBeTruthy();
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex!.slice(i, i + 2), 16));
    expect(
      r - g,
      `background_work #${hex} (r=${r} g=${g} b=${b}) leans green-of-blue like the ` +
        `awaiting-input alarm #539bf5 — pick a hue on the red side of the axis (purple/` +
        `magenta/warm), not cyan/teal/azure`,
    ).toBeGreaterThan(0);
    expect(hex!.toLowerCase(), "the rejected teal must not come back").not.toBe(
      "2aa198",
    );
  });

  it("falls back to Unknown for an unrecognized wire state (never throws)", () => {
    // A surface must never crash on a status it doesn't render.
    const rogue = "some_future_state" as WireWorkspaceState;
    expect(statusPresentation(rogue)).toEqual({
      label: "Unknown",
      dotClass: "status-dot-unknown",
    });
  });
});

describe("applyStatusUpdate", () => {
  it("keys an entry {state, snippet} by the wire's workspace_id verbatim (snake_case)", () => {
    const update: WorkspaceStatusUpdate = {
      workspace_id: "ws-1",
      state: "running",
      last_event_at: 1_718_000_000_000,
      last_output_snippet: "do the thing",
    };
    const next = applyStatusUpdate(emptyStatusMap, update);
    // The map value is an entry object — state + the folded-in snippet (D1 tooltip).
    expect(next).toEqual({
      "ws-1": { state: "running", snippet: "do the thing" },
    });
  });

  it("round-trips a minimal snake-key payload without renaming fields", () => {
    // A payload with the optional fields omitted (backend skip_serializing_if)
    // must still reduce — only workspace_id + state are required; snippet is undefined.
    const update = {
      workspace_id: "ws-2",
      state: "awaiting_input",
    } as WorkspaceStatusUpdate;
    const next = applyStatusUpdate(emptyStatusMap, update);
    expect(next["ws-2"].state).toBe("awaiting_input");
    expect(next["ws-2"].snippet).toBeUndefined();
  });

  it("overwrites the prior entry for a workspace and returns a new reference", () => {
    const first = applyStatusUpdate(emptyStatusMap, {
      workspace_id: "ws-1",
      state: "running",
    });
    const second = applyStatusUpdate(first, {
      workspace_id: "ws-1",
      state: "idle",
    });
    expect(second["ws-1"].state).toBe("idle");
    expect(second).not.toBe(first); // immutable update → fresh reference for React
  });

  it("tracks multiple workspaces independently", () => {
    let map = emptyStatusMap;
    map = applyStatusUpdate(map, { workspace_id: "ws-1", state: "running" });
    map = applyStatusUpdate(map, { workspace_id: "ws-2", state: "idle" });
    expect(map).toEqual({
      "ws-1": { state: "running", snippet: undefined },
      "ws-2": { state: "idle", snippet: undefined },
    });
  });

  it("a later snippet-less event clears a previously-observed snippet", () => {
    // The entry reflects the LATEST event — a state change carrying no snippet
    // (e.g. a Stop→idle with no message) must not leave the prior snippet stuck.
    let map = applyStatusUpdate(emptyStatusMap, {
      workspace_id: "ws-1",
      state: "awaiting_input",
      last_output_snippet: "May I run this command?",
    });
    expect(snippetFor(map, "ws-1")).toBe("May I run this command?");
    map = applyStatusUpdate(map, { workspace_id: "ws-1", state: "idle" });
    expect(snippetFor(map, "ws-1")).toBeUndefined();
  });
});

describe("stateFor", () => {
  it("returns the last observed state for a known workspace", () => {
    const map = applyStatusUpdate(emptyStatusMap, {
      workspace_id: "ws-1",
      state: "running",
    });
    expect(stateFor(map, "ws-1")).toBe("running");
  });

  it("returns the honest 'unknown' default for an unseen workspace", () => {
    // Absence in the map is Unknown — never a fabricated entry, never an error.
    expect(stateFor(emptyStatusMap, "ws-never-seen")).toBe("unknown");
  });
});

describe("snippetFor", () => {
  it("returns the last observed snippet for a workspace that carried one", () => {
    const map = applyStatusUpdate(emptyStatusMap, {
      workspace_id: "ws-1",
      state: "running",
      last_output_snippet: "running the tests",
    });
    expect(snippetFor(map, "ws-1")).toBe("running the tests");
  });

  it("returns undefined for an unseen workspace or one with no snippet", () => {
    expect(snippetFor(emptyStatusMap, "ws-never-seen")).toBeUndefined();
    const map = applyStatusUpdate(emptyStatusMap, {
      workspace_id: "ws-1",
      state: "idle",
    });
    expect(snippetFor(map, "ws-1")).toBeUndefined();
  });
});
