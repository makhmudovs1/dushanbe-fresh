# Передача реальных данных из недоверенного VPS

29 октября 2026 года. Процедура подготовлена; разрешения на реальные данные нет,
экспорт со старого VPS в этой репетиции не выполнялся.

## Контуры И Разрешения

1. **Evidence:** snapshot дисков/журналов FirstVDS, immutable encrypted storage,
   отдельный владелец ключа, chain of custody с UTC/МСК. Не загружать в приложение.
2. **Quarantine:** отдельная disposable VM без production secrets, исходящей сети,
   доступа к TARENA production/registry/DNS. Актуальные утилиты из доверенного image.
3. **Clean staging:** схема из reviewed Git migrations, новые роли и credentials;
   принимает только утверждённый экспорт значений и валидированные изображения.
4. **Production:** отдельное разрешение, write freeze, final reconciliation,
   проверенный restore и согласованный DNS cutover. Старый VPS не fallback.

Не соединять эти четыре контура одним shared volume/forwarded SSH agent.
Не использовать `backup.sh`/`restore.sh` репетиции для старого дампа: они рассчитаны
только на наш trusted synthetic snapshot. Marker и SHA256 не доказывают честность
содержимого скомпрометированного сервера.

## Обязательный Handoff Manifest

Для каждого артефакта сохранить без значений PII/секретов:

- incident ticket, источник/том, время snapshot и экспорта, ответственный;
- имя, размер, SHA256 после получения, transport verification, место encrypted copy;
- versions pg_dump/pg_restore/PostgreSQL и источник доверенных client tools;
- перечень таблиц, row counts, schema fingerprint, диапазоны ID/даты,
  Decimal control totals; отдельно список excluded credentials/session tables;
- manifest uploads: нормализованное имя/тип/размер/хеш, ссылки на ProductImage/Product;
- reviewed source/migration checksums, reviewer, одобрение owner, результаты restore.

Хеши подтверждают отсутствие изменения **после фиксации**, но не происхождение
реальных цен/платежей. Сверять с независимыми backup/журналами и владельцем бизнеса.

## Приёмка Базы

- Не исполнять старый SQL, роли, functions/extensions/triggers/event triggers,
  grants/RLS/policies, ownership, `_prisma_migrations` и executable hooks на TARENA.
- Рассмотреть TOC и SQL в quarantine: актуальный `pg_restore --list`/`--file`,
  без доступа к реальным сервисам. Частичный/data-only restore сам по себе не sandbox.
  [Предупреждение PostgreSQL](https://www.postgresql.org/docs/16/app-pgdump.html).
- Утвердить allowlist таблиц/полей и FK-порядок из текущей Prisma-схемы. Экспорт
  значений в нейтральный формат с явными типами, limits и параметризованным импортом.
  Автоматический безопасный импортёр произвольной старой БД здесь не реализован.
- Сохранить Product.id/виды RU/TJ/цены/единицы/quantity step/available и историю.
  Не объединять белый/красный картофель, не воскрешать удалённые товары.
- Сохранить orders/items requested/final weight и snapshot prices; waves,
  procurement, cash, issues, adjustments и audit. Не пересчитывать историю по новым ценам.
- Customer users/cart/favorites/addresses переносить после review с сохранением FK.
  Исключить все действующие browser/native/staff refresh/access/OTP/rate-limit state.
  Staff roles одобрить вручную, пароли/JWT/OTP secrets перевыпустить.
- Перевыпустить раскрытые order tracking bearers с согласованным уведомлением.
  Сроки и обязанность уведомлений оценить с профильным специалистом.
- Сверить row counts и SHA256-отпечатки нормализованных записей, FK/unique/enum,
  Decimal totals и default mappings; unknown настройки или URL/path не импортировать.
  Несовпадение блокирует перенос, не исправляется TRUNCATE/disable constraints/seed.

## Приёмка Файлов

- Не переносить старые public/build/assets, код и конфигурацию. Bundled assets из Git.
- Из uploads принимать только ожидаемые имена и regular files; отклонять symlinks,
  hardlinks/devices, абсолютные пути, `..`, архивные дубликаты, excess size/count.
- Проверить magic/MIME, image dimensions и decompression limits. Декодировать и
  перекодировать актуальным Sharp в sandbox; удалить metadata и executable formats.
- Сверить DB references с file manifest, отсутствие missing files и изменение
  checksums после обоснованного перекодирования. Не подменять чужие Product photos.
- Final DB dump и files manifest должны относиться к согласованному write freeze.
  Для чистой системы с immutable uploads возможен held DB snapshot + copy-after-dump;
  при physical deletion нужен отдельный согласованный механизм files consistency.

## Критерии Go / No-Go

Go требует подписанного manifest, утверждённого allowlist, новых secrets, полного
restore drill в ещё одной пустой БД, read-only проверки реальных данных и отдельного
synthetic checkout/picker/courier flow. Запись открывается только на одном новом
production после smoke/TLS/backup/monitoring acceptance.

No-Go: неизвестные объекты/файлы, несверенные роли/суммы/ID, missing photos,
действующие старые сессии, нет independent backup/key, ошибки восстановления,
неподтверждённый доступ к новому серверу или истёкший тест TARENA.

Связанный runbook: [PRODUCTION_MIGRATION_TARENA.md](PRODUCTION_MIGRATION_TARENA.md).
