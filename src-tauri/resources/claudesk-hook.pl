#!/usr/bin/perl
# Claudesk CC hook — writes one JSON line per Claude Code lifecycle event to a
# Claudesk-owned AF_UNIX socket. Registered into ~/.claude/settings.json for the
# three Milestone-3 events: UserPromptSubmit / Stop / Notification.
#
# Contract (the line WP3's listener parses):
#   {"hook_event_name":..,"session_id":..,"cwd":..,"timestamp":<ms>,"prompt"?:..,"message"?:..,"notification_type"?:..}
# `prompt` is present only on UserPromptSubmit; `message` + `notification_type` only on
# Notification. `notification_type` (QoL-WP2) lets the broadcaster gate AwaitingInput on
# genuine input-needed types (permission_prompt / elicitation_dialog) vs informational
# ones (idle_prompt / auth_success) — so an idle nudge doesn't flip a busy dot blue.
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

# Re-emit exactly the fields WP3's HookEvent models. `timestamp` is the hook-side
# send time in epoch ms (telemetry; not load-bearing for the state machine).
my %out = (
    hook_event_name => $event,
    session_id      => ($payload->{session_id} // ''),
    cwd             => ($payload->{cwd} // ''),
    timestamp       => int(Time::HiRes::time() * 1000),
);
$out{prompt}  = $payload->{prompt}  if defined $payload->{prompt};
$out{message} = $payload->{message} if defined $payload->{message};
# Notification-only: the type that distinguishes a genuine input request
# (permission_prompt / elicitation_dialog) from an informational nudge
# (idle_prompt / auth_success). The broadcaster gates AwaitingInput on it (QoL-WP2).
$out{notification_type} = $payload->{notification_type}
    if defined $payload->{notification_type};

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
