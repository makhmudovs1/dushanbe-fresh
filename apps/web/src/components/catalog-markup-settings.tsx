"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import type { PricingSettings } from "@dushanbe-fresh/shared";
import { getAdminPricingSettings, updateAdminPricingSettings } from "@/lib/api";
import { markupPattern, validMarkup } from "@/lib/admin-pricing";

export function CatalogMarkupSettings() {
  const [settings, setSettings] = useState<PricingSettings | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function load() {
    setBusy(true);
    try {
      const result = await getAdminPricingSettings();
      setSettings(result); setValue(result.defaultMarkupPercent); setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Не удалось загрузить наценку."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  return <section aria-labelledby="catalog-markup-heading">
    <h2 id="catalog-markup-heading">Наценка каталога</h2>
    <p>Общая наценка применяется к новым товарам и при явном включении авторасчёта. Существующие цены не изменятся.</p>
    <form className="operations-filters" onSubmit={event => {
      event.preventDefault();
      if (!validMarkup(value) || busy || !settings) return;
      setBusy(true); setNotice("");
      void updateAdminPricingSettings({ defaultMarkupPercent: value }).then(result => {
        setSettings(result); setValue(result.defaultMarkupPercent); setNotice("Наценка сохранена. Существующие цены не изменены.");
      }).catch(error => setNotice(error instanceof Error ? error.message : "Не удалось сохранить наценку.")).finally(() => setBusy(false));
    }}>
      <label className="field">Общая наценка, %<input required inputMode="decimal" pattern={markupPattern} maxLength={8}
        value={value} disabled={busy || !settings} onChange={event => { setValue(event.target.value.replace(",", ".")); setNotice(""); }} /></label>
      <button className="primary-action" disabled={busy || !settings || !validMarkup(value)}><Save size={18} aria-hidden="true" />Сохранить наценку</button>
    </form>
    {!settings && !busy ? <button type="button" className="secondary-link" onClick={() => void load()}>Повторить загрузку</button> : null}
    {notice ? <p role="status" className="notice">{notice}</p> : null}
  </section>;
}
