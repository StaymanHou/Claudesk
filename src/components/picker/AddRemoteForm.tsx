// M17 WP2 — "Add remote project…": host + path, then the backend's preflight
// (`add_remote_project`, arch §H). The row is written ONLY if every check passes; the backend
// enforces that, so this form never writes anything itself. A failure shows the backend's
// plain-words message (it already names what failed and the fix), and keeps the inputs so the
// operator can correct one field and retry.
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NO_TEXT_ASSIST } from "../noTextAssist";
import type { RecentProject } from "./ProjectPicker";

export interface AddRemoteFormProps {
  /** A row the backend wrote (new or touched). */
  onAdded: (project: RecentProject) => void;
  onCancel: () => void;
}

/** The rejection text as the backend worded it (it is already plain words). */
function rejectionText(e: unknown): string {
  const s =
    typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
  return s.trim() || "The remote checks did not pass.";
}

export function AddRemoteForm({ onAdded, onCancel }: AddRemoteFormProps) {
  const [host, setHost] = useState("");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const added = await invoke<RecentProject>("add_remote_project", {
        host,
        path,
      });
      onAdded(added);
    } catch (e) {
      setError(rejectionText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="picker-remote-form"
      data-testid="picker-remote-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="picker-remote-fields">
        <input
          className="picker-remote-input"
          data-testid="picker-remote-host"
          {...NO_TEXT_ASSIST}
          type="text"
          placeholder="user@host or an ~/.ssh/config alias"
          aria-label="Remote host"
          value={host}
          disabled={busy}
          autoFocus
          onChange={(e) => setHost(e.target.value)}
        />
        <input
          className="picker-remote-input"
          data-testid="picker-remote-path"
          {...NO_TEXT_ASSIST}
          type="text"
          placeholder="~/project or /Users/you/project"
          aria-label="Project folder on the remote host"
          value={path}
          disabled={busy}
          onChange={(e) => setPath(e.target.value)}
        />
      </div>
      <div className="picker-remote-actions">
        <button
          type="submit"
          data-testid="picker-remote-add"
          disabled={busy || host.trim() === "" || path.trim() === ""}
        >
          {busy ? "Checking…" : "Add"}
        </button>
        <button
          type="button"
          data-testid="picker-remote-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        {busy && (
          <span
            className="picker-remote-status"
            data-testid="picker-remote-status"
            role="status"
          >
            Checking {host.trim()}: ssh key, tmux/claude/perl, the folder, and
            Claude Code login…
          </span>
        )}
      </div>
      {error !== null && (
        <div
          className="picker-remote-error"
          data-testid="picker-remote-error"
          role="alert"
        >
          {error}
        </div>
      )}
    </form>
  );
}
