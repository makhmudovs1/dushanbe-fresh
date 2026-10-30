# Production-подготовка TARENA: 30 октября

Дата: 30 октября 2026 года, МСК. Владелец подтвердил оплату TARENA, но затем
уточнил: **реальные данные пока не экспортировать, DNS и Алматы не менять**.
Эти ограничения соблюдены. Старый VPS не подключался; никаких SMS/платежей.
Production-миграция целиком ещё не завершена, публичный запуск NO-GO.

## Фактическое Состояние

Read-only проверка TARENA по закреплённому host key выполнена. Данные:
[первичная инвентаризация](tarena-production-preflight-20261030.json),
[итоговые агрегаты](tarena-production-preparation-20261030.json).

- 2 vCPU, 1967.62MiB RAM. В итоговой выборке available984.25MiB, CPU5.47%,
  свободно60.59GiB из78.19GiB. Это моментальная выборка, не нагрузочный peak.
- Новых OOM и рестартов работающего rehearsal/backup не обнаружено. Остановленные
  recovery-v1/v2 контейнеры ожидаемо stopped, их cached health не live failure.
- Новый ежедневный encrypted-backup контейнер: memory peak54.09MiB с момента
  его старта. Измерение не является гарантией для большой реальной БД/retention.
- Web/API/PG репетиции healthy, старый private pilot сохранён. App/TLS порты
  только loopback, PostgreSQL не опубликован; публичный SSH22 не менялся.
- Системный sudo из автоматики недоступен. Новые effective sshd/firewall настройки
  не подтверждены; предыдущий вывод владельца: password SSH разрешён, UFW inactive.
  Rescue console пока не подтверждена. SSH/firewall hardening не выполнялся.
- IPv6 интерфейса: `2a0b:ae80:1:53::94`. Доступность IPv6 извне/HTTPS не проверена;
  наличие адреса не означает готовность добавлять AAAA.

## Что Изменено

1. Отдельные candidate Docker targets API/Web/migrator в
   `ops/tarena/Production.Dockerfile`, сборки Linux/amd64 на Mac, не на2GB VPS.
   Web — Next standalone (opt-in через NEXT_OUTPUT_STANDALONE), API — production
   dependency tree. Runtime non-root, приложение не содержит локальных ENV/ключей.
2. Новые образы не установлены в public production и не заменили rehearsal API/Web.
   Для pnpm9 deploy проверяется совпадение runtime dependency versions с деревом
   frozen build. Исправлена обнаруженная smoke-тестом упаковка Prisma: generated
   client копируется рядом с фактическим pnpm package, не затеняется заглушкой.
3. Next standalone включает часть traced framework dependencies, в том числе
   TypeScript. Проверка «во всём Web нет TypeScript» не прошла; это явно не
   объявляется полностью очищенным от всех developer libraries образом. Финальная
   runtime/SBOM проверка остаётся gate, без удаления traced файлов вслепую.
4. Свежий full npm audit обнаружил GHSA-8g5g-mxqh-grgj в Vite6.4.4. Выполнен
   patch6.4.5; повторный audit: **No known vulnerabilities found**. Уязвимость
   относится к открытому Vite dev server, не к запуску нашего Next production.
   [Официальное описание](https://github.com/advisories/GHSA-8g5g-mxqh-grgj).
5. Read-only inventory и advisory launch gates для export/import/cutover.
   Gate JSON требует ссылки/ответственного/времени, но не заменяет независимый
   review и не даёт разрешение автоматически менять DNS/данные.

Исходный HEAD8bb9e75 и существующие незакоммиченные security/UI изменения сохранены.
Новый reviewed release commit/подпись и согласованный GitHub push ещё нужны;
candidate из рабочего дерева не выдаётся за финальный аттестованный Git release.

## Шифрованные Резервные Копии

Новый отдельный `df-tarena-encrypted-backup`, директория
`/home/adminj0n/df-tarena-backup-20261030`, без public ports. Только наши synthetic
данные, новый restic key на TARENA, приватные0600-файлы, никаких старых секретов.

- Включён ежедневный backup БД и immutable uploads. Для dump и row fingerprints
  удерживается один exported snapshot. Scheduled процесс не получает owner password.
- restic0.19.1; checksum/шифрование и `check --read-data` реально выполнены.
- Создание повторных snapshots и retention7daily/4weekly/3monthly проверены.
  Повторный тест выявил per-path semantics `--latest`: исправлено глобальным
  выбором последнего snapshot и новым regression test. Непрошедший повтор не
  объявлялся успехом, последующие backup/integrity/retention прошли.
- Настоящий restore из encrypted repository в отдельную новую тестовую БД и
  пустой каталог: **100 товаров,3 заказа,1 фото**, fingerprints и file hashes
  совпали, active sessions0. Goods sum75.60: три заказа по25.20.
- Wrong encryption key отвергнут. Первый restore занял3.16с; это небольшая
  synthetic база на том же хосте, не production RTO и не provider failover.
- Ошибка логируется обезличенно, status failure очищается только после успешного
  backup. По итоговому status failure отсутствует, integrityVerified=true.
- Блокировка worker переведена на kernel flock; scheduler отпускает её во время
  ожидания. Проверено освобождение после SIGKILL в тесте и повторный запуск
  отдельного synthetic backup scheduler. Это не reboot всего VPS.

**Offsite пока нет.** Daily локальный encrypted backup не защищает от утраты VPS.
SFTP/S3 конфигурация подготовлена, но реальный transport не проверен: нет назначения
и credentials. Production mode отказывается принимать local repository или
неподтверждённый TJ/independent destination. Ключ на VPS пока не escrow у владельца.
Не отправлялись клиентские данные на Mac или за пределы Таджикистана.

## Мониторинг И Telegram

Resource/health monitor закрытой репетиции продолжает работать. Подготовлены
отдельный Telegram agent, безопасный interactive secret setup, backup failure/age,
CPU/RAM/disk/OOM, Web/API health, stale-monitor и recovery alerts.

Unit tests проверяют ошибку HTTP200/ok=false, приватность secret files,
неизвестные events, дедупликацию, повтор неудачной доставки. Сообщения фиксированные,
без PII, URL запросов, тел логов/SQL или секретов. Telegram-контейнер не получает
DB credentials; профиль выключен до появления токена и принятия живого сообщения.

Не выполнено: настоящая Telegram delivery, независимый внешний uptime checker,
агрегация всех HTTP5xx и process restarts, end-to-end оповещение при потере VPS.
Один agent на VPS не замечает собственную полную недоступность извне.

## Проверки

- Full workspace **874 tests passed** после Vite patch: shared24/Web363/API487,
  с выделенной локальной test DB, не production. Mock SMS, реальных отправок нет.
- Временная локальная test DB и smoke-контейнеры после проверок удалены;
  существующие пользовательские БД/контейнеры не удалялись.
- Lint и typecheck прошли после обновления. Production Linux/amd64 сборка
  Web/API прошла вне TARENA; Next standalone без browser/server secret ENV.
- Ops safety:21 Node checks и8 Python checks, включая kernel-lock release после
  SIGKILL worker. Local runtime smoke прошёл: Prisma query, rewrites, SSR routes
  и static assets; [JSON](tarena-runtime-smoke-20261030.json). Тестовые контейнеры
  удалены, production не использовался.
- Docker Scout scan заблокирован auto-review: возможен внешний egress образа/SBOM
  или derived metadata. Владелец уведомлён, запрошено отдельное согласие.
  Ограничение не обходилось. OS/container CVE scan **не объявляется пройденным**.
- Перезагрузка TARENA не выполнялась; restart policy настроена, но reboot acceptance
  не доказан. Public ACME/renew, реальные Safari/iPhone и Android/iOS не проверялись
  в этом этапе. В репозитории по прежней проверке нет нативного client project.
- Веб browser acceptance29октября относится к прежнему большому rehearsal image,
  не автоматически к новым минимальным runtime-кандидатам.

## DNS И HTTPS

Через публичный Google DNS-over-HTTPS (локальный resolver вернул технический
240.0.0.212) прочитано30октября:

| Запись | Сейчас | Будущее действие только после acceptance |
| --- | --- | --- |
| dushanbefresh.tj A | 91.207.75.174, TTL3600 | 77.95.0.94 после отдельного подтверждения |
| www.dushanbefresh.tj A | 91.207.75.174, TTL3600 | согласовать77.95.0.94 либо CNAMEapex |
| apexAAAA | нет | не добавлять до IPv6 end-to-end проверки |
| apexCAA | нет | новый ACME challenge/renew согласовать отдельно |
| NS | ns1.navjucloud.tj, ns2.navjucloud.tj | не менять nameservers при миграции |

Ни A/AAAA/TTL/TXT/CAA, ни HTTPS действующего сайта не изменялись. На TARENA
только приватный TLS репетиции; публичный доверенный сертификат не выпускался.
Для DNS-01 потребуется отдельный безопасный доступ/разрешение на TXT, без старых
TLS/ACME keys. Доступ к DNS в этой работе не использовался.

## Действия Перед Продолжением

1. Получить у TARENA rescue console и ответы об independent weekly backup,
   отдельном SFTP/S3 storage в TJ, retention и тестовом restore. Готовые вопросы
   и ориентир бюджета находятся в [инструкции](TARENA_BACKUP_MONITORING.md).
2. Создать нового Telegram-бота, выполнить hidden server-only token entry через
   helper, подтвердить получение тестового сообщения. Токен в чат не присылать.
3. Утвердить регион/бюджет независимого storage, escrow encryption key и целевой
   RPO/RTO. Пока не экспортировать реальных клиентов, как уточнил владелец.
4. Подтвердить допустимый container scan, reviewed source release, затем SSH/
   firewall hardening со вторым key-only входом и резервной консолью.
5. После gates отдельно разрешить quarantine/import реальных данных и freeze
   window. Лишь после сверки, настоящего restore и TLS/monitoring acceptance
   запросить новое подтверждение фактического DNS cutover.

Алматы не fallback. При сбое нового production — maintenance или восстановление
проверенной чистой копии на доверенной инфраструктуре, не возврат старого IP.
