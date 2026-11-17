# Dushanbe Fresh — native iOS / Android

Текущий этап: [production sync 17.11.2026](../../docs/MOBILE_RELEASE_2026.md).
Ветка `feature/mobile-production-sync-20261117`, база WEB/API `521b61e`.
Исходная `feature/mobile-app` и её история сохранены. Production не менялся.

Expo SDK 58.0.26 / React Native 0.88.1 New Architecture / React 19.3 /
TypeScript strict / Expo Router. Нативные экраны, без WebView. Общее API
`https://dushanbefresh.tj/api/v1`; цены и итог определяет backend.
Версия приложения **0.3.0**, локальные Android versionCode / iOS buildNumber **3**.

## Запуск

Из корня worktree (Node 22.13+; проверено 22.23.3, pnpm 9.12.3):

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @dushanbe-fresh/shared build
corepack pnpm db:generate
corepack pnpm --filter @dushanbe-fresh/mobile start
```

Это development client, ему нужен Metro. Expo Go не является QA-бинарником
этого приложения. Локальная нативная сборка требует Xcode/CocoaPods либо
Android SDK/NDK/JDK. Из apps/mobile:

```sh
corepack pnpm ios
corepack pnpm android
```

Для production GET в local dev настройте **только мобильный** `.env.local`
по `.env.example`. Не копируйте apps/web/.env.local или серверные секреты.
Для standalone QA используйте preview ENV из eas.json и Release configuration.
Release содержит Hermes bundle, development client — отдельный профиль.

## Окружения и безопасность

- development: localhost:4000/api/v1, checkout закрыт;
- integration: только явно заданный loopback/private test host и совпадающий
  runtime proof; единственный режим с разрешённым тестовым созданием заказов;
- staging: явный HTTPS API URL, отдельного подтверждённого staging сейчас нет;
- preview / production: HTTPS dushanbefresh.tj, **создание заказов закрыто**.

Один флаг не может открыть production checkout: это отдельный release gate.
Сейчас Payom и обязательный login включены на production, что приложение
читает из capability API. Никаких автоматических платных SMS нет.
Секреты сессий — SecureStore, ротация и отзыв — общий NestJS API; AsyncStorage
содержит гостевую корзину/язык/временный адрес, а не долгоживущие токены.
Android Maps key — публичный SDK credential с package+certificate/API
restrictions; пока корректный key не предоставлен, Android map gate открыт.
Geoapify key остаётся только на сервере.

## Что обновлено

Главная/каталог/поиск/сheets используют текущие assets/данные, RU/TJ, актуальные
названия/единицы и факты из WEB. Cart и checkout получают серверные fees,
minimum/shortfall и totals. Вход: +992, маска, шесть OTP cells, resend timer,
имя/фамилия и сохранение сессии. Passive address refresh сохраняет выбранный
checkout snapshot. Revision/import/MAX cart journal, refresh/logout fences,
review token и requestId сохранены.

Новые native geocoding endpoints и guarded deletion request подготовлены в API,
но **не выложены на TARENA**. Запрос удаления отзывает сессии, не стирает данные;
default-off до утверждения retention и рабочего процесса исполнения.
Минимальная новая WEB-страница /account/delete нужна для внешнего способа
запроса Google; существующие WEB flows не переписаны.

## Проверки

```sh
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm security:audit
```

API integration требуют отдельной локальной TEST_DATABASE_URL; без неё
Vitest явно помечает DB suites skipped. Native HTTP suite требует защищённого
fixture descriptor. Полные воспроизводимые команды —
[testing](../../docs/MOBILE_TESTING.md). Production не подходит для write-tests.

Из apps/mobile:

```sh
corepack pnpm exec expo install --check
corepack pnpm check:build
corepack pnpm check:design
corepack pnpm exec expo prebuild --platform android --no-install
corepack pnpm check:android-startup
```

Последний check проверяет реальные CNG inputs, а не DEX. Для APK дополнительно
запустите inspect-android-startup.py: правила конструкторов Room/WorkManager
обязательны при включённом R8. Не отключайте minification для release.

## Сборки и Expo

Существующий проект @dushanbe-fresh/dushanbe-fresh,
UUID `089fb7ac-507e-4d1b-943b-8a9228987813`; новый проект не нужен.
Preview `.preview` package/bundle ID, кандидат production `tj.dushanbefresh.app`
требует подтверждения владельца до первой регистрации. OTA updates выключены;
каналов, runtimeVersion и опубликованных updates нет.

EAS profiles: preview — standalone APK; production — AAB / signed iOS build;
simulator — iOS Simulator. Команды ниже **только после отдельного разрешения
расхода квоты/credentials**, в этой задаче новые EAS jobs не запускались:

```sh
corepack pnpm dlx eas-cli@26.0.0 build --platform android --profile preview
corepack pnpm dlx eas-cli@26.0.0 build --platform android --profile production
corepack pnpm dlx eas-cli@26.0.0 build --platform ios --profile production
```

Не выполняйте submit автоматически. Signing, store access, Maps restrictions,
юридические тексты, реальное удаление данных и native acceptance — release gates.
Актуальные результаты и ограничения находятся в MOBILE_RELEASE_2026.md;
октябрьские APK и отчёты не доказывают готовность текущей версии.
