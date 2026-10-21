---
name: feedback-operator-labelling-pass-shape
description: Never hand the operator a large plain-text sheet to label; use a local keyboard card reviewer, two blind readers, a sample-then-contested review, and apply their prior rulings first.
metadata:
  type: feedback
---

When the operator must label data (ground truth for a probe), the form is part of the work:

- **Never a large plain-text sheet.** A 336 KB, ~6,000-line markdown file (225 rows, blank = accept) was rejected outright: "you want me to review 6000+ lines of stuff in basically plain text?"
- **A local keyboard card reviewer** instead: a self-contained `file://` HTML page in gitignored `tmp/`, opened with `open`, one card at a time showing the turn's end (F = full), the operator's reply and the proposal. Enter accepts, A/B/S override, ← goes back, progress lives in `localStorage`, and Download exports JSON. Include a one-line legend of what each label means (they asked). Keep it local, not a claude.ai artifact, when any row is work-project text.
- **Two independent blind readers** propose labels. The operator reviews a ~40-row **sample of the uncontested rows** (gate ≥ 0.90), then **only the contested rows**, plus whichever class the sample showed unreliable. In WP2 that was every uncontested BREAK: the operator saw 105 of 225.
- **Apply the operator's own prior rulings to a deck BEFORE showing it** ("Can you update them first before asking me to review"). If a ruling decides a row, it leaves the deck and records source `operator-ruling`.

**Why:** the operator's attention is the scarce resource ([[claudesk-philosophy]]); a labelling pass costs them minutes per card. The reshaped pass kept the labels operator-held (non-circular) while cutting what they saw by more than half.
**How to apply:** for WP3 3.5's held-out re-score or any future labelling, reuse `tooling/adjudicator-probe/{reviewer,triage}.ts`. Present the label definitions up front, and record each final label's source, so the verdict can say how many labels the operator actually saw.
