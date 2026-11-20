// @vitest-environment jsdom
//
// M18 WP5 (D8) — closing Settings by its close button ends a routed highlight. Before WP5 nothing
// cleared App's `settingsHighlight`, so every later open re-flashed the routed group (the panel
// mounts fresh and seeds its highlight from the prop). See settingsHighlightHarness.ts.
import { afterAll, describe, expect, it } from "vitest";
import { act } from "react";
import { clearMocks } from "@tauri-apps/api/mocks";
import {
  bootAndRoutedOpen,
  mockForInvite,
  panel,
  q,
  reopenFromGear,
} from "./settingsHighlightHarness";

mockForInvite();
afterAll(() => clearMocks());

describe("App: the close button ends a routed Settings highlight (D8)", () => {
  it("routed open highlights; close; a gear reopen highlights nothing", async () => {
    // Positive control: the routed open's highlight IS observable this way.
    expect(await bootAndRoutedOpen()).toEqual([
      "settings-group-workflow-features",
    ]);
    await act(async () => q('[data-testid="settings-panel-close"]')!.click());
    expect(panel()).toBeNull();
    expect(await reopenFromGear()).toEqual([]);
  });
});
