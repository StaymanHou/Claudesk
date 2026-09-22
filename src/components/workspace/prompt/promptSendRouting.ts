// F-a WP4 Phase 2 verify-codify — the send chords' ROUTING decision, extracted as a pure
// function so a test can drive the real thing.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS WAS EXTRACTED FROM `RightPanelHost`'s KEYDOWN ROUTER.
//
// The decision has FOUR inputs (is the Prompt panel front · is a send handler registered · is
// this the auto-submit chord · is it the stage-only chord) and it guards a property with no
// undo: `injectCommand` has no retry and no pre-send cancel window, so a send fired while the
// operator is looking at the editor is an unrecoverable write into a live conversation.
//
// Inline in a ~900-line component that decision was unreachable by any test. `RightPanelHost`
// registers a capture-phase `document` listener over a tree containing CM6, xterm and PTY
// wiring, so driving the real router in vitest would need a full mount plus a pile of mocks —
// brittle enough that it would not survive. Per
// `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`, the answer for a
// BEHAVIOURAL property is to extract the code so a test drives it, rather than to write a
// cleverer source-text predicate that can only encode shapes someone thought of.
//
// ⚠️ THE HOST REMAINS THE ONLY CALLER, and it must stay that way. This module decides; it does
// not act. `promptSendRouting.test.ts` asserts the host actually calls it — the
// `[[extracted-machine-needs-a-live-caller-guard]]` lesson, where `planPanelChange` shipped
// exported, documented and fully tested with ZERO callers, so its module promised a guarantee
// the panel never provided.

import { isAutoSubmitChord, isStageOnlyChord } from "./promptSendChord";
import type { ChordEvent } from "../chordEvent";
import type { SendMode } from "./sendStagedDraft";

/** Everything the routing decision reads. All values, so the decision is pure. */
export interface SendRouteInputs {
  /** The right panel currently in front. Only `"prompt"` may route a send. */
  readonly frontPanel: string;
  /** Whether the Prompt panel has registered a send handler (it does so while mounted). */
  readonly hasSendHandler: boolean;
  /** The keydown being routed. */
  readonly event: ChordEvent;
}

/**
 * Which send mode this keydown should fire, or `null` for "not a send — keep routing".
 *
 * ⚠️ **`null` MEANS "FALL THROUGH", NOT "SWALLOW".** The caller must only `preventDefault` when
 * this returns a mode. Matching-then-no-opping would consume the keystroke and make the key dead
 * everywhere else in the app, which the M10.9 seam contract forbids by name — the same reason
 * `panelForChord` returns `null` for a gated chord rather than matching and ignoring it.
 *
 * ⚠️ **THE PANEL-FRONT TEST IS THE SAFETY PROPERTY**, not a tidiness rule. See the module header.
 */
export function sendModeForChord(inputs: SendRouteInputs): SendMode | null {
  // ⚠️ Both guards before either chord test. A registered handler on a BACKGROUNDED panel must
  // not fire: every panel stays mounted (CLAUDE.md), so `hasSendHandler` is true for a Prompt
  // panel the operator is not looking at. Front-ness is the discriminator, not mountedness.
  if (inputs.frontPanel !== "prompt") return null;
  if (!inputs.hasSendHandler) return null;

  if (isAutoSubmitChord(inputs.event)) return "auto-submit";
  if (isStageOnlyChord(inputs.event)) return "stage-only";
  return null;
}
