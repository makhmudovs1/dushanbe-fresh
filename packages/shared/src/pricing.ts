export type PriceMode = "manual" | "auto";

export type ProductPricing = {
  priceMode: PriceMode;
  markupPercent: string | null;
  appliedMarkupPercent: string | null;
};

export type PricingSettings = { defaultMarkupPercent: string };
export type PricingSelection =
  | { ids: string[]; categoryIds?: never; all?: never }
  | { categoryIds: string[]; ids?: never; all?: never }
  | { all: true; ids?: never; categoryIds?: never };

export type BulkPricingPreviewInput = {
  selection: PricingSelection;
  markupPercent: string;
  overwriteManual?: boolean;
};

export type BulkPricingPreviewItem = {
  id: string;
  name: string;
  categoryId: string;
  purchasePrice: string;
  currentSalePrice: string;
  newSalePrice: string | null;
  currentMarkupPercent: string | null;
  newMarkupPercent: string;
  priceMode: PriceMode;
  status: "change" | "skipped_manual" | "missing_purchase";
};

export type BulkPricingPreview = {
  previewId: string;
  expiresAt: string;
  count: number;
  changeCount: number;
  skippedManualCount: number;
  missingPurchaseCount: number;
  items: BulkPricingPreviewItem[];
};

export type BulkPricingApplyInput = { previewId: string; requestId: string };
export type BulkPricingUndoInput = { batchId: string; requestId: string };
export type BulkPricingBatch = {
  batchId: string;
  status: "applied" | "undone";
  changeCount: number;
  appliedAt: string;
  undoneAt: string | null;
};
