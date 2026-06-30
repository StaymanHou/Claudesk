// WP6 (debt-paydown, Theme I) — the one place the Tauri event-subscription lifecycle lives.
//
// Every status-surface consumer (useWorkspaceStatus, usePipFanout, useMirrorTicker, Pip's
// four subscriptions, …) hand-rolled the SAME async-listen boilerplate:
//
//   useEffect(() => {
//     let unlisten; let cancelled = false;
//     void listen<T>(EVENT, handler).then((fn) => { if (cancelled) { fn(); return; } unlisten = fn; });
//     return () => { cancelled = true; unlisten?.(); };
//   }, []);
//
// The `cancelled` guard is load-bearing: `listen` is async, so a component torn down before
// the promise resolves must STILL unlisten (else a duplicate listener leaks on a fast
// remount). Hand-copying that guard N times is exactly the kind of subtle invariant that
// rots when one copy is edited. This hook owns it once.
//
// The handler is held in a latest-ref so the subscription registers ONCE (empty deps) yet
// always calls the freshest closure — callers don't need to memoize their handler or list
// it as a dep (the same render-fresh-ref idiom used across the workspace effects).

import { useEffect, useRef } from "react";
import { listen, type EventCallback } from "@tauri-apps/api/event";

/**
 * Subscribe to a Tauri event for the lifetime of the calling component. Handles the async
 * `listen` + the torn-down-before-resolve `cancelled` guard + `unlisten` cleanup so callers
 * don't re-hand-roll it. `event` is the only re-subscribe trigger (changing it tears down +
 * re-subscribes); the handler is always the latest one via a ref, so it need not be stable.
 *
 * `onSubscribed` (optional) runs ONCE right after the listener is attached and NOT torn down
 * — for the handshake pings some consumers fire on subscribe (e.g. PiP's `pip-ready` emit so
 * the main webview replies with the current frame).
 */
export function useTauriListen<T>(
  event: string,
  handler: EventCallback<T>,
  onSubscribed?: () => void,
): void {
  // Latest-ref idiom: keep the freshest handler/onSubscribed without re-subscribing.
  // Written in an effect (NOT during render — react-hooks/refs), same as the workspace
  // effects' `*Ref.current = …` updates.
  const handlerRef = useRef(handler);
  const onSubscribedRef = useRef(onSubscribed);
  useEffect(() => {
    handlerRef.current = handler;
    onSubscribedRef.current = onSubscribed;
  });

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<T>(event, (e) => handlerRef.current(e)).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
      onSubscribedRef.current?.();
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [event]);
}
