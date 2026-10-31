# Production На TARENA

## Результат

31 октября2026 **16:49:57МСК** открыт production на **77.95.0.94**.
`dushanbefresh.tj` и `www.dushanbefresh.tj` указывают на TARENA. Две A-записи
изменил владелец после успешной финальной сверки. Авторитетные Navju NS и
Google/Cloudflare DoH подтвердили новый IP, AAAA отсутствуют. Фактический TTL
у NS3600, поэтому отдельные старые recursive caches могут жить до часа.
Остальные записи/услуги не менялись и не покупались.

Снаружи оба HTTPS API вернули200, `status:ok`, `database:ok`. Peer SHA256
совпал с новыми managed сертификатами именно TARENA:

- apex: `a122150cb3718e00ad2e8e4d04ef4d509d6163b9ca26b6e036e1f18975ea2fd2`
- www: `cc586e4a180fb95ed68aadaa3600b135e7e5466cd46543672d3731052e7f38fe`

Caddy работает с native ACME и постоянным `/data`. После restart с public
config реально обслуживаются managed leaf для обоих имён. Ручные TXT каждые
90дней не нужны, bootstrap private key не копировался со старого VPS.
Web/API/PG остаются с прежними проверенными memory limits и private backend
binds; через Интернет открыт HTTPS proxy, а не PostgreSQL/API4000.

## Последний Срез И Сверка

- Старые Web/API владелец остановил и отключил при boot в **16:17:36МСК**.
  Source DB `default_transaction_read_only=on`, прочих DB clients0.
- Финальный repeatable-read export завершён **16:19:02МСК**, напрямую со
  старого источника в отдельный quarantine TARENA. Данные не проходили через Mac.
- SHA256 neutral bundle:
  `9e788c4c5b6a57a2453314e861868babb75ebd9bd7118e329fa1b95d44dd6425`.
- Вновь выданный шестичасовой ключ был только deploy/read-only forced command,
  `from=77.95.0.94`, без shell/forwarding/root. После экспорта доступ отозван,
  приватный ключ удалён. Старый сервер не получил доступ к TARENA.
- **26 бизнес-моделей сверены** с уже импортированным срезом и readonly target.
  С момента initial import исходные бизнес-данные/фото не изменились, поэтому
  повторного импорта, перезаписи таблиц, seed/TRUNCATE не потребовалось.
- Сохранены65Product,6Category,63ProductImage rows,65фото,1сотрудник,
  исторические разновидности/настройки/цены. **В источнике0покупателей,
  0адресов,0заказов/позиций**; эти данные не пропущены, их отсутствие проверено.
- Все78исходных DeliverySlot остались неизменны. Target штатным scheduler
  создал ещё6пустых окон5–6ноября. Они отдельно проверены по trusted
  `scheduledDeliverySlots` (date/time/capacity/availability), без orders/waves.
  Это не молчаливое исключение изменённых исходных строк из сверки.
- Реальные source credential hashes, ENV, TLS/SSH keys, active sessions и
  подозрительные исполняемые файлы не импортированы. Существующему сотруднику
  ранее создан новый пароль, хранится только в server-private
  `/srv/dushanbe-fresh/state/prepared/staff-access.json`, не в отчёте/Git.

В **16:43:50МСК** deploy штатным Docker-доступом остановил и старую PostgreSQL,
изменив restart policy на `no`. Никаких host-root mounts/обхода sudo.
Web/API inactive+disabled, DB stopped, volumes/фото/исходники **не удалены**.
Алматы не writer, не fallback. Старый Caddy может отдавать ошибку старым DNS
caches, но не обслуживает приложение/заказы. Его root shutdown/decommission
требует отдельного операционного действия, не возврата старых Web/API.

## Резервная Копия И Принятый Риск

Перед DNS свежий encrypted snapshot:
`f2609f18e7bd708eff5699d1e24f2cd4c379bd4d0387799f2c1c6138e69bb4fb`.
Фактически восстановлен в отдельный PostgreSQL, все несессионные fingerprints
и65фото совпали, активные sessions/OTP не восстановлены. Завершение
**16:42:47МСК**, полный цикл13,09секунды. Daily scheduler остаётся21:30UTC
(02:30Душанбе следующего дня), с hourly catch-up и проверкой каждой копии.

**Независимой копии вне обоих VPS нет.** Владелец явно принял этот риск для
текущего запуска и разрешил DNS с local daily backups+двумя weekly snapshots
TARENA. Это записано как временный waiver, а не как `offsiteBackupRestored=true`.
`production-gates.cjs` допускает только этот документированный waiver с
проверенной local restore; freeze/TLS/reconciliation он не отключает.
Ничего дополнительно не куплено, новых просьб копировать restic TARENA не было.

## Критические Проверки

- Chrome1440 и WebKit390 через **реальный публичный домен**, не SSH/host override:
  HTTPS, каталог/фото, товар и видимая панель покупки, cart/checkout/admin/account200.
  Браузерные серверные записи блокировались, настоящего iPhone этим не аттестуем.
- Через публичный HTTPS выполнены настоящий вход исходного администратора
  новым паролем, Secure/HttpOnly/SameSite cookie, protected catalog/orders/waves,
  refresh rotation и logout. Пароль, cookie, JWT не выходили за пределы TARENA.
- Эти auth HTTP-вызовы записались в **новую** `df_production`; после logout
  активных staff sessions0. Контрольных клиентских заказов/покупателей не создано.
- Native guest checkout `{}` возвращает400 валидации, не CSRF/cookie mismatch.
  Web и native profiles используют один domain API; нет второго backend/БД.
- Полный order/picking/courier/финансовый цикл уже проверен на изолированной
  restored DB той же сборки; реальные production-заказы не создавались заново.
- Lint и production build прошли. 13migration/gates+3final-slot tests и
  126OTP/Payom unit tests прошли. Не запускался полный многосотенный набор.

Скриншоты и browser JSON локально:
`apps/web/test-results/cutover-production-20261031/` (Git-ignored).
Private серверные receipts: `state/final-data.json`, `backup-status/daily/last-success.json`,
`state/cutover-approval.json`, `state/public-proxy/production-open.json`,
`state/public-smoke/staff.json`, `quarantine/final-20261031/access-revoked.json`.

## Что Дальше

SMS остаётся выключенной, `CUSTOMER_REQUIRE_PHONE=false`, ни одной SMS не
отправлено. Payom health200 с TARENA, новый исходящий IPv4 **77.95.0.94**.
JWT/templateId/подтверждённое имя переменной ещё не записаны в production ENV.
Аккаунт/DFRESH/одобрение OTP-шаблона подтверждены владельцем;
полный UUID и `{code-1}` не угадывались. Баланс без токена не проверялся.
Конкретные cabinet/ENV/one-SMS действия:
[PAYOM_TARENA_ACTIVATION.md](PAYOM_TARENA_ACTIVATION.md).

Дизайн не менялся, старые Geoapify keys не переносились. Карта/адреса остаются
следующей отдельной задачей, как попросил владелец. Нативный клиент не пересобран
и не опубликован; его отдельные release flags описаны в инструкции Payom.
