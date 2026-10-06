import { BadRequestException } from "@nestjs/common";

export function normalizePhone(value: string, local = { countryCode: "992", nationalLength: 9 }) {
  let phone = value.replace(/[\s()-]/g, "");
  if (/^\d+$/.test(phone) && phone.length === local.nationalLength) phone = `+${local.countryCode}${phone}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new BadRequestException("Введите телефон с кодом страны, например +992 900 00 00 00.");
  return phone;
}
