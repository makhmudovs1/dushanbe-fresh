"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function StorefrontFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className={pathname.startsWith("/admin") ? "staff-frame" : "storefront-app"}>{children}</div>;
}
