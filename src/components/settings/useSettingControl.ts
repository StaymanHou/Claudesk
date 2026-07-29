// M10.9 WP2 Phase 4 — the shared seed+listen+optimistic-set+revert discipline, factored
// into one hook.
//
// ## Why this exists
// Before this phase the discipline was hand-copied THREE times in `ProjectPicker.tsx`
// (permission mode, time tracking, update notifications) — ~40 lines each, identical in
// shape and subtly load-bearing in every line:
//
//   1. seed from the backend on mount (backend is the single source of truth),
//   2. `cancelled` guard so a StrictMode double-mount / early unmount can't set state on
//      a dead component or resolve stale-last,
//   3. subscribe to the broadcast so ANY other surface flipping the value re-syncs this
//      control (the native View-menu radio is a real second surface for permission mode),
//   4. on user change: optimistic set → persist → REVERT + surface the error on rejection.
//
// The migration into the Settings panel had to move that discipline, not duplicate it a
// fourth time for the new gate. Factoring it here means the four controls share one
// implementation, and — the part that matters after Phase 3's lesson — the behavior lives
// somewhere it can be reasoned about directly instead of being re-asserted by source-text
// greps in four places.
//
// ## What stays the caller's job
// The typed IPC getter/setter and the broadcast event name. Those differ per setting and
// are the only genuinely per-setting parts; everything else is this hook.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTauriListen } from "../../useTauriListen";
// Reuse the picker's pure error→message composer rather than writing a near-duplicate:
// these two surfaces should read alike, and that helper is already unit-tested. (Its
// module name says "picker" for historical reasons; the logic is surface-agnostic.)
import { mapIpcError } from "../picker/ipcError";

export interface SettingControl<T> {
  /** Current value — the backend default until the seed read lands. */
  value: T;
  /** Optimistically set + persist. Reverts to the prior value if the IPC rejects. */
  set: (next: T) => void;
}

export interface SettingControlSpec<T> {
  /** The value used before the seed resolves. MUST match the backend's default, or the
   *  control visibly flickers on every mount as the real value arrives. */
  initial: T;
  /** Typed IPC read. */
  get: () => Promise<T>;
  /** Typed IPC write. The backend re-broadcasts on success. */
  persist: (next: T) => Promise<void>;
  /** Broadcast event this setting fans out on. */
  event: string;
  /** Human label for the error message on a failed write (e.g. "update time tracking"). */
  errorLabel: string;
  /** Called with a user-facing message when a persist rejects. The caller owns the
   *  surface (a toast, a status row) — this hook does not render. */
  onError: (message: string) => void;
  /** Optional coercion applied to values arriving from the backend/broadcast, so a
   *  stale or corrupt persisted value falls back to something valid rather than
   *  selecting an impossible option. */
  coerce?: (raw: T) => T;
}

/**
 * One app-global setting, wired to the backend as the single source of truth.
 *
 * Read {@link SettingControlSpec} for what the caller supplies. The returned `set` is
 * optimistic: the UI updates immediately, and reverts only if the write actually fails —
 * which keeps the control responsive without ever showing a value the backend rejected.
 */
export function useSettingControl<T>(
  spec: SettingControlSpec<T>,
): SettingControl<T> {
  const { initial, get, persist, event, errorLabel, onError, coerce } = spec;
  const [value, setValue] = useState<T>(initial);
  // Latest-value mirror, so `set` can read the pre-change value WITHOUT doing it inside a
  // state updater. See `set` below for why that distinction is load-bearing.
  const valueRef = useRef<T>(initial);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Seed from the backend once. `cancelled` guards the StrictMode double-mount and the
  // torn-down-before-resolve case (the same guard the picker's three effects carried).
  useEffect(() => {
    let cancelled = false;
    void get()
      .then((v) => {
        if (!cancelled) setValue(coerce ? coerce(v) : v);
      })
      .catch((e) => {
        // A failed READ is logged, not toasted: it is not a user action, and with four
        // controls mounting at once a failing backend would produce four toasts.
        console.error(`[claudesk] settings read failed (${errorLabel}):`, e);
      });
    return () => {
      cancelled = true;
    };
    // `get`/`coerce`/`errorLabel` are stable per call site (module-scope fns + literals).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track the broadcast so any OTHER surface flipping this setting re-syncs this control.
  // Load-bearing for permission mode: the native View-menu radio is a real second surface.
  useTauriListen<T>(event, (e) => {
    setValue(coerce ? coerce(e.payload) : e.payload);
  });

  const set = useCallback(
    (next: T) => {
      // Read the pre-change value from the ref — NOT from inside a `setValue` updater.
      //
      // This is the whole reason the ref exists, and it is not a style preference: React
      // StrictMode (active in this app — see main.tsx) DOUBLE-INVOKES state updater
      // callbacks in dev to surface impure ones. An earlier version of this function
      // called `persist()` inside the updater, which meant every user toggle fired TWO
      // IPC writes (and two error toasts on rejection) under `pnpm tauri:dev`. Updaters
      // must be pure; side effects belong outside them.
      //
      // Caught at code review, not by the tests here — the unit tests model `set` with a
      // plain closure, which has no React semantics to double-invoke. Same defect class as
      // the Esc-ordering bug this feature already fixed (see escDismiss.ts): reaching for
      // a state updater to do something other than compute the next state.
      const prev = valueRef.current;
      // Optimistic: show `next` immediately, and keep the ref in step so a second change
      // landing in the same tick reverts to ITS predecessor rather than a stale value.
      valueRef.current = next;
      setValue(next);
      void persist(next).catch((err) => {
        valueRef.current = prev;
        setValue(prev); // revert to the value that was there before THIS change
        onError(mapIpcError(errorLabel, err));
      });
    },
    [persist, errorLabel, onError],
  );

  return { value, set };
}
