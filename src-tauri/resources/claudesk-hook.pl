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
# `notification_type` (QoL-WP2) lets the broadcaster gate AwaitingInput on genuine
# input-needed types (permission_prompt / elicitation_dialog) vs informational ones
# (idle_prompt / auth_success) — so an idle nudge doesn't flip a busy dot blue. The
# time-analytics fields feed the Rust `time_store` writer only (status machine ignores
# them). PRIVACY: prompt_length_chars is a LENGTH; the prompt TEXT never lands in a
# time-analytics field.
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
exit 0 if $sock_path eq '';

require JSON::PP;       JSON::PP->import('decode_json', 'encode_json');
require Time::HiRes;
require IO::Socket::UNIX;

# Drain stdin (the event payload). Some invocations (manual test) have no payload.
my $raw = '';
if (!-t STDIN) {
    local $/;
    $raw = <STDIN> // '';
}
exit 0 if $raw eq '';

my $payload = eval { decode_json($raw) };
exit 0 unless ref($payload) eq 'HASH';

my $event = $payload->{hook_event_name} // '';
exit 0 if $event eq '';

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
