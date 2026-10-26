// @vitest-environment jsdom
//
// M16.5 WP4 — turning the M10.9 gate OFF clears every live verify-human overlay at once. Only
// the ON→OFF EDGE invokes the clear; the call is captured as a VALUE through `mockIPC`.

import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { useClearAttentionOnGateOff } from "../useClearAttentionOnGateOff";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const calls: string[] = [];
let root: Root | null = null;

function Probe({ gate }: { gate: boolean }) {
  useClearAttentionOnGateOff(gate);
  return null;
}

async function renderSequence(gates: boolean[]) {
  calls.length = 0;
  mockIPC((cmd) => {
    calls.push(cmd);
    return 0;
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  for (const gate of gates) {
    await act(async () => root!.render(<Probe gate={gate} />));
  }
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  clearMocks();
});

describe("useClearAttentionOnGateOff", () => {
  it("the ON→OFF edge clears once", async () => {
    await renderSequence([true, false]);
    expect(calls).toEqual(["workspace_status_clear_attention"]);
  });

  it.each([
    ["booting with the gate OFF", [false]],
    ["staying OFF", [false, false]],
    ["turning ON", [false, true]],
    ["staying ON", [true, true]],
  ])("%s sends nothing", async (_n, gates) => {
    await renderSequence(gates);
    expect(calls).toEqual([]);
  });

  it("each later ON→OFF edge clears again", async () => {
    await renderSequence([true, false, true, false]);
    expect(calls).toEqual([
      "workspace_status_clear_attention",
      "workspace_status_clear_attention",
    ]);
  });
});
