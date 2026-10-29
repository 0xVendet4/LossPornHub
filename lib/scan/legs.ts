import type { ChainKey } from "../chains";
import { priceAt, type Coin } from "./history";
import { addrKey } from "./prices";
import type { Swap } from "./types";

/**
 * Uma transação vira "pernas": o que saiu e o que entrou na carteira.
 * O lado que a gente sabe precificar (stable ou moeda com histórico) dá o valor em dólar;
 * o outro lado é o token do swap.
 */
export type Leg = { address: string; symbol: string; name: string; amount: number; side: "in" | "out" };

export const NATIVE: Record<ChainKey, { coin: Coin; address: string; symbol: string; name: string }> = {
  ethereum: { coin: "ETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "ETH", name: "Ether" },
  base: { coin: "ETH", address: "0x4200000000000000000000000000000000000006", symbol: "ETH", name: "Ether" },
  optimism: { coin: "ETH", address: "0x4200000000000000000000000000000000000006", symbol: "ETH", name: "Ether" },
  arbitrum: { coin: "ETH", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", symbol: "ETH", name: "Ether" },
  polygon: { coin: "POL", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", symbol: "POL", name: "Polygon" },
  bsc: { coin: "BNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", symbol: "BNB", name: "BNB" },
  solana: { coin: "SOL", address: "So11111111111111111111111111111111111111112", symbol: "SOL", name: "Solana" },
};

// Tokens que valem o mesmo que uma moeda com histórico: o nativo embrulhado de cada rede e o ETH em ponte
const PRICED: Record<ChainKey, Record<string, Coin>> = {
  ethereum: { [addrKey("ethereum", NATIVE.ethereum.address)]: "ETH" },
  base: { [addrKey("base", NATIVE.base.address)]: "ETH" },
  optimism: { [addrKey("optimism", NATIVE.optimism.address)]: "ETH" },
  arbitrum: { [addrKey("arbitrum", NATIVE.arbitrum.address)]: "ETH" },
  polygon: { [addrKey("polygon", NATIVE.polygon.address)]: "POL", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": "ETH" },
  bsc: { [addrKey("bsc", NATIVE.bsc.address)]: "BNB", "0x2170ed0880ac9a755fd29b2688956bd959f933f8": "ETH" },
  solana: { [NATIVE.solana.address]: "SOL" },
};

const STABLE_SYMBOL = /^(USDC|USDT|USDT0|USDC\.E|USDBC|DAI|BUSD|FDUSD|PYUSD|TUSD|USDE|USDS|USD1|FRAX|LUSD|GHO|CRVUSD|EURC)$/i;

// Na Solana o símbolo não vem na transação, então a stable é reconhecida pelo mint
const STABLE_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo", // PYUSD
  "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA", // USDS
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB", // USD1
  "DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT", // USDe
]);

function isStable(chain: ChainKey, leg: Leg) {
  return chain === "solana" ? STABLE_MINTS.has(leg.address) : STABLE_SYMBOL.test(leg.symbol);
}

const EPS = 1e-9;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export type LegsResult = Swap[] | "unpriced" | null;

/**
 * Monta o swap de uma transação. `null` quando não é swap (transferência, airdrop, wrap);
 * "unpriced" quando é swap mas não dá para saber o valor em dólar (token por token, moeda sem histórico).
 */
export async function swapFromLegs(chain: ChainKey, tx: string, at: number, legs: Leg[]): Promise<LegsResult> {
  // Saldo líquido por token: entradas menos saídas
  const net = new Map<string, Leg & { net: number }>();
  for (const leg of legs) {
    const k = addrKey(chain, leg.address);
    const cur = net.get(k) ?? { ...leg, net: 0 };
    cur.net += leg.side === "in" ? leg.amount : -leg.amount;
    if (!cur.symbol && leg.symbol) cur.symbol = leg.symbol;
    net.set(k, cur);
  }
  const nets = [...net.values()].filter((l) => Math.abs(l.net) > EPS).map((l) => ({ ...l, side: (l.net > 0 ? "in" : "out") as Leg["side"] }));

  const known: { usd: number; side: Leg["side"]; native?: (typeof nets)[number] }[] = [];
  const target: typeof nets = [];
  for (const l of nets) {
    const coin = PRICED[chain][addrKey(chain, l.address)];
    if (isStable(chain, l)) known.push({ usd: Math.abs(l.net), side: l.side });
    else if (coin) {
      const price = await priceAt(coin, at);
      if (price === null) return "unpriced";
      known.push({ usd: Math.abs(l.net) * price, side: l.side, native: l });
    } else target.push(l);
  }

  const base = { chain, tx, at };

  if (target.length === 0) {
    // Nativo contra stable: vender ETH/SOL cedo também é loss porn
    const natives = known.filter((k) => k.native);
    const stables = known.filter((k) => !k.native);
    const n = natives[0];
    if (natives.length !== 1 || stables.length === 0 || stables.some((s) => s.side === n.side)) return null;
    const info = NATIVE[chain];
    return [
      {
        ...base,
        type: n.side === "out" ? "sell" : "buy",
        token: { address: info.address, symbol: info.symbol, name: info.name, logo: null },
        amount: Math.abs(n.native!.net),
        usd: sum(stables.map((s) => s.usd)),
      },
    ];
  }

  if (target.length > 1) return "unpriced";

  const t = target[0];
  const other = known.filter((k) => k.side !== t.side);
  const same = known.filter((k) => k.side === t.side);
  if (other.length === 0) return null; // só entrou ou só saiu: transferência, airdrop
  const gross = sum(other.map((k) => k.usd));
  const back = sum(same.map((k) => k.usd));
  if (back > gross * 0.05) return "unpriced"; // valor dos dois lados: não é um swap simples
  if (!(gross - back > 0)) return null;

  return [
    {
      ...base,
      type: t.side === "out" ? "sell" : "buy",
      token: { address: t.address, symbol: t.symbol, name: t.name, logo: null },
      amount: Math.abs(t.net),
      usd: gross - back,
    },
  ];
}
