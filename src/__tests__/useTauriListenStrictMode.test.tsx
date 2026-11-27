// @vitest-environment jsdom
// paydown-2026-11-27 WP5 — `useTauriListen` under <StrictMode> delivers each event ONCE.
//
// StrictMode mounts, cleans up and re-mounts every effect. The first run's `listen` is still
// pending at its cleanup, so it unlistens late, from the `cancelled` branch. Tauri's unlisten can
// then fail (`listeners[eventId].handlerId`) and leave that first listener attached; both
// listeners share the instance's `handlerRef`, so every event reached the handler twice (seen
// live at M18 WP6 as doubled install-log lines). The fake below reproduces exactly that: a
// listen that resolves later, and an unlisten that throws for a listener unlistened late, without
// detaching it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Cb = (e: { payload: unknown }) => void;
const attached = new Set<Cb>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: (_event: string, cb: Cb) => {
    attached.add(cb);
    return new Promise<() => void>((resolve) =>
      setTimeout(
        () =>
          resolve(() => {
            // Tauri's late-unlisten failure: throws, and the listener stays attached.
            throw new TypeError(
              "undefined is not an object (evaluating 'listeners[eventId].handlerId')",
            );
          }),
        0,
      ),
    );
  },
}));

import { useTauriListen } from "../useTauriListen";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  attached.clear();
});

function emit(payload: unknown) {
  for (const cb of [...attached]) cb({ payload });
}

describe("useTauriListen under StrictMode", () => {
  it("delivers each event to the handler once, and the failed late unlisten is not unhandled", async () => {
    const calls: unknown[] = [];
    const rejections: unknown[] = [];
    const onRejection = (e: PromiseRejectionEvent) => rejections.push(e.reason);
    window.addEventListener("unhandledrejection", onRejection);
    function Probe() {
      useTauriListen<number>("probe-event", (e) => calls.push(e.payload));
      return null;
    }
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <StrictMode>
          <Probe />
        </StrictMode>,
      );
    });
    // Let both `listen` promises resolve (the first one unlistens late and fails).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    // StrictMode's double mount registered two listeners with the fake; one must stay silent.
    expect(attached.size).toBe(2);
    emit(1);
    emit(2);
    expect(calls).toEqual([1, 2]);
    window.removeEventListener("unhandledrejection", onRejection);
    expect(rejections).toEqual([]);
  });
});
