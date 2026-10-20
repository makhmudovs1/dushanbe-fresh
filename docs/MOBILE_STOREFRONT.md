# Мобильная витрина Dushanbe Fresh

Локальная доработка от 2026-10-20. Production не обновлялся.
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
не менялись. Миграций нет. Production не подключался и не изменялся.
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
Адресного picker пока нет; он не имитируется. В production ничего не выкладывать
без отдельного подтверждения владельца.
