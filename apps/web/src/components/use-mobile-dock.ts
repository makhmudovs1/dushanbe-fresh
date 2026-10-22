"use client";

import { useEffect, type RefObject } from "react";
import { dialogViewport } from "./use-dialog-viewport";

export function mobileDockTop(height: number, top: number, scrollY: number, dockHeight: number) {
  return Math.max(0, scrollY + top + height - dockHeight);
}

// Document positioning avoids Safari's independently adjusted fixed paint layers.
export function useMobileDock(ref: RefObject<HTMLElement>, enabled: boolean) {
  useEffect(() => {
    const dock = ref.current;
    if (!enabled || !dock) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      const { height, top } = dialogViewport(viewport, window.innerHeight);
      dock.style.top = `${mobileDockTop(height, top, window.scrollY, dock.getBoundingClientRect().height)}px`;
      dock.dataset.positioned = "true";
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(dock);
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("pageshow", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
    };
  }, [ref, enabled]);
}
