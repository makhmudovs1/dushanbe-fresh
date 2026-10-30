# Бэкапы и Telegram перед production

30 октября 2026 года, МСК. Реальные данные и DNS не переносились. Настроенный
контур `df-tarena-encrypted-backup` обслуживает только синтетическую репетицию.
Это не разрешение направлять старый недоверенный dump в production.

## Что Подготовлено

- `ops/tarena/production-backup.py`: ежедневный PostgreSQL custom dump и uploads,
  readonly DB role, held snapshot для dump и контрольных отпечатков строк.
- restic 0.19.1: шифрование содержимого и метаданных, чтение данных обратно через
  `check --read-data`, manifest SHA256, kernel flock против параллельных запусков.
  Блокировка освобождается ядром и после аварийного завершения worker; scheduler
  не удерживает её во время суточного ожидания.
- Удаление старых копий: 7 daily / 4 weekly / 3 monthly в выделенном репозитории,
  только с `allowPrune=true`; после prune выполняется проверка. Это объединение
  периодов, а не обещание точного числа архивов. Retention не заменяет WORM.
- Исторические business data сохраняются, активные OTP/browser/native/staff
  sessions и rate-limit state в копию не включаются.
- Ошибка не отмечается успехом; status/failure.json сохраняется, повтор через
  10 минут. После успеха следующий запуск через 24 часа. Контейнер перезапускается
  Docker после сбоя; это не тест полного reboot VPS.
- Тестовый репозиторий и новый ключ находятся на TARENA в приватном каталоге
  `/home/adminj0n/df-tarena-backup-20261030`. Секреты 0600; в Git их нет.
  Scheduled backup не получает owner-пароль, доступный только одноразовому restore.

**На одном VPS это не offsite.** До реальных данных нужны независимое хранилище
в Таджикистане и отдельная защищённая копия ключа у владельца. Потеря ключа означает
потерю возможности восстановления. Ежедневный dump означает RPO до 24 часов;
цель RPO15min требует отдельного согласованного WAL/PITR решения.

## Подключение SFTP Или S3

В закрытом серверном `/run/secrets/backup.json` после выбора назначения:

```json
{
  "mode": "production",
  "repository": "s3:https://HOST/BUCKET/df-clean",
  "regionConfirmed": "TJ",
  "independentDestinationApproved": true,
  "host": "127.0.0.1",
  "port": 15432,
  "database": "df_production",
  "user": "df_backup",
  "allowPrune": false
}
```

HOST/BUCKET/DB/port здесь примеры, не созданные сервисы. `TJ` подтверждается
договором/провайдером, не IP-геолокацией и не этим JSON. До проверки назначение
не считается независимым. Production init автоматически запрещён: выделенный
зашифрованный repository создаётся отдельно после утверждения доступа/региона.

- `RESTIC_PASSWORD_FILE` всегда `/run/secrets/restic-password`, новое значение
  вводится на сервере; не хранить пароль в repository, shell arguments или Git.
- DB пароль — только `/run/secrets/backup.pgpass` 0600, readonly роль. Новый backup
  user без DDL/superuser/INSERT; конфигурацию ролей не копировать из Алматы.
- S3: дополнительно смонтировать `/run/secrets/s3.json` 0600 с
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` и при необходимости session/region.
  Ограничить доступ одним bucket/prefix, без прав администратора аккаунта.
- SFTP: `repository=sftp:backup-alias:/srv/df-restic`, новый отдельный SSH-ключ,
  pinned host key и `/run/secrets/backup-ssh-config`: StrictHostKeyChecking yes,
  ForwardAgent no, IdentitiesOnly yes, PasswordAuthentication no. Доступ только
  к выделенному каталогу; не использовать deploy/root ключ.
- Добавить исходящую сеть только backup-контейнеру. Текущий compose подключён
  к internal synthetic network и сам по себе не готов для внешнего S3/SFTP.
- После перенастройки проверить реальный transport, wrong-key rejection,
  `restic check --read-data`, восстановление в новую БД/каталог и manifest.
  Удаление (`allowPrune`) разрешить только после проверки retention dry-run.
- Публичные app-порты не нужны. Независимый retention/WORM на storage стороне
  защищает от удаления копий при компрометации production credentials.

Не запускать этот Compose на реальной БД простым переименованием `df_tarena_test`.
Production требует отдельных volumes/config/roles и принятого migration manifest.
Ссылки: [restic repositories](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html),
[retention](https://restic.readthedocs.io/en/stable/060_forget.html).

## Telegram

Подготовлены `telegram-alert.py`, `alert-agent.py`, `configure-telegram.py`.
Реального токена нет, Telegram profile пока выключен; живые уведомления не проверены.

1. Создать отдельного бота через [официальный BotFather](https://core.telegram.org/bots/tutorial#obtain-your-bot-token),
   отправить `/start` из личного чата или добавить бота в закрытую группу команды.
2. Новый helper может определить chat ID через Bot API `getUpdates`: оставить
   chat ID пустым после отправки `/start`. Выбор разрешён только при одном таком
   чате; несколько получателей не выбираются произвольно. Не открывать URL с
   токеном в браузере, не вставлять токен в curl-команду/чат.
3. В интерактивной SSH-сессии на TARENA создать приватный каталог для тестового
   профиля и выполнить наш helper. Команды не содержат значений секретов:

```sh
install -d -m 700 "$HOME/df-tarena-backup-20261030/telegram"
python3 "$HOME/df-tarena-backup-20261030/ops/configure-telegram.py" "$HOME/df-tarena-backup-20261030/telegram"
```

Helper запросит token/chat ID скрыто и создаст новые 0600-файлы без перезаписи;
сообщение не отправляет. Для окончательного production использовать отдельную
защищённую директорию `/etc/dushanbe-fresh/monitoring`, отдельные read-only mounts.

4. Затем отдельно выполнить тестовое уведомление `telegram-alert.py test` в
   контейнере с только Telegram secrets и исходящей сетью. Получение в чате
   подтверждает владелец. Лишь после этого включить профиль `telegram`.

Агент передаёт только фиксированные operational messages: Web/API health failure,
RAM/disk/CPU, OOM, backup failure/age, stale monitor и recovery. Дедупликация
15 минут; неуспешная отправка не отмечается доставленной. Нет адресов/телефонов,
SQL, cookies, токенов, request URLs или текстов app logs. HTTP200 с `ok=false`
считается ошибкой, redirect запрещён. Telegram не получает клиентские данные.

Текущие health probes замечают HTTP5xx проверяемых endpoints, **не все ошибки
всех запросов**. Ещё нужны агрегированные безопасные метрики reverse proxy/API,
учёт process restarts и независимый внешний uptime checker. Агент на том же
VPS не отправит Telegram при полном отказе VPS/сети. Нельзя объявлять полный
production monitoring завершённым до внешнего failure drill.

## Что Узнать У TARENA

[Официальный тариф](https://tarena.tj/?page_id=1260&lang=en) включает weekly backup,
но не раскрывает независимый fault domain, retention, шифрование и процесс restore.
Это дополнительный слой, не доказанная независимая копия нашей БД.

Запросить письменно:

1. Точные дата/частота/число копий для оплаченного VPS; отчёт последнего успеха.
2. Другой ли физический сервер/storage/rack/площадка и остаются ли все копии в TJ.
3. Доступны ли копии после удаления VPS, компрометации guest/root или аккаунта.
4. Кто может удалить backup, есть ли immutable retention, отдельные credentials,
   шифрование и управление ключами; кто имеет доступ к персональным данным.
5. VM snapshot crash-consistent или quiesced; допустим ли PostgreSQL restore;
   цена/срок/порядок тестового восстановления на **отдельную** VM без перезаписи.
6. Есть ли SFTP/S3 backup storage 10-20GB с отдельным доступом и сколько стоит.
7. Доступ к web/rescue console и процедура её восстановления до SSH hardening.

Оптимально сначала запросить цену отдельного backup storage в TJ, лучше у
независимого оператора. Публичной цены такого storage у TARENA не найдено.
Как запасной бюджетный вариант официальный VPS-20 стоит **120 сомони/месяц**,
на странице указана подготовка сервера **80 сомони**; условия уточнить по договору.
Это ориентир отдельного VPS, не цена managed backup и не покупка. Второй VPS
у того же провайдера не защищает от отказа всего провайдера без подтверждённого
разделения. Никаких услуг в этой работе не заказывалось.

## Дополнение 31 Октября

В отдельном readiness-контуре проверены агрегаты proxy5xx, process restarts,
ограниченное восстановление hung Web и внешний observer с Mac. Агент принимает
timestamp обоих форматов monitor; подготовлены отдельные systemd templates.
Реальный Telegram token пока не вводился, профиль остаётся выключенным.
Постоянный внешний always-on observer ещё не размещён.

Подробности, правильные mounts для будущего контура и оставшиеся launch gates:
[итоговый readiness checklist](PRODUCTION_READINESS_20261031.md).
