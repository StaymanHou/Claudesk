// @vitest-environment jsdom
//
// M14 WP3 Phase 2 — the hotkey group's rendered DOM, pinned as a PARSED VALUE.
//
// ## Why a render test and not a source guard
// P2.4's property is behavioral: "the rendered row count equals the registry length, so a
// future entry cannot be added to data yet silently not displayed." A `?raw` source guard
// cannot express that — it can only assert that a `.map(` appears somewhere, which passes
// just as happily when the map is over the wrong array or its output is dropped. Per
// `extract-for-import-when-a-raw-guard-cant-express-the-property`, render the real thing.
//
// Uses the established pattern (`projectModelCellRender.test.tsx`, `docsRender.test.tsx`):
// `renderToStaticMarkup` from the installed `react-dom` plus a jsdom parse — NOT
// `@testing-library/react`, which this repo has not adopted. Verified before writing these
// tests that SettingsPanel renders server-side cleanly under mocked Tauri IPC.
//
// ## ⚠️ What this can and cannot prove
// CAN: the resting DOM — one row per visible registry entry, correct host sectioning, the
//      CM6 rows PRESENT (P2.2), and the gate-dependent row ABSENT rather than hidden (P2.3).
// CANNOT: anything needing an event or state transition. `useSettingControl` seeds
//      asynchronously from IPC and holds its restrictive default here, so **only the
//      gate-OFF shape is reachable**. The gate-ON shape is asserted against `visibleChords`
//      directly (already unit-tested in chordRegistry.test.ts) and belongs to verify-self.
//
// ⚠️ The gate-OFF shape being the reachable one is the one worth having: it is the
// no-dead-affordance invariant, and it is the outcome a gate-off user actually sees.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { CHORD_REGISTRY, visibleChords } from "../../workspace/chordRegistry";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

async function renderPanel(): Promise<Document> {
  const Panel = (await import("../SettingsPanel")).default;
  return new JSDOM(renderToStaticMarkup(<Panel onClose={() => {}} />)).window
    .document;
}

/** The gate is OFF in this environment — `useSettingControl` holds its restrictive default. */
const EXPECTED = visibleChords(false);

describe("hotkey group — rendered DOM", () => {
  it("renders exactly one row per visible registry entry — no silent truncation", async () => {
    const doc = await renderPanel();
    const rows = doc.querySelectorAll('[data-testid^="hotkey-row-"]');

    // ⚠️ Count against the REGISTRY, not a hardcoded number. A hardcoded 21 would need
    // editing every time a chord is added, and the edit is exactly the moment someone would
    // "fix" the test instead of noticing the row never rendered.
    expect(
      rows.length,
      "every visible registry entry must render exactly one row",
    ).toBe(EXPECTED.length);

    const renderedIds = [...rows].map((r) =>
      r.getAttribute("data-testid")!.replace("hotkey-row-", ""),
    );
    expect(renderedIds.sort()).toEqual(EXPECTED.map((e) => e.id).sort());
  });

  it("omits the gate-dependent chord entirely — absent, not disabled (P2.3)", async () => {
    const doc = await renderPanel();

    const gated = CHORD_REGISTRY.filter((e) => e.requiresWorkflowGate);
    expect(
      gated.length,
      "fixture check: a gated entry must exist",
    ).toBeGreaterThan(0);

    for (const entry of gated) {
      expect(
        doc.querySelector(`[data-testid="hotkey-row-${entry.id}"]`),
        `${entry.id} requires the gate, so with the gate OFF it must be ABSENT from the DOM — ` +
          `rendering it disabled would be the dead affordance the OFF-invariant forbids`,
      ).toBeNull();
      // And its label must not leak in via some other row.
      expect(doc.body.textContent).not.toContain(entry.label);
    }
  });

  it("keeps the CM6-owned rows PRESENT but marked (P2.2)", async () => {
    const doc = await renderPanel();

    const cm6 = EXPECTED.filter((e) => !e.claudeskOwned);
    expect(cm6.length, "fixture check: CM6 entries must exist").toBeGreaterThan(
      0,
    );

    for (const entry of cm6) {
      const row = doc.querySelector(`[data-testid="hotkey-row-${entry.id}"]`);
      expect(
        row,
        `${entry.id} is CM6-owned and must still be SHOWN — omitting it makes the list lie ` +
          `by omission about why that key behaves differently inside the editor`,
      ).not.toBeNull();
      expect(
        row!.className,
        "a not-Claudesk-owned row must be marked so it can be de-emphasized",
      ).toContain("settings-hotkey-row-foreign");
    }

    // The converse: a Claudesk-owned row must NOT carry the marker, or the class means nothing.
    const owned = EXPECTED.find((e) => e.claudeskOwned)!;
    expect(
      doc.querySelector(`[data-testid="hotkey-row-${owned.id}"]`)!.className,
    ).not.toContain("settings-hotkey-row-foreign");
  });

  it("groups rows under their host section, in registry order", async () => {
    const doc = await renderPanel();

    for (const host of ["app", "workspace", "editor"]) {
      const section = doc.querySelector(
        `[data-testid="hotkey-section-${host}"]`,
      );
      expect(section, `host section ${host} must render`).not.toBeNull();

      const idsInSection = [
        ...section!.querySelectorAll('[data-testid^="hotkey-row-"]'),
      ].map((r) => r.getAttribute("data-testid")!.replace("hotkey-row-", ""));

      expect(idsInSection).toEqual(
        EXPECTED.filter((e) => e.host === host).map((e) => e.id),
      );
    }
  });

  it("renders every outcome of a context-scoped chord, not just the first", async () => {
    const doc = await renderPanel();

    // ⌘W is the canary: one chord, two focus-scoped outcomes. Rendering only outcomes[0]
    // would silently tell users ⌘W always closes a terminal.
    const multi = EXPECTED.filter((e) => e.outcomes.length > 1);
    expect(
      multi.length,
      "fixture check: a multi-outcome entry must exist",
    ).toBeGreaterThan(0);

    for (const entry of multi) {
      const row = doc.querySelector(`[data-testid="hotkey-row-${entry.id}"]`)!;
      const rendered = row.querySelectorAll(".settings-hotkey-outcome");
      expect(
        rendered.length,
        `${entry.id} has ${entry.outcomes.length} context-scoped outcomes and must render all of them`,
      ).toBe(entry.outcomes.length);
      for (const outcome of entry.outcomes) {
        expect(row.textContent).toContain(outcome.description);
      }
    }
  });
});
