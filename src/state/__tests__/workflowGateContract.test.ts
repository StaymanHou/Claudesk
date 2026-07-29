import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import gateSrc from "../workflowGate.ts?raw";
import hookSrc from "../useWorkflowFeaturesEnabled.ts?raw";
import {
  WORKFLOW_FEATURES_ENABLED_EVENT,
  WORKFLOW_FEATURES_PRE_SEED_DEFAULT,
} from "../workflowGate";

// M10.9 WP2 — contract tests for the workflow-features consumption seam.
//
// Two tiers, matching the repo posture (pure logic → vitest, live DOM → the MCP
// bridge; this project has no jsdom/testing-library, so a hook's RUNTIME behavior is
// bridge-verified, not unit-tested):
//   1. VALUE assertions on the pure exports (the pre-seed default, the event literal).
//   2. ?raw SOURCE-TEXT guards on the hook's wiring — the same idiom as
//      pickerTimeTrackingWiring.test.ts and menuBridge.test.ts.

describe("workflow-gate event name is a cross-language contract", () => {
  it("matches the Rust WORKFLOW_FEATURES_ENABLED_EVENT byte-for-byte", () => {
    // The Rust side pins this same literal
    // (workflow_gate::commands::tests::event_name_is_the_pinned_cross_language_string).
    // This is the OTHER half: read the Rust source as text and prove the two agree, so
    // a rename on either side is a test failure rather than a silently dead listener.
    // Mirrors app_menu's functional_ids_are_pinned_to_the_frontend_bridge, which does
    // the same thing in the opposite direction.
    const rustSrc = readFileSync(
      fileURLToPath(
        new URL(
          "../../../src-tauri/src/workflow_gate/commands.rs",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    expect(rustSrc).toContain(
      `WORKFLOW_FEATURES_ENABLED_EVENT: &str = "${WORKFLOW_FEATURES_ENABLED_EVENT}"`,
    );
  });

  it("is the exact string the backend emits", () => {
    expect(WORKFLOW_FEATURES_ENABLED_EVENT).toBe("workflow-features-enabled");
  });
});

describe("the seam defaults OFF before the persisted value is read", () => {
  it("pre-seed default is false", () => {
    // The load-bearing startup property: the gate reads OFF in the window between mount
    // and the async seed resolving. Defaulting ON there would flash a gated surface for
    // every user on every launch — an OFF-invariant violation in the one window that is
    // hardest to observe manually.
    expect(WORKFLOW_FEATURES_PRE_SEED_DEFAULT).toBe(false);
  });

  it("the hook seeds its state from that constant, not an inline literal", () => {
    // Guards the constant from being bypassed — an inline `useState(false)` would pass
    // the assertion above while being free to drift.
    expect(hookSrc).toContain("useState(WORKFLOW_FEATURES_PRE_SEED_DEFAULT)");
  });

  it("a failed read leaves the gate OFF rather than throwing or defaulting on", () => {
    // The .catch must not setEnabled(true) — a backend read failure is not consent.
    expect(hookSrc).toContain(".catch(");
    const catchBody = hookSrc.slice(hookSrc.indexOf(".catch("));
    expect(catchBody).not.toContain("setEnabled(true)");
  });
});

describe("the seam wires to the single backend source of truth", () => {
  it("seeds from the getter on mount", () => {
    expect(hookSrc).toContain("getWorkflowFeaturesEnabled()");
  });

  it("subscribes to the broadcast so any surface flipping the gate re-syncs", () => {
    expect(hookSrc).toContain(
      "useTauriListen<boolean>(WORKFLOW_FEATURES_ENABLED_EVENT",
    );
  });

  it("guards the async seed against teardown-before-resolve (StrictMode)", () => {
    // Without the cancelled flag a fast unmount/remount sets state on a dead component
    // and can resolve stale-last — the same guard the picker's three effects carry.
    expect(hookSrc).toContain("cancelled");
  });

  it("binds the two commands by their exact registered names", () => {
    expect(gateSrc).toContain(
      'invoke<boolean>("workflow_get_features_enabled")',
    );
    expect(gateSrc).toContain('invoke<void>("workflow_set_features_enabled"');
  });
});
