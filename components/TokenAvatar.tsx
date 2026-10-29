"use client";

import { useState } from "react";

// Gradientes suaves para tokens sem logo, escolhidos pelo símbolo (sempre o mesmo para o mesmo token)
const FALLBACK = [
  "linear-gradient(140deg, #b9a7ff, #6f5ae6)",
  "linear-gradient(140deg, #ff94b8, #d9628f)",
  "linear-gradient(140deg, #8ee6c4, #2a9d75)",
  "linear-gradient(140deg, #ffd08a, #e0895a)",
  "linear-gradient(140deg, #9fd2ff, #4c84d9)",
];

export default function TokenAvatar({ symbol, logo, size = 44 }: { symbol: string; logo?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const hash = [...symbol].reduce((a, c) => a + c.charCodeAt(0), 0);
  const img = logo && !broken;

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-raise font-display font-semibold text-[#17131f] ring-1 ring-white/10"
      style={{ width: size, height: size, fontSize: size * 0.4, background: img ? undefined : FALLBACK[hash % FALLBACK.length] }}
      aria-hidden
    >
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        symbol.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
