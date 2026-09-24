// F-b — the body of the ⌘, Settings "Profiles" group: the listed Claude Code profiles (named
// `CLAUDE_CONFIG_DIR`s), each with a Remove, plus "Add existing config dir…".
//
// ⚠️ **Lite-IDE core — NOT gated** on `workflow_features_enabled`: a profile is a Claude Code
// concept, so this module does not read the gate.
//
// ⚠️ Paired affordances (design prior `paired-actions-need-paired-affordances`): Add and Remove
// live together here. Create and Delete-to-Trash arrive with the wizard (F-b Phase 5).
//
// Remove = "remove from Claudesk, KEEP the directory" (spec D.23): the backend unregisters
// Claudesk's hook from the dir's `settings.json` first, and leaves every other file alone.

import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  adoptionSuggestions,
  adoptProfile,
  listProfiles,
  PROFILES_CHANGED_EVENT,
  removeProfile,
  type Profile,
} from "../../state/profiles";

interface ProfilesSettingsProps {
  /** The panel's shared error banner. */
  onError: (message: string) => void;
}

function describeError(what: string, e: unknown): string {
  return `Couldn't ${what}: ${e instanceof Error ? e.message : String(e)}`;
}

export function ProfilesSettings({ onError }: ProfilesSettingsProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Bumped to re-read after a change here, or on `profiles-changed` from anywhere.
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listProfiles(), adoptionSuggestions()])
      .then(([list, sugg]) => {
        if (cancelled) return;
        setProfiles(list);
        setSuggestions(sugg);
      })
      .catch((e) => {
        if (!cancelled) onError(describeError("read the profile list", e));
      });
    return () => {
      cancelled = true;
    };
  }, [version, onError]);

  useEffect(() => {
    const un = listen(PROFILES_CHANGED_EVENT, reload);
    return () => {
      void un.then((f) => f());
    };
  }, [reload]);

  const adopt = useCallback(
    async (configDir: string) => {
      setBusy(true);
      try {
        await adoptProfile(configDir);
      } catch (e) {
        onError(describeError(`add ${configDir}`, e));
      } finally {
        setBusy(false);
        reload();
      }
    },
    [onError, reload],
  );

  const chooseFolder = useCallback(async () => {
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked !== "string") return; // cancelled
    await adopt(picked);
  }, [adopt]);

  const remove = useCallback(
    async (name: string) => {
      setBusy(true);
      try {
        await removeProfile(name);
      } catch (e) {
        onError(describeError(`remove the profile "${name}"`, e));
      } finally {
        setBusy(false);
        reload();
      }
    },
    [onError, reload],
  );

  return (
    <div className="profiles-settings" data-testid="profiles-settings">
      <ul className="profiles-list" data-testid="profiles-list">
        <li className="profiles-item" data-testid="profiles-item-default">
          <span className="profiles-item-name">default</span>
          <span className="profiles-item-dir">~/.claude</span>
        </li>
        {profiles.map((p) => (
          <li
            key={p.name}
            className="profiles-item"
            data-testid={`profiles-item-${p.name}`}
          >
            <span className="profiles-item-name">{p.name}</span>
            <span className="profiles-item-dir" title={p.config_dir}>
              {p.config_dir}
            </span>
            <span className="profiles-item-provenance">{p.provenance}</span>
            <button
              type="button"
              className="profiles-button"
              data-testid={`profiles-remove-${p.name}`}
              disabled={busy}
              title="Remove from Claudesk. The directory and everything in it are kept; only Claudesk's hook entry is taken out of its settings.json."
              onClick={() => void remove(p.name)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="profiles-add" data-testid="profiles-add">
        <span className="settings-row-label">Add existing config dir…</span>
        {suggestions.map((dir) => (
          <button
            key={dir}
            type="button"
            className="profiles-button"
            data-testid="profiles-suggestion"
            disabled={busy}
            title={`Adopt ${dir}. Claudesk registers its status hook in its settings.json; nothing else is written.`}
            onClick={() => void adopt(dir)}
          >
            {dir}
          </button>
        ))}
        <button
          type="button"
          className="profiles-button"
          data-testid="profiles-choose-folder"
          disabled={busy}
          onClick={() => void chooseFolder()}
        >
          Choose folder…
        </button>
      </div>
    </div>
  );
}
