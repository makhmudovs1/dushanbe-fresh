# Первый Android-тест Dushanbe Fresh в Google Play

Решение для владельца. Кандидат `0.4.0 (5)`, `tj.dushanbefresh.app`, исходники `cae0dabcf8ce65c08fc5c4316caf227912e5852d`. Артефакт локальный и ожидает ключей и подписи. В профиле production отправка заказов отключена. Общее число повторно пройденных тестов — 1283 (23 shared, 620 API, 444 WEB, 196 MOBILE). [Манифест AAB](mobile-rc-20261118/first-play-aab.json) · [TARENA rollout](MOBILE_TARENA_FIRST_PLAY_ROLLOUT.md)

## 1. Собрать и подписать кандидат

- Проверено в самом AAB: target 36, min 24, ARM64 и x86_64, 54 native библиотеки, ELF load alignment от 16 КБ и `PAGE_ALIGNMENT_16K`. `bundletool validate` прошёл. Сохранены нужные конструкторы Room/WorkManager в DEX R8. Debug-подпись исключена из локального production сборочного профиля. [Требования target API](https://support.google.com/googleplay/android-developer/answer/11926878) · [Android 16 КБ](https://developer.android.com/guide/practices/page-sizes)
- Владелец сверяет package ID, доступный `versionCode` и **Upload key certificate SHA-256** в App integrity. Если приложения ещё нет, владелец оформляет запись и Play App Signing после согласования. После загрузки первого артефакта проверить использованный versionCode и выбрать следующий свободный при необходимости. Для локального AAB номер берётся из Expo config. `eas.json` при будущей облачной сборке использует удалённый счётчик и `autoIncrement`.
- Выпустить финальный AAB из того же кода с разрешённым `GOOGLE_MAPS_ANDROID_API_KEY`. Проверить production URL, checkout off, package ID и новый SHA-256 файла. Для Google Maps установленное из Play приложение использует **App signing key certificate SHA-1**, для локального preview — SHA-1 сертификата именно этого APK. Если Play показывает app-signing сертификат только после первого upload, согласовать владельцем установочный порядок отдельно: загрузить подписанный черновой AAB без rollout, получить SHA-1, подготовить кандидат с картой и проверить новый доступный versionCode. [Подписи Android](https://developer.android.com/studio/publish/app-signing) · [Ключ Maps SDK](https://developers.google.com/maps/documentation/android-sdk/get-api-key)

Владелец или уполномоченная система подписывает артефакт на своей машине, с интерактивным вводом паролей. Передаётся только подписанный файл и его публичный SHA-256.

```sh
jarsigner -keystore "$DF_PLAY_UPLOAD_KEYSTORE" \
  -signedjar "$DF_PLAY_SIGNED_AAB" "$DF_PLAY_UNSIGNED_AAB" "$DF_PLAY_UPLOAD_ALIAS"
jarsigner -verify "$DF_PLAY_SIGNED_AAB"
keytool -printcert -jarfile "$DF_PLAY_SIGNED_AAB"
shasum -a 256 "$DF_PLAY_SIGNED_AAB"
```

Сверить сертификат подписанного AAB с **upload certificate** Play Console. Повторить `bundletool validate`. Опубликовать checksum файла в закрытом канале передачи. Пароли и приватные ключи остаются в хранилище владельца.

## 2. Подготовить карты на выделенном стенде

1. В Google Cloud выбрать свой проект с согласованным бюджетом и включить **Maps SDK for Android**. Ограничить отдельный тестовый ключ этим API и точной парой package ID + SHA-1 тестового APK. Для роли Play добавить `tj.dushanbefresh.app` + Play app-signing SHA-1 в production key. Upload key используется на другом этапе и нужен только если устанавливается APK именно с этой подписью.
2. В Geoapify MyProjects завести отдельный действующий server key, ограничить исходящим IP стенда и проверить quota. Положить ключ как `GEOAPIFY_API_KEY` только в серверный secret store, добавить `MOBILE_GEOCODER_ENABLED=true`, `MOBILE_QUOTA_SECRET` и дневной лимит 10 для короткого теста. Локальный NestJS со старой WEB-конфигурацией действительно сделал два поиска и один reverse. Geoapify вернул `401` на все три, клиентский API вернул `503`, адреса не получены. Для Android Maps SDK key отсутствовал. [Geoapify — ключи и ограничения](https://myprojects.geoapify.com/help/api-keys/) · [Подробная настройка](MOBILE_MAPS.md)
3. На отдельной тестовой сборке открыть карту, получить тайлы, выбрать публичные точки «проспект Рудаки» и «улица Бохтар», сделать один reverse и проверить точные координаты входной точки. Повторить GPS/запрет доступа, сохранение координат и обе стороны активного полигона. Проверить отсутствие `Authorization failure` для Maps SDK. Логировать только коды, время и тестовые публичные адреса. Результат принимать на устройстве с нужной подписью, поскольку именно она участвует в ограничении Maps SDK.

## 3. Передать другу доступ только на нужный этап

| Задача друга | Доступ |
| --- | --- |
| Установить и проверить приложение | Его Google-аккаунт в списке тестеров выбранного трека и opt-in ссылка. Доступ к Play Console и сам AAB для установки не требуются |
| Посмотреть отчёты, версии и Android vitals | При необходимости временное app-level `View app quality information (read-only)` только для Dushanbe Fresh |
| Загрузить согласованный подписанный AAB вместо владельца | В `Users and permissions` пригласить его собственный аккаунт на ограниченный срок. В `App permissions` выбрать только Dushanbe Fresh, дать `View app information (read-only)` и `Release apps to testing tracks`. `Manage testing tracks and edit tester lists` дать только при делегировании списков |

`Release apps to testing tracks` технически разрешает создать, изменить и раскатить тестовый релиз. Если друг должен передать файл, а rollout должен быть технически доступен только владельцу, владелец сам загружает и запускает release. Права администратора, production release, Play App Signing, финансов и всего аккаунта для этой задачи не выдаются. После передачи отозвать временные права. [Права Play Console](https://support.google.com/googleplay/android-developer/answer/9844686)

## 4. Internal testing → closed testing

**Начало internal.** Владелец утвердил точный подписанный AAB/checksum и начало теста. Play app integrity и Maps fingerprints сверены. `versionCode` свободен, production checkout выключен, есть назначенный канал для обратной связи и минимум два физические Android разных классов. Отдельное окружение с тестовым OTP предназначено для авторизации, покупки, tracking и удаления. На сборке с production API проверять публичный сценарий без SMS/заказов. Объяснить ограничения в release notes.

Владелец открывает **Testing → Internal testing**, добавляет друга и небольшую группу, создаёт release только после согласования, проверяет Preview, доступность устройств и ключ App Signing. После утверждения включает rollout трека и передаёт opt-in. Internal допускает до 100 тестеров. [Internal и closed testing](https://support.google.com/googleplay/android-developer/answer/9845334)

**Завершение internal.** Подписанный Play APK реально устанавливается. На двух устройствах пройдены холодный запуск, переходы, RU/TJ, поиск, карточки, корзина после перезапуска, сетевое восстановление, карта и точность адреса. На изолированном контуре подтверждены OTP, сессия, контрольная покупка и обработка удаления. Review pre-launch report и Android vitals для обнаруженных падений. Падения на старте, утечки, потеря корзины, ошибки цен/ACL, сбои адреса и непроходимое удаление — стоп. [Чек-лист физического Android](MOBILE_QA_ANDROID_DEVICE.md)

**Начало closed.** Internal завершён, отчёт согласован, публичная политика и `/account/delete` доступны и подтверждены, обработчик удаления назначен, формы Data Safety и App access заполнены. После утверждения URL политики нужна ссылка из приложения. В текущем AAB её ещё нет. Покупку проверяют в утверждённом синтетическом контуре. Проверить, что тестеры используют нужный аккаунт и трек, а срок участия отсчитывается от opt-in. При новом personal account после 13.11.2023 Google требует минимум 12 тестеров, подписанных непрерывно 14 дней. Проверить применимость правила в Dashboard, оставить запас участников. [Требования к новым personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465) · [Политика и формы на утверждение](MOBILE_PLAY_PRIVACY_RU_TJ.md)

**Завершение closed.** Владелец сверил журнал тестов, отсутствие критических ошибок, Maps/Geoapify на реальных устройствах, а также работающий путь удаления. Упаковать отзывы и изменения для заявки на production access, когда это требуется. Production rollout и включение заказов согласовать отдельными решениями. Data Safety можно не подавать только пока приложение исключительно в internal track. [Google Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469)

## Риск picomatch и решение о тестовом выпуске

`pnpm audit --prod` включает runtime-зависимости npm-пакетов целиком, поэтому числит под одним high advisory две версии в дереве установки `apps/mobile`. Короткие цепочки из аудита и lockfile:

| Версия | Цепочка |
| --- | --- |
| `2.3.2` | `apps/mobile → expo@58.0.26 → @expo/metro@58.0.0 → metro-file-map@0.87.1 → micromatch@4.0.8 → picomatch@2.3.2` |
| `4.0.7` | `apps/mobile → expo@58.0.26 → @expo/cli@58.1.21 → picomatch@4.0.7` |
| `4.0.7` | `apps/mobile → expo@58.0.26 → @expo/metro-config@58.0.23 → picomatch@4.0.7` |
| `4.0.7` | `apps/mobile → react-native@0.88.1 → tinyglobby@0.2.17 → picomatch@4.0.7` |

В полном аудите дополнительно виден dev-путь `@typescript-eslint/eslint-plugin → @typescript-eslint/parser → @typescript-eslint/typescript-estree → globby → fast-glob → micromatch → picomatch@2.3.2`. Проверены production dependency trees API и WEB, там `picomatch` отсутствует. Среди 1917 источников Metro-карты этого AAB отсутствуют `picomatch`, `micromatch`, `metro-file-map`, `tinyglobby` и `@expo/metro-config`. Из `@expo/cli` в карте присутствует только runtime loader `build/metro-require/require.js`. В APK установленного покупателя вызов уязвимого парсера через приложенческие поля не найден. В среде сборки пакет достижим через обработку glob-конфигураций, поэтому сборка выполняется с проверенным исходным деревом и без публичного Metro.

**Решение** — этот advisory сам по себе не блокирует internal/closed тест указанного standalone AAB. Риск остаётся для хостов сборки, которые обрабатывают непроверенные проекты или glob-ввод. Перед следующей сборкой сверить advisory и совместимое исправление от Expo/Metro или upstream. В доступном GHSA исправленная версия пока отсутствует. Зависимости не менялись. [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
