import { addrKey, type Quote } from "./prices";
import { buildReport } from "./report";
import type { Report, Swap } from "./types";

// Carteira fictícia para ver a tela sem chave de API. Nada aqui é real.
const DAY = 86_400_000;

const T = {
  WIF: { address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", symbol: "WIF", name: "dogwifhat", logo: null },
  BONK: { address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", symbol: "BONK", name: "Bonk", logo: null },
  POPCAT: { address: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", symbol: "POPCAT", name: "Popcat", logo: null },
  JUP: { address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", symbol: "JUP", name: "Jupiter", logo: null },
  RUGZ: { address: "RugZ1111111111111111111111111111111111111111", symbol: "RUGZ", name: "Rugzilla", logo: null },
};

const sw = (token: Swap["token"], type: Swap["type"], daysAgo: number, amount: number, usd: number): Swap => ({
  chain: "solana",
  type,
  tx: `demo${token.symbol}${daysAgo}`,
  at: Date.now() - daysAgo * DAY,
  token,
  amount,
  usd,
});

export function demoReport(): Report {
  const swaps: Swap[] = [
    sw(T.WIF, "buy", 610, 1_400_000, 2_100),
    sw(T.WIF, "sell", 590, 1_400_000, 3_400),
    sw(T.BONK, "buy", 700, 9_000_000_000, 1_800),
    sw(T.BONK, "sell", 680, 9_000_000_000, 2_250),
    sw(T.POPCAT, "buy", 420, 250_000, 1_000),
    sw(T.POPCAT, "sell", 400, 250_000, 1_900),
    sw(T.JUP, "buy", 300, 40_000, 52_000),
    sw(T.JUP, "sell", 200, 40_000, 21_000),
    sw(T.RUGZ, "buy", 90, 5_000_000, 8_000),
    sw(T.RUGZ, "sell", 85, 5_000_000, 9_500),
  ];
  const prices = new Map<string, Quote>([
    [`solana:${addrKey("solana", T.WIF.address)}`, { price: 0.098 }],
    [`solana:${addrKey("solana", T.BONK.address)}`, { price: 0.0000221 }],
    [`solana:${addrKey("solana", T.POPCAT.address)}`, { price: 0.41 }],
    [`solana:${addrKey("solana", T.JUP.address)}`, { price: 0.62 }],
    [`solana:${addrKey("solana", T.RUGZ.address)}`, { price: 0.00000004 }],
  ]);
  return {
    ...buildReport({ family: "solana", wallet: "demo", chains: ["solana"], failedChains: [], swaps, truncated: false, prices }),
    demo: true,
  };
}
