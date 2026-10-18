# Витрина v2: дизайн, категории, поиск и избранное

## Результат

Новый customer header: предоставленный знак корзины/листа, отдельная HTML-надпись
`Dushanbe Fresh` (зелёная только `F`), единственный живой поиск, Душанбе,
активный гостевой заказ, избранное, компактная корзина и RU/TJ.
На mobile поиск вынесен во вторую строку вместе с каталогом и языком.
GPS, регистрация и выдуманные разделы не добавлены.

Главная: четыре пастельные фотоподборки из реальных корневых категорий,
первые четыре доступных товара, затем разделы из БД. Сначала учитывается
`sortOrder`, при равенстве — число доступных товаров в поддереве.
Названия разделов не зашиты в компонент. Баннеры первого этапа сохранены
в проекте, но не занимают верх страницы. Стандартные иллюстрации заменяются
загрузкой из админки; в изображения не встроены названия.

Sidebar использует отдельные иконки, а не фото категорий. Без загрузки —
нейтральный значок. Родители раскрываются по URL, выбор включает товары потомков.
Раскрытие 180 мс; `prefers-reduced-motion` отключает анимацию. На mobile —
прежний доступный drawer с Escape, управлением фокусом и ссылкой на корзину.

Товарная карточка: квадратная галерея, сердце, заметная цена, единица, название
до двух строк и жёлтая компактная кнопка `+`. Для качества остаётся явный выбор.
Счётчики, минимумы и шаги используют прежний CartProvider. Галерея, настоящая
история цены, скидки и RU/TJ сохранены; фиктивных скидок и отзывов нет.

Избранное общее для карточек, товара и `/favorites`, сохраняет только ID
в `dushanbe-fresh.favorites.v1`. Есть синхронизация вкладок, защита до hydration,
обработка недоступного localStorage и пустого списка. Недоступные товары не
выдаются в списке, но их сохранённые ID остаются. Серверная БД не используется.

Поиск через 300 мс обновляет существующий API с RU/TJ-названиями и текущей
категорией. Есть отмена старых запросов, loading/error/retry/empty, URL и
Back/Forward. Второго поля поиска в каталоге нет. Изменение языка сохраняет
категорию, корзину и избранное.

## Миграции и сохранность данных

Оба изменения additive:

- `20261018100000_category_presentation`: nullable `image_url`,
  `is_visible NOT NULL DEFAULT true`.
- `20261018160000_category_hierarchy`: nullable `icon_url`/`parent_id`,
  индекс родителя, FK на категорию с `ON DELETE RESTRICT`, запрет самоссылки.

Все старые категории остаются корневыми; родитель и иконка пустые.
Товары не перемещаются, цены и существующие фото не обновляются.
Скрытие ветки влияет только на навигацию. Старый `isActive` сохраняет правила.
API запрещает циклы, включая конкурентное редактирование; изменения дерева
сериализованы transaction-scoped advisory lock. Категорию с товарами или
неудалёнными дочерними категориями удалить нельзя.

Миграции применены только к отдельной копии
`dushanbe_fresh_storefront_v2_test_20261018`. Сравнение перед/после миграций:
24 таблицы без изменения старых значений, 16 категорий сохранены, defaults верны.
Повторный `db:deploy`: нет ожидающих миграций. Основная dev-БД не мигрировалась
для v2. Production не изменён; SSH/deploy/seed/reset не выполнялись.

Для будущего согласованного production deployment нужны backup PostgreSQL,
проверка постоянного `PRODUCT_IMAGES_DIR`, `db:generate`/`db:deploy`, сборка
и существующий процесс запуска. Новый API запускается после миграций.

## Изображения

Архив `Архив 3.zip` содержит шесть PNG. Они оптимизированы в WebP до 720 px,
около 240 КБ суммарно, и используются через `next/image` с responsive sizes.
Загрузки администратора хранятся прежним MediaService в `PRODUCT_IMAGES_DIR`:
JPEG/PNG/WebP, 5 МБ, нормализация в WebP. Фото и иконка заменяются независимо.
Удаляется только ссылка, не физический файл; сборщик мусора не добавлялся.

| Окончание исходного имени | `public/storefront/v2/` | Использование |
| --- | --- | --- |
| `14_33_09-2.png` | `fruits.webp` | Фрукты |
| `14_33_10-3.png` | `vegetables.webp` | Овощи |
| `14_33_11-4.png` | `mushrooms.webp` | Подготовленный asset; категория автоматически не создаётся |
| `14_33_12-5.png` | `nuts.webp` | Орехи и сухофрукты |
| `14_33_13-6.png` | `greens.webp` | Зелень |
| `14_33_15-7.png` | `seasonal-vegetables.webp` | Подготовленный asset; категория автоматически не создаётся |

Для бобовых сохранён `public/storefront/pantry.webp` из предыдущего архива.
Существующие фотографии категорий в БД имеют приоритет над стандартными assets.
Новые товарные фото и строки каталога из архива не импортировались.

Для предоставленного изображения логотипа использован встроенный imagegen:
удалить белый фон, сохранить корзину, зелёный лист, исходные пропорции и три
колеса; не добавлять текст, декорации или тени; настоящий прозрачный фон.
Из результата подготовлены `public/brand/mark-v2.webp` (128 px),
`icon-v2.png` (512), `apple-touch-icon-v2.png` (180),
`favicon-v2.ico` (16/24/32/48/64/256). Wordmark — HTML, не картинка.
Исходный результат инструмента:
`~/.codex/generated_images/01a0a022-b1ed-7f23-8c01-811d8cdd2f94/exec-040b4b60-45d8-494c-8947-be2852baba3f.png`.
Файлы, используемые сайтом, находятся в репозитории, не зависят от этого пути.

## Изменённые файлы

Список включает предыдущий незакоммиченный этап, поверх которого выполнен v2.

- `apps/web/src/app/{page.tsx,layout.tsx,styles.css,storefront.css,storefront-v2.css}`;
  `app/catalog/page.tsx`, `app/favorites/{page.tsx,loading.tsx}`.
- `apps/web/src/components/{brand-logo,site-header,catalog-search,catalog-dialog,last-order-link}.tsx`.
- `apps/web/src/components/{category-navigation,category-sidebar,home-category-sections,home-banners}.tsx`.
- `apps/web/src/components/{catalog-browser,catalog-data,product-card,product-detail,product-image}.tsx`.
- `apps/web/src/components/{favorite-button,favorites-browser,loading-state,admin-catalog,product-photo-field}.tsx`.
- `apps/web/src/favorites/{favorites.ts,favorites-context.tsx,favorites.test.ts}`.
- `apps/web/src/lib/{active-order,catalog-navigation,catalog-url,storefront}.ts`
  и соответствующие `.test.ts`; `lib/{api,catalog.server,seo,tracking}.ts`, `seo.test.ts`.
- `apps/web/src/i18n/messages.ts`; тесты компонентов
  `loading-state.test.ts`, `product-card.test.tsx`, `site-header.test.tsx`.
- `apps/web/e2e/{catalog,checkout-smoke,i18n,product-card-layout,seo,ui-polish}.spec.ts`;
  новые `catalog-fixtures.ts`, `{category-presentation,storefront,storefront-v2}.spec.ts`.
- `apps/web/public/brand/*-v2.*`, `apps/web/public/storefront/`.
- `apps/api/prisma/schema.prisma` и две указанные миграции.
- `apps/api/src/catalog/catalog.{types,validation,mappers,service}.ts`,
  `catalog.service.test.ts`; новые `category-presentation.test.ts`,
  `category-presentation.integration.test.ts`, `category-hierarchy.integration.test.ts`.
- `apps/api/src/media/media.controller.ts`.
- `packages/shared/src/{index.ts,category-tree.ts,category-tree.test.ts}`.
- `README.md`, `docs/DECISIONS.md`, `docs/STOREFRONT_REDESIGN.md`, этот отчёт.

Checkout, auth/roles, операционные расчёты, Telegram, Docker/Caddy и server env
не изменялись. Расширен только существующий контракт категорий и его фильтр;
товарные DTO, корзина и цены обратно совместимы. Новых зависимостей нет.

## Проверки и ограничения

- `pnpm lint`, `pnpm typecheck`: успешно.
- `pnpm test` с `TEST_DATABASE_URL`: 385 тестов, без пропусков
  (shared 6, Web 132, API 247).
- `pnpm build:web`, `pnpm build:api`: успешно.
- `pnpm db:validate`, повторный `pnpm db:deploy` на тестовой копии: успешно.
- Browser QA выполняется в установленном Chrome через Playwright на локальном
  production build. Встроенный browser в этой сессии недоступен.
- Полный Playwright suite: 66 passed, 0 skipped, 0 unexpected, 0 flaky.
  Проверены logo/favicon, избранное во вкладках/после reload, RU/TJ,
  parent/child URL и reduced motion, единственный живой поиск, ошибка/retry,
  удержанный старый ответ, Back/Forward, качество, корзина и технический checkout.
  Admin CRUD, реальные скидки, галерея, независимые photo/icon uploads,
  валидация, замена/удаление и видимость также прошли.

Финальные снимки после уборки тестовых фикстур:
`/tmp/df-storefront-v2-screenshots/{home,catalog}-{ru,tg}-{375,768,1440}.png`.
Перед съёмкой проверены 42 исходных публичных товара и 5 категорий; тестовые
категории на снимки не попали. RU/TJ на всех трёх ширинах: нет горизонтального
переполнения, page errors и обнаруженных hydration warnings.
Header 113 px на 375, 65 px на 768/1440. Начало первой товарной карточки:
509 px на mobile, 374 px на tablet/desktop. Фото декодированы перед снимками.
JSON полного прогона: `/tmp/df-storefront-v2-e2e-final.json`, screenshot/trace
артефакты: `apps/web/test-results`. Они временные и не включаются в Git.

Web собирается в отдельном `/tmp/df-storefront-v2-preview-20261018`, чтобы не
перезаписывать `.next` пользовательского сервера на 3000. Preview:
`http://localhost:3101`, API 4101, отдельная БД; логи
`/tmp/df-storefront-v2-{web,api}.log`. Пользовательские 3000/4000 не останавливались.
Для остановки только этого preview: `kill 63035 60410`.

Проверки, меняющие данные, разрешены только на localhost с
`RUN_MUTATING_UI_TESTS=1`. Они создают собственные категории/товары через API,
убирают только свои записи; checkout создаёт технический заказ и отменяет его.
Production заказы не создаются. Для полного запуска нужны `UI_ADMIN_EMAIL` и
`UI_ADMIN_PASSWORD` именно тестового окружения.

Оставшиеся ограничения: проверка на физических Safari/Android, редакторская
вычитка TJ, проверка после отдельно согласованного production deploy.
Существующие категории не получают выдуманных подразделов и иконок: их можно
настроить из админки. Ранее существовавшее предупреждение Next об optional
`sharp` остаётся; встроенная оптимизация изображений работает.

Для Next 13 изолирован `lib/catalog-navigation.ts`: query-only History/popstate
сохраняет router state непрозрачным и не запускает последовательные RSC-переходы.
Back/Forward, возврат с товара, смена RU/TJ и гонка ответов покрыты тестами.
После обновления Next этот адаптер нужно перепроверить; версия framework
в рамках задачи не менялась.
