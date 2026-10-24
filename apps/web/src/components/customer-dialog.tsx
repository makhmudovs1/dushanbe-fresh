"use client";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n/provider";
import { CatalogDialog } from "./catalog-dialog";

export function CustomerDialog({ title, children, onClose, busy = false, className = "", focusTitleOnMobile = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean; className?: string; focusTitleOnMobile?: boolean;
}) {
  const { t } = useI18n();
  return <CatalogDialog title={title} busy={busy} onClose={onClose} closeLabel={t("Закрыть форму")}
    className={`customer-dialog ${className}`} fitVisualViewport surfaceClassName="customer-dialog__surface" focusTitleOnMobile={focusTitleOnMobile}>
    {children}
  </CatalogDialog>;
}
