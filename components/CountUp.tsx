"use client";

import { useEffect, useState } from "react";
import { money, usd } from "@/lib/format";

const FORMATS = {
  usd,
  money,
  int: (n: number) => Math.round(n).toLocaleString("en-US"),
};

/** Número que sobe até o valor final. Renderiza o valor final no servidor. */
export default function CountUp({ value, format = "usd" }: { value: number; format?: keyof typeof FORMATS }) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) return setShown(value);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1400);
      setShown(value * (1 - Math.pow(1 - t, 4)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{FORMATS[format](shown)}</>;
}
