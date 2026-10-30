# TARENA: результаты закрытого пилота

29 октября 2026 года, МСК. Только тестовые данные, production не переносился.

## Вывод

**2 vCPU / 2 GB RAM достаточно для проверенного небольшого MVP при сборке вне
VPS.** В измеренном окне RAM не приблизилась к 1.5 GiB: максимум
`MemTotal - MemAvailable` около 718 MiB при общем объёме 1968 MiB; минимум
доступной памяти около 1250 MiB. Это выборка с интервалом 1 секунда, не гарантия
потребления при любой нагрузке. Для build на 2 GB отдельного подтверждения нет.

На 5 RPS выросли задержки и один запрос был пропущен ограничителем in-flight.
Покупку можно рассматривать по вычислительной ёмкости для старта, но нельзя
называть тариф безусловно комфортным при любом SSR/изображениях/трафике.
Экономическая выгодность, SLA, backup и пиковая загрузка shared CPU не оценены:
стоимость/условия тарифа не предоставлены, тест короткий.

## Что Развёрнуто

- Новый TARENA `77.95.0.94`, Ubuntu 24.04.5, x86_64, 2 CPU, около 1.9 GiB RAM.
- PostgreSQL 16.15, API/Nest, production-build Web/Next и Caddy с новым внутренним
  TLS. Четыре runtime-контейнера, без dev/watch/compiler, Redis или очередей.
- Один свежий Linux-amd64 image собран на доверенном Mac через Docker; на VPS
  выполнялась загрузка готового образа, не сборка. Исходник: локальный reviewed
  `8bb9e75938c5ea34a37f50f61d8cb372faae1533`. Старый VPS не использовался.
- Отдельная `df_tarena_test`, 100 synthetic Product, новые admin/picker/courier,
  два synthetic заказа и свежие приватные secrets. Никаких customer dumps,
  старых JWT/паролей/API-ключей/host keys/uploads или готовых старых сборок.
- Роль `pilot_api`: superuser/createdb/createrole/replication все false. Миграции
  выполнялись отдельным bootstrap owner. Runtime owner-пароль не получает.
- Root compose разработки не использовался. Постоянные тестовые DB/TLS volumes
  отдельны, image uploads в отдельном каталоге. Логи ограничены 2 x 5 MB на сервис.
- Конфигурация и secret-файлы: `/home/adminj0n/df-tarena-pilot`; каталог 0700,
  `pilot.env` и `credentials.json` 0600. Значения не включены в отчёт/Git/клиент.

## Доступ И Ограничения Сети

Стартовый раскрытый пароль изменён владельцем. Новый отдельный SSH client key
на Mac; private key не копировался на сервер. Host fingerprint закреплён,
agent forwarding выключен. Входы с `77.95.0.98` первоначально потребовали проверки,
затем владелец явно подтвердил «Это был я»; наблюдение не объявляется атакой.
Server-wide sshd password/root policy в этом пилоте не изменялась обходом sudo.
Владелец установил Docker/Compose и явно согласился с root-equivalent docker group.

- Web опубликован только `127.0.0.1:18080`; Caddy только `127.0.0.1:8443`.
- API/PostgreSQL без host-публикации, во внутренней Docker-сети. Web/proxy имеют
  дополнительную bridge-сеть: Docker 29 не назначил опубликованные порты сети,
  которая была единственной и internal. Открытых application-портов не добавляли.
- Проверка HTTP через публичный IP не получила приложение; на самом сервере
  запрос к public-IP:18080 получил connection refused. Docker bindings подтверждены.
  Простые TCP connect из среды агента давали неоднозначные connected, поэтому
  сами по себе не использованы как доказательство доступности/закрытости.
- Рабочий домен/DNS/старый VPS не менялись. Внешние Payom/Geoapify keys не вводились.
- Туннель на Mac: `https://localhost:8443`; benchmark через `127.0.0.1:18081`
  к remote loopback 18080. Локальный 18080 был занят чужим процессом и не трогался.
  TLS тестовый/self-signed; в изолированных browser contexts разрешён только
  этот тестовый сертификат через ignoreHTTPSErrors. В систему CA не устанавливался.

Это закрытый staging, не приглашение открывать ports 80/443. Не публиковать
приложение до отдельного security review/обновления зависимостей.

## Проверенные Сценарии

- Chromium desktop 1440 и WebKit mobile 390: каталог, добавление двух разных
  Product, количества 1 kg и 2 kg, корзина и reload, полный guest checkout из UI.
- Реальная тестовая staff-авторизация через API, Secure refresh cookie,
  восстановление сессии после reload admin UI, просмотр synthetic заказа.
- White/red potato остаются двумя строками заказа и picking list. Picker
  сохраняет закупку и фактический вес отдельно: 0.9 x 7 + 2.1 x 9 = 25.20 сомони.
- Picker не получает admin settings; courier видит назначенную волну; logout
  действительно отзывает staff access через refresh-session state.
- RU flow и TJ catalog проверены на desktop/mobile. Скриншоты сохранены в
  ignored `apps/web/test-results/tarena-{chromium,webkit}` и визуально открыты.
- Customer SMS/auth и require-phone остаются false; реальные SMS и полноценный
  customer OTP login на TARENA не выполнялись. OTP/mock/native coverage проверено
  локальным regression suite, это не выдаётся за реальную доставку SMS/тест телефона.
- 867 workspace tests и 5 новых pilot-safety checks прошли, lint, typecheck и Linux build
  успешны. Не является заключением об отсутствии уязвимостей dependencies.

## Измерения Ресурсов

210 samples: 17:14:27-17:17:57 МСК; функциональное окно также 300 samples.
Источник чисел: [JSON результатов](tarena-pilot-results-20261029.json).

| Метрика | Значение |
| --- | ---: |
| Peak non-available RAM всей машины, включая ОС/Docker | 717.6 MiB |
| Минимальная MemAvailable | 1250.0 MiB |
| Web cgroup peak | 159.2 MiB |
| API cgroup peak | 67.3 MiB |
| PostgreSQL cgroup peak | 130.3 MiB |
| Proxy cgroup peak | 15.2 MiB |
| Средний CPU всей машины в окне | 13.34% |
| Максимальный CPU, усреднение 1 секунда | 62.63% |
| Максимальный steal | 0.5% |
| OOM / контейнерные рестарты | 0 / 0 |
| Swap allocation уже при выдаче | около 3.8 GiB |
| Максимум занятого swap в окне | 268 KiB |
| Swap-in / swap-out за окно | 0 / 0 страниц |
| Диск после установки | около 11 GiB занято, 65 GiB свободно |
| Docker images / volumes | около 2.77 GB / 50 MB |

Отдельные cgroup peaks не суммировать как одновременный peak. В cgroup входят
части файлового кеша; Docker stats может вычитать кеш и показывать другое число.
Малое MemFree не означает нехватки RAM: смотреть на MemAvailable. Swap не менялся.
Ни swap-файл, ни аварийные OOM не маскировали недостаток памяти.

## Ограниченная HTTP Нагрузка

Генератор на Mac, не на VPS; только synthetic loopback SSH tunnel. 100 товаров,
смесь products/categories API, SSR catalog и product. Максимум 8 in-flight,
deadline 3 s, redirects запрещены. 540 scheduled, 539 фактически отправлены.
Начальная ступень частично пересекалась с mobile functional checkout, что
учтено как ограничение методики. Значения включают сеть/SSH/скачивание HTML,
не являются чистым временем Nest/PostgreSQL или SLA для клиентов Душанбе.

| Ступень | Отправлено | HTTP/network errors | Пропущено limiter | p50 | p95 | p99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 RPS, 60 s | 60 | 0 | 0 | 447 ms | 909 ms | 997 ms |
| 3 RPS, 60 s | 180 | 0 | 0 | 484 ms | 917 ms | 1253 ms |
| 5 RPS, 60 s | 299 | 0 | 1 | 603 ms | 1546 ms | 1974 ms |

Пятый RPS не объявляется безусловно успешным: была очередь до concurrency cap.
Автоостановка по MemAvailable <300 MiB/OOM не сработала, память оставалась с
запасом. Для больших объёмов/долгой нагрузки нужны отдельные тесты и цели SLA.

## PostgreSQL

Read-only indexed product/category join, warm cache, 2 clients, 15 s,
заданный target 50 TPS: 739 transactions, 0 failures, latency average 0.450 ms,
stddev 0.177 ms, actual около 49.4 TPS. Это throttled проверка обычного SELECT,
не определение максимального TPS, write/fsync latency или скорости всего диска.
Durability не отключалась. Первый диагностический запуск случайно включил
pgbench debug; его latency не использована, итоговый прогон выполнен без debug.

## Ограничения Перед Решением О Production

1. Для небольшого каталога и проверенной активности 2 GB достаточно, при условии
   off-VPS build. Не совмещать здесь install/build/test runner с реальным трафиком.
2. Полноценного soak test, large image processing, множества customer sessions,
   проверки сотен одновременных клиентов и busy-hour тарифа не было.
3. Зависимости требуют обновления и triage до публичного запуска. Локальный
   audit metadata сообщил 5 critical/29 high и другие advisories; не каждая
   автоматически применима, но зелёные тесты не заменяют устранение рисков.
4. Для production потребуются внешние backup + проверка restore, SSH/firewall/
   monitoring/secret retention, отдельный security review и проверенный DNS/TLS
   cutover. Этот пилот не отменяет план реагирования по старому FirstVDS.
5. Payom подключать только на доверенной системе, с новым IP whitelist и
   отдельным разрешением на реальную SMS. На старый сервер новые ключи не вводить.

## Ручная Проверка Стенда

На том же Mac при активном туннеле открыть `https://localhost:8443`.
Сертификат тестовый; браузер может показать предупреждение. Не отключать
проверки TLS глобально и не отправлять credentials по публичному HTTP.
Пароли сотрудников находятся только в закрытом `credentials.json` на новом VPS;
их не выводили в чат. Доступ к ним осуществлять приватным редактором/SFTP.
Туннель имеет отдельный control socket `/private/tmp/df-tarena-pilot-20261029.sock`.
