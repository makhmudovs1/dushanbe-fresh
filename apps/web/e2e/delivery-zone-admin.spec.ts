import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { parseDeliveryZone, type DeliveryZoneState, unrestrictedDeliveryZone } from "@dushanbe-fresh/shared";

test.use({ trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" });
test.setTimeout(90000);
const polygon = { type: "Polygon", coordinates: [[[68.76,38.55],[68.80,38.55],[68.80,38.60],[68.76,38.60],[68.76,38.55]]] };

async function fixture(page: Page, context: BrowserContext, baseURL: string) {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL).hostname);
  let saved: DeliveryZoneState = { zone: { ...unrestrictedDeliveryZone }, revision: null }, changes = 0, conflict = false;
  const errors: string[] = [], writes: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  await context.route("**/api/v1/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/api/v1/auth/refresh") return route.fulfill({ json: { accessToken: "local-test-only", user: { id: "test-admin", name: "Тест администратора", roles: ["admin"] } } });
    if (path === "/api/v1/customer-auth/status") return route.fulfill({ json: { enabled: false, requiredForCheckout: false } });
    if (path === "/api/v1/admin/settings/delivery-zone") {
      if (request.method() === "PATCH") {
        const input = request.postDataJSON();
        if (conflict || input.expectedRevision !== saved.revision) return route.fulfill({ status: 409, json: { message: "Зона уже изменена другим администратором. Обновите страницу." } });
        const zone = parseDeliveryZone(input.zone);
        if (!zone) return route.fulfill({ status: 400, json: {} });
        changes++; saved = { zone, revision: `revision-${changes}` };
      }
      return route.fulfill({ json: saved });
    }
    if (request.method() !== "GET") { writes.push(path); return route.abort(); }
    return route.fulfill({ status: 403, json: {} });
  });
  await page.goto("/admin/settings/delivery-zone");
  const map = page.getByRole("region", { name: "Редактор зоны доставки", exact: true });
  await expect(map).toBeVisible();
  await expect(page.getByRole("button", { name: "Нарисовать зону", exact: true })).toBeEnabled();
  await expect.poll(() => map.locator(".leaflet-tile-loaded").count(), { timeout: 20000 }).toBeGreaterThan(0);
  return { map, state: () => saved, changes: () => changes, setConflict: () => { conflict = true; }, errors, writes };
}

for (const width of [390,1440]) test(`admin imports, saves, disables and reenables the same polygon ${width}`, async ({ page, context, baseURL }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const { map, state, changes, errors, writes, setConflict } = await fixture(page, context, baseURL!);
  await expect(page.getByRole("checkbox", { name: "Ограничить доставку зоной", exact: true })).not.toBeChecked();
  await page.getByLabel("Файл GeoJSON", { exact: true }).setInputFiles({ name: "zone.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(polygon)) });
  const enabled = page.getByRole("checkbox", { name: "Ограничить доставку зоной", exact: true });
  await enabled.check();
  await page.getByRole("button", { name: "Сохранить зону", exact: true }).click();
  await expect.poll(changes).toBe(1);
  await expect(page.getByText("Изменений нет", { exact: true })).toBeVisible();
  expect(state().zone).toMatchObject({ enabled: true, polygon });
  await expect.poll(() => map.locator(".leaflet-tile:not(.leaflet-tile-loaded)").count(), { timeout: 20000 }).toBe(0);
  await page.waitForTimeout(250);
  await page.screenshot({ path: info.outputPath(`zone-admin-enabled-${width}.png`), animations: "disabled", fullPage: true });
  await enabled.uncheck(); await page.getByRole("button", { name: "Сохранить зону", exact: true }).click();
  await expect.poll(changes).toBe(2);
  await page.reload();
  await expect(enabled).not.toBeChecked(); expect(state().zone.polygon).toEqual(polygon);
  await enabled.check(); await page.getByRole("button", { name: "Сохранить зону", exact: true }).click();
  await expect.poll(changes).toBe(3);
  expect(state().zone.polygon).toEqual(polygon);
  setConflict(); await enabled.uncheck(); await page.getByRole("button", { name: "Сохранить зону", exact: true }).click();
  await expect(page.getByText("Зона уже изменена другим администратором. Обновите страницу.", { exact: true })).toBeVisible();
  expect(state().zone.enabled).toBe(true); expect(changes()).toBe(3);
  expect(errors).toEqual([]); expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.unrouteAll({ behavior: "ignoreErrors" });
});

test("admin draws an actual polygon and edits its vertices before saving", async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { map, state, changes, errors } = await fixture(page, context, baseURL!);
  await page.getByRole("button", { name: "Нарисовать зону", exact: true }).click();
  const box = (await map.boundingBox())!;
  for (const [x,y] of [[.35,.3],[.65,.3],[.65,.65],[.35,.65]]) await page.mouse.click(box.x + box.width*x, box.y + box.height*y);
  await page.getByRole("button", { name: "Завершить многоугольник", exact: true }).click();
  await expect(page.getByText("4 вершин", { exact: true })).toBeVisible();
  const marker = map.locator(".marker-icon:not(.marker-icon-middle)").first();
  await expect(marker).toBeVisible();
  const vertex = (await marker.boundingBox())!;
  await page.mouse.move(vertex.x + vertex.width/2, vertex.y + vertex.height/2);
  await page.mouse.down(); await page.mouse.move(vertex.x + vertex.width/2 - 25, vertex.y + vertex.height/2 + 15, { steps: 5 }); await page.mouse.up();
  await page.getByRole("checkbox", { name: "Ограничить доставку зоной", exact: true }).check();
  await page.getByRole("button", { name: "Сохранить зону", exact: true }).click();
  await expect.poll(changes).toBe(1);
  expect(state().zone.polygon?.coordinates[0]).toHaveLength(5);
  expect(errors).toEqual([]);
  await context.unrouteAll({ behavior: "ignoreErrors" });
});
