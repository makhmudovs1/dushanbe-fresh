export const issueReasonLabels = {
  quality_problem: "Качество товара", damaged_item: "Товар повреждён", wrong_item: "Привезли не тот товар",
  missing_item_or_quantity: "Не хватает товара", customer_changed_mind: "Клиент передумал", customer_unreachable: "Не отвечает",
  customer_not_home: "Нет дома", wrong_address: "Неверный или неполный адрес", delivery_delay: "Опоздание",
  payment_problem: "Проблема с оплатой", price_dispute: "Спор о сумме", other: "Другая проблема"
} as const;
export const resolutionLabels = { accept_rest_remove_items: "Принять остальное, убрать позиции", full_refusal: "Полный отказ", replacement_later: "Замена в другое окно", payment_issue: "Проблема с оплатой", escalate_to_admin: "Передать администратору" } as const;
export const responsibilityLabels = { service: "Сервис", customer: "Клиент", disputed: "Спорная", unknown: "Не определена" } as const;
export const verificationLabels = { not_checked: "Не проверено", customer_confirmed: "Клиент подтвердил", customer_disputed: "Клиент оспаривает" } as const;
export const reviewLabels = { pending: "Ожидает проверки", confirmed: "Подтверждено", rejected: "Отклонено" } as const;
export const issueStatusLabels = { open: "Открыто", awaiting_admin: "Требует внимания", resolved: "Разобрано", rejected: "Отклонено" } as const;
export const adjustmentLabels = { goods_removed: "Исключённые товары", service_fee_reduction: "Уменьшение сервисного сбора", service_fee_waiver: "Отмена сервисного сбора", delivery_fee_waiver: "Отмена стоимости доставки", admin_compensation: "Компенсация", correction: "Корректировка" } as const;
export const outcomeLabels = { full: "Полная доставка", partial: "Частичный отказ", refused: "Отказ при передаче", replacement_pending: "Ожидается замена", service_failure: "Срыв доставки по вине сервиса" } as const;
export const shiftLabels = { open: "Открыта", submitted: "Сдана на сверку", reconciled: "Сверена", discrepancy: "Расхождение" } as const;
export const codLabels = { allowed: "Обычное оформление", manual_review: "Подтверждение оператором", blocked: "Наложенный платёж ограничен: через оператора" } as const;
export const riskLabels = { normal: "Обычный", watch: "Наблюдение", restricted: "Ограничения" } as const;
export type DeliveryIssueDto = { id: string; orderId: string; reason: keyof typeof issueReasonLabels; resolution: keyof typeof resolutionLabels;
  responsibility: keyof typeof responsibilityLabels; status: keyof typeof issueStatusLabels; reviewStatus: keyof typeof reviewLabels;
  customerVerification: keyof typeof verificationLabels; note: string; reviewNote: string | null; createdAt: string };
export type DeliveryFinanceDto = {
  id: string; orderNumber: string; status: string; paymentStatus: string; customerId?: string | null;
  outcome: keyof typeof outcomeLabels; version: number; closedAt: string | null;
  originalCheckoutTotal: string; originalPackedTotal: string; goods: string; serviceFee: string; deliveryFee: string; discountTotal: string;
  adjustmentTotal: string; payable: string; collected: string; amountToCollect: string; refundDue: string;
  canAct: boolean; collectionReported: boolean;
  items: Array<{ id: string; name: string; unit: string; quantity: string; price: string; removed: string; remaining: string }>;
  adjustments: Array<{ id: string; type: keyof typeof adjustmentLabels; amount: string; reason: string; createdAt: string }>;
  issues: Array<Pick<DeliveryIssueDto, "id" | "reason" | "resolution" | "status" | "note"> & Partial<DeliveryIssueDto>>;
  attempts: Array<{ id: string; reason: keyof typeof issueReasonLabels; note: string; attemptedAt: string; proposedSlotId: string | null }>;
  replacements: Array<{ id: string; prepaid: boolean; fulfillmentOrder: { id: string; orderNumber: string; status: string } }>;
  cash: Array<{ id: string; type: "collection" | "cash_refund" | "correction"; amount: string; note: string; createdAt: string }>;
};
export type IssuePreview = { version: number; before: string; after: string; adjustments: Array<{ type: keyof typeof adjustmentLabels; amount: string }>; refund: string; replacementDue: string; requiresAdmin: boolean };
export type CashShiftDto = { id: string; courierId: string; courierName: string | null; openedAt: string; closedAt: string | null; status: keyof typeof shiftLabels;
  expectedCash: string; declaredCash: string | null; variance: string | null; collectionTotal: string; refundTotal: string; correctionTotal: string; ordersCount: number; note: string | null; reviewNote: string | null };
