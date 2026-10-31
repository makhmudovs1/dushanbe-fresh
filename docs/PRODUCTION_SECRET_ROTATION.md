# Безопасная Ротация Production-Секретов

31 октября2026, МСК. **План, не выполненная ротация.** В этой задаче не
менялись пароли/ключи БД, JWT/OTP secrets, SSH, DNS, restic или внешние доступы.
Предмет: старый скомпрометированный Алматы и любые отдельно раскрытые новые
секреты. Не считать автоматически раскрытым каждый новый секрет TARENA.
Значения секретов, персональные данные и их хеши не включать в отчёт.

## Что Уже Заменено При Миграции

- На TARENA новые DB owner/API/backup пароли, STAFF_JWT_SECRET,
  CUSTOMER_OTP_SECRET, MOBILE_QUOTA_SECRET, restic password, SSH host/client keys,
  TLS/ACME keys. Они не импортированы из Алматы.
- Staff password перевыпущен, старые refresh/customer/native/OTP sessions
  не импортированы. Старые Web/API/PostgreSQL остановлены; fallback туда запрещён.
- Отзыв старых Geoapify/GitHub/DNS/provider credentials и старых сертификатов
  **не подтверждён**. Новая выдача ключа/сертификата сама по себе не отзывает старый.
- Payom JWT до текущего ввода не обнаруживался в старом production ENV.
  Если он раскрывался в другом месте или всё-таки попадал на старый VPS,
  его нужно отозвать; успешный balance200 не доказывает отсутствие утечки.

Сначала владелец отмечает, **какие имена/типы новых секретов раскрывались**,
не присылая значения. Известно раскрытый credential отзывается приоритетно;
восстановление доступности не должно означать повторное принятие украденного ключа.

## Порядок

| Этап | Объект | Действие и условие перехода |
| --- | --- | --- |
| 1 | Внешние кабинеты/восстановление | Проверить почту восстановления, MFA, активные сессии, пароль TARENA/Navju/GitHub; отозвать раскрытые PAT/API/deploy credentials после установки нового минимального доступа |
| 2 | Payom | При подтверждённой утечке JWT отозвать до следующего paid-теста. Если кабинет позволяет два JWT, сначала проверить новый бесплатным balance, затем отозвать старый. Иначе коротко недоступен только необязательный SMS-вход, не guest checkout |
| 3 | Geoapify | Отозвать прежние server/map ключи; server key ограничить новым IP, browser key доменами. Новые значения нужны следующей задаче карты; старые не восстанавливать из ENV/архивов Алматы |
| 4 | Runtime DB | Создать новый минимальный login principal, проверить grants и новый API через него; переключить трафик, затем NOLOGIN старому login и завершить его оставшиеся соединения |
| 5 | Staff JWT/password | Заменить раскрытый JWT secret и нужные staff passwords; отозвать затронутые сессии. Пользовательский сайт не выключается, но необходимый повторный вход сотрудников не скрывать как «бесшовность» |
| 6 | OTP/quota | Сменить при отсутствии активных OTP/paid-пилота либо явно завершить их. Сохранить защитные counters на переходе, не давать новый бюджет из-за нового HMAC secret |
| 7 | Backup роли/owner | Согласованно обновить readonly backup доступ и private pgpass; owner/migrator/bootstrap configs обновить отдельно без restart PostgreSQL |
| 8 | restic | При раскрытом пароле/ключе создать новый repository с новым master key, снять backup и фактически восстановить его; только затем переключить scheduler |
| 9 | Старые TLS/SSH/внешние доступы | Отозвать именно старые сертификаты/авторизации, не действующие новые TARENA; сохранить необходимые incident evidence |

Любые покупки, отзывы, изменения root ENV/roles, сессий и routing требуют
разрешённого операторского окна/подтверждения. Это не автоматический job.

## Без Остановки Сайта

Текущий Caddy2.11.7 запущен `caddy run --config /etc/caddy/Caddyfile --adapter
caddyfile`, без `--resume`, admin API выключен. Можно использовать файловый
graceful reload через SIGUSR1, не открывая порт2019 и не делая `docker restart`.
Условия и ограничения: [официальная документация Caddy](https://caddyserver.com/docs/command-line#signals).
В текущем SMS-пилоте graceful reload также выполнен фактически, PID/StartedAt
proxy не изменились. Перед очередным переключением
перепроверить, что никто не менял config через API и не менял способ запуска.

План для API/Web credential cutover:

1. Проверить свежий encrypted backup и фактическую restore. Владелец принял
   отсутствие offsite для текущего запуска; это остаётся риском, не гарантия DR.
2. Проверить RAM/headroom. Последнее read-only наблюдение: MemAvailable около
   857MiB **до добавления SMS-пилота**. Повторить измерение с учётом пилота.
   При необходимости после согласования остановить только закрытые synthetic
   rehearsal/pilot контейнеры, не удаляя volumes и не трогая production PG.
   Не запускать два полного build на2GiB; использовать уже проверенные images.
3. Подготовить второй private ENV непосредственно на VPS с новыми значениями,
   root:private-service-group0640; не копировать файл на Mac/Git, не выводить в
   stdout/argv/history. Доступный sudo у владельца, обходить его через Docker нельзя.
4. Запустить replacement API на свободном loopback-порту, с той же БД,
   ограниченным pool и memory. Проверить readiness/необходимые read/write grants
   без реальных заказов/SMS. Старый и новый API используют **одну** production БД.
5. Если требуется обновление server-side API URL/секретов Web, прогреть replacement
   Web на втором loopback-порту. Next rewrite manifest может содержать build-time
   API_URL: нельзя предполагать, что один runtime ENV изменит все rewrites.
   Прямой Caddy `/api/v1/*` upstream и server-side Web API_URL должны указывать
   согласованно. Проверить SSR/catalog и authenticated client calls до переключения.
6. Проверить/adapt кандидат Caddy. Сохранить предыдущую **несекретную** config,
   обновить существующий bound-file с сохранением inode и выполнить SIGUSR1.
   Проверять публичные HTTPS readiness, каталог, cookie/refresh и отсутствие
   ошибок во время перехода; PID/StartedAt proxy не должны измениться.
7. Оставить старый API только для завершения in-flight запросов, затем отключить
   его. Отозвать прежние login/keys и закрыть их соединения. Удалять старый login
   до ухода всех потребителей нельзя. Не принимать старый signing secret на
   публичном backend «для совместимости», если он раскрыт.
8. Откат только на чистом TARENA с **другими свежими действительными** credentials,
   той же актуальной БД. Не возвращать скомпрометированные secrets, не откатывать
   БД поверх новых заказов и не включать Алматы.

Если проверенной памяти/второго healthy backend нет, **не заявлять zero downtime**
и не начинать destructive cutover. Согласовать безопасный вариант; не делать
слепой `compose down/up`. Число одновременно живущих процессов не заменяет
проверку готовности, capacity и единой БД.

## Особенности Текущего Кода

- ENV-файл не перечитывается текущим Node-процессом после редактирования.
  `docker restart` также сохраняет прежний container environment; для изменения
  обычного `env_file` нужен новый/recreated container либо явно проверенный
  file-loading entrypoint. SMS-пилот читает новый файл при своём старте.
- `STAFF_JWT_SECRET` один, keyring нет. Refresh staff token непрозрачный,
  SHA256 в БД, от JWT secret не зависит. `staffFetch` при401 делает refresh;
  это помогает ротации обычного ключа, но компрометированные refresh sessions
  всё равно надо отозвать. Reset staff password уже отзывает его refresh sessions
  в одной транзакции, не удаляя заказы/назначения.
- `CUSTOMER_OTP_SECRET` используется не только для OTP, но и для auth-limit keys
  и spent-pilot marker. Его смена без миграции counters обнулит защитный бюджет
  по новому HMAC namespace. Во время разрешённых3paid requests не менять secret,
  pilot IDs или markers ради повторной отправки. При вынужденной ротации
  закончить пилот, сохранить consumed-budget evidence и блокировки до истечения
  соответствующих окон. Активные OTP старого ключа станут непроверяемы.
- Browser/native opaque sessions хранятся SHA256 и не зависят от OTP secret.
  Ротация OTP не требует удаления профилей, адресов, корзин или истории.
  Окна rate-limit, завязанные на MOBILE_QUOTA_SECRET, учитывать аналогично.

## PostgreSQL И Backup

Runtime login можно заменить отдельной login-ролью с теми же ограниченными
grants. Сохранить CONNECT/USAGE, DML и sequence grants, отсутствие доступа к
`_prisma_migrations`, отсутствие superuser/CREATEDB/CREATEROLE/replication.
Если новая login-роль наследует privilege-role, явно проверить нужные role
defaults и default privileges будущих миграций. Не делать `GRANT ... ALL` вслепую.

NOLOGIN запрещает новые подключения, не убивает уже открытые: после ухода
потребителей завершить только sessions старого login, не остальные API/DB
connections. Не передавать пароль в `psql -c`/истории; использовать приватный
интерактивный механизм и проверить SQL logging. [PostgreSQL16 ALTER ROLE](https://www.postgresql.org/docs/16/sql-alterrole.html).

Смена POSTGRES_PASSWORD только в `postgres.env` **не меняет** пароль уже
инициализированной БД. Owner пароль согласовать с `migrator.env`, `bootstrap.env`
и init config; текущие API/backup используют отдельные роли и не должны
переключаться на owner. Ротация не требует перезапуска PostgreSQL.
Backup role/pgpass менять между jobs под scheduler lock; после обновления
обязательно backup+actual isolated restore, а не только успешный login.

`restic key passwd/add/remove` меняет доступ к тому же master key, не защищает
уже скопированный repository, если старый пароль раскрыт. Для компрометации
нужны новый repository/master key и проверенный backup или `restic copy`.
Старую копию не удалять до успешной restore новой и решения о retention.
[Дизайн и модель угроз restic](https://restic.readthedocs.io/en/stable/100_references.html).

## TLS, SSH И Финальное Подтверждение

Новые сертификаты TARENA уже используются. Для отзыва старого сертификата
FirstVDS получить **только public leaf**, сверить fingerprint/SAN/issuer и
выполнить ACME revoke с новым аккаунтом, подтвердив контроль всех SAN. Не
переносить старый private key ради отзыва и не отзывать текущие managed leaves.
[Let's Encrypt: revocation другим авторизованным аккаунтом](https://letsencrypt.org/docs/revoking/).

SSH: новый клиентский ключ добавлять до отзыва раскрытого, подтвердить отдельный
вход и pinned host fingerprint. Пароль ОС менять интерактивно; не закрывать
последнюю SSH-сессию, не менять firewall/порт без безопасного восстановления.
Наличие нового private key на Mac не доказывает утечку его старой копии, если
на VPS были только public authorized_keys и agent forwarding не использовался.

Завершение ротации фиксировать без значений: какие credentials заменены,
старые отозваны, тест нового доступа выполнен, app/DB healthy, backup восстановлен,
сессии отозваны где необходимо, нет новых секретов в Git/logs/CLI/history.
Раскрытые secrets в provider snapshots/evidence считать навсегда раскрытыми,
даже если файл позднее удалён. Evidence не уничтожать вместо отзыва доступа.
