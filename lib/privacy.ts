import type { Loss, PublicLoss } from "./types";

const DAY = 86_400_000;

// Três algarismos significativos: o número continua o mesmo para quem lê, mas não serve para achar a venda na rede
export const fuzz = (n: number | undefined) => (n === undefined || n === 0 || !Number.isFinite(n) ? n : Number(n.toPrecision(3)));

/**
 * O que um post mostra em público. Carteira, assinatura e transação ficam no servidor; valores e data perdem precisão,
 * porque token + quantidade exata + hora exata acham a transação no explorer, e dela a carteira.
 * A data vira o meio-dia (UTC) do dia da venda, para cair no mesmo dia em qualquer fuso.
 */
export function toPublic({ wallet: _w, signature: _s, txHash: _t, respectedBy: _r, ...l }: Loss, author: string): PublicLoss {
  return {
    ...l,
    author,
    amountUsd: fuzz(l.amountUsd)!,
    soldAmount: fuzz(l.soldAmount),
    soldUsd: fuzz(l.soldUsd),
    boughtUsd: fuzz(l.boughtUsd),
    valueNowUsd: fuzz(l.valueNowUsd),
    missedUsd: fuzz(l.missedUsd),
    realizedLossUsd: fuzz(l.realizedLossUsd),
    lastSellAt: l.lastSellAt && Math.floor(l.lastSellAt / DAY) * DAY + DAY / 2,
  };
}

/** Nome que aparece no lugar da carteira. */
export const authorName = (author: string) => (author === "example" ? "Example wallet" : author ? `anon-${author}` : "You");
export const AUTHOR_ID = /^[0-9a-f]{8}$/;
