# Первый Android-релиз Dushanbe Fresh — инструкция владельцу и другу

Целевой package ID `tj.dushanbefresh.app`. Приложение в Play Console создаёт друг в своём аккаунте. Upload key создаётся в Terminal на Mac владельца Dushanbe Fresh. Google управляет ключом подписывания APK, которые устанавливают тестировщики. Для каждого шага в Console, связанного с загрузкой или rollout, нужно отдельное решение владельца.

## 1. Создать приложение в Play Console

1. Друг открывает [Play Console](https://play.google.com/console) со своего Google-аккаунта, проверяет завершение Developer verification и выбирает **All apps → Create app**. Если запись с таким package ID уже существует в этом аккаунте, открыть её.
2. Указать **Dushanbe Fresh**, `tj.dushanbefresh.app`, язык по умолчанию «Русский», **App**, **Free**, согласованный адрес электронной почты поддержки. Друг читает декларации Developer Program Policies, US export laws и Play App Signing Terms of Service, подтверждает применимые декларации и создаёт запись.
3. Проверить имя и package ID на Dashboard. Если Play сообщает, что имя пакета занято или требуется подтверждение владения, сначала разобраться с принадлежностью пакета. Для первой настройки использовать Google-generated Play App Signing, предложенный Console, включая hybrid signing, если оно включено по умолчанию. [Создание приложения](https://support.google.com/googleplay/android-developer/answer/9859152) · [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)

## 2. Создать личный upload keystore

Владелец открывает свой Terminal и запускает команды из изолированного мобильного Git worktree. Нужны JDK 21, Android SDK, Node 22, pnpm 9.12.3 через Corepack, Python 3 и локальный [bundletool JAR](https://github.com/google/bundletool/releases). Установить зависимости репозитория с frozen lockfile. Build helper использует локальный Gradle/SDK cache. При недостающей зависимости сначала подготовить кэш обычной сборки на Mac.

```sh
export DF_BUNDLETOOL_JAR=/absolute/path/to/bundletool-all-1.18.3.jar
bash apps/mobile/scripts/play-aab.sh init-key
```

`keytool` интерактивно запросит пароль, повтор и пароль для экспорта сертификата. Используйте свой менеджер паролей. Скрипт создаст `upload.p12` с отдельным RSA-ключом 3072 бит и публичный `upload-certificate.pem` в `~/.local/share/dushanbe-fresh/play` с закрытыми правами. Можно задать `DF_PLAY_KEY_DIR` для другого собственного каталога вне репозитория. Сохранить защищённую резервную копию keystore и пароль отдельно. Другу передавать только подписанный AAB, его SHA-256 и при необходимости **публичный** сертификат. Если Play уже зарегистрировал upload certificate, использовать ключ, соответствующий этому сертификату.

## 3. Получить публичные сертификаты Play

1. Друг открывает **Protected with Play → Play Store protection → Manage Play app signing**. В некоторых интерфейсах вход находится в **Test and release → Setup → App integrity**. Нужны SHA-1 из **App signing key certificate** и SHA-256 из **Upload key certificate**. Для hybrid signing переписать отпечатки всех применимых сертификатов, включая сертификат доставки на старые Android.
2. Если сертификаты видны сразу, переходить к картам. Если они появляются только после первой загрузки, согласовать отдельную загрузку `bootstrap` без rollout. Он предназначен для регистрации подписи и поставляется с отключённой отправкой заказов и выключенным Android Maps key. Если уже выдан локальный неподписанный `bootstrap` из текущего SHA, взять этот файл. В противном случае собрать его командой ниже. `5` применим, пока этот код свободен в Console.

   ```sh
   export DF_PLAY_FILES="$HOME/.local/share/dushanbe-fresh/play-files"
   bash apps/mobile/scripts/play-aab.sh build bootstrap 5 "$DF_PLAY_FILES"
   bash apps/mobile/scripts/play-aab.sh sign bootstrap 5 \
     /absolute/path/to/dushanbe-fresh-bootstrap-5-SHA-unsigned.aab "$DF_PLAY_FILES"
   ```

3. После согласования друг открывает **Test and release → Testing → Internal testing → Create new release**, подтверждает настройки Signing и загружает **подписанный bootstrap** в **App bundles**. Сохранить черновик. Остановиться до **Send for review** или **Start rollout**. Скопировать отпечатки и проверить список versionCode. Черновой `bootstrap` заменить финальным файлом. Если Console уже использовал `5`, для финального AAB выбрать следующий свободный код, например `6`. [Подготовка release](https://support.google.com/googleplay/android-developer/answer/9859348) · [Ключи для API providers](https://support.google.com/googleplay/android-developer/answer/9842756)

## 4. Настроить Maps SDK и Geoapify

1. В своём Google Cloud project с проверенным биллингом открыть **Google Maps Platform → Keys & Credentials**, включить **Maps SDK for Android**, создать отдельный Android key. **Application restrictions → Android apps**. Добавить `tj.dushanbefresh.app` и SHA-1 соответствующих Play **App signing** сертификатов. **API restrictions → Restrict key → Maps SDK for Android**. Для отдельной локальной preview-сборки использовать её package ID и SHA-1 её APK. Проверить сохранение ограничений в Cloud до ввода ключа в локальную сборку. [Руководство Google Maps](https://developers.google.com/maps/documentation/android-sdk/get-api-key)
2. В **Geoapify MyProjects → нужный проект → API keys** сверить активность ключа, IP-ограничения и Statistics/Billing. Создать отдельный действующий server key для стенда и ограничить фактическим исходящим IP сервера. Для серверного ключа использовать IP-ограничение и обычные server-to-server запросы. Не копировать browser tile key и заголовок `Origin`. Проверить значение `GEOAPIFY_API_KEY` в секретах стенда и задать `MOBILE_GEOCODER_ENABLED=true`, `MOBILE_QUOTA_SECRET` и `MOBILE_GEOCODER_DAILY_LIMIT=10` для короткой проверки. Старый тест получил три `401` от Geoapify. До замены или проверки конфигурации этого ключа не повторять запросы.
3. На стенде получить `enabled: true` из `/api/v1/mobile/geocoding/status`, запросить локальный grant и проверить через приложение поиск «проспект Рудаки», «улица Бохтар» и один reverse. Критерий — `200`, действительные подсказки, сохранение координат выбранной точки. Если снова `401`, проверить исходящий IP и ограничения ключа. В журнале оставить только операцию, статус и время. Устройство с Play-установкой проверяет тайлы и отсутствие `Authorization failure` в Google Maps. [Geoapify API keys](https://myprojects.geoapify.com/help/api-keys/) · [Диагностика Geoapify](https://myprojects.geoapify.com/help/troubleshooting/) · [План стенда и TARENA](MOBILE_TARENA_FIRST_PLAY_ROLLOUT.md)

## 5. Собрать и подписать Internal AAB

Собирать с чистого финального коммита. Установить **публичный** `DF_PLAY_UPLOAD_SHA256` из Console. Для Maps SDK key скрипт `build internal` выведет скрытый интерактивный prompt, если ключ ещё не предоставлен через защищённое окружение. При опубликованной политике по `https://dushanbefresh.tj/privacy` установить `MOBILE_PRIVACY_POLICY_PUBLISHED=true`, чтобы включить ссылку в настройках приложения. Заменить `6` на подтверждённый свободный номер. Подставить путь, напечатанный сборкой.

```sh
export DF_PLAY_FILES="$HOME/.local/share/dushanbe-fresh/play-files"
export DF_PLAY_UPLOAD_SHA256='PUBLIC_SHA256_FROM_PLAY_CONSOLE'
bash apps/mobile/scripts/play-aab.sh build internal 6 "$DF_PLAY_FILES"
bash apps/mobile/scripts/play-aab.sh sign internal 6 \
  /absolute/path/to/dushanbe-fresh-internal-6-SHA-unsigned.aab "$DF_PLAY_FILES"
```

Вторая команда запускает `jarsigner` с интерактивным паролем, сверяет SHA-256 подписанта с локальным сертификатом и Play Console, проверяет package, номер, наличие Maps и подпись через `bundletool`. Она выводит SHA-256 подписанного файла. Передать другу только этот файл и checksum. Подписанный `bootstrap` хранить отдельно от Internal AAB. Оба build modes закрывают production checkout.

## 6. Internal и Closed testing

1. Друг сверяет checksum, package ID и версию. В **Testing → Internal testing → Testers** создаёт список с адресами Google-аккаунтов участников, задаёт согласованный канал обратной связи и сохраняет изменения. Тестировщикам нужен opt-in, доступ в Console для установки не требуется.
2. После разрешения владельца друг прикрепляет подписанный Internal AAB, проверяет что bootstrap исключён из релиза, вводит release notes об объёме теста, открывает Preview и подтверждает только Internal track. Отправка в review и rollout выполняются в пределах отдельного разрешения. После доступности трека передать тестировщикам opt-in ссылку и попросить установить через Google Play тем же Google-аккаунтом. В первом запуске не отправлять реальные SMS и заказы.
3. Проверить холодный старт, карты с Play-подписью, восстановление корзины и работу сети на двух физических Android. Для авторизации, checkout и удаления использовать отдельный тестовый контур. После проверки закрыть дефекты старта, утечек, адреса и расчёта. Перед Closed должны работать общедоступная `/privacy` и `/account/delete`, действия оператора удаления, формы Data Safety/App access и ссылка в приложении.
4. После согласования выбрать **Testing → Closed testing → Manage track**. Настроить список и страны, прикрепить проверенный AAB с допустимым versionCode и отдельно утвердить rollout. Участники Internal выходят из него перед opt-in в Closed. Для применимых новых personal accounts требуется не менее 12 участников, непрерывно opted in не менее 14 дней. Утвердить завершение теста отдельно от production release. [Управление треками](https://support.google.com/googleplay/android-developer/answer/9845334) · [Требования новых аккаунтов](https://support.google.com/googleplay/android-developer/answer/14151465)
