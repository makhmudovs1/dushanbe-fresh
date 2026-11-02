# DNS Incident, 2 November 2026

Observed at 11:27 Moscow time after a report that the site would not open.

## Findings

- TARENA 77.95.0.94 is reachable over pinned-key SSH.
- Current Web/API/PostgreSQL containers are healthy. Caddy has zero restarts and
  no OOM termination. Web/API local HTTP checks return 200.
- HTTPS to Caddy with the correct hostname pinned to loopback or the VPS address
  returns 200 from the VPS. The public HTTP port responds with HTTPS redirect 308.
- Available RAM is approximately 1 GiB; disk has approximately 57 GiB free.
- Google DNS-over-HTTPS returns SERVFAIL for A, AAAA and NS, with "Name servers
  did not respond" and extended DNS error 22.
- Independent Cloudflare DNS-over-HTTPS returns SERVFAIL / "No Reachable Authority".
- Both `ns1.navjucloud.tj` and `ns2.navjucloud.tj` resolve to 217.114.10.39.
  A direct authoritative UDP/53 query from TARENA timed out.

The Mac's local DNS additionally returned 240.0.0.20 (an intermediary/fake-IP
answer); this does not explain away the independently confirmed authoritative
failure. A direct Mac TLS probe also timed out. Do not attribute all symptoms
solely to the client network.

## Actions

No DNS records, application configuration, secrets or production services were
changed during incident diagnosis. Do not restart or roll back healthy services
to try to fix unreachable authoritative DNS. Do not use the compromised VPS.

Ask Navju Cloud to restore authoritative DNS UDP/TCP 53 on 217.114.10.39 and verify
the dushanbefresh.tj zone. Both NS sharing one IP is a common failure point.
Expected apex/www A target remains 77.95.0.94. Preserve all other zone records.
Any move to another DNS provider requires an explicit decision, full zone export
and review of MX/TXT/CAA/DNSSEC before changing delegation.

After recovery, check A/AAAA through independent resolvers, external HTTPS,
catalog, cart and map. Do not announce public recovery based only on localhost.
