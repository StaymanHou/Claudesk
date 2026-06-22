#!/usr/bin/perl
# Claudesk CC hook — writes one JSON line per Claude Code lifecycle event to a
# Claudesk-owned AF_UNIX socket. Registered into ~/.claude/settings.json for the
# three Milestone-3 events: UserPromptSubmit / Stop / Notification.
#
# Contract (the line WP3's listener parses):
#   {"hook_event_name":..,"session_id":..,"cwd":..,"timestamp":<ms>,"prompt"?:..,"message"?:..}
# `prompt` is present only on UserPromptSubmit; `message` only on Notification.
#
# Discipline (proven in the WP1 probe, see docs/product/wp1-hook-socket-probe-outcome.md):
#   - reads the event payload as JSON on stdin,
#   - exits 0 UNCONDITIONALLY — a down Claudesk (no listener) must NEVER block CC,
#   - uses only macOS-bundled Perl stdlib (JSON::PP, IO::Socket::UNIX, Time::HiRes),
#   - ~15 ms/call (Perl cold-start dominated; the socket write adds ~3 ms).
#
# The socket path is passed via the CLAUDESK_HOOK_SOCK env var, set in the hook's
# registered `command` by Claudesk's installer (hook_install). Absent env → no-op.

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
}

exit 0;
