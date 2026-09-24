// F-b Phase 5 — the New-profile wizard (spec D.18–D.21). Reached from the ⌘, Settings Profiles
// group AND from the picker row's `Profile:` select.
//
// A modal is right here: this is a setup surface, not a primary one
// (`primary-surface-is-zero-ceremony` does not fire). Rendered into `document.body` through a
// portal so it stacks over Settings and is never clipped by a picker row.
//
// Every rule (step order, validation, the draft → spec mapping) lives in ./profileWizardModel.ts.
// This file renders it and calls the backend, which is the authority on every refusal.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { CC_PERMISSION_MODE_OPTIONS } from "../../cc/permissionMode";
import {
  adoptProfile,
  createProfile,
  profileDirStatus,
  profileWizardDefaults,
  type Profile,
  type WizardDefaults,
} from "../../state/profiles";
import {
  initialDraft,
  nextStep,
  prevStep,
  STEP_TITLES,
  stepError,
  statusLineText,
  THEME_LABELS,
  toSpec,
  WIZARD_STEPS,
  withName,
  type WizardDraft,
  type WizardStep,
} from "./profileWizardModel";
import { useEscCapture } from "./useEscCapture";

interface NewProfileWizardProps {
  /** Names already listed, for the collision check (D.19). */
  listedNames: readonly string[];
  onClose: () => void;
  /** A profile now exists: created here, or adopted via "add it instead". */
  onCreated: (profile: Profile) => void;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function NewProfileWizard({
  listedNames,
  onClose,
  onCreated,
}: NewProfileWizardProps) {
  const [defaults, setDefaults] = useState<WizardDefaults | null>(null);
  const [draft, setDraft] = useState<WizardDraft | null>(null);
  const [step, setStep] = useState<WizardStep>("name");
  const [error, setError] = useState<string | null>(null);
  /** Set when the chosen dir is non-empty: the refusal, with "add it instead" (D.19). */
  const [adoptOffer, setAdoptOffer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEscCapture(true, onClose);

  // The pre-fill is read when the wizard OPENS (D.18), never cached across openings.
  useEffect(() => {
    let cancelled = false;
    profileWizardDefaults()
      .then((d) => {
        if (cancelled) return;
        setDefaults(d);
        setDraft(initialDraft(d));
      })
      .catch((e) => {
        if (!cancelled) setError(`Couldn't read the defaults: ${message(e)}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const firstFieldRef = useRef<HTMLInputElement | HTMLSelectElement | null>(
    null,
  );
  const loaded = draft !== null;
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, [step, loaded]);

  const update = useCallback((patch: Partial<WizardDraft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setError(null);
    setAdoptOffer(null);
  }, []);

  const next = useCallback(async () => {
    if (!draft || busy) return;
    const err = stepError(step, draft, listedNames);
    if (err) {
      setError(err);
      return;
    }
    if (step === "dir") {
      setBusy(true);
      try {
        const status = await profileDirStatus(draft.configDir);
        if (status === "nonEmpty") {
          setError(
            `${draft.configDir} already has files in it, so a new profile can't be created there.`,
          );
          setAdoptOffer(draft.configDir);
          return;
        }
        if (status === "notADirectory") {
          setError(`${draft.configDir} exists and is not a directory.`);
          return;
        }
      } catch (e) {
        setError(`Couldn't check ${draft.configDir}: ${message(e)}`);
        return;
      } finally {
        setBusy(false);
      }
    }
    if (step === "confirm") {
      setBusy(true);
      try {
        onCreated(await createProfile(toSpec(draft)));
      } catch (e) {
        setError(`Couldn't create the profile: ${message(e)}`);
      } finally {
        setBusy(false);
      }
      return;
    }
    setError(null);
    setStep(nextStep(step));
  }, [draft, busy, step, listedNames, onCreated]);

  const adoptInstead = useCallback(async () => {
    if (!draft || adoptOffer === null) return;
    setBusy(true);
    try {
      onCreated(await adoptProfile(adoptOffer, draft.name));
    } catch (e) {
      setError(`Couldn't add ${adoptOffer}: ${message(e)}`);
    } finally {
      setBusy(false);
    }
  }, [draft, adoptOffer, onCreated]);

  const onFieldKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void next();
    }
  };

  const bindFirst = (el: HTMLInputElement | HTMLSelectElement | null) => {
    firstFieldRef.current = el;
  };

  const body = (() => {
    if (!draft || !defaults) return null;
    switch (step) {
      case "name":
        return (
          <label className="profile-wizard-field">
            <span>Profile name</span>
            <input
              ref={bindFirst}
              data-testid="profile-wizard-name"
              type="text"
              value={draft.name}
              spellCheck={false}
              autoComplete="off"
              placeholder="e.g. work"
              onChange={(e) =>
                update(
                  withName(draft, e.target.value.trim(), defaults.config_root),
                )
              }
              onKeyDown={onFieldKey}
            />
            <small>Lowercase letters, digits and “-”.</small>
          </label>
        );
      case "dir":
        return (
          <label className="profile-wizard-field">
            <span>Config directory (CLAUDE_CONFIG_DIR)</span>
            <input
              ref={bindFirst}
              data-testid="profile-wizard-dir"
              type="text"
              value={draft.configDir}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) =>
                update({ configDir: e.target.value, dirEdited: true })
              }
              onKeyDown={onFieldKey}
            />
            <small>
              Created if it does not exist. It must be empty if it does.
            </small>
          </label>
        );
      case "permission":
        return (
          <label className="profile-wizard-field">
            <span>Permission mode for sessions under this profile</span>
            <select
              ref={bindFirst}
              data-testid="profile-wizard-permission"
              value={draft.permissionMode}
              onChange={(e) =>
                update({
                  permissionMode: e.target
                    .value as WizardDraft["permissionMode"],
                })
              }
              onKeyDown={onFieldKey}
            >
              {CC_PERMISSION_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <small>
              Written to the profile’s settings.json. Inside Claudesk this
              replaces the app-wide permission mode for this profile.
            </small>
          </label>
        );
      case "retention":
        return (
          <label className="profile-wizard-field">
            <span>Keep conversation logs for (days)</span>
            <input
              ref={bindFirst}
              data-testid="profile-wizard-retention"
              type="text"
              inputMode="numeric"
              value={draft.cleanupPeriodDays}
              onChange={(e) => update({ cleanupPeriodDays: e.target.value })}
              onKeyDown={onFieldKey}
            />
          </label>
        );
      case "model":
        return (
          <label className="profile-wizard-field">
            <span>Default model (optional)</span>
            <input
              ref={bindFirst}
              data-testid="profile-wizard-model"
              type="text"
              value={draft.model}
              spellCheck={false}
              autoComplete="off"
              placeholder="Claude Code's default"
              onChange={(e) => update({ model: e.target.value })}
              onKeyDown={onFieldKey}
            />
          </label>
        );
      case "appearance": {
        const line = statusLineText(defaults.status_line);
        const themes = defaults.themes.includes(draft.theme)
          ? defaults.themes
          : [...defaults.themes, draft.theme];
        return (
          <>
            <label className="profile-wizard-field">
              <span>Theme</span>
              <select
                ref={bindFirst}
                data-testid="profile-wizard-theme"
                value={draft.theme}
                onChange={(e) => update({ theme: e.target.value })}
                onKeyDown={onFieldKey}
              >
                {themes.map((t) => (
                  <option key={t} value={t}>
                    {THEME_LABELS[t] ?? t}
                  </option>
                ))}
              </select>
            </label>
            {line === null ? (
              <p
                className="profile-wizard-note"
                data-testid="profile-wizard-no-status-line"
              >
                The default profile has no status line, so none is copied.
              </p>
            ) : (
              <label className="profile-wizard-check">
                <input
                  type="checkbox"
                  data-testid="profile-wizard-status-line"
                  checked={draft.copyStatusLine}
                  onChange={(e) => update({ copyStatusLine: e.target.checked })}
                />
                <span>
                  Copy the default profile’s status line:
                  <code data-testid="profile-wizard-status-line-text">
                    {line}
                  </code>
                </span>
              </label>
            )}
          </>
        );
      }
      case "input":
        return (
          <>
            <label className="profile-wizard-check">
              <input
                type="checkbox"
                data-testid="profile-wizard-mouse"
                checked={draft.mouseTracking}
                onChange={(e) => update({ mouseTracking: e.target.checked })}
              />
              <span>
                Mouse tracking (Claude Code captures clicks and scroll)
              </span>
            </label>
            <label className="profile-wizard-check">
              <input
                type="checkbox"
                data-testid="profile-wizard-copy-on-select"
                checked={draft.copyOnSelect}
                onChange={(e) => update({ copyOnSelect: e.target.checked })}
              />
              <span>Copy on select</span>
            </label>
          </>
        );
      case "confirm": {
        const spec = toSpec(draft);
        const rows: [string, string][] = [
          ["Name", spec.name],
          ["Directory", spec.config_dir],
          [
            "Permission mode",
            CC_PERMISSION_MODE_OPTIONS.find(
              (o) => o.value === spec.permission_mode,
            )?.label ?? spec.permission_mode,
          ],
          ["Log retention", `${spec.cleanup_period_days} days`],
          ["Model", spec.model ?? "Claude Code's default"],
          ["Theme", THEME_LABELS[spec.theme] ?? spec.theme],
          [
            "Status line",
            spec.copy_status_line
              ? (statusLineText(defaults.status_line) ?? "none")
              : "none",
          ],
          ["Mouse tracking", spec.mouse_tracking ? "on" : "off"],
          ["Copy on select", spec.copy_on_select ? "on" : "off"],
        ];
        return (
          <dl
            className="profile-wizard-summary"
            data-testid="profile-wizard-summary"
          >
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <p className="profile-wizard-note">
              The first session under this profile shows Claude Code’s own
              login.
            </p>
          </dl>
        );
      }
    }
  })();

  const index = WIZARD_STEPS.indexOf(step);

  const dialog = (
    <div
      className="profile-wizard-backdrop"
      data-testid="profile-wizard"
      // Keep every click and key inside the dialog: a picker row must never see them.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        className="profile-wizard"
        role="dialog"
        aria-modal="true"
        aria-label="New profile"
      >
        <p className="profile-wizard-title">
          New profile{" "}
          <span
            className="profile-wizard-step"
            data-testid="profile-wizard-step"
          >
            {index + 1}/{WIZARD_STEPS.length} · {STEP_TITLES[step]}
          </span>
        </p>
        <div className="profile-wizard-body" data-step={step}>
          {body ?? <p className="profile-wizard-note">Loading…</p>}
        </div>
        {error && (
          <p
            className="profile-wizard-error"
            data-testid="profile-wizard-error"
          >
            {error}
          </p>
        )}
        {adoptOffer !== null && (
          <button
            type="button"
            className="profiles-button"
            data-testid="profile-wizard-adopt-instead"
            disabled={busy}
            onClick={() => void adoptInstead()}
          >
            Add {adoptOffer} as an existing config dir instead
          </button>
        )}
        <div className="profile-wizard-buttons">
          <button
            type="button"
            className="profiles-button"
            data-testid="profile-wizard-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="profiles-button"
            data-testid="profile-wizard-back"
            disabled={index === 0 || busy}
            onClick={() => {
              setError(null);
              setAdoptOffer(null);
              setStep(prevStep(step));
            }}
          >
            Back
          </button>
          <button
            type="button"
            className="profiles-button profiles-button-primary"
            data-testid="profile-wizard-next"
            disabled={!draft || busy}
            onClick={() => void next()}
          >
            {step === "confirm" ? "Create profile" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
