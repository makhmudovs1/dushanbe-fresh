# Production Readiness: 31 Октября 2026

**Решение: закрытые проверки пройдены, публичный запуск пока NO-GO.**
Дата по МСК; timestamps в JSON записаны в UTC, поэтому часть относится к
30 октября UTC. DNS, Алматы, реальные данные и боевые настройки не менялись.
Никаких покупок, платных SMS, платежей или отправок Telegram.

## Область Проверки

На оплаченном TARENA создан отдельный `df-tarena-readiness`, каталог
`/home/adminj0n/df-tarena-readiness-20261031`. Только 100 синтетических товаров,
новые пароли/подписи/volume, пять тестовых заказов. Старые секреты, исполняемые
файлы, TLS/ACME storage и клиентские данные не переносились.

Linux/amd64 API, Next standalone и proxy собраны на Mac, не на 2 GB VPS.
Слои всех четырёх запущенных образов сверены с офлайн-сканированными образами:
[runtime evidence](readiness-runtime-20261031.json). Разница Docker image config ID
между версиями Docker сама по себе не означает смену содержимого; сравнивались
именно ordered RootFS layers.

После проверки новый контур **остановлен**, volumes, логи и evidence сохранены.
Ранние `df-tarena-pilot`, `df-tarena-rehearsal` и scheduled encrypted backup не
останавливались. Не следует одновременно держать несколько копий production
на 2 GB без отдельного расчёта ресурсов.

[Финальная read-only инвентаризация](readiness-poststop-20261031.json): ранние
Web/API/PG rehearsal healthy, encrypted backup integrityVerified=true, failure
status отсутствует. После остановки дополнительного контура MemAvailable1041.61
MiB. Effective SSH/firewall без sudo пока не подтверждены; конфигурация не менялась.

## Контейнеры И Восстановление

| Сервис | Лимит RAM | Проверенные свойства |
| --- | --- | --- |
| NestJS API | 384 MiB, V8 heap192 MiB | non-root, readonly root, cap_drop ALL, no-new-privileges, init |
| Next.js Web | 512 MiB, V8 heap256 MiB | non-root, readonly root, ограниченные tmpfs/cache, cap_drop ALL |
| PostgreSQL16 | 384 MiB | отдельный volume, shared_buffers128 MB, max_connections20 |
| Caddy | 96 MiB | uid1000, readonly root, cap_drop ALL, новый private TLS storage |

Сумма RAM-лимитов 1376 MiB, без ОС и backup worker. Это верхние ограничения,
не фактическое одновременное потребление. Docker допускает дополнительный swap
в размере memory limit; swap не отключён. Логи ограничены ротацией.

API/Web/proxy слушали только loopback:4000/3000/8448. PG опубликован только
на127.0.0.1:15436. Приложения работают в host network с явным loopback bind;
это не network isolation и не замена host firewall. Отдельная `hostlink` bridge
позволяет host-network API достичь loopback PG; одна internal bridge этот путь
блокировала. Сеть/порты проверены на закрытом контуре, не скопированы из Алматы.

API-роль БД не superuser, без createDB/createRole/replication/schemaCREATE.
Owner credentials доступны только bootstrap/отдельному восстановлению, не API.
Время ожидания DB pool/connect/socket ограничено3с, pool5 connections.

Добавлен `GET /api/v1/health/ready`: SELECT1, timeout2с, no-store, generic503
при недоступной БД. Прежний `/health` остаётся liveness, его контракт сохранён.
Секреты/SQL errors в ответ не попадают. Истечение readiness timeout ограничивает
HTTP-ожидание, не является SQL cancellation; DB timeouts заданы отдельно.

Фактические fault drills: [полный результат](readiness-browser-faults-20261031.json).

- SIGKILL основного API/Web процесса: Docker `unless-stopped` поднял каждый
  автоматически; около6.3с с учётом начальной секунды ожидания и polling.
- При pause PG readiness503, liveness200. После immediate stop PG автоматически
  восстановился примерно за6.3с; fingerprints бизнес-таблиц сохранились.
  Exit137 exec-клиента ожидаем при остановке PID1, не критерий потери данных.
- SIGSTOP Web: unhealthy обнаружен; allowlisted watchdog после трёх разнесённых
  наблюдений восстановил сервис. Полное время сбоя68.55с.
- Watchdog ограничен новым проектом/labels, cooldown5мин, максимум2restart/час,
  kernel flock. В приложения не передаётся Docker socket.

**Постоянные systemd timers пока не установлены.** Проверен одноразовый запуск
watchdog, подготовлены `df-readiness-{watchdog,monitor}.service/.timer`.
Docker restart policy не перезапускает просто unhealthy-процесс сама по себе.
Остановка через `docker stop` также намеренно подавляет restart до следующего
старта. Host reboot/daemon restart и намеренный OOM не тестировались: сначала
нужна rescue console. Не выдавать это за полный disaster-recovery acceptance.

## Ресурсы

Замер перед остановкой нового контура, одновременно с ранними тестовыми стеками:

- MemAvailable883.05 MiB, swap used92.04 MiB, свободный диск59.52 GiB.
- CPU14.07% между двумя наблюдениями; это не sustained load и не p95.
- На последнем интервале pswpin/pswpout delta0. За весь этап swap вырос;
  нулевая последняя delta не доказывает отсутствие paging в течение всех тестов.
- OOMKilled=false у четырёх новых контейнеров, актуальные API/Web probes200.
- Cgroup memory peaks в JSON относятся к текущему старту после controlled
  restart, не к историческому пику всего теста или реальной большой БД.

2 GB достаточно для проверенного небольшого synthetic workload с внешней
сборкой, но запас ограничен: оставить один app stack, отслеживать MemAvailable,
swap rate, OOM и backup overlap. Реальный размер БД/нагрузка требуют повторного
замера; этот этап не заменяет [разбор latency](TARENA_LATENCY_20261029.md).

## HTTPS Без DNS Cutover

- Через закрытый SSH-туннель проверен TLS1.3 с новым scoped CA, правильными SAN/SNI
  `localhost` и `dushanbefresh.tj`; wrong-name отвергнут, chain/name verification
  не отключались в строгом TLS-клиенте. CA не установлен в системное доверие.
- Browser contexts допускали только локальный internal certificate; отдельный
  строгий TLS-тест выше исключает подмену проверки просто `ignoreHTTPSErrors`.
- `ops/tarena/PublicCaddyfile` подготовлен и `caddy validate` прошёл в offline
  контейнере. Apex/www, fresh ACME, reverse proxy, trusted loopback forwarding,
  ротация и удаление чувствительных полей access log. Не активирован.
- Не выпускались публичные сертификаты, не проверялись production ACME/renewal,
  внешние80/443, IPv6 или HTTPS из настоящего нативного клиента.

Перед public HTTPS: отдельно разрешить DNS-01 TXT с новым минимальным DNS-token
либо согласовать HTTP-01 во время cutover. Сейчас DNS менять запрещено, поэтому
публичный сертификат без challenge-доступа не выпускать. Не переносить старые
TLS/ACME keys. Проверить apex/www chain/SAN, renewal в staging, Secure cookies,
redirects, origin и CAA. DNS token не давать API/Web.

Rootless private proxy слушал8448; это не доказательство разрешения bind80/443.
При будущем deployment обеспечить минимальное право bind для отдельного proxy
либо согласованную root-owned ingress-службу. Не давать root/capabilities Web/API
и не менять host sysctl вслепую. Проверить firewall IPv4/IPv6 и наружный порт scan
после разрешения, до открытия приложения. Сейчас public listeners не добавлены.

Справка: [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https).

## Telegram И Независимый Мониторинг

Интерактивная запись нового token/chat ID подготовлена в
[инструкции](TARENA_BACKUP_MONITORING.md#telegram). Helper скрывает ввод, создаёт
0600-файлы без перезаписи, не отправляет сообщение. Команда на TARENA:

```sh
install -d -m 700 "$HOME/df-tarena-backup-20261030/telegram"
python3 "$HOME/df-tarena-backup-20261030/ops/configure-telegram.py" "$HOME/df-tarena-backup-20261030/telegram"
```

Токен не вводить в чат, URL браузера, shell arguments или Git. Для окончательного
production нужны отдельные `/etc/dushanbe-fresh/monitoring` и read-only mounts.
Профиль `telegram` выключен, live delivery не проверена. Включать после отдельного
тестового сообщения и подтверждения получения владельцем.

- Host monitor собирает RAM/CPU/swap/disk, state/restarts и безопасные aggregates
 5xx из redacted proxy log. API/Web availability и backup failure/age проверяются
 раздельно. Логи991 тестовых запросов не содержали request/response headers/userID.
- Агент допускает только фиксированные operational events, без PII/log forwarding.
 Проверены ошибочный HTTP200/ok=false, retry, дедупликация и recovery.
 Неудача одного события больше не вызывает повтор уже доставленных событий.
- Поддержаны оба формата timestamp метрик: прежний rehearsal и новый host monitor.
 Для будущего контура монтировать его `state/monitor` как `/monitor:ro`, status
 его backup как `/backup-status:ro`; сейчас существующие mounts не перенастроены.
- `external-monitor.py`, disabled example config и `df-external-monitor.service`
 подготовлены для **другого всегда работающего хоста**, не TARENA. Строгий TLS,
 no-store readiness JSON, интервал60с, уведомление после3ошибок, recovery.
 До `dnsCutoverAccepted=true` скрипт не обращается к текущему домену/Алматы.
- Mac вне VPS через pinned SSH tunnel увидел healthy -> остановленный private
 proxy -> unhealthy -> восстановленный proxy -> healthy. Это проверка логики,
 не постоянный независимый монитор и не тест уведомления при потере всего VPS.

Оставшиеся настройки: external host/service у владельца, отдельный token доступ
монитору, тест потери доступности и доставки Telegram. Ничего не покупалось.
Не заявлять production monitoring завершённым до этих шагов.

## Браузеры И Клиенты

Пять полных acceptance flows на минимальных новых runtime images:
Chromium1440, WebKit375/390/430, Chromium mobile390. Каталог RU/TJ, cart reload,
product footer, guest checkout, staff Secure cookie/reload, procurement, picker
RBAC403, courier assignment, logout401 и настоящий тестовый photo upload.
Две разновидности и actual weights0.9x7 + 2.1x9 дали25.20 за товары в каждом
тестовом заказе. Реальная SMS-авторизация не включалась и не проверялась живой SMS.

Скриншоты визуально проверены, не только DOM assertions:

- `apps/web/test-results/tarena-readiness-webkit-390/product.png`
- `apps/web/test-results/tarena-readiness-chromium-1440/admin-orders.png`

WebKit emulation не равна настоящему Safari/iPhone с динамическими панелями.
Firefox executable отсутствует, тест не выполнялся. In-app Browser недоступен,
использован установленный Playwright. Native client project отсутствует в этом
репозитории; server-side mobile session/refresh контракты покрыты общей API suite,
но release Android/iOS/Universal Links/keychain/CORS/expiry требует device acceptance
на HTTPS после включения нужных flags. Новое приложение не разрабатывалось.

## Безопасность Образов

Workspace `pnpm security:audit`: **No known vulnerabilities found**. Это не
результат проверки ОС/Go/бинарников.

Trivy0.76.1 и advisory DB получены отдельно; сами Docker archives сканировались
`--network none --offline-scan`, без Docker socket, проекта или ключей в online
контейнере. Образы/SBOM не отправлялись наружу, заблокированный Scout не запускался.

| Образ после hardening | Critical | High | Evidence |
| --- | --- | --- | --- |
| API | 1 | 56 | [JSON](container-api-hardened-20261031.json) |
| Web | 1 | 56 | [JSON](container-web-hardened-20261031.json) |
| PostgreSQL | 4 | 94 | [JSON](container-postgres-20261031.json) |
| Proxy | 0 | 7 | [JSON](container-proxy-hardened-20261031.json) |

Это scanner findings, не число подтверждённых удалённых exploits. Удалены
ненужные runtime global npm/Corepack (минус10High на API/Web), обновлены Alpine
packages, из proxy удалены curl/libcurl и лишние dependencies (Critical1 ->0).
Caddy file capability снята в образе, чтобы не ломать cap_drop ALL/non-root запуск.

Оставшееся нельзя игнорировать по одному severity:

- Node/PG zlib `CVE-2023-45853`: Debian описывает неуязвимость bookworm binary
  zlib1g к minizip source path. Требуется формальная applicability запись для
  конкретного package/version, не глобальное исключение всего zlib.
  [Первичный vendor tracker](https://security-tracker.debian.org/tracker/CVE-2023-45853).
- PG: libsqlite3 `CVE-2025-7458`, libxml2 `CVE-2026-6653`; scanner не указывает
  fixed Debian version. Уязвимости Go stdlib включают `CVE-2025-68121` в gosu;
  путь utility не равен HTTP PostgreSQL server, но требует reachability review.
- Caddy: Go stdlib1.26.8, x/net0.59.0, go-jose/v4 4.1.5 и v3. Обновить до
  проверенного upstream image/build с исправлениями либо документировать
  неприменимость конкретного кода. Не форкать Go dependencies вслепую.

**Runtime CVE gate открыт.** Нет blanket ignore/waiver. Перед public launch
нужны remediation/проверка применимости и повтор offline scan + regression.
Оригинальные counts сохранены рядом, результаты не замаскированы.

## Итоговые Проверки

- Workspace877 tests passed: shared24 + Web363 + API490, выделенная локальная
  тестовая БД. Новые readiness-тесты: DB error, timeout, успешный запрос.
  Только созданная этой проверкой локальная БД после тестов удалена.
- Ops34 checks passed: Node21 + Python backup8 + readiness5.
- Lint, typecheck, production Linux/amd64 builds API/Web/proxy прошли;
  `git diff --check`, Caddy validate, syntax checks ops прошли.
- Synthetic encrypted backup/restore предыдущего этапа сохраняется:
  [результаты](PRODUCTION_PREPARATION_20261030.md#шифрованные-резервные-копии).
  Это проверка на малой тестовой БД того же хоста, не независимый real-data DR.
- Reviewed release commit/image attestation пока не сформированы: текущий
  candidate построен из рабочего дерева с предыдущими security/UI изменениями.
  Автоматически не коммитились и не откатывались чужие изменения.

## Checklist Перед Запуском

- [x] Отдельные synthetic data/volumes и новые секреты.
- [x] Внешняя сборка, проверенные runtime layers и loopback-only приложение.
- [x] DB readiness, crash recovery, WAL restart/data fingerprints.
- [x] Лимиты/cgroup, least-privilege API DB role, readonly API/Web/proxy.
- [x] RU/TJ, guest checkout, cart, admin/picker/courier,5browser configurations.
- [x] Закрытый strict TLS/SNI и inactive public HTTPS configuration.
- [x] Подготовлены Telegram, external observer, bounded watchdog и их tests.
- [ ] Rescue/web console и независимый вход при SSH/firewall ошибке.
- [ ] SSH/firewall IPv4/IPv6 hardening с владельцем, вторым key-only сеансом.
- [ ] Runtime CVE remediation/applicability review и repeat scan.
- [ ] Reviewed trusted Git release, digest pinning, provenance/rollback images.
- [ ] Независимое TJ backup storage, escrow key, принятые RPO/RTO/restore drill.
- [ ] Реальные Telegram test/recovery и always-on monitor вне TARENA.
- [ ] Авторизованное включение persistent monitor/watchdog и host reboot drill.
- [ ] Новые production secrets/role grants, provider restrictions, Payom off.
- [ ] Разрешённые quarantine export/import + сверка БД/файлов, без старых secrets.
- [ ] Fresh public TLS, ACME renew, origin/cookies, внешние80/443/IPv6 acceptance.
- [ ] Настоящие Safari/iOS/Android и заявленные native release acceptance.
- [ ] Maintenance/single writer/final backup, отдельное разрешение на DNS cutover.

До выполнения этих gates не включать публичный новый production. Не направлять
DNS обратно в скомпрометированный Алматы как способ отката.
