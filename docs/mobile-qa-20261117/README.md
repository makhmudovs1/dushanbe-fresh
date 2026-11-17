# Actual QA evidence — 17–18 November 2026

Read ../MOBILE_RELEASE_2026.md for scope and final platform decisions.
No fixture descriptor, API credential, OTP, customer/tracking token or database
snapshot belongs here. Migration hashes cover synthetic test records only.

evidence.json records exact tested code and Android checkpoint source separately.
Android JSON files inspect the actual compiled APK, not just keep-rule source.
The APK/AAB themselves are local temporary artifacts, not committed/store-signed.

The WEB/home and iOS/home PNGs are genuine captures. The iOS checkpoint is an
earlier unsigned public run; it does not prove Keychain or private checkout.
home-comparison-390.json documents crop/scaling/tolerance and a FAILED1:1 comparison;
its local paths refer to the larger capture set, not files committed to this folder.
The source images are preserved without fabricated content or masking.

catalog-domain-benchmark.json measures synthetic DTO/name work in Node only,
not native scrolling/image memory/startup. synthetic-migration-rehearsal.json is
not a production snapshot/volume rehearsal. Production GET observations remain
in ../mobile-production-20261117.json, separate from local test assertions.

Current signed sourcec141ce3 native-ui-results.json records9/9 actual flows on
375/390/430 and42 screenshots plus a supplementary settled-map capture. Selected
original PNGs are committed. All43 PNGs (no device logs/credentials) are exported
in /private/tmp/df-mobile-sync-artifacts/dushanbe-fresh-c141ce3-native-screenshots.zip.
The375/430 strict pixel checks failed and are recorded separately; passing native
functional flows does not imply1:1 or private checkout acceptance.
