"use client";

import { ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useDialogViewport } from "./use-dialog-viewport";

export function CatalogDialog({ title, children, busy, onClose, className = "", closeLabel = "Закрыть форму", fitVisualViewport = false, surfaceClassName }: {
  title: string; children: ReactNode; busy: boolean; onClose: () => void;
  className?: string; closeLabel?: string; fitVisualViewport?: boolean; surfaceClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    const body = document.body;
    const root = document.documentElement;
    const scroll = { x: window.scrollX, y: window.scrollY };
    const properties = ["position", "top", "left", "width"];
    const saved = properties.map(property => [property, body.style.getPropertyValue(property), body.style.getPropertyPriority(property)]);
    const rootOverflow = root.style.overflow;
    const scrollBehavior = root.style.scrollBehavior;
    const previousSheet = body.getAttribute("data-product-sheet-open");
    if (fitVisualViewport) {
      body.setAttribute("data-product-sheet-open", "true");
      // overflow:hidden alone does not stop iOS background/toolbar scrolling.
      root.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = `${-scroll.y}px`;
      body.style.left = `${-scroll.x}px`;
      body.style.width = "100%";
    }
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (fitVisualViewport) {
        if (previousSheet === null) body.removeAttribute("data-product-sheet-open");
        else body.setAttribute("data-product-sheet-open", previousSheet);
        for (const [property, value, priority] of saved) {
          if (value) body.style.setProperty(property, value, priority);
          else body.style.removeProperty(property);
        }
        root.style.overflow = rootOverflow;
        root.style.scrollBehavior = "auto";
        window.scrollTo(scroll.x, scroll.y);
        root.style.scrollBehavior = scrollBehavior;
      }
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [fitVisualViewport]);
  useDialogViewport(ref, fitVisualViewport);
  const content = <>
    <header className="catalog-dialog__header"><h2 id={titleId}>{title}</h2>
      <button className="catalog-icon-action" type="button" aria-label={closeLabel} title={closeLabel}
        disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>
    </header>
    <div className="catalog-dialog__body">{children}</div>
  </>;
  return <dialog className={`catalog-dialog ${className}`} ref={ref} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    {surfaceClassName ? <div className={surfaceClassName} data-product-sheet-surface>{content}</div> : content}
  </dialog>;
}
