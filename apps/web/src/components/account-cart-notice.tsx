"use client";
import { useState } from "react";
import { useCart } from "@/cart/cart-context";
import { isLegacyCartItem } from "@/cart/cart";
import { useI18n } from "@/i18n/provider";
import { CustomerDialog } from "./customer-dialog";

export function AccountCartNotice() {
  const { syncError, retrySync, legacyConflicts = [], discardIncoming, removeBoth, hydrated } = useCart();
  const { t, name, label, quantityLabel } = useI18n();
  const [choice, setChoice] = useState<{ key: string; both: boolean } | null>(null);
  if (!hydrated || !syncError) return null;
  return <section className="notice account-cart-notice" role="alert">
    <p>{t(syncError)}</p>
    {legacyConflicts.map(pair => <div className="account-cart-conflict" key={pair.key}>
      <strong>{name(pair.saved)}</strong>
      <dl>{([["В аккаунте", pair.saved], ["На этом устройстве", pair.incoming]] as const).map(([source, item]) => <div key={source}>
        <dt>{t(source)}</dt><dd>{quantityLabel(item.quantity, item.unit)} · {isLegacyCartItem(item) ? label({ label: item.qualityOptionLabel || item.qualityOptionLabelTj || t("Старая позиция"), labelTj: item.qualityOptionLabelTj }) : t("Без предпочтения")}</dd>
      </div>)}</dl>
      <div className="customer-prompt-actions">
        <button type="button" className="secondary-link" onClick={() => setChoice({ key: pair.key, both: false })}>{t("Оставить позицию аккаунта")}</button>
        <button type="button" className="secondary-link" onClick={() => setChoice({ key: pair.key, both: true })}>{t("Удалить обе позиции")}</button>
      </div>
    </div>)}
    {!legacyConflicts.length ? <button type="button" className="secondary-link" onClick={retrySync}>{t("Повторить")}</button> : null}
    {choice ? <CustomerDialog title={t("Подтвердите удаление")} onClose={() => setChoice(null)}>
      <p>{t(choice.both ? "Обе конфликтующие позиции будут удалены. Нужный товар можно выбрать заново в каталоге." : "Входящая позиция этого устройства будет удалена. Позиция аккаунта и остальные товары сохранятся.")}</p>
      <div className="customer-prompt-actions"><button type="button" className="secondary-link" onClick={() => setChoice(null)}>{t("Отмена")}</button>
        <button type="button" className="primary-action" onClick={() => { if (choice.both) removeBoth(choice.key); else discardIncoming(choice.key); setChoice(null); }}>{t("Подтвердить удаление")}</button>
      </div>
    </CustomerDialog> : null}
  </section>;
}
