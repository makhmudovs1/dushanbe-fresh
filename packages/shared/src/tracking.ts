export const customerStatusLabels = {
  order_received: "Заказ принят",
  preparing: "Собираем заказ",
  packed: "Заказ собран",
  out_for_delivery: "Курьер в пути",
  delivered: "Доставлен",
  needs_attention: "Требуется уточнение",
  replacement_scheduled: "Запланирована замена",
  cancelled: "Отменён"
} as const;
export type CustomerOrderStatus = keyof typeof customerStatusLabels;
export type PublicOrderSlot = { date: string; startsAt: string; endsAt: string };
export type PublicOrderLine = { name: string; nameTj?: string | null; quantity: string; unit: string; total: string };
export type PublicOrderMoney = {
  goods: string; serviceFee: string; deliveryFee: string; discount: string;
  original: string; payable: string; collected: string; amountToCollect: string; refundDue: string;
  adjustments: { label: string; amount: string }[];
};
export type PublicOrderDto = {
  orderNumber: string;
  status: CustomerOrderStatus;
  progress: number;
  message: string | null;
  deliverySlot: PublicOrderSlot;
  address: { city: string; street: string; building: string; apartment: string; entrance: string; floor: string };
  items: PublicOrderLine[];
  money: PublicOrderMoney;
  replacements: {
    orderNumber: string; status: CustomerOrderStatus; deliverySlot: PublicOrderSlot;
    items: PublicOrderLine[]; money: PublicOrderMoney; prepaid: boolean;
  }[];
};
