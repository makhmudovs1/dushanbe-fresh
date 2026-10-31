# Критические Findings Перед Реальным Переносом

31 октября 2026, МСК. Рассмотрены конкретные пакеты/пути, без blanket ignore.

## API И Web

Единственный Critical в ранее проверенных минимальных API/Web images:
`CVE-2023-45853`, Debian bookworm `zlib1g 1:1.2.13.dfsg-1`.

Вендор прямо относит проблему к contrib/minizip, который эта версия source
package не собирает в binary zlib1g. Проверен точный installed package в API;
отдельного libminizip.so.1 в стандартном runtime path нет. Основание не отсутствие
публичного exploit, а неприсутствующий уязвимый binary code в данном package.
Это не исключение любых других zlib/Sharp/Node advisories.

[Debian vendor tracker](https://security-tracker.debian.org/tracker/CVE-2023-45853).
[API scan](container-api-hardened-20261031.json),
[Web scan](container-web-hardened-20261031.json).

## PostgreSQL

В новом production не используется прежний bookworm PG image с findings
libsqlite3/libxml2. Выбран официальный PostgreSQL16.15 Alpine, digest
`sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab`.
Старая БД также16.15; перенос только логических значений в новую схему, не datadir.

[Офлайн scan](container-postgres-alpine-20261031.json): Critical1, High25.
Единственный Critical — `CVE-2025-68121`, Go stdlib1.24.6 внутри
`/usr/local/bin/gosu`1.19. Проблема требует вызовов crypto/tls и изменения
ClientCAs/RootCAs между handshake/resumption. gosu не TLS-сервер/клиент; он
выставляет UID/GID и exec-заменяет себя PostgreSQL при entrypoint. В нашем запуске
эти TLS code paths недостижимы; HTTPS обслуживает отдельный Caddy.
Не приравнивать embedded Go version scanner finding к уязвимому PostgreSQL TLS.

[Первичный Go advisory](https://pkg.go.dev/vuln/GO-2026-4337),
[gosu security policy](https://github.com/tianon/gosu/security),
[gosu runtime model](https://github.com/tianon/gosu).

## Границы Вывода

- У рассмотренных production API/Web/нового PG нет установленных применимых
  Critical из полученных scan reports. Не утверждается отсутствие любых CVE.
- У proxy hardened image Critical0, High7; noncritical findings остаются в
  [полном отчёте](container-proxy-hardened-20261031.json), не удаляются из учёта.
- ОС VPS, внешние аккаунты и компрометация старого источника этим не аттестованы.
- Этот applicability review не разрешает DNS cutover без независимой проверенной
  копии реальных данных, TLS, single-writer freeze и подтверждения владельца.
