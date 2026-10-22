import { Product } from "@/lib/api";

export const CART_STORAGE_KEY = "dushanbe-fresh.cart.v1";

export type CartItem = {
  productId: string;
  slug: string;
  name: string;
  nameTj?: string | null;
  imageUrl: string | null;
  unit: string;
  sellingPrice: string;
  isWeighted: boolean;
  quantity: string;
  minQuantity: string;
  quantityStep: string;
  qualityOptionId: string | null;
  qualityOptionLabel: string | null;
  qualityOptionLabelTj?: string | null;
};

export type CartState = {
  items: CartItem[];
};

export type AddToCartInput = {
  product: Product;
  quantity: string;
  qualityOptionId?: string | null;
};

export type CartAction =
  | { type: "repeat"; items: CartItem[] }
  | { type: "add"; item: CartItem }
  | { type: "increment"; key: string }
  | { type: "decrement"; key: string }
  | { type: "remove"; key: string }
  | { type: "clear" }
  | { type: "hydrate"; state: CartState };

const QUANTITY_SCALE = 1000;
const MONEY_SCALE = 100;

export const emptyCartState: CartState = {
  items: []
};

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "repeat":
      return action.items.reduce((current, fresh) => {
        const existing = current.items.find(item => getCartItemKey(item) === getCartItemKey(fresh));
        const item = { ...fresh, quantity: normalizeQuantity(existing ? addQuantity(existing.quantity, fresh.quantity) : fresh.quantity, fresh.minQuantity, fresh.quantityStep) };
        return { items: existing ? current.items.map(old => getCartItemKey(old) === getCartItemKey(item) ? item : old) : [...current.items, item] };
      }, state);
    case "clear":
      return { items: [] };
    case "add":
      return addCartItem(state, action.item);
    case "increment":
      return updateCartItemQuantity(state, action.key, "increment");
    case "decrement":
      return updateCartItemQuantity(state, action.key, "decrement");
    case "remove":
      return {
        items: state.items.filter((item) => getCartItemKey(item) !== action.key)
      };
    case "hydrate":
      return action.state;
    default:
      return state;
  }
}

export function createCartItem(input: AddToCartInput): CartItem {
  const selectedOption = input.qualityOptionId
    ? input.product.qualityOptions.find((option) => option.id === input.qualityOptionId)
    : null;

  const fallbackOption =
    input.product.qualityOptions.find((option) =>
      option.label.toLowerCase().includes("выбор сборщика")
    ) ?? input.product.qualityOptions[0];

  const qualityOption = input.qualityOptionId === null ? null : selectedOption ?? fallbackOption ?? null;
  const quantity = normalizeQuantity(
    input.quantity,
    input.product.minQuantity,
    input.product.quantityStep
  );

  return {
    productId: input.product.id,
    slug: input.product.slug,
    name: input.product.name,
    nameTj: input.product.nameTj,
    imageUrl: input.product.image,
    unit: input.product.unit,
    sellingPrice: input.product.sellingPrice,
    isWeighted: input.product.isWeighted,
    quantity,
    minQuantity: input.product.minQuantity,
    quantityStep: input.product.quantityStep,
    qualityOptionId: qualityOption?.id ?? null,
    qualityOptionLabel: qualityOption?.label ?? null,
    qualityOptionLabelTj: qualityOption?.labelTj ?? null
  };
}

export function addCartItem(state: CartState, nextItem: CartItem): CartState {
  const nextKey = getCartItemKey(nextItem);
  const existingItem = state.items.find((item) => getCartItemKey(item) === nextKey);

  if (!existingItem) {
    return {
      items: [...state.items, nextItem]
    };
  }

  return {
    items: state.items.map((item) => {
      if (getCartItemKey(item) !== nextKey) {
        return item;
      }

      return {
        ...item,
        quantity: addQuantity(item.quantity, nextItem.quantity)
      };
    })
  };
}

export function getCartItemKey(item: Pick<CartItem, "productId" | "qualityOptionId">) {
  return `${item.productId}:${item.qualityOptionId ?? "none"}`;
}

export function incrementQuantity(item: CartItem) {
  return addQuantity(item.quantity, item.quantityStep);
}

export function decrementQuantity(item: CartItem) {
  const current = parseQuantity(item.quantity);
  const min = parseQuantity(item.minQuantity);
  const step = parseQuantity(item.quantityStep);
  const next = Math.max(min, current - step);

  return formatQuantity(next);
}

export function adjustQuantity(
  quantity: string,
  minQuantity: string,
  quantityStep: string,
  direction: "increment" | "decrement"
) {
  const current = parseQuantity(quantity);
  const min = parseQuantity(minQuantity);
  const step = parseQuantity(quantityStep);
  const next = direction === "increment" ? current + step : Math.max(min, current - step);

  return formatQuantity(next);
}

export function normalizeQuantity(quantity: string, minQuantity: string, quantityStep: string) {
  const parsedQuantity = parseQuantity(quantity);
  const min = parseQuantity(minQuantity);
  const step = parseQuantity(quantityStep);

  if (parsedQuantity <= 0 || parsedQuantity < min) {
    return formatQuantity(min);
  }

  const distanceFromMin = parsedQuantity - min;
  const steps = Math.ceil(distanceFromMin / step);
  const normalized = min + Math.max(0, steps) * step;

  return formatQuantity(normalized);
}

export function calculateItemSubtotalMinor(item: CartItem) {
  const priceMinor = parseMoney(item.sellingPrice);
  const quantityUnits = parseQuantity(item.quantity);

  return Math.round((priceMinor * quantityUnits) / QUANTITY_SCALE);
}

export function calculateCartSubtotalMinor(state: CartState) {
  return state.items.reduce(
    (sum, item) => sum + calculateItemSubtotalMinor(item),
    0
  );
}

export function hasWeightedItems(state: CartState) {
  return state.items.some((item) => item.isWeighted);
}

export function formatMoneyFromMinor(minorUnits: number) {
  const whole = Math.trunc(minorUnits / MONEY_SCALE);
  const cents = Math.abs(minorUnits % MONEY_SCALE).toString().padStart(2, "0");

  return `${whole}.${cents}`;
}

export function loadCart(storage: Storage | undefined): CartState {
  if (!storage) {
    return emptyCartState;
  }

  try {
    const raw = storage.getItem(CART_STORAGE_KEY);

    if (!raw) {
      return emptyCartState;
    }

    return sanitizeCartState(JSON.parse(raw));
  } catch {
    return emptyCartState;
  }
}

export function saveCart(storage: Storage | undefined, state: CartState) {
  if (!storage) {
    return;
  }

  storage.setItem(CART_STORAGE_KEY, JSON.stringify(state));
}

function updateCartItemQuantity(
  state: CartState,
  key: string,
  direction: "increment" | "decrement"
): CartState {
  return {
    items: state.items.map((item) => {
      if (getCartItemKey(item) !== key) {
        return item;
      }

      return {
        ...item,
        quantity:
          direction === "increment" ? incrementQuantity(item) : decrementQuantity(item)
      };
    })
  };
}

function addQuantity(left: string, right: string) {
  return formatQuantity(parseQuantity(left) + parseQuantity(right));
}

export function sumCartQuantities(items: Pick<CartItem, "quantity">[]) {
  return items.reduce((total, item) => addQuantity(total, item.quantity), "0");
}

function parseMoney(value: string) {
  return parseScaledDecimal(value, MONEY_SCALE, 2);
}

function parseQuantity(value: string) {
  return parseScaledDecimal(value, QUANTITY_SCALE, 3);
}

function parseScaledDecimal(value: string, scale: number, precision: number) {
  const [whole = "0", fraction = ""] = value.split(".");
  const normalizedFraction = fraction.slice(0, precision).padEnd(precision, "0");

  return Number(whole) * scale + Number(normalizedFraction);
}

function formatQuantity(quantityUnits: number) {
  const whole = Math.trunc(quantityUnits / QUANTITY_SCALE);
  const fraction = Math.abs(quantityUnits % QUANTITY_SCALE)
    .toString()
    .padStart(3, "0")
    .replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

function sanitizeCartState(value: unknown): CartState {
  if (!value || typeof value !== "object" || !Array.isArray((value as CartState).items)) {
    return emptyCartState;
  }

  const items = (value as CartState).items.filter(isCartItem);

  return { items };
}

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as CartItem;

  return (
    typeof item.productId === "string" &&
    typeof item.slug === "string" &&
    typeof item.name === "string" &&
    typeof item.unit === "string" &&
    typeof item.sellingPrice === "string" &&
    typeof item.isWeighted === "boolean" &&
    typeof item.quantity === "string" &&
    typeof item.minQuantity === "string" &&
    typeof item.quantityStep === "string"
  );
}
