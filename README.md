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
`db:seed:checkout` and `db:seed:operations` once before `dev`. Do not use `prisma db push` for normal
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

Admin API is currently open for local development because authentication has not
been implemented yet. This is a TODO and is not production-ready security.

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
corepack pnpm db:seed:operations
```

The operations seed creates one active admin, picker and courier with password
hashes only; it refuses to run in production. Existing staff password hashes are
preserved. The default development credentials are documented below. Override the
passwords only on their first creation with `DEV_ADMIN_PASSWORD`,
`DEV_PICKER_PASSWORD` and `DEV_COURIER_PASSWORD`; use 12–72 UTF-8 bytes.

Pages:

```text
/admin/orders
/admin/orders/:id
/admin/delivery-waves
/admin/delivery-waves/:id
/admin/login
```

The order list filters by delivery date, slot and status. Order details use contact
and address snapshots, show estimated/final totals and allow manual distribution.
Wave details provide procurement, distribution and courier tabs. Purchasing forms
are mobile-friendly, with quantities and prices entered as decimal strings.

Endpoints (prefix `/api/v1/admin`):

```text
GET   /orders?date=YYYY-MM-DD&deliverySlotId=...&status=...
GET   /orders/:id
PATCH /orders/:id/status                     { status }
PATCH /orders/:id/items/:itemId               { status, finalQuantity, finalUnitPrice?, replacementProductId?, pickerNote? }
POST  /orders/:id/paid
GET   /delivery-slots?date=YYYY-MM-DD
GET   /staff
GET   /delivery-waves?date=YYYY-MM-DD
POST  /delivery-waves                        { deliverySlotId }
GET   /delivery-waves/:id
PATCH /delivery-waves/:id/assignments         { pickerUserId?, courierUserId? }
PATCH /delivery-waves/:id/status             { status }
POST  /delivery-waves/:id/items              { productId }
PATCH /delivery-waves/:id/items/:itemId       { purchasedQuantity, purchaseUnitPrice, supplierNote? }
```

Full flow: create customer orders in one slot, confirm them, form the wave, assign
a picker, start picking, record actual purchase, distribute quantities in each
order, finish picking, assign a courier, send the wave out, mark orders delivered
and cash received, then finish the wave. All placed/confirmed orders for the slot
must be included or cancelled before picking starts. Once picking starts the slot
is no longer bookable, including at checkout's final transactional recheck.

One wave per slot is enforced by PostgreSQL. Re-forming an open wave only adds
unassigned confirmed orders and refreshes demand; existing purchase values are
preserved. Re-forming a started/completed wave returns it unchanged. Mutations use
Serializable transactions with a per-slot lock and retries for conflicts.

Purchase totals and customer line totals are computed by the backend with Decimal
and HALF_UP rounding. Sending `purchaseTotal` or `finalTotal` has no effect.
Allocation cannot exceed purchased quantities. Customer final price defaults to
the order's selling-price snapshot; a manual override requires a picker note.
`totalFinal` remains null until every line is resolved, then includes the order's
original delivery/service fees and discount. Removed/unavailable lines cost zero;
cancel an entirely unfulfilled order instead of dispatching it.

Replacements must use the same unit, respect the substitution policy and have
recorded procurement in the wave. With `contact_me`, record customer agreement in
the picker note; `remove_item` prohibits replacement. No weight conversion or
automatic allocation is implemented.

Wave metrics use goods-only revenue. Gross margin subtracts the entire actual
purchase cost, including excess purchases, from final goods revenue. Delivery,
service fees, wages, Porter and other operating costs are excluded. Incomplete
cost/revenue/margin fields are null. The UI labels this “Валовая маржа по товарам”.

Status changes cannot move delivered orders back to picking. Procurement and
allocation are immutable after picking; completed waves retain purchase history.
Payment can be marked paid only for delivered cash-on-delivery orders.

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
corepack pnpm db:seed
corepack pnpm db:seed:checkout
corepack pnpm db:seed:operations
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
нужный товар в списке. В форме измените «Продажная цена» или «Закупочная цена»
и нажмите «Сохранить». Закупочная цена видна только администратору.
5. Чтобы выключить товар на сегодня, в строке товара нажмите «Сегодня: да».
Кнопка изменится на «Сегодня: нет»; товар перестанет появляться клиентам.
6. Чтобы включить товар снова, нажмите у него «Сегодня: нет». Полное отключение
товара выполняется соседней кнопкой «Включен» / «Выключен».

### Заказ, сборка и доставка

1. Для тестового заказа откройте клиентский сайт `http://localhost:3000/catalog`
в отдельном окне или после выхода из админки. Добавьте товаров минимум на
120 сомони, откройте корзину, перейдите к checkout, заполните контакты и адрес,
выберите свободное окно, подтвердите условия и создайте заказ.
2. Войдите как администратор. На «Заказы» появится новая строка; откройте её и
нажмите «Подтвердить заказ». Для одной волны создайте как минимум один
подтверждённый заказ в одном и том же окне доставки.
3. Откройте «Волны доставки», выберите это окно в поле «Окно доставки» и нажмите
«Сформировать волну». Кнопка объясняет, что сначала нужно выбрать окно.
4. Откройте созданную волну. В списке «Сборщик» выберите «Сборщик (тест)» и
нажмите «Начать сборку».
5. Выйдите и войдите как сборщик. В «Мои волны» откройте назначенную волну. На
вкладке «Закупка» для каждого товара укажите «Купили», «Закупочная цена» и при
необходимости примечание, затем нажмите «Отметить купленным». На вкладке
«Распределение» откройте каждый заказ, укажите фактическое количество и
результат сборки, затем сохраните. После заполнения всех позиций вернитесь в
волну и нажмите «Завершить сборку».
6. Выйдите и снова войдите как администратор. Откройте волну, выберите «Курьер
(тест)» в поле «Курьер» и нажмите «Передать курьеру».
7. Выйдите и войдите как курьер. В «Мои доставки» откройте волну. В карточке
каждого заказа доступны адрес, телефон и сумма к получению. Нажмите
«Доставлен», а затем «Наличные получены». Курьер не видит закупочные цены,
поставщика и маржу.

Все перечисленные действия доступны через UI. На текущем MVP через UI пока
нельзя изменять существующую категорию или управлять сотрудниками и их
паролями; это не требуется для сценария выше. Настройки checkout на странице
«Настройки» сейчас только для просмотра.

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
