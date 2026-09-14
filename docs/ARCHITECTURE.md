# Architecture

Простая production-ready архитектура MVP для сервиса доставки свежих продуктов
с рынков Душанбе. Цель: быстро запустить веб-продукт, не усложняя систему
раньше времени.

## Рекомендуемый стек

### Frontend

- Next.js с App Router.
- TypeScript.
- React Server Components там, где нет интерактивности.
- Tailwind CSS для быстрой адаптивной верстки.
- TanStack Query для клиентских запросов в корзине, checkout и админке.
- React Hook Form + Zod для форм и валидации.

Один frontend-проект обслуживает:

- публичный клиентский сайт;
- личный кабинет клиента;
- админ-панель по маршруту `/admin`.

### Backend API

- NestJS.
- TypeScript.
- REST API.
- Prisma ORM.
- PostgreSQL.
- Zod или class-validator для входных DTO.
- OpenAPI/Swagger для документации API.

NestJS выбран как простой и структурированный backend для небольшой команды:
модули каталога, заказов, delivery slots, auth и admin можно держать отдельно,
но без микросервисов.

### Authentication

- Email + пароль для админов.
- Телефон + одноразовый код для клиентов.
- JWT access token + httpOnly refresh cookie.
- Роли: `customer`, `admin`, `picker`, `courier`.

На MVP можно начать с ручного создания админов через seed-скрипт.
Подключение SMS-провайдера должно быть за интерфейсом, чтобы на dev/staging
использовать mock-коды.

### Infrastructure

- PostgreSQL как основная база.
- Redis не нужен для MVP, если нет высокой нагрузки. Временную корзину лучше
хранить на клиенте и синхронизировать при checkout.
- S3-совместимое хранилище для изображений товаров, если изображения
загружаются через админку.
- Docker Compose для локальной разработки.

## Repository Structure

Монорепозиторий упрощает работу двух разработчиков и общий TypeScript-контекст.

```text
dushanbe-fresh/
  apps/
    web/
      src/
        app/
          (shop)/
          account/
          admin/
        components/
        features/
        lib/
      public/
      package.json
    api/
      src/
        modules/
          auth/
          catalog/
          cart/
          checkout/
          delivery-slots/
          orders/
          admin/
          config/
        prisma/
        main.ts
      package.json
  packages/
    shared/
      src/
        dto/
        enums/
        money.ts
        validation/
      package.json
  docs/
    PRODUCT.md
    MVP.md
    DECISIONS.md
    ARCHITECTURE.md
  docker-compose.yml
  package.json
  pnpm-workspace.yaml
```

### Принципы структуры

- `apps/web` содержит весь пользовательский интерфейс.
- `apps/api` содержит backend API и бизнес-логику.
- `packages/shared` содержит общие типы, enum-значения и простые утилиты,
  которые реально нужны и frontend, и backend.
- Админка живет в том же web-приложении, чтобы не создавать второй frontend.
- Бизнес-правила вроде минимального заказа, стоимости доставки, наценки и
  доступных окон доставки хранятся в конфигурации и/или таблице настроек.

## Database Entities

### Users and Auth

#### users

- `id`
- `phone`
- `email`
- `password_hash`
- `name`
- `role`
- `status`
- `created_at`
- `updated_at`

Для клиентов основным идентификатором является телефон. Для админов можно
использовать email + пароль.

#### refresh_sessions

- `id`
- `user_id`
- `token_hash`
- `expires_at`
- `created_at`
- `revoked_at`

### Customer Data

#### customer_addresses

- `id`
- `user_id`
- `label`
- `recipient_name`
- `phone`
- `city`
- `street`
- `building`
- `apartment`
- `entrance`
- `floor`
- `instructions`
- `is_default`
- `created_at`
- `updated_at`

### Catalog

#### categories

- `id`
- `name`
- `slug`
- `sort_order`
- `is_active`

#### products

- `id`
- `category_id`
- `name`
- `slug`
- `description`
- `image_url`
- `unit`
- `base_price`
- `markup_percent`
- `is_weighted`
- `min_quantity`
- `quantity_step`
- `is_active`
- `sort_order`
- `created_at`
- `updated_at`

`unit`: `kg`, `g`, `piece`, `pack`, `bunch`.

#### product_quality_options

- `id`
- `product_id`
- `label`
- `sort_order`
- `is_active`

Примеры: для помидоров `спелые`, `твёрдые`, `на выбор сборщика`.

### Cart and Checkout

Корзину для неавторизованного пользователя можно хранить в браузере.
После входа или checkout backend получает финальный набор позиций.
Отдельная серверная таблица корзины для MVP не обязательна.

### Delivery

#### delivery_slots

- `id`
- `date`
- `starts_at`
- `ends_at`
- `capacity_orders`
- `is_active`
- `created_at`
- `updated_at`

Окна доставки двухчасовые, например 10:00-12:00, 14:00-16:00, 18:00-20:00.

#### delivery_waves

- `id`
- `delivery_slot_id`
- `status`
- `picker_user_id`
- `courier_user_id`
- `created_at`
- `updated_at`

Волна объединяет заказы одного окна доставки для сборочного листа.

### Orders

#### orders

- `id`
- `order_number`
- `customer_id`
- `address_id`
- `delivery_slot_id`
- `delivery_wave_id`
- `status`
- `substitution_policy`
- `quality_comment`
- `items_subtotal`
- `delivery_fee`
- `service_fee`
- `discount_total`
- `total_estimated`
- `total_final`
- `customer_comment`
- `created_at`
- `updated_at`

`status`:

- `draft`
- `placed`
- `confirmed`
- `picking`
- `picked`
- `out_for_delivery`
- `delivered`
- `cancelled`

`substitution_policy`:

- `replace_similar`
- `contact_me`
- `remove_item`

#### order_items

- `id`
- `order_id`
- `product_id`
- `product_name_snapshot`
- `unit`
- `requested_quantity`
- `estimated_unit_price`
- `estimated_total`
- `quality_option_id`
- `quality_option_label_snapshot`
- `final_quantity`
- `final_unit_price`
- `final_total`
- `status`
- `replacement_product_id`
- `picker_note`

`status`: `requested`, `picked`, `replaced`, `removed`, `unavailable`.

### Settings

#### app_settings

- `key`
- `value`
- `updated_at`

Примеры:

- `minimum_order_amount`
- `delivery_fee`
- `default_markup_percent`
- `slot_capacity_orders`
- `service_area_city`

## Main API Endpoints

Версионирование: все endpoints начинаются с `/api/v1`.

### Auth

- `POST /auth/request-code` - запросить одноразовый код по телефону.
- `POST /auth/verify-code` - войти или зарегистрироваться по коду.
- `POST /auth/admin/login` - вход администратора по email и паролю.
- `POST /auth/refresh` - обновить access token.
- `POST /auth/logout` - завершить сессию.
- `GET /me` - текущий пользователь.

### Catalog

- `GET /categories` - список активных категорий.
- `GET /products` - список товаров с фильтрами `category`, `search`.
- `GET /products/:slug` - карточка товара.

### Customer

- `GET /addresses`
- `POST /addresses`
- `PATCH /addresses/:id`
- `DELETE /addresses/:id`
- `GET /orders`
- `GET /orders/:id`

### Cart and Checkout

- `POST /checkout/validate` - проверить корзину, минимум заказа, цены и слот.
- `POST /checkout/orders` - создать заказ из корзины.

Backend не хранит неоформленную корзину как обязательную сущность MVP.
Клиент отправляет позиции при валидации и создании заказа.

### Delivery Slots

- `GET /delivery-slots` - доступные окна доставки.

### Admin Catalog

- `GET /admin/products`
- `POST /admin/products`
- `PATCH /admin/products/:id`
- `POST /admin/products/:id/archive`
- `GET /admin/categories`
- `POST /admin/categories`
- `PATCH /admin/categories/:id`

### Admin Orders

- `GET /admin/orders`
- `GET /admin/orders/:id`
- `PATCH /admin/orders/:id/status`
- `PATCH /admin/order-items/:id` - финальный вес, цена, замена или удаление.

### Admin Delivery Waves

- `GET /admin/delivery-waves`
- `GET /admin/delivery-waves/:id`
- `POST /admin/delivery-waves/:id/assign-picker`
- `POST /admin/delivery-waves/:id/assign-courier`
- `GET /admin/delivery-waves/:id/picking-list`

Сборочный лист должен агрегировать товары по всем заказам волны:
товар, суммарное количество, единица измерения, заметки по качеству и список
заказов, где этот товар нужен.

### Admin Settings

- `GET /admin/settings`
- `PATCH /admin/settings`
- `GET /admin/delivery-slots`
- `POST /admin/delivery-slots`
- `PATCH /admin/delivery-slots/:id`

## Deployment Approach

### Environments

- `local` - Docker Compose: PostgreSQL, API, web.
- `staging` - один сервер или PaaS-проект для проверки перед релизом.
- `production` - managed PostgreSQL + web/API deployment.

### Recommended MVP Deployment

Самый простой production-вариант:

- Frontend: Vercel.
- API: Render, Fly.io или Railway.
- Database: managed PostgreSQL у того же провайдера, что API.
- Images: S3-compatible storage.
- Domain: `dushanbefresh.tj` или аналогичный.
- TLS: managed сертификаты провайдера.

Если важнее единая инфраструктура и предсказуемость расходов:

- один VPS;
- Docker Compose;
- Caddy или Nginx как reverse proxy;
- PostgreSQL на отдельном managed-сервисе или на VPS с ежедневными backup.

Для MVP предпочтительнее managed PostgreSQL, чтобы не тратить время команды
на ручное администрирование базы.

### CI/CD

- GitHub Actions.
- На pull request:
  - lint;
  - typecheck;
  - unit tests;
  - build web;
  - build api.
- На merge в `main`:
  - deploy staging или production, в зависимости от выбранного процесса.
- Prisma migrations применяются автоматически при deploy API, но только после
  успешного backup на production.

### Observability

- API logs в stdout.
- Error tracking: Sentry.
- Basic uptime monitoring.
- Простые бизнес-метрики в админке:
  - заказы за день;
  - заказы по статусам;
  - сумма заказов;
  - загрузка окон доставки.

### Security Basics

- Пароли админов хэшируются через Argon2 или bcrypt.
- Refresh tokens хранятся только в виде hash.
- Клиентские refresh cookies: `httpOnly`, `secure`, `sameSite=lax`.
- Admin endpoints защищены role-based guard.
- Все цены пересчитываются на backend при checkout.
- CORS разрешен только для доменов web-приложения.
- Секреты хранятся в environment variables, не в репозитории.

## MVP Scope Notes

В архитектуру намеренно не включены:

- marketplace продавцов;
- нативные мобильные приложения;
- AI-функции;
- dark store;
- сложная складская система;
- микросервисы;
- real-time courier tracking;
- online payments как обязательная часть MVP.

Оплату можно начать с `cash_on_delivery` или ручного процесса, а online payments
добавить позже отдельным модулем.
