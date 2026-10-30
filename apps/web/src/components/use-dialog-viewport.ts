"use client";

import { useEffect, type RefObject } from "react";

export function dialogViewport(viewport: Pick<VisualViewport, "height" | "offsetTop"> | null, fallbackHeight: number, scrollY = 0) {
  return {
    height: viewport && Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : fallbackHeight,
    top: scrollY + (viewport && Number.isFinite(viewport.offsetTop) ? Math.max(0, viewport.offsetTop) : 0)
  };
}

export function useDialogViewport(ref: RefObject<HTMLDialogElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const dialog = ref.current;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      const { height, top } = dialogViewport(viewport, window.innerHeight, window.scrollY);
      dialog.style.setProperty("--dialog-viewport-height", `${height}px`);
      dialog.style.setProperty("--dialog-viewport-top", `${top}px`);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("orientationchange", schedule);
      dialog.style.removeProperty("--dialog-viewport-height");
      dialog.style.removeProperty("--dialog-viewport-top");
    };
  }, [ref, enabled]);
}
