"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export function BrandLogo() {
  const [failed, setFailed] = useState(false);
  return <Link className="site-logo brand-logo" href="/" aria-label="Dushanbe Fresh">
    {!failed ? <Image className="brand-logo__mark" src="/brand/mark-v2.webp" width={40} height={40} alt="" priority onError={() => setFailed(true)} /> : null}
    <span className="brand-logo__wordmark">Dushanbe <span className="brand-logo__initial">F</span>resh</span>
  </Link>;
}
