import type { LossKind } from "./types";

const MINUS = "−";

/** Prejuízo realizado: sempre com sinal de menos na frente. */
export const usd = (n: number) => (n > 0 ? MINUS : "") + money(n);

/** Número principal de um post: só prejuízo leva o menos; lucro deixado na mesa é valor puro. */
export const painUsd = (kind: LossKind, n: number) => (kind === "realized" ? usd(n) : money(n));

/** Dinheiro sem sinal, com centavos só quando o valor é pequeno. */
export const money = (n: number) =>
  Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0,
  });

export const moneyCompact = (n: number) =>
  "$" + Math.abs(n).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Preço de token, inclusive os de memecoin com muitos zeros. */
export const price = (n: number) =>
  n >= 1 ? money(n) : "$" + n.toLocaleString("en-US", { maximumSignificantDigits: 3 });

export const amount = (n: number) => n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });

export const multiple = (n: number) => (n >= 10 ? `${Math.round(n)}x` : `${n.toFixed(1)}x`);

export const date = (ts: number) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const short = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

export function ago(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
