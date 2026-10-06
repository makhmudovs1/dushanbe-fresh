import { BadRequestException } from "@nestjs/common";

import { CategoryInput, ProductInput, ProductUpdateInput } from "./catalog.types";

const decimalPattern = /^\d+(\.\d{1,3})?$/;
const moneyPattern = /^\d+(\.\d{1,2})?$/;
const fieldLabels: Record<string, string> = {
  categoryId: "Категория", name: "Название", slug: "Адрес в каталоге", description: "Описание",
  image: "Фотография", unit: "Единица измерения", sellingPrice: "Цена для клиента",
  purchasePrice: "Ориентир закупки", minQuantity: "Минимальное количество", quantityStep: "Шаг количества",
  sortOrder: "Порядок", isActive: "Включён", isAvailableToday: "Доступен сегодня", isWeighted: "Весовой товар"
};
const fieldLabel = (field: string) => fieldLabels[field] ?? "Предпочтения по качеству";

function assertString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`Заполните поле «${fieldLabel(field)}».`);
  }

  return value.trim();
}

function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return assertString(value, field);
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new BadRequestException(`Проверьте переключатель «${fieldLabel(field)}».`);
  }

  return value;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new BadRequestException(`В поле «${fieldLabel(field)}» нужно целое число.`);
  }

  return value;
}

function money(value: unknown, field: string) {
  const parsed = assertString(value, field);

  if (!moneyPattern.test(parsed)) {
    throw new BadRequestException(`В поле «${fieldLabel(field)}» нужна неотрицательная сумма, до двух знаков после точки.`);
  }

  return parsed;
}

function quantity(value: unknown, field: string) {
  const parsed = assertString(value, field);

  if (!decimalPattern.test(parsed)) {
    throw new BadRequestException(`В поле «${fieldLabel(field)}» нужно количество, до трёх знаков после точки.`);
  }

  return parsed;
}

export function parseCategoryInput(body: Record<string, unknown>): CategoryInput {
  return {
    name: assertString(body.name, "name"),
    slug: assertString(body.slug, "slug"),
    sortOrder: optionalNumber(body.sortOrder, "sortOrder"),
    isActive: optionalBoolean(body.isActive, "isActive")
  };
}

export function parseCategoryUpdateInput(
  body: Record<string, unknown>
): Partial<CategoryInput> {
  const parsed: Partial<CategoryInput> = {};

  if (body.name !== undefined) parsed.name = assertString(body.name, "name");
  if (body.slug !== undefined) parsed.slug = assertString(body.slug, "slug");
  if (body.sortOrder !== undefined) parsed.sortOrder = optionalNumber(body.sortOrder, "sortOrder");
  if (body.isActive !== undefined) parsed.isActive = optionalBoolean(body.isActive, "isActive");

  return parsed;
}

export function parseProductInput(body: Record<string, unknown>): ProductInput {
  return {
    categoryId: assertString(body.categoryId, "categoryId"),
    name: assertString(body.name, "name"),
    slug: assertString(body.slug, "slug"),
    description: optionalString(body.description, "description"),
    image: optionalString(body.image, "image"),
    unit: assertString(body.unit, "unit"),
    sellingPrice: money(body.sellingPrice, "sellingPrice"),
    purchasePrice: money(body.purchasePrice, "purchasePrice"),
    isWeighted: optionalBoolean(body.isWeighted, "isWeighted"),
    minQuantity: quantity(body.minQuantity, "minQuantity"),
    quantityStep: quantity(body.quantityStep, "quantityStep"),
    isActive: optionalBoolean(body.isActive, "isActive"),
    isAvailableToday: optionalBoolean(body.isAvailableToday, "isAvailableToday"),
    sortOrder: optionalNumber(body.sortOrder, "sortOrder"),
    qualityOptions: parseQualityOptions(body.qualityOptions)
  };
}

export function parseProductUpdateInput(
  body: Record<string, unknown>
): ProductUpdateInput {
  const parsed: ProductUpdateInput = {};

  if (body.categoryId !== undefined) parsed.categoryId = assertString(body.categoryId, "categoryId");
  if (body.name !== undefined) parsed.name = assertString(body.name, "name");
  if (body.slug !== undefined) parsed.slug = assertString(body.slug, "slug");
  if (body.description !== undefined) parsed.description = optionalString(body.description, "description");
  if (body.image !== undefined) parsed.image = optionalString(body.image, "image");
  if (body.unit !== undefined) parsed.unit = assertString(body.unit, "unit");
  if (body.sellingPrice !== undefined) parsed.sellingPrice = money(body.sellingPrice, "sellingPrice");
  if (body.purchasePrice !== undefined) parsed.purchasePrice = money(body.purchasePrice, "purchasePrice");
  if (body.isWeighted !== undefined) parsed.isWeighted = optionalBoolean(body.isWeighted, "isWeighted");
  if (body.minQuantity !== undefined) parsed.minQuantity = quantity(body.minQuantity, "minQuantity");
  if (body.quantityStep !== undefined) parsed.quantityStep = quantity(body.quantityStep, "quantityStep");
  if (body.isActive !== undefined) parsed.isActive = optionalBoolean(body.isActive, "isActive");
  if (body.isAvailableToday !== undefined) {
    parsed.isAvailableToday = optionalBoolean(body.isAvailableToday, "isAvailableToday");
  }
  if (body.sortOrder !== undefined) parsed.sortOrder = optionalNumber(body.sortOrder, "sortOrder");
  if (body.qualityOptions !== undefined) parsed.qualityOptions = parseQualityOptions(body.qualityOptions);

  return parsed;
}

function parseQualityOptions(value: unknown): ProductInput["qualityOptions"] {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new BadRequestException("Предпочтения по качеству должны быть списком.");
  }

  return value.map((option, index) => {
    if (typeof option !== "object" || option === null) {
      throw new BadRequestException(`Проверьте предпочтение по качеству №${index + 1}.`);
    }

    const record = option as Record<string, unknown>;

    return {
      id: record.id === undefined ? undefined : assertString(record.id, `qualityOptions.${index}.id`),
      label: assertString(record.label, `qualityOptions.${index}.label`),
      sortOrder: optionalNumber(record.sortOrder, `qualityOptions.${index}.sortOrder`),
      isActive: optionalBoolean(record.isActive, `qualityOptions.${index}.isActive`)
    };
  });
}
