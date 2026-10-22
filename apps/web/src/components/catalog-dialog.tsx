"use client";

import { ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useDialogViewport } from "./use-dialog-viewport";

export function CatalogDialog({ title, children, busy, onClose, className = "", closeLabel = "Закрыть форму", fitVisualViewport = false }: {
  title: string; children: ReactNode; busy: boolean; onClose: () => void;
  className?: string; closeLabel?: string; fitVisualViewport?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useDialogViewport(ref, fitVisualViewport);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <dialog className={`catalog-dialog ${className}`} ref={ref} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="catalog-dialog__header"><h2 id={titleId}>{title}</h2>
      <button className="catalog-icon-action" type="button" aria-label={closeLabel} title={closeLabel}
        disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>
    </header>
    <div className="catalog-dialog__body">{children}</div>
  </dialog>;
}
