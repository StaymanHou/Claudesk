// @vitest-environment jsdom
//
// M18 WP5 (D8) — closing Settings with the ⌘, toggle ends a routed highlight too (its own clear,
// separate from the close button's `closeSettings`). See settingsHighlightHarness.ts.
import { afterAll, describe, expect, it } from "vitest";
import { clearMocks } from "@tauri-apps/api/mocks";
import {
  bootAndRoutedOpen,
  mockForInvite,
  panel,
  pressCmdComma,
  reopenFromGear,
} from "./settingsHighlightHarness";

mockForInvite();
afterAll(() => clearMocks());

describe("App: the ⌘, toggle ends a routed Settings highlight (D8)", () => {
  it("routed open highlights; ⌘, closes; a gear reopen highlights nothing", async () => {
    expect(await bootAndRoutedOpen()).toEqual([
      "settings-group-workflow-features",
    ]);
    await pressCmdComma();
    expect(panel()).toBeNull();
    expect(await reopenFromGear()).toEqual([]);
  });
});
