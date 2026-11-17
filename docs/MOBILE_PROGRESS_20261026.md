> Historical October evidence. Current release review: [MOBILE_RELEASE_2026.md](MOBILE_RELEASE_2026.md).

# Mobile progress — 2026-10-26

Ветка: `feature/mobile-app`, base `origin/main@fded9c7`.
Worktree: `/private/tmp/dushanbe-fresh-mobile`. Основная рабочая копия WEB не менялась.

## Реализовано

- A: отдельное pnpm workspace Expo 58, strict TS, New Architecture, Router, пять
  вкладок, тема, настоящий public API с отменой/timeout/retry; без WebView.
- B: главная с существующими баннерами, категории/подкатегории из API, поиск,
  FlatList, экран товара с галереей и related products той же категории,
  guest favorite invitation, добавление/количество, guest cart с durable storage,
  подтверждение очистки, актуализация цены/доступности без потери строк, RU/TJ.
- Часть C: форма/нативная карта адреса, центральная метка, permission GPS,
  shared зона, ручные детали, метки адреса, сохранение гостевого адреса,
  окна доставки, серверный quote/confirmation, persisted requestId/reviewToken,
  pending submission recovery, private tracking screen. Purchase flow реализован
  в коде, не прошёл полную интеграционную приёмку с настоящим тестовым API.
- Часть E: unit tests, матрица зависимостей, Hermes export для iOS/Android,
  EAS development/simulator/APK/AAB profiles, копия существующих brand assets,
  документация и изоляция React18/19 в pnpm; Node22 CI.

## Фактические проверки

- Полные root lint и typecheck прошли, включая неизменённые WEB/API.
- Mobile: **51/51**, Shared: **23/23**, WEB: **307/307**, API: **234 passed,
  135 skipped** без TEST_DATABASE_URL. Новая тестовая БД не создавалась;
  backend endpoints/Prisma в этой итерации не изменялись.
- Полный root build: Shared/API/Web и Hermes export iOS/Android прошли.
  Нативные bundles примерно по 4,4 MB; это не APK/IPA.
- `expo install --check` **online**: Dependencies are up to date. Матрица
  потребовала мобильные TypeScript ~6.0.3 и React types ~19.3.0; старый WEB
  остаётся на собственных TS/React/types. Offline-результат отдельно не
  использовался как достаточное доказательство совместимости.
- `expo prebuild --no-install --platform all` прошёл для обеих платформ;
  проверены сгенерированные New Architecture/Hermes/location permissions.
  iOS/Android проекты игнорируются Git и воспроизводятся config plugins.
- Настоящий TypeScript ApiClient + DTO guards через `check:api`: **42 товара,
  5 категорий**, detail/search/реальная фотография/status/zone прошли, **0 mutations**.
  Phone/SMS, checkout POST и GET delivery-slots с побочными записями не вызывались.
- Конфигурация Expo prebuild прочитана; Git diff apps/web/apps/api/packages/shared
  пустой. Основной worktree по-прежнему на main, без изменений MOBILE.
- Проверок на физическом устройстве, эмуляторе/симуляторе, native compile,
  визуальной приёмки и настоящей покупки в тестовом API **не было**.

## Не завершено

- Native OTP/bearer sessions: на backend нет мобильного транспорта. Payom реально
  выключен; кодов/сессий приложение не выдумывает. Favorites приглашает войти.
- Account favorites/cart journal sync/address CRUD/order history/repeat/profile
  edit/logout: нужен безопасный transport; протокол сохранения описан отдельно.
- Native address autocomplete/reverse: нет безопасного server endpoint без
  browser Origin. Не обходится. Пока точка + ручные поля.
- Полная iOS/Android UI/device приёмка, тесты карты/жестов/клавиатуры/font scale,
  native integration order creation и tracking на отдельной тестовой БД.
- APK/AAB/IPA: здесь нет Android SDK/JDK configuration, полного Xcode/CocoaPods,
  подтверждённых EAS project/signing credentials/Apple Developer. Нативная
  компиляция и установка не запускались; export не считается binary build.
- Отдельный staging хост не обнаружен; production fees не выдумывались и
  live checkout/POST/SMS/заказы не выполнялись.

## Следующая последовательность

1. Подготовить Android/iOS development build и провести native A/B приёмку.
2. Изолированный staging API/БД: guest quote → submit → tracking, concurrency,
   price/slot/zone change, ответ потерян после commit, app restart и SecureStore.
3. Добавить mobile session transport и geocoding adapter с security/HTTP tests,
   сохраняя browser guards; затем account cart journal и account screens.
4. Device visual/performance polish, Maps certificates/ключ, подписанные APK/IPA,
   оба языка, release icons/splash/store metadata; публикация отдельным решением.

Никаких push/deploy/main merge/production DB changes в этой итерации нет.
