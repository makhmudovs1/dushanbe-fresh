import type { CustomerProfile } from "@dushanbe-fresh/shared";
// Mirrors current WEB customer-login.ts; no DOM or cookie dependencies.
export function nationalPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (value.trim().startsWith("+") && !digits.startsWith("992")) return "";
  return (
    digits.length > 9 && digits.startsWith("992") ? digits.slice(3) : digits
  ).slice(0, 9);
}
export function formatNationalPhone(value: string) {
  return [
    value.slice(0, 2),
    value.slice(2, 5),
    value.slice(5, 7),
    value.slice(7, 9),
  ]
    .filter(Boolean)
    .join(" ");
}
export function editableName(user: CustomerProfile | null) {
  if (user?.firstName || user?.lastName)
    return { firstName: user.firstName ?? "", lastName: user.lastName ?? "" };
  const [firstName = "", ...rest] = (user?.name ?? "").trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}
export function validNameParts(firstName: string, lastName: string) {
  const first = firstName.trim(),
    last = lastName.trim();
  return (
    !!first &&
    !!last &&
    first.length <= 50 &&
    last.length <= 50 &&
    `${first} ${last}`.length <= 100 &&
    !Array.from(first + last).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  );
}
