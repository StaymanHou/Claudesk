import { describe, expect, it } from "vitest";
// M11.5 WP3 — a COPY guard, deliberately distinct from the WIRING guard in
// settingsTimeTrackingWiring.test.ts (which already pins seed/event/persist/testid/
// errorLabel in full — see this WP's scope-audit Finding 3). What was unguarded is the
// *claim* the copy makes, which is the only thing WP3 changes.
//
// Why a copy guard is worth having at all: the two surfaces below make a PRIVACY promise
// on the app's behalf ("offline", "local", machine-wide scope). If a future edit
// weakens or drops it while the capture path stays the same, the app silently stops
// disclosing something true — and nothing else in the suite would notice.
//
// ⚠️ WHITESPACE-NORMALIZED HAYSTACK, and every assertion must use it. Prose inside JSX
// wraps at Prettier's 80 cols, so a phrase matched against raw source passes only by luck
// about where the line broke — false alarms on correct copy in one direction, silent false
// negatives in the other. Normalizing makes each assertion fail on a dropped CLAIM and only
// on a dropped claim. Single-token assertions (testids, identifiers) use it too, for one
// rule instead of two.
//
// A `?raw` guard verifies STRUCTURE, never runtime — whether the copy *reassures* is a
// verify-human check. Full rationale and the reflow proof: `docs/lessons/source-text-guards.md` §3.
import settingsPanelRaw from "../SettingsPanel.tsx?raw";
import globalDashboardRaw from "../../workspace/dashboard/GlobalDashboard.tsx?raw";

/** Collapse all whitespace runs to single spaces — see the header note. */
const flat = (src: string) => src.replace(/\s+/g, " ");

const settingsPanel = flat(settingsPanelRaw);
const globalDashboard = flat(globalDashboardRaw);

// The three claims the copy must carry, per the WP's `## Copy decision`. Each is matched
// by a short phrase chosen to survive rewording of the surrounding sentence: the test
// should fail when a CLAIM is dropped, not when a comma moves.
describe("M11.5 WP3 — the Analytics settings copy states offline + local + scope", () => {
  it("claims fully offline, and says so concretely", () => {
    // ONE phrasing per claim, deliberately: the reader-facing word plus the one concrete
    // mechanism a user can check. Asserting more phrasings of "no network" pushes the copy
    // toward legalese, and over-insistence reads as defensiveness.
    expect(settingsPanel).toContain("Fully offline");
    expect(settingsPanel).toContain("nothing is uploaded");
  });

  it("claims storage is local to this Mac", () => {
    // "for your eyes only" was CUT at verify-human: it is implied by offline + local, and
    // it was the phrase doing the most to make the paragraph sound like a privacy policy.
    // Dropping a redundant reassurance does not weaken the disclosure.
    expect(settingsPanel).toContain("local database on this Mac");
  });

  it("discloses that capture is machine-wide, not Claudesk-scoped", () => {
    // The honesty half of the copy, and the reason this WP widened the roadmap's
    // candidate wording. The time-store drain (`time_store/commands.rs::drain_loop`)
    // writes EVERY hook event with no workspace filter — unlike status_broadcaster,
    // which drops events whose cwd matches no open workspace. So "visible only to you"
    // alone would be true but silent on breadth, inviting exactly the surprise the
    // copy exists to prevent. See memory `time-tracking-capture-is-machine-global`.
    expect(settingsPanel).toContain("across the whole Mac");
    expect(settingsPanel).toContain("not just projects open in Claudesk");
  });

  it("preserves the incumbent ON-vs-OFF fact the hint already earned", () => {
    // Scope-audit Finding 1: this hint was NOT an empty slot — it already carried a real
    // fact about the OFF state. The privacy claim was ADDED to it, not swapped for it.
    // Regression this catches: a future rewrite that keeps only the privacy language and
    // drops the reason a user might leave the feature off.
    expect(settingsPanel).toContain("zero storage and zero IO");
  });
});

describe("M11.5 WP3 — the tracking-OFF dashboard empty state points at Settings", () => {
  it("no longer directs the user to the deleted project-picker settings strip", () => {
    // Scope-audit Finding 4: this empty state said "Turn on Time tracking in the project
    // picker", but M10.9 WP2 DELETED the picker settings strip — the toggle lives only in
    // the ⌘, Settings panel now. A stale instruction pointing at a removed surface is
    // worse than none: it sends the user somewhere the control provably is not.
    //
    // Asserted as an ABSENCE, which is the assertion that actually rots if someone
    // reinstates the old wording — a presence-only check on the new text would pass with
    // both strings present.
    expect(globalDashboard).not.toContain("in the project picker");
  });

  it("names the Settings panel and its chord as the destination", () => {
    expect(globalDashboard).toContain("in Settings (⌘,)");
  });

  it("repeats the offline/local guarantee where a user meets the empty dashboard", () => {
    // Same promise as the settings hint, in the other place a user encounters the
    // feature. Both surfaces are asserted so they cannot drift apart into one honest
    // and one silent.
    expect(globalDashboard).toContain("Fully offline");
    expect(globalDashboard).toContain("nothing is uploaded");
    expect(globalDashboard).toContain("local database on this Mac");
  });

  it("does not restate the same claim three ways (the legalese regression)", () => {
    // The specific defect compressed at verify-human, pinned so it cannot creep back:
    // "no network path" was a THIRD phrasing of a claim already made twice. A future edit
    // adding reassurance should replace a phrase, not stack another one on.
    expect(settingsPanel).not.toContain("no network path");
    expect(globalDashboard).not.toContain("no network path");
  });

  it("keeps the empty state's stable testid for live verify-self", () => {
    expect(globalDashboard).toContain(
      'data-testid="dashboard-empty-tracking-off"',
    );
  });
});

// A meta-guard against the vacuous-guard failure mode (the M10.9 WP3.5a lesson: three
// guards there "looked like proof and were not"). If the `?raw` imports silently stopped
// yielding source text — the exact failure documented in memory
// `vitest-raw-import-css-returns-processed-not-text` for .css files — every `toContain`
// above would still pass structurally while proving nothing about the real files.
describe("meta — the copy guards are reading real source text", () => {
  it("both ?raw imports yield substantial source, not an empty or processed module", () => {
    // Asserts on the RAW imports deliberately: this arm exists to catch the ?raw loader
    // silently returning nothing, and `flat("")` is also "" — so checking the normalized
    // copies would still pass through the very failure this is here to detect.
    expect(typeof settingsPanelRaw).toBe("string");
    expect(typeof globalDashboardRaw).toBe("string");
    expect(settingsPanelRaw.length).toBeGreaterThan(1000);
    expect(globalDashboardRaw.length).toBeGreaterThan(1000);
    // A marker unrelated to this WP's copy: present in the real file, absent from any
    // plausible stub. Pins that we are reading THESE modules, not arbitrary text.
    expect(settingsPanel).toContain("SettingsGroup");
    expect(globalDashboard).toContain("dashboardMode");
  });

  it("a claim that is NOT in the copy does not match (the guards can fail)", () => {
    // Without this, a bug that made `toContain` always-true would leave the suite green.
    expect(settingsPanel).not.toContain("uploaded to our servers");
    expect(globalDashboard).not.toContain("uploaded to our servers");
  });
});
