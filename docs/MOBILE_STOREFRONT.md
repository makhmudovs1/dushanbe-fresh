# Мобильная витрина Dushanbe Fresh

Доработка от 2026-10-20. После отдельного подтверждения владельца изменения
выложены на https://dushanbefresh.tj (подробности ниже).
Preview: http://localhost:3101. Мобильная компоновка действует до 1023px;
с 1024px используется прежняя desktop-компоновка.

## Изменения

- Хедер: компактный brand mark, Душанбе, RU/TJ, корзина; ниже один живой поиск.
- Нижняя панель: Главная / Каталог / Корзина, active state, общий cart counter,
  safe-area inset. Скрыта на checkout, в admin и при фокусе поиска.
- `/categories`: отдельный экран с настоящим деревом категорий, независимыми
  admin-uploaded иконками, раскрытием, возвратом на главную и URL selection.
- Страница категории: компактные breadcrumbs/title, реальные дочерние tabs,
  две колонки товаров. Поиск, deep links и Back/Forward переиспользованы.
- Баннеры: три прежних изображения, native touch scrolling/scroll-snap, точки,
  HTML RU/TJ, без autoplay. Прежний desktop-layout сохранён.
- Главная: двухколоночные категории без повторов, тематические дочерние
  подборки только при наличии реальных данных, затем восемь настоящих товаров.
- Карточки: две колонки, прежний round plus/stepper, скрытые мобильные сердца,
  фиксированная геометрия. Галерея, фотоатрибуция, цены и единицы сохранены.
- Корзина: компактные строки, прежние quantity/delete/subtotal handlers,
  закреплённый checkout CTA с предварительной суммой над нижней панелью.

## Файлы

Новые:

- `apps/web/src/app/mobile-storefront.css`
- `apps/web/src/app/categories/page.tsx`
- `apps/web/src/components/mobile-navigation.tsx`
- `apps/web/src/components/mobile-category-tabs.tsx`
- `apps/web/src/components/mobile-category-tabs.test.tsx`
- `apps/web/e2e/mobile-storefront.spec.ts`
- `docs/MOBILE_STOREFRONT.md`

Изменены:

- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/styles.css`
- `apps/web/src/components/cart-page-content.tsx`
- `apps/web/src/components/catalog-browser.tsx`
- `apps/web/src/components/category-sidebar.tsx`
- `apps/web/src/components/home-category-sections.tsx`
- `apps/web/src/components/home-promotions.tsx`
- `apps/web/src/i18n/messages.ts`
- `apps/web/src/lib/storefront.ts`
- `apps/web/src/lib/storefront.test.ts`
- `apps/web/e2e/catalog.spec.ts`
- `apps/web/e2e/checkout-smoke.spec.ts`
- `apps/web/e2e/home-promotions.spec.ts`
- `apps/web/e2e/storefront-final.spec.ts`
- `apps/web/e2e/storefront-v2.spec.ts`
- `apps/web/e2e/storefront.spec.ts`
- `apps/web/e2e/ui-polish.spec.ts`
- `docs/DECISIONS.md`

## Безопасность

API, Prisma schema, цены, названия товаров, quantity rules, checkout и Telegram
не менялись. Миграций нет. Production обновлён только по Web после backup;
данные каталога, пользователей и заказов не изменялись.
Тесты используют отдельную локальную test-БД. Checkout smoke создаёт и отменяет
только локальный технический заказ; admin tests очищают собственные fixtures.
Reset/seed не выполнялись. Личные development-серверы на 3000/4000 не трогались.

## Проверки

- Lint и typecheck прошли.
- Unit/integration: 411 passed (shared 6, web 154, API 251), без skips.
- `build:web` и `build:api` прошли. Web собран в изолированной локальной копии.
- Полный Playwright regression: 89 passed, 0 failed/skipped/flaky.
- Новые browser-сценарии: 375/390/430/768px, RU/TJ, настоящий touch swipe,
  reduced-motion dots, категории, plus/stepper, reload, detail/back, live search,
  history, totals, sticky checkout, пустая корзина, отсутствие page overflow.
- Существующие проверки покрывают реальную локальную иерархию и прямые ссылки,
  загрузку/смену фото и иконки категории, видимость, сохранение старых quality
  preferences, checkout и активный заказ.
- Отдельный прогон 48 мобильных страниц (6 экранов x 4 ширины x RU/TJ): нет
  horizontal overflow, page errors или hydration warnings. Сохранены 40 основных
  screenshots и дополнительные screenshots трёх баннеров.
- Desktop 1280/1440 сравнен с отдельной неизменённой HEAD-копией: геометрия,
  вычисленные цвета, шрифты, отступы и grid tracks совпадают для главной,
  категории, пустой и заполненной корзины. Не утверждаем полное бинарное
  совпадение screenshots: есть небольшие различия растеризации изображений
  между dev/prod-серверами. Пустая и заполненная корзина совпали попиксельно.

Артефакты локальных проверок:

- `/tmp/df-mobile-e2e-final-20261020.json`
- `/tmp/df-mobile-final-screenshots-20261020.json`
- `/tmp/df-mobile-final-20261020/` (экраны home/catalog/category/search/cart)
- `/tmp/df-mobile-desktop-comparison-20261020.jsonl`
- `/tmp/df-mobile-desktop-comparison/` (desktop до/после)

## Осталось вручную

Проверить на физическом iPhone Safari safe areas, экранную клавиатуру и touch
momentum. Автоматизация использует установленный Chrome, а не реальный iPhone.
Адресного picker пока нет; он не имитируется. Следующие production-изменения
требуют отдельного подтверждения владельца.

## Production deployment 20 октября

Владелец подтвердил push и deployment после локального просмотра. Все изменения
запушены в `origin/main`, код релиза:
`830b7652d2df5e2386482768a4c0eeaef2e80900`.

Перед deployment повторно прошли lint, typecheck, все 411 unit/integration tests
и API build. Последняя Web-сборка и 89 browser tests были успешны локально;
на сервере Web/API также успешно собраны в отдельном staging-каталоге.

Создан и проверен PostgreSQL custom backup:
`/home/deploy/backups/dushanbe-fresh/mobile-storefront-20261020/database.dump`.
Размер 83 329 bytes; SHA-256:
`5c237c321eed52efaef2514c74b3a3d3f557b5f32fd3f95513ac56d3a0fa669c`.
`pg_restore --list` подтвердил читаемый архив, 160 archive entries.

Использован существующий deployment process: проверенный Git bundle по SSH,
fast-forward, frozen lockfile, Prisma generate/validate без миграций, staging
build, перенос `.next` с сохранением старых static chunks и rollback-сборки.
GitHub credentials, Caddy, Docker, systemd units и production env не менялись.

Web активирован **20 октября 2026 в 22:57:43 МСК (UTC+3)**. Перезапущен только
`dushanbe-fresh-web`; API сохранил прежний PID `3255865`, NRestarts у обоих 0.
Прежняя сборка для rollback:
`/home/deploy/backups/dushanbe-fresh/mobile-storefront-20261020/previous.next`.

Сразу после активации все поля 24 таблиц совпали по количествам и хешам со
снимком перед переключением. Production smoke выполнен в RU/TJ на
375/390/430/768/1280/1440px: главная, баннеры, категории, поиск, detail,
plus/stepper, reload, корзина, checkout без отправки, admin login page и
неизвестный tracking token. 12 сценариев, без page errors, hydration warnings,
overflow и запрещённых POST-записей. Production admin-пароль не использовался.

После открытия checkout штатный `ensureDeliverySlots` добавил три окна нового
дня: 51 -> 54. Все прежние 51 записи совпали по контрольному хешу. Остальные
23 таблицы неизменны: 61 product, 70 product_images, 6 quality options,
6 categories, 1 user, 4 refresh sessions, 0 orders/customers. Публично по-прежнему
42 товара и 5 категорий. Новых application errors в Web journal нет; присутствует
лишь Node/Next deprecation warning `util._extend`, без автоматических рестартов.

**Прежний эксплуатационный блокер сохранён:** отсутствуют три app settings
`minimum_order_amount`, `delivery_fee`, `service_fee`. Проверка
`POST /api/v1/checkout/validate` возвращает 503 с понятным сообщением.
Владельцу нужно сохранить минимальную сумму, стоимость доставки и сервисный
сбор в `/admin/settings`. Значения автоматически не подставлялись. Настоящие
заказы и Telegram-уведомления при production smoke не создавались.

Production-скриншоты и результаты:
`/tmp/df-mobile-production-20261020/`,
`/tmp/df-mobile-production-smoke-20261020.jsonl`.
