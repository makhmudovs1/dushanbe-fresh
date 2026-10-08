"use client";

import { ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export function CatalogDialog({ title, children, busy, onClose }: {
  title: string; children: ReactNode; busy: boolean; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
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
  return <dialog className="catalog-dialog" ref={ref} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="catalog-dialog__header"><h2 id={titleId}>{title}</h2>
      <button className="catalog-icon-action" type="button" aria-label="Закрыть форму" title="Закрыть форму"
        disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>
    </header>
    <div className="catalog-dialog__body">{children}</div>
  </dialog>;
}
