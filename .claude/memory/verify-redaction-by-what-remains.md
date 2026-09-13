---
name: verify-redaction-by-what-remains
description: "A redaction verified field-by-field verifies nothing — an allowlist redactor only covers the fields you remembered, and grepping THOSE fields comes back clean while another leaks. Ask the inverse, content-shaped question instead: what is still unredacted anywhere in the artifact?"
metadata:
  type: project
---

**When redacting captured data for commit, verify by asking "what is STILL unredacted?" over the
whole artifact — never by confirming the fields you redacted are clean.**

**Observed (M15 WP3 ship cleanup, 2026-09-13).** A real Claude Code transcript was captured as a
test fixture (`src/state/supervisor/__tests__/fixtures/real-chained-turn.jsonl`), redacted
field-by-field: `text`, `prompt`, `content`. The verification was
`grep -o '"text":"[^"]\{0,70\}'` — which returned **nothing**, and looked like proof.

It was not. **`toolUseResult.stdout` held 4,443 characters of the previous session's handoff** —
about half the file's bytes — in a field the redactor never named and the grep never asked about.

**Why the check was shaped wrong:** an allowlist redactor covers exactly the fields you thought of,
and checking *those* fields can only ever confirm what you already knew. The question has to be
content-shaped, not field-shaped:

```python
# ⚠️ The check that actually works — asks what REMAINS, not what was covered.
long = [m for m in re.findall(r'"([^"]{80,})"', open(path).read()) if "redacted" not in m]
assert not long, long[:3]
```

**The fix** was to make the redactor walk the whole object and redact **every** string over a
length threshold wherever it appears, preserving only the specific tokens the fixture exists to
carry (here, a real `TRANSITION:` id). Fixture went 9020 → 4112 bytes with all 97 supervisor tests
still green — **the tests assert on STRUCTURE, which is what a captured fixture is for**, so
aggressive prose redaction costs nothing.

**Generalizes to any captured artifact headed for a commit** — transcripts, log fixtures, HAR
files, recorded API responses. The failure is silent and one-way: once committed, the content is in
history.

Related in shape: [[raw-guard-substring-must-be-unique-to-its-site]] — both are cases where the
check *ran* and *passed* while asking a question that could not have failed.
