"use client";

import { useEffect, useRef, useState } from "react";
import { Calculator, Check, Undo2 } from "lucide-react";
import type { BulkPricingBatch, BulkPricingPreview, PricingSelection } from "@dushanbe-fresh/shared";
import { applyAdminPricing, Category, getLastAdminPricingBatch, previewAdminPricing, undoAdminPricing } from "@/lib/api";
import { markupPattern, validMarkup } from "@/lib/admin-pricing";
import { CatalogDialog } from "./catalog-dialog";

export function AdminBulkPricing({ categories, selectedIds, disabled, onBusy, onApplied }: {
  categories: Category[]; selectedIds: string[]; disabled: boolean;
  onBusy: (busy: boolean) => void; onApplied: () => Promise<void>;
}) {
  const [scope, setScope] = useState<"items" | "categories" | "all">("items");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [markup, setMarkup] = useState("");
  const [overwriteManual, setOverwriteManual] = useState(false);
  const [preview, setPreview] = useState<BulkPricingPreview | null>(null);
  const [batch, setBatch] = useState<BulkPricingBatch | null>(null);
  const [undoConfirm, setUndoConfirm] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const applyRequestId = useRef("");
  const undoRequestId = useRef("");
  const inFlight = useRef(false);
  useEffect(() => {
    void getLastAdminPricingBatch().then(setBatch).catch(() => setNotice("Не удалось загрузить последнюю переоценку."));
  }, []);
  const selection: PricingSelection = scope === "all" ? { all: true } : scope === "categories" ? { categoryIds } : { ids: selectedIds };
  const hasSelection = scope === "all" || (scope === "categories" ? categoryIds.length > 0 : selectedIds.length > 0);
  async function run(action: () => Promise<void>) {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setBusy(true); onBusy(true); setNotice("");
    try { await action(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Не удалось выполнить переоценку."); }
    finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }
  return <section className="admin-bulk-pricing" aria-labelledby="bulk-pricing-heading">
    <h3 id="bulk-pricing-heading">Массовая переоценка</h3>
    <fieldset disabled={busy || disabled} className="product-form-fields">
      <div className="checkbox-row" role="radiogroup" aria-label="Область переоценки">
        <label><input type="radio" name="pricing-scope" checked={scope === "items"} onChange={() => setScope("items")} />Выбранные товары ({selectedIds.length})</label>
        <label><input type="radio" name="pricing-scope" checked={scope === "categories"} onChange={() => setScope("categories")} />Категории целиком</label>
        <label><input type="radio" name="pricing-scope" checked={scope === "all"} onChange={() => setScope("all")} />Весь каталог</label>
      </div>
      {scope === "categories" ? <div className="admin-pricing-categories" role="group" aria-label="Категории для переоценки">
        {categories.map(category => <label key={category.id}><input type="checkbox" checked={categoryIds.includes(category.id)}
          onChange={event => setCategoryIds(event.target.checked ? [...categoryIds, category.id] : categoryIds.filter(id => id !== category.id))} />{category.name}</label>)}
      </div> : null}
      <form className="admin-pricing-controls" onSubmit={event => { event.preventDefault(); if (!hasSelection || !validMarkup(markup)) return;
        void run(async () => {
          const result = await previewAdminPricing({ selection, markupPercent: markup, overwriteManual });
          applyRequestId.current = crypto.randomUUID(); setConfirmed(false); setPreview(result);
        });
      }}>
        <label>Новая наценка, %<input required inputMode="decimal" pattern={markupPattern} maxLength={8} value={markup}
          onChange={event => setMarkup(event.target.value.replace(",", "."))} /></label>
        <label className="admin-pricing-check"><input type="checkbox" checked={overwriteManual} onChange={event => setOverwriteManual(event.target.checked)} />Перезаписать ручные цены и включить авторасчёт</label>
        <button className="secondary-link" disabled={!hasSelection || !validMarkup(markup)}><Calculator size={18} aria-hidden="true" />Предпросмотр</button>
      </form>
      <div className="catalog-form-actions">
        <button className="secondary-link" type="button" disabled={batch?.status !== "applied"} onClick={() => { undoRequestId.current = crypto.randomUUID(); setNotice(""); setUndoConfirm(true); }}>
          <Undo2 size={18} aria-hidden="true" />Отменить последнюю переоценку</button>
      </div>
    </fieldset>
    {notice && !preview && !undoConfirm ? <p className="notice" role="status">{notice}</p> : null}
    {preview ? <CatalogDialog title="Подтверждение переоценки" busy={busy} onClose={() => { setPreview(null); setNotice(""); }}>
      <p>Выбрано: <strong>{preview.count}</strong>. К изменению: <strong>{preview.changeCount}</strong>.</p>
      <p>Ручные цены пропущены: {preview.skippedManualCount}. Без закупочной цены: {preview.missingPurchaseCount}.</p>
      <div className="admin-pricing-preview" tabIndex={0} role="region" aria-label="Предпросмотр цен">
        <table><thead><tr><th>Товар</th><th>Текущая цена</th><th>Закупка</th><th>Новая наценка</th><th>Новая цена</th></tr></thead>
          <tbody>{preview.items.map(item => <tr key={item.id}><th scope="row">{item.name}</th><td>{item.currentSalePrice}</td><td>{item.purchasePrice}</td>
            <td>{item.newMarkupPercent}%</td><td>{item.status === "change" ? item.newSalePrice : item.status === "skipped_manual" ? "Ручная цена сохранена" : "Нет закупочной цены"}</td></tr>)}</tbody>
        </table>
      </div>
      <p>Будет установлена индивидуальная наценка. Настройки общей наценки и категорий не изменятся.</p>
      <label className="admin-pricing-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />Подтверждаю изменение цен: {preview.changeCount}</label>
      {notice ? <p className="notice" role="alert">{notice}</p> : null}
      <div className="catalog-form-actions">
        <button className="primary-action" type="button" disabled={busy || !confirmed || !preview.changeCount} onClick={() => void run(async () => {
          const result = await applyAdminPricing({ previewId: preview.previewId, requestId: applyRequestId.current });
          setBatch(result); setPreview(null); setNotice(`Переоценка выполнена. Изменено товаров: ${result.changeCount}.`); await onApplied();
        })}><Check size={18} aria-hidden="true" />Применить переоценку</button>
        <button className="secondary-link" type="button" disabled={busy} onClick={() => { setPreview(null); setNotice(""); }}>Отмена</button>
      </div>
    </CatalogDialog> : null}
    {undoConfirm && batch ? <CatalogDialog title="Отменить последнюю переоценку?" busy={busy} onClose={() => { setUndoConfirm(false); setNotice(""); }}>
      <p>Восстановить прежние цены и режимы для {batch.changeCount} товаров? Последующие ручные изменения не будут перезаписаны.</p>
      {notice ? <p className="notice" role="alert">{notice}</p> : null}
      <div className="catalog-form-actions">
        <button type="button" className="primary-action" disabled={busy} onClick={() => void run(async () => {
          const result = await undoAdminPricing({ batchId: batch.batchId, requestId: undoRequestId.current });
          setBatch(result); setUndoConfirm(false); setNotice("Последняя переоценка отменена."); await onApplied();
        })}><Undo2 size={18} aria-hidden="true" />Восстановить цены</button>
        <button type="button" className="secondary-link" disabled={busy} onClick={() => { setUndoConfirm(false); setNotice(""); }}>Оставить цены</button>
      </div>
    </CatalogDialog> : null}
  </section>;
}
