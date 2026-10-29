import type { ChainKey } from "../chains";

type Pair = {
  pairAddress?: string;
  info?: { imageUrl?: string };
  baseToken?: { address?: string; symbol?: string; name?: string };
  quoteToken?: { address?: string; symbol?: string; name?: string };
  priceUsd?: string;
  priceNative?: string;
  liquidity?: { usd?: number };
};

export const addrKey = (chain: ChainKey, address: string) =>
  chain === "solana" ? address : address.toLowerCase();

/**
 * Preço atual em USD pela DexScreener (grátis, sem chave), usando o par de maior liquidez.
 * Token que não tem par listado fica de fora do mapa.
 */
export type Quote = { price: number; logo?: string; symbol?: string; name?: string; /** Par de maior liquidez, usado nos candles. */ pool?: string };

export async function currentPrices(chain: ChainKey, addresses: string[]): Promise<Map<string, Quote>> {
  const prices = new Map<string, Quote>();
  const unique = [...new Set(addresses.map((a) => addrKey(chain, a)))];

  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const wanted = new Set(chunk);
    const best = new Map<string, { price: number; liq: number; logo?: string; symbol?: string; name?: string; pool?: string }>();
    try {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${chunk.join(",")}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const pairs = (await res.json()) as Pair[];
      for (const p of Array.isArray(pairs) ? pairs : []) {
        const liq = p.liquidity?.usd ?? 0;
        const priceUsd = Number(p.priceUsd);
        const priceNative = Number(p.priceNative);
        const consider = (token: Pair["baseToken"], price: number, logo?: string) => {
          if (!token?.address || !(price > 0)) return;
          const k = addrKey(chain, token.address);
          if (!wanted.has(k)) return;
          const cur = best.get(k);
          if (!cur || liq > cur.liq)
            best.set(k, { price, liq, logo: logo ?? cur?.logo, symbol: token.symbol || cur?.symbol, name: token.name || cur?.name, pool: p.pairAddress });
        };
        consider(p.baseToken, priceUsd, p.info?.imageUrl);
        // Quando o token é a cotação do par: preço = priceUsd do base ÷ quanto o base vale em cotação
        if (priceNative > 0) consider(p.quoteToken, priceUsd / priceNative);
      }
    } catch {
      continue;
    }
    best.forEach((v, k) => prices.set(k, { price: v.price, logo: v.logo, symbol: v.symbol, name: v.name, pool: v.pool }));
  }
  return prices;
}
