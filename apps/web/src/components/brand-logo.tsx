"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export function BrandLogo() {
  const [failed, setFailed] = useState(false);
  return <Link className="site-logo brand-logo" href="/" aria-label="Dushanbe Fresh">
    {!failed ? <Image className="brand-logo__image" src="/brand/wordmark-v3.webp" width={600} height={210} alt="" priority onError={() => setFailed(true)} />
      : <span className="brand-logo__fallback">Dushanbe Fresh</span>}
  </Link>;
}
