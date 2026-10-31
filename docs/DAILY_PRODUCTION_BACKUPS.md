# Ежедневные Резервные Копии TARENA

**Уточнение после cutover31октября:** владелец разрешил текущий запуск без
независимого backup, осознанно приняв риск. Последний local encrypted snapshot
`f2609f18e7bd708eff5699d1e24f2cd4c379bd4d0387799f2c1c6138e69bb4fb`
фактически восстановлен и проверен перед DNS. Подробности:
[MIGRATION_COMPLETED_20261031.md](MIGRATION_COMPLETED_20261031.md).
Ниже описан прежний strict-offsite gate; он временно waived, не выполнен.

## Границы

Репозиторий: `/srv/dushanbe-fresh/backups/local-repository` на TARENA.
Шифрование restic, новый ключ `/etc/dushanbe-fresh/restic-password`.
Это **локальная копия, не независимое хранилище**, не разрешение переключать DNS.
TARENA хранит только два еженедельных снапшота VPS; отдельный backup PostgreSQL
не предоставляет. Больше не запрашивать копирование restic у TARENA.

## Проверено 31 Октября

- Реальные данные уже перенесённого чистого TARENA: 65 Product, 65 фото;
  основная БД после проверки по-прежнему содержит0покупателей/0заказов/0staff sessions.
- Snapshot `a39e3b98b4a072e681d841d236788ab1309328f93820e00efeb67840d4a65c6b`:
  encrypted integrity, все файлы и несессионные строки восстановлены и сверены.
- Завершение **31 октября2026,15:44:43МСК**, весь цикл13,49секунды. `offsite:false`.
- User crontab установлен, содержит ровно один управляемый marker block/entry.
  Проверочный `--scheduled` после успеха пропустил повтор без новой копии.
- Временных worker/restore контейнеров после проверки нет. Web/API/PG healthy,
  API и Web readiness200, OOMKilled=false; на диске свободно58,32GiB.
- Первая попытка backup создала encrypted snapshot, но verifier ожидал запись
  restic lock на readonly repository. Остановлен только собственный verifier,
  режим исправлен на readonly `--no-lock`, добавлен regression test; повторный
  полный цикл прошёл. Первая попытка не объявлялась успешно восстановленной.
- Lint, typecheck и production build прошли; 9daily-backup +8backup-ops +
  5migration-ops +10DNS/TLS tests прошли. DNS/TLS localhost listener проверен
  вне sandbox после его отказа разрешить bind; публичный DNS тест не меняет.

Это проверка текущего initial import, не финального среза ещё работающего Алматы.
Внешнее хранилище не подключено и данные за пределы TARENA в этой работе не
выгружались. Ключ расшифровки отдельно у владельца ещё не подтверждён.

## Что Сохраняется

- Logical dump `df_production` через отдельную SELECT-only роль `df_backup`.
- Полные fingerprint бизнес-таблиц и схемы из доверенных миграций.
- Фото, на которые ссылаются Product/ProductImage/Category в том же срезе БД.
  Уже загруженные фото неизменяемы; незавершённые новые uploads не подмешиваются.
- Manifest SHA256 всех файлов. Отсутствующее/изменённое фото прерывает backup.

Dump, fingerprint и список фото используют один repeatable-read snapshot.
Активные web/mobile sessions, OTP и временные auth limits не восстанавливаются;
после аварийного восстановления потребуется повторный вход. Аккаунты, адреса,
корзины, избранное и заказы входят в бизнес-данные. Старые ENV/ключи с Алматы,
новые app ENV, SSH/ACME private keys в этот backup не включаются.
Bundled assets и приложение восстанавливаются из доверенного Git/image digest.
Новые production secrets генерируются отдельно.

## Проверка Каждой Копии

1. restic подтверждает snapshot ID и выполняет `check --read-data`.
2. Отдельный verifier читает репозиторий **read-only**, расшифровывает точный
   snapshot и сверяет полный manifest/список фото. Из-за read-only используются
   `--no-lock`; параллельный backup предотвращает host flock, pruning выключен.
3. Запускается одноразовый PostgreSQL16 по digest: `--network none`, нет портов,
   данные только во временном tmpfs, отдельные случайные credentials, без ENV
   основного приложения/owner role/production volume.
4. Настоящий `pg_restore --exit-on-error --single-transaction`, сверка всех
   несессионных таблиц по SHA256, проверка отсутствия активных сессий/OTP.
5. Только после этого записывается `restoreVerified:true`. Временная БД и
   расшифрованные рабочие файлы удаляются. Production DB не изменяется.

Backup/verifier ограничен384MiB/1CPU, запускается последовательно с PostgreSQL
restore256MiB/0.75CPU. Docker socket внутрь контейнеров не передаётся.
Cron/controller работает обычным deploy-пользователем, не root. Контейнеры
read-only, без capabilities, с no-new-privileges. Членство deploy в Docker само
по себе имеет root-equivalent полномочия; это уже существующий способ deployment,
не дополнительная выдача привилегий.

## Расписание И Состояние

Контроллер: `/srv/dushanbe-fresh/ops/daily-production-backup.py`.
User crontab проверяет необходимость запуска каждый час в `:30`.
Ежедневная отсечка **21:30 UTC = 00:30 МСК следующего дня = 02:30 Душанбе**.
После перезагрузки/пропуска попытка выполняется в ближайший `:30`. Успешная
проверка повторно не запускается для той же отсечки; максимум три попытки за
период при сбоях. Это RPO до24часов при исправном расписании, **не PITR/WAL**.

```sh
python3 /srv/dushanbe-fresh/ops/daily-production-backup.py --once
python3 /srv/dushanbe-fresh/ops/daily-production-backup.py --install-schedule
cat /srv/dushanbe-fresh/backup-status/daily/result.json
cat /srv/dushanbe-fresh/backup-status/daily/last-success.json
```

JSON содержит только время, ID snapshot, статусы и количества, не строки БД,
номера телефонов или секреты. `result.json` показывает последнюю попытку,
`last-success.json` сохраняет последнюю фактически восстановленную копию даже
после сбоя. Ошибка не считается успехом только из-за наличия dump/snapshot.
Проверять свежесть `completedAt`, не только прежний `restoreVerified`.

Existing crontab сохраняется; controller управляет только своим marker block.
Секреты не находятся в crontab. При остатке меньше5GiB новый запуск отказывается
занимать диск. Автоматические `forget/prune` **выключены**: исходный migration
snapshot и последующие копии не удаляются без отдельного решения о retention.
При росте данных отдельно утвердить retention/ёмкость и внешние уведомления.

## Независимая Копия Перед DNS

Нужен отдельный SFTP/S3 либо offline-носитель **физически в Таджикистане**, вне
дисков обоих VPS, с подтверждённым доступом и разрешением хранить backup.
Не выгружать реальные данные на рабочий Mac/почту/foreign cloud, пока физическое
размещение и правомерность не подтверждены. Даже шифрование не отменяет этого
ограничения владельца. Покупки и отправка заявок провайдерам не выполнялись.

Практичный вариант без второго VPS: небольшой SFTP-аккаунт или компьютер с
внешним диском у доверенного сотрудника в Душанбе. На официальной странице
[Navju Hosting](https://navjucloud.tj/hosting) указан ECO HOST1GiB за75сомони/мес
и SFTP/SSH; это **только кандидат**, не подтверждённое backup-хранилище. До оплаты
нужно письменное подтверждение физического размещения в Таджикистане, отдельного
от VPS оборудования, разрешения backup-only использования и SFTP/лимитов.
Цена/доступность не гарантированы; услуга не заказана.

После появления разрешённого destination:

1. Закрепить SSH host key SFTP или проверить HTTPS endpoint/region S3. Использовать
   отдельный backup-only доступ, не production root/SSH key; секреты вне Git.
2. В согласованное окно без backup/prune скопировать **зашифрованный** repository
   либо `restic copy` в отдельный encrypted repository, не app ENV/private keys.
3. Прочитать snapshot именно с независимого destination, выполнить full read-data,
   получить файлы назад в отдельный restore directory, сверить hashes и фактически
   восстановить в изолированный PostgreSQL. Совпадение одного archive hash
   не заменяет эту проверку.
4. Хранить ключ расшифровки отдельно у владельца и подтвердить его доступность.
   Не печатать ключ в чат/терминальный лог и не класть рядом с repository.
5. Записать receipt с destination/region/snapshot/time/restore evidence, без PII
   и credentials. Только тогда принять offsite gate.

Затем freeze старых writers, финальная синхронизация через quarantine без
seed/TRUNCATE, сверка заказов/связей/фото и backup финального среза. Если появились
новые данные, обновить также независимую копию и повторить restore. После этого
одно подтверждение владельца на A/AAAA, автоматическое HTTPS после DNS и открытие
записей только на TARENA. Алматы не fallback и не второй writer.
