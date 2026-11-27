// M18 WP4 — THE seam hooks for a host's workflow substrate (§R.2). Never a one-shot read:
// Install / Update / Uninstall (WP6–7) and every later open check change the value under a
// mounted workspace, so the value is seeded once and then tracked from `remote-substrate`.
//
// One module store, not one listener per consumer: the first REMOTE consumer starts it (attach
// the listener, THEN seed, so no change falls in a gap), and every workspace and the picker read
// the same map through `useSyncExternalStore`.
//
// ⚠️ A LOCAL key returns `"local"` and never touches the store: no listener, no invoke. A local
// workspace's behaviour must not change, not even by a round-trip. A picker with no remote row
// does not start it either (`useHostSubstrates(false)`).
// ⚠️ A remote host reads `undefined` (closed) until the seed or an event names it.

import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  getHostSubstrates,
  HOST_SUBSTRATE_EVENT,
  type HostInput,
  type HostSubstrate,
  type HostSubstrateEvent,
} from "./hostSubstrate";
import { remoteAuthority } from "./workspaceSurfaces";

type ByHost = Readonly<Record<string, HostSubstrate>>;

const EMPTY: ByHost = Object.freeze({});

let byHost: ByHost = EMPTY;
let started = false;
const subscribers = new Set<() => void>();

function publish(next: ByHost): void {
  byHost = next;
  for (const notify of subscribers) notify();
}

/** Start the store once: listen first, then seed; a host heard by event keeps the newer value. */
function ensureStarted(): void {
  if (started) return;
  started = true;
  const heard = new Set<string>();
  void listen<HostSubstrateEvent>(HOST_SUBSTRATE_EVENT, (event) => {
    heard.add(event.payload.host);
    publish({ ...byHost, [event.payload.host]: event.payload.substrate });
  }).then(
    () =>
      getHostSubstrates()
        .then((seed) => {
          const next: Record<string, HostSubstrate> = { ...seed };
          for (const h of heard) {
            const v = byHost[h];
            if (v !== undefined) next[h] = v;
          }
          publish(next);
        })
        .catch((e) => {
          // A failed seed leaves hosts unknown (closed); events still arrive (the listen held).
          console.error("[claudesk] remote_host_substrates failed:", e);
        }),
    (e) => {
      // ⚠️ A failed LISTEN un-latches the store, so the next subscriber starts it again.
      // Latched, every remote host would read closed for the whole session and its workflow
      // rows would vanish with no note (`absentHostNote` shows nothing for `undefined`).
      started = false;
      console.error("[claudesk] remote-substrate listen failed:", e);
    },
  );
}

function subscribe(notify: () => void): () => void {
  ensureStarted();
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

const noSubscribe = (): (() => void) => () => {};
const snapshot = (): ByHost => byHost;
const emptySnapshot = (): ByHost => EMPTY;

/** One workspace's host input: `"local"`, the host's substrate, or `undefined` (closed). */
export function useHostSubstrate(projectPath: string): HostInput {
  const host = remoteAuthority(projectPath);
  const map = useSyncExternalStore(
    host === null ? noSubscribe : subscribe,
    host === null ? emptySnapshot : snapshot,
    // A static render (`renderToStaticMarkup` in the render tests) reads the same store.
    host === null ? emptySnapshot : snapshot,
  );
  if (host === null) return "local";
  return map[host];
}

/**
 * Every probed host's substrate, by host: the picker's one read for many rows (pair with
 * `hostSubstrateFor`). `active` = the list has a remote row; `false` touches nothing.
 */
export function useHostSubstrates(active: boolean): ByHost {
  return useSyncExternalStore(
    active ? subscribe : noSubscribe,
    active ? snapshot : emptySnapshot,
    active ? snapshot : emptySnapshot,
  );
}

/** Tests only: forget the store (module state outlives a test). */
export function resetHostSubstrateStoreForTests(): void {
  byHost = EMPTY;
  started = false;
  subscribers.clear();
}
