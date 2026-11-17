# Mobile API compatibility — 17.11.2026

Base https://dushanbefresh.tj/api/v1. Evidence: mobile-production-20261117.json;
credential-free HTTPS GET, no Origin/cookie/token, no SMS/verify/order POST.
401 establishes a protected route, not successful authenticated production use.
Current running container SHA/migration list is unverified: existing SSH key was
rejected. Do not equate main@521b61e with the deployed revision.

| Contract | TARENA observation | Local integration result / requirement |
| --- | --- | --- |
| /health, /products, /categories | 200; 46/5 observed, not constants | Current DTOs/real photos; separate varieties; new admin product and price visible to both transports in local HTTP test |
| /delivery-slots, /delivery-zone | 200 | Local closed slot/polygon/min-step tests; slots GET can materialize scheduled rows in the existing API |
| /customer-auth/status | enabled=true, requiredForCheckout=true | Same policy respected in native; no obsolete guest-order promise |
| /mobile/auth/status | available/enabled=true, requiredForCheckout=true | Actual Payom adapter/template/201 parsing tested against loopback gateway, not real SMS |
| /mobile/auth/me | anonymous 401, private no-store | Session lifecycle/rotation/replay/owner isolation tests; actual OTP/auth HTTP fixture |
| /mobile/customer/cart/import | anonymous cart 401 | WEB cookie write → native read/write → WEB read, durable/MAX/revisions/conflicts/lost replies tested |
| /mobile/customer/favorites | anonymous 401 | Native write visible through browser cookie route in synthetic shared account |
| /mobile/customer/addresses/profile | anonymous addresses 401 | Shared names and exact coordinates, ownership/defaults tests; passive refresh never replaces native checkout snapshot |
| /mobile/customer/orders, detail/repeat | anonymous list 401 | Owned order appears in both histories; foreign detail denied; repeat returns changed current price |
| /mobile/geocoding/status/grant/search/reverse | status 404 | New additive backend+migration/config required; current WEB provider behavior reused; quotas/privacy HTTP tests |
| /checkout/validate | Existing public read-only contract; WEB capture quotes permitted | Real synthetic HTTP price/slot/zone/review tests; native cart and checkout use totals from this endpoint |
| /mobile/checkout/orders | No production mutation attempted | Verified account required under current policy; idempotency, lost response and operations tested locally; release submission disabled |
| /public/orders/:privateToken | No real customer's token probed | Actual synthetic delivery status/cost visible; no phone-based lookup |
| /customer/account-deletion/status, /mobile/customer/account-deletion/status | 404 | New additive request-only endpoints and migration; off by default; completion is a release blocker |
| /account/delete WEB | Not deployed by this task | New browser request page; cannot yet be advertised as a working production deletion URL |
| /mobile-test/runtime and loopback gateway | Never production | Test-only executable, strictly owned synthetic DB/role/host/port; not part of src build |

Native transport never supplies a browser Origin or customer cookie. Customer and
staff tokens are separate. Geoapify remains server-only; Android Maps SDK key
needs app/certificate/API restrictions. Production order testing is prohibited.
The same account is keyed by existing server identity, not matching phone lookup
of orders; private tracking remains a random capability, never logged in reports.
