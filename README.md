# Dushanbe Fresh

MVP skeleton for a fresh grocery delivery service from local markets in
Dushanbe.

## Stack

- pnpm monorepo
- Next.js + TypeScript in `apps/web`
- NestJS + TypeScript in `apps/api`
- Shared TypeScript package in `packages/shared`
- PostgreSQL
- Prisma
- Docker Compose for local PostgreSQL

Catalog browsing, catalog administration, a client-side cart, guest checkout,
staff authentication, role-based admin operations, delivery waves and manual
picking/distribution are implemented. Customer SMS authentication, online payments
and automatic routing are not implemented.

## Prerequisites

- Node.js 18.16+ or newer
- Docker Desktop or Docker daemon
- Corepack

This repository pins pnpm through `packageManager`, so a global pnpm install is
not required.

## Local Setup

Install dependencies:

```bash
corepack pnpm install
```

Generate Prisma Client:

```bash
corepack pnpm db:generate
```

Run the project locally:

```bash
corepack pnpm dev
```

That command starts PostgreSQL through Docker Compose and runs:

- web app on `http://localhost:3000`
- API on `http://localhost:4000`

Browser requests use `/api/v1` on the web app's own origin. Next.js proxies them
to `http://localhost:4000/api/v1` (or the port set in `API_PORT`). This avoids
cross-origin errors when opening the frontend on another port or a phone.
For a separate API host, set the server-side `API_URL` including `/api/v1`
when starting or building Next.js. `NEXT_PUBLIC_API_URL` is no longer used.
Restart Next.js after changing the proxy configuration.

For example, to use alternate ports:

```bash
WEB_PORT=3001 API_PORT=4001 corepack pnpm dev
```

Run only one Next.js process per checkout: simultaneous instances share `.next`
and can overwrite each other's bundles. Stop the dev server before `build:web`
and restart it afterwards. Export variables in your shell or put Next.js-specific
settings in `apps/web/.env.local`; the root `.env.example` is a reference, not an
automatically loaded configuration for every workspace.

Health endpoint:

```bash
curl http://localhost:4000/api/v1/health
```

Admin route:

```text
http://localhost:3000/admin
```

Catalog route:

```text
http://localhost:3000/catalog
```

Product page example:

```text
http://localhost:3000/products/tomatoes
```

Cart route:

```text
http://localhost:3000/cart
```

The cart is stored in browser `localStorage`. Checkout re-reads product
availability, prices and quantity rules from PostgreSQL. Cart prices are only
preliminary UI values. A successful order clears the cart.

Checkout route: `http://localhost:3000/checkout`.

## Database

The local default database URL is:

```text
postgresql://dushanbe_fresh:dushanbe_fresh@localhost:5432/dushanbe_fresh?schema=public
```

Apply development migrations:

```bash
corepack pnpm db:migrate
```

Seed the local catalog:

```bash
corepack pnpm db:seed
```

Prepare checkout settings and delivery slots after applying migrations:

```bash
corepack pnpm db:deploy
corepack pnpm db:seed:checkout
```

The checkout seed adds missing settings (`minimum_order_amount = "120.00"`,
`delivery_fee = "20.00"`, `service_fee = "0.00"`) and slots at 10:00, 14:00 and
18:00 for seven days, each with capacity 10. Times are local to Dushanbe (UTC+05).
It preserves existing settings, slot capacity, availability and orders. Run it
again to add dates as time advances. Unlike the catalog seed, it does not reset
products or quality options. Monetary settings are JSON strings, not numbers.

For a fresh checkout, run `db:generate`, `db:deploy`, `db:seed`,
`db:seed:checkout` and `db:seed:staff` once before `dev`. Do not use `prisma db push` for normal
development: migrations are the source of truth. If an older local database was
created with `db push`, compare its schema against the initial migration before
baselining it with `prisma migrate resolve --applied 20260914000000_init`.
Never reset a populated database just to initialize migration history.

Apply migrations in deployed environments:

```bash
corepack pnpm db:deploy
```

Override `DATABASE_URL` when needed:

```bash
DATABASE_URL="postgresql://user:password@host:5432/database?schema=public" corepack pnpm db:deploy
```

## API Endpoints

Public catalog:

```text
GET /api/v1/categories
GET /api/v1/products
GET /api/v1/products?category=vegetables
GET /api/v1/products?search=помидоры
GET /api/v1/products/:slug
```

Guest checkout:

```text
GET  /api/v1/delivery-slots
POST /api/v1/checkout/validate
POST /api/v1/checkout/orders
```

`validate` accepts `{ items, deliverySlotId }`. Each item has `productId`,
`quantity` (decimal string), nullable `qualityOptionId` and optional
`observedPrice` (used only for price-change messages). Client names, prices,
subtotals and payment fields never determine stored values.

The response includes current items, per-item errors/warnings, `itemsSubtotal`,
`deliveryFee`, `serviceFee`, `totalEstimated`, `minimumOrderAmount`,
`minimumOrderShortfall`, `valid` and `reviewToken`. Money is serialized as decimal
strings. Totals are rounded per line to two decimals with Decimal HALF_UP.

`orders` additionally requires `name`, `phone`, `address` (street/building required,
apartment/entrance/floor/instructions optional), `substitutionPolicy`, the reviewed
`reviewToken` and a UUID v4 `requestId`. Policies: `replace_similar`, `contact_me`,
`remove_item`. Local nine-digit phone numbers are normalized to +992.

Validation does not reserve a slot or guarantee creation. Creation repeats every
check inside a Serializable transaction and locks the slot while booking it.
Cancelled orders do not occupy capacity; all other statuses do. Changed prices,
fees, product data or delivery time return HTTP 409 with a fresh `quote`, requiring
the customer to review and confirm again. Invalid request fields return 400;
missing/invalid price settings return 503. Identical retries with the same
`requestId` return the original order; reuse with another payload is rejected.

Orders use `cash_on_delivery` / `pending`. Contact name and phone are stored
alongside the address in `deliveryAddressSnapshot`; product name, unit, quantity,
selling price and quality label are copied into order items. Final quantities and
totals remain null until picking. Estimated weighted totals are not final bills.

The success page `/orders/[orderNumber]/success` uses only the creation response,
kept in memory and `sessionStorage` in the ordering tab. There is no public order
lookup by number, phone or customer ID. A guest phone match is not authentication
and gives no access to previous orders or saved addresses.

Admin catalog:

```text
GET /api/v1/admin/categories
POST /api/v1/admin/categories
PATCH /api/v1/admin/categories/:id
GET /api/v1/admin/products
POST /api/v1/admin/products
PATCH /api/v1/admin/products/:id
```

Admin catalog endpoints require a staff access token and the `admin` role.
Picker and courier access is limited to their assigned operational work.

## Checks

Run lint:

```bash
corepack pnpm lint
```

Run TypeScript checks:

```bash
corepack pnpm typecheck
```

Run tests:

```bash
corepack pnpm test
```

PostgreSQL concurrency/integration tests use a separate test database or schema:

```bash
DATABASE_URL='postgresql://dushanbe_fresh:dushanbe_fresh@localhost:5432/dushanbe_fresh?schema=checkout_test' corepack pnpm db:deploy
TEST_DATABASE_URL='postgresql://dushanbe_fresh:dushanbe_fresh@localhost:5432/dushanbe_fresh?schema=checkout_test' corepack pnpm test
```

Without `TEST_DATABASE_URL`, only database integration tests are skipped. CI
creates a dedicated PostgreSQL database and runs the full suite, including two
simultaneous bookings of the last slot place and duplicate request retries.

Validate the Prisma schema:

```bash
corepack pnpm db:validate
```

Manual checkout check: add products worth at least the configured minimum, open
the cart, choose checkout, fill contact/address, select an available slot, review
the server totals, tick confirmation and submit. Check the success page and empty
cart. On a test database, also change a product's availability/price or fill the
selected slot after validation; submission must fail without creating an order
until the customer resolves the problem and confirms the refreshed totals.

## Admin Operations

Prepare staff for local development after applying migrations:

```bash
corepack pnpm db:generate
corepack pnpm db:deploy
corepack pnpm db:seed:staff
```

The staff seed creates one active admin, picker and courier with password
hashes only; it refuses to run in production. Existing staff password hashes are
preserved. The default development credentials are documented below. Override the
passwords only on their first creation with `DEV_ADMIN_PASSWORD`,
`DEV_PICKER_PASSWORD` and `DEV_COURIER_PASSWORD`; use 12–72 UTF-8 bytes.

It also creates missing `default_picker_id` / `default_courier_id` settings.
Existing defaults are preserved. Admin can change the duty staff in `/admin/settings`.
Checkout assigns active users of the appropriate role to vacant wave assignments.
If a default is missing/invalid, checkout still creates the order and wave; admin
must resolve the vacant assignment. Existing manual assignments are never replaced.

Pages:

```text
/admin/orders
/admin/orders/:id
/admin/delivery-waves
/admin/delivery-waves/:id
/admin/login
```

The order list filters by delivery date, slot and status. Order details use contact
and address snapshots, show estimated/final totals and allow one-click packing with manual exceptions.
Wave details provide procurement, distribution and courier tabs. Purchasing forms
are mobile-friendly, with quantities and prices entered as decimal strings.

Endpoints (prefix `/api/v1/admin`):

```text
GET   /orders?tab=active|completed|cancelled&date=YYYY-MM-DD&deliverySlotId=...&status=...
GET   /orders/:id
PATCH /orders/:id/status                     { status }
PATCH /orders/:id/items/:itemId               { status, finalQuantity, finalUnitPrice?, replacementProductId?, pickerNote? }
POST  /orders/:id/paid
GET   /delivery-slots?date=YYYY-MM-DD
GET   /staff
GET   /delivery-waves?date=YYYY-MM-DD&tab=upcoming|working|completed
POST  /delivery-waves                        { deliverySlotId }
GET   /delivery-waves/:id
PATCH /delivery-waves/:id/assignments         { pickerUserId?, courierUserId? }
PATCH /delivery-waves/:id/status             { status }
POST  /delivery-waves/:id/items              { productId }
PATCH /delivery-waves/:id/items/:itemId       { purchasedQuantity, purchaseUnitPrice, supplierNote? }
GET   /settings
PATCH /settings/purchase-price-deviation     { value: "15.00" }
PATCH /settings/default-staff                { pickerUserId?, courierUserId? }
```

Full flow: checkout automatically confirms validated orders, creates the slot's
wave if missing and assigns the default picker/courier. The picker starts picking, records purchases,
packs each order as requested (editing exceptions only) and completes the wave (`picked`). The assigned
courier sees the upcoming wave as "Готовится", then ready orders, presses
"Забрал заказы" (`out_for_delivery`), marks delivery and cash received.
The wave completes automatically when its last active order is delivered.
No admin handoff is required. All legacy placed/confirmed orders for the slot
must be included or cancelled before picking starts. Once picking starts the slot
is no longer bookable, including at checkout's final transactional recheck.

New checkouts create or join the slot's open wave under the same slot lock.
One wave per slot is enforced by PostgreSQL. Re-forming an open wave only adds
unassigned confirmed orders and refreshes demand; existing purchase values are
preserved. Re-forming a started/completed wave returns it unchanged. Mutations use
Serializable transactions with a per-slot lock and retries for conflicts.

Purchase totals and customer line totals are computed by the backend with Decimal
and HALF_UP rounding. Sending `purchaseTotal` or `finalTotal` has no effect.
Allocation cannot exceed purchased quantities. Customer final price defaults to
the order's selling-price snapshot. Picker requests containing `finalUnitPrice`
are rejected; exceptional admin overrides require a note and never change snapshots.
`totalFinal` remains null until every line is resolved, then includes the order's
original delivery/service fees and discount. Removed/unavailable lines cost zero;
cancel an entirely unfulfilled order instead of dispatching it.

Replacements must use the same unit, respect the substitution policy and have
recorded procurement in the wave. With `contact_me`, record customer agreement in
the picker note; `remove_item` prohibits replacement. No weight conversion or
automatic distribution of surplus purchase is implemented.

Wave metrics use goods-only revenue. Gross margin subtracts the entire actual
purchase cost, including excess purchases, from final goods revenue. Delivery,
service fees, wages, Porter and other operating costs are excluded. Incomplete
cost/revenue/margin fields are null. The UI labels this “Валовая маржа по товарам”.

Status changes cannot move delivered orders back to picking. Procurement and
allocation are immutable after picking; completed waves retain purchase history.
Payment can be marked paid only for delivered cash-on-delivery orders.

Each new wave item captures `referencePurchasePrice` from the catalog. The backend
flags absolute purchase-price deviations strictly greater than the configured
`purchase_price_deviation_percent` (default "15.00", editable by admin in Settings).
Flags do not block picking or dispatch. Empty purchases, zero purchased quantities
and legacy rows with unknown reference prices do not produce deviation warnings.
Messages include the actual deviation, e.g. "Цена закупки выше ориентира на 18%.
Нужна проверка администратора." No approval/audit workflow is implemented.
Admin can reassign staff before wave completion, including replacing a courier
in transit, and cancel unpaid orders before delivery. Staff views poll every 10s.

Operational and catalog endpoints now require a real staff access token.
The JWT access token lasts 10 minutes; the rotating refresh token is stored only
as an SHA-256 hash in PostgreSQL and sent in an httpOnly `SameSite=Lax` cookie
(`Secure` in production). In production set a random `STAFF_JWT_SECRET` of at
least 32 bytes. Customer catalog and checkout endpoints remain public.

The operations migration adds a unique wave-slot index, an order-wave index and
wave-item name/unit snapshots. Existing wave-item snapshots are backfilled from
products. Existing duplicate waves must be resolved manually before migration;
the migration never deletes procurement history.

Integration tests include three customer orders, concurrent wave formation,
quality aggregation, purchase/distribution arithmetic, oversubscription checks,
substitutions, cancellation, delivery/payment and immutable completed procurement.
Database test files run sequentially because they share settings; concurrent
requests are still tested explicitly within each suite.

Not implemented: routing, multiple markets, inventory/warehouse management,
courier tracking, online payments or a separate picker app.

## Как проверить MVP вручную

Перед проверкой подготовьте локальную БД и запустите приложение:

```bash
corepack pnpm db:generate
corepack pnpm db:deploy
corepack pnpm db:seed:catalog
corepack pnpm db:seed:checkout
corepack pnpm db:seed:staff
corepack pnpm dev
```

Вход для всех сотрудников находится по одному URL:
`http://localhost:3000/admin/login`. После входа приложение само открывает
подходящий раздел для роли.

| Роль | Email | Пароль | Открываемый раздел |
| --- | --- | --- | --- |
| Администратор | `admin@dushanbefresh.local` | `Dev-admin-only-2026!` | `/admin/orders` |
| Сборщик | `picker@dushanbefresh.local` | `Dev-picker-only-2026!` | `/admin/delivery-waves` |
| Курьер | `courier@dushanbefresh.local` | `Dev-courier-only-2026!` | `/admin/delivery-waves` |

Эти пароли предназначены только для локальной разработки. Передавать их в
production нельзя. Если staff seed уже был выполнен с переменными
`DEV_*_PASSWORD`, используйте заданные тогда значения: seed намеренно не меняет
существующий пароль.

### Каталог от администратора

1. Войдите как администратор и в верхнем меню откройте «Каталог».
2. Чтобы добавить категорию, в блоке «Категории» заполните «Новая категория»:
название, уникальный латинский `slug` (например, `berries`) и порядок. Нажмите
«Создать категорию».
3. Чтобы добавить товар, нажмите «Новый товар», выберите категорию, заполните
название, `slug`, единицу, продажную и закупочную цены, минимальное количество
и шаг. Для весового товара оставьте включённым «Весовой товар»; затем нажмите
«Сохранить».
4. Чтобы изменить продажную либо ориентировочную закупочную цену, нажмите на
нужный товар в списке. В форме измените «Цена для клиента» или «Ориентир закупки»
и нажмите «Сохранить». Ориентир закупки также виден сборщику в назначенной волне,
но клиенту и курьеру закупочные цены не выдаются.
5. Чтобы выключить товар на сегодня, в строке товара нажмите «Сегодня: да».
Кнопка изменится на «Сегодня: нет»; товар перестанет появляться клиентам.
6. Чтобы включить товар снова, нажмите у него «Сегодня: нет». Полное отключение
товара выполняется соседней кнопкой «Включен» / «Выключен».

### Заказ, сборка и доставка

1. Для тестового заказа откройте клиентский сайт `http://localhost:3000/catalog`
в отдельном окне или после выхода из админки. Добавьте товаров минимум на
120 сомони, откройте корзину, перейдите к checkout, заполните контакты и адрес,
выберите свободное окно, подтвердите условия и создайте заказ.
2. Войдите как администратор. На «Заказы» по умолчанию открыты «Активные».
Новый заказ уже имеет статус «Подтверждён»: отдельная кнопка не требуется.
Вкладки «Завершённые» и «Отменённые» отделены; дата/слот/статус фильтруют
заказы внутри выбранной вкладки.
3. Волна уже создана автоматически, дежурные уже назначены. В «Волны доставки»
admin может только проверить это: формировать волну вручную больше не нужно.
4. Создайте ещё один заказ на тот же слот и третий на другой слот (для проверки
даты удобно выбрать следующий день). В admin должны быть 3 заказа и 2 волны:
в первой 2 заказа, во второй 1. Выберите дату доставки и нажмите «Показать»:
в таблице должны остаться только заказы с этой delivery date, независимо от даты создания.
5. Войдите как сборщик. В «Мои волны» → «Предстоящие» сразу видны обе волны.
Откройте первую и нажмите
«Начать сборку». Во вкладке «Закупить товары» укажите «Куплено», «Цена закупки за 1 кг, сом»
и при необходимости примечание, затем «Отметить купленным». Карточка свернётся;
нажатие «Изменить» откроет её снова. Для других единиц подпись цены меняется
соответственно. «Ориентир рынка» доступен только для чтения.
Начатая волна находится во вкладке «В работе», после сборки переходит в «Завершённые».
6. Во вкладке «Упаковать заказы» видны компактные строки товаров каждого заказа.
После физической упаковки нажмите «Всё упаковано как заказано»: backend сохранит
requestedQuantity как finalQuantity для ещё не обработанных позиций. Появится
«Заказ упакован». Открывать каждый заказ и повторять ввод количества больше не нужно.
Если товара меньше, он отсутствует или заменён, нажмите «Изменить» у нужной строки,
задайте фактическое количество/статус/примечание и сохраните изменение. После этого
общая кнопка заполнит только остальные позиции, не перезаписывая исключение.
Цена клиенту берётся из snapshot, итог позиции равен finalQuantity × snapshot-цена,
а не закупочной цене. Нажмите «Завершить сборку»: волна и заказы станут «Собран».
7. Курьер в отдельном браузере/профиле заранее видит волну как «Готовится».
После завершения сборки состояние обновится в течение 10 секунд (или нажмите
«Обновить»). Когда партия физически получена, нажмите «Забрал заказы».
Волна и заказы перейдут в «У курьера» без admin-подтверждения.
8. В каждом заказе нажмите «Доставлен», затем «Наличные получены». После последней
доставки волна завершится автоматически. Курьер не видит закупочные цены,
поставщика и маржу. Admin видит доставленные заказы во вкладке «Завершённые».

### Проверка отклонения закупки и вмешательства admin

**Цена за единицу и сумма закупки не взаимозаменяемы.** Для бананов с ориентиром
`10.00 сом/кг` введите количество `16`, цену за 1 кг `10`, нажмите «Отметить купленным».
Сохранённая карточка должна показать `16 кг × 10.00 сом/кг = 160.00 сом`, без warning.
`purchaseTotal` считает только backend через Decimal; отклонение считается как
`(purchaseUnitPrice - referencePurchasePrice) / referencePurchasePrice × 100`.
При цене `12` отклонение составляет 20%, а сумма при 16 кг равна `192.00`.
В поле цены не нужно вводить итог `160`: это означало бы 160 сом **за килограмм**.
После сохранения следующий товар поднимается вверх: список одноколоночный
на телефоне и desktop. Для повторного ввода нажмите «Изменить».

Для кинзы в тестовом каталоге «Цена для клиента» = `2.50 сом/пучок`,
«Ориентир закупки» = `1.50 сом/пучок`. Это разные цены, не ошибка:
клиент видит первую, сборщик видит вторую как «Ориентир рынка».

1. До создания новой волны задайте товару ориентир закупки `8.00` в каталоге.
В «Настройки» задайте «Порог отклонения закупочной цены, %» = `15` и сохраните.
2. Сборщик вводит `8.30`: флага нет. При `9.20` (ровно 15%) флага также нет.
При `9.44` появится «Цена закупки выше ориентира на 18%. Нужна проверка администратора.», но завершение
сборки не блокируется. Admin видит предупреждение в той же волне.
3. Admin может поменять назначенного сборщика/курьера в полях волны, в том числе
заменить курьера в пути. Старый сотрудник потеряет доступ, новый увидит волну.
4. Для проблемного неоплаченного заказа до доставки откройте его и нажмите
«Отменить заказ». Он появится в «Отменённые». Закупочная история сохраняется.

### Проверка быстрой упаковки

1. Создайте заказ с 15 кг бананов, запишите закупку 16 кг. После упаковки одной
   кнопкой клиенту сохраняются ровно 15 кг, не 16. Его цена за кг не меняется.
2. В списке закупки проверьте «Куплено: 16 кг», «Нужно клиентам: 15 кг»,
   «Упаковано: 15 кг», «Остаток: 1 кг». До упаковки остаток включает всё ещё
   не упакованное; после упаковки всех заказов это излишек компании.
3. Для исключения через «Изменить» уменьшите количество отдельной позиции,
   сохраните, затем упакуйте остальные одной кнопкой. Исключение должно сохраниться,
   итог клиента уменьшиться, а остаток увеличиться. Удалённая/недоступная позиция
   имеет нулевой итог; замены по-прежнему требуют соблюдения политики клиента.
4. При нехватке закупки упаковка отклоняется целиком с указанием товара. Исправьте
   закупку или сохраните исключение и повторите. Списывать чужую закупку и
   упаковывать чужие волны нельзя. Повторное нажатие не меняет сохранённые позиции.

API: `POST /api/v1/admin/orders/:id/pack`, без тела, только admin/назначенный picker.
`remainingQuantity` в picking list считает backend через Decimal:
`purchasedQuantity - сумма finalQuantity` по активным позициям picked/replaced,
с учётом фактического товара замены. До ввода закупки значение null.
Массовая упаковка работает только в picking; статусы доставки не меняются до
«Завершить сборку». Складской учёт не добавлен.

### Почему окно доставки закрыто

`GET /api/v1/delivery-slots` и checkout validation возвращают `unavailableReasons`:

- `capacity_full`: «Мест больше нет»; все неотменённые заказы занимают capacity.
- `cutoff_passed`: «Время заказа прошло»; в MVP cutoff совпадает с началом окна
  по времени Душанбе (UTC+05:00), включая точную границу времени.
- `wave_closed`: «Приём заказов закрыт — сборка уже началась»; волна в picking,
  picked, out_for_delivery или delivered. Завершение доставки не открывает слот заново.
- `wave_cancelled`: «Приём заказов закрыт — доставка отменена».
- `inactive`: «Приём заказов на это окно закрыт»; неактивные окна не включаются
  в публичный список, но причина возвращается при проверке ранее выбранного окна.

Если действуют несколько причин, UI показывает все. У доступного окна массив
пустой. Backend повторно проверяет доступность при создании заказа под блокировкой
слота, даже если клиент выбрал его до начала сборки.

Диагностика локальной БД 23 сентября 2026 в 08:32 по Душанбе: окно 23.09
10:00–12:00 закрыто из-за delivered-волны (2 из 10 мест), окно 24.09 10:00–12:00
из-за picking-волны (1 из 10). На момент проверки время начала ещё не наступило.
Эти конкретные состояния относятся только к локальной тестовой БД.

Все перечисленные действия доступны через UI. На текущем MVP через UI пока
нельзя изменять существующую категорию или управлять сотрудниками и их
паролями; это не требуется для сценария выше. Настройки checkout на странице
«Настройки» сейчас только для просмотра.
Дежурные сотрудники и порог отклонения закупочной цены редактируются. Прикрепление подтверждения закупки
и журнал согласований отклонений пока отсутствуют. Старые draft/placed-заказы
не попадают в новые вкладки и не подтверждаются миграцией: их нужно отдельно
разобрать через существующий API или сохранённую ссылку на заказ до запуска сборки.

### Seeds и очистка локальной проверки

- `corepack pnpm db:seed:catalog`: каталог (`db:seed` остаётся совместимым alias).
- `corepack pnpm db:seed:staff`: dev-сотрудники и дежурные, без заказов/закупок.
- `corepack pnpm db:seed:checkout`: настройки checkout и будущие слоты.
- `corepack pnpm db:seed:operations`: необязательное demo, 3 заказа через backend
  checkout в двух слотах; actual quantities/prices остаются пустыми. Не запускайте
  эту команду перед ручной проверкой трёх собственных заказов.

Для чистой проверки остановите работу с локальными заказами и выполните:

```bash
corepack pnpm db:reset:operations --confirm
corepack pnpm db:seed:staff
corepack pnpm db:seed:checkout
```

Reset удаляет **все заказы и волны выбранной локальной dev-БД**, включая созданные
вручную тестовые заказы, а не только известные seed-строки. Он сохраняет товары,
категории, staff/customers, app settings и delivery slots. Production/staging,
удалённый хост и запуск без `--confirm` запрещены. Не направляйте dev-команды
на БД с реальными заказами. Очистка не является обычным шагом ежедневного запуска.

Build web:

```bash
corepack pnpm build:web
```

Build API:

```bash
corepack pnpm build:api
```

Build all packages:

```bash
corepack pnpm build
```
