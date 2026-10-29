/** Escala de dor: faixas de perda em USD, de 1 a 5. */
export const TIERS = [
  { min: 0, name: "Scratch" },
  { min: 1_000, name: "Bleeding" },
  { min: 10_000, name: "Hemorrhage" },
  { min: 100_000, name: "Liquidated" },
  { min: 1_000_000, name: "Graveyard" },
] as const;

export function tierOf(amountUsd: number) {
  let level = 1;
  TIERS.forEach((t, i) => {
    if (amountUsd >= t.min) level = i + 1;
  });
  return { level, name: TIERS[level - 1].name };
}
