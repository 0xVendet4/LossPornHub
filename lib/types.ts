import type { ChainKey, Family } from "./chains";

/**
 * missed:   vendeu cedo, quanto deixou na mesa num token
 * realized: comprou caro e vendeu barato num token
 * wallet:   total deixado na mesa somando a carteira inteira
 * total:    loss porn total da carteira: o que deixou na mesa + o prejuízo realizado
 */
export type LossKind = "missed" | "realized" | "wallet" | "total";

export type Loss = {
  id: string;
  kind: LossKind;
  family: Family;
  chain: ChainKey;
  wallet: string;
  /** Alvo assinado: "total", "wallet", "missed:<token key>" ou "realized:<token key>". */
  target: string;
  token: string;
  tokenAddress?: string;
  logo?: string;
  /** Número principal do card, sempre positivo e calculado pelo servidor. */
  amountUsd: number;
  soldAmount?: number;
  soldUsd?: number;
  boughtUsd?: number;
  valueNowUsd?: number;
  multiple?: number;
  tokensCount?: number;
  /** Só no "total": as duas partes da soma. */
  missedUsd?: number;
  realizedLossUsd?: number;
  /** Par de maior liquidez na hora do post, para os candles. */
  pool?: string;
  lastSellAt?: number;
  txHash?: string;
  caption: string;
  signature: string;
  respects: number;
  respectedBy: string[];
  createdAt: number;
  /** Post de exemplo criado pelo `npm run seed`. */
  example?: boolean;
};

/**
 * Versão pública: sem carteira, assinatura (que revela a carteira), transação e lista de quem deu F.
 * `author` é o apelido da carteira (ver lib/author.ts); "" na prévia de quem está postando, "example" nos exemplos.
 */
export type PublicLoss = Omit<Loss, "respectedBy" | "wallet" | "signature" | "txHash"> & { author: string };
