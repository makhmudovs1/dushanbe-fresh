# Dushanbe Fresh Mobile — release review, 17–18.11.2026

**Android: NO-GO для публикации. iOS: NO-GO для публикации.**
Реализация и локальные проверки продвинулись; выпуск для настоящих покупателей
не разрешён. Production checkout закрыт в ENV и runtime. В этой задаче нет новых
EAS jobs, push/merge, deployment, production SMS, заказов или миграций.

## Исходники и фактический production

Актуальная проверенная база WEB/API: `521b61e115cbed0061c70a569b9e7b7570febe43`.
Исходная мобильная ветка `feature/mobile-app@1e9605751bb26972761f04c6da5a20e62b630d3e`
сохранена. Интеграция выполнена на отдельной ветке
`feature/mobile-production-sync-20261117` в `/private/tmp/dushanbe-fresh-mobile`,
начиная с нового main; старый API не скопирован поверх новой авторизации.
Исходный WEB worktree не редактировался. Финальный fetch18 ноября снова
подтвердил origin/main521b61e; основной worktree clean. Историческое исключение native из MVP
сохранено; явное мобильное задание расширяет scope (docs/DECISIONS.md).

Production HTTPS GET-аудит: health/catalog/categories/slots/zone — 200;
46 товаров / 5 категорий — наблюдение, не константы приложения. Payom и
requiredForCheckout включены. Анонимные private native reads — 401/no-store.
Native geocoding и обе deletion capabilities — 404. Доказательства:
[production audit](mobile-production-20261117.json),
[WEB/API/MOBILE contracts](MOBILE_API_COMPATIBILITY.md).
Никаких code/verify/order POST не отправлялось. GET delivery-slots в существующем
API может материализовать расписание; аудит не доказывает отсутствие любых DB writes.

Существующий SSH-доступ TARENA отклонён с publickey. Текущий SHA/image digest,
ресурсы и список реально применённых миграций **не подтверждены**. Исторический
receipt от 2 ноября не считается текущей версией сервера. Публичные API доступны,
но полностью готовым к MOBILE сервер пока не признан.

## Реализация и изменения

- Expo 58.0.26 / RN 0.88.1 New Architecture / React 19.3, strict TypeScript,
  нативный Router/карты/SecureStore; WebView нет. Проверены совместимые Expo peers.
- Синхронизированы текущие brand assets, фотографии, RU/TJ, product facts,
  единицы/разновидности/min/step. Новые товары и цены читаются из общего API.
- Актуальные +992 mask, шесть OTP cells, resend deadline, имя/фамилия и
  challenge/session persistence. Платные SMS не отправляются автоматически.
- Серверный cart quote: текущие цены, minimum/shortfall/progress, fees и total.
  Сохранены revision/import/MAX, durable journal, потерянные ответы и owner fences.
- Passive refresh адресов сохраняет выбранный checkout snapshot и точные координаты.
  Required-login guest checkout показывает приглашение; не возвращает старое
  разрешение гостевых заказов поверх текущей серверной политики.
- SecureStore locked теперь даёт понятный retry, а не бесконечный spinner корзины.
  В iOS CNG добавлены реальные RU/TJ permission strings и метаданные локализации.
- Новый guarded native geocoder использует текущий WEB Geoapify adapter, bounded
  upstream, IP-bound hashed grants и квоты; Origin не подделывается, секрет не
  вшит. Android Maps key с правильными restrictions ещё нужен.
- Подготовлен default-off запрос удаления аккаунта, native UI и минимальная новая
  WEB-страница `/account/delete`. Проверяется authenticated owner, intended owner
  и показанная версия retention policy; 412/409 не отзывают сессии. Принятый запрос
  сохраняется и отзывает все сессии владельца. **Данные не удаляются:** processor,
  retention/backup lifecycle и юридическое утверждение ещё нужны.

## Воспроизводимые проверки

Исходники проверенного кода: `c141ce3a1b9105c010a114932a8466618ac571df`.
Полный свежий regression: **1282 passed, 0 failed, 0 skipped**:
shared 23, API 619, WEB 444, MOBILE 196 (187 unit + 9 actual HTTP).
PostgreSQL 14 — только отдельные synthetic loopback DB/role/port; реальных
покупателей и production snapshots нет. Payom adapter/template/201 parsing
исполняется против защищённого mock gateway, без настоящей SMS.

Сквозной HTTP-сценарий использует настоящие admin/picker/courier routes:
новый товар → изменение цены → общий WEB/native пользователь и корзина → адрес/
слот/quote/review → один идемпотентный заказ → сборщик/фактический вес → упаковка →
курьер/доставка/наличные → общий tracking/history → повтор с текущей ценой.
Это **не** полный UI E2E на телефоне. Отдельно проверены replay/Origin/права,
конфликты корзины, offline/lost response и переключение аккаунтов.

Прошли root lint/typecheck/build: shared/API/WEB production build, Android/iOS
Hermes export. Expo install --check; Expo Doctor 20/20; pnpm audit — 0 advisories.
Две additive migrations прошли synthetic backup/restore rehearsal: counts/SHA
существующих users/products/customer_carts/orders не изменились. Это не rehearsal
на актуальном production snapshot/объёме.
[Testing](MOBILE_TESTING.md), [migration evidence](mobile-qa-20261117/synthetic-migration-rehearsal.json).

Логи в `/private/tmp/df-mobile-sync-release-{regression,build}-v4.log`,
`...release-{lint,types}-v5.log`. Воспроизводимые команды — apps/mobile/README.md.
Обычный pnpm test без отдельной TEST_DATABASE_URL явно пропускает DB suites;
указанный полный результат получен с настроенными synthetic DB и HTTP fixture.

## Реальные сборки и native QA

Версия **0.3.0**, versionCode **3**, buildNumber **3**.
Preview identifiers: `tj.dushanbefresh.app.preview`.
Expo project проверен read-only: @dushanbe-fresh/dushanbe-fresh,
`089fb7ac-507e-4d1b-943b-8a9228987813`. Новый проект не создавался.
Remote EAS numbering может отличаться от локального: cli.appVersionSource=remote.

### Android checkpoint

Локальные `assembleRelease` и `bundleRelease` успешны, standalone embedded Hermes,
**только arm64-v8a, стандартная local debug/test signing**, не production upload key.
Exact source: `65a1e552f65b08cff828d9fb3e98ead82ff5f7a3`.
Эти бинарники не содержат более поздние изменения вплоть до `c141ce3`; не представлять их
как последний окончательный release. APK нельзя устанавливать поверх старой
EAS-подписи без проверки; не удаляйте пользовательские данные для обхода подписи.

- APK: `/private/tmp/df-mobile-sync-artifacts/dushanbe-fresh-0.3.0-3-arm64-qa.apk`
  (36,312,987 bytes), SHA-256
  `d1fafaead03a989f24c78494156faae9950309cbbffdb2b20858b608c35c0f43`.
- AAB: `/private/tmp/df-mobile-sync-artifacts/dushanbe-fresh-0.3.0-3-arm64-qa.aab`
  (27,651,804 bytes), SHA-256
  `39c1796e39ebc46c2890f0a7179d1e87e7e125eea791b576b6fbd6d0ab06c8d1`.
- Actual DEX: WorkDatabase_Impl, OverwritingInputMerger и ArrayCreatingInputMerger
  сохраняют public no-arg constructors с code. R8 **full/release 9.2.14**, не выключен;
  WorkManager 2.9.1, Room 2.5.0, AGP 9.2.1.
  [Binary proof](mobile-qa-20261117/android-startup-inspection.json).
- target API 36, min24, все 27 ELF libraries имеют ≥16 KB PT_LOAD alignment,
  `zipalign -P 16` и APK signature verification успешны. Нет background location,
  camera/microphone/storage/overlay. Ограниченный scan Hermes не нашёл известных
  server-secret markers; это не доказательство отсутствия любого возможного секрета.

Android Emulator API36 ARM64 установлен и запускался, но отказал **до boot**:
требует 7372.80 MB userdata, доступно 2502.86 MB. Android runtime/WorkManager process
startup/physical device **не проверены**. Для iOS освобождены только скачанные
этой задачей rebuildable emulator/image файлы; пользовательские данные не тронуты.
Android tools/image можно восстановить после появления ≥10 GB свободного места.
Appetize ARM64-совместимость не проверена. EAS ссылки для этих локальных сборок нет.

### iOS

Xcode27.1/iOS SDK27.1, arm64 Simulator Release с embedded Hermes успешно собран.
Собственный iPhone14 Simulator / iOS27.0, 390×844: фактический запуск и загрузка
главной с настоящими production товарами/фотографиями подтверждены.
[Настоящий native screenshot](mobile-qa-20261117/ios-home-390-checkpoint.png).
Это первоначальная unsigned Simulator-сборка, не IPA и не физический iPhone.

Первый Maestro guest-cart smoke не прошёл: SecureStore/session locked в unsigned
Simulator app. Код теперь показывает retry. Попытка отдельной ручной ad-hoc
подписи не дала запуска и не считается исправлением. Штатная Xcode Simulator Release-сборка с локальной подписью **успешна**.
Exact native code `c141ce3a1b9105c010a114932a8466618ac571df`, iOS SDK27.1,
min16.4, locales ru/tg, embedded Hermes4,704,356 bytes. Xcode автоматически
сформировал свой Simulator application-identifier; постоянный Apple Team/ключи
не задавались. Actual launch и Maestro public-smoke390 прошли: живой товар,
корзина с серверным итогом, stop/launch с сохранённым товаром, phone-login +992
без отправки SMS. SecureStore guest restore больше не locked; реальная OTP session
запись/rotation/logout в Keychain этим гостевым тестом **не проверены**.

Рабочий архив: `/private/tmp/df-mobile-sync-artifacts/dushanbe-fresh-0.3.0-3-c141ce3-ios-simulator.zip`,
SHA-256 `ebc1b58af169bb89e579fa2ea5b3dc5e11a53200acac3d6d010a204cdf7eb434`.
Внутри `DushanbeFresh-c141ce3-simulator.app`; предыдущую failed manual-signing копию
не использовать. [Binary metadata](mobile-qa-20261117/ios-xcode-simulator-inspection.json).
В ходе настоящего UI QA исправлены неприменённый перевод общего заголовка и
объединённые accessibility controls языкового modal. На c141ce3 **9/9 native flows прошли**: locale-smoke/public-browse/public-smoke
на iPhone 13 mini / 375×812, iPhone 14 / 390×844 и iPhone 14 Pro Max / 430×932 / iOS27.0.
42 автоматических PNG + дополнительный реальный снимок карты.
Архив: `/private/tmp/df-mobile-sync-artifacts/dushanbe-fresh-c141ce3-native-screenshots.zip`. Сценарии проверяют
категории/search/product/back/guest favorites/profile/map opening, cart quote,
restart persistence и RU/TJ selection/restart. Это не authenticated purchase UI E2E.
[Native results](mobile-qa-20261117/native-ui-results.json).

Apple Maps после дополнительного ожидания≥10с загрузила настоящие тайлы Душанбе;
первоначальная сетка была loading. GPS, provider search/reverse и сохранённые
серверные адреса этим тестом не приняты: native Geoapify capability404.
[Реальные тайлы](mobile-qa-20261117/ios-map-loaded-430-c141ce3.png).
Подходящих локальных code-signing identities: **0**, проверено read-only.
Signed device IPA, provisioning, TestFlight и physical device acceptance отсутствуют.

### Визуальное соответствие и производительность

Свежие WEB reference screenshots сняты на 375/390/430 px: 39 guest screen/state
records, 78 viewport/full PNG. Скрипт дождался hydration и actual cart quote;
все production writes блокировались, кроме публичного read-only checkout/validate.
Private history/tracking/account screenshots без реального входа не снимались.
Артефакты: `/private/tmp/df-mobile-sync-web-reference-430` (внутри все три ширины).

Native public home390 действительно близок к WEB, но **1:1 не принят**:
pixel diff 15.2685%, MAE9.655 на документированном crop390×700, без masks/shifts.
В кадрах различаются фаза carousel и native typography/controls; нужна повторная
проверка на одном settled slide. Новые реальные screenshots на375/390/430 также сравнены с WEB. C141ce3:
375px —13.1184% / MAE6.7595 (crop375×650),430px —7.6434% / MAE3.1114
(crop430×750). Только system-bar crops и одинаковый logical ROI; без масок/
смещений/растяжения. Overlays подтверждают близкую геометрию, но различия текста,
иконок, декодирования/кадрирования изображений остаются. Оба strict1% checks
вернули failed: полного1:1 acceptance нет, несмотря на пройденные functional flows.
Private screens, Android sizes и physical devices ещё не приняты.
[Comparison375](mobile-qa-20261117/home-comparison-375-c141ce3.json),
[comparison430](mobile-qa-20261117/home-comparison-430-c141ce3.json),
[earlier390](mobile-qa-20261117/home-comparison-390.json).
Source hashes/design tests не заменяют настоящие native screenshots.

APK/AAB sizes измерены выше. Synthetic DTO benchmark500/1000 прошёл, но измеряет
только Node domain computation, **не** FPS, cold start, image/memory/leaks.
Native startup/network/FPS/memory/500+ list stress остаются отдельными QA gates.
Push backend/infrastructure не готовы; для первого релиза достаточно tracking,
реальных уведомлений/аналитики/рекламного SDK не добавлено.

## Ответы на 19 вопросов

| # | Вопрос | Фактический результат |
| --- | --- | --- |
| 1 | Что изменилось в WEB | TARENA, активный Payom/required login, structured profile, server markup/prices, cart/passive refresh, product facts и delivery/operations |
| 2 | Что перенесено | Текущие assets/RU-TJ, phone/OTP/name UX, server cart totals/minimum, product facts, адресные snapshots и общий API |
| 3 | Новые API | Native geocoder; default-off deletion REQUEST и внешний WEB request page; общая identity/cart уже были в main |
| 4 | TARENA готов | Частично: public/read-only native contracts доступны; новый geocoder/deletion404, deployed SHA/migrations/resources неизвестны |
| 5 | UX совпадает | Реальные375/390/430 screenshots и9 UI flows; close geometry, строгий pixel1:1 не пройден |
| 6 | Вход/корзина между устройствами | Реальные loopback HTTP/DB tests WEB cookie + native sessions прошли; Keychain и несколько физических устройств ещё нет |
| 7 | Сборщик/курьер | Полный synthetic HTTP lifecycle прошёл через actual role routes; не production/UI acceptance |
| 8 | Android APK | Собран локально, standalone ARM64 checkpoint65a1e55; latestc141ce3 ещё не собран в APK |
| 9 | Play AAB | bundleRelease собран; QA preview identity/test key, не store-ready production AAB |
| 10 | iOS IPA | Нет; signed standalone Simulator app +9/9 public/guest/RU-TJ flows на3 размерах; device identities0 |
| 11 | Физические устройства | Не запускались ни Android, ни iPhone |
| 12 | Security | Исправлены dependency advisories, locked-state UX, owner/policy consent race; R8 constructors/Origin/session separation сохранены |
| 13 | Apple/Google выполнено | API36, актуальный Xcode/SDK,16KB binary checks, RU/TJ permissions, project/build profiles; без утверждения всей store compliance |
| 14 | Не выполнено | Реальное удаление/retention, approved legal URLs, Maps key, signing/store access, native/runtime/visual/performance/reviewer checks |
| 15 | Нужен владелец | Диск/ARM64 Android, read-only TARENA access, ID ownership, store account type/date, legal/support/retention inputs, restricted Maps key и позже отдельные разрешения |
| 16 | Коммиты | a7f12d4 API; a758874 native integration;65a1e55 recovery/QA; b294d88 owner/policy/locales/checkout gate;20dc47b evidence;fbe12b0 RU/TJ titles;c141ce3 language modal a11y; final docs commit см. git log |
| 17 | Миграции/deploy | Две additive migrations; local rehearsal passed; deployment/production backup review только с отдельным разрешением |
| 18 | Закрытое тестирование | Локальный public smoke возможен на подходящем QA device; store testing track пока NO-GO, production purchases закрыты |
| 19 | Публикация | Android NO-GO; iOS NO-GO до перечисленных P0 gates |

## Приоритеты следующего допуска

1. Довести реальные signed native runtime проверки: Android cold start/WorkManager,
   SecureStore/restart/logout, iOS Keychain и физические устройства. Расширить уже снятый
   public screen set375/390/430 до private checkout/account flows, Android,
   physical devices, больших шрифтов и VoiceOver/TalkBack.
2. Подтвердить текущие TARENA image/migrations/resources; согласовать staging/
   backup/restore и отдельный deployment, затем provider/Maps smoke с бюджетом.
3. Реализовать и утвердить фактический deletion lifecycle, seller/support/retention/
   privacy/terms/returns URLs, associated-domain files и reviewer access.
4. Утвердить production IDs/signing, Apple/Play accounts и testing track. Для
   personal Google accounts после13.11.2023 действует отдельный12tester/14day gate.
5. После этих проверок отдельно разрешить production checkout activation,
   новые EAS builds и store uploads. Сейчас ни один из этих шагов не выполнен.

[Deployment/rollback runbook](MOBILE_BACKEND_DEPLOYMENT_20261117.md),
[release checklist](MOBILE_RELEASE_CHECKLIST.md),
[RU/TJ legal/store drafts](MOBILE_STORE_MATERIALS_RU_TJ.md).

Проверенные официальные требования:
[Expo58](https://docs.expo.dev/versions/v58.0.0/),
[Google API36](https://support.google.com/googleplay/android-developer/answer/11926878),
[Google conditional testing](https://support.google.com/googleplay/android-developer/answer/14151465),
[Apple SDK](https://developer.apple.com/news/upcoming-requirements/?id=04282026a),
[Apple deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/),
[Google deletion](https://support.google.com/googleplay/android-developer/answer/13327111).
