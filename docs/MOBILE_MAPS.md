> Historical October evidence. Current production policy, tests and release gates:
> [MOBILE_RELEASE_2026.md](MOBILE_RELEASE_2026.md). In particular, production SMS
> and required checkout login are now enabled; old availability statements below
> do not describe 17 November. No historical native result accepts the new build.

# Native maps and Geoapify readiness

react-native-maps **1.29.11** matches Expo58. iOS uses Apple Maps; Android uses
Google Maps SDK. Prebuild/config checks pass; no real map has been launched here.
Without Android SDK key, the app hides the map and retains manual details/GPS.
With an active delivery polygon a real point is still required; server rechecks it.

## Owner Android Maps configuration

Use an owned Google Cloud project; confirm billing/quota separately, enable only
**Maps SDK for Android** for this native key. Do not enable billing automatically.
The app does not need Places/Geocoding APIs: address lookup uses the existing
server's Geoapify. Apply **Android application restriction**, exact package name
and actual signing certificate **SHA-1** for each allowed build. Also apply API
restriction to Maps SDK for Android. Never use an unrestricted/shared public key.

| Build | Candidate package | Certificate to verify |
| --- | --- | --- |
| Local dev | tj.dushanbefresh.app.dev | Actual local debug keystore SHA-1 |
| EAS development | tj.dushanbefresh.app.dev | Certificate of that EAS artifact, do not assume local debug |
| EAS preview APK | tj.dushanbefresh.app.preview | Actual EAS signing certificate SHA-1 |
| Play production | tj.dushanbefresh.app | Play app-signing certificate SHA-1, not merely upload key |

Integration/staging IDs also need their own permitted package/SHA pair if used.
Use EAS Credentials/dashboard or `keytool -list -v -keystore /owned/path` (interactive
password; do not log it), and inspect the produced APK with apksigner when SDK is
available. Record real fingerprints privately; none were guessed in this task.

Set GOOGLE_MAPS_ANDROID_API_KEY in the chosen EAS environment or ignored local
build ENV. Config passes it only to the supported androidGoogleMapsApiKey plugin;
extra exposes a boolean, not its value. A native SDK key is embedded in the APK
by design: certificate/API restrictions protect it. It is different from the
server-secret Geoapify key. Rebuild after changing native key/configuration.
No key was added to Git and no actual cloud map project/billing was changed.

## Geoapify contract evidence

Official `format=json` responses contain `results`, with street, optional
housenumber, lat/lon, country_code, city and result_type. Native server requests
explicit JSON, ru/tg ISO language, Tajikistan + city rectangle search filters and
fixed HTTPS endpoint. Building/street suggestions are mapped without inventing a
house number; amenity/city/foreign results are filtered. Reverse retains the exact
chosen coordinates even if the provider returns a nearby building centroid.
Language is requested, but real Tajik name coverage cannot be inferred from mocks.

20 provider unit/contract cases now cover languages, official JSON fields, optional
house/building, malformed/oversized data, deadline, no internet, upstream
401/403/429/500/503 and no credential logging. HTTP integration additionally covers
short-lived IP-bound grants, reuse/expiry/quotas, input validation and Origin
isolation. These are **synthetic fixtures**, not captured successful live requests.
No real backend key was copied/read from WEB or invoked. Live acceptance remains
blocked on owner-supplied server configuration; avoid mass or costly probes.

Provider safeguards: 4sec deadline, 64KB response cap, no redirects, concurrency4,
persistent weighted IP/user/global/day limits and bounded grant issuance. Before
activation review reverse-proxy IP aggregation and edge limits; grants are not
proof of a genuine app.

## UX source checks / device checks still required

Center pin, user-only GPS prompt, search overlay, debounce, selected suggestion,
manual house refinement, exact coordinates, polygon and outside-zone blocking
are implemented. Map height adapts to available screen height. All map camera
animations respect Reduce Motion. Denied foreground permission offers manual
selection and, when OS will not ask again, an explicit Settings action.

On both platforms verify actual map tiles, gesture/scroll arbitration, iOS/Android
permission paths (denied/restricted/granted/approximate), keyboard overlay, rapid
query/GPS/drag races, RU/TJ labels, apartment edits and boundary confirmation.
None of those physical/native UX checks were run in this session.

References: [Expo map setup](https://docs.expo.dev/versions/v58.0.0/sdk/map-view/),
[Google key restrictions](https://developers.google.com/maps/documentation/android-sdk/get-api-key),
[autocomplete JSON](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/),
[reverse JSON](https://apidocs.geoapify.com/docs/geocoding/reverse-geocoding/).

## First actual Android artifact

Preview APK d346e2ef-d286-413e-add1-7ea3972f200d is built and signature-verified.
Package: tj.dushanbefresh.app.preview. Certificate SHA-1 (public fingerprint):
89:32:BD:6D:36:B4:B2:E4:E4:6D:ED:90:98:A3:9D:03:7E:AB:33:42.
Use this pair only for the preview Maps restriction; it is not the production
signing identity or the APK file hash. No Google key is configured, so map tiles
remain unavailable in this artifact. Apple Maps/Android runtime were not launched.
