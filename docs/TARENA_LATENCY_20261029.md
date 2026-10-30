# Диагностика p95 и «rate limiter»

29 октября 2026 года, МСК. Только существующий закрытый synthetic pilot TARENA.
Обновлённый candidate image на VPS не устанавливался. Production не тестировался.

## Что На Самом Деле Ограничило Первый Прогон

В [load.cjs](../ops/tarena/load.cjs) стоит защита генератора:
`if(inflight.size>=8){skipped++;continue;}`. На исходной ступени5RPS из300
запланированных были отправлены299, `errors=0`, один запрос **не отправлен**.
Это не доказательство HTTP429, блокировки API, ограничения Nest или нехватки RAM.
Старый отчёт содержал только агрегат errors, не histogram статусов; по нему нельзя
восстановить детальную сетевую причину единственного всплеска in-flight.

Генератор ждал `arrayBuffer()`, то есть **всё тело**, а не только заголовки/TTFB.
В общей percentile смешивались маленькие API ответы и большой streaming SSR HTML.
Задержки включали Mac↔VPS, SSH multiplexed TCP и скачивание. Начало исходного окна
пересекалось с browser checkout; p95 1546ms — наблюдение, не чистое серверное время
и не SLA для покупателя из Душанбе. Наличие сети в задержке не доказывает, что
100% этого единственного всплеска вызвано только SSH; packet trace тогда не собирался.

## Повторная Методика

[diagnose-latency.cjs](../ops/tarena/diagnose-latency.cjs): только localhost tunnel
или loopback внутри Web-контейнера; отказ, если API не содержит ровно100 synthetic
`tarena-product-*`. Никакого произвольного TARGET_URL, checkout/auth или реальных
записей. Warmup,20 последовательных запросов, затем200 запросов за40секунд при
5RPS, max8in-flight, deadline3секунды, redirects запрещены. Повторять ступени
строго последовательно; не повышать concurrency для получения красивого результата.

Считаются раздельно status histogram, p50/p95 по endpoint, headers/full-body время,
bytes, client event-loop p99 и два типа пропусков: concurrency/schedule. При отставании
генератора более200ms запрос пропускается, не создаёт догоняющий burst.
Для diagnosis из Mac флаг`--tunnel` создаёт свой SSH-процесс и закрывает его после
проверки; серверные порты/процессы/секреты не меняются.

## Результаты

Remote:18:15:59МСК, Mac:18:18:28МСК. Один прогон каждого типа, не статистика суток.
По50 запросов каждого endpoint на ступени5RPS. Все400 получили HTTP200:
**HTTP429=0, errors=0, skippedConcurrency=0, skippedSchedule=0**.

| Endpoint | p95 полный ответ внутри VPS | p95 заголовки внутри VPS | p95 полный ответ Mac/SSH | Размер до |
| --- | ---: | ---: | ---: | ---: |
| /api/v1/products | 26.20ms | 22.64ms | 667.63ms | 61,683B |
| /api/v1/categories | 10.17ms | 9.97ms | 614.95ms | 419B |
| /catalog | 167.75ms | 32.62ms | 725.42ms | 275,513B |
| /products/tarena-product-1 | 46.36ms | 36.90ms | 698.66ms | 33,111B |

Client event-loop p99:23.72ms внутри контейнера и30.98ms на Mac. Это задержка
генератора, не измерение event-loop самого Next/Nest. Sequential p95 всего по5
наблюдениям — фактически max, его не использовать для SLA.

Remote тоже проходит через Next rewrite для API. Это не прямой benchmark Nest;
разница между header и full-body показывает вклад streaming/передачи, не позволяет
выделить CPU render по запросу без profiler. Предыдущий PG SELECT0.45ms warm-cache
не измеряет каждую Prisma операцию или DB write latency.

## Вывод И Дальнейшие Шаги

1. Причин отключать/поднимать production OTP/tracking/auth quotas нет. Это защита
   других endpoints, не обнаруженный bottleneck каталога. Их лимиты не изменены.
2. На повторе сервер справился с этим5RPS mix; проблема1.55s не воспроизвелась.
   Сравнение указывает на существенный вклад сетевого пути и размера SSR, а не
   доказывает RAM/PG saturation. Историческую точную причину одного skip не утверждаем.
3. В каталогеSSR100 карточек дают~275KB HTML. После security upgrade повторить
   тест **нового image** на TARENA, отдельно HTTP/TLS+Caddy и реальные мобильные
   RTT Душанбе; следить за headers/body/bytes, ресурсами и cache headers.
4. Проверить Caddy compression для text/JSON, warm asset caching и повторные SSR
   fetch. В этом изменении не введено межзапросное кеширование цен/доступности:
   они остаются no-store, checkout всё проверяет сервером. Redis не нужен по этим данным.
5. Если повторяемый local/server p95 ухудшится: profiler Next/Prisma и EXPLAIN на
   конкретных slow queries, затем точечная оптимизация (например pagination либо
   объём сериализации). Не менять публичный catalog contract без отдельной задачи.
6. До cutover согласовать SLA и выполнить длительный bounded rehearsal нового
   build. Отдельно проверить headroom во время backup и перекодирования изображений.

Итого: первый skip — **client load-safety cap**, не срабатывание rate limiter сайта.
Устранена неоднозначность измерений, а не ослаблена защита приложения.
