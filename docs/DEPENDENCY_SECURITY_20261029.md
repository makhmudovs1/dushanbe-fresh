# Исправления зависимостей и готовность к production

Обновление30октября: новый full audit обнаружил Vite6.4.4 advisory
GHSA-8g5g-mxqh-grgj; patch6.4.5 установлен и повторный audit чист.
Ниже показатели29октября сохранены как исторический результат, не бессрочная
гарантия. [Новый этап](PRODUCTION_PREPARATION_20261030.md).

Позднейший этап того же дня: исправленная сборка установлена **только** в новый
закрытый TARENA rehearsal, см. [результаты](TARENA_REHEARSAL_20261029.md).
Ниже сохранён scope первоначального локального dependency audit.

29 октября 2026 года, МСК. Проверка локального workspace, не изменение production.
Обновлённый candidate на TARENA/старый VPS не устанавливался; DNS не менялся.
Ключи Payom/Geoapify не читались и не переносились, реальные SMS не отправлялись.

## Результат Аудита

Свежий `pnpm audit --json` **до** изменений для всего workspace сообщил:
9 critical /40 high /37 moderate /11 low. Это показатели registry advisory graph,
не число подтверждённых атак или различных эксплуатируемых пакетов. Предыдущие
5 critical/29 high относились к другому scope (`--prod`); сравнивать их с full
audit как рост числа атак нельзя.

После исправлений `pnpm audit --json` и `pnpm audit --prod --json`:
**0 critical /0 high /0 moderate /0 low**. Lockfile соответствует manifest.
Registry доступен; пустой ответ/ошибка сети не интерпретировались как успех.
Первая попытка в restricted network завершилась ENOTFOUND, затем аудит выполнен
с разрешённым доступом. Повторять audit непосредственно перед релизом.

Добавлен `pnpm security:audit` и CI gate для moderate/high/critical, включая dev
dependencies. Предупреждения не скрывались через ignore/unpatched/allowlist.
Нулевой audit — не pentest, не OS/container scan и не доказательство отсутствия
неопубликованных уязвимостей. Не утверждаем, что старый VPS стал доверенным.

## Оценка Применимости

| Цепочка / риск | Применимость в Dushanbe Fresh | Решение |
| --- | --- | --- |
| Next13: RSC/Server Actions DoS, rewrite request smuggling/SSRF | App Router и Next rewrite `/api/v1/*` реально используются; отсутствие наших Server Actions не исключает framework-level обработчики | Next15.5.28, async migration и регрессия |
| Next image optimizer RCE / Sharp native decoder | Linux glibc используется; есть next/image и загрузка/декодирование фото. Фактическую exploitability каждой комбинации не заявляем без PoC | Next15.5.28 и отдельный Sharp0.35.5 у Web/API |
| Middleware auth bypass (critical) | Next middleware не используется как граница авторизации, API проверяет собственные staff/session guards | Исправлено версией, API401/403 и logout/refresh не ослаблены |
| Nest common/core injection, Express/body-parser/qs/path-to-regexp | Backend принимает HTTP/JSON, эти зависимости runtime. Опасность availability особенно существенна на2GB | Согласованный Nest11.2.8 + Config4.0.4, новый Express5 stack |
| Multer DoS | Authenticated admin uploads с size/type limits; не публичная загрузка, но HTTP parser/decoder остаются поверхностью атаки | Исправленный Multer2.5.0 вместо уязвимого2.4.0 из Nest11 |
| proxy-addr IP spoofing (critical) | В пилоте trust proxy выключен; при будущей активации loopback proxy IP важен для OTP quotas | proxy-addr2.0.8, строгая loopback opt-in проверка сохранена |
| Vitest/Tinypool RCE, Vite dev-server file read, Playwright download TLS | `vitest run` не публикует UI server; не customer endpoint, но инструменты на машине разработчика/CI имеют доступ к source/secrets | Vitest4.1.12 без старого Tinypool, Vite6.4.4, Playwright1.64.1 |
| PostCSS/minimatch/brace-expansion/selector/source-map DoS/read | Основной путь build/lint, не произвольный CSS endpoint пользователя | PostCSS8.5.32 и совместимые patch overrides |

Next image advisory от разработчика:
[GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw).
Официальное описание зависимости от upstream image decoder не означает, что
произошла эксплуатация на нашем хосте. Запуск exploit payload на production не делался.

## Выбранные Версии

| Компонент | Было | Стало |
| --- | --- | --- |
| next / eslint-config-next | 13.5.6 | 15.5.28 |
| react / react-dom | 18.2.0 | 19.3.1 |
| @types/react / @types/react-dom | 18.x | 19.3.0 |
| Nest common/core/platform-express | 10.3.10 | 11.2.8 |
| @nestjs/config | 3.2.3 | 4.0.4 |
| Sharp API | 0.33.5 | 0.35.5; явно закреплён также в Web |
| Vitest | 1.6.0 | 4.1.12 |
| Vite | транзитивный5.4.21 | 6.4.4 |
| Playwright | 1.51.1 | 1.64.1 |
| tsx | 4.7.1 | 4.23.15 |
| PostCSS | 8.4.49 /8.4.31 | 8.5.32 во всех цепочках |
| Node CI | 20 | 22.23.3; engines >=22.12 <23 |

Не делался слепой `audit fix --force`/`update --latest`. Prisma5.22, schema и
миграции не менялись: отдельный major ORM не нужен для устранения этого audit.
Nest10 не закрывает все обнаруженные core advisories, поэтому согласованно
обновлены связанные пакеты до11; не подменён один core под старый platform.
Next13/14 вне поддержки. Выбран15 как меньший безопасный переход, а не одновременно
16, Turbopack и новая архитектура. Следующий этап — Next16 **до окончания
Maintenance LTS15**; на странице производителя сейчас указан31января2027.
Перепроверить срок перед release: [support policy](https://nextjs.org/support-policy).

Корневые overrides ограничены совместимыми ветками: minimatch9→9.0.9,
brace-expansion1→1.1.21/2→2.1.7, selector-parser6→6.1.5, proxy-addr2→2.0.8,
multer2→2.5.0 и PostCSS8.5.32. Нет подмены Multer1→2 под старым Nest10 или
Tinypool0→2 под старым Vitest. Причина pins — upstream lock/transitive versions
всё ещё давали advisories после обновления основных пакетов. Пересматривать pins
при следующем обновлении, не удалять до повторного audit/tests.

ESLint8 / старый TS-eslint toolchain имеют deprecation/EOL warnings, хотя текущий
audit не находит их уязвимостей после транзитивных fixes. Это отдельный ограниченный
tooling debt; flat-config major migration не смешивалась с бизнес-функциями.
Prisma lifecycle/support и pnpm/Corepack также отдельно пересмотреть перед
долгосрочной эксплуатацией: npm dependency audit не проверяет сам package manager.

## Изменения Совместимости

- Async `params`/`searchParams` на product/order/admin/catalog routes; повторные
  query arrays не попадают вместо строк в фильтры. Product IDs/цены не менялись.
- Async `cookies()`/serverI18n: RU/TJ сохраняются. Next viewport вынесен в
  `export const viewport`, в том числе viewport-fit=cover для iPhone.
- React19 nullable RefObject в viewport hook; поведение Safari не переписывалось.
- Сохранены no-store для цены/доступности, серверная валидация checkout, OTP quotas,
  guest checkout, auth flags и guards. Нет schema/data migration, восстановления
  удалённых товаров или Payom activation.
- Единственный несовместимый тест Payom использовал NUL в `process.env`: Node
  обрезает строку на NUL. Проверка intact-input перенесена на существующий pure
  configuration validator; unsafe variable по-прежнему отвергается, SMS не отправляется.
- `.dockerignore` default-deny: только source/manifests/public assets. Локальные
  `.env.local`, старые dumps, SSH files и node_modules не попадают в build context.
  Runtime проверен без сети: UID1000, Node22.23.3, Sharp0.35.5, ENV files0.

Источники по breaking changes: [Next15 upgrade](https://nextjs.org/docs/app/guides/upgrading/version-15),
[Nest migration guide](https://docs.nestjs.com/migration-guide).

## Проверки И Границы Готовности

Полный workspace suite проверен с новой локальной PostgreSQL-базой; не с production
и не с реальными customer data. Связанные HTTP integration tests не пропущены.
Дополнительные tests: async locale, async catalog/repeated query, сохранение
Payom NUL validation, Docker context и разделение generator/application limits.
Итог проверок:

| Проверка | Результат |
| --- | --- |
| Full workspace tests с отдельной PostgreSQL | 874 passed: shared24 + Web363 + API487, без skips |
| Pilot safety / Docker context / bounded diagnosis | 7 passed |
| Lint | passed |
| Typecheck с предварительным Next typegen | passed |
| Build API + Web | passed; исправлено предупреждение viewport |
| Linux-amd64 Docker build вне VPS | passed |
| npm audit all / prod / новый CI gate | 0 known vulnerabilities |
| Chromium desktop1440 /375 /390 | smoke passed |
| WebKit desktop1440 /375 /390 | settled-page smoke passed |

Browser smoke: каталог/query, кнопки без случайного открытия, корзина и reload,
прямая product route, footer в viewport, RU/TJ, защита admin detail без login,
отсутствие JS pageerror. Синтетический fixture не содержит реальных фото и
использует собственный старый шаг0.25; он не меняет боевые Product или их шаг0.5.
Скриншоты в ignored `apps/web/test-results/security-upgrade-{chromium,webkit}`;
mobile Chromium screenshot визуально открыт, фото-заглушка в fixture ожидаема.

При слишком быстрых принудительных `page.goto` WebKit27.2 выдавал access-control
pageerror для прерываемых RSC/API streams. На отдельной странице с завершением
подзагрузок все RSC responses получили200; после ожидания network idle smoke
проходит **без фильтрации pageerror**. Это не объявлено доказанной ошибкой CORS
production и не исправлялось отключением prefetch/проверок. Быстрые переходы на
настоящем Safari/iPhone + HTTPS остаются отдельным acceptance gate, не выполнены.
Первоначальные ошибки selectors (скрытый streaming DOM/два заголовка) и момент
entry animation исправлены в тесте точными selectors/ожиданием; CSS не маскировался.

Linux-amd64 candidate собран **локально** на Mac Docker, не на2GB VPS:
`df-security-candidate:20261029`, image ID
`sha256:2d2e370d5a6d9123eb1fb5ba8e71d8621983f39c404fa380a1c05886de89543a`.
Это локальный image ID, не обещание registry provenance. Он собран из рабочего
дерева до финальных documentation/test-only изменений; для release нужен
зафиксированный reviewed commit и повторная сборка/digest. Dockerfile остаётся
private-pilot artifact, включает dev tools; не объявляется минимальным production image.

**Готовность к публичному cutover: NO-GO до выполнения migration gates.**
Устранение npm advisories не заменяет новых secrets, проверенного restore,
контейнерного/OS scan, HTTPS, isolation и согласованного write freeze.

- [Подробный migration runbook](PRODUCTION_MIGRATION_TARENA.md).
- [Разбор p95 / generator cap](TARENA_LATENCY_20261029.md).
- Старый VPS не изменён/не выключен; TARENA private runtime не обновлён.
- DNS и данные production не переносились; Git push/deploy не выполнялись.
