import type { ChainKey, Family } from "../chains";

/** Um swap normalizado, do ponto de vista do token negociado (não da moeda de cotação). */
export type Swap = {
  chain: ChainKey;
  type: "buy" | "sell";
  tx: string;
  at: number;
  token: { address: string; symbol: string; name: string; logo: string | null };
  amount: number;
  usd: number;
};

export type TokenStat = {
  key: string;
  chain: ChainKey;
  address: string;
  symbol: string;
  name: string;
  logo: string | null;
  buys: number;
  sells: number;
  boughtAmount: number;
  boughtUsd: number;
  soldAmount: number;
  soldUsd: number;
  avgSellPrice: number;
  priceNow: number | null;
  /** Quanto o que foi vendido valeria hoje. */
  valueNowUsd: number | null;
  /** Hoje valeria − recebeu na venda. Positivo = vendeu cedo demais. */
  missedUsd: number | null;
  /** Preço atual ÷ preço médio de venda. */
  multiple: number | null;
  /** Recebeu nas vendas − custo médio do que foi vendido. Negativo = prejuízo. */
  realizedUsd: number | null;
  lastSellAt: number;
  lastSellTx: string;
  /** Par de maior liquidez na DexScreener, para buscar os candles. */
  pool?: string;
};

export type Report = {
  family: Family;
  wallet: string;
  scannedAt: number;
  chains: ChainKey[];
  failedChains: ChainKey[];
  swapCount: number;
  /** Histórico cortado no limite de páginas: só os swaps mais recentes entraram. */
  truncated: boolean;
  tokens: TokenStat[];
  totals: { missedUsd: number; realizedLossUsd: number; realizedGainUsd: number; unpriced: number };
  /** Swaps que ficaram de fora por não ter como saber o valor em dólar (token por token, sem SOL/ETH/stable). */
  unpricedSwaps?: number;
  /** Redes EVM puladas porque o plano grátis da Etherscan não cobre e não há chave da Alchemy. */
  paidChains?: ChainKey[];
  /** Por que as redes de `failedChains` falharam, sem repetir. */
  failedReasons?: string[];
  demo?: boolean;
};
