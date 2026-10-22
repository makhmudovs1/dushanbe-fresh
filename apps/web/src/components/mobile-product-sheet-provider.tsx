"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { Product } from "@/lib/api";
import { MobileProductSheet } from "./mobile-product-sheet";

export const MOBILE_PRODUCT_QUERY = "(max-width: 1023px)";
const Context = createContext<((product: Product | string) => void) | null>(null);
const OpenContext = createContext(false);
export function useProductSheetOpen() { return useContext(OpenContext); }
export function ProductSheetSelection({ onSelect, children }: { onSelect: (product: Product | string) => void; children: ReactNode }) {
  return <Context.Provider value={onSelect}>{children}</Context.Provider>;
}
const HISTORY_KEY = "__dushanbeFreshProductSheet";

export function productSheetHistoryState(state: Record<string, unknown> | null, id: string) {
  return { ...state, [HISTORY_KEY]: id };
}

export function ownsProductSheetHistory(state: Record<string, unknown> | null, id: string) {
  return state?.[HISTORY_KEY] === id;
}

export function shouldOpenMobileProductSheet(event: Pick<MouseEvent<HTMLAnchorElement>,
  "defaultPrevented" | "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">, mobile: boolean) {
  return mobile && !event.defaultPrevented && event.button === 0 &&
    !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function MobileProductSheetProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const owner = useId();
  const sequence = useRef(0);
  const entry = useRef<{ id: string; href: string } | null>(null);
  const closing = useRef(false);
  const [selection, setSelection] = useState<{ product: Product | string; pathname: string | null } | null>(null);
  const dismiss = useCallback(() => {
    entry.current = null;
    closing.current = false;
    setSelection(null);
  }, []);
  const close = useCallback(() => {
    if (closing.current) return;
    const current = entry.current;
    if (current && current.href === window.location.href && ownsProductSheetHistory(window.history.state, current.id)) {
      closing.current = true;
      window.history.back();
    } else dismiss();
  }, [dismiss]);
  const open = useCallback((product: Product | string) => {
    if (closing.current) return;
    const id = `${owner}:${++sequence.current}`;
    const href = window.location.href;
    try {
      // Keep Next's router tree and flags intact; only add our own ownership key.
      window.history.pushState(productSheetHistoryState(window.history.state, id), "", href);
      entry.current = { id, href };
    } catch { entry.current = null; }
    setSelection({ product, pathname });
  }, [owner, pathname]);

  useEffect(() => {
    const pop = (event: PopStateEvent) => {
      // Closing our same-URL entry must not start a competing Next navigation.
      if (entry.current?.href === window.location.href) event.stopImmediatePropagation();
      dismiss();
    };
    window.addEventListener("popstate", pop, true);
    return () => window.removeEventListener("popstate", pop, true);
  }, [dismiss]);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_PRODUCT_QUERY);
    const onChange = () => { if (!media.matches) close(); };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [close]);

  useEffect(() => { dismiss(); }, [pathname, dismiss]);

  return <Context.Provider value={open}><OpenContext.Provider value={!!selection && selection.pathname === pathname}>
    {children}
    {selection && selection.pathname === pathname ?
      <MobileProductSheet key={typeof selection.product === "string" ? selection.product : selection.product.slug}
        initialProduct={selection.product} onClose={close} /> : null}
  </OpenContext.Provider></Context.Provider>;
}

// Without a provider (or JavaScript), the anchor remains a normal product route.
export function useMobileProductLink(product: Product | string) {
  const open = useContext(Context);
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (!open || !shouldOpenMobileProductSheet(event, window.matchMedia(MOBILE_PRODUCT_QUERY).matches) ||
      event.currentTarget.hasAttribute("download") ||
      (event.currentTarget.target && event.currentTarget.target !== "_self")) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    open(product);
  };
}

export function MobileProductLink({ product, children, onClick, ...props }:
  Omit<ComponentProps<typeof Link>, "href"> & { product: Product | string }) {
  const open = useMobileProductLink(product);
  const slug = typeof product === "string" ? product : product.slug;
  return <Link {...props} href={`/products/${encodeURIComponent(slug)}`} onClick={event => {
    onClick?.(event);
    open(event);
  }}>{children}</Link>;
}
