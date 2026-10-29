import type { Loss } from "../types";
import type { Report } from "./types";

export type LossDraft = Pick<
  Loss,
  | "kind"
  | "chain"
  | "token"
  | "tokenAddress"
  | "logo"
  | "amountUsd"
  | "soldAmount"
  | "soldUsd"
  | "boughtUsd"
  | "valueNowUsd"
  | "multiple"
  | "tokensCount"
  | "lastSellAt"
  | "txHash"
>;

/** Monta o post a partir do raio-x. Usado no servidor (valendo) e no navegador (prévia). Retorna texto em caso de erro. */
export function draftFromReport(report: Report, target: string): LossDraft | string {
  if (target === "wallet") {
    const top = report.tokens.find((t) => (t.missedUsd ?? 0) > 0);
    if (!top || report.totals.missedUsd <= 0) return "This wallet left nothing on the table. Congrats, I guess.";
    return {
      kind: "wallet",
      chain: top.chain,
      token: top.symbol,
      logo: top.logo ?? undefined,
      amountUsd: round(report.totals.missedUsd),
      tokensCount: report.tokens.filter((t) => (t.missedUsd ?? 0) > 0).length,
    };
  }

  const [kind, ...rest] = target.split(":");
  const t = report.tokens.find((x) => x.key === rest.join(":"));
  if (!t) return "This token doesn't show up in the wallet's history.";
  const common = {
    chain: t.chain,
    token: t.symbol,
    tokenAddress: t.address,
    logo: t.logo ?? undefined,
    soldAmount: t.soldAmount,
    lastSellAt: t.lastSellAt,
    txHash: t.lastSellTx,
  };

  if (kind === "missed") {
    if (!t.missedUsd || t.missedUsd <= 0 || t.valueNowUsd === null) return "You left nothing on the table with this token.";
    return {
      ...common,
      kind: "missed",
      amountUsd: round(t.missedUsd),
      soldUsd: t.soldUsd,
      valueNowUsd: t.valueNowUsd,
      multiple: t.multiple ?? undefined,
    };
  }

  if (kind === "realized") {
    if (t.realizedUsd === null || t.realizedUsd >= 0) return "This token had no realized loss.";
    const matched = Math.min(t.soldAmount, t.boughtAmount);
    return {
      ...common,
      kind: "realized",
      amountUsd: round(-t.realizedUsd),
      soldAmount: matched,
      soldUsd: t.soldUsd * (matched / t.soldAmount),
      boughtUsd: (t.boughtUsd / t.boughtAmount) * matched,
    };
  }

  return "Invalid post.";
}

const round = (n: number) => Math.round(n * 100) / 100;
