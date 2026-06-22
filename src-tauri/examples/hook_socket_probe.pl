#!/usr/bin/perl
# WP1 probe hook — writes one JSON line per CC event to a Claudesk-owned AF_UNIX socket.
#
# Mirrors the claude-time hook.pl discipline: reads the event payload as JSON on
# stdin, exits 0 unconditionally (never blocks CC), uses only macOS-bundled stdlib
# (JSON::PP, IO::Socket::UNIX, Time::HiRes). Pass the socket path via the
# CLAUDESK_HOOK_SOCK env var (set in the scratch settings.json hook command).
#
# Probe deliverable, not production code. The real hook script lands in WP2.

use strict;
use warnings;

my $sock_path = $ENV{CLAUDESK_HOOK_SOCK} // '';
exit 0 if $sock_path eq '';

require JSON::PP;       JSON::PP->import('decode_json', 'encode_json');
require Time::HiRes;
require IO::Socket::UNIX;

# Drain stdin (the event payload).
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

# Re-emit a compact line carrying exactly the fields WP3's HookEvent will model,
# plus a hook-side send timestamp so the probe can measure wire latency.
my %out = (
    hook_event_name => $event,
    session_id      => ($payload->{session_id} // ''),
    cwd             => ($payload->{cwd} // ''),
    sent_ms         => int(Time::HiRes::time() * 1000),
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
