# Закрытая репетиция TARENA

29 октября 2026 года, МСК. Новый production-build в закрытом тестовом контуре.
Репетиция завершена; документ не разрешает DNS cutover.

## Границы

- Старый FirstVDS не подключался, не изменялся и не использовался для отката.
- DNS, реальное production и реальные клиентские данные не затрагивались.
- TARENA доступ проверен по закреплённому ED25519 host key. Уведомления об
  истечении теста не получено; после временных SSH обрывов новые входы работали.
- Отдельный `df-tarena-rehearsal`, приватный каталог
  `/home/adminj0n/df-tarena-rehearsal-20261029`, новые DB/staff/backup secrets0600.
- Старый private pilot сохранён. Два тестовых контура не общая production БД.

## Проверка Хоста

В начале: Ubuntu24.04.5,2CPU/~1968MiB RAM, около65GiB свободного диска,
~1248MiB MemAvailable, swap~3.8GiB уже существовал; настройки swap не менялись.

Владелец передал read-only effective sshd/UFW/nft вывод:

- SSH22 слушает IPv4/IPv6; `PasswordAuthentication yes`, `PubkeyAuthentication yes`,
  `KbdInteractiveAuthentication no`, `PermitRootLogin without-password`.
- UFW inactive; в представленном nft ruleset нет host INPUT restrictions.
  Docker FORWARD/NAT правила не заменяют политику доступа к самому host.
- Сейчас **не production-ready hardening**. Не отключать password/root и не
  включать firewall без резервной консоли/второго проверенного key-only входа.
  Системные политики агентом не менялись, sudo не обходился через Docker.
- Интермиттирующие SSH disconnect/banner timeouts отдельно фиксировались;
  клиентский ServerAliveInterval уменьшен30→10сек. Это не доказательство истечения
  теста или устранения сетевой причины; перед cutover нужна стабильная сессия.

## Build И Сеть

Next15.5.28/React19.3.1, Nest11.2.8/Sharp0.35.5, Node22.23.3. Linux-amd64 image
собран на Mac, на2GB VPS сборки не было. ENV/ключи исключены default-deny context.

Image local config ID:`sha256:2332ecaefa615e0e87e4943732a316174bfdfe3bfbe1678c2186d4a0f64588fe`.
Docker29 remote ID:`sha256:e300c8a43e9f00e23ceec6079366809dca75464ef2231e15af950ac92303b3cd`.
SHA256 всех RootFS layers совпали. Launch configuration совпала после исключения
документированных legacy/nil inspect fields; hash
`652712a168b4f6d1ced5ee50e00dc54789196ceec3768a1538a70c37d786bad6`.
Изменение inspect описано в [Docker deprecations](https://docs.docker.com/engine/deprecated/#non-standard-fields-in-image-inspect).

Web127.0.0.1:18082 и TLS127.0.0.1:8444; API/PG без host ports, internal network.
Monitor без Docker socket, без host secrets; readonly bind только трёх `/proc`
файлов, отдельные state/status directories. Public application ports не открывались.
Реальные Payom/Geoapify keys не вводились. Customer auth/require-phone/mobile flags
в runtime false; внешние provider тесты не выполнялись.

## Проверки Приложения

- Полный browser flow на TARENA: Chromium1440, WebKit375 и390.
- Каталог RU/TJ, две разновидности, корзина/reload, product route и видимая
  нижняя панель, guest checkout, staff Secure-cookie session/reload/admin orders,
  procurement/picker actual weights, RBAC403, courier assignment, logout401.
- Итог каждого тестового заказа:0.9×7 +2.1×9 =25.20сомони; три synthetic заказа.
- Реальная тестовая photo upload через обновлённые Multer/Sharp. Ошибка helper
  `imageUrl` вместо product input `image` исправлена и подтверждена повторным
  PATCH/read, цена не менялась. Первый DR-result с непривязанным фото сохранён,
  не объявлен полным успехом; v2 использует новый snapshot/volume/secrets.
-32 целевых web/native HTTP contract tests на VPS прошли в отдельной временной
  БД, SMS только локальный mock. Runtime flags не включались. Psql-зависимый
  shopping migration suite не устанавливался в app image, покрыт локальным run.
- В репозитории не найден Android/iOS client project. Реальные устройства,
  App Store/Play distribution, Keychain/Keystore и настоящий SMS transport не
  проверены: native API compatibility не равно аттестации мобильного приложения.

TLS отдельно проверен HTTPS-клиентом с **только новым CA этого контура**, hostname
verification и rejectUnauthorized=true: HTTP200, authorized=true, TLS1.3.
CA в системное хранилище Mac не установлен. Browser contexts разрешают внутренний
сертификат только для изолированного теста; это не подтверждение публичного ACME.
WebKit не реальный Safari/iPhone с динамическими системными панелями.

## Backup И DR

Только fresh trusted synthetic schema/data, не старый недоверенный dump.

- Отдельная readonly backup role; pg_dump16 custom format без owners/ACL.
- Parent transaction держит exported snapshot для pg_dump **и SHA256 по строкам**.
  Files копируются после snapshot, в системе immutable uploads; physical deletion
  во время такой процедуры запрещено. Manifest содержит DB/file checksums.
- Active staff/customer/native sessions, OTP и rate buckets исключены из данных.
- Offhost копия на Mac AES-256-GCM, checksum/AEAD проверены; ключи0600 и каталоги0700,
  не выводились в чат/логи/Git. Это **временный private/tmp rehearsal storage**,
  не долговременное независимое production backup-хранилище.
- Восстановление разрешено только в пустую DB/пустой images root. Сверка fingerprints,
  file hashes и empty session tables до запуска API; новый runtime DB password/JWT.
- Первый recovery сохранил data fingerprints, но photo-reference acceptance выявил
  ошибку fixture. Повтор — отдельный `df-tarena-recovery-v2`, не перезапись/удаление v1.

V2 завершён успешно:100 товаров,3 заказа, две разновидности/финальные веса,
25.20сомони по каждому заказу, uploaded photo HTTP200, совпавшие fingerprints,
новая staff session/Secure cookie, scoped-CA HTTPS и SSR catalog. RTO103.21секунды
от остановки source rehearsal до успешных проверок recovery. Затем source
rehearsal автоматически возвращён; recovery-v1/v2 оставлены остановленными.

Это logical DR на **другом пустом Docker volume того же VPS**, с оффхост-копией
на Mac и новыми credentials. Не испытан полный отказ провайдера/другой регион,
большая реальная БД, DNS failover и фактический production RTO.

Hourly backup-scheduler включён, первый scheduled archive реально создан,
readonly DB role не имеет INSERT/DDL/superuser. Защищены совпадающие имена и
overlap lock, ошибка проверок останавливает отдельный fail-closed subprocess;
при ошибке retry через60с, при успехе следующий backup через3600с. Credentials
не передаются в argv, архивы/статус приватны. Автоматической offsite shipping,
долговременной retention/immutable storage и WAL/PITR пока **нет**. Hourly logical
backup не выдаётся за целевой RPO15мин. Проверенная Mac-копия пока ручная/временная.

Команды helpers в [ops/tarena](../ops/tarena) рассчитаны только на trusted synthetic
rehearsal. Restore отказывается перезаписывать существующие DB/files, поэтому
повторный drill требует нового явно выделенного проекта/тома, не force/reset.

## Мониторинг

Лёгкий monitor каждые15с: MemAvailable/CPU/swap/disk, OOM delta, API с DB query,
Web health, возраст последнего backup; bounded metrics rotation и Docker logs2×5MB.
Alerts: RAM<300MiB, disk<15%, CPU>85%, OOM, HTTP failure, backup отсутствует/старше2ч.

Controlled outage нового Web обнаружен и recovery подтверждён, полный цикл20.51с.
Сервис восстановлен в finally. Нет внешних уведомлений, внешнего uptime checker
или гарантии доставки alert владельцу; это остаётся production gate.

## Ресурсы И Нагрузка

Источник: [JSON фактических результатов](tarena-rehearsal-results-20261029.json).
217 monitor samples,20:23–21:21МСК с паузами controlled DR. Интервал15с:
это измеренная выборка, не гарантия отсутствия кратковременных пиков. На машине
одновременно сохранялся прежний private pilot; цифры включают ОС, Docker и оба
контура, а также выполненные contract tests/backup.

| Метрика | Результат |
| --- | ---: |
| Peak MemTotal−MemAvailable всей машины | 1098.28MiB |
| Минимальная MemAvailable | 869.34MiB |
| Максимальный CPU в15с выборке | 60.99% |
| Наблюдавшиеся новые host OOM / runtime auto-restarts | 0 /0 |
| Занято swap | 268KiB, без роста в выборке |
| Свободный диск после сборок/двух restore volumes | 61.12GiB |
| Текущие monitor alerts | нет |

Текущие cgroup peaks после controlled restart не являются историческим пиком
всего теста. Во время остановки monitor были интервалы без sampling. Отдельный
1-секундный SSH sampler не дал пригодного набора; его180с не выдаются за измеренные.

Новая сборка, ограниченный5RPS/40с,200 запросов через Web loopback внутри VPS:
всеHTTP200,429=0,skips=0. p95 API/products27.07ms, categories10.78ms,
SSR/catalog121.20ms, product46.78ms. Сеть клиента/TLS/image requests в этот
прогон не входят, это не SLA. Первые молчащие SSH-пробы оборвались; успешный
повтор использовал keepalive10с и stderr heartbeat без payload.

## Регрессия И Артефакты

874 local workspace tests,32 VPS web/native contract tests,15 ops safety checks,
lint, typecheck, fresh Linux-amd64 build, актуальный npm audit0 прошли.
Временная local test DB удалена; прежние preview/user changes сохранены.
Git push и production deploy не выполнялись.

Скриншоты осмотрены: [mobile product](../apps/web/test-results/tarena-rehearsal-webkit-390/product.png),
[desktop admin](../apps/web/test-results/tarena-rehearsal-chromium-1440/admin-orders.png).
Фото в synthetic Product — намеренный общий test asset, не изменение реальных фото.

## Реальные Данные И Cutover

[Quarantine handoff procedure](QUARANTINE_DATA_HANDOFF.md) подготовлена отдельно.
Никакого экспорта реальных данных/old ENV/keys/binaries, слепого pg_restore или
копирования диска. SHA256 сам по себе не доказывает честность скомпрометированного
источника. Для реального переезда требуется отдельное разрешение, evidence,
reviewed allowlist import и restore drill на реальном утверждённом наборе.

Перед DNS: hardening + console/key-only test, OS/container scan и минимальный
runtime artifact, durable encrypted offsite backup/retention/restore, real-data
reconciliation, публичный HTTPS/renew,
внешний monitoring/alerts, real Safari/native acceptance, write freeze/single writer,
A/AAAA/CAA/TTL review и безопасный rollback только на чистой инфраструктуре.
Новые provider keys/egress whitelist и реальная Payom-проверка нужны перед
включением соответствующих интеграций; guest checkout продолжает работать без SMS.

Текущий статус: **закрытая репетиция принята на synthetic data; public cutover NO-GO**
до перечисленных gates и отдельного разрешения на реальные данные/DNS.

## Действия Владельца

1. Подтвердить срок/продление TARENA и получить резервную web/rescue console.
   Согласовать SSH/firewall hardening с проверенным вторым key-only входом.
2. Выбрать постоянное независимое encrypted backup-хранилище/retention и канал
   внешних alerts/uptime, утвердить RPO/RTO. Private/tmp Mac не долговременный backup.
3. Разрешить evidence/export/quarantine реальных данных отдельно, утвердить
   allowlist/manifest/ответственных и maintenance single-writer window.
4. Согласовать новый публичный сертификат и будущий DNS cutover A/AAAA/CAA/TTL;
   до этого никаких DNS записей не менять. Проверить новый release commit/image scan.
5. Предоставить настоящую iOS/Android test build/repository при наличии приложения
   и принять проверку Safari/iPhone в закрытом доступе. SMS-тест только по
   отдельному номеру/разрешению после подтверждения Payom template/variable.
