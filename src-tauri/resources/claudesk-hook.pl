#!/usr/bin/perl
# Claudesk CC hook — writes one JSON line per Claude Code lifecycle event to a
# Claudesk-owned AF_UNIX socket. Registered into ~/.claude/settings.json for the 10
# CLAUDESK_EVENTS (M9 WP2): the 4 STATUS events (UserPromptSubmit / Stop /
# Notification / PostToolUse) + 6 TIME-ANALYTICS events (PreToolUse /
# PostToolUseFailure / SubagentStart / SubagentStop / SessionStart / SessionEnd).
#
# Contract (the line the Rust listener parses): always hook_event_name / session_id /
# cwd / timestamp(<ms>), plus event-specific optional fields —
#   prompt, prompt_length_chars   (UserPromptSubmit)
#   message, notification_type    (Notification)
#   tool_name, tool_use_id        (Pre/PostToolUse, PostToolUseFailure)
#   agent_type                    (SubagentStart/Stop; from CC's subagent_type)
#   source                        (SessionStart)
#   reason                        (SessionEnd; e.g. prompt_input_exit / other — WP6.5)
# `notification_type` (QoL-WP2) lets the broadcaster gate AwaitingInput on genuine
# input-needed types (permission_prompt / elicitation_dialog) vs informational ones
# (idle_prompt / auth_success) — so an idle nudge doesn't flip a busy dot blue. The
# time-analytics fields feed the Rust `time_store` writer only (status machine ignores
# them). PRIVACY: prompt_length_chars is a LENGTH; the prompt TEXT never lands in a
# time-analytics field.
#
# M12 WP4b — THIS SCRIPT IS NO LONGER WRITE-ONLY. It now has TWO independent concerns:
#   (1) telemetry OUT to the socket (all 10 events) — unchanged, and
#   (2) the drive-mode SIGNAL on stdout (UserPromptSubmit only), which CC reads back as
#       `hookSpecificOutput.additionalContext`.
# So the hook channel is BIDIRECTIONAL as of M12 (arch.md's "one-directional CC→Claudesk"
# describes the pre-M12 shape). The two concerns are INDEPENDENT: the signal must still
# emit with no socket, and telemetry is unaffected by the signal. Gate OFF reaches this
# script as an ABSENT CLAUDESK_DRIVE_MODE — there is no settings read here.
#
# Discipline (proven in the WP1 probe, see docs/product/wp1-hook-socket-probe-outcome.md):
#   - reads the event payload as JSON on stdin,
#   - exits 0 UNCONDITIONALLY — a down Claudesk (no listener) must NEVER block CC,
#   - uses only macOS-bundled Perl stdlib (JSON::PP, IO::Socket::UNIX, Time::HiRes,
#     File::Basename),
#   - ~15 ms/call (Perl cold-start dominated; the socket write adds ~3 ms).
#
# The socket path is passed via the CLAUDESK_HOOK_SOCK env var, set in the hook's
# registered `command` by Claudesk's installer (hook_install). Absent env → no-op.
#
# M6 WP1 (status-channel logging probe): when the socket can't be opened, the hook
# appends a best-effort `- HOOK write-failed …` trace to status-channel.log in the SAME
# per-identity app-data dir the Rust backend logs to (the socket's parent dir). This
# distinguishes a never-arrived event (a HOOK write-failed line, no matching STATUS
# line) from an arrived-but-unresolved one (a STATUS line with resolved=none) when
# diagnosing the stuck-Running dot. Still best-effort — wrapped in eval, exit 0 stands.

use strict;
use warnings;

my $sock_path = $ENV{CLAUDESK_HOOK_SOCK} // '';

require JSON::PP;       JSON::PP->import('decode_json', 'encode_json');
require Time::HiRes;
require IO::Socket::UNIX;

# Drain stdin (the event payload). Some invocations (manual test) have no payload.
#
# ⚠️ M12 WP4b — THIS DRAIN IS SHARED BY TWO CONCERNS AND MUST STAY ABOVE THE
# $sock_path EARLY EXIT. Before WP4b the script did `exit 0 if $sock_path eq ''`
# HERE, above the drain, because telemetry was the only concern and a missing socket
# made everything below pointless. The drive-mode signal (below) is independent of the
# socket: it must still emit when CLAUDESK_HOOK_SOCK is absent. Restoring an early exit
# above this point silently kills the signal for exactly that case — mutation-proven,
# and it is the failure `emits_when_the_socket_var_is_absent` catches.
my $raw = '';
if (!-t STDIN) {
    local $/;
    $raw = <STDIN> // '';
}
exit 0 if $raw eq '';

# ⚠️ THIS `eval` IS THE SOLE NEVER-BLOCK-CC GUARD. Do not "simplify" it away.
# Without it, malformed stdin exits 255 with a Perl error, which WEDGES the user's CC
# turn. There is NO second guard behind it — the script's only other evals are the
# socket open and the write-failure log, neither of which wraps this decode.
# Pinned by `never_blocks_cc_on_degraded_inputs` (src-tauri/tests/hook_pl_output.rs).
my $payload = eval { decode_json($raw) };
exit 0 unless ref($payload) eq 'HASH';

my $event = $payload->{hook_event_name} // '';
exit 0 if $event eq '';

# --- M12 WP4b: the drive-mode signal (stdout), independent of the socket ---------
#
# Claudesk sets CLAUDESK_DRIVE_MODE on the CC spawn ONLY when the workflow-features
# gate is ON and the project has a mode. THE GATE REACHES THIS SCRIPT BY ABSENCE:
# there is no settings read here — an unset var is the same inert path that keeps a
# plain-terminal `claude` byte-identical. Deliberately NOT a gate read per turn on
# CC's critical path (it would also be a second source of truth able to disagree with
# the spawn side).
#
# Scope: `UserPromptSubmit` only — a measured 1-of-10 blast radius across the events
# this script is registered for. The other nine stay byte-silent on stdout.
#
# ⚠️ An unrecognized / empty / absent mode emits NOTHING — never a line naming a
# default. There is no coherent upstream default to copy: `session-restore` contradicts
# ITSELF (SKILL.md:42 says orchestrated, :59 labels autopilot "(default)"), so any
# default here would be Claudesk inventing workflow policy. Emitting nothing leaves the
# skill's own resolution chain intact — that is what "zero companion-repo change" means.
if ($event eq 'UserPromptSubmit') {
    my $mode = $ENV{CLAUDESK_DRIVE_MODE} // '';
    # Exact-match allowlist, NOT "present and non-empty" — the latter admits any
    # garbage (including shell metacharacters) straight into the model's context.
    # These four literals are the `transitions.md:165` vocabulary; they must stay in
    # sync with Rust's DriveMode serde renames (config_store::DriveMode).
    my %KNOWN = map { $_ => 1 } qw(stepping orchestrated autopilot fsd);
    if ($KNOWN{$mode}) {
        # ⚠️ `additionalContext` MUST nest under `hookSpecificOutput` alongside
        # `hookEventName` — a top-level `additionalContext` is REJECTED at runtime
        # (proven live 2026-08-06, WP4a).
        #
        # The sentence ATTRIBUTES THE SOURCE ("Claudesk reports...") rather than
        # asserting bare fact: it reads as standing environmental context rather than a
        # fresh instruction at turn 60, and gives the model something to reconcile
        # `.session.md`'s own `drive_mode:` against. It states a FACT, never a
        # prohibition — a prohibition is correct at turn 1 and wrong at turn 60, when
        # the operator may legitimately want to change mode.
        print encode_json({
            hookSpecificOutput => {
                hookEventName     => 'UserPromptSubmit',
                additionalContext =>
                    "Claudesk reports the drive mode for this workspace as $mode.",
            },
        }) . "\n";
    }
}

# Telemetry below is socket-bound; the signal above is not. A missing socket must not
# suppress the signal, which is why this exit lives HERE and not above the drain.
exit 0 if $sock_path eq '';

# Re-emit exactly the fields the Rust HookEvent models. `timestamp` is the hook-side
# send time in epoch ms (telemetry; not load-bearing for the state machine).
my %out = (
    hook_event_name => $event,
    session_id      => ($payload->{session_id} // ''),
    cwd             => ($payload->{cwd} // ''),
    timestamp       => int(Time::HiRes::time() * 1000),
);

# --- Status fields (M3 + QoL-WP2) — forwarded for the idle/running/awaiting dots. ---
$out{prompt}  = $payload->{prompt}  if defined $payload->{prompt};
$out{message} = $payload->{message} if defined $payload->{message};
# Notification-only: the type that distinguishes a genuine input request
# (permission_prompt / elicitation_dialog) from an informational nudge
# (idle_prompt / auth_success). The broadcaster gates AwaitingInput on it (QoL-WP2).
$out{notification_type} = $payload->{notification_type}
    if defined $payload->{notification_type};

# --- Time-analytics fields (M9 WP2) — consumed by the Rust `time_store` writer, NOT
# the status machine. Each is event-specific; forwarded only when present, so status
# events stay byte-identical to before. See docs/product/wp1-time-analytics-probe-
# outcome.md §(d) + _ref/.../claude-time/hook.pl's handler table (this ports the
# field EXTRACTION; the SQLite write lives in Rust, not a sqlite3 subprocess here).
#
# PRIVACY INVARIANT: the ONLY place we touch $payload->{prompt} for time-analytics is
# to read its LENGTH. The prompt text is never copied into a time-analytics field.
if ($event eq 'UserPromptSubmit') {
    # length() counts characters; +0 forces a JSON number (not a quoted string).
    $out{prompt_length_chars} = length($payload->{prompt} // '') + 0;
}
# tool_name + tool_use_id pair Pre↔Post(+Failure) for tool durations.
if ($event eq 'PreToolUse' || $event eq 'PostToolUse' || $event eq 'PostToolUseFailure') {
    $out{tool_name}   = $payload->{tool_name}   if defined $payload->{tool_name};
    $out{tool_use_id} = $payload->{tool_use_id} if defined $payload->{tool_use_id};
}
# CC sends the subagent kind as `subagent_type`; forward it under `agent_type` (the
# name the reclassifier + HookEvent use).
if ($event eq 'SubagentStart' || $event eq 'SubagentStop') {
    $out{agent_type} = $payload->{subagent_type} if defined $payload->{subagent_type};
}
# SessionStart carries a `source` tag (startup / resume / …).
if ($event eq 'SessionStart') {
    $out{source} = $payload->{source} if defined $payload->{source};
}
# SessionEnd carries a `reason` tag (prompt_input_exit / other / …). M9 WP6.5: the
# time-analytics session-end model honors SessionEnd as an authoritative end; `reason`
# is persisted into the row meta for debugging (the derivation does not branch on it in
# v1). A short enum-ish tag, never content — same privacy class as `source`.
if ($event eq 'SessionEnd') {
    $out{reason} = $payload->{reason} if defined $payload->{reason};
}

my $line = encode_json(\%out) . "\n";

# Connect-and-write. If the socket isn't listening (Claudesk not running), fail
# silently — a missing listener must NEVER block CC. Short timeout for the same reason.
my $sock = eval {
    IO::Socket::UNIX->new(
        Type    => IO::Socket::UNIX::SOCK_STREAM(),
        Peer    => $sock_path,
        Timeout => 1,
    );
};
if ($sock) {
    print $sock $line;
    close($sock);
} else {
    # M6 WP1 (Phase 2): the socket could not be opened (Claudesk down, or a stale/
    # broken socket). When CC fired this event but Claudesk was running, the absence of
    # a corresponding STATUS line in status-channel.log would otherwise be ambiguous
    # (never-arrived vs arrived-but-unresolved). Append a best-effort write-failure
    # trace to the SAME per-identity log dir the backend writes — the socket's parent
    # dir IS app_data_dir, so no new env var is needed. Strictly best-effort and must
    # NEVER change the unconditional exit 0: wrap in eval, swallow any IO error.
    eval {
        require File::Basename;
        my $dir = File::Basename::dirname($sock_path);
        my $log = "$dir/status-channel.log";
        if (open(my $lf, '>>', $log)) {
            print $lf "- HOOK write-failed event=$event cwd="
                . ($out{cwd} // '') . " sock=$sock_path\n";
            close($lf);
        }
    };
    # any failure above is intentionally ignored — telemetry must not block CC.
}

exit 0;
