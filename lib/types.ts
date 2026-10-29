import type { ChainKey, Family } from "./chains";

/**
 * missed:   vendeu cedo, quanto deixou na mesa num token
 * realized: comprou caro e vendeu barato num token
 * wallet:   total deixado na mesa somando a carteira inteira
 */
export type LossKind = "missed" | "realized" | "wallet";

export type Loss = {
  id: string;
  kind: LossKind;
  family: Family;
  chain: ChainKey;
  wallet: string;
  /** Alvo assinado: "wallet", "missed:<token key>" ou "realized:<token key>". */
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

/** Versão pública: sem a lista de quem deu F. */
export type PublicLoss = Omit<Loss, "respectedBy">;
