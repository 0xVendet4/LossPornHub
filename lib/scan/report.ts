import type { ChainKey, Family } from "../chains";
import { addrKey, type Quote } from "./prices";
import type { Report, Swap, TokenStat } from "./types";

// Vender stablecoin não é "vender cedo": fica de fora do raio-x
const STABLE = /^(USDC|USDT|USDT0|USDC\.E|USDBC|DAI|BUSD|FDUSD|PYUSD|TUSD|USDE|USDS|USD1|FRAX|LUSD|GHO|CRVUSD|EURC)$/i;

export function buildReport(args: {
  family: Family;
  wallet: string;
  chains: ChainKey[];
  failedChains: ChainKey[];
  swaps: Swap[];
  truncated: boolean;
  prices: Map<string, Quote>; // chave: `${chain}:${addrKey}`
}): Report {
  const groups = new Map<string, Swap[]>();
  for (const s of args.swaps) {
    if (STABLE.test(s.token.symbol)) continue;
    const key = `${s.chain}:${addrKey(s.chain, s.token.address)}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const tokens: TokenStat[] = [];
  for (const [key, list] of groups) {
    const sells = list.filter((s) => s.type === "sell");
    if (sells.length === 0) continue; // só interessa o que foi vendido
    const buys = list.filter((s) => s.type === "buy");
    const first = list[0];

    const boughtAmount = sum(buys.map((s) => s.amount));
    const boughtUsd = sum(buys.map((s) => s.usd));
    const soldAmount = sum(sells.map((s) => s.amount));
    const soldUsd = sum(sells.map((s) => s.usd));
    const last = sells.reduce((a, b) => (b.at > a.at ? b : a));

    const quote = args.prices.get(key);
    const priceNow = quote?.price ?? null;
    const valueNowUsd = priceNow === null ? null : soldAmount * priceNow;
    const avgSellPrice = soldUsd / soldAmount;

    // Custo médio só faz sentido se as compras aparecem no histórico lido
    let realizedUsd: number | null = null;
    if (boughtAmount > 0) {
      const matched = Math.min(soldAmount, boughtAmount);
      realizedUsd = soldUsd * (matched / soldAmount) - (boughtUsd / boughtAmount) * matched;
    }

    tokens.push({
      key,
      chain: first.chain,
      address: first.token.address,
      symbol: first.token.symbol,
      name: first.token.name,
      logo: first.token.logo || quote?.logo || null,
      buys: buys.length,
      sells: sells.length,
      boughtAmount,
      boughtUsd,
      soldAmount,
      soldUsd,
      avgSellPrice,
      priceNow,
      valueNowUsd,
      missedUsd: valueNowUsd === null ? null : valueNowUsd - soldUsd,
      multiple: priceNow === null || !(avgSellPrice > 0) ? null : priceNow / avgSellPrice,
      realizedUsd,
      lastSellAt: last.at,
      lastSellTx: last.tx,
    });
  }

  tokens.sort((a, b) => (b.missedUsd ?? -Infinity) - (a.missedUsd ?? -Infinity));

  return {
    family: args.family,
    wallet: args.wallet,
    scannedAt: Date.now(),
    chains: args.chains,
    failedChains: args.failedChains,
    swapCount: args.swaps.length,
    truncated: args.truncated,
    tokens,
    totals: {
      missedUsd: sum(tokens.map((t) => Math.max(0, t.missedUsd ?? 0))),
      realizedLossUsd: sum(tokens.map((t) => Math.max(0, -(t.realizedUsd ?? 0)))),
      realizedGainUsd: sum(tokens.map((t) => Math.max(0, t.realizedUsd ?? 0))),
      unpriced: tokens.filter((t) => t.priceNow === null).length,
    },
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
