// Integer fixed-point arithmetic: 3 decimal places for quantity, 2 for TJS.
export function fixed(value: string, digits: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("INVALID_DECIMAL");
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.length > digits) throw new Error("INVALID_DECIMAL");
  return (
    BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0"))
  );
}
export function decimal(value: bigint, digits: number): string {
  const scale = 10n ** BigInt(digits);
  const fraction = (value % scale)
    .toString()
    .padStart(digits, "0")
    .replace(/0+$/, "");
  return `${value / scale}${fraction ? `.${fraction}` : ""}`;
}
export function validQuantity(
  quantity: string,
  min: string,
  step: string,
): boolean {
  try {
    const q = fixed(quantity, 3),
      m = fixed(min, 3),
      s = fixed(step, 3);
    return s > 0n && m > 0n && q >= m && q <= 999999999n && (q - m) % s === 0n;
  } catch {
    return false;
  }
}
export function changeQuantity(
  quantity: string | undefined,
  min: string,
  step: string,
  direction: 1 | -1,
): string {
  const m = fixed(min, 3),
    s = fixed(step, 3);
  if (m <= 0n || s <= 0n) throw new Error("INVALID_QUANTITY_RULES");
  if (!quantity || quantity === "0") return direction === 1 ? min : "0";
  if (!validQuantity(quantity, min, step)) throw new Error("QUANTITY_CHANGED");
  const next = fixed(quantity, 3) + BigInt(direction) * s;
  if (next > 999999999n) return quantity;
  return next < m ? "0" : decimal(next, 3);
}
export function lineCents(price: string, quantity: string): bigint {
  return (fixed(price, 2) * fixed(quantity, 3) + 500n) / 1000n; // HALF_UP per line, matching API
}
export function money(cents: bigint): string {
  return `${cents / 100n},${(cents % 100n).toString().padStart(2, "0")}`;
}

// Explicit repeat-order action uses today's rules, matching WEB's normalization.
export function normalizePurchaseQuantity(
  value: string,
  min: string,
  step: string,
) {
  const q = fixed(value, 3),
    m = fixed(min, 3),
    s = fixed(step, 3);
  if (m <= 0n || s <= 0n) throw new Error("INVALID_QUANTITY_RULES");
  return decimal(q <= m ? m : m + ((q - m + s - 1n) / s) * s, 3);
}
