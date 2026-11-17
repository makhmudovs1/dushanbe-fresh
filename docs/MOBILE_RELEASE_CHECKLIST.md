# Mobile release checklist — 17–18.11.2026

Android **NO-GO** / iOS **NO-GO** для публикации. Это технический checklist,
не подтверждение store compliance. Актуальные доказательства и 19 ответов:
[MOBILE_RELEASE_2026.md](MOBILE_RELEASE_2026.md). October документы — история.

## Проверено локально

- [x] Изолированная integration branch от текущего main521b61e; старая мобильная
  история сохранена, исходный WEB worktree не изменён.
- [x] Expo58.0.26/RN0.88.1 New Architecture, совместимые peers, Doctor20/20.
- [x] Root lint/typecheck/build; WEB/API production build и два Hermes export.
- [x] 1281 tests passed, zero skips: shared23/API619/WEB444/MOBILE195, включая
  настоящие isolated HTTP/PostgreSQL и admin→picker→courier lifecycle.
- [x] pnpm audit: zero advisories в workspace dependency graph.
- [x] Local Android standalone ARM64 APK + AAB compiled from65a1e55;
  actual DEX constructors retained under R8 full/release; ELF/ZIP16KB checks passed.
- [x] Local iOS Simulator Release compiled; actual public home/catalog startup.
- [x] Production checkout закрыт в build ENV и runtime; только защищённый owned
  integration runtime допускает synthetic orders.
- [x] Synthetic backup/restore + two additive migrations preserve existing row hashes.
- [x] Current production GET contracts и real WEB references375/390/430 captured.
- [x] Real brand icon/splash + deterministic feature graphics RU/TJ; draft legal/
  listing/data declarations; screenshot automation, без fake product images.

## P0 — до закрытого store testing track / покупательского допуска

- [ ] Последние code patchesb294d88 собраны в Android APK/AAB; не подменять
  checkpoint65a1e55 более новым исходником в отчётах.
- [ ] Android cold start/WorkManager/Keystore на реальном runtime. Owned API36 AVD
  пока не загрузился: нужно7.37GB, было2.50GB; освободить ≥10GB либо дать ARM64 QA device.
- [ ] Полный signed iOS Simulator smoke/Keychain/restart, затем signed device IPA
  и физический iPhone. Unsigned public startup не закрывает private storage gate.
- [ ] Обе платформы: session restore/rotation/logout/account switch, guest cart
  restart/import/revision conflicts, addresses/maps/GPS/keyboard/Back/deep links,
  real native synthetic checkout + tracking. HTTP suite — только один уровень.
- [ ] Confirm TARENA current image/migrations/resources/read-only access; review
  production backup restore и staged deployment с новым geocoder. Публичный401
  не доказывает authenticated production happy path.
- [ ] Restricted Android Maps SDK key с правильными app ID+signing certificate+
  API restrictions. Geoapify server-only; отдельно разрешённый provider budget smoke.
- [ ] Реальное исполнение deletion request, retention/anonymization/backup expiry,
  notifications/support ownership. Endpoint пока default-off и не стирает данные.
- [ ] Approved publisher identity, support contacts, RU/TJ privacy/terms/returns,
  public HTTPS Privacy/Support/AccountDeletion URLs. Drafts не публиковались.
- [ ] Production app ID ownership approved; существующие published IDs не менять.
- [ ] Proper Android upload key / Play App Signing; Apple Developer/provisioning/
  App Store Connect access. Local test key и Simulator .app не заменяют store signing.
- [ ] Reviewer access без production SMS/реальных покупок; final Data Safety/
  App Privacy/age/content rating/permission declarations сверены с signed binary.
- [ ] Google account type/date: conditional12testers/14continuousdays gate для
  personal accounts после13.11.2023; фактический тип пока неизвестен.

## P1 — до публикации

- [ ] Real native screenshots375/390/430 и small/current Android, физические iPhone.
  Current home390 pixel diff15.2685%, не принят как1:1; settled carousel frame нужен.
- [ ] RU/TJ all screens, large text, VoiceOver/TalkBack, Reduce Motion, keyboard,
  safe areas, platform gestures, no tab overlap.
- [ ] Measured cold start/catalog/image network/FPS/memory/leaks500+ list stress.
  Node DTO benchmark не является измерением native performance.
- [ ] Final store screenshot sets из actual current signed binaries, no mockups.
- [ ] Permissions/SDK disclosures проверены по окончательному merged binary.
  Current Android: foreground location, Internet/network, WorkManager wake/boot/
  foreground service, biometric dependencies, private receiver; нет background
  location/camera/mic/storage/overlay. iOS: foreground location RU/TJ, no Always.
- [ ] Retention/redaction для proxy/API logs и private tracking capabilities.

## Отдельные действия только после разрешения владельца

- [ ] Deployment/production migrations/provider spending/реальный auth smoke.
- [ ] Production checkout activation после native/backend/legal acceptance.
- [ ] Новый EAS build / quota / credentials; эта задача не запускала облачные jobs.
- [ ] Push/merge; signed store upload, testing-track publication, public release.

Кандидат productionID `tj.dushanbefresh.app`; previewID `.preview` сохранён.
Version0.3.0/local build3, EAS remote auto-increment; OTA disabled/no channels.
Push не блокирует первый релиз: готовой инфраструктуры нет, tracking реализован.

## Инструкция для локального Android QA

APK указан в release report вместе с exact SHA/source/architecture/signing.
Он standalone; Metro не нужен. Не удалять существующее приложение/его данные
ради установки файла с другой подписью. Проверять только public catalog/search/
product/guest cart restart/RU-TJ, пока нет отдельного isolated integration build.
В production login не нажимать отправку SMS, заказ не подтверждать.
Фиксировать model/OS/build/SHA/API ENV, steps, expected/actual и screenshot;
не пересылать OTP, токены, адреса клиентов или private tracking links.

Для полного локального HTTP сценария — [MOBILE_TESTING.md](MOBILE_TESTING.md).
Для будущего TARENA rollout — [deployment/rollback](MOBILE_BACKEND_DEPLOYMENT_20261117.md).
