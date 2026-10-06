import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { StaffUser } from "@dushanbe-fresh/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DeliveryFinanceService } from "./delivery-finance.service";
import { DeliveryBackofficeService } from "./delivery-backoffice.service";
import { CashShiftsService } from "./cash-shifts.service";
import { OperationsService } from "../operations/operations.service";
import { CheckoutService } from "../checkout/checkout.service";
import { clearTestFinances } from "./test-cleanup";
import { financeInclude } from "./calculator";
import { PublicOrdersService } from "../public-orders/public-orders.module";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("delivery exceptions and cash accounting in PostgreSQL", () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const finance = new DeliveryFinanceService(db as never); const backoffice = new DeliveryBackofficeService(db as never, finance);
  const shifts = new CashShiftsService(db as never, finance); const ops = new OperationsService(db as never, finance); const checkout = new CheckoutService(db as never);
  const marker = `money-${randomUUID()}`; const slots: string[] = []; const customers: string[] = [];
  const tracking = new PublicOrdersService(db as never);
  const roles = { admin: ["admin"], ali: ["picker", "courier"], other: ["courier"], picker: ["picker"], till: ["courier"] } as const;
  const users = Object.fromEntries(Object.entries(roles).map(([key, roles]) => [key, { id: `${marker}-${key}`, name: key, email: `${marker}-${key}@test.local`, roles: [...roles] }])) as Record<keyof typeof roles, StaffUser>;
  const settings = { minimum_order_amount: "1", service_fee: "0", delivery_fee: "20", service_fee_percent: "10", default_picker_id: users.ali.id, default_courier_id: users.ali.id, customer_refusal_keep_fees: true };
  const saved = new Map<string, unknown>();
  let seq = 0;
  async function slot() {
    const id = `${marker}-slot${seq++}`; slots.push(id);
    await db.deliverySlot.create({ data: { id, date: new Date("2099-10-01"), startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 10 } }); return id;
  }
  async function fixture(courier = users.ali, percent: string | null = "10") {
    const slotId = await slot(); const id = `${marker}-order${seq++}`;
    const customer = await db.customer.create({ data: { phoneNormalized: `+992${String(700000000 + seq)}`, displayName: "Проверка денег" } }); customers.push(customer.id);
    const wave = await db.deliveryWave.create({ data: { deliverySlotId: slotId, status: "out_for_delivery", pickerUserId: users.ali.id, courierUserId: courier.id } });
    const order = await db.order.create({ data: { id, orderNumber: id, customerId: customer.id, deliverySlotId: slotId, deliveryWaveId: wave.id, status: "out_for_delivery",
      itemsSubtotal: "300", serviceFee: "30", serviceFeePercentSnapshot: percent, deliveryFee: "20", totalEstimated: "350", totalFinal: "350", substitutionPolicy: "contact_me",
      deliveryAddressSnapshot: { recipientName: "Проверка денег", phone: customer.phoneNormalized, street: "Тестовая", building: "1", city: "Душанбе" },
      items: { create: { productId: marker, productNameSnapshot: "Помидоры", unit: "kg", requestedQuantity: "3", finalQuantity: "3", saleUnitPriceSnapshot: "100", finalUnitPrice: "100", estimatedTotal: "300", finalTotal: "300", status: "picked" } }
    }, include: { items: true } });
    return { order, customer, wave, courier, line: order.items[0].id };
  }
  async function command(id: string, body: Record<string, unknown> = {}, user = users.ali) { return { version: (await finance.get(id, user)).version, requestId: randomUUID(), ...body }; }
  async function remove(f: Awaited<ReturnType<typeof fixture>>, quantity = "1", reason = "quality_problem", resolution = "accept_rest_remove_items", extra: Record<string, unknown> = {}) {
    return finance.issue(f.order.id, await command(f.order.id, { reason, resolution, items: [{ orderItemId: f.line, quantityAffected: quantity }], note: "Проверка при передаче", ...extra }, f.courier), f.courier);
  }
  async function collect(f: Awaited<ReturnType<typeof fixture>>, body: Record<string, unknown> = {}) { return finance.collect(f.order.id, await command(f.order.id, { mode: "full", ...body }, f.courier), f.courier); }
  beforeAll(async () => {
    if (!`${new URL(url!).pathname} ${new URL(url!).searchParams.get("schema")}`.includes("test")) throw new Error("Use test schema");
    for (const setting of await db.appSetting.findMany({ where: { key: { in: Object.keys(settings) } } })) saved.set(setting.key, setting.value);
    for (const [key, value] of Object.entries(settings)) await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    for (const user of Object.values(users)) await db.user.create({ data: { ...user, role: user.roles[0] } });
    await db.category.create({ data: { id: marker, name: "Тест финансов", slug: marker } });
    await db.product.create({ data: { id: marker, categoryId: marker, name: "Помидоры", slug: marker, unit: "kg", isWeighted: true, minQuantity: "0.5", quantityStep: "0.5", currentSalePrice: "100", currentPurchasePrice: "80" } });
  });
  afterAll(async () => {
    const orders = await db.order.findMany({ where: { deliverySlotId: { in: slots } }, select: { id: true, customerId: true } });
    await clearTestFinances(db, orders.map(order => order.id));
    await db.order.deleteMany({ where: { id: { in: orders.map(order => order.id) } } });
    await db.customer.deleteMany({ where: { id: { in: [...customers, ...orders.flatMap(order => order.customerId ? [order.customerId] : [])] } } });
    await db.deliverySlot.deleteMany({ where: { id: { in: slots } } });
    await db.operationalAudit.deleteMany({ where: { userId: { in: Object.values(users).map(user => user.id) } } });
    await db.user.deleteMany({ where: { id: { in: Object.values(users).map(user => user.id) } } });
    await db.product.deleteMany({ where: { id: marker } }); await db.category.deleteMany({ where: { id: marker } });
    await db.appSetting.deleteMany({ where: { key: { in: Object.keys(settings) } } });
    for (const [key, value] of saved) await db.appSetting.create({ data: { key, value: value as string } });
    await db.$disconnect();
  });
  it("A: removes 100 goods and 10 percentage fee from 350, keeping original snapshots", async () => {
    const f = await fixture(); const result = await remove(f);
    expect(result.payable).toBe("240.00"); expect(result.amountToCollect).toBe("240.00"); expect(result.outcome).toBe("partial");
    expect(result.adjustments.map(a => a.amount)).toEqual(["-100.00", "-10.00"]);
    const order = await db.order.findUniqueOrThrow({ where: { id: f.order.id }, include: { items: true } });
    for (const key of ["itemsSubtotal", "serviceFee", "deliveryFee", "totalEstimated", "totalFinal"] as const) expect(order[key]?.toString()).toBe(f.order[key]?.toString());
    expect(order.items[0].finalQuantity?.toString()).toBe("3");
    expect(result.originalCheckoutTotal).toBe("350.00");
  });
  it("keeps fixed service fee on partial refusal and handles fractional affected quantities", async () => {
    const fixed = await fixture(users.ali, null); expect((await remove(fixed)).payable).toBe("250.00");
    const f = await fixture(); expect((await remove(f, "0.6")).payable).toBe("284.00");
  });
  it("tracking uses the ledger after partial refusal and hides internal notes", async () => {
    const f = await fixture(); await remove(f, "0.6");
    const result = await tracking.get(f.order.publicTrackingToken);
    expect(result.money).toMatchObject({ original: "350.00", payable: "284.00", amountToCollect: "284.00", adjustments: [{ label: "Исключённые товары", amount: "-60.00" }, { label: "Уменьшение сервисного сбора", amount: "-6.00" }] });
    expect(result.items[0]).toMatchObject({ quantity: "2.400", total: "240.00" });
    expect(JSON.stringify(result)).not.toMatch(/responsibility|riskStatus|variance|createdByUserId|Проверка при передаче/);
  });
  it("tracking shows attention without internal payment accusations", async () => {
    const f = await fixture(); await collect(f, { mode: "unpaid", note: "PRIVATE: customer fault accusation" });
    const result = await tracking.get(f.order.publicTrackingToken);
    expect(result.status).toBe("needs_attention"); expect(result.message).toContain("требуется уточнение");
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|responsibility|unpaidIncidents|customer fault/);
  });
  it.each([false, true])("tracking shows a separate replacement with its slot and charges (prepaid=%s)", async prepaid => {
    const f = await fixture(); if (prepaid) await collect(f, { closeDelivery: false });
    await remove(f, "1", "wrong_item", "replacement_later", { deliverySlotId: await slot() });
    const result = await tracking.get(f.order.publicTrackingToken);
    expect(result.status).toBe("replacement_scheduled");
    expect(result.replacements[0]).toMatchObject({ prepaid, status: "order_received", deliverySlot: { date: "2099-10-01", startsAt: "10:00", endsAt: "12:00" }, money: { payable: prepaid ? "0.00" : "100.00", serviceFee: "0.00", deliveryFee: "0.00" } });
    expect(result.items[0].total).toBe(prepaid ? "300.00" : "200.00");
    expect(result.money.payable).toBe(prepaid ? "350.00" : "240.00");
  });
  it("tracking preserves ledger rounding after a prepaid replacement and a subsequent fractional refusal", async () => {
    const f = await fixture();
    await db.order.update({ where: { id: f.order.id }, data: { itemsSubtotal: "0.03", serviceFee: "0", deliveryFee: "0", serviceFeePercentSnapshot: null, totalEstimated: "0.03", totalFinal: "0.03" } });
    await db.orderItem.update({ where: { id: f.line }, data: { saleUnitPriceSnapshot: "0.01", finalUnitPrice: "0.01", estimatedTotal: "0.03", finalTotal: "0.03" } });
    await collect(f, { closeDelivery: false });
    await remove(f, "0.5", "wrong_item", "replacement_later", { deliverySlotId: await slot() });
    await remove(f, "0.5");
    const result = await tracking.get(f.order.publicTrackingToken);
    expect(result.money.payable).toBe("0.03"); expect(result.items[0].total).toBe("0.03");
    expect(result.items[0].quantity).toBe("2.500");
  });
  it("B: full service failure waives goods, service and delivery without cancelling the order", async () => {
    const f = await fixture(); const result = await remove(f, "3", "damaged_item", "full_refusal");
    expect(result.payable).toBe("0.00"); expect(result.status).toBe("out_for_delivery"); expect(result.outcome).toBe("service_failure");
    await collect(f); expect((await finance.get(f.order.id, users.ali)).status).toBe("delivered");
    expect((await db.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).confirmedCustomerFaultIncidents).toBe(0);
  });
  it("C: customer changed mind retains original fees but does not confirm customer fault", async () => {
    const f = await fixture(); const result = await remove(f, "3", "customer_changed_mind", "full_refusal");
    expect(result.payable).toBe("50.00");
    expect(await db.deliveryIssue.findUniqueOrThrow({ where: { id: result.issues[0].id } })).toMatchObject({ responsibility: "unknown", reviewStatus: "pending" });
    expect((await db.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).confirmedCustomerFaultIncidents).toBe(0);
    expect((await collect(f)).paymentStatus).toBe("paid");
  });
  it("D: unpaid fees record 50 expected, zero collected and pending discrepancy", async () => {
    const f = await fixture(); await remove(f, "3", "customer_changed_mind", "full_refusal");
    const result = await collect(f, { mode: "unpaid", note: "Клиент не оплатил сборы" });
    expect(result.paymentStatus).toBe("unpaid"); expect(result.collected).toBe("0.00"); expect(result.closedAt).not.toBeNull();
    const issue = await db.paymentIssue.findFirstOrThrow({ where: { orderId: f.order.id }, include: { issue: true } });
    expect(issue.expectedAmount.toFixed(2)).toBe("50.00"); expect(issue.variance.toFixed(2)).toBe("-50.00"); expect(issue.issue.reviewStatus).toBe("pending");
  });
  it("E: partial 20 of 50 leaves a -30 discrepancy and requires a reason", async () => {
    const f = await fixture(); await remove(f, "3", "customer_changed_mind", "full_refusal");
    await expect(collect(f, { mode: "partial", amount: "20" })).rejects.toThrow("Причина");
    const result = await collect(f, { mode: "partial", amount: "20", note: "Получено только 20" }); expect(result.paymentStatus).toBe("partial");
    expect((await db.paymentIssue.findFirstOrThrow({ where: { orderId: f.order.id } })).variance.toFixed(2)).toBe("-30.00");
  });
  it("rejects negative, excess and arbitrary full collection amounts", async () => {
    const f = await fixture();
    for (const amount of ["-1", "351", "350", "0"]) await expect(collect(f, { mode: "partial", amount, note: "Тест" })).rejects.toThrow();
    await expect(collect(f, { mode: "full", amount: "1" })).rejects.toThrow("системой");
  });
  it("F/G/H: only confirmed customer fault affects counters; rejection reverses a prior confirmation", async () => {
    const f = await fixture(); const result = await collect(f, { mode: "unpaid", note: "Не оплатил" }); const issueId = result.issues[0].id;
    const review = (status: string, verification = "customer_confirmed") => command(f.order.id, { responsibility: "customer", reviewStatus: status, customerVerification: verification, note: "Проверено звонком" }, users.admin);
    expect((await db.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).unpaidIncidents).toBe(0);
    await finance.review(issueId, await review("confirmed"), users.admin);
    expect(await db.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).toMatchObject({ confirmedCustomerFaultIncidents: 1, unpaidIncidents: 1, codPolicy: "allowed" });
    await finance.review(issueId, await review("confirmed"), users.admin);
    expect((await db.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).unpaidIncidents).toBe(1);
    await finance.review(issueId, await review("rejected"), users.admin);
    expect((await db.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).unpaidIncidents).toBe(0);
  });
  it("customer disputes raise priority without accusing courier or incrementing customer counters", async () => {
    const f = await fixture(); const result = await collect(f, { mode: "unpaid", note: "Не оплатил" });
    await finance.review(result.issues[0].id, await command(f.order.id, { responsibility: "disputed", reviewStatus: "pending", customerVerification: "customer_disputed", note: "Клиент утверждает, что передал деньги" }, users.admin), users.admin);
    expect((await backoffice.issues())[0].customerVerification).toBe("customer_disputed");
    expect((await db.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).unpaidIncidents).toBe(0);
  });
  it("repeated service-fault review never grants a percentage fee reduction twice", async () => {
    const f = await fixture(); const result = await remove(f, "1", "customer_changed_mind");
    for (let attempt = 0; attempt < 2; attempt++) {
      const reviewed = await finance.review(result.issues[0].id, await command(f.order.id, { responsibility: "service", reviewStatus: "confirmed", customerVerification: "customer_confirmed", note: "После звонка подтверждена ошибка сервиса" }, users.admin), users.admin);
      expect(reviewed.payable).toBe("240.00");
    }
  });
  it("I: unpaid replacement removes goods, reserves capacity, joins picking and charges only replacement goods", async () => {
    const f = await fixture(); const slotId = await slot();
    const result = await remove(f, "1", "wrong_item", "replacement_later", { deliverySlotId: slotId });
    expect(result.payable).toBe("240.00"); const recovery = result.replacements[0].fulfillmentOrder;
    const child = await db.order.findUniqueOrThrow({ where: { id: recovery.id } });
    expect(child.orderKind).toBe("service_recovery"); expect(child.deliveryFee.toString()).toBe("0"); expect(child.serviceFee.toString()).toBe("0"); expect(child.totalEstimated.toString()).toBe("100");
    const wave = await ops.wave(child.deliveryWaveId!, users.ali); expect(wave.pickingList[0].requestedQuantityTotal).toBe("1");
    await ops.waveStatus(wave.id, { status: "picking" }, users.ali);
    await ops.purchase(wave.id, wave.pickingList[0].id, { purchasedQuantity: "1", purchaseUnitPrice: "80" }, users.ali);
    await ops.packOrder(child.id, users.ali); await ops.waveStatus(wave.id, { status: "picked" }, users.ali); await ops.waveStatus(wave.id, { status: "out_for_delivery" }, users.ali);
    expect((await finance.collect(child.id, await command(child.id, { mode: "full" }), users.ali)).payable).toBe("100.00");
  });
  it("J: already paid replacement is free and does not refund the same goods", async () => {
    const f = await fixture(); await collect(f, { closeDelivery: false });
    const result = await remove(f, "1", "quality_problem", "replacement_later", { deliverySlotId: await slot() });
    expect(result.payable).toBe("350.00"); expect(result.refundDue).toBe("0.00"); expect(result.replacements[0].prepaid).toBe(true);
    expect((await db.order.findUniqueOrThrow({ where: { id: result.replacements[0].fulfillmentOrderId } })).totalEstimated.toString()).toBe("0");
    await finance.complete(f.order.id, await command(f.order.id), users.ali);
  });
  it("replacement reserves slot capacity and repeated submission creates only one recovery", async () => {
    const f = await fixture(); const target = await slot();
    await db.deliverySlot.update({ where: { id: target }, data: { capacityOrders: 1 } });
    const input = await command(f.order.id, { reason: "wrong_item", resolution: "replacement_later", deliverySlotId: target, items: [{ orderItemId: f.line, quantityAffected: "1" }], note: "Замена" });
    await Promise.all([finance.issue(f.order.id, input, users.ali), finance.issue(f.order.id, input, users.ali)]);
    expect(await db.replacementDelivery.count({ where: { originalOrderId: f.order.id } })).toBe(1);
    const other = await fixture();
    await expect(remove(other, "1", "wrong_item", "replacement_later", { deliverySlotId: target })).rejects.toThrow("недоступно");
    expect(await db.deliveryIssue.count({ where: { orderId: other.order.id } })).toBe(0);
  });
  it("rejects excessive and duplicate affected quantities without changing money", async () => {
    const f = await fixture();
    await expect(remove(f, "4")).rejects.toThrow("Количество");
    await expect(finance.issue(f.order.id, await command(f.order.id, { reason: "quality_problem", resolution: "accept_rest_remove_items", items: [{ orderItemId: f.line, quantityAffected: "1" }, { orderItemId: f.line, quantityAffected: "1" }] }), users.ali)).rejects.toThrow("позиция");
    expect((await finance.get(f.order.id, users.ali)).payable).toBe("350.00");
  });
  it("a fractional replacement transfers the exact rounded debt without charging an extra cent", async () => {
    const f = await fixture();
    await db.order.update({ where: { id: f.order.id }, data: { itemsSubtotal: "0.03", serviceFee: "0", deliveryFee: "0", serviceFeePercentSnapshot: null, totalEstimated: "0.03", totalFinal: "0.03" } });
    await db.orderItem.update({ where: { id: f.line }, data: { saleUnitPriceSnapshot: "0.01", finalUnitPrice: "0.01", estimatedTotal: "0.03", finalTotal: "0.03" } });
    await remove(f, "0.5");
    const result = await remove(f, "0.5", "quality_problem", "replacement_later", { deliverySlotId: await slot() });
    const child = await db.order.findUniqueOrThrow({ where: { id: result.replacements[0].fulfillmentOrderId } });
    const wave = await ops.wave(child.deliveryWaveId!, users.ali);
    await ops.waveStatus(wave.id, { status: "picking" }, users.ali);
    await ops.purchase(wave.id, wave.pickingList[0].id, { purchasedQuantity: "0.5", purchaseUnitPrice: "0.01" }, users.ali);
    await ops.packOrder(child.id, users.ali);
    expect((await finance.get(child.id, users.ali)).payable).toBe("0.00");
    expect(result.payable).toBe("0.02");
  });
  it("K/L/O: full collection then system refund creates immutable separate entries, once", async () => {
    const f = await fixture(); await collect(f, { closeDelivery: false }); await remove(f);
    const input = await command(f.order.id);
    await expect(finance.refund(f.order.id, { ...input, amount: "500" }, users.ali)).rejects.toThrow("система");
    await Promise.all([finance.refund(f.order.id, input, users.ali), finance.refund(f.order.id, input, users.ali)]);
    const rows = await db.cashTransaction.findMany({ where: { orderId: f.order.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map(row => row.amount.toFixed(2))).toEqual(["350.00", "-110.00"]);
    expect((await finance.get(f.order.id, users.ali)).collected).toBe("240.00");
    await expect(finance.refund(f.order.id, await command(f.order.id), users.ali)).rejects.toThrow("не требуется");
    await finance.complete(f.order.id, await command(f.order.id), users.ali);
  });
  it("M/N: another courier and a picker cannot edit financial state; price input is rejected", async () => {
    const f = await fixture(); const input = await command(f.order.id, { reason: "quality_problem", resolution: "full_refusal", items: [{ orderItemId: f.line, quantityAffected: "3" }], sellingPrice: "1" });
    await expect(finance.issue(f.order.id, input, users.ali)).rejects.toThrow("системой");
    for (const user of [users.other, users.picker]) {
      await expect(finance.get(f.order.id, user)).rejects.toThrow("не назначена");
      await expect(finance.collect(f.order.id, { ...input, mode: "full" }, user)).rejects.toThrow("не назначена");
    }
    expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id }, include: { items: true } })).items[0].saleUnitPriceSnapshot.toString()).toBe("100");
  });
  it("O: concurrent full collections with identical request keys produce one cash entry", async () => {
    const f = await fixture(); const input = await command(f.order.id, { mode: "full" });
    await Promise.all([finance.collect(f.order.id, input, users.ali), finance.collect(f.order.id, input, users.ali)]);
    expect(await db.cashTransaction.count({ where: { orderId: f.order.id } })).toBe(1);
    await expect(finance.collect(f.order.id, { ...input, mode: "unpaid" }, users.ali)).rejects.toThrow("другими данными");
  });
  it("concurrent admin and courier financial actions cannot both commit from one version", async () => {
    const f = await fixture(); const version = (await finance.get(f.order.id, users.ali)).version;
    const responses = await Promise.allSettled([
      finance.adjustment(f.order.id, { requestId: randomUUID(), version, type: "delivery_fee_waiver", note: "Задержка доставки" }, users.admin),
      finance.issue(f.order.id, { requestId: randomUUID(), version, reason: "quality_problem", resolution: "accept_rest_remove_items", items: [{ orderItemId: f.line, quantityAffected: "1" }] }, users.ali)
    ]);
    expect(responses.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect((await finance.get(f.order.id, users.admin)).version).toBe(1);
  });
  it("P/Q: shift accounts for collections/refunds and requires a note for variance", async () => {
    const f = await fixture(users.till); await collect(f, { closeDelivery: false }); await remove(f);
    await finance.refund(f.order.id, await command(f.order.id, {}, users.till), users.till);
    await finance.complete(f.order.id, await command(f.order.id, {}, users.till), users.till);
    const shift = (await shifts.list(users.till))[0]; expect(shift.expectedCash).toBe("240.00"); expect(shift.refundTotal).toBe("110.00");
    await expect(shifts.submit(shift.id, { declaredCash: "230" }, users.till)).rejects.toThrow("Причина");
    await shifts.submit(shift.id, { declaredCash: "230", note: "Не хватает 10" }, users.till);
    expect((await shifts.list(users.till))[0].status).toBe("discrepancy");
    await shifts.reconcile(shift.id, { status: "discrepancy", note: "Назначена проверка" }, users.admin);
    await expect(finance.refund(f.order.id, await command(f.order.id, {}, users.till), users.till)).rejects.toThrow("закрыта");
    expect((await shifts.statistics()).find(row => row.id === users.till.id)?.reportedCollected).toBe("350.00");
  });
  it("R: guest identity is phone-based; manual/blocked/disabled customers wait for admin without a wave", async () => {
    const f = await fixture();
    for (const policy of ["manual_review", "blocked", "disabled", "restricted"] as const) {
      await db.customer.update({ where: { id: f.customer.id }, data: { codPolicy: policy === "disabled" || policy === "restricted" ? "allowed" : policy, isActive: policy !== "disabled", riskStatus: policy === "restricted" ? "restricted" : "normal" } });
      const input = { deliverySlotId: await slot(), items: [{ productId: marker, quantity: "3", qualityOptionId: null }] };
      const quote = await checkout.validate(input); const receipt = await checkout.createOrder({ ...input, requestId: randomUUID(), reviewToken: quote.reviewToken,
        name: "Другое имя того же телефона", phone: f.customer.phoneNormalized, substitutionPolicy: "contact_me", address: { street: "Тестовая", building: "2", apartment: "", entrance: "", floor: "", instructions: "" } });
      const order = await db.order.findUniqueOrThrow({ where: { orderNumber: receipt.orderNumber } });
      expect(order.customerId).toBe(f.customer.id); expect(order.status).toBe("pending_review"); expect(order.deliveryWaveId).toBeNull(); expect(receipt.requiresConfirmation).toBe(true);
      await ops.updateOrderStatus(order.id, { status: "confirmed" }, users.admin);
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).deliveryWaveId).not.toBeNull();
    }
    expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).deliveryAddressSnapshot).toMatchObject({ recipientName: "Проверка денег" });
  });
  it("S: failed attempts keep delivery open and never automatically penalize customer", async () => {
    const f = await fixture(); await finance.issue(f.order.id, await command(f.order.id, { reason: "customer_unreachable", resolution: "escalate_to_admin", nextAction: "retry_same_wave", note: "Два звонка" }), users.ali);
    const order = await db.order.findUniqueOrThrow({ where: { id: f.order.id }, include: financeInclude });
    expect(order.status).toBe("out_for_delivery"); expect(order.attempts).toHaveLength(1); expect(order.adjustments).toHaveLength(0);
    expect(order.issues[0].note).toContain("повторить в этой волне");
    expect((await db.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).confirmedCustomerFaultIncidents).toBe(0);
  });
  it("reschedules packed goods without repurchasing them and reuses the delivery-wave stages", async () => {
    const f = await fixture(); const target = await slot();
    await backoffice.reschedule(f.order.id, { deliverySlotId: target, version: 0, note: "Согласовано с клиентом" }, users.admin);
    const order = await db.order.findUniqueOrThrow({ where: { id: f.order.id } }); expect(order.requiresPicking).toBe(false);
    const wave = await ops.wave(order.deliveryWaveId!); expect(wave.pickingList).toEqual([]);
    await ops.waveStatus(wave.id, { status: "picking" }, users.ali); await ops.waveStatus(wave.id, { status: "picked" }, users.ali); await ops.waveStatus(wave.id, { status: "out_for_delivery" }, users.ali);
    expect((await finance.get(f.order.id, users.ali)).payable).toBe("350.00");
  });
  it("post-delivery admin compensation is audited without reopening courier finance permissions", async () => {
    const f = await fixture(); await collect(f);
    await expect(remove(f)).rejects.toThrow("закрыта");
    const changed = await finance.adjustment(f.order.id, await command(f.order.id, { type: "admin_compensation", amount: "10", note: "Жалоба после доставки" }, users.admin), users.admin);
    expect(changed.refundDue).toBe("10.00");
    await expect(finance.adjustment(f.order.id, await command(f.order.id, { type: "admin_compensation", amount: "1" }, users.admin), users.admin)).rejects.toThrow("Причина");
    expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).totalFinal?.toFixed(2)).toBe("350.00");
  });
});
