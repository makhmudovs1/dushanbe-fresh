"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Search, LoaderCircle, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { catalogSearchUrl } from "@/lib/catalog-url";
import { updateCatalogLocation } from "@/lib/catalog-navigation";

export function CatalogSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params?.get("search") ?? "";
  const category = pathname === "/catalog" ? params?.get("category") ?? "" : "";
  const routeKey = `${pathname}${params?.size ? `?${params}` : ""}`;
  const [value, setValue] = useState(query);
  const [pending, startTransition] = useTransition();
  const dirty = useRef(false);
  const revision = useRef(0);
  const submitted = useRef<{ key: string; revision: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusSearch = params?.get("focusSearch");
  useEffect(() => { if (focusSearch === "1") inputRef.current?.focus(); }, [focusSearch]);

  useEffect(() => {
    // A committed search must not replace text typed after that navigation began.
    if (submitted.current?.key === routeKey && revision.current > submitted.current.revision) return;
    dirty.current = false; setValue(query);
  }, [routeKey, query]);
  useEffect(() => {
    const pop = () => { submitted.current = null; dirty.current = false; setValue(new URLSearchParams(location.search).get("search") ?? ""); };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  function navigate() {
    const target = catalogSearchUrl(category, value);
    if (target === routeKey) { dirty.current = false; return; }
    if (pending && pathname !== "/catalog") return;
    submitted.current = { key: target, revision: revision.current };
    startTransition(() => { if (!updateCatalogLocation(target)) router.push(target, { scroll: false }); });
  }
  useEffect(() => {
    if (!dirty.current || (pathname === "/catalog" && value.trim() === query)) return;
    const target = catalogSearchUrl(category, value);
    const edit = revision.current;
    const timer = setTimeout(() => {
      if (submitted.current?.key === target && submitted.current.revision === edit) return;
      if (pending && pathname !== "/catalog") return;
      submitted.current = { key: target, revision: edit };
      startTransition(() => { if (!updateCatalogLocation(target)) router.push(target, { scroll: false }); });
    }, 300);
    return () => clearTimeout(timer);
  }, [value, category, pathname, query, router, pending]);
  function change(next: string) { revision.current++; dirty.current = true; setValue(next); }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); navigate(); }

  return <form className="header-search" action="/catalog" role="search" onSubmit={submit}>
    <span className="header-search__icon">{pending ? <LoaderCircle className="is-spinning" size={20} aria-hidden="true" /> : <Search size={20} aria-hidden="true" />}</span>
    <input ref={inputRef} name="search" maxLength={120} autoComplete="off" aria-label={t("Поиск товаров")} placeholder={t("Поиск товаров")}
      aria-busy={pending} value={value} onChange={event => change(event.target.value)} />
    <button className={!value ? "header-search__clear is-empty" : "header-search__clear"} type="button" disabled={!value}
      aria-label={t("Очистить поиск")} title={t("Очистить поиск")} onClick={() => change("")}><X size={18} aria-hidden="true" /></button>
    <span className="sr-only" role="status">{pending ? t("Ищем продукты") : ""}</span>
  </form>;
}
