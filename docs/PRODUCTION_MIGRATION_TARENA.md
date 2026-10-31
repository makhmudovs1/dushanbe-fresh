# Безопасная миграция production на TARENA

Актуальный статус 31 октября: владелец разрешил перенос реальных данных через
карантин до получения ответа о независимом backup. Первый перенос выполнен;
DNS по-прежнему старый. Обязательная независимая копия нужна **до cutover**, а не
для блокировки всей закрытой подготовки. Telegram и дополнительные устройства
владельцем отложены. Подробности, результаты и незавершённые условия:
[MIGRATION_PROGRESS_20261031.md](MIGRATION_PROGRESS_20261031.md).
Ниже сохранён исходный runbook; предыдущие запреты/числа описывают прежний этап,
а не отменяют более поздние разрешения владельца.

Обновление30октября: TARENA оплачен. После уточнения владелец пока запретил
экспорт реальных данных и изменения DNS/Алматы. Подготовлены encrypted daily
backup/restore на synthetic data и Telegram integration; permanent offsite,
rescue console и public cutover ещё не приняты. См.
[текущий отчёт](PRODUCTION_PREPARATION_20261030.md).

Подготовлено 29 октября 2026 года, МСК. **Это runbook, не разрешение на перенос.**
DNS, реальные данные, старые сервисы и production ENV в этой работе не меняются.
TARENA `77.95.0.94` остаётся основным кандидатом. Закрытый pilot не production.

## 1. Модель Восстановления

Источник в Алматы `91.207.75.174` считаем недоверенным. Это не обычный перенос VM.
Нельзя клонировать диск, Docker volumes/images, PostgreSQL data directory,
`node_modules`, `.next`, исполняемые файлы, `.env`, SSH/ACME keys, cron/systemd,
конфигурации безопасности или прежние пароли на новый production.

Сохранение доказательств и перенос бизнес-данных — два разных процесса:
evidence неизменяемо хранится отдельно, в приложение попадают только проверенные
данные в схеме из доверенных миграций. План расследования:
[INCIDENT_RESPONSE_20261029.md](INCIDENT_RESPONSE_20261029.md).

## 2. Условия Начала И Ответственные

До первого копирования владелец письменно подтверждает:

1. Окно maintenance, ответственного за cutover, сборщиков/курьеров и поддержку.
2. Разрешение экспортировать реальные данные в отдельный защищённый quarantine.
3. Независимое backup-хранилище, его регион, доступ и бюджет; ключ расшифровки
   вне VPS. Предлагаемые цели: RPO 15 минут с WAL, RTO до 2 часов после rehearsal.
   Это цели, не достигнутые показатели. Только nightly dump означает RPO до 24 ч.
4. Сохранение дискового snapshot и журналов FirstVDS до containment/удаления.
5. Перечень доменов A/AAAA/CNAME, DNS-провайдера, текущих TTL, CAA/DNSSEC, MFA.
6. Выбранный доверенный source commit, проверку GitHub audit и новых доступов.

Не считать старую проверку «0 заказов» актуальной: инвентаризировать состояние
заново при разрешённом экспорте, не выводя PII. Не заполнять боевой каталог seed.

## 3. Подготовить Чистый Production-Контур

- Проверить host fingerprint TARENA по независимому каналу; новый публичный
  SSH-ключ, без forwarding. Подтверждённые владельцем входы `77.95.0.98` сами по
  себе не признак атаки. Актуализировать OS/security updates и доступ провайдера.
- Отдельные service/deploy identities, новые пароли; SSH по ключам только из
  разрешённых сетей. Менять sshd/firewall только с резервным проверенным каналом,
  тестируя вторую сессию до закрытия первой. Docker group = полномочия root.
- Пилот не превращать в production изменением имени БД. Отдельные project name,
  volumes, директории и credentials; synthetic users/orders не переносить.
- Публичны только Caddy 80/443; SSH ограничен. PostgreSQL/API/Web не публикуются
  в Internet. Проверять IPv4 **и IPv6**, реальные Docker port bindings и доступ
  с внешнего узла; одного UFW недостаточно при Docker NAT.
- Для сохранения текущей модели `CUSTOMER_TRUST_LOCAL_PROXY` рекомендуемый
  первый production-вариант: Caddy на host, Web/API в Linux host-network с
  **явными loopback bind** 127.0.0.1:3000/4000, PostgreSQL с публикацией только
  127.0.0.1:5432. Это требует отдельного reviewed production Compose/unit, не
  запуска `pilot.compose.yml`. Политики контейнеров и bind проверить на месте.
- Не включать trust proxy на `API_HOST=0.0.0.0`: текущая проверка намеренно
  отвергает это. При другой сетевой архитектуре сначала отдельно тестировать
  доверенные proxy hops/подмену X-Forwarded-For; не ослаблять проверку ради запуска.
- Runtime API без superuser/CREATEDB/CREATEROLE/replication и владения схемой.
  Отдельные bootstrap/migrator/backup роли; у API нет пароля owner/migrator.
- Для 2 GB: сборка только вне VPS; стартовые бюджеты PG384/API384/Web512/proxy96
  MiB, connection pool5, max_connections20, shared_buffers128MB. Повторить
  измерение уже на исправленном image; старый pilot benchmark не аттестация нового.
- Мониторинг MemAvailable, cgroup OOM, рестартов, CPU steal, disk/inodes, WAL,
  slow queries, HTTP p95/5xx, срока TLS и возраста последнего успешного backup.
  Логи с ротацией; без cookie, Authorization, OTP, содержимого адресов и tracking URLs.

## 4. Доверенная Сборка

1. Зафиксировать source commit, lockfile, Node 22.23.3 и platform linux/amd64.
   Собрать на доверенном CI/Mac, пройти lint/typecheck/tests/build и npm audit.
2. Контекст `.dockerignore` — allowlist исходников/публичных assets: секретные
   ENV, старые dumps и локальные build-каталоги туда не входят. Проверить это
   дополнительно по файловому списку готового image.
3. Зафиксировать image digest, SBOM/версии, результаты OS/container scan. Нулевой
   npm audit не проверяет Debian, Node binary, PostgreSQL/Caddy и конфигурацию.
4. Текущий Dockerfile пилота включает инструменты разработки: он подходит для
   закрытого rehearsal, но перед public rollout выделить минимальный runtime
   artifact либо явно принять/зафиксировать поверхность атаки. Нет Docker socket
   и host secrets в app mounts, пользователь non-root, no-new-privileges, лимиты.
5. `API_URL` влияет на Next rewrites **во время build**. Для описанного loopback
   production собрать с `http://127.0.0.1:4000/api/v1`, а не pilot `http://api:4000`.
   Server Geoapify key только runtime; отдельный public tiles key — build-time,
   ограниченный доменом. Не передавать server key через ARG/NEXT_PUBLIC.
6. Копировать только новый проверенный image. Старый production image запрещён
   даже для отката. Закрытый новый rehearsal на TARENA обновлён и проверен:
   [отчёт](TARENA_REHEARSAL_20261029.md). Реальное production не менялось.

## 5. Новые Секреты И Сессии

Создать с нуля `/etc/dushanbe-fresh/app.env`, права 0600/root или минимальной
service-группы 0640. Не выполнять `source` недоверенного старого ENV. Генерировать
random secrets непосредственно на чистом хосте через проверенный helper с
эксклюзивным созданием и приватной записью, без `echo`, shell tracing и аргументов
команд. Редактировать через `sudoedit`; содержимое не попадает в чат/логи/Git.

| Параметры | Действие |
| --- | --- |
| DATABASE_URL / owner / migrator / backup | Новые независимые пароли и минимальные роли |
| STAFF_JWT_SECRET | Новый random >=32 bytes, отозвать старые refresh/access sessions |
| CUSTOMER_OTP_SECRET / MOBILE_QUOTA_SECRET | Новые независимые random secrets; OTP/session state не импортировать |
| Geoapify server/tile | Перевыпустить затронутые ключи; server restrict новый egress IP, tile restrict origins/referrers |
| Payom token | Перевыпустить, если был на старом VPS; новый IP whitelist только после проверки исходящего IPv4 API |
| GitHub/registry/deploy/backup/DNS | Новые ограниченные credentials, MFA; отозвать затронутые по incident inventory |
| SSH/TLS/ACME | Новые host/client/ACME/private keys; не копировать старые |
| WEB_ORIGIN / API_HOST / PRODUCT_IMAGES_DIR | Заполнить заново из новой архитектуры, не секретами из старого файла |

`CUSTOMER_AUTH_ENABLED=false`, `CUSTOMER_REQUIRE_PHONE=false`,
`MOBILE_CUSTOMER_API_ENABLED=false` до отдельного принятия SMS/native-проверки.
Sender DFRESH и URL известны, UUID/имя переменной не выдумывать. Не отправлять
платные SMS при migration smoke. `CUSTOMER_TRUST_LOCAL_PROXY` включать только
после network/header проверки. Перепроверить staff Secure cookie через HTTPS.

Из данных исключить активные `refresh_sessions`, `customer_sessions`,
`customer_otp_challenges`, `customer_auth_limits`, `mobile_customer_sessions`,
`mobile_refresh_tokens`, `mobile_api_limits`. Обнуление сессий — намеренный logout,
не потеря корзин/адресов. Сохранить customer users/cart/favorites/addresses после
review. Staff roles сверить с владельцем, passwords перевыпустить. Исторический
audit сохранить без превращения его payload в исполняемые настройки.
Bearers `orders.public_tracking_token` считать затронутыми: согласовать новые
tracking tokens и уведомление клиентов, не переносить раскрытые ссылки как доступ.

## 6. Экспорт И Quarantine

1. У FirstVDS сохранить forensic snapshot/журналы с временем UTC/МСК и retention.
   Evidence с секретами шифровать и хранить отдельно с immutable/WORM копией.
2. Через разрешённый канал получить логический consistent backup и набор uploads.
   Утилиты и канал доверенные, SSH без agent forwarding. Не запускать старые
   экспортные shell scripts, контейнеры или исполняемые файлы на чистой системе.
3. В экспортное окно остановить **все** записи согласованным maintenance: checkout,
   staff/picker/courier, фоновые задания, API старых клиентов, административные
   загрузки. `pg_dump` consistent только для БД, не синхронизирует файлы/uploads.
4. Получить final dump + manifest файлов/размеров/SHA256 и время freeze; после
   freeze пересчитать counts/Decimal totals, убедиться в отсутствии новых записей.
   Один read-only UI или переключение DNS не гарантируют write freeze.
5. Архивы не распаковывать от root: reject symlinks/hardlinks/devices/absolute
   paths/`..`, лимиты количества/размера/decompression. Данные не отправлять в Git.

PostgreSQL предупреждает: dump из недоверенного superuser может исполнять код
**даже при частичном восстановлении**. `--data-only --no-owner --no-acl` не являются
песочницей. Не восстанавливать исходный dump непосредственно в новую production:
[официальная документация](https://www.postgresql.org/docs/16/app-pgdump.html).

В изолированной disposable VM без секретов/сети рассмотреть TOC и SQL через
актуальные `pg_restore --list`/`--file`. Сравнить схему с миграциями: функции,
extensions, triggers, policies, grants, ownership, event triggers, DDL/метакоманды
и `_prisma_migrations` не доверять. Старые roles/hashes/pg_dumpall globals не импортировать.
Для переноса подготовить явный allowlist таблиц/полей и экспорт значений в
нейтральный формат, затем **параметризованно** загрузить в новую доверенную схему.
Даже этот этап проходит review и отдельный rehearsal; готового универсального
«безопасного импортера» сейчас нет. Нельзя заявлять, что любой dump очищен.

## 7. Что Переносить

- Сохранить Product.id, RU/TJ, категорию/иерархию, доступность, цены, единицы,
  min/step, price history и images. Не возрождать удалённые яблоки/другие Product.
- Сохранить legacy product_quality_options и снимки order_items только для чтения.
  Разные Product.id не объединять, requested/final quantity и Decimal totals
  сохранить точно. Не делать пересчёт всей истории по текущим ценам.
- Orders/items, delivery_slots/waves/wave_items, procurement, user/customer
  связи, адреса/координаты, replacements, issues, adjustments, cash/shifts и audit.
  Проверять FK, enum/status, timestamps/timezone, UUID/ID и уникальность.
- App settings и delivery polygon — только валидированные известные keys. Отдельно
  сверить график/fees/default staff mappings; данные не должны включать произвольный
  URL/file path/код в конфигурацию. Отключённую зону самовольно не включать.
- Только нужные product images из `PRODUCT_IMAGES_DIR`: сверить с DB manifest,
  проверить magic/MIME/размер/декодирование актуальным Sharp в quarantine с лимитами,
  при необходимости безопасно перекодировать. Не переносить файлы по расширению
  вслепую и не копировать `public` из старой сборки. Публичные bundled assets из Git.
- Покупательские shopping data сохранить, а не удалять вместе с сессиями.
  Старые client localStorage корзины обслуживает существующая explicit legacy-resolution.

Порядок вставки определяется FK доверенной Prisma-схемы. Упорядочить справочники,
users/customers/categories/products, затем slots/waves/orders/items и связанные
операции. FK/triggers/durability не отключать ради быстрого импорта. Не применять
`prisma migrate reset`, seed, глобальный TRUNCATE или force на production.

## 8. Backup И Проверка Восстановления

До cutover rehearsal выполнить на отдельном закрытом контуре:

1. Создать новую БД из всех 15 доверенных миграций (актуальное число перепроверить
   перед cutover), импортировать только reviewed данные и валидированные files.
2. Сверить counts каждого allowlisted relation, FK/ID, суммы Decimal заказов,
   закупок/кассы, две разновидности, final weights, фото по manifest SHA256.
3. Проверить каталог RU/TJ, guest cart/checkout, address+polygon, staff RBAC,
   procurement/picker/courier, final goods 25.20 в отдельном синтетическом сценарии.
   Реальные заказы smoke-тестом не создавать и SMS не отправлять.
4. Backup уже **чистого** rehearsal/production состояния: encrypted logical dumps
   + uploads manifest; при RPO15min настроить PG base backup/WAL archiving отдельным
   least-privilege tool/account. Не писать backup только на тот же VPS.
5. Восстановить backup в **ещё одну** пустую БД с другими credentials и отдельным
   files root, без доступа к production API/Payom. Проверить тот же manifest и
   бизнес-инварианты, измерить RTO и возраст restore point. Успех upload backup
   или `pg_restore --list` не считается проверкой восстановления.
6. Предлагаемая retention: 7 daily / 4 weekly / 3 monthly, с ограничениями PII
   и бюджета; immutable копия. Ключ расшифровки и break-glass доступ хранить отдельно,
   регулярно проверять доступ владельца и восстановление после ротации ключей.

В этой работе реальные dumps не переносились, production restore rehearsal
**не выполнен**. Его успешный протокол с контрольными суммами — launch gate.
Закрытый trusted synthetic restore из encrypted offhost-копии на другой пустой
том того же VPS выполнен за103.21с; это не подтверждение RTO реального набора
или отказа провайдера. См. [результаты репетиции](TARENA_REHEARSAL_20261029.md).

## 9. HTTPS До DNS Переключения

- Новый Caddy/ACME storage и новые private keys. Проверить CAA и способы challenge.
  Предпочтительно получить сертификат через DNS-01 с отдельным минимальным token,
  после разрешения на TXT-записи, без изменения A/AAAA. DNS token не хранить в Web/API.
- Если DNS-01 недоступен: staging ACME rehearsal и согласованное окно HTTP-01 после
  A/AAAA cutover; предусмотреть задержку выдачи. Self-signed pilot не готовый HTTPS.
- До открытия public доступа тестировать `curl --resolve`/локальным hosts или
  SSH-туннелем и правильным Host/SNI. Проверить цепочку, SAN, TLS renew, cookies,
  origin/redirects, canonical URLs, ограничения provider keys. Не использовать `-k`
  как критерий production TLS. Не переносить прежние сертификаты из компрометации.
- Логи без query и чувствительных путей. Не менять HSTS preload/includeSubDomains
  одновременно с переездом. Не копировать старую конфигурацию Caddy целиком.

Справка: [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https).

## 10. Cutover — Только По Отдельному Подтверждению

1. После rehearsal согласовать TTL300 заранее и дождаться прежнего TTL; **сейчас
   не менять**. Снять независимую копию DNS zone и список A/AAAA/www/CDN records.
2. Объявить maintenance; подтвердить write freeze старого API/checkout/staff.
   Зафиксировать final dump/files/manifest, утверждённый импорт, restore point.
3. Проверить новый production в закрытом режиме, DB grants, новые secrets,
   feature flags false, корректный HTTPS и backup. Полноценный staff login/reload,
   read-only реальные orders и синтетический полный flow только в отдельной БД.
4. Перевести A на77.95.0.94; AAAA только на **проверенный** TARENA IPv6 или согласованно
   убрать прежний AAAA, иначе часть клиентов уйдёт на старую систему. Проверить www,
   CNAME/CDN, authoritative и несколько recursive resolvers. MX/TXT не затрагивать.
5. До завершения окна старый IP не должен принимать записи даже у клиентов с
   кешем DNS. Не проксировать новые секреты/данные через скомпрометированный хост.
6. Открыть запись на **одном** новом production только после принятия smoke.
   Первые 30–60 минут наблюдать ошибки/p95, orders/cash consistency, RAM/disk,
   затем24ч/72ч. Не удалять старую VM и evidence автоматически по таймеру.

## 11. Откат Без Возврата К Скомпрометированному Хосту

- Держать две **новые проверенные** версии image на чистой инфраструктуре;
  snapshot/backup чистой БД перед release. Приложение и схема должны быть обратно
  совместимы; в текущем security update schema migrations не добавлены.
- До открытия записи: оставить maintenance, откатить image на чистом TARENA либо
  восстановить rehearsal backup в отдельную чистую БД и повторить проверки.
- После открытия записи: сначала закрыть новые записи и сохранить fresh backup/
  uploads/WAL; переключить совместимый image с текущей БД. Если нужен DB restore,
  сначала сверить/перенести новые orders/cash/операции и согласовать RPO. Нельзя
  просто потерять новые заказы восстановлением старого dump.
- При сбое TARENA: standby у доверенного провайдера/чистый maintenance, затем
  восстановление последней **чистой** копии и согласованный DNS failover.
- **Возврат A/AAAA на старый FirstVDS не является безопасным rollback.** Старый
  сервер сохраняется для расследования/экспорта, не как доверенный резерв.
- Критерии остановки: рост5xx/HTTP429/неверные суммы, потеря FK/фото, auth/RBAC
  regression, OOM/restarts, дисковое давление, нет проверенного backup/TLS.

## 12. Launch Gates

| Проверка | Статус на подготовке |
| --- | --- |
| Исправления npm-зависимостей | Развёрнуты только в закрытом новом rehearsal, audit0 |
| 2 GB capacity | Новая сборка проверена synthetic5RPS; peak всей машины~1098MiB |
| Безопасный production Compose/OS/container scan | Отдельная проверка перед launch |
| Evidence / утверждённый экспорт и sanitization | Не выполнены этой работой |
| Реальные данные + files reconciliation | Не переносились |
| Backup destination / restore drill / RPO/RTO | Synthetic restore прошёл103.21с; permanent offsite/WAL/real-data drill ещё нужны |
| Ротация всех затронутых секретов | Требует разрешения, не копирования старых |
| HTTPS/SNI/renew + A/AAAA cutover | Private CA/TLS1.3 прошёл; public ACME/renew/DNS не выполнялись |
| Старый сервер | Не изменён и не выключен |

Решение сейчас: **закрытый candidate rehearsal прошёл на synthetic data; публичный
production cutover пока NO-GO**, до выполнения перечисленных gates и разрешения.

## 13. Дополнительный Readiness Этап 31 Октября

В отдельном закрытом контуре проверены минимальные runtime images, DB readiness,
process/WAL crash recovery, bounded watchdog,5browser configurations и strict
private TLS/SNI. Контур после проверки остановлен с сохранением evidence.
DNS, реальные данные, старый VPS и публичный HTTPS не менялись.

[Отчёт и обновлённый checklist](PRODUCTION_READINESS_20261031.md),
[измерения](readiness-runtime-20261031.json),
[browser/TLS/fault evidence](readiness-browser-faults-20261031.json).
Офлайн container scan теперь выполнен без передачи образов/SBOM наружу,
но оставшиеся OS/Go findings требуют remediation/applicability review.
Rescue console, offsite, постоянный external monitor и public ACME остаются gates.
